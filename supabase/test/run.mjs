// Exercise island.sql on PGlite (Postgres 16 in WASM) with stubbed Supabase pieces.
// Run with: npm run test:sql
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
const here = path.dirname(fileURLToPath(import.meta.url))
const stubPath = path.join(here, 'stub.sql')
const islandPath = path.join(here, '..', 'island.sql')
const db = new PGlite()
await db.exec(fs.readFileSync(stubPath, 'utf8'))
const island = fs.readFileSync(islandPath, 'utf8')
await db.exec(island)
console.log('island.sql applied')
await db.exec(island)
console.log('island.sql re-applied (idempotent)')

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'
const as = async (uid) => db.exec(`reset role; set request.jwt.claim.sub = '${uid ?? ''}'; set role ${uid ? 'authenticated' : 'anon'};`)
const su = async () => db.exec('reset role;')
const q = async (label, sql) => {
  try {
    const r = await db.query(sql)
    console.log(label.padEnd(36), JSON.stringify(r.rows))
  } catch (e) {
    console.log(label.padEnd(36), 'ERROR:', e.message)
  }
}

await as(A)
await q('Ana begins', 'select island_session_begin() as id')
await su(); await db.exec(`update island_sessions set last_beat = now() - interval '60 seconds'`); await as(A)
await q('beat after 60 s', 'select island_session_beat(1) as min')
await su(); await db.exec(`update island_sessions set last_beat = now() - interval '600 seconds'`); await as(A)
await q('beat after a 10 min gap (cap 90 s)', 'select island_session_beat(1) as min')
await q('beat again at once (no credit)', 'select island_session_beat(1) as min')
await q('Ana profile', 'select verified_min, studying from island_profiles')
await q('publish Lv 80 Charizard', `select island_publish('[{"dex":6,"level":80},{"dex":25,"level":7}]'::jsonb, 12) as r`)
await q('published party (clamped)', 'select party, dex_count from island_profiles')
await q('publish bad dex', `select island_publish('[{"dex":9999,"level":5}]'::jsonb, 1) as r`)
await q('publish bad shape', `select island_publish('"nope"'::jsonb, 1) as r`)
await q('direct insert', `insert into island_profiles (user_id) values ('${A}')`)
await q('direct update', 'update island_profiles set verified_min = 99999 returning verified_min')
await q('direct session insert', `insert into island_sessions (user_id) values ('${A}')`)
await q('wave Ben', `select island_wave('${B}') as r`)
await q('wave Ben again', `select island_wave('${B}') as r`)
await q('wave Cy (not a friend)', `select island_wave('${C}') as r`)
await as(B)
await q("Ben's island_friends()", 'select handle, party, dex_count, day_min, studying from island_friends()')
await q("Ben reads Ana's sessions", 'select count(*)::int as n from island_sessions')
await q("Ben reads Ana's profile row", 'select count(*)::int as n from island_profiles')
await q('Ben unseen waves', 'select count(*)::int as n from island_waves where not seen')
await q('Ben marks waves seen', 'update island_waves set seen = true returning id')
await q('Ben redirects a wave', `update island_waves set recipient = '${C}' returning id`)
await q('Ben unseen after', 'select count(*)::int as n from island_waves where not seen')
await q('Ben ends Ana session', 'select island_session_end(1) as r')
await as(C)
await q("Cy's island_friends()", 'select count(*)::int as n from island_friends()')
await as(A)
await q('Ana ends', 'select island_session_end(1) as min')
await q('Ana studying after end', 'select studying from island_profiles')
await su(); await db.exec(`update public.blocks set owner = owner; insert into public.blocks values ('${B}', '${A}')`); await as(B)
await q('Ben blocked Ana: friends list', 'select count(*)::int as n from island_friends()')
await as(A)
await q('Ana waves at Ben who blocked', `select island_wave('${B}') as r`)
await as(B)
await q('Ben truncates profiles', 'truncate island_profiles')
await q('Ben truncates sessions', 'truncate island_sessions')
await q('Ben truncates waves', 'truncate island_waves')
await q('Ben inserts a wave directly', `insert into island_waves (sender, recipient) values ('${B}', '${A}')`)
await q('Ben calls the private helper', `select _island_are_friends('${A}', '${B}')`)
await as(null)
await q('anon begin', 'select island_session_begin()')
await q('anon reads profiles', 'select count(*) from island_profiles')
await q('anon reads waves', 'select count(*) from island_waves')
