// Animated Black and White sprites for the page around the island (not the
// island itself, which uses PMD Collab). Source: Pokémon Showdown's gen5ani
// set, the same source PokéMAPs uses. Cached, throttled to one request a second.
import fs from 'node:fs'
const roster = JSON.parse(fs.readFileSync('public/data/roster.json', 'utf8')).species
const out = 'public/scene/mons'
fs.mkdirSync(out, { recursive: true })
for (const [dex, s] of Object.entries(roster)) {
  const file = `${out}/${dex}.gif`
  if (fs.existsSync(file)) continue
  const name = s.name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const res = await fetch(`https://play.pokemonshowdown.com/sprites/gen5ani/${name}.gif`, { headers: { 'User-Agent': 'island-fan-project (non-commercial)' } })
  if (res.ok) fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log(dex, name, res.status)
  await new Promise((r) => setTimeout(r, 1000))
}
