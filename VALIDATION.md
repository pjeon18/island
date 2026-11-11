# Validation

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
