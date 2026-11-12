// Generated dungeon floors (B1 to B3). Each dungeon is three generated floors and
// then its hand-made map from the editor, where the boss waits.
//
// A floor is built from the same pieces the editor uses: rooms (or caverns) on a
// 3×3 grid, joined by 2-wide corridors along a random spanning tree plus a loop
// or two, with ponds, grass and props for the theme. Then it is filled: the
// start, the stairs in the room farthest from it (a miniboss guards them on B2
// and B3), the dungeon's own Pokémon, traps, pots and a chest or two. The same
// seed always builds the same floor, so co-op players can each build it.
//
// Every floor also gets one modifier (Fog, Flooded, Restless, Echo or Rich) and
// may get one special room: a monster house (its doors close while it fights,
// with a big chest), a vault (a lever opens a gated alcove behind timed spikes),
// a shrine (2 Oran Berries for a Reviver Seed) or a dark room (no ambient light).
// Those come from a second random stream, so the layout above them is unchanged.
import { rng } from '../pixel'
import { DungeonMap, Entity, Modifier, Piece, Prop, Special, T, Theme, TrapKind, compose, uid } from './map'

export interface FloorSpec {
  seed: number
  floor: number // 1..3
  name: string
  theme: Theme
  dark: number
  species: number[] // the dungeon's own Pokémon (from its hand-made map)
  mini: number[] // stronger forms for the miniboss
  levels: [number, number] // enemy levels on this floor
  miniboss: boolean
  bigChest?: boolean // the deepest of the deep floors holds a big chest
}
export const MODIFIERS: Modifier[] = ['fog', 'flooded', 'restless', 'echo', 'rich']

export const FLOOR_W = 58
export const FLOOR_H = 42
const GRID = 3

interface Room {
  x: number
  y: number
  w: number
  h: number
  cell: number
  cavern: boolean
}

export function generateFloor(spec: FloorSpec): DungeonMap {
  const r = rng(spec.seed * 7919 + spec.floor * 104729)
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1))
  const pick = <X>(xs: X[]) => xs[Math.floor(r() * xs.length)]
  const cw = Math.floor((FLOOR_W - 2) / GRID)
  const ch = Math.floor((FLOOR_H - 2) / GRID)
  const pieces: Piece[] = []
  const props: Prop[] = []
  const entities: Entity[] = []

  // one room per cell; two become small junctions
  const small = new Set<number>()
  while (small.size < 2) small.add(int(0, 8))
  const rooms: Room[] = []
  for (let c = 0; c < GRID * GRID; c++) {
    const gx = c % GRID
    const gy = Math.floor(c / GRID)
    const w = small.has(c) ? 4 : int(8, Math.min(13, cw - 3))
    const h = small.has(c) ? 4 : int(6, Math.min(9, ch - 3))
    const x = 1 + gx * cw + int(1, Math.max(1, cw - w - 1))
    const y = 1 + gy * ch + int(1, Math.max(1, ch - h - 1))
    const cavern = spec.theme !== 'forest' && !small.has(c) && r() < 0.4
    rooms.push({ x, y, w, h, cell: c, cavern })
    pieces.push({ id: uid(), type: cavern ? 'cavern' : 'room', x, y, w, h })
  }

  // a random spanning tree over the grid, plus one or two loops
  const edges: [number, number][] = []
  const seen = new Set<number>([int(0, 8)])
  const near = (c: number) =>
    [
      [c % GRID > 0, c - 1],
      [c % GRID < GRID - 1, c + 1],
      [c >= GRID, c - GRID],
      [c < GRID * (GRID - 1), c + GRID],
    ]
      .filter(([ok]) => ok)
      .map(([, n]) => n as number)
  while (seen.size < GRID * GRID) {
    const from = pick([...seen])
    const to = pick(near(from).filter((n) => !seen.has(n)))
    if (to === undefined) continue
    seen.add(to)
    edges.push([from, to])
  }
  for (let i = 0; i < int(1, 2); i++) {
    const a = int(0, 8)
    const b = pick(near(a))
    if (!edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) edges.push([a, b])
  }
  const centre = (rm: Room) => ({ x: rm.x + Math.floor(rm.w / 2), y: rm.y + Math.floor(rm.h / 2) })
  for (const [a, b] of edges) {
    const A = centre(rooms[a])
    const B = centre(rooms[b])
    // an L: across, then down (or the other way), 2 tiles wide
    if (r() < 0.5) {
      pieces.push({ id: uid(), type: 'room', x: Math.min(A.x, B.x), y: A.y, w: Math.abs(A.x - B.x) + 2, h: 2 })
      pieces.push({ id: uid(), type: 'room', x: B.x, y: Math.min(A.y, B.y), w: 2, h: Math.abs(A.y - B.y) + 2 })
    } else {
      pieces.push({ id: uid(), type: 'room', x: A.x, y: Math.min(A.y, B.y), w: 2, h: Math.abs(A.y - B.y) + 2 })
      pieces.push({ id: uid(), type: 'room', x: Math.min(A.x, B.x), y: B.y, w: Math.abs(A.x - B.x) + 2, h: 2 })
    }
  }

  // the start, and the stairs as far from it (along the tree) as possible
  const big = rooms.filter((rm) => !small.has(rm.cell))
  const start = pick(big)
  const dist = new Map<number, number>([[start.cell, 0]])
  const queue = [start.cell]
  while (queue.length) {
    const c = queue.shift()!
    for (const [a, b] of edges)
      for (const [p, q] of [
        [a, b],
        [b, a],
      ])
        if (p === c && !dist.has(q)) {
          dist.set(q, dist.get(c)! + 1)
          queue.push(q)
        }
  }
  const end = [...big].sort((a, b) => (dist.get(b.cell) ?? 0) - (dist.get(a.cell) ?? 0))[0]

  // the modifier and the special room come from their own stream
  const r2 = rng(spec.seed * 7919 + spec.floor * 104729 + 31337)
  const modifier = MODIFIERS[Math.floor(r2() * MODIFIERS.length)]
  const roll = r2()
  let kind: Special['kind'] | null = roll < 0.25 ? 'house' : roll < 0.45 ? 'vault' : roll < 0.6 ? 'shrine' : roll < 0.75 ? 'dark' : null
  const candidates = big.filter((rm) => rm !== start && rm !== end && !rm.cavern && rm.w >= 8 && rm.h >= 6)
  const sroom = candidates.length ? candidates[Math.floor(r2() * candidates.length)] : null
  if (!sroom) kind = null

  // ponds and grass inside some rooms, then props for the theme
  for (const rm of big) {
    if (rm === start || rm === end || rm.w < 9 || rm === sroom) continue
    const roll = r()
    if (roll < 0.25) pieces.push({ id: uid(), type: 'pond', x: rm.x + int(2, rm.w - 6), y: rm.y + int(1, rm.h - 4), w: 4, h: 3 })
    else if (roll < 0.55) pieces.push({ id: uid(), type: 'grass', x: rm.x + int(1, rm.w - 5), y: rm.y + int(1, rm.h - 4), w: 4, h: 3 })
  }
  const map: DungeonMap = {
    v: 1,
    id: `floor-${spec.seed}-${spec.floor}`,
    name: `${spec.name} B${spec.floor}`,
    theme: spec.theme,
    w: FLOOR_W,
    h: FLOOR_H,
    dark: spec.dark,
    pieces,
    props,
    entities,
    paint: {},
  }
  const used = new Set<string>()
  const idx = (x: number, y: number) => y * FLOOR_W + x
  // a vault: the two rows (or columns) along one side of the room become an alcove behind a
  // wall with a 2-tile gate in the middle; only a side no corridor touches will do
  let vault: { at: (u: number, v: number) => { x: number; y: number }; len: number; depth: number } | null = null
  if (kind === 'vault' && sroom) {
    const t0 = compose(map)
    const solid = (x: number, y: number) => x < 0 || y < 0 || x >= FLOOR_W || y >= FLOOR_H || t0[idx(x, y)] === T.Void || t0[idx(x, y)] === T.Wall
    const { x, y, w, h } = sroom
    const sides = [
      { at: (u: number, v: number) => ({ x: x + v, y: y + u }), len: w, depth: h },
      { at: (u: number, v: number) => ({ x: x + v, y: y + h - 1 - u }), len: w, depth: h },
      { at: (u: number, v: number) => ({ x: x + u, y: y + v }), len: h, depth: w },
      { at: (u: number, v: number) => ({ x: x + w - 1 - u, y: y + v }), len: h, depth: w },
    ]
    const first = Math.floor(r2() * 4)
    for (let k = 0; k < 4 && !vault; k++) {
      const sd = sides[(first + k) % 4]
      if (sd.depth - 3 < 3) continue
      let ok = true
      for (let u = -1; u <= 2 && ok; u++)
        for (let v = -1; v <= sd.len && ok; v++) {
          const p = sd.at(u, v)
          const outside = u === -1 || v === -1 || v === sd.len
          ok = outside ? solid(p.x, p.y) : t0[idx(p.x, p.y)] === T.Floor
        }
      if (ok) vault = sd
    }
    if (!vault) kind = 'shrine'
  }
  let special: Special | undefined = kind && sroom ? { kind, x: sroom.x, y: sroom.y, w: sroom.w, h: sroom.h } : undefined
  if (vault && special) {
    const mid = Math.floor(vault.len / 2)
    special.gate = []
    for (let v = 0; v < vault.len; v++) {
      const p = vault.at(2, v)
      if (v === mid - 1 || v === mid) special.gate.push(idx(p.x, p.y))
      else map.paint[`${p.x},${p.y}`] = T.Wall
      for (const u of [0, 1]) {
        const q = vault.at(u, v)
        used.add(`${q.x},${q.y}`)
      }
      used.add(`${p.x},${p.y}`)
    }
  }
  const tiles = compose(map)
  const floorAt = (x: number, y: number) => tiles[idx(x, y)] === T.Floor
  if (special?.kind === 'house') {
    // its doorways: the open tiles just outside the room, where the corridors come in
    special.doors = []
    for (let y = special.y - 1; y <= special.y + special.h; y++)
      for (let x = special.x - 1; x <= special.x + special.w; x++) {
        const inside = x >= special.x && x < special.x + special.w && y >= special.y && y < special.y + special.h
        if (inside || x < 0 || y < 0 || x >= FLOOR_W || y >= FLOOR_H) continue
        const t = tiles[idx(x, y)]
        if (t === T.Floor || t === T.Grass) special.doors.push(idx(x, y))
      }
    if (!special.doors.length) special = undefined
  }
  /** A free floor tile inside a room, away from its walls. */
  const spot = (rm: Room, pad = 1) => {
    for (let i = 0; i < 40; i++) {
      const x = int(rm.x + pad, rm.x + rm.w - 1 - pad)
      const y = int(rm.y + pad, rm.y + rm.h - 1 - pad)
      if (floorAt(x, y) && !used.has(`${x},${y}`)) {
        used.add(`${x},${y}`)
        return { x, y }
      }
    }
    return null
  }
  const lightKind = spec.theme === 'ice' ? 'crystal' : 'torch'
  const add = (e: Omit<Entity, 'id'>) => entities.push({ id: uid(), ...e })
  // the vault's lever, gate spikes, chest and pot; the shrine
  if (vault && special) {
    const mid = Math.floor(vault.len / 2)
    for (const v of [mid - 1, mid]) add({ kind: 'trap', ...vault.at(2, v), trap: 'spikes', phase: 0 })
    add({ kind: 'chest', ...vault.at(0, mid) })
    add({ kind: 'pot', ...vault.at(0, mid > 2 ? 1 : vault.len - 2) })
    for (let i = 0; i < 40; i++) {
      const p = vault.at(4 + Math.floor(r2() * Math.max(1, vault.depth - 5)), 1 + Math.floor(r2() * (vault.len - 2)))
      if (!floorAt(p.x, p.y) || used.has(`${p.x},${p.y}`)) continue
      used.add(`${p.x},${p.y}`)
      add({ kind: 'lever', ...p })
      break
    }
  }
  if (special?.kind === 'shrine' && sroom) {
    const p = { x: sroom.x + Math.floor(sroom.w / 2), y: sroom.y + Math.floor(sroom.h / 2) - 1 }
    used.add(`${p.x},${p.y}`)
    add({ kind: 'shrine', ...p })
  }
  for (const rm of rooms) {
    // a light in most rooms, more in dark dungeons (never in a dark room)
    if (r() < 0.55 + spec.dark * 0.35 && !(special?.kind === 'dark' && rm === sroom)) {
      const p = spot(rm, 0)
      if (p) props.push({ id: uid(), kind: lightKind, x: p.x, y: p.y })
    }
    if (!small.has(rm.cell) && r() < 0.6) {
      const p = spot(rm, 1)
      if (p) props.push({ id: uid(), kind: spec.theme === 'forest' ? 'tree' : 'rock', x: p.x, y: p.y })
    }
  }

  const s0 = spot(start, 2) ?? centre(start)
  add({ kind: 'start', ...s0 })
  const st = spot(end, 2) ?? centre(end)
  add({ kind: 'stairs', ...st })
  if (spec.miniboss && spec.mini.length) {
    const m = spot(end, 1)
    if (m) add({ kind: 'miniboss', ...m, dex: pick(spec.mini), level: spec.levels[1] })
  }

  // the dungeon's own Pokémon: one or two a room, none in the start room
  for (const rm of rooms) {
    if (rm === start) continue
    const house = special?.kind === 'house' && rm === sroom
    const n = house ? 4 + Math.floor(r2() * 3) : small.has(rm.cell) ? int(0, 1) : int(1, 2)
    for (let i = 0; i < n; i++) {
      const p = spot(rm, 1)
      if (p) add({ kind: 'enemy', ...p, dex: pick(spec.species), level: int(spec.levels[0], spec.levels[1]) })
    }
  }
  if (special?.kind === 'house' && sroom) {
    const p = spot(sroom, 1)
    if (p) add({ kind: 'chest', ...p, big: true })
  }
  // traps: spikes anywhere, alarms in bigger rooms, spores in caves and forests, rolling
  // boulders in caves and volcanoes, slick ice in ice caves (never spores in either)
  const kinds: TrapKind[] =
    spec.theme === 'ice' ? ['spikes', 'alarm', 'ice', 'ice'] : spec.theme === 'cave' ? ['spikes', 'spores', 'alarm', 'boulders'] : spec.theme === 'volcano' ? ['spikes', 'alarm', 'boulders'] : ['spikes', 'spores', 'alarm']
  for (let i = 0; i < Math.min(7, 4 + spec.floor); i++) {
    const rm = pick(rooms.filter((x) => x !== start))
    const p = spot(rm, 1)
    const trap = pick(kinds)
    if (p) add({ kind: 'trap', ...p, trap, ...(trap === 'boulders' ? { dir: r2() < 0.5 ? ('h' as const) : ('v' as const) } : {}) })
  }
  // pots hold healing for the run; a chest or two holds loot (with a Lantern charge)
  for (let i = 0; i < 3 + int(0, 1); i++) {
    const p = spot(pick(rooms), 1)
    if (p) add({ kind: 'pot', ...p })
  }
  const leaves = big.filter((rm) => rm !== start && rm !== end && edges.filter(([a, b]) => a === rm.cell || b === rm.cell).length === 1)
  for (const rm of (leaves.length ? leaves : big.filter((x) => x !== start)).slice(0, int(1, 2))) {
    const p = spot(rm, 1)
    if (p) add({ kind: 'chest', ...p })
  }
  // Rich: one more chest; the deepest deep floor: a big one by the stairs
  if (modifier === 'rich') {
    const p = spot(pick(big.filter((x) => x !== start)), 1)
    if (p) add({ kind: 'chest', ...p })
  }
  if (spec.bigChest) {
    const p = spot(end, 1)
    if (p) add({ kind: 'chest', ...p, big: true })
  }
  map.special = special
  map.modifier = modifier
  // Flooded: two rooms stand in shallow water
  if (modifier === 'flooded') {
    const pool = big.filter((x) => x !== start && !(special?.kind === 'vault' && x === sroom))
    map.wet = []
    for (let i = 0; i < 2 && pool.length; i++) {
      const rm = pool.splice(Math.floor(r2() * pool.length), 1)[0]
      map.wet.push({ x: rm.x, y: rm.y, w: rm.w, h: rm.h })
    }
  }
  return map
}
