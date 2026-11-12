# The loop: what you put in and what comes back

Written 2026-11-11 after T1, when Paul asked to hone the relationship between player effort and reward. This doc is the pricing law for the island, the way Studdy's ECONOMY.md is for Studdy: every future reward lands on this curve.

## What T1 got right and where it was thin

T1 paid for focus correctly. Party Pokémon gained one EXP per verified minute, and a finished session brought a visitor. Three things were thin:

- **The player had almost nothing to decide.** Every party member gained the same EXP, and befriending always succeeded, so the only real choices were the session length and who sat in the party.
- **Shorter sessions paid better.** A 25-minute session and a 50-minute session each brought one visitor, so two short sessions earned twice the visitors of one long one. That quietly discouraged deep work.
- **Nothing tied the days together.** There was no reason to come back tomorrow beyond the next level, and no long goal once the starter was fully evolved.

## The principle

Focus time is the only thing the island pays for, and the island asks nothing of you while you focus. All choices happen in the break after a session. This makes the island reinforce a work and rest rhythm instead of competing with your work for attention.

## The rule of thumb

One focused minute is the unit. Every reward is priced in focused minutes, so a player can always read how much effort something represents.

| You do | You get | How it feels |
|---|---|---|
| Focus for a minute | 2 EXP for each resident on the island and 1 shell (level L costs L + L²/25; Paul, 2026-11-11) | Steady and visible: EXP bars fill, levels arrive on a known schedule. |
| Finish a 25-minute session | One visitor at normal odds, and one berry ripens on the bush | A small surprise at a natural stopping point. |
| Finish a 50-minute session | One visitor with rare odds raised 2.5 times, and two berries | Deep work buys better odds instead of more draws, so the reward per minute stays fair. |
| Focus in an open session | One visitor at normal odds every 30 focused minutes | It works for people who don't use timers. |
| Keep a streak of focus days | At 3, 7, 14 and 30 days an evolution stone washes ashore. A 3-day streak also raises rare odds. | A reason to come back tomorrow that never punishes a missed day beyond resetting the count. |
| Keep a Pokémon in your party | After 10 focused hours together, a friendship evolution becomes possible | Your choice of party matters over weeks. |

## Your choices, all in the break

- **Befriend or let go.** Each visitor joins your box or leaves.
- **Feed berries.** A berry gives 10 EXP to any Pokémon you choose, including one resting in the box. This is the main way you steer growth, and it is the only EXP that does not go to the whole party.
- **Choose the party.** Up to three Pokémon gain EXP from your focus and build bond.
- **Use a stone.** A stone evolves a Pokémon that can use it. Eevee can take several, so the choice is yours.
- **Decorate.** Shells buy decorations for the island. They are expression only and never change odds or growth, like Studdy's beans.
- **Wave to a friend.** If a friend is studying, you can wave. They see it at their next break, never during their focus.

## Limits that protect the habit

- **Visitors stop after 12 a day.** EXP still accrues, but the island says that visitors come back tomorrow. This keeps the island from rewarding an unhealthy all-nighter more than a steady day.
- **The server caps verified time the way Studdy does.** It allows 6 hours per session and 16 hours per rolling day. The server only counts real wall-clock time between beats, so hammering the endpoint earns nothing.
- **Nothing can be bought.** Shells are earned by focus only, and nothing affects odds, EXP or friends' views.

## The long goal

The Pokédex holds every species on the island, 45 in all, and tracks which you have seen and which you have befriended. Visitors are only first stages. Every later form has to be raised through focus, berries, bond or stones. Completing the Pokédex therefore takes both luck from sessions and steady effort over weeks, and neither alone is enough.

## Numbers at a glance

- A starter from level 5 reaches its first evolution (level 16) in about 1 hour 50 minutes of focus, and its final form (level 36) in about 10 hours.
- A Caterpie visitor evolves twice within its first hour on the island.
- Ten focused hours earns 600 shells. Decorations cost 40 to 400 shells.
- Twelve 25-minute sessions, about five hours of focus, earn 12 berries. Each is worth at least 20 EXP, or a quarter of the next level's cost once that is more (`berryExp`).
