-- Island (the Pokémon study island) on Studdy's Supabase project.
--
-- Additive only: it creates island_* tables and functions and reads Studdy's
-- existing profiles, friends and blocks. Nothing of Studdy's is altered.
-- Run it once in the SQL editor; it is safe to re-run.
--
-- Trust model (same law as Studdy's phase5.sql):
--   · focus minutes are granted by the SERVER from witnessed heartbeats:
--     a beat is worth the real wall-clock gap since the last one, capped at
--     90 s; beats under 20 s apart earn nothing; one session tops out at
--     6 verified hours and one rolling day at 16.
--   · what friends see (party levels) is clamped to what the verified
--     minutes could have earned, so devtools cannot show a level-100 team.
--   · every write goes through security-definer functions; tables are
--     read-only to clients and invisible to signed-out visitors.

-- ---------- island_profiles: your island's public face ----------
create table if not exists public.island_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  party jsonb not null default '[]'::jsonb
    check (jsonb_typeof(party) = 'array' and pg_column_size(party) < 2048),
  dex_count int not null default 0 check (dex_count between 0 and 493),
  verified_min int not null default 0 check (verified_min >= 0),
  studying boolean not null default false,
  last_beat timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.island_profiles enable row level security;
drop policy if exists "own island profile" on public.island_profiles;
create policy "own island profile"
  on public.island_profiles for select to authenticated
  using (user_id = auth.uid());
-- Supabase's default privileges grant ALL (truncate included, which RLS does
-- not cover) on new tables to anon and authenticated: take it all back first
revoke all on public.island_profiles from anon, authenticated;
grant select on public.island_profiles to authenticated;

-- ---------- island_sessions: server-witnessed focus ----------
create table if not exists public.island_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_beat timestamptz not null default now(),
  seconds int not null default 0 check (seconds >= 0),
  closed boolean not null default false
);
alter table public.island_sessions enable row level security;
drop policy if exists "own island sessions" on public.island_sessions;
create policy "own island sessions"
  on public.island_sessions for select to authenticated
  using (user_id = auth.uid());
revoke all on public.island_sessions from anon, authenticated;
grant select on public.island_sessions to authenticated;
create index if not exists island_sessions_user_recent on public.island_sessions (user_id, started_at desc);

-- ---------- island_waves: a wave lands at the friend's next break ----------
create table if not exists public.island_waves (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  seen boolean not null default false,
  check (sender <> recipient)
);
alter table public.island_waves enable row level security;
drop policy if exists "own waves read" on public.island_waves;
create policy "own waves read"
  on public.island_waves for select to authenticated
  using (recipient = auth.uid());
drop policy if exists "own waves seen" on public.island_waves;
create policy "own waves seen"
  on public.island_waves for update to authenticated
  using (recipient = auth.uid()) with check (recipient = auth.uid());
drop policy if exists "own waves clear" on public.island_waves;
create policy "own waves clear"
  on public.island_waves for delete to authenticated
  using (recipient = auth.uid());
revoke all on public.island_waves from anon, authenticated;
grant select, delete on public.island_waves to authenticated;
grant update (seen) on public.island_waves to authenticated;
create index if not exists island_waves_inbox on public.island_waves (recipient, seen, created_at desc);

-- ---------- helpers ----------
create or replace function public._island_are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.friends f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  )
  and not exists (
    select 1 from public.blocks k
    where (k.owner = a and k.blocked = b) or (k.owner = b and k.blocked = a)
  )
$$;
revoke execute on function public._island_are_friends(uuid, uuid) from public, anon, authenticated;

-- ---------- island_session_begin() → session id ----------
create or replace function public.island_session_begin()
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  new_id bigint;
begin
  if auth.uid() is null then return -1; end if;
  -- close anything left open (a crashed tab); its verified seconds stay
  update public.island_sessions set closed = true where user_id = auth.uid() and not closed;
  -- at most 60 sessions started per rolling day
  if (select count(*) from public.island_sessions
      where user_id = auth.uid() and started_at > now() - interval '24 hours') >= 60 then
    return -1;
  end if;
  insert into public.island_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  insert into public.island_sessions (user_id) values (auth.uid()) returning id into new_id;
  update public.island_profiles
     set studying = true, last_beat = now(), updated_at = now()
   where user_id = auth.uid();
  return new_id;
end $$;

-- ---------- island_session_beat(id) → verified minutes in this session ----------
create or replace function public.island_session_beat(p_id bigint)
returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s record;
  gap int;
  total_sec int;
  day_sec int;
  new_min int;
begin
  if auth.uid() is null then return -1; end if;
  select * into s from public.island_sessions
   where id = p_id and user_id = auth.uid() and not closed
   for update;
  if not found then return -1; end if;

  gap := extract(epoch from (now() - s.last_beat))::int;
  if gap < 20 then
    return s.seconds / 60;
  end if;

  total_sec := least(s.seconds + least(gap, 90), 21600);              -- 6 h per session
  select coalesce(sum(seconds), 0) into day_sec from public.island_sessions
   where user_id = auth.uid() and started_at > now() - interval '24 hours' and id <> p_id;
  if day_sec + total_sec > 57600 then                                  -- 16 h per day
    total_sec := greatest(least(total_sec, 57600 - day_sec), s.seconds);
  end if;
  new_min := greatest(total_sec / 60 - s.seconds / 60, 0);

  update public.island_sessions set last_beat = now(), seconds = total_sec where id = p_id;
  update public.island_profiles
     set verified_min = least(verified_min + new_min, 100000000),
         studying = true, last_beat = now(), updated_at = now()
   where user_id = auth.uid();
  return total_sec / 60;
end $$;

-- ---------- island_session_end(id) → verified minutes ----------
create or replace function public.island_session_end(p_id bigint)
returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  sec int;
begin
  if auth.uid() is null then return -1; end if;
  update public.island_sessions set closed = true
   where id = p_id and user_id = auth.uid()
   returning seconds into sec;
  update public.island_profiles set studying = false, updated_at = now() where user_id = auth.uid();
  return coalesce(sec, 0) / 60;
end $$;

-- ---------- island_publish(party, dex_count) ----------
-- Party entries are {dex, level}. Levels are clamped to what the verified
-- minutes could have earned: a Pokémon gets 1 EXP per minute plus berries
-- (well under 0.4 EXP per minute), and visitors arrive at level 8 at most.
create or replace function public.island_publish(p_party jsonb, p_dex_count int)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v int;
  budget numeric;
  max_level int;
  e jsonb;
  clean jsonb := '[]'::jsonb;
  d int;
  l int;
begin
  if auth.uid() is null then return 'signed out'; end if;
  if jsonb_typeof(p_party) <> 'array' or jsonb_array_length(p_party) > 3 then return 'bad party'; end if;
  insert into public.island_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select verified_min into v from public.island_profiles where user_id = auth.uid();
  budget := v * 1.4 + 28;                                  -- 28 = EXP to reach level 8
  -- cumulative EXP to reach level L is L(L-1)/2
  max_level := least(100, floor((1 + sqrt(1 + 8 * budget)) / 2)::int);
  for e in select * from jsonb_array_elements(p_party) loop
    if jsonb_typeof(e->'dex') <> 'number' or jsonb_typeof(e->'level') <> 'number' then return 'bad entry'; end if;
    d := (e->>'dex')::int;
    l := (e->>'level')::int;
    if d < 1 or d > 493 or l < 1 or l > 100 then return 'bad entry'; end if;
    clean := clean || jsonb_build_object('dex', d, 'level', least(l, max_level));
  end loop;
  update public.island_profiles
     set party = clean,
         dex_count = greatest(0, least(coalesce(p_dex_count, 0), 493)),
         updated_at = now()
   where user_id = auth.uid();
  return 'ok';
end $$;

-- ---------- island_friends() → your friends' islands ----------
create or replace function public.island_friends()
returns table (user_id uuid, handle text, name text, party jsonb, dex_count int, day_min int, studying boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  with mine as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as uid
      from public.friends f
     where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
  )
  select p.user_id, p.handle, p.name,
         coalesce(ip.party, '[]'::jsonb),
         coalesce(ip.dex_count, 0),
         coalesce((select sum(s.seconds) / 60 from public.island_sessions s
                    where s.user_id = mine.uid and s.started_at > now() - interval '24 hours'), 0)::int,
         coalesce(ip.studying and ip.last_beat > now() - interval '3 minutes', false)
    from mine
    join public.profiles p on p.user_id = mine.uid
    left join public.island_profiles ip on ip.user_id = mine.uid
   where not exists (
     select 1 from public.blocks k
      where (k.owner = auth.uid() and k.blocked = mine.uid) or (k.owner = mine.uid and k.blocked = auth.uid())
   )
   order by p.name
$$;

-- ---------- island_wave(friend) ----------
create or replace function public.island_wave(p_to uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return 'signed out'; end if;
  if not public._island_are_friends(auth.uid(), p_to) then return 'not friends'; end if;
  if exists (select 1 from public.island_waves
              where sender = auth.uid() and recipient = p_to and created_at > now() - interval '10 minutes') then
    return 'already waved';
  end if;
  if (select count(*) from public.island_waves
       where sender = auth.uid() and created_at > now() - interval '24 hours') >= 30 then
    return 'too many';
  end if;
  insert into public.island_waves (sender, recipient) values (auth.uid(), p_to);
  return 'ok';
end $$;

-- ---------- who may call what ----------
revoke execute on function public.island_session_begin() from public, anon;
revoke execute on function public.island_session_beat(bigint) from public, anon;
revoke execute on function public.island_session_end(bigint) from public, anon;
revoke execute on function public.island_publish(jsonb, int) from public, anon;
revoke execute on function public.island_friends() from public, anon;
revoke execute on function public.island_wave(uuid) from public, anon;
grant execute on function public.island_session_begin() to authenticated;
grant execute on function public.island_session_beat(bigint) to authenticated;
grant execute on function public.island_session_end(bigint) to authenticated;
grant execute on function public.island_publish(jsonb, int) to authenticated;
grant execute on function public.island_friends() to authenticated;
grant execute on function public.island_wave(uuid) to authenticated;
