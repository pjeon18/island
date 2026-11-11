// T1: the first playable slice. You pick a starter, start a focus session,
// your party gains 1 EXP per verified focused minute, evolves at the real
// levels, and a visitor comes out of the tall grass when a session finishes.
import './styles.css'
import { Creature } from './creature'
import * as cloud from './cloud'
import { SLOTS, decorDef } from './decor'
import { BALLS, Ball, FOODS, Find, Game, GameEvent, HABITATS, Haul, ISLANDS, JOBS, Mon, RARE_50, Role, Roster, STONES, Weather, Wild, aStone, loadSave, stoneName } from './game'
import { HABITAT_SPOTS } from './habitats'
import { CatchAnim } from './catch'
import { Hud, fmtMinutes } from './hud'
import { H, W, seaCss, useIsland } from './island'
import { PresenceHandlers, enableIdleDetection, startIdleDetection } from './presence'
import { NEST, Scene, nightness } from './scene'
import { Manifest, Species, loadManifest, loadSpecies } from './sprites'

const STARTERS = [1, 4, 7]
const params = new URLSearchParams(location.search)
// Inside the Tauri desktop app the island floats on the desktop: no page, no
// sea, a transparent window you drag by the island itself.
const tauri = '__TAURI_INTERNALS__' in window
const floatMode = tauri || params.has('float')
const popoutMode = params.has('popout') || floatMode
const debug = params.has('debug')
// visiting a friend's island (stage 5): the scene was fetched before the page reloaded into it
const visitData: (cloud.FriendScene & { id: string }) | null = params.has('visit')
  ? (() => {
      try {
        return JSON.parse(sessionStorage.getItem('island-visit') ?? 'null')
      } catch {
        return null
      }
    })()
  : null
type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
const invoke = (window as unknown as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__?.invoke

// ---------- page ----------
const app = document.getElementById('app')!
// The whole page is the game: the island fills the screen over open sea.
// Credits and the pop-out button live in the More menu inside the window.
app.innerHTML = `<div class="pip-stage${floatMode ? ' float' : ''}${floatMode && !tauri ? ' float-preview' : ''}${popoutMode ? '' : ' page'}"><div class="window"><canvas class="stage"${tauri ? ' data-tauri-drag-region' : ''}></canvas></div></div>${debug && !popoutMode ? `<section class="debug"></section>` : ''}`
if (!floatMode) document.documentElement.style.setProperty('--sea-page', seaCss())

const win = app.querySelector<HTMLElement>('.window')!
const canvas = app.querySelector<HTMLCanvasElement>('canvas.stage')!
canvas.width = W
canvas.height = H
const g = canvas.getContext('2d', { willReadFrequently: true })! // the night lighting pass reads it back each frame

// ---------- state ----------
let manifest: Manifest
let game: Game
let hud: Hud
// the island you are on decides the palette before anything is painted
useIsland(visitData ? visitData.scene.island : (loadSave().island ?? 'home'))
const scene = new Scene()
scene.overlay = (gg) => catching?.draw(gg)
scene.float = floatMode
const species = new Map<number, Species>()
const loading = new Map<number, Promise<Species>>()
const dex4 = (dex: number) => String(dex).padStart(4, '0')
async function ensure(dex: number) {
  const have = species.get(dex)
  if (have) return have
  let p = loading.get(dex)
  if (!p) {
    p = loadSpecies(manifest, dex4(dex)).then((s) => (species.set(dex, s), s))
    loading.set(dex, p)
  }
  return p
}
let hourOverride: number | null = null
const clockHour = () => {
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

// sim-time timers: scripted beats follow the island clock
let timers: { at: number; fn: () => void }[] = []
const after = (sec: number, fn: () => void) => timers.push({ at: scene.time + sec, fn })
function runTimers() {
  const due = timers.filter((t) => t.at <= scene.time)
  timers = timers.filter((t) => t.at > scene.time)
  due.forEach((t) => t.fn())
}

// ---------- party on the island ----------
let candidates: Creature[] = [] // the three starters wandering before you choose
let adopt: { dex: number; c: Creature } | null = null
const evolving = new Set<string>()

let spawnNext: { x: number; y: number } | null = null // a hatchling appears at the nest
async function syncParty(initial = false) {
  const want = [...game.party, ...game.helpers]
  const ids = new Set(want.map((m) => m.id))
  // members who left the party walk off down the dock
  for (const c of scene.creatures) {
    if (c.monId && !ids.has(c.monId) && c.state !== 'leave' && c.state !== 'gone') {
      const d = scene.dockTop
      c.walkTo(d.x, d.y + 4)
      c.enter('leave', 99)
    }
  }
  for (const m of want) {
    const have = scene.byMon(m.id)
    if (have) {
      if (have.sp.dex !== dex4(m.dex) && !evolving.has(m.id)) have.setSpecies(await ensure(m.dex))
      continue
    }
    if (adopt && adopt.dex === m.dex) {
      adopt.c.monId = m.id
      adopt = null
      continue
    }
    const cand = candidates.find((c) => c.sp.dex === dex4(m.dex))
    if (cand) {
      cand.monId = m.id
      candidates = candidates.filter((c) => c !== cand)
      continue
    }
    const sp = await ensure(m.dex)
    if (scene.byMon(m.id)) continue
    if (initial) {
      const p = scene.freeSpot()
      scene.add(sp, p.x, p.y).monId = m.id
    } else if (spawnNext) {
      const c = scene.add(sp, spawnNext.x, spawnNext.y + 3)
      spawnNext = null
      c.monId = m.id
      c.white = 1
      c.glowOut = true
      c.dir = 0
      c.walkTo(c.x, c.y + 6, 'hop')
    } else {
      const d = scene.dockTop
      const c = scene.add(sp, d.x, d.y + 2)
      c.monId = m.id
      const p = scene.freeSpot({ x: d.x, y: d.y - 24 })
      c.walkTo(p.x, p.y)
    }
  }
  applyAnchors()
  syncSleep(true)
}

/** Helpers stay near their work: the Day Care by the nest, the bush, the campfire, the end of the pier. */
function anchorFor(role: Role): { x: number; y: number; r: number } | undefined {
  if (role === 'daycare') return { x: NEST.x + 13, y: NEST.y + 3, r: 5 }
  if (role === 'job:bush') return { x: scene.island.bush.x - 10, y: scene.island.bush.y + 4, r: 6 }
  if (role === 'job:lookout') {
    const d = scene.island.dock
    return { x: d.x + d.w / 2 - 2, y: d.y1 - 13, r: 0 }
  }
  if (role === 'job:campfire') {
    const slot = Object.entries(game.save.decor.slots).find(([, v]) => v === 'campfire')?.[0]
    const sl = SLOTS.find((x) => x.id === slot)
    if (sl) return { x: sl.x - 4, y: sl.y + 9, r: 6 }
  }
  return undefined
}
function applyAnchors() {
  for (const c of scene.creatures) {
    if (!c.monId || c.state === 'leave' || c.state === 'gone') continue
    const an = anchorFor(game.roleOf(c.monId))
    const had = c.anchor
    c.anchor = an
    if (an && (!had || had.x !== an.x || had.y !== an.y) && Math.hypot(c.x - an.x, c.y - an.y) > an.r + 4) c.walkTo(an.x, an.y)
  }
}
function syncNest() {
  const eggs = game.save.eggs.map((e) => e.progress / e.need)
  scene.nest = { show: eggs.length > 0 || game.save.daycare.ids.some(Boolean), eggs }
}
const haulText = (h: Haul) => {
  const parts = [`${h.shells} shells`]
  const names: Record<string, string> = { berry: 'Oran Berry', 'poke-ball': 'Poké Ball', 'great-ball': 'Great Ball', 'ultra-ball': 'Ultra Ball', 'star-piece': 'Star Piece' }
  for (const it of h.items) {
    const name = it.kind === 'food' ? FOODS.find((f) => f.id === it.id)!.name : names[it.kind]
    parts.push(it.n > 1 ? `${it.n} ${name}s` : `a ${name}`)
  }
  if (h.egg) parts.push('an egg')
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
}

let sleepingNow = false
function syncSleep(force = false) {
  const want = game.save.session?.state === 'away'
  if (want === sleepingNow && !force) return
  sleepingNow = want
  scene.creatures
    .filter((c) => c.monId)
    .forEach((c, i) => c.sleep(want, force && want ? 0 : 0.4 + i * 0.9 + Math.random() * 0.5))
}

const lead = () => game.party[0]?.dex

// ---------- visitors ----------
let visiting = false
async function runVisit(rareMult = 1) {
  if (visiting) return
  visiting = true
  // a friendly visitor after a 50-minute session can be a rare one
  const { dex, level } = game.pickVisitor(rareMult, Math.random, { ...game.lure(), long: rareMult > 1 })
  const sp = await ensure(dex)
  const gp = scene.island.grassPatch
  const name = game.name(dex)
  scene.rustleGrass(2.2)
  hud.toast('Something is moving in the tall grass.')
  after(1.6, () => {
    const v = scene.add(sp, gp.x + 1, gp.y - 4)
    v.dir = 2
    let tx = gp.x + gp.r + 14
    const ty = gp.y + 2
    for (let i = 0; i < 20 && !scene.island.walkable(tx, ty); i++) tx += 2
    v.walkTo(tx, ty, 'hop')
    v.enter('emerge', 99)
    scene.creatures.filter((c) => c.monId).forEach((c) => (c.watch = v))
    v.onArrive = () => {
      after(2.4, () => scene.creatures.forEach((c) => c.watch === v && (c.watch = null)))
      after(1.0, () => v.hold(true))
      hud.say({
        dex,
        emotion: 'Happy',
        text: `A wild ${name} appeared. It wants to join you.`,
        actions: [
          {
            label: 'Befriend',
            primary: true,
            run: () => {
              adopt = { dex, c: v }
              const m = game.addMon(dex, level)
              const inParty = game.save.party.includes(m.id)
              v.hold(false)
              if (!inParty) {
                adopt = null
                const d = scene.dockTop
                v.walkTo(d.x, d.y + 4)
                v.enter('leave', 99)
              }
              hud.say({
                dex,
                emotion: 'Happy',
                text: inParty
                  ? `${name} joined your party.`
                  : `${name} went to your box.`,
              })
              visiting = false
            },
          },
          {
            label: 'Let it go',
            run: () => {
              v.hold(false)
              v.walkTo(gp.x + 1, gp.y - 4)
              v.enter('leave', 99)
              after(1.2, () => scene.rustleGrass(1.6))
              hud.say({ text: `${name} left.`, auto: 3000 })
              visiting = false
            },
          },
        ],
      })
    }
  })
}

// ---------- passers-by, finds and catching (GAME_DESIGN.md stage 1) ----------
const wildCreature = (id: string) => scene.creatures.find((c) => c.wildId === id && c.state !== 'gone')
/** Put a waiting Pokémon on the island; `arrive` walks it in from the tall grass or up the pier. */
async function spawnWild(w: Wild, arrive: boolean) {
  if (wildCreature(w.id)) return
  const sp = await ensure(w.dex)
  if (wildCreature(w.id) || !game.save.wild.some((x) => x.id === w.id)) return
  if (!arrive) {
    const p = scene.freeSpot()
    scene.add(sp, p.x, p.y).wildId = w.id
    return
  }
  const types = game.species(w.dex)?.types ?? []
  const sp0 = game.species(w.dex)
  const home =
    (sp0?.needs === 'cave' || types.includes('ghost') || types.includes('dark')) && scene.hasHabitat('cave')
      ? { ...HABITAT_SPOTS.cave, y: HABITAT_SPOTS.cave.y - 2 }
      : types.includes('water') && scene.hasHabitat('pond')
        ? HABITAT_SPOTS.pond
        : (types.includes('rock') || types.includes('ground')) && scene.hasHabitat('rocks')
          ? HABITAT_SPOTS.rocks
          : null
  if (home) {
    // it climbs out of the pond, or out from behind the rocks
    const c = scene.add(sp, home.x, home.y + 7)
    c.wildId = w.id
    const p = scene.freeSpot({ x: home.x, y: home.y + 20 })
    c.walkTo(p.x, p.y)
    c.enter('emerge', 99)
    return
  }
  if (Math.random() < 0.5) {
    const gp = scene.island.grassPatch
    scene.rustleGrass(2)
    const c = scene.add(sp, gp.x + 1, gp.y - 4)
    c.wildId = w.id
    const p = scene.freeSpot({ x: gp.x + 34, y: gp.y })
    c.walkTo(p.x, p.y)
    c.enter('emerge', 99)
  } else {
    const d = scene.island.dock
    const c = scene.add(sp, d.x + d.w / 2, d.y1 - 1)
    c.wildId = w.id
    const p = scene.freeSpot({ x: d.x + d.w / 2, y: d.y0 - 22 })
    c.walkTo(p.x, p.y)
  }
}
function wildLeaves(c: Creature) {
  if (Math.random() < 0.5) {
    const gp = scene.island.grassPatch
    c.walkTo(gp.x + 1, gp.y - 4)
    after(2, () => scene.rustleGrass(1.4))
  } else {
    const d = scene.island.dock
    c.walkTo(d.x + d.w / 2, d.y1 - 1)
  }
  c.enter('leave', 99)
}
function syncWild() {
  for (const w of game.save.wild) void spawnWild(w, false)
  for (const c of scene.creatures)
    if (c.wildId && c !== catching?.c && c.state !== 'leave' && !game.save.wild.some((w) => w.id === c.wildId)) wildLeaves(c)
  scene.markWild = !game.inSession && !catching
}
function syncFinds() {
  for (const f of game.save.finds) {
    if (f.x != null) continue
    const p = scene.freeSpot()
    f.x = Math.round(p.x)
    f.y = Math.round(p.y)
    game.persist()
  }
  scene.finds = game.save.finds.map((f) => ({ id: f.id, kind: f.kind, x: f.x!, y: f.y! }))
}
/** A party Pokémon walks over and digs the find up. */
function digUp(f: Find) {
  const p = scene.freeSpot()
  f.x = Math.round(p.x)
  f.y = Math.round(p.y)
  game.persist()
  const digger = (f.by && scene.byMon(f.by)) || scene.creatures.filter((c) => c.monId && !c.asleep && c.state !== 'still' && !c.anchor)[0]
  if (!digger) return syncFinds()
  digger.walkTo(f.x + 7, f.y, 'nod')
  digger.onArrive = () => {
    digger.dir = 6
    syncFinds()
    hud.toast(`${digger.name} found something.`)
  }
}
const FIND_TEXT: Record<Find['kind'], (n: number) => string> = {
  shells: (n) => `+${n} shells`,
  berry: () => 'An Oran Berry',
  'poke-ball': () => 'A Poké Ball',
  'star-piece': () => 'A Star Piece',
}
const WEATHER_TEXT: Record<Weather, string> = { clear: 'The sky cleared.', rain: 'It started to rain.', fog: 'Fog rolled in.', sun: 'The sun came out.', snow: 'It started to snow.' }

let catching: CatchAnim | null = null
let catchBall: Ball = 'poke-ball'
let lastCaught: Mon | undefined
function openCatch(c: Creature) {
  const w = game.save.wild.find((x) => x.id === c.wildId)
  if (!w || catching || evo) return
  const have = BALLS.filter((b) => game.save.balls[b.id] > 0)
  if (!have.length) return hud.say({ dex: w.dex, text: 'You have no balls. Buy some in the Town Map shop.', auto: 5000 })
  if (!game.save.balls[catchBall]) catchBall = have[0].id
  hud.closeSheet()
  c.hold(true)
  catching = new CatchAnim(c, catchBall, (q) => game.catchChance(w, catchBall, q), (r) => finishCatch(c, w, r.caught))
  scene.markWild = false
  showCatchUI(w)
}
function showCatchUI(w: Wild) {
  hud.showCatch({
    dex: w.dex,
    name: game.name(w.dex),
    level: w.level,
    ball: catchBall,
    balls: { ...game.save.balls },
    onBall: (b) => {
      catchBall = b
      if (catching) catching.ball = b
      showCatchUI(w)
    },
    onThrow: throwNow,
    onRun: cancelCatch,
  })
}
function throwNow() {
  if (!catching || catching.phase !== 'aim') return
  const c = catching.c
  const id = c.wildId!
  const dex = game.save.wild.find((x) => x.id === id)?.dex
  adopt = dex ? { dex, c } : null // if it is caught into the party, this creature becomes the party member
  const res = game.throwBall(id, catchBall, catching.quality)
  if (adopt?.c === c) adopt = null
  if (!res) return cancelCatch()
  lastCaught = res.mon
  if (res.caught) c.wildId = undefined
  hud.hideCatch()
  catching.throw({ caught: res.caught, shakes: res.shakes })
}
function cancelCatch() {
  if (!catching) return
  catching.c.hold(false)
  catching = null
  hud.hideCatch()
  scene.markWild = !game.inSession
}
function finishCatch(c: Creature, w: Wild, caught: boolean) {
  catching = null
  scene.markWild = !game.inSession
  const name = game.name(w.dex)
  if (!caught) {
    c.hold(false)
    hud.say({ dex: w.dex, text: `Oh no! ${name} broke free!`, auto: 3500 })
    return
  }
  const m = lastCaught
  const inParty = !!m && game.save.party.includes(m.id)
  if (inParty) {
    c.hidden = false
    c.hold(false)
    c.walkTo(c.x, c.y, 'hop')
  } else scene.remove(c)
  hud.say({ dex: w.dex, emotion: 'Happy', text: inParty ? `Gotcha! ${name} was caught!` : `Gotcha! ${name} was caught and sent to your box.`, auto: 4500 })
  hud.refreshSheet()
  publishParty()
}
canvas.addEventListener('click', (e) => {
  if (!game) return
  const r = canvas.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * W
  const y = ((e.clientY - r.top) / r.height) * H
  if (catching) return throwNow()
  const f = scene.finds.find((f) => Math.abs(f.x - x) < 6 && y > f.y - 9 && y < f.y + 3)
  if (f) {
    const got = game.collectFind(f.id)
    syncFinds()
    if (got) hud.toast(FIND_TEXT[got.kind](got.n))
    hud.refreshSheet()
    return
  }
  const vis = scene.creatures.find((c) => c.visitor && c.state !== 'leave' && Math.abs(c.x - x) < 11 && y > c.y - 26 && y < c.y + 3)
  if (vis) return hud.say({ dex: Number(vis.sp.dex), text: `${vis.visitor}'s ${vis.name} is visiting. ${vis.visitor} is studying too.`, auto: 5000 })
  if (scene.gate && Math.abs(scene.gate.x - x) < 8 && y > scene.gate.y - 13 && y < scene.gate.y + 2) return askBattle()
  const c = scene.creatures.find((c) => c.wildId && !c.hidden && c.state !== 'leave' && Math.abs(c.x - x) < 11 && y > c.y - 26 && y < c.y + 3)
  if (!c) return
  if (game.inSession) return hud.toast(`${c.name} is waiting for your break.`)
  openCatch(c)
})
canvas.addEventListener('mousemove', (e) => {
  if (!game) return
  const r = canvas.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * W
  const y = ((e.clientY - r.top) / r.height) * H
  const over =
    !!catching ||
    scene.finds.some((f) => Math.abs(f.x - x) < 6 && y > f.y - 9 && y < f.y + 3) ||
    scene.creatures.some((c) => c.wildId && !c.hidden && Math.abs(c.x - x) < 11 && y > c.y - 26 && y < c.y + 3)
  canvas.style.cursor = over ? 'pointer' : ''
})
window.addEventListener('keydown', (e) => {
  if (!catching) return
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    throwNow()
  } else if (e.code === 'Escape') cancelCatch()
})

// ---------- the guardian (stage 4) ----------
let guardianC: Creature | null = null
async function placeGuardian() {
  // the gate dungeon's doorway, cut into the cliff to the right of the pier steps
  const d = scene.island.dock
  scene.gate = { x: d.x + d.w + 9, y: d.y0 + 9 }
}
/** The guardian waits at the bottom of the island's gate dungeon (stage 6). */
function askBattle() {
  const isl = game.islandDef
  const g = isl.guardian
  if (game.inSession) return hud.toast('Dungeons are for breaks.')
  const cleared = game.save.guardians.includes(isl.id)
  hud.say({
    dex: g.dex,
    text: cleared ? `The way into the dungeon. ${game.name(g.dex)} is beaten, but you can go back in.` : `${game.name(g.dex)} is ${g.where}. Go down with your party?`,
    actions: [
      { label: 'Enter', primary: true, run: () => (location.href = `${import.meta.env.BASE_URL}dungeon.html?id=${isl.dungeon}&gate=${isl.id}`) },
      { label: 'Not now', run: () => {} },
    ],
  })
}
function sailAway(to: string) {
  // a slow fade to open sea, then the other island
  const veil = document.createElement('div')
  veil.style.cssText = 'position:fixed;inset:0;background:var(--sea-page);opacity:0;transition:opacity 1.4s ease;z-index:50;pointer-events:none'
  document.body.append(veil)
  requestAnimationFrame(() => (veil.style.opacity = '1'))
  hud.toast(`Sailing to ${ISLANDS.find((i) => i.id === to)!.name}…`)
  setTimeout(() => location.reload(), 1600)
}

// ---------- friends (stage 5) ----------
function currentScene(): cloud.Scene5 {
  const slots = Object.fromEntries(Object.entries(game.save.decor.slots).filter(([, v]) => v)) as Record<string, string>
  return { island: game.save.island, habitats: game.save.habitats, decor: slots }
}
/** Friends studying now: their Pokémon visit, and you study together (double shells, better odds). */
async function refreshFriends() {
  if (cloud.cloudState() !== 'ready') return
  const { friends } = await cloud.listFriends()
  const studying = friends.filter((f) => f.studying && f.party.length)
  const running = game.save.session?.state === 'running'
  const before = game.together.length
  game.together = running ? studying.map((f) => f.name) : []
  if (running && !before && game.together.length) hud.toast(`Studying with ${game.together[0]}. Shells are doubled.`)
  syncVisitors(studying.slice(0, 2).map((f) => ({ name: f.name, dex: f.party[0].dex })))
}
async function syncVisitors(want: { name: string; dex: number }[]) {
  for (const c of scene.creatures)
    if (c.visitor && c.state !== 'leave' && !want.some((w) => w.name === c.visitor)) {
      const d = scene.island.dock
      c.walkTo(d.x + d.w / 2, d.y1 - 1)
      c.enter('leave', 99)
    }
  for (const w of want) {
    if (scene.creatures.some((c) => c.visitor === w.name && c.state !== 'leave')) continue
    const sp = await ensure(w.dex)
    const d = scene.island.dock
    const c = scene.add(sp, d.x + d.w / 2, d.y1 - 1)
    c.visitor = w.name
    const p = scene.freeSpot({ x: d.x + d.w / 2, y: d.y0 - 22 })
    c.walkTo(p.x, p.y)
  }
}
async function takeGifts() {
  if (game.inSession) return
  const gifts = await cloud.claimGifts()
  for (const g of gifts) {
    const m = game.receive(g.kind, g.payload)
    const what =
      g.kind === 'mon' ? game.name(g.payload.dex ?? 0) : g.kind === 'egg' ? 'an egg' : `${(g.payload.n ?? 1) > 1 ? `${g.payload.n} ` : 'a '}${itemName(g.payload.id ?? '')}${(g.payload.n ?? 1) > 1 ? 's' : ''}`
    hud.say({ dex: m?.dex ?? lead(), emotion: 'Happy', text: `${g.from} sent you ${what}!`, auto: 5000 })
  }
  if (gifts.length) hud.refreshSheet()
}
const itemName = (id: string) =>
  BALLS.find((b) => b.id === id)?.name ?? FOODS.find((f) => f.id === id)?.name ?? (id === 'star-piece' ? 'Star Piece' : id === 'oran-berry' ? 'Oran Berry' : stoneName(id))
async function visitFriend(id: string) {
  if (game.inSession) return hud.toast('Visit between sessions.')
  const sc = await cloud.friendScene(id)
  if (typeof sc === 'string') return hud.toast(sc)
  sessionStorage.setItem('island-visit', JSON.stringify({ ...sc, id }))
  const veil = document.createElement('div')
  veil.style.cssText = 'position:fixed;inset:0;background:var(--sea-page);opacity:0;transition:opacity 1.2s ease;z-index:50;pointer-events:none'
  document.body.append(veil)
  requestAnimationFrame(() => (veil.style.opacity = '1'))
  setTimeout(() => (location.href = `${location.pathname}?visit=1`), 1300)
}
async function sendGift(friendId: string, friendName: string, kind: cloud.GiftKind, ref: string) {
  if (game.inSession) return hud.toast('Send gifts between sessions.')
  let payload: cloud.Gift['payload']
  if (kind === 'mon') {
    const m = game.mon(ref)
    if (!m || !game.canGiveMon(ref)) return hud.toast('That Pokémon cannot be sent.')
    payload = { dex: m.dex, level: m.level }
  } else if (kind === 'egg') {
    const e = game.save.eggs.find((x) => x.id === ref)
    if (!e) return
    payload = { dex: e.dex }
  } else {
    if (game.itemCount(ref) < 1) return
    payload = { id: ref, n: 1 }
  }
  const go = async () => {
    const r = await cloud.sendGift(friendId, kind, payload)
    if (r !== 'ok') return hud.toast(r)
    game.giveAway(kind, ref)
    hud.toast(`Sent to ${friendName}.`)
    hud.refreshSheet()
  }
  if (kind === 'mon')
    hud.say({
      dex: payload.dex,
      text: `Send ${game.name(payload.dex!)} to ${friendName}? It leaves your island for good.`,
      actions: [
        { label: 'Send', primary: true, run: () => void go() },
        { label: 'Keep', run: () => {} },
      ],
    })
  else void go()
}

/** The read-only view of a friend's island. */
async function bootVisit(v: cloud.FriendScene & { id: string }) {
  scene.hour = clockHour()
  scene.setHabitats(v.scene.habitats.filter((h) => ['grass', 'rocks', 'pond', 'cave'].includes(h)) as never)
  scene.setDecor(v.scene.decor)
  for (const p of v.party) {
    const sp = await ensure(p.dex)
    const q = scene.freeSpot()
    scene.add(sp, q.x, q.y)
  }
  const el = document.createElement('div')
  el.className = 'visit-banner px-panel'
  el.innerHTML = `<p>${v.name.replace(/[<>&]/g, '')}'s island</p><p class="hint">${v.studying ? 'Studying now' : 'Not studying right now'}</p><button class="px-btn primary">Go home</button>`
  el.querySelector('button')!.addEventListener('click', () => {
    sessionStorage.removeItem('island-visit')
    location.href = location.pathname
  })
  const hudLayer = document.createElement('div')
  hudLayer.className = 'hud'
  hudLayer.append(el)
  win.append(hudLayer)
  const fitVisit = () => {
    const cw = canvas.clientWidth
    const hs = cw >= 1680 ? 3 : cw >= 560 ? 2 : cw >= 400 ? 1.5 : Math.max(1, cw / 300)
    hudLayer.style.width = `${cw / hs}px`
    hudLayer.style.height = `${canvas.clientHeight / hs}px`
    hudLayer.style.transform = `scale(${hs})`
  }
  fitInto(window)
  window.addEventListener('resize', () => {
    fitInto(window)
    fitVisit()
  })
  new ResizeObserver(fitVisit).observe(canvas)
  fitVisit()
  window.requestAnimationFrame(raf)
}

/** Party life: now and then two Pokémon play together or nap side by side. */
function partyLife() {
  after(25 + Math.random() * 30, partyLife)
  if (catching || evo || game.save.session?.state === 'away') return
  const free = scene.creatures.filter((c) => c.monId && !c.anchor && !c.asleep && (c.state === 'idle' || c.state === 'look'))
  if (free.length < 2) return
  const [a, b] = free.sort(() => Math.random() - 0.5)
  if (Math.random() < 0.6) {
    // play: one runs up to the other, and both hop
    a.walkTo(b.x + (a.x < b.x ? -9 : 9), b.y, 'hop')
    a.onArrive = () => {
      b.dir = a.x < b.x ? 6 : 2
      b.walkTo(b.x, b.y, 'hop')
    }
  } else {
    // nap together in the tree's shade
    const t = scene.island.tree
    const p = { x: t.x - 6, y: t.y + 10 }
    if (!scene.island.walkable(p.x, p.y) || !scene.island.walkable(p.x + 10, p.y)) return
    a.walkTo(p.x, p.y, 'lay')
    b.walkTo(p.x + 10, p.y, 'lay')
  }
}

// ---------- evolution ----------
interface Evo {
  mon: Mon
  to: number
  c: Creature
  t: number
  swapped: boolean
  cancelled: boolean
}
const evoQueue: { mon: Mon; to: number }[] = []
let evo: Evo | null = null
let evoStarting = false
const ease = (k: number) => k * k * (3 - 2 * k)

async function nextEvolution() {
  if (evo || evoStarting) return
  const job = evoQueue.shift()
  if (!job) return
  const c = scene.byMon(job.mon.id)
  if (!c || game.evolutionDue(job.mon) !== job.to) return nextEvolution()
  evoStarting = true
  await ensure(job.to)
  evoStarting = false
  evolving.add(job.mon.id)
  c.hold(true)
  const e: Evo = { ...job, c, t: 0, swapped: false, cancelled: false }
  evo = e
  hud.say({
    dex: job.mon.dex,
    emotion: 'Happy',
    text: `${game.name(job.mon)} is evolving.`,
    actions: [
      {
        label: 'Stop it',
        run: () => {
          if (e.swapped) return
          e.cancelled = true
          game.stopEvolution(e.mon)
          hud.say({
            dex: e.mon.dex,
            text: `${game.name(e.mon)} stopped evolving.`,
          })
        },
      },
    ],
  })
}
function stepEvolution(dt: number) {
  if (!evo) return
  const e = evo
  e.t += dt
  if (e.cancelled) {
    e.c.white = Math.max(0, e.c.white - dt)
    if (e.c.white <= 0) finishEvolution()
    return
  }
  // the glow rises over 1.6 s, holds, the form changes, and it settles over 2.2 s
  if (e.t < 1.6) e.c.white = ease(e.t / 1.6)
  else if (e.t < 2.4) e.c.white = 1
  else {
    if (!e.swapped) {
      e.swapped = true
      const from = game.name(e.mon)
      game.evolve(e.mon, e.to)
      e.c.setSpecies(species.get(e.to)!)
      publishParty()
      hud.dismiss()
      hud.say({ dex: e.to, emotion: 'Happy', text: `${from} evolved into ${game.name(e.to)}.`, auto: 5000 })
    }
    const k = (e.t - 2.4) / 2.2
    e.c.white = 1 - ease(Math.min(1, k))
    if (k >= 1) {
      e.c.white = 0
      e.c.hold(false)
      e.c.walkTo(e.c.x, e.c.y, 'hop')
      finishEvolution()
    }
  }
}
function finishEvolution() {
  if (!evo) return
  evolving.delete(evo.mon.id)
  if (evo.cancelled) evo.c.hold(false)
  evo = null
  nextEvolution()
}
function queueEvolution(mon: Mon, to: number) {
  if (evoQueue.some((j) => j.mon.id === mon.id) || evo?.mon.id === mon.id) return
  evoQueue.push({ mon, to })
  nextEvolution()
}

// ---------- online (T2) ----------
function publishParty() {
  if (!game) return
  cloud.publish(
    game.party.map((m) => ({ dex: m.dex, level: m.level })),
    game.save.caught.length,
  )
}
async function showWaves() {
  if (game.inSession) return
  const names = await cloud.collectWaves()
  if (!names.length) return
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  hud.say({ dex: lead(), emotion: 'Happy', text: `${who} waved.`, auto: 5000 })
}

// ---------- decorations ----------
function decorSlotOf(id: string) {
  return Object.entries(game.save.decor.slots).find(([, v]) => v === id)?.[0]
}
function freeSlotAfter(from?: string) {
  const ids = SLOTS.filter((s) => game.hoursOk(s.minHours)).map((s) => s.id)
  const start = from ? ids.indexOf(from) + 1 : 0
  for (let i = 0; i < ids.length; i++) {
    const id = ids[(start + i) % ids.length]
    if (!game.save.decor.slots[id]) return id
  }
  return undefined
}
function saveDecor() {
  game.persist()
  cloud.publishScene(currentScene())
  scene.setDecor(game.save.decor.slots)
  hud.refreshSheet()
}

// ---------- game events ----------
function onGame(e: GameEvent) {
  switch (e.type) {
    case 'sessionStart':
      hud.toast('Session started.')
      void refreshFriends()
      cancelCatch()
      scene.markWild = false
      syncSleep()
      void cloud.sessionBegin()
      break
    case 'sessionEnd':
      hud.clearQueue((d) => d.text.includes('still studying'))
      void cloud.sessionEnd()
      if (e.complete)
        hud.toast(`${fmtMinutes(e.minutes)} focused. ${e.berries === 2 ? 'Two berries' : 'A berry'} ripened.`)
      else
        hud.say({
          dex: lead(),
          text: `${fmtMinutes(e.minutes)} focused.`,
          auto: 5000,
        })
      syncSleep()
      scene.markWild = true
      if (game.save.wild.length)
        after(e.complete ? 2.5 : 1, () => {
          const n = game.save.wild.length
          if (n) hud.say({ dex: game.save.wild[0].dex, text: n === 1 ? `${game.name(game.save.wild[0].dex)} is waiting. Tap it to throw a ball.` : `${n} Pokémon are waiting. Tap one to throw a ball.`, auto: 5500 })
        })
      after(6, () => void showWaves())
      game.together = []
      after(8, () => void takeGifts())
      break
    case 'passer':
      void spawnWild(e.wild, true)
      hud.toast(`${game.name(e.wild.dex)} came by.`)
      break
    case 'wildLeave':
      for (const id of e.ids) {
        const c = wildCreature(id)
        if (c) wildLeaves(c)
      }
      break
    case 'find':
      digUp(e.find)
      break
    case 'weather':
      scene.weather = e.kind
      hud.toast(WEATHER_TEXT[e.kind])
      break
    case 'caught':
      if (e.newSpecies) after(4.2, () => hud.toast('New species. A Star Piece!'))
      break
    case 'egg':
      syncNest()
      hud.toast(e.egg.source === 'daycare' ? 'The Day Care pair left an egg.' : e.egg.source === 'find' ? 'An egg turned up. It is in the nest.' : 'An egg arrived. It is in the nest.')
      hud.refreshSheet()
      break
    case 'hatching':
      spawnNext = { x: NEST.x, y: NEST.y }
      break
    case 'hatch':
      syncNest()
      hud.say({ dex: e.mon.dex, emotion: 'Happy', text: `An egg hatched. It is ${game.name(e.mon)}!`, auto: 5000 })
      if (!game.save.party.includes(e.mon.id)) spawnNext = null
      hud.refreshSheet()
      break
    case 'job':
      if (e.job === 'bush') hud.toast(`${game.name(e.mon)} watered the bush. A berry ripened.`)
      hud.refreshSheet()
      break
    case 'expeditionOut':
      hud.toast(`${game.name(e.mon)} set off.`)
      break
    case 'expeditionBack':
      hud.say({ dex: e.mon.dex, emotion: 'Happy', text: `${game.name(e.mon)} came back with ${haulText(e.haul)}.`, auto: 7000 })
      hud.refreshSheet()
      break
    case 'sail':
      sailAway(e.to)
      break
    case 'guardian':
      break
    case 'rolesChanged':
      syncNest()
      applyAnchors()
      hud.refreshSheet()
      break
    case 'habitat':
      cloud.publishScene(currentScene())
      scene.setHabitats(game.save.habitats)
      hud.toast(`${HABITATS.find((h) => h.id === e.id)!.name} built.`)
      break
    case 'bait':
      scene.setBait(e.food)
      break
    case 'visit':
      after(1.2, () => runVisit(e.rareMult))
      break
    case 'visitCapped':
      hud.say({ dex: lead(), text: 'No more visitors today. Your party still grows.', auto: 6000 })
      break
    case 'stone':
      hud.say({
        dex: lead(),
        emotion: 'Happy',
        text: `${e.streak} days in a row. ${aStone(e.item).replace(/^a/, 'A')} washed ashore.`,
        auto: 7000,
      })
      break
    case 'fed':
      hud.toast(
        e.levels
          ? `${game.name(e.mon)} grew to level ${e.mon.level}.`
          : `${game.name(e.mon)} gained ${10} EXP.`,
      )
      {
        const c = scene.byMon(e.mon.id)
        if (c && !c.asleep) c.walkTo(c.x, c.y, 'hop')
        if (game.evolutionDue(e.mon)) hud.say({ dex: e.mon.dex, emotion: 'Happy', text: `${game.name(e.mon)} evolves when you next focus.`, auto: 5000 })
      }
      publishParty()
      break
    case 'levelUp': {
      const c = scene.byMon(e.mon.id)
      publishParty()
      if (!game.inSession) break // berries announce their own level-ups
      hud.toast(`${game.name(e.mon)} grew to level ${e.mon.level}.`)
      if (c && !c.asleep && !evolving.has(e.mon.id) && c.state !== 'still') c.walkTo(c.x, c.y, 'hop')
      break
    }
    case 'evolveReady':
      queueEvolution(e.mon, e.to)
      break
    case 'minute':
      // a Pokémon you allowed to evolve again catches up at the next focused minute
      for (const m of game.party) {
        const to = game.evolutionDue(m)
        if (to) queueEvolution(m, to)
      }
      break
    case 'ask':
      hud.say({
        dex: lead(),
        text:
          e.reason === 'idle'
            ? 'Still studying?'
            : 'Still studying?',
        actions: [{ label: 'I am still here', primary: true, run: () => game.answerStillHere() }],
      })
      break
    case 'away': {
      void cloud.sessionEnd()
      if (hud.busy && hud.currentText.includes('still studying')) hud.dismiss()
      hud.clearQueue((d) => d.text.includes('still studying'))
      syncSleep()
      const why =
        e.reason === 'gap'
          ? 'Paused while you were away.'
          : e.reason === 'locked'
            ? 'Screen locked. The clock paused.'
            : `The clock paused.${e.retractedMin ? ` The last ${fmtMinutes(e.retractedMin)} did not count.` : ''}`
      hud.say({ dex: lead(), text: why, auto: 7000 })
      break
    }
    case 'back':
      void cloud.sessionBegin()
      if (hud.busy && hud.currentText.includes('still studying')) hud.dismiss()
      hud.toast('Welcome back.')
      syncSleep()
      break
    case 'partyChanged':
      syncParty()
      syncWild()
      syncFinds()
      scene.setDecor(game.save.decor.slots)
      hud.refreshSheet()
      publishParty()
      break
  }
}

// ---------- step-away detection ----------
const presence: PresenceHandlers = {
  idle: () => game.ask('idle'),
  locked: () => game.goAway('locked'),
  active: () => {
    const s = game.save.session
    if (s?.state === 'asking') game.answerStillHere()
    else if (s?.state === 'away') game.comeBack()
  },
}

// ---------- loop ----------
let host: Window = window
let last = performance.now()
let lastFrameAt = last
let lastRenderAt = 0

function tick(dt: number) {
  const target = hourOverride ?? clockHour()
  const diff = target - scene.hour
  scene.hour += Math.abs(diff) > 6 ? diff : Math.sign(diff) * Math.min(Math.abs(diff), dt * 2)
  scene.update(dt)
  runTimers()
  stepEvolution(dt)
  catching?.update(dt)
}
function frame(now: number) {
  lastFrameAt = now
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  tick(dt)
  // night frames carry a per-pixel lighting pass, so draw them at 30 fps
  if (nightness(scene.hour) <= 0.04 || now - lastRenderAt >= 32) {
    lastRenderAt = now
    scene.render(g, dt)
  }
  hud?.update()
}
function raf(now: number) {
  frame(now)
  host.requestAnimationFrame(raf)
}
setInterval(() => {
  const now = performance.now()
  if (now - lastFrameAt > 200) frame(now)
}, 250)
// The focus clock: one beat a second, plus one whenever the page wakes. When
// the island is open in two windows (a plain pop-out beside the page), a Web
// Lock lets only one of them run the clock; the other mirrors the save.
let clockOwner = !('locks' in navigator)
if ('locks' in navigator) navigator.locks.request('island-clock', () => ((clockOwner = true), new Promise<void>(() => {})))
setInterval(() => {
  if (clockOwner) game?.beat()
  if (game && scene.weather !== game.weather) scene.weather = game.weather
  if (game) syncNest()
}, 1000)
// the page around the canvas takes the open sea's colour as the light changes, so there is no seam
if (!floatMode)
  setInterval(() => {
    if (host !== window) return
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data
    document.documentElement.style.setProperty('--sea-page', `rgb(${r},${gg},${b})`)
  }, 1000)
document.addEventListener('visibilitychange', () => clockOwner && game?.beat())
window.addEventListener('storage', (e) => {
  if (e.key !== 'island-save-v1' || !game) return
  game.reload()
  syncParty()
  syncSleep()
  syncWild()
  syncFinds()
})

// ---------- pop out ----------
declare global {
  interface Window {
    documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Window>; window: Window | null }
    __island: unknown
  }
}
function fitInto(w: Window) {
  const raw = Math.min(w.innerWidth / W, w.innerHeight / H)
  const s = raw >= 2 ? Math.floor(raw) : Math.max(1, raw)
  canvas.style.width = `${W * s}px`
  canvas.style.height = `${H * s}px`
  hud?.fit(canvas)
}
function plainPopOut() {
  window.open(`${location.pathname}?popout`, 'island', `width=${W * 2},height=${H * 2}`)
  hud.toast('This browser cannot keep windows on top.')
}
async function popOut() {
  const dpip = window.documentPictureInPicture
  if (!dpip) return plainPopOut()
  if (dpip.window) return
  let pip: Window
  try {
    pip = await dpip.requestWindow({ width: W * 2, height: H * 2 })
  } catch {
    return plainPopOut()
  }
  // carry the page's styles and fonts into the new window
  for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"], link[rel="preconnect"]')) pip.document.head.append(node.cloneNode(true))
  pip.document.body.className = 'pip-body'
  const marker = document.createComment('island')
  win.before(marker)
  pip.document.body.append(win)
  fitInto(pip)
  pip.addEventListener('resize', () => fitInto(pip))
  host = pip
  host.requestAnimationFrame(raf)
  pip.addEventListener('pagehide', () => {
    marker.replaceWith(win)
    host = window
    window.requestAnimationFrame(raf)
    fitInto(window)
  })
}
app.querySelector('[data-act="popout"]')?.addEventListener('click', popOut)

// ---------- debug panel ----------
function buildDebug() {
  const el = app.querySelector<HTMLElement>('.debug')
  if (!el) return
  const b = (id: string, label: string) => `<button class="btn" data-d="${id}">${label}</button>`
  el.innerHTML = `
    <p class="debug-title">Demo controls</p>
    <div class="debug-row">${b('m1', 'Add 1 focused minute')}${b('m10', 'Add 10 minutes')}${b('m60', 'Add 60 minutes')}${b('finish', 'Finish the session')}</div>
    <div class="debug-row">${b('berries', 'Add 3 berries')}${b('shells', 'Add 300 shells')}${b('stone', 'A stone washes ashore')}${b('bond', 'Lead has 10 hours of bond')}${b('visit50', 'Visitor at 50-minute odds')}</div>
    <div class="debug-row">${b('visit', 'Visitor now')}${b('evolve', 'Lead is ready to evolve')}${b('checkin', 'Ask now')}${b('idle', 'Simulate 10 idle minutes')}${b('lock', 'Simulate screen lock')}${b('active', 'Simulate activity')}${b('gap', 'Simulate a 10 minute sleep')}</div>
    <div class="debug-row">${b('passer', 'Passer-by now')}${b('find', 'A find now')}${b('balls', '+5 of each ball')}${b('stars', '+5 Star Pieces')}${b('night', 'Night')}${b('egg', 'An egg')}${b('hatch', 'Eggs nearly ready')}</div><div class="debug-row">${b('m30', 'Add 30 minutes')}${b('hours', '+5 focused hours (days)')}${b('strong', 'Party to Lv 34')}${b('dexfill', 'Catch 70% of this dex')}${b('fakefriend', 'A friend studies too')}${b('fakegift', 'A gift arrives')}${b('w-rain', 'Rain')}${b('w-fog', 'Fog')}${b('w-sun', 'Sun')}${b('w-clear', 'Clear sky')}</div>
    <div class="debug-row"><label class="time"><span>Hour</span><input type="range" min="0" max="24" step="0.1" value="${clockHour()}" /><output></output></label>${b('clock', 'Use my clock')}${b('reset', 'Reset save')}</div>`
  const slider = el.querySelector<HTMLInputElement>('input')!
  const out = el.querySelector('output')!
  slider.addEventListener('input', () => {
    hourOverride = Number(slider.value)
    out.textContent = slider.value
  })
  el.addEventListener('click', (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-d]')?.dataset.d
    if (!d || !game.hasStarter) return
    const s = () => game.save.session
    if (d === 'm1') game.grantMinutes(1)
    if (d === 'm10') game.grantMinutes(10)
    if (d === 'm60') game.grantMinutes(60)
    if (d === 'finish') {
      if (!s()) game.startSession()
      const ss = s()!
      if (ss.length) game.grantMinutes(Math.ceil((ss.length - ss.credited) / 60))
      else game.endSession(true)
    }
    if (d === 'visit') runVisit()
    if (d === 'visit50') runVisit(RARE_50)
    if (d === 'berries') game.save.berries += 3
    if (d === 'shells') game.save.shells += 300
    if (d === 'stone') {
      const useful = STONES.filter((st) => game.save.mons.some((m) => game.evolutionOptions(m).some((x) => x.item === st)))
      const item = (useful.length ? useful : STONES)[Math.floor(Math.random() * (useful.length || STONES.length))]
      game.save.bag[item] = (game.save.bag[item] ?? 0) + 1
      hud.toast(`${aStone(item).replace(/^a/, 'A')} washed ashore.`)
    }
    if (d === 'passer') game.passerBy()
    if (d === 'find') game.dig()
    if (d === 'balls') for (const bb of BALLS) game.save.balls[bb.id] += 5
    if (d === 'stars') game.save.starPieces += 5
    if (d === 'night') hourOverride = 22
    if (d === 'egg') game.addEgg(16, 'find')
    if (d === 'hatch') for (const eg of game.save.eggs) eg.progress = eg.need - 1
    if (d === 'm30') game.grantMinutes(30)
    if (d === 'hours') {
      const k = '2000-01-01'
      game.save.days[k] = (game.save.days[k] ?? 0) + 300
    }
    if (d === 'fakefriend') {
      game.together = game.save.session ? ['Mina'] : []
      void syncVisitors([{ name: 'Mina', dex: 25 }])
      hud.toast(game.together.length ? 'Studying with Mina. Shells are doubled.' : 'Mina is visiting.')
    }
    if (d === 'fakegift') {
      for (const [kind, payload] of [['mon', { dex: 133, level: 12 }], ['egg', { dex: 393 }], ['item', { id: 'ultra-ball', n: 2 }]] as const) {
        const m = game.receive(kind, payload)
        hud.say({ dex: m?.dex ?? lead(), emotion: 'Happy', text: `Mina sent you ${kind === 'mon' ? game.name(133) : kind === 'egg' ? 'an egg' : '2 Ultra Balls'}!`, auto: 4000 })
      }
    }
    if (d === 'strong') for (const m of game.party) { m.level = Math.max(m.level, 34); m.noEvolve = true }
    if (d === 'dexfill') {
      const dx = game.dexOf(game.save.island)
      for (const sp of dx.all.slice(0, Math.ceil(dx.all.length * 0.7))) if (!game.save.caught.includes(sp)) game.save.caught.push(sp)
    }
    if (d.startsWith('w-')) {
      const kind = d.slice(2) as Weather
      game.save.weather = { kind, until: kind === 'clear' ? 0 : Date.now() + 20 * 60 * 1000 }
      scene.weather = game.weather
      hud.toast(WEATHER_TEXT[kind])
    }
    if (d === 'bond' && game.party[0]) game.party[0].focusedMin = Math.max(game.party[0].focusedMin, 600)
    game.persist()
    hud.refreshSheet()
    if (d === 'evolve') {
      const m = game.party[0]
      const next = m && game.species(m.dex)?.evolvesTo.find((x) => x.level)
      if (m && next?.level) {
        m.noEvolve = false
        m.level = next.level - 1
        m.exp = m.level - 1
        game.grantMinutes(1)
      }
    }
    if (d === 'checkin') {
      if (!s()) game.startSession()
      game.ask('checkin')
    }
    if (d === 'idle') {
      if (!s()) game.startSession()
      game.ask('idle')
    }
    if (d === 'lock') game.goAway('locked')
    if (d === 'active') presence.active()
    if (d === 'gap' && s()) {
      s()!.lastBeat -= 10 * 60 * 1000
      game.beat()
    }
    if (d === 'clock') hourOverride = null
    if (d === 'reset') {
      game.reset()
      location.reload()
    }
  })
}

// ---------- boot ----------
async function boot() {
  if (visitData) {
    const [m] = await Promise.all([loadManifest()])
    manifest = m
    return bootVisit(visitData)
  }
  const [m, roster] = await Promise.all([loadManifest(), fetch(import.meta.env.BASE_URL + `data/roster.json?v=${__BUILD__}`).then((r) => r.json())])
  manifest = m
  game = new Game((roster as { species: Roster }).species)
  // fire types light up the dark around them
  for (const [k, sp] of Object.entries((roster as { species: Roster }).species)) if (sp.types?.includes('fire')) scene.glowDex.add(k.padStart(4, '0'))
  scene.hour = clockHour()

  hud = new Hud(
    win,
    game,
    {
      start: () => game.startSession(),
      end: () => {
        const s = game.save.session
        if (!s) return
        if (!s.length) return game.endSession(true)
        hud.say({
          dex: lead(),
          text: 'End now? Visitors only come after a full session.',
          actions: [
            { label: 'End session', run: () => game.endSession(false) },
            { label: 'Keep going', primary: true, run: () => {} },
          ],
        })
      },
      back: () => game.comeBack(),
      stillHere: () => game.answerStillHere(),
      chooseStarter: (dex) => {
        const name = game.name(dex)
        game.chooseStarter(dex)
        // the other two head back into the tall grass
        const gp = scene.island.grassPatch
        candidates.forEach((c, i) => {
          if (c.monId) return
          after(0.6 + i * 0.5, () => {
            c.walkTo(gp.x + 1, gp.y - 4)
            c.enter('leave', 99)
          })
        })
        candidates = []
        after(2.4, () => scene.rustleGrass(1.4))
        hud.say({ dex, emotion: 'Happy', text: `${name} will study with you.` })
      },
      setLength: (sec) => {
        game.save.settings.length = sec
        game.persist()
      },
      toggleParty: (id, on) => {
        if (!game.setInParty(id, on)) hud.toast('Change your party between sessions.')
      },
      feed: (id) => {
        if (!game.feed(id)) hud.toast(game.inSession ? 'Feed between sessions.' : 'No berries yet.')
        hud.refreshSheet()
      },
      giveStone: (id, item) => {
        const m = game.mon(id)
        if (m && game.giveStone(id, item)) hud.say({ dex: m.dex, text: `${game.name(m)} evolves when you next focus.`, auto: 5000 })
        hud.refreshSheet()
      },
      takeStone: (id) => {
        game.takeStone(id)
        hud.refreshSheet()
      },
      buyDecor: (id) => {
        const d = decorDef(id)
        if (!d || game.inSession || game.save.decor.owned.includes(id)) return
        if (!game.spendShells(d.price)) return hud.toast('Not enough shells.')
        game.save.decor.owned.push(id)
        const slot = freeSlotAfter()
        if (slot) game.save.decor.slots[slot] = id
        hud.toast(slot ? `Placed.` : `Bought. Put something away to make room.`)
        saveDecor()
      },
      placeDecor: (id) => {
        const slot = freeSlotAfter()
        if (!slot || game.inSession) return
        game.save.decor.slots[slot] = id
        saveDecor()
      },
      moveDecor: (id) => {
        const from = decorSlotOf(id)
        const to = freeSlotAfter(from)
        if (!from || !to || game.inSession) return hud.toast('No free spot.')
        game.save.decor.slots[from] = null
        game.save.decor.slots[to] = id
        saveDecor()
      },
      storeDecor: (id) => {
        const from = decorSlotOf(id)
        if (!from || game.inSession) return
        game.save.decor.slots[from] = null
        saveDecor()
      },
      cloud: {
        state: cloud.cloudState,
        me: cloud.whoami,
        friends: cloud.listFriends,
        signIn: cloud.signIn,
        signOut: cloud.signOut,
        claimName: cloud.claimName,
        request: cloud.requestFriend,
        answer: cloud.answerRequest,
        wave: cloud.wave,
      },
      allowEvolution: (id) => {
        const mon = game.mon(id)
        if (mon) game.allowEvolution(mon)
        hud.toast('It evolves next session.')
      },
      enableIdle: async () => {
        const ok = await enableIdleDetection(presence)
        game.save.settings.detector = ok
        game.persist()
        hud.refreshSheet()
        if (!ok) hud.toast('Idle detection is off.')
      },
      challenge: askBattle,
      visit: (id) => void visitFriend(id),
      gift: (id, name, kind, ref) => void sendGift(id, name, kind, ref),
      sail: (to) => {
        if (!game.sail(to)) hud.toast(game.inSession ? 'Sail between sessions.' : 'Not yet.')
      },
      assign: (id, role) => {
        if (!game.assign(id, role)) hud.toast(game.inSession ? 'Change roles between sessions.' : 'That spot is taken.')
        hud.refreshSheet()
      },
      expedition: (id, long) => {
        if (!game.sendExpedition(id, long)) hud.toast(game.inSession ? 'Send them off between sessions.' : 'Someone is already away.')
        hud.refreshSheet()
      },
      buildHabitat: (id) => {
        if (!game.buildHabitat(id)) hud.toast(game.inSession ? 'Build between sessions.' : 'Not enough Star Pieces or shells.')
        hud.refreshSheet()
      },
      buyFood: (id, n) => {
        if (!game.buyFood(id, n)) hud.toast(game.inSession ? 'The shop opens between sessions.' : 'Not enough shells.')
        hud.refreshSheet()
      },
      setBait: (id) => {
        if (game.setBait(id)) hud.toast(`${FOODS.find((f) => f.id === id)!.name} is out until your session ends.`)
        hud.refreshSheet()
      },
      buyBall: (b, n) => {
        if (!game.buyBall(b, n)) hud.toast(game.inSession ? 'The shop opens between sessions.' : 'Not enough shells.')
        else hud.toast(`${n === 1 ? 'A' : n} ${BALLS.find((x) => x.id === b)!.name}${n === 1 ? '' : 's'}.`)
      },
      popOut: popoutMode ? undefined : popOut,
      quit: tauri ? () => void invoke?.('plugin:window|close', { label: 'main' }) : undefined,
    },
    creditsHtml,
  )
  game.on(onGame)
  new ResizeObserver(() => hud.fit(canvas)).observe(canvas)
  {
    fitInto(window)
    window.addEventListener('resize', () => host === window && fitInto(window))
  }

  if (!game.hasStarter) {
    const sps = await Promise.all(STARTERS.map(ensure))
    const spots: [number, number][] = [
      [112, 82],
      [138, 100],
      [100, 108],
    ]
    candidates = sps.map((sp, i) => scene.add(sp, spots[i][0], spots[i][1]))
    hud.showStarter(STARTERS)
  } else {
    await syncParty(true)
  }
  // the desktop app reads system idle time natively (no permission prompt)
  if (tauri && invoke) {
    game.save.settings.detector = true
    let wasIdle = false
    setInterval(async () => {
      const idle = Number(await invoke('idle_seconds').catch(() => 0))
      if (idle >= 600 && !wasIdle) {
        wasIdle = true
        presence.idle()
      } else if (idle < 5 && wasIdle) {
        wasIdle = false
        presence.active()
      }
    }, 5000)
  } else if (game.save.settings.detector) {
    const ok = await startIdleDetection(presence)
    if (!ok) {
      game.save.settings.detector = false
      game.persist()
    }
  }
  scene.setDecor(game.save.decor.slots)
  scene.setHabitats(game.save.habitats)
  scene.setBait(game.save.bait)
  void placeGuardian()
  game.hour = () => hourOverride ?? clockHour()
  syncWild()
  syncFinds()
  scene.weather = game.weather
  after(20, partyLife)
  if (clockOwner) game.beat() // settles any time that passed while the island was closed
  void cloud.initCloud().then(() => {
    cloud.onCloud(() => hud.refreshSheet())
    hud.refreshSheet()
    publishParty()
    cloud.publishScene(currentScene())
    if (game.inSession && game.save.session?.state === 'running') void cloud.sessionBegin()
    else void showWaves()
    void takeGifts()
    void refreshFriends()
    setInterval(() => void refreshFriends(), 120_000)
    setInterval(() => void takeGifts(), 300_000)
  })
  syncSleep(true)
  buildDebug()
  window.requestAnimationFrame(raf)
}

function creditsHtml() {
  const names = (xs: { name: string }[]) => xs.map((a) => a.name).join(', ')
  const rows = Object.values(manifest.species)
    .map((s) => `<li><strong>${s.name}</strong> ${names(s.credits.sprite)} / ${names(s.credits.portrait)}</li>`)
    .join('')
  return `<p>PMD Sprite Repository, CC BY-NC 4.0. Sprite / portrait artists:</p><ul>${rows}</ul>`
}

window.__island = {
  get game() {
    return game
  },
  get hud() {
    return hud
  },
  get guardian() {
    return guardianC
  },
  placeGuardian: () => placeGuardian(),
  scene,
  /** Advance the island by `sec` seconds of simulation (not the focus clock). */
  step: (sec: number) => {
    for (let t = 0; t < sec; t += 1 / 30) {
      lastFrameAt = performance.now()
      tick(1 / 30)
    }
    scene.render(g, 1 / 30)
    hud.update()
  },
  setHour: (h: number | null) => (hourOverride = h),
  shot: (name = 'shot') =>
    import.meta.env.DEV ? fetch(`/__shot?name=${name}`, { method: 'POST', body: canvas.toDataURL('image/png') }).then((r) => r.text()) : null,
  runVisit,
}

boot()
