// Small pixel-art helpers shared by the island painter and the ambient layer.

export type RGB = [number, number, number]

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 4×4 Bayer matrix, normalised to 0..1 thresholds. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]

/** Deterministic 2D hash → 0..1. */
export function hash2(x: number, y: number, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise, roughly 0..1. */
export function noise(x: number, y: number, seed = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const s = (t: number) => t * t * (3 - 2 * t)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  const u = s(fx)
  const v = s(fy)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A tiny RGBA pixel buffer with a few drawing primitives. */
export class Pix {
  data: Uint8ClampedArray<ArrayBuffer>
  constructor(public w: number, public h: number) {
    this.data = new Uint8ClampedArray(w * h * 4)
  }
  set(x: number, y: number, c: RGB, a = 255) {
    x |= 0
    y |= 0
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const i = (y * this.w + x) * 4
    this.data[i] = c[0]
    this.data[i + 1] = c[1]
    this.data[i + 2] = c[2]
    this.data[i + 3] = a
  }
  alpha(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0
    return this.data[(y * this.w + x) * 4 + 3]
  }
  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = this.w
    c.height = this.h
    c.getContext('2d')!.putImageData(new ImageData(this.data, this.w, this.h), 0, 0)
    return c
  }
}

/** Distance (in px, 4-connected) from each inside pixel to the outside. */
export function distanceField(mask: Uint8Array, w: number, h: number) {
  const d = new Int32Array(w * h).fill(1 << 20)
  const q: number[] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask[i]) {
        d[i] = 0
        q.push(i)
      }
    }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]
    const x = i % w
    const y = (i / w) | 0
    const nd = d[i] + 1
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (d[j] > nd) {
        d[j] = nd
        q.push(j)
      }
    }
  }
  return d
}
