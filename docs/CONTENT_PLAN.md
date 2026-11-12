# Content build plan (2026-11-12)

Paul picked these from `docs/REVIEW2.md` sections 5 and 6, plus one change of his own. This file is the order and the concrete numbers I'm building to. Every number here is a first pass that Paul can change.

## Done first

- **Session lengths are 30 minutes and 1 hour** (were 25 and 50). Rare odds, two berries and the long-session rules now follow the hour. A Lantern charge and a complete Open session now take 30 minutes. Saved 25 and 50 settings move to 30 and 60.

## Order

1. **Fill the lure and job gaps (L9).**
   - Three foods: Aspear Berry (ice), Rawst Berry (bug, steel) and Persim Berry (fighting, dragon).
   - Decorations for the nine species nothing draws. A rock pool draws Poliwag, Shellder, Seel and Piplup. A lightning rod draws Mareep and Shinx. A bat roost draws Zubat. A leaf pile draws Caterpie. A mud patch draws Swinub.
   - Three jobs:
     - Garden (grass): grows a food.
     - Generator (electric): needs the lighthouse. It keeps the lighthouse lit, which adds a waiting spot and brings night Pokémon by day at half their odds.
     - Fortune (psychic): shows the silhouettes of three Pokémon likely to come next.
   - Two evolution items finish dead ends. A Dawn Stone evolves Snorunt into Froslass. A Razor Claw, a rare boss drop, evolves Sneasel into Weavile.
2. **The restoration story (L1).** Home Island has three ruined landmarks. Each one is restored with focused hours, species brought back, and some shells and Star Pieces. Friends' focused minutes together count toward the hours.

   | Landmark | Needs | Opens |
   |---|---|---|
   | Pokémon Center hut | 15 hours, 20 species, 800 shells, 3 Star Pieces | A third Day Care slot, and eggs warm 25% faster |
   | Lighthouse | 30 hours, 35 species, 1,500 shells, 6 Star Pieces | The Lookout works at night, the Generator job, and a fifth waiting spot |
   | The old pier | 50 hours, 50 species, 2,500 shells, 10 Star Pieces, and Snorlax beaten | The sail to Ember Cove |

   - Wooper says two or three lines at each one. The story: a long storm woke the guardians, and the noise drove everyone away. Each landmark brings a few back.
3. **Pokédex milestones and shinies (L5).**
   - Each island's Pokédex pays out at 25% (a decoration), 50% (an egg), 75% (an extra decoration slot) and 100% (a Togepi egg from Wooper on Home, a unique decoration elsewhere).
   - About 1 in 150 passers-by in a clean hour-long session is shiny. Shinies get a mark in the Pokédex and the box.
4. **Day Care babies (L6).**
   - Some pairs lay a baby that never passes by: Pikachu → Pichu, Jynx line → Smoochum, fire types → Magby, Clefairy → Cleffa, and Marill → Azurill.
   - Two Pokémon that share a type warm their eggs 25% faster.
5. **Tides, seasons and destinations (L7, L8).**
   - A featured type each week doubles its odds and is named at the first break of the week.
   - Seasons follow the calendar: Hoppip in spring, Volbeat and Illumise at summer nights, autumn colours, December snow on Home. A meteor week brings Clefairy and uses the Moon Stone.
   - Expeditions get destinations by level: Kelp Bed (Lv15), Old Ruins (Lv30) and Ice Shelf (Lv40). Each has its own loot and a rare egg (Corsola, Remoraid), plus a postcard line in the Journal.
6. **Ember Cove, the third island (L2).**
   - A warm volcanic island with its own outline and palette, opened by the restored pier.
   - Fire types: Vulpix, Ponyta, Slugma, Numel, Houndour, Magby, Torkoal, Cubone and Phanpy.
   - A hot spring habitat, an Ember forge job (turns a stone into one you choose), its own weather table and higher wild levels.
   - A gate dungeon with its own guardian, Lv70 to 75.
7. **Social (L3, L12) and small moments (L11).** These need one new SQL file Paul would run (stage 8).
   - Trading between friends finishes Haunter into Gengar and Graveler into Golem. A sailor at the pier offers one fixed trade a week for solo players.
   - A Together egg replaces double shells when you focus with a friend. It warms only with minutes you both focus, and each of you gets the hatchling.
   - On a friend's island you can leave a berry in their dish (their next lure), sign their signpost and pet their Pokémon.
   - A weekly shared goal of 10 hours together lights a festival night on both islands.
   - Small moments: a bottle with a friend's note, the lantern lighting at real dusk, the lead dozing against the clock at 45 minutes, and residents running to the pier when you come back.

## Dungeon track (in parallel; only `src/dungeon/` and `public/dungeons/`)

- **Bosses that last (D-F3).** Boss health is doubled. Each phase opens with a short invulnerable beat, a shake and its signature move. Minibosses get 8× health, full attack, two helpers and a second move. The target is about 40 seconds for a boss and 15 for a miniboss.
- **Fights worth choosing (D-F1).** Auto-attack hits only awake enemies, so you can sneak past. A fainted enemy has a 12% chance of dropping a run item. Clearing a room brightens the lantern for a few seconds.
- **Melee and follower moves (D-F2).**
  - Melee types get 1.4× damage, 20% more health and a lunge.
  - Followers use move 1 when it's ready.
  - Key 3 fires your second Pokémon's burst.
- **Rooms, modifiers and boss kits.**
  - Four room types:
    - a monster house whose doors close when it wakes, with a big chest;
    - a vault behind a lever and timed spikes;
    - a shrine that trades 2 Oran Berries for a Reviver Seed;
    - a dark room only fire types or a torch can light.
  - One modifier a floor, named on arrival: Fog, Flooded, Restless, Echo or Rich.
  - Two more traps: boulders in caves and slick ice in Glacier Grotto.
  - Lapras gets its own kit: an ice lane that freezes the floor, a Perish Song countdown and a water ring.
- **Deep floors that scale (L10).** After a first clear, a charged run can go on to B4 to B6. Their level is your strongest Pokémon's level minus 5. They still give no EXP.
