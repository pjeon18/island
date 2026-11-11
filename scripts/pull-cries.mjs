// Pokémon cries for tapping a Pokémon on the island (public/cries/<dex>.mp3).
// Copied from PokéMAPs where it already has them, otherwise fetched from
// Pokémon Showdown's cry library (the same source), one request a second.
import fs from 'node:fs'
const roster = JSON.parse(fs.readFileSync('public/data/roster.json', 'utf8')).species
const out = 'public/cries'
fs.mkdirSync(out, { recursive: true })
for (const [dex, s] of Object.entries(roster)) {
  const file = `${out}/${dex}.mp3`
  if (fs.existsSync(file)) continue
  const local = `../wheremon/public/content/cries/${dex}.mp3`
  if (fs.existsSync(local)) {
    fs.copyFileSync(local, file)
    continue
  }
  const name = s.name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const res = await fetch(`https://play.pokemonshowdown.com/audio/cries/${name}.mp3`, { headers: { 'User-Agent': 'island-fan-project (non-commercial)' } })
  if (res.ok) fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log(dex, name, res.status)
  await new Promise((r) => setTimeout(r, 1000))
}
