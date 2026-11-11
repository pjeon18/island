// Habitats (stage 2): built once on their own spot with Star Pieces. Each one
// changes who comes (game.ts HABITATS) and is painted here in the island's
// palette. The tall grass habitat reuses the island's tuft drawing in scene.ts.
import type { Habitat } from './game'
import { PAL } from './island'
import { Pix, bayer, hash2, hex } from './pixel'

/** Fixed spots, chosen from the island map so they clear the props and decoration slots. */
export const HABITAT_SPOTS: Record<Habitat, { x: number; y: number; r: number }> = {
  pond: { x: 118, y: 84, r: 13 },
  rocks: { x: 64, y: 76, r: 9 },
  grass: { x: 146, y: 92, r: 9 },
}

export interface HabitatArt {
  img: HTMLCanvasElement
  ax: number
  ay: number
  flat: boolean // drawn under everything (the pond), or y-sorted (the rocks)
  live?: (g: CanvasRenderingContext2D, x: number, y: number, t: number) => void
}

/** An oval pond: a stony rim, shallow edges, deeper middle, one lily pad. */
function pond(): HabitatArt {
  const rx = 13
  const ry = 6.5
  const p = new Pix(30, 16)
  const cx = 15
  const cy = 8
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 30; x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
      if (d > 1) continue
      let c = d > 0.86 ? (bayer(x, y) > 0.5 ? PAL.stone : PAL.stoneLight) : d > 0.7 ? PAL.shallow2 : d > 0.45 ? PAL.shallow : PAL.sea
      // the far (north) inside edge sits in shadow, which reads as depth
      if (d <= 0.86 && d > 0.6 && y < cy - 1) c = PAL.sea
      if (d > 0.86 && y > cy && hash2(x, y, 5) < 0.35) c = PAL.stoneDark
      p.set(x, y, c)
    }
  // lily pad with a notch
  const leaf = hex('#3f9a45')
  for (const [x, y] of [[7, 9], [8, 9], [9, 9], [7, 10], [8, 10], [9, 10], [10, 10]] as [number, number][]) p.set(x, y, leaf)
  p.set(8, 9, PAL.shallow)
  p.set(9, 10, hex('#5dbb5a'))
  return {
    img: p.toCanvas(),
    ax: cx,
    ay: cy,
    flat: true,
    // a slow glint that drifts across the water
    live: (g, x, y, t) => {
      const k = (t / 6) % 1
      const a = Math.sin(k * Math.PI)
      g.globalAlpha = a * 0.8
      g.fillStyle = '#ffffff'
      g.fillRect(Math.round(x - 6 + k * 10), Math.round(y - 1), 3, 1)
      g.globalAlpha = 1
    },
  }
}

/** Three boulders with a dark outline taken from the stone itself. */
function rocks(): HabitatArt {
  const p = new Pix(24, 16)
  const boulder = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        const dx = (x - cx) / (r + 1)
        const dy = (y - cy) / r
        const d = dx * dx + dy * dy
        if (d > 1 || x < 0 || y < 0 || x >= 24 || y >= 16) continue
        let c = PAL.stone
        if (dy < -0.3 && dx < 0.4) c = PAL.stoneLight
        if (dy > 0.45 || dx > 0.65) c = PAL.stoneDark
        if (d > 0.82) c = hex('#5e5c58')
        p.set(x, y, c)
      }
  }
  boulder(8, 10, 5)
  boulder(16, 11, 4)
  boulder(13, 5, 3)
  // a tuft of grass between them
  const g1 = PAL.grassDark
  p.set(20, 14, g1)
  p.set(21, 13, g1)
  p.set(3, 14, g1)
  return { img: p.toCanvas(), ax: 12, ay: 14, flat: false }
}

const cache: Partial<Record<Habitat, HabitatArt>> = {}
export function habitatArt(id: Habitat): HabitatArt | null {
  if (id === 'grass') return null // tufts, drawn by the scene
  return (cache[id] ??= id === 'pond' ? pond() : rocks())
}

const BAIT_COLORS: Record<string, string> = { honey: '#f8c030', 'cheri-berry': '#e83838', 'pecha-berry': '#f8a0c0', 'chesto-berry': '#5a5ab8' }
/** The dish of food you set out, as a tiny flat sprite. */
export function baitArt(food: string) {
  const p = new Pix(9, 5)
  const rim = PAL.stoneLight
  const dark = PAL.stoneDark
  for (let x = 1; x < 8; x++) {
    p.set(x, 3, rim)
    p.set(x, 4, dark)
  }
  p.set(0, 3, dark)
  p.set(8, 3, dark)
  const c = hex(BAIT_COLORS[food] ?? '#e83838')
  for (const [x, y] of [[3, 2], [4, 2], [5, 2], [4, 1], [3, 3], [4, 3], [5, 3]] as [number, number][]) p.set(x, y, c)
  p.set(4, 1, hex('#ffffff'))
  return p.toCanvas()
}
