// The dungeon (dungeon.html): a map from the editor, played in real time.
// You steer the lead with WASD or the arrow keys; it attacks the nearest enemy
// on its own with its type's move. Keys 1 and 2 fire a stronger shot and a
// burst on cooldowns. The other two party members follow and fight on their
// own; Tab switches who you steer. Enemies sleep until you come close. Beat
// the boss, then walk to the exit. Dungeons give no EXP (levels come only
// from focus); a gate dungeon opens the next island and its boss joins you.
//
// Opened as dungeon.html?id=<map>&gate=<island> from the island, or
// ?map=play from the editor's Play test (nothing is saved then).
import './play.css'
import { effectiveness, MOVES } from '../battle'
import { Game, ISLANDS, IslandId, Roster } from '../game'
import { Light, applyLighting, normalMapFor } from '../lighting'
import { Species, dirFrom, drawFrame, frameAt, loadManifest, loadSpecies } from '../sprites'
import { DungeonMap, TILE, bakeMap, walkableTile } from './map'

const VW = 320
const VH = 180
const BASE = import.meta.env.BASE_URL
const params = new URLSearchParams(location.search)
const portrait = (dex: number) => `${BASE}sprites/${String(dex).padStart(4, '0')}/Normal.png`

// type flavour: which types shoot, and the names and colours of their moves
const RANGED = new Set(['fire', 'water', 'electric', 'grass', 'ice', 'psychic', 'ghost', 'poison', 'dragon', 'fairy'])
const STRONG: Record<string, string> = {
  normal: 'Body Slam', fire: 'Flamethrower', water: 'Surf', grass: 'Razor Leaf', electric: 'Thunderbolt', ice: 'Ice Beam', fighting: 'Brick Break', poison: 'Sludge',
  ground: 'Dig', flying: 'Wing Attack', psychic: 'Psybeam', bug: 'X-Scissor', rock: 'Rock Slide', ghost: 'Shadow Ball', dragon: 'Dragon Breath', dark: 'Crunch', steel: 'Iron Tail', fairy: 'Moonblast',
}
const BURST: Record<string, string> = {
  normal: 'Hyper Voice', fire: 'Fire Spin', water: 'Whirlpool', grass: 'Leaf Storm', electric: 'Discharge', ice: 'Blizzard', fighting: 'Low Sweep', poison: 'Poison Gas',
  ground: 'Earthquake', flying: 'Whirlwind', psychic: 'Psychic', bug: 'Struggle Bug', rock: 'Rock Tomb', ghost: 'Night Shade', dragon: 'Twister', dark: 'Snarl', steel: 'Flash Cannon', fairy: 'Dazzling Gleam',
}
const COL: Record<string, string> = {
  fire: '#ff8a3a', water: '#4aa8ff', grass: '#5ad04a', electric: '#ffe040', ice: '#9ae8ff', psychic: '#ff70c0', ghost: '#9a70ff', poison: '#c060e0',
  dragon: '#7a70ff', fairy: '#ffa0d8', normal: '#f0f0f0', fighting: '#e06040', ground: '#d8b060', flying: '#c0d8ff', bug: '#a8d040', rock: '#c8a868', dark: '#705848', steel: '#c0c8d8',
}

interface Actor {
  id: number
  side: 'you' | 'foe'
  dex: number
  name: string
  level: number
  types: string[]
  sp: Species
  x: number
  y: number
  dir: number
  hp: number
  maxHp: number
  atk: number
  cd: number
  cd1: number
  cd2: number
  moving: boolean
  t: number
  hurt: number
  hop: number
  awake: boolean
  boss: boolean
  dead: boolean
  fade: number
}
interface Shot {
  x: number
  y: number
  vx: number
  vy: number
  side: 'you' | 'foe'
  from: Actor
  mult: number
  type: string
  life: number
}
interface Pop {
  x: number
  y: number
  text: string
  t: number
  col: string
}

// ---------- page ----------
const root = document.getElementById('dungeon')!
root.innerHTML = `<div class="dg-wrap"><canvas></canvas><div class="dg-hud"></div></div>`
const wrap = root.querySelector<HTMLElement>('.dg-wrap')!
const view = root.querySelector('canvas')!
view.width = VW
view.height = VH
const vg = view.getContext('2d')!
const hud = root.querySelector<HTMLElement>('.dg-hud')!
const frame = document.createElement('canvas')
frame.width = VW
frame.height = VH
const fg = frame.getContext('2d', { willReadFrequently: true })!
const ncv = document.createElement('canvas')
ncv.width = VW
ncv.height = VH
const ng = ncv.getContext('2d', { willReadFrequently: true })!
let hs = 1
function fit() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / VW, innerHeight / VH)))
  view.style.width = `${VW * s}px`
  view.style.height = `${VH * s}px`
  hs = Math.max(1, Math.floor(s / 2))
  hud.style.width = `${(VW * s) / hs}px`
  hud.style.height = `${(VH * s) / hs}px`
  hud.style.transform = `scale(${hs})`
}
fit()
addEventListener('resize', fit)

// ---------- state ----------
let map: DungeonMap
let baked: ReturnType<typeof bakeMap>
let game: Game
let party: Actor[] = []
let foes: Actor[] = []
let shots: Shot[] = []
let pops: Pop[] = []
let lead = 0
let state: 'intro' | 'play' | 'paused' | 'won' | 'lost' = 'intro'
let bossDown = false
let calm = 0 // seconds since the last fight
let exit: { x: number; y: number } | null = null
let time = 0
const keys = new Set<string>()
let nextId = 1
const gate = params.get('gate') as IslandId | null

// a boss has 2.5 times a turn-based guardian's HP: in real time a whole party hits it at once.
// Tuned so a party near the dungeon's level clears it (see VALIDATION.md, stage 6).
const statsFor = (level: number, boss: boolean) =>
  boss ? { hp: Math.round((60 + level * 10) * 2.5), atk: (10 + level * 2.2) * 0.75 } : { hp: 20 + level * 3, atk: 8 + level * 2 }

function makeActor(side: Actor['side'], dex: number, level: number, sp: Species, types: string[], name: string, x: number, y: number, boss = false): Actor {
  const st = statsFor(level, boss)
  return { id: nextId++, side, dex, name, level, types, sp, x, y, dir: 0, hp: st.hp, maxHp: st.hp, atk: st.atk, cd: Math.random() * 0.6, cd1: 0, cd2: 0, moving: false, t: Math.random() * 3, hurt: 0, hop: 0, awake: false, boss, dead: false, fade: 0 }
}

// ---------- movement ----------
function canStand(x: number, y: number) {
  for (const [dx, dy] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) {
    const tx = Math.floor((x + dx) / TILE)
    const ty = Math.floor((y + dy) / TILE)
    if (!walkableTile(baked.at(tx, ty))) return false
  }
  for (const s of baked.solid) if (Math.hypot(s.x - x, (s.y - y) * 1.4) < s.r + 3) return false
  return true
}
function move(a: Actor, dx: number, dy: number) {
  if (dx || dy) a.dir = dirFrom(dx, dy)
  if (canStand(a.x + dx, a.y)) a.x += dx
  if (canStand(a.x, a.y + dy)) a.y += dy
}
const alive = (xs: Actor[]) => xs.filter((a) => !a.dead)
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
function nearest(from: Actor, xs: Actor[], within = Infinity) {
  let best: Actor | null = null
  let bd = within
  for (const x of xs) {
    if (x.dead) continue
    const d = dist(from, x)
    if (d < bd) {
      bd = d
      best = x
    }
  }
  return best
}

// ---------- combat ----------
const ranged = (a: Actor) => a.types.some((t) => RANGED.has(t))
const range = (a: Actor) => (a.boss ? 26 : ranged(a) ? 74 : 20)
const bestType = (a: Actor, d: Actor) => a.types.reduce((b, t) => (effectiveness(t, d.types) > effectiveness(b, d.types) ? t : b), a.types[0] ?? 'normal')
function hit(from: Actor, to: Actor, mult: number, type: string) {
  if (to.dead) return
  const eff = effectiveness(type, to.types)
  const dmg = Math.max(1, Math.round(from.atk * 0.5 * mult * (eff || 0.25) * (0.9 + Math.random() * 0.2)))
  to.hp = Math.max(0, to.hp - dmg)
  to.hurt = 0.22
  to.awake = true
  pops.push({ x: to.x + (Math.random() - 0.5) * 6, y: to.y - 24, text: String(dmg), t: 0, col: eff > 1 ? '#ffe040' : eff < 1 ? '#c8c8c8' : '#ffffff' })
  if (eff > 1 && Math.random() < 0.5) toast("It's super effective!")
  if (to.hp === 0) faint(to)
}
function attack(a: Actor, target: Actor, mult = 1, label?: string) {
  const type = bestType(a, target)
  a.hop = 0.3
  a.dir = dirFrom(target.x - a.x, target.y - a.y)
  if (label) pops.push({ x: a.x, y: a.y - 30, text: label, t: 0, col: COL[type] ?? '#fff' })
  if (ranged(a) && !a.boss) {
    const d = dist(a, target) || 1
    shots.push({ x: a.x, y: a.y - 9, vx: ((target.x - a.x) / d) * 150, vy: ((target.y - a.y) / d) * 150, side: a.side, from: a, mult, type, life: 0.9 })
  } else hit(a, target, mult, type)
}
function burst(a: Actor, mult: number, radius: number, label: string) {
  const type = a.types[0] ?? 'normal'
  pops.push({ x: a.x, y: a.y - 30, text: label, t: 0, col: COL[type] ?? '#fff' })
  rings.push({ x: a.x, y: a.y - 4, r: 0, max: radius, col: COL[type] ?? '#fff', t: 0 })
  for (const f of a.side === 'you' ? foes : party) if (!f.dead && dist(a, f) < radius) hit(a, f, mult, bestType(a, f))
}
const rings: { x: number; y: number; r: number; max: number; col: string; t: number }[] = []
function faint(a: Actor) {
  a.dead = true
  pops.push({ x: a.x, y: a.y - 30, text: a.side === 'you' ? `${a.name} fainted!` : '', t: 0, col: '#ff8070' })
  if (a.side === 'you') {
    const next = party.findIndex((p) => !p.dead)
    if (next < 0) return end(false)
    if (party[lead] === a) lead = next
  } else if (a.boss) {
    bossDown = true
    toast(`${a.name} was defeated! The way out is open.`)
  }
}

// ---------- update ----------
function update(dt: number) {
  time += dt
  for (const a of [...party, ...foes]) {
    a.t += dt
    a.hurt = Math.max(0, a.hurt - dt)
    a.hop = Math.max(0, a.hop - dt)
    a.cd -= dt
    a.cd1 -= dt
    a.cd2 -= dt
    if (a.dead) a.fade = Math.min(1, a.fade + dt * 1.5)
  }
  if (state !== 'play') return
  const me = party[lead]
  // the lead: WASD or arrows
  let mx = 0
  let my = 0
  if (keys.has('a') || keys.has('arrowleft')) mx--
  if (keys.has('d') || keys.has('arrowright')) mx++
  if (keys.has('w') || keys.has('arrowup')) my--
  if (keys.has('s') || keys.has('arrowdown')) my++
  me.moving = !!(mx || my)
  if (me.moving) {
    const k = (64 * dt) / Math.hypot(mx, my)
    move(me, mx * k, my * k)
  }
  // followers keep near the lead and fight what is close
  party.forEach((p, i) => {
    if (p === me || p.dead) return
    const foe = nearest(p, alive(foes).filter((f) => f.awake), 90)
    let tx = me.x + (i % 2 ? -14 : 14)
    let ty = me.y + 10
    if (foe && dist(p, foe) > range(p) - 6) {
      tx = foe.x
      ty = foe.y
    }
    const d = Math.hypot(tx - p.x, ty - p.y)
    p.moving = d > (foe ? range(p) - 8 : 14)
    if (p.moving) move(p, ((tx - p.x) / d) * 58 * dt, ((ty - p.y) / d) * 58 * dt)
  })
  // auto-attacks for the party
  for (const p of party) {
    if (p.dead || p.cd > 0) continue
    const target = nearest(p, foes, range(p))
    if (!target) continue
    p.cd = 0.8
    attack(p, target)
  }
  // enemies wake when you come close, then chase and attack
  for (const f of foes) {
    if (f.dead) continue
    const t = nearest(f, party, f.awake ? Infinity : f.boss ? 84 : 64)
    if (!f.awake && t) {
      f.awake = true
      if (f.boss) toast(`${f.name} woke up!`)
    }
    if (!f.awake || !t) {
      f.moving = false
      continue
    }
    const d = dist(f, t)
    f.moving = d > range(f) - 4
    if (f.moving) move(f, ((t.x - f.x) / d) * (f.boss ? 30 : 44) * dt, ((t.y - f.y) / d) * (f.boss ? 30 : 44) * dt)
    if (f.cd <= 0 && d <= range(f)) {
      f.cd = f.boss ? 1.7 : 1.15
      attack(f, t)
    }
    // the boss shakes the room now and then
    if (f.boss && f.cd2 <= 0 && d < 50) {
      f.cd2 = 8
      burst(f, 1.1, 46, BURST[f.types[0]] ?? 'Hyper Voice')
    }
  }
  // out of combat the party recovers, and a fainted partner gets back up (Mystery Dungeon style)
  const fighting = alive(foes).some((f) => f.awake && party.some((p) => !p.dead && dist(p, f) < 140))
  calm = fighting ? 0 : calm + dt
  if (calm > 2) {
    for (const p of party) {
      if (!p.dead) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.08 * dt)
      else if (calm > 6 && p.fade >= 1) {
        p.dead = false
        p.fade = 0
        p.hp = Math.round(p.maxHp * 0.3)
        p.x = me.x + 8
        p.y = me.y + 6
        pops.push({ x: p.x, y: p.y - 26, text: `${p.name} got back up!`, t: 0, col: '#a8f0a8' })
      }
    }
  }

  // shots fly and hit the first body of the other side
  for (const s of shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
    const tx = Math.floor(s.x / TILE)
    const ty = Math.floor((s.y + 9) / TILE)
    const tile = baked.at(tx, ty)
    if (!walkableTile(tile) && tile !== 2) s.life = 0
    for (const a of s.side === 'you' ? foes : party) {
      if (a.dead || s.life <= 0) continue
      if (Math.hypot(a.x - s.x, a.y - 9 - s.y) < 8) {
        hit(s.from, a, s.mult, s.type)
        s.life = 0
      }
    }
  }
  shots = shots.filter((s) => s.life > 0)
  for (const r of rings) r.t += dt
  pops = pops.filter((p) => (p.t += dt) < 1.1)
  // the exit, once the boss is down
  if (bossDown && exit && dist(me, exit) < 12) end(true)
  renderHud()
}

// ---------- drawing ----------
const scratch = document.createElement('canvas')
function drawActor(g: CanvasRenderingContext2D, a: Actor, cx: number, cy: number) {
  const A = a.sp.anims
  const anim = a.dead ? A.Sleep ?? A.Idle : a.hop > 0 && A.Hop ? A.Hop : a.moving ? A.Walk : A.Idle
  const t = a.hop > 0 ? 0.3 - a.hop : a.moving ? a.t * 0.8 : a.t
  const f = frameAt(anim, t, a.hop <= 0)
  const x = a.x - cx
  const y = a.y - cy
  g.globalAlpha = 1 - a.fade * 0.85
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(Math.round(x - 6), Math.round(y - 1), 12, 2)
  if (a.hurt > 0) {
    scratch.width = anim.w
    scratch.height = anim.h
    const sg = scratch.getContext('2d')!
    drawFrame(sg, anim, f, a.dir, anim.ax, anim.ay)
    sg.globalCompositeOperation = 'source-atop'
    sg.fillStyle = 'rgba(255,255,255,0.8)'
    sg.fillRect(0, 0, anim.w, anim.h)
    g.drawImage(scratch, Math.round(x - anim.ax), Math.round(y - anim.ay))
  } else drawFrame(g, anim, f, a.dir, x, y)
  g.globalAlpha = 1
  return { anim, f }
}
function render() {
  const me = party[lead]
  const cx = Math.round(Math.max(0, Math.min(map.w * TILE - VW, me.x - VW / 2)))
  const cy = Math.round(Math.max(0, Math.min(map.h * TILE - VH, me.y - VH / 2)))
  fg.globalCompositeOperation = 'source-over'
  fg.fillStyle = '#07080a'
  fg.fillRect(0, 0, VW, VH)
  fg.drawImage(baked.color, cx, cy, VW, VH, 0, 0, VW, VH)
  ng.drawImage(baked.normal, cx, cy, VW, VH, 0, 0, VW, VH)
  // the exit: stairs down, glowing once open
  if (exit) {
    const ex = exit.x - cx - 7
    const ey = exit.y - cy - 7
    fg.fillStyle = bossDown ? '#3a2e1a' : '#1a1814'
    fg.fillRect(ex, ey, 14, 14)
    fg.fillStyle = bossDown ? '#c8a050' : '#4a4236'
    for (let i = 0; i < 4; i++) fg.fillRect(ex + 2, ey + 2 + i * 3, 10 - i * 2, 2)
  }
  const bodies = [...foes, ...party].sort((a, b) => a.y - b.y)
  for (const a of bodies) {
    if (a.dead && a.fade >= 1) continue
    if (a.x < cx - 40 || a.x > cx + VW + 40 || a.y < cy - 40 || a.y > cy + VH + 60) continue
    const { anim, f } = drawActor(fg, a, cx, cy)
    drawFrame(ng, { ...anim, img: normalMapFor(anim.img) as unknown as HTMLImageElement }, f, a.dir, a.x - cx, a.y - cy)
  }
  for (const s of shots) {
    fg.fillStyle = COL[s.type] ?? '#fff'
    fg.fillRect(Math.round(s.x - cx - 2), Math.round(s.y - cy - 2), 4, 4)
    fg.fillStyle = '#fff'
    fg.fillRect(Math.round(s.x - cx - 1), Math.round(s.y - cy - 1), 2, 2)
  }
  // light: the map's torches and crystals, a lantern the lead carries, fire types, flying fire
  const lights: Light[] = []
  for (const l of baked.lights) if (l.x > cx - l.r && l.x < cx + VW + l.r && l.y > cy - l.r && l.y < cy + VH + l.r) lights.push({ ...l, x: l.x - cx, y: l.y - cy, power: l.power * (0.94 + 0.06 * Math.sin(time * 3 + l.x)) })
  lights.push({ x: me.x - cx, y: me.y - cy - 10, z: 22, r: 96, color: [1, 0.93, 0.82], power: 1.25 })
  for (const a of [...party, ...foes]) if (!a.dead && a.types.includes('fire')) lights.push({ x: a.x - cx, y: a.y - cy - 8, z: 12, r: 40, color: [1, 0.6, 0.3], power: 1.1 })
  for (const s of shots) if (s.type === 'fire' || s.type === 'electric') lights.push({ x: s.x - cx, y: s.y - cy, z: 8, r: 22, color: s.type === 'fire' ? [1, 0.6, 0.3] : [1, 0.95, 0.5], power: 1.2 })
  const amb = 1 - map.dark * 0.92
  applyLighting(fg, ng, [amb * 0.85, amb * 0.9, amb * 1.1], lights)
  // drawn after the light: bursts, HP bars over awake enemies, numbers
  for (const r of rings) {
    const k = r.t / 0.5
    if (k >= 1) continue
    fg.strokeStyle = r.col
    fg.globalAlpha = 1 - k
    fg.lineWidth = 2
    fg.beginPath()
    fg.ellipse(r.x - cx, r.y - cy, r.max * k, r.max * k * 0.6, 0, 0, Math.PI * 2)
    fg.stroke()
    fg.globalAlpha = 1
  }
  for (const f of foes) {
    if (f.dead || !f.awake || f.boss) continue
    const x = Math.round(f.x - cx - 8)
    const y = Math.round(f.y - cy - Math.min(f.sp.anims.Idle.ay, 30) - 4)
    fg.fillStyle = '#202020'
    fg.fillRect(x, y, 16, 3)
    const p = f.hp / f.maxHp
    fg.fillStyle = p > 0.5 ? '#58d058' : p > 0.2 ? '#f8c838' : '#f05040'
    fg.fillRect(x + 1, y + 1, Math.round(14 * p), 1)
  }
  fg.font = '8px "Press Start 2P", monospace'
  fg.textAlign = 'center'
  for (const p of pops) {
    if (!p.text) continue
    const y = p.y - cy - p.t * 14
    fg.globalAlpha = Math.min(1, 1.6 - p.t * 1.4)
    fg.fillStyle = '#101010'
    fg.fillText(p.text, p.x - cx + 1, y + 1)
    fg.fillStyle = p.col
    fg.fillText(p.text, p.x - cx, y)
    fg.globalAlpha = 1
  }
  vg.imageSmoothingEnabled = false
  vg.drawImage(frame, 0, 0)
}

// ---------- HUD ----------
let toastTimer = 0
function toast(t: string) {
  const el = hud.querySelector<HTMLElement>('.dg-toast')
  if (!el) return
  el.textContent = t
  el.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2400)
}
const hpClass = (p: number) => (p > 0.5 ? '' : p > 0.2 ? 'mid' : 'low')
let hudKey = ''
function renderHud() {
  const me = party[lead]
  const boss = foes.find((f) => f.boss)
  const key = party.map((p) => `${Math.round(p.hp)}:${p.dead}`).join() + `|${lead}|${boss?.hp}:${boss?.awake}|${Math.ceil(me.cd1)}:${Math.ceil(me.cd2)}`
  if (key === hudKey) return
  hudKey = key
  const t = me.types[0] ?? 'normal'
  hud.querySelector('.dg-party')!.innerHTML = party
    .map((p, i) => `<div class="dg-panel dg-mon${i === lead ? ' on' : ''}${p.dead ? ' out' : ''}"><img src="${portrait(p.dex)}" alt="" /><div class="nm"><p>${p.name}</p><span class="hp"><i class="${hpClass(p.hp / p.maxHp)}" style="width:${(p.hp / p.maxHp) * 100}%"></i></span></div></div>`)
    .join('')
  const bossEl = hud.querySelector<HTMLElement>('.dg-boss')!
  bossEl.hidden = !boss || !boss.awake || boss.dead
  if (boss) bossEl.innerHTML = `<p>${boss.name} <span style="color:#707070">Lv${boss.level}</span></p><span class="hp"><i class="${hpClass(boss.hp / boss.maxHp)}" style="width:${(boss.hp / boss.maxHp) * 100}%"></i></span>`
  const cd = (v: number, max: number) => `<i style="width:${Math.max(0, Math.min(1, 1 - v / max)) * 100}%"></i>`
  hud.querySelector('.dg-moves')!.innerHTML = `
    <div class="dg-panel dg-move"><p><b>Auto</b></p><p>${MOVES[t] ?? 'Tackle'}</p></div>
    <div class="dg-panel dg-move"><p><b>1</b></p><p>${STRONG[t] ?? 'Body Slam'}</p>${cd(me.cd1, 4)}</div>
    <div class="dg-panel dg-move"><p><b>2</b></p><p>${BURST[t] ?? 'Hyper Voice'}</p>${cd(me.cd2, 9)}</div>`
}
function message(html: string, buttons: { label: string; gold?: boolean; run: () => void }[]) {
  const el = document.createElement('div')
  el.className = 'dg-panel dg-msg'
  el.innerHTML = `${html}<div class="dg-row">${buttons.map((b, i) => `<button class="dg-btn${b.gold ? ' gold' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div>`
  el.addEventListener('click', (e) => {
    const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i
    if (i == null) return
    el.remove()
    buttons[Number(i)].run()
  })
  hud.append(el)
  ;(el.querySelector('.dg-btn.gold') as HTMLElement | null)?.focus()
}
const home = () => (location.href = BASE)

function end(win: boolean) {
  if (state === 'won' || state === 'lost') return
  state = win ? 'won' : 'lost'
  if (!win) {
    message(`<p>Your party was carried out of ${map.name}.</p><p style="color:#707070">Levels come from focus. Study, then try again.</p>`, [
      { label: 'Try again', gold: true, run: () => location.reload() },
      { label: 'Back to the island', run: home },
    ])
    return
  }
  const boss = foes.find((f) => f.boss)
  let text = `<p>You cleared ${map.name}!</p>`
  if (gate && game.save.island === gate && !game.save.guardians.includes(gate)) {
    game.save.guardians.push(gate)
    game.save.starPieces += 3
    game.persist()
    const joined = game.guardianJoins()
    const next = ISLANDS.find((i) => i.unlock?.from === gate)
    text += `<p>${joined ? `${game.name(joined)} joins you. ` : ''}3 Star Pieces.${next ? ` One step closer to ${next.name}.` : ''}</p>`
  } else if (params.get('map') === 'play') text += `<p style="color:#707070">Test play: nothing was saved.</p>`
  else if (boss) text += `<p>${boss.name} is beaten.</p>`
  message(text, [{ label: 'Back to the island', gold: true, run: home }])
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault()
  keys.add(k)
  if (state === 'paused' && k === 'escape') return resume()
  if (state !== 'play') return
  const me = party[lead]
  if (k === 'escape') return pause()
  if (k === 'tab') {
    for (let i = 1; i <= party.length; i++) {
      const j = (lead + i) % party.length
      if (!party[j].dead) {
        lead = j
        break
      }
    }
    hudKey = ''
  }
  if (k === '1' && me.cd1 <= 0) {
    const t = nearest(me, foes, ranged(me) ? 90 : 30)
    if (t) {
      me.cd1 = 4
      attack(me, t, 2.2, STRONG[bestType(me, t)])
    }
  }
  if (k === '2' && me.cd2 <= 0) {
    me.cd2 = 9
    burst(me, 1.5, 44, BURST[me.types[0]] ?? 'Hyper Voice')
  }
})
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
addEventListener('blur', () => keys.clear())
function pause() {
  state = 'paused'
  message('<p>Paused.</p>', [
    { label: 'Resume', gold: true, run: resume },
    { label: 'Leave the dungeon', run: home },
  ])
}
function resume() {
  hud.querySelector('.dg-msg')?.remove()
  state = 'play'
}

// ---------- boot ----------
async function boot() {
  const [manifest, roster] = await Promise.all([loadManifest(), fetch(`${BASE}data/roster.json?v=${__BUILD__}`).then((r) => r.json())])
  game = new Game((roster as { species: Roster }).species)
  const id = params.get('id')
  map = params.get('map') === 'play' ? JSON.parse(localStorage.getItem('island-dungeon-play') ?? 'null') : id ? await (await fetch(`${BASE}dungeons/${id}.json?v=${__BUILD__}`)).json() : null
  if (!map) return message('<p>That dungeon could not be found.</p>', [{ label: 'Back to the island', gold: true, run: home }])
  if (game.inSession) return message('<p>Finish your focus session first. Dungeons are for breaks.</p>', [{ label: 'Back to the island', gold: true, run: home }])
  baked = bakeMap(map)
  const species = new Map<number, Species>()
  const need = new Set<number>([...game.party.map((m) => m.dex), ...map.entities.filter((e) => e.dex).map((e) => e.dex!)])
  await Promise.all([...need].map(async (d) => species.set(d, await loadSpecies(manifest, String(d).padStart(4, '0')))))
  const start = map.entities.find((e) => e.kind === 'start') ?? { x: 2, y: 2 }
  party = game.party.map((m, i) => makeActor('you', m.dex, m.level, species.get(m.dex)!, game.species(m.dex)?.types ?? ['normal'], game.name(m), start.x * TILE + 8 + (i - 1) * 12, start.y * TILE + 10 + (i ? 8 : 0)))
  foes = map.entities
    .filter((e) => (e.kind === 'enemy' || e.kind === 'boss') && e.dex && species.get(e.dex))
    .map((e) => makeActor('foe', e.dex!, e.level ?? 10, species.get(e.dex!)!, game.species(e.dex!)?.types ?? ['normal'], game.name(e.dex!), e.x * TILE + 8, e.y * TILE + 12, e.kind === 'boss'))
  const ex = map.entities.find((e) => e.kind === 'exit')
  exit = ex ? { x: ex.x * TILE + 8, y: ex.y * TILE + 8 } : null
  if (!foes.some((f) => f.boss)) bossDown = true
  hud.innerHTML = `<div class="dg-party"></div><div class="dg-panel dg-boss" hidden></div><div class="dg-moves"></div><div class="dg-panel dg-toast"></div>
    <div class="dg-panel dg-keys"><p>WASD move</p><p>1 2 moves</p><p>Tab switch</p><p>Esc pause</p></div>`
  renderHud()
  const boss = foes.find((f) => f.boss)
  const lvls = foes.filter((f) => !f.boss).map((f) => f.level)
  message(
    `<p>${map.name}</p><p style="color:#707070">${foes.length - (boss ? 1 : 0)} Pokémon${lvls.length ? `, levels ${Math.min(...lvls)} to ${Math.max(...lvls)}` : ''}.${boss ? ` ${boss.name} (Lv${boss.level}) waits at the end.` : ''}</p><p style="color:#707070">No EXP here: levels come only from focus.</p>`,
    [
      { label: 'Enter', gold: true, run: () => (state = 'play') },
      { label: 'Back to the island', run: home },
    ],
  )
  let last = performance.now()
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (state !== 'paused') update(dt)
    render()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
void boot()
;(window as unknown as { __dungeon: unknown }).__dungeon = {
  get party() {
    return party
  },
  get foes() {
    return foes
  },
  get state() {
    return state
  },
  set state(s: typeof state) {
    state = s
  },
  keys,
  update,
}
