// The island's nature pieces (2026-11-18, Paul picked the look from the Island Look Study page):
// trees, bushes, tall grass, rocks, flowers and ground textures cut from Flurmimon's
// "Tileset - Nature" (DeviantArt; credit required, non-commercial) by scripts/build-nature.py.
// main.ts awaits loadNature() before the scene is built, so every painter can draw from it
// synchronously.
import { NATURE_ATLAS } from './nature-atlas'
import type { RGB } from './pixel'

let atlas: HTMLImageElement | null = null
const cache = new Map<string, HTMLCanvasElement>()

export function loadNature(): Promise<void> {
  if (atlas) return Promise.resolve()
  return new Promise((resolve) => {
    const im = new Image()
    im.onload = () => {
      atlas = im
      resolve()
    }
    // without the atlas the painters fall back to empty canvases rather than stopping the game
    im.onerror = () => resolve()
    im.src = `${import.meta.env.BASE_URL}art/nature.png`
  })
}

export type PieceName = keyof typeof NATURE_ATLAS & string

/** A piece as its own canvas (shared; copy it before drawing on it). */
export function piece(name: string): HTMLCanvasElement {
  let c = cache.get(name)
  if (c) return c
  const r = NATURE_ATLAS[name]
  c = document.createElement('canvas')
  c.width = r ? r[2] : 1
  c.height = r ? r[3] : 1
  if (r && atlas) c.getContext('2d')!.drawImage(atlas, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3])
  cache.set(name, c)
  return c
}

export function pixels(name: string): ImageData {
  const c = piece(name)
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
}

const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b

/**
 * A piece repainted in another island's colours: its distinct colours are ranked by brightness
 * and spread over `ramp` (darkest first), so Frost Isle and Ember Cove keep the shapes and
 * shading in their own palettes.
 */
export function recolor(name: string, ramp: RGB[]): HTMLCanvasElement {
  const key = `${name}|${ramp.map((c) => c.join(',')).join('|')}`
  const hit = cache.get(key)
  if (hit) return hit
  const src = pixels(name)
  const d = src.data
  const tones = new Map<number, number>()
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) tones.set((d[i] << 16) | (d[i + 1] << 8) | d[i + 2], lum(d[i], d[i + 1], d[i + 2]))
  const sorted = [...tones.entries()].sort((a, b) => a[1] - b[1])
  const lo = sorted[0]?.[1] ?? 0
  const hi = sorted[sorted.length - 1]?.[1] ?? 1
  const map = new Map<number, RGB>()
  for (const [k, l] of sorted) map.set(k, ramp[Math.min(ramp.length - 1, Math.floor(((l - lo) / Math.max(1, hi - lo)) * ramp.length))])
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const id = new ImageData(src.width, src.height)
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const c = map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])!
    id.data[i] = c[0]
    id.data[i + 1] = c[1]
    id.data[i + 2] = c[2]
    id.data[i + 3] = d[i + 3]
  }
  out.getContext('2d')!.putImageData(id, 0, 0)
  cache.set(key, out)
  return out
}

/** Draw a piece with its bottom centre on (x, y) into a 2D context. */
export function stamp(g: CanvasRenderingContext2D, name: string | HTMLCanvasElement, x: number, y: number) {
  const c = typeof name === 'string' ? piece(name) : name
  g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height + 1))
}
