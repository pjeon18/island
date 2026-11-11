/**
 * Pull PMD Collab sprites for the island from SpriteCollab, pinned to one
 * commit so the art never shifts under us.
 *
 * Etiquette (same as PokéMAPs): every download is cached in scripts/cache and
 * never re-fetched; requests are throttled; the user agent names the project.
 *
 * Output:
 *   public/sprites/<dex>/<Action>-Anim.png, <Action>-Shadow.png, Normal.png …
 *   public/sprites/manifest.json   (frame sizes, durations, credits)
 *   CREDITS.md                     (human-readable, per species)
 *
 * Licence: community sprites are CC BY-NC 4.0 and need credit per author.
 * Sprites credited to CHUNSOFT come from the official PMD games.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CACHE = path.join(ROOT, 'scripts', 'cache')
const OUT = path.join(ROOT, 'public', 'sprites')
const SHA = '576a7f13b5b7f6ad09a5877d5ae6b2d33458c245' // SpriteCollab master, 2026-11-10
const RAW = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${SHA}`
const UA = 'island-sprite-pipeline/0.1 (free non-commercial fan project; github.com/pjeon18)'

// The roster comes from public/data/roster.json (run pull-pokeapi.mjs first).
const roster = JSON.parse(await fs.readFile(path.join(ROOT, 'public', 'data', 'roster.json'), 'utf8'))
const SPECIES = Object.entries(roster.species).map(([dex, s]) => [String(dex).padStart(4, '0'), s.name])
const ACTIONS = ['Idle', 'Walk', 'Sleep', 'Hop', 'Eat', 'Laying', 'Nod', 'LookUp']
const EMOTIONS = ['Normal', 'Happy']

let last = 0
async function throttled(ms = 250) {
  const wait = Math.max(0, last + ms - Date.now())
  if (wait) await new Promise((r) => setTimeout(r, wait))
  last = Date.now()
}

/** Cached GET. Returns null on 404 so missing actions skip gracefully. */
async function get(rel) {
  const fp = path.join(CACHE, SHA.slice(0, 8), rel)
  try {
    return await fs.readFile(fp)
  } catch {}
  await throttled()
  const res = await fetch(`${RAW}/${rel}`, { headers: { 'user-agent': UA } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${rel}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.mkdir(path.dirname(fp), { recursive: true })
  await fs.writeFile(fp, buf)
  return buf
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))
  return m ? m[1] : null
}

function parseAnimData(xml) {
  const anims = {}
  for (const block of xml.match(/<Anim>[\s\S]*?<\/Anim>/g) ?? []) {
    const name = tag(block, 'Name')
    const copyOf = tag(block, 'CopyOf')
    if (copyOf) {
      anims[name] = { copyOf }
      continue
    }
    anims[name] = {
      w: Number(tag(block, 'FrameWidth')),
      h: Number(tag(block, 'FrameHeight')),
      durations: [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => Number(m[1])),
    }
  }
  // A CopyOf anim has no sheet of its own; it reuses the source's files.
  for (const [k, v] of Object.entries(anims)) if (v.copyOf) anims[k] = { ...anims[v.copyOf], file: v.copyOf }
  return { shadowSize: Number(tag(xml, 'ShadowSize') ?? 1), anims }
}

function parseTsv(buf) {
  return buf
    .toString('utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split('\t'))
}

// credit_names.txt columns: Name, Discord, Contact. Authors in credits.txt use the Discord id.
const byDiscord = new Map()
for (const [name, discord, contact] of parseTsv(await get('credit_names.txt')).slice(1)) {
  byDiscord.set(discord, { name, contact })
  byDiscord.set(name, { name, contact })
}
const who = (id) => byDiscord.get(id) ?? { name: id, contact: '' }

const manifest = { source: 'https://github.com/PMDCollab/SpriteCollab', commit: SHA, licence: 'CC BY-NC 4.0', species: {} }
const md = [
  '# Sprite credits',
  '',
  'All Pokémon sprites and portraits come from the PMD Sprite Repository',
  '(https://sprites.pmdcollab.org, https://github.com/PMDCollab/SpriteCollab),',
  `pinned to commit \`${SHA}\`. Community work there is licensed CC BY-NC 4.0`,
  '(https://creativecommons.org/licenses/by-nc/4.0/). Sprites credited to',
  'CHUNSOFT are from the Pokémon Mystery Dungeon games.',
  '',
  'Pokémon and its characters are © Nintendo, Creatures Inc. and GAME FREAK inc.',
  'This is a free, non-commercial fan project with no affiliation.',
  '',
]

for (const [dex, name] of SPECIES) {
  const xml = await get(`sprite/${dex}/AnimData.xml`)
  if (!xml) throw new Error(`no AnimData for ${dex}`)
  const data = parseAnimData(xml.toString('utf8'))
  const dir = path.join(OUT, dex)
  await fs.mkdir(dir, { recursive: true })
  const anims = {}
  for (const action of ACTIONS) {
    const a = data.anims[action]
    if (!a) continue
    const fileAction = a.file ?? action
    const anim = await get(`sprite/${dex}/${fileAction}-Anim.png`)
    const shadow = await get(`sprite/${dex}/${fileAction}-Shadow.png`)
    if (!anim || !shadow) continue
    await fs.writeFile(path.join(dir, `${action}-Anim.png`), anim)
    await fs.writeFile(path.join(dir, `${action}-Shadow.png`), shadow)
    anims[action] = { w: a.w, h: a.h, durations: a.durations }
  }
  const portraits = []
  for (const emo of EMOTIONS) {
    const png = await get(`portrait/${dex}/${emo}.png`)
    if (!png) continue
    await fs.writeFile(path.join(dir, `${emo}.png`), png)
    portraits.push(emo)
  }
  const spriteCredits = parseTsv((await get(`sprite/${dex}/credits.txt`)) ?? Buffer.from(''))
  const portraitCredits = parseTsv((await get(`portrait/${dex}/credits.txt`)) ?? Buffer.from(''))
  const authors = (rows) => [...new Set(rows.map((r) => r[1]))].map(who)
  manifest.species[dex] = {
    name,
    shadowSize: data.shadowSize,
    anims,
    portraits,
    credits: { sprite: authors(spriteCredits), portrait: authors(portraitCredits) },
  }
  const list = (xs) => xs.map((a) => (a.contact ? `${a.name} (${a.contact})` : a.name)).join(', ') || 'unknown'
  md.push(`- **${name}** (#${Number(dex)}): sprite by ${list(manifest.species[dex].credits.sprite)}; portrait by ${list(manifest.species[dex].credits.portrait)}`)
  console.log(`${dex} ${name}: ${Object.keys(anims).join(' ')} | ${portraits.join(' ')}`)
}

await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
await fs.writeFile(path.join(ROOT, 'CREDITS.md'), md.join('\n') + '\n')
console.log('wrote manifest.json and CREDITS.md')
