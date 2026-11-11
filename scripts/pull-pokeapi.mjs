/**
 * Pull names and level-up evolutions for the roster from PokéAPI and write
 * public/data/roster.json. Cached in scripts/cache/pokeapi and throttled to
 * ~1 request per second (same etiquette as PokéMAPs). Safe to re-run.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LINES } from './roster.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CACHE = path.join(ROOT, 'scripts', 'cache', 'pokeapi')
const UA = 'island-content-pipeline/0.1 (free non-commercial fan project; github.com/pjeon18)'

let last = 0
async function getJson(url) {
  const fp = path.join(CACHE, url.replace(/^https:\/\/pokeapi\.co\/api\/v2\//, '').replace(/\/$/, '').replace(/\//g, '_') + '.json')
  try {
    return JSON.parse(await fs.readFile(fp, 'utf8'))
  } catch {}
  const wait = Math.max(0, last + 1000 - Date.now())
  if (wait) await new Promise((r) => setTimeout(r, wait))
  last = Date.now()
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const json = await res.json()
  await fs.mkdir(CACHE, { recursive: true })
  await fs.writeFile(fp, JSON.stringify(json))
  return json
}
const idFromUrl = (u) => Number(u.replace(/\/$/, '').split('/').pop())

const species = {}
async function addSpecies(dex, extra) {
  const s = await getJson(`https://pokeapi.co/api/v2/pokemon-species/${dex}/`)
  const name = s.names.find((n) => n.language.name === 'en')?.name ?? s.name
  species[dex] = { name, evolvesTo: [], ...extra }
  return s
}

/** Plain level-up evolution with no other condition (time, item, gender…). */
function plainLevel(details) {
  return details.find((d) => {
    if (d.trigger?.name !== 'level-up' || !d.min_level) return false
    const extras = Object.entries(d).filter(([k, v]) => !['trigger', 'min_level', 'version_group', 'is_default'].includes(k) && v !== null && v !== '' && v !== false)
    return extras.length === 0
  })
}

for (const line of LINES) {
  const s = await addSpecies(line.dex, { rarity: line.rarity, stage: 1, line: line.dex })
  const chain = (await getJson(s.evolution_chain.url)).chain
  // find this line's first stage in the chain (Pikachu sits under Pichu)
  const find = (node) => (idFromUrl(node.species.url) === line.dex ? node : node.evolves_to.map(find).find(Boolean))
  const walk = async (node, stage) => {
    const from = idFromUrl(node.species.url)
    for (const next of node.evolves_to) {
      const d = plainLevel(next.evolution_details)
      if (!d) continue
      const to = idFromUrl(next.species.url)
      species[from].evolvesTo.push({ dex: to, level: d.min_level })
      await addSpecies(to, { stage: stage + 1, line: line.dex })
      await walk(next, stage + 1)
    }
  }
  await walk(find(chain), 1)
}

await fs.mkdir(path.join(ROOT, 'public', 'data'), { recursive: true })
await fs.writeFile(path.join(ROOT, 'public', 'data', 'roster.json'), JSON.stringify({ source: 'https://pokeapi.co', species }, null, 1))
for (const [dex, s] of Object.entries(species)) console.log(dex, s.name, s.rarity ?? '', s.evolvesTo.map((e) => `→${e.dex}@${e.level}`).join(' '))
console.log(Object.keys(species).length, 'species')
