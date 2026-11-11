# Validation

## Review fixes, residents and balance (2026-11-11)
- The balance simulation (the real `game.ts` on a fake clock, 20 runs a schedule, 30 days) after the changes: home Pokédex at day 30 about 57 of 58 (was stuck at 53), one 2-hour Open session a day now gets 13.5 passers-by a day (was 3), shells banked by day 14 about 1,700 (was 3,000+) before the new Frost decorations and upgrades. 200 zero-minute Open sessions now give nothing (they took a starter to Lv63 before).
- In the browser: an old save got its partner (Charmeleon) put on the current island; sailing home left only the partner there while the Frost residents showed "Lives on Frost Isle"; moving one to Home and sailing back restored each island's own residents. Six residents show as two columns of chips. Eevee's summary is one line. The shop shows Upgrades, and the Frost decorations appear once Frost Isle is open.
- Not checked by hand: a rare Pokémon running off after 3 break-frees, the stone find art, the boxed evolution toast, and the 30-minute abandoned-session ending.

## Check-ins and the 3-hour cap (2026-11-11)
- Driven with a fake clock in the browser. In an Open session, "Still studying?" came at 60 and 120 minutes; answering 3 minutes later credited those 3 minutes. The session ended itself at 180 minutes as complete (`capped`), with Wooper's line about taking a real break.
- An unanswered check-in paused the clock after 10 minutes, with no time taken back.
- A 30-minute gap (a sleeping computer) paused the session on wake, with none of the gap credited.
- Not checked on real hardware: lid-close sleep and the lock screen with idle detection.

## The new-player opening and Wooper's tour (2026-11-11)
- **Prologue.** A fresh save starts on the black screen with no island or clouds showing. The time question shows the real clock ("It's 14:40.") and "No idea."; both replies continue. The four starters sit on one row at a 720 px window, with no name overflowing. Choosing Charmander, Squirtle or Pikachu made it the only party member; the black faded into the held clouds, which then parted.
- **Tour, full path.** Wooper walked out of the tall grass and spoke. "I'll help" sent in a Pidgey, and the "Tap it" instruction sat top left, clear of the island. The throw caught it, and the game's "Gotcha!" line finished before Wooper went on. The gift gave exactly 100 shells and 3 Star Pieces, the Pond's price. The pulse moved map button → Habitats → Pond, and the pond was built. The focus widget appeared at the 'focus' step, the pulse moved to Start focusing and then the Journal, and Wooper joined as the third party member: one Wooper on the island, adopted rather than duplicated. The Journal recorded the passer-by, the catch, the pond and Wooper.
- **Resume.** Reloads at 'catch' (with the Pidgey waiting) and at 'build' each resumed at that step's first line.
- **Skip.** "Skip the tour" ended it at once with the gift and Wooper in the party; Enter and Space advanced both the black screen and Wooper's lines.
- **Existing saves** (no tutorial field) load as 'done' with no prologue.
- Not checked: the desktop pet (float mode) on a brand-new save, and phones.

## The opening haze and the journal (2026-11-11)
- **Opening.** Every load starts behind a pale dithered haze with three soft clouds a side. It holds 0.3 s, opens from the middle, and is clear by about 1.3 s; the clouds thin out as they leave. Frames checked at 0.1, 0.6, 0.9 and 1.2 s by day, and in real time at night, where the haze is dimmed by the hour's light (multiplied, then cut back to one mask). Replay with `__island.replayIntro()`.
- **Journal.** Driven through the cheats (session, finish, passer-by, find, egg, hatch, expedition): every one wrote a line with the right portrait, level-ups merged per Pokémon, and the gold dot appeared on the strip button and cleared on opening. The summary tiles stay on one row with no overflow, including a 12h30 focus total. Cheats for weather, stones and waves bypass the events, so they do not log; the real events do.
- **Readability.** The Island page shows "Pokédex 8 of 31" and "Focused 30 hours" as one-size rows, label left, value right; all other fractions read "x of y".
- **Clock.** The bare outlined clock was checked on the day sea and at 22:00; both read clearly.

## Stage 6, lighting, dungeons and the editor (2026-11-11)

- **Night lighting:**
  - Before: a flat blue tint, with Pidgeotto right beside the campfire unlit.
  - After: the campfire lights the ground and Pidgeotto's near side warm, the tree's near face catches the light, the pier lantern lights Vaporeon and the water, and the stone lantern lights Psyduck. Normal maps come from each sprite's silhouette.
  - A night frame costs about 12 ms (day about 2 ms), so night frames draw at 30 fps.
- **Editor:**
  - Pieces, props and Pokémon dropped from the palette land where dropped. Caverns get ragged edges, and the pond fills with water.
  - The live check caught an exit dropped on a wall.
  - The lit preview showed torch and crystal light in the dark.
  - Pier Hollow opened from "In the game" with "Ready to play."
- **Dungeon:**
  - The intro window lists the Pokémon, their levels and the boss.
  - Fights showed auto-attacks, a Water Gun, "It's super effective!", HP bars and damage numbers.
  - The boss bar appears once Snorlax wakes. A partner fainted.
  - After the boss, walking onto the exit cleared the dungeon.
  - First clear (guardian reset in the save): "Snorlax joins you. 3 Star Pieces. One step closer to Frost Isle." Snorlax joined at level 21, and `guardians` gained "home".
- **Glacier Grotto:** loads in the ice theme with 6 Pokémon at levels 32 to 35 and Lapras (level 40, 1840 HP before the boss change; 2.5× now).
- **Balance:** autopilot through Pier Hollow's four rooms with a 10-second rest between rooms.
  - Level 18 lost with Snorlax at 49/800.
  - Level 20 cleared with 0/0/2 HP left.
  - Level 22 cleared with 0/57/30.
- **Island:** the doorway sits in the cliff right of the pier steps, and tapping it offers to enter, or to go back in once cleared. The Town Map menu shows the guardian with an Enter button.
- **Not checked:** playing by hand with a keyboard in a visible window (the pane was hidden for part of the testing, so the loop was stepped by hand), and phone or touch controls (the dungeon needs a keyboard for now).

## What Paul needs to do for stage 5

Run `supabase/island_stage5.sql` in Studdy's Supabase SQL editor (after `island.sql`, which is already live).

## Stage 5, friends (2026-11-11)

- **SQL:** `npm run test:sql` now also applies `supabase/island_stage5.sql` twice and checks it.
  - Scenes are cleaned: an unknown habitat, slot and item were dropped.
  - Only friends can read a scene.
  - A level-90 Snorlax gift was clamped to level 8, the most the sender's verified minutes could earn.
  - Refused: a Master Ball, 9 Star Pieces, dex 9999, and gifts to non-friends.
  - Gifts are claimed once.
  - The 11th gift in a day says "too many".
  - Direct inserts, updates and truncates on gifts are denied, and so are signed-out calls.
- **In the browser, with debug controls standing in for a friend:**
  - Studying together doubled shells (10 for 5 minutes), and the clock read "With Mina".
  - Mina's Pikachu walked up the pier and wandered.
  - Three gifts arrived with messages: an Eevee at level 12 into the box, a Piplup egg in the nest, and 2 Ultra Balls.
- **Friends menu (with a faked signed-in friend):** each row shows Wave, Visit and Send. Send lists your spare Pokémon, eggs and items.
- **Visit mode (with a faked scene):**
  - Mina's island loaded in the Frost palette with her pond, rocks, windmill, lantern and bench, and her party wandering.
  - The banner read "Mina's island · Studying now". Go home returned to the home island and cleared the visit.
- **Not checked live:** the real round trip to Supabase. Paul has to run `supabase/island_stage5.sql` first. Until then the island reports "Visiting is not set up yet." and "Gifts are not set up yet." and everything else works.

## Stage 4, guardians, growth and Frost Isle (2026-11-11)

- **Roster:** 79 species. Every Frost Isle species, Zubat's line, Snorlax and Lapras have PMD sprites.
- **Snorlax** sleeps at the end of the pier (with z's). The lookout helper stands mid-pier. Tapping Snorlax asks to battle.
- **Battle balance:** sampled 300 battles per setup.
  - Party at level 28 or 31: 0% wins.
  - Level 33: 56%. Level 35: 99%. Level 38: 100%.
  - Three Poliwrath (Water/Fighting) at level 30: 100%.
- **The battle window** played through with move names, HP bars (green, yellow, red) and hit shakes. Skip worked. The win gave +3 Star Pieces, and "Snorlax joined you and went to your box." (party full; it joined at level 30).
- **Islands menu:**
  - It shows the island, its Pokédex and hours, the guardian, growth milestones with checkboxes, and Frost Isle's three conditions.
  - Sail stays disabled until all three are met (checked before and after filling them with debug controls).
- **Sailing** faded out and loaded Frost Isle: snow palette, Lapras by the pier, a 31-species Pokédex, and an empty set of habitats. Sailing back restored Home Island's habitats and decorations, and Snorlax stayed gone.
- **Growth:** spots g and h open at 3 hours. The cave is built from the menu at 10 hours, sits on the south-west shore, and draws Zubat (3.2% with all lures as they were).
- **Font:** Press Start 2P has no ✓ glyph, so milestone checks are drawn checkboxes.

## Stage 3, eggs and helpers (2026-11-11)

Checked in the browser with `?debug` and `__island.step()`:

- **Roles:**
  - The Day Care took two Pokémon, the Berry bush a Water type (Psyduck) and the Lookout a Flying type (Pidgey).
  - A 30-minute expedition set off down the pier.
  - A non-Fire Pokémon could not take the campfire job, and none of the job buttons appear for types that cannot do them.
- **A 50-minute open session:**
  - Psyduck watered the bush twice (+2 berries), and Pidgey brought an extra passer-by.
  - Caterpie came back at 30 minutes with its haul in a message.
  - The Day Care pair (Geodude and Wooper) left a Wooper egg at 45 minutes.
  - Helpers gained about half EXP (Psyduck went from level 10 to 12).
- **Hatching:** eggs set one minute from hatching hatched together. The first went into a free party slot at the nest with a white glow that fades, and the second went to the box, with "An egg hatched. It is Wooper!".
- **Island:** the nest sits east of the windmill, with the Day Care pair beside it. The bush helper stays by the bush and the lookout stands at the end of the pier. Helpers do not join the party's play.
- **Pokémon menu:** eggs with progress bars, Party, Helpers (Day Care status and each job: who and how often, or which types it needs), and the Box. Each Pokémon's actions move it between roles.

## Stage 2, lures and habitats (2026-11-11)

- **Roster:** 54 species with types from PokéAPI. Poliwag, Geodude, Hoothoot and Gastly were added; all have PMD sprites, and none is too big for the island.
- **Spawn odds:** sampled 4,000 draws per setup.
  - Nothing built, at midday: no Poliwag, Geodude, night Pokémon or rares.
  - All habitats plus a Pecha Berry: Poliwag 11.6%, Geodude 10.9%, Psyduck 18.9%, Wooper 18.3%.
  - At 10 pm: Hoothoot 11.3%, Gastly 5.9%.
  - Long session: Eevee 3.4% and the starters about 3% each at a ×1 boost. Passers-by in long sessions also get the ×3.3 boost.
- **Habitats:** built from the Island menu with Star Pieces and shells. The pond, rocks and second tall grass are drawn and block walking. Water types arrive out of the pond.
- **Food:** bought and set out from the Island menu. A dish appears on the island, and the food is eaten when the session ends (checked).
- **Star Pieces:** a new species gave +1 (checked).
- **Pokédex hints:** each species shows its rarity and lures, with decoration names.
- **A 50-minute session** with the pond and a Pecha Berry brought Psyduck, Wooper, Squirtle and Psyduck.

## Stage 1, catching (2026-11-11)

Built from `docs/GAME_DESIGN.md`. Checked in the browser with `?debug` and `__island.step()`.

- **Passers-by:** one arrives every 12 focused minutes, from the tall grass or up the pier, with a short toast. At most 5 wait at once and 24 a day. A full 25-minute session brought 2. The odds favour rare Pokémon after a 50-minute session (`RARE_50`) and are cut to 0.6x after a step-away. Weather doubles the weight of the species it draws.
- **Waiting:** while you focus, tapping one says it is waiting for your break. When the session ends, a "!" appears over each, and a message says how many are waiting. Starting the next session sends the ones still waiting away (checked: 2 left at the start).
- **Catching:**
  - Tapping a waiting Pokémon opens the catch window: its portrait and level, the three balls with counts, Throw and Run.
  - The ring breathes between 22 and 6 island pixels. Its colour shows the odds with the chosen ball at that moment.
  - Throw works by button, by clicking the island, or with Space or Enter. Escape runs.
  - Checked frame by frame: the ball arcs in, the Pokémon glows and goes inside, the ball drops and wobbles. A catch shows three stars and "Gotcha!", into the party if there is room, otherwise the box. A break-free (forced) shows it popping back out and "Oh no! … broke free!".
- **Odds:** base by rarity (common 0.7, uncommon 0.5, rare 0.35, starter 0.3), plus 0.08 per earlier miss. Then ×1, ×1.5 or ×2 for Poké, Great or Ultra Ball, then ×0.7 to ×1.3 for the throw. Capped at 0.97.
- **Shop:** Poké 8, Great 25, Ultra 60 shells, ×1 or ×5, at the top of the Island menu. Locked during focus. New and old saves start with 5 Poké Balls.
- **Finds:** every 9 focused minutes there is a 60% chance a party Pokémon walks over and digs something up: shells (5 to 15), an Oran Berry, a Poké Ball, or a Star Piece (5%). Each is a tiny pixel item that twinkles now and then. Tap to pick it up, any time. At most 6 lie on the island.
- **Weather:** checked every 15 focused minutes, with a 45% chance of rain, fog or sun for 10 to 25 minutes. It fades in and out over about 4 seconds, with no flashes or lightning. Rain darkens the island and adds streaks and splashes, fog adds a wash and drifting bands, and sun adds warmth and slow light shafts. It is drawn inside the float mask.
- **Party life:** every 25 to 55 seconds two awake party Pokémon either run over and hop together or nap side by side under the tree. Checked: both happened over 150 simulated seconds.
- **Visitors:** the old end-of-session visitor now comes after only 25% of full sessions.
- **Star Pieces** show in the bag and the Island menu. They buy nothing yet (stage 2: habitats).

**Not checked:** catching in the Tauri desktop pet. The canvas is a drag region there, so a click may start a window drag instead of a throw; it needs a real Rust build.

## The loop pass, T2 and T3 (2026-11-11)

**How it was checked:**
- Browser checks ran in the Claude pane, with the `?debug` controls and `window.__island`.
- The SQL was checked on PGlite (Postgres 16 compiled to WebAssembly), with stubbed Supabase auth and Supabase's real default privileges. The harness is `npm run test:sql`.
- `npx tsc -b` and `npm run build` pass.

### The loop (`docs/LOOP.md`)
- **A finished 50-minute session** gave 2 berries and 50 shells, and started a 5-minute break shown as "Break 04:59" beside Start focusing. The toast read "You focused for 50 minutes. Two berries ripened on the bush."
- **Visitor odds, measured over 20,000 draws on a fresh save:**
  - A normal session gives common 75.2%, uncommon 16.4%, rare 4.3%, and other starters 4.1%.
  - After a 50-minute session it gives rare 10.7%, which is 2.49 times as likely. The copy says two and a half times.
  - I retuned the odds after the first measurement showed rare visitors at only 0.5%.
- **Visitor cap:** after the 12th visitor of the day, the next finished session raises `visitCapped`. The island says that visitors come back tomorrow.
- **Feeding:** a berry gave Charmeleon 10 EXP, taking it from Lv 20 to Lv 21. Feeding is refused during a session.
- **Stones:**
  - Eevee's sheet lists all seven routes: five stones, plus friendship by day and by night.
  - Giving it a Water Stone made it hold the stone. The evolution played when the next session started (Eevee became Vaporeon), and the stone was used up.
- **Friendship:** an Eevee with 10 hours of bond evolved at the start of a session at 3 a.m. local time into Umbreon, which is correct for night.
- **Pokédex:**
  - It shows 45 species. Seen-only species are greyed, and unseen ones show their number.
  - Tapping one says how to get it, for example "It evolves from another Pokémon with a Leaf Stone."
  - A save from T1 is backfilled, so owned Pokémon and their earlier forms count.
- **Decorations:**
  - Buying six items with 2,000 debug shells placed them on the six spots.
  - In daylight the windmill's sails turn. At night the lantern and campfire glow with feathered light, and the rest of the island takes the night grade.
  - Pokémon stop wandering into placed decorations.

### T2: online (Studdy accounts)
- **`supabase/island.sql`** applies and re-applies cleanly. These behaviours were verified on PGlite:
  - Beats credit real wall-clock time, capped at 90 s. A beat that comes too soon earns nothing.
  - Ending a session turns off "studying".
  - A published level-80 Charizard is clamped to level 8 by the verified minutes. Bad entries and bad shapes are rejected.
  - Direct inserts, updates and truncates are refused on all three tables. A wave cannot be inserted or redirected directly. The private helper cannot be called.
  - `island_friends()` shows only accepted friends, with their clamped party, minutes from the last day, and "studying". A block hides you both ways.
  - Waves work once, then report "already waved". Strangers and blocked users get "not friends".
  - Signed-out (anon) callers can't reach anything.
- **The client in the browser:** with `.env` present and no session, the Friends tab shows the sign-in form. There is no anonymous sign-in and no network write.
- **Not verified, because it needs Paul:**
  - Running the SQL on the live project.
  - A real magic-link sign-in.
  - Friends with real accounts, a live verified session, and a wave arriving at a break.

### T3: desktop pet
- **`?float` at 480×360:**
  - The island and a dithered lagoon ring sit on a transparent background.
  - The night tint stays on the island, cut back to the scene's alpha, and the lantern and campfire still glow.
  - The HUD works unchanged.
- **`src-tauri/`:** the config, the Rust entry point (`idle_seconds` from user-idle, start in the bottom-right corner), permissions and icons are written, and `npx tauri --version` reports 2.12.4.
- **Not built yet:** Rust isn't installed on this Mac.

### What Paul needs to do to switch everything on
1. **Run the SQL.** Done 2026-11-11, confirmed by probing the live project as a signed-out visitor: every island table and function exists and refuses the call. Run `supabase/island.sql` in the Studdy project's SQL editor. It is additive and changes nothing of Studdy's. Running `npm run test:sql` first re-runs the checks above.
2. **Allow the redirect URLs.** In Supabase, go to Auth, then URL Configuration, and add the island's URLs to the redirect allow-list: `http://localhost:5600/**` and `https://pauljeon.org/island/**`. The site is served from pauljeon.org (pjeon18.github.io redirects there), so the Turnstile widget must also allow pauljeon.org.
3. **Check Turnstile.** Confirm the Turnstile widget allows `localhost` and `pjeon18.github.io`. Studdy already uses the same hostnames.
4. **Build the desktop app.** Install Rust (https://rustup.rs), then run `npm run desktop`.

## T1, the playable slice (2026-11-11)

**How it was checked:** in the Claude browser pane, by clicking the real UI and using the `?debug` controls and `window.__island`.
- `npx tsc -b` and `npm run build` pass.
- Real Chrome checks are still open (see below).

### Verified
- **Starter.** On first run, the three starters wander the island behind the picker.
  - Choosing Charmander keeps it on the island, and the other two walk back into the tall grass.
  - The dialog reads "Charmander will study with you."
- **Focus session.** Start focusing begins a 25-minute countdown.
  - The party chip shows the level and an EXP bar.
  - Session length is 25 min, 50 min or Open, set in the HUD and in Settings.
- **EXP.**
  - 10 focused minutes took Charmander from Lv 5 / 0 EXP to Lv 6 / 5 EXP, since level L costs L EXP.
  - The day total recorded 10 minutes.
- **Evolution.** At level 16 a dialog appears: "Charmander is evolving."
  - The sprite fills with white light over 1.6 s behind a feathered halo, holds, and becomes Charmeleon.
  - It then settles over 2.2 s and the new form hops.
  - The dialog reads "Charmander evolved into Charmeleon."
  - "Stop it" sets `noEvolve`, and "Let it evolve" in the Pokémon sheet clears it.
- **Visitor.**
  - When a session finishes: the toast reads "You focused for 25 minutes.", the grass rustles, and a wild Pidgey walks out and hops.
  - The dialog shows its portrait: "A wild Pidgey came out of the tall grass. It is level 5 and wants to come along."
  - Befriend adds it to the party when there is room. Otherwise it walks down the dock to the box.
  - Let it go sends it back into the grass.
- **Ending early.** End session asks to confirm. An early end keeps the minutes but brings no visitor.
- **Idle question ignored (idle detection).**
  - The ask moves the session to `asking`. After 2 minutes without an answer it becomes `away`.
  - The 10 idle minutes are taken back: 720 s credited became 120 s.
  - EXP dropped but never de-leveled (Lv 17 / 10 EXP became Lv 17 / 0 EXP).
  - The party lay down and slept, with z's.
- **Coming back.** Activity, or "I am back", resumes the session. The toast reads "Welcome back. The clock is running again."
- **Gap.** A 10-minute wall-clock gap (laptop asleep or window closed) moves the session to `away`, and that time is not credited.
- **Party.**
  - "Rest in the box" walks the Pokémon off down the dock, and "Add to party" brings it back up.
  - Party changes are refused during a session.
  - The sheet totals reconcile: Charmeleon shows 27 minutes (25 + 12 − 10 retracted).
- **Persistence.** A running session survives a reload and keeps crediting real time (300 s became 302 s after a 3 s reload).
- **Two windows.** With the page and a plain pop-out open together, a Web Lock lets only one run the focus clock (one held, one pending), and credit advances 1 s per second. The other window mirrors the save through `storage` events.
- **Pop-out view.** `?popout` at 480×360 renders the island at 2× with the HUD scaled as one piece, and the pixel art stays crisp.
- **Credits.** The Credits tab and `CREDITS.md` are generated from the manifest for all 35 species: CC BY-NC 4.0, Chunsoft attribution, the PokéAPI source, and the fan-project disclaimer.

### Not yet verified (needs real Chrome)
- **Document Picture-in-Picture.** The Claude pane refuses `requestWindow`, so the always-on-top window and the frame rate behind a hidden opener tab are untested.
- **Idle Detection permission prompt.** The `presence.ts` paths were exercised through the debug hooks (`ask('idle')`, `goAway('locked')`, `presence.active()`), not the real API.

## T0, the motion study (2026-11-11)
- The island, wandering, the visitor, sleep, and day/night were verified by capture. Paul: "looks brilliant".
