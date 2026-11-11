// The opening: the island starts hidden under a bank of pixel clouds, which
// hang for a moment and then part to the left and right to reveal it. It
// plays on every load (opening the app, after sailing, back from a visit or
// a dungeon). Clouds are drawn before the light pass, so at night they are
// dim, not glowing. Timing follows Paul's motion notes: a short hold, then an
// unhurried ease-out, no flashes.
import { Pix, bayer, hash2, hex, rng } from './pixel'

const HOLD = 0.35 // seconds fully covered
const PART = 2.1 // seconds to clear
export const INTRO_SECONDS = HOLD + PART + 0.3

interface Cloud {
  img: HTMLCanvasElement
  x: number
  y: number
  dir: -1 | 1
  delay: number
  travel: number
  back: boolean
}

/** One puffy cloud: overlapping round lobes, lit from the top left. */
function paintCloud(w: number, h: number, seed: number, back = false) {
  const p = new Pix(w, h)
  const r = rng(seed)
  const lobes: { x: number; y: number; r: number }[] = []
  const n = 5 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1)
    lobes.push({ x: w * (0.14 + k * 0.72) + (r() - 0.5) * 6, y: h * (0.55 - Math.sin(k * Math.PI) * 0.22) + (r() - 0.5) * 4, r: h * (0.26 + Math.sin(k * Math.PI) * 0.2 + r() * 0.06) })
  }
  const hi = hex(back ? '#eef3f9' : '#ffffff')
  const mid = hex(back ? '#dde6f1' : '#eef3fa')
  const shade = hex(back ? '#c4d1e3' : '#d3deec')
  const deep = hex(back ? '#a7b8d0' : '#b4c4da')
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // inside if within any lobe; how far "up-left" decides the shade
      let best = Infinity
      let lit = 0
      for (const l of lobes) {
        const d = Math.hypot(x - l.x, y - l.y) / l.r
        if (d < best) {
          best = d
          lit = ((l.x - x) * 0.6 + (l.y - y)) / l.r
        }
      }
      if (best > 1 || y > h * 0.82 + hash2(x, 0, seed) * 2) continue
      const edge = best > 0.86
      const v = lit + (bayer(x, y) - 0.5) * 0.25
      p.set(x, y, edge && lit < 0 ? deep : v > 0.35 ? hi : v > -0.15 ? mid : y > h * 0.62 ? deep : shade)
    }
  return p.toCanvas()
}

export class Intro {
  t = 0
  private clouds: Cloud[] = []
  private layer = document.createElement('canvas')
  private mask = document.createElement('canvas')
  constructor(
    private W: number,
    private H: number,
  ) {
    const r = rng(29)
    // two layers of uneven puffs: a greyer back layer that drifts slower, a bright front layer
    for (const front of [false, true]) {
      let y = -26 + r() * 8
      while (y < H) {
        let x = -50 - r() * 30
        const rowH = front ? 34 + r() * 12 : 28 + r() * 10
        while (x < W + 10) {
          const w = Math.round((front ? 92 : 80) + r() * 60)
          const h = Math.round(w * (0.42 + r() * 0.12))
          const cy = y + (r() - 0.5) * 14
          const centre = x + w / 2
          const dir: -1 | 1 = centre < W / 2 ? -1 : 1
          const fromMid = Math.abs(centre - W / 2) / (W / 2)
          this.clouds.push({
            img: paintCloud(w, h, Math.floor(r() * 1e6), !front),
            x,
            y: cy,
            dir,
            delay: fromMid * 0.22 + r() * 0.1 + (front ? 0 : 0.08),
            travel: (W * 0.62 + w) * (front ? 1 : 0.85),
            back: !front,
          })
          x += w * (0.48 + r() * 0.22)
        }
        y += rowH
      }
    }
    // back layer first, then by depth
    this.clouds.sort((a, b) => Number(b.back) - Number(a.back) || a.y - b.y)
  }
  get done() {
    return this.t >= INTRO_SECONDS
  }
  /** 0..1, how far the clouds have cleared (for fading the HUD in). */
  get cleared() {
    return Math.max(0, Math.min(1, (this.t - HOLD) / PART))
  }
  update(dt: number) {
    this.t += dt
  }
  /** Draw over everything; `tint` (the hour's light colour) dims the clouds at night. */
  draw(g: CanvasRenderingContext2D, tint?: string) {
    if (this.done) return
    const L = this.layer
    L.width = this.W
    L.height = this.H
    const lg = L.getContext('2d')!
    const place = (c: Cloud) => {
      const k = Math.max(0, Math.min(1, (this.t - HOLD - c.delay) / (PART - 0.35)))
      // ease-in-out: they lean away first, then sweep out and slow
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      return { x: Math.round(c.x + c.dir * e * c.travel), y: Math.round(c.y - e * 5) }
    }
    for (const c of this.clouds) {
      const p = place(c)
      lg.drawImage(c.img, p.x, p.y)
    }
    if (tint && tint !== 'rgb(255, 255, 255)') {
      // multiply by the hour's light, then cut back to the clouds' shape (one mask, one cut)
      const M = this.mask
      M.width = this.W
      M.height = this.H
      M.getContext('2d')!.drawImage(L, 0, 0)
      lg.globalCompositeOperation = 'multiply'
      lg.fillStyle = tint
      lg.fillRect(0, 0, this.W, this.H)
      lg.globalCompositeOperation = 'destination-in'
      lg.drawImage(M, 0, 0)
      lg.globalCompositeOperation = 'source-over'
    }
    g.drawImage(L, 0, 0)
  }
}
