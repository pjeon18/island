// The first island's roster: evolution lines by first-stage dex number, with
// how often the first stage passes by and what lures it (stage 2):
//   needs: a habitat that must be built before it can come at all
//   time:  'night' = only at night; 'morning' = likelier from 5 to 10
// Gens 1–4 only (complete PMD Collab coverage). Level-up, stone and
// friendship evolutions are followed; trade evolutions are skipped.
// islands: which islands' passers-by include the line (default: home only).
// Guardians never pass by; they wait at the pier and join you once beaten.
export const LINES = [
  // starters: you pick one; the other two can visit rarely
  { dex: 1, rarity: 'starter' },
  { dex: 4, rarity: 'starter' },
  { dex: 7, rarity: 'starter' },
  // common visitors
  { dex: 16, rarity: 'common', time: 'morning' }, // Pidgey
  { dex: 10, rarity: 'common' }, // Caterpie
  { dex: 43, rarity: 'common' }, // Oddish
  { dex: 54, rarity: 'common', islands: ['home', 'frost'] }, // Psyduck
  { dex: 194, rarity: 'common' }, // Wooper
  { dex: 187, rarity: 'common', time: 'morning' }, // Hoppip (Magikarp's Gyarados is too big for the island)
  { dex: 396, rarity: 'common', time: 'morning' }, // Starly
  { dex: 163, rarity: 'common', time: 'night' }, // Hoothoot
  // uncommon
  { dex: 179, rarity: 'uncommon' }, // Mareep
  { dex: 403, rarity: 'uncommon' }, // Shinx
  { dex: 25, rarity: 'uncommon' }, // Pikachu
  { dex: 60, rarity: 'uncommon', needs: 'pond' }, // Poliwag
  { dex: 74, rarity: 'uncommon', needs: 'rocks' }, // Geodude
  { dex: 92, rarity: 'uncommon', time: 'night' }, // Gastly
  { dex: 41, rarity: 'uncommon', needs: 'cave' }, // Zubat (the cave opens at 10 focused hours)
  // rare
  { dex: 133, rarity: 'rare', islands: ['home', 'frost'] }, // Eevee

  // ---------- Frost Isle ----------
  { dex: 220, rarity: 'common', islands: ['frost'] }, // Swinub
  { dex: 361, rarity: 'common', islands: ['frost'], time: 'night' }, // Snorunt
  { dex: 363, rarity: 'common', islands: ['frost'] }, // Spheal
  { dex: 225, rarity: 'common', islands: ['frost'], time: 'morning' }, // Delibird
  { dex: 86, rarity: 'uncommon', islands: ['frost'], needs: 'pond' }, // Seel
  { dex: 90, rarity: 'uncommon', islands: ['frost'], needs: 'rocks' }, // Shellder
  { dex: 238, rarity: 'uncommon', islands: ['frost'] }, // Smoochum
  { dex: 459, rarity: 'uncommon', islands: ['frost'] }, // Snover
  { dex: 215, rarity: 'uncommon', islands: ['frost'], time: 'night' }, // Sneasel
  { dex: 393, rarity: 'rare', islands: ['frost'] }, // Piplup

  // ---------- guardians ----------
  { dex: 143, guardian: 'home' }, // Snorlax, asleep across the end of the pier
  { dex: 131, guardian: 'frost' }, // Lapras, resting by the Frost Isle pier
]
