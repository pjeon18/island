-- minimal stand-ins for Supabase + Studdy so island.sql can be exercised
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- what Supabase does for every new table and function in public
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create table public.blocks (owner uuid references auth.users(id), blocked uuid references auth.users(id), primary key (owner, blocked));
create table public.profiles (user_id uuid primary key references auth.users(id), handle text unique not null, name text not null, avatar jsonb not null default '{}');
create table public.friends (id bigint generated always as identity primary key, requester uuid not null references auth.users(id), addressee uuid not null references auth.users(id), status text not null default 'pending', unique (requester, addressee));
alter table public.profiles enable row level security;
create policy p on public.profiles for select to authenticated using (true);
grant select on public.profiles, public.friends, public.blocks to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into public.profiles values ('00000000-0000-0000-0000-00000000000a','ana','Ana'), ('00000000-0000-0000-0000-00000000000b','ben','Ben'), ('00000000-0000-0000-0000-00000000000c','cy','Cy');
insert into public.friends (requester, addressee, status) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','accepted');
