-- Island stage 8 (2026-11-12): Ember Cove in friends' views, trading, and marks left on a
-- friend's island. Run once in Studdy's Supabase SQL editor, after island.sql,
-- island_stage5.sql and island_stage7.sql. Additive and idempotent: safe to run again.
--
-- Scenes: friends can now see Ember Cove, its hot spring, the new decorations and the
-- Pokédex milestone's ninth decoration spot.
--
-- Trades (docs/CONTENT_PLAN.md, L3): you offer one Pokémon to a friend; it leaves your island
-- at once and waits here. The friend accepts by sending one back (they receive yours at the same
-- moment), or declines. You then claim theirs, or your own if it was declined or nobody answered
-- in seven days. Guardians can't be traded. Trade evolutions (Haunter, Graveler) happen in the
-- game when a Pokémon arrives.
--
-- Visit marks (L12): on a friend's island you can leave a food in their dish (it becomes their
-- next lure), sign their signpost, or pet their Pokémon. Each at most once a day per friend.

-- ---------- scenes ----------
create or replace function public.island_publish_scene(p_scene jsonb)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  clean jsonb;
  hab jsonb := '[]'::jsonb;
  dec jsonb := '{}'::jsonb;
  h text;
  k text;
  v text;
begin
  if auth.uid() is null then return 'signed out'; end if;
  if jsonb_typeof(p_scene) <> 'object' then return 'bad scene'; end if;
  if coalesce(p_scene->>'island', '') not in ('home', 'frost', 'ember') then return 'bad island'; end if;
  if jsonb_typeof(p_scene->'habitats') = 'array' then
    for h in select jsonb_array_elements_text(p_scene->'habitats') loop
      if h in ('grass', 'rocks', 'pond', 'cave', 'spring') and not hab ? h then hab := hab || to_jsonb(h); end if;
    end loop;
  end if;
  if jsonb_typeof(p_scene->'decor') = 'object' then
    for k, v in select key, value #>> '{}' from jsonb_each(p_scene->'decor') loop
      if k in ('a','b','c','d','e','f','g','h','i')
         and v in ('flowers','stones','mushrooms','sign','bench','umbrella','lantern','campfire','windmill',
                   'snowman','icecarving','aurora','leafpile','rockpool','lightningrod','batroost','mudpatch','statue') then
        dec := dec || jsonb_build_object(k, v);
      end if;
    end loop;
  end if;
  clean := jsonb_build_object('island', p_scene->>'island', 'habitats', hab, 'decor', dec);
  insert into public.island_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.island_profiles set scene = clean, updated_at = now() where user_id = auth.uid();
  return 'ok';
end $$;

-- ---------- trades ----------
create table if not exists public.island_trades (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  sender_mon jsonb not null check (jsonb_typeof(sender_mon) = 'object' and pg_column_size(sender_mon) < 256),
  recipient_mon jsonb check (recipient_mon is null or (jsonb_typeof(recipient_mon) = 'object' and pg_column_size(recipient_mon) < 256)),
  state text not null default 'offered' check (state in ('offered', 'accepted', 'declined', 'done', 'returned')),
  created_at timestamptz not null default now(),
  check (sender <> recipient)
);
alter table public.island_trades enable row level security;
drop policy if exists "own trades read" on public.island_trades;
create policy "own trades read" on public.island_trades for select to authenticated using (recipient = auth.uid() or sender = auth.uid());
revoke all on public.island_trades from anon, authenticated;
grant select on public.island_trades to authenticated;
create index if not exists island_trades_people on public.island_trades (recipient, sender, state);

-- a traded Pokémon: { dex, level, shiny } with the level clamped to what your verified minutes could earn
create or replace function public._island_trade_mon(p jsonb, u uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare d int;
begin
  if jsonb_typeof(p) <> 'object' or jsonb_typeof(p->'dex') <> 'number' or jsonb_typeof(p->'level') <> 'number' then return null; end if;
  d := (p->>'dex')::int;
  if d < 1 or d > 493 or d in (59, 131, 143) then return null; end if; -- no guardians
  return jsonb_build_object('dex', d,
    'level', greatest(1, least((p->>'level')::int, public._island_max_level(u))),
    'shiny', coalesce((p->>'shiny')::boolean, false));
end $$;
revoke execute on function public._island_trade_mon(jsonb, uuid) from public, anon, authenticated;

-- island_trade_offer(friend, mon) → 'ok' or a reason. One open offer per friend; 10 a day.
create or replace function public.island_trade_offer(p_to uuid, p_mon jsonb)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare m jsonb;
begin
  if auth.uid() is null then return 'signed out'; end if;
  if not public._island_are_friends(auth.uid(), p_to) then return 'not friends'; end if;
  m := public._island_trade_mon(p_mon, auth.uid());
  if m is null then return 'not tradeable'; end if;
  if exists (select 1 from public.island_trades where sender = auth.uid() and recipient = p_to and state = 'offered'
              and created_at > now() - interval '7 days') then
    return 'already offered';
  end if;
  if (select count(*) from public.island_trades where sender = auth.uid() and created_at > now() - interval '24 hours') >= 10 then
    return 'too many';
  end if;
  insert into public.island_trades (sender, recipient, sender_mon) values (auth.uid(), p_to, m);
  return 'ok';
end $$;

-- island_trades() → open trades that involve you: offers to you, and yours waiting to be claimed
create or replace function public.island_trades()
returns table (id bigint, other_name text, mine boolean, state text, sender_mon jsonb, recipient_mon jsonb, expired boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select t.id, coalesce(p.name, 'A friend'), t.sender = auth.uid(), t.state, t.sender_mon, t.recipient_mon,
         t.state = 'offered' and t.created_at < now() - interval '7 days'
    from public.island_trades t
    left join public.profiles p on p.user_id = case when t.sender = auth.uid() then t.recipient else t.sender end
   where auth.uid() is not null
     and ((t.recipient = auth.uid() and t.state = 'offered' and t.created_at > now() - interval '7 days')
       or (t.sender = auth.uid() and t.state in ('offered', 'accepted', 'declined')))
   order by t.created_at desc
   limit 20
$$;

-- island_trade_accept(id, your mon) → the Pokémon you receive, or null. Yours goes to the sender.
create or replace function public.island_trade_accept(p_id bigint, p_mon jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare m jsonb; got jsonb;
begin
  if auth.uid() is null then return null; end if;
  m := public._island_trade_mon(p_mon, auth.uid());
  if m is null then return null; end if;
  update public.island_trades set recipient_mon = m, state = 'accepted'
   where id = p_id and recipient = auth.uid() and state = 'offered' and created_at > now() - interval '7 days'
  returning sender_mon into got;
  return got;
end $$;

-- island_trade_decline(id): the recipient says no, or the sender takes the offer back
create or replace function public.island_trade_decline(p_id bigint)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  update public.island_trades set state = 'declined'
   where id = p_id and state = 'offered' and (recipient = auth.uid() or sender = auth.uid())
$$;

-- island_trade_claim(id) → for the sender: the friend's Pokémon once accepted, or your own back
-- once declined or seven days old. Null if there is nothing to claim yet.
create or replace function public.island_trade_claim(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare t public.island_trades%rowtype;
begin
  if auth.uid() is null then return null; end if;
  select * into t from public.island_trades where id = p_id and sender = auth.uid() for update;
  if not found then return null; end if;
  if t.state = 'accepted' then
    update public.island_trades set state = 'done' where id = p_id;
    return jsonb_build_object('kind', 'traded', 'mon', t.recipient_mon);
  end if;
  if t.state = 'declined' or (t.state = 'offered' and t.created_at < now() - interval '7 days') then
    update public.island_trades set state = 'returned' where id = p_id;
    return jsonb_build_object('kind', 'returned', 'mon', t.sender_mon);
  end if;
  return null;
end $$;

-- ---------- visit marks ----------
create table if not exists public.island_visit_marks (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('berry', 'sign', 'pet')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) < 128),
  created_at timestamptz not null default now(),
  seen boolean not null default false,
  check (sender <> recipient)
);
alter table public.island_visit_marks enable row level security;
drop policy if exists "own marks read" on public.island_visit_marks;
create policy "own marks read" on public.island_visit_marks for select to authenticated using (recipient = auth.uid() or sender = auth.uid());
revoke all on public.island_visit_marks from anon, authenticated;
grant select on public.island_visit_marks to authenticated;
create index if not exists island_visit_marks_inbox on public.island_visit_marks (recipient, seen, created_at);

-- island_visit_mark(friend, kind, payload) → 'ok' or a reason
--   berry: { food }   one of the island's foods; it becomes their next lure
--   sign:  {}         your name in their signpost's guestbook
--   pet:   { dex }    which of their Pokémon you petted
create or replace function public.island_visit_mark(p_to uuid, p_kind text, p_payload jsonb)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare clean jsonb := '{}'::jsonb; f text; d int;
begin
  if auth.uid() is null then return 'signed out'; end if;
  if not public._island_are_friends(auth.uid(), p_to) then return 'not friends'; end if;
  if p_kind not in ('berry', 'sign', 'pet') then return 'bad mark'; end if;
  if p_kind = 'berry' then
    f := p_payload->>'food';
    if f is null or f not in ('honey','cheri-berry','pecha-berry','chesto-berry','aspear-berry','rawst-berry','persim-berry') then return 'bad mark'; end if;
    clean := jsonb_build_object('food', f);
  elsif p_kind = 'pet' then
    if jsonb_typeof(p_payload->'dex') <> 'number' then return 'bad mark'; end if;
    d := (p_payload->>'dex')::int;
    if d < 1 or d > 493 then return 'bad mark'; end if;
    clean := jsonb_build_object('dex', d);
  end if;
  if exists (select 1 from public.island_visit_marks where sender = auth.uid() and recipient = p_to and kind = p_kind
              and created_at > now() - interval '20 hours') then
    return 'already today';
  end if;
  insert into public.island_visit_marks (sender, recipient, kind, payload) values (auth.uid(), p_to, p_kind, clean);
  return 'ok';
end $$;

-- island_visit_marks() → marks friends left on your island that you haven't seen, oldest first
create or replace function public.island_visit_marks()
returns table (id bigint, sender_name text, kind text, payload jsonb, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select m.id, coalesce(p.name, 'A friend'), m.kind, m.payload, m.created_at
    from public.island_visit_marks m
    left join public.profiles p on p.user_id = m.sender
   where auth.uid() is not null and m.recipient = auth.uid() and not m.seen
   order by m.created_at
   limit 30
$$;

-- island_visit_marks_seen(ids)
create or replace function public.island_visit_marks_seen(p_ids bigint[])
returns void
language sql security definer set search_path = public, pg_temp
as $$
  update public.island_visit_marks set seen = true where recipient = auth.uid() and id = any (p_ids)
$$;

-- ---------- who may call what ----------
revoke execute on function public.island_trade_offer(uuid, jsonb) from public, anon;
revoke execute on function public.island_trades() from public, anon;
revoke execute on function public.island_trade_accept(bigint, jsonb) from public, anon;
revoke execute on function public.island_trade_decline(bigint) from public, anon;
revoke execute on function public.island_trade_claim(bigint) from public, anon;
revoke execute on function public.island_visit_mark(uuid, text, jsonb) from public, anon;
revoke execute on function public.island_visit_marks() from public, anon;
revoke execute on function public.island_visit_marks_seen(bigint[]) from public, anon;
grant execute on function public.island_trade_offer(uuid, jsonb) to authenticated;
grant execute on function public.island_trades() to authenticated;
grant execute on function public.island_trade_accept(bigint, jsonb) to authenticated;
grant execute on function public.island_trade_decline(bigint) to authenticated;
grant execute on function public.island_trade_claim(bigint) to authenticated;
grant execute on function public.island_visit_mark(uuid, text, jsonb) to authenticated;
grant execute on function public.island_visit_marks() to authenticated;
grant execute on function public.island_visit_marks_seen(bigint[]) to authenticated;
