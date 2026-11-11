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
3. **Eggs, Day Care, island jobs and expeditions.**
4. **Island growth, the guardian battle and the second island**, with the three unlock conditions.
5. **Friends:** visits, trading and gifting, and the study-together bonus. This needs new server functions on Studdy's Supabase, which Paul runs.

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

## Still open

- Which 50 species the first island holds, and its guardian.
- Exact prices: balls, food, habitats, and how many Star Pieces each thing costs.
- The levelling change in the pacing target section.
- Whether the shrinking ring can be turned off for people who want catching to be chance only.
