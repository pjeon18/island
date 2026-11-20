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
    text: 'Press Start focusing and study. Each focused minute gives your party EXP and you a shell.',
    ready: () => true,
  },
  {
    id: 'catch',
    title: 'Catching',
    text: 'Pokémon come by while you focus and wait for your break. Tap one and throw when the ring closes on the white circle.',
    ready: (g) => g.save.wild.length > 0 || g.save.caught.length > 1,
  },
  {
    id: 'pet',
    title: 'Petting and feeding',
    text: 'Tap one of your Pokémon to pet it. Feeding it an Oran Berry gives it EXP right away.',
    ready: (g) => g.save.berries > 0 || g.save.mons.length > 1,
  },
  {
    id: 'party',
    title: 'Party and Box',
    text: 'Six Pokémon can live on the island and grow while you focus. The rest wait in the Box.',
    ready: (g) => g.save.mons.length > 2,
  },
  {
    id: 'evolve',
    title: 'Evolving',
    text: 'Most Pokémon evolve at a level. Some need a stone, and some need 10 focused hours with you.',
    ready: (g) => g.save.mons.some((m) => m.level >= 12) || Object.values(g.save.bag).some((n) => n > 0),
  },
  {
    id: 'jobs',
    title: 'Helpers and the berry bush',
    text: 'Your Pokémon can work while you focus. A Water type tends the berry bush, a Ground or Rock type digs, and a Flying type keeps watch.',
    ready: (g) => g.save.mons.length > 3,
  },
  {
    id: 'trips',
    title: 'Trips',
    text: 'You can send a Pokémon on a trip. It comes back with shells and finds, and sometimes an egg.',
    ready: (g) => g.save.mons.length > 3 && hours(g) >= 1,
  },
  {
    id: 'daycare',
    title: 'Day Care and eggs',
    text: 'Two Pokémon in the Day Care lay an egg every 90 focused minutes.',
    ready: (g) => g.save.mons.length > 4 || g.save.eggs.length > 0,
  },
  {
    id: 'habitats',
    title: 'Habitats and decorations',
    text: 'Habitats and decorations bring new kinds of Pokémon. Build them in the Island menu.',
    ready: (g) => g.save.habitats.length > 0,
  },
  {
    id: 'food',
    title: 'Food',
    text: 'Set out food before a session to draw certain types.',
    ready: (g) => hours(g) >= 2,
  },
  {
    id: 'landmarks',
    title: 'Landmarks',
    text: 'The storm wrecked the hut, the lighthouse and the old pier. Rebuilding each one opens something new.',
    ready: (g) => g.save.island === 'home' && hours(g) >= 2,
  },
  {
    id: 'dungeons',
    title: 'Dungeons and guardians',
    text: 'The doorway by the pier leads down to a dungeon. Its guardian waits at the bottom. Your three strongest Pokémon go in.',
    ready: (g) => hours(g) >= 3,
  },
  {
    id: 'explore',
    title: 'Exploring',
    text: 'The rowboat by the pier takes you somewhere to explore. Tap it on a break.',
    ready: (g) => !!g.islandDef.explore && hours(g) >= (g.islandDef.explore?.hours ?? 0),
  },
  {
    id: 'sea',
    title: 'The sea',
    text: 'Bubbles in the water mean a water Pokémon is close. Tap them and it swims ashore. Bottles and crates float in too.',
    ready: (g) => (g.save.sea?.length ?? 0) > 0 || (g.save.floats?.length ?? 0) > 0,
  },
  {
    id: 'finds',
    title: 'Finds',
    text: 'Things wash up while you focus. Tap a sparkle to pick it up.',
    ready: (g) => g.save.finds.length > 0 || hours(g) >= 1,
  },
  {
    id: 'goals',
    title: 'Goals',
    text: 'The Star Piece button is Goals. It shows what to work toward next.',
    ready: (g) => hours(g) >= 1,
  },
  {
    id: 'journal',
    title: 'The Journal',
    text: 'The Journal is in the Island menu. A gold dot on the Island button means something new happened.',
    ready: (g) => (g.save.log?.length ?? 0) >= 5,
  },
  {
    id: 'popout',
    title: 'The small window',
    text: 'The last button pops the island into a small window that stays on top while you study.',
    ready: (g) => hours(g) >= 0.5,
  },
  {
    id: 'streak',
    title: 'Streaks and stones',
    text: 'Study on days in a row. On the third day, and every seventh day after that, a stone washes up.',
    ready: (g) => g.streak() >= 2 || hours(g) >= 2,
  },
  {
    id: 'starpieces',
    title: 'Star Pieces',
    text: 'You get a Star Piece for every third new species. They pay for habitats, landmarks and upgrades.',
    ready: (g) => g.save.starPieces > 0 && hours(g) >= 1,
  },
  {
    id: 'arrange',
    title: 'Arranging the island',
    text: 'You can move your decorations. Open Island, then Decor, and press Arrange the island.',
    ready: (g) => g.save.decor.owned.length > 0,
  },
  {
    id: 'weather',
    title: 'Weather and night',
    text: 'The weather shows beside your party. Tap it to see which types it brings. Some Pokémon only come at night, and the Pokédex shows what each one likes.',
    ready: (g) => hours(g) >= 2,
  },
  {
    id: 'checkin',
    title: 'Still studying?',
    text: 'I\'ll ask if you\'re still studying every hour. If you don\'t answer within ten minutes, the clock pauses.',
    ready: (g) => hours(g) >= 1 && !g.save.settings.detector,
  },
  {
    id: 'tide',
    title: 'The tide',
    text: 'Each week the tide brings more of one type. I\'ll tell you which at your first break of the week.',
    ready: (g) => hours(g) >= 4,
  },
  {
    id: 'sailing',
    title: 'Sailing on',
    text: 'Beat the guardian at the bottom of the dungeon to open the next island. The arrows at the sides of the screen sail between islands. Your partner comes with you.',
    ready: (g) => g.save.guardians.length > 0 || hours(g) >= 8,
  },
  {
    id: 'deeper',
    title: 'Deeper floors',
    text: 'Once a guardian is beaten, clearing its dungeon again opens three deeper floors with more chests.',
    ready: (g) => g.save.guardians.length > 0,
  },
  {
    id: 'coop',
    title: 'Dungeons with friends',
    text: 'At a dungeon\'s entrance, press With a friend to get a room code. Up to four can play.',
    ready: (g) => hours(g) >= 4,
  },
  {
    id: 'sailor',
    title: 'The sailor',
    text: 'Once the pier is rebuilt, the sailor will trade one Pokémon away and back each week. That lets trade evolutions finish.',
    ready: (g) => g.restored('pier'),
  },
  {
    id: 'friends',
    title: 'Friends',
    text: 'Sign in with your Studdy email to add friends. Studying at the same time warms a Together egg.',
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
