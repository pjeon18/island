// The living island: static base + y-sorted props and Pokémon + calm ambient
// layers (water glints, lapping foam, swaying tall grass, day/night light).
import { Creature } from './creature'
import { H, IslandLayout, PAL, W, buildIsland, paintBush, paintLantern, paintTree } from './island'
import { hash2, rng } from './pixel'
import { DecorArt, SLOTS, decorArt } from './decor'
import type { Species } from './sprites'

interface Tuft {
  x: number
  y: number
  phase: number
  blades: { dx: number; h: number; tone: number }[]
}
interface Glint {
  x: number
  y: number
  len: number
  t: number
  life: number
}

// Day/night light, by hour. Multiplied over the whole scene, so it shifts
// slowly with the real clock instead of switching.
const LIGHT: [number, string][] = [
  [0, '#5f69a8'],
  [4.5, '#5f69a8'],
  [6, '#c7a2bb'],
  [7.5, '#ffe7d2'],
  [9, '#ffffff'],
  [16, '#ffffff'],
  [17.5, '#ffe3bf'],
  [19, '#eaa284'],
  [20.5, '#7d7db6'],
  [24, '#5f69a8'],
]

function lerpHex(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k)
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
}

export function lightAt(hour: number) {
  const h = ((hour % 24) + 24) % 24
  for (let i = 0; i < LIGHT.length - 1; i++) {
    const [h0, c0] = LIGHT[i]
    const [h1, c1] = LIGHT[i + 1]
    if (h >= h0 && h <= h1) {
      const k = h1 === h0 ? 0 : (h - h0) / (h1 - h0)
      const e = k * k * (3 - 2 * k)
      return lerpHex(c0, c1, e)
    }
  }
  return LIGHT[0][1]
}

/** 0 by day, 1 at night, eased through dusk and dawn. */
export function nightness(hour: number) {
  const h = ((hour % 24) + 24) % 24
  const s = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return k * k * (3 - 2 * k)
  }
  return Math.max(1 - s(5.5, 7.5, h), s(18, 20.5, h))
}

export class Scene {
  island: IslandLayout
  creatures: Creature[] = []
  time = 0
  hour = 10
  /** desktop-pet mode: no open sea, transparent around the island */
  float = false
  private mask = document.createElement('canvas')
  private tree = paintTree()
  private bush = paintBush()
  private lantern = paintLantern()
  private tufts: Tuft[] = []
  private glints: Glint[] = []
  private rustle = 0
  private rand = rng(7)
  private seaPts: { x: number; y: number }[] = []
  private decor: { x: number; y: number; art: DecorArt }[] = []

  constructor() {
    this.island = buildIsland()
    const gp = this.island.grassPatch
    // tall grass: tufts on a staggered grid inside an ellipse, like route grass
    let row = 0
    for (let y = gp.y - gp.r * 0.62; y <= gp.y + gp.r * 0.62; y += 4, row++) {
      for (let x = gp.x - gp.r - 2 + (row % 2) * 3.5; x <= gp.x + gp.r + 2; x += 7) {
        const dx = (x - gp.x) / (gp.r + 1)
        const dy = (y - gp.y) / (gp.r * 0.62 + 1)
        if (dx * dx + dy * dy > 1) continue
        const i = this.tufts.length
        const blades = [
          { dx: 0, h: 8 + Math.floor(hash2(i, 0, 5) * 2), tone: 0 },
          { dx: -3, h: 6 + Math.floor(hash2(i, 1, 5) * 2), tone: 1 },
          { dx: 3, h: 6 + Math.floor(hash2(i, 2, 5) * 2), tone: 1 },
        ]
        this.tufts.push({ x: Math.round(x), y: Math.round(y), phase: hash2(i, 3, 90) * 6.28, blades })
      }
    }
    // open sea positions for water glints
    const fp = this.island.footprint
    for (let y = 2; y < H - 2; y++)
      for (let x = 2; x < W - 6; x++) {
        let near = false
        for (let k = -6; k <= 6 && !near; k += 3) for (let j = -6; j <= 9 && !near; j += 3) near = !!fp[(Math.min(H - 1, Math.max(0, y + k))) * W + Math.min(W - 1, Math.max(0, x + j))]
        if (!near) this.seaPts.push({ x, y })
      }
    for (let i = 0; i < 22; i++) this.spawnGlint(true)
  }

  private spawnGlint(randomAge = false) {
    const p = this.seaPts[Math.floor(this.rand() * this.seaPts.length)]
    const life = 3.5 + this.rand() * 3
    this.glints.push({ x: p.x, y: p.y, len: 2 + Math.floor(this.rand() * 3), t: randomAge ? this.rand() * life : 0, life })
  }

  add(sp: Species, x: number, y: number) {
    const c = new Creature(sp, x, y, this.island, this.rand)
    this.creatures.push(c)
    return c
  }

  /** Place decorations by slot; also keeps their footprints clear of wandering Pokémon. */
  setDecor(slots: Record<string, string | null>) {
    this.decor = []
    this.island.blockers.length = 0
    for (const sl of SLOTS) {
      const id = slots[sl.id]
      const art = id ? decorArt(id) : undefined
      if (!art) continue
      this.decor.push({ x: sl.x, y: sl.y, art })
      this.island.blockers.push({ x: sl.x, y: sl.y, r: art.r })
    }
  }

  remove(c: Creature) {
    this.creatures = this.creatures.filter((x) => x !== c)
  }

  byMon(id: string) {
    return this.creatures.find((c) => c.monId === id && c.state !== 'gone' && c.state !== 'leave')
  }

  /** A free walkable spot, away from everyone else. */
  freeSpot(near?: { x: number; y: number }) {
    for (let i = 0; i < 200; i++) {
      const x = near ? near.x + (this.rand() - 0.5) * 70 : 60 + this.rand() * 130
      const y = near ? near.y + (this.rand() - 0.5) * 40 : 62 + this.rand() * 60
      if (!this.island.walkable(x, y)) continue
      if (this.creatures.some((c) => Math.hypot(c.x - x, c.y - y) < 20)) continue
      return { x, y }
    }
    return { x: 120, y: 92 }
  }

  /** Where the dock meets the island: the way on and off. */
  get dockTop() {
    const d = this.island.dock
    return { x: d.x + d.w / 2, y: d.y0 + 1 }
  }

  rustleGrass(seconds: number) {
    this.rustle = Math.max(this.rustle, seconds)
  }

  update(dt: number) {
    this.time += dt
    this.rustle = Math.max(0, this.rustle - dt)
    for (const c of this.creatures) c.update(dt, this.creatures)
    this.creatures = this.creatures.filter((c) => c.state !== 'gone')
    for (const gl of this.glints) gl.t += dt
    const before = this.glints.length
    this.glints = this.glints.filter((gl) => gl.t < gl.life)
    for (let i = this.glints.length; i < before; i++) this.spawnGlint()
  }

  render(g: CanvasRenderingContext2D, dt: number) {
    const night = nightness(this.hour)
    g.imageSmoothingEnabled = false
    g.globalCompositeOperation = 'source-over'
    if (this.float) {
      g.clearRect(0, 0, W, H)
      g.drawImage(this.island.floatBase, 0, 0)
      this.drawWater(g, night, true)
    } else {
      g.drawImage(this.island.base, 0, 0)
      this.drawWater(g, night)
    }

    // y-sorted world: props, tufts, Pokémon
    type Item = { y: number; draw: () => void }
    const items: Item[] = []
    const { tree, bush, lantern } = this.island
    items.push({ y: tree.y, draw: () => g.drawImage(this.tree.img, tree.x - this.tree.ax, tree.y - this.tree.ay) })
    items.push({ y: bush.y, draw: () => g.drawImage(this.bush.img, bush.x - this.bush.ax, bush.y - this.bush.ay) })
    items.push({ y: lantern.y, draw: () => g.drawImage(this.lantern.img, lantern.x - this.lantern.ax, lantern.y - this.lantern.ay) })
    for (const tf of this.tufts) items.push({ y: tf.y, draw: () => this.drawTuft(g, tf) })
    for (const d of this.decor) {
      // flat ground pieces (no footprint) sit under everything
      items.push({
        y: d.art.r ? d.y : -1,
        draw: () => {
          g.drawImage(d.art.img, d.x - d.art.ax, d.y - d.art.ay)
          // moving parts that are not light (windmill sails) take the day/night grade
          if (!d.art.glow) d.art.live?.(g, d.x, d.y, this.time, nightness(this.hour))
        },
      })
    }
    for (const c of this.creatures) items.push({ y: c.y, draw: () => c.draw(g) })
    items.sort((a, b) => a.y - b.y)
    for (const it of items) it.draw()

    // light: multiply the whole scene by the hour's colour
    if (this.float) {
      // multiply would paint the transparent desktop too, so keep a copy of the
      // scene's alpha and cut the tint back to it
      this.mask.width = W
      this.mask.height = H
      const mg = this.mask.getContext('2d')!
      mg.clearRect(0, 0, W, H)
      mg.drawImage(g.canvas, 0, 0)
    }
    g.globalCompositeOperation = 'multiply'
    g.fillStyle = lightAt(this.hour)
    g.fillRect(0, 0, W, H)
    if (this.float) {
      g.globalCompositeOperation = 'destination-in'
      g.drawImage(this.mask, 0, 0)
    }
    g.globalCompositeOperation = 'source-over'

    // the lantern at dusk and night: feathered warm light that breathes slowly
    if (night > 0.02) {
      const fx = lantern.x - this.lantern.ax + this.lantern.flame.x
      const fy = lantern.y - this.lantern.ay + this.lantern.flame.y
      const breath = 0.85 + 0.15 * Math.sin((this.time * Math.PI * 2) / 9)
      g.globalCompositeOperation = 'lighter'
      const r = 30
      const grad = g.createRadialGradient(fx, fy, 0, fx, fy, r)
      grad.addColorStop(0, `rgba(255, 190, 110, ${0.34 * night * breath})`)
      grad.addColorStop(0.35, `rgba(255, 160, 80, ${0.12 * night * breath})`)
      grad.addColorStop(1, 'rgba(255, 140, 60, 0)')
      g.fillStyle = grad
      g.fillRect(fx - r, fy - r, r * 2, r * 2)
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = night
      g.fillStyle = '#fff1c4'
      g.fillRect(fx - 1, fy - 1, 3, 4)
      g.fillStyle = '#ffffff'
      g.fillRect(fx, fy, 1, 1)
      g.globalAlpha = 1
    }

    // evolution: a soft halo that rises and settles with the sprite's glow
    for (const c of this.creatures) {
      if (c.white <= 0) continue
      const cx = c.x
      const cy = c.y - 10
      const r = 26
      g.globalCompositeOperation = 'lighter'
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, `rgba(255, 246, 220, ${0.42 * c.white})`)
      grad.addColorStop(0.45, `rgba(255, 236, 200, ${0.16 * c.white})`)
      grad.addColorStop(1, 'rgba(255, 230, 190, 0)')
      g.fillStyle = grad
      g.fillRect(cx - r, cy - r, r * 2, r * 2)
      g.globalCompositeOperation = 'source-over'
    }
    // decorations that glow or move: feathered light first, then their live pixels
    for (const d of this.decor) {
      const gl = d.art.glow
      if (gl && night > 0.02) {
        const cx = d.x + gl.x
        const cy = d.y + gl.y
        const breath = 0.88 + 0.12 * Math.sin((this.time * Math.PI * 2) / 9 + d.x)
        g.globalCompositeOperation = 'lighter'
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, gl.r)
        grad.addColorStop(0, `rgba(${gl.rgb}, ${0.3 * night * breath})`)
        grad.addColorStop(0.4, `rgba(${gl.rgb}, ${0.1 * night * breath})`)
        grad.addColorStop(1, `rgba(${gl.rgb}, 0)`)
        g.fillStyle = grad
        g.fillRect(cx - gl.r, cy - gl.r, gl.r * 2, gl.r * 2)
        g.globalCompositeOperation = 'source-over'
      }
      if (gl) d.art.live?.(g, d.x, d.y, this.time, night)
    }
    for (const c of this.creatures) c.drawZs(g)
  }

  private drawWater(g: CanvasRenderingContext2D, night: number, lagoonOnly = false) {
    // glints: short light dashes that drift and fade in and out
    for (const gl of lagoonOnly ? [] : this.glints) {
      const k = gl.t / gl.life
      const a = Math.sin(k * Math.PI) ** 2
      g.globalAlpha = a * (0.75 - night * 0.35)
      g.fillStyle = k < 0.5 ? '#bfe6f5' : '#e6f6fb'
      g.fillRect(Math.round(gl.x + gl.t * 1.2), gl.y, gl.len, 1)
    }
    // shoreline foam: each pixel breathes on a slow wave that travels round the island
    const T = this.time
    g.fillStyle = '#e6f6fb'
    for (const p of this.island.shoreline) {
      const v = Math.sin(T * 0.9 - p.x * 0.08 - p.y * 0.05)
      const a = 0.35 + 0.45 * (v * 0.5 + 0.5)
      g.globalAlpha = a
      g.fillRect(p.x, p.y, 1, 1)
    }
    // a second, fainter lap one pixel further out on the wave's crest
    for (const p of this.island.shoreline) {
      const v = Math.sin(T * 0.9 - p.x * 0.08 - p.y * 0.05 - 1.2)
      if (v < 0.55) continue
      const dx = p.x < 120 ? -1 : 1
      const dy = p.y < 90 ? -1 : 1
      const ox = Math.abs(p.x - 120) / 76 > Math.abs(p.y - 90) / 42 ? dx : 0
      const oy = ox === 0 ? dy : 0
      g.globalAlpha = (v - 0.55) * 1.1
      g.fillRect(p.x + ox * 2, p.y + oy * 2, 1, 1)
    }
    g.globalAlpha = 1
  }

  private drawTuft(g: CanvasRenderingContext2D, tf: Tuft) {
    const r = this.rustle > 0 ? Math.min(1, this.rustle / 0.6) : 0
    const calm = Math.sin(this.time * 0.8 + tf.phase) * 0.8
    const shake = r * Math.sin(this.time * 20 + tf.phase * 3) * 1.8
    const lean = calm + shake
    const OUT = '#24602c'
    const DARK = '#3b8735'
    const MID = '#4fa13f'
    const LIGHT = '#8ad35c'
    const px = (x: number, y: number, c: string) => {
      g.fillStyle = c
      g.fillRect(x, y, 1, 1)
    }
    // back blade first, then the two front ones
    for (const b of tf.blades) {
      const cx = tf.x + b.dx
      for (let i = 0; i < b.h; i++) {
        // i = 0 is the tip; blades are 1 px wide for the top three rows, then 3
        const k = 1 - i / b.h
        const off = Math.round(lean * k * k)
        const y = tf.y - b.h + 1 + i
        const half = i < 3 ? 0 : 1
        const x0 = cx - half + off
        const x1 = cx + half + off
        if (i === 0) px(cx + off, y - 1, OUT)
        px(x0 - 1, y, OUT)
        px(x1 + 1, y, OUT)
        for (let x = x0; x <= x1; x++) px(x, y, x === x0 && i < b.h - 2 ? LIGHT : b.tone ? DARK : MID)
      }
    }
    g.fillStyle = OUT
    g.fillRect(tf.x - 5, tf.y + 1, 11, 1)
  }
}
