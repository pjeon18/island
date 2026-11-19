// The first island's roster: evolution lines by first-stage dex number, with
// how often the first stage passes by and what lures it (stage 2):
//   needs: a habitat that must be built before it can come at all
//   time:  'night' = only at night; 'morning' = likelier from 5 to 10
// All nine generations (2026-11-18, Paul: "can we add all the generations?"). Gens 1 to 4 have
// complete PMD Collab art; from Gen 5 on, lines are chosen whose every stage has walking,
// idle and sleeping sprites (SKIP in pull-pokeapi.mjs stops a line before a stage without them).
// Level-up, stone, friendship and plain-trade evolutions are followed.
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
  { dex: 443, rarity: 'deep', islands: [] }, // Gible, deep in Ember Cove's crater

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

  // ---------- every region (2026-11-18) ----------
  // Each island gets lines from every region, so a starter's region (the "lean" in game.ts)
  // matters wherever you are. The new starters can be picked in the prologue but never pass by.
  { dex: 495, rarity: 'starter', islands: [] }, // Snivy
  { dex: 498, rarity: 'starter', islands: [] }, // Tepig
  { dex: 501, rarity: 'starter', islands: [] }, // Oshawott
  { dex: 650, rarity: 'starter', islands: [] }, // Chespin
  { dex: 653, rarity: 'starter', islands: [] }, // Fennekin
  { dex: 656, rarity: 'starter', islands: [] }, // Froakie
  { dex: 722, rarity: 'starter', islands: [] }, // Rowlet
  { dex: 725, rarity: 'starter', islands: [] }, // Litten
  { dex: 728, rarity: 'starter', islands: [] }, // Popplio
  { dex: 810, rarity: 'starter', islands: [] }, // Grookey
  { dex: 813, rarity: 'starter', islands: [] }, // Scorbunny
  { dex: 816, rarity: 'starter', islands: [] }, // Sobble
  { dex: 906, rarity: 'starter', islands: [] }, // Sprigatito
  { dex: 909, rarity: 'starter', islands: [] }, // Fuecoco
  { dex: 912, rarity: 'starter', islands: [] }, // Quaxly
  // Home Island: Hoenn
  { dex: 263, rarity: 'common' }, // Zigzagoon
  { dex: 276, rarity: 'common', time: 'morning' }, // Taillow
  { dex: 270, rarity: 'uncommon', needs: 'pond' }, // Lotad
  { dex: 280, rarity: 'uncommon' }, // Ralts
  // Home Island: Unova
  { dex: 506, rarity: 'common' }, // Lillipup
  { dex: 540, rarity: 'common' }, // Sewaddle
  { dex: 546, rarity: 'uncommon' }, // Cottonee
  { dex: 535, rarity: 'uncommon', needs: 'pond' }, // Tympole
  { dex: 524, rarity: 'uncommon', needs: 'rocks' }, // Roggenrola
  { dex: 587, rarity: 'rare' }, // Emolga
  // Home Island: Kalos
  { dex: 661, rarity: 'common', time: 'morning' }, // Fletchling
  { dex: 659, rarity: 'common' }, // Bunnelby
  { dex: 669, rarity: 'uncommon' }, // Flabébé
  { dex: 672, rarity: 'uncommon' }, // Skiddo
  { dex: 677, rarity: 'uncommon' }, // Espurr
  { dex: 702, rarity: 'rare' }, // Dedenne
  // Home Island: Alola
  { dex: 742, rarity: 'common' }, // Cutiefly
  { dex: 761, rarity: 'common' }, // Bounsweet
  { dex: 736, rarity: 'common' }, // Grubbin
  { dex: 744, rarity: 'uncommon', needs: 'rocks' }, // Rockruff
  { dex: 753, rarity: 'uncommon' }, // Fomantis
  { dex: 759, rarity: 'uncommon' }, // Stufful
  { dex: 764, rarity: 'rare' }, // Comfey
  { dex: 778, rarity: 'rare', time: 'night' }, // Mimikyu
  // Home Island: Galar
  { dex: 819, rarity: 'common' }, // Skwovet
  { dex: 821, rarity: 'common', time: 'morning' }, // Rookidee
  { dex: 831, rarity: 'common' }, // Wooloo
  { dex: 827, rarity: 'uncommon', time: 'night' }, // Nickit
  { dex: 835, rarity: 'uncommon' }, // Yamper
  { dex: 833, rarity: 'uncommon', needs: 'pond' }, // Chewtle
  { dex: 840, rarity: 'rare' }, // Applin
  // Home Island: Paldea
  { dex: 915, rarity: 'common' }, // Lechonk
  { dex: 917, rarity: 'common' }, // Tarountula
  { dex: 926, rarity: 'uncommon' }, // Fidough
  { dex: 921, rarity: 'uncommon' }, // Pawmi
  { dex: 919, rarity: 'uncommon' }, // Nymble
  { dex: 960, rarity: 'uncommon', needs: 'pond' }, // Wiglett
  { dex: 924, rarity: 'rare' }, // Tandemaus
  { dex: 957, rarity: 'rare' }, // Tinkatink
  // Frost Isle: every later region
  { dex: 582, rarity: 'common', islands: ['frost'] }, // Vanillite
  { dex: 613, rarity: 'uncommon', islands: ['frost'] }, // Cubchoo
  { dex: 580, rarity: 'uncommon', islands: ['frost'], needs: 'pond' }, // Ducklett
  { dex: 712, rarity: 'common', islands: ['frost'] }, // Bergmite
  { dex: 698, rarity: 'rare', islands: ['frost'] }, // Amaura
  { dex: 767, rarity: 'uncommon', islands: ['frost'], needs: 'pond' }, // Wimpod
  { dex: 747, rarity: 'uncommon', islands: ['frost'] }, // Mareanie
  { dex: 739, rarity: 'uncommon', islands: ['frost'], needs: 'rocks' }, // Crabrawler
  { dex: 872, rarity: 'uncommon', islands: ['frost'], time: 'night' }, // Snom
  { dex: 875, rarity: 'rare', islands: ['frost'] }, // Eiscue
  { dex: 974, rarity: 'uncommon', islands: ['frost'] }, // Cetoddle
  { dex: 963, rarity: 'uncommon', islands: ['frost'], needs: 'pond' }, // Finizen
  { dex: 996, rarity: 'rare', islands: ['frost'] }, // Frigibax
  // Ember Cove: every later region
  { dex: 449, rarity: 'uncommon', islands: ['ember'] }, // Hippopotas
  { dex: 551, rarity: 'common', islands: ['ember'] }, // Sandile
  { dex: 554, rarity: 'uncommon', islands: ['ember'] }, // Darumaka
  { dex: 607, rarity: 'uncommon', islands: ['ember'], time: 'night' }, // Litwick
  { dex: 631, rarity: 'rare', islands: ['ember'] }, // Heatmor
  { dex: 694, rarity: 'common', islands: ['ember'], time: 'morning' }, // Helioptile
  { dex: 749, rarity: 'common', islands: ['ember'] }, // Mudbray
  { dex: 757, rarity: 'uncommon', islands: ['ember'] }, // Salandit
  { dex: 769, rarity: 'uncommon', islands: ['ember'] }, // Sandygast
  { dex: 776, rarity: 'rare', islands: ['ember'] }, // Turtonator
  { dex: 843, rarity: 'common', islands: ['ember'] }, // Silicobra
  { dex: 850, rarity: 'uncommon', islands: ['ember'] }, // Sizzlipede
  { dex: 951, rarity: 'common', islands: ['ember'] }, // Capsakid
  { dex: 932, rarity: 'uncommon', islands: ['ember'], needs: 'rocks' }, // Nacli
  { dex: 935, rarity: 'rare', islands: ['ember'] }, // Charcadet

  // ---------- guardians ----------
  { dex: 143, guardian: 'home' }, // Snorlax, asleep across the end of the pier
  { dex: 131, guardian: 'frost' }, // Lapras, resting by the Frost Isle pier
  { dex: 59, guardian: 'ember' }, // Arcanine, at the mouth of Ember Cove's crater
]
