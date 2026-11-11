# CLAUDE.md: Island (working title)

This is a Pokémon collecting and leveling idle game. It lives in a small always-on-top window while you study. Party Pokémon gain EXP and evolve only during focus time you start yourself. It is kin to Studdy (`../studdy`): focused minutes are the only unit, and nothing can be bought that speeds anything up.

Read `docs/GAME_DESIGN.md` first: it is the game loop and core features from Paul's interview (2026-11-11) and the build stages. Then `docs/PLAN.md` for the original plan and decision log. It holds the approved plan and the decision log. Paul makes every final call: give options with a recommendation, then wait.

## State
- **T0, the motion study, is built** (2026-11-11).
  - The island idles with Bulbasaur, Charmander and Squirtle.
  - A visitor comes out of the tall grass. The party falls asleep when you step away.
  - Day and night follow the clock.
  - It has a Picture-in-Picture pop-out with a plain pop-out fallback.
- **T1, the playable slice, is built** (2026-11-11) on the approved T0 look ("looks brilliant").
  - It covers the starter pick, focus sessions, EXP and levels, real-level evolution, visitors and befriending, the box, step-away detection, the `?debug` panel, and the in-window HUD.
  - See VALIDATION.md for what was checked and what still needs real Chrome.
- **The loop pass, T2 and T3 are built** (2026-11-11). `docs/LOOP.md` is the pricing law:
  - Every focused minute gives 1 EXP to each party Pokémon and 1 shell.
  - Each finished session brings a visitor and ripens berries. A 50-minute session makes rare visitors 2.5 times as likely.
  - Streak days wash stones ashore, and 10 hours of bond unlock friendship evolutions.
  - Every choice happens in the 5-minute break after a session.
  - T2 is Studdy accounts and friends: `supabase/island.sql` plus `src/cloud.ts`. T3 is stone and friendship evolutions (45 species), shell decorations, and the Tauri desktop pet (`src-tauri/`, plus `?float`).
- **What Paul has to do:**
  - Run `supabase/island_stage5.sql` in Studdy's SQL editor (stage 5, friends).
  - Done 2026-11-11: `supabase/island.sql` is on the live project (probed: all tables and functions exist and refuse signed-out callers) and Paul added the redirect URLs.
  - Still open: a real sign-in on pauljeon.org/island to confirm the redirect and Turnstile.
  - Install Rust (rustup) to build the desktop app.
  - See VALIDATION.md for the full list.
- **Live** at https://pauljeon.org/island/ (pjeon18.github.io redirects there; repo `pjeon18/island`, public). A push to `main` deploys through `.github/workflows/deploy.yml` with `BASE_PATH=/island/`. The three public Supabase keys are repo secrets, as in Studdy.

## Run
- `npm install`, then `npm run dev`. It serves on port 5600, under the launch.json entry `island`. The map editor is at `/editor.html` and a dungeon at `/dungeon.html?id=pier-hollow`.
- `npm run sprites` pulls the evolution data from PokéAPI, then the sprites from SpriteCollab. Both are cached, pinned and throttled, so a re-run is a no-op.
  - The roster lives in `scripts/roster.mjs` (Gens 1–4, level-up evolutions only in T1).
- `?popout` shows the window-only view. `?float` previews the desktop-pet mode in a browser.
- `npm run desktop` runs the Tauri app, and `npm run desktop:build` builds the .app and .dmg. Both need Rust.
- `.env` (gitignored) holds Studdy's public Supabase URL, anon key and Turnstile site key. Without it, the online part switches off.
- Cheats: press ` in the game (or More → Cheats) for a window of every event: focus, visitors, weather, time, growth, eggs and helpers, friends, items, progress (unlock Frost Isle, enter the dungeon, sail), step-away and reset. They are all defined in `CHEATS` and `cheat()` in main.ts. `?debug` shows the same list under the window, plus an hour slider. Older notes: ?debug also has passer-by now, a find now, +5 of each ball, and the weather: add focused minutes, finish the session, a visitor, the lead ready to evolve, an ask or idle prompt, screen lock, activity, a sleep gap, the hour, and reset.

## Map
- `src/island.ts`: the island, painted pixel by pixel into a static base (`PAL`, `buildIsland`), plus the props: tree, bush and lantern.
- `src/scene.ts`: the y-sorted world, the water glints and foam, the swaying tall grass, and the day/night light (a multiply by `lightAt(hour)` plus the lantern's feathered glow).
- `src/creature.ts`: per-Pokémon behaviour (wander, eat, lay, look, nod, hop, sleep) mapped onto PMD actions.
- `src/sprites.ts`: the PMD sheet loader.
  - Each sheet has 8 rows: 0 down, 1 down-right, 2 right … 7 down-left.
  - Durations are in 1/60 s ticks.
  - The ground point comes from the Shadow sheet.
- `src/game.ts`: the rules and the save (`island-save-v1`).
  - Sessions credit real wall time per beat, capped at 90 s. A gap over 5 minutes means away.
  - Check-ins come every 20 minutes. With the idle detector, an unanswered idle question takes back 10 minutes, and EXP never de-levels.
  - Level L costs L EXP. Visitors are drawn by weighted rarity.
- `src/presence.ts`: the Idle Detection API wrapper (active or idle, locked or unlocked only).
- `src/cloud.ts`: the online half (T2).
  - Accounts are shared with Studdy through email magic links behind Turnstile; there is never an anonymous sign-in.
  - Verified sessions use `island_session_begin`, `island_session_beat` and `island_session_end`; a beat goes out every 60 s while running, and the session ends when you step away.
  - `island_publish` sends the party (the server clamps it). Friends come through `island_friends`, which reuses Studdy's friend requests.
  - Waves arrive at your next break.
  - Every call no-ops politely when the island's tables are missing (the `missingSchema` state).
- Stage 3 helpers live in `game.ts`: `roleOf`/`assign` (party, box, daycare, `job:*`, expedition), `work(n)` per focused minute (eggs, Day Care, `JOBS`, the expedition), `addEgg`/`hatch`, half EXP for helpers in `giveExp`. In `main.ts`: `anchorFor`/`applyAnchors` keep helpers at their work, `NEST` (scene.ts) holds eggs, and `spawnNext` puts a hatchling at the nest.
- Stage 4: `src/battle.ts` (type chart, `simulate`, guardian stats), `game.ts` `ISLANDS`/`sail`/`sailNeeds`/`dexOf`/`challenge`/`guardianJoins`/`stash` (per-island habitats, decor slots, finds, food), and `island.ts` `useIsland('frost')` (palette swap applied before the Scene is built; travel reloads the page). The guardian creature is `guardianC` in main.ts.
- Stage 5 (friends): `supabase/island_stage5.sql` adds `scene` on island_profiles, `island_publish_scene`, `island_friend_scene`, `island_gifts` with `island_send_gift` and `island_claim_gifts`. The client side is in `cloud.ts` (publishScene, friendScene, sendGift, claimGifts, hasStage5). In `main.ts`: `refreshFriends` (every 2 min: visitors and `game.together`), `takeGifts`, `visitFriend`/`bootVisit` (`?visit=1` with the scene in sessionStorage, a read-only view), and `sendGift`. Debug: 'A friend studies too', 'A gift arrives'.
- Stage 6:
  - `src/lighting.ts` does per-pixel lighting (`normalMapFor` builds a normal map from a silhouette; `applyLighting` takes the colours, normals, an ambient and a list of lights). `Scene.render` uses it after dusk (`lit`) and gathers its lights in `Scene.lights()`. Fire types glow through `scene.glowDex`.
  - `src/dungeon/map.ts` holds the map format (pieces, props, entities and touch-ups), `compose`, `bakeMap`, and the tile and prop art per theme (cave, forest, ice).
  - `src/editor/main.ts` is the whiteboard editor (`editor.html`). `src/dungeon/play.ts` is the real-time dungeon (`dungeon.html?id=…&gate=…` or `?map=play`).
  - Official maps live in `public/dungeons/` (`index.json` lists them). The dev route `/__dungeon` in `vite.config.ts` writes them.
  - The island's doorway is `scene.gate`. Each island names its dungeon in `ISLANDS[].dungeon`.
- Crowding and petting: at most `ISLAND_CAP` (12) Pokémon on the island (party first, then helpers in the room left after waiting wild ones, at most 3, and friends' visitors). `Scene.separate` pushes apart any two closer than about one body. Tapping your own Pokémon calls `petMon`: a hop, a heart (`scene.hearts`), its cry (`public/cries`, `node scripts/pull-cries.mjs`, mute in More), and `hud.showSummary` (types, EXP, role, bond, held item, evolution, with Pet, Feed and More).
- The opening: `src/intro.ts` (`Intro`) covers the view with a pale haze (12 px dithered edge; Paul found a wider band too blurry) that opens from the middle, with a faint bank of five small distant clouds a side (slower, 0.8x) behind three larger near ones a side, none with shadows, drifting out with it (Paul, 2026-11-11: the first version's clouds were "too defined and too many"; it should read as weather, not the focus). It is clear in about 1.3 s. It is drawn on its own canvas (`.intro-layer`, `drawIntro` in main.ts) the size of the whole window in island pixels, lined up with the island canvas, so the page around the island is covered too (with the darker sea, a canvas-sized haze showed a blue frame). Wider windows get proportionally more clouds; float mode keeps it island-sized. It is tinted by `lightAt(hour)`, updated on sim time in the scene; main fades the HUD in by `intro.cleared` and drops it when done. Dev: `__island.replayIntro()`.
- The journal (strip button with the notebook icon, `logTab` in hud.ts): `game.note(kind, text, {dex, n, key})` writes `save.log` (newest last, capped at `LOG_MAX` 200; a repeated `key` such as `lv:<mon>` replaces its older line and sums `n`). main.ts writes a line next to each event's toast or dialog. The top shows up to three big numbers for what happened since `save.logSeen` (Focused first, then Joined, Evolved, Hatched, Levels, Came by, Found, Friends, whichever are non-zero), falling back to Today; below, eight lines a page grouped by day, new ones marked in gold. The strip button gets a small gold dot when something new happened; there is never a count. Dev: `__island.cheat(id)` runs any cheat.
- Small numbers: secondary grey is `--fr-soft` #5c5c5c with a lighter shadow, fractions are written "8 of 31" (Press Start 2P's slash between digits was hard to read), and the Island page's Pokédex and hours are trainer-card rows (label left in grey, value right in ink, one size; Paul disliked the mixed 16px/8px version).
- Water: the island's water is a lighter oval (`sea`, then a `deep` ring); past it, through one in-between shade (`DUSK`, the average of the two), is `PAL.abyss` (home #1d4a7c, Frost #123866; Paul asked twice for it darker), so the open sea reads as out of reach (Paul, 2026-11-11). The abyss also fills a dithered band along the canvas edge, and `seaCss()` uses it, so the page continues it with no visible frame. No ripples on the abyss.
- The dock lantern (`paintLantern`) has a peaked iron cap, amber glass and an iron post. Paul asked what the old pale square was.
- The focus clock has no window: white Press Start 2P on the sea with a hard 1px outline in #0c1830 on all eight sides plus a 1px drop (no blur), so it reads by day and night (Paul, 2026-11-11).
- Menus use sub-tabs (`SUBS` in hud.ts) so no view needs a long scroll: Pokémon (Party, Helpers, Box as a portrait grid, Eggs, Bag grid), Town Map (Island, Habitats, Decor as small cards, Shop with one-line rows), More (Focus, Settings, Credits). Cheats show one tab per group. Each menu remembers its last sub-tab.
- `src/habitats.ts`: stage 2. The fixed habitat spots (`HABITAT_SPOTS`), the pond and rocks art, and the food dish. The spawn rules live in `game.ts`: `HABITATS`, `FOODS`, `DECOR_LOVES`, `WEATHER_TYPES`, `lure()` and `pickVisitor` (gates first, then multipliers), plus `lureNotes` for the Pokédex. The roster's lure data (`needs`, `time`) is in `scripts/roster.mjs`.
- `src/catch.ts`: the throw on the canvas (stage 1): the breathing ring coloured by the odds, the ball's arc, entering, wobbles, stars or a break-free. `main.ts` owns the flow (`openCatch`, `throwNow`, `finishCatch`, `spawnWild`, `digUp`, `partyLife`); the rules are in `game.ts` (`passerBy`, `dig`, `collectFind`, `buyBall`, `catchChance`, `throwBall`, weather).
- `src/decor.ts`: the decoration catalog, the six fixed `SLOTS`, and pixel-art painters, with a glow or live animation per item.
- `supabase/island.sql`: additive island_* tables and functions on Studdy's project. It was tested on Postgres 16 with stubbed auth (see VALIDATION.md).
- `src-tauri/`: the desktop pet.
  - The window is transparent, frameless and always on top, and starts in the bottom-right corner.
  - `idle_seconds` comes from the user-idle crate.
  - The web app switches to float mode when it sees `__TAURI_INTERNALS__`.
- `src/hud.ts`: the in-window UI, laid out in island pixels and scaled with the canvas.
  - It has the focus widget, the party chips, the PMD-style dialog queue (portrait plus text), toasts, the Pokémon/Settings/Credits sheet, and the starter picker.
- `src/main.ts`: orchestration.
  - It syncs the party to the island, runs the visitor and evolution sequences on sim time, wires game events to the HUD, and handles the PiP pop-out.
  - It runs the Web Lock clock ownership and the debug panel.
  - Dev handle: `window.__island` (`game`, `hud`, `scene`, `step(sec)`, `setHour`, `shot(name)`, `runVisit`).

## Rules
- The page is the game: no header, no cards, no page sprites. The canvas fills the viewport at a whole-number scale (5x on a 1440x900 screen) over a page coloured like the open sea; `main.ts` samples the canvas corner every second so the page follows the day/night tint. Credits and Pop out live in the More menu (Paul, 2026-11-11: "ditch the white UI stuff", "the whole thing should feel way more RPG").
- The UI inside the window is FireRed/LeafGreen GBA style (Paul picked it after seeing PokéDesk, manolloz.itch.io/pokedesk): white windows with a two-tone blue border drawn in CSS (never ripped frames), gold primary buttons, a square navy tab strip of real PokéAPI item icons in `public/items` (the Pokédex icon is a hand-drawn SVG in hud.ts). Font: Press Start 2P (OFL), chosen because Pixelify's numbers were confusing; it sits on an 8px grid, so all HUD text is 8px (16px for the clock).
- The HUD has its own whole-number scale, separate from the island's (`Hud.fit`): 2 at most desktop sizes, 3 above 1680px, 1.5 or less in small windows (adds `.narrow`). So a bigger island does not make bigger menus. The menu window opens above the strip (about 300x320 HUD px) and never covers the whole island.
- Copy is as short as it can be: no explainer paragraphs, no rules section, one line per message.
- Ambient motion stays calm: feathered light, slow drift, no flashes.
- Snappy springs are only for direct presses.
- Copy is plain full sentences. No emoji.
- Outlines are never flat black. Use the darkest tone of the object's own colour.
- **Sprite licence:** PMD Collab sprites are CC BY-NC 4.0.
  - Keep `CREDITS.md` and the in-app credits generated from the manifest.
  - No ads, donations or paid features.
  - Chunsoft-credited sprites are official PMD art.
- Don't touch the speed quiz (`../speed-quiz`, port 5540).

## Gotchas
- The embedded Claude browser pane exposes `documentPictureInPicture` but refuses `requestWindow` ("no window"). Test PiP in real Chrome.
- Inspect pixel art with `__island.shot('name')` in dev. It POSTs the 240×180 canvas to `shots/name.png` (gitignored); upscale it with nearest-neighbour.
- Script beats use sim-time timers (`after()`), never `setTimeout`, so `step()` and hidden tabs stay in sync. Dialog auto-dismiss is the one exception: it uses real time.
- `syncParty()` is async because sprites load lazily, so a creature appears a tick after the save changes.
- Screenshots of the Claude pane can be stale. Confirm UI state from the DOM.
- Editing a module during dev triggers a full reload, which resets `setHour` overrides. The save persists.
- Float mode tints at night by multiplying, then cutting the result back to a copy of the scene's alpha. A plain multiply would paint the transparent desktop.
- Visitor odds are tuned so the copy stays true. Measured over 20,000 draws, rare is about 4% normally and 2.5 times that after a 50-minute session (weight `RARE_50` = 3.3). Re-measure after changing the roster.
- Keep big final forms off the roster unless they fit. Gyarados has a 72×128 frame, so Magikarp was swapped for Hoppip.
