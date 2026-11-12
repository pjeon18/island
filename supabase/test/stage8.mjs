// Exercise island_stage8.sql (scenes with Ember Cove, trades, visit marks) on PGlite with stubbed Supabase pieces.
// Run with: node supabase/test/stage8.mjs
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
await db.exec(read('../island_stage8.sql'))
await db.exec(read('../island_stage8.sql'))
console.log('stage 8 applied twice (idempotent)')

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
  console.log(ok ? 'ok  ' : 'FAIL', label.padEnd(46), got)
}
// give both some verified minutes so levels aren't clamped to 1
await db.exec(`reset role; insert into public.island_profiles (user_id, verified_min) values ('${A}', 3000), ('${B}', 3000) on conflict (user_id) do update set verified_min = 3000;`)

// scenes
await as(A)
await expect('an Ember Cove scene with a hot spring', `select public.island_publish_scene('{"island":"ember","habitats":["spring","pond"],"decor":{"i":"statue","a":"rockpool","z":"windmill"}}') r`, '"ok"')
await expect('it was cleaned', `select scene from public.island_profiles where user_id = '${A}'`, (g) => g.includes('"spring"') && g.includes('"statue"') && g.includes('"rockpool"') && !g.includes('"z"'))
await expect('a made-up island', `select public.island_publish_scene('{"island":"moon"}') r`, '"bad island"')

// trades
await expect('Ana offers a Haunter to Ben', `select public.island_trade_offer('${B}', '{"dex":93,"level":30}') r`, '"ok"')
await expect('a second open offer to Ben', `select public.island_trade_offer('${B}', '{"dex":16,"level":5}') r`, '"already offered"')
await expect('a guardian', `select public.island_trade_offer('${B}', '{"dex":143,"level":30}') r`, '"not tradeable"')
await expect('to Cy, not a friend', `select public.island_trade_offer('${C}', '{"dex":16,"level":5}') r`, '"not friends"')
await expect('nothing to claim before Ben answers', `select public.island_trade_claim((select id from public.island_trades limit 1)) r`, '"r":null')
await as(B)
await expect('Ben sees the offer', `select other_name, mine, state, sender_mon from public.island_trades()`, (g) => g.includes('"mine":false') && g.includes('"dex":93'))
await expect('Ben accepts with a Graveler, gets the Haunter', `select public.island_trade_accept((select id from public.island_trades limit 1), '{"dex":75,"level":28}') r`, '"dex":93')
await expect('accepting twice gives nothing', `select public.island_trade_accept((select id from public.island_trades limit 1), '{"dex":75,"level":28}') r`, '"r":null')
await as(A)
await expect('Ana claims the Graveler', `select public.island_trade_claim((select id from public.island_trades limit 1)) r`, (g) => g.includes('"traded"') && g.includes('"dex":75'))
await expect('claiming twice gives nothing', `select public.island_trade_claim((select id from public.island_trades limit 1)) r`, '"r":null')
await expect('a new offer, declined by Ben', `select public.island_trade_offer('${B}', '{"dex":16,"level":5,"shiny":true}') r`, '"ok"')
await as(B)
await db.query(`select public.island_trade_decline((select id from public.island_trades where state = 'offered' limit 1))`)
await as(A)
await expect('Ana gets her shiny Pidgey back', `select public.island_trade_claim((select id from public.island_trades where state = 'declined' limit 1)) r`, (g) => g.includes('"returned"') && g.includes('"shiny":true'))
await as(C)
await expect('Cy sees no trades', `select count(*)::int n from public.island_trades`, '"n":0')

// visit marks
await as(A)
await expect('Ana leaves an Aspear Berry for Ben', `select public.island_visit_mark('${B}', 'berry', '{"food":"aspear-berry"}') r`, '"ok"')
await expect('a second berry the same day', `select public.island_visit_mark('${B}', 'berry', '{"food":"honey"}') r`, '"already today"')
await expect('Ana signs the signpost', `select public.island_visit_mark('${B}', 'sign', '{}') r`, '"ok"')
await expect('Ana pets a Charmander', `select public.island_visit_mark('${B}', 'pet', '{"dex":4}') r`, '"ok"')
await expect('a pet with no Pokémon', `select public.island_visit_mark('${B}', 'pet', '{"dex":"x"}') r`, '"bad mark"')
await expect('a mark for Cy', `select public.island_visit_mark('${C}', 'sign', '{}') r`, '"not friends"')
await as(B)
await expect('Ben sees three marks', `select count(*)::int n from public.island_visit_marks()`, '"n":3')
await db.query(`select public.island_visit_marks_seen(array(select id from public.island_visit_marks()))`)
await expect('then none', `select count(*)::int n from public.island_visit_marks()`, '"n":0')
await as(null)
await expect('signed out cannot mark', `select public.island_visit_mark('${B}', 'sign', '{}') r`, (g) => g.includes('ERROR') || g.includes('signed out'))
console.log(fails ? `${fails} FAILED` : 'all passed')
process.exit(fails ? 1 : 0)
