-- Island stage 7 (2026-11-11): dungeon invites between friends, and safer gifts.
-- Run once in Studdy's Supabase SQL editor, after island.sql and island_stage5.sql.
-- Additive and idempotent: safe to run again.
--
-- Invites: a player hosting a co-op dungeon (a 4-letter room code; the game itself
-- runs peer to peer, not through this database) can invite a friend. The friend's
-- island checks for invites during breaks and offers to join. Invites last ten minutes.
--
-- Gifts: the review found island_send_gift trusted the sender. Now a Pokémon gift
-- must be a first-stage species from the island roster (no evolved or legendary
-- Pokémon), and a stone can be sent at most once a week.

-- ---------- island_dungeon_invites ----------
create table if not exists public.island_dungeon_invites (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  code text not null check (code ~ '^[A-HJKMNP-Z2-9]{4}$'),
  dungeon text not null check (dungeon ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  check (sender <> recipient)
);
alter table public.island_dungeon_invites enable row level security;
drop policy if exists "own invites read" on public.island_dungeon_invites;
create policy "own invites read" on public.island_dungeon_invites for select to authenticated using (recipient = auth.uid() or sender = auth.uid());
revoke all on public.island_dungeon_invites from anon, authenticated;
grant select on public.island_dungeon_invites to authenticated;
create index if not exists island_dungeon_invites_inbox on public.island_dungeon_invites (recipient, created_at desc);

-- island_dungeon_invite(friend, code, dungeon) → 'ok' or a reason
create or replace function public.island_dungeon_invite(p_to uuid, p_code text, p_dungeon text)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return 'signed out'; end if;
  if not public._island_are_friends(auth.uid(), p_to) then return 'not friends'; end if;
  if p_code is null or p_code !~ '^[A-HJKMNP-Z2-9]{4}$' or p_dungeon is null or p_dungeon !~ '^[a-z0-9-]{1,40}$' then return 'bad invite'; end if;
  if (select count(*) from public.island_dungeon_invites
       where sender = auth.uid() and created_at > now() - interval '24 hours') >= 30 then
    return 'too many';
  end if;
  -- one waiting invite per pair: a new one replaces the old
  delete from public.island_dungeon_invites where sender = auth.uid() and recipient = p_to;
  insert into public.island_dungeon_invites (sender, recipient, code, dungeon) values (auth.uid(), p_to, upper(p_code), p_dungeon);
  return 'ok';
end $$;

-- island_dungeon_invites() → invites to you from the last ten minutes, newest first, one per friend
create or replace function public.island_dungeon_invites()
returns table (id bigint, sender_name text, code text, dungeon text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct on (i.sender) i.id, coalesce(p.name, 'A friend'), i.code, i.dungeon, i.created_at
    from public.island_dungeon_invites i
    left join public.profiles p on p.user_id = i.sender
   where auth.uid() is not null
     and i.recipient = auth.uid()
     and i.created_at > now() - interval '10 minutes'
     and public._island_are_friends(i.sender, auth.uid())
   order by i.sender, i.created_at desc
$$;

-- island_dungeon_invite_clear(id) → answered (joined or not now): it won't be offered again
create or replace function public.island_dungeon_invite_clear(p_id bigint)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  delete from public.island_dungeon_invites where id = p_id and recipient = auth.uid()
$$;

-- ---------- safer gifts ----------
-- island_send_gift(friend, kind, payload) → 'ok' or a reason (replaces stage 5's)
--   mon:  { dex, level }   a first-stage roster species; level clamped to your verified minutes
--   egg:  { dex }          the same species list
--   item: { id, n }        n 1..5 (Star Pieces 1..2, a stone 1, at most one stone a week)
create or replace function public.island_send_gift(p_to uuid, p_kind text, p_payload jsonb)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  clean jsonb;
  d int;
  l int;
  n int;
  item text;
  -- first-stage species that pass by an island (scripts/roster.mjs; no guardians or deep species)
  giftable int[] := array[1,4,7,10,16,25,41,43,54,60,74,86,90,92,133,163,179,187,194,215,220,225,238,361,363,393,396,403,459];
begin
  if auth.uid() is null then return 'signed out'; end if;
  if not public._island_are_friends(auth.uid(), p_to) then return 'not friends'; end if;
  if (select count(*) from public.island_gifts
       where sender = auth.uid() and created_at > now() - interval '24 hours') >= 10 then
    return 'too many';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then return 'bad gift'; end if;
  if p_kind in ('mon', 'egg') then
    if jsonb_typeof(p_payload->'dex') <> 'number' then return 'bad gift'; end if;
    d := (p_payload->>'dex')::int;
    if not (d = any (giftable)) then return 'not giftable'; end if;
    if p_kind = 'mon' then
      if jsonb_typeof(p_payload->'level') <> 'number' then return 'bad gift'; end if;
      l := greatest(1, least((p_payload->>'level')::int, public._island_max_level(auth.uid())));
      clean := jsonb_build_object('dex', d, 'level', l);
    else
      clean := jsonb_build_object('dex', d);
    end if;
  elsif p_kind = 'item' then
    item := p_payload->>'id';
    if item is null or item not in ('poke-ball','great-ball','ultra-ball','oran-berry','honey','cheri-berry','pecha-berry','chesto-berry','star-piece',
                                    'thunder-stone','water-stone','fire-stone','leaf-stone','ice-stone','sun-stone','moon-stone') then
      return 'bad gift';
    end if;
    if jsonb_typeof(p_payload->'n') <> 'number' then return 'bad gift'; end if;
    n := (p_payload->>'n')::int;
    if item like '%-stone' then
      if n <> 1 then return 'bad gift'; end if;
      if exists (select 1 from public.island_gifts
                  where sender = auth.uid() and kind = 'item' and payload->>'id' like '%-stone'
                    and created_at > now() - interval '7 days') then
        return 'one stone a week';
      end if;
    elsif n < 1 or n > (case when item = 'star-piece' then 2 else 5 end) then
      return 'bad gift';
    end if;
    clean := jsonb_build_object('id', item, 'n', n);
  else
    return 'bad gift';
  end if;
  insert into public.island_gifts (sender, recipient, kind, payload) values (auth.uid(), p_to, p_kind, clean);
  return 'ok';
end $$;

-- ---------- who may call what ----------
revoke execute on function public.island_dungeon_invite(uuid, text, text) from public, anon;
revoke execute on function public.island_dungeon_invites() from public, anon;
revoke execute on function public.island_dungeon_invite_clear(bigint) from public, anon;
revoke execute on function public.island_send_gift(uuid, text, jsonb) from public, anon;
grant execute on function public.island_dungeon_invite(uuid, text, text) to authenticated;
grant execute on function public.island_dungeon_invites() to authenticated;
grant execute on function public.island_dungeon_invite_clear(bigint) to authenticated;
grant execute on function public.island_send_gift(uuid, text, jsonb) to authenticated;
