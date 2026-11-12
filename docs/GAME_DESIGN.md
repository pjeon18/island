# Game design: the loop and core features

This is the result of Paul's game-loop interview on 2026-11-11. It replaces the one-visitor-per-session loop in `LOOP.md` where the two disagree. The pricing rule in `LOOP.md` still holds: focused minutes are the only thing that earns anything, and nothing can be bought that speeds growth.

## The loop in one paragraph

You start a focus session, and the island carries on quietly while you work. Pokémon pass by and settle in to wait, a party Pokémon digs something up, and the weather turns. None of it needs you. When the session ends, the break is where you play: you throw Poké Balls at the Pokémon that waited for you, collect what was found, feed and train your team, and build the island so different Pokémon come next time. Over about two weeks of real studying you complete an island's Pokédex, beat its guardian, and sail to the next island.

## During focus: small optional moments

The island never asks for anything while you study. Four kinds of moments happen on their own:

- **Passers-by arrive.** Wild Pokémon swim, fly or walk in and settle on the island. They stay until your next break, so you never have to stop working to catch one.
- **A Pokémon finds something.** A party Pokémon digs up a shell, a berry, a Star Piece or an egg and leaves it on the sand.
- **Weather rolls through.** Rain, fog or a sunny spell changes which Pokémon pass by.
- **Party life.** Your Pokémon play, nap together and chase each other. This earns nothing; it is there so the island feels alive.

Leaving a session halfway is never punished. The clock pauses, the party naps, and the minutes already focused still count.

## Who comes: everything is a lure

Which Pokémon pass by depends on what you did and what you built:

- **Session length.** Longer sessions bring rarer Pokémon.
- **Time of day.** Some Pokémon only come in the morning, some only at night.
- **How focused you were.** A session with no pauses or step-aways draws better Pokémon than an interrupted one.
- **Habitats you build.** A pond brings water types, tall grass brings bugs, rocks bring rock types.
- **Berries and food.** What you set out before a session pulls in particular species.
- **Decorations.** Each decoration has a few Pokémon that love it, so a campfire draws Charmander.
- **Weather**, from the moments above.

## In the break: catching

Wild Pokémon that settled during focus wait for you. Catching uses two things together:

- **The ball.** Poké, Great and Ultra Balls raise the odds in steps. Balls are bought with shells at the island shop.
- **The throw.** A shrinking ring times the throw. A good throw raises the odds, but a poor one can still work, so catching stays calm.

A ball wobbles and either holds or the Pokémon breaks free. A Pokémon that breaks free stays until the break ends.

## Other ways to get Pokémon

- **Eggs** hatch after a set number of focused minutes. They come from four places: the Day Care (leave two Pokémon there), streak milestones, gifts from friends, and moments during focus.
- **Visitors**, the original mechanic, become minor: a friend's Pokémon visits while they study, and occasionally a friendly visitor simply asks to join.

## What a strong team is for

- **Evolution and bond.** Levels lead to evolutions, and bond records the focused time spent together.
- **Island jobs.** Pokémon work by type. Water types water the berry bushes, Grass types grow habitats, and Fire types keep the campfire lit. Stronger Pokémon work faster and find more.
- **Expeditions.** Send a Pokémon out while you study, and it returns with items or an egg. Stronger Pokémon go further.
- **Guardian battles.** Each island has a guardian that your team fights automatically. Winning is one of the conditions for the next island.

## Islands

- Your first island grows over time: new land, a pond, a cave, a beach.
- New islands unlock later, each with its own habitat and Pokémon.
- Each island has a smaller curated Pokédex of about 40 to 60 species.
- The next island unlocks when all three of these are met: you beat the guardian, you catch a share of the island's Pokédex (about 70 percent), and you reach a total of focused hours.

## Friends

- When a friend is studying, one of their Pokémon visits your island.
- You can visit a friend's island to look around.
- You can trade or gift Pokémon, eggs and items.
- When you and a friend focus at the same time, you both get a bonus, such as better odds or more shells.

## Currency

- **Shells** are earned for every focused minute. They buy balls, berries, food and everyday decorations.
- **Star Pieces** are rare. They come from streaks, guardian battles, expeditions and lucky finds. They buy habitats and island upgrades.

## Views

Both views matter equally. The large view (a full tab or second monitor) is for the break: catching, building and the menus. The small always-on-top corner window is for focus: the island at a glance, with the clock and moments. Every screen has to work in both.

## Pacing target

Someone studying about 2 hours a day should complete the first island's Pokédex in about 2 weeks, which is about 28 focused hours for about 50 species.

**This needs faster levelling than the current rules.** Today one level costs as many EXP as the level number, at 1 EXP per minute for party members only. Raising one Pokémon from level 5 to 36 takes about 10 focused hours, so 28 hours could produce only about 8 final evolutions across 3 party slots.

Recommendation: double party EXP to 2 per minute, and give Pokémon in the box half that through island jobs. Paul decides.

## Build stages

Paul wants all four parts. They build in this order because each one feeds the next:

1. **Catching.** Built 2026-11-11 (see VALIDATION.md).
   - Passers-by during focus who wait for the break.
   - The shop with Poké, Great and Ultra Balls bought with shells, and the throw with a timing ring and odds.
   - Moments (finds, weather, party life).
   - Star Pieces.
2. **Lures and habitats.** Built 2026-11-11 with the defaults in the next section.
   - A spawn table driven by session length, time of day, focus quality, weather, habitats, food and decorations.
   - The first buildable habitats: a pond, tall grass and rocks.
   - The island's curated Pokédex of about 50 species.
3. **Eggs, Day Care, island jobs and expeditions.** Built 2026-11-11 with the defaults below (friends' egg gifts wait for stage 5).
4. **Island growth, the guardian battle and the second island**, with the three unlock conditions. Built 2026-11-11 with the defaults below.
5. **Friends:** visits, trading and gifting, and the study-together bonus. Built 2026-11-11 (client and `supabase/island_stage5.sql`). It goes live once Paul runs that SQL.

## Stage 2 defaults (Paul can change any of these)

These were chosen while building stage 2, since the interview left them open.

- **Roster:** the first island has 54 species. Four lines were added: Poliwag (needs the pond), Geodude (needs the rocks), and Hoothoot and Gastly (night only, 7 pm to 5 am). Pidgey, Starly and Hoppip like mornings, so they are twice as likely from 5 to 10 am.
- **Session length:** rare Pokémon (Eevee) and the starters only come in 50-minute sessions, or open sessions past 50 minutes.
- **Habitats**, each on its own fixed spot:

  | Habitat | Cost | Doubles the odds of |
  |---|---|---|
  | Tall grass | 2 Star Pieces and 60 shells | bug and grass types |
  | Rocks | 2 Star Pieces and 80 shells | rock and ground types |
  | Pond | 3 Star Pieces and 100 shells | water types |

  Water types climb out of the pond, and rock types come out from behind the rocks.
- **Food:** you set out one before a session, and it is eaten when the session ends. It triples the odds of its types. Each costs 15 shells.

  | Food | Types it draws |
  |---|---|
  | Honey | bug, grass, flying |
  | Cheri Berry | fire, electric |
  | Pecha Berry | water, ground, normal |
  | Chesto Berry | ghost, dark, psychic |
- **Decorations:** each one doubles the odds of the Pokémon that love it. For example, the campfire draws Charmander, the lantern draws Hoothoot and Gastly, and the umbrella draws Squirtle and Psyduck.
- **Weather** now works by type: rain draws water and electric, sun draws grass and fire, and fog draws ghost, normal and psychic.
- **Star Pieces:**
  - Every new species caught gives one. They also come from 10% of finds and every streak milestone.
  - Building all three habitats takes 7, which is about the first two days of play.
- **Pokédex:** each species now says how to find it, for example "Uncommon. Needs pond. Likes Pecha Berry."

## Stage 3 defaults (Paul can change any of these)

- **Roles:** every Pokémon is in one place at a time: the party (3), the Day Care (2), one of four jobs (1 each), an expedition (1), or the box. Roles change only between sessions, and the party never drops below one.
- **Helpers gain half EXP** from focused minutes: Day Care, jobs and expeditions. Only the party builds bond. This also speeds levelling toward the two-week target without changing the party's rate.
- **Eggs:**
  - Up to 3 at a time. They warm with focused minutes: 40 for a common species, 75 for uncommon, 120 for rare or a starter.
  - They hatch at level 1 in the nest east of the windmill, into the party if there is room, otherwise the box.
  - They come from the Day Care (every 90 focused minutes with two Pokémon there, as one parent's first stage), from 3% of finds, from streak milestones of 7 days or more, and from long expeditions (25% plus level/200). Gifts from friends come in stage 5.
- **Jobs** (one Pokémon each; stronger ones work faster, each interval is minus level/2 down to a floor):

  | Job | Types | Every | Reward |
  |---|---|---|---|
  | Berry bush | Water | 30 min, at least 12 | an Oran Berry |
  | Digging | Ground or Rock | 24 min, at least 10 | a find |
  | Lookout | Flying | 40 min, at least 18 | a passer-by, from the end of the pier |
  | Campfire | Fire, needs the campfire placed | 10 min, at least 4 | 5 shells |
- **Expeditions:** one at a time, 30 or 90 focused minutes. The Pokémon walks off down the pier and comes back with:
  - shells (10 + level×2, or 30 + level×4 on a long trip) and 1 to 4 items: berries, balls, food;
  - on a long trip, sometimes a Star Piece (30% plus level/200) or an egg.

## Stage 4 defaults (Paul can change any of these)

- **Guardians:**
  - Home Island's guardian is a Snorlax (level 35) asleep across the end of the pier. Frost Isle's is a Lapras (level 45) resting in the water by its pier. Tap one, or use Battle in the Town Map menu, between sessions.
  - The party fights automatically, one Pokémon at a time. Moves are named after each Pokémon's types (Gust, Water Gun…) and use the standard type chart.
  - The result is decided before it plays back in a FireRed-style battle window, and Skip jumps to the end.
  - Balance: a level-33 party wins about half the time, level 35 almost always, and a good type matchup makes up several levels (three Fighting-type Poliwrath win at level 30).
  - A loss costs nothing. A win gives 3 Star Pieces, and the guardian joins you five levels lower.
- **Frost Isle:**
  - The same island shape under snow: snowy tree, frosted grass, a colder sea, and snow instead of rain.
  - 31 species: Swinub, Snorunt (night), Spheal, Delibird (mornings), Seel (needs the pond), Shellder (needs the rocks), Smoochum, Snover, Sneasel (night), Piplup (rare), plus Psyduck and Eevee from home.
- **Sailing:** Frost Isle opens when you have beaten Snorlax, caught 70% of the home Pokédex (41 of 58) and focused 20 hours in total.
  - You sail from the Town Map menu between sessions. The screen fades to sea, and the page reloads on the other island.
  - Your Pokémon, eggs, helpers, items and owned decorations travel with you.
  - Each island keeps its own habitats, placed decorations, finds and food. Waiting Pokémon leave when you sail.
  - Once you have been to an island you can always sail back.
- **Home Island grows:** two more decoration spots at 3 focused hours, and the Cave habitat (3 Star Pieces and 120 shells) at 10 hours. The cave draws rock, ghost, poison and dark types. Zubat needs it, and cave Pokémon come out of its mouth.

## Stage 5 defaults (Paul can change any of these)

- **Friends' Pokémon visit:**
  - Every 2 minutes the island checks which friends are studying.
  - Up to two of them send their lead Pokémon up your pier. Tap one to see whose it is.
  - It walks back down the pier when they stop.
- **Studying together:** while your session is running and a friend is studying too, you get double shells for those minutes, and rare passers-by are 1.3× likelier. The clock reads "With Mina".
- **Visiting:** Visit on a friend's row fades to sea and opens their island, read-only.
  - It shows their island's palette, habitats, decorations and party, with whether they are studying.
  - Go home brings you back. Only between sessions.
- **Sending gifts:** Send on a friend's row opens a picker.
  - You can send a Pokémon (not the last in your party, not one on an expedition), an egg, or one item at a time.
  - Sending a Pokémon asks first, because it leaves your island for good.
  - The server limits you to 10 gifts a day and only to friends who have not blocked you. It caps a gifted Pokémon's level at what your verified focus minutes could have earned.
  - Gifts arrive at the friend's next break, or when they open the island, with "Mina sent you Pikachu!". A gifted egg waits for room in the nest.
- **Trades:** a two-sided trade (offer one, ask for one) is not built. Gifts cover sending both ways.

## Stage 6: dungeons, real lighting, and a map editor (built 2026-11-11)

Paul's direction: PokéSurvivor's real-time, move-and-attack feel (from his recordings), but in set dungeons rather than endless waves. Night lighting should feel real, like the Moonfell pixel lighter. He also wants a whiteboard-style map editor for making dungeons.

**Decisions (Paul, 2026-11-11):**
- **Controls:** WASD or arrow keys to move. The lead attacks the nearest enemy on its own with its type's move, and keys 1 and 2 fire two stronger moves on cooldowns.
- **Party:** you steer the lead, and the other two party members follow and fight on their own. Tab switches who you control.
- **Guardians:** each island's gate becomes a dungeon with the guardian as the boss in the last room. Clearing it replaces the auto-battle.
- **EXP:** dungeons give no EXP. Levels come only from focus, so a dungeon of level-20 Pokémon means studying and building a team first. Dungeons give items, Star Pieces and the unlock.

**Build order:**
1. **Lighting.**
   - Per-pixel 2D lighting like the Moonfell tool. Every sprite and prop gets a normal map generated from its silhouette.
   - Lights (lanterns, the campfire, the pier lantern, fire-type Pokémon, dungeon torches) shade each pixel by how it faces the light, with distance falloff and a dark, cool ambient at night.
   - Pokémon next to a fire light up on the side facing it.
   - Computed on the CPU at 240×180, only at dusk, at night and in dungeons.
2. **Map editor** (`editor.html` in this repo):
   - A pannable, zoomable board on a 16 px grid.
   - A palette of tiles (floor, wall, water, grass, dirt) and preset stamps (rooms, corridors, a pond room, a boss arena).
   - Props (trees, rocks, torches) and entities (enemy with species and level, boss, start, exit, item).
   - Drag to place, select, move, duplicate, delete, undo. An inspector for the selected entity.
   - Saved in the browser, with export and import as JSON, and a Play test button.
3. **Dungeon runtime:**
   - Loads an editor map. Tile collision and a camera that follows the lead.
   - Enemies that wake and chase, moves from the type chart, damage numbers, HP, a boss room.
   - Win or carried out. It is entered from a stone gate on the island, between sessions only.
4. **The first dungeon**, built in the editor: the gate to Frost Isle, with level-20 Pokémon and Snorlax as the boss.

### Stage 6 defaults (Paul can change any of these)

- **Gate dungeons:**
  - The guardian no longer sits on the pier. A stone doorway in the cliff beside the pier steps leads into the island's gate dungeon.
    - Home Island: Pier Hollow, a cave of 8 Pokémon at levels 18 to 21 with Snorlax (level 26) at the end.
    - Frost Isle: Glacier Grotto, an ice cave at levels 32 to 35 with Lapras (level 40).
  - The first clear marks the guardian beaten (one of the three conditions for the next island), gives 3 Star Pieces, and the boss joins you. You can go back in afterward.
- **Combat:**
  - Party and enemy HP and attack use the same formulas as before. A boss has 2.5 times a guardian's HP and three quarters of its attack.
  - Auto-attacks every 0.8 seconds. Key 1 is a 2.2× shot or strike on a 4-second cooldown. Key 2 is a 1.5× burst around you on a 9-second cooldown.
  - Ranged types (fire, water, electric, grass, ice, psychic, ghost, poison, dragon, fairy) shoot. Others strike up close.
  - Enemies sleep until you come within 4 tiles (the boss within 5).
  - Out of combat the party heals 8% a second, and a fainted partner gets back up at 30% after 6 quiet seconds. You lose only if all three are down.
  - Balance with an autopilot that charges in and uses both moves: a level-18 party loses narrowly, level 20 clears with almost nothing left, and level 22 clears comfortably.
- **Lighting:** the dungeon is dark (each map sets how dark). Torches, crystals, fire-type Pokémon, fire and electric shots, and a lantern around the lead light it, all through the same per-pixel engine as the island at night.
- **Editor** (`editor.html`):
  - Pieces stay movable and resizable, and the tiles are rebuilt from them.
  - Brushes add single-tile touch-ups.
  - Live checks catch a missing start, boss or exit, and anything standing on a wall or water.
  - Lit preview, undo and redo, export and import.
  - Play test runs the map without saving anything. In dev, Save also writes `public/dungeons/<id>.json` so the map ships with the game.

## Still open

- Which 50 species the first island holds, and its guardian.
- Exact prices: balls, food, habitats, and how many Star Pieces each thing costs.
- The levelling change in the pacing target section.
- Whether the shrinking ring can be turned off for people who want catching to be chance only.
