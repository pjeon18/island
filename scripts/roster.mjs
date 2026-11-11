// The first island's roster: evolution lines by first-stage dex number, with
// how often the first stage passes by and what lures it (stage 2):
//   needs: a habitat that must be built before it can come at all
//   time:  'night' = only at night; 'morning' = likelier from 5 to 10
// Gens 1–4 only (complete PMD Collab coverage). Level-up, stone and
// friendship evolutions are followed; trade evolutions are skipped.
export const LINES = [
  // starters: you pick one; the other two can visit rarely
  { dex: 1, rarity: 'starter' },
  { dex: 4, rarity: 'starter' },
  { dex: 7, rarity: 'starter' },
  // common visitors
  { dex: 16, rarity: 'common', time: 'morning' }, // Pidgey
  { dex: 10, rarity: 'common' }, // Caterpie
  { dex: 43, rarity: 'common' }, // Oddish
  { dex: 54, rarity: 'common' }, // Psyduck
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
  // rare
  { dex: 133, rarity: 'rare' }, // Eevee
]
