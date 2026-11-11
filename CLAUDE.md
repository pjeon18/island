# CLAUDE.md: Island (working title)

This is a Pokémon collecting and leveling idle game. It lives in a small always-on-top window while you study. Party Pokémon gain EXP and evolve only during focus time you start yourself. It is kin to Studdy (`../studdy`): focused minutes are the only unit, and nothing can be bought that speeds anything up.

Read `docs/PLAN.md` first. It holds the approved plan and the decision log. Paul makes every final call: give options with a recommendation, then wait.

## State
- **T0, the motion study, is built** (2026-11-11).
  - The island idles with Bulbasaur, Charmander and Squirtle.
  - A visitor comes out of the tall grass. The party falls asleep when you step away.
  - Day and night follow the clock.
  - It has a Picture-in-Picture pop-out with a plain pop-out fallback.
- **T1, the playable slice, is built** (2026-11-11) on the approved T0 look ("looks brilliant").
  - It covers the starter pick, focus sessions, EXP and levels, real-level evolution, visitors and befriending, the box, step-away detection, the `?debug` panel, and the in-window HUD.
  - See VALIDATION.md for what was checked and what still needs real Chrome.
- **Next: T2**, Supabase accounts and friends with server-witnessed sessions (Studdy's project). It waits for Paul's go-ahead.
- The repo is not deployed.

## Run
- `npm install`, then `npm run dev`. It serves on port 5600, under the launch.json entry `island`.
- `npm run sprites` pulls the evolution data from PokéAPI, then the sprites from SpriteCollab. Both are cached, pinned and throttled, so a re-run is a no-op.
  - The roster lives in `scripts/roster.mjs` (Gens 1–4, level-up evolutions only in T1).
- `?popout` shows the window-only view.
- `?debug` adds demo controls below the window: add focused minutes, finish the session, a visitor, the lead ready to evolve, an ask or idle prompt, screen lock, activity, a sleep gap, the hour, and reset.

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
- `src/hud.ts`: the in-window UI, laid out in island pixels and scaled with the canvas.
  - It has the focus widget, the party chips, the PMD-style dialog queue (portrait plus text), toasts, the Pokémon/Settings/Credits sheet, and the starter picker.
- `src/main.ts`: orchestration.
  - It syncs the party to the island, runs the visitor and evolution sequences on sim time, wires game events to the HUD, and handles the PiP pop-out.
  - It runs the Web Lock clock ownership and the debug panel.
  - Dev handle: `window.__island` (`game`, `hud`, `scene`, `step(sec)`, `setHour`, `shot(name)`, `runVisit`).

## Rules
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
- Keep big final forms off the roster unless they fit. Gyarados has a 72×128 frame, so Magikarp was swapped for Hoppip.
