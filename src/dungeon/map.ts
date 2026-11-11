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
export type PropKind = 'tree' | 'rock' | 'torch' | 'crystal'
export interface Prop {
  id: string
  kind: PropKind
  x: number
  y: number
}
export type EntityKind = 'start' | 'exit' | 'enemy' | 'boss'
export interface Entity {
  id: string
  kind: EntityKind
  x: number
  y: number
  dex?: number
  level?: number
}
export type Theme = 'cave' | 'forest' | 'ice'
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
  ice: { floor: hex('#c8d8e8'), floor2: hex('#bccee2'), floorDot: hex('#dce8f4'), top: hex('#7f97b4'), face: hex('#9ab0ca'), face2: hex('#8aa2be'), edge: hex('#4d6582'), water: hex('#2f6fae'), water2: hex('#4083c0'), grass: hex('#a9c2d8'), grassDark: hex('#8eaac4') },
}

/** One 16×16 tile, painted in the theme's colours; v varies the texture. */
export function paintTile(theme: Theme, t: T, v: number, faceBelow: boolean): HTMLCanvasElement {
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
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const t = at(x, y)
      const v = (x * 7 + y * 13) % 4
      if (open(t)) g.drawImage(art(t as T, v, false), x * TILE, y * TILE)
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
  const lights: Light[] = []
  const solid: { x: number; y: number; r: number }[] = [] // trees and rocks block walking
  for (const p of [...m.props].sort((a, b) => a.y - b.y)) {
    const key = `${m.theme}:${p.kind}`
    let a = propCache.get(key)
    if (!a) propCache.set(key, (a = paintProp(m.theme, p.kind)))
    const px = p.x * TILE + TILE / 2 - a.ax
    const py = p.y * TILE + TILE - a.ay - 1
    g.drawImage(a.img, px, py)
    ng.drawImage(normalMapFor(a.img), px, py)
    if (a.light) lights.push({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE + a.light.y, z: 18, r: a.light.r, color: a.light.color, power: 1.8 })
    if (p.kind === 'tree' || p.kind === 'rock') solid.push({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE - 3, r: p.kind === 'tree' ? 5 : 6 })
  }
  return { tiles, at, color, normal, lights, solid }
}
