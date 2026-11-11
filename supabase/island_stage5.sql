-- Island stage 5: friends visit each other's islands and send gifts.
--
-- Run this after island.sql, in the same Supabase project (Studdy's). It is
-- additive and safe to re-run. Nothing of Studdy's is altered.
--
-- Trust model, as in island.sql:
--   · a published scene (which island, habitats, decorations) is checked
--     against fixed lists and a size cap;
--   · a gifted Pokémon's level is clamped to what the sender's verified
--     focus minutes could have earned, like the published party;
--   · gifts go only to friends who have not blocked you, at most 10 sent a
--     day; the recipient claims them once, atomically.

-- ---------- your island's scene, for friends who visit ----------
alter table public.island_profiles add column if not exists scene jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.island_profiles add constraint island_scene_shape
    check (jsonb_typeof(scene) = 'object' and pg_column_size(scene) < 4096);
exception when duplicate_object then null; end $$;

-- the highest level the verified minutes could have earned (same law as island_publish)
create or replace function public._island_max_level(u uuid)
returns int
language sql stable security definer set search_path = public, pg_temp
as $$
  select least(100, floor((1 + sqrt(1 + 8 * (coalesce(max(verified_min), 0) * 1.4 + 28))) / 2)::int)
    from public.island_profiles where user_id = u
$$;
revoke execute on function public._island_max_level(uuid) from public, anon, authenticated;

-- ---------- island_publish_scene(scene) ----------
-- scene = { island: 'home'|'frost', habitats: [..], decor: { slot: item } }
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
  if coalesce(p_scene->>'island', '') not in ('home', 'frost') then return 'bad island'; end if;
  if jsonb_typeof(p_scene->'habitats') = 'array' then
    for h in select jsonb_array_elements_text(p_scene->'habitats') loop
      if h in ('grass', 'rocks', 'pond', 'cave') and not hab ? h then hab := hab || to_jsonb(h); end if;
    end loop;
  end if;
  if jsonb_typeof(p_scene->'decor') = 'object' then
    for k, v in select key, value #>> '{}' from jsonb_each(p_scene->'decor') loop
      if k in ('a','b','c','d','e','f','g','h')
         and v in ('flowers','stones','mushrooms','sign','bench','umbrella','lantern','campfire','windmill') then
        dec := dec || jsonb_build_object(k, v);
      end if;
    end loop;
  end if;
  clean := jsonb_build_object('island', p_scene->>'island', 'habitats', hab, 'decor', dec);
  insert into public.island_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.island_profiles set scene = clean, updated_at = now() where user_id = auth.uid();
  return 'ok';
end $$;

-- ---------- island_friend_scene(friend) → what you see when you visit ----------
create or replace function public.island_friend_scene(p_id uuid)
returns table (name text, handle text, party jsonb, scene jsonb, studying boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.name, p.handle, coalesce(ip.party, '[]'::jsonb), coalesce(ip.scene, '{}'::jsonb),
         coalesce(ip.studying and ip.last_beat > now() - interval '3 minutes', false)
    from public.profiles p
    left join public.island_profiles ip on ip.user_id = p.user_id
   where p.user_id = p_id
     and auth.uid() is not null
     and public._island_are_friends(auth.uid(), p_id)
$$;

-- ---------- gifts ----------
create table if not exists public.island_gifts (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('mon', 'egg', 'item')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) < 512),
  created_at timestamptz not null default now(),
  claimed boolean not null default false,
  check (sender <> recipient)
);
alter table public.island_gifts enable row level security;
drop policy if exists "own gifts read" on public.island_gifts;
create policy "own gifts read" on public.island_gifts for select to authenticated using (recipient = auth.uid() or sender = auth.uid());
revoke all on public.island_gifts from anon, authenticated;
grant select on public.island_gifts to authenticated;
create index if not exists island_gifts_inbox on public.island_gifts (recipient, claimed, created_at);

-- island_send_gift(friend, kind, payload) → 'ok' or a reason
--   mon:  { dex, level }   level clamped to what your verified minutes could earn
--   egg:  { dex }
--   item: { id, n }        n 1..5 (Star Pieces 1..2)
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
    if d < 1 or d > 493 then return 'bad gift'; end if;
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
                                    'thunder-stone','water-stone','fire-stone','leaf-stone','ice-stone','sun-stone') then
      return 'bad gift';
    end if;
    if jsonb_typeof(p_payload->'n') <> 'number' then return 'bad gift'; end if;
    n := (p_payload->>'n')::int;
    if n < 1 or n > (case when item = 'star-piece' then 2 else 5 end) then return 'bad gift'; end if;
    clean := jsonb_build_object('id', item, 'n', n);
  else
    return 'bad gift';
  end if;
  insert into public.island_gifts (sender, recipient, kind, payload) values (auth.uid(), p_to, p_kind, clean);
  return 'ok';
end $$;

-- island_claim_gifts() → the gifts waiting for you, marked claimed in the same statement
create or replace function public.island_claim_gifts()
returns table (id bigint, sender_name text, kind text, payload jsonb)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return; end if;
  return query
    with taken as (
      update public.island_gifts g set claimed = true
       where g.recipient = auth.uid() and not g.claimed
         and not exists (select 1 from public.blocks k where k.owner = auth.uid() and k.blocked = g.sender)
      returning g.id, g.sender, g.kind, g.payload
    )
    select t.id, coalesce(p.name, 'A friend'), t.kind, t.payload
      from taken t left join public.profiles p on p.user_id = t.sender
     order by t.id;
end $$;

-- ---------- who may call what ----------
revoke execute on function public.island_publish_scene(jsonb) from public, anon;
revoke execute on function public.island_friend_scene(uuid) from public, anon;
revoke execute on function public.island_send_gift(uuid, text, jsonb) from public, anon;
revoke execute on function public.island_claim_gifts() from public, anon;
grant execute on function public.island_publish_scene(jsonb) to authenticated;
grant execute on function public.island_friend_scene(uuid) to authenticated;
grant execute on function public.island_send_gift(uuid, text, jsonb) to authenticated;
grant execute on function public.island_claim_gifts() to authenticated;
