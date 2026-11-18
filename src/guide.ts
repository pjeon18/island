// The Guide (2026-11-17, Paul chose "Guide + unlocking tips" after a friend found trips, the Day Care,
// the berry bush, petting and feeding unclear). Each entry unlocks when it becomes useful: at a
// break, Wooper explains the first unlocked one you haven't seen, in a line or two, and it joins
// the Guide page (More → Guide). Up to two tips a break, and never during focus.
// (2026-11-18, Paul: every tab, window, button and feature should be explained, at different
// points of progress but not spaced out so much it gets boring. Menu views explain themselves
// the first time they open, in intros.ts; these tips cover the features as they unlock.)
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
    text: 'A Pokémon with a job works while you focus and earns half EXP. Each type has its own job: a Water type tends the berry bush, Ground and Rock types dig, a Flying type keeps lookout. Its choices list the jobs it can do.',
    ready: (g) => g.save.mons.length > 3,
  },
  {
    id: 'trips',
    title: 'Trips',
    text: 'Send a Pokémon on a trip from its choices: to the shore for 30 focused minutes, or the far shore for 90. It comes back with shells and finds, and sometimes an egg. At Lv15 it can reach the Kelp Bed, and further places later.',
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
    text: 'The doorway in the cliff by the pier leads to a dungeon with a guardian at the bottom. Your three strongest go in. Wooden crates open for anyone. Sealed chests need a Lantern charge, and every session of 30 minutes or more lights one.',
    ready: (g) => hours(g) >= 3,
  },
  {
    id: 'explore',
    title: 'Exploring',
    text: 'The rowboat tied by the pier goes somewhere to explore outdoors: three clearings and a heart, with wooden crates that open for anyone. Tap it on a break.',
    ready: (g) => !!g.islandDef.explore && hours(g) >= (g.islandDef.explore?.hours ?? 0),
  },
  {
    id: 'sea',
    title: 'The sea',
    text: 'After a session, bubbles in the water mean a water Pokémon is passing. Tap them and it swims ashore to wait. Bottles and crates float in too; tap them to pick them up.',
    ready: (g) => (g.save.sea?.length ?? 0) > 0 || (g.save.floats?.length ?? 0) > 0,
  },
  {
    id: 'finds',
    title: 'Finds',
    text: 'Things wash up and get dug up while you focus. Tap a sparkle on the island to pick it up.',
    ready: (g) => g.save.finds.length > 0 || hours(g) >= 1,
  },
  {
    id: 'goals',
    title: 'Goals',
    text: 'The Star Piece button on the menu strip is Goals: the next island, the landmarks to rebuild, and what the Pokédex pays.',
    ready: (g) => hours(g) >= 1,
  },
  {
    id: 'journal',
    title: 'The Journal',
    text: 'The notebook on the menu strip is your Journal. A gold dot means something new happened while you were away.',
    ready: (g) => (g.save.log?.length ?? 0) >= 5,
  },
  {
    id: 'popout',
    title: 'The small window',
    text: 'The last button on the menu strip pops the island into a small window that stays on top while you study. The clock keeps running in it.',
    ready: (g) => hours(g) >= 0.5,
  },
  {
    id: 'streak',
    title: 'Streaks and stones',
    text: 'Study on days in a row for a streak. On day 3, and every seventh day after, an evolution stone washes up.',
    ready: (g) => g.streak() >= 2 || hours(g) >= 2,
  },
  {
    id: 'starpieces',
    title: 'Star Pieces',
    text: 'Star Pieces come with every third new species and from rare finds. Spend them on habitats, landmarks and island upgrades.',
    ready: (g) => g.save.starPieces > 0 && hours(g) >= 1,
  },
  {
    id: 'arrange',
    title: 'Arranging the island',
    text: 'In Island, under Decor, press Arrange the island. Drag a decoration anywhere it fits, or put one away.',
    ready: (g) => g.save.decor.owned.length > 0,
  },
  {
    id: 'weather',
    title: 'Weather and night',
    text: 'The weather changes who comes. Rain brings Water types, and some Pokémon only come at night. The Pokédex says what each one likes.',
    ready: (g) => hours(g) >= 2,
  },
  {
    id: 'checkin',
    title: 'Still studying?',
    text: 'Without idle detection I ask if you are still studying every hour. Answer within ten minutes or the clock pauses. Every session ends on its own at six hours.',
    ready: (g) => hours(g) >= 1 && !g.save.settings.detector,
  },
  {
    id: 'tide',
    title: 'The tide',
    text: 'Each week the tide brings more of one type and one rare Pokémon. I say which at the first break of the week.',
    ready: (g) => hours(g) >= 4,
  },
  {
    id: 'sailing',
    title: 'Sailing on',
    text: 'Beat this island\'s guardian and fill enough of its Pokédex, and Goals offers the next island. Your partner comes along; the others wait here.',
    ready: (g) => g.save.guardians.length > 0 || hours(g) >= 8,
  },
  {
    id: 'deeper',
    title: 'Deeper floors',
    text: 'After a guardian is beaten, a lit run that clears it again offers three deeper floors. They give no EXP, but hold more chests.',
    ready: (g) => g.save.guardians.length > 0,
  },
  {
    id: 'coop',
    title: 'Dungeons with friends',
    text: 'At a dungeon\'s entrance, With a friend makes a room code. Up to four can play, and anyone can open a chest.',
    ready: (g) => hours(g) >= 4,
  },
  {
    id: 'sailor',
    title: 'The sailor',
    text: 'Once the pier is rebuilt, the sailor trades one Pokémon away and straight back once a week. Pokémon that evolve by trading can finish that way.',
    ready: (g) => g.restored('pier'),
  },
  {
    id: 'friends',
    title: 'Friends',
    text: 'Sign in with your Studdy email to add friends. Study at the same time to warm a Together egg, and visit, trade or send gifts on a break.',
    ready: (g) => hours(g) >= 1,
  },
]

/** How many tips to tell at one break. */
export const TIPS_PER_BREAK = 2

/** The next tip worth telling: unlocked and not yet seen. */
export function nextTip(g: Game): Tip | undefined {
  const seen = new Set(g.save.tips ?? [])
  return GUIDE.find((t) => !seen.has(t.id) && t.ready(g))
}
