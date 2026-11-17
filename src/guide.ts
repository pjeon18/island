// The Guide (2026-11-17, Paul chose "Guide + unlocking tips" after a friend found trips, the Day Care,
// the berry bush, petting and feeding unclear). Each entry unlocks when it becomes useful: at a
// break, Wooper explains the first unlocked one you haven't seen, in a line or two, and it joins
// the Guide page (More → Guide). One tip a break, and never during focus.
import type { Game } from './game'

export interface Tip {
  id: string
  title: string
  text: string
  /** Is this useful yet? */
  ready: (g: Game) => boolean
}

const hours = (g: Game) => g.totalHours()

export const GUIDE: Tip[] = [
  {
    id: 'focus',
    title: 'Focusing',
    text: 'Press Start focusing and study. Every focused minute gives your party EXP and you a shell. Finishing a session ripens berries and washes up Poké Balls.',
    ready: () => true,
  },
  {
    id: 'catch',
    title: 'Catching',
    text: 'Pokémon come by during your sessions and wait for your break. Tap one, pick a ball, and throw when the ring closes on the white circle.',
    ready: (g) => g.save.wild.length > 0 || g.save.caught.length > 1,
  },
  {
    id: 'pet',
    title: 'Petting and feeding',
    text: 'Tap one of your Pokémon to pet it and see its card. Feeding it an Oran Berry gives it EXP right away.',
    ready: (g) => g.save.berries > 0 || g.save.mons.length > 1,
  },
  {
    id: 'party',
    title: 'Party and Box',
    text: 'Up to six Pokémon live on the island and earn EXP while you focus. The rest wait in the Box and earn nothing until you bring them back.',
    ready: (g) => g.save.mons.length > 2,
  },
  {
    id: 'evolve',
    title: 'Evolving',
    text: 'Most Pokémon evolve at a level. Some need a stone, which you give from their card, and some need 10 focused hours together.',
    ready: (g) => g.save.mons.some((m) => m.level >= 12) || Object.values(g.save.bag).some((n) => n > 0),
  },
  {
    id: 'jobs',
    title: 'Helpers and the berry bush',
    text: 'A Pokémon with a job works while you focus and earns half EXP. A Water type at the berry bush grows extra Oran Berries; diggers find things; a flyer on the lookout spots more visitors.',
    ready: (g) => g.save.mons.length > 3,
  },
  {
    id: 'trips',
    title: 'Trips',
    text: 'Send a Pokémon on a trip of 30 or 90 focused minutes. It comes back with shells and items, and sometimes an egg. Stronger ones can go further.',
    ready: (g) => g.save.mons.length > 3 && hours(g) >= 1,
  },
  {
    id: 'daycare',
    title: 'Day Care and eggs',
    text: 'Two Pokémon in the Day Care lay an egg every 90 focused minutes. Eggs warm in the nest while you focus and hatch into a new Pokémon.',
    ready: (g) => g.save.mons.length > 4 || g.save.eggs.length > 0,
  },
  {
    id: 'habitats',
    title: 'Habitats and decorations',
    text: 'Habitats and decorations draw new kinds of Pokémon. Each one says which types it brings. Build them in the Island menu.',
    ready: (g) => g.save.habitats.length > 0,
  },
  {
    id: 'food',
    title: 'Food',
    text: 'Set out a food from the shop before a session. It draws certain types until the session ends.',
    ready: (g) => hours(g) >= 2,
  },
  {
    id: 'landmarks',
    title: 'Landmarks',
    text: 'The storm wrecked the Pokémon Center hut, the lighthouse and the old pier. Rebuild them with focused hours, species and shells. Each one opens something new.',
    ready: (g) => g.save.island === 'home' && hours(g) >= 2,
  },
  {
    id: 'dungeons',
    title: 'Dungeons and guardians',
    text: 'The doorway on the island leads to a dungeon with a guardian at the bottom. Finish a 30-minute session to light a Lantern charge, which opens its chests.',
    ready: (g) => hours(g) >= 3,
  },
  {
    id: 'friends',
    title: 'Friends',
    text: 'Sign in with your Studdy email to add friends. Study at the same time to warm a Together egg, and visit, trade or send gifts on a break.',
    ready: (g) => hours(g) >= 1,
  },
]

/** The next tip worth telling: unlocked and not yet seen. */
export function nextTip(g: Game): Tip | undefined {
  const seen = new Set(g.save.tips ?? [])
  return GUIDE.find((t) => !seen.has(t.id) && t.ready(g))
}
