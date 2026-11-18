// Tab intros (Paul, 2026-11-18: "each tab, window, button, feature ... should be explained").
// The first time you open a menu view, Wooper's card sits at the top of it and says what the view
// is for and what its buttons do. "Got it" puts it away for good (save.tips gets `tab:<key>`).
// The key is `tab:sub` for views with sub-tabs, else the tab.
export const INTROS: Record<string, string> = {
  'mons:party':
    'These are the Pokémon living on this island. They earn EXP while you focus. Tap one to feed it, give it a stone, or send it somewhere else.',
  'mons:helpers':
    'Helpers are Pokémon with a job or away on a trip. They work while you focus for half the EXP, and bring back berries, finds, shells or eggs.',
  'mons:box':
    'The Box holds everyone not living here. Pokémon in the Box rest and earn nothing. Tap one to bring it back or give it a job.',
  'mons:eggs':
    'Eggs warm in the nest while you focus and hatch into a new Pokémon. The bar shows how warm each one is. Eggs come from the Day Care, finds, streaks and trips.',
  'mons:bag':
    'Your Bag holds everything you carry: shells, Star Pieces, Oran Berries, balls, food and stones. Give a stone from a Pokémon\'s choices in Party or Box.',
  dex: 'The Pokédex lists every Pokémon that can come to this island. Tap one to see what draws it: a habitat, a decoration, a food, the weather or the time of day.',
  'island:habitats':
    'Habitats change who comes to the island. Each one costs Star Pieces and shells and draws the types it lists. Some open after more focused hours.',
  'island:decor':
    'Decorations are bought with shells, and each one is loved by a few Pokémon, so they come more often. Press Arrange the island to drag them anywhere they fit.',
  'island:shop':
    'Spend shells on Poké Balls and food here. Set a food out before a session and it draws certain types until the session ends. Upgrades cost Star Pieces.',
  'goals:islands':
    'Each island has its own Pokémon and a guardian deep in its dungeon. Beat the guardian and fill enough of the Pokédex, and you can sail on.',
  'goals:restore':
    'The storm wrecked the hut, the lighthouse and the old pier. Rebuild them one at a time with focused hours, species and shells. Each one opens something new.',
  'goals:milestones':
    'Filling an island\'s Pokédex pays out at a quarter, a half, three quarters and all of it: a decoration, an egg, another decoration spot, and a gift.',
  friends:
    'Sign in with your Studdy email to add friends. When you study at the same time, a Together egg warms. On a break you can visit, wave, send a gift, trade, or go into a dungeon together.',
  log: 'The Journal keeps everything that happened, newest first. The big numbers at the top count what is new since you last looked.',
  'more:focus':
    'Choose how long a session is: 30 minutes, an hour, or your own length. Idle detection pauses the clock when your screen locks; without it I ask if you are still studying every hour. The ring plays when a session ends.',
  'more:guide': 'Every tip I have told you is kept here, so you can read them again.',
  'more:settings': 'Turn sounds and music on or off and set the volume. Pop out puts the island in a small window that stays on top while you study.',
}

export const introKey = (tab: string, sub: string) => (sub ? `${tab}:${sub}` : tab)
