// The T1 roster: evolution lines by first-stage dex number, with how often the
// first stage visits. Gens 1–4 only (complete PMD Collab coverage). Only
// level-up evolutions are followed in T1; stone, friendship and trade
// evolutions arrive in T3.
export const LINES = [
  // starters: you pick one; the other two can visit rarely
  { dex: 1, rarity: 'starter' },
  { dex: 4, rarity: 'starter' },
  { dex: 7, rarity: 'starter' },
  // common visitors
  { dex: 16, rarity: 'common' }, // Pidgey
  { dex: 10, rarity: 'common' }, // Caterpie
  { dex: 43, rarity: 'common' }, // Oddish
  { dex: 54, rarity: 'common' }, // Psyduck
  { dex: 194, rarity: 'common' }, // Wooper
  { dex: 187, rarity: 'common' }, // Hoppip (Magikarp's Gyarados is too big for the island)
  { dex: 396, rarity: 'common' }, // Starly
  // uncommon
  { dex: 179, rarity: 'uncommon' }, // Mareep
  { dex: 403, rarity: 'uncommon' }, // Shinx
  { dex: 25, rarity: 'uncommon' }, // Pikachu
  // rare
  { dex: 133, rarity: 'rare' }, // Eevee
]
