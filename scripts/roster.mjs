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
  // the other regions' starters can be picked in the prologue but never pass by (islands: []),
  // so no island's Pokédex or visitor odds change (Paul asked for more starter options, 2026-11-11)
  { dex: 152, rarity: 'starter', islands: [] }, // Chikorita
  { dex: 155, rarity: 'starter', islands: [] }, // Cyndaquil
  { dex: 158, rarity: 'starter', islands: [] }, // Totodile
  { dex: 252, rarity: 'starter', islands: [] }, // Treecko
  { dex: 255, rarity: 'starter', islands: [] }, // Torchic
  { dex: 258, rarity: 'starter', islands: [] }, // Mudkip
  { dex: 387, rarity: 'starter', islands: [] }, // Turtwig
  { dex: 390, rarity: 'starter', islands: [] }, // Chimchar
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

  // ---------- deep in the dungeons ----------
  // caught only after a charged boss clear (DEEP in game.ts); they never pass by the island
  { dex: 246, rarity: 'deep', islands: [] }, // Larvitar, deep in Pier Hollow
  { dex: 304, rarity: 'deep', islands: [] }, // Aron, deep in Pier Hollow
  { dex: 147, rarity: 'deep', islands: [] }, // Dratini, deep in Glacier Grotto

  // ---------- hatched only (2026-11-12, docs/CONTENT_PLAN.md) ----------
  // babies from Day Care pairs, Wooper's Togepi, and expedition eggs; they never pass by
  { dex: 172, rarity: 'baby', islands: [] }, // Pichu (from a Pikachu-line pair)
  { dex: 298, rarity: 'baby', islands: [] }, // Azurill (from two water types)
  { dex: 173, rarity: 'baby', islands: [] }, // Cleffa (from two normal types); Clefairy visits in meteor week
  { dex: 175, rarity: 'baby', islands: [] }, // Togepi (Wooper's gift for a full Home Pokédex)
  { dex: 222, rarity: 'rare', islands: [] }, // Corsola (Kelp Bed expeditions)
  { dex: 223, rarity: 'rare', islands: [] }, // Remoraid (Ice Shelf expeditions)

  // ---------- seasons ----------
  { dex: 313, rarity: 'uncommon', time: 'night', season: 'summer' }, // Volbeat
  { dex: 314, rarity: 'uncommon', time: 'night', season: 'summer' }, // Illumise

  // ---------- Ember Cove (third island) ----------
  { dex: 322, rarity: 'common', islands: ['ember'] }, // Numel
  { dex: 218, rarity: 'common', islands: ['ember'] }, // Slugma
  { dex: 231, rarity: 'common', islands: ['ember'], time: 'morning' }, // Phanpy
  { dex: 228, rarity: 'common', islands: ['ember'], time: 'night' }, // Houndour
  { dex: 77, rarity: 'uncommon', islands: ['ember'] }, // Ponyta
  { dex: 104, rarity: 'uncommon', islands: ['ember'], needs: 'rocks' }, // Cubone
  { dex: 37, rarity: 'uncommon', islands: ['ember'], time: 'night' }, // Vulpix
  { dex: 324, rarity: 'uncommon', islands: ['ember'], needs: 'spring' }, // Torkoal
  { dex: 240, rarity: 'rare', islands: ['ember'] }, // Magby (also a Day Care baby from fire types)

  // ---------- guardians ----------
  { dex: 143, guardian: 'home' }, // Snorlax, asleep across the end of the pier
  { dex: 131, guardian: 'frost' }, // Lapras, resting by the Frost Isle pier
  { dex: 59, guardian: 'ember' }, // Arcanine, at the mouth of Ember Cove's crater
]
