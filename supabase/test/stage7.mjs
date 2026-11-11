// Exercise island_stage7.sql (dungeon invites, safer gifts) on PGlite with stubbed Supabase pieces.
// Run with: node supabase/test/stage7.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8')
const db = new PGlite()
await db.exec(read('stub.sql'))
await db.exec(read('../island.sql'))
await db.exec(read('../island_stage5.sql'))
await db.exec(read('../island_stage7.sql'))
await db.exec(read('../island_stage7.sql'))
console.log('stage 7 applied twice (idempotent)')

const A = '00000000-0000-0000-0000-00000000000a' // Ana, friends with Ben
const B = '00000000-0000-0000-0000-00000000000b' // Ben
const C = '00000000-0000-0000-0000-00000000000c' // Cy, nobody's friend
const as = (uid) => db.exec(`reset role; set request.jwt.claim.sub = '${uid ?? ''}'; set role ${uid ? 'authenticated' : 'anon'};`)
let fails = 0
const expect = async (label, sql, want) => {
  let got
  try {
    got = JSON.stringify((await db.query(sql)).rows)
  } catch (e) {
    got = 'ERROR: ' + e.message.split('\n')[0]
  }
  const ok = typeof want === 'function' ? want(got) : got.includes(want)
  if (!ok) fails++
  console.log(ok ? 'ok  ' : 'FAIL', label.padEnd(44), got)
}

// invites
await as(A)
await expect('Ana invites Ben', `select public.island_dungeon_invite('${B}', 'ABCD', 'pier-hollow') r`, '"ok"')
await expect('Ana invites Cy (not a friend)', `select public.island_dungeon_invite('${C}', 'ABCD', 'pier-hollow') r`, '"not friends"')
await expect('bad code', `select public.island_dungeon_invite('${B}', 'AB1D', 'pier-hollow') r`, '"bad invite"')
await expect('bad dungeon id', `select public.island_dungeon_invite('${B}', 'ABCD', '../x') r`, '"bad invite"')
await expect('a new invite replaces the old', `select public.island_dungeon_invite('${B}', 'WXYZ', 'glacier-grotto') r`, '"ok"')
await as(B)
await expect('Ben sees one invite, the newest', `select sender_name, code, dungeon from public.island_dungeon_invites()`, (g) => g.includes('"code":"WXYZ"') && !g.includes('ABCD'))
await expect('Ben reads the table directly (RLS)', `select count(*)::int n from public.island_dungeon_invites`, '"n":1')
const id = (await db.query(`select id from public.island_dungeon_invites()`)).rows[0]?.id
await expect('Ben clears it', `select public.island_dungeon_invite_clear(${id})`, '[')
await expect('nothing left for Ben', `select count(*)::int n from public.island_dungeon_invites()`, '"n":0')
await as(C)
await expect('Cy sees nothing', `select count(*)::int n from public.island_dungeon_invites`, '"n":0')
await as(null)
await expect('signed out cannot invite', `select public.island_dungeon_invite('${B}', 'ABCD', 'pier-hollow') r`, (g) => g.includes('ERROR') || g.includes('signed out'))
// an expired invite (11 minutes old) is not offered
await db.exec(`reset role; insert into public.island_dungeon_invites (sender, recipient, code, dungeon, created_at) values ('${A}', '${B}', 'QRST', 'pier-hollow', now() - interval '11 minutes');`)
await as(B)
await expect('an 11-minute-old invite is gone', `select count(*)::int n from public.island_dungeon_invites()`, '"n":0')

// safer gifts
await as(A)
await expect('gift a Pidgey (giftable)', `select public.island_send_gift('${B}', 'mon', '{"dex":16,"level":5}') r`, '"ok"')
await expect('gift a Venusaur (evolved)', `select public.island_send_gift('${B}', 'mon', '{"dex":3,"level":5}') r`, '"not giftable"')
await expect('gift a Mewtwo', `select public.island_send_gift('${B}', 'mon', '{"dex":150,"level":5}') r`, '"not giftable"')
await expect('an egg of a deep species', `select public.island_send_gift('${B}', 'egg', '{"dex":147}') r`, '"not giftable"')
await expect('two stones at once', `select public.island_send_gift('${B}', 'item', '{"id":"fire-stone","n":2}') r`, '"bad gift"')
await expect('one stone', `select public.island_send_gift('${B}', 'item', '{"id":"fire-stone","n":1}') r`, '"ok"')
await expect('a second stone the same week', `select public.island_send_gift('${B}', 'item', '{"id":"water-stone","n":1}') r`, '"one stone a week"')
await expect('balls still fine', `select public.island_send_gift('${B}', 'item', '{"id":"poke-ball","n":5}') r`, '"ok"')
console.log(fails ? `${fails} FAILED` : 'all passed')
process.exit(fails ? 1 : 0)
