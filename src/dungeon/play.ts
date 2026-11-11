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
// charge (one per finished 25-minute session). Dungeons give no EXP and no shells.
// After a charged clear, a special Pokémon may appear for one throw.
//
// Opened as dungeon.html?id=<map>&gate=<island> from the island, or
// ?map=play from the editor's Play test (one floor, nothing is saved then).
import './play.css'
import { effectiveness, MOVES } from '../battle'
import { BALLS, Ball, DEEP, Game, ISLANDS, IslandId, Roster } from '../game'
import { Light, applyLighting, normalMapFor } from '../lighting'
import { Species, dirFrom, drawFrame, frameAt, loadManifest, loadSpecies } from '../sprites'
import { generateFloor } from './gen'
import { DungeonMap, Entity, TILE, TrapKind, bakeMap, walkableTile } from './map'
import { type Event as NetEvent, type Hello, type Input, type Net, type Snap, type Start, type TeamMon, connectRoom, makeRoomCode } from './net'

const VW = 320
const VH = 180
const BASE = import.meta.env.BASE_URL
const params = new URLSearchParams(location.search)
const portrait = (dex: number) => `${BASE}sprites/${String(dex).padStart(4, '0')}/Normal.png`
const RUN_KEY = 'island-dungeon-run'
const FLOORS = 4 // three generated floors, then the hand-made boss floor

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
  kind: 'circle' | 'lane'
  x: number
  y: number
  r: number // circle radius, or lane half-width
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
}
interface Thing {
  kind: 'pot' | 'chest'
  x: number
  y: number
  open: boolean
  big?: boolean // the miniboss's or boss's chest
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
let guestPeer: string | null = null // host: the guest in the room
let guestLeadId = -1 // both: the guest's lead actor
let coop = false // host: a guest started the run with you (enemies are tougher)
const mine = new Set<number>() // guest: actor ids you control
let guestActs: string[] = [] // guest: button presses to send
let heardAt = performance.now() // co-op: the last message from the other player (a closed tab can take a while to report)

// a boss has 2.5 times a turn-based guardian's HP: in real time a whole party hits it at once.
// A miniboss has five times a normal enemy's.
const statsFor = (level: number, boss: boolean, mini = false) =>
  boss ? { hp: Math.round((60 + level * 10) * 2.5), atk: (10 + level * 2.2) * 0.75 } : mini ? { hp: (20 + level * 3) * 5, atk: (8 + level * 2) * 0.7 } : { hp: 20 + level * 3, atk: 8 + level * 2 }

// your Pokémon are outnumbered on every floor, so they take more to bring down
const PARTY_HP = 1.6
function makeActor(side: Actor['side'], dex: number, level: number, sp: Species, types: string[], name: string, x: number, y: number, boss = false, mini = false): Actor {
  const st = statsFor(level, boss, mini)
  if (side === 'you') st.hp = Math.round(st.hp * PARTY_HP)
  return {
    id: nextId++, side, dex, name, level, types, sp, x, y, dir: 0, hp: st.hp, maxHp: st.hp, atk: st.atk, cd: Math.random() * 0.6, cd1: 0, cd2: boss ? 4 : mini ? 3 : 0, moving: false,
    t: Math.random() * 3, hurt: 0, hop: 0, awake: false, boss, mini, dead: false, fade: 0, sleep: 0, dash: 0, dashCd: 0, dashDir: [0, 1], phase: 1, summoned: false, reviveT: 0,
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
// a shared path map toward the lead, rebuilt four times a second: anyone chasing the lead
// (followers, and enemies chasing the party) walks downhill on it instead of into walls
let field = new Int16Array(0)
let fieldAt = -1
function buildField() {
  const me = party[lead]
  const w = map.w
  const h = map.h
  if (field.length !== w * h) field = new Int16Array(w * h)
  field.fill(-1)
  // rocks and trees block their tile
  const solidTile = new Set(baked.solid.map((o) => Math.floor((o.y - 2) / TILE) * w + Math.floor(o.x / TILE)))
  const sx = Math.floor(me.x / TILE)
  const sy = Math.floor(me.y / TILE)
  const q: number[] = [sy * w + sx]
  field[sy * w + sx] = 0
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
  if (d < 1) return
  move(a, ((gx - a.x) / d) * speed * dt, ((gy - a.y) / d) * speed * dt)
}
const alive = (xs: Actor[]) => xs.filter((a) => !a.dead)
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
function nearest(from: { x: number; y: number }, xs: Actor[], within = Infinity) {
  let best: Actor | null = null
  let bd = within
  for (const x of xs) {
    if (x.dead) continue
    const d = dist(from, x)
    if (d < bd) {
      bd = d
      best = x
    }
  }
  return best
}

// ---------- combat ----------
const ranged = (a: Actor) => a.types.some((t) => RANGED.has(t))
const range = (a: Actor) => (a.boss ? 26 : a.mini ? 22 : ranged(a) ? 74 : 20)
const bestType = (a: Actor, d: Actor) => a.types.reduce((b, t) => (effectiveness(t, d.types) > effectiveness(b, d.types) ? t : b), a.types[0] ?? 'normal')
function hit(from: Actor, to: Actor, mult: number, type: string) {
  if (to.dead || to.dash > 0) return
  const eff = effectiveness(type, to.types)
  const dmg = Math.max(1, Math.round(from.atk * 0.5 * mult * (eff || 0.25) * (0.9 + Math.random() * 0.2)))
  hurt(to, dmg, eff > 1 ? '#ffe040' : eff < 1 ? '#c8c8c8' : '#ffffff')
  if (eff > 1 && Math.random() < 0.5) toast("It's super effective!")
}
function hurt(to: Actor, dmg: number, col = '#ffffff') {
  if (to.dead) return
  to.hp = Math.max(0, to.hp - dmg)
  to.hurt = 0.22
  to.awake = true
  to.sleep = 0
  pops.push({ x: to.x + (Math.random() - 0.5) * 6, y: to.y - 24, text: String(dmg), t: 0, col })
  if (to.hp === 0) faint(to)
}
function attack(a: Actor, target: Actor, mult = 1, label?: string) {
  const type = bestType(a, target)
  a.hop = 0.3
  a.dir = dirFrom(target.x - a.x, target.y - a.y)
  if (label) pops.push({ x: a.x, y: a.y - 30, text: label, t: 0, col: COL[type] ?? '#fff' })
  if (ranged(a) && !a.boss && !a.mini) {
    const d = dist(a, target) || 1
    shots.push({ x: a.x, y: a.y - 9, vx: ((target.x - a.x) / d) * 150, vy: ((target.y - a.y) / d) * 150, side: a.side, from: a, mult, type, life: 0.9 })
  } else hit(a, target, mult, type)
}
function burst(a: Actor, mult: number, radius: number, label: string, at = { x: a.x, y: a.y }) {
  const type = a.types[0] ?? 'normal'
  if (label) pops.push({ x: a.x, y: a.y - 30, text: label, t: 0, col: COL[type] ?? '#fff' })
  rings.push({ x: at.x, y: at.y - 4, r: 0, max: radius, col: COL[type] ?? '#fff', t: 0 })
  for (const f of a.side === 'you' ? foes : party) if (!f.dead && dist(at, f) < radius) hit(a, f, mult, bestType(a, f))
}
const rings: { x: number; y: number; r: number; max: number; col: string; t: number }[] = []
function warn(w: Omit<Warning, 't'>) {
  warnings.push({ ...w, t: 0 })
}
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
    const next = party.findIndex((p) => !p.dead)
    if (next < 0) return end(false)
    if (party[lead] === a) lead = next
  } else if (a.boss) {
    bossDown = true
    toast(`${a.name} was defeated! The way out is open.`)
    things.push({ kind: 'chest', x: a.x, y: a.y + 4, open: false, big: true })
  } else if (a.mini) {
    toast(`${a.name} was defeated! The stairs are open.`)
    things.push({ kind: 'chest', x: a.x, y: a.y + 4, open: false, big: true })
  }
}

// ---------- bosses and minibosses ----------
function bossBrain(f: Actor, t: Actor, dt: number) {
  const hpk = f.hp / f.maxHp
  // phases at two thirds and one third
  const phase = hpk > 0.66 ? 1 : hpk > 0.33 ? 2 : 3
  if (phase !== f.phase) {
    f.phase = phase
    shake = 0.6
    toast(phase === 2 ? `${f.name} is getting serious!` : `${f.name} is furious!`)
    if (phase === 3 && !f.summoned) summon(f, 2)
  }
  f.cd2 -= 0 // (cd2 is already counted down in update)
  if (f.cd2 > 0) return
  const col = COL[f.types[0]] ?? '#fff'
  if (phase === 1 || (phase === 3 && Math.random() < 0.3)) {
    // a burst around it, warned first
    f.cd2 = 7
    warn({ kind: 'circle', x: f.x, y: f.y, r: 48, at: 0.9, col, land: () => burst(f, 1.2, 48, BURST[f.types[0]] ?? 'Hyper Voice', { x: f.x, y: f.y }) })
  } else if (phase === 2) {
    // Body Slam down a lane toward the lead
    f.cd2 = 6
    const d = dist(f, t) || 1
    const x2 = f.x + ((t.x - f.x) / d) * 120
    const y2 = f.y + ((t.y - f.y) / d) * 120
    warn({
      kind: 'lane', x: f.x, y: f.y, x2, y2, r: 11, at: 1.0, col,
      land: () => {
        pops.push({ x: f.x, y: f.y - 34, text: 'Body Slam', t: 0, col: '#f0f0f0' })
        for (const p of party) if (!p.dead && distToSeg(p, f, { x: x2, y: y2 }) < 12) hit(f, p, 2, f.types[0] ?? 'normal')
        // it charges to the end of the lane, as far as the walls allow
        for (let s = 0; s < 120; s += 4) {
          const nx = f.x + ((x2 - f.x) / 120) * 4
          const ny = f.y + ((y2 - f.y) / 120) * 4
          if (!canStand(nx, ny)) break
          f.x = nx
          f.y = ny
        }
        shake = 0.3
      },
    })
  } else {
    // rocks fall where the party stands
    f.cd2 = 5
    for (const p of alive(party)) {
      const x = p.x + (Math.random() - 0.5) * 16
      const y = p.y + (Math.random() - 0.5) * 10
      warn({ kind: 'circle', x, y, r: 15, at: 1.0, col: '#c8a868', land: () => {
        rings.push({ x, y: y - 4, r: 0, max: 15, col: '#c8a868', t: 0 })
        for (const q of party) if (!q.dead && Math.hypot(q.x - x, q.y - y) < 15) hit(f, q, 1.8, 'rock')
        shake = Math.max(shake, 0.15)
      } })
    }
  }
}
function miniBrain(f: Actor) {
  if (!f.summoned && f.hp / f.maxHp < 0.5) {
    summon(f, 1)
    toast(`${f.name} called for help!`)
  }
  if (f.cd2 > 0) return
  f.cd2 = 6
  const col = COL[f.types[0]] ?? '#fff'
  warn({ kind: 'circle', x: f.x, y: f.y, r: 40, at: 0.8, col, land: () => burst(f, 0.9, 40, STRONG[f.types[0]] ?? 'Body Slam', { x: f.x, y: f.y }) })
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
  const me = party[lead]
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
    } else if (tr.kind === 'alarm' && !tr.used && Math.hypot(me.x - tr.x, me.y - tr.y) < 9) {
      tr.used = true
      for (const f of foes) if (!f.dead && dist(f, tr) < 150) f.awake = true
      toast('An alarm! Everything nearby woke up.')
      rings.push({ x: tr.x, y: tr.y, r: 0, max: 60, col: '#ff6060', t: 0 })
    }
  }
}
function updateThings() {
  const me = party[lead]
  for (const th of things) {
    if (th.open || Math.hypot(me.x - th.x, me.y - th.y) > 11) continue
    if (th.kind === 'pot') {
      th.open = true
      const r = Math.random()
      const got: keyof Items | null = r < 0.45 ? 'oran' : r < 0.65 ? 'elixir' : r < 0.75 ? 'seed' : r < 0.8 ? 'sitrus' : null
      if (got) run.items[got]++
      toast(got ? `Found ${ITEM_NAME[got]}.` : 'The pot was empty.')
    } else {
      if (!run.charged || test) {
        if (!th.big || !run.charged) {
          // a sealed chest: it waits for a charged run
          if (time - sealedToast > 4) {
            sealedToast = time
            toast(test ? 'Test play: chests stay shut.' : 'Sealed. A Lantern charge opens chests.')
          }
          continue
        }
      }
      th.open = true
      if (mode === 'host' && guestPeer) net?.sendEvent({ kind: 'chest', big: !!th.big })
      const lines = lootChest(!!th.big)
      run.found.push(...lines)
      toast(lines.join(' '))
    }
  }
}
let sealedToast = -10
const ITEM_NAME: Record<keyof Items, string> = { oran: 'an Oran Berry', sitrus: 'a Sitrus Berry', seed: 'a Reviver Seed', elixir: 'a Max Elixir' }
/** Loot for the island, worth roughly what the session that lit the charge paid (no shells, no EXP). */
function lootChest(big: boolean): string[] {
  const s = game.save
  const out: string[] = []
  const r = Math.random()
  if (big) {
    s.balls['ultra-ball']++
    out.push('An Ultra Ball.')
    if (Math.random() < 0.25) {
      s.starPieces++
      out.push('A Star Piece!')
    }
    if (map === hand && Math.random() < 0.05) {
      const st = game.pickStone()
      s.bag[st] = (s.bag[st] ?? 0) + 1
      out.push('An evolution stone!')
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
  } else if (r < 0.9) {
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
}
function useElixir() {
  if (run.items.elixir <= 0) return toast('No Elixirs left.')
  run.items.elixir--
  for (const p of party) {
    p.cd1 = 0
    p.cd2 = 0
  }
  pops.push({ x: party[lead].x, y: party[lead].y - 28, text: 'Max Elixir', t: 0, col: '#ffe080' })
  hudKey = ''
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
    if (a.dead) a.fade = Math.min(1, a.fade + dt * 1.5)
  }
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
  if (me.sleep > 0) mx = my = 0
  if (me.dash > 0) {
    move(me, me.dashDir[0] * 230 * dt, me.dashDir[1] * 230 * dt)
    me.moving = true
  } else {
    me.moving = !!(mx || my)
    if (me.moving) {
      const k = (64 * dt) / Math.hypot(mx, my)
      move(me, mx * k, my * k)
      me.dashDir = [mx / Math.hypot(mx, my), my / Math.hypot(mx, my)]
    }
  }
  // followers keep near the lead and fight what is close, finding their way around walls
  const gLead = guestLeadId >= 0 ? party.find((q) => q.id === guestLeadId && q.owner) : undefined
  party.forEach((p, i) => {
    if (p === me || p === gLead || p.dead || p.sleep > 0) return
    const L = p.owner && gLead && !gLead.dead ? gLead : me
    const foe = nearest(p, alive(foes).filter((f) => f.awake), 90)
    let tx = L.x + (i % 2 ? -14 : 14)
    let ty = L.y + 10
    let toLead = L === me
    if (foe && dist(p, foe) > range(p) - 6) {
      tx = foe.x
      ty = foe.y
      toLead = false
    }
    const d = Math.hypot(tx - p.x, ty - p.y)
    p.moving = d > (foe ? range(p) - 8 : 14)
    if (p.moving) seek(p, tx, ty, d > 80 ? 70 : 58, dt, toLead)
  })
  // auto-attacks for the party
  for (const p of party) {
    if (p.dead || p.cd > 0 || p.sleep > 0) continue
    const target = nearest(p, foes, range(p))
    if (!target) continue
    p.cd = 0.8
    attack(p, target)
  }
  // enemies wake when you come close, then chase and attack
  for (const f of foes) {
    if (f.dead) continue
    if (f.sleep > 0) continue
    const t = nearest(f, party, f.awake ? Infinity : f.boss ? 84 : f.mini ? 80 : 64)
    if (!f.awake && t) {
      f.awake = true
      if (f.boss || f.mini) toast(`${f.name} woke up!`)
    }
    if (!f.awake || !t) {
      f.moving = false
      continue
    }
    const d = dist(f, t)
    f.moving = d > range(f) - 4
    if (f.moving) seek(f, t.x, t.y, f.boss ? 30 : f.mini ? 36 : 44, dt, dist(t, me) < 30)
    if (f.cd <= 0 && d <= range(f)) {
      f.cd = f.boss ? 1.7 : f.mini ? 1.4 : 1.15
      attack(f, t)
    }
    if (f.boss && d < 160) bossBrain(f, t, dt)
    if (f.mini && d < 120) miniBrain(f)
  }
  // telegraphed attacks land
  for (const w of warnings) {
    w.t += dt
    if (w.t >= w.at) w.land()
  }
  warnings = warnings.filter((w) => w.t < w.at)
  updateTraps(dt)
  updateThings()
  // out of combat the party recovers a little; fainted partners wait for the stairs or a Reviver Seed
  const fighting = alive(foes).some((f) => f.awake && party.some((p) => !p.dead && dist(p, f) < 140))
  calm = fighting ? 0 : calm + dt
  if (calm > 3) for (const p of party) if (!p.dead) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.015 * dt)
  if (coop) {
    const leads = [me, gLead].filter((x): x is Actor => !!x && !x.dead)
    for (const p of party) {
      if (!p.dead) continue
      const near = leads.some((l) => dist(l, p) < 16)
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
      if (a.dead || s.life <= 0) continue
      if (Math.hypot(a.x - s.x, a.y - 9 - s.y) < 8) {
        hit(s.from, a, s.mult, s.type)
        s.life = 0
      }
    }
  }
  shots = shots.filter((s) => s.life > 0)
  for (const r of rings) r.t += dt
  pops = pops.filter((p) => (p.t += dt) < 1.1)
  // stairs down (once the miniboss is down), or the exit (once the boss is down)
  const guarded = foes.some((f) => f.mini && !f.dead)
  if (exit && (dist(me, exit) < 12 || (gLead && !gLead.dead && dist(gLead, exit) < 12))) {
    if (map === hand) {
      if (bossDown) end(true)
    } else if (guarded) {
      if (time - sealedToast > 4) {
        sealedToast = time
        toast('Something guards the stairs.')
      }
    } else void downstairs()
  }
  if (mode === 'host' && guestPeer && time - snapAt > 1 / 15) {
    snapAt = time
    snapsOut++
    net?.sendSnap(snapshot())
  }
  renderHud()
}
let snapAt = 0
let snapsOut = 0
/** What the guest needs to draw this moment (positions are whole pixels). */
function snapshot(): Snap {
  const flags = (a: Actor) => (a.moving ? 1 : 0) | (a.hop > 0 ? 2 : 0) | (a.hurt > 0 ? 4 : 0) | (a.dead ? 8 : 0) | (a.sleep > 0 ? 16 : 0) | (a.dash > 0 ? 32 : 0)
  return {
    a: [...party, ...foes].map((a) => [a.id, a.side === 'you' ? 1 : 0, a.dex, Math.round(a.x), Math.round(a.y), a.dir, Math.round(a.hp), Math.round(a.maxHp), flags(a), a.level, a.boss ? 1 : a.mini ? 2 : 0, a.name, +a.fade.toFixed(2), +a.cd1.toFixed(1), +a.cd2.toFixed(1), a.awake ? 1 : 0]),
    s: shots.map((x) => [Math.round(x.x), Math.round(x.y), x.type]),
    w: warnings.map((w) => [w.kind === 'lane' ? 1 : 0, Math.round(w.x), Math.round(w.y), w.r, Math.round(w.x2 ?? 0), Math.round(w.y2 ?? 0), +w.t.toFixed(2), w.at, w.col]),
    r: rings.filter((r) => r.t < 0.5).map((r) => [Math.round(r.x), Math.round(r.y), r.max, r.col, +r.t.toFixed(2)]),
    p: pops.map((p) => [Math.round(p.x), Math.round(p.y), p.text, +p.t.toFixed(2), p.col]),
    tr: traps.map((t) => [+t.t.toFixed(2), +t.cd.toFixed(1), t.used ? 1 : 0]),
    th: things.map((t) => [t.kind === 'pot' ? 0 : 1, t.open ? 1 : 0, t.big ? 1 : 0, Math.round(t.x), Math.round(t.y)]),
    bd: bossDown ? 1 : 0,
    it: run.items,
    f: run.floor,
    sh: +shake.toFixed(2),
  } as unknown as Snap
}

// ---------- floors and the run ----------
function saveRun() {
  if (test || mode !== 'solo') return
  run.hp = {}
  for (const p of party) if (p.monId) run.hp[p.monId] = p.dead ? 0 : p.hp / p.maxHp
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run))
  } catch {}
}
function clearRun() {
  if (mode !== 'solo') return // co-op runs are never saved, so they never clear a solo one
  try {
    localStorage.removeItem(RUN_KEY)
  } catch {}
}
/** Build floor n: generated for B1 to B3, the hand-made map for the last. */
function floorMap(n: number): DungeonMap {
  if (test || n >= FLOORS) return hand
  const enemies = hand.entities.filter((e) => e.kind === 'enemy' && e.dex)
  const dexes = [...new Set(enemies.map((e) => e.dex!))]
  const lo = Math.min(...enemies.map((e) => e.level ?? 10))
  // the strongest forms in the dungeon's own list guard the stairs
  const stage = (d: number) => game.species(d)?.stage ?? 1
  const top = Math.max(...dexes.map(stage))
  const mini = dexes.filter((d) => stage(d) === top)
  const base = lo - 6 + (n - 1) * 2
  return generateFloor({ seed: run.seed, floor: n, name: hand.name, theme: hand.theme, dark: hand.dark, species: dexes, mini, levels: [base, base + 2], miniboss: n >= 2 })
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
    p.x = start.x * TILE + 8 + (i - 1) * 12
    p.y = start.y * TILE + 10 + (i ? 8 : 0)
    p.sleep = 0
    p.dash = 0
  })
  const mk = (e: Entity) => makeActor('foe', e.dex!, e.level ?? 10, species.get(e.dex!)!, game.species(e.dex!)?.types ?? ['normal'], game.name(e.dex!), e.x * TILE + 8, e.y * TILE + 12, e.kind === 'boss', e.kind === 'miniboss')
  foes = map.entities.filter((e) => (e.kind === 'enemy' || e.kind === 'boss' || e.kind === 'miniboss') && e.dex && species.get(e.dex)).map(mk)
  if (coop) for (const f of foes) f.hp = f.maxHp = Math.round(f.maxHp * (f.boss ? 1.75 : 1.5))
  const ex = map.entities.find((e) => e.kind === 'exit' || e.kind === 'stairs')
  exit = ex ? { x: ex.x * TILE + 8, y: ex.y * TILE + 8 } : null
  bossDown = !foes.some((f) => f.boss)
  traps = map.entities.filter((e) => e.kind === 'trap').map((e) => ({ kind: e.trap ?? 'spikes', x: e.x * TILE + 8, y: e.y * TILE + 10, t: Math.random() * SPIKE_CYCLE, cd: 0, hitThisCycle: new Set<number>(), used: false }))
  things = map.entities.filter((e) => e.kind === 'pot' || e.kind === 'chest').map((e) => ({ kind: e.kind as 'pot' | 'chest', x: e.x * TILE + 8, y: e.y * TILE + 10, open: false }))
  shots = []
  warnings = []
  hudKey = ''
}
let stepping = false
async function downstairs() {
  if (stepping) return
  stepping = true
  state = 'busy'
  // the stairs: heal everyone, wake anyone fainted (at half), save the run
  for (const p of party) {
    if (p.dead) {
      p.dead = false
      p.fade = 0
      p.hp = Math.round(p.maxHp * 0.5)
    } else p.hp = p.maxHp
  }
  run.floor++
  saveRun()
  if (mode === 'host' && guestPeer) net?.sendEvent({ kind: 'floor', floor: run.floor })
  view.style.transition = 'opacity .35s ease'
  view.style.opacity = '0'
  await new Promise((r) => setTimeout(r, 380))
  await loadFloor(run.floor)
  view.style.opacity = '1'
  toast(run.floor >= FLOORS ? `${hand.name}: the deepest floor.` : `${hand.name} B${run.floor}. The stairs saved your run.`)
  state = 'play'
  stepping = false
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
  traps = map.entities.filter((e) => e.kind === 'trap').map((e) => ({ kind: e.trap ?? 'spikes', x: e.x * TILE + 8, y: e.y * TILE + 10, t: 0, cd: 0, hitThisCycle: new Set<number>(), used: false }))
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
    w: [number, number, number, number, number, number, number, number, string][]
    r: [number, number, number, string, number][]
    p: [number, number, string, number, string][]
    tr: [number, number, number][]
    th: [number, number, number, number, number][]
    bd: number
    it: Items
    f: number
    sh: number
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
    a.fade = fade
    a.cd1 = cd1
    a.cd2 = cd2
    a.awake = !!awake
    seen.add(id)
  }
  for (const id of [...actors.keys()]) if (!seen.has(id)) actors.delete(id)
  party = [...actors.values()].filter((a) => a.side === 'you')
  foes = [...actors.values()].filter((a) => a.side === 'foe')
  lead = Math.max(0, party.findIndex((a) => a.id === guestLeadId))
  const someone = party[0]
  shots = someone ? s.s.map(([x, y, type]) => ({ x, y, vx: 0, vy: 0, side: 'you' as const, from: someone, mult: 1, type, life: 1 })) : []
  warnings = s.w.map(([lane, x, y, r, x2, y2, t, at, col]) => ({ kind: lane ? ('lane' as const) : ('circle' as const), x, y, r, x2, y2, t, at, col, land: () => {} }))
  rings.length = 0
  for (const [x, y, max, col, t] of s.r) rings.push({ x, y, r: 0, max, col, t })
  pops = s.p.map(([x, y, text, t, col]) => ({ x, y, text, t, col }))
  s.tr.forEach(([t, cd, used], i) => {
    if (traps[i]) Object.assign(traps[i], { t, cd, used: !!used })
  })
  things = s.th.map(([chest, open, big, x, y]) => ({ kind: chest ? ('chest' as const) : ('pot' as const), open: !!open, big: !!big, x, y }))
  bossDown = !!s.bd
  run.items = s.it
  shake = Math.max(shake, s.sh)
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
    if (a.id !== guestLeadId && a.tx !== undefined && a.ty !== undefined) {
      // others ease toward where the host says they are
      const k = Math.min(1, dt * 12)
      a.x += (a.tx - a.x) * k
      a.y += (a.ty! - a.y) * k
    }
  }
  for (const r of rings) r.t += dt
  for (const p of pops) p.t += dt
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
      move(me, mx * k, my * k)
      me.dashDir = [mx / Math.hypot(mx, my), my / Math.hypot(mx, my)]
    }
  }
  // after a new floor, wait for the host to place us before sending positions again
  if (time - inputAt > 1 / 20 && me.tx !== undefined) {
    inputAt = time
    net?.sendInput({ id: guestLeadId, floor: run.floor, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, moving: me.moving, acts: guestActs.splice(0) })
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
  const x = a.x - cx
  const y = a.y - cy
  g.globalAlpha = 1 - a.fade * 0.85
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(Math.round(x - 6), Math.round(y - 1), 12, 2)
  if (a.hurt > 0 || a.dash > 0) {
    scratch.width = anim.w
    scratch.height = anim.h
    const sg = scratch.getContext('2d')!
    drawFrame(sg, anim, f, a.dir, anim.ax, anim.ay)
    sg.globalCompositeOperation = 'source-atop'
    sg.fillStyle = a.dash > 0 ? 'rgba(200,230,255,0.5)' : 'rgba(255,255,255,0.8)'
    sg.fillRect(0, 0, anim.w, anim.h)
    g.drawImage(scratch, Math.round(x - anim.ax), Math.round(y - anim.ay))
  } else drawFrame(g, anim, f, a.dir, x, y)
  g.globalAlpha = 1
  return { anim, f }
}
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
  } else if (!tr.used) {
    g.fillStyle = '#4a2a2a'
    g.fillRect(x + 1, y + 1, 10, 8)
    g.fillStyle = '#c84848'
    g.fillRect(x + 4, y + 3, 4, 4)
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
  const me = party[lead]
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
  for (const tr of traps) drawTrap(fg, tr, cx, cy)
  for (const th of things) drawThing(fg, th, cx, cy)
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
  const lights: Light[] = []
  for (const l of baked.lights) if (l.x > cx - l.r && l.x < cx + VW + l.r && l.y > cy - l.r && l.y < cy + VH + l.r) lights.push({ ...l, x: l.x - cx, y: l.y - cy, power: l.power * (0.94 + 0.06 * Math.sin(time * 3 + l.x)) })
  lights.push({ x: me.x - cx, y: me.y - cy - 10, z: 22, r: run?.charged ? 110 : 96, color: [1, 0.93, 0.82], power: 1.25 })
  for (const a of [...party, ...foes]) if (!a.dead && a.types.includes('fire')) lights.push({ x: a.x - cx, y: a.y - cy - 8, z: 12, r: 40, color: [1, 0.6, 0.3], power: 1.1 })
  for (const s of shots) if (s.type === 'fire' || s.type === 'electric') lights.push({ x: s.x - cx, y: s.y - cy, z: 8, r: 22, color: s.type === 'fire' ? [1, 0.6, 0.3] : [1, 0.95, 0.5], power: 1.2 })
  const amb = 1 - map.dark * 0.92
  applyLighting(fg, ng, [amb * 0.85, amb * 0.9, amb * 1.1], lights)
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
function toast(t: string) {
  const el = hud.querySelector<HTMLElement>('.dg-toast')
  if (!el) return
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
  const key = party.map((p) => `${Math.round(p.hp)}:${p.dead}`).join() + `|${lead}|${boss?.hp}:${boss?.awake}|${Math.ceil(me.cd1)}:${Math.ceil(me.cd2)}:${Math.ceil(me.dashCd * 4)}|${it.oran}${it.sitrus}${it.seed}${it.elixir}|${run.floor}`
  if (key === hudKey) return
  hudKey = key
  const t = me.types[0] ?? 'normal'
  hud.querySelector('.dg-party')!.innerHTML = party
    .map((p, i) => `<div class="dg-panel dg-mon${i === lead ? ' on' : ''}${p.dead ? ' out' : ''}"><img src="${portrait(p.dex)}" alt="" /><div class="nm"><p>${p.name}</p><span class="hp"><i class="${hpClass(p.hp / p.maxHp)}" style="width:${(p.hp / p.maxHp) * 100}%"></i></span></div></div>`)
    .join('')
  const bossEl = hud.querySelector<HTMLElement>('.dg-boss')!
  bossEl.hidden = !boss || !boss.awake || boss.dead
  if (boss) bossEl.innerHTML = `<p>${boss.name} <span style="color:#707070">Lv${boss.level}</span></p><span class="hp"><i class="${hpClass(boss.hp / boss.maxHp)}" style="width:${(boss.hp / boss.maxHp) * 100}%"></i></span>`
  const cd = (v: number, max: number) => `<i style="width:${Math.max(0, Math.min(1, 1 - v / max)) * 100}%"></i>`
  hud.querySelector('.dg-moves')!.innerHTML = `
    <div class="dg-panel dg-move"><p><b>Auto</b></p><p>${MOVES[t] ?? 'Tackle'}</p></div>
    <div class="dg-panel dg-move"><p><b>1</b></p><p>${STRONG[t] ?? 'Body Slam'}</p>${cd(me.cd1, 4)}</div>
    <div class="dg-panel dg-move"><p><b>2</b></p><p>${BURST[t] ?? 'Hyper Voice'}</p>${cd(me.cd2, 9)}</div>`
  hud.querySelector('.dg-floor')!.innerHTML = `<p>${map === hand ? 'Deepest floor' : `B${run.floor}`}</p><p class="dg-dim">${run.charged ? 'Lantern lit' : 'No charge'}</p>`
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
const home = () => (location.href = BASE)

function end(win: boolean) {
  if (state === 'won' || state === 'lost') return
  state = win ? 'won' : 'lost'
  clearRun()
  if (mode === 'host' && guestPeer) net?.sendEvent({ kind: 'end', win })
  const found = run.found.length ? `<p class="dg-dim">Found: ${run.found.join(' ')}</p>` : ''
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
  if (g && game.save.island === g && !game.save.guardians.includes(g)) {
    game.save.guardians.push(g)
    game.save.starPieces += 3
    game.persist()
    const joined = game.guardianJoins()
    const next = ISLANDS.find((i) => i.unlock?.from === g)
    text += `<p>${joined ? `${game.name(joined)} joins you. ` : ''}3 Star Pieces.${next ? ` One step closer to ${next.name}.` : ''}</p>`
  } else if (test) text += `<p class="dg-dim">Test play: nothing was saved.</p>`
  else if (boss) text += `<p>${boss.name} is beaten.</p>`
  text += found
  const deep = !test && run.charged ? DEEP[run.dungeon] : undefined
  if (deep?.length) return message(text, [{ label: 'Continue', gold: true, run: () => deepCatch(deep[Math.floor(Math.random() * deep.length)]) }])
  message(text, [{ label: 'Back to the island', gold: true, run: home }])
}
/** After a charged clear: something stirs in the deep, for one throw. */
function deepCatch(dex: number) {
  const name = game.name(dex)
  const have = BALLS.filter((b) => game.save.balls[b.id] > 0)
  const odds = (b: Ball) => Math.round(game.deepChance(run.dungeon, b) * 100)
  const img = `<img class="dg-deep" src="${portrait(dex)}" alt="" />`
  if (!have.length) return message(`${img}<p>A wild ${name} looked out from the deep, then slipped away.</p><p class="dg-dim">You had no balls to throw.</p>`, [{ label: 'Back to the island', gold: true, run: home }])
  message(
    `${img}<p>Something stirs in the deep. A wild ${name} appeared!</p><p class="dg-dim">One throw.</p>`,
    [
      ...have.map((b) => ({
        label: `${b.name} ${odds(b.id)}%`,
        gold: b.id === have[have.length - 1].id,
        run: () => {
          const res = game.throwDeep(run.dungeon, dex, b.id)
          if (res?.caught) {
            game.note('catch', `Caught ${name} deep in ${hand.name}.`, { dex })
            message(`${img}<p>Gotcha! ${name} was caught!</p>`, [{ label: 'Back to the island', gold: true, run: home }])
          } else message(`${img}<p>${name} broke free and slipped back into the deep.</p><p class="dg-dim">It will be a little easier next time.</p>`, [{ label: 'Back to the island', gold: true, run: home }])
        },
      })),
      { label: 'Leave it', run: home },
    ],
  )
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault()
  keys.add(k)
  if (state === 'paused' && k === 'escape') return resume()
  if (state !== 'play') return
  const me = party[lead]
  if (k === 'escape') return pause()
  if (k === 'tab') {
    for (let i = 1; i <= party.length; i++) {
      const j = (lead + i) % party.length
      if (!party[j].dead) {
        lead = j
        break
      }
    }
    hudKey = ''
  }
  if (mode === 'guest') {
    // the guest dashes here (it moves itself) and sends its presses to the host
    if (k === ' ' && me.dashCd <= 0 && me.sleep <= 0) {
      me.dash = 0.16
      me.dashCd = 1.2
      guestActs.push('dash')
    }
    if (['1', '2', 'q', 'e'].includes(k)) guestActs.push(k)
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
  if (k === '1' && me.cd1 <= 0) {
    const t = nearest(me, foes, ranged(me) ? 90 : 30)
    if (t) {
      me.cd1 = 4
      attack(me, t, 2.2, STRONG[bestType(me, t)])
    }
  }
  if (k === '2' && me.cd2 <= 0) {
    me.cd2 = 9
    burst(me, 1.5, 44, BURST[me.types[0]] ?? 'Hyper Voice')
  }
}
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
addEventListener('blur', () => keys.clear())
function pause() {
  state = 'paused'
  message('<p>Paused.</p><p class="dg-dim">Leaving keeps your run at the last stairs.</p>', [
    { label: 'Resume', gold: true, run: resume },
    { label: 'Leave the dungeon', run: home },
  ])
}
function resume() {
  hud.querySelector('.dg-msg')?.remove()
  state = 'play'
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
    <div class="dg-panel dg-keys"><p>WASD move</p><p>Space dash</p><p>1 2 moves</p><p>Tab switch</p><p>Esc pause</p></div>`

  let saved: Run | null = null
  try {
    saved = JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null')
  } catch {}
  if (saved && (saved.dungeon !== id || saved.gate !== gate)) saved = null
  const fresh = (): Run => ({ dungeon: id, gate, floor: 1, seed: Math.floor(Math.random() * 1e9), charged: false, items: { oran: 0, sitrus: 0, seed: 0, elixir: 0 }, hp: {}, found: [] })
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
    lead = Math.max(0, party.findIndex((p) => !p.dead))
    await loadFloor(run.floor)
    saveRun()
    state = 'play'
    toast(map === hand ? `${hand.name}: the deepest floor.` : `${hand.name} B${run.floor}.`)
    // co-op: tell the guest the seed and which Pokémon are theirs (their lead first)
    if (mode === 'host' && guestPeer) {
      const theirs = party.filter((p) => p.owner === guestPeer)
      net?.sendStart({ dungeon: id, gate, seed: run.seed, floor: run.floor, mine: [guestLeadId, ...theirs.filter((p) => p.id !== guestLeadId).map((p) => p.id)] }, guestPeer)
    }
  }
  // a preview of B1 behind the intro (the real run, with its own seed, starts on Enter)
  run = saved ?? fresh()
  await loadFloor(run.floor)
  renderHud()
  const lv = hand.entities.filter((e) => e.kind === 'enemy').map((e) => e.level ?? 10)
  const boss = hand.entities.find((e) => e.kind === 'boss')
  const charges = game.save.lanterns ?? 0
  const berries = Math.min(2, game.save.berries)
  const intro = `<p>${hand.name}</p><p class="dg-dim">${test ? 'One floor (test play).' : `Three floors, then ${boss ? `${game.name(boss.dex!)} (Lv${boss.level})` : 'the deepest floor'}. Levels about ${Math.min(...lv) - 6} to ${Math.max(...lv)}.`}</p><p class="dg-dim">${charges ? `Lantern charges: ${charges}. Entering lights one, and its chests open.` : 'No Lantern charge: chests stay shut. Finish a 25-minute session to light one.'}</p>`
  const enter = (bring: boolean) => {
    coop = mode === 'host' && !!guestPeer
    const r = fresh()
    if (!test) r.charged = game.useLantern()
    if (bring && berries) {
      game.save.berries -= berries
      game.persist()
      r.items.oran = berries
    }
    void start(r)
  }
  const enterButtons = [
    ...(berries ? [{ label: `Enter with ${berries} Oran Berr${berries === 1 ? 'y' : 'ies'}`, gold: true, run: () => enter(true) }] : []),
    { label: 'Enter', gold: !berries, run: () => enter(false) },
  ]
  if (mode === 'host') hostLobby(id, intro, enterButtons)
  else if (saved && !test)
    message(`<p>${hand.name}</p><p class="dg-dim">Your run is waiting on ${saved.floor >= FLOORS ? 'the deepest floor' : `B${saved.floor}`}.</p>`, [
      { label: 'Continue', gold: true, run: () => void start(saved!) },
      { label: 'Start over', run: () => (clearRun(), enter(false)) },
      { label: 'Back to the island', run: home },
    ])
  else
    message(intro, [
      ...enterButtons,
      ...(test ? [] : [{ label: 'Play with a friend', run: () => friendMenu(id) }]),
      { label: 'Back to the island', run: home },
    ])
  startLoop()
}
function startLoop() {
  // a host whose window is hidden keeps the dungeon running for its guest (timers still tick, if slower)
  let hiddenAt = performance.now()
  setInterval(() => {
    const now = performance.now()
    if (mode === 'host' && document.hidden && state === 'play') update(Math.min(0.25, (now - hiddenAt) / 1000))
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
  message('<p>Play with a friend</p><p class="dg-dim">Two of you, two Pokémon each. Enemies are tougher, and each of you keeps your own loot.</p>', [
    { label: 'Host a room', gold: true, run: () => (location.href = `${location.pathname}?id=${encodeURIComponent(id)}${gate ? `&gate=${gate}` : ''}&room=${makeRoomCode()}&host=1`) },
    {
      label: 'Join a room',
      run: () => {
        message('<p>Type the room code your friend sees.</p><input class="dg-code" maxlength="4" autocomplete="off" spellcheck="false" />', [
          { label: 'Join', gold: true, run: () => {
            const code = (document.querySelector<HTMLInputElement>('.dg-code')?.value ?? '').trim().toUpperCase()
            if (code.length === 4) location.href = `${location.pathname}?room=${code}`
            else friendMenu(id)
          } },
          { label: 'Back', run: back },
        ])
        setTimeout(() => document.querySelector<HTMLInputElement>('.dg-code')?.focus(), 30)
      },
    },
    { label: 'Back', run: back },
  ])
}
/** The host waits in its room; when a friend joins, their two Pokémon take the place of your third. */
function hostLobby(id: string, intro: string, enterButtons: { label: string; gold?: boolean; run: () => void }[]) {
  net = connectRoom(roomCode!)
  let joined = ''
  const solo = () => (location.href = `${location.pathname}?id=${encodeURIComponent(id)}${gate ? `&gate=${gate}` : ''}`)
  const show = () => {
    hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
    if (guestPeer) message(`${intro}<p>${joined}</p>`, [...enterButtons, { label: 'Back to the island', run: home }])
    else
      message(`<p>Room <b class="dg-room">${roomCode}</b></p><p class="dg-dim">Ask your friend to open a dungeon door, choose Play with a friend, then Join a room, and type ${roomCode}.</p><p class="dg-dim">Waiting for them…</p>`, [
        { label: 'Play alone', run: solo },
        { label: 'Back to the island', run: home },
      ])
  }
  net.onHello(async (h, peer) => {
    if (guestPeer || state !== 'intro') return
    guestPeer = peer
    await Promise.all(h.team.map(async (m) => species.set(m.dex, species.get(m.dex) ?? (await loadSpecies(manifest, String(m.dex).padStart(4, '0'))))))
    // two each: your strongest two, then theirs
    party = party.slice(0, 2)
    for (const m of h.team.slice(0, 2)) {
      const a = makeActor('you', m.dex, m.level, species.get(m.dex)!, m.types, m.name, party[0].x, party[0].y)
      a.owner = peer
      party.push(a)
    }
    guestLeadId = party[2]?.id ?? -1
    joined = `Your friend joined with ${h.team.slice(0, 2).map((m) => `${m.name} (Lv${m.level})`).join(' and ')}.`
    hudKey = ''
    show()
  })
  net.onInput((inp, peer) => {
    if (peer === guestPeer) heardAt = performance.now()
    if (peer !== guestPeer || inp.floor !== run.floor || state !== 'play') return
    const a = party.find((p) => p.id === inp.id && p.owner === peer)
    if (!a) return
    if (!a.dead && a.sleep <= 0) {
      a.x = inp.x
      a.y = inp.y
      a.dir = inp.dir
      a.moving = inp.moving
    }
    for (const k of inp.acts) act(a, k)
  })
  const guestLeft = (peer: string) => {
    if (peer !== guestPeer) return
    guestPeer = null
    for (const p of party) if (p.owner === peer) p.owner = undefined
    if (state === 'intro') {
      party = party.filter((p) => !p.owner && party.indexOf(p) < 2)
      show()
    } else toast('Your friend left. Their Pokémon fight on with you.')
  }
  net.onPeerLeave(guestLeft)
  // nothing from the guest for 10 seconds during the run: they've gone
  setInterval(() => {
    if (guestPeer && state === 'play' && performance.now() - heardAt > 10000) guestLeft(guestPeer)
  }, 2000)
  show()
}
/** The guest: send our team, wait for the host to start, then play on their run. */
async function bootGuest() {
  if (game.inSession) return message('<p>Finish your focus session first. Dungeons are for breaks.</p>', [{ label: 'Back to the island', gold: true, run: home }])
  const team = pickParty().slice(0, 2)
  await Promise.all(team.map(async (m) => species.set(m.dex, await loadSpecies(manifest, String(m.dex).padStart(4, '0')))))
  hud.innerHTML = `<div class="dg-party"></div><div class="dg-panel dg-boss" hidden></div><div class="dg-moves"></div><div class="dg-panel dg-toast"></div>
    <div class="dg-panel dg-floor"></div><div class="dg-panel dg-items"></div>
    <div class="dg-panel dg-keys"><p>WASD move</p><p>Space dash</p><p>1 2 moves</p><p>Esc pause</p></div>`
  net = connectRoom(roomCode!)
  message(`<p>Room <b class="dg-room">${roomCode}</b></p><p class="dg-dim">Joining. You go in together when your friend starts.</p>`, [{ label: 'Back to the island', run: home }])
  const hello: Hello = { name: 'friend', team: team.map((m): TeamMon => ({ dex: m.dex, level: m.level, name: game.name(m), types: game.species(m.dex)?.types ?? ['normal'] })) }
  net.sendHello(hello)
  const timer = setInterval(() => net!.sendHello(hello), 1500)
  net.onStart(async (st: Start) => {
    if (run) return
    clearInterval(timer)
    hand = await (await fetch(`${BASE}dungeons/${st.dungeon}.json?v=${__BUILD__}`)).json()
    run = { dungeon: st.dungeon, gate: st.gate as IslandId | null, floor: st.floor, seed: st.seed, charged: game.useLantern(), items: { oran: 0, sitrus: 0, seed: 0, elixir: 0 }, hp: {}, found: [] }
    for (const i of st.mine) mine.add(i)
    guestLeadId = st.mine[0]
    await Promise.all(hand.entities.filter((e) => e.dex).map(async (e) => species.set(e.dex!, species.get(e.dex!) ?? (await loadSpecies(manifest, String(e.dex).padStart(4, '0'))))))
    await guestFloor(st.floor)
    hud.querySelectorAll('.dg-msg').forEach((m) => m.remove())
    state = 'play'
    toast(`${hand.name} B${st.floor}, with your friend.${run.charged ? ' Your Lantern is lit.' : ''}`)
  })
  net.onSnap(applySnap)
  net.onEvent(async (e: NetEvent) => {
    if (!run) return
    if (e.kind === 'floor' && e.floor) {
      state = 'busy'
      view.style.transition = 'opacity .35s ease'
      view.style.opacity = '0'
      await guestFloor(e.floor)
      view.style.opacity = '1'
      state = 'play'
      toast(map === hand ? `${hand.name}: the deepest floor.` : `${hand.name} B${e.floor}.`)
    }
    if (e.kind === 'chest') {
      if (run.charged) {
        const lines = lootChest(!!e.big)
        run.found.push(...lines)
        toast(lines.join(' '))
      } else toast('Your friend opened a chest. Light a Lantern charge to share the loot.')
    }
    if (e.kind === 'end') end(!!e.win)
  })
  const hostLeft = () => {
    if (state === 'won' || state === 'lost') return
    state = 'lost'
    message('<p>Your friend left, so the run ended.</p>', [{ label: 'Back to the island', gold: true, run: home }])
  }
  net.onPeerLeave(hostLeft)
  setInterval(() => {
    if (run && (state === 'play' || state === 'busy') && performance.now() - heardAt > 10000) hostLeft()
  }, 2000)
  // a hidden tab stops drawing, but still tells the host it's here
  setInterval(() => {
    const me = actors.get(guestLeadId)
    if (document.hidden && run && state === 'play' && me && me.tx !== undefined)
      net?.sendInput({ id: guestLeadId, floor: run.floor, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, moving: false, acts: guestActs.splice(0) })
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
    return { mode, snapsIn, snapsUsed, snapsOut, size: mode === 'host' && run && party.length ? JSON.stringify(snapshot()).length : 0, guestLeadId, guestPeer, actors: actors.size, peers: net?.peers(), time }
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
}
