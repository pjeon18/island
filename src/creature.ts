// One Pokémon living on the island. A small behaviour loop picks calm things
// to do (stand, wander, eat at the bush, lie in the sun, look up) and plays
// the matching PMD action. Speeds are slow on purpose: this is ambient.
import type { IslandLayout } from './island'
import { Species, dirFrom, drawFrame, frameAt } from './sprites'

type State = 'idle' | 'walk' | 'eat' | 'lay' | 'look' | 'nod' | 'hop' | 'sleep' | 'emerge' | 'leave' | 'gone' | 'still'

const scratch = document.createElement('canvas')
const WALK_SPEED = 13 // logical px per second
const WALK_ANIM_RATE = 0.6 // slow the step cycle to match the slow walk

export class Creature {
  x: number
  y: number
  dir = 0
  state: State = 'idle'
  t = 0 // seconds in the current state
  dur = 2 // how long the current state lasts
  tx = 0
  ty = 0
  asleep = false
  wantSleep = false
  sleepDelay = 0
  watch: Creature | null = null // turn to face this one while it arrives
  zTimer = Math.random() * 2
  zs: { x: number; y: number; t: number }[] = []
  onArrive?: () => void
  monId?: string // set for party members
  wildId?: string // set for passers-by waiting to be caught
  visitor?: string // a friend's Pokémon visiting while they study: the friend's name
  hidden = false // inside a thrown ball
  anchor?: { x: number; y: number; r: number } // helpers stay near their job; r 0 = stand still
  glowOut = false // fade the white glow away (a hatchling)
  white = 0 // 0..1, the evolution glow
  private next?: State

  constructor(public sp: Species, x: number, y: number, private island: IslandLayout, private rand: () => number) {
    this.x = x
    this.y = y
    this.dir = Math.floor(rand() * 8)
    this.enter('idle', 1 + rand() * 3)
  }

  get name() {
    return this.sp.meta.name
  }

  setSpecies(sp: Species) {
    this.sp = sp
  }

  /** Stand still facing you (evolution, being talked to). */
  hold(on: boolean) {
    if (on) {
      this.dir = 0
      this.next = undefined
      this.enter('still', 1e9)
    } else if (this.state === 'still') this.enter('idle', 1.5)
  }

  enter(s: State, dur = 2) {
    this.state = s
    this.t = 0
    this.dur = dur
  }

  /** Walk to a point, then do `then`. */
  walkTo(x: number, y: number, then: State = 'idle') {
    this.tx = x
    this.ty = y
    this.next = then
    this.enter('walk', 99)
  }

  sleep(on: boolean, delay = 0) {
    this.wantSleep = on
    this.sleepDelay = delay
  }

  private pickWander(others: Creature[]) {
    const an = this.anchor
    if (an) {
      if (an.r === 0) return null
      for (let tries = 0; tries < 20; tries++) {
        const x = an.x + (this.rand() - 0.5) * 2 * an.r
        const y = an.y + (this.rand() - 0.5) * an.r
        if (this.island.walkable(x, y) && !others.some((o) => o !== this && Math.hypot(o.x - x, o.y - y) < 10)) return { x, y }
      }
      return null
    }
    for (let tries = 0; tries < 30; tries++) {
      const a = this.rand() * Math.PI * 2
      const r = 14 + this.rand() * 40
      const x = this.x + Math.cos(a) * r
      const y = this.y + Math.sin(a) * r * 0.7
      if (!this.island.walkable(x, y)) continue
      const taken = (o: Creature) =>
        Math.hypot(o.x - x, o.y - y) < 18 || ((o.state === 'walk' || o.state === 'emerge') && Math.hypot(o.tx - x, o.ty - y) < 18)
      if (others.some((o) => o !== this && o.state !== 'gone' && taken(o))) continue
      // the straight path must stay on the island
      let ok = true
      for (let s = 1; s <= 8 && ok; s++) ok = this.island.walkable(this.x + ((x - this.x) * s) / 8, this.y + ((y - this.y) * s) / 8)
      if (ok) return { x, y }
    }
    return null
  }

  update(dt: number, others: Creature[]) {
    this.t += dt
    if (this.glowOut) {
      this.white = Math.max(0, this.white - dt / 0.9)
      if (this.white === 0) this.glowOut = false
    }
    for (const z of this.zs) z.t += dt
    this.zs = this.zs.filter((z) => z.t < 3.2)

    // falling asleep / waking up, staggered so the party doesn't move as one
    if (this.wantSleep !== this.asleep && this.state !== 'emerge' && this.state !== 'leave' && this.state !== 'gone' && this.state !== 'still') {
      this.sleepDelay -= dt
      if (this.sleepDelay <= 0) {
        this.asleep = this.wantSleep
        if (this.asleep) {
          this.dir = 0
          this.enter('lay', 1.4)
          this.next = 'sleep'
        } else {
          this.enter('look', 0.5)
          this.next = 'nod'
        }
      }
    }

    if (this.watch && this.state !== 'walk' && !this.asleep) {
      this.dir = dirFrom(this.watch.x - this.x, this.watch.y - this.y)
    }

    switch (this.state) {
      case 'walk':
      case 'emerge':
      case 'leave': {
        const dx = this.tx - this.x
        const dy = this.ty - this.y
        const d = Math.hypot(dx, dy)
        const speed = this.state === 'emerge' ? WALK_SPEED * 0.75 : WALK_SPEED
        if (d < 0.6) {
          this.x = this.tx
          this.y = this.ty
          if (this.state === 'leave') {
            this.enter('gone', 1e9)
            return
          }
          const n = this.next ?? 'idle'
          this.next = undefined
          if (n === 'hop') this.dir = 0 // say hello facing you
          if (n === 'eat') this.dir = dirFrom(this.island.bush.x - this.x, this.island.bush.y - this.y)
          this.enter(n, n === 'hop' ? this.animLen('Hop') : 2 + this.rand() * 3)
          if (this.onArrive) {
            const f = this.onArrive
            this.onArrive = undefined
            f()
          }
          return
        }
        this.dir = dirFrom(dx, dy)
        const step = Math.min(d, speed * dt)
        this.x += (dx / d) * step
        this.y += (dy / d) * step
        return
      }
      case 'sleep':
        this.zTimer -= dt
        if (this.zTimer <= 0) {
          this.zTimer = 2.6
          this.zs.push({ x: this.x + 5, y: this.y - 14, t: 0 })
        }
        return
      case 'gone':
      case 'still':
        return
    }

    if (this.t < this.dur) return

    // the current action finished
    if (this.next) {
      const n = this.next
      this.next = undefined
      this.enter(n, n === 'sleep' ? 1e9 : n === 'nod' ? this.animLen('Nod') : 2)
      return
    }
    if (this.asleep) return

    // choose the next calm thing to do
    const r = this.rand()
    const bush = this.island.bush
    if (r < 0.5) {
      const p = this.pickWander(others)
      if (p) return this.walkTo(p.x, p.y)
      return this.enter('idle', 2)
    }
    if (r < 0.62 && this.sp.anims.Eat) {
      const ex = bush.x - 12 + this.rand() * 4
      const ey = bush.y + 4
      if (Math.hypot(ex - this.x, ey - this.y) < 70 && !others.some((o) => o !== this && Math.hypot(o.x - ex, o.y - ey) < 12)) {
        this.walkTo(ex, ey, 'eat')
        return
      }
    }
    if (r < 0.74 && this.sp.anims.Laying) return this.enter('lay', 4 + this.rand() * 4)
    if (r < 0.84 && this.sp.anims.LookUp) return this.enter('look', 1.6)
    this.enter('idle', 2 + this.rand() * 4)
  }

  animLen(name: string) {
    const a = this.sp.anims[name]
    return a ? a.total / 60 : 1
  }

  /** Which PMD action to show for the current state. */
  /** The animation frame being shown (for the lighting pass's normals). */
  currentAnim() {
    return this.anim()
  }
  private anim() {
    const A = this.sp.anims
    switch (this.state) {
      case 'walk':
      case 'emerge':
      case 'leave':
        return { a: A.Walk, t: this.t * WALK_ANIM_RATE, loop: true }
      case 'eat':
        return { a: A.Eat ?? A.Idle, t: this.t, loop: true }
      case 'lay':
        return { a: A.Laying ?? A.Sleep, t: this.t, loop: true }
      case 'look':
        return { a: A.LookUp ?? A.Idle, t: this.t, loop: false }
      case 'nod':
        return { a: A.Nod ?? A.Idle, t: this.t, loop: false }
      case 'hop':
        return { a: A.Hop ?? A.Idle, t: this.t, loop: false }
      case 'sleep':
        return { a: A.Sleep, t: this.t, loop: true }
      case 'still':
        return { a: A.Idle, t: this.t, loop: true }
      default:
        return { a: A.Idle, t: this.t, loop: true }
    }
  }

  draw(g: CanvasRenderingContext2D) {
    if (this.state === 'gone' || this.hidden) return
    const { a, t, loop } = this.anim()
    // soft contact shadow, sized by the species' PMD shadow size
    const rx = [4, 6, 8][this.sp.meta.shadowSize] ?? 6
    g.fillStyle = 'rgba(30, 60, 30, 0.28)'
    g.fillRect(Math.round(this.x - rx), Math.round(this.y - 1), rx * 2, 2)
    g.fillRect(Math.round(this.x - rx + 2), Math.round(this.y - 2), rx * 2 - 4, 1)
    g.fillRect(Math.round(this.x - rx + 2), Math.round(this.y + 1), rx * 2 - 4, 1)
    const dir = this.state === 'sleep' || this.state === 'lay' ? (a.rows === 1 ? 0 : this.dir) : this.dir
    const f = frameAt(a, t, loop)
    if (this.white <= 0) {
      drawFrame(g, a, f, dir, this.x, this.y)
      return
    }
    // evolution: the sprite fills with soft white light, then the new form fades back in
    scratch.width = a.w
    scratch.height = a.h
    const sg = scratch.getContext('2d')!
    sg.clearRect(0, 0, a.w, a.h)
    drawFrame(sg, a, f, dir, a.ax, a.ay)
    sg.globalCompositeOperation = 'source-atop'
    sg.fillStyle = `rgba(255, 252, 240, ${Math.min(1, this.white)})`
    sg.fillRect(0, 0, a.w, a.h)
    sg.globalCompositeOperation = 'source-over'
    g.drawImage(scratch, Math.round(this.x - a.ax), Math.round(this.y - a.ay))
  }

  /** Sleeping z's drift up slowly and fade; drawn above everything. */
  drawZs(g: CanvasRenderingContext2D) {
    if (this.zs.length === 0) return
    for (const z of this.zs) {
      const k = z.t / 3.2
      const alpha = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75
      const x = Math.round(z.x + Math.sin(z.t * 1.4) * 1.5)
      const y = Math.round(z.y - z.t * 4)
      const s = k < 0.4 ? 3 : 4
      g.globalAlpha = Math.max(0, alpha) * 0.9
      g.fillStyle = '#ffffff'
      // a pixel "z": top bar, diagonal, bottom bar
      g.fillRect(x, y, s, 1)
      for (let i = 1; i < s - 1; i++) g.fillRect(x + s - 1 - i, y + i, 1, 1)
      g.fillRect(x, y + s - 1, s, 1)
      g.globalAlpha = 1
    }
  }
}
