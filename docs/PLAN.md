# Plan and decisions

## Decisions of record

- **D1 (2026-11-11, Paul):** approved the plan with the recommended picks:
  - Form factor: a web app that pops out into a Document Picture-in-Picture window, with Tauri as a later tier.
  - Backend: reuse Studdy's Supabase accounts and friends.
  - Roster: Gens 1–4 only.
  - Visitors can always be befriended.
  - Party size: 3.
- **D2 (2026-11-11):** T0 is a motion study of the island before any screens.
  - Logical canvas: 240×180, drawn at an integer scale.
  - The island is hand-authored pixel art painted in code.
  - Sprites come from PMD Collab, pinned to one commit.
- **D3 (2026-11-11):** Paul said "Yes, start T1". T1 was built as planned with these choices of mine (Paul can override):
  - Roster: 12 lines and 35 species. Starters are Bulbasaur, Charmander and Squirtle; the two you don't pick can visit rarely.
  - Common visitors: Pidgey, Caterpie, Oddish, Psyduck, Wooper, Hoppip, Starly.
  - Uncommon: Mareep, Shinx, Pikachu. Rare: Eevee.
  - Hoppip replaced Magikarp because Gyarados's 72×128 sprite dwarfs the island.
  - Only level-up evolutions are followed until T3.
- **D4 (2026-11-11):** a Web Lock makes one window the clock owner, so the page and a plain pop-out can't double-count time.
- **Still open:** the name ("island" is a working title) and a screenshot of the Reddit reference.

---

# Pokémon study island: plan for Paul's approval

Status: plan only (2026-11-11). Nothing is built, committed, pushed or deployed.
Working name: "island" (Paul names it). Proposed folder `assets/island/`, its own
git repo, port 5600 (free), launch.json entry `island`. Doesn't touch the speed
quiz (port 5540).

## What I looked at

- **Reddit reference:** blocked. Reddit refuses both the browser pane and
  WebFetch, and a web search didn't turn up the post. The art direction below
  is my reading of the title ("a tiny Pokémon island that lives on the
  desktop"). A screenshot from Paul would settle it.
- **SpriteCollab** (github.com/PMDCollab/SpriteCollab, updated 2026-11-10):
  - Layout: `sprite/<dex4>/` holds `AnimData.xml` and three PNGs per action
    (`<Action>-Anim.png`, `-Shadow.png`, `-Offsets.png`).
  - Each sheet has 8 rows, one per facing direction, with one column per frame.
  - The XML gives each animation's frame size and per-frame durations in
    1/60 s ticks. Pikachu's Walk, for example, is 32×40 px frames with ticks
    8, 10, 8, 10.
  - Alternate forms sit in subfolders (`0000`, `0006`…). Portraits are 40×40
    emotion tiles under `portrait/<dex4>/`.
  - There are 35+ actions, including Idle, Walk, Sleep, Eat, Hop, Nod, Pose,
    LookUp, Laying and Wake. That's plenty to make Pokémon feel alive on the
    island without any battle animation.
- **Coverage** (counted from `tracker.json`; Idle + Walk + Sleep + a portrait):
  - Gens 1–4: 493 of 493. Every one of these is a Chunsoft original from the
    PMD games.
  - Gen 5: 142 of 156. Gen 6: 70 of 72. Gen 7: 83 of 88. Gen 8: 87 of 96.
    Gen 9: 95 of 120. These later sprites are community-made and their
    quality varies.
- **Licence:**
  - Community submissions are **CC BY-NC 4.0**: non-commercial, with
    appropriate credit.
  - Each species' `credits.txt` is tab-separated: date, author id, status,
    and the actions that author made. `credit_names.txt` maps author ids to
    names and contact links.
  - Chunsoft-primary sprites are ripped from the official games, so they carry
    the Nintendo / Creatures / GAME FREAK / Spike Chunsoft copyright as well.
  - Obligations: a credits screen naming each sprite's author per species,
    linking SpriteCollab and the licence. No ads, donations or paid features.
    A fan-project disclaimer.
- **Studdy** (economy and trust):
  - Backend: Supabase. Anonymous sign-in upgrades to a magic link, behind a
    Turnstile captcha. Row-level security on every table. Realtime presence
    channels need no tables. `profiles`, `friends` and `blocks` tables come
    from phase3.sql.
  - Server-witnessed focus (phase5.sql): `session_begin`, `session_beat` and
    `session_end` are security-definer functions.
    - A beat is worth the real wall-clock gap since the last one, capped at
      90 s. Beats less than 20 s apart earn nothing.
    - Caps are 6 h per session and 16 h per rolling day.
    - XP is written only by the server, so devtools can't mint it.
  - ECONOMY.md: one focused minute is the anchor unit. Purchases are
    expression only and never affect earning or ranking. The level curve is
    `100 + 50(n−1)`.
  - Studdy has no idle detection. Being seated during a sprint counts as
    focus, on the honor system.
- **Reusable pipelines:**
  - PokéMAPs `pipeline/pull-pokeapi.mjs` already caches responses, throttles
    to 1 request per second, and sends a fan-project user agent. Copy that
    pattern for the SpriteCollab and PokéAPI pulls: evolution chains, levels,
    types, names.
  - Pocket Tactics is Gen ≤5 because its animated sprites come from PokéAPI.
    We won't need that limit here.

## 1. Form factor

The game is one web app (Vite + TS, 2D canvas at integer pixel scale) that can
run inside either shell.

**A. Document Picture-in-Picture (recommended for the first slice).**
- A normal page on GitHub Pages has a "Pop out" button. It opens an
  always-on-top floating window that the user can drag and resize, and the
  island lives in it.
- It's shareable as a link, like every other portfolio piece, and needs no
  install.
- Limits:
  - Chrome and Edge desktop only. Safari and Firefox fall back to a small
    `window.open` pop-out that is not always on top.
  - The PiP window keeps a title bar and an opaque background, so the island
    sits in a little sea rather than floating on the desktop.
  - The opener tab has to stay open, though it can be in the background.
- Needs a one-hour spike to confirm that animation and timers keep running in
  the PiP window while the opener tab is hidden. EXP is computed from
  wall-clock timestamps, so throttling can never change what anyone earns.

**B. Tauri v2 desktop app (the real alternative, or a later tier).**
- Wraps the same web build in a transparent, frameless, always-on-top window
  of about 10 MB. This is the true desktop-pet look: the island floats over
  your desktop with nothing around it.
- Adds a tray icon and launch at login. It can read system idle time natively
  without a permission prompt.
- Costs:
  - It needs the Rust toolchain.
  - An unsigned macOS app has to be opened with right-click → Open.
  - Portfolio visitors would download an app instead of clicking a link.
- Electron does the same at roughly 100 MB, and nothing here needs it.
- A PWA is ruled out because an installed PWA window can't stay on top.

## 2. Detecting "working" honestly

- **You start a focus block yourself.** The lengths are 25 min, 50 min or open.
  EXP only flows inside a block. This matches Studdy's sprint.
- **Away check:**
  - Chrome's Idle Detection API is optional and asks permission once. It only
    reports "user active or idle" and "screen locked or unlocked", system-wide
    and with no content.
  - After about 10 minutes with no keyboard or mouse input, or right away when
    the screen locks, the party lies down and falls asleep (the Sleep anim)
    and the clock pauses.
  - Reading produces no input, so a calm line asks "Still studying?" instead
    of penalizing you. If you tap it within 2 minutes, those minutes count
    (honor system, like Studdy). If you ignore it, the block pauses from the
    moment you went idle.
- **Gap rule:** any wall-clock gap (laptop asleep, window closed, tab killed)
  is never credited. Without the idle permission, a gentle check-in appears
  every 20 minutes instead.
- **Never:** no screenshots, no app or URL tracking, no keystroke counting, no
  camera or microphone.
- **Server-witnessed in tier 2:** this copies Studdy's beat pattern and caps,
  so the teams friends see are honest.

## 3. Encounter and EXP loop

- **EXP:** every party Pokémon gets 1 EXP per verified focused minute, each at
  the full rate. Going from level L to L+1 costs L EXP.
  - A starter at Lv 5 reaches 16 after about 2 hours of focus.
  - It reaches 32 after about 6 more hours, and 36 after about 2 more.
  - Total: about 10 focused hours to a final stage, close to Studdy's pace of
    level 21 in about 19 hours.
- **Encounters:**
  - Every completed block ends with one visitor. A wild Pokémon walks out of
    the tall grass, and you can befriend it or wave goodbye.
  - Befriending always works. A focus tool shouldn't make you lose things.
  - The island has a box with no cap. The party is 3 in the slice, since it's
    a small window. Swapping the party is free at any time outside a block.
  - Rarity is weighted toward the first stage of each line. Rare visitors
    become more likely after a 3-day streak and as daily focused time grows.
    Rarity never depends on anything you can buy, because nothing is for sale.
- **Evolution:**
  - Real evolution levels come from PokéAPI.
  - Evolution only happens inside a focus block. It plays as a calm moment: a
    feathered glow rises over 0.5 s, the sprite swaps, and it settles over 2 s.
  - You can hold B to cancel, and the Pokémon remembers your choice.
- **Non-level methods (tier 3):**
  - Friendship becomes 10 focused hours together in the party.
  - Day/night follows your real clock, so Eevee becomes Espeon or Umbreon
    depending on when it evolves.
  - Evolution stones wash ashore on streak milestones.
  - Trade evolutions happen when the Pokémon visits a friend's island. In
    solo play they fall back to a fixed level.
- **Kin to Studdy:** focused minutes are the only unit, and nothing earned or
  bought speeds up EXP. Island decorations come later, paid in "shells" earned
  per minute, and they are expression only. There's no leaderboard.

## 4. Island art direction

The island itself is the metaphor object. It's a small round islet of grass
and sand: one tree, one patch of tall grass where visitors come from, a
shoreline and a short dock.

- **Pixel density:** hand-authored pixel art at PMD's density, so the sprites
  and the land read as one world. Sprites are 24–40 px tall. The island is
  about 160×120 logical px, drawn at an integer scale of 2× or 3×.
- **Palette:** a warm daylight palette that drifts slowly to dusk and night
  with your real local time.
- **Ambient motion stays calm:** slow water shimmer, feathered light, and no
  flashes.
- **Life comes from the PMD actions.** Party Pokémon wander using Walk in 8
  directions, use Idle, Eat at the berry bush, Laying in the sun, and Sleep
  when you're away. On a level-up they Hop.
- **Framing follows the shell.** In the PiP window the sea fills the window
  edge to edge and the island sits in it. In Tauri the island floats on a
  transparent background with a soft contact shadow.
- **UI:**
  - Interface: almost none. A tiny pixel focus clock, a party strip and one
    sheet for the box.
  - Copy: plain full sentences ("Bulbasaur grew to level 12.").
  - Feel: Watermelon-grade press physics, PMD portraits in the dialogue, and
    pixel chrome that feels like a cousin of Studdy's.
- **Step zero, before any screens:** a few-second canvas motion study of the
  island idling, with a sleeping party and one visitor arriving, for Paul to
  react to.

## 5. Does friends/teams need a backend?

Yes, as soon as you can see other people's teams, because the teams have to be
honest. Studdy already has everything this needs.

- **Option 1 (recommended): reuse Studdy's Supabase project** with
  `island_`-prefixed tables and functions.
  - "Sign in with your Studdy account" means your Studdy friends are already
    on your island friends list.
  - Tables: `island_parties` (read-only showcase), `island_sessions` (a copy
    of the beat pattern and caps), and a Realtime channel for "studying now".
  - Risk: it touches a live project, so every change goes through new SQL
    files Paul runs, with additive tables only.
- **Option 2: a separate free Supabase project.** It's cleaner isolation, but
  friends start from zero and it uses a second free-tier project slot.
- The slice is local-first (localStorage) either way, and the backend comes
  in tier 2.
- **Cost:** no LLM anywhere, so zero tokens. GitHub Pages and the Supabase
  free tier come to $0 a month.

## 6. First playable slice (tier 1)

- **Sprite pipeline:**
  - Pulls about 30 species (around 10 evolution lines from Gens 1–4).
  - Takes the Idle, Walk, Sleep, Eat, Hop and Laying sheets, plus Normal and
    Happy portraits.
  - Pinned to a SpriteCollab commit, cached and throttled.
  - Generates `CREDITS.md` and the in-app credits screen automatically from
    `credits.txt`.
- **Starter:** choose one of three.
- **Focus block:** 25 min, 50 min or open, with the idle and away rules from
  section 2.
- **EXP and evolution:** EXP ticks for the party of 3, level-ups play the Hop
  anim, and level-based evolution plays the calm evolution moment.
- **Encounters:** a visitor at the end of each block, befriend or let go, and
  a box.
- **Island:** day and night.
- **Shells:** Document PiP pop-out, with a plain pop-out fallback.
- **Saving and tools:** local save, a `?debug` panel (time warp, grant
  minutes, force a visitor, force an evolution), a `window.__island` dev
  handle, and VALIDATION.md.
- **Not in the slice:**
  - Accounts, friends and server-witnessed EXP.
  - Non-level evolutions, shinies and decorations.
  - Tauri.
  - Watch mode and the film.

**Build order:**
- T0: island motion study.
- T1: the slice.
- T2: Supabase friends and verified sessions.
- T3: Tauri desktop pet, non-level evolutions and decorations.
- T4: watch mode, try mode and the film.

## Decisions for Paul

1. Form factor: PiP-first web app, with Tauri later (my recommendation), or
   Tauri from the start.
2. Backend: share Studdy's accounts and friends (my recommendation), or a
   separate project.
3. Roster: Gens 1–4 only (my recommendation, because coverage is complete and
   the art is consistent), or all generations with gaps.
4. Visitors: always befriendable (my recommendation), or a light catch chance.
5. Party size: 3 (my recommendation) or 6.
6. A name.
7. A screenshot of the Reddit post, if he has one.
