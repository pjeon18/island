// The rules, kept apart from drawing. docs/GAME_DESIGN.md is the loop (stage 1,
// catching: passers-by arrive while you focus and wait for your break, balls
// come from the shop, a throw's odds depend on the ball and the timing ring).
// docs/LOOP.md is the pricing law:
// one focused minute is the only unit. Each minute gives every party Pokémon
// 1 EXP and you 1 shell; level L → L+1 costs L EXP; a finished session brings
// a visitor and ripens berries; streaks wash stones ashore; bond unlocks
// friendship evolutions. Choices (befriend, feed, stones, party, decorations)
// happen between sessions, and evolutions play out while you focus.

export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'deep' | 'baby'
export interface Evolution {
  dex: number
  level?: number
  item?: string
  friendship?: boolean
  time?: 'day' | 'night' | null
  trade?: boolean // finishes by trading (docs/CONTENT_PLAN.md, social)
}
export interface SpeciesInfo {
  name: string
  types?: string[]
  needs?: Habitat // a habitat that must be built before it comes at all
  time?: 'night' | 'morning' // night: only at night; morning: likelier from 5 to 10
  islands?: IslandId[] // where it passes by (default: home)
  guardian?: IslandId // this island's guardian: never passes by
  evolvesTo: Evolution[]
  stage: number
  line: number
  rarity?: Rarity
  season?: 'spring' | 'summer' | 'autumn' | 'winter' // only comes in this season
}
export type Roster = Record<string, SpeciesInfo>

export interface Mon {
  id: string
  dex: number
  level: number
  exp: number // EXP into the current level
  focusedMin: number // bond: minutes spent focusing in the party
  metAt: number
  noEvolve?: boolean // you stopped its evolution; it waits until you allow it
  heldItem?: string // a stone given in a break; it evolves during the next session
  home?: IslandId // for a helper: the island it works on (shown there only)
  shiny?: boolean
}

export type SessionState = 'running' | 'asking' | 'away'
export interface Session {
  startedAt: number
  length: number | null // seconds; null = open session
  credited: number // verified focused seconds
  granted: number // whole minutes already turned into EXP
  lastBeat: number
  state: SessionState
  askSince?: number
  askReason?: 'idle' | 'checkin'
  idleSince?: number
  nextCheck: number // credited seconds at which the next check-in is due
  nextVisit: number // credited seconds at which an open session ripens a berry
  nextPasser?: number // credited seconds at which the next passer-by arrives
  nextFind?: number // credited seconds at which a party Pokémon may find something
  nextWeather?: number
  clean?: boolean // no step-aways so far: a focused session draws better passers-by
}

/** A wild Pokémon that came by during focus and waits on the island for your break. */
export interface Wild {
  id: string
  dex: number
  level: number
  tries: number // failed throws make the next one a little likelier
  guide?: boolean // the tutorial's first catch: it always works
  shiny?: boolean // about 1 in 150 in a clean hour-long session (L5)
}
export type Ball = 'poke-ball' | 'great-ball' | 'ultra-ball'
export type FindKind = 'shells' | 'berry' | 'poke-ball' | 'star-piece' | 'stone'
/** Something a party Pokémon dug up, lying on the island until you pick it up. */
export interface Find {
  id: string
  by?: string // the helper that dug it up, if any
  kind: FindKind
  n: number
  item?: string // which stone, for a stone
  x?: number
  y?: number
}
export type Weather = 'clear' | 'rain' | 'fog' | 'sun' | 'snow'
export type Habitat = 'pond' | 'rocks' | 'grass' | 'cave'

// ---------- islands (stage 4) ----------
export type IslandId = 'home' | 'frost'
export const ISLANDS: {
  id: IslandId
  name: string
  guardian: { dex: number; level: number; where: string }
  dungeon: string // the gate dungeon (public/dungeons/<id>.json); the guardian is its boss
  unlock?: { from: IslandId; share: number; hours: number }
}[] = [
  { id: 'home', name: 'Home Island', guardian: { dex: 143, level: 36, where: 'asleep at the bottom of Pier Hollow' }, dungeon: 'pier-hollow' },
  { id: 'frost', name: 'Frost Isle', guardian: { dex: 131, level: 58, where: 'resting at the bottom of Glacier Grotto' }, dungeon: 'glacier-grotto', unlock: { from: 'home', share: 0.7, hours: 20 } },
]
/** The island grows with your total focused hours. */
export const GROWTH: { hours: number; text: string }[] = [
  { hours: 3, text: 'Two more decoration spots' },
  { hours: 10, text: 'A cave can be dug into the cliff' },
]
/** Each island keeps its own habitats, decorations, finds and food. */
export interface IslandState {
  habitats: Habitat[]
  decor: { owned: string[]; slots: Record<string, string | null> }
  finds: Find[]
  bait: string | null
}

// ---------- helpers: eggs, Day Care, jobs, expeditions (stage 3) ----------
export interface Egg {
  id: string
  dex: number // the first stage that hatches
  need: number // focused minutes to hatch
  progress: number
  source: 'daycare' | 'streak' | 'find' | 'expedition' | 'gift'
  fast?: boolean // from a pair that shares a type: it warms a quarter faster (L6)
}
export type JobId = 'bush' | 'dig' | 'lookout' | 'campfire' | 'garden' | 'generator' | 'fortune'
/** One Pokémon per job. Interval in focused minutes at level 1; stronger Pokémon work faster. */
export const JOBS: { id: JobId; name: string; types: string[]; every: number; floor: number; needsDecor?: string; needsLandmark?: string; does: string }[] = [
  { id: 'bush', name: 'Berry bush', types: ['water'], every: 30, floor: 12, does: 'An extra Oran Berry' },
  { id: 'dig', name: 'Digging', types: ['ground', 'rock'], every: 24, floor: 16, does: 'An extra find' },
  { id: 'lookout', name: 'Lookout', types: ['flying'], every: 40, floor: 18, does: 'An extra passer-by' },
  // review 2 B5: dig and campfire floors raised (10 → 16, 6 → 10) so focus stays the main income
  { id: 'campfire', name: 'Campfire', types: ['fire'], every: 14, floor: 10, needsDecor: 'campfire', does: '3 extra shells' },
  // 2026-11-12 (docs/CONTENT_PLAN.md, L9): jobs for grass, electric and psychic types
  { id: 'garden', name: 'Garden', types: ['grass'], every: 40, floor: 20, does: 'A food for the dish' },
  { id: 'generator', name: 'Generator', types: ['electric'], every: 60, floor: 60, needsLandmark: 'lighthouse', does: 'Keeps the lighthouse lit' },
  { id: 'fortune', name: 'Fortune', types: ['psychic'], every: 60, floor: 60, does: 'Shows who is likely to come next' },
]
export const jobEvery = (job: (typeof JOBS)[number], level: number) => Math.max(job.floor, Math.round(job.every - level / 2))
export const EGG_MAX = 3
export const DAYCARE_EVERY = 90 // focused minutes with two Pokémon in the Day Care → an egg (review 2 B9: was 45)
export const EXPEDITIONS = [
  { id: 'short', name: 'Short trip', minutes: 30 },
  { id: 'long', name: 'Long trip', minutes: 90 },
] as const
export type Role = 'party' | 'box' | 'daycare' | 'expedition' | `job:${JobId}`
export interface Expedition {
  id: string // the Pokémon
  long: boolean
  need: number
  progress: number
}
export interface Haul {
  shells: number
  items: { kind: 'berry' | Ball | 'star-piece' | 'food' | 'stone'; id?: string; n: number }[]
  egg?: Egg
}

// ---------- lures (docs/GAME_DESIGN.md, stage 2) ----------
/** Habitats are built once, on their own spot, with Star Pieces and shells. */
export const HABITATS: { id: Habitat; name: string; stars: number; shells: number; types: string[] }[] = [
  { id: 'grass', name: 'Tall grass', stars: 2, shells: 60, types: ['bug', 'grass'] },
  { id: 'rocks', name: 'Rocks', stars: 2, shells: 80, types: ['rock', 'ground'] },
  { id: 'pond', name: 'Pond', stars: 3, shells: 100, types: ['water'] },
  { id: 'cave', name: 'Cave', stars: 3, shells: 120, types: ['rock', 'ghost', 'poison', 'dark'] },
]
export const HABITAT_HOURS: Partial<Record<Habitat, number>> = { cave: 10 }
/** Food you set out before a session; it is eaten when the session ends. */
export const FOODS: { id: string; name: string; price: number; types: string[] }[] = [
  { id: 'honey', name: 'Honey', price: 15, types: ['bug', 'grass', 'flying'] },
  { id: 'cheri-berry', name: 'Cheri Berry', price: 15, types: ['fire', 'electric'] },
  { id: 'pecha-berry', name: 'Pecha Berry', price: 15, types: ['water', 'ground', 'normal'] },
  { id: 'chesto-berry', name: 'Chesto Berry', price: 15, types: ['ghost', 'dark', 'psychic'] },
  // 2026-11-12 (L9): nothing drew ice, bug and steel, or fighting and dragon types
  { id: 'aspear-berry', name: 'Aspear Berry', price: 15, types: ['ice'] },
  { id: 'rawst-berry', name: 'Rawst Berry', price: 15, types: ['bug', 'steel'] },
  { id: 'persim-berry', name: 'Persim Berry', price: 15, types: ['fighting', 'dragon'] },
]
export const WEATHER_TYPES: Record<Weather, string[]> = { clear: [], rain: ['water', 'electric'], sun: ['grass', 'fire'], fog: ['ghost', 'normal', 'psychic'], snow: ['ice', 'water'] }
/** Each decoration has a few Pokémon that love it. */
export const DECOR_LOVES: Record<string, number[]> = {
  flowers: [43, 187, 1],
  stones: [74, 194],
  mushrooms: [92, 43],
  sign: [16, 396],
  bench: [133, 25],
  umbrella: [7, 54],
  lantern: [163, 92],
  campfire: [4],
  windmill: [16, 396, 187],
  snowman: [361, 225],
  icecarving: [363, 215],
  aurora: [238, 459],
  // 2026-11-12 (L9): the nine species no decoration drew
  rockpool: [60, 90, 86, 393],
  lightningrod: [179, 403],
  batroost: [41],
  leafpile: [10],
  mudpatch: [220],
}
export const isNightHour = (h: number) => h >= 19 || h < 5
/** The real calendar's season (northern hemisphere): March to May is spring, and so on. */
export const seasonOf = (t: number) => (['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'] as const)[new Date(t).getMonth()]
/** What is drawing Pokémon right now; built by Game.lure(). */
export interface Lure {
  long: boolean // an hour-long session (or an open one past an hour): rare ones can come
  clean: boolean
  hour: number
  weather: Weather
  habitats: Habitat[]
  bait: string | null
  decor: string[]
}

export interface Save {
  v: 1
  party: string[]
  mons: Mon[]
  session: Session | null
  days: Record<string, number> // local date → focused minutes
  settings: { length: number | null; detector: boolean; sound?: boolean }
  seen: number[] // species that have visited or that you have raised
  caught: number[] // species you have owned
  shells: number
  berries: number
  bag: Record<string, number> // stones
  decor: { owned: string[]; slots: Record<string, string | null> }
  visits: { day: string; count: number }
  stonesPaid: string[] // `${day}:${streak}` milestones already paid
  breakUntil: number | null
  wild: Wild[]
  balls: Record<Ball, number>
  starPieces: number
  finds: Find[]
  weather: { kind: Weather; until: number }
  passers: { day: string; count: number }
  habitats: Habitat[]
  foods: Record<string, number>
  bait: string | null
  eggs: Egg[]
  daycare: { ids: (string | null)[]; progress: number }
  jobs: Partial<Record<JobId, string>>
  jobProgress: Partial<Record<JobId, number>>
  expedition: Expedition | null
  carry: Record<string, number> // half-EXP remainders for helpers
  island: IslandId
  stash: Partial<Record<IslandId, IslandState>>
  guardians: IslandId[] // beaten
  eggQueue: number[] // gifted eggs waiting for room in the nest
  log: LogEntry[] // the journal: what happened on the island, newest last
  logSeen: number // when the journal was last opened
  tutorial: TutorialStep // where a new player is in the opening (tutorial.ts)
  partner?: string // your starter: it lives on every island
  parties: Partial<Record<IslandId, string[]>> // other islands' residents while you are away from them
  upgrades: string[] // island upgrades bought with Star Pieces (UPGRADES)
  restored?: string[] // landmarks restored (RESTORE, docs/CONTENT_PLAN.md L1)
  dexPaid?: string[] // Pokédex milestones already paid, as `${island}:${percent}` (L5)
  extraSlots?: number // decoration spots from Pokédex milestones (decor.ts SLOTS milestone)
  shinies?: number[] // species you have caught shiny
  togetherMin?: number // focused minutes with a friend; they count twice toward restoration
  lanterns: number // Lantern charges: one per finished session of 30+ minutes, up to LANTERN_MAX; a charged dungeon run opens chests
  deepTries: Record<string, number> // failed throws at each dungeon's special Pokémon (each makes the next likelier)
}

/** Dungeon loot needs a Lantern charge (Paul, 2026-11-11): focus stays the only real currency. */
export const LANTERN_MAX = 2
/** The special Pokémon deep in each dungeon, caught after a charged clear. */
export const DEEP: Record<string, number[]> = { 'pier-hollow': [246, 304], 'glacier-grotto': [147] }

/** Island upgrades: the long-term place for Star Pieces to go (review 2026-11-11). */
export const UPGRADES: { id: string; name: string; text: string; stars: number }[] = [
  { id: 'nest', name: 'Bigger nest', text: 'Room for a fourth egg.', stars: 5 },
  { id: 'warmsand', name: 'Warm sand', text: 'Eggs hatch a quarter faster.', stars: 6 },
  { id: 'longpier', name: 'Longer pier', text: 'A fifth Pokémon can wait for your break.', stars: 8 },
]

/**
 * The restoration story (docs/CONTENT_PLAN.md, L1, 2026-11-12). Home Island's three ruined
 * landmarks are rebuilt with focused hours and species brought back, plus some shells and
 * Star Pieces; they can't simply be bought. Minutes focused with a friend count twice.
 */
export const RESTORE: { id: string; name: string; hours: number; species: number; shells: number; stars: number; guardian?: IslandId; opens: string; story: string[] }[] = [
  {
    id: 'hut', name: 'Pokémon Center hut', hours: 15, species: 20, shells: 800, stars: 3,
    opens: 'A third Day Care spot, and eggs warm a quarter faster.',
    story: ['The Pokémon Center hut is open again!', 'Before the storm, travelers rested here on their way between the islands.', 'With its beds back, the Day Care has room for one more.'],
  },
  {
    id: 'lighthouse', name: 'Lighthouse', hours: 30, species: 35, shells: 1500, stars: 6,
    opens: 'The Lookout works twice as fast at night. An Electric type on the Generator lights it, which draws night Pokémon by day and makes room for one more to wait.',
    story: ['The lighthouse is standing again.', 'The storm that woke Snorlax and Lapras put its light out, and nobody could find the island in the dark.', 'If an Electric type keeps it running, Pokémon will see it from far away.'],
  },
  {
    id: 'pier', name: 'The old pier', hours: 50, species: 50, shells: 2500, stars: 10, guardian: 'home',
    opens: 'The sail to Ember Cove.',
    story: ['The old pier reaches the deep water again.', 'Out past the reef there is a warm island. Its guardian woke in the same storm.', 'We can sail to Ember Cove now.'],
  },
]

/** The opening, in order. Saves from before the tutorial existed load as 'done'. */
export type TutorialStep = 'prologue' | 'meet' | 'catch' | 'build' | 'focus' | 'done'
export const GUIDE_DEX = 194 // Wooper, who lives on the island alone at the start
export const GUIDE_CATCH = 16 // Pidgey, the first catch
export const GUIDE_GIFT = { shells: 100, starPieces: 3 } // exactly the Pond

/** One line in the journal. `kind` feeds the summary at its top; `key` lets a newer line replace an older one (level-ups). */
export type LogKind = 'focus' | 'visit' | 'catch' | 'hatch' | 'level' | 'evolve' | 'find' | 'friend' | 'other'
export interface LogEntry {
  t: number
  text: string
  kind: LogKind
  dex?: number
  n?: number
  key?: string
}
export const LOG_MAX = 200

// Each island has its own residents, up to 6 (Paul, 2026-11-11): only they (and helpers at work)
// gain EXP. Your starter is your partner and lives on every island.
export const PARTY_MAX = 6
export const START_LEVEL = 5
export const MAX_GAP = 90 // seconds: a beat is worth at most this much wall time
export const AWAY_GAP = 5 * 60 // a gap this long means you were gone
// Paul, 2026-11-11: a check-in can land in your most focused minutes, so ask rarely and
// wait long. Without idle detection, "Still studying?" comes at 1 and 2 hours; you have
// 10 minutes to answer (the wait counts when you do); every session ends itself at 3 hours.
export const CHECKIN_EVERY = 60 * 60 // without idle detection
export const ANSWER_WINDOW = 10 * 60
export const MAX_SESSION = 3 * 60 * 60
// session lengths (Paul, 2026-11-12: 30 minutes and an hour, was 25 and 50)
export const SHORT_SESSION = 30 * 60
export const LONG_SESSION = 60 * 60
export const OPEN_COMPLETE = SHORT_SESSION // an Open session must reach this to count as complete
export const FLEE_AFTER = 3 // break-frees before a rare Pokémon or starter runs off
export const IDLE_THRESHOLD = 10 * 60 // idle detector threshold
export const OPEN_VISIT_EVERY = 30 * 60
export const EXP_PER_MIN = 2 // (Paul, 2026-11-11) with a steeper level cost, below
export const BERRY_EXP = 20 // the least a berry gives: ten focused minutes
/** Review 2 B11: a berry gives a quarter of the next level's cost, at least BERRY_EXP, so it still matters past Lv30. */
export const berryExp = (level: number) => Math.max(BERRY_EXP, Math.round(expToNext(level) / 4))
export const BERRIES_MAX = 9 // the bush holds this many
export const BOND_FOR_FRIENDSHIP = 10 * 60 // focused minutes together
export const VISITS_PER_DAY = 12
export const BREAK_SECONDS = 5 * 60
// a stone on streak day 3, then every 7th day with no end (review 2026-11-11: the old 3/7/14/30
// paid four ever and rewarded breaking the streak)
export const isStoneDay = (n: number) => n === 3 || (n >= 7 && n % 7 === 0)
export const RARE_LONG = 3.3 // rare-weight multiplier for a finished hour-long session
export const STONES = ['thunder-stone', 'water-stone', 'fire-stone', 'leaf-stone', 'ice-stone', 'sun-stone', 'dawn-stone']
// catching (docs/GAME_DESIGN.md, stage 1)
export const PASSER_EVERY = 12 * 60 // a passer-by every 12 focused minutes
export const WILD_MAX = 4 // at most this many wait on the island at once (review 2026-11-11: 3 lost a long session's fourth)
export const PASSERS_PER_DAY = 24
export const FIND_EVERY = 9 * 60
export const WEATHER_EVERY = 15 * 60
export const SHINY_ODDS = 1 / 150
/** Each island's Pokédex pays out at these shares (L5). */
export const DEX_MILESTONES = [25, 50, 75, 100]
/** A 25% milestone gives the first of these you don't own yet (decor.ts CATALOG ids). */
const MILESTONE_DECOR = ['windmill', 'lantern', 'umbrella', 'bench', 'rockpool', 'batroost', 'lightningrod', 'sign', 'mushrooms', 'flowers']
export const FRIENDLY_VISIT_CHANCE = 0.25 // the old visitor, now a minor extra after a full session
export const BALLS: { id: Ball; name: string; price: number; mult: number }[] = [
  { id: 'poke-ball', name: 'Poké Ball', price: 8, mult: 1 },
  { id: 'great-ball', name: 'Great Ball', price: 15, mult: 1.5 },
  { id: 'ultra-ball', name: 'Ultra Ball', price: 30, mult: 2 },
]
const CATCH_BASE: Record<Rarity, number> = { common: 0.7, uncommon: 0.5, rare: 0.35, starter: 0.3, deep: 0.25, baby: 0.5 }

export const SAVE_KEY = 'island-save-v1'
const KEY = SAVE_KEY

/** EXP to go from `level` to the next: L + L²/25. About 10 hours to Lv36 at 2 EXP a minute; early levels come fast. */
export const expToNext = (level: number) => level + Math.round((level * level) / 25)
export const stoneName = (item: string) => item.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
/** "a Water Stone", "an Ice Stone" */
export const aStone = (item: string) => `${/^[aeiou]/i.test(item) ? 'an' : 'a'} ${stoneName(item)}`
export const isDay = (t = Date.now()) => {
  const h = new Date(t).getHours()
  return h >= 6 && h < 18
}

export function dayKey(t = Date.now()) {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function emptySave(): Save {
  return {
    v: 1,
    party: [],
    mons: [],
    session: null,
    days: {},
    settings: { length: SHORT_SESSION, detector: false },
    seen: [],
    caught: [],
    shells: 0,
    berries: 0,
    bag: {},
    decor: { owned: [], slots: {} },
    visits: { day: '', count: 0 },
    stonesPaid: [],
    breakUntil: null,
    wild: [],
    balls: { 'poke-ball': 5, 'great-ball': 0, 'ultra-ball': 0 },
    starPieces: 0,
    finds: [],
    weather: { kind: 'clear', until: 0 },
    passers: { day: '', count: 0 },
    habitats: [],
    foods: {},
    bait: null,
    eggs: [],
    daycare: { ids: [null, null], progress: 0 },
    jobs: {},
    jobProgress: {},
    expedition: null,
    carry: {},
    island: 'home',
    stash: {},
    guardians: [],
    eggQueue: [],
    log: [],
    logSeen: 0,
    tutorial: 'prologue',
    parties: {},
    upgrades: [],
    lanterns: 0,
    deepTries: {},
  }
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Save
      if (s && s.v === 1 && Array.isArray(s.mons)) {
        const m = { ...emptySave(), ...s }
        if (!s.tutorial) m.tutorial = s.mons.length ? 'done' : 'prologue'
        if (!m.partner && m.mons.length) m.partner = m.mons[0].id
        // 25 and 50 minutes became 30 and 60 (Paul, 2026-11-12)
        if (m.settings.length === 25 * 60) m.settings.length = SHORT_SESSION
        if (m.settings.length === 50 * 60) m.settings.length = LONG_SESSION
        // your partner lives on every island: put it on this one if it is free
        const pid = m.partner
        const busy = !!pid && (m.daycare.ids.includes(pid) || Object.values(m.jobs).includes(pid) || m.expedition?.id === pid)
        if (pid && !busy && !m.party.includes(pid) && m.party.length < PARTY_MAX) m.party.unshift(pid)
        // T1 saves have no caught list: everything owned counts
        for (const mon of m.mons) if (!m.caught.includes(mon.dex)) m.caught.push(mon.dex)
        return m
      }
    }
  } catch {}
  return emptySave()
}

export type GameEvent =
  | { type: 'levelUp'; mon: Mon }
  | { type: 'evolveReady'; mon: Mon; to: number }
  | { type: 'boxEvolved'; mon: Mon; from: string }
  | { type: 'sessionStart' }
  | { type: 'sessionEnd'; minutes: number; complete: boolean; berries: number; capped?: boolean }
  | { type: 'visit'; rareMult: number }
  | { type: 'visitCapped' }
  | { type: 'ask'; reason: 'idle' | 'checkin' }
  | { type: 'away'; reason: 'idle' | 'checkin' | 'locked' | 'gap'; retractedMin: number }
  | { type: 'back' }
  | { type: 'partyChanged' }
  | { type: 'minute'; n: number }
  | { type: 'stone'; item: string; streak: number }
  | { type: 'fed'; mon: Mon; levels: number; exp: number }
  | { type: 'retract'; minutes: number }
  | { type: 'passer'; wild: Wild }
  | { type: 'wildLeave'; ids: string[] }
  | { type: 'find'; find: Find }
  | { type: 'weather'; kind: Weather }
  | { type: 'caught'; wild: Wild; mon: Mon; newSpecies: boolean; star?: boolean }
  | { type: 'habitat'; id: Habitat }
  | { type: 'bait'; food: string | null }
  | { type: 'egg'; egg: Egg }
  | { type: 'hatching'; egg: Egg }
  | { type: 'hatch'; egg: Egg; mon: Mon }
  | { type: 'job'; job: JobId; mon: Mon }
  | { type: 'expeditionOut'; mon: Mon }
  | { type: 'expeditionBack'; mon: Mon; haul: Haul }
  | { type: 'rolesChanged' }
  | { type: 'sail'; to: IslandId }
  | { type: 'guardian'; island: IslandId; win: boolean }
  | { type: 'restored'; id: string }
  | { type: 'milestone'; island: IslandId; pct: number; reward: string } // reward: a decoration id, 'egg', 'slot', 'togepi', 'statue' or 'shells'

export class Game {
  save: Save
  /** Friends focusing at the same time as you (set by main.ts from the friends list). */
  together: string[] = []
  /** The hour as the island sees it; main.ts swaps this for the debug clock. */
  hour = () => {
    const d = new Date(this.now())
    return d.getHours() + d.getMinutes() / 60
  }
  private listeners: ((e: GameEvent) => void)[] = []
  now = () => Date.now()

  constructor(public roster: Roster) {
    this.save = loadSave()
    this.backfillDex()
  }

  /** Everything you own, and every earlier form you raised it from, counts as seen and befriended. */
  private backfillDex() {
    const parent = new Map<number, number>()
    for (const [k, s] of Object.entries(this.roster)) for (const e of s.evolvesTo) parent.set(e.dex, Number(k))
    for (const m of this.save.mons) {
      for (let d: number | undefined = m.dex; d; d = parent.get(d)) this.mark(d, true)
    }
    for (const d of this.save.caught) if (!this.save.seen.includes(d)) this.save.seen.push(d)
  }

  on(fn: (e: GameEvent) => void) {
    this.listeners.push(fn)
  }
  private emit(e: GameEvent) {
    for (const fn of this.listeners) fn(e)
  }
  /** Write a line in the journal. A line with the same key from the last few replaces the older one. */
  note(kind: LogKind, text: string, o: { dex?: number; n?: number; key?: string } = {}) {
    const log = this.save.log
    if (o.key) {
      const i = log.findIndex((x, j) => j >= log.length - 8 && x.key === o.key)
      if (i >= 0) {
        if (o.n != null) o = { ...o, n: o.n + (log[i].n ?? 0) }
        log.splice(i, 1)
      }
    }
    log.push({ t: this.now(), text, kind, ...o })
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX)
    this.persist()
  }
  /** Pick up changes another window wrote. */
  reload() {
    this.save = loadSave()
    this.backfillDex()
    this.emit({ type: 'partyChanged' })
  }
  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.save))
    } catch {}
  }

  // ---------- Pokémon ----------
  species(dex: number) {
    return this.roster[String(dex)]
  }
  name(m: Mon | number) {
    return this.species(typeof m === 'number' ? m : m.dex)?.name ?? '???'
  }
  mon(id: string) {
    return this.save.mons.find((m) => m.id === id)
  }
  get party() {
    return this.save.party.map((id) => this.mon(id)).filter(Boolean) as Mon[]
  }
  get hasStarter() {
    return this.save.mons.length > 0
  }
  get inSession() {
    return !!this.save.session
  }
  private mark(dex: number, caught: boolean) {
    if (!this.save.seen.includes(dex)) this.save.seen.push(dex)
    if (caught && !this.save.caught.includes(dex)) {
      this.save.caught.push(dex)
      this.checkMilestones()
    }
  }  /**
   * Pokédex milestones (L5): at 25% a decoration, 50% an egg, 75% a decoration spot, and 100%
   * Wooper's Togepi egg on Home or a Pokédex statue elsewhere. Each is paid once.
   */
  checkMilestones() {
    const s = this.save
    for (const isl of ISLANDS) {
      const share = this.dexOf(isl.id).share * 100
      for (const pct of DEX_MILESTONES) {
        const key = `${isl.id}:${pct}`
        if (share < pct || s.dexPaid?.includes(key)) continue
        s.dexPaid = [...(s.dexPaid ?? []), key]
        let reward = ''
        if (pct === 25) {
          const free = MILESTONE_DECOR.find((d) => !s.decor.owned.includes(d))
          if (free) s.decor.owned.push(free)
          else s.shells += 200
          reward = free ?? 'shells'
        } else if (pct === 50) {
          const dex = this.randomEggDex(true)
          if (!this.addEgg(dex, 'gift')) s.eggQueue.push(dex)
          reward = 'egg'
        } else if (pct === 75) {
          s.extraSlots = (s.extraSlots ?? 0) + 1
          reward = 'slot'
        } else if (isl.id === 'home') {
          if (!this.addEgg(175, 'gift')) s.eggQueue.push(175)
          reward = 'togepi'
        } else {
          if (!s.decor.owned.includes('statue')) s.decor.owned.push('statue')
          reward = 'statue'
        }
        this.persist()
        this.emit({ type: 'milestone', island: isl.id, pct, reward })
      }
    }
  }


  addMon(dex: number, level: number): Mon {
    const m: Mon = { id: Math.random().toString(36).slice(2, 10), dex, level, exp: 0, focusedMin: 0, metAt: this.now() }
    this.save.mons.push(m)
    this.mark(dex, true)
    if (this.save.party.length < PARTY_MAX) this.save.party.push(m.id)
    this.persist()
    this.emit({ type: 'partyChanged' })
    return m
  }

  chooseStarter(dex: number) {
    if (this.hasStarter) return
    this.save.partner = this.addMon(dex, START_LEVEL).id
    this.persist()
  }
  get eggMax() {
    return EGG_MAX + (this.save.upgrades.includes('nest') ? 1 : 0)
  }
  get wildMax() {
    return WILD_MAX + (this.save.upgrades.includes('longpier') ? 1 : 0) + (this.lighthouseLit ? 1 : 0)
  }
  /** Has this landmark been restored (docs/CONTENT_PLAN.md, L1)? */
  restored(id: string) {
    return !!this.save.restored?.includes(id)
  }
  /** The lighthouse is restored and a Generator helper keeps it lit. */
  get lighthouseLit() {
    const id = this.save.jobs.generator
    return this.restored('lighthouse') && !!id && !!this.mon(id)
  }
  buyUpgrade(id: string) {
    const u = UPGRADES.find((x) => x.id === id)
    if (!u || this.save.session || this.save.upgrades.includes(id) || this.save.starPieces < u.stars) return false
    this.save.starPieces -= u.stars
    this.save.upgrades.push(id)
    this.persist()
    return true
  }
  /** Frost Isle is open (or has been visited), so its decorations are for sale. */
  get frostOpen() {
    return this.save.island === 'frost' || !!this.save.stash.frost || this.canSail('frost')
  }
  /** Your starter: it lives on every island and never leaves the party. */
  isPartner(id: string) {
    return this.save.partner === id
  }
  /** Which other island a resting Pokémon lives on, if any. */
  livesOn(id: string): IslandId | null {
    if (this.isPartner(id)) return null
    for (const [isl, ids] of Object.entries(this.save.parties)) if (isl !== this.save.island && ids?.includes(id)) return isl as IslandId
    return null
  }

  /** Where a Pokémon is: in the party, a helper (Day Care, a job, an expedition), or resting in the box. */
  roleOf(id: string): Role {
    const s = this.save
    if (s.party.includes(id)) return 'party'
    if (s.daycare.ids.includes(id)) return 'daycare'
    if (s.expedition?.id === id) return 'expedition'
    for (const j of JOBS) if (s.jobs[j.id] === id) return `job:${j.id}`
    return 'box'
  }
  /** Helpers who work on the island you are on (the others keep working where you put them). */
  get helpersHere() {
    return this.helpers.filter((m) => (m.home ?? 'home') === this.save.island)
  }
  /** Helpers on the island (Day Care and jobs) walk around like the party. */
  get helpers() {
    const s = this.save
    const ids = [...s.daycare.ids.filter(Boolean), ...Object.values(s.jobs).filter(Boolean)] as string[]
    return ids.map((id) => this.mon(id)).filter(Boolean) as Mon[]
  }
  /** Everyone gaining EXP from focus that is not in the party. */
  private get workers() {
    const out = this.helpers
    const e = this.save.expedition && this.mon(this.save.expedition.id)
    if (e) out.push(e)
    return out
  }
  canDoJob(m: Mon, job: JobId) {
    const j = JOBS.find((x) => x.id === job)!
    if (j.needsDecor && !Object.values(this.save.decor.slots).includes(j.needsDecor)) return false
    if (j.needsLandmark && !this.restored(j.needsLandmark)) return false
    return !!this.species(m.dex)?.types?.some((t) => j.types.includes(t))
  }
  /** Move a Pokémon to a new role. Only between sessions; the party never drops below one. */
  assign(id: string, role: Role) {
    const s = this.save
    const m = this.mon(id)
    if (!m || s.session) return false
    const from = this.roleOf(id)
    if (from === role) return true
    if (from === 'expedition') return false // it is away until it comes back
    if (from === 'party' && s.party.length <= 1) return false
    if (from === 'party' && this.isPartner(id)) return false // your partner stays with you
    // check the destination has room
    if (role === 'party' && s.party.length >= PARTY_MAX) return false
    if (role === 'daycare' && !s.daycare.ids.includes(null)) return false
    if (role === 'expedition' && s.expedition) return false
    if (role.startsWith('job:')) {
      const job = role.slice(4) as JobId
      if (s.jobs[job] || !this.canDoJob(m, job)) return false
    }
    // leave the old role
    if (from === 'party') s.party.splice(s.party.indexOf(id), 1)
    if (from === 'daycare') {
      s.daycare.ids[s.daycare.ids.indexOf(id)] = null
      s.daycare.progress = 0
    }
    if (from.startsWith('job:')) delete s.jobs[from.slice(4) as JobId]
    // take the new one
    if (role === 'party') {
      s.party.push(id)
      // it moves here: no longer a resident of any other island
      for (const ids of Object.values(s.parties)) if (ids?.includes(id)) ids.splice(ids.indexOf(id), 1)
    }
    if (role !== 'party' && role !== 'box') m.home = s.island
    if (role === 'daycare') s.daycare.ids[s.daycare.ids.indexOf(null)] = id
    if (role.startsWith('job:')) {
      const job = role.slice(4) as JobId
      s.jobs[job] = id
      s.jobProgress[job] = 0
    }
    this.persist()
    this.emit({ type: 'partyChanged' })
    this.emit({ type: 'rolesChanged' })
    return true
  }
  /** Send a Pokémon (not the last one in the party) on an expedition. */
  sendExpedition(id: string, long: boolean) {
    const m = this.mon(id)
    if (!m || this.save.session || this.save.expedition) return false
    if (!this.assign(id, 'box')) return false
    this.save.expedition = { id, long, need: long ? 90 : 30, progress: 0 }
    this.persist()
    this.emit({ type: 'expeditionOut', mon: m })
    this.emit({ type: 'rolesChanged' })
    return true
  }

  /** Party changes only between sessions. Returns false if refused. */
  setInParty(id: string, on: boolean) {
    return this.assign(id, on ? 'party' : 'box')
  }

  /** Which evolutions this Pokémon could ever take, with a plain description. */
  evolutionOptions(m: Mon) {
    return (this.species(m.dex)?.evolvesTo ?? []).filter((e) => this.species(e.dex))
  }

  /**
   * The evolution this Pokémon has reached, if any. Level and friendship
   * evolutions trigger on their own; a stone only once you have given it one.
   */
  evolutionDue(m: Mon, t = this.now()) {
    if (m.noEvolve) return null
    for (const e of this.evolutionOptions(m)) {
      if (e.level && m.level >= e.level) return e.dex
      if (e.item && m.heldItem === e.item && (!e.time || (e.time === 'day') === isDay(t))) return e.dex
      if (e.friendship && m.focusedMin >= BOND_FOR_FRIENDSHIP && (!e.time || (e.time === 'day') === isDay(t))) return e.dex
    }
    return null
  }
  evolve(m: Mon, to: number) {
    m.dex = to
    m.heldItem = undefined
    this.mark(to, true)
    this.persist()
  }
  stopEvolution(m: Mon) {
    m.noEvolve = true
    this.persist()
  }
  allowEvolution(m: Mon) {
    m.noEvolve = false
    this.persist()
  }

  // ---------- break-time choices ----------
  /** Give a berry (berryExp) to any Pokémon, party or box. Only between sessions. */
  feed(id: string) {
    const m = this.mon(id)
    if (!m || this.save.session || this.save.berries <= 0) return false
    this.save.berries--
    const before = m.level
    const exp = berryExp(m.level)
    this.addExp(m, exp)
    this.persist()
    this.emit({ type: 'fed', mon: m, levels: m.level - before, exp })
    return true
  }
  /** Give a stone; the evolution happens during the next focus session. */
  giveStone(id: string, item: string) {
    const m = this.mon(id)
    if (!m || this.save.session || !this.save.bag[item]) return false
    if (!this.evolutionOptions(m).some((e) => e.item === item)) return false
    if (m.heldItem) this.save.bag[m.heldItem] = (this.save.bag[m.heldItem] ?? 0) + 1
    this.save.bag[item]--
    m.heldItem = item
    m.noEvolve = false
    this.persist()
    this.emit({ type: 'partyChanged' })
    return true
  }
  takeStone(id: string) {
    const m = this.mon(id)
    if (!m?.heldItem || this.save.session) return false
    this.save.bag[m.heldItem] = (this.save.bag[m.heldItem] ?? 0) + 1
    m.heldItem = undefined
    this.persist()
    return true
  }
  spendShells(n: number) {
    if (this.save.shells < n) return false
    this.save.shells -= n
    this.persist()
    return true
  }

  // ---------- EXP ----------
  private addExp(m: Mon, n: number) {
    m.exp += n
    while (m.level < 100 && m.exp >= expToNext(m.level)) {
      m.exp -= expToNext(m.level)
      m.level++
      this.emit({ type: 'levelUp', mon: m })
      if (this.save.session) {
        const to = this.evolutionDue(m)
        if (to) this.emit({ type: 'evolveReady', mon: m, to })
      }
    }
  }
  private giveExp(n: number) {
    this.save.shells += n
    if (this.together.length) {
      this.save.shells += n // studying together: double shells
      this.save.togetherMin = (this.save.togetherMin ?? 0) + n
    }
    for (const m of this.party) {
      m.focusedMin += n
      this.addExp(m, n * EXP_PER_MIN)
    }
    // helpers (Day Care, jobs, expeditions) gain half, with the remainder carried over
    for (const m of this.workers) {
      const total = (this.save.carry[m.id] ?? 0) + n * EXP_PER_MIN
      this.save.carry[m.id] = total % 2
      if (total >= 2) this.addExp(m, Math.floor(total / 2))
    }
  }
  /** Take back EXP for minutes that turned out not to be focused. Never de-levels. */
  private takeExp(n: number) {
    this.save.shells = Math.max(0, this.save.shells - n)
    for (const m of this.party) {
      m.focusedMin = Math.max(0, m.focusedMin - n)
      m.exp = Math.max(0, m.exp - n * EXP_PER_MIN)
    }
  }

  // ---------- days ----------
  todayMinutes() {
    return this.save.days[dayKey(this.now())] ?? 0
  }
  /** Consecutive days (ending today or yesterday) with at least one focused minute. */
  streak() {
    let n = 0
    const d = new Date(this.now())
    if (!this.save.days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1)
    while (this.save.days[dayKey(d.getTime())]) {
      n++
      d.setDate(d.getDate() - 1)
    }
    return n
  }
  visitsToday() {
    return this.save.visits.day === dayKey(this.now()) ? this.save.visits.count : 0
  }
  private checkStreakStone() {
    const n = this.streak()
    const key = `${dayKey(this.now())}:${n}`
    if (!isStoneDay(n) || this.save.stonesPaid.includes(key)) return
    this.save.stonesPaid.push(key)
    const item = this.pickStone()
    this.save.bag[item] = (this.save.bag[item] ?? 0) + 1
    this.save.starPieces++
    this.emit({ type: 'stone', item, streak: n })
    if (n >= 7) this.addEgg(this.randomEggDex(true), 'streak')
  }

  /** A stone someone can use, preferring one whose evolution you have not caught yet. */
  pickStone(rand = Math.random) {
    const uses = (stone: string, fresh: boolean) =>
      this.save.mons.some((m) => this.evolutionOptions(m).some((e) => e.item === stone && (!fresh || !this.save.caught.includes(e.dex))))
    const fresh = STONES.filter((st) => uses(st, true))
    const useful = STONES.filter((st) => uses(st, false))
    const pool = fresh.length ? fresh : useful.length ? useful : STONES
    return pool[Math.floor(rand() * pool.length)]
  }

  // ---------- focus sessions ----------
  startSession() {
    if (this.save.session || !this.hasStarter) return
    const t = this.now()
    this.save.breakUntil = null
    this.save.session = {
      startedAt: t,
      length: this.save.settings.length,
      credited: 0,
      granted: 0,
      lastBeat: t,
      state: 'running',
      nextCheck: CHECKIN_EVERY,
      nextVisit: OPEN_VISIT_EVERY,
      nextPasser: PASSER_EVERY,
      nextFind: FIND_EVERY,
      nextWeather: WEATHER_EVERY,
      clean: true,
    }
    // the Pokémon that waited through the break go on their way
    const leaving = this.save.wild.map((w) => w.id)
    this.save.wild = []
    this.persist()
    this.emit({ type: 'sessionStart' })
    if (leaving.length) this.emit({ type: 'wildLeave', ids: leaving })
    // a stone given in the break, or a friendship reached, pays off now
    const out = new Set([...this.party, ...this.helpers].map((m) => m.id))
    for (const m of [...this.party, ...this.helpers]) {
      const to = this.evolutionDue(m)
      if (to) this.emit({ type: 'evolveReady', mon: m, to })
    }
    // one resting in the box (holding a stone, or fed past its level) evolves there, quietly
    for (const m of this.save.mons) {
      if (out.has(m.id)) continue
      const to = this.evolutionDue(m)
      if (!to) continue
      const from = this.name(m)
      this.evolve(m, to)
      this.emit({ type: 'boxEvolved', mon: m, from })
    }
  }

  endSession(complete = false, capped = false) {
    const s = this.save.session
    if (!s) return
    // an Open session counts as complete only after 25 focused minutes (stopping at once used to pay)
    if (!s.length && s.credited < OPEN_COMPLETE) complete = false
    this.save.session = null
    if (this.save.bait) {
      this.save.bait = null
      this.emit({ type: 'bait', food: null })
    }
    let berries = 0
    if (complete) {
      // Open sessions already ripen a berry every 30 minutes, so they get none at the end
      berries = !s.length ? 0 : s.length >= LONG_SESSION ? 2 : 1
      this.save.berries = Math.min(BERRIES_MAX, this.save.berries + berries)
      // a finished session of 30 minutes or more lights a Lantern charge for the dungeons
      if (s.credited >= SHORT_SESSION) this.save.lanterns = Math.min(LANTERN_MAX, (this.save.lanterns ?? 0) + 1)
      this.save.breakUntil = this.now() + BREAK_SECONDS * 1000
    }
    this.persist()
    this.emit({ type: 'sessionEnd', minutes: s.granted, complete, berries, capped })
    // the old end-of-session visitor is now a minor extra; passers-by are the main way in
    if (complete && Math.random() < FRIENDLY_VISIT_CHANCE) this.requestVisit(s.length && s.length >= LONG_SESSION ? RARE_LONG : 1, this.lure(s))
  }

  private requestVisit(rareMult: number, _lure?: Lure) {
    if (this.visitsToday() >= VISITS_PER_DAY) return this.emit({ type: 'visitCapped' })
    this.emit({ type: 'visit', rareMult })
  }

  /** Everything drawing Pokémon right now. */
  lure(s = this.save.session): Lure {
    const long = !!s && ((!!s.length && s.length >= LONG_SESSION) || (!s.length && s.credited >= LONG_SESSION))
    return {
      long,
      clean: !s || s.clean !== false,
      hour: this.hour(),
      weather: this.weather,
      habitats: this.save.habitats,
      bait: this.save.bait,
      decor: Object.values(this.save.decor.slots).filter(Boolean) as string[],
    }
  }
  /** Why a species would or would not come, for the Pokédex. */
  lureNotes(dex: number, decorName: (id: string) => string = (id) => id) {
    const sp = this.species(dex)
    if (!sp) return [] as string[]
    const notes: string[] = []
    if (sp.needs) notes.push(`Needs ${HABITATS.find((h) => h.id === sp.needs)!.name.toLowerCase()}.`)
    if (sp.time === 'night') notes.push('Night only.')
    if (sp.time === 'morning') notes.push('Likes mornings.')
    if (sp.rarity === 'rare' || sp.rarity === 'starter') notes.push('Comes in hour-long sessions, or rarely in shorter ones on a 3-day streak.')
    const food = FOODS.filter((f) => f.types.some((t) => sp.types?.includes(t))).map((f) => f.name)
    if (food.length) notes.push(`Likes ${food.join(' or ')}.`)
    const decor = Object.entries(DECOR_LOVES).filter(([, ds]) => ds.includes(dex)).map(([id]) => decorName(id).toLowerCase())
    if (decor.length) notes.push(`Loves the ${decor.join(' and ')}.`)
    return notes
  }

  /**
   * What a Day Care pair lays (L6). Usually one parent's first stage; a third of the time, a
   * baby that never passes by: Pichu from the Pikachu line, Magby from a Fire type, Azurill
   * from two Water types, Cleffa from a Normal type.
   */
  eggFrom(a: Mon, b: Mon, rand = Math.random) {
    const sp = (m: Mon) => this.species(m.dex)
    const has = (m: Mon, t: string) => !!sp(m)?.types?.includes(t)
    const babies: number[] = []
    if ([a, b].some((m) => sp(m)?.line === 25)) babies.push(172)
    if ([a, b].some((m) => has(m, 'fire'))) babies.push(240)
    if (has(a, 'water') && has(b, 'water')) babies.push(298)
    if ([a, b].some((m) => has(m, 'normal'))) babies.push(173)
    const ok = babies.filter((d) => this.species(d))
    if (ok.length && rand() < 1 / 3) return ok[Math.floor(rand() * ok.length)]
    const parent = rand() < 0.5 ? a : b
    return sp(parent)?.line ?? parent.dex
  }

  // ---------- restoration (L1) ----------
  /** Hours toward restoration: everything focused, plus minutes with a friend counted again. */
  restoreHours() {
    return this.totalHours() + (this.save.togetherMin ?? 0) / 60
  }
  /** How far along a landmark is, part by part. */
  restoreProgress(id: string) {
    const r = RESTORE.find((x) => x.id === id)!
    const s = this.save
    return {
      hours: this.restoreHours(),
      species: s.caught.length,
      shells: s.shells,
      stars: s.starPieces,
      guardian: !r.guardian || s.guardians.includes(r.guardian),
      ready: this.restoreHours() >= r.hours && s.caught.length >= r.species && s.shells >= r.shells && s.starPieces >= r.stars && (!r.guardian || s.guardians.includes(r.guardian)),
    }
  }
  /** The next landmark not yet restored (they go in order). */
  get nextLandmark() {
    return RESTORE.find((r) => !this.restored(r.id)) ?? null
  }
  restore(id: string) {
    const r = RESTORE.find((x) => x.id === id)
    const s = this.save
    if (!r || s.session || this.restored(id) || this.nextLandmark?.id !== id || !this.restoreProgress(id).ready) return false
    s.shells -= r.shells
    s.starPieces -= r.stars
    s.restored = [...(s.restored ?? []), id]
    if (id === 'hut' && s.daycare.ids.length < 3) s.daycare.ids.push(null)
    this.persist()
    this.emit({ type: 'restored', id })
    return true
  }

  // ---------- islands ----------
  totalHours() {
    return Object.values(this.save.days).reduce((a, b) => a + b, 0) / 60
  }
  get islandDef() {
    return ISLANDS.find((i) => i.id === this.save.island)!
  }
  /** Every species that lives on an island (all stages), and how many you have caught. */
  dexOf(island: IslandId) {
    const all = Object.entries(this.roster)
      .filter(([, s]) => (s.islands ?? ['home']).includes(island))
      .map(([k]) => Number(k))
    const caught = all.filter((d) => this.save.caught.includes(d)).length
    return { all, caught, share: all.length ? caught / all.length : 0 }
  }
  /** What still stands between you and an island. Empty means you can sail. */
  sailNeeds(to: IslandId) {
    const def = ISLANDS.find((i) => i.id === to)!
    const u = def.unlock
    if (!u) return []
    const out: { text: string; done: boolean }[] = []
    const g = ISLANDS.find((i) => i.id === u.from)!.guardian
    out.push({ text: `Beat ${this.name(g.dex)}`, done: this.save.guardians.includes(u.from) })
    const dex = this.dexOf(u.from)
    const need = Math.ceil(dex.all.length * u.share)
    out.push({ text: `Catch ${need} of ${dex.all.length} (${dex.caught})`, done: dex.caught >= need })
    out.push({ text: `Focus ${u.hours} hours (${Math.floor(this.totalHours())})`, done: this.totalHours() >= u.hours })
    return out
  }
  canSail(to: IslandId) {
    if (to === this.save.island || this.save.session) return false
    // once you have been somewhere you can always sail back
    if (this.save.stash[to] || to === 'home') return true
    return this.sailNeeds(to).every((n) => n.done)
  }
  /** Travel between sessions. Your Pokémon, eggs and helpers come along; the island's own things stay. */
  sail(to: IslandId) {
    if (!this.canSail(to)) return false
    const s = this.save
    s.stash[s.island] = { habitats: s.habitats, decor: s.decor, finds: s.finds, bait: s.bait }
    // each island keeps its own residents; your partner comes along
    s.parties[s.island] = s.party
    const busy = (id: string) => s.daycare.ids.includes(id) || Object.values(s.jobs).includes(id) || s.expedition?.id === id
    const here = (s.parties[to] ?? []).filter((id) => this.mon(id) && !busy(id) && !this.isPartner(id))
    s.party = s.partner && this.mon(s.partner) ? [s.partner, ...here] : here.length ? here : s.party.slice(0, 1)
    delete s.parties[to]
    // jobs tied to a decoration on the island you leave stop until you return
    const next = s.stash[to] ?? { habitats: [], decor: { owned: s.decor.owned, slots: {} }, finds: [], bait: null }
    s.habitats = next.habitats
    s.decor = { owned: s.decor.owned, slots: next.decor.slots }
    s.finds = next.finds
    s.bait = next.bait
    s.wild = []
    s.island = to
    this.persist()
    this.emit({ type: 'sail', to })
    return true
  }
  /** Decoration spots open with focused hours (decor.ts SLOTS minHours). */
  hoursOk(minHours?: number) {
    return !minHours || this.totalHours() >= minHours
  }
  /** Is this decoration spot open: enough hours, and (for a milestone spot) the Pokédex milestone paid? */
  slotOpen(sl: { minHours?: number; milestone?: number }) {
    return this.hoursOk(sl.minHours) && (!sl.milestone || (this.save.extraSlots ?? 0) >= sl.milestone)
  }

  /** After its dungeon is cleared, the guardian joins you (called by the dungeon page). */
  guardianJoins() {
    const g = this.islandDef.guardian
    if (!this.save.guardians.includes(this.islandDef.id) || this.save.mons.some((m) => m.dex === g.dex)) return null
    return this.addMon(g.dex, g.level - 5)
  }

  // ---------- gifts (stage 5) ----------
  /** Can this be sent? Never your partner, the last in the party, or one away on an expedition. */
  canGiveMon(id: string) {
    const r = this.roleOf(id)
    return !this.save.session && !this.isPartner(id) && r !== 'expedition' && !(r === 'party' && this.save.party.length <= 1)
  }
  /** Remove what was sent, once the server has accepted it. */
  giveAway(kind: 'mon' | 'egg' | 'item', ref: string, n = 1) {
    const s = this.save
    if (s.session) return false
    if (kind === 'mon') {
      if (!this.canGiveMon(ref)) return false
      this.assign(ref, 'box')
      s.mons = s.mons.filter((m) => m.id !== ref)
    } else if (kind === 'egg') {
      if (!s.eggs.some((e) => e.id === ref)) return false
      s.eggs = s.eggs.filter((e) => e.id !== ref)
    } else {
      if (this.itemCount(ref) < n) return false
      this.addItem(ref, -n)
    }
    this.persist()
    this.emit({ type: 'partyChanged' })
    return true
  }
  itemCount(id: string) {
    const s = this.save
    if (id in s.balls) return s.balls[id as Ball]
    if (id === 'star-piece') return s.starPieces
    if (id === 'oran-berry') return s.berries
    if (FOODS.some((f) => f.id === id)) return s.foods[id] ?? 0
    return s.bag[id] ?? 0
  }
  addItem(id: string, n: number) {
    const s = this.save
    if (id in s.balls) s.balls[id as Ball] = Math.max(0, s.balls[id as Ball] + n)
    else if (id === 'star-piece') s.starPieces = Math.max(0, s.starPieces + n)
    else if (id === 'oran-berry') s.berries = Math.max(0, Math.min(BERRIES_MAX, s.berries + n))
    else if (FOODS.some((f) => f.id === id)) s.foods[id] = Math.max(0, (s.foods[id] ?? 0) + n)
    else s.bag[id] = Math.max(0, (s.bag[id] ?? 0) + n)
  }
  /** Take in a gift from a friend. Returns the new Pokémon, if it was one. */
  receive(kind: 'mon' | 'egg' | 'item', p: { dex?: number; level?: number; id?: string; n?: number }) {
    if (kind === 'mon' && p.dex && this.species(p.dex)) return this.addMon(p.dex, Math.max(1, Math.min(100, p.level ?? 5)))
    if (kind === 'egg' && p.dex && this.species(p.dex)) {
      if (!this.addEgg(p.dex, 'gift')) this.save.eggQueue.push(p.dex)
    }
    if (kind === 'item' && p.id) this.addItem(p.id, Math.max(1, Math.min(5, p.n ?? 1)))
    this.persist()
    return null
  }

  // ---------- habitats and food ----------
  buildHabitat(id: Habitat) {
    const h = HABITATS.find((x) => x.id === id)
    if (!h || this.save.session || this.save.habitats.includes(id)) return false
    if (!this.hoursOk(HABITAT_HOURS[id])) return false
    if (this.save.starPieces < h.stars || this.save.shells < h.shells) return false
    this.save.starPieces -= h.stars
    this.save.shells -= h.shells
    this.save.habitats.push(id)
    this.persist()
    this.emit({ type: 'habitat', id })
    return true
  }
  buyFood(id: string, n = 1) {
    const f = FOODS.find((x) => x.id === id)
    if (!f || this.save.session || !this.spendShells(f.price * n)) return false
    this.save.foods[id] = (this.save.foods[id] ?? 0) + n
    this.persist()
    return true
  }
  /** Set food out before a session. One at a time; it is eaten when the session ends. */
  setBait(id: string) {
    if (this.save.session || this.save.bait || !this.save.foods[id]) return false
    this.save.foods[id]--
    this.save.bait = id
    this.persist()
    this.emit({ type: 'bait', food: id })
    return true
  }

  /**
   * Called about once a second (and on wake-up). Credits real elapsed time
   * while running, capped per beat, so a sleeping laptop or a closed window
   * never counts.
   */
  beat() {
    const s = this.save.session
    if (!s) return
    const t = this.now()
    const gap = (t - s.lastBeat) / 1000
    s.lastBeat = t
    if (s.state === 'asking') {
      if (t - (s.askSince ?? t) > ANSWER_WINDOW * 1000) this.goAway(s.askReason ?? 'checkin')
      return
    }
    if (s.state !== 'running') return
    if (gap > AWAY_GAP) {
      this.goAway('gap')
      return
    }
    this.credit(Math.min(gap, MAX_GAP))
    if (this.save.session && !this.save.settings.detector && s.credited >= s.nextCheck) this.ask('checkin')
  }

  private credit(sec: number) {
    const s = this.save.session!
    s.credited += sec
    const whole = Math.floor(s.credited / 60)
    if (whole > s.granted) {
      const n = whole - s.granted
      s.granted = whole
      const k = dayKey(this.now())
      const firstToday = !this.save.days[k]
      this.save.days[k] = (this.save.days[k] ?? 0) + n
      this.giveExp(n)
      if (firstToday) this.checkStreakStone()
      this.work(n)
      this.emit({ type: 'minute', n })
    }
    this.persist()
    this.moments(s)
    if (!this.save.session) return
    if (s.length && s.credited >= s.length) return this.endSession(true)
    if (s.credited >= MAX_SESSION) return this.endSession(true, true)
    if (!s.length && s.credited >= s.nextVisit) {
      s.nextVisit += OPEN_VISIT_EVERY
      this.save.berries = Math.min(BERRIES_MAX, this.save.berries + 1)
    }
  }

  // ---------- helpers at work (stage 3) ----------
  /** Called with each batch of newly focused minutes. */
  private work(n: number, rand = Math.random) {
    const s = this.save
    // eggs warm up, oldest first
    for (const e of s.eggs.slice(0, this.eggMax)) {
      const k = (s.upgrades.includes('warmsand') ? 1.25 : 1) * (this.restored('hut') ? 1.25 : 1) * (e.fast ? 1.25 : 1)
      e.progress = Math.min(e.need, e.progress + n * k)
      if (e.progress >= e.need) this.hatch(e)
    }
    // the Day Care: two Pokémon together make an egg now and then (three, with the hut, half as often again)
    const pair = s.daycare.ids.map((id) => id && this.mon(id)).filter(Boolean) as Mon[]
    if (pair.length >= 2) {
      s.daycare.progress += n * (pair.length >= 3 ? 1.5 : 1)
      if (s.daycare.progress >= DAYCARE_EVERY && s.eggs.length < this.eggMax) {
        s.daycare.progress = 0
        const [a, b] = [...pair].sort(() => rand() - 0.5)
        const egg = this.addEgg(this.eggFrom(a, b, rand), 'daycare')
        // a pair that shares a type warms its egg a quarter faster (L6)
        const ta = this.species(a.dex)?.types ?? []
        if (egg && (this.species(b.dex)?.types ?? []).some((t) => ta.includes(t))) egg.fast = true
      }
    }
    // jobs
    for (const j of JOBS) {
      const id = s.jobs[j.id]
      const m = id && this.mon(id)
      if (!m) continue
      if (j.needsDecor && !Object.values(s.decor.slots).includes(j.needsDecor)) continue
      if (j.needsLandmark && !this.restored(j.needsLandmark)) continue
      // with the lighthouse restored, the Lookout spots passers-by twice as often at night
      const nightWatch = j.id === 'lookout' && this.restored('lighthouse') && isNightHour(new Date(this.now()).getHours())
      s.jobProgress[j.id] = (s.jobProgress[j.id] ?? 0) + n * (nightWatch ? 2 : 1)
      if (s.jobProgress[j.id]! < jobEvery(j, m.level)) continue
      s.jobProgress[j.id] = 0
      if (j.id === 'bush') s.berries = Math.min(BERRIES_MAX, s.berries + 1)
      if (j.id === 'dig') this.dig(rand, m.id)
      if (j.id === 'lookout') this.passerBy()
      if (j.id === 'campfire') s.shells += 3
      if (j.id === 'garden') {
        const f = FOODS[Math.floor(rand() * FOODS.length)].id
        s.foods[f] = (s.foods[f] ?? 0) + 1
      }
      if (j.id === 'generator' || j.id === 'fortune') continue // they work all the time, with no payout to announce
      this.emit({ type: 'job', job: j.id, mon: m })
    }
    // the expedition
    const ex = s.expedition
    if (ex) {
      ex.progress += n
      if (ex.progress >= ex.need) this.expeditionBack(rand)
    }
    this.persist()
  }
  private eggNeed(dex: number) {
    const r = this.species(dex)?.rarity
    return r === 'rare' || r === 'starter' ? 120 : r === 'uncommon' ? 75 : 40
  }
  addEgg(dex: number, source: Egg['source']) {
    if (this.save.eggs.length >= this.eggMax) return null
    const e: Egg = { id: Math.random().toString(36).slice(2, 10), dex, need: this.eggNeed(dex), progress: 0, source }
    this.save.eggs.push(e)
    this.persist()
    this.emit({ type: 'egg', egg: e })
    return e
  }
  /** An egg from the wider roster, as long sessions draw (streaks, finds, expeditions). */
  private randomEggDex(long: boolean) {
    return this.pickVisitor(long ? RARE_LONG : 1, Math.random, { ...this.lure(), long }, false).dex
  }
  private hatch(e: Egg) {
    this.save.eggs = this.save.eggs.filter((x) => x !== e)
    const queued = this.save.eggQueue.shift()
    if (queued) this.addEgg(queued, 'gift')
    this.emit({ type: 'hatching', egg: e })
    const m = this.addMon(e.dex, 1)
    this.emit({ type: 'hatch', egg: e, mon: m })
  }
  private expeditionBack(rand = Math.random) {
    const ex = this.save.expedition!
    const m = this.mon(ex.id)
    this.save.expedition = null
    if (!m) return
    const haul: Haul = { shells: ex.long ? 40 + Math.floor(m.level / 4) : 10 + Math.floor(m.level / 2), items: [] } // review 2 B5
    const pick = () => {
      const r = rand()
      if (r < 0.35) return { kind: 'berry' as const, n: 1 }
      if (r < 0.65) return { kind: 'poke-ball' as const, n: 1 + Math.floor(rand() * 2) }
      if (r < 0.85) return { kind: 'food' as const, id: FOODS[Math.floor(rand() * FOODS.length)].id, n: 1 }
      return { kind: (ex.long ? 'great-ball' : 'poke-ball') as Ball, n: 1 }
    }
    const count = ex.long ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2)
    for (let i = 0; i < count; i++) haul.items.push(pick())
    if (ex.long && rand() < 0.2 + m.level / 400) haul.items.push({ kind: 'star-piece', n: 1 })
    if (ex.long && rand() < 0.1) haul.items.push({ kind: 'stone', id: this.pickStone(rand), n: 1 })
    // apply
    this.save.shells += haul.shells
    for (const it of haul.items) {
      if (it.kind === 'berry') this.save.berries = Math.min(BERRIES_MAX, this.save.berries + it.n)
      else if (it.kind === 'star-piece') this.save.starPieces += it.n
      else if (it.kind === 'stone') this.save.bag[it.id!] = (this.save.bag[it.id!] ?? 0) + it.n
      else if (it.kind === 'food') this.save.foods[it.id!] = (this.save.foods[it.id!] ?? 0) + it.n
      else this.save.balls[it.kind] += it.n
    }
    if (ex.long && rand() < 0.25 + m.level / 200) haul.egg = this.addEgg(this.randomEggDex(true), 'expedition') ?? undefined
    this.persist()
    this.emit({ type: 'expeditionBack', mon: m, haul })
    this.emit({ type: 'rolesChanged' })
  }

  // ---------- moments during focus ----------
  private moments(s: Session, rand = Math.random) {
    s.nextPasser ??= PASSER_EVERY
    s.nextFind ??= FIND_EVERY
    s.nextWeather ??= WEATHER_EVERY
    if (s.credited >= s.nextPasser) {
      s.nextPasser += PASSER_EVERY
      this.passerBy(s)
    }
    if (s.credited >= s.nextFind) {
      s.nextFind += FIND_EVERY
      if (rand() < 0.6) this.dig(rand)
    }
    if (s.credited >= s.nextWeather) {
      s.nextWeather += WEATHER_EVERY
      if (this.save.weather.until < this.now() && rand() < 0.45) {
        const r = rand()
        const kind: Weather = r < 0.45 ? (this.save.island === 'frost' ? 'snow' : 'rain') : r < 0.7 ? 'fog' : 'sun'
        this.save.weather = { kind, until: this.now() + (10 + rand() * 15) * 60 * 1000 }
        this.persist()
        this.emit({ type: 'weather', kind })
      }
    }
  }
  get weather(): Weather {
    return this.save.weather.until > this.now() ? this.save.weather.kind : 'clear'
  }
  passersToday() {
    return this.save.passers.day === dayKey(this.now()) ? this.save.passers.count : 0
  }
  /** A wild Pokémon arrives and settles in to wait for your break. */
  passerBy(s = this.save.session) {
    if (this.passersToday() >= PASSERS_PER_DAY) return null
    // longer sessions and sessions without step-aways draw rarer Pokémon
    const lure = this.lure(s)
    const mult = (lure.long ? RARE_LONG : 1) * (lure.clean ? 1 : 0.6) * (this.together.length ? 1.3 : 1)
    // when the island is full, the newcomer takes the place of the most common one waiting,
    // as long as it is at least as rare (so a long session never loses its later passers-by)
    let bumped: Wild | null = null
    if (this.save.wild.length >= this.wildMax) {
      bumped = [...this.save.wild].filter((w) => !w.guide).sort((a, b) => this.rarityRank(a.dex) - this.rarityRank(b.dex))[0] ?? null
      if (!bumped) return null
    }
    // passers-by have their own daily cap, so they don't use up the friendly visitor's (commit = false)
    const { dex, level } = this.pickVisitor(mult, Math.random, lure, false)
    if (bumped && this.rarityRank(dex) < this.rarityRank(bumped.dex)) return null
    this.mark(dex, false)
    this.save.passers = { day: dayKey(this.now()), count: this.passersToday() + 1 }
    if (bumped) {
      this.save.wild = this.save.wild.filter((w) => w !== bumped)
      this.emit({ type: 'wildLeave', ids: [bumped.id] })
    }
    const w: Wild = { id: Math.random().toString(36).slice(2, 10), dex, level, tries: 0 }
    // a shiny now and then, only in a clean hour-long session (L5)
    if (lure.long && lure.clean && Math.random() < SHINY_ODDS) w.shiny = true
    this.save.wild.push(w)
    this.persist()
    this.emit({ type: 'passer', wild: w })
    return w
  }
  private rarityRank(dex: number) {
    const r = this.species(dex)?.rarity
    return r === 'rare' || r === 'starter' ? 2 : r === 'uncommon' ? 1 : 0
  }

  // ---------- the tutorial ----------
  setTutorial(step: TutorialStep) {
    this.save.tutorial = step
    this.persist()
  }
  /** The tutorial's Pidgey: it comes by outside a session, past the daily cap, and is always caught. */
  guideWild() {
    const have = this.save.wild.find((w) => w.guide)
    if (have) return have
    const w: Wild = { id: Math.random().toString(36).slice(2, 10), dex: GUIDE_CATCH, level: 4, tries: 0, guide: true }
    this.save.wild.push(w)
    this.persist()
    this.emit({ type: 'passer', wild: w })
    return w
  }
  /** Wooper's savings, handed over once, in the same write as the step change so a reload cannot pay twice. */
  guideGift(next: TutorialStep) {
    this.save.shells += GUIDE_GIFT.shells
    this.save.starPieces += GUIDE_GIFT.starPieces
    this.save.tutorial = next
    this.persist()
  }

  /** A party Pokémon digs something up. */
  dig(rand = Math.random, by?: string) {
    if (this.save.finds.length >= 6) return null
    // an egg has its own 3% roll (review 2 G1: it used to share r > 0.97, which swallowed the stone band)
    if (rand() < 0.03 && this.save.eggs.length < this.eggMax) return this.addEgg(this.randomEggDex(false), 'find') && null
    const r = rand()
    // review 2026-11-11: fewer Star Pieces (10% -> 4%), and a 2% chance of an evolution stone
    const f: Find =
      r < 0.58
        ? { id: '', kind: 'shells', n: 5 + Math.floor(rand() * 11) }
        : r < 0.78
          ? { id: '', kind: 'berry', n: 1 }
          : r < 0.94
            ? { id: '', kind: 'poke-ball', n: 1 }
            : r < 0.98
              ? { id: '', kind: 'star-piece', n: 1 }
              : { id: '', kind: 'stone', n: 1, item: this.pickStone(rand) }
    f.id = Math.random().toString(36).slice(2, 10)
    f.by = by
    this.save.finds.push(f)
    this.persist()
    this.emit({ type: 'find', find: f })
    return f
  }
  collectFind(id: string) {
    const i = this.save.finds.findIndex((f) => f.id === id)
    if (i < 0) return null
    const [f] = this.save.finds.splice(i, 1)
    if (f.kind === 'shells') this.save.shells += f.n
    if (f.kind === 'berry') this.save.berries = Math.min(BERRIES_MAX, this.save.berries + f.n)
    if (f.kind === 'poke-ball') this.save.balls['poke-ball'] += f.n
    if (f.kind === 'star-piece') this.save.starPieces += f.n
    if (f.kind === 'stone' && f.item) this.save.bag[f.item] = (this.save.bag[f.item] ?? 0) + f.n
    this.persist()
    return f
  }

  /** Every third new species you meet earns a Star Piece (review 2026-11-11: one each left 50 unspent). */
  newSpeciesStar(isNew: boolean) {
    if (!isNew || this.save.caught.length % 3 !== 0) return false
    this.save.starPieces++
    this.persist()
    return true
  }
  /** A visitor that chose to stay: joins like a catch, including the new-species Star Piece. */
  befriend(dex: number, level: number) {
    const isNew = !this.save.caught.includes(dex)
    const m = this.addMon(dex, level)
    const star = this.newSpeciesStar(isNew)
    return { mon: m, star }
  }

  // ---------- dungeons ----------
  /** Spend a Lantern charge on a run (true if there was one). */
  useLantern() {
    if ((this.save.lanterns ?? 0) <= 0) return false
    this.save.lanterns--
    this.persist()
    return true
  }
  /**
   * Odds of catching a dungeon's special Pokémon with this ball (it rises 8% for each miss there).
   * There is no ring to aim at, so the throw counts as a good one (review 2: an Ultra Ball is 65%).
   */
  deepChance(dungeon: string, ball: Ball, quality = 1) {
    const tries = this.save.deepTries[dungeon] ?? 0
    const mult = BALLS.find((b) => b.id === ball)?.mult ?? 1
    return Math.min(0.97, (CATCH_BASE.deep + tries * 0.08) * mult * (0.7 + 0.6 * quality))
  }
  /** One throw at the special Pokémon after a charged clear. */
  throwDeep(dungeon: string, dex: number, ball: Ball, quality = 1, rand = Math.random) {
    if (this.save.balls[ball] <= 0) return null
    this.save.balls[ball]--
    const caught = rand() < this.deepChance(dungeon, ball, quality)
    if (!caught) {
      this.save.deepTries[dungeon] = (this.save.deepTries[dungeon] ?? 0) + 1
      this.persist()
      return { caught }
    }
    this.save.deepTries[dungeon] = 0
    const isNew = !this.save.caught.includes(dex)
    const mon = this.addMon(dex, 10)
    this.newSpeciesStar(isNew)
    return { caught, mon }
  }

  // ---------- catching ----------
  buyBall(ball: Ball, n = 1) {
    const def = BALLS.find((b) => b.id === ball)
    if (!def || this.save.session) return false
    if (!this.spendShells(def.price * n)) return false
    this.save.balls[ball] += n
    this.persist()
    return true
  }
  /** The odds before the throw, for colouring the ring. */
  catchChance(w: Wild, ball: Ball, quality = 0.5) {
    if (w.guide) return 1
    const sp = this.species(w.dex)
    const base = CATCH_BASE[sp?.rarity ?? 'common'] + w.tries * 0.08
    const mult = BALLS.find((b) => b.id === ball)?.mult ?? 1
    // a perfect throw is worth 1.3x, a poor one 0.7x: a bad throw can still work
    return Math.min(0.97, base * mult * (0.7 + 0.6 * quality))
  }
  /** Throw a ball at a waiting Pokémon. Only between sessions. */
  throwBall(id: string, ball: Ball, quality: number, rand = Math.random): { caught: boolean; shakes: number; mon?: Mon; fled?: boolean } | null {
    const w = this.save.wild.find((x) => x.id === id)
    if (!w || this.save.session || this.save.balls[ball] <= 0) return null
    this.save.balls[ball]--
    const p = this.catchChance(w, ball, quality)
    const caught = rand() < p
    if (!caught) {
      w.tries++
      // rare ones and other starters run off after three break-frees (so better balls matter)
      if (w.tries >= FLEE_AFTER && !w.guide && this.rarityRank(w.dex) >= 2) {
        this.save.wild = this.save.wild.filter((x) => x !== w)
        this.persist()
        return { caught, shakes: Math.min(2, Math.floor(rand() * 3 * p + 0.3)), fled: true }
      }
      this.persist()
      // it breaks free after zero, one or two shakes; closer odds shake longer
      return { caught, shakes: Math.min(2, Math.floor(rand() * 3 * p + 0.3)) }
    }
    this.save.wild = this.save.wild.filter((x) => x !== w)
    const newSpecies = !this.save.caught.includes(w.dex)
    const mon = this.addMon(w.dex, w.level)
    if (w.shiny) {
      mon.shiny = true
      if (!this.save.shinies?.includes(w.dex)) this.save.shinies = [...(this.save.shinies ?? []), w.dex]
      this.persist()
    }
    const star = this.newSpeciesStar(newSpecies)
    this.emit({ type: 'caught', wild: w, mon, newSpecies, star })
    return { caught, shakes: 3, mon }
  }

  /** Debug and tests: credit focused minutes directly. */
  grantMinutes(n: number) {
    if (!this.save.session) this.startSession()
    const s = this.save.session!
    s.state = 'running'
    s.lastBeat = this.now()
    for (let i = 0; i < n && this.save.session; i++) this.credit(60)
  }

  ask(reason: 'idle' | 'checkin') {
    const s = this.save.session
    if (!s || s.state !== 'running') return
    s.state = 'asking'
    s.askReason = reason
    s.askSince = this.now()
    if (reason === 'idle') s.idleSince = this.now() - IDLE_THRESHOLD * 1000
    this.persist()
    this.emit({ type: 'ask', reason })
  }

  /** "Yes, still here": the time spent on the question counts, on your word. */
  answerStillHere() {
    const s = this.save.session
    if (!s || s.state !== 'asking') return
    const asked = (this.now() - (s.askSince ?? this.now())) / 1000
    s.state = 'running'
    s.lastBeat = this.now()
    s.nextCheck = s.credited + CHECKIN_EVERY
    this.credit(Math.min(asked, ANSWER_WINDOW))
    this.emit({ type: 'back' })
  }

  /**
   * Pause the session. When idle detection saw you go idle and nobody
   * answered, the idle stretch before the question is taken back too.
   */
  goAway(reason: 'idle' | 'checkin' | 'locked' | 'gap') {
    const s = this.save.session
    if (!s || s.state === 'away') return
    let retracted = 0
    if (reason === 'idle' && s.state === 'asking') {
      const sec = Math.min(IDLE_THRESHOLD, s.credited)
      s.credited -= sec
      const whole = Math.floor(s.credited / 60)
      retracted = s.granted - whole
      if (retracted > 0) {
        s.granted = whole
        const k = dayKey(this.now())
        this.save.days[k] = Math.max(0, (this.save.days[k] ?? 0) - retracted)
        this.takeExp(retracted)
        this.emit({ type: 'retract', minutes: retracted })
      }
    }
    s.state = 'away'
    s.clean = false
    s.askSince = undefined
    this.persist()
    this.emit({ type: 'away', reason, retractedMin: retracted })
  }

  comeBack() {
    const s = this.save.session
    if (!s || s.state === 'running') return
    s.state = 'running'
    s.lastBeat = this.now()
    s.nextCheck = s.credited + CHECKIN_EVERY
    this.persist()
    this.emit({ type: 'back' })
  }

  // ---------- visitors ----------
  /**
   * Weighted draw of a first-stage visitor. Rare ones get likelier with a
   * an hour-long session, a 3-day streak and a long day. Species you have never
   * befriended are a little likelier, so the Pokédex keeps moving.
   */
  pickVisitor(rareMult = 1, rand = Math.random, lure: Lure = this.lure(), commit = true): { dex: number; level: number } {
    const table = this.visitorTable(rareMult, lure)
    const total = table.reduce((a, b) => a + b.w, 0)
    let r = rand() * total
    let pick = table[0]
    for (const e of table) {
      r -= e.w
      if (r <= 0) {
        pick = e
        break
      }
    }
    const lo = pick.rarity === 'common' ? 2 : 4
    const level = lo + Math.floor(rand() * 5)
    if (commit) {
      this.mark(pick.dex, false)
      const today = dayKey(this.now())
      this.save.visits = { day: today, count: this.visitsToday() + 1 }
      this.persist()
    }
    return { dex: pick.dex, level }
  }
  /** The Fortune job: the n Pokémon most likely to come by in your next session, as it is set up now. */
  likelyVisitors(n = 3) {
    const lure = { ...this.lure(), long: this.save.settings.length === null || (this.save.settings.length ?? 0) >= LONG_SESSION }
    return this.visitorTable(lure.long ? RARE_LONG : 1, lure)
      .sort((a, b) => b.w - a.w)
      .slice(0, n)
      .map((e) => e.dex)
  }
  /** Every first stage that could come by now, with its weight. */
  private visitorTable(rareMult: number, lure: Lure) {
    const caughtLines = new Set(this.save.caught.map((d) => this.species(d)?.line))
    const starterLine = this.save.mons[0] ? this.species(this.save.mons[0].dex)?.line : undefined
    const boost = rareMult * (1 + (this.streak() >= 3 ? 0.6 : 0) + (this.todayMinutes() >= 120 ? 0.4 : 0))
    const night = isNightHour(lure.hour)
    const morning = lure.hour >= 5 && lure.hour < 10
    const likes = (types: string[] | undefined, want: string[]) => !!types && types.some((t) => want.includes(t))
    const bait = FOODS.find((f) => f.id === lure.bait)
    const streakRare = this.streak() >= 3
    const table: { dex: number; w: number; rarity: Rarity }[] = []
    for (const [k, s] of Object.entries(this.roster)) {
      if (s.stage !== 1 || !s.rarity || s.guardian) continue
      if (!(s.islands ?? ['home']).includes(this.save.island)) continue
      const dex = Number(k)
      if (s.rarity === 'starter' && dex === starterLine) continue
      // gates: a habitat it needs, night-only, rare ones only in long sessions
      if (s.needs && !lure.habitats.includes(s.needs)) continue
      // by day, night species only come near the stone lantern, at a fifth of their odds
      // (or, with the lighthouse lit by a Generator, at half their odds)
      if (s.time === 'night' && !night && !lure.decor.includes('lantern') && !this.lighthouseLit) continue
      if (s.season && s.season !== seasonOf(this.now())) continue
      // rare ones and other starters: hour-long sessions, or (review 2 B8) shorter ones on a
      // 3-day streak at about a quarter of the long-session odds, so light players are not locked out
      // (RARE_LONG / 6 measured: 6.9% of short-session visitors against 26.4% in long ones)
      const scarce = s.rarity === 'rare' || s.rarity === 'starter'
      if (scarce && !lure.long && !streakRare) continue
      // base odds per visit in a long session: rare about 4%, each other starter about 2%
      let w = s.rarity === 'common' ? 10 : s.rarity === 'uncommon' ? 5 * Math.sqrt(boost) : s.rarity === 'rare' ? 4 * boost : 2 * boost
      if (scarce && !lure.long) w *= RARE_LONG / 6
      if (caughtLines.has(s.line)) w *= 0.5
      if (likes(s.types, WEATHER_TYPES[lure.weather])) w *= 2.5
      if (bait && likes(s.types, bait.types)) w *= 3
      for (const h of HABITATS) if (lure.habitats.includes(h.id) && likes(s.types, h.types)) w *= 2
      for (const d of lure.decor) if (DECOR_LOVES[d]?.includes(dex)) w *= 2
      if (s.time === 'morning' && morning) w *= 2
      if (s.time === 'night' && !night) w *= this.lighthouseLit ? 0.5 : 0.2
      table.push({ dex, w, rarity: s.rarity })
    }
    if (!table.length) table.push({ dex: 54, w: 1, rarity: 'common' })
    return table
  }

  reset() {
    try {
      localStorage.removeItem(KEY)
    } catch {}
    this.save = emptySave()
    this.emit({ type: 'partyChanged' })
  }
}
