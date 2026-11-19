// Tab intros (Paul, 2026-11-18: "each tab, window, button, feature ... should be explained").
// The first time you open a menu view, Wooper's card sits at the top of it and says what the view
// is for and what its buttons do. "Got it" puts it away for good (save.tips gets `tab:<key>`).
// The key is `tab:sub` for views with sub-tabs, else the tab.
export const INTROS: Record<string, string> = {
  'mons:party': 'These Pokémon live on this island. They grow while you focus. Tap one to see what it can do. More, under Guide, explains each job and trip.',
  'mons:helpers': 'Helpers are working or away on a trip. They get half the EXP and bring things back.',
  'mons:box': 'The rest of your Pokémon wait in the Box. They don\'t grow here. Tap one to bring it back.',
  'mons:eggs': 'Eggs hatch while you focus. The bar shows how close each one is.',
  bag: 'This is everything you\'re carrying. Stones, balls and food all live here.',
  dex: 'This is every Pokémon that visits this island. Tap one to see what it likes.',
  'island:habitats': 'A habitat brings new kinds of Pokémon. Each one shows the types it draws.',
  'island:decor': 'Some Pokémon love certain decorations and come more often. Press Arrange the island to move them around.',
  'island:journal': 'This is everything that happened on the island. New lines are marked in gold.',
  'island:shop': 'Balls and food cost shells. Set food out before a session to draw certain types. Upgrades cost Star Pieces.',
  'goals:islands': 'Each island has its own Pokémon and a guardian at the bottom of its dungeon. Beat the guardian to sail on. The arrows at the sides of the screen take you between islands.',
  'goals:restore': 'The storm wrecked the hut, the lighthouse and the old pier. Rebuilding each one opens something new.',
  'goals:milestones': 'Filling in the Pokédex earns a reward at a quarter, a half, three quarters and all of it.',
  friends: 'Sign in with your Studdy email to add friends. If you study at the same time, you warm a Together egg.',
  'more:focus': 'Pick how long a session runs. With idle detection on, the clock pauses when your screen locks. Otherwise I check in every hour.',
  'more:guide': 'This explains how things work and keeps every tip I\'ve told you.',
  'more:settings': 'Pop out keeps the island in a small window on top of your work.',
}

/** Views that moved (2026-11-18): a card already put away under the old key stays away. */
export const OLD_INTRO: Record<string, string> = { bag: 'mons:bag', 'island:journal': 'log' }

export const introKey = (tab: string, sub: string) => (sub ? `${tab}:${sub}` : tab)
