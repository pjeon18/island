// The throw, drawn on the island canvas (island pixels). While you aim, a
// ring around the Pokémon breathes in and out: throw when it is small for a
// better throw. Its colour shows the odds with the chosen ball (green good,
// yellow fair, red hard). Then the ball arcs in, the Pokémon goes inside,
// the ball wobbles, and it either holds (three little stars) or pops open.
import type { Creature } from './creature'
import type { Ball } from './game'
import { H, W } from './island'

type Phase = 'aim' | 'fly' | 'enter' | 'drop' | 'shake' | 'caught' | 'free' | 'done'
export interface ThrowResult {
  caught: boolean
  shakes: number
}

const BALL_TOP: Record<Ball, string> = { 'poke-ball': '#e83838', 'great-ball': '#3878e8', 'ultra-ball': '#383838' }
const R_MIN = 6
const R_MAX = 22
const PULSE = 1.7 // seconds per breath

export class CatchAnim {
  phase: Phase = 'aim'
  private t = 0
  private aimT = 0
  private result: ThrowResult | null = null
  private shake = 0
  private bx = 0
  private by = 0
  private tilt = 0
  constructor(
    public c: Creature,
    public ball: Ball,
    /** odds for a throw of this quality, to colour the ring */
    private chance: (quality: number) => number,
    private onDone: (r: ThrowResult) => void,
  ) {}

  private get target() {
    return { x: this.c.x, y: this.c.y - 9 }
  }
  private get ring() {
    return R_MIN + (R_MAX - R_MIN) * (0.5 + 0.5 * Math.cos((this.aimT * Math.PI * 2) / PULSE))
  }
  /** 0 (ring at its widest) to 1 (ring at its smallest). */
  get quality() {
    return (R_MAX - this.ring) / (R_MAX - R_MIN)
  }

  /** Let go of the ball. The result is decided by the caller, from quality(). */
  throw(result: ThrowResult) {
    if (this.phase !== 'aim') return
    this.result = result
    this.phase = 'fly'
    this.t = 0
  }

  update(dt: number) {
    this.t += dt
    if (this.phase === 'aim') {
      this.aimT += dt
      return
    }
    const tg = this.target
    if (this.phase === 'fly') {
      const k = Math.min(1, this.t / 0.55)
      const sx = W / 2
      const sy = H + 6
      this.bx = sx + (tg.x - sx) * k
      this.by = sy + (tg.y - sy) * k - Math.sin(k * Math.PI) * 38
      if (k >= 1) this.next('enter')
    } else if (this.phase === 'enter') {
      // the Pokémon fills with light and goes into the ball
      this.c.white = Math.min(1, this.t / 0.25)
      if (this.t >= 0.3) {
        this.c.hidden = true
        this.c.white = 0
        this.next('drop')
      }
    } else if (this.phase === 'drop') {
      const k = Math.min(1, this.t / 0.3)
      this.by = tg.y + (this.c.y - 3 - tg.y) * k * k
      if (k >= 1) this.next('shake')
    } else if (this.phase === 'shake') {
      // each shake: a tip to one side and back, then a pause
      const per = 0.85
      const i = Math.floor(this.t / per)
      const f = this.t - i * per
      this.tilt = f < 0.4 ? Math.round(Math.sin((f / 0.4) * Math.PI) * (i % 2 ? -1 : 1)) : 0
      if (i >= this.result!.shakes) {
        this.tilt = 0
        this.next(this.result!.caught ? 'caught' : 'free')
      }
      this.shake = i
    } else if (this.phase === 'caught') {
      if (this.t >= 1.1) this.finish()
    } else if (this.phase === 'free') {
      // the ball pops open and the Pokémon comes back out
      if (this.t < 0.05) {
        this.c.hidden = false
        this.c.white = 1
      }
      this.c.white = Math.max(0, 1 - this.t / 0.45)
      if (this.t >= 0.5) {
        this.c.white = 0
        this.finish()
      }
    }
  }
  private next(p: Phase) {
    this.phase = p
    this.t = 0
  }
  private finish() {
    this.phase = 'done'
    this.onDone(this.result!)
  }

  draw(g: CanvasRenderingContext2D) {
    if (this.phase === 'done') return
    if (this.phase === 'aim') {
      const tg = this.target
      const q = this.quality
      const p = this.chance(q)
      const col = p >= 0.6 ? '#58d058' : p >= 0.35 ? '#f8c838' : '#f05040'
      circle(g, tg.x, tg.y, R_MAX + 1, 'rgba(255,255,255,0.55)')
      circle(g, tg.x, tg.y, this.ring, col)
      circle(g, tg.x, tg.y, this.ring - 1, col)
      return
    }
    if (this.phase === 'free' && this.t > 0.15) return
    if (this.phase === 'caught' && this.t > 0.9) g.globalAlpha = Math.max(0, 1 - (this.t - 0.9) / 0.2)
    drawBall(g, this.bx + this.tilt, this.by, this.ball, this.phase === 'fly' ? Math.floor(this.t * 14) % 2 : 0)
    if (this.phase === 'caught') {
      // three small stars that rise and fade
      for (let i = 0; i < 3; i++) {
        const k = Math.min(1, this.t / 0.8)
        const x = Math.round(this.bx - 6 + i * 6)
        const y = Math.round(this.by - 6 - k * 6 - (i === 1 ? 2 : 0))
        g.globalAlpha = Math.max(0, 1 - k) * (this.t > 0.9 ? 0 : 1)
        g.fillStyle = '#fff4b0'
        g.fillRect(x, y - 1, 1, 3)
        g.fillRect(x - 1, y, 3, 1)
      }
    }
    g.globalAlpha = 1
  }
}

/** A 5×5 ball: the top in the ball's colour, a dark band, a white base. */
function drawBall(g: CanvasRenderingContext2D, cx: number, cy: number, ball: Ball, spin: number) {
  const x = Math.round(cx) - 2
  const y = Math.round(cy) - 2
  const top = BALL_TOP[ball]
  const px = (dx: number, dy: number, c: string) => {
    g.fillStyle = c
    g.fillRect(x + dx, y + dy, 1, 1)
  }
  const rows = spin ? ['.aaa.', 'awwwa', 'kkwkk', 'attta', '.aaa.'] : ['.aaa.', 'attta', 'kkwkk', 'awwwa', '.aaa.']
  rows.forEach((r, dy) =>
    [...r].forEach((ch, dx) => {
      if (ch === 'a') px(dx, dy, '#282828')
      else if (ch === 't') px(dx, dy, top)
      else if (ch === 'w') px(dx, dy, '#f8f8f8')
      else if (ch === 'k') px(dx, dy, '#282828')
    }),
  )
  if (ball === 'ultra-ball' && !spin) {
    px(1, 1, '#f8d040')
    px(3, 1, '#f8d040')
  }
  if (ball === 'great-ball' && !spin) {
    px(1, 1, '#e83838')
    px(3, 1, '#e83838')
  }
}

/** A one-pixel circle outline, plotted so it stays crisp. */
function circle(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  g.fillStyle = color
  const n = Math.max(16, Math.round(r * 7))
  const seen = new Set<number>()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.round(cx + Math.cos(a) * r)
    const y = Math.round(cy + Math.sin(a) * r)
    const k = x * 1000 + y
    if (seen.has(k)) continue
    seen.add(k)
    g.fillRect(x, y, 1, 1)
  }
}
