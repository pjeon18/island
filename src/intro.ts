// The opening: the island starts behind a soft haze, which opens from the
// middle and drifts off to the left and right, with a few pale clouds riding
// its edges. It plays on every load (opening the app, after sailing, back from
// a visit or a dungeon). It should read as weather, not as a show: the haze is
// one pale colour dithered at its edge, the clouds (a faint distant bank and a
// few nearer ones) are low-contrast with no outline or shadow, and the whole thing is over in about two seconds. At night the
// scene passes the hour's light in, so it dims with everything else.
import { Pix, bayer, hash2, hex, rng } from './pixel'

const HOLD = 0.3 // seconds fully covered
const PART = 1.7 // seconds to clear
export const INTRO_SECONDS = HOLD + PART + 0.2
const FEATHER = 34 // px of dithered falloff at the haze's edge

interface Cloud {
  img: HTMLCanvasElement
  y: number
  side: -1 | 1
  home: number // its centre's x while the view is covered
  lag: number // a little behind the haze in time, so the edge breathes
  speed: number // distant clouds drift a little slower
}

/** One pale cloud: a few round lobes in two close tones, its rim dithered away instead of outlined. */
function paintCloud(w: number, h: number, seed: number, far = false) {
  const p = new Pix(w, h)
  const r = rng(seed)
  const lobes: { x: number; y: number; r: number }[] = []
  const n = 4 + Math.floor(r() * 2)
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1)
    lobes.push({ x: w * (0.18 + k * 0.64) + (r() - 0.5) * 8, y: h * (0.58 - Math.sin(k * Math.PI) * 0.18), r: h * (0.3 + Math.sin(k * Math.PI) * 0.18 + r() * 0.05) })
  }
  // two close tones, no shadow; distant clouds sit even closer to the haze colour
  const top = hex(far ? '#f9fbfd' : '#ffffff')
  const under = hex(far ? '#f4f7fb' : '#eef3f8')
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = Infinity
      for (const l of lobes) best = Math.min(best, Math.hypot(x - l.x, y - l.y) / l.r)
      if (best > 1 || y > h * 0.86) continue
      // the outer rim thins out in a dither instead of ending on a line
      if (best > 0.7 && bayer(x, y) > (1 - best) / 0.3) continue
      p.set(x, y, y > h * 0.6 + hash2(x, 0, seed) * 3 ? under : top)
    }
  return p.toCanvas()
}

export class Intro {
  t = 0
  private clouds: Cloud[] = []
  private layer = document.createElement('canvas')
  private mask = document.createElement('canvas')
  private haze: ImageData
  private wob: number[] = []
  private veil = hex('#f1f5fa')
  constructor(
    private W: number,
    private H: number,
  ) {
    this.haze = new ImageData(W, H)
    const r = rng(29)
    // the haze edge wanders a little down the screen so it is not a straight wipe
    for (let y = 0; y < H; y++) this.wob.push(Math.sin(y * 0.09 + 1) * 4 + Math.sin(y * 0.031 + 2) * 7)
    // a bank of small, faint clouds in the distance, then three larger near ones a side
    for (const side of [-1, 1] as const)
      for (let i = 0; i < 5; i++) {
        const w = Math.round(44 + r() * 28)
        this.clouds.push({
          img: paintCloud(w, Math.round(w * 0.44), Math.floor(r() * 1e6), true),
          y: Math.round((i + 0.1 + r() * 0.6) * (H / 5) - w * 0.22 + (side > 0 ? 10 : 0)),
          side,
          home: W / 2 + side * (10 + ((i * 0.53 + r() * 0.35) % 1) * (W / 2 - 24)),
          lag: 0.04 + r() * 0.08,
          speed: 0.8,
        })
      }
    for (const side of [-1, 1] as const)
      for (let i = 0; i < 3; i++) {
        const w = Math.round(96 + r() * 40)
        this.clouds.push({
          img: paintCloud(w, Math.round(w * 0.46), Math.floor(r() * 1e6)),
          y: Math.round((i + 0.2 + r() * 0.5) * (H / 3) - w * 0.25 + (side > 0 ? 18 : 0)),
          side,
          home: W / 2 + side * (18 + ((i * 0.37 + r() * 0.3) % 1) * (W / 2 - 40)),
          lag: r() * 0.08,
          speed: 1,
        })
      }
  }
  get done() {
    return this.t >= INTRO_SECONDS
  }
  /** 0..1, how far the view has cleared (for fading the HUD in). */
  get cleared() {
    return Math.max(0, Math.min(1, (this.t - HOLD) / PART))
  }
  update(dt: number) {
    this.t += dt
  }
  /** Ease-in-out: it starts unhurried, then drifts off and settles. */
  private ease(lag = 0) {
    const k = Math.max(0, Math.min(1, (this.t - HOLD - lag) / PART))
    return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
  }
  /** Draw over everything; `tint` (the hour's light colour) dims it at night. */
  draw(g: CanvasRenderingContext2D, tint?: string) {
    if (this.done) return
    const { W, H } = this
    const L = this.layer
    L.width = W
    L.height = H
    const lg = L.getContext('2d')!
    const e = this.ease()
    const cx = W / 2
    // half-width of the opening; below zero the view is fully covered
    const gap = -FEATHER + e * (W / 2 + FEATHER * 2 + 30)
    const fade = 1 - Math.max(0, (e - 0.7) / 0.3) // the last of it thins out instead of sliding off
    const d = this.haze.data
    const [vr, vg, vb] = this.veil
    for (let y = 0; y < H; y++) {
      const edge = gap + this.wob[y] * Math.min(1, e * 3)
      for (let x = 0; x < W; x++) {
        const a = Math.max(0, Math.min(1, (Math.abs(x - cx) - edge) / FEATHER)) * fade
        const i = (y * W + x) * 4
        const on = a > 0 && bayer(x, y) < a
        d[i] = vr
        d[i + 1] = vg
        d[i + 2] = vb
        d[i + 3] = on ? 255 : 0
      }
    }
    lg.putImageData(this.haze, 0, 0)
    // the clouds drift out to their side with the haze and thin out with it
    lg.globalAlpha = fade
    for (const c of this.clouds) {
      const ec = this.ease(c.lag)
      const x = c.home - c.img.width / 2 + c.side * ec * c.speed * (W / 2 + c.img.width * 0.6)
      lg.drawImage(c.img, Math.round(x), Math.round(c.y - ec * 4))
    }
    lg.globalAlpha = 1
    if (tint && tint !== 'rgb(255, 255, 255)') {
      // multiply by the hour's light, then cut back to the haze's shape (one mask, one cut)
      const M = this.mask
      M.width = W
      M.height = H
      M.getContext('2d')!.drawImage(L, 0, 0)
      lg.globalCompositeOperation = 'multiply'
      lg.fillStyle = tint
      lg.fillRect(0, 0, W, H)
      lg.globalCompositeOperation = 'destination-in'
      lg.drawImage(M, 0, 0)
      lg.globalCompositeOperation = 'source-over'
    }
    g.drawImage(L, 0, 0)
  }
}
