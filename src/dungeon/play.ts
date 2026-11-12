// The dungeon (dungeon.html), played in real time.
//
// A run is three generated floors (gen.ts) and then the dungeon's hand-made map,
// where the boss waits. You steer the lead with WASD or the arrow keys; it
// attacks the nearest enemy on its own. 1 fires a stronger shot, 2 a burst,
// Space dashes, Q eats a berry, E uses an Elixir, Tab switches who you steer.
// The other two follow and fight on their own, finding their way around walls.
//
// Stairs are checkpoints: they heal everyone, revive anyone fainted and save the run,
// so a run can be left and picked up at the next break. A miniboss guards the
// stairs on B2 and B3. Traps show only in the light. Pots hold healing for this
// run; chests hold loot for the island, but only open on a run lit by a Lantern
// charge (one per finished session of 30 minutes or more). Dungeons give no EXP and no shells.
// After a charged clear, a special Pokémon may appear for one throw.
//
// Content pass (2026-11-12, docs/REVIEW2.md section 6): bosses have twice the HP and
// open each phase with a guarded beat, a shake and their signature move; Lapras has
// its own kit. Auto-attack hits only awake enemies, so rooms can be sneaked past.
// Melee types hit harder and lunge; followers use move 1; 3 fires your second
// Pokémon's burst. Generated floors carry a modifier and may hold a special room.
// After a gate's first clear, a charged run can go deeper (B5 to B7).
//
// Opened as dungeon.html?id=<map>&gate=<island> from the island, or
// ?map=play from the editor's Play test (one floor, nothing is saved then).
import './play.css'
import { click, initAudio, sfx } from '../audio'
import { effectiveness, MOVES } from '../battle'
import { BALLS, Ball, DEEP, Game, ISLANDS, IslandId, Roster, SAVE_KEY, loadSave } from '../game'
import { Light, applyLighting, normalMapFor } from '../lighting'
import { Species, dirFrom, drawFrame, frameAt, loadManifest, loadSpecies } from '../sprites'
import { generateFloor } from './gen'
import { DungeonMap, Entity, Modifier, T, TILE, TrapKind, bakeMap, walkableTile } from './map'
import { type Event as NetEvent, type Hello, type Input, type Net, type Snap, type Start, type TeamMon, connectRoom, makeRoomCode } from './net'

const VW = 320
const VH = 180
const BASE = import.meta.env.BASE_URL
const params = new URLSearchParams(location.search)
const portrait = (dex: number) => `${BASE}sprites/${String(dex).padStart(4, '0')}/Normal.png`
const RUN_KEY = 'island-dungeon-run'
const FLOORS = 4 // three generated floors, then the hand-made boss floor
const DEEP_LAST = FLOORS + 3 // after a gate's first clear, a charged run can go on to B5 to B7
const LAPRAS = 131 // Glacier Grotto's guardian has its own kit
const ARCANINE = 59 // and Ember Crater's
/** The arrival line for each floor modifier. */
const MOD_LINE: Record<Modifier, string> = {
  fog: 'Fog: your light reaches less far.',
  flooded: 'Flooded: the water slows everyone down.',
  restless: 'Restless: everything here is awake.',
  echo: 'Echo: an alarm wakes the whole floor.',
  rich: 'Rich: there is an extra chest.',
}
// a run item, weighted like pots (Oran most often)
function rollItem(): 'oran' | 'sitrus' | 'seed' | 'elixir' {
  const r = Math.random() * 0.65
  return r < 0.3 ? 'oran' : r < 0.5 ? 'elixir' : r < 0.6 ? 'seed' : 'sitrus'
}

// type flavour: which types shoot, and the names and colours of their moves
const RANGED = new Set(['fire', 'water', 'electric', 'grass', 'ice', 'psychic', 'ghost', 'poison', 'dragon', 'fairy'])
const STRONG: Record<string, string> = {
  normal: 'Body Slam', fire: 'Flamethrower', water: 'Surf', grass: 'Razor Leaf', electric: 'Thunderbolt', ice: 'Ice Beam', fighting: 'Brick Break', poison: 'Sludge',
  ground: 'Dig', flying: 'Wing Attack', psychic: 'Psybeam', bug: 'X-Scissor', rock: 'Rock Slide', ghost: 'Shadow Ball', dragon: 'Dragon Breath', dark: 'Crunch', steel: 'Iron Tail', fairy: 'Moonblast',
}
const BURST: Record<string, string> = {
  normal: 'Hyper Voice', fire: 'Fire Spin', water: 'Whirlpool', grass: 'Leaf Storm', electric: 'Discharge', ice: 'Blizzard', fighting: 'Low Sweep', poison: 'Poison Gas',
  ground: 'Earthquake', flying: 'Whirlwind', psychic: 'Psychic', bug: 'Struggle Bug', rock: 'Rock Tomb', ghost: 'Night Shade', dragon: 'Twister', dark: 'Snarl', steel: 'Flash Cannon', fairy: 'Dazzling Gleam',
}
const COL: Record<string, string> = {
  fire: '#ff8a3a', water: '#4aa8ff', grass: '#5ad04a', electric: '#ffe040', ice: '#9ae8ff', psychic: '#ff70c0', ghost: '#9a70ff', poison: '#c060e0',
  dragon: '#7a70ff', fairy: '#ffa0d8', normal: '#f0f0f0', fighting: '#e06040', ground: '#d8b060', flying: '#c0d8ff', bug: '#a8d040', rock: '#c8a868', dark: '#705848', steel: '#c0c8d8',
}

/**
 * How an ordinary enemy fights (enemy roles, 2026-11-12). Each one has a tell you can read and answer:
 * - fighter: walks up and winds up a blow you can step out of;
 * - caster: keeps its distance, shoots, and now and then charges a bigger shot;
 * - flier: circles out of reach, then dives down a warned lane;
 * - brute: curls up when hit (30% damage), then rolls down a warned lane;
 * - phantom: fades out, can't be hit, and comes back behind you with a wound-up Lick;
 * - hunter: goes for your weakest Pokémon, pounces down a warned lane, and bites harder below a third of its health.
 */
type Role = 'fighter' | 'caster' | 'flier' | 'brute' | 'phantom' | 'hunter'

/**
 * Move choices (2026-11-12): moves 1 and 2 share one charge of three pips (move 1 costs 1, move 2
 * costs 2, one pip comes back every PP_EVERY seconds), and every move leaves its type's status:
 * - burn (fire) and poison (poison, bug) hurt over time;
 * - paralysis (electric) and slow (water) halve how fast it moves and winds up;
 * - freeze (ice) stops it for a moment, then slows it;
 * - sleep (grass, psychic, fairy) stops it until something hits it;
 * - stagger (every other type) knocks it back and breaks what it was doing: a wind-up, a brute's
 *   curl, a dive or pounce, and it pulls a faded ghost back into view.
 * A burst (move 2) leaves 60% of the status on everything it hits. Bosses and minibosses can't be
 * put to sleep, frozen or staggered, and other statuses last half as long on them.
 */
type Status = 'burn' | 'poison' | 'para' | 'freeze' | 'slow' | 'sleep' | 'stagger'
const STATUS: Record<string, Status> = {
  fire: 'burn', poison: 'poison', bug: 'poison', electric: 'para', ice: 'freeze', water: 'slow', grass: 'sleep', psychic: 'sleep', fairy: 'sleep',
}
const statusOf = (type: string): Status => STATUS[type] ?? 'stagger'
const STATUS_WORD: Record<Status, string> = { burn: 'Burns', poison: 'Poisons', para: 'Paralyzes', freeze: 'Freezes', slow: 'Slows', sleep: 'Sleep', stagger: 'Staggers' }
const STATUS_POP: Record<Status, [string, string]> = {
  burn: ['Burned', '#ff9a50'], poison: ['Poisoned', '#c070e8'], para: ['Paralyzed', '#ffe040'], freeze: ['Frozen', '#a8f0ff'], slow: ['Slowed', '#70b8ff'], sleep: ['Asleep', '#c8b8ff'], stagger: ['Staggered', '#f0f0f0'],
}
// the same colours, dark enough to read on the white move cards
const STATUS_INK: Record<Status, string> = { burn: '#c8501e', poison: '#8a3cb0', para: '#9a7a00', freeze: '#2a88b8', slow: '#2a68b8', sleep: '#6a58b8', stagger: '#6a5a4a' }
const PP_MAX = 3
const PP_EVERY = 2.5 // seconds for one pip to come back
/** Leave a status on an enemy, `k` of its full length (1 for move 1, 0.6 for a burst). */
function applyStatus(from: Actor, to: Actor, type: string, k: number) {
  if (to.side !== 'foe' || to.dead) return
  const st = statusOf(type)
  const big = to.boss || to.mini
  if (big && (st === 'sleep' || st === 'stagger' || st === 'freeze')) return
  const len = k * (big ? 0.5 : 1)
  if (st === 'burn') to.burn = Math.max(to.burn, 4 * len)
  if (st === 'poison') to.poison = Math.max(to.poison, 7 * len)
  if (st === 'burn' || st === 'poison') to.dotAtk = Math.max(to.dotAtk, from.atk)
  if (st === 'para') to.para = Math.max(to.para, 4 * len)
  if (st === 'slow') to.slow = Math.max(to.slow, 3 * len)
  if (st === 'freeze') {
    to.frozen = Math.max(to.frozen, 1.2 * len)
    to.slow = Math.max(to.slow, 3 * len)
  }
  if (st === 'sleep') to.sleep = Math.max(to.sleep, 3 * len)
  if (st === 'freeze' || st === 'sleep' || st === 'stagger') {
    // whatever it was doing stops
    to.wind = 0
    to.windOn = undefined
    to.charge = undefined
    to.still = 0
    to.brace = 0
    if (to.hide > 0) to.hide = 0
  }
  if (st === 'stagger') {
    const d = dist(from, to) || 1
    move(to, ((to.x - from.x) / d) * 10, ((to.y - from.y) / d) * 10)
    to.hop = 0.3
    to.trick = Math.max(to.trick, 1.5)
    to.cd = Math.max(to.cd, 0.8)
  }
  const [word, col] = STATUS_POP[st]
  pops.push({ x: to.x, y: to.y - 34, text: word, t: 0, col })
}
/** Burn and poison tick twice a second, scaled by the attack of whoever left them. */
function updateStatus(f: Actor, dt: number) {
  f.burn = Math.max(0, f.burn - dt)
  f.poison = Math.max(0, f.poison - dt)
  f.para = Math.max(0, f.para - dt)
  f.slow = Math.max(0, f.slow - dt)
  f.frozen = Math.max(0, f.frozen - dt)
  if (f.burn <= 0 && f.poison <= 0) return
  f.dotT -= dt
  if (f.dotT > 0) return
  f.dotT = 0.5
  const dmg = f.dotAtk * ((f.burn > 0 ? 0.12 : 0) + (f.poison > 0 ? 0.07 : 0))
  // a status tick doesn't wake a sleeper (only a real hit does)
  const asleep = f.sleep
  hurt(f, Math.max(1, Math.round(dmg)), f.burn > 0 ? '#ffb070' : '#d090f0')
  if (asleep > 0 && !f.dead) f.sleep = asleep
}
/** How fast it acts now: frozen stops it, paralysis and slow halve it. */
const pace = (f: Actor) => (f.frozen > 0 ? 0 : f.para > 0 || f.slow > 0 ? 0.5 : 1)
function roleOf(types: string[]): Role {
  if (types.includes('ghost')) return 'phantom'
  if (types.includes('flying')) return 'flier'
  if (types.includes('dark')) return 'hunter'
  if (types.some((t) => t === 'rock' || t === 'ground' || t === 'steel')) return 'brute'
  return types.some((t) => RANGED.has(t)) ? 'caster' : 'fighter'
}

interface Actor {
  id: number
  monId?: string // your Pokémon's id in the save (to carry HP between floors)
  side: 'you' | 'foe'
  dex: number
  name: string
  level: number
  types: string[]
  sp: Species
  x: number
  y: number
  dir: number
  hp: number
  maxHp: number
  atk: number
  cd: number
  cd1: number
  cd2: number
  moving: boolean
  t: number
  hurt: number
  hop: number
  awake: boolean
  boss: boolean
  mini: boolean
  dead: boolean
  fade: number
  sleep: number // seconds asleep (spore traps)
  dash: number // seconds left in a dash
  dashCd: number
  dashDir: [number, number]
  phase: number // boss phases 1..3
  summoned: boolean
  owner?: string // co-op: the guest's peer id for the guest's Pokémon
  reviveT: number // co-op: seconds a partner has stood beside this fainted one
  still: number // seconds left winding up a warned attack (it stands still, so the warning is honest)
  charge?: { dx: number; dy: number; left: number; speed?: number } // a Body Slam or Extreme Speed: it runs down the warned lane
  stuck: number // a follower's seconds far from its lead without getting closer
  guard: number // a boss's seconds of invulnerability as a new phase opens
  lunge: number // a melee attack's short lunge (drawn only)
  roam?: boolean // Restless: awake, but not chasing until someone comes near
  house?: boolean // one of a monster house's sleepers
  alt: number // which move of its kit a boss or miniboss uses next
  svx: number // momentum on slick ice
  svy: number
  role: Role // how an ordinary enemy fights (roleOf); your Pokémon and bosses ignore it
  shoots: boolean // fires shots rather than striking up close
  wind: number // seconds left winding up a plain blow (it lands only if you are still in reach)
  windOn?: Actor
  windMult: number
  windLabel?: string
  windClose?: boolean // a phantom's Lick: a strike up close even though it shoots
  brace: number // a brute's seconds curled up (it takes 30% damage)
  braceCd: number
  hide: number // a phantom's seconds faded out (it can't be hit or targeted)
  trick: number // seconds until its role move (dive, pounce, fade, charged shot) is ready
  pp: number // your Pokémon's move charge: 0 to 3 pips, shared by moves 1 and 2 (move choices)
  gcd: number // a short lockout after a move, so one press never fires twice
  burn: number // status seconds left (see STATUS)
  poison: number
  para: number
  slow: number
  frozen: number
  dotT: number // seconds to the next burn or poison tick
  dotAtk: number // the attack of whoever burned or poisoned it
  tx?: number // guest: where the host says it is (drawn easing toward it)
  ty?: number
}
interface Shot {
  x: number
  y: number
  vx: number
  vy: number
  side: 'you' | 'foe'
  from: Actor
  mult: number
  type: string
  life: number
  status?: number // a move's status strength, applied where the shot lands
}
interface Pop {
  x: number
  y: number
  text: string
  t: number
  col: string
}
/** A telegraphed attack: a warning shape, then it lands. */
interface Warning {
  kind: 'circle' | 'lane' | 'ring' | 'safe' // ring: hits between r0 and r; safe: hurts everyone outside it
  x: number
  y: number
  r: number // circle radius, or lane half-width
  r0?: number // a ring's inner radius
  x2?: number
  y2?: number
  t: number
  at: number // lands at this many seconds
  col: string
  land: () => void
}
interface Trap {
  kind: TrapKind
  x: number
  y: number
  t: number // phase clock
  cd: number
  hitThisCycle: Set<number>
  used: boolean
  dir?: 'h' | 'v' // boulders
}
interface Thing {
  kind: 'pot' | 'chest'
  x: number
  y: number
  open: boolean
  big?: boolean // the miniboss's or boss's chest
  key: string // saved in the run once opened, so leaving and continuing can't refill it
}
type Items = { oran: number; sitrus: number; seed: number; elixir: number }
interface Run {
  dungeon: string
  gate: IslandId | null
  floor: number
  seed: number
  charged: boolean
  items: Items
  hp: Record<string, number> // HP fraction by save id
  found: string[] // loot lines, for the end screen
  opened?: string[] // pots and chests already opened (Thing.key)
  brought?: number // island berries brought in (Start over keeps them)
  deep?: number // a cleared run's special Pokémon, waiting for its one throw
  deepLevel?: number // the deep floors' level (the strongest party Pokémon's level minus 5)
  over?: boolean // the run has ended and only the special catch is left
}

// ---------- page ----------
const root = document.getElementById('dungeon')!
root.innerHTML = `<div class="dg-wrap"><canvas></canvas><div class="dg-hud"></div></div>`
const view = root.querySelector('canvas')!
view.width = VW
view.height = VH
const vg = view.getContext('2d')!
const hud = root.querySelector<HTMLElement>('.dg-hud')!
const frame = document.createElement('canvas')
frame.width = VW
frame.height = VH
const fg = frame.getContext('2d', { willReadFrequently: true })!
const ncv = document.createElement('canvas')
ncv.width = VW
ncv.height = VH
const ng = ncv.getContext('2d', { willReadFrequently: true })!
// a dark room is lit a second time with no ambient light, then laid over its own rectangle
const dcv = document.createElement('canvas')
dcv.width = VW
dcv.height = VH
const dfg = dcv.getContext('2d', { willReadFrequently: true })!
const dncv = document.createElement('canvas')
dncv.width = VW
dncv.height = VH
const dng = dncv.getContext('2d', { willReadFrequently: true })!
let hs = 1
function fit() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / VW, innerHeight / VH)))
  view.style.width = `${VW * s}px`
  view.style.height = `${VH * s}px`
  hs = Math.max(1, Math.floor(s / 2))
  hud.style.width = `${(VW * s) / hs}px`
  hud.style.height = `${(VH * s) / hs}px`
  hud.style.transform = `scale(${hs})`
}
fit()
addEventListener('resize', fit)

// ---------- state ----------
let hand: DungeonMap // the hand-made map: the boss floor, and the source of the floors' Pokémon
let map: DungeonMap
let baked: ReturnType<typeof bakeMap>
let game: Game
let manifest: Awaited<ReturnType<typeof loadManifest>>
const species = new Map<number, Species>()
let party: Actor[] = []
let foes: Actor[] = []
let shots: Shot[] = []
let pops: Pop[] = []
let warnings: Warning[] = []
let traps: Trap[] = []
let things: Thing[] = []
let lead = 0
let state: 'intro' | 'play' | 'paused' | 'won' | 'lost' | 'busy' = 'intro'
let bossDown = false
let calm = 0 // seconds since the last fight
let exit: { x: number; y: number } | null = null
let time = 0
let shake = 0
const keys = new Set<string>()
let nextId = 1
const gate = params.get('gate') as IslandId | null
const test = params.get('map') === 'play'
let run: Run
// co-op by room code: the host runs the dungeon; the guest moves its own lead and draws the host's snapshots
const roomCode = params.get('room')
const mode: 'solo' | 'host' | 'guest' = roomCode ? (params.has('host') ? 'host' : 'guest') : 'solo'
let net: Net | null = null
// host: up to three guests (four players), each with their Pokémon (lead first)
interface Guest {
  team: TeamMon[]
  actors: Actor[]
  heard: number
  lead: number // the actor id the guest steers right now
  charged: boolean
}
const guests = new Map<string, Guest>()
const gone = new Map<string, Guest>() // host: guests who went quiet; they rejoin if they speak again
const MAX_GUESTS = 3
let hostTeam: Actor[] = [] // host: your three, before guests take places
let guestLeadId = -1 // guest: your lead actor
let coop = false // host: guests started the run with you (enemies are tougher)
let coopGuests = 0 // host: how many
const mine = new Set<number>() // guest: actor ids you control
let guestActs: string[] = [] // guest: button presses to send
let heardAt = performance.now() // co-op: the last message from the other player (a closed tab can take a while to report)
let hostPeer = '' // guest: the host's peer id (only the host leaving ends the run)
let starting = false // host or solo: Enter was pressed (a late join must not reopen the lobby)
let menuOpen = false // co-op: Esc opens a menu that doesn't stop the game
const isMine = (a: Actor) => (mode === 'host' ? hostTeam.includes(a) : mode === 'guest' ? mine.has(a.id) : true)
/** Every lead someone is steering: yours and each guest's. */
function leads(): Actor[] {
  const out: Actor[] = []
  if (party[lead]) out.push(party[lead])
  for (const g of guests.values()) {
    const a = g.actors.find((x) => x.id === g.lead) ?? g.actors[0]
    if (a && party.includes(a) && a.owner && !out.includes(a)) out.push(a)
  }
  return out
}
/** The camera: your lead, or a friend's while all of yours are down. */
function viewTarget(): Actor | undefined {
  const me = party[lead]
  if (me && !me.dead) return me
  return party.find((p) => !p.dead) ?? me
}
/** Review 2 D10: the island may have saved since this page opened (the corner window keeps running), so read it again before changing it. */
function latest() {
  game.save = loadSave()
  return game.save
}
addEventListener('storage', (e) => {
  if (game && e.key === SAVE_KEY) game.save = loadSave()
})

// a boss has five times a turn-based guardian's HP: in real time a whole party hits it at once,
// and it should last long enough to show all three phases (D-F3, about 40 seconds).
// A miniboss has eight times a normal enemy's HP and full attack (about 15 seconds).
const BOSS_HP = 19
const MINI_HP = 30
const statsFor = (level: number, boss: boolean, mini = false) =>
  boss ? { hp: Math.round((60 + level * 10) * BOSS_HP), atk: (10 + level * 2.2) * 0.75 } : mini ? { hp: (20 + level * 3) * MINI_HP, atk: 8 + level * 2 } : { hp: 20 + level * 3, atk: 8 + level * 2 }

// your Pokémon are outnumbered on every floor, so they take more to bring down
const PARTY_HP = 1.6
// melee types stand in harm's way for 20 px of reach against 74, so they hit harder and take more (D-F2)
const MELEE_ATK = 1.4
const MELEE_HP = 1.2
// ordinary enemies: before the roles a room melted in about a second, too fast for anything to read (2026-11-12)
const FOE_HP = 3
const shoots = (types: string[]) => types.some((t) => RANGED.has(t))
function makeActor(side: Actor['side'], dex: number, level: number, sp: Species, types: string[], name: string, x: number, y: number, boss = false, mini = false): Actor {
  const st = statsFor(level, boss, mini)
  if (side === 'you') {
    st.hp = Math.round(st.hp * PARTY_HP * (shoots(types) ? 1 : MELEE_HP))
    if (!shoots(types)) st.atk *= MELEE_ATK
  }
  // an ordinary enemy fights by its role, and lasts long enough for the role to show
  const plain = side === 'foe' && !boss && !mini
  const role = plain ? roleOf(types) : 'fighter'
  if (plain) st.hp = Math.round(st.hp * FOE_HP)
  return {
    role,
    shoots: plain ? role === 'caster' || role === 'phantom' : shoots(types),
    wind: 0,
    windMult: 1,
    brace: 0,
    braceCd: 0,
    hide: 0,
    trick: 1 + Math.random() * 2,
    pp: 3,
    gcd: 0,
    burn: 0,
    poison: 0,
    para: 0,
    slow: 0,
    frozen: 0,
    dotT: 0,
    dotAtk: 0,
    id: nextId++, side, dex, name, level, types, sp, x, y, dir: 0, hp: st.hp, maxHp: st.hp, atk: st.atk, cd: Math.random() * 0.6, cd1: 0, cd2: boss ? 4 : mini ? 3 : 0, moving: false,
    t: Math.random() * 3, hurt: 0, hop: 0, awake: false, boss, mini, dead: false, fade: 0, sleep: 0, dash: 0, dashCd: 0, dashDir: [0, 1], phase: 1, summoned: false, reviveT: 0, still: 0, stuck: 0,
    guard: 0, lunge: 0, alt: 0, svx: 0, svy: 0,
  }
}

// ---------- movement and pathfinding ----------
function canStand(x: number, y: number) {
  for (const [dx, dy] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) {
    const tx = Math.floor((x + dx) / TILE)
    const ty = Math.floor((y + dy) / TILE)
    if (!walkableTile(baked.at(tx, ty))) return false
  }
  for (const s of baked.solid) if (Math.hypot(s.x - x, (s.y - y) * 1.4) < s.r + 3) return false
  return true
}
function move(a: Actor, dx: number, dy: number) {
  if (dx || dy) a.dir = dirFrom(dx, dy)
  if (canStand(a.x + dx, a.y)) a.x += dx
  if (canStand(a.x, a.y + dy)) a.y += dy
}
// ---------- the floor underfoot: slick ice and shallow water ----------
const slick = new Map<number, number>() // tile → when it melts (Infinity for an ice patch)
const tileOf = (x: number, y: number) => Math.floor(y / TILE) * map.w + Math.floor(x / TILE)
const onSlick = (a: { x: number; y: number }) => (slick.get(tileOf(a.x, a.y)) ?? -1) > time
function inWet(a: { x: number; y: number }) {
  const tx = Math.floor(a.x / TILE)
  const ty = Math.floor(a.y / TILE)
  return !!map.wet?.some((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h)
}
/**
 * Walk by (dx, dy) this frame. Shallow water slows everyone; on slick ice you keep
 * sliding the way you were going and turn slowly. Call it with 0, 0 when standing.
 */
function walk(a: Actor, dx: number, dy: number, dt: number) {
  if (dt <= 0) return
  if (inWet(a)) {
    dx *= 0.6
    dy *= 0.6
  }
  if (onSlick(a)) {
    const k = Math.min(1, dt * 1.5)
    a.svx += (dx / dt - a.svx) * k
    a.svy += (dy / dt - a.svy) * k
    if (Math.hypot(a.svx, a.svy) < 2) return
    const bx = a.x
    const by = a.y
    const d = a.dir
    move(a, a.svx * dt, a.svy * dt)
    if (!dx && !dy) a.dir = d // sliding doesn't turn you
    if (a.x === bx) a.svx = 0
    if (a.y === by) a.svy = 0
  } else {
    a.svx = dx / dt
    a.svy = dy / dt
    if (dx || dy) move(a, dx, dy)
  }
}
// a shared path map toward the leads (yours and every guest's), rebuilt four times a second:
// anyone chasing a lead (followers, and enemies chasing the party) walks downhill on it instead of into walls
let field = new Int16Array(0)
let fieldAt = -1
function buildField() {
  const w = map.w
  const h = map.h
  if (field.length !== w * h) field = new Int16Array(w * h)
  field.fill(-1)
  // rocks and trees block their tile
  const solidTile = new Set(baked.solid.map((o) => Math.floor((o.y - 2) / TILE) * w + Math.floor(o.x / TILE)))
  const q: number[] = []
  for (const l of [...leads(), viewTarget()]) {
    if (!l || l.dead) continue
    const c = Math.floor(l.y / TILE) * w + Math.floor(l.x / TILE)
    if (c < 0 || c >= w * h || field[c] === 0) continue
    field[c] = 0
    q.push(c)
  }
  for (let i = 0; i < q.length; i++) {
    const c = q[i]
    const cx = c % w
    const cy = (c - cx) / w
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const n = ny * w + nx
      if (field[n] >= 0 || !walkableTile(baked.at(nx, ny)) || solidTile.has(n)) continue
      field[n] = field[c] + 1
      q.push(n)
    }
  }
}
/** Is the straight line to (tx, ty) clear enough to walk? */
function clearLine(a: { x: number; y: number }, tx: number, ty: number) {
  const d = Math.hypot(tx - a.x, ty - a.y)
  for (let s = 8; s < d; s += 8) if (!canStand(a.x + ((tx - a.x) * s) / d, a.y + ((ty - a.y) * s) / d)) return false
  return true
}
/** Walk toward a point: straight if the way is clear, else downhill on the path map (when chasing the lead's area). */
function seek(a: Actor, tx: number, ty: number, speed: number, dt: number, useField: boolean) {
  let gx = tx
  let gy = ty
  if (useField && !clearLine(a, tx, ty) && field.length) {
    const w = map.w
    const cx = Math.floor(a.x / TILE)
    const cy = Math.floor(a.y / TILE)
    let best = field[cy * w + cx]
    let bx = cx
    let by = cy
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue
      const v = field[ny * w + nx]
      if (v >= 0 && (best < 0 || v < best)) {
        best = v
        bx = nx
        by = ny
      }
    }
    gx = bx * TILE + TILE / 2
    gy = by * TILE + TILE / 2 + 2
  }
  const d = Math.hypot(gx - a.x, gy - a.y)
  if (d < 1) return walk(a, 0, 0, dt)
  walk(a, ((gx - a.x) / d) * speed * dt, ((gy - a.y) / d) * speed * dt, dt)
}
const alive = (xs: Actor[]) => xs.filter((a) => !a.dead)
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
function nearest(from: { x: number; y: number }, xs: Actor[], within = Infinity) {
  let best: Actor | null = null
  let bd = within
  for (const x of xs) {
    if (x.dead || x.hide > 0) continue
    const d = dist(from, x)
    if (d < bd) {
      bd = d
      best = x
    }
  }
  return best
}

// ---------- combat ----------
const ranged = (a: Actor) => a.shoots
const range = (a: Actor) => (a.boss ? 26 : a.mini ? 22 : ranged(a) ? 74 : 20)
const bestType = (a: Actor, d: Actor) => a.types.reduce((b, t) => (effectiveness(t, d.types) > effectiveness(b, d.types) ? t : b), a.types[0] ?? 'normal')
function hit(from: Actor, to: Actor, mult: number, type: string): boolean {
  if (to.dead || to.dash > 0 || to.guard > 0 || to.hide > 0) return false
  const eff = effectiveness(type, to.types)
  // a hunter bites harder at a Pokémon below a third of its health
  if (from.role === 'hunter' && from.side === 'foe' && to.hp < to.maxHp / 3) mult *= 1.5
  const braced = to.brace > 0
  if (braced) mult *= 0.3
  const dmg = Math.max(1, Math.round(from.atk * 0.5 * mult * (eff || 0.25) * (0.9 + Math.random() * 0.2)))
  hurt(to, dmg, braced ? '#8a9ab8' : eff > 1 ? '#ffe040' : eff < 1 ? '#c8c8c8' : '#ffffff')
  // a brute curls up once it's hit, then rolls out when it uncurls
  if (to.role === 'brute' && to.side === 'foe' && !braced && to.braceCd <= 0 && !to.dead && !to.charge) {
    to.brace = 1.5
    to.braceCd = 6.5
    to.wind = 0
    pops.push({ x: to.x, y: to.y - 30, text: to.types.includes('steel') ? 'Harden' : 'Defense Curl', t: 0, col: '#c8d4ec' })
  }
  return true
  if (eff > 1 && Math.random() < 0.5) toast("It's super effective!", true)
}
function hurt(to: Actor, dmg: number, col = '#ffffff') {
  if (to.dead || to.guard > 0) return
  // a boss can't skip a phase: one hit takes it at most into the next one (D-F3)
  const floor = to.boss ? (to.hp / to.maxHp > 0.66 ? Math.floor(to.maxHp * 0.33) + 1 : to.hp / to.maxHp > 0.33 ? 1 : 0) : 0
  dmg = Math.max(0, Math.min(dmg, to.hp - floor))
  to.hp = Math.max(0, to.hp - dmg)
  to.hurt = 0.22
  to.awake = true
  to.roam = false
  to.sleep = 0
  pops.push({ x: to.x + (Math.random() - 0.5) * 6, y: to.y - 24, text: String(dmg), t: 0, col })
  if (to.hp === 0) faint(to)
}
function attack(a: Actor, target: Actor, mult = 1, label?: string, status = 0) {
  const type = bestType(a, target)
  a.hop = 0.3
  if (!ranged(a) && !a.boss && !a.mini) a.lunge = 0.2
  a.dir = dirFrom(target.x - a.x, target.y - a.y)
  if (label) pops.push({ x: a.x, y: a.y - 30, text: label, t: 0, col: COL[type] ?? '#fff' })
  if (ranged(a) && !a.boss && !a.mini) {
    const d = dist(a, target) || 1
    shots.push({ x: a.x, y: a.y - 9, vx: ((target.x - a.x) / d) * 150, vy: ((target.y - a.y) / d) * 150, side: a.side, from: a, mult, type, life: 0.9, status })
  } else if (hit(a, target, mult, type) && status) applyStatus(a, target, type, status)
}
function burst(a: Actor, mult: number, radius: number, label: string, at = { x: a.x, y: a.y }) {
  const type = a.types[0] ?? 'normal'
  if (label) pops.push({ x: a.x, y: a.y - 30, text: label, t: 0, col: COL[type] ?? '#fff' })
  rings.push({ x: at.x, y: at.y - 4, r: 0, max: radius, col: COL[type] ?? '#fff', t: 0 })
  for (const f of a.side === 'you' ? foes : party) {
    if (f.dead || dist(at, f) >= radius) continue
    // a burst reaches into a faded ghost and pulls it back into view
    if (a.side === 'you' && f.hide > 0) f.hide = 0
    if (hit(a, f, mult, bestType(a, f)) && a.side === 'you') applyStatus(a, f, type, 0.6)
  }
}
const rings: { x: number; y: number; r: number; max: number; col: string; t: number }[] = []
function warn(w: Omit<Warning, 't'>) {
  warnings.push({ ...w, t: 0 })
}
/** Is p inside a drawn warning ellipse (the same shape render() draws: r wide, 0.6 r tall)? */
const inOval = (p: { x: number; y: number }, x: number, y: number, r: number) => ((p.x - x) / r) ** 2 + ((p.y - y) / (r * 0.6)) ** 2 < 1
// sim-time timers (the Perish Song's beats)
let timers: { at: number; fn: () => void }[] = []
const later = (sec: number, fn: () => void) => timers.push({ at: time + sec, fn })
function faint(a: Actor) {
  a.dead = true
  if (a.side === 'you') {
    // a Reviver Seed brings them straight back
    if (run.items.seed > 0) {
      run.items.seed--
      a.dead = false
      a.hp = Math.round(a.maxHp * 0.5)
      pops.push({ x: a.x, y: a.y - 30, text: 'Reviver Seed!', t: 0, col: '#a8f0a8' })
      return
    }
    pops.push({ x: a.x, y: a.y - 30, text: `${a.name} fainted!`, t: 0, col: '#ff8070' })
    if (party.every((p) => p.dead)) return end(false)
    // you only ever steer your own; with none left, the camera follows a friend
    if (party[lead] === a) {
      const next = party.findIndex((p) => !p.dead && isMine(p))
      if (next >= 0) lead = next
    }
  } else if (!a.boss && !a.mini && Math.random() < 0.12) {
    // a fainted enemy sometimes leaves a run item behind (D-F1)
    const got = rollItem()
    run.items[got]++
    pops.push({ x: a.x, y: a.y - 30, text: ITEM_SHORT[got], t: 0, col: '#a8f0a8' })
    hudKey = ''
    saveRun()
  } else if (a.boss || a.mini) {
    if (a.boss) bossDown = true
    toast(a.boss ? `${a.name} was defeated! The way out is open.` : `${a.name} was defeated! The stairs are open.`)
    const key = `${run.floor}:big`
    things.push({ kind: 'chest', x: a.x, y: a.y + 4, open: !!run.opened?.includes(key), big: true, key })
  }
}

// ---------- bosses and minibosses ----------
// review 2 D2: every warned attack lands exactly where it was drawn, and a boss stands still
// while it winds up (Actor.still, captured coordinates), so stepping out of a warning always works.
// D-F3: each new phase opens with a guarded beat (Actor.guard), a shake and its signature
// move: the first move of the phase's list below. The lists cycle after that.
type BossMove = 'burst' | 'slam' | 'rocks' | 'ring' | 'icelane' | 'perish' | 'flame' | 'speed' | 'pools'
const KITS: Record<'snorlax' | 'lapras' | 'arcanine', BossMove[][]> = {
  snorlax: [['burst'], ['slam'], ['rocks', 'rocks', 'burst']],
  lapras: [['ring'], ['icelane', 'ring'], ['perish', 'icelane', 'ring']],
  arcanine: [['flame'], ['speed', 'flame'], ['pools', 'speed', 'flame']],
}
const kitOf = (f: Actor) => KITS[f.dex === LAPRAS ? 'lapras' : f.dex === ARCANINE ? 'arcanine' : 'snorlax']
/** A boss's phase, checked every frame it is awake: at two thirds and one third. */
function bossPhase(f: Actor) {
  const hpk = f.hp / f.maxHp
  const phase = hpk > 0.66 ? 1 : hpk > 0.33 ? 2 : 3
  if (phase <= f.phase) return
  f.phase = phase
  f.guard = 0.8
  f.alt = 0
  f.cd2 = 0 // the signature move comes at once
  f.charge = undefined
  shake = 0.6
  toast(phase === 2 ? `${f.name} is getting serious!` : `${f.name} is furious!`)
  if (phase === 3 && !f.summoned) summon(f, 2)
}
function bossBrain(f: Actor, t: Actor) {
  if (f.cd2 > 0 || f.still > 0 || f.charge) return
  const list = kitOf(f)[f.phase - 1]
  const mv = list[f.alt++ % list.length]
  f.cd2 = bossMove(f, t, mv)
}
/** Start one warned move; returns the cooldown before the next. */
function bossMove(f: Actor, t: Actor, mv: BossMove): number {
  const col = COL[f.types[0]] ?? '#fff'
  const x0 = f.x
  const y0 = f.y
  const d = dist(f, t) || 1
  const ux = (t.x - f.x) / d
  const uy = (t.y - f.y) / d
  if (mv === 'burst') {
    f.still = 0.9
    warn({ kind: 'circle', x: x0, y: y0, r: 48, at: 0.9, col, land: () => warnedBurst(f, 1.2, 48, BURST[f.types[0]] ?? 'Hyper Voice', x0, y0) })
    return 7
  }
  if (mv === 'slam') {
    slam(f, ux, uy, 120, 11, 1.0, 2, 'Body Slam')
    return 6
  }
  if (mv === 'rocks') {
    // rocks fall where the party stands
    for (const p of alive(party)) {
      const x = p.x + (Math.random() - 0.5) * 16
      const y = p.y + (Math.random() - 0.5) * 10
      warn({ kind: 'circle', x, y, r: 15, at: 1.0, col: '#c8a868', land: () => {
        rings.push({ x, y: y - 4, r: 0, max: 15, col: '#c8a868', t: 0 })
        for (const q of party) if (!q.dead && inOval(q, x, y, 15)) hit(f, q, 1.8, 'rock')
        shake = Math.max(shake, 0.15)
      } })
    }
    return 5
  }
  if (mv === 'ring') {
    // a ring of water bursts out around it: right beside it, or well away, is safe
    f.still = 1.0
    warn({ kind: 'ring', x: x0, y: y0, r0: 22, r: 66, at: 1.0, col: '#4aa8ff', land: () => {
      pops.push({ x: x0, y: y0 - 34, text: 'Water Pulse', t: 0, col: '#4aa8ff' })
      rings.push({ x: x0, y: y0 - 4, r: 0, max: 66, col: '#4aa8ff', t: 0 })
      for (const p of party) if (!p.dead && inOval(p, x0, y0, 66) && !inOval(p, x0, y0, 22)) hit(f, p, 1.4, 'water')
    } })
    return 6
  }
  if (mv === 'flame') {
    // Flamethrower down a lane toward the lead
    f.still = 0.9
    const x2 = x0 + ux * 130
    const y2 = y0 + uy * 130
    warn({ kind: 'lane', x: x0, y: y0, x2, y2, r: 10, at: 0.9, col: '#ff8a3a', land: () => {
      pops.push({ x: x0, y: y0 - 34, text: 'Flamethrower', t: 0, col: '#ff8a3a' })
      for (const p of party) if (!p.dead && distToSeg(p, { x: x0, y: y0 }, { x: x2, y: y2 }) < 12) hit(f, p, 1.7, 'fire')
    } })
    return 5
  }
  if (mv === 'speed') {
    // Extreme Speed: a warned line across the room, then it runs the whole of it in a blink
    let len = 24
    while (len < 240 && canStand(x0 + ux * (len + 8), y0 + uy * (len + 8))) len += 8
    slam(f, ux, uy, len, 12, 0.9, 2.2, 'Extreme Speed', 520)
    return 5.5
  }
  if (mv === 'pools') {
    // fire falls where the party stands and burns there for a few seconds
    for (const p of alive(party)) {
      const x = p.x + (Math.random() - 0.5) * 14
      const y = p.y + (Math.random() - 0.5) * 8
      warn({ kind: 'circle', x, y, r: 16, at: 1.0, col: '#ff6a2a', land: () => {
        rings.push({ x, y: y - 4, r: 0, max: 16, col: '#ff8a3a', t: 0 })
        for (const q of party) if (!q.dead && inOval(q, x, y, 16)) hit(f, q, 1.3, 'fire')
        firePools.push({ x, y, r: 16, until: time + 4, tick: 0, from: f })
      } })
    }
    return 6
  }
  if (mv === 'icelane') {
    // Ice Beam down a lane; the lane stays slick for a few seconds
    f.still = 1.0
    const x2 = x0 + ux * 140
    const y2 = y0 + uy * 140
    warn({ kind: 'lane', x: x0, y: y0, x2, y2, r: 11, at: 1.0, col: '#9ae8ff', land: () => {
      pops.push({ x: x0, y: y0 - 34, text: 'Ice Beam', t: 0, col: '#9ae8ff' })
      for (const p of party) if (!p.dead && distToSeg(p, { x: x0, y: y0 }, { x: x2, y: y2 }) < 13) hit(f, p, 1.6, 'ice')
      freezeLane(x0, y0, x2, y2, 5)
    } })
    return 5.5
  }
  // Perish Song: three warned beats, then everyone outside the safe ring is badly hurt
  f.still = 3.2
  const safe = safeSpot(f)
  toast(`${f.name} sings Perish Song. Stand in the ring.`)
  for (const [k, n] of [[0, '3'], [1, '2'], [2, '1']] as [number, string][]) later(k, () => !f.dead && pops.push({ x: f.x, y: f.y - 36, text: n, t: 0, col: '#d8c8ff' }))
  warn({ kind: 'safe', x: safe.x, y: safe.y, r: 20, at: 3.0, col: '#a8f0a8', land: () => {
    if (f.dead) return
    pops.push({ x: f.x, y: f.y - 36, text: 'Perish Song', t: 0, col: '#d8c8ff' })
    for (const p of party) if (!p.dead && !inOval(p, safe.x, safe.y, 20)) hurt(p, Math.round(p.maxHp * 0.45), '#d8c8ff')
    shake = Math.max(shake, 0.3)
  } })
  return 4.5
}
/** A warned burst at the captured spot, hitting exactly the drawn ellipse. */
function warnedBurst(f: Actor, mult: number, r: number, label: string, x: number, y: number) {
  const type = f.types[0] ?? 'normal'
  pops.push({ x, y: y - 30, text: label, t: 0, col: COL[type] ?? '#fff' })
  rings.push({ x, y: y - 4, r: 0, max: r, col: COL[type] ?? '#fff', t: 0 })
  for (const p of party) if (!p.dead && inOval(p, x, y, r)) hit(f, p, mult, bestType(f, p))
}
/** A charge down a warned lane: the whole lane is hit, then it runs down it. */
function slam(f: Actor, ux: number, uy: number, len: number, w: number, at: number, mult: number, label: string, speed = 260) {
  f.still = at
  const x0 = f.x
  const y0 = f.y
  const x2 = x0 + ux * len
  const y2 = y0 + uy * len
  warn({
    kind: 'lane', x: x0, y: y0, x2, y2, r: w, at, col: COL[f.types[0]] ?? '#fff',
    land: () => {
      pops.push({ x: x0, y: y0 - 34, text: label, t: 0, col: '#f0f0f0' })
      for (const p of party) if (!p.dead && distToSeg(p, { x: x0, y: y0 }, { x: x2, y: y2 }) < w + 2) hit(f, p, mult, f.types[0] ?? 'normal')
      f.charge = { dx: ux, dy: uy, left: len, speed }
      shake = Math.max(shake, 0.3)
    },
  })
}
// Arcanine's fire pools: they burn for a few seconds; standing in one hurts twice a second
let firePools: { x: number; y: number; r: number; until: number; tick: number; from: Actor }[] = []
function updatePools(dt: number) {
  for (const fp of firePools) {
    fp.tick -= dt
    if (fp.tick > 0) continue
    fp.tick = 0.5
    for (const p of party) if (!p.dead && p.dash <= 0 && inOval(p, fp.x, fp.y, fp.r)) hurt(p, Math.max(1, Math.round(p.maxHp * 0.05)), '#ffb070')
  }
  firePools = firePools.filter((fp) => fp.until > time)
}
/** Where a follower standing in a warning should step to (null when it stands clear). */
function escapeFrom(p: Actor): { x: number; y: number } | null {
  for (const fp of firePools)
    if (inOval(p, fp.x, fp.y, fp.r + 3)) {
      const d = Math.hypot(p.x - fp.x, (p.y - fp.y) / 0.6) || 1
      return { x: fp.x + ((p.x - fp.x) / d) * (fp.r + 12), y: fp.y + ((p.y - fp.y) / 0.6 / d) * (fp.r + 12) * 0.6 }
    }
  for (const w of warnings) {
    if (w.kind === 'safe') continue
    if (w.kind === 'lane') {
      const ax = w.x2! - w.x
      const ay = w.y2! - w.y
      const k = Math.max(0, Math.min(1, ((p.x - w.x) * ax + (p.y - w.y) * ay) / (ax * ax + ay * ay || 1)))
      const cx = w.x + ax * k
      const cy = w.y + ay * k
      if (Math.hypot(p.x - cx, p.y - cy) > w.r + 4) continue
      const len = Math.hypot(ax, ay) || 1
      let nx = -ay / len
      let ny = ax / len
      if ((p.x - cx) * nx + (p.y - cy) * ny < 0) (nx = -nx), (ny = -ny)
      return { x: cx + nx * (w.r + 12), y: cy + ny * (w.r + 12) }
    }
    if (!inOval(p, w.x, w.y, w.r + 4)) continue
    if (w.kind === 'ring' && inOval(p, w.x, w.y, Math.max(1, (w.r0 ?? 0) - 4))) continue // inside a ring's calm middle
    const d = Math.hypot(p.x - w.x, (p.y - w.y) / 0.6) || 1
    const ux = (p.x - w.x) / d
    const uy = (p.y - w.y) / 0.6 / d
    return { x: w.x + ux * (w.r + 12), y: w.y + uy * (w.r + 12) * 0.6 }
  }
  return null
}
/** Open ground 56 to 90 px from the boss for the Perish Song's safe ring. */
function safeSpot(f: Actor) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 56 + Math.random() * 34
    const x = f.x + Math.cos(a) * r
    const y = f.y + Math.sin(a) * r * 0.7
    if (canStand(x, y) && canStand(x - 10, y) && canStand(x + 10, y)) return { x, y }
  }
  return openNear(f.x, f.y + 60)
}
/** Leave slick ice on the open tiles along a lane for some seconds. */
function freezeLane(x0: number, y0: number, x2: number, y2: number, sec: number) {
  for (let s = 0; s <= 1; s += 0.04) {
    const x = x0 + (x2 - x0) * s
    const y = y0 + (y2 - y0) * s
    for (const [dx, dy] of [[0, 0], [8, 0], [-8, 0], [0, 6], [0, -6]]) {
      const tx = Math.floor((x + dx) / TILE)
      const ty = Math.floor((y + dy) / TILE)
      if (!walkableTile(baked.at(tx, ty))) continue
      const k = ty * map.w + tx
      const was = slick.get(k) ?? -1
      if (was !== Infinity) slick.set(k, Math.max(was, time + sec))
    }
  }
}
function miniBrain(f: Actor, t: Actor) {
  if (!f.summoned && f.hp / f.maxHp < 0.5) {
    summon(f, 2)
    toast(`${f.name} called for help!`)
  }
  if (f.cd2 > 0 || f.still > 0 || f.charge) return
  f.cd2 = 5
  // two warned moves in turn: a burst around it, then a charge down a lane
  if (f.alt++ % 2 === 0) {
    f.still = 0.8
    const x0 = f.x
    const y0 = f.y
    warn({ kind: 'circle', x: x0, y: y0, r: 40, at: 0.8, col: COL[f.types[0]] ?? '#fff', land: () => warnedBurst(f, 0.9, 40, STRONG[f.types[0]] ?? 'Body Slam', x0, y0) })
  } else {
    const d = dist(f, t) || 1
    slam(f, (t.x - f.x) / d, (t.y - f.y) / d, 90, 10, 0.8, 1.4, 'Take Down')
  }
}
/** Start winding up a blow or a shot: it stands still, shows the tell, and lets go when the time is up. */
function windUp(f: Actor, t: Actor, sec: number, mult: number, label?: string, close = false) {
  f.wind = sec
  f.windOn = t
  f.windMult = mult
  f.windLabel = label
  f.windClose = close
  f.dir = dirFrom(t.x - f.x, t.y - f.y)
}
/** Circle a target at radius r, in this actor's own direction. */
function orbit(f: Actor, t: Actor, r: number, speed: number, dt: number, near: boolean) {
  const s = f.id % 2 ? 1 : -1
  const a = Math.atan2((f.y - t.y) / 0.7, f.x - t.x) + 0.55 * s
  f.moving = true
  seek(f, t.x + Math.cos(a) * r, t.y + Math.sin(a) * r * 0.7, speed, dt, near && dist(f, t) > 90)
}
/** An ordinary enemy's turn, by its role (see Role). */
function roleBrain(f: Actor, t: Actor, dt: number, near: boolean) {
  // a hunter goes for the weakest Pokémon near it
  if (f.role === 'hunter') {
    const weak = party.filter((p) => !p.dead && dist(f, p) < 130).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
    if (weak) t = weak
  }
  const d = dist(f, t)
  const ux = (t.x - f.x) / (d || 1)
  const uy = (t.y - f.y) / (d || 1)
  const stand = () => {
    f.moving = false
    walk(f, 0, 0, dt)
  }
  // curled up: it holds still, then rolls out down a warned lane
  if (f.brace > 0) {
    f.brace -= dt
    stand()
    if (f.brace <= 0 && d < 120) slam(f, ux, uy, Math.min(110, d + 30), 9, 0.6, 1.5, 'Rollout', 210)
    return
  }
  // faded out: it drifts round behind its target, then comes back winding up a Lick
  if (f.hide > 0) {
    f.hide -= dt
    const [bx, by] = DIRV[t.dir] ?? [0, 1]
    f.moving = true
    seek(f, t.x - bx * 16, t.y - by * 12, 72, dt, false)
    if (f.hide <= 0) windUp(f, t, 0.5, 1.4, 'Lick', true)
    return
  }
  // winding up: the blow lands only on someone still in reach, so stepping away answers it
  if (f.wind > 0) {
    f.wind -= dt
    stand()
    if (f.wind > 0) return
    const w = f.windOn
    f.windOn = undefined
    if (!w || w.dead) return
    if (f.windClose) {
      if (dist(f, w) > 28) return
      f.hop = 0.3
      f.lunge = 0.2
      pops.push({ x: f.x, y: f.y - 30, text: f.windLabel ?? '', t: 0, col: COL[f.types[0]] ?? '#fff' })
      hit(f, w, f.windMult, bestType(f, w))
    } else if (dist(f, w) <= range(f) + (f.shoots ? 30 : 8)) attack(f, w, f.windMult, f.windLabel)
    return
  }
  if (f.still > 0) return stand()
  const clear = () => clearLine(f, t.x, t.y)
  if (f.role === 'flier') {
    // it never trades blows: it circles out of reach and dives down a warned lane
    if (f.trick <= 0 && d < 100 && clear()) {
      f.trick = 2.6 + Math.random()
      slam(f, ux, uy, Math.min(100, d + 20), 7, 0.5, 1.1, 'Wing Attack', 240)
      return
    }
    orbit(f, t, 36, 58, dt, near)
    return
  }
  if (f.role === 'hunter' && f.trick <= 0) {
    // ready to pounce: up close it backs off first, so the pounce always comes down a lane you can see
    if (d < 44) {
      f.moving = true
      seek(f, f.x - ux * 30, f.y - uy * 30, 70, dt, false)
      if (f.trick < -1.5) f.trick = 1 // cornered: it gives up and bites
      return
    }
    if (d < 110 && clear()) {
      f.trick = 3.6 + Math.random()
      slam(f, ux, uy, Math.min(100, d + 18), 8, 0.55, 1.3, 'Feint Attack', 260)
      return
    }
  }
  if (f.role === 'phantom' && f.trick <= 0 && d < 110) {
    f.trick = 4.5 + Math.random() * 1.5
    f.hide = 1.4
    return
  }
  if (f.role === 'caster' && f.trick <= 0 && d <= range(f) && clear()) {
    f.trick = 5 + Math.random() * 2
    windUp(f, t, 0.7, 1.7, STRONG[f.types[0]] ?? 'Hyper Beam')
    return
  }
  if (f.role === 'caster' && d < 40) {
    // too close: it backs away to shoot from range
    f.moving = true
    seek(f, f.x - ux * 30, f.y - uy * 30, 40, dt, false)
  } else {
    f.moving = d > range(f) - 4
    if (f.moving) seek(f, t.x, t.y, f.role === 'brute' ? 34 : f.role === 'hunter' ? 50 : 44, dt, near)
    else walk(f, 0, 0, dt)
  }
  if (f.cd <= 0 && d <= range(f)) {
    f.cd = f.role === 'brute' ? 1.7 : f.role === 'phantom' ? 1.9 : f.shoots ? 1.5 : 1.25
    windUp(f, t, f.shoots ? 0.25 : 0.35, f.role === 'brute' ? 1.2 : 1)
  }
}
function summon(f: Actor, n: number) {
  f.summoned = true
  const pool = hand.entities.filter((e) => e.kind === 'enemy' && e.dex).map((e) => e.dex!)
  for (let i = 0; i < n && pool.length; i++) {
    const dex = pool[Math.floor(Math.random() * pool.length)]
    const sp = species.get(dex)
    if (!sp) continue
    const a = makeActor('foe', dex, Math.max(1, f.level - 6), sp, game.species(dex)?.types ?? ['normal'], game.name(dex), f.x + (i ? 18 : -18), f.y + 6)
    if (!canStand(a.x, a.y)) {
      a.x = f.x
      a.y = f.y + 8
    }
    a.awake = true
    foes.push(a)
  }
}
const distToSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k))
}

// ---------- traps, pots, chests ----------
const SPIKE_CYCLE = 2.2
function updateTraps(dt: number) {
  const ls = leads().filter((l) => !l.dead)
  for (const tr of traps) {
    tr.t += dt
    tr.cd = Math.max(0, tr.cd - dt)
    if (tr.kind === 'spikes') {
      // up for 0.6 s of every cycle; anything standing on it is hurt once per cycle
      const ph = tr.t % SPIKE_CYCLE
      if (ph < dt) tr.hitThisCycle.clear()
      if (ph > SPIKE_CYCLE - 0.6)
        for (const a of [...party, ...foes])
          if (!a.dead && a.dash <= 0 && Math.abs(a.x - tr.x) < 8 && Math.abs(a.y - tr.y) < 7 && !tr.hitThisCycle.has(a.id)) {
            tr.hitThisCycle.add(a.id)
            hurt(a, Math.max(1, Math.round(a.maxHp * 0.1)), '#f0c0c0')
          }
    } else if (tr.kind === 'spores') {
      if (tr.cd > 0) continue
      const near = alive(party).find((a) => Math.hypot(a.x - tr.x, a.y - tr.y) < 10 && a.dash <= 0)
      if (near) {
        tr.cd = 7
        warn({ kind: 'circle', x: tr.x, y: tr.y, r: 18, at: 0.45, col: '#b8e070', land: () => {
          for (const a of party) if (!a.dead && Math.hypot(a.x - tr.x, a.y - tr.y) < 18) {
            a.sleep = 1.6
            pops.push({ x: a.x, y: a.y - 26, text: 'Asleep', t: 0, col: '#b8e070' })
          }
        } })
      }
    } else if (tr.kind === 'alarm' && !tr.used && ls.some((l) => Math.hypot(l.x - tr.x, l.y - tr.y) < 9)) {
      tr.used = true
      const echo = map.modifier === 'echo'
      for (const f of foes)
        if (!f.dead && (echo || dist(f, tr) < 150)) {
          f.awake = true
          f.roam = false
        }
      toast(echo ? 'An alarm! The whole floor woke up.' : 'An alarm! Everything nearby woke up.')
      rings.push({ x: tr.x, y: tr.y, r: 0, max: 60, col: '#ff6060', t: 0 })
    } else if (tr.kind === 'boulders' && tr.cd <= 0) {
      // a plate: a boulder rolls down a warned line across the room, toward whoever stepped on it
      const l = ls.find((l) => Math.hypot(l.x - tr.x, l.y - tr.y) < 9)
      if (!l) continue
      tr.cd = 6
      const ends = boulderLine(tr)
      const [a, b] = Math.hypot(ends[0].x - l.x, ends[0].y - l.y) > Math.hypot(ends[1].x - l.x, ends[1].y - l.y) ? ends : [ends[1], ends[0]]
      warn({ kind: 'lane', x: a.x, y: a.y, x2: b.x, y2: b.y, r: 8, at: 1.1, col: '#c8b088', land: () => {
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
        boulders.push({ x: a.x, y: a.y, dx: (b.x - a.x) / d, dy: (b.y - a.y) / d, left: d, hit: new Set(), spin: 0 })
      } })
    }
  }
  // rolling boulders: anyone they pass over is hurt once (a dash goes through)
  for (const bo of boulders) {
    const step = Math.min(bo.left, 200 * dt)
    bo.x += bo.dx * step
    bo.y += bo.dy * step
    bo.left -= step
    bo.spin += step
    for (const a of [...party, ...foes])
      if (!a.dead && a.dash <= 0 && !bo.hit.has(a.id) && Math.hypot(a.x - bo.x, a.y - bo.y) < 10) {
        bo.hit.add(a.id)
        hurt(a, Math.max(1, Math.round(a.maxHp * 0.15)), '#e8d8b8')
      }
  }
  boulders = boulders.filter((b) => b.left > 0)
}
let boulders: { x: number; y: number; dx: number; dy: number; left: number; hit: Set<number>; spin: number }[] = []
/** A boulder plate's line: from wall to wall through it, along its direction (at most 10 tiles a side). */
function boulderLine(tr: Trap) {
  const tx = Math.floor(tr.x / TILE)
  const ty = Math.floor((tr.y - 2) / TILE)
  const [ux, uy] = tr.dir === 'v' ? [0, 1] : [1, 0]
  const reach = (s: number) => {
    let k = 0
    while (k < 10 && walkableTile(baked.at(tx + ux * s * (k + 1), ty + uy * s * (k + 1)))) k++
    return k
  }
  const lo = reach(-1)
  const hi = reach(1)
  const c = (k: number) => ({ x: (tx + ux * k) * TILE + 8, y: (ty + uy * k) * TILE + 10 })
  return [c(-lo), c(hi)]
}

// ---------- special rooms: the monster house's doors, the vault's gate and lever, the shrine ----------
interface Block {
  tiles: number[]
  closed: Set<number> // which of its tiles are shut right now
  kind: 'door' | 'gate'
  t: number // seconds since it last changed (drawn rising or sinking)
}
let blocks: Block[] = []
let lever: { x: number; y: number; on: boolean } | null = null
let shrine: { x: number; y: number; used: boolean; told: boolean } | null = null
let house: { tripped: boolean; done: boolean } | null = null
const blockAt = new Map<number, T>() // the tile under a shut door or gate, to put back
function setShut(b: Block, i: number, shut: boolean) {
  if (shut === b.closed.has(i)) return
  if (shut) {
    blockAt.set(i, baked.tiles[i] as T)
    baked.tiles[i] = T.Wall
    b.closed.add(i)
  } else {
    baked.tiles[i] = blockAt.get(i) ?? T.Floor
    b.closed.delete(i)
  }
  b.t = 0
  fieldAt = -1
}
const special = () => map.special
const insideRoom = (a: { x: number; y: number }, pad = 0) => {
  const sp = special()
  if (!sp) return false
  const tx = a.x / TILE
  const ty = a.y / TILE
  return tx >= sp.x + pad && tx < sp.x + sp.w - pad && ty >= sp.y + pad && ty < sp.y + sp.h - pad
}
/** Build the floor's extras from its map (host and guest alike, so both draw the same). */
function floorExtras(n: number) {
  slick.clear()
  boulders = []
  firePools = []
  blocks = []
  blockAt.clear()
  timers = []
  traps = map.entities
    .filter((e) => e.kind === 'trap')
    .map((e) => ({ kind: e.trap ?? 'spikes', x: e.x * TILE + 8, y: e.y * TILE + 10, t: e.phase ?? Math.random() * SPIKE_CYCLE, cd: 0, hitThisCycle: new Set<number>(), used: false, dir: e.dir }))
  // an ice patch is three tiles by two of slick floor
  for (const tr of traps)
    if (tr.kind === 'ice') {
      const tx = Math.floor(tr.x / TILE)
      const ty = Math.floor((tr.y - 2) / TILE)
      for (let y = ty; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (baked.at(x, y) === T.Floor) slick.set(y * map.w + x, Infinity)
    }
  const sp = map.special
  const done = (k: string) => !!run.opened?.includes(`${n}:${k}`)
  if (sp?.gate) {
    const b: Block = { tiles: sp.gate, closed: new Set(), kind: 'gate', t: 1 }
    blocks.push(b)
    if (!done('lever')) for (const i of sp.gate) setShut(b, i, true)
    b.t = 1 // shut from the start: drawn whole, not rising
  }
  if (sp?.doors) blocks.push({ tiles: sp.doors, closed: new Set(), kind: 'door', t: 1 })
  const lv = map.entities.find((e) => e.kind === 'lever')
  lever = lv ? { x: lv.x * TILE + 8, y: lv.y * TILE + 10, on: done('lever') } : null
  const sh = map.entities.find((e) => e.kind === 'shrine')
  shrine = sh ? { x: sh.x * TILE + 8, y: sh.y * TILE + 10, used: done('shrine'), told: false } : null
  house = sp?.kind === 'house' ? { tripped: false, done: false } : null
}
/** Host: the monster house, the lever and the shrine. */
function updateRoom(dt: number) {
  for (const b of blocks) b.t += dt
  const ls = leads().filter((l) => !l.dead)
  if (house && !house.done) {
    const hs = foes.filter((f) => f.house && !f.dead)
    // when one wakes (or, on a Restless floor, notices you), they all do
    if (!house.tripped && hs.some((f) => f.awake && !f.roam)) {
      house.tripped = true
      for (const f of hs) {
        f.awake = true
        f.roam = false
        f.sleep = 0
      }
      toast("It's a monster house!")
    }
    const inside = hs.filter((f) => insideRoom(f))
    const door = blocks.find((b) => b.kind === 'door')
    if (house.tripped && door) {
      if (!inside.length) {
        // all down (or none left in the room): the doors open for good
        house.done = true
        const wasShut = door.closed.size > 0
        for (const i of door.tiles) setShut(door, i, false)
        if (wasShut) toast('The doors opened.')
      } else if (ls.some((l) => insideRoom(l, 1))) {
        if (!door.closed.size) {
          // the doors shut with everyone inside: bring the party's stragglers in beside their lead
          const L = ls.find((l) => insideRoom(l, 1))!
          for (const p of party)
            if (!p.dead && !insideRoom(p) && !ls.includes(p)) {
              const spot = openNear(L.x, L.y)
              p.x = spot.x
              p.y = spot.y
            }
          toast('The doors slammed shut!')
          shake = Math.max(shake, 0.2)
        }
        // a doorway shuts once nobody stands in it
        for (const i of door.tiles) if (![...party, ...foes].some((a) => !a.dead && tileOf(a.x, a.y) === i)) setShut(door, i, true)
      }
    }
  }
  if (lever && !lever.on && ls.some((l) => Math.hypot(l.x - lever!.x, l.y - lever!.y) < 9)) {
    lever.on = true
    const gate = blocks.find((b) => b.kind === 'gate')
    if (gate) for (const i of gate.tiles) setShut(gate, i, false)
    toast('The lever opened a gate somewhere in this room.')
    ;(run.opened ??= []).push(`${run.floor}:lever`)
    saveRun()
  }
  if (shrine && !shrine.used) {
    const near = ls.some((l) => Math.hypot(l.x - shrine!.x, l.y - shrine!.y) < 12)
    if (near && !shrine.told) {
      shrine.told = true
      toast(run.items.oran >= 2 ? 'A shrine. Press F to trade 2 Oran Berries for a Reviver Seed.' : 'A shrine. It asks for 2 Oran Berries.')
    }
    if (!near) shrine.told = false
  }
}
/** F at the shrine: 2 Oran Berries for a Reviver Seed, once. */
function pray(me: Actor) {
  if (!shrine || shrine.used || Math.hypot(me.x - shrine.x, me.y - shrine.y) > 14) return
  if (run.items.oran < 2) return toast('The shrine asks for 2 Oran Berries.')
  run.items.oran -= 2
  run.items.seed++
  shrine.used = true
  pops.push({ x: shrine.x, y: shrine.y - 26, text: 'Reviver Seed', t: 0, col: '#a8f0a8' })
  toast('The shrine took 2 Oran Berries and gave a Reviver Seed.')
  ;(run.opened ??= []).push(`${run.floor}:shrine`)
  hudKey = ''
  saveRun()
}
function updateThings() {
  // any lead opens them: yours or a friend's (review 2 D6)
  const ls = leads().filter((l) => !l.dead)
  for (const th of things) {
    if (th.open || !ls.some((l) => Math.hypot(l.x - th.x, l.y - th.y) <= 11)) continue
    if (th.kind === 'pot') {
      th.open = true
      // review 2 B10: fewer Oran Berries (45% → 30%), so bringing your island berries is a real choice
      const r = Math.random()
      const got: keyof Items | null = r < 0.3 ? 'oran' : r < 0.5 ? 'elixir' : r < 0.6 ? 'seed' : r < 0.65 ? 'sitrus' : null
      if (got) run.items[got]++
      if (got) sfx('coin')
      toast(got ? `Found ${ITEM_NAME[got]}.` : 'The pot was empty.')
    } else {
      // a chest opens if anyone in the room lit a charge; each player rolls loot on their own charge
      const anyCharged = run.charged || [...guests.values()].some((g) => g.charged)
      if (test || !anyCharged) {
        if (time - sealedToast > 4) {
          sealedToast = time
          toast(test ? 'Test play: chests stay shut.' : 'Sealed. A Lantern charge opens chests.')
        }
        continue
      }
      th.open = true
      sfx(th.big ? 'unlock' : 'coin')
      if (mode === 'host' && guests.size) net?.sendEvent({ kind: 'chest', big: !!th.big })
      if (run.charged) {
        const lines = lootChest(!!th.big)
        run.found.push(...lines)
        toast(lines.join(' '))
      } else toast('Your friend opened it. Light a charge next time to share the loot.')
    }
    // saved at once, so leaving and continuing can't refill it (review 2 D1)
    ;(run.opened ??= []).push(th.key)
    saveRun()
  }
}
let sealedToast = -10
const ITEM_NAME: Record<keyof Items, string> = { oran: 'an Oran Berry', sitrus: 'a Sitrus Berry', seed: 'a Reviver Seed', elixir: 'a Max Elixir' }
const ITEM_SHORT: Record<keyof Items, string> = { oran: 'Oran Berry', sitrus: 'Sitrus Berry', seed: 'Reviver Seed', elixir: 'Max Elixir' }
/** Loot for the island, worth roughly what the session that lit the charge paid (no shells, no EXP). */
// review 2 B3, B4: chests poured out Ultra Balls and Star Pieces. A miniboss's chest now gives a
// Great Ball (10% a Star Piece); only the boss's gives an Ultra Ball, half the time (25% a Star Piece).
function lootChest(big: boolean): string[] {
  const s = latest()
  const out: string[] = []
  const r = Math.random()
  const boss = map === hand
  if (big) {
    const ultra = boss && Math.random() < 0.5
    s.balls[ultra ? 'ultra-ball' : 'great-ball']++
    out.push(ultra ? 'An Ultra Ball.' : 'A Great Ball.')
    if (Math.random() < (boss ? 0.25 : 0.1)) {
      s.starPieces++
      out.push('A Star Piece!')
    }
    if (boss && Math.random() < 0.05) {
      const st = game.pickStone()
      s.bag[st] = (s.bag[st] ?? 0) + 1
      out.push('An evolution stone!')
    }
    if (boss && Math.random() < 0.1) {
      s.bag['razor-claw'] = (s.bag['razor-claw'] ?? 0) + 1
      out.push('A Razor Claw!')
    }
  } else if (r < 0.4) {
    s.balls['poke-ball']++
    out.push('A Poké Ball.')
  } else if (r < 0.6) {
    s.berries = Math.min(9, s.berries + 1)
    out.push('An Oran Berry for the island.')
  } else if (r < 0.75) {
    s.balls['great-ball']++
    out.push('A Great Ball.')
  } else if (r < 0.85) {
    const f = ['honey', 'cheri-berry', 'pecha-berry', 'chesto-berry'][Math.floor(Math.random() * 4)]
    s.foods[f] = (s.foods[f] ?? 0) + 1
    out.push('Some food for the island.')
  } else if (r < 0.87) {
    s.starPieces++
    out.push('A Star Piece!')
  } else out.push('Only dust.')
  game.persist()
  return out
}

// ---------- items ----------
function useBerry() {
  const hurtMost = alive(party).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
  if (!hurtMost || hurtMost.hp >= hurtMost.maxHp) return toast('Everyone is at full health.')
  if (run.items.oran > 0) {
    run.items.oran--
    hurtMost.hp = Math.min(hurtMost.maxHp, hurtMost.hp + Math.round(hurtMost.maxHp * 0.3))
    pops.push({ x: hurtMost.x, y: hurtMost.y - 28, text: 'Oran Berry', t: 0, col: '#a8f0a8' })
  } else if (run.items.sitrus > 0) {
    run.items.sitrus--
    hurtMost.hp = hurtMost.maxHp
    pops.push({ x: hurtMost.x, y: hurtMost.y - 28, text: 'Sitrus Berry', t: 0, col: '#a8f0a8' })
  } else toast('No berries left.')
  hudKey = ''
  saveRun()
}
function useElixir() {
  if (run.items.elixir <= 0) return toast('No Elixirs left.')
  run.items.elixir--
  for (const p of party) p.pp = PP_MAX
  pops.push({ x: party[lead].x, y: party[lead].y - 28, text: 'Max Elixir', t: 0, col: '#ffe080' })
  hudKey = ''
  saveRun()
}

// ---------- update ----------
function update(dt: number) {
  time += dt
  shake = Math.max(0, shake - dt)
  for (const a of [...party, ...foes]) {
    a.t += dt
    a.hurt = Math.max(0, a.hurt - dt)
    a.hop = Math.max(0, a.hop - dt)
    a.cd -= dt
    a.cd1 -= dt
    a.cd2 -= dt
    a.dashCd -= dt
    a.dash = Math.max(0, a.dash - dt)
    a.sleep = Math.max(0, a.sleep - dt)
    a.still = Math.max(0, a.still - dt)
    a.guard = Math.max(0, a.guard - dt)
    a.lunge = Math.max(0, a.lunge - dt)
    a.braceCd -= dt
    a.trick -= dt
    a.gcd -= dt
    if (a.side === 'you' && !a.dead) a.pp = Math.min(PP_MAX, a.pp + dt / PP_EVERY)
    if (a.side === 'foe' && !a.dead) updateStatus(a, dt)
    if (a.dead) a.fade = Math.min(1, a.fade + dt * 1.5)
  }
  glow = Math.max(0, glow - dt)
  if (state !== 'play') return
  const me = party[lead]
  if (time - fieldAt > 0.25) {
    fieldAt = time
    buildField()
  }
  // the lead: WASD or arrows, Space to dash
  let mx = 0
  let my = 0
  if (keys.has('a') || keys.has('arrowleft')) mx--
  if (keys.has('d') || keys.has('arrowright')) mx++
  if (keys.has('w') || keys.has('arrowup')) my--
  if (keys.has('s') || keys.has('arrowdown')) my++
  if (me.sleep > 0 || me.dead) mx = my = 0
  if (me.dead) me.moving = false
  else if (me.dash > 0) {
    move(me, me.dashDir[0] * 230 * dt, me.dashDir[1] * 230 * dt)
    me.moving = true
  } else {
    me.moving = !!(mx || my)
    if (me.moving) {
      const k = (64 * dt) / Math.hypot(mx, my)
      walk(me, mx * k, my * k, dt)
      me.dashDir = [mx / Math.hypot(mx, my), my / Math.hypot(mx, my)]
    } else walk(me, 0, 0, dt)
  }
  // a Perish Song's safe ring: followers make for it
  const safe = warnings.find((w) => w.kind === 'safe')
  // followers keep near their own lead and fight what is close, finding their way around walls
  const guestLeads = leads().filter((a) => a !== me)
  const anchor = viewTarget() ?? me
  party.forEach((p, i) => {
    if (p === me || guestLeads.includes(p) || p.dead || p.sleep > 0) return
    const g = p.owner ? guests.get(p.owner) : undefined
    const own = g ? g.actors.find((a) => a.id === g.lead) : undefined
    const L = own && !own.dead ? own : me.dead ? anchor : me
    const foe = nearest(p, alive(foes).filter((f) => f.awake), 90)
    let tx = L.x + (i % 2 ? -14 : 14)
    let ty = L.y + 10
    let toLead = true
    const out = safe ? null : escapeFrom(p)
    if (safe) {
      tx = safe.x + (i % 3) * 5 - 5
      ty = safe.y
      toLead = false
    } else if (out) {
      // followers step out of a warning they stand in, as you would
      tx = out.x
      ty = out.y
      toLead = false
    } else if (foe && dist(p, foe) > range(p) - 6) {
      tx = foe.x
      ty = foe.y
      toLead = false
    }
    const d = Math.hypot(tx - p.x, ty - p.y)
    p.moving = d > (safe || out ? 4 : foe ? range(p) - 8 : 14)
    if (p.moving) seek(p, tx, ty, d > 80 ? 70 : 58, dt, toLead)
    else walk(p, 0, 0, dt)
    // followers use move 1 only from a full charge, so your key 3 usually has two pips left (D-F2)
    if (p.pp >= PP_MAX && p.gcd <= 0) {
      const t = nearest(p, foes.filter((f) => f.awake && f.sleep <= 0), reach1(p))
      if (t) strong(p, t)
    }
    // a follower stuck far behind for a few seconds is brought back beside its lead (review 2 D11)
    const far = dist(p, L)
    p.stuck = far > 120 && !foe ? p.stuck + dt : 0
    if (p.stuck > 3) {
      p.stuck = 0
      const spot = openNear(L.x, L.y)
      p.x = spot.x
      p.y = spot.y
    }
  })
  // auto-attacks for the party: only at awake enemies, so a sleeping room can be sneaked past (D-F1)
  // and never at a sleeper: sleep holds an enemy out of the fight until you choose to hit it
  const awake = foes.filter((f) => f.awake && !f.dead && f.sleep <= 0)
  for (const p of party) {
    if (p.dead || p.cd > 0 || p.sleep > 0) continue
    const target = nearest(p, awake, range(p))
    if (!target) continue
    p.cd = 0.8
    attack(p, target)
  }
  // enemies wake when you come close, then chase and attack
  for (const f of foes) {
    if (f.dead) continue
    if (f.sleep > 0) continue
    if (f.roam) {
      // Restless: awake from the start, but it only comes for you once you're near
      if (!nearest(f, party, 130)) {
        f.moving = false
        walk(f, 0, 0, dt)
        continue
      }
      f.roam = false
    }
    if (f.boss && f.awake) bossPhase(f)
    const t = nearest(f, party, f.awake ? Infinity : f.boss ? 84 : f.mini ? 80 : 64)
    if (!f.awake && t) {
      f.awake = true
      if (f.boss || f.mini) toast(`${f.name} woke up!`)
    }
    if (!f.awake || !t) {
      f.moving = false
      walk(f, 0, 0, dt)
      continue
    }
    const d = dist(f, t)
    if (f.charge) {
      // the Body Slam's run down its lane, as far as the walls allow
      const step = Math.min(f.charge.left, (f.charge.speed ?? 260) * dt)
      const bx = f.x
      const by = f.y
      move(f, f.charge.dx * step, f.charge.dy * step)
      f.charge.left -= step
      f.moving = true
      if (f.charge.left <= 0 || (f.x === bx && f.y === by)) f.charge = undefined
      continue
    }
    const k = pace(f)
    if (k === 0) {
      f.moving = false
      continue
    }
    if (!f.boss && !f.mini) {
      roleBrain(f, t, dt * k, [me, ...guestLeads].some((l) => dist(t, l) < 30))
      continue
    }
    f.moving = f.still <= 0 && f.guard <= 0 && d > range(f) - 4
    if (f.moving) seek(f, t.x, t.y, (f.boss ? 30 : f.mini ? 36 : 44) * k, dt, [me, ...guestLeads].some((l) => dist(t, l) < 30))
    else walk(f, 0, 0, dt)
    if (f.cd <= 0 && d <= range(f) && f.guard <= 0) {
      // bosses last four times longer now, so their plain blows are rarer and lighter:
      // the danger is in the warned moves, which can always be dodged (D-F3)
      f.cd = f.boss ? 2.4 : f.mini ? 2.2 : 1.15
      attack(f, t, f.boss || f.mini ? 0.6 : 1)
    }
    if (f.boss && d < 160) bossBrain(f, t)
    if (f.mini && d < 120) miniBrain(f, t)
  }
  // telegraphed attacks land, and timed beats fire
  for (const w of warnings) {
    w.t += dt
    if (w.t >= w.at) w.land()
  }
  warnings = warnings.filter((w) => w.t < w.at)
  const due = timers.filter((x) => x.at <= time)
  timers = timers.filter((x) => x.at > time)
  for (const x of due) x.fn()
  updateTraps(dt)
  updatePools(dt)
  updateThings()
  updateRoom(dt)
  // out of combat the party recovers a little; fainted partners wait for the stairs or a Reviver Seed
  const fighting = alive(foes).some((f) => f.awake && !f.roam && party.some((p) => !p.dead && dist(p, f) < 140))
  // a fight just ended: the lantern brightens for a few seconds (D-F1)
  if (fighting) fightT += dt
  else {
    if (fightT > 1) glow = GLOW
    fightT = 0
  }
  calm = fighting ? 0 : calm + dt
  if (calm > 3) for (const p of party) if (!p.dead) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.015 * dt)
  if (coop) {
    const ls = [me, ...guestLeads].filter((x) => !x.dead)
    for (const p of party) {
      if (!p.dead) continue
      const near = ls.some((l) => dist(l, p) < 16)
      p.reviveT = near ? p.reviveT + dt : 0
      if (p.reviveT > 3) {
        p.dead = false
        p.fade = 0
        p.reviveT = 0
        p.hp = Math.round(p.maxHp * 0.3)
        pops.push({ x: p.x, y: p.y - 26, text: `${p.name} is back up!`, t: 0, col: '#a8f0a8' })
      }
    }
  }

  // shots fly and hit the first body of the other side
  for (const s of shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
    const tx = Math.floor(s.x / TILE)
    const ty = Math.floor((s.y + 9) / TILE)
    const tile = baked.at(tx, ty)
    if (!walkableTile(tile) && tile !== 2) s.life = 0
    for (const a of s.side === 'you' ? foes : party) {
      if (a.dead || a.hide > 0 || s.life <= 0) continue
      if (Math.hypot(a.x - s.x, a.y - 9 - s.y) < 8) {
        if (hit(s.from, a, s.mult, s.type) && s.status) applyStatus(s.from, a, s.type, s.status)
        s.life = 0
      }
    }
  }
  shots = shots.filter((s) => s.life > 0)
  for (const r of rings) r.t += dt
  pops = pops.filter((p) => (p.t += dt) < 1.1)
  // stairs down (once the miniboss is down), or the exit (once the boss is down)
  const guarded = foes.some((f) => f.mini && !f.dead)
  if (exit && [me, ...guestLeads].some((l) => !l.dead && dist(l, exit!) < 12)) {
    if (map === hand) {
      if (bossDown) end(true)
    } else if (guarded) {
      if (time - sealedToast > 4) {
        sealedToast = time
        toast('Something guards the stairs.')
      }
    } else if (run.floor >= DEEP_LAST) end(true)
    else void downstairs()
  }
  // snapshots keep going to friends who went quiet too, so a frozen tab that wakes can rejoin
  if (mode === 'host' && (guests.size || gone.size) && !catchingUp && time - snapAt > 1 / 15) {
    snapAt = time
    snapsOut++
    net?.sendSnap(snapshot())
  }
  renderHud()
}
let fightT = 0 // seconds of the current fight
let glow = 0 // seconds left of the lantern's brighter light after a fight
const GLOW = 3
/** The brighter light's strength now: a half-second rise, then a slow settle. */
const glowK = () => {
  if (glow <= 0) return 0
  const k = glow > GLOW - 0.5 ? (GLOW - glow) / 0.5 : glow / (GLOW - 0.5)
  return k * k * (3 - 2 * k)
}
let snapAt = 0
let snapsOut = 0
let catchingUp = false // a hidden host catching up in fixed steps sends one snapshot at the end
/** Open ground near (x, y), for a follower brought back or a start spot inside a wall. */
function openNear(x: number, y: number) {
  for (let r = 0; r <= 48; r += 6)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      const px = x + Math.cos(a) * r
      const py = y + Math.sin(a) * r * 0.7
      if (canStand(px, py)) return { x: px, y: py }
      if (r === 0) break
    }
  return { x, y }
}
/** What the guest needs to draw this moment (positions are whole pixels). */
function snapshot(): Snap {
  const flags = (a: Actor) => (a.moving ? 1 : 0) | (a.hop > 0 ? 2 : 0) | (a.hurt > 0 ? 4 : 0) | (a.dead ? 8 : 0) | (a.sleep > 0 ? 16 : 0) | (a.dash > 0 ? 32 : 0) | (a.lunge > 0.1 ? 64 : 0) | (a.guard > 0 ? 128 : 0) | (a.wind > 0 ? (a.windMult > 1.35 ? 2048 : 256) : 0) | (a.brace > 0 ? 512 : 0) | (a.hide > 0 ? 1024 : 0) | (a.burn > 0 ? 4096 : 0) | (a.poison > 0 ? 8192 : 0) | (a.para > 0 ? 16384 : 0) | (a.slow > 0 ? 32768 : 0) | (a.frozen > 0 ? 65536 : 0)
  return {
    a: [...party, ...foes].map((a) => [a.id, a.side === 'you' ? 1 : 0, a.dex, Math.round(a.x), Math.round(a.y), a.dir, Math.round(a.hp), Math.round(a.maxHp), flags(a), a.level, a.boss ? 1 : a.mini ? 2 : 0, a.name, +a.fade.toFixed(2), a.side === 'you' ? +a.pp.toFixed(2) : +a.cd1.toFixed(1), +a.cd2.toFixed(1), a.awake ? 1 : 0]),
    s: shots.map((x) => [Math.round(x.x), Math.round(x.y), x.type]),
    w: warnings.map((w) => [WKINDS.indexOf(w.kind), Math.round(w.x), Math.round(w.y), w.r, Math.round(w.x2 ?? 0), Math.round(w.y2 ?? 0), +w.t.toFixed(2), w.at, w.col, w.r0 ?? 0]),
    r: rings.filter((r) => r.t < 0.5).map((r) => [Math.round(r.x), Math.round(r.y), r.max, r.col, +r.t.toFixed(2)]),
    p: pops.map((p) => [Math.round(p.x), Math.round(p.y), p.text, +p.t.toFixed(2), p.col]),
    tr: traps.map((t) => [+t.t.toFixed(2), +t.cd.toFixed(1), t.used ? 1 : 0]),
    th: things.map((t) => [t.kind === 'pot' ? 0 : 1, t.open ? 1 : 0, t.big ? 1 : 0, Math.round(t.x), Math.round(t.y)]),
    bd: bossDown ? 1 : 0,
    it: run.items,
    f: run.floor,
    sh: +shake.toFixed(2),
    // the content pass: shut doors and gates, the lever, the shrine, boulders, timed ice, the lantern's glow
    bk: blocks.map((b) => [...b.closed]),
    lv: lever?.on ? 1 : 0,
    sr: shrine?.used ? 1 : 0,
    bo: boulders.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.spin)]),
    sl: [...slick].filter(([, at]) => at !== Infinity && at > time).map(([k, at]) => [k, +(at - time).toFixed(1)]),
    gl: +glow.toFixed(2),
    fp: firePools.map((p) => [Math.round(p.x), Math.round(p.y), p.r, +(p.until - time).toFixed(1)]),
  } as unknown as Snap
}
const WKINDS: Warning['kind'][] = ['circle', 'lane', 'ring', 'safe']

// ---------- floors and the run ----------
function saveRun() {
  if (test || mode !== 'solo' || !run) return
  run.hp = {}
  for (const p of party) if (p.monId) run.hp[p.monId] = p.dead ? 0 : p.hp / p.maxHp
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run))
  } catch {}
}
function clearRun() {
  if (mode !== 'solo' || test) return // co-op runs and test plays are never saved, so they never clear a real one
  try {
    localStorage.removeItem(RUN_KEY)
  } catch {}
}
/** Build floor n: generated for B1 to B3, the hand-made map for B4 (the boss), generated again for the deep floors. */
function floorMap(n: number): DungeonMap {
  if (test || n === FLOORS) return hand
  const enemies = hand.entities.filter((e) => e.kind === 'enemy' && e.dex)
  const dexes = [...new Set(enemies.map((e) => e.dex!))]
  const lo = Math.min(...enemies.map((e) => e.level ?? 10))
  // the strongest forms in the dungeon's own list guard the stairs
  const stage = (d: number) => game.species(d)?.stage ?? 1
  const top = Math.max(...dexes.map(stage))
  const mini = dexes.filter((d) => stage(d) === top)
  // the deep floors (L10) are at the level the run chose when it went deeper
  const deep = n > FLOORS ? run.deepLevel ?? lo : 0
  const base = deep ? deep - 1 : lo - 6 + (n - 1) * 2
  return generateFloor({ seed: run.seed, floor: n, name: hand.name, theme: hand.theme, dark: hand.dark, species: dexes, mini, levels: [base, base + 2], miniboss: n >= 2, bigChest: n === DEEP_LAST })
}
/** The boss's name, for the boss floor's lines. */
const bossName = () => {
  const b = hand.entities.find((e) => e.kind === 'boss')
  return b?.dex ? game.name(b.dex) : 'the guardian'
}
/** "B2", or the boss floor by its guardian. */
const floorLabel = (n: number) => (n === FLOORS ? `${bossName()}'s floor` : `B${n}`)
/** The line on arriving at floor n: its name, and its modifier. */
function arrival(n: number, extra = '') {
  if (n === FLOORS && !test) return `${hand.name}: ${bossName()}'s floor.`
  const mod = map.modifier ? ` ${MOD_LINE[map.modifier]}` : ''
  return `${hand.name} B${n}.${extra}${mod}`
}
async function loadFloor(n: number) {
  map = floorMap(n)
  baked = bakeMap(map)
  field = new Int16Array(0)
  fieldAt = -1
  const need = new Set<number>(map.entities.filter((e) => e.dex).map((e) => e.dex!))
  await Promise.all([...need].filter((d) => !species.has(d)).map(async (d) => species.set(d, await loadSpecies(manifest, String(d).padStart(4, '0')))))
  const start = map.entities.find((e) => e.kind === 'start') ?? { x: 2, y: 2 }
  party.forEach((p, i) => {
    // up to eight in co-op: two rows, each spot moved onto open ground
    const spot = openNear(start.x * TILE + 8 + ((i % 4) - 1.5) * 12, start.y * TILE + 10 + Math.floor(i / 4) * 10)
    p.x = spot.x
    p.y = spot.y
    p.sleep = 0
    p.dash = 0
    p.stuck = 0
  })
  const mk = (e: Entity) => makeActor('foe', e.dex!, e.level ?? 10, species.get(e.dex!)!, game.species(e.dex!)?.types ?? ['normal'], game.name(e.dex!), e.x * TILE + 8, e.y * TILE + 12, e.kind === 'boss', e.kind === 'miniboss')
  foes = map.entities.filter((e) => (e.kind === 'enemy' || e.kind === 'boss' || e.kind === 'miniboss') && e.dex && species.get(e.dex)).map(mk)
  // a monster house's sleepers; Restless: everything is up and about
  for (const f of foes) {
    if (map.special?.kind === 'house' && !f.boss && !f.mini && insideRoom(f)) f.house = true
    if (map.modifier === 'restless' && !f.boss) {
      f.awake = true
      f.roam = true
    }
  }
  // co-op (review 2 B7): enemies scale with how many Pokémon came in, not how many players;
  // three is a solo party. The boss gets 15% on top, since a crowd melts it fastest.
  if (coop) {
    const k = Math.max(1, party.length / 3)
    for (const f of foes) f.hp = f.maxHp = Math.round(f.maxHp * k * (f.boss ? 1.15 : 1))
  }
  const ex = map.entities.find((e) => e.kind === 'exit' || e.kind === 'stairs')
  exit = ex ? { x: ex.x * TILE + 8, y: ex.y * TILE + 8 } : null
  bossDown = !foes.some((f) => f.boss)
  floorExtras(n)
  const spots: { kind: 'pot' | 'chest'; x: number; y: number; big?: boolean }[] = map.entities.filter((e) => e.kind === 'pot' || e.kind === 'chest').map((e) => ({ kind: e.kind as 'pot' | 'chest', x: e.x * TILE + 8, y: e.y * TILE + 10, big: e.big }))
  // review 2 B10: the boss floor gets a few pots of its own
  if (map === hand && !test) spots.push(...bossFloorPots(start))
  things = spots.map((t, i) => {
    const key = `${n}:${i}`
    return { ...t, key, open: !!run.opened?.includes(key) }
  })
  shots = []
  warnings = []
  hudKey = ''
}
/** Three pots on the boss floor, on open ground a few steps from the start, the same each time for a run. */
function bossFloorPots(start: { x: number; y: number }) {
  const out: { kind: 'pot'; x: number; y: number }[] = []
  let seed = run.seed % 2147483647 || 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let tries = 0; tries < 400 && out.length < 3; tries++) {
    const tx = start.x + Math.round((rnd() - 0.5) * 16)
    const ty = start.y + Math.round((rnd() - 0.5) * 12)
    const x = tx * TILE + 8
    const y = ty * TILE + 10
    if (Math.abs(tx - start.x) + Math.abs(ty - start.y) < 3 || !canStand(x, y)) continue
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < 40)) continue
    out.push({ kind: 'pot', x, y })
  }
  return out
}
/** Load a floor; if it fails, say so instead of freezing (the run is saved at the stairs). */
async function loadSafely(n: number) {
  try {
    await loadFloor(n)
    return true
  } catch (err) {
    console.error(err)
    state = 'busy'
    view.style.opacity = '1'
    message('<p>This floor could not load.</p><p class="dg-dim">Your run is saved at the last stairs.</p>', [
      { label: 'Try again', gold: true, run: () => location.reload() },
      { label: 'Back to the island', run: home },
    ])
    return false
  }
}
let stepping = false
async function downstairs() {
  if (stepping) return
  stepping = true
  state = 'busy'
  // the stairs (review 2 B10): heal everyone by half, wake anyone fainted (at a third), save the run
  for (const p of party) {
    if (p.dead) {
      p.dead = false
      p.fade = 0
      p.hp = Math.round(p.maxHp / 3)
    } else p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp / 2))
  }
  run.floor++
  saveRun()
  if (mode === 'host' && guests.size) net?.sendEvent({ kind: 'floor', floor: run.floor, level: run.deepLevel })
  view.style.transition = 'opacity .35s ease'
  view.style.opacity = '0'
  await new Promise((r) => setTimeout(r, 380))
  if (!(await loadSafely(run.floor))) return
  view.style.opacity = '1'
  toast(arrival(run.floor, run.floor === FLOORS + 1 ? ` The deep floors, at about Lv${run.deepLevel}.` : mode === 'solo' ? ' The stairs saved your run.' : ''))
  state = 'play'
  stepping = false
}
/** After a charged clear of a gate already beaten once: three deeper floors (L10). No EXP, no shells. */
function goDeeper() {
  hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
  run.deepLevel = Math.max(1, Math.max(...party.map((p) => p.level)) - 5)
  run.over = false
  void downstairs()
}

// ---------- co-op: the guest ----------
const actors = new Map<number, Actor>() // guest: everyone the host has told us about
const loadingSp = new Set<number>()
function loadSp(dex: number) {
  if (species.has(dex) || loadingSp.has(dex)) return
  loadingSp.add(dex)
  void loadSpecies(manifest, String(dex).padStart(4, '0')).then((sp) => species.set(dex, sp))
}
/** The guest builds the same floor from the shared seed; the host's snapshots fill it. */
async function guestFloor(n: number) {
  run.floor = n
  map = floorMap(n)
  baked = bakeMap(map)
  const need = new Set<number>(map.entities.filter((e) => e.dex).map((e) => e.dex!))
  await Promise.all([...need].filter((d) => !species.has(d)).map(async (d) => species.set(d, await loadSpecies(manifest, String(d).padStart(4, '0')))))
  const ex = map.entities.find((e) => e.kind === 'exit' || e.kind === 'stairs')
  exit = ex ? { x: ex.x * TILE + 8, y: ex.y * TILE + 8 } : null
  floorExtras(n)
  // the host's next snapshot moves everyone (our lead included) to the new floor
  const me = actors.get(guestLeadId)
  if (me) me.tx = undefined
  hudKey = ''
}
let snapsIn = 0
let snapsUsed = 0
function applySnap(raw: Snap) {
  snapsIn++
  heardAt = performance.now()
  const s = raw as unknown as {
    a: [number, number, number, number, number, number, number, number, number, number, number, string, number, number, number, number][]
    s: [number, number, string][]
    w: [number, number, number, number, number, number, number, number, string, number][]
    r: [number, number, number, string, number][]
    p: [number, number, string, number, string][]
    tr: [number, number, number][]
    th: [number, number, number, number, number][]
    bd: number
    it: Items
    f: number
    sh: number
    bk?: number[][]
    lv?: number
    sr?: number
    bo?: [number, number, number][]
    sl?: [number, number][]
    gl?: number
    fp?: [number, number, number, number][]
  }
  if (!map || !run || s.f !== run.floor) return
  snapsUsed++
  const seen = new Set<number>()
  for (const [id, you, dex, x, y, dir, hp, maxHp, fl, level, kind, name, fade, cd1, cd2, awake] of s.a) {
    let a = actors.get(id)
    if (!a) {
      const sp = species.get(dex)
      if (!sp) {
        loadSp(dex)
        continue
      }
      a = makeActor(you ? 'you' : 'foe', dex, level, sp, game.species(dex)?.types ?? ['normal'], name, x, y, kind === 1, kind === 2)
      a.id = id
      actors.set(id, a)
    }
    if (a.dex !== dex && species.get(dex)) {
      a.dex = dex
      a.sp = species.get(dex)!
    }
    const mineLead = id === guestLeadId
    // our own lead moves here; only a big jump (a new floor) comes from the host
    if (!mineLead || a.tx === undefined || Math.hypot(a.x - x, a.y - y) > 64) {
      if (mineLead || a.tx === undefined) {
        a.x = x
        a.y = y
      }
      a.tx = x
      a.ty = y
      if (!mineLead) a.dir = dir
    }
    a.hp = hp
    a.maxHp = maxHp
    if (!mineLead) a.moving = !!(fl & 1)
    if (fl & 2) a.hop = Math.max(a.hop, 0.15)
    if (fl & 4) a.hurt = Math.max(a.hurt, 0.1)
    a.dead = !!(fl & 8)
    a.sleep = fl & 16 ? 0.2 : 0
    if (!mineLead && fl & 32) a.dash = 0.05
    if (fl & 64) a.lunge = Math.max(a.lunge, 0.15)
    a.guard = fl & 128 ? 0.1 : 0
    a.wind = fl & (256 | 2048) ? 0.1 : 0
    a.windMult = fl & 2048 ? 2 : 1
    a.brace = fl & 512 ? 0.1 : 0
    a.hide = fl & 1024 ? 0.1 : 0
    a.fade = fade
    if (you) a.pp = cd1
    else a.cd1 = cd1
    a.cd2 = cd2
    a.burn = fl & 4096 ? 0.1 : 0
    a.poison = fl & 8192 ? 0.1 : 0
    a.para = fl & 16384 ? 0.1 : 0
    a.slow = fl & 32768 ? 0.1 : 0
    a.frozen = fl & 65536 ? 0.1 : 0
    a.awake = !!awake
    seen.add(id)
  }
  for (const id of [...actors.keys()]) if (!seen.has(id)) actors.delete(id)
  party = [...actors.values()].filter((a) => a.side === 'you')
  foes = [...actors.values()].filter((a) => a.side === 'foe')
  lead = Math.max(0, party.findIndex((a) => a.id === guestLeadId))
  const someone = party[0]
  shots = someone ? s.s.map(([x, y, type]) => ({ x, y, vx: 0, vy: 0, side: 'you' as const, from: someone, mult: 1, type, life: 1 })) : []
  warnings = s.w.map(([k, x, y, r, x2, y2, t, at, col, r0]) => ({ kind: WKINDS[k] ?? 'circle', x, y, r, r0, x2, y2, t, at, col, land: () => {} }))
  rings.length = 0
  for (const [x, y, max, col, t] of s.r) rings.push({ x, y, r: 0, max, col, t })
  pops = s.p.map(([x, y, text, t, col]) => ({ x, y, text, t, col }))
  s.tr.forEach(([t, cd, used], i) => {
    if (traps[i]) Object.assign(traps[i], { t, cd, used: !!used })
  })
  things = s.th.map(([chest, open, big, x, y], i) => ({ kind: chest ? ('chest' as const) : ('pot' as const), open: !!open, big: !!big, x, y, key: String(i) }))
  bossDown = !!s.bd
  run.items = s.it
  shake = Math.max(shake, s.sh)
  // shut doors and gates block the guest's own lead too
  s.bk?.forEach((shut, i) => {
    const b = blocks[i]
    if (!b) return
    for (const t of b.tiles) setShut(b, t, shut.includes(t))
  })
  if (lever) lever.on = !!s.lv
  if (shrine) shrine.used = !!s.sr
  boulders = (s.bo ?? []).map(([x, y, spin]) => ({ x, y, dx: 0, dy: 0, left: 0, hit: new Set<number>(), spin }))
  for (const [k, at] of [...slick]) if (at !== Infinity) slick.delete(k)
  for (const [k, left] of s.sl ?? []) slick.set(k, time + left)
  glow = s.gl ?? 0
  firePools = someone ? (s.fp ?? []).map(([x, y, r, left]) => ({ x, y, r, until: time + left, tick: 1, from: someone })) : []
}
let inputAt = 0
function guestUpdate(dt: number) {
  time += dt
  shake = Math.max(0, shake - dt)
  for (const a of actors.values()) {
    a.t += dt
    a.hurt = Math.max(0, a.hurt - dt)
    a.hop = Math.max(0, a.hop - dt)
    a.dash = Math.max(0, a.dash - dt)
    a.dashCd -= dt
    a.lunge = Math.max(0, a.lunge - dt)
    if (a.id !== guestLeadId && a.tx !== undefined && a.ty !== undefined) {
      // others ease toward where the host says they are
      const k = Math.min(1, dt * 12)
      a.x += (a.tx - a.x) * k
      a.y += (a.ty! - a.y) * k
    }
  }
  for (const r of rings) r.t += dt
  for (const p of pops) p.t += dt
  if (actors.get(guestLeadId)?.dead) switchGuestLead()
  const me = actors.get(guestLeadId)
  if (state !== 'play' || !me || me.dead) {
    renderHud()
    return
  }
  let mx = 0
  let my = 0
  if (keys.has('a') || keys.has('arrowleft')) mx--
  if (keys.has('d') || keys.has('arrowright')) mx++
  if (keys.has('w') || keys.has('arrowup')) my--
  if (keys.has('s') || keys.has('arrowdown')) my++
  if (me.sleep > 0) mx = my = 0
  if (me.dash > 0) {
    move(me, me.dashDir[0] * 230 * dt, me.dashDir[1] * 230 * dt)
    me.moving = true
  } else {
    me.moving = !!(mx || my)
    if (me.moving) {
      const k = (64 * dt) / Math.hypot(mx, my)
      walk(me, mx * k, my * k, dt)
      me.dashDir = [mx / Math.hypot(mx, my), my / Math.hypot(mx, my)]
    } else walk(me, 0, 0, dt)
  }
  // the shrine's prompt, for our own lead (the host runs the trade)
  if (shrine && !shrine.used) {
    const near = dist(me, shrine) < 12
    if (near && !shrine.told) toast(run.items.oran >= 2 ? 'A shrine. Press F to trade 2 Oran Berries for a Reviver Seed.' : 'A shrine. It asks for 2 Oran Berries.')
    shrine.told = near
  }
  // after a new floor, wait for the host to place us before sending positions again
  if (time - inputAt > 1 / 20 && me.tx !== undefined) {
    inputAt = time
    net?.sendInput({ id: guestLeadId, floor: run.floor, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, moving: me.moving, acts: guestActs.splice(0) }, hostPeer || undefined)
  }
  renderHud()
}

// ---------- drawing ----------
const scratch = document.createElement('canvas')
function drawActor(g: CanvasRenderingContext2D, a: Actor, cx: number, cy: number) {
  const A = a.sp.anims
  const anim = a.dead || a.sleep > 0 ? A.Sleep ?? A.Idle : a.hop > 0 && A.Hop ? A.Hop : a.moving ? A.Walk : A.Idle
  const t = a.hop > 0 ? 0.3 - a.hop : a.moving ? a.t * (a.dash > 0 ? 2 : 0.8) : a.t
  const f = frameAt(anim, t, a.hop <= 0)
  // a melee lunge: a short step toward where it faces, and back
  // a wind-up draws it back a step before it lets go (the tell)
  const lk = a.lunge > 0 ? Math.sin((1 - a.lunge / 0.2) * Math.PI) * 5 : a.wind > 0 ? -2 : 0
  const [ux, uy] = DIRV[a.dir] ?? [0, 1]
  const x = a.x - cx + Math.round(ux * lk)
  const y = a.y - cy + Math.round(uy * lk * 0.7)
  // a faded phantom is only a faint shape
  g.globalAlpha = a.hide > 0 ? 0.14 : 1 - a.fade * 0.85
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(Math.round(x - 6), Math.round(y - 1), 12, 2)
  if (a.hurt > 0 || a.dash > 0 || a.guard > 0 || a.wind > 0 || a.brace > 0 || a.frozen > 0) {
    scratch.width = anim.w
    scratch.height = anim.h
    const sg = scratch.getContext('2d')!
    drawFrame(sg, anim, f, a.dir, anim.ax, anim.ay)
    sg.globalCompositeOperation = 'source-atop'
    sg.fillStyle =
      a.hurt > 0
        ? 'rgba(255,255,255,0.8)'
        : a.dash > 0
          ? 'rgba(200,230,255,0.5)'
          : a.frozen > 0
            ? 'rgba(180,235,255,0.6)'
            : a.brace > 0
            ? 'rgba(150,175,225,0.45)'
            : a.wind > 0
              ? a.windMult > 1.35
                ? 'rgba(255,200,120,0.5)' // a charged shot or a Lick: a stronger glow
                : 'rgba(255,170,130,0.32)'
              : 'rgba(255,236,190,0.35)'
    sg.fillRect(0, 0, anim.w, anim.h)
    g.drawImage(scratch, Math.round(x - anim.ax), Math.round(y - anim.ay))
  } else drawFrame(g, anim, f, a.dir, x, y)
  // a status shows as a small mark over its head, in the status's colour, pulsing slowly
  if (a.side === 'foe' && !a.dead) {
    const marks = [a.burn > 0 && '#ff9a50', a.poison > 0 && '#c070e8', a.para > 0 && '#ffe040', (a.slow > 0 || a.frozen > 0) && '#80c8ff'].filter(Boolean) as string[]
    const top = Math.round(y - anim.ay - 3)
    marks.forEach((c, i) => {
      g.globalAlpha = 0.65 + 0.35 * Math.sin(a.t * 3 + i)
      g.fillStyle = c
      g.fillRect(Math.round(x - marks.length * 2 + i * 4), top, 3, 3)
    })
  }
  g.globalAlpha = 1
  return { anim, f }
}
// sprite rows: 0 down, 1 down-right, 2 right … 7 down-left
const DIRV: [number, number][] = [[0, 1], [0.7, 0.7], [1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7], [-1, 0], [-0.7, 0.7]]
function drawTrap(g: CanvasRenderingContext2D, tr: Trap, cx: number, cy: number) {
  const x = Math.round(tr.x - cx - 6)
  const y = Math.round(tr.y - cy - 5)
  if (tr.kind === 'spikes') {
    const ph = tr.t % SPIKE_CYCLE
    const up = ph > SPIKE_CYCLE - 0.6
    const rising = !up && ph > SPIKE_CYCLE - 1.0
    g.fillStyle = '#3a3632'
    g.fillRect(x, y, 12, 10)
    g.fillStyle = '#58524a'
    g.fillRect(x + 1, y + 1, 10, 8)
    g.fillStyle = up ? '#e8e4dc' : rising ? '#9a948a' : '#2a2622'
    for (const [sx, sy] of [[2, 2], [7, 2], [4, 5], [9, 6], [2, 7]]) g.fillRect(x + sx, y + sy - (up ? 2 : 0), 1, up ? 3 : 1)
  } else if (tr.kind === 'spores') {
    g.fillStyle = '#4a5a2a'
    g.fillRect(x + 2, y + 3, 8, 5)
    g.fillStyle = tr.cd > 0 ? '#5a6a3a' : '#9ac050'
    g.fillRect(x + 4, y + 4, 4, 2)
  } else if (tr.kind === 'boulders') {
    // a cracked stone plate, with a scuff showing which way the boulder runs
    g.fillStyle = '#4a4238'
    g.fillRect(x, y + 1, 12, 8)
    g.fillStyle = tr.cd > 0 ? '#5e564a' : '#7a7062'
    g.fillRect(x + 1, y + 2, 10, 6)
    g.fillStyle = '#4a4238'
    if (tr.dir === 'v') g.fillRect(x + 5, y + 2, 2, 6)
    else g.fillRect(x + 1, y + 4, 10, 2)
  } else if (tr.kind === 'alarm' && !tr.used) {
    g.fillStyle = '#4a2a2a'
    g.fillRect(x + 1, y + 1, 10, 8)
    g.fillStyle = '#c84848'
    g.fillRect(x + 4, y + 3, 4, 4)
  }
}
/** The floor underfoot, drawn before the light: shallow water, slick ice. */
function drawGround(g: CanvasRenderingContext2D, cx: number, cy: number) {
  const x0 = Math.floor(cx / TILE)
  const y0 = Math.floor(cy / TILE)
  for (const r of map.wet ?? [])
    for (let ty = Math.max(r.y, y0); ty < Math.min(r.y + r.h, y0 + VH / TILE + 2); ty++)
      for (let tx = Math.max(r.x, x0); tx < Math.min(r.x + r.w, x0 + VW / TILE + 2); tx++) {
        if (!walkableTile(baked.at(tx, ty))) continue
        const px = tx * TILE - cx
        const py = ty * TILE - cy
        g.fillStyle = 'rgba(58,110,170,0.42)'
        g.fillRect(px, py, TILE, TILE)
        // a slow glint drifting across
        const k = (time * 0.6 + tx * 0.37 + ty * 0.71) % 3
        g.fillStyle = 'rgba(170,210,240,0.55)'
        if (k < 1) g.fillRect(px + 3 + Math.floor(k * 8), py + 5 + ((tx + ty) % 3) * 3, 3, 1)
      }
  for (const fp of firePools) {
    // a burning patch: a dark scorch with a slow orange shimmer, fading out at the end
    const k = Math.min(1, (fp.until - time) / 0.8)
    const x = fp.x - cx
    const y = fp.y - cy - 2
    g.globalAlpha = 0.55 * k
    g.fillStyle = '#5a1a08'
    g.beginPath()
    g.ellipse(x, y, fp.r, fp.r * 0.6, 0, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = (0.45 + 0.15 * Math.sin(time * 4 + fp.x)) * k
    g.fillStyle = '#ff7a2a'
    g.beginPath()
    g.ellipse(x, y, fp.r * 0.75, fp.r * 0.45, 0, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
  }
  for (const [k, at] of slick) {
    if (at <= time) continue
    const tx = k % map.w
    const ty = (k - tx) / map.w
    if (tx < x0 - 1 || ty < y0 - 1 || tx > x0 + VW / TILE + 1 || ty > y0 + VH / TILE + 1) continue
    const px = tx * TILE - cx
    const py = ty * TILE - cy
    const fade = at === Infinity ? 1 : Math.min(1, (at - time) / 1.5)
    // a cyan sheet with white streaks, so it reads on a cave floor and on an ice one
    g.fillStyle = `rgba(120,200,250,${0.42 * fade})`
    g.fillRect(px, py, TILE, TILE)
    g.fillStyle = `rgba(255,255,255,${0.8 * fade})`
    for (const [sx, sy] of [[2, 4], [3, 3], [4, 2], [9, 11], [10, 10], [11, 9], [12, 8]]) g.fillRect(px + sx, py + sy, 1, 1)
  }
}
/** Shut doors and gates, the lever, the shrine and rolling boulders: drawn over traps, before the light. */
function drawFixtures(g: CanvasRenderingContext2D, cx: number, cy: number) {
  // shut doors (stone slabs) and gates (iron bars), rising as they close
  for (const b of blocks)
    for (const i of b.closed) {
      const tx = i % map.w
      const ty = (i - tx) / map.w
      const px = tx * TILE - cx
      const py = ty * TILE - cy
      const h = Math.round(TILE * Math.min(1, b.t / 0.3))
      const top = py + TILE - h
      if (b.kind === 'door') {
        g.fillStyle = '#3a3229'
        g.fillRect(px, top, TILE, h)
        g.fillStyle = '#5a5044'
        g.fillRect(px + 1, top + 1, TILE - 2, h - 2)
        g.fillStyle = '#3a3229'
        for (let r = top + 5; r < py + TILE - 1; r += 5) g.fillRect(px + 1, r, TILE - 2, 1)
      } else {
        g.fillStyle = '#2e2a26'
        g.fillRect(px, top, TILE, 2)
        g.fillStyle = '#7a746c'
        for (let c = 1; c < TILE; c += 4) g.fillRect(px + c, top, 2, h)
      }
    }
  if (lever) {
    const x = Math.round(lever.x - cx)
    const y = Math.round(lever.y - cy)
    g.fillStyle = '#3a3229'
    g.fillRect(x - 5, y - 2, 10, 3)
    g.fillStyle = '#8a8070'
    const d = lever.on ? 1 : -1
    for (let i = 0; i < 6; i++) g.fillRect(x + d * Math.floor(i / 2), y - 3 - i, 1, 1)
    g.fillStyle = lever.on ? '#f8d060' : '#c84848'
    g.fillRect(x + d * 3 - 1, y - 10, 3, 2)
  }
  if (shrine) {
    const x = Math.round(shrine.x - cx)
    const y = Math.round(shrine.y - cy)
    g.fillStyle = '#4e4a44'
    g.fillRect(x - 6, y - 4, 12, 4)
    g.fillStyle = '#8a857c'
    g.fillRect(x - 4, y - 12, 8, 8)
    g.fillStyle = '#b8b2a8'
    g.fillRect(x - 5, y - 14, 10, 2)
    g.fillStyle = shrine.used ? '#6a6660' : '#c8f0d8'
    g.fillRect(x - 1, y - 10, 2, 3)
  }
  for (const b of boulders) {
    const x = Math.round(b.x - cx)
    const y = Math.round(b.y - cy)
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.fillRect(x - 6, y - 1, 12, 2)
    g.fillStyle = '#5a5248'
    g.beginPath()
    g.arc(x, y - 7, 7, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#8a8274'
    g.beginPath()
    g.arc(x - 1, y - 8, 5, 0, Math.PI * 2)
    g.fill()
    // a mark that turns as it rolls
    const a = b.spin / 7
    g.fillStyle = '#4a4238'
    g.fillRect(Math.round(x + Math.cos(a) * 3) - 1, Math.round(y - 7 + Math.sin(a) * 3) - 1, 2, 2)
  }
}
function drawThing(g: CanvasRenderingContext2D, th: Thing, cx: number, cy: number) {
  const x = Math.round(th.x - cx)
  const y = Math.round(th.y - cy)
  if (th.kind === 'pot') {
    if (th.open) {
      g.fillStyle = '#6a4a32'
      g.fillRect(x - 4, y - 2, 3, 2)
      g.fillRect(x + 1, y - 1, 3, 2)
      return
    }
    g.fillStyle = '#5a3a24'
    g.fillRect(x - 4, y - 9, 8, 9)
    g.fillStyle = '#a0683e'
    g.fillRect(x - 3, y - 8, 6, 7)
    g.fillStyle = '#c88a54'
    g.fillRect(x - 2, y - 10, 4, 2)
    return
  }
  const w = th.big ? 16 : 12
  g.fillStyle = '#3a2410'
  g.fillRect(x - w / 2, y - 10, w, 10)
  g.fillStyle = th.open ? '#5a3a1c' : th.big ? '#c89838' : '#a0683a'
  g.fillRect(x - w / 2 + 1, y - (th.open ? 6 : 9), w - 2, th.open ? 5 : 8)
  g.fillStyle = th.open ? '#2a1a0c' : '#f8d060'
  g.fillRect(x - 1, y - 6, 2, 2)
}
function render() {
  const me = viewTarget()
  if (!me || !baked) return
  const sx = shake > 0 ? Math.round((Math.random() - 0.5) * 4) : 0
  const sy = shake > 0 ? Math.round((Math.random() - 0.5) * 3) : 0
  const cx = Math.round(Math.max(0, Math.min(map.w * TILE - VW, me.x - VW / 2))) + sx
  const cy = Math.round(Math.max(0, Math.min(map.h * TILE - VH, me.y - VH / 2))) + sy
  fg.globalCompositeOperation = 'source-over'
  fg.fillStyle = '#07080a'
  fg.fillRect(0, 0, VW, VH)
  fg.drawImage(baked.color, cx, cy, VW, VH, 0, 0, VW, VH)
  ng.drawImage(baked.normal, cx, cy, VW, VH, 0, 0, VW, VH)
  // the way on: stairs on B1 to B3 (glowing once unguarded), the exit on the last floor (once the boss is down)
  if (exit) {
    const open = map === hand ? bossDown : !foes.some((f) => f.mini && !f.dead)
    const ex = exit.x - cx - 7
    const ey = exit.y - cy - 7
    fg.fillStyle = open ? '#3a2e1a' : '#1a1814'
    fg.fillRect(ex, ey, 14, 14)
    fg.fillStyle = open ? '#c8a050' : '#4a4236'
    for (let i = 0; i < 4; i++) fg.fillRect(ex + 2, ey + 2 + i * 3, 10 - i * 2, 2)
  }
  // traps and things are lit like the floor, so in the dark you only see them near light
  drawGround(fg, cx, cy)
  for (const tr of traps) drawTrap(fg, tr, cx, cy)
  for (const th of things) drawThing(fg, th, cx, cy)
  drawFixtures(fg, cx, cy)
  const bodies = [...foes, ...party].sort((a, b) => a.y - b.y)
  for (const a of bodies) {
    if (a.dead && a.fade >= 1) continue
    if (a.x < cx - 40 || a.x > cx + VW + 40 || a.y < cy - 40 || a.y > cy + VH + 60) continue
    const { anim, f } = drawActor(fg, a, cx, cy)
    drawFrame(ng, { ...anim, img: normalMapFor(anim.img) as unknown as HTMLImageElement }, f, a.dir, a.x - cx, a.y - cy)
  }
  for (const s of shots) {
    fg.fillStyle = COL[s.type] ?? '#fff'
    fg.fillRect(Math.round(s.x - cx - 2), Math.round(s.y - cy - 2), 4, 4)
    fg.fillStyle = '#fff'
    fg.fillRect(Math.round(s.x - cx - 1), Math.round(s.y - cy - 1), 2, 2)
  }
  // light: the map's torches and crystals, a lantern the lead carries, fire types, flying fire
  // Fog shortens every light's reach; a won fight brightens the lantern for a few seconds
  const fog = map.modifier === 'fog' ? 0.7 : 1
  const gk = glowK()
  const lights: Light[] = []
  for (const l of baked.lights) if (l.x > cx - l.r && l.x < cx + VW + l.r && l.y > cy - l.r && l.y < cy + VH + l.r) lights.push({ ...l, r: l.r * fog, x: l.x - cx, y: l.y - cy, power: l.power * (0.94 + 0.06 * Math.sin(time * 3 + l.x)) })
  if (shrine && !shrine.used) lights.push({ x: shrine.x - cx, y: shrine.y - cy - 10, z: 14, r: 34, color: [0.75, 1, 0.85], power: 1.1 })
  // only the lantern and fire light a dark room
  const own: Light[] = [{ x: me.x - cx, y: me.y - cy - 10, z: 22, r: ((run?.charged ? 110 : 96) + 36 * gk) * (fog < 1 ? 0.65 : 1), color: [1, 0.93, 0.82], power: 1.25 + 0.35 * gk }]
  for (const a of [...party, ...foes]) if (!a.dead && a.types.includes('fire')) own.push({ x: a.x - cx, y: a.y - cy - 8, z: 12, r: 40, color: [1, 0.6, 0.3], power: 1.1 })
  for (const s of shots) if (s.type === 'fire') own.push({ x: s.x - cx, y: s.y - cy, z: 8, r: 22, color: [1, 0.6, 0.3], power: 1.2 })
  for (const fp of firePools) own.push({ x: fp.x - cx, y: fp.y - cy - 4, z: 8, r: 34, color: [1, 0.5, 0.2], power: 1.0 * Math.min(1, (fp.until - time) / 0.8) })
  for (const s of shots) if (s.type === 'electric') lights.push({ x: s.x - cx, y: s.y - cy, z: 8, r: 22, color: [1, 0.95, 0.5], power: 1.2 })
  const amb = 1 - map.dark * 0.92
  const dark = map.special?.kind === 'dark' ? map.special : null
  const dx0 = dark ? (dark.x - 1) * TILE - cx : 0
  const dy0 = dark ? (dark.y - 1) * TILE - cy : 0
  const seesDark = dark && dx0 < VW && dy0 < VH && dx0 + (dark.w + 2) * TILE > 0 && dy0 + (dark.h + 2) * TILE > 0
  if (seesDark) {
    dfg.globalCompositeOperation = 'copy'
    dfg.drawImage(frame, 0, 0)
    dng.globalCompositeOperation = 'copy'
    dng.drawImage(ncv, 0, 0)
  }
  applyLighting(fg, ng, [amb * 0.85, amb * 0.9, amb * 1.1], [...lights, ...own])
  if (seesDark) {
    applyLighting(dfg, dng, [0.02, 0.02, 0.04], own)
    fg.save()
    fg.beginPath()
    fg.rect(dx0, dy0, (dark!.w + 2) * TILE, (dark!.h + 2) * TILE)
    fg.clip()
    fg.drawImage(dcv, 0, 0)
    fg.restore()
  }
  // drawn after the light, so they always read: warnings, bursts, HP bars, numbers
  for (const w of warnings) {
    const k = w.t / w.at
    fg.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(k * Math.PI * 3))
    fg.fillStyle = w.col
    fg.strokeStyle = w.col
    fg.lineWidth = 1
    if (w.kind === 'circle') {
      fg.beginPath()
      fg.ellipse(w.x - cx, w.y - cy - 2, w.r, w.r * 0.6, 0, 0, Math.PI * 2)
      fg.fill()
      fg.globalAlpha = 0.9
      fg.beginPath()
      fg.ellipse(w.x - cx, w.y - cy - 2, w.r * k, w.r * k * 0.6, 0, 0, Math.PI * 2)
      fg.stroke()
    } else if (w.kind === 'ring') {
      // the band between the inner and outer ellipses is hit; inside and outside are safe
      const r0 = w.r0 ?? 0
      fg.beginPath()
      fg.ellipse(w.x - cx, w.y - cy - 2, w.r, w.r * 0.6, 0, 0, Math.PI * 2)
      fg.ellipse(w.x - cx, w.y - cy - 2, r0, r0 * 0.6, 0, 0, Math.PI * 2)
      fg.fill('evenodd')
      fg.globalAlpha = 0.9
      fg.beginPath()
      fg.ellipse(w.x - cx, w.y - cy - 2, r0 + (w.r - r0) * k, (r0 + (w.r - r0) * k) * 0.6, 0, 0, Math.PI * 2)
      fg.stroke()
    } else if (w.kind === 'safe') {
      // the one safe place: a steady ring that fills as the song ends
      fg.globalAlpha = 0.18 + 0.3 * k
      fg.beginPath()
      fg.ellipse(w.x - cx, w.y - cy - 2, w.r, w.r * 0.6, 0, 0, Math.PI * 2)
      fg.fill()
      fg.globalAlpha = 0.95
      fg.lineWidth = 2
      fg.stroke()
    } else {
      fg.lineWidth = w.r * 2
      fg.lineCap = 'round'
      fg.beginPath()
      fg.moveTo(w.x - cx, w.y - cy)
      fg.lineTo(w.x2! - cx, w.y2! - cy)
      fg.stroke()
      fg.lineCap = 'butt'
    }
    fg.globalAlpha = 1
    fg.lineWidth = 1
  }
  for (const r of rings) {
    const k = r.t / 0.5
    if (k >= 1) continue
    fg.strokeStyle = r.col
    fg.globalAlpha = 1 - k
    fg.lineWidth = 2
    fg.beginPath()
    fg.ellipse(r.x - cx, r.y - cy, r.max * k, r.max * k * 0.6, 0, 0, Math.PI * 2)
    fg.stroke()
    fg.globalAlpha = 1
  }
  for (const f of foes) {
    if (f.dead || !f.awake || f.boss) continue
    const x = Math.round(f.x - cx - 8)
    const y = Math.round(f.y - cy - Math.min(f.sp.anims.Idle.ay, 30) - 4)
    fg.fillStyle = '#202020'
    fg.fillRect(x, y, 16, 3)
    const p = f.hp / f.maxHp
    fg.fillStyle = f.mini ? '#f8a040' : p > 0.5 ? '#58d058' : p > 0.2 ? '#f8c838' : '#f05040'
    fg.fillRect(x + 1, y + 1, Math.round(14 * p), 1)
  }
  fg.font = '8px "Press Start 2P", monospace'
  fg.textAlign = 'center'
  for (const p of pops) {
    if (!p.text) continue
    const y = p.y - cy - p.t * 14
    fg.globalAlpha = Math.min(1, 1.6 - p.t * 1.4)
    fg.fillStyle = '#101010'
    fg.fillText(p.text, p.x - cx + 1, y + 1)
    fg.fillStyle = p.col
    fg.fillText(p.text, p.x - cx, y)
    fg.globalAlpha = 1
  }
  vg.imageSmoothingEnabled = false
  vg.drawImage(frame, 0, 0)
}

// ---------- HUD ----------
let toastTimer = 0
let toastKeep = 0 // an important line (a boss phase, the stairs) isn't covered by a minor one
function toast(t: string, minor = false) {
  const el = hud.querySelector<HTMLElement>('.dg-toast')
  if (!el) return
  if (minor && performance.now() < toastKeep) return
  if (!minor) toastKeep = performance.now() + 2000
  el.textContent = t
  el.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600)
}
const hpClass = (p: number) => (p > 0.5 ? '' : p > 0.2 ? 'mid' : 'low')
let hudKey = ''
function renderHud() {
  const me = party[lead]
  if (!me || !run) return
  const boss = foes.find((f) => f.boss || (f.mini && f.awake && !f.dead))
  const it = run.items
  // move 1 is named for the type it would really use on the nearest awake enemy
  const near = nearest(me, foes.filter((f) => f.awake), 120)
  const t1 = near ? bestType(me, near) : (me.types[0] ?? 'normal')
  const two = second(me)
  const key = party.map((p) => `${Math.round(p.hp)}:${p.dead}`).join() + `|${lead}|${boss?.hp}:${boss?.awake}|${Math.floor(me.pp * 4)}:${Math.ceil(me.dashCd * 4)}|${two?.id}:${Math.floor((two?.pp ?? 0) * 4)}|${it.oran}${it.sitrus}${it.seed}${it.elixir}|${run.floor}|${t1}`
  if (key === hudKey) return
  hudKey = key
  const t = me.types[0] ?? 'normal'
  hud.querySelector('.dg-party')!.innerHTML = party
    .map((p, i) => `<div class="dg-panel dg-mon${i === lead ? ' on' : ''}${p.dead ? ' out' : ''}"><img src="${portrait(p.dex)}" alt="" /><div class="nm"><p>${p.name}</p><span class="hp"><i class="${hpClass(p.hp / p.maxHp)}" style="width:${(p.hp / p.maxHp) * 100}%"></i></span></div></div>`)
    .join('')
  const bossEl = hud.querySelector<HTMLElement>('.dg-boss')!
  bossEl.hidden = !boss || !boss.awake || boss.dead
  if (boss) bossEl.innerHTML = `<p>${boss.name} <span style="color:#707070">Lv${boss.level}</span></p><span class="hp"><i class="${hpClass(boss.hp / boss.maxHp)}" style="width:${(boss.hp / boss.maxHp) * 100}%"></i></span>`
  // the shared charge: three pips, the next one filling; a move you can't afford is dimmed
  const pips = (a: Actor) =>
    `<span class="dg-pips">${[0, 1, 2].map((i) => `<i class="${a.pp >= i + 1 ? 'full' : ''}"${a.pp >= i + 1 || a.pp < i ? '' : ` style="--fill:${Math.round((a.pp - i) * 100)}%"`}></i>`).join('')}</span>`
  const word = (type: string) => `<span style="color:${STATUS_INK[statusOf(type)]}">${STATUS_WORD[statusOf(type)]}</span>`
  hud.querySelector('.dg-moves')!.innerHTML = `
    <div class="dg-panel dg-move"><p><b>Charge</b></p>${pips(me)}</div>
    <div class="dg-panel dg-move${me.pp >= 1 ? '' : ' off'}"><p><b>1</b> ${word(t1)}</p><p>${STRONG[t1] ?? 'Body Slam'}</p></div>
    <div class="dg-panel dg-move${me.pp >= 2 ? '' : ' off'}"><p><b>2</b> ${word(t)}</p><p>${BURST[t] ?? 'Hyper Voice'}</p></div>
    <div class="dg-panel dg-move${two && two.pp >= 2 ? '' : ' off'}"><p><b>3</b> ${two ? two.name : ''}</p><p>${two ? BURST[two.types[0]] ?? 'Hyper Voice' : 'None left'}</p>${two ? pips(two) : ''}</div>`
  const mod = map.modifier ? `<p class="dg-dim">${{ fog: 'Fog', flooded: 'Flooded', restless: 'Restless', echo: 'Echo', rich: 'Rich' }[map.modifier]}</p>` : ''
  hud.querySelector('.dg-floor')!.innerHTML = `<p>${map === hand ? 'Boss floor' : `B${run.floor}`}</p>${mod}<p class="dg-dim">${run.charged ? 'Lantern lit' : 'No charge'}</p>`
  hud.querySelector('.dg-items')!.innerHTML = `<p><b>Q</b> Berries ${it.oran}${it.sitrus ? ` +${it.sitrus}` : ''}</p><p><b>E</b> Elixirs ${it.elixir}</p><p class="dg-dim">Seeds ${it.seed}</p>`
}
function message(html: string, buttons: { label: string; gold?: boolean; run: () => void }[]) {
  const el = document.createElement('div')
  el.className = 'dg-panel dg-msg'
  el.innerHTML = `${html}<div class="dg-row">${buttons.map((b, i) => `<button class="dg-btn${b.gold ? ' gold' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div>`
  el.addEventListener('click', (e) => {
    const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i
    if (i == null) return
    el.remove()
    buttons[Number(i)].run()
  })
  hud.append(el)
  ;(el.querySelector('.dg-btn.gold') as HTMLElement | null)?.focus()
}
const home = () => {
  if (state === 'play' || state === 'paused') saveRun() // Continue picks up exactly here (review 2 D1)
  location.href = BASE
}
// closing the tab mid-floor keeps the run as it is, so Continue can't restore health or refill pots
addEventListener('pagehide', () => {
  if (state === 'play' || state === 'paused') saveRun()
})

function end(win: boolean) {
  if (state === 'won' || state === 'lost') return
  state = win ? 'won' : 'lost'
  sfx(win ? 'success' : 'fail')
  if (mode === 'host' && guests.size) net?.sendEvent({ kind: 'end', win })
  const found = run.found.length ? `<p class="dg-dim">Found: ${run.found.join(' ')}</p>` : ''
  // the deep floors (L10): the boss is already beaten, so the special catch still waits, win or lose
  if (run.floor > FLOORS) {
    const deep = deepDone ? undefined : run.deep
    if (deep && mode === 'solo') {
      run.over = true
      saveRun()
    } else clearRun()
    const text = win ? `<p>You climbed back out of the deep floors of ${hand.name}.</p>` : `<p>Your party was carried out of the deep floors of ${hand.name}.</p>`
    return message(text + found, [deep ? { label: 'Continue', gold: true, run: () => deepCatch(deep) } : { label: 'Back to the island', gold: true, run: home }])
  }
  const pool = win && !test && run.charged ? DEEP[run.dungeon] : undefined
  // the special Pokémon waits in the saved run until its one throw (closing the tab doesn't lose it)
  const deep = pool?.length && !deepDone ? run.deep ?? pool[Math.floor(Math.random() * pool.length)] : undefined
  run.deep = deep
  if (deep && mode === 'solo') {
    run.over = true
    saveRun()
  } else clearRun()
  if (!win) {
    message(`<p>Your party was carried out of ${hand.name}.</p>${found}<p class="dg-dim">Levels come from focus. Study, then try again.</p>`, [
      { label: 'Try again', gold: true, run: () => location.reload() },
      { label: 'Back to the island', run: home },
    ])
    return
  }
  const boss = foes.find((f) => f.boss)
  let text = `<p>You cleared ${hand.name}!</p>`
  const g = run.gate
  if (g && latest().island === g && !game.save.guardians.includes(g)) {
    game.save.guardians.push(g)
    game.save.starPieces += 3
    game.persist()
    const joined = game.guardianJoins()
    const next = ISLANDS.find((i) => i.unlock?.from === g)
    text += `<p>${joined ? `${game.name(joined)} joins you. ` : ''}3 Star Pieces.${next ? ` One step closer to ${next.name}.` : ''}</p>`
  } else if (test) text += `<p class="dg-dim">Test play: nothing was saved.</p>`
  else if (boss) text += `<p>${boss.name} is beaten.</p>`
  text += found
  // L10: once the gate has been cleared, a charged run can go on to three deeper floors
  const deeper = !test && mode !== 'guest' && run.charged && !!g && latest().guardians.includes(g)
  if (deeper) text += `<p class="dg-dim">Three deeper floors wait below, at about Lv${Math.max(1, Math.max(...party.map((p) => p.level)) - 5)}. They hold chests but give no EXP.</p>`
  const after = deep ? { label: 'Continue', gold: !deeper, run: () => deepCatch(deep) } : { label: 'Back to the island', gold: !deeper, run: home }
  message(text, [...(deeper ? [{ label: 'Go deeper', gold: true, run: goDeeper }] : []), after])
}
let deepDone = false // the special catch has been offered this page (so the deep floors can't offer it twice)
/** After a charged clear: something stirs in the deep, for one throw. */
function deepCatch(dex: number) {
  deepDone = true
  const name = game.name(dex)
  const done = () => {
    run.deep = undefined
    clearRun()
    home()
  }
  const thrown = () => {
    // one throw: it is spent the moment you throw, even if the tab closes before the result
    run.deep = undefined
    clearRun()
  }
  const have = BALLS.filter((b) => latest().balls[b.id] > 0)
  const odds = (b: Ball) => Math.round(game.deepChance(run.dungeon, b) * 100)
  const img = `<img class="dg-deep" src="${portrait(dex)}" alt="" />`
  if (!have.length) return message(`${img}<p>A wild ${name} looked out from the deep, then slipped away.</p><p class="dg-dim">You had no balls to throw.</p>`, [{ label: 'Back to the island', gold: true, run: done }])
  message(
    `${img}<p>Something stirs in the deep. A wild ${name} appeared!</p><p class="dg-dim">One throw.</p>`,
    [
      ...have.map((b) => ({
        label: `${b.name} ${odds(b.id)}%`,
        gold: b.id === have[have.length - 1].id,
        run: () => {
          thrown()
          latest()
          const res = game.throwDeep(run.dungeon, dex, b.id)
          if (res?.caught) {
            game.note('catch', `Caught ${name} deep in ${hand.name}.`, { dex })
            message(`${img}<p>Gotcha! ${name} was caught!</p>`, [{ label: 'Back to the island', gold: true, run: done }])
          } else message(`${img}<p>${name} broke free and slipped back into the deep.</p><p class="dg-dim">It will be a little easier next time.</p>`, [{ label: 'Back to the island', gold: true, run: done }])
        },
      })),
      { label: 'Leave it', run: done },
    ],
  )
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault()
  keys.add(k)
  if (state === 'paused' && k === 'escape') return resume()
  if (menuOpen && k === 'escape') return closeMenu()
  if (state !== 'play') return
  const me = party[lead]
  if (k === 'escape') return pause()
  // Tab switches among your own Pokémon only (review 2 D5: never a friend's)
  if (k === 'tab') {
    if (mode === 'guest') switchGuestLead()
    else
      for (let i = 1; i <= party.length; i++) {
        const j = (lead + i) % party.length
        if (!party[j].dead && isMine(party[j])) {
          lead = j
          break
        }
      }
    hudKey = ''
    return
  }
  if (mode === 'guest') {
    // the guest dashes here (it moves itself) and sends its presses to the host
    if (k === ' ' && me.dashCd <= 0 && me.sleep <= 0) {
      me.dash = 0.16
      me.dashCd = 1.2
      guestActs.push('dash')
    }
    if (['1', '2', '3', 'q', 'e', 'f'].includes(k)) guestActs.push(k)
    return
  }
  act(me, k === ' ' ? 'dash' : k)
})
/** A button press for one lead: dash, the two moves, a berry, an Elixir. */
function act(me: Actor, k: string) {
  if (me.sleep > 0 || me.dead) return
  if (k === 'dash' && me.dashCd <= 0) {
    me.dash = 0.16
    me.dashCd = 1.2
  }
  if (k === 'q') useBerry()
  if (k === 'e') useElixir()
  if (k === 'f') pray(me)
  // moves 1 and 2 spend the same charge: one pip for a strong move, two for a burst
  if (k === '1' && me.pp >= 1 && me.gcd <= 0) {
    const t = nearest(me, foes, reach1(me))
    if (t) strong(me, t)
  }
  if (k === '2' && me.pp >= 2 && me.gcd <= 0) spendBurst(me)
  // 3: your second Pokémon's burst, wherever it stands, from its own charge (D-F2)
  const two = k === '3' ? second(me) : undefined
  if (two && two.pp >= 2 && two.gcd <= 0 && two.sleep <= 0) spendBurst(two)
}
function spendBurst(a: Actor) {
  a.pp -= 2
  a.gcd = 0.5
  burst(a, 1.5, 44, BURST[a.types[0]] ?? 'Hyper Voice')
}
/** Move 1's reach: a shot for ranged types, a blow for melee ones. */
const reach1 = (a: Actor) => (ranged(a) ? 90 : 30)
function strong(a: Actor, t: Actor) {
  a.pp -= 1
  a.gcd = 0.5
  attack(a, t, 2.2, STRONG[bestType(a, t)], 1)
}
/** The first other living Pokémon of the same player as `me` (its own on the host, a guest's for a guest). */
function second(me: Actor): Actor | undefined {
  if (mode === 'guest') return party.find((p) => p !== me && !p.dead && mine.has(p.id))
  return party.find((p) => p !== me && !p.dead && (me.owner ? p.owner === me.owner : !p.owner && isMine(p)))
}
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
addEventListener('blur', () => keys.clear())
function pause() {
  // in co-op the game can't stop for everyone, so Esc opens a menu while play goes on (review 2 D4)
  if (mode !== 'solo') {
    menuOpen = true
    message('<p>Menu</p><p class="dg-dim">The game keeps going for your friends.</p>', [
      { label: 'Back to the game', gold: true, run: () => (menuOpen = false) },
      { label: 'Leave the dungeon', run: home },
    ])
    return
  }
  state = 'paused'
  sfx('pause')
  message('<p>Paused.</p><p class="dg-dim">Leaving keeps your run where it is.</p>', [
    { label: 'Resume', gold: true, run: resume },
    { label: 'Leave the dungeon', run: home },
  ])
}
function resume() {
  hud.querySelector('.dg-msg')?.remove()
  state = 'play'
  sfx('start')
}
function closeMenu() {
  hud.querySelector('.dg-msg')?.remove()
  menuOpen = false
}
/** Guest: steer your other Pokémon (Tab, or on its own when your lead faints). */
function switchGuestLead() {
  const next = [...mine].map((id) => actors.get(id)).find((a) => a && a.id !== guestLeadId && !a.dead)
  if (!next) return false
  guestLeadId = next.id
  next.tx = next.x // its position comes from the host's snapshots until we steer it
  next.ty = next.y
  hudKey = ''
  return true
}

// ---------- boot ----------
/** Your three strongest residents on this island go in (strongest leads). */
function pickParty() {
  return [...game.party].sort((a, b) => b.level - a.level).slice(0, 3)
}
async function boot() {
  const [mf, roster] = await Promise.all([loadManifest(), fetch(`${BASE}data/roster.json?v=${__BUILD__}`).then((r) => r.json())])
  manifest = mf
  game = new Game((roster as { species: Roster }).species)
  // the island's Sounds setting; no music down here
  initAudio({ sounds: () => game.save.settings.sound !== false, volume: () => game.save.settings.volume ?? 1 })
  hud.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) click()
  }, true)
  if (mode === 'guest') return bootGuest()
  const id = params.get('id') ?? 'test'
  hand = test ? JSON.parse(localStorage.getItem('island-dungeon-play') ?? 'null') : params.get('id') ? await (await fetch(`${BASE}dungeons/${id}.json?v=${__BUILD__}`)).json() : null
  if (!hand) return message('<p>That dungeon could not be found.</p>', [{ label: 'Back to the island', gold: true, run: home }])
  if (game.inSession) return message('<p>Finish your focus session first. Dungeons are for breaks.</p>', [{ label: 'Back to the island', gold: true, run: home }])
  const team = pickParty()
  // the boss floor's Pokémon load now; the floors' (the same species) come with them
  const need = new Set<number>([...team.map((m) => m.dex), ...hand.entities.filter((e) => e.dex).map((e) => e.dex!)])
  await Promise.all([...need].map(async (d) => species.set(d, await loadSpecies(manifest, String(d).padStart(4, '0')))))
  party = team.map((m) => makeActor('you', m.dex, m.level, species.get(m.dex)!, game.species(m.dex)?.types ?? ['normal'], game.name(m), 0, 0))
  team.forEach((m, i) => (party[i].monId = m.id))
  hud.innerHTML = `<div class="dg-party"></div><div class="dg-panel dg-boss" hidden></div><div class="dg-moves"></div><div class="dg-panel dg-toast"></div>
    <div class="dg-panel dg-floor"></div><div class="dg-panel dg-items"></div>
    <div class="dg-panel dg-keys"><p>WASD move</p><p>Space dash</p><p>1 2 3 moves</p><p>Tab switch</p><p>Esc ${mode === "solo" ? "pause" : "menu"}</p></div>`

  let saved: Run | null = null
  try {
    saved = JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null')
  } catch {}
  if (saved && (saved.dungeon !== id || saved.gate !== gate)) saved = null
  if (test || mode !== 'solo') saved = null
  const fresh = (): Run => ({ dungeon: id, gate, floor: 1, seed: Math.floor(Math.random() * 1e9), charged: false, items: { oran: 0, sitrus: 0, seed: 0, elixir: 0 }, hp: {}, found: [], opened: [], brought: 0 })
  const start = async (r: Run) => {
    run = r
    for (const p of party) {
      const f = p.monId ? run.hp[p.monId] : undefined
      if (f !== undefined) {
        p.hp = Math.round(p.maxHp * f)
        p.dead = f <= 0
        if (p.dead) p.hp = 0
      }
    }
    if (party.every((p) => p.dead)) party.forEach((p) => ((p.dead = false), (p.hp = Math.round(p.maxHp * 0.5))))
    lead = Math.max(0, party.findIndex((p) => !p.dead && isMine(p)))
    if (!(await loadSafely(run.floor))) return
    saveRun()
    state = 'play'
    toast(arrival(run.floor))
    // co-op: tell each guest the seed and which Pokémon are theirs (their lead first)
    if (mode === 'host')
      for (const [peer, g] of guests) net?.sendStart({ dungeon: id, gate, seed: run.seed, floor: run.floor, mine: g.actors.filter((a) => party.includes(a)).map((a) => a.id) }, peer)
  }
  // a cleared run whose special Pokémon is still waiting for its throw (a run on the deep floors
  // continues first; older saves from the boss floor have no `over`)
  if (saved?.deep && (saved.over ?? saved.floor <= FLOORS)) {
    run = saved
    await loadFloor(run.floor)
    renderHud()
    message(`<p>${hand.name}</p><p class="dg-dim">Something still stirs in the deep.</p>`, [{ label: 'Continue', gold: true, run: () => deepCatch(saved!.deep!) }])
    return startLoop()
  }
  // a preview of B1 behind the intro (the real run, with its own seed, starts on Enter)
  run = saved ?? fresh()
  await loadFloor(run.floor)
  renderHud()
  const lv = hand.entities.filter((e) => e.kind === 'enemy').map((e) => e.level ?? 10)
  const boss = hand.entities.find((e) => e.kind === 'boss')
  /**
   * The entrance (review 2 D8): you choose whether to light a Lantern charge; "Start over" keeps
   * the charge and the berries the old run already paid for.
   */
  const entrance = (kept?: Run) => {
    const charges = latest().lanterns ?? 0
    const berries = kept ? 0 : Math.min(2, game.save.berries)
    let light = !!kept?.charged || charges > 0
    const lanternLine = () =>
      kept?.charged ? 'Your Lantern is still lit, so chests open.' : charges ? `Lantern charges: ${charges}. A lit charge opens chests.` : 'No Lantern charge: chests stay shut. Finish a 30-minute session to light one.'
    const toggle = !kept?.charged && charges > 0 && !test ? `<button class="dg-btn dg-toggle" data-light>${'Light a charge: Yes'}</button>` : ''
    const intro = `<p>${hand.name}</p><p class="dg-dim">${test ? 'One floor (test play).' : `Three floors, then ${boss ? `${game.name(boss.dex!)} (Lv${boss.level})` : 'the deepest floor'}. Levels about ${Math.min(...lv) - 6} to ${Math.max(...lv)}.`}</p><p class="dg-dim">${lanternLine()}</p>${toggle}`
    const enter = (bring: boolean) => {
      if (starting) return // one Enter only, even if the lobby redraws (review 2 D12)
      starting = true
      coop = mode === 'host' && guests.size > 0
      coopGuests = guests.size
      const r = fresh()
      if (kept) {
        r.charged = kept.charged
        r.brought = kept.brought ?? 0
        r.items.oran = r.brought
      } else {
        if (!test && light) r.charged = latest() && game.useLantern()
        if (bring && berries) {
          latest().berries -= berries
          game.persist()
          r.items.oran = berries
          r.brought = berries
        }
      }
      hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
      void start(r)
    }
    const enterButtons = [
      ...(berries ? [{ label: `Enter with ${berries} Oran Berr${berries === 1 ? 'y' : 'ies'}`, gold: true, run: () => enter(true) }] : []),
      { label: 'Enter', gold: !berries, run: () => enter(false) },
    ]
    const wire = () => {
      const t = hud.querySelector<HTMLButtonElement>('[data-light]')
      if (!t) return
      t.textContent = light ? 'Light a charge: Yes' : 'Light a charge: No'
      t.onclick = (e) => {
        e.stopPropagation()
        light = !light
        t.textContent = light ? 'Light a charge: Yes' : 'Light a charge: No'
      }
    }
    if (mode === 'host') hostLobby(id, intro, enterButtons, wire)
    else {
      message(intro, [
        ...enterButtons,
        ...(test || kept ? [] : [{ label: 'Play with a friend', run: () => friendMenu(id) }]),
        { label: 'Back to the island', run: home },
      ])
      wire()
    }
  }
  if (saved)
    message(`<p>${hand.name}</p><p class="dg-dim">Your run is waiting on ${floorLabel(saved.floor)}.</p>`, [
      { label: 'Continue', gold: true, run: () => void start(saved!) },
      { label: 'Start over', run: () => (clearRun(), entrance(saved!)) },
      { label: 'Back to the island', run: home },
    ])
  else entrance()
  startLoop()
}
function startLoop() {
  // a host whose window is hidden keeps the dungeon running for its guests. Hidden timers fire
  // about once a second, so it catches up in fixed steps (review 2 D13: it ran at a quarter speed)
  let hiddenAt = performance.now()
  setInterval(() => {
    const now = performance.now()
    if (mode === 'host' && document.hidden && state === 'play') {
      let left = Math.min(2, (now - hiddenAt) / 1000)
      catchingUp = true
      while (left > 0 && state === 'play') {
        if (left <= 0.05) catchingUp = false // the last step sends the snapshot
        update(Math.min(0.05, left))
        left -= 0.05
      }
      catchingUp = false
    }
    hiddenAt = now
  }, 50)
  let last = performance.now()
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (state !== 'paused' && state !== 'busy') (mode === 'guest' ? guestUpdate : update)(dt)
    render()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

// ---------- co-op: the lobby ----------
/** Host a room (a new code) or join one by typing a friend's code. */
function friendMenu(id: string) {
  const back = () => location.reload()
  message('<p>Play with friends</p><p class="dg-dim">Up to four of you, and each brings two Pokémon. Enemies get tougher for each Pokémon, and everyone keeps their own loot.</p>', [
    { label: 'Host a room', gold: true, run: () => (location.href = `${location.pathname}?id=${encodeURIComponent(id)}${gate ? `&gate=${gate}` : ''}&room=${makeRoomCode()}&host=1`) },
    {
      label: 'Join a room',
      run: () => {
        message('<p>Type the room code your friend sees.</p><input class="dg-code" maxlength="4" autocomplete="off" spellcheck="false" />', [
          { label: 'Join', gold: true, run: () => {
            const code = (document.querySelector<HTMLInputElement>('.dg-code')?.value ?? '').trim().toUpperCase()
            if (/^[A-HJKMNP-Z2-9]{4}$/.test(code)) location.href = `${location.pathname}?room=${code}`
            else message('<p>Room codes have four letters or numbers, like the one your friend sees.</p>', [{ label: 'Try again', gold: true, run: () => friendMenu(id) }])
          } },
          { label: 'Back', run: back },
        ])
        setTimeout(() => document.querySelector<HTMLInputElement>('.dg-code')?.focus(), 30)
      },
    },
    { label: 'Back', run: back },
  ])
}
/**
 * The host waits in its room. Up to three friends join, and everyone brings two Pokémon
 * (you bring three alone). Enemies are tougher for each Pokémon past three.
 */
function hostLobby(id: string, intro: string, enterButtons: { label: string; gold?: boolean; run: () => void }[], wire: () => void) {
  net = connectRoom(roomCode!)
  hostTeam = [...party]
  const solo = () => (location.href = `${location.pathname}?id=${encodeURIComponent(id)}${gate ? `&gate=${gate}` : ''}`)
  const rebuild = () => {
    const per = guests.size === 0 ? 3 : 2
    party = [...hostTeam.slice(0, per), ...[...guests.values()].flatMap((g) => g.actors.slice(0, per))]
    hudKey = ''
  }
  const show = () => {
    if (starting) return
    hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
    const who = [...guests.values()].map((g) => g.team.map((m) => `${m.name} (Lv${m.level})`).join(' and '))
    const waiting = `<p class="dg-dim">Room <b class="dg-room">${roomCode}</b>. ${guests.size < MAX_GUESTS ? 'More friends can still join.' : 'The room is full.'}</p>`
    if (guests.size) {
      message(`${intro}<p>${guests.size === 1 ? 'A friend' : `${guests.size} friends`} joined: ${who.join(', ')}.</p>${waiting}`, [...enterButtons, { label: 'Back to the island', run: home }])
      wire()
    } else
      message(`<p>Room <b class="dg-room">${roomCode}</b></p><p class="dg-dim">Ask a friend to open a dungeon door, choose Play with a friend, then Join a room, and type ${roomCode}. Or invite them from your Friends list.</p><p class="dg-dim">Waiting for them…</p>`, [
        { label: 'Play alone', run: solo },
        { label: 'Back to the island', run: home },
      ])
  }
  net.onHello(async (h, peer) => {
    if (guests.has(peer)) return net?.sendEvent({ kind: 'toast', text: 'joined' }, peer) // they're in: say so (hellos repeat)
    if (gone.has(peer)) return
    // a full room, a run already under way, or a different build: say so instead of leaving them waiting
    const refuse = h.v !== __BUILD__ ? 'version' : starting || state !== 'intro' ? 'started' : guests.size >= MAX_GUESTS ? 'full' : ''
    if (refuse) return net?.sendEvent({ kind: 'refuse', text: refuse }, peer)
    const g: Guest = { team: h.team.slice(0, 2), actors: [], heard: performance.now(), lead: -1, charged: !!h.charged }
    guests.set(peer, g)
    await Promise.all(g.team.map(async (m) => species.set(m.dex, species.get(m.dex) ?? (await loadSpecies(manifest, String(m.dex).padStart(4, '0'))))))
    if (!guests.has(peer) || starting) {
      guests.delete(peer) // left, or the run started while their Pokémon loaded
      return
    }
    g.actors = g.team.map((m) => {
      const a = makeActor('you', m.dex, m.level, species.get(m.dex)!, m.types, m.name, 0, 0)
      a.owner = peer
      return a
    })
    g.lead = g.actors[0]?.id ?? -1
    net?.sendEvent({ kind: 'toast', text: 'joined' }, peer)
    rebuild()
    show()
  })
  net.onInput((inp, peer) => {
    let g = guests.get(peer)
    // a friend who went quiet (a frozen tab) and speaks again takes their Pokémon back
    if (!g && gone.has(peer) && state === 'play') {
      g = gone.get(peer)!
      gone.delete(peer)
      guests.set(peer, g)
      for (const a of g.actors) a.owner = peer
      toast('Your friend is back.')
    }
    if (!g) return
    g.heard = performance.now()
    if (inp.floor !== run.floor || state !== 'play') return
    const a = party.find((p) => p.id === inp.id && p.owner === peer)
    if (!a) return
    g.lead = a.id
    if (!a.dead && a.sleep <= 0) {
      a.x = inp.x
      a.y = inp.y
      a.dir = inp.dir
      a.moving = inp.moving
    }
    for (const k of inp.acts) act(a, k)
  })
  const guestLeft = (peer: string) => {
    const g = guests.get(peer)
    if (!g) return
    guests.delete(peer)
    for (const p of party) if (p.owner === peer) p.owner = undefined
    if (state === 'intro' && !starting) {
      rebuild()
      show()
    } else {
      gone.set(peer, g)
      toast('A friend left. Their Pokémon fight on with you.')
    }
  }
  net.onPeerLeave(guestLeft)
  // nothing from a guest for 10 seconds during the run: they've gone
  setInterval(() => {
    if (state !== 'play') return
    for (const [peer, g] of guests) if (performance.now() - g.heard > 10000) guestLeft(peer)
  }, 2000)
  show()
}
/** The guest: choose whether to light a charge, send our team, wait for the host to start, then play on their run. */
async function bootGuest() {
  if (game.inSession) return message('<p>Finish your focus session first. Dungeons are for breaks.</p>', [{ label: 'Back to the island', gold: true, run: home }])
  const team = pickParty().slice(0, 2)
  await Promise.all(team.map(async (m) => species.set(m.dex, await loadSpecies(manifest, String(m.dex).padStart(4, '0')))))
  hud.innerHTML = `<div class="dg-party"></div><div class="dg-panel dg-boss" hidden></div><div class="dg-moves"></div><div class="dg-panel dg-toast"></div>
    <div class="dg-panel dg-floor"></div><div class="dg-panel dg-items"></div>
    <div class="dg-panel dg-keys"><p>WASD move</p><p>Space dash</p><p>1 2 3 moves</p><p>Tab switch</p><p>Esc menu</p></div>`
  // review 2 D8: helping a friend never spends a charge unless you choose to
  const charges = latest().lanterns ?? 0
  const light = await new Promise<boolean>((done) => {
    if (!charges) return done(false)
    message(`<p>Room <b class="dg-room">${roomCode}</b></p><p class="dg-dim">Lantern charges: ${charges}. Light one and chests open for you too.</p>`, [
      { label: 'Join and light one', gold: true, run: () => done(true) },
      { label: 'Join without', run: () => done(false) },
      { label: 'Back to the island', run: home },
    ])
  })
  net = connectRoom(roomCode!)
  message(`<p>Room <b class="dg-room">${roomCode}</b></p><p class="dg-dim">Joining. You go in together when your friend starts.</p>`, [{ label: 'Back to the island', run: home }])
  const hello: Hello = { name: 'friend', team: team.map((m): TeamMon => ({ dex: m.dex, level: m.level, name: game.name(m), types: game.species(m.dex)?.types ?? ['normal'] })), v: __BUILD__, charged: light }
  net.sendHello(hello)
  const timer = setInterval(() => net!.sendHello(hello), 1500)
  // no word from a host in 45 seconds: a wrong code, or the host has gone
  const giveUp = setTimeout(() => {
    if (run || state !== 'intro') return
    clearInterval(timer)
    hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
    message(`<p>No one answered in room <b class="dg-room">${roomCode}</b>.</p><p class="dg-dim">Check the code with your friend, and that they are still in the room.</p>`, [
      { label: 'Try again', gold: true, run: () => location.reload() },
      { label: 'Back to the island', run: home },
    ])
  }, 45000)
  net.onStart(async (st: Start, peer) => {
    if (run) return
    clearInterval(timer)
    clearTimeout(giveUp)
    hostPeer = peer
    heardAt = performance.now()
    hand = await (await fetch(`${BASE}dungeons/${st.dungeon}.json?v=${__BUILD__}`)).json()
    run = { dungeon: st.dungeon, gate: st.gate as IslandId | null, floor: st.floor, seed: st.seed, charged: light && !!latest() && game.useLantern(), items: { oran: 0, sitrus: 0, seed: 0, elixir: 0 }, hp: {}, found: [] }
    for (const i of st.mine) mine.add(i)
    guestLeadId = st.mine[0]
    await Promise.all(hand.entities.filter((e) => e.dex).map(async (e) => species.set(e.dex!, species.get(e.dex!) ?? (await loadSpecies(manifest, String(e.dex).padStart(4, '0'))))))
    await guestFloor(st.floor)
    hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
    state = 'play'
    toast(`${arrival(st.floor)}${run.charged ? ' Your Lantern is lit.' : ''}`)
  })
  net.onSnap((snap, peer) => {
    if (hostPeer && peer !== hostPeer) return
    applySnap(snap)
  })
  net.onEvent(async (e: NetEvent, peer) => {
    if (e.kind === 'refuse' && !run) {
      clearInterval(timer)
      clearTimeout(giveUp)
      const why = e.text === 'full' ? 'That room is full.' : e.text === 'version' ? 'You and your friend have different versions of the game. Reload both pages and try again.' : 'That run has already started.'
      hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
      return message(`<p>${why}</p>`, [{ label: 'Back to the island', gold: true, run: home }])
    }
    if (e.kind === 'toast' && e.text === 'joined' && !run) {
      // the host has us: stop the give-up timer and say so, once
      if (!hostPeer) {
        hostPeer = peer
        clearTimeout(giveUp)
        hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
        message(`<p>Room <b class="dg-room">${roomCode}</b></p><p class="dg-dim">You're in. You go in together when your friend starts.</p>`, [{ label: 'Back to the island', run: home }])
      }
      return
    }
    if (!run || (hostPeer && peer !== hostPeer)) return
    if (e.kind === 'floor' && e.floor) {
      // the host chose to go deeper after the boss: the end screen gives way to the next floor
      if (state === 'won') hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
      if (e.level) run.deepLevel = e.level
      state = 'busy'
      view.style.transition = 'opacity .35s ease'
      view.style.opacity = '0'
      await guestFloor(e.floor)
      view.style.opacity = '1'
      state = 'play'
      toast(arrival(e.floor, e.floor === FLOORS + 1 ? ` The deep floors, at about Lv${run.deepLevel}.` : ''))
    }
    if (e.kind === 'chest') {
      if (run.charged) {
        const lines = lootChest(!!e.big)
        run.found.push(...lines)
        toast(lines.join(' '))
      } else toast('A friend opened a chest. Light a Lantern charge to share the loot.')
    }
    if (e.kind === 'end') end(!!e.win)
  })
  const hostLeft = () => {
    if (state === 'won' || state === 'lost') return
    state = 'lost'
    hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
    message(run ? '<p>The host left, so the run ended.</p>' : '<p>The host left the room.</p>', [{ label: 'Back to the island', gold: true, run: home }])
  }
  // review 2 D3: every player is connected to every other; only the host leaving ends the run
  net.onPeerLeave((peer) => {
    if (hostPeer && peer === hostPeer) hostLeft()
  })
  setInterval(() => {
    if (run && (state === 'play' || state === 'busy') && performance.now() - heardAt > 10000) hostLeft()
  }, 2000)
  // a hidden tab (or one with the menu open) stops drawing, but still tells the host it's here
  setInterval(() => {
    const me = actors.get(guestLeadId)
    if (document.hidden && run && state === 'play' && me && me.tx !== undefined)
      net?.sendInput({ id: guestLeadId, floor: run.floor, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, moving: false, acts: guestActs.splice(0) }, hostPeer || undefined)
  }, 1000)
  startLoop()
}
void boot()
;(window as unknown as { __dungeon: unknown }).__dungeon = {
  get party() {
    return party
  },
  get foes() {
    return foes
  },
  get state() {
    return state
  },
  set state(s: typeof state) {
    state = s
  },
  get run() {
    return run
  },
  get map() {
    return map
  },
  get exit() {
    return exit
  },
  get things() {
    return things
  },
  get baked() {
    return baked
  },
  get net() {
    return { mode, snapsIn, snapsUsed, snapsOut, size: mode === 'host' && run && party.length ? JSON.stringify(snapshot()).length : 0, guestLeadId, guests: [...guests.keys()], actors: actors.size, peers: net?.peers(), time }
  },
  get warnings() {
    return warnings
  },
  get lead() {
    return lead
  },
  downstairs,
  keys,
  update,
  render,
  /** The view as a PNG data URL (dev: inspect the art with the pane hidden). */
  shot: () => (render(), view.toDataURL()),
  guestUpdate,
  leads,
  get guests() {
    return guests
  },
  get guestLeadId() {
    return guestLeadId
  },
  act,
}
