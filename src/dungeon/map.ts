// Dungeon maps, shared by the editor (editor.html) and the dungeon (dungeon.html).
//
// A map is a whiteboard of pieces rather than a painted grid: rooms, caverns,
// ponds, grass and wall blocks sit at tile positions and can be moved and
// resized at any time. compose() turns the pieces (in order, later on top),
// plus any single-tile touch-ups, into the tile grid the dungeon walks on.
// Props (trees, rocks, torches, crystals) and entities (start, exit, enemies,
// the boss) sit on tiles too.
import { Pix, RGB, bayer, hash2, hex } from '../pixel'
import { FLAT, Light, normalMapFor } from '../lighting'
import { piece } from '../nature'

export const TILE = 16

export const enum T {
  Void = 0, // solid rock, drawn as wall where it meets open ground
  Floor = 1,
  Water = 2,
  Grass = 3,
  Wall = 4,
}
export type PieceType = 'room' | 'cavern' | 'pond' | 'grass' | 'wall'
export interface Piece {
  id: string
  type: PieceType
  x: number
  y: number
  w: number
  h: number
}
export type PropKind = 'tree' | 'tree2' | 'rock' | 'torch' | 'crystal' | 'flower' | 'bush'
export interface Prop {
  id: string
  kind: PropKind
  x: number
  y: number
}
// stairs, traps, pots, chests, levers, shrines and the miniboss are placed by the floor generator (gen.ts)
export type EntityKind = 'start' | 'exit' | 'enemy' | 'boss' | 'stairs' | 'trap' | 'chest' | 'pot' | 'miniboss' | 'lever' | 'shrine'
// boulders (cave): a plate that rolls a boulder down a warned line; ice (Glacier): a slick patch
export type TrapKind = 'spikes' | 'spores' | 'alarm' | 'boulders' | 'ice'
export interface Entity {
  id: string
  kind: EntityKind
  x: number
  y: number
  dex?: number
  level?: number
  trap?: TrapKind
  big?: boolean // a big chest (a monster house's, or the deepest floor's)
  free?: boolean // a supply chest: opens without a Lantern charge (2026-11-18)
  phase?: number // spikes: where in the cycle they start (a vault's gate spikes move together)
  dir?: 'h' | 'v' // boulders: the line they roll along
}
/** A generated floor's one special room (gen.ts). */
export interface Special {
  kind: 'house' | 'vault' | 'shrine' | 'dark'
  x: number // the room, in tiles
  y: number
  w: number
  h: number
  doors?: number[] // house: the doorway tiles (index y * w + x) that close while it fights
  gate?: number[] // vault: the gate tiles the lever opens
}
/** One per generated floor, named on arrival. */
export type Modifier = 'fog' | 'flooded' | 'restless' | 'echo' | 'rich'
export type Theme = 'cave' | 'forest' | 'ice' | 'volcano' | 'meadow' | 'snowwood' | 'shore' // volcano: dark rock, and its ponds are lava
/**
 * Outdoor themes for the surface explorations (2026-11-18, Paul: "dungeons/exploration areas on
 * the surface ... naturally pretty areas"): daylight, Flurmimon's grass and trees, the woods for
 * walls. Each names its pieces: the ground tiles, the wall's canopy and trunks, and the props.
 */
export const OUTDOOR: Partial<Record<Theme, { ground: string; ground2: string; canopy: string; tree: string; tree2: string; rock: string; flowers: string[]; bush: string; tall: string }>> = {
  meadow: { ground: 'grass', ground2: 'grass2', canopy: 'tree-green', tree: 'tree-green', tree2: 'tree-pink', rock: 'rock-moss', flowers: ['flower0', 'flower1', 'flower2', 'flower3', 'flower4'], bush: 'bush2', tall: 'tallgrass' },
  snowwood: { ground: 'grass-snow', ground2: 'grass-snow', canopy: 'tree-snow', tree: 'tree-snow', tree2: 'tree-snowcap', rock: 'rock-snow', flowers: ['bush-frost', 'rock-snow-s', 'snowman'], bush: 'bush2-frost', tall: 'tallgrass-pale' },
  shore: { ground: 'grass2', ground2: 'grass', canopy: 'palm', tree: 'palm', tree2: 'palm-coco', rock: 'rock-brown', flowers: ['flower3', 'flower4', 'rock-s3', 'small-orange'], bush: 'bush', tall: 'tallgrass' },
}
export interface DungeonMap {
  v: 1
  id: string
  name: string
  theme: Theme
  w: number // tiles
  h: number
  dark: number // 0 (lit) .. 1 (pitch black); torches, crystals and fire types light it
  pieces: Piece[]
  props: Prop[]
  entities: Entity[]
  paint: Record<string, T> // single-tile touch-ups, "x,y" → tile
  special?: Special // generated floors only
  modifier?: Modifier
  wet?: { x: number; y: number; w: number; h: number }[] // Flooded: shallow water that slows everyone
}

export const uid = () => Math.random().toString(36).slice(2, 9)

export function emptyMap(): DungeonMap {
  return {
    v: 1,
    id: uid(),
    name: 'New dungeon',
    theme: 'cave',
    w: 60,
    h: 40,
    dark: 0.7,
    pieces: [{ id: uid(), type: 'room', x: 4, y: 4, w: 10, h: 8 }],
    props: [],
    entities: [{ id: uid(), kind: 'start', x: 8, y: 8 }],
    paint: {},
  }
}

/** Preset pieces for the palette: drag one onto the board, then move and resize it. */
export const PRESETS: { label: string; type: PieceType; w: number; h: number }[] = [
  { label: 'Small room', type: 'room', w: 7, h: 6 },
  { label: 'Big room', type: 'room', w: 12, h: 9 },
  { label: 'Corridor →', type: 'room', w: 10, h: 2 },
  { label: 'Corridor ↓', type: 'room', w: 2, h: 10 },
  { label: 'Cavern', type: 'cavern', w: 11, h: 9 },
  { label: 'Boss arena', type: 'cavern', w: 16, h: 12 },
  { label: 'Pond', type: 'pond', w: 6, h: 4 },
  { label: 'Tall grass', type: 'grass', w: 5, h: 4 },
  { label: 'Wall block', type: 'wall', w: 2, h: 2 },
]

/** Build the tile grid from the pieces (in order) and the touch-ups. */
export function compose(m: DungeonMap) {
  const tiles = new Uint8Array(m.w * m.h) // all Void
  const set = (x: number, y: number, t: T) => {
    if (x >= 0 && y >= 0 && x < m.w && y < m.h) tiles[y * m.w + x] = t
  }
  for (const p of m.pieces) {
    const t = p.type === 'pond' ? T.Water : p.type === 'grass' ? T.Grass : p.type === 'wall' ? T.Wall : T.Floor
    const oval = p.type === 'cavern' || p.type === 'pond' || p.type === 'grass'
    for (let y = p.y; y < p.y + p.h; y++)
      for (let x = p.x; x < p.x + p.w; x++) {
        if (oval) {
          const dx = (x + 0.5 - (p.x + p.w / 2)) / (p.w / 2)
          const dy = (y + 0.5 - (p.y + p.h / 2)) / (p.h / 2)
          // caverns get a slightly ragged edge
          const rag = p.type === 'cavern' ? (hash2(x, y, 3) - 0.5) * 0.25 : 0
          if (dx * dx + dy * dy > 1 + rag) continue
        }
        set(x, y, t)
      }
  }
  for (const [k, t] of Object.entries(m.paint)) {
    const [x, y] = k.split(',').map(Number)
    set(x, y, t)
  }
  return tiles
}
/** Tiles you can stand on. Water and walls block; tall grass does not. */
export const walkableTile = (t: number) => t === T.Floor || t === T.Grass

// ---------- art ----------
interface ThemePal {
  floor: RGB
  floor2: RGB
  floorDot: RGB
  top: RGB // wall seen from above
  face: RGB // wall face toward the viewer
  face2: RGB
  edge: RGB
  water: RGB
  water2: RGB
  grass: RGB
  grassDark: RGB
}
const THEMES: Record<Theme, ThemePal> = {
  cave: { floor: hex('#6e6458'), floor2: hex('#655b50'), floorDot: hex('#7c7266'), top: hex('#3c342e'), face: hex('#4e443b'), face2: hex('#433a32'), edge: hex('#241e1a'), water: hex('#2c5a8c'), water2: hex('#3a6ea4'), grass: hex('#4f7d3e'), grassDark: hex('#3a6230') },
  forest: { floor: hex('#5f9a48'), floor2: hex('#56913f'), floorDot: hex('#74ad58'), top: hex('#2f5a33'), face: hex('#5a4630'), face2: hex('#4c3b28'), edge: hex('#1d3320'), water: hex('#2e6aa8'), water2: hex('#3d7dbd'), grass: hex('#3f8a3c'), grassDark: hex('#2f6e30') },
  volcano: { floor: hex('#4a3a34'), floor2: hex('#42332e'), floorDot: hex('#5e4840'), top: hex('#231a17'), face: hex('#3a2a24'), face2: hex('#30221d'), edge: hex('#140d0b'), water: hex('#b8401c'), water2: hex('#f08a30'), grass: hex('#6a5a52'), grassDark: hex('#584a44') },
  meadow: { floor: hex('#89cf7e'), floor2: hex('#5ebe50'), floorDot: hex('#a3da9a'), top: hex('#2f6e30'), face: hex('#3c2a1c'), face2: hex('#2a1e14'), edge: hex('#1d3320'), water: hex('#3d8ed0'), water2: hex('#7cc4ec'), grass: hex('#5ebe50'), grassDark: hex('#469b39') },
  snowwood: { floor: hex('#d2e6e6'), floor2: hex('#e4efef'), floorDot: hex('#a9d7de'), top: hex('#7fa0b0'), face: hex('#4a3a30'), face2: hex('#3a2c24'), edge: hex('#3d566a'), water: hex('#2f6fae'), water2: hex('#a8d8f0'), grass: hex('#a9c2d8'), grassDark: hex('#8eaac4') },
  shore: { floor: hex('#ead09a'), floor2: hex('#d4b47a'), floorDot: hex('#f5e2ad'), top: hex('#2f6e30'), face: hex('#5a3a24'), face2: hex('#42291a'), edge: hex('#1d3320'), water: hex('#3a9ad0'), water2: hex('#8fd6ee'), grass: hex('#5ebe50'), grassDark: hex('#469b39') },
  ice: { floor: hex('#c8d8e8'), floor2: hex('#bccee2'), floorDot: hex('#dce8f4'), top: hex('#7f97b4'), face: hex('#9ab0ca'), face2: hex('#8aa2be'), edge: hex('#4d6582'), water: hex('#2f6fae'), water2: hex('#4083c0'), grass: hex('#a9c2d8'), grassDark: hex('#8eaac4') },
}

/** An outdoor tile: Flurmimon's ground, tall grass on it, water with a pale rim, or the woods. */
function outdoorTile(theme: Theme, t: T, v: number, faceBelow: boolean): HTMLCanvasElement {
  const O = OUTDOOR[theme]!
  const P = THEMES[theme]
  const c = document.createElement('canvas')
  c.width = TILE
  c.height = TILE
  const g = c.getContext('2d')!
  // the shore's floor is sand, painted like the island's beach band
  if (theme === 'shore' && t !== T.Wall) {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const k = hash2(x + v * 16, y, 3)
        g.fillStyle = `rgb(${(k < 0.06 ? P.floor2 : k > 0.97 ? P.floorDot : P.floor).join(',')})`
        g.fillRect(x, y, 1, 1)
      }
  } else if (t !== T.Wall) g.drawImage(piece(O.ground), 0, 0) // one ground tile: alternating two made a checkerboard
  if (t === T.Grass) {
    const tall = piece(O.tall)
    g.drawImage(tall, 0, tall.height - TILE, TILE, TILE, 0, 0, TILE, TILE)
  } else if (t === T.Water) {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        g.fillStyle = `rgb(${((y + (x >> 2) + v) % 6 === 0 && x % 5 ? P.water2 : P.water).join(',')})`
        g.fillRect(x, y, 1, 1)
      }
  } else if (t === T.Wall) {
    // the woods from above: the canopy's leaves, and where open ground is below, trunks in shade
    const can = piece(O.canopy)
    g.drawImage(can, 14 + (v % 2) * 8, 12 + (v >> 1) * 6, TILE, TILE, 0, 0, TILE, TILE)
    if (faceBelow) {
      g.fillStyle = `rgb(${P.top.map((n) => Math.round(n * 0.55)).join(',')})`
      g.fillRect(0, 9, TILE, TILE - 9)
      g.fillStyle = `rgb(${P.face.join(',')})`
      g.fillRect(3 + (v % 3), 9, 2, TILE - 9)
      g.fillRect(10 + (v % 2), 10, 2, TILE - 10)
      g.fillStyle = `rgb(${P.edge.join(',')})`
      g.fillRect(0, TILE - 1, TILE, 1)
    }
  }
  return c
}

/** One 16×16 tile, painted in the theme's colours; v varies the texture. */
export function paintTile(theme: Theme, t: T, v: number, faceBelow: boolean): HTMLCanvasElement {
  if (OUTDOOR[theme]) return outdoorTile(theme, t, v, faceBelow)
  const P = THEMES[theme]
  const p = new Pix(TILE, TILE)
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      let c: RGB
      if (t === T.Floor) {
        c = bayer(x, y) + hash2(x + v * 16, y, 5) * 0.4 > 0.95 ? P.floor2 : P.floor
        if (hash2(x + v * 31, y + v, 9) < 0.03) c = P.floorDot
      } else if (t === T.Grass) {
        c = P.floor
        const col = (x + (y >> 2)) % 4
        if (col === 0 && (y & 3) !== 3) c = P.grass
        if (col === 1 && (y & 3) < 2) c = P.grassDark
      } else if (t === T.Water) {
        c = (y + (x >> 2) + v) % 6 === 0 && x % 5 ? P.water2 : P.water
      } else {
        // a wall: the top surface, and if open ground is below, a face toward the viewer
        if (faceBelow && y >= 6) {
          c = (y - 6) % 4 === 0 ? P.face2 : x % 7 === v % 7 ? P.face2 : P.face
          if (y === TILE - 1) c = P.edge
        } else {
          c = bayer(x, y) > 0.8 ? P.edge : P.top
          if (faceBelow && y === 5) c = P.edge
        }
      }
      p.set(x, y, c)
    }
  return p.toCanvas()
}

/** Props: drawn standing on their tile (anchor at the bottom centre). */
export function paintProp(theme: Theme, kind: PropKind): { img: HTMLCanvasElement; ax: number; ay: number; light?: { color: [number, number, number]; r: number; y: number } } {
  const O = OUTDOOR[theme]
  if (O && kind !== 'torch' && kind !== 'crystal') {
    // outdoors, every prop is one of Flurmimon's pieces; flowers pick one of the theme's
    const name = kind === 'tree' ? O.tree : kind === 'tree2' ? O.tree2 : kind === 'rock' ? O.rock : kind === 'bush' ? O.bush : O.flowers[0]
    const img = piece(name)
    return { img, ax: img.width >> 1, ay: img.height - (kind === 'tree' || kind === 'tree2' ? 6 : 2) }
  }
  if (kind === 'flower' || kind === 'bush') kind = 'rock'
  if (kind === 'tree2') kind = 'tree'
  if (kind === 'torch') {
    const p = new Pix(8, 20)
    for (let y = 8; y < 20; y++) p.set(3, y, hex('#5a3d24')), p.set(4, y, hex('#3e2a18'))
    for (let x = 1; x < 7; x++) p.set(x, 7, hex('#2e2a26'))
    // the flame
    for (const [x, y, c] of [[3, 2, '#ffd27a'], [4, 3, '#ffd27a'], [3, 3, '#fff2c0'], [3, 4, '#ff9c3a'], [4, 4, '#ff9c3a'], [2, 5, '#e8622a'], [3, 5, '#ffb44a'], [4, 5, '#ffb44a'], [5, 5, '#e8622a'], [3, 6, '#e8622a'], [4, 6, '#e8622a'], [4, 1, '#ffd27a']] as [number, number, string][])
      p.set(x, y, hex(c))
    return { img: p.toCanvas(), ax: 4, ay: 19, light: { color: [1, 0.6, 0.3], r: 70, y: -15 } }
  }
  if (kind === 'crystal') {
    const p = new Pix(12, 16)
    const a = hex('#7fd6ff')
    const b = hex('#c8f0ff')
    const d = hex('#3a8ac4')
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 12; x++) {
        const cx = Math.abs(x - 6)
        if (cx > 5 - Math.abs(y - 9) / 3 || y < 2 + cx) continue
        p.set(x, y, x < 5 ? b : x < 7 ? a : d)
      }
    return { img: p.toCanvas(), ax: 6, ay: 15, light: { color: [0.45, 0.8, 1], r: 56, y: -8 } }
  }
  if (kind === 'rock') {
    const p = new Pix(16, 12)
    const P = THEMES[theme]
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 16; x++) {
        const dx = (x + 0.5 - 8) / 7.5
        const dy = (y + 0.5 - 7) / 5.5
        const d = dx * dx + dy * dy
        if (d > 1) continue
        p.set(x, y, d > 0.75 ? P.edge : dy < -0.2 && dx < 0.3 ? hex('#b8b2a8') : dx > 0.4 || dy > 0.4 ? hex('#7a756e') : hex('#9a958c'))
      }
    return { img: p.toCanvas(), ax: 8, ay: 11 }
  }
  // tree (forest green, or snowy on ice)
  const p = new Pix(28, 34)
  const P = THEMES[theme]
  for (let y = 22; y < 34; y++) for (let x = 12; x < 16; x++) p.set(x, y, x < 13 ? hex('#4a3222') : hex('#6b4a32'))
  for (let y = 0; y < 26; y++)
    for (let x = 0; x < 28; x++) {
      const dx = (x + 0.5 - 14) / 13
      const dy = (y + 0.5 - 12) / 12
      const d = dx * dx + dy * dy
      if (d > 1) continue
      const lit = dy < -0.2 && dx < 0.2
      let c = d > 0.82 ? P.edge : lit ? P.grass : P.grassDark
      if (theme === 'ice' && dy < -0.3 && hash2(x, y, 4) < 0.7) c = hex('#eef4fa')
      if (theme === 'cave') c = d > 0.82 ? hex('#1f2a20') : lit ? hex('#3f5a3a') : hex('#2f4430')
      p.set(x, y, c)
    }
  return { img: p.toCanvas(), ax: 14, ay: 33 }
}

// ---------- baking: the whole map at 1×, colours and normals, plus its lights ----------
const tileCache = new Map<string, HTMLCanvasElement>()
const propCache = new Map<string, ReturnType<typeof paintProp>>()
export function bakeMap(m: DungeonMap) {
  const W = m.w * TILE
  const H = m.h * TILE
  const tiles = compose(m)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? T.Void : tiles[y * m.w + x])
  const open = (t: number) => t === T.Floor || t === T.Grass || t === T.Water
  const art = (t: T, v: number, face: boolean) => {
    const k = `${m.theme}:${t}:${v}:${face}`
    let c = tileCache.get(k)
    if (!c) tileCache.set(k, (c = paintTile(m.theme, t, v, face)))
    return c
  }
  const color = document.createElement('canvas')
  color.width = W
  color.height = H
  const g = color.getContext('2d', { willReadFrequently: true })!
  const normal = document.createElement('canvas')
  normal.width = W
  normal.height = H
  const ng = normal.getContext('2d', { willReadFrequently: true })!
  ng.fillStyle = FLAT
  ng.fillRect(0, 0, W, H)
  g.fillStyle = '#0b0c0f'
  g.fillRect(0, 0, W, H)
  const outdoor = OUTDOOR[m.theme]
  // outdoors the woods fill everything off the paths: a leafy canopy, darker than the trees
  if (outdoor) {
    const leaves = document.createElement('canvas')
    leaves.width = 32
    leaves.height = 32
    const lg = leaves.getContext('2d')!
    const can = piece(outdoor.canopy)
    for (const [sx, sy, dx, dy] of [[12, 10, 0, 0], [20, 14, 16, 0], [16, 18, 0, 16], [10, 12, 16, 16]]) lg.drawImage(can, sx, sy, 16, 16, dx, dy, 16, 16)
    lg.globalCompositeOperation = 'source-atop'
    // the woods are a little darker than the trees standing in front of them; less so in the sun
    lg.fillStyle = `rgba(10, 30, 20, ${m.theme === 'shore' ? 0.25 : m.theme === 'meadow' ? 0.35 : 0.4})`
    lg.fillRect(0, 0, 32, 32)
    g.fillStyle = g.createPattern(leaves, 'repeat')!
    g.fillRect(0, 0, W, H)
  }
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const t = at(x, y)
      const v = (x * 7 + y * 13) % 4
      if (open(t)) g.drawImage(art(t as T, v, false), x * TILE, y * TILE)
      else if (outdoor) continue
      else {
        // solid rock only shows where it borders open ground
        let near = false
        for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1 && !near; i++) near = open(at(x + i, y + j))
        if (!near && t !== T.Wall) continue
        const faceBelow = open(at(x, y + 1))
        g.drawImage(art(T.Wall, v, faceBelow), x * TILE, y * TILE)
        if (faceBelow) {
          ng.fillStyle = 'rgb(128,210,190)' // the face leans toward the viewer
          ng.fillRect(x * TILE, y * TILE + 6, TILE, TILE - 6)
        }
      }
    }
  // outdoors, water gets a pale lapping rim and the bank a soft shadow, so ponds read as ponds
  // rather than blue squares; land tiles that touch the woods get a little shade too
  const O = OUTDOOR[m.theme]
  if (O) {
    const P = THEMES[m.theme]
    const rgb = (c: RGB) => `rgb(${c.join(',')})`
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const t = at(x, y)
        const X = x * TILE
        const Y = y * TILE
        if (t === T.Water) {
          g.fillStyle = rgb(P.water2)
          if (at(x, y - 1) !== T.Water) g.fillRect(X, Y, TILE, 2)
          if (at(x - 1, y) !== T.Water) g.fillRect(X, Y, 2, TILE)
          if (at(x + 1, y) !== T.Water) g.fillRect(X + TILE - 2, Y, 2, TILE)
          if (at(x, y + 1) !== T.Water) g.fillRect(X, Y + TILE - 2, TILE, 2)
          // round the outside corners off
          g.fillStyle = rgb(P.floor)
          if (at(x, y - 1) !== T.Water && at(x - 1, y) !== T.Water) g.fillRect(X, Y, 3, 3)
          if (at(x, y - 1) !== T.Water && at(x + 1, y) !== T.Water) g.fillRect(X + TILE - 3, Y, 3, 3)
          if (at(x, y + 1) !== T.Water && at(x - 1, y) !== T.Water) g.fillRect(X, Y + TILE - 3, 3, 3)
          if (at(x, y + 1) !== T.Water && at(x + 1, y) !== T.Water) g.fillRect(X + TILE - 3, Y + TILE - 3, 3, 3)
        } else if (open(t) && !open(at(x, y - 1))) {
          // just below the woods: the trees' shade falls on the ground
          g.fillStyle = 'rgba(20, 50, 30, 0.22)'
          g.fillRect(X, Y, TILE, 5)
        }
      }
  }
  // outdoors: trees stand along the woods' edge above each opening (their canopies rise into the
  // woods, never over the path), and bushes soften the other edges
  if (outdoor) {
    const stamps: { img: HTMLCanvasElement; x: number; y: number }[] = []
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (open(at(x, y))) continue
        const h = hash2(x, y, 41)
        if (open(at(x, y + 1)) && (x + y) % 2 === 0) {
          const img = piece(h < 0.65 ? outdoor.tree : outdoor.tree2)
          stamps.push({ img, x: x * TILE + 8 - (img.width >> 1) + Math.round((h - 0.5) * 6), y: y * TILE + TILE + 3 - img.height })
        } else if ((open(at(x - 1, y)) || open(at(x + 1, y)) || open(at(x, y - 1))) && h < 0.7) {
          const img = piece(outdoor.bush)
          stamps.push({ img, x: x * TILE + (TILE - img.width) / 2, y: y * TILE + TILE - img.height })
        }
      }
    for (const st of stamps.sort((a, b) => a.y + a.img.height - (b.y + b.img.height))) {
      g.drawImage(st.img, st.x, st.y)
      ng.drawImage(normalMapFor(st.img), st.x, st.y)
    }
  }
  const lights: Light[] = []
  const solid: { x: number; y: number; r: number }[] = [] // trees and rocks block walking
  for (const p of [...m.props].sort((a, b) => a.y - b.y)) {
    // outdoor flowers come in the theme's several kinds, picked by where they stand
    const O = OUTDOOR[m.theme]
    const fi = p.kind === 'flower' && O ? (p.x * 7 + p.y * 3) % O.flowers.length : 0
    const key = `${m.theme}:${p.kind}:${fi}`
    let a = propCache.get(key)
    if (!a) {
      a = paintProp(m.theme, p.kind)
      if (fi && O) {
        const img = piece(O.flowers[fi])
        a = { img, ax: img.width >> 1, ay: img.height - 2 }
      }
      propCache.set(key, a)
    }
    const px = p.x * TILE + TILE / 2 - a.ax
    const py = p.y * TILE + TILE - a.ay - 1
    g.drawImage(a.img, px, py)
    ng.drawImage(normalMapFor(a.img), px, py)
    if (a.light) lights.push({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE + a.light.y, z: 18, r: a.light.r, color: a.light.color, power: 1.8 })
    if (p.kind === 'tree' || p.kind === 'tree2' || p.kind === 'rock') solid.push({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE - 3, r: p.kind === 'rock' ? 6 : OUTDOOR[m.theme] ? 8 : 5 })
  }
  // lava glows: a soft red light every few tiles of it
  if (m.theme === 'volcano')
    for (let y = 0; y < m.h; y += 2)
      for (let x = (y / 2) % 3; x < m.w; x += 3)
        if (at(x, y) === T.Water) lights.push({ x: x * TILE + 8, y: y * TILE + 8, z: 10, r: 46, color: [1, 0.42, 0.18], power: 1.1 })
  return { tiles, at, color, normal, lights, solid }
}
