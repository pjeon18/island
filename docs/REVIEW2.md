# Island: second review (2026-11-11)

These are notes to go through together. Nothing in this document has been built.

The review came from four parallel passes:

- **Balance:** a new 60-day simulation driving the real `game.ts`, run for a light, a mid and a heavy player, plus a model of the dungeon fights.
- **Loop and content:** the gameplay loop over time, and where to add content.
- **Dungeons and co-op:** read as both a player and an engineer.
- **Interface and quality of life:** a hands-on pass in the browser, including the small window.

I checked the most serious claims against the code myself and marked them confirmed. Each item has an ID so we can talk about it by name. Effort is S (an hour or two), M (a session) or L (several sessions).

The three simulated players:

- **Light:** two 25-minute sessions a day, and a dungeon run every other day.
- **Mid:** 25, 25, 25 and 50 minutes a day, and one run a day.
- **Heavy:** four 50-minute and two 25-minute sessions a day, and two runs a day.

## 1. Where the game stands

The first ten days are good. The opening, Wooper's tour, the first catches, planning lures and the first evolutions all land.

From around week 2 the same pattern from the first review comes back, only later:

- **Mid player:** has bought everything in the shop by day 15, fills both Pokédexes by about day 45, and reaches Lv100 with the partner by day 60.
- **Heavy player:** does all of that in half the time.
- **Light player** has the opposite problem. They never meet a rare Pokémon or another starter, because those only come in 50-minute sessions, and their Pokédexes stop at 50 of 58 and 24 of 31.
- **Guardians:** both now fall too early again. The new EXP curve makes early levels twice as fast, which undid the guardian buffs. A party arrives at Frost Isle about 8 levels above every Pokémon in Glacier Grotto.
- **Dungeon chests** now pour out Ultra Balls and Star Pieces. That undoes the ball prices and the flee rule, and Star Pieces have nothing to buy from about day 13.

The loop is rich for about ten days, fine to about week four, and empty after that. What's missing is mostly long goals, not mechanics.

The dungeon and co-op review found real bugs, including an exploit that hands out free loot, and some co-op failures that end a run for everyone. Those should come first.

### If we only do ten things

1. Fix the confirmed bugs in section 2.
2. Re-tune the guardians and dungeon loot (B3 to B6).
3. Warn before starting a session sends waiting Pokémon away (U1).
4. Put Box and Pokédex details where you can see them (U2).
5. Fix the stray Space and Enter presses, and the duplicate confirms (U3).
6. Make the small window's catch screen usable (U4, U5).
7. Make dungeon fights worth having and give bosses time to show their moves (D-F1, D-F3).
8. Fix the co-op lobby, pausing and the revive experience (C1 to C4).
9. Build a long-term spine: the island restoration story (L1).
10. Add a third island that feels new (L2).

## 2. Confirmed bugs

All fixed on 2026-11-12 (Paul: "Fix them all"). VALIDATION.md has what was checked.

### Game

- **G1. Finds never give a stone (confirmed).**
  - `dig()` in game.ts checks for an egg first, at `r > 0.97`. That covers both the Star Piece band (0.97 to 0.98) and the stone band (0.98 to 1).
  - So stones from finds never happen, and Star Pieces come up 3% of the time instead of 4%.
  - Fix: roll the egg in its own band (for example `r < 0.03`), then use the normal table. S.
- **G2. Your partner can be gifted away (confirmed).**
  - `canGiveMon` never checks `isPartner`, and the gift picker lists the partner.
  - `giveAway` then removes it from your Pokémon, which leaves `save.partner` pointing at nothing.
  - Fix: block the partner from gifts. S.
- **G3. A visible window can lose the focus clock.** With the island open in two tabs, the hidden one can keep the clock while the browser throttles it. The visible tab's clock then barely moves. Fix: take the clock whenever a window becomes visible or focused. S.
- **G4. A catch shows up in the party list before the ball stops wobbling.** `throwBall` adds the Pokémon straight away. Fix: hold the party chips still while a catch is playing. S.

### Dungeons and co-op

- **D1. Chest farming by leaving and continuing (confirmed).**
  - Chest loot goes into your island save straight away, but a run is only saved at the stairs.
  - "Leave the dungeon" followed by "Continue" rebuilds the same floor with every chest closed again.
  - On the boss floor this re-spawns the boss and its big chest, as often as you like on one Lantern charge. It also refunds berries used mid-floor and restores full health.
  - Fix: save the opened chests and the item counts in the run, and save the run whenever they change. S.
- **D2. Telegraphed attacks land where the boss is, not where the warning was drawn (confirmed).**
  - The landing reads the boss's live position, and the boss keeps walking toward you during the warning. You can step outside the drawn ring and still get hit.
  - The Body Slam has the same fault: it covers only about two-thirds of its lane, and it teleports instead of charging.
  - Fix: fix the spot when the warning starts, have the boss stand still while it winds up, and play the charge as a real dash. S.
- **D3. In a 3 or 4 player room, a guest's run ends when any other player leaves (confirmed).**
  - Every player connects to every other, and the guest treats any departure as the host leaving. It even fires in the lobby.
  - Fix: remember who the host is and only react to them. S.
- **D4. Pausing breaks co-op.**
  - If the host pauses, snapshots stop and the guests give up after 10 seconds.
  - If a guest pauses, the host drops them for good, and they become a ghost who moves only on their own screen.
  - Fix: in co-op, Esc opens a menu that doesn't stop the game, and both sides keep sending their heartbeat. S.
- **D5. The host can take control of a guest's Pokémon.**
  - When the host's lead faints, or the host presses Tab, control can land on a guest's Pokémon. After that two players are steering it.
  - Fix: limit both to your own Pokémon, and follow a friend's camera if you have none left. S.
- **D6. Only the host's lead opens chests, breaks pots and sets off alarms, and chests use only the host's charge.**
  - A guest with a charge gets nothing if the host has none.
  - Fix: let any lead open them, and let each player roll loot on their own charge. S.
- **D7. Co-op enemy health scales by players, not Pokémon.** Three players bring 3 Pokémon, the same as playing solo, but enemies get double health. That makes 3 to 4 players strictly harder than solo. See B7. S.
- **D8. Lantern charges are spent without asking.**
  - A guest's charge is spent automatically when they join. That goes against "help a friend without a charge".
  - Solo Enter always spends one.
  - "Start over" throws away a charged saved run and the berries you brought.
  - Fix: a "Light a charge" choice on the intro and on the join screen, and "Start over" keeps the charge. S.
- **D9. The editor's play-test deletes your real saved run** (`clearRun` only checks the mode). S.
- **D10. The dungeon can overwrite your island save with an old copy.** It loads the save once, at the start. If the island is still open in the small window, anything saved there since then is lost when the dungeon saves. Fix: reload the save before every change, and listen for changes from other windows. S.
- **D11. Pathfinding only leads toward the host's Pokémon.**
  - A guest's second Pokémon walks into walls.
  - Enemies only path around walls when they are near the host.
  - A follower that is stuck or far behind is never brought back.
  - Fix: build the path map from every lead, move stuck followers next to their lead, and check that start positions are open ground. S to M.
- **D12. A late join mid-start reopens the lobby over a running game.** A second Enter then spends another charge. Fix: set a "starting" flag at Enter. S.
- **D13. A hidden host runs the dungeon at a quarter of normal speed.** Fix: catch up in larger fixed steps. S.
- **D14. Smaller ones:**
  - "It's super effective!" overwrites important messages, such as boss phases and stairs.
  - A floor that fails to load leaves the run frozen.
  - A guest who joins a full room or an older build waits forever. It needs "room full" and version checks; different builds would quietly build different floors.
  - The special catch is lost if you close the tab before pressing Continue.
  - The special catch's odds never go above about 50% with an Ultra Ball, because throw quality is fixed. The plan said 65%.
  - The move 1 label shows the first type, but the attack uses the best type.

### Interface

- **U-bugs:**
  - Two "End now?" confirms can queue up.
  - The open-row arrow sits on the window border.
  - The Pokémon sub-tab bar wraps "Bag" onto a second line at 1280 px.
  - The whole open menu re-renders every focused minute, which resets keyboard focus and hover.
  - The preset Journal shows "1m Focused".
  - A dungeon room code of the wrong length returns to the menu without saying why.

## 3. Balance

On 2026-11-12 Paul chose B1, B2, B3, B4, B5, B7, B8, B9, B10 and B11, and they are built. B12 stays as it is. B6 waits for the restoration projects (L1). Two changes from the text below: a berry gives a quarter of the next level's cost, because 1% would always have been the 20 EXP minimum; and with three or four players everyone brings two Pokémon.

### Pacing now

At 2 EXP a minute:

| Level | 16 | 20 | 25 | 30 | 36 | 48 | 60 | 70 | 100 |
|---|---|---|---|---|---|---|---|---|---|
| Hours | 1.4 | 2.4 | 4.1 | 6.5 | 10.2 | 21.3 | 38 | 57 | 151 |

| | Light | Mid | Heavy |
|---|---|---|---|
| Partner Lv36 | day 12 | day 5 | day 3 |
| Snorlax beaten (modeled) | day 3 | day 2 | day 1 |
| Frost Isle opens | day 26 | day 11 | day 5 |
| Lapras beaten (modeled) | day 27 | day 12 | day 6 |
| Home Pokédex at day 60 | 50 of 58 | 58 | 58 by day 30 |
| Frost Pokédex at day 60 | 24 of 31 | 31 | 31 by day 30 |
| Shop fully bought | day 42 | day 15 | day 7 |

**Economy for the mid player over 60 days:**

- **Shells:** focus is only 35% of income. Helpers make up most of the rest: expeditions pay 40 plus the helper's level, and the dig job pays about as much as focus does. The bank reaches about 16,000 by day 60.
- **Star Pieces:** 131 earned against 39 to spend. Dungeon chests give 52 of them.
- **Balls:** chests gave 169 Ultra Balls and only 8 were thrown.
- **Stones:** there are now enough (19 earned against 10 needed), even before G1 is fixed.
- **Day Care:** it made 189 eggs, so the box fills with 250 or more Pokémon.

### Proposed changes

- **B1. Glacier Grotto Pokémon to Lv50–54 and Lapras to Lv58** (now 41–44 and 48). Lapras then falls around Lv55, about 30 focused hours in, a few days after you arrive. Modeled.
- **B2. Pier Hollow Pokémon to Lv27–30 and Snorlax to Lv36** (now 22–25 and 30). The first clear moves to about 6 to 7 hours. Modeled.
- **B3. Big chests give a Great Ball; only the boss chest gives an Ultra Ball, half the time.** This makes the ball prices, the flee rule and the special-catch odds matter again.
- **B4. Chest Star Pieces: small chests from 5% to 2%, miniboss chests from 25% to 10%; the boss chest stays at 25%.** Per run that's about 0.35 Star Pieces instead of 0.93.
- **B5. Helper shells:**
  - Long expeditions pay 40 plus a quarter of the level.
  - The dig job's shortest interval goes from 10 to 16 minutes.
  - The campfire's goes from 6 to 10 minutes.

  This brings focus back to about 45% of income.
- **B6. A repeating late-game place to spend: the restoration projects in L1,** about 5,000 shells and 15 Star Pieces over several stages.
- **B7. Co-op scales by Pokémon, not players.**
  - Health scales with the number of Pokémon divided by 3, never below 1×. The boss gets 15% on top.
  - With 3 players, bring 2 Pokémon each instead of 1, because one each is lonely and a faint means waiting.
- **B8. Rare Pokémon in 25-minute sessions after a 3-day streak, at a quarter of the 50-minute odds.** This keeps light players from being locked out. Or keep the rule and say it earlier.
- **B9. Day Care lays an egg every 90 focused minutes instead of 45.** Most eggs are repeats.
- **B10. Dungeon healing:**
  - Pot Oran Berries from 45% to 30%.
  - Stairs heal half, as first planned, instead of everything.
  - The boss floor gets a few pots.

  Bringing your two island berries then becomes a real choice.
- **B11. Berries scale with level** (for example 1% of the next level's cost, with a minimum of 20), so feeding stays worthwhile after Lv30.
- **B12. Lantern charges never limit anyone** (the mid player earns about 3.8 a day). Leave them, or make it one charge per 50 focused minutes so loot follows focus more closely. Your call.

## 4. The loop over time

- **Day 1:** good.
- **Day 3:** lure planning is the best part. Berries stop mattering once a level costs more than three of them (see B11).
- **Week 2:**
  - Frost Isle opens, but 10 of its 31 Pokédex entries are already on Home Island.
  - It has the same shape with different colours.
  - Its wild Pokémon are the same low levels.
  - Home's residents stop earning while you're away, and nothing marks your return.
- **Week 4:** Frost's evolutions are done and Lapras is beaten. There's nothing to sail toward.
- **Month 2:**
  - The deep catches are the only long goal.
  - Dungeons have fixed levels, so they become trivial.
  - Shells and Star Pieces pile up.
- **Month 3:** the partner is near Lv100, and bond has no use after 10 hours.

**Gaps found in the code:**

- **The Campfire job can hardly ever be staffed.** The only fire types that pass by are Charmander (a rare starter, only in 50-minute sessions) and a Flareon from a stone.
- **Dead ends:**
  - Haunter and Graveler, because trade evolutions are skipped.
  - Snorunt has no Froslass.
  - Sneasel has no Weavile.
- **Lure holes:**
  - No food draws ice types.
  - Nine species have no decoration that draws them: Caterpie, Mareep, Shinx, Poliwag, Zubat, Swinub, Seel, Shellder and Piplup.
  - On Frost, snow draws almost everyone, so weather barely matters.
- **Growth and story:**
  - Island growth stops at 10 hours, and only Home shows its growth steps.
  - Wooper's story ("they all drifted away") is set up and never paid off.
- **Studying together** pays in shells, the currency there's already too much of.
- **Never built:**
  - Expedition destinations, the first review's promise that "stronger Pokémon go further".
  - The first review's section 4 items that are still open: Pokédex tabs per island, "Loved by" outside tooltips, the Garden job, the streak shown at each break, and the Frost cave.

## 5. Content to add (ranked by impact)

- **L1. The restoration story, as the long-term spine (M to L).**
  - **What it is:** the island has ruined landmarks: a lighthouse, a Pokémon Center hut and a sunken pier.
  - **How they're restored:** each one is restored by a goal of focused hours plus species brought back (for example "40 hours and 30 species"), with a shell and Star Piece part. They can't simply be bought.
  - **What each one opens:**
    - The hut gives the Day Care a third slot.
    - The lighthouse lets the Lookout work at night and adds a waiting spot.
    - The pier opens the sail to the third island.
  - **The story:** Wooper says two or three lines at each milestone, and the guardians become the reason the Pokémon left.
  - **Why it fits:** it gives weeks 2 to 8 a goal you can see, and it absorbs the extra currency (B6).
- **L2. A third island, and real differences between islands (L).**
  - **The island:** a warm volcanic one, Ember Cove, with fire types. Candidates:
    - Vulpix
    - Ponyta
    - Slugma
    - Numel
    - Houndour
    - Magby
    - Torkoal
    - Phanpy
    - Cubone
    - Growlithe, if its sprite fits
  - **What it fixes:** the Campfire job finally gets workers.
  - **What every island should get:**
    - its own outline;
    - a habitat of its own (hot spring, ice floe);
    - a job only it has (an Ember forge that turns stones into a stone you choose; a Frost ice house that stores berries);
    - an ambient creature you can't catch;
    - its own weather table;
    - wild levels that rise from island to island.
  - **Its dungeon:** a new gate dungeon with its own guardian.
- **L3. Trading, with trade evolutions (M).**
  - **What:** trades between friends finish Gengar, Golem and others.
  - **Solo players:** a sailor at the pier offers one fixed trade a week, so they can finish too.
  - **What it needs:** an RPC you'd run.
- **L4. Bond tiers past 10 hours (S to M).**
  - **25 h:** the Pokémon sits by the clock in the small window.
  - **50 h:** in dungeons it survives one knockout a floor.
  - **100 h:** a ribbon and a scene by the tree.
- **L5. Pokédex milestones and shinies (M).**
  - **Milestones:** each island's Pokédex pays out at 25%, 50%, 75% and 100%: a decoration slot, a unique decoration and an egg.
  - **Completion:** finishing it brings a Togepi egg from Wooper.
  - **Shinies:** about 1 in 150 passers-by in clean 50-minute sessions, with a mark in the Pokédex.
- **L6. Day Care babies (M).**
  - **What:** some pairs lay babies that never pass by: Pichu, Smoochum, Magby, Cleffa and Azurill.
  - **Same-type pairs** warm their eggs 25% faster.
- **L7. Weekly tides and seasons (M).**
  - **Tides:** a featured type each week, doubled, plus one rare in rotation.
  - **Seasons** follow the real calendar:
    - spring Hoppip;
    - a summer light show of Volbeat and Illumise;
    - an autumn palette;
    - December snow on Home.
  - **Meteor shower week:** it brings Clefairy. The Moon Stone icon is already there and unused.
- **L8. Expedition destinations by level (S to M).**
  - **Destinations:** Kelp Bed (Lv15), Old Ruins (Lv30), Ice Shelf (Lv40).
  - **What each brings:** its own loot and a rare egg (Corsola, Remoraid).
  - **Postcards** go in the Journal.
- **L9. Fill the lure and job gaps (S each).**
  - **Foods:** Aspear Berry (ice), Rawst Berry (bug, steel) and Persim Berry (fighting, dragon).
  - **Decorations** for the nine species nothing draws (a rock pool, a lightning rod, a bat roost).
  - **Jobs:**
    - Garden (grass), grows food.
    - Generator (electric), works with the lighthouse.
    - Fortune (psychic), shows three silhouettes of who's likely next.
  - **Evolution items:** a Dawn Stone, and Razor Claw as a boss drop.
- **L10. Dungeons that scale (M).** After the first clear, charged "deep floors" B4 to B6 open at your strongest Pokémon's level minus 5, so high levels have a use without dungeons ever paying EXP.
- **L11. Small moments (S each, calm).**
  - A bottle washes up with a friend's note, or a pen pal's.
  - The lantern lights itself at real dusk.
  - The lead dozes against the clock at 45 minutes.
  - The tide goes out mid-session.
  - When you come back to an island, the residents run to the pier.
- **L12. Social (ranked).**
  1. Trading (L3).
  2. A Together egg in place of double shells. It warms only with minutes you both focus, and you each get the hatchling.
  3. Visits you can act on:
     - leave a berry in their dish, which becomes their next lure;
     - sign their signpost, which works as a guestbook;
     - pet their Pokémon, which shows them a heart.
  4. A friend's visiting Pokémon counts as seen in your Pokédex.
  5. A weekly shared goal ("10 hours together") that lights a festival night on both islands.
  6. Friends' minutes count toward your restoration (L1).

## 6. Dungeons

### Feel

- **D-F1. Fighting is optional and earns nothing.**
  - You move faster than every enemy and can walk past them.
  - You can't sneak either: auto-attack hits sleeping enemies farther away than they wake up, so a ranged team wakes every room it walks through.
  - Fix:
    - auto-attack only awake enemies, so you choose when a fight starts;
    - a 12% chance of a run item when an enemy faints;
    - a few seconds of brighter lantern light when you clear a room. S.
- **D-F2. Choices are thin.**
  - Stats depend only on level.
  - Melee types are strictly worse than ranged ones (20 px of reach against 74, for the same damage).
  - Followers never use their moves.
  - A berry always goes to whoever is most hurt.
  - Fix:
    - melee gets ×1.4 damage, +20% health and a lunge;
    - followers use move 1 on its cooldown;
    - key 3 fires your second Pokémon's burst. S to M.
- **D-F3. Bosses die before they show anything.**
  - By the formulas, a B2 miniboss lasts about 4 seconds and Snorlax about 10, so you see one or two of its three phases.
  - Fix:
    - boss health ×2;
    - each new phase opens with a moment of invulnerability, a shake and its signature move;
    - minibosses get ×8 health, full attack, two helpers and a second move.
  - Target: about 40 seconds for a boss and 15 for a miniboss, measured with the autopilot. S.
- **D-F4. Floors feel alike, and the boss floor is identical every run**, with no traps, pots or chests (the editor can't place them). See the content below. M.
- **D-F5. Pacing is right** (a run takes 5 to 8 minutes). Two additions:
  - solo pauses itself when the window loses focus, since you'll click over to your notes;
  - show progress while reviving a partner.

### Content (ranked by fun per effort)

1. **Room types:**
   - a monster house whose doors close when it wakes, with a big chest;
   - a treasure vault behind a lever and timed spikes;
   - a shrine that trades 2 Oran Berries for a Reviver Seed;
   - a dark room only fire types or a torch can light. M.
2. **Enemy behaviours:**
   - kiters that back away and shoot (Zubat, Gastly);
   - healers (Gloom, Chansey);
   - swarms;
   - burrowers that pop up after a warning;
   - chargers. M.
3. **Floor modifiers,** one a floor, named on arrival: Fog, Flooded, Restless (everything awake), Echo (alarms everywhere), Rich (an extra chest). S.
4. **The last two traps:** rolling boulders (cave) and slick ice (Glacier). The forest theme is unused, so spore vents never appear in Glacier Grotto. S.
5. **Boss kits by type.** Lapras fights exactly like Snorlax today. It could have an ice lane that freezes the floor, a Perish Song countdown and a water ring. M.
6. **Reasons to replay:**
   - a daily seed with a best time in the Journal;
   - records for the fastest and no-faint clears;
   - dungeon-only decorations from boss chests (planned, not built). S to M.
7. **More dungeons:** one per new island, and a post-game Deep Shaft of 5 or more floors with rising modifiers and a cosmetic-only reward. L.
8. **Controls:**
   - a gamepad (S);
   - touch with a stick plus Dash, 1 and 2 (M);
   - remappable keys;
   - less screen shake;
   - a white outline on warnings, since a grass-coloured ring on a forest floor is hard to see.
9. **Editor:**
   - a check that the exit can be reached;
   - placing stairs, traps, pots and chests;
   - previewing B1 to B3 for a given seed.

## 7. Co-op

1. **C1. Know who the host is** (D3), and send inputs to the host only, not to every guest. S.
2. **C2. A real lobby:**
   - Studdy names instead of "friend";
   - each player's team portraits;
   - a Ready toggle;
   - the guest's charge and berry choice;
   - "room full" and "already started" replies;
   - after 20 seconds with no answer: "Some networks block direct connections." S to M.
3. **C3. Revive and spectating:**
   - a progress ring while reviving;
   - when your Pokémon faint, the camera follows a friend with "Stand beside X to revive";
   - with two Pokémon each, control moves to your second when your lead faints. S.
4. **C4. Pausing** (D4). S.
5. **C5. Pings and short lines:** "Here!", "Stairs", "Help", "Wait". S.
6. **C6. Reconnect:**
   - a player token remembered for this session;
   - the host holds the slot for 20 seconds and re-sends the current floor.

   Today a guest who reloads can never get back in. M.
7. **C7. Latency:**
   - a little extra dodge grace for guests on the host's side;
   - draw other players from a short buffer, about 100 ms behind;
   - move shots along their path between snapshots. S.
8. **C8. Fair loot** (D6), and a per-player loot list at the end. S.
9. **C9. Campus Wi-Fi:**
   - TURN relay servers through Trystero's settings, with short-lived credentials from a small Supabase function;
   - or Trystero's Supabase signalling instead of public Nostr relays;
   - a low-rate Supabase relay as a last resort. M.

## 8. Interface and quality of life (ranked)

- **U1. Starting a session sends every waiting Pokémon away, without warning.** Ask first ("3 Pokémon are waiting. They leave when you start."), and show a waiting count beside the break timer. S.
- **U2. Details for a Box cell or Pokédex entry appear far below the grid, out of sight.** In a full box, a tapped cell's actions sat about 900 px below the visible area. Show the details in a fixed strip above the grid instead (the GBA way), or scroll to them. S.
- **U3. Space and Enter press the last button you clicked.** Clicking End session and then pressing Space opens a second confirm. Clear focus after a click, and ignore a dialog that's already showing or queued. S.
- **U4. In the small window the catch panel covers the throw ring.** Use a one-row bar at the bottom: three balls, Throw, Run. M.
- **U5. Other problems in the small window:**
  - The toast runs off both edges and covers the dialog.
  - The Box's fifth column is cut off.
  - Menus show about one row, because the title and the two-row tab bar take a third of the height. A `◀ Party ▶` cycler in the title row would fix that.
  - The summary card covers most of the screen. S to M.
- **U6. On desktop, windows overlap.**
  - The summary card covers the menu's action buttons.
  - Dialogs cover the bottom of the menu.
  - The summary opens on top of the Pokémon you just petted.

  Close the menu or anchor the summary, and open it on the side away from the Pokémon. M.
- **U7. Keyboard:**
  - The prologue's choices can't be picked by keyboard (Enter does nothing, and there are no arrow keys).
  - Dialogs with buttons don't focus the main choice.
  - In the dungeon, menus trap focus on the gold button.

  Add a ▶ cursor with Up/Down and Enter, focus the main action, and Esc for the other one. M.
- **U8. Esc closes nothing on the island.** It should close the topmost of Cheats, the summary, the menu and the catch. Number keys could open the menu tabs. S.
- **U9. The tour's instruction lines can be dismissed and never come back.** Pressing Space once loses "Tap it, then press Throw", and the tour waits silently. Instruction lines shouldn't be dismissible, and they should come back when a menu closes. S.
- **U10. Cheats ship on the live site,** including a one-click "Reset save (no backup)". Hide them unless `?debug` is in the address, and confirm the reset. Your call, since you test on the live site.
- **U11. Wording:**
  - The map tab is "Island" in three places, while the copy says "Town Map". Call the window "Town Map" and the first sub-tab after the island.
  - The Pokédex reads "Seen 62 · Caught 62 · 79". Make it "Caught 62 of 79", with a this-island/all toggle.
  - Sail requirements read "Catch 41 of 58 (53)". Make it "41 needed, you have 53".
  - Mixed formats: "Day Care 1/2", "1h05", "3 h:" and "At 10 h". Pick one.
  - "0 minutes together" shows on every new Pokémon.
  - "Lv 5" and "Lv5" are both used.
  - "Gotcha!" and then Wooper's "You caught Pidgey!" say the same thing twice.
  - "Trip 30/90" → "Short trip (30 min)" / "Long trip (90 min)".
  - The shop's "×5" has no price.
  - "Cries on" is a state used as a button.
  - Open sessions don't say when they start to count (25:00).
  - Dungeon labels: "No charge", "Seeds 0" and an unexplained "+1".
- **U12. Information only in tooltips,** so touch players never see it:
  - "Loved by" on decorations;
  - what each food draws;
  - ball names;
  - Box names (cells show only "Lv24");
  - gift item names (the tooltip shows raw ids like "great-ball").

  The caption strip from U2 fixes most of these.
- **U13. Disabled buttons with no reason:** Party when full, Box for the last member, Feed with no berries, Place with no free spots. Add a one-line reason or a Swap action.
- **U14. Confirmations:**
  - Spending Star Pieces (habitats, upgrades) needs a confirm.
  - The starter pick needs a confirm, the way FireRed asks "So, you want CHARMANDER?".
- **U15. A session-end recap.** Today it's a 4-second toast, and level-ups overwrite each other. One recap dialog would cover minutes, who grew from what to what, berries and who's waiting. The Journal already computes most of this. M.
- **U16. Smaller:**
  - "Feed" shows no berry count.
  - The dungeon intro doesn't show your three Pokémon or their levels against the dungeon's.
  - Credits are one 3,000 px scroll, with ", ," gaps from empty names.
  - "Flamethrower" is cut off in the dungeon move box.
  - At 480×360 the dungeon panels overlap.

### Quality of life

- **Box:**
  - sort by level, number or newest, remembered;
  - filters ("can do a job", "lives elsewhere");
  - a badge on cells that live on another island.
- **Party:** swap when full, make lead, and release with a confirm (duplicates pile up).
- **Jobs and decorations:**
  - Jobs: tap an empty job to see who can do it, and show "next in 4 min" on filled ones.
  - Decorations: thumbnail art on the cards (the painters already exist), and pick-a-slot placement.
- **Main screen:**
  - During a break, show the waiting count and shells.
  - Show Lantern charges in the Bag.
  - Show the countdown in the browser tab title.
- **Catch window:** reopen after a break-free with the same ball, mark "caught before", and warn when a rare one has one try left.
- **Settings:** volume, text speed, reduced motion, and one line on what idle detection does.

## 9. Polish and accessibility

- **Text and menus:**
  - HUD dialogs type out with a soft blip, the way the prologue does.
  - A ▶ cursor on focused rows.
  - A short slide when a menu opens.
- **Rewards:**
  - An "item get" beat for gifts and finds: the icon rises with a two-note jingle.
  - A ding and a filling bar on level-up.
  - A sparkle for a new Pokédex entry.
- **Loading:** preload item icons and Happy portraits. On first open, some buttons showed no icon and the summary had an empty face.
- **Gold buttons:** one per view. Habitats showed three at once.
- **Accessibility:**
  - a pixel focus ring in place of Chrome's rounded orange one;
  - `prefers-reduced-motion` stops the pulses, the bobbing and the intro drift (there's none today);
  - white type chips on orange or lilac are about 2.6:1, so add a dark outline;
  - the catch ring's odds are colour-only, so also vary the thickness;
  - disabled buttons at 45% opacity are hard to read;
  - the HUD should be inert behind the prologue and Cheats.

## 10. Decisions for you

1. Fix all of section 2 now?
2. Which balance changes in section 3: B1 to B12, and whether the Lantern stays as it is (B12).
3. The long-term spine: the restoration story (L1), a third island (L2), or both, and in which order.
4. Trading (L3), including a weekly sailor for solo players.
5. Which of L4 to L12 to keep.
6. The dungeon direction: fights that matter (D-F1 to D-F3), then room types, enemy behaviours and modifiers.
7. Co-op polish (C1 to C9), and whether to look into a relay for campus Wi-Fi.
8. Interface: the ranked list U1 to U16, and whether cheats stay on the live site (U10).
