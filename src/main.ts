// T1: the first playable slice. You pick a starter, start a focus session,
// your party gains 1 EXP per verified focused minute, evolves at the real
// levels, and a visitor comes out of the tall grass when a session finishes.
import './styles.css'
import { Creature } from './creature'
import * as cloud from './cloud'
import { CATALOG, SLOTS, decorDef } from './decor'
import { BALLS, Ball, DESTINATIONS, FOODS, Find, GUIDE_DEX, isMeteorWeek, seasonOf, Game, GameEvent, RESTORE, dayKey, HABITATS, Haul, ISLANDS, JOBS, DUNGEON_NUDGE, MAX_SESSION, Mon, RARE_LONG, Role, Roster, STONES, Weather, Wild, aStone, loadSave, stoneName } from './game'
import { CRATER_SPOT, DRAWN_LANDMARKS, LANDMARK_SPOTS, craterArt, landmarkArt } from './landmarks'
import { HABITAT_SPOTS } from './habitats'
import { CatchAnim } from './catch'
import { Intro } from './intro'
import { Tour, blackScreen, liftBlack, runPrologue } from './tutorial'
import { Dialog, Hud, fmtMinutes, hudScale } from './hud'
import type { BubbleKind } from './scene'
import { createArrange } from './arrange'
import { CURSOR } from './cursors'
import { H, SEA_ROCKS, W, seaCss, seaEdge, useIsland, useSeason } from './island'
import { loadNature } from './nature'
import { PresenceHandlers, enableIdleDetection, startIdleDetection } from './presence'
import { applyVolume, audioState, initAudio, listenIn, sfx, syncMusic, wantsMusic, type SfxName } from './audio'
import { NEST, Scene, lightAt, nightness } from './scene'
import { GUIDE, TIPS_PER_BREAK, nextTip } from './guide'
import { Manifest, Species, loadManifest, loadSpecies } from './sprites'

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
app.innerHTML = `<div class="pip-stage${floatMode ? ' float' : ''}${floatMode && !tauri ? ' float-preview' : ''}${popoutMode ? '' : ' page'}"><div class="window"><canvas class="stage"></canvas>${tauri ? '<div class="float-grip" data-tauri-drag-region title="Drag to move"></div>' : ''}</div></div>${debug && !popoutMode ? `<section class="debug"></section>` : ''}`
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
let arrange: ReturnType<typeof createArrange>
// the island you are on decides the palette before anything is painted
useIsland(visitData ? visitData.scene.island : (loadSave().island ?? 'home'))
useSeason(seasonOf(Date.now()), visitData ? visitData.scene.island : (loadSave().island ?? 'home'))
// the nature pieces (Flurmimon's tileset) load before anything is painted
await loadNature()
const scene = new Scene()
scene.overlay = (gg) => catching?.draw(gg)
// the traveller back from its trip shows a green bubble at a break (2026-11-18)
scene.statusOf = (c) => (game && !game.inSession && c.monId && c.monId === game.save.homecoming?.id ? 'collect' : null)
// every load opens under a bank of clouds that part to reveal the island. They are drawn on
// their own layer the size of the whole window (in island pixels, aligned with the canvas), so
// the page around the island is covered too and no frame of open sea shows (Paul, 2026-11-11).
// In float mode the window is the desktop, so the clouds stay the size of the island.
const introCanvas = document.createElement('canvas')
introCanvas.className = 'intro-layer'
const introCtx = introCanvas.getContext('2d')!
let introKey = ''
/** `hold` > 0 starts the clouds hidden behind the prologue's black screen for that long. */
function startIntro(hold = 0) {
  introKey = ''
  scene.intro = new Intro(W, H) // resized to the window on its first frame
  scene.intro.t = -hold
}
// a new player starts on the prologue's black screen (tutorial.ts); everyone else under the clouds
const newPlayer = !visitData && !floatMode && (loadSave().tutorial ?? 'prologue') === 'prologue'
const black = newPlayer ? blackScreen(app.querySelector<HTMLElement>('.pip-stage')!) : null
const arrived = !newPlayer && arriveBySea()
if (!newPlayer && !arrived) startIntro()
let tour: Tour | null = null
/** The layer's size in island pixels: the window, rounded so the island's pixels line up. */
function introSize(): [number, number] {
  if (floatMode) return [W, H]
  const s = canvas.clientWidth / W || 1
  const stage = canvas.closest<HTMLElement>('.pip-stage, .pip-body') ?? document.body
  const ow = W + 2 * Math.ceil(Math.max(0, stage.clientWidth / s - W) / 2 + 1)
  const oh = H + 2 * Math.ceil(Math.max(0, stage.clientHeight / s - H) / 2 + 1)
  return [ow, oh]
}
// the darkest water only at the very edge of the window: a dithered band on its own layer,
// above the island and below the menus, in island pixels (Paul, 2026-11-11)
const edgeCanvas = document.createElement('canvas')
edgeCanvas.className = 'sea-edge'
let edgeKey = ''
let edgeRgb: number[] | null = null
function drawEdge(rgb: number[] | null = edgeRgb) {
  if (!rgb) return
  edgeRgb = rgb
  if (floatMode || !canvas.clientWidth) return
  const stage = canvas.closest<HTMLElement>('.pip-stage, .pip-body')
  if (!stage) return
  const [ow, oh] = introSize()
  const s = canvas.clientWidth / W
  const cr = canvas.getBoundingClientRect()
  const sr = stage.getBoundingClientRect()
  const key = `${ow}x${oh}@${s}:${cr.left - sr.left},${cr.top - sr.top}:${rgb.join(',')}`
  if (key === edgeKey) return
  edgeKey = key
  if (edgeCanvas.parentElement !== stage) stage.append(edgeCanvas)
  edgeCanvas.width = ow
  edgeCanvas.height = oh
  // the layer is bigger than the window; measure the band from the window's own edges
  const ox = Math.max(0, Math.round(((ow - W) / 2) * s - (cr.left - sr.left)) / s)
  const oy = Math.max(0, Math.round(((oh - H) / 2) * s - (cr.top - sr.top)) / s)
  const vw = sr.width / s
  const vh = sr.height / s
  Object.assign(edgeCanvas.style, {
    width: `${ow * s}px`,
    height: `${oh * s}px`,
    left: `${cr.left - sr.left - ((ow - W) / 2) * s}px`,
    top: `${cr.top - sr.top - ((oh - H) / 2) * s}px`,
  })
  const img = new ImageData(ow, oh)
  const BAND = 9
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      const d = Math.min(x - ox, y - oy, ox + vw - 1 - x, oy + vh - 1 - y)
      const a = Math.max(0, Math.min(1, (BAND - d) / BAND))
      if (a <= 0 || bayerAt(x, y) >= a) continue
      const i = (y * ow + x) * 4
      img.data[i] = rgb[0]
      img.data[i + 1] = rgb[1]
      img.data[i + 2] = rgb[2]
      img.data[i + 3] = 255
    }
  edgeCanvas.getContext('2d')!.putImageData(img, 0, 0)
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
const bayerAt = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)]

const hexRgb = (css: string) => css.match(/\d+/g)!.map(Number)
function drawIntro() {
  const intro = scene.intro
  if (!intro) {
    if (introCanvas.isConnected) introCanvas.remove()
    return
  }
  const stage = canvas.closest<HTMLElement>('.pip-stage, .pip-body')
  if (!stage || !canvas.clientWidth) return
  // match the window; a rebuild keeps the clock, so a resize never restarts it
  const [sw, sh] = introSize()
  if (sw !== intro.width || sh !== intro.height) {
    const t = intro.t
    scene.intro = new Intro(sw, sh)
    scene.intro.t = t
    return drawIntro()
  }
  if (!introCanvas.isConnected || introCanvas.parentElement !== stage) stage.append(introCanvas)
  const s = canvas.clientWidth / W || 1
  const [ow, oh] = [intro.width, intro.height]
  const cr = canvas.getBoundingClientRect()
  const sr = stage.getBoundingClientRect()
  const key = `${ow}x${oh}@${s}:${cr.left - sr.left},${cr.top - sr.top}`
  if (key !== introKey) {
    introKey = key
    introCanvas.width = ow
    introCanvas.height = oh
    Object.assign(introCanvas.style, {
      width: `${ow * s}px`,
      height: `${oh * s}px`,
      left: `${cr.left - sr.left - ((ow - W) / 2) * s}px`,
      top: `${cr.top - sr.top - ((oh - H) / 2) * s}px`,
    })
  }
  introCtx.clearRect(0, 0, ow, oh)
  intro.draw(introCtx, lightAt(scene.hour))
}
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
let adopt: { dex: number; c: Creature } | null = null
const evolving = new Set<string>()

let spawnNext: { x: number; y: number } | null = null // a hatchling appears at the nest
// Room on the island, counted in bodies: a big Pokémon (Venusaur, Charizard) takes one and a half.
// Paul, 2026-11-12: 14 was "too many, too cluttered". The party always shows; waiting wild ones
// and friends' visitors come next; helpers fill what is left (the rest work off-island).
const ISLAND_CAP = 9
const bodyOf = (dex: number) => ((manifest.species[dex4(dex)]?.shadowSize ?? 1) >= 2 ? 1.5 : 1)
async function syncParty(initial = false) {
  let room =
    ISLAND_CAP -
    game.party.reduce((n, m) => n + bodyOf(m.dex), 0) -
    game.save.wild.reduce((n, w) => n + bodyOf(w.dex), 0) -
    scene.creatures.filter((c) => c.visitor && c.state !== 'leave').length
  const helpers = game.helpersHere.filter((m) => {
    const b = bodyOf(m.dex)
    if (room < b) return false
    room -= b
    return true
  })
  // a traveller back from its trip waits on the island until you collect its finds
  const back = game.save.homecoming ? game.mon(game.save.homecoming.id) : undefined
  const want = [...game.party, ...helpers, ...(back && !game.party.includes(back) && !helpers.includes(back) ? [back] : [])]
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
  syncShiny()
}

/** Helpers stay near their work: the Day Care by the nest, the bush, the campfire, the end of the pier. */
// ---------- small moments (L11) ----------
// residents run down to the pier when you come back after a long time away
const LAST_OPEN = 'island-last-open'
const lastOpen = Number(localStorage.getItem(LAST_OPEN) ?? 0)
setInterval(() => {
  try {
    localStorage.setItem(LAST_OPEN, String(Date.now()))
  } catch {}
}, 60_000)
function welcomeBack() {
  try {
    localStorage.setItem(LAST_OPEN, String(Date.now()))
  } catch {}
  if (!lastOpen || Date.now() - lastOpen < 6 * 3600_000 || game.inSession) return
  const d = scene.dockTop
  after(1.8, () =>
    game.party.forEach((m, i) => {
      const c = scene.byMon(m.id)
      if (c && !c.asleep) c.walkTo(d.x + (i - (game.party.length - 1) / 2) * 9, d.y - 8 - (i % 2) * 6, 'hop')
    }),
  )
}
// the lead dozes off for a moment 45 minutes into a session
let dozedFor = 0
function dozeAt45() {
  const s = game.save.session
  if (!s || s.state !== 'running' || dozedFor === s.startedAt || s.credited < 45 * 60 || s.credited > 46 * 60) return
  dozedFor = s.startedAt
  const lead = game.party[0] && scene.byMon(game.party[0].id)
  if (lead && !lead.asleep && lead.sp.anims.Laying) lead.enter('lay', 60)
}
/** The first break of each week: Wooper names the week's tide, and a meteor shower if there is one (L7). */
function announceTide() {
  if (game.save.tutorial !== 'done') return
  const t = game.tide()
  if (game.save.tideSeen === t.week) return
  game.save.tideSeen = t.week
  game.persist()
  const type = t.type[0].toUpperCase() + t.type.slice(1)
  const rare = t.rare ? ` ${game.name(t.rare)} has been seen nearby too.` : ''
  hud.say({ dex: GUIDE_DEX, text: `This week the tide brings ${type} types.${rare}`, wait: true })
  if (isMeteorWeek(game.now())) hud.say({ dex: GUIDE_DEX, text: 'It is meteor shower week. Clefairy come down at night, and Moon Stones wash up.', wait: true })
  game.note('other', `This week's tide brings ${type} types.`)
}
/** Home Island's landmarks (L1), ruined or restored; the lighthouse glows when a Generator keeps it lit. */
function syncLandmarks() {
  if (game.save.island === 'ember') return scene.setLandmarks([{ ...CRATER_SPOT, art: craterArt() }])
  if (game.save.island !== 'home') return scene.setLandmarks([])
  const next = game.nextLandmark
  const ready = !!next && game.restoreProgress(next.id).ready
  scene.setLandmarks(
    RESTORE.filter((r) => DRAWN_LANDMARKS.has(r.id)).map((r) => {
      const art = landmarkArt(r.id, game.restored(r.id), r.id === 'lighthouse' && game.lighthouseLit)
      return { ...LANDMARK_SPOTS[r.id], art }
    }),
  )
  // the one you can rebuild now shows a gold bubble over it, and Goals gets a gold dot
  // (2026-11-18, Paul: anything that needs you gets a bubble)
  const spot = ready && next && DRAWN_LANDMARKS.has(next.id) ? LANDMARK_SPOTS[next.id] : null
  const art = spot ? landmarkArt(next!.id, false) : null
  landmarkMarks = spot && art ? [{ x: spot.x, y: spot.y - art.ay + firstPainted(art.img) - 2, kind: 'build' }] : []
  syncMarkers()
  hud.setGoalsReady(ready)
  landmarkKey = `${game.save.restored?.join() ?? ''}|${ready}`
}
let landmarkKey = ''
let landmarkMarks: { x: number; y: number; kind: BubbleKind }[] = []
/** Bubbles over fixed things: a landmark ready to rebuild, and the doorway once Wooper has suggested it. */
function syncMarkers() {
  const g = scene.gate
  const go = g && game.save.island === 'home' && !game.save.guardians.includes('home') && game.save.tips?.includes('nudge-dungeon')
  scene.markers = [...landmarkMarks, ...(go ? [{ x: g!.x, y: g!.y - 15, kind: 'quest' as const }] : [])]
}
/**
 * Once you have caught enough and focused enough, Wooper suggests the first dungeon: beating
 * Snorlax opens Frost Isle, more room for a growing Box (2026-11-18, Paul). Once, at a break.
 */
function nudgeDungeon() {
  const s = game.save
  if (s.island !== 'home' || s.guardians.includes('home') || s.tips?.includes('nudge-dungeon')) return false
  if (s.caught.length < DUNGEON_NUDGE.caught || game.totalHours() < DUNGEON_NUDGE.hours) return false
  s.tips = [...(s.tips ?? []), 'nudge-dungeon']
  game.persist()
  syncMarkers()
  hud.say({ dex: GUIDE_DEX, text: 'This island is getting crowded.', wait: true })
  hud.say({ dex: GUIDE_DEX, text: 'There\'s more room on Frost Isle, but Snorlax is asleep at the bottom of Pier Hollow and blocks the way.', wait: true })
  hud.say({
    dex: GUIDE_DEX,
    text: 'The doorway by the pier leads down. Want to try it?',
    actions: [
      { label: 'Go now', primary: true, run: () => askBattle() },
      { label: 'Later', run: () => {} },
    ],
  })
  return true
}
/** The first row of a picture with any paint in it (a ruin's top is empty), so bubbles sit right on it. */
function firstPainted(img: HTMLCanvasElement) {
  const d = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (d[(y * img.width + x) * 4 + 3] > 40) return y
  return 0
}
/** The landmark (Home only) whose picture is under this point, if any. */
/** The walkable point closest to (x, y), for jobs tied to something out at sea. */
function nearestLand(p: { x: number; y: number }) {
  let best = { x: 120, y: 92 }
  let bd = Infinity
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      const d = Math.hypot(x - p.x, y - p.y)
      if (d < bd && scene.island.walkable(x, y)) (bd = d), (best = { x, y })
    }
  return best
}
function landmarkAt(x: number, y: number) {
  if (game.save.island !== 'home') return null
  for (const r of RESTORE) {
    if (!DRAWN_LANDMARKS.has(r.id)) continue
    const s = LANDMARK_SPOTS[r.id]
    const a = landmarkArt(r.id, game.restored(r.id), r.id === 'lighthouse' && game.lighthouseLit)
    if (x >= s.x - a.ax && x < s.x - a.ax + a.img.width && y >= s.y - a.ay && y <= s.y - a.ay + a.img.height) return r
  }
  return null
}
/** Tapping a landmark: Wooper says what it is and what rebuilding it takes. */
function showLandmark(r: (typeof RESTORE)[number]) {
  const name = r.id === 'hut' ? 'the Pokémon Center hut' : r.id === 'lighthouse' ? 'the lighthouse' : 'the old pier'
  const Name = name[0].toUpperCase() + name.slice(1)
  if (game.restored(r.id)) return hud.say({ dex: GUIDE_DEX, emotion: 'Happy', text: `${Name}. ${r.opens}`, auto: 6000 })
  const next = game.nextLandmark
  if (next?.id !== r.id) {
    const before = RESTORE[RESTORE.indexOf(r) - 1]
    return hud.say({ dex: GUIDE_DEX, text: `The storm wrecked ${name} too. We can rebuild it after ${before.id === 'hut' ? 'the hut' : 'the lighthouse'}.`, auto: 6000 })
  }
  const needs = `${r.hours} focused hours, ${r.species} species, ${r.shells.toLocaleString()} shells and ${r.stars} Star Pieces${r.guardian ? ', with Snorlax beaten' : ''}`
  if (game.restoreProgress(r.id).ready)
    return hud.say({
      dex: GUIDE_DEX,
      emotion: 'Happy',
      text: game.inSession ? `We can rebuild ${name} on your next break.` : `We have everything to rebuild ${name}: ${r.shells.toLocaleString()} shells and ${r.stars} Star Pieces.`,
      actions: game.inSession
        ? undefined
        : [
            { label: 'Rebuild', primary: true, run: () => void (game.restore(r.id) || hud.toast('Not yet.')) },
            { label: 'Not now', run: () => {} },
          ],
      auto: game.inSession ? 5000 : undefined,
    })
  hud.say({
    dex: GUIDE_DEX,
    text: `The storm wrecked ${name}. Rebuilding it takes ${needs}.`,
    actions: [
      { label: 'See progress', primary: true, run: () => hud.openTo('goals', 'restore') },
      { label: 'OK', run: () => {} },
    ],
  })
}
function anchorFor(role: Role): { x: number; y: number; r: number } | undefined {
  if (role === 'daycare') return { x: NEST.x + 13, y: NEST.y + 3, r: 5 }
  // the lighthouse stands on a rock in the sea, so its generator runs from the nearest beach
  if (role === 'job:generator' && game.save.island === 'home') return { ...nearestLand(LANDMARK_SPOTS.lighthouse), r: 4 }
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
  const names: Record<string, string> = { stone: 'evolution stone', berry: 'Oran Berry', 'poke-ball': 'Poké Ball', 'great-ball': 'Great Ball', 'ultra-ball': 'Ultra Ball', 'star-piece': 'Star Piece' }
  for (const it of h.items) {
    const name = it.kind === 'food' ? FOODS.find((f) => f.id === it.id)!.name : names[it.kind]
    parts.push(it.n > 1 ? `${it.n} ${name}s` : `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`)
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
  // a friendly visitor after an hour-long session can be a rare one
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
              const { mon: m, star } = game.befriend(dex, level)
              if (star) after(4, () => hud.toast('A new species. You found a Star Piece!'))
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
              game.note('catch', `${name} joined you.`, { dex })
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
/** Shinies (L5) draw in their other colours: party, box-born and waiting wild ones alike. */
function syncShiny() {
  for (const c of scene.creatures) {
    const m = c.monId ? game.mon(c.monId) : undefined
    const w = c.wildId ? game.save.wild.find((x) => x.id === c.wildId) : undefined
    c.shiny = !!(m?.shiny || w?.shiny)
  }
}
async function spawnWild(w: Wild, arrive: boolean) {
  await placeWild(w, arrive)
  syncShiny()
}
async function placeWild(w: Wild, arrive: boolean) {
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
/** Bubbles and floating things in the water (2026-11-18), from the save. */
function syncSea() {
  if (visitData) return
  // each gets its own spot, at least a little way from the others
  // the sea rocks count as taken, so nothing floats against them
  const taken: { x: number; y: number }[] = (SEA_ROCKS[game.save.island] ?? SEA_ROCKS.home).map(([x, y]) => ({ x, y: y - 6 }))
  const spot = (id: string) => {
    const p = scene.seaSpot(id, taken)
    taken.push(p)
    return p
  }
  scene.seaBubbles = (game.save.sea ?? []).map((w) => ({ id: w.id, ...spot(w.id) }))
  scene.seaFloats = (game.save.floats ?? []).map((f) => ({ id: f.id, kind: f.kind, ...spot(f.id) }))
}
/** Tap the traveller with the green bubble: its finds go into your bag, then it goes back to the Box. */
function collectTrip() {
  const got = game.collectTrip()
  if (!got) return
  const { mon, haul } = got
  calm('coin')
  hud.say({ dex: mon.dex, emotion: 'Happy', text: `${game.name(mon)} brought back ${haulText(haul)}.`, auto: 7000 })
  game.note('find', `${game.name(mon)} came back with ${haulText(haul)}.`, { dex: mon.dex })
  // a postcard from a far destination (L8)
  const d = DESTINATIONS.find((x) => x.id === haul.dest)
  if (d) game.note('other', `A postcard from ${game.name(mon)}: ${d.postcard}`, { dex: mon.dex })
  void syncParty()
  hud.refreshSheet()
}
/** Tap the bubbles: the water Pokémon swims to the nearest beach and climbs out to wait. */
async function surfaceSea(id: string, at: { x: number; y: number }) {
  if (game.inSession) return hud.toast('Something is under the water. It will wait for your break.')
  const w = game.surface(id)
  if (!w) return hud.toast('The island is full. Catch someone first.')
  syncSea()
  sfx('blip')
  const sp = await ensure(w.dex)
  const shore = nearestLand(at)
  const c = scene.add(sp, shore.x, shore.y)
  c.wildId = w.id
  c.enter('emerge', 99)
  const p = scene.freeSpot({ x: shore.x, y: shore.y })
  c.walkTo(p.x, p.y)
  syncShiny()
  hud.say({ dex: w.dex, text: `A wild ${game.name(w.dex)} climbed out of the water.`, auto: 4500 })
  game.note('visit', `A wild ${game.name(w.dex)} came out of the sea.`, { dex: w.dex })
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
  stone: () => 'An evolution stone',
}
const WEATHER_TEXT: Record<Weather, string> = { clear: 'The sky cleared.', rain: 'It started to rain.', fog: 'Fog rolled in.', sun: 'The sun came out.', snow: 'It started to snow.' }

let catching: CatchAnim | null = null
let catchBall: Ball = 'poke-ball'
let lastCaught: Mon | undefined
let lastFled = false
function openCatch(c: Creature) {
  const w = game.save.wild.find((x) => x.id === c.wildId)
  if (!w || catching || evo) return
  const have = BALLS.filter((b) => game.save.balls[b.id] > 0)
  if (!have.length) {
    // out of balls and too few shells to buy one: Wooper hands over three, once a day
    const day = dayKey(game.now())
    if (game.save.shells < BALLS[0].price && game.save.ballGiftDay !== day) {
      game.save.ballGiftDay = day
      game.save.balls['poke-ball'] += 3
      game.persist()
      hud.say({ dex: GUIDE_DEX, emotion: 'Happy', text: 'Out of Poké Balls? Here are three. Finished sessions wash more up.', wait: true })
      return
    }
    return hud.say({ dex: GUIDE_DEX, text: 'You have no Poké Balls. Buy them in the Island shop, or finish a session.', wait: true })
  }
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
    shiny: w.shiny,
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
  hud.holdParty = true // review 2 G4: the chips wait for the ball to stop wobbling
  const res = game.throwBall(id, catchBall, catching.quality)
  if (adopt?.c === c) adopt = null
  if (!res) return cancelCatch()
  lastCaught = res.mon
  if (res.caught) c.wildId = undefined
  lastFled = !!res.fled
  hud.hideCatch()
  catching.throw({ caught: res.caught, shakes: res.shakes })
}
function cancelCatch() {
  if (!catching) return
  catching.c.hold(false)
  catching = null
  hud.holdParty = false
  hud.hideCatch()
  scene.markWild = !game.inSession
}
function finishCatch(c: Creature, w: Wild, caught: boolean) {
  catching = null
  hud.holdParty = false
  scene.markWild = !game.inSession
  const name = game.name(w.dex)
  sfx(caught ? 'confirm' : 'cancel')
  if (!caught) {
    c.hold(false)
    if (lastFled) {
      lastFled = false
      c.wildId = undefined
      wildLeaves(c)
      game.note('other', `${name} ran away.`, { dex: w.dex })
      hud.say({ dex: w.dex, text: `Oh no! ${name} broke free and ran away.`, auto: 4000 })
      return
    }
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
    if (got) {
      sfx('coin')
      hud.toast(got.kind === 'stone' && got.item ? `${aStone(got.item).replace(/^a/, 'A')}!` : FIND_TEXT[got.kind](got.n))
    }
    hud.refreshSheet()
    return
  }
  const vis = scene.creatures.find((c) => c.visitor && c.state !== 'leave' && Math.abs(c.x - x) < 11 && y > c.y - 26 && y < c.y + 3)
  if (vis) return hud.say({ dex: Number(vis.sp.dex), text: `${vis.visitor}'s ${vis.name} is visiting. ${vis.visitor} is studying too.`, auto: 5000 })
  if (scene.gate && Math.abs(scene.gate.x - x) < 8 && y > scene.gate.y - 13 && y < scene.gate.y + 2) return askBattle()
  if (onBoat(x, y)) return askExplore()
  const sea = scene.seaAt(x, y)
  if (sea?.kind === 'bubble') return void surfaceSea(sea.id, { x, y })
  if (sea?.kind === 'float') {
    const got = game.collectFloat(sea.id)
    syncSea()
    if (got) {
      sfx('coin')
      hud.toast(FIND_TEXT[got.kind](got.n))
      game.note('find', `${FIND_TEXT[got.kind](got.n)} floated in.`)
    }
    hud.refreshSheet()
    return
  }
  const c = scene.creatures.find((c) => c.wildId && !c.hidden && c.state !== 'leave' && Math.abs(c.x - x) < 11 && y > c.y - 26 && y < c.y + 3)
  if (!c) {
    // one of yours: it hops, a heart floats up, it cries, and its summary opens
    const mine = scene.creatures
      .filter((m) => m.monId && !m.hidden && m.state !== 'leave' && Math.abs(m.x - x) < 11 && y > m.y - 26 && y < m.y + 3)
      .sort((a, b) => b.y - a.y)[0]
    if (mine && mine.monId === game.save.homecoming?.id && !game.inSession) return collectTrip()
    if (mine) return petMon(mine)
    const lm = landmarkAt(x, y)
    if (lm) return showLandmark(lm)
    return hud.hideSummary()
  }
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
    scene.creatures.some((c) => (c.wildId || c.monId || c.visitor) && !c.hidden && Math.abs(c.x - x) < 11 && y > c.y - 26 && y < c.y + 3) ||
    !!landmarkAt(x, y) ||
    onBoat(x, y) ||
    !!scene.seaAt(x, y) ||
    (!!scene.gate && Math.abs(scene.gate.x - x) < 8 && y > scene.gate.y - 13 && y < scene.gate.y + 2)
  canvas.style.cursor = over ? CURSOR.hand : ''
})
window.addEventListener('keydown', (e) => {
  if (!catching && hud?.busy && (e.code === 'Space' || e.code === 'Enter') && !(e.target as HTMLElement | null)?.closest?.('input, textarea, button')) {
    e.preventDefault()
    hud.advance()
  }
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
  scene.gate = { x: d.x + d.w + 7, y: d.y0 + 9 }
}
/** The guardian waits at the bottom of the island's gate dungeon (stage 6). */
/** "Lv11" or "Lv10 to Lv11": the party's level range, for sizing up a guardian. */
function partyLevels() {
  const lv = game.party.map((m) => m.level)
  if (!lv.length) return 'empty'
  const lo = Math.min(...lv)
  const hi = Math.max(...lv)
  return lo === hi ? `Lv${lo}` : `Lv${lo} to Lv${hi}`
}
function askBattle() {
  const isl = game.islandDef
  const g = isl.guardian
  if (game.inSession) return hud.toast('Dungeons are for breaks.')
  const cleared = game.save.guardians.includes(isl.id)
  hud.say({
    dex: g.dex,
    text: `${cleared ? `${game.name(g.dex)} is beaten, but the dungeon is still there.` : `${game.name(g.dex)} Lv${g.level} is ${g.where}, three floors down.`} Your party is ${partyLevels()}.`,
    actions: [
      { label: 'Enter', primary: true, run: () => enterDungeon(`${import.meta.env.BASE_URL}dungeon.html?id=${isl.dungeon}&gate=${isl.id}`) },
      { label: 'Not now', run: () => {} },
    ],
  })
}
/** The rowboat by the pier (2026-11-18): the way to this island's surface exploration. */
const onBoat = (x: number, y: number) => !visitData && Math.abs(scene.island.boat.x - x) < 13 && y > scene.island.boat.y - 6 && y < scene.island.boat.y + 6
function askExplore() {
  const isl = game.islandDef
  const ex = isl.explore
  if (!ex) return
  if (game.inSession) return hud.toast('Exploring is for breaks.')
  if (game.totalHours() < ex.hours)
    return hud.say({ dex: GUIDE_DEX, text: `The rowboat goes to ${ex.name}. It's ready after ${ex.hours} focused hours.`, auto: 6000 })
  hud.say({
    dex: GUIDE_DEX,
    text: `Row over to ${ex.name}? Your party is ${partyLevels()}.`,
    actions: [
      { label: 'Row over', primary: true, run: () => enterDungeon(`${import.meta.env.BASE_URL}dungeon.html?id=${ex.id}`) },
      { label: 'Not now', run: () => {} },
    ],
  })
}
// ---------- co-op dungeon invites (supabase/island_stage7.sql) ----------
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // matches dungeon/net.ts
const roomCode = () => Array.from({ length: 4 }, () => ROOM_ALPHABET[(Math.random() * ROOM_ALPHABET.length) | 0]).join('')
const dungeonName = (id: string) => (id === 'pier-hollow' ? 'Pier Hollow' : id === 'glacier-grotto' ? 'Glacier Grotto' : 'a dungeon')
/** Host a room in this island's dungeon and invite a friend into it. */
async function inviteDungeon(friendId: string) {
  if (game.inSession) return hud.toast('Dungeons are for breaks.')
  const isl = game.islandDef
  const code = roomCode()
  const r = await cloud.inviteToDungeon(friendId, code, isl.dungeon)
  if (r !== 'ok') return hud.toast(r === 'too many' ? 'Too many invites today.' : r === 'not friends' ? 'You can only invite friends.' : r)
  hud.toast('Invite sent. Waiting in the dungeon.')
  enterDungeon(`${import.meta.env.BASE_URL}dungeon.html?id=${isl.dungeon}&gate=${isl.id}&room=${code}&host=1`)
}
const offered = new Set<number>()
/** During a break, check for a friend's invite and offer to join. */
async function checkInvites() {
  if (game.inSession || !game.hasStarter || game.save.tutorial !== 'done' || !cloud.hasStage7()) return
  for (const inv of await cloud.dungeonInvites()) {
    if (offered.has(inv.id)) continue
    offered.add(inv.id)
    hud.say({
      dex: lead(),
      text: `${inv.from} invited you into ${dungeonName(inv.dungeon)}.`,
      actions: [
        { label: 'Join', primary: true, run: () => (void cloud.clearDungeonInvite(inv.id), enterDungeon(`${import.meta.env.BASE_URL}dungeon.html?room=${inv.code}`)) },
        { label: 'Not now', run: () => void cloud.clearDungeonInvite(inv.id) },
      ],
    })
    break
  }
}
/** Into a dungeon: in this tab normally, or a new full tab while the island is popped out (the small window stays). */
function enterDungeon(url: string) {
  if (host !== window || floatMode) window.open(url, '_blank')
  else location.href = url
}
/** The order the arrows move through. */
const ISLAND_ORDER = ISLANDS.map((i) => i.id)
let sailDir = 1
const SAIL_KEY = 'island-sailed'
function sailAway(to: string) {
  // the island slides off toward the arrow you pressed while the open sea fades over it; the
  // next island fades back in from the same sea, sliding in from the other side (2026-11-18)
  const veil = document.createElement('div')
  veil.style.cssText = 'position:fixed;inset:0;background:var(--sea-page);opacity:0;transition:opacity 1.1s ease;z-index:50;pointer-events:none'
  document.body.append(veil)
  win.style.transition = 'transform 1.2s ease-in'
  requestAnimationFrame(() => {
    veil.style.opacity = '1'
    win.style.transform = `translateX(${-sailDir * 18}%)`
  })
  try {
    sessionStorage.setItem(SAIL_KEY, JSON.stringify({ dir: sailDir, sea: getComputedStyle(document.documentElement).getPropertyValue('--sea-page') }))
  } catch {}
  hud.toast(`Sailing to ${ISLANDS.find((i) => i.id === to)!.name}.`)
  setTimeout(() => location.reload(), 1250)
}
/** Arriving by boat: no clouds, the sea fades off and the island slides in. */
function arriveBySea() {
  let st: { dir: number; sea: string } | null = null
  try {
    st = JSON.parse(sessionStorage.getItem(SAIL_KEY) ?? 'null')
    sessionStorage.removeItem(SAIL_KEY)
  } catch {}
  if (!st) return false
  const veil = document.createElement('div')
  veil.style.cssText = `position:fixed;inset:0;background:${st.sea || 'var(--sea-page)'};opacity:1;transition:opacity 1.2s ease;z-index:50;pointer-events:none`
  document.body.append(veil)
  win.style.transform = `translateX(${st.dir * 18}%)`
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      win.style.transition = 'transform 1.2s ease-out'
      win.style.transform = ''
      veil.style.opacity = '0'
      setTimeout(() => veil.remove(), 1300)
    }),
  )
  return true
}
/** The arrows at the sides: the island before and after this one, open or locked. */
let arrowKey = ''
function syncArrows() {
  if (!game || visitData || floatMode) return
  const i = ISLAND_ORDER.indexOf(game.save.island)
  const side = (j: number) => {
    const id = ISLAND_ORDER[j]
    if (!id) return null
    const open = game.canSail(id) || !!game.save.stash[id] || id === 'home'
    return { name: ISLANDS.find((x) => x.id === id)!.name, open }
  }
  // not during the opening tour
  const touring = game.save.tutorial !== 'done'
  const l = touring ? null : side(i - 1)
  const r = touring ? null : side(i + 1)
  const key = `${JSON.stringify([l, r])}|${game.inSession}`
  if (key === arrowKey) return
  arrowKey = key
  hud.setIslandArrows(l, r)
}
function islandArrow(dir: number) {
  const to = ISLAND_ORDER[ISLAND_ORDER.indexOf(game.save.island) + dir]
  if (!to) return
  if (game.inSession) return hud.toast('Sail between sessions.')
  const name = ISLANDS.find((x) => x.id === to)!.name
  if (!game.canSail(to)) {
    const left = game.sailNeeds(to).filter((n) => !n.done).map((n) => `${n.text}.`)
    return hud.say({ dex: GUIDE_DEX, text: `${name} isn't open yet. ${left.join(' ')}`, auto: 6500 })
  }
  sailDir = dir
  if (!game.sail(to)) hud.toast('Not yet.')
}

// ---------- friends (stage 5) ----------
function currentScene(): cloud.Scene5 {
  const slots = Object.fromEntries(Object.entries(game.save.decor.slots).filter(([, v]) => v)) as Record<string, string>
  // where each decoration stands (arrange mode); servers before stage 9 drop it, and friends then see the default spots
  const pos = Object.fromEntries(Object.entries(game.save.decor.pos ?? {}).filter(([k]) => slots[k]))
  return { island: game.save.island, habitats: game.save.habitats, decor: slots, pos }
}
/** Friends studying now: their Pokémon visit, and you study together (double shells, better odds). */
async function refreshFriends() {
  if (cloud.cloudState() !== 'ready') return
  const { friends } = await cloud.listFriends()
  const studying = friends.filter((f) => f.studying && f.party.length)
  hud.setFriendsLive(studying.length)
  const running = game.save.session?.state === 'running'
  const before = game.together.length
  game.together = running ? studying.map((f) => f.name) : []
  if (running && !before && game.together.length) hud.toast(`Studying with ${game.together[0]}. You warm a Together egg.`)
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
  void takeTrades()
  const gifts = await cloud.claimGifts()
  for (const g of gifts) {
    const m = game.receive(g.kind, g.payload)
    const what =
      g.kind === 'mon' ? game.name(g.payload.dex ?? 0) : g.kind === 'egg' ? 'an egg' : `${(g.payload.n ?? 1) > 1 ? `${g.payload.n} ` : 'a '}${itemName(g.payload.id ?? '')}${(g.payload.n ?? 1) > 1 ? 's' : ''}`
    hud.say({ dex: m?.dex ?? lead(), emotion: 'Happy', text: `${g.from} sent you ${what}!`, auto: 5000 })
    game.note('friend', `${g.from} sent you ${what}.`, { dex: m?.dex })
  }
  if (gifts.length) hud.refreshSheet()
}
/** Trades and marks from friends (stage 8), collected at a break with the gifts. */
async function takeTrades() {
  if (game.inSession || !cloud.hasStage8()) return
  for (const t of await cloud.trades()) {
    if (!t.mine || !(t.state === 'accepted' || t.state === 'declined' || t.expired)) continue
    const r = await cloud.tradeClaim(t.id)
    if (!r) continue
    const got = game.receiveTrade(r.mon, r.kind === 'traded')
    if (!got) continue
    const text =
      r.kind === 'traded'
        ? got.from
          ? `${t.other} traded you a ${game.name(got.from)}, and it evolved into ${game.name(got.mon.dex)}!`
          : `${t.other} traded you a ${game.name(got.mon.dex)}.`
        : `${game.name(got.mon.dex)} came back. ${t.other} didn't trade this time.`
    hud.say({ dex: got.mon.dex, emotion: 'Happy', text, wait: true })
    game.note('friend', text, { dex: got.mon.dex })
  }
  hudTrades = await cloud.trades()
  for (const m of await cloud.takeVisitMarks()) {
    game.visitMark(m.kind, m.from, m.payload)
    const mon = m.kind === 'pet' ? game.party.find((x) => x.dex === m.payload.dex) : undefined
    const text =
      m.kind === 'berry'
        ? `A bottle washed up. ${m.from} left ${/^[aeiou]/i.test(itemName(m.payload.food ?? '')) ? 'an' : 'a'} ${itemName(m.payload.food ?? '')} in your dish.`
        : m.kind === 'sign'
          ? `${m.from} signed your signpost.`
          : `${m.from} petted ${mon ? game.name(mon) : 'one of your Pokémon'}.`
    if (mon) {
      const c = scene.byMon(mon.id)
      if (c) scene.petAt(c)
    }
    hud.toast(text)
    game.note('friend', text, { dex: mon?.dex })
  }
  hud.refreshSheet()
}
let hudTrades: cloud.Trade[] = []
const tradeMon = (id: string) => {
  const m = game.mon(id)
  return m ? { dex: m.dex, level: m.level, shiny: !!m.shiny } : null
}
/** Offer a Pokémon: it leaves your island at once and waits at the pier for your friend's answer. */
async function offerTrade(friendId: string, monId: string) {
  const mon = tradeMon(monId)
  if (!mon || !game.canTrade(monId)) return hud.toast('That Pokémon cannot be traded.')
  const r = await cloud.tradeOffer(friendId, mon)
  if (r !== 'ok') return hud.toast(r === 'already offered' ? 'You already have an offer waiting for them.' : r === 'too many' ? 'That is enough trades for today.' : r)
  game.giveAway('mon', monId)
  sfx('give')
  hud.toast(`${game.name(mon.dex)} is waiting at the pier for your friend's answer.`)
  game.note('friend', `Offered ${game.name(mon.dex)} in a trade.`, { dex: mon.dex })
  hudTrades = await cloud.trades()
  hud.refreshSheet()
}
/** Accept an offer by sending one of yours back; the friend's Pokémon arrives now. */
async function acceptTrade(tradeId: number, monId: string) {
  const mon = tradeMon(monId)
  if (!mon || !game.canTrade(monId)) return hud.toast('That Pokémon cannot be traded.')
  const t = hudTrades.find((x) => x.id === tradeId)
  const got = await cloud.tradeAccept(tradeId, mon)
  if (!got) return hud.toast('That offer is no longer open.')
  game.giveAway('mon', monId)
  const r = game.receiveTrade(got)
  if (r) {
    const text = r.from ? `You traded with ${t?.other ?? 'a friend'}. ${game.name(r.from)} evolved into ${game.name(r.mon.dex)}!` : `You traded with ${t?.other ?? 'a friend'} for a ${game.name(r.mon.dex)}.`
    hud.say({ dex: r.mon.dex, emotion: 'Happy', text, wait: true })
    game.note('friend', text, { dex: r.mon.dex })
  }
  hudTrades = await cloud.trades()
  hud.refreshSheet()
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
    sfx('give')
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
  scene.setHabitats(v.scene.habitats.filter((h) => ['grass', 'rocks', 'pond', 'cave', 'spring'].includes(h)) as never)
  scene.setDecor(v.scene.decor, v.scene.pos)
  for (const p of v.party) {
    const sp = await ensure(p.dex)
    const q = scene.freeSpot()
    scene.add(sp, q.x, q.y)
  }
  // things you can leave on a friend's island (stage 8): a food from your own bag, your name, a pet
  const mine = loadSave()
  const food = FOODS.find((f) => (mine.foods[f.id] ?? 0) > 0)
  const el = document.createElement('div')
  el.className = 'visit-banner px-panel'
  el.innerHTML = `<p>${v.name.replace(/[<>&]/g, '')}'s island</p><p class="hint visit-note">${v.studying ? 'Studying now.' : 'Not studying right now.'} Tap a Pokémon to pet it.</p>
    <div class="row-actions">${food ? `<button class="px-btn small" data-v="food">Leave ${/^[aeiou]/i.test(food.name) ? 'an' : 'a'} ${food.name}</button>` : ''}<button class="px-btn small" data-v="sign">Sign the signpost</button><button class="px-btn small primary" data-v="home">Go home</button></div>`
  const note = (t: string) => (el.querySelector('.visit-note')!.textContent = t)
  const said = (r: string, ok: string) => note(r === 'ok' ? ok : r === 'already today' ? 'You already did that today.' : r)
  el.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-v]')
    if (!b) return
    if (b.dataset.v === 'home') {
      sessionStorage.removeItem('island-visit')
      location.href = location.pathname
      return
    }
    b.disabled = true
    if (b.dataset.v === 'sign') said(await cloud.visitMark(v.id, 'sign'), 'You signed the signpost.')
    if (b.dataset.v === 'food' && food) {
      const r = await cloud.visitMark(v.id, 'berry', { food: food.id })
      if (r === 'ok') {
        // it comes out of your own bag
        const s = loadSave()
        s.foods[food.id] = Math.max(0, (s.foods[food.id] ?? 0) - 1)
        localStorage.setItem('island-save-v1', JSON.stringify(s))
      }
      said(r, `You left ${/^[aeiou]/i.test(food.name) ? 'an' : 'a'} ${food.name} in the dish. It will draw their next visitor.`)
    }
  })
  let petted = false
  canvas.addEventListener('click', async (e) => {
    const r = canvas.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * H
    const c = scene.creatures.find((c) => Math.abs(c.x - x) < 11 && y > c.y - 26 && y < c.y + 3)
    if (!c) return
    scene.petAt(c)
    if (petted) return
    petted = true
    said(await cloud.visitMark(v.id, 'pet', { dex: Number(c.sp.dex) }), `You petted their ${c.name}. They will see a heart.`)
  })
  const hudLayer = document.createElement('div')
  hudLayer.className = 'hud'
  hudLayer.append(el)
  win.append(hudLayer)
  const fitVisit = () => {
    const cw = canvas.clientWidth
    const hs = hudScale(cw)
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
  startLoop()
}

// ---------- the end of a session: a ring you can hear from another tab (a friend's feedback, 2026-11-17) ----------
const baseTitle = document.title
let doneTitle = false
/** Ask once, on the first Start, whether the island may send a notification when a session ends. */
function askNotify() {
  const st = game.save.settings
  if (st.alarm === false || st.notifyAsked || !('Notification' in window) || Notification.permission !== 'default') return
  st.notifyAsked = true
  game.persist()
  void Notification.requestPermission()
}
function ringDone(minutes: number) {
  if (game.save.settings.alarm === false) return sfx('success')
  // the chime twice, louder than other sounds, so it carries from a background tab
  sfx('success', 2)
  setTimeout(() => sfx('success', 2), 2600)
  doneTitle = true
  const away = document.hidden && !window.documentPictureInPicture?.window
  if (away && 'Notification' in window && Notification.permission === 'granted')
    try {
      new Notification('Your session is done', { body: `You focused for ${fmtMinutes(minutes)}. Time for a break.`, icon: `${import.meta.env.BASE_URL}items/poke-ball.png`, silent: true })
    } catch {}
}
/** The tab's title shows the time left while you focus, and "Session done" until you look. */
function syncTitle() {
  if (doneTitle && !document.hidden) doneTitle = false
  const s = game?.save.session
  const left = s && s.state === 'running' && s.length ? Math.max(0, s.length - s.credited) : null
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
  document.title = doneTitle ? `Session done · ${baseTitle}` : left !== null ? `${mmss(left)} · ${baseTitle}` : baseTitle
}

// ---------- the Guide: Wooper explains one newly useful thing at a break (guide.ts) ----------
function tellTip(tries = 0) {
  if (!game || game.inSession || game.save.tutorial !== 'done' || catching || evo) return
  // the tour already explained focusing and the pond
  if (!game.save.tips) game.save.tips = ['focus', 'habitats']
  if (hud.busy || !hud.sheetHidden) return tries < 12 ? after(5, () => tellTip(tries + 1)) : undefined
  if (nudgeDungeon()) return
  const first = !game.save.tips.some((id) => GUIDE.some((t) => t.id === id && id !== 'focus' && id !== 'habitats'))
  // up to two at a break, so new things don't trickle out too slowly (2026-11-18)
  for (let n = 0; n < TIPS_PER_BREAK; n++) {
    const t = nextTip(game)
    if (!t) break
    game.save.tips = [...game.save.tips, t.id]
    for (const line of t.text.split(/(?<=\.)\s+/)) hud.say({ dex: GUIDE_DEX, text: line, wait: true })
  }
  game.persist()
  if (first) hud.say({ dex: GUIDE_DEX, text: 'I keep tips like this in More, under Guide.', wait: true })
}

/** A sound for a moment the game makes on its own: quiet while you focus. */
const calm = (n: SfxName) => {
  if (!game.inSession) sfx(n)
}

// ---------- petting ----------
const cries = new Map<number, HTMLAudioElement>()
function cry(dex: number) {
  if (game.save.settings.sound === false) return
  let a = cries.get(dex)
  if (!a) {
    a = new Audio(`${import.meta.env.BASE_URL}cries/${dex}.mp3`)
    cries.set(dex, a)
  }
  a.volume = 0.22 * (game.save.settings.volume ?? 1)
  a.currentTime = 0
  void a.play().catch(() => {})
}
function petMon(c: Creature) {
  const m = c.monId ? game.mon(c.monId) : undefined
  if (!m) return
  const awake = !c.asleep
  scene.petAt(c)
  if (awake) cry(m.dex)
  hud.showSummary(m.id)
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
  line?: Dialog
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
  // kept so the swap closes this exact line: a bare dismiss() closed whatever was showing, so a
  // line queued behind another stayed up with only Stop it (Paul, 2026-11-18: Geodude's)
  e.line = {
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
  }
  hud.say(e.line)
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
      if (e.line) hud.close(e.line)
      calm('success')
      hud.say({ dex: e.to, emotion: 'Happy', text: `${from} evolved into ${game.name(e.to)}.`, auto: 5000 })
      game.note('evolve', `${from} evolved into ${game.name(e.to)}.`, { dex: e.to })
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
  // never leave the "is evolving" line behind, however the evolution ended
  if (evo.line) hud.close(evo.line)
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
    game.party.slice(0, 3).map((m) => ({ dex: m.dex, level: m.level })), // the server takes 3
    game.save.caught.length,
  )
}
async function showWaves() {
  if (game.inSession) return
  const names = await cloud.collectWaves()
  if (!names.length) return
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  hud.say({ dex: lead(), emotion: 'Happy', text: `${who} waved.`, auto: 5000 })
  game.note('friend', `${who} waved.`)
}

// ---------- decorations ----------
function decorSlotOf(id: string) {
  return Object.entries(game.save.decor.slots).find(([, v]) => v === id)?.[0]
}
function saveDecor() {
  game.persist()
  cloud.publishScene(currentScene())
  scene.setDecor(game.save.decor.slots, game.save.decor.pos)
  hud.refreshSheet()
}

// ---------- game events ----------
function onGame(e: GameEvent) {
  tour?.onEvent(e)
  switch (e.type) {
    case 'sessionStart':
      sfx('start')
      hud.toast('Session started.')
      void refreshFriends()
      cancelCatch()
      scene.markWild = false
      syncSleep()
      void cloud.sessionBegin()
      break
    case 'sessionEnd':
      if (e.complete) ringDone(e.minutes)
      after(4, () => tellTip())
      hud.clearQueue((d) => d.tag === 'checkin')
      void cloud.sessionEnd()
      game.note('focus', `Focused for ${fmtMinutes(e.minutes)}.${e.complete ? ` ${e.berries === 2 ? 'Two berries' : 'A berry'} ripened${e.balls ? `, and ${e.balls === 2 ? 'two Poké Balls' : 'a Poké Ball'} washed up` : ''}.` : ''}`, { n: e.minutes, dex: lead() })
      announceTide()
      if (e.capped)
        hud.say({ dex: lead(), text: `${MAX_SESSION / 3600} hours focused. That's the most one session counts. Take a real break, and start another when you're ready.`, wait: true })
      else if (e.complete)
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
    case 'sea':
      syncSea()
      break
    case 'passer':
      void spawnWild(e.wild, true)
      hud.toast(e.wild.shiny ? `A shiny ${game.name(e.wild.dex)} came by!` : `${game.name(e.wild.dex)} came by.`)
      game.note('visit', e.wild.shiny ? `A shiny ${game.name(e.wild.dex)} came by.` : `A wild ${game.name(e.wild.dex)} came by.`, { dex: e.wild.dex })
      break
    case 'milestone': {
      // a Pokédex milestone (L5)
      calm('unlock')
      const isl = ISLANDS.find((i) => i.id === e.island)!.name
      const what = e.reward === 'egg' ? 'Here is an egg.' : e.reward === 'slot' ? 'There is room for one more decoration now.' : e.reward === 'togepi' ? 'Here is my own egg. It came from very far away.' : e.reward === 'statue' ? 'Here is a Pokédex statue for the island.' : e.reward === 'shells' ? 'Here are 200 shells.' : `Here is a ${decorDef(e.reward)?.name.toLowerCase() ?? 'decoration'} for the island.`
      game.note('other', `${isl}'s Pokédex reached ${e.pct}%.`)
      hud.say({ dex: GUIDE_DEX, emotion: 'Happy', text: `${isl}'s Pokédex is ${e.pct === 100 ? 'complete' : `${e.pct}% full`}! ${what}`, wait: true })
      break
    }
    case 'wildLeave':
      for (const id of e.ids) {
        const c = wildCreature(id)
        if (c) game.note('other', `${c.name} wandered off.`, { dex: Number(c.sp.dex) })
        if (c) wildLeaves(c)
      }
      break
    case 'find': {
      const by = game.save.mons.find((m) => m.id === e.find.by)
      game.note('find', by ? `${game.name(by)} dug something up.` : 'Something turned up in the sand.', { dex: by?.dex })
      digUp(e.find)
    }
      break
    case 'weather':
      scene.weather = e.kind
      hud.toast(WEATHER_TEXT[e.kind])
      game.note('other', WEATHER_TEXT[e.kind])
      break
    case 'caught':
      game.note('catch', `Caught ${game.name(e.mon)}.${e.newSpecies ? ' New to the Pokédex.' : ''}`, { dex: e.mon.dex })
      if (e.star) after(4.2, () => hud.toast('A new species. You found a Star Piece!'))
      break
    case 'egg':
      syncNest()
      game.note('hatch', e.egg.source === 'daycare' ? 'The Day Care pair left an egg.' : 'An egg arrived in the nest.')
      hud.toast(e.egg.source === 'daycare' ? 'The Day Care pair left an egg.' : e.egg.source === 'find' ? 'An egg turned up. It is in the nest.' : 'An egg arrived. It is in the nest.')
      hud.refreshSheet()
      break
    case 'hatching':
      spawnNext = { x: NEST.x, y: NEST.y }
      break
    case 'hatch':
      calm('confirm')
      syncNest()
      hud.say({ dex: e.mon.dex, emotion: 'Happy', text: `An egg hatched. It is ${game.name(e.mon)}!`, auto: 5000 })
      game.note('hatch', `An egg hatched into ${game.name(e.mon)}.`, { dex: e.mon.dex })
      if (!game.save.party.includes(e.mon.id)) spawnNext = null
      hud.refreshSheet()
      break
    case 'job':
      if (e.job === 'bush') hud.toast(`${game.name(e.mon)} watered the bush. A berry ripened.`)
      game.note('other', e.job === 'bush' ? `${game.name(e.mon)} watered the bush.` : e.job === 'garden' ? `${game.name(e.mon)} grew some food in the garden.` : e.job === 'forge' ? `The Ember forge made ${aStone(game.save.forgeTarget ?? 'fire-stone')}.` : `${game.name(e.mon)} finished a job.`, { dex: e.mon.dex, key: `job:${e.mon.id}` })
      hud.refreshSheet()
      break
    case 'expeditionOut':
      hud.toast(`${game.name(e.mon)} set off.`)
      game.note('other', `${game.name(e.mon)} set off exploring.`, { dex: e.mon.dex })
      break
    case 'expeditionBack':
      // it walks up from the pier and waits with a green bubble until you tap it
      hud.toast(`${game.name(e.mon)} is back from its trip.`)
      void syncParty()
      hud.refreshSheet()
      break
    case 'sail':
      game.note('other', `Sailed to ${ISLANDS.find((i) => i.id === e.to)!.name}.`)
      sailAway(e.to)
      break
    case 'togetherEgg':
      hud.toast(`An egg from studying with ${e.with}. It is in the nest.`)
      game.note('friend', `An egg from studying with ${e.with}.`)
      break
    case 'festival':
      scene.festival = true
      hud.say({ dex: GUIDE_DEX, emotion: 'Happy', text: 'Ten hours together with your friends this week! Tonight the island has a festival.', wait: true })
      game.note('friend', 'Ten hours with friends this week. A festival night.')
      break
    case 'restored': {
      // a landmark rebuilt (L1): Wooper tells a little more of the story
      calm('unlock')
      const r = RESTORE.find((x) => x.id === e.id)!
      syncLandmarks()
      game.note('other', `Restored ${({ hut: 'the Pokémon Center hut', lighthouse: 'the lighthouse', pier: 'the old pier' } as Record<string, string>)[r.id]}.`)
      r.story.forEach((text, i) => hud.say({ dex: GUIDE_DEX, emotion: i === 0 ? 'Happy' : 'Normal', text, wait: true }))
      hud.say({ dex: GUIDE_DEX, text: r.opens, wait: true })
      hud.refreshSheet()
      break
    }
    case 'guardian': {
      const isl = ISLANDS.find((i) => i.id === e.island)!
      if (e.win) game.note('catch', `Beat the guardian of ${isl.name}.`, { dex: isl.guardian.dex })
      break
    }
    case 'rolesChanged':
      syncNest()
      applyAnchors()
      hud.refreshSheet()
      break
    case 'habitat':
      cloud.publishScene(currentScene())
      scene.setHabitats(game.save.habitats)
      hud.toast(`${HABITATS.find((h) => h.id === e.id)!.name} built.`)
      game.note('other', `Built the ${HABITATS.find((h) => h.id === e.id)!.name.toLowerCase()}.`)
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
      game.note('find', `${e.streak} days in a row. ${aStone(e.item).replace(/^a/, 'A')} washed ashore.`, { dex: lead() })
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
          : `${game.name(e.mon)} gained ${e.exp} EXP.`,
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
      game.note('level', `${game.name(e.mon)} reached level ${e.mon.level}.`, { dex: e.mon.dex, n: 1, key: `lv:${e.mon.id}` })
      publishParty()
      if (!game.inSession) break // berries announce their own level-ups
      hud.toast(`${game.name(e.mon)} grew to level ${e.mon.level}.`)
      if (c && !c.asleep && !evolving.has(e.mon.id) && c.state !== 'still') c.walkTo(c.x, c.y, 'hop')
      break
    }
    case 'boxEvolved':
      game.note('evolve', `${e.from} evolved into ${game.name(e.mon)} in the box.`, { dex: e.mon.dex })
      hud.toast(`${e.from} evolved into ${game.name(e.mon)} in the box.`)
      break
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
      sfx('warn')
      hud.say({
        dex: lead(),
        text: 'Still studying?',
        tag: 'checkin',
        actions: [{ label: "I'm here", primary: true, run: () => game.answerStillHere() }],
      })
      break
    case 'away': {
      sfx('pause')
      void cloud.sessionEnd()
      if (hud.busy && hud.currentTag === 'checkin') hud.dismiss()
      hud.clearQueue((d) => d.tag === 'checkin')
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
      sfx('start')
      void cloud.sessionBegin()
      if (hud.busy && hud.currentTag === 'checkin') hud.dismiss()
      hud.toast('Welcome back.')
      syncSleep()
      break
    case 'partyChanged':
      syncParty()
      syncWild()
      syncFinds()
      scene.setDecor(game.save.decor.slots, game.save.decor.pos)
      syncLandmarks()
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
  // never backwards: the small window's frame times count from its own start, not the page's
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
  last = now
  tick(dt)
  // night frames carry a per-pixel lighting pass, so draw them at 30 fps
  if (nightness(scene.hour) <= 0.04 || now - lastRenderAt >= 32) {
    lastRenderAt = now
    scene.render(g, dt)
  }
  hud?.update()
  drawIntro()
  tour?.update()
  // the menus fade in as the clouds clear
  const intro = scene.intro
  const layer = hud?.el ?? win.querySelector<HTMLElement>('.hud')
  if (intro && layer) {
    layer.style.opacity = String(Math.max(0, (intro.cleared - 0.45) / 0.55))
    if (intro.done) {
      layer.style.opacity = ''
      scene.intro = undefined
    }
  }
}
// one render loop at a time: a pop-out or its return starts a new one and the old one stops
let loopGen = 0
function startLoop() {
  const gen = ++loopGen
  // the new window's clock from here on
  last = lastFrameAt = host.performance.now()
  const tick = (now: number) => {
    if (gen !== loopGen) return
    frame(now)
    host.requestAnimationFrame(tick)
  }
  host.requestAnimationFrame(tick)
}
// a hidden window gets no frames, so a timer keeps the island going. It reads the clock of the
// window the island is in: a small window's frame times count from its own opening, and mixing
// the two clocks made time jump back and forth (the grass shook; Paul, 2026-11-12)
setInterval(() => {
  const now = host.performance.now()
  if (now - lastFrameAt > 200) frame(now)
}, 250)
// The focus clock: one beat a second, plus one whenever the page wakes. When
// the island is open in two windows (a plain pop-out beside the page), a Web
// Lock lets only one of them run the clock; the other mirrors the save.
let clockOwner = !('locks' in navigator)
// The window you can see runs the focus clock: a popped-out window takes it from the tab
// that opened it (a hidden tab can be frozen by the browser), and the tab gets it back
// when the small window closes.
function takeClock(steal: boolean) {
  navigator.locks
    .request('island-clock', { steal }, () => ((clockOwner = true), new Promise<void>(() => {})))
    .catch(() => {
      clockOwner = false
      if (!document.hidden) hud?.toast('The island is in its own window.')
      takeClock(false)
    })
}
if ('locks' in navigator) takeClock(popoutMode && !floatMode)
// review 2 G3: a hidden tab can keep the lock while the browser throttles it, so a window
// that comes into view takes the clock back
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !clockOwner && 'locks' in navigator) takeClock(true)
})
setInterval(() => {
  if (game) wantsMusic(clockOwner)
  if (game) syncTitle()
  if (clockOwner) game?.beat()
  if (game && scene.weather !== game.weather) scene.weather = game.weather
  if (game) syncNest()
  if (game) dozeAt45()
  if (game && game.save.island === 'home') {
    const next = game.nextLandmark
    if (`${game.save.restored?.join() ?? ''}|${!!next && game.restoreProgress(next.id).ready}` !== landmarkKey) syncLandmarks()
    else syncMarkers() // the doorway's bubble follows the guardian and the nudge
  }
  if (game) syncArrows()
}, 1000)
// the page around the canvas takes the open sea's colour as the light changes, so there is no seam
if (!floatMode)
  setInterval(() => {
    // (the clouds are on their own layer, so the canvas corner is always open sea)
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data
    for (const d of new Set([document, host.document])) d.documentElement.style.setProperty('--sea-page', `rgb(${r},${gg},${b})`)
    // the edge band takes the same light: the darkest shade, scaled like the sampled open sea
    const open = hexRgb(seaCss())
    const edge = seaEdge()
    drawEdge([r, gg, b].map((v, i) => Math.round((v * edge[i]) / Math.max(1, open[i]))))
  }, 1000)
document.addEventListener('visibilitychange', () => clockOwner && game?.beat())
window.addEventListener('storage', (e) => {
  if (e.key !== 'island-save-v1' || !game) return
  game.reload()
  syncParty()
  syncSleep()
  syncWild()
  syncFinds()
  syncSea()
})

// ---------- pop out ----------
declare global {
  interface Window {
    documentPictureInPicture?: { requestWindow(o: { width: number; height: number; preferInitialWindowPlacement?: boolean }): Promise<Window>; window: Window | null }
    __island: unknown
  }
}
function fitInto(w: Window) {
  const raw = Math.min(w.innerWidth / W, w.innerHeight / H)
  // whole-number scales keep the pixel art crisp; only a window smaller than 240×180 shrinks
  const s = raw >= 1 ? Math.floor(raw) : raw
  canvas.style.width = `${W * s}px`
  canvas.style.height = `${H * s}px`
  hud?.fit(canvas)
  requestAnimationFrame(() => drawEdge())
}
function plainPopOut() {
  // bottom-right corner of the screen
  const w = W * 2
  const h = H * 2
  const left = Math.max(0, (screen.availWidth ?? 1280) - w - 16)
  const top = Math.max(0, (screen.availHeight ?? 800) - h - 48)
  window.open(`${location.pathname}?popout`, 'island', `width=${w},height=${h},left=${left},top=${top}`)
  hud.toast('This browser cannot keep windows on top.')
}
async function popOut() {
  const dpip = window.documentPictureInPicture
  if (!dpip) return plainPopOut()
  if (dpip.window) return
  let pip: Window
  try {
    // open at this size every time, not at whatever size Chrome remembers (a friend's small window
    // "takes up so much of the screen", 2026-11-17)
    pip = await dpip.requestWindow({ width: W * 2, height: H * 2, preferInitialWindowPlacement: true })
  } catch {
    return plainPopOut()
  }
  // carry the page's styles and fonts into the new window
  // and wait for the copied stylesheets, so nothing is laid out unstyled (the island cut off, no menus)
  const loads: Promise<unknown>[] = []
  for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"], link[rel="preconnect"]')) {
    const copy = node.cloneNode(true) as HTMLElement
    if (copy instanceof HTMLLinkElement && copy.rel === 'stylesheet') loads.push(new Promise((r) => ((copy.onload = r), (copy.onerror = r), setTimeout(r, 3000))))
    pip.document.head.append(copy)
  }
  await Promise.all(loads)
  pip.document.body.className = 'pip-body'
  listenIn(pip.document)
  const marker = document.createComment('island')
  win.before(marker)
  pip.document.body.append(win)
  fitInto(pip)
  pip.addEventListener('resize', () => fitInto(pip))
  // lay out again once the window has its real size, and whenever the island's size changes there
  pip.requestAnimationFrame(() => fitInto(pip))
  const ro = new (pip as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver(() => hud.fit(canvas))
  ro.observe(canvas)
  host = pip
  hud.setSmall(true)
  startLoop()
  // keys pressed in the small window reach the same handlers (dialogs, throwing, cheats)
  pip.addEventListener('keydown', (e) => {
    const copy = new KeyboardEvent('keydown', { key: e.key, code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, cancelable: true })
    window.dispatchEvent(copy)
    if (copy.defaultPrevented) e.preventDefault()
  })
  pip.addEventListener('pagehide', () => {
    ro.disconnect()
    marker.replaceWith(win)
    hud.setSmall(false)
    host = window
    startLoop()
    fitInto(window)
  })
}

// ---------- debug panel ----------
/** Cheats for testing events: the ?debug panel and the in-game Cheats window (the ` key, or More → Cheats). */
const CHEATS: { title: string; items: [string, string][] }[] = [
  { title: 'Start', items: [['fresh', 'Play from the beginning'], ['endgame', 'Almost-finished island'], ['tour', 'Replay the island tour'], ['restore', 'Restore my save']] },
  { title: 'Focus', items: [['session', 'Start a session'], ['m10', '+10 focused min'], ['m30', '+30 focused min'], ['m60', '+60 focused min'], ['finish', 'Finish the session'], ['end', 'End it early']] },
  { title: 'Visitors', items: [['passer', 'A passer-by'], ['passer3', 'Three passers-by'], ['visit', 'Friendly visitor'], ['visit50', 'Visitor, 1-hour odds']] },
  { title: 'Moments', items: [['sea', 'Bubbles and flotsam'], ['find', 'A find'], ['w-rain', 'Rain'], ['w-fog', 'Fog'], ['w-sun', 'Sun'], ['w-snow', 'Snow'], ['w-clear', 'Clear sky']] },
  { title: 'Time', items: [['h-7', 'Morning'], ['h-13', 'Noon'], ['h-19', 'Dusk'], ['h-22', 'Night'], ['clock', 'My clock']] },
  { title: 'Growth', items: [['evolve', 'Lead ready to evolve'], ['stone', 'A stone washes ashore'], ['bond', 'Lead: 10 h bond'], ['lv20', 'Party to Lv 20'], ['strong', 'Party to Lv 34']] },
  { title: 'Eggs', items: [['egg', 'An egg'], ['daycare-egg', 'Day Care egg now'], ['hatch-now', 'Hatch eggs now'], ['jobs-now', 'Jobs pay out now'], ['expedition-back', 'Expedition returns']] },
  { title: 'Friends', items: [['fakefriend', 'A friend studies too'], ['fakewave', 'A friend waves'], ['fakegift', 'Gifts arrive']] },
  { title: 'Items', items: [['shells', '+300 shells'], ['stars', '+5 Star Pieces'], ['balls', '+5 of each ball'], ['berries', '+3 berries'], ['foods', '+3 of each food']] },
  { title: 'Progress', items: [['hours', '+5 focused hours'], ['dexfill', 'Catch 70% of this dex'], ['unlock', 'Unlock Frost Isle'], ['guardian-reset', 'Un-beat this guardian'], ['dungeon', 'Enter the dungeon'], ['sail-frost', 'Sail to Frost Isle'], ['sail-home', 'Sail home']] },
  { title: 'Away', items: [['checkin', 'Ask "still studying?"'], ['idle', '10 idle minutes'], ['lock', 'Screen lock'], ['active', 'Activity'], ['gap', 'A 10-minute sleep']] },
  { title: 'Reset', items: [['reset', 'Reset save (no backup)']] },
]
// ---------- test presets ----------
// The first preset you run keeps a copy of your real save; "Restore my save" puts it back.
const SAVE_KEY = 'island-save-v1'
const BACKUP_KEY = 'island-save-before-presets'
function backupSave() {
  try {
    const cur = localStorage.getItem(SAVE_KEY)
    if (cur && !localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, cur)
  } catch {}
}
function restoreSave() {
  const b = localStorage.getItem(BACKUP_KEY)
  if (!b) return hud.toast('No saved copy to restore.')
  localStorage.setItem(SAVE_KEY, b)
  localStorage.removeItem(BACKUP_KEY)
  location.reload()
}
/** A lived-in island near the end of the game: home finished and its guardian beaten, Frost Isle open but not cleared. */
function buildEndgame() {
  const g = game
  g.reset()
  const s = g.save
  s.tutorial = 'done'
  for (const [dex, lv] of [[6, 38], [18, 36], [134, 35]]) g.addMon(dex, lv)
  // most of the home Pokédex and half of Frost Isle's, in the box
  const box = (isl: 'home' | 'frost', share: number) => {
    const all = g.dexOf(isl).all
    for (const dex of all.slice(0, Math.ceil(all.length * share))) if (!s.caught.includes(dex)) g.addMon(dex, 12 + ((dex * 7) % 22))
  }
  box('home', 0.9)
  box('frost', 0.5)
  // the home guardian is beaten and joined
  s.guardians = ['home']
  const gd = ISLANDS.find((i) => i.id === 'home')!.guardian
  if (!s.mons.some((m) => m.dex === gd.dex)) g.addMon(gd.dex, gd.level - 5)
  // 42 focused hours, with a six-day streak up to today
  s.days['2000-01-01'] = 36 * 60
  for (let i = 0; i < 6; i++) s.days[dayKey(Date.now() - i * 864e5)] = 60
  s.habitats = ['pond', 'rocks', 'grass', 'cave']
  s.decor.owned = CATALOG.filter((c) => !c.gift).map((c) => c.id)
  const pick = ['flowers', 'bench', 'campfire', 'umbrella', 'lantern', 'windmill', 'sign', 'mushrooms']
  SLOTS.forEach((sl, i) => (s.decor.slots[sl.id] = pick[i] ?? null))
  s.shells = 450
  s.starPieces = 5
  s.berries = 6
  s.balls = { 'poke-ball': 12, 'great-ball': 6, 'ultra-ball': 3 }
  for (const f of FOODS) s.foods[f.id] = 2
  // two in the Day Care, helpers on jobs, an egg in the nest
  const boxed = s.mons.filter((m) => g.roleOf(m.id) === 'box')
  const of = (t: string) => boxed.find((m) => g.species(m.dex)?.types?.includes(t) && g.roleOf(m.id) === 'box')
  for (const [m, role] of [[boxed[0], 'daycare'], [boxed[1], 'daycare'], [of('water'), 'job:bush'], [of('ground') ?? of('rock'), 'job:dig'], [of('fire'), 'job:campfire']] as const)
    if (m) g.assign(m.id, role as Role)
  g.addEgg(25, 'find')
  s.log = []
  for (const [kind, text, n] of [['focus', 'Focused for an hour. Two berries ripened.', 60], ['visit', 'A wild Eevee came by.', 1], ['catch', 'Caught Eevee.', 1], ['level', 'Charizard reached level 38.', 1]] as const) g.note(kind, text, { n })
  s.logSeen = 0
  g.persist()
}

function cheat(d: string) {
  if (d === 'fresh' || d === 'endgame') {
    backupSave()
    if (d === 'fresh') game.reset()
    else buildEndgame()
    return location.reload()
  }
  if (d === 'restore') return restoreSave()
  if (!game.hasStarter && d !== 'reset') return hud.toast('Pick a starter first.')
  if (d === 'sea') {
    // a water Pokémon under bubbles and something floating, as if a session had just finished
    const sv = game.save
    for (let i = 0; i < 40 && (sv.sea ?? []).length < 2; i++) {
      const v = game.pickVisitor(1, Math.random, game.lure(), false)
      if (game.species(v.dex)?.types?.includes('water')) (sv.sea ??= []).push({ id: Math.random().toString(36).slice(2, 10), dex: v.dex, level: v.level, tries: 0 })
    }
    ;(sv.floats ??= []).push({ id: Math.random().toString(36).slice(2, 10), kind: 'berry', n: 1 }, { id: Math.random().toString(36).slice(2, 10), kind: 'poke-ball', n: 1 })
    game.persist()
    return syncSea()
  }
  const s = () => game.save.session
  const ensureSession = () => {
    if (!s()) game.startSession()
  }
  if (d === 'session') ensureSession()
  if (d === 'm10') game.grantMinutes(10)
  if (d === 'm30') game.grantMinutes(30)
  if (d === 'm60') game.grantMinutes(60)
  if (d === 'm1') game.grantMinutes(1)
  if (d === 'finish') {
    ensureSession()
    const ss = s()!
    if (ss.length) game.grantMinutes(Math.ceil((ss.length - ss.credited) / 60))
    else game.endSession(true)
  }
  if (d === 'end' && s()) game.endSession(false)
  if (d === 'visit') runVisit()
  if (d === 'visit50') runVisit(RARE_LONG)
  if (d === 'passer') game.passerBy()
  if (d === 'passer3') for (let i = 0; i < 3; i++) game.passerBy()
  if (d === 'find') game.dig()
  if (d.startsWith('w-')) {
    const kind = d.slice(2) as Weather
    game.save.weather = { kind, until: kind === 'clear' ? 0 : Date.now() + 20 * 60 * 1000 }
    scene.weather = game.weather
    hud.toast(WEATHER_TEXT[kind])
  }
  if (d.startsWith('h-')) hourOverride = Number(d.slice(2))
  if (d === 'clock') hourOverride = null
  if (d === 'berries') game.save.berries += 3
  if (d === 'shells') game.save.shells += 300
  if (d === 'stars') game.save.starPieces += 5
  if (d === 'balls') for (const bb of BALLS) game.save.balls[bb.id] += 5
  if (d === 'foods') for (const f of FOODS) game.save.foods[f.id] = (game.save.foods[f.id] ?? 0) + 3
  if (d === 'stone') {
    const useful = STONES.filter((st) => game.save.mons.some((m) => game.evolutionOptions(m).some((x) => x.item === st)))
    const item = (useful.length ? useful : STONES)[Math.floor(Math.random() * (useful.length || STONES.length))]
    game.save.bag[item] = (game.save.bag[item] ?? 0) + 1
    hud.toast(`${aStone(item).replace(/^a/, 'A')} washed ashore.`)
  }
  if (d === 'bond' && game.party[0]) game.party[0].focusedMin = Math.max(game.party[0].focusedMin, 600)
  if (d === 'lv20') for (const m of game.party) { m.level = 20; m.exp = 0 }
  if (d === 'strong') for (const m of game.party) { m.level = Math.max(m.level, 34); m.noEvolve = true }
  if (d === 'egg') game.addEgg(game.party[0]?.dex ?? 16, 'find')
  if (d === 'daycare-egg') {
    const parent = game.save.daycare.ids.map((id) => id && game.mon(id)).find(Boolean)
    const base = parent ? game.species(parent.dex)?.line ?? parent.dex : 133
    if (!game.addEgg(base, 'daycare')) hud.toast('The nest is full.')
  }
  if (d === 'hatch-now') {
    if (!game.save.eggs.length) hud.toast('No eggs. Add one first.')
    else {
      for (const eg of game.save.eggs) eg.progress = eg.need - 1
      game.grantMinutes(1)
    }
  }
  if (d === 'jobs-now') {
    if (!Object.keys(game.save.jobs).length) hud.toast('Nobody has a job yet.')
    else {
      for (const j of JOBS) game.save.jobProgress[j.id] = 999
      game.grantMinutes(1)
    }
  }
  if (d === 'expedition-back') {
    const ex = game.save.expedition
    if (!ex) hud.toast('Nobody is on an expedition.')
    else {
      ex.progress = ex.need - 1
      game.grantMinutes(1)
    }
  }
  if (d === 'fakefriend') {
    game.together = game.save.session ? ['Mina'] : []
    void syncVisitors([{ name: 'Mina', dex: 25 }])
    hud.toast(game.together.length ? 'Studying with Mina. Shells are doubled.' : 'Mina is visiting.')
  }
  if (d === 'fakewave') hud.say({ dex: lead(), emotion: 'Happy', text: 'Mina waved.', auto: 4000 })
  if (d === 'fakegift') {
    for (const [kind, payload] of [['mon', { dex: 133, level: 12 }], ['egg', { dex: 393 }], ['item', { id: 'ultra-ball', n: 2 }]] as const) {
      const m = game.receive(kind, payload)
      hud.say({ dex: m?.dex ?? lead(), emotion: 'Happy', text: `Mina sent you ${kind === 'mon' ? game.name(133) : kind === 'egg' ? 'an egg' : '2 Ultra Balls'}!`, auto: 4000 })
    }
  }
  const addHours = (h: number) => {
    const k = '2000-01-01'
    game.save.days[k] = (game.save.days[k] ?? 0) + h * 60
  }
  const fillDex = (isl: typeof game.save.island) => {
    const dx = game.dexOf(isl)
    for (const sp of dx.all.slice(0, Math.ceil(dx.all.length * 0.7))) if (!game.save.caught.includes(sp)) game.save.caught.push(sp)
  }
  if (d === 'hours') addHours(5)
  if (d === 'dexfill') fillDex(game.save.island)
  if (d === 'unlock' || d === 'sail-frost') {
    if (game.totalHours() < 20) addHours(20 - game.totalHours())
    fillDex('home')
    if (!game.save.guardians.includes('home')) game.save.guardians.push('home')
  }
  if (d === 'guardian-reset') game.save.guardians = game.save.guardians.filter((g) => g !== game.save.island)
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
    } else hud.toast('The lead does not evolve by level.')
  }
  if (d === 'checkin') {
    ensureSession()
    game.ask('checkin')
  }
  if (d === 'idle') {
    ensureSession()
    game.ask('idle')
  }
  if (d === 'lock') game.goAway('locked')
  if (d === 'active') presence.active()
  if (d === 'gap' && s()) {
    s()!.lastBeat -= 10 * 60 * 1000
    game.beat()
  }
  if (d === 'dungeon') return enterDungeon(`${import.meta.env.BASE_URL}dungeon.html?id=${game.islandDef.dungeon}&gate=${game.islandDef.id}`)
  if (d === 'sail-frost' && game.save.island !== 'frost') {
    if (s()) game.endSession(false)
    game.sail('frost')
  }
  if (d === 'sail-home' && game.save.island !== 'home') {
    if (s()) game.endSession(false)
    game.sail('home')
  }
  if (d === 'tour') {
    game.setTutorial('meet')
    location.reload()
  }
  if (d === 'reset') {
    game.reset()
    location.reload()
  }
}
function buildDebug() {
  const el = app.querySelector<HTMLElement>('.debug')
  if (!el) return
  const b = (id: string, label: string) => `<button class="btn" data-d="${id}">${label}</button>`
  el.innerHTML = `
    <p class="debug-title">Demo controls (also in game: press \` or More → Cheats)</p>
    ${CHEATS.map((g) => `<div class="debug-row"><span style="opacity:.6;min-width:110px">${g.title}</span>${g.items.map(([id, label]) => b(id, label)).join('')}</div>`).join('')}
    <div class="debug-row"><label class="time"><span>Hour</span><input type="range" min="0" max="24" step="0.1" value="${clockHour()}" /><output></output></label></div>`
  const slider = el.querySelector<HTMLInputElement>('input')!
  const out = el.querySelector('output')!
  slider.addEventListener('input', () => {
    hourOverride = Number(slider.value)
    out.textContent = slider.value
  })
  el.addEventListener('click', (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-d]')?.dataset.d
    if (d) cheat(d)
  })
}
// the in-game Cheats window
window.addEventListener('keydown', (e) => {
  if (e.key !== '`' || (e.target as HTMLElement | null)?.closest?.('input, textarea') || !hud) return
  hud.toggleCheats(CHEATS, cheat)
})

// ---------- boot ----------
async function boot() {
  if (visitData) {
    const [m] = await Promise.all([loadManifest()])
    manifest = m
    void cloud.initCloud() // signed in, so you can leave marks on the island you visit
    initAudio({ sounds: () => true, music: () => true })
    wantsMusic(true)
    return bootVisit(visitData)
  }
  const [m, roster] = await Promise.all([loadManifest(), fetch(import.meta.env.BASE_URL + `data/roster.json?v=${__BUILD__}`).then((r) => r.json())])
  manifest = m
  game = new Game((roster as { species: Roster }).species)
  initAudio({ sounds: () => game.save.settings.sound !== false, music: () => game.save.settings.music !== false, volume: () => game.save.settings.volume ?? 1 })
  wantsMusic(clockOwner)
  // fire types light up the dark around them
  for (const [k, sp] of Object.entries((roster as { species: Roster }).species)) if (sp.types?.includes('fire')) scene.glowDex.add(k.padStart(4, '0'))
  scene.hour = clockHour()

  hud = new Hud(
    win,
    game,
    {
      start: () => {
        askNotify()
        game.startSession()
      },
      end: () => {
        const s = game.save.session
        if (!s) return
        // a paused session ends as it is; an Open one counts as complete only after 30 minutes (game.ts)
        if (s.state !== 'running') return game.endSession(false)
        if (!s.length) return game.endSession(true)
        if (hud.hasTag('endnow')) return // one "End now?" at a time
        hud.say({
          dex: lead(),
          tag: 'endnow',
          text: 'End now? You\'ll keep your minutes, but there\'s no berry this time.',
          actions: [
            { label: 'End session', run: () => game.endSession(false) },
            { label: 'Keep going', primary: true, run: () => {} },
          ],
        })
      },
      back: () => game.comeBack(),
      stillHere: () => game.answerStillHere(),
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
        sfx('buy')
        game.save.decor.owned.push(id)
        // a new decoration goes to the nearest open ground to the middle of the island
        const placed = arrange.placeNew(id)
        hud.toast(placed ? 'Placed. Arrange the island to move it.' : 'Bought. Put something away to make room.')
        saveDecor()
      },
      placeDecor: (id) => {
        if (game.inSession) return
        if (!arrange.placeNew(id)) return hud.toast('There is no room for it.')
        saveDecor()
        arrange.open(id)
      },
      moveDecor: (id) => arrange.open(id),
      arrange: () => arrange.open(),
      islandArrow,
      storeDecor: (id) => {
        const from = decorSlotOf(id)
        if (!from || game.inSession) return
        game.save.decor.slots[from] = null
        if (game.save.decor.pos) delete game.save.decor.pos[from]
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
      pet: (id) => {
        const c = scene.byMon(id)
        if (c) {
          scene.petAt(c)
          if (!c.asleep) cry(game.mon(id)!.dex)
        }
      },
      toggleSound: () => {
        game.save.settings.sound = game.save.settings.sound === false
        game.persist()
        hud.refreshSheet()
      },
      setVolume: (v) => {
        game.save.settings.volume = v
        game.persist()
        applyVolume()
        sfx('click')
        hud.refreshSheet()
      },
      toggleAlarm: () => {
        game.save.settings.alarm = game.save.settings.alarm === false
        game.persist()
        if (game.save.settings.alarm) askNotify()
        hud.refreshSheet()
      },
      toggleMusic: () => {
        game.save.settings.music = game.save.settings.music === false
        game.persist()
        syncMusic()
        hud.refreshSheet()
      },
      cheats: () => hud.toggleCheats(CHEATS, cheat),
      visit: (id) => void visitFriend(id),
      inviteDungeon: (id) => void inviteDungeon(id),
      gift: (id, name, kind, ref) => void sendGift(id, name, kind, ref),
      trades: () => hudTrades,
      tradeOffer: (fid, mid) => void offerTrade(fid, mid),
      tradeAccept: (tid, mid) => void acceptTrade(tid, mid),
      tradeDecline: (tid) => void (async () => {
        await cloud.tradeDecline(tid)
        await takeTrades() // a taken-back offer comes home at once
      })(),
      sailorTrade: (mid) => {
        const r = game.sailorTrade(mid)
        if (!r) return hud.toast('The sailor trades once a week.')
        const text = `The sailor traded your ${game.name(r.from)} away and straight back. It evolved into ${game.name(r.mon.dex)}!`
        hud.say({ dex: r.mon.dex, emotion: 'Happy', text, wait: true })
        game.note('evolve', text, { dex: r.mon.dex })
        hud.refreshSheet()
      },
      sail: (to) => {
        if (!game.sail(to)) hud.toast(game.inSession ? 'Sail between sessions.' : 'Not yet.')
      },
      assign: (id, role) => {
        if (!game.assign(id, role)) hud.toast(game.inSession ? 'Change roles between sessions.' : 'That spot is taken.')
        hud.refreshSheet()
      },
      expedition: (id, long, dest) => {
        if (!game.sendExpedition(id, long, dest)) hud.toast(game.inSession ? 'Send them off between sessions.' : 'Someone is already away.')
        hud.refreshSheet()
      },
      buildHabitat: (id) => {
        if (!game.buildHabitat(id)) hud.toast(game.inSession ? 'Build between sessions.' : 'Not enough Star Pieces or shells.')
        hud.refreshSheet()
      },
      buyFood: (id, n) => {
        if (!game.buyFood(id, n)) hud.toast(game.inSession ? 'The shop opens between sessions.' : 'Not enough shells.')
        else sfx('buy')
        hud.refreshSheet()
      },
      setBait: (id) => {
        if (game.setBait(id)) hud.toast(`${FOODS.find((f) => f.id === id)!.name} is out until your session ends.`)
        hud.refreshSheet()
      },
      buyBall: (b, n) => {
        if (!game.buyBall(b, n)) hud.toast(game.inSession ? 'The shop opens between sessions.' : 'Not enough shells.')
        else {
          sfx('buy')
          hud.toast(`${n === 1 ? 'A' : n} ${BALLS.find((x) => x.id === b)!.name}${n === 1 ? '' : 's'}.`)
        }
      },
      popOut: popoutMode ? undefined : popOut,
      // the plain pop-out page closes itself; the always-on-top window closes and the island goes back to the tab
      closeSmall: floatMode ? undefined : () => (window.documentPictureInPicture?.window ? window.documentPictureInPicture.window.close() : window.close()),
      quit: tauri ? () => void invoke?.('plugin:window|close', { label: 'main' }) : undefined,
    },
    creditsHtml,
  )
  arrange = createArrange({ canvas, scene, game, hud, save: saveDecor })
  // a press outside an open window closes it, and that press does nothing else
  let swallow = false
  win.addEventListener(
    'pointerdown',
    (e) => {
      if (hud.closeOutside(e.target as Element)) {
        swallow = true
        setTimeout(() => (swallow = false), 500) // in case no click follows the press
        e.stopPropagation()
      }
    },
    true,
  )
  win.addEventListener(
    'click',
    (e) => {
      if (!swallow) return
      swallow = false
      e.stopPropagation()
      e.preventDefault()
    },
    true,
  )
  if (popoutMode && !floatMode) hud.setSmall(true) // the plain pop-out page is itself the small window
  game.on(onGame)
  new ResizeObserver(() => hud.fit(canvas)).observe(canvas)
  {
    fitInto(window)
    window.addEventListener('resize', () => host === window && fitInto(window))
  }

  tour = new Tour({
    game,
    hud,
    scene,
    canvas,
    ensure,
    after,
    adopt: (dex, c) => (adopt = { dex, c }),
    startIntro,
    introDone: () => !scene.intro,
    catching: () => !!catching,
  })
  // back after a long time away: a session left paused (or running in a closed tab) ends as it was,
  // keeping its minutes, so the break is free to catch whoever is waiting
  {
    const st = game.save.session
    if (st && game.now() - st.lastBeat > 30 * 60 * 1000) {
      game.endSession(!st.length)
      after(2.5, () => hud.say({ dex: lead(), text: 'Welcome back. Your last session ended while you were away. You kept its minutes.', auto: 6500 }))
    }
  }
  if (!game.hasStarter) {
    // the prologue: the answer to "which Pokémon did you start with?" is your starter
    void (async () => {
      const screen = black ?? blackScreen(app.querySelector<HTMLElement>('.pip-stage')!)
      const dex = await runPrologue(screen, canvas, (d) => game.name(d))
      startIntro(1)
      game.chooseStarter(dex)
      game.setTutorial('meet')
      liftBlack(screen)
    })()
  } else {
    black?.remove()
    if (game.save.tutorial === 'prologue') game.setTutorial('meet')
    await syncParty(true)
    welcomeBack()
    if (!game.save.session) after(8, () => tellTip())
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
  scene.setDecor(game.save.decor.slots, game.save.decor.pos)
  syncLandmarks()
  scene.festival = game.festival
  scene.setHabitats(game.save.habitats)
  scene.setBait(game.save.bait)
  void placeGuardian()
  game.hour = () => hourOverride ?? clockHour()
  syncWild()
  syncFinds()
  syncSea()
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
    setInterval(() => void checkInvites(), 20_000)
  })
  syncSleep(true)
  buildDebug()
  startLoop()
}

function creditsHtml() {
  const names = (xs: { name: string }[]) => xs.map((a) => a.name).join(', ')
  const rows = Object.values(manifest.species)
    .map((s) => `<li><strong>${s.name}</strong> ${names(s.credits.sprite)} / ${names(s.credits.portrait)}</li>`)
    .join('')
  return `<p>PMD Sprite Repository, CC BY-NC 4.0. Cries and page sprites: Pokémon Showdown. Data and item icons: PokéAPI. Sound effects: Case Portman Audio (Cute & Cozy UI Audio). Music: Mayra, Free Ambient Music (Loop), mayragandra.itch.io. Island trees, grass, flowers and rocks: Flurmimon, Flurmimon's Tileset - Nature (DeviantArt). Sprite / portrait artists:</p><ul>${rows}</ul>`
}

window.__island = {
  audio: audioState,
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
  replayIntro: () => startIntro(),
  cheat: (id: string) => cheat(id),
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
