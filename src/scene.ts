// The living island: static base + y-sorted props and Pokémon + calm ambient
// layers (water glints, lapping foam, swaying tall grass, day/night light).
import { Creature } from './creature'
import { H, IslandLayout, PAL, W, buildIsland, paintBush, paintLantern, paintTree } from './island'
import { hash2, rng } from './pixel'
import { DecorArt, SLOTS, decorArt } from './decor'
import type { Species } from './sprites'
import type { FindKind, Habitat, Weather } from './game'
import { HABITAT_SPOTS, HabitatArt, baitArt, habitatArt } from './habitats'

// Finds: tiny pixel items a party Pokémon dug up, drawn from these rows.
// '.' is clear; other letters index the palette below.
const FIND_ART: Record<FindKind, { rows: string[]; pal: Record<string, string> }> = {
  shells: { rows: ['..ab.', '.abba', 'abbcb', '.ccc.'], pal: { a: '#a86c58', b: '#f8e4d0', c: '#d8a088' } },
  berry: { rows: ['..g..', '.aba.', 'abbba', '.aaa.'], pal: { g: '#48a848', a: '#2858b8', b: '#5898f0' } },
  'poke-ball': { rows: ['.ara.', 'arrra', 'kkwkk', 'awwwa', '.aaa.'], pal: { a: '#383838', r: '#e83838', k: '#282828', w: '#f8f8f8' } },
  'star-piece': { rows: ['..o..', '.oyo.', 'oywyo', '.oyo.', '..o..'], pal: { o: '#c07818', y: '#f8d040', w: '#fff8c8' } },
}
function paintFind(kind: FindKind) {
  const { rows, pal } = FIND_ART[kind]
  const c = document.createElement('canvas')
  c.width = rows[0].length
  c.height = rows.length
  const g = c.getContext('2d')!
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return
    g.fillStyle = pal[ch]
    g.fillRect(x, y, 1, 1)
  }))
  return c
}
const FIND_IMG = Object.fromEntries((Object.keys(FIND_ART) as FindKind[]).map((k) => [k, paintFind(k)])) as Record<FindKind, HTMLCanvasElement>
interface Drop {
  x: number
  y: number
  vy: number
  life: number
}

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
  finds: { id: string; kind: FindKind; x: number; y: number }[] = []
  weather: Weather = 'clear'
  private wk = 0 // how far the current weather has rolled in, 0..1
  private shown: Weather = 'clear'
  private drops: Drop[] = []
  /** Show a small "!" over Pokémon waiting to be caught (only in the break). */
  markWild = false
  private habitats: { id: Habitat; x: number; y: number; art: HabitatArt | null }[] = []
  private decorBlockers: { x: number; y: number; r: number }[] = []
  private bait: { img: HTMLCanvasElement; x: number; y: number } | null = null
  /** Drawn last, above everything: the catch ring and the thrown ball. */
  overlay?: (g: CanvasRenderingContext2D) => void

  constructor() {
    this.island = buildIsland()
    this.addTufts(this.island.grassPatch)
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

  /** Tall grass: tufts on a staggered grid inside an ellipse, like route grass. */
  private addTufts(gp: { x: number; y: number; r: number }) {
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
    this.decorBlockers = []
    for (const sl of SLOTS) {
      const id = slots[sl.id]
      const art = id ? decorArt(id) : undefined
      if (!art) continue
      this.decor.push({ x: sl.x, y: sl.y, art })
      this.decorBlockers.push({ x: sl.x, y: sl.y, r: art.r })
    }
    this.rebuildBlockers()
  }
  /** Built habitats: the pond and rocks are art, the tall grass is more tufts. */
  setHabitats(ids: Habitat[]) {
    for (const id of ids) {
      if (this.habitats.some((h) => h.id === id)) continue
      const spot = HABITAT_SPOTS[id]
      this.habitats.push({ id, x: spot.x, y: spot.y, art: habitatArt(id) })
      if (id === 'grass') this.addTufts(spot)
    }
    this.rebuildBlockers()
  }
  hasHabitat(id: Habitat) {
    return this.habitats.some((h) => h.id === id)
  }
  setBait(food: string | null) {
    this.bait = food ? { img: baitArt(food), x: 112, y: 106 } : null
  }
  private rebuildBlockers() {
    const b = this.island.blockers
    b.length = 0
    b.push(...this.decorBlockers)
    for (const h of this.habitats) {
      const spot = HABITAT_SPOTS[h.id]
      if (h.id === 'pond') {
        // an oval: a row of circles across it
        for (const dx of [-8, 0, 8]) b.push({ x: spot.x + dx, y: spot.y, r: 5 })
      } else b.push({ x: spot.x, y: spot.y, r: spot.r - 2 })
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
    // weather rolls in and out slowly (about 4 s), never switches
    if (this.weather !== this.shown) {
      this.wk = Math.max(0, this.wk - dt / 4)
      if (this.wk === 0) this.shown = this.weather
    } else this.wk = Math.min(1, this.wk + dt / 4)
    if (this.shown === 'rain' && this.wk > 0) {
      while (this.drops.length < 130 * this.wk) this.drops.push({ x: this.rand() * (W + 40), y: -this.rand() * H, vy: 70 + this.rand() * 30, life: 0 })
    }
    for (const d of this.drops) {
      d.y += d.vy * dt
      d.x -= d.vy * 0.25 * dt
    }
    // when the rain eases off, the drops already falling finish their fall
    this.drops = this.drops.filter((d) => d.y < H + 4)
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
    for (const h of this.habitats) {
      const art = h.art
      if (!art) continue
      items.push({
        y: art.flat ? -2 : h.y,
        draw: () => {
          g.drawImage(art.img, h.x - art.ax, h.y - art.ay)
          art.live?.(g, h.x, h.y, this.time)
        },
      })
    }
    if (this.bait) {
      const bt = this.bait
      items.push({ y: -1, draw: () => g.drawImage(bt.img, bt.x - 4, bt.y - 4) })
    }
    for (const f of this.finds) {
      const img = FIND_IMG[f.kind]
      items.push({ y: f.y, draw: () => g.drawImage(img, Math.round(f.x - img.width / 2), Math.round(f.y - img.height)) })
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
    this.drawWeather(g)
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

    // finds twinkle now and then: one soft pixel that fades in and out
    for (const f of this.finds) {
      const k = ((this.time + hash2(Math.round(f.x), Math.round(f.y), 3) * 5) % 5) / 5
      if (k > 0.14) continue
      g.globalAlpha = Math.sin((k / 0.14) * Math.PI)
      g.fillStyle = '#ffffff'
      g.fillRect(Math.round(f.x) + 1, Math.round(f.y) - 6, 1, 1)
      g.fillRect(Math.round(f.x), Math.round(f.y) - 7, 3, 1)
      g.fillRect(Math.round(f.x) + 1, Math.round(f.y) - 8, 1, 3)
      g.globalAlpha = 1
    }
    // a small "!" over each Pokémon waiting to be caught
    if (this.markWild)
      for (const c of this.creatures) {
        if (!c.wildId || c.hidden || c.state === 'leave' || c.state === 'gone') continue
        const bob = Math.round(Math.sin(this.time * 2.2 + c.x) * 0.8)
        const x = Math.round(c.x) - 3
        const y = Math.round(c.y - Math.min(c.sp.anims.Idle.ay, 28)) - 7 + bob
        g.fillStyle = '#2c4c70'
        g.fillRect(x, y, 7, 8)
        g.fillStyle = '#f8f8f8'
        g.fillRect(x + 1, y + 1, 5, 6)
        g.fillStyle = '#2c4c70'
        g.fillRect(x + 3, y + 8, 1, 1)
        g.fillStyle = '#e03838'
        g.fillRect(x + 3, y + 2, 1, 3)
        g.fillRect(x + 3, y + 6, 1, 1)
      }
    this.overlay?.(g)
  }

  /** Rain, fog or a sunny spell, faded in by wk. Calm: no flashes, no lightning. */
  private drawWeather(g: CanvasRenderingContext2D) {
    const k = this.wk
    if (k <= 0 || this.shown === 'clear') return
    if (this.shown === 'rain') {
      g.globalCompositeOperation = 'multiply'
      g.fillStyle = `rgba(120, 140, 175, ${0.55 * k})`
      g.fillRect(0, 0, W, H)
      g.globalCompositeOperation = 'source-over'
      g.fillStyle = `rgba(220, 236, 255, ${0.7 * k})`
      for (const d of this.drops) {
        const x = Math.round(d.x)
        const y = Math.round(d.y)
        g.fillRect(x, y, 1, 1)
        g.fillRect(x + 1, y - 1, 1, 2)
        g.fillRect(x + 2, y - 3, 1, 2)
      }
      // small splashes where drops land
      g.fillStyle = `rgba(230, 242, 255, ${0.55 * k})`
      for (let i = 0; i < 14; i++) {
        const t = (this.time * 3 + i * 0.37) % 1
        const px = Math.floor(hash2(i, Math.floor(this.time * 3 + i * 0.37), 9) * W)
        const py = Math.floor(hash2(i, Math.floor(this.time * 3 + i * 0.37), 11) * H)
        const r = t < 0.5 ? 1 : 2
        g.fillRect(px - r, py, 1, 1)
        g.fillRect(px + r, py, 1, 1)
      }
    } else if (this.shown === 'fog') {
      // wide soft bands that drift sideways
      g.fillStyle = `rgba(226, 234, 242, ${0.38 * k})`
      g.fillRect(0, 0, W, H)
      for (let i = 0; i < 4; i++) {
        const y = 20 + i * 44 + Math.sin(this.time / 9 + i) * 6
        const x = ((this.time * (3 + i)) % (W + 160)) - 80
        const grad = g.createRadialGradient(x, y, 0, x, y, 90)
        grad.addColorStop(0, `rgba(240, 244, 248, ${0.75 * k})`)
        grad.addColorStop(1, 'rgba(240, 244, 248, 0)')
        g.fillStyle = grad
        g.fillRect(x - 90, y - 90, 180, 180)
        const x2 = x - (W + 160) / 2
        const grad2 = g.createRadialGradient(x2, y + 20, 0, x2, y + 20, 90)
        grad2.addColorStop(0, `rgba(240, 244, 248, ${0.65 * k})`)
        grad2.addColorStop(1, 'rgba(240, 244, 248, 0)')
        g.fillStyle = grad2
        g.fillRect(x2 - 90, y - 70, 180, 180)
      }
    } else if (this.shown === 'sun') {
      g.globalCompositeOperation = 'lighter'
      const grad = g.createRadialGradient(W * 0.85, -10, 0, W * 0.85, -10, 220)
      grad.addColorStop(0, `rgba(255, 224, 150, ${0.42 * k})`)
      grad.addColorStop(1, 'rgba(255, 224, 150, 0)')
      g.fillStyle = grad
      g.fillRect(0, 0, W, H)
      // slow diagonal shafts of light from the top right
      for (let i = 0; i < 3; i++) {
        const sway = Math.sin(this.time / 7 + i * 2) * 0.04
        g.fillStyle = `rgba(255, 236, 180, ${(0.07 + sway) * k})`
        g.beginPath()
        const x0 = W * (0.55 + i * 0.16)
        g.moveTo(x0, 0)
        g.lineTo(x0 + 18, 0)
        g.lineTo(x0 - 70, H)
        g.lineTo(x0 - 100, H)
        g.closePath()
        g.fill()
      }
      g.globalCompositeOperation = 'source-over'
    }
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
