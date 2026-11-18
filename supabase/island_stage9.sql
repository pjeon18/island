-- Island stage 9 (2026-11-18): friends see where your decorations stand. Run once in Studdy's
-- Supabase SQL editor, after island_stage8.sql. Additive and idempotent: safe to run again.
--
-- Arrange mode lets each decoration stand anywhere it fits on the island. The scene now keeps a
-- `pos` object: for each decoration spot that holds something, its ground point in whole window
-- pixels (x 0 to 239, y 0 to 179). Anything else is dropped. Until this runs, friends see the
-- decorations on their default spots.

create or replace function public.island_publish_scene(p_scene jsonb)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  clean jsonb;
  hab jsonb := '[]'::jsonb;
  dec jsonb := '{}'::jsonb;
  pos jsonb := '{}'::jsonb;
  h text;
  k text;
  v text;
  p jsonb;
  px int;
  py int;
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
  if jsonb_typeof(p_scene->'pos') = 'object' then
    for k, p in select key, value from jsonb_each(p_scene->'pos') loop
      continue when not dec ? k or jsonb_typeof(p) <> 'object'
        or jsonb_typeof(p->'x') <> 'number' or jsonb_typeof(p->'y') <> 'number';
      px := floor((p->>'x')::numeric);
      py := floor((p->>'y')::numeric);
      if px between 0 and 239 and py between 0 and 179 then
        pos := pos || jsonb_build_object(k, jsonb_build_object('x', px, 'y', py));
      end if;
    end loop;
  end if;
  clean := jsonb_build_object('island', p_scene->>'island', 'habitats', hab, 'decor', dec, 'pos', pos);
  insert into public.island_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.island_profiles set scene = clean, updated_at = now() where user_id = auth.uid();
  return 'ok';
end $$;
