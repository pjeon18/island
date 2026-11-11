// T1: the first playable slice. You pick a starter, start a focus session,
// your party gains 1 EXP per verified focused minute, evolves at the real
// levels, and a visitor comes out of the tall grass when a session finishes.
import './styles.css'
import { Creature } from './creature'
import { Game, GameEvent, Mon, Roster } from './game'
import { Hud, fmtMinutes } from './hud'
import { H, W } from './island'
import { PresenceHandlers, enableIdleDetection, startIdleDetection } from './presence'
import { Scene } from './scene'
import { Manifest, Species, loadManifest, loadSpecies } from './sprites'

const STARTERS = [1, 4, 7]
const params = new URLSearchParams(location.search)
const popoutMode = params.has('popout')
const debug = params.has('debug')

// ---------- page ----------
const app = document.getElementById('app')!
app.innerHTML = popoutMode
  ? `<div class="pip-stage"><div class="window"><canvas class="stage"></canvas></div></div>`
  : `
  <header class="head">
    <h1>Island</h1>
    <p>A small island of Pokémon that keeps you company while you study. Start a focus session and your party gains experience for every minute you work. When a session ends, a wild Pokémon comes out of the tall grass.</p>
  </header>
  <main class="stage-wrap">
    <div class="window"><canvas class="stage"></canvas></div>
    <div class="below">
      <button class="btn btn-primary" data-act="popout">Pop out</button>
      <p>Pop out keeps the island on top of your other windows in Chrome and Edge, so it can sit in the corner of your screen.</p>
    </div>
  </main>
  ${debug ? `<section class="debug"></section>` : ''}
  <section class="rules">
    <h2>How your time is counted</h2>
    <p>Only time inside a focus session counts. You start each session yourself, and every party Pokémon gains one experience point for each focused minute.</p>
    <p>Time while your computer sleeps or the window is closed is never counted. Every 20 minutes the island asks whether you are still studying, and if nobody answers within two minutes, your party rests and the clock pauses.</p>
    <p>If you turn on idle detection in Chrome, the island asks only after 10 minutes without keyboard or mouse use, and it pauses right away when your screen locks. The browser shares only whether you are active, never what you are doing.</p>
    <p>Nothing on the island is for sale, and nothing makes your Pokémon grow faster than your own focused time.</p>
  </section>
  <footer class="credits">
    <p>Pokémon sprites and portraits are from the <a href="https://sprites.pmdcollab.org" target="_blank" rel="noreferrer">PMD Sprite Repository</a>, used under <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer">CC BY-NC 4.0</a>. Sprites credited to Chunsoft come from the Pokémon Mystery Dungeon games. Species and evolution data are from <a href="https://pokeapi.co" target="_blank" rel="noreferrer">PokéAPI</a>. Pokémon is © Nintendo, Creatures Inc. and GAME FREAK inc. This is a free fan project with no affiliation.</p>
  </footer>`

const win = app.querySelector<HTMLElement>('.window')!
const canvas = app.querySelector<HTMLCanvasElement>('canvas.stage')!
canvas.width = W
canvas.height = H
const g = canvas.getContext('2d')!

// ---------- state ----------
let manifest: Manifest
let game: Game
let hud: Hud
const scene = new Scene()
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

async function syncParty(initial = false) {
  const want = game.party
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
    } else {
      const d = scene.dockTop
      const c = scene.add(sp, d.x, d.y + 2)
      c.monId = m.id
      const p = scene.freeSpot({ x: d.x, y: d.y - 24 })
      c.walkTo(p.x, p.y)
    }
  }
  syncSleep(true)
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
async function runVisit() {
  if (visiting) return
  visiting = true
  const { dex, level } = game.pickVisitor()
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
        text: `A wild ${name} came out of the tall grass. It is level ${level} and wants to come along.`,
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
                  ? `${name} joined your party. It will grow while you focus.`
                  : `${name} went to rest in your box. You can bring it into your party between sessions.`,
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
              hud.say({ text: `${name} went back into the tall grass.`, auto: 3000 })
              visiting = false
            },
          },
        ],
      })
    }
  })
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
            text: `${game.name(e.mon)} stopped evolving. You can let it evolve later from your Pokémon list.`,
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

// ---------- game events ----------
function onGame(e: GameEvent) {
  switch (e.type) {
    case 'sessionStart':
      hud.toast('Your session has started. Your party grows while you focus.')
      syncSleep()
      break
    case 'sessionEnd':
      hud.clearQueue((d) => d.text.includes('still studying'))
      if (e.complete) hud.toast(`You focused for ${fmtMinutes(e.minutes)}.`)
      else
        hud.say({
          dex: lead(),
          text: `You focused for ${fmtMinutes(e.minutes)}. Visitors come at the end of a full session.`,
          auto: 5000,
        })
      syncSleep()
      break
    case 'visit':
      after(1.2, () => runVisit())
      break
    case 'levelUp': {
      const c = scene.byMon(e.mon.id)
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
            ? 'Your computer has been idle for 10 minutes. Are you still studying? If nobody answers in two minutes, your party will rest.'
            : 'Are you still studying? If nobody answers in two minutes, your party will rest and the clock will pause.',
        actions: [{ label: 'I am still here', primary: true, run: () => game.answerStillHere() }],
      })
      break
    case 'away': {
      if (hud.busy && hud.currentText.includes('still studying')) hud.dismiss()
      hud.clearQueue((d) => d.text.includes('still studying'))
      syncSleep()
      const why =
        e.reason === 'gap'
          ? 'The island paused while you were away. Time while your computer slept or this window was closed does not count.'
          : e.reason === 'locked'
            ? 'Your screen locked, so your party is resting and the clock is paused.'
            : `Nobody answered, so your party is resting and the clock is paused.${e.retractedMin ? ` The last ${fmtMinutes(e.retractedMin)} of idle time were not counted.` : ''}`
      hud.say({ dex: lead(), text: why, auto: 7000 })
      break
    }
    case 'back':
      if (hud.busy && hud.currentText.includes('still studying')) hud.dismiss()
      hud.toast('Welcome back. The clock is running again.')
      syncSleep()
      break
    case 'partyChanged':
      syncParty()
      hud.refreshSheet()
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

function tick(dt: number) {
  const target = hourOverride ?? clockHour()
  const diff = target - scene.hour
  scene.hour += Math.abs(diff) > 6 ? diff : Math.sign(diff) * Math.min(Math.abs(diff), dt * 2)
  scene.update(dt)
  runTimers()
  stepEvolution(dt)
}
function frame(now: number) {
  lastFrameAt = now
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  tick(dt)
  scene.render(g, dt)
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
setInterval(() => clockOwner && game?.beat(), 1000)
document.addEventListener('visibilitychange', () => clockOwner && game?.beat())
window.addEventListener('storage', (e) => {
  if (e.key !== 'island-save-v1' || !game) return
  game.reload()
  syncParty()
  syncSleep()
})

// ---------- pop out ----------
declare global {
  interface Window {
    documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Window>; window: Window | null }
    __island: unknown
  }
}
function fitInto(w: Window) {
  const s = Math.max(1, Math.floor(Math.min(w.innerWidth / W, w.innerHeight / H)))
  canvas.style.width = `${W * s}px`
  canvas.style.height = `${H * s}px`
  hud?.fit(canvas)
}
function plainPopOut() {
  window.open(`${location.pathname}?popout`, 'island', `width=${W * 2},height=${H * 2}`)
  hud.toast('This browser cannot keep a window on top, so the island opened in an ordinary window.')
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
    canvas.style.width = ''
    canvas.style.height = ''
    host = window
    window.requestAnimationFrame(raf)
    requestAnimationFrame(() => hud.fit(canvas))
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
    <div class="debug-row">${b('visit', 'Visitor now')}${b('evolve', 'Lead is ready to evolve')}${b('checkin', 'Ask now')}${b('idle', 'Simulate 10 idle minutes')}${b('lock', 'Simulate screen lock')}${b('active', 'Simulate activity')}${b('gap', 'Simulate a 10 minute sleep')}</div>
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
    if (d === 'evolve') {
      const m = game.party[0]
      const next = m && game.species(m.dex)?.evolvesTo[0]
      if (m && next) {
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
  const [m, roster] = await Promise.all([loadManifest(), fetch(import.meta.env.BASE_URL + 'data/roster.json').then((r) => r.json())])
  manifest = m
  game = new Game((roster as { species: Roster }).species)
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
          text: 'End this session now? Your focused minutes stay counted, but visitors only come at the end of a full session.',
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
        hud.say({ dex, emotion: 'Happy', text: `${name} will study with you. Press Start focusing when you are ready.` })
      },
      setLength: (sec) => {
        game.save.settings.length = sec
        game.persist()
      },
      toggleParty: (id, on) => {
        if (!game.setInParty(id, on)) hud.toast('You can change your party between sessions.')
      },
      allowEvolution: (id) => {
        const mon = game.mon(id)
        if (mon) game.allowEvolution(mon)
        hud.toast('It will evolve during your next session.')
      },
      enableIdle: async () => {
        const ok = await enableIdleDetection(presence)
        game.save.settings.detector = ok
        game.persist()
        hud.refreshSheet()
        if (!ok) hud.toast('Idle detection was not allowed, so the island will keep asking every 20 minutes.')
      },
      popOut: popoutMode ? undefined : popOut,
    },
    creditsHtml,
  )
  game.on(onGame)
  new ResizeObserver(() => hud.fit(canvas)).observe(canvas)
  if (popoutMode) {
    fitInto(window)
    window.addEventListener('resize', () => fitInto(window))
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
  if (game.save.settings.detector) {
    const ok = await startIdleDetection(presence)
    if (!ok) {
      game.save.settings.detector = false
      game.persist()
    }
  }
  if (clockOwner) game.beat() // settles any time that passed while the island was closed
  syncSleep(true)
  buildDebug()
  window.requestAnimationFrame(raf)
}

function creditsHtml() {
  const names = (xs: { name: string }[]) => xs.map((a) => a.name).join(', ')
  const rows = Object.values(manifest.species)
    .map((s) => `<li><strong>${s.name}</strong>: sprite by ${names(s.credits.sprite)}; portrait by ${names(s.credits.portrait)}.</li>`)
    .join('')
  return `<p>Sprites and portraits are from the PMD Sprite Repository (sprites.pmdcollab.org), used under CC BY-NC 4.0. Sprites credited to Chunsoft come from the Pokémon Mystery Dungeon games. Species and evolution data are from PokéAPI. Pokémon is © Nintendo, Creatures Inc. and GAME FREAK inc. This is a free fan project with no affiliation.</p><ul>${rows}</ul>`
}

window.__island = {
  get game() {
    return game
  },
  get hud() {
    return hud
  },
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
