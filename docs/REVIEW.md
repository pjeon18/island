# Island: full review (2026-11-11)

This review covers balance, the gameplay loop, the dungeons and the corner window. It was put together from four parallel passes over the code, a 30-day simulation that drove the real `game.ts` on a fake clock (20 runs per schedule, a player studying about 2 hours a day in 25- and 50-minute sessions), and play in the browser. Nothing here is built yet. Every item that changes how the game plays is a decision for Paul; the bugs in section 2 are not design calls and can be fixed straight away.

## 1. Where the game stands

The first day is strong. The prologue, Wooper's tour, the guided Pidgey catch and a gift that pays exactly for the Pond lead straight into a 25-minute session that brings two passers-by and a few finds. The second week has plenty to do: habitats, food, decorations, helpers, eggs and the Pier Hollow dungeon.

After that the game runs out of reasons to come back. In the simulation everything in the shop was bought by day 7, the home Pokédex reached 41 of 58 by day 8, Frost Isle opened on day 10 with a party already stronger than its guardian, and both Pokédexes stalled on evolution stones. Shells and Star Pieces pile up with nothing to spend them on (one real save had 1,569 shells and 20 Star Pieces). Levels outrun the content after about 20 focused hours, because nothing needs a Pokémon above Lv44.

So the loop is sound for roughly two weeks and thin after it. The fixes below fall into three groups: close the exploits, make the economy hold its value past week 2, and give the late game something to do. The bigger dungeons are the natural place for that late game.

### Key timings at 2 hours a day

| Milestone | When |
|---|---|
| Starter's first evolution (Lv16) | 1.8 focused hours, day 1 |
| Lv20, Lv30, Lv40 | 3, 7 and 13 hours (days 2, 4, 7) |
| Pier Hollow and Snorlax beatable | about day 3 |
| Every decoration owned | day 7 |
| Home Pokédex 41 of 58 | day 8 |
| Frost Isle opens (the 20-hour gate decides it) | day 10 |
| Home Pokédex at day 30 | stuck at 53 of 58, because the rest need stones |

One open 2-hour session a day reaches 41 of 58 only on day 16, because it gets 3 passers-by a day instead of about 12.

## 2. Fix now: bugs and exploits

These are mistakes, not design questions.

1. **A zero-focus EXP loop.** Starting an Open session and stopping it at once counts as a complete session. That pays a berry (10 EXP) and a 25% chance of a free visitor. In the simulation, 200 of these took a starter from Lv5 to Lv63 and added 12 Pokémon with no focus at all. The fix is to count an Open session as complete only after 25 credited minutes, and to drop its end-of-session berry, since Open sessions already ripen one every 30 minutes.
2. **"Still studying?" can get stuck on screen.** `main.ts` clears it by looking for the text "still studying", but the line reads "Still studying?", so the check never matches. After a pause or the 3-hour cap the box can stay up with a button that does nothing. The same act also has three labels ("I am still here", "I'm here", "I am back"); it should have one.
3. **A paused session blocks the break.** While a session is paused, the only button is "I am back", and catching is blocked whenever any session exists. Someone who closed the laptop opens the game to Pokémon they can't catch. A paused session should offer End session, and opening the game after more than 30 minutes away should end it as incomplete (keeping the minutes) with a gentle greeting.
4. **The end-session warning is wrong.** "End now? Visitors only come after a full session." is no longer true: passers-by stay either way. It should read "End now? You keep your minutes. The berry only ripens after a full session."
5. **Long sessions lose passers-by.** At most 3 wild Pokémon can wait (`WILD_MAX`), and they only leave when the next session starts. A 50-minute session gets 3 instead of 4, and a 3-hour Open session gets 3 instead of 15. That breaks LOOP.md's promise that every minute counts the same. Raise the limit to 4, and when the island is full let a new passer-by replace the most common one waiting.
6. **Small ones.** A Pokémon in the box holding a stone never evolves, because only the party and the helpers are checked. A friendly visitor that joins doesn't give the new-species Star Piece. Passers-by count toward the 12-a-day visitor cap, so the end-of-session visitor stops after about 2 hours.
7. **Gifts trust the sender.** `island_send_gift` never checks what the sender owns. A second account could send 10 gifts a day of 5 stones each, or any Pokémon from #1 to #493. The fix is server-side: only first-stage species from the roster, at most one stone a week, and no evolved Pokémon. This needs a SQL change that Paul runs on Studdy's project.

## 3. Balance changes (Paul's call)

1. **Stones.** Right now they only come at streak days 3, 7, 14 and 30, so a loyal player gets 4 ever. The two Pokédexes need 10 (Raichu, Vileplume, Bellossom, Poliwrath, Cloyster and five Eeveelutions). Worse, a player who breaks the streak every fourth day gets one every four days, which rewards breaking it. Proposal: a stone every 7 streak days with no end, a 2% chance in finds, 10% from long expeditions and a dungeon boss chest, always preferring a stone whose evolution you haven't caught.
2. **Shells.** Helpers earn about three times what focus does (expeditions 37% of all shells, the campfire 22%, finds 17%, focus 24%). That breaks the "1 minute = 1 shell" law and leaves 3,000 banked by day 14. Proposal: long expeditions pay 40 + level instead of 30 + 4 × level, short ones 10 + level/2, and the campfire 3 shells every 6 to 10 minutes. Add Frost-themed decorations at 300 to 800 shells, and a long-term project to spend on (see section 6, idea 3).
3. **Star Pieces.** The simulation earned 67 against a total demand of 17. Proposal: a Star Piece for every third new species instead of every one, finds from 7% to 3%, and the island upgrades GAME_DESIGN promised (a fourth egg slot for 5, a second expedition for 8).
4. **Guardians.** The party out-levels Lapras (Lv40) before Frost Isle even opens, and Snorlax falls on day 3. Proposal: Glacier Grotto's Pokémon at Lv40 to 44 and Lapras at Lv48. Optionally Snorlax at Lv30 with Lv22 to 25 Pokémon, which moves Pier Hollow to about day 4.
5. **Balls.** Nothing ever runs away, so Great and Ultra Balls are never worth buying. Proposal: rare and starter Pokémon leave after 3 failed throws; Great Balls cost 15 and Ultra Balls 30.
6. **Night-only species.** A player who never studies after 7pm can never meet eight species across the two islands. Proposal: while the stone lantern is placed, night species can come by day at a fifth of their usual odds.
7. **EXP rate.** It is still 1 EXP per minute. GAME_DESIGN left 2 per minute as an open question. The simulation says 1 per minute already outpaces the content, so I'd keep it, and add content instead.

## 4. Gaps in the loop

1. **Nothing after Frost Isle.** There's no third island and no island growth after 10 hours, and replaying a dungeon gives nothing. The dungeon plan in section 5 is the main answer, together with the shell and Star Piece sinks.
2. **Frost Isle is thin.** It has 31 species against the 40 to 60 the design asked for, and no species there needs the cave, so building one is pointless. It needs about ten more species, a few of them drawn by the cave.
3. **Two Pokédex counts that disagree.** The Pokédex tab counts the whole roster ("Caught 45 · 79") while the Island page counts per island ("8 of 31"). Frost species show up on Home as unknown numbers with "Needs pond". The Pokédex should have a tab per island, and Frost species should say "Lives on Frost Isle."
4. **Lure information is hidden in tooltips.** "Loved by" on decorations and "Draws water types" on food only show on mouse hover, so they're invisible in the small window and on touch. Show the loved-by portraits (silhouettes until seen) and one line of types.
5. **The Grass job was promised but never built.** Bulbasaur, Oddish, Hoppip and Snover have no work. A Garden job could grow one food every so many minutes.
6. **Friends outside a good connection.** If the network drops while signed in, the game asks the player to choose a name again. A gifted Pokémon is quietly lowered to the sender's server-verified level. Solo players get nothing from the friends features. Needed: an offline state that keeps the last list, a warning before a lowered gift, and something for solo players (section 6, idea 6).
7. **State nobody can see.** "Day Care 1/2" does nothing with one Pokémon and doesn't say so. The streak and the next stone are buried in More, then Focus. A Day Care Eevee lays Eevee eggs, the best way to get all its evolutions, and nothing tells the player. Show "2 days. A stone at 3." at the start of each break, and a hint on the Day Care row.
8. **Promised in GAME_DESIGN and not built:** two-sided trades, items in dungeons, island growth as new land, the Garden job, expeditions where stronger Pokémon go further, and a third island.

## 5. Bigger dungeons

The current dungeon works well as a base. Maps are built from editable pieces, combat reads clearly and runs cheaply, and the lighting already gives dark maps a reason for torches and fire types. Its limits:

- **Size and content.** Each dungeon is one hand-made floor of about 64 by 42 tiles with 6 to 8 Pokémon, and there are no floors, chests, traps or items.
- **AI.** Enemies chase in a straight line and get stuck on walls.
- **Combat.** There's no dodge and nothing telegraphs an attack.
- **Healing.** Out of combat the party heals 8% a second, which makes healing items pointless.
- **Rewards.** Replays give nothing.
- **Testing.** The boss has only been tuned by an autopilot. It's keyboard-only, with no touch controls.

### Floors and structure

- Each dungeon becomes three generated floors and a hand-made boss floor. Each floor takes about two minutes and has 6 to 8 rooms.
- Stairs are checkpoints: floor, health, items and seed are saved, so a run can be left and picked up at the next break. That keeps every run inside a 5 to 10 minute break, which matters because this is a study timer.
- **Generated floors.** The editor gains small "vault" rooms with door, enemy, trap and chest slots. A seeded generator places 6 to 8 of them and joins them with corridors, producing an ordinary map that the existing renderer and editor already understand.
- **Pathfinding.** Enemies and followers use a shared path map, so they stop getting stuck.

### Traps and dodging

All traps are visible, but only in the light, so the lantern and fire types matter more.

- Spike plates on a 2-second cycle.
- Spore vents that put you to sleep for 2 seconds (forest).
- Boulders that roll down a corridor after a shadow warning (cave).
- Slick ice that carries your momentum (ice).
- Alarm tiles that wake the whole room.

Space becomes a dash with a short cooldown, so warned attacks can be dodged.

### Minibosses and the boss

- **Minibosses.** One on each of floors 2 and 3, in an arena that locks: an evolved Pokémon such as Onix, Golbat or Piloswine, with about six times a normal enemy's health. Each has one signature move with a warning ring, calls two helpers at half health, and drops a guaranteed chest.
- **The end boss.** It has three phases, at 66% and 33% health:
  1. A charge down a lane, warned by a shadow.
  2. A burst that now telegraphs first.
  3. Falling rocks or a Yawn you have to step out of.
- Big Pokémon use their own full-size sprites, never stretched.

### Healing items

- Out-of-combat healing drops to 1% a second, and stairs heal half your health and revive fainted Pokémon.
- Items are found in chests, pots and tall grass:
  - Oran Berry: heals 30%.
  - Sitrus Berry: full heal, rare.
  - Reviver Seed: revives you automatically.
  - Max Elixir: resets move cooldowns.
- You may bring up to two of the island's Oran Berries in, a real choice against feeding them for EXP.
- Items found in a dungeon stay in it.

### Rewards that keep focus the only currency

- **Lantern charges.** Every finished session of 25 minutes or more gives one, and you can hold two. A run without a charge is allowed (to practise, or to help a friend), but its chests stay shut.
- **What a charged run pays.** About as much as the session that earned it: balls, a 30% chance of a Star Piece, a 5% chance of a stone from the boss chest, and dungeon-only cosmetic decorations.
- **No shells, no EXP.** Dungeons never pay either. The first clear still gives 3 Star Pieces, and the guardian still joins you.

### Catching a special Pokémon

- After a charged boss clear, a "deep" Pokémon appears and you get one throw from your own bag: Larvitar or Aron in Pier Hollow, and Dratini in Glacier Grotto.
- **Odds.** About 25% with a Poké Ball and an average throw, about 65% with an Ultra Ball and a perfect throw, rising 8% after each clear where you miss.
- **What you get.** It joins at Lv10 as a first stage, so its levels still come from focus.
- **Pokédex.** These species never pass by the island, and they don't count toward the share needed to sail, so moving on never depends on combat skill.

### Co-op with friends, 2 to 4 players

**Networking.**
- Gameplay runs peer to peer over WebRTC (the trystero setup from MISCHIEF).
- Invites and the lobby go through Supabase, which accounts and friends already use. Supabase's realtime message allowance is too small to stream a fight at 15 updates a second, but is fine for invites.

**Who decides what.**
- The host decides everything that matters: enemies, damage, traps, drops, floors and the boss.
- Each player moves their own lead Pokémon, so movement never lags.
- Maps are never sent. The host sends the seed, and every player builds the same floor.

**Party size and difficulty.**
- Solo players bring 3 Pokémon, two players bring 2 each, and three or four bring 1 each.
- Enemy health grows with the number of players.
- A fainted player is revived by a friend standing next to them for 3 seconds.

**Invites.** The friends list gets "Invite to dungeon", shown only when the friend is on a break. The friend gets a nudge and joins with one click. A typed room code also works.

**Disconnects.**
- If a guest drops, their Pokémon become AI for 20 seconds while they rejoin.
- If the host drops, the run ends and everyone keeps what they banked at the last stairs.
- On networks that block peer-to-peer connections, common on campus Wi-Fi, the room falls back to relaying through Supabase at a lower rate.

### Build order

| Tier | What it adds | Size |
|---|---|---|
| T0 | Split the dungeon code into simulation, drawing and input (co-op needs this); pathfinding, the dash and the new healing rate | about 750 lines, much of it moved |
| T1 | Floors with stair checkpoints, the vault generator and editor support, 3 traps, chests, dungeon items, Lantern charges | about 900 |
| T2 | Minibosses, boss phases and warnings, the special catch, Attack sprites, an autopilot balance test across floors | about 650 |
| T3 | Two-player co-op by room code | about 700 |
| T4 | Friend invites (SQL Paul runs), 3 to 4 players, rejoining, the relay fallback | about 400 plus 60 lines of SQL |
| T5 | Touch controls, more rooms per theme, the last 2 traps, a balance pass | open-ended |

## 6. The corner window

There are four ways to get a small window today, and none of them is finished.

**Document Picture-in-Picture**, the "Pop out" button in More, has never run in real Chrome. In it:

- **Layers.** The clouds and the dark edge band don't draw, because they look for the page they were built in.
- **Sea colour.** The colour never updates, so a mismatched frame shows at night.
- **Rendering.** The island renders twice per frame after each pop-out, which wastes battery.
- **Keyboard.** Space, Enter and the cheats key don't reach the small window.
- **Navigation.** Sailing, entering a dungeon or visiting a friend reloads the main tab and closes the window.

**The plain popup** opens wherever the browser puts it. Its clock runs in the hidden main tab, which Chrome may freeze, pausing the session while you watch.

**The Tauri desktop app** has never been built, because Rust isn't installed.

- **Position.** It guesses its bottom-right position instead of reading the screen's work area, and doesn't remember where you moved it.
- **Dock and clicks.** It keeps a Dock icon, and may swallow clicks on the island.
- **Save.** It keeps a separate save, so it starts with the prologue.
- **Sign-in.** It can't finish sign-in, because the email link opens in the browser.

**At small sizes**, the scales become fractions, so text blurs, and menus cover the whole island.

### Plan

1. **Make Chrome's Picture-in-Picture the main path.** Draw the clouds and edge into the small window and keep its sea colour live. Run one render loop, listen for keys in whichever window is showing, and open the dungeon and friend visits in a full tab instead of navigating.
2. **Add a compact layout under about 400 pixels.** It shows the clock, one Start or Stop button, your lead with its EXP bar, and a single menu button. Menus open full-window with a Back button, and dialogs become one-line notes. The window asks for about 360 by 270, a clean 1.5 times scale.
3. **Fix the popup fallback.** It opens in the bottom-right corner and takes over the clock, and the main tab says "The island is in its own window."
4. **Make Pop out visible.** Move it out of More into a small button in the corner.
5. **Fix the Tauri app.** Place it from the real work area and remember the position, hide the Dock icon, add a drag handle instead of dragging by the island, carry the save over, and sign in with a typed code instead of an email link.

**What Paul has to do himself:**

- Install Rust:

  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

- Run `npm run desktop`.
- Open the unsigned app the first time with right-click, then Open.
- Test Picture-in-Picture in real Chrome, including leaving the tab in the background for 10 minutes. The embedded browser here refuses it.

## 7. Ideas that fit the game

1. **Shiny Pokémon** from long sessions with no step-aways: rare, cosmetic, earned only by focus.
2. **A "who might come" peek** beside Start focusing: three silhouettes whose lures you currently meet, so building becomes planning.
3. **A landmark project**, such as a lighthouse paid for with shells over weeks, which friends can add to. It gives the late game a calm long goal and a place for shells to go.
4. **A morning scene** after time away: Wooper greets you, the night's finds lie on the sand, and paused minutes are kept.
5. **Postcards:** a snapshot of each session's best moment saved to the Journal.
6. **A pen pal** who visits during long sessions when no friends are online, so solo players get some of that warmth.
7. **Weekly research tasks** ("see a night Pokémon", "hatch an egg") paid in Star Pieces or a stone.
8. **Bond moments:** at 5 and 10 focused hours together, a party Pokémon does something special by the tree.

## 8. Decisions (Paul, 2026-11-11)

1. **Order.** Fix the bugs and exploits first, then the corner window, then dungeons (T0 to T2), then co-op.
2. **Balance.** All four groups: more stones, fewer shells and Star Pieces with new things to spend them on, tougher guardians, and fleeing rare Pokémon with cheaper Great and Ultra Balls plus night species by day near the stone lantern.
3. **Islands feel separate.** Each island has its own residents, up to 6, chosen from the box. Only residents (and helpers at work) earn EXP. Your starter is your partner and travels to every island; everyone else stays where they live. A new island starts with just your partner and whatever you catch there.
4. **EXP.** 2 EXP a minute, and level L costs L + L²/25. About the same time to Lv36, early levels twice as fast so new residents catch up, higher levels slower.
5. **Eevee.** Its summary says it evolves with an evolution stone or friendship, instead of listing every form.
6. **Dungeon loot** needs a Lantern charge from a finished session of 25 minutes or more (hold up to 2).
7. **Co-op** starts with two players by room code; friend invites come later.
8. **Still open:** the special catch species and odds (proposed: Larvitar or Aron, and Dratini, at about 25%), and which ideas from section 7 to keep.
