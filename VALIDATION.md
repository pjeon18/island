# Validation

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
