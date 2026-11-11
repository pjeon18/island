// The opening for a new player, in two parts.
//
// 1. The prologue: a black screen and a text box. A voice that has just woken
//    up asks the time (a nod to the professor who asks you to set the clock)
//    and then which Pokémon you started your journey with. Your answer is your
//    starter, as if it had always been. Then the clouds part on the island.
// 2. The tour: Wooper, who has lived on the island alone, asks for help
//    bringing friends back. It walks you through a first catch, gives you its
//    savings, has you build a pond, and explains focus sessions and the
//    Journal. Then it joins your party.
//
// Every step is saved (save.tutorial), so a reload resumes where you were.
// Copy rules: one plain sentence per line, the real button names, no filler.
import type { Creature } from './creature'
import { GUIDE_DEX, GUIDE_GIFT, type Game, type GameEvent, type TutorialStep } from './game'
import type { Dialog, Hud } from './hud'
import { portraitUrl } from './hud'
import type { Scene } from './scene'
import type { Species } from './sprites'

export const STARTER_CHOICES = [1, 4, 7, 25]

export interface TutorialCtx {
  game: Game
  hud: Hud
  scene: Scene
  canvas: HTMLCanvasElement
  ensure: (dex: number) => Promise<Species>
  after: (sec: number, fn: () => void) => void
  /** The next party member with this species becomes this creature (main.ts `adopt`). */
  adopt: (dex: number, c: Creature) => void
  /** Play the cloud opening, starting hidden for `hold` extra seconds. */
  startIntro: (hold: number) => void
  introDone: () => boolean
  /** True while a ball is in the air or wobbling. */
  catching: () => boolean
}

// ---------------------------------------------------------------------------
// the prologue
// ---------------------------------------------------------------------------

/** The black screen goes up at once (before anything loads) so a new player never sees the island first. */
export function blackScreen(stage: HTMLElement) {
  const el = document.createElement('div')
  el.className = 'prologue'
  stage.append(el)
  return el
}

type Choice = { label: string; html?: string; value: string }

class TextBox {
  private ui: HTMLElement
  private text: HTMLElement
  private menu: HTMLElement
  private full = ''
  private shown = 0
  private timer = 0
  private resolve: ((v: string) => void) | null = null
  private choices: Choice[] | null = null
  constructor(
    private root: HTMLElement,
    private canvas: HTMLCanvasElement,
  ) {
    this.ui = document.createElement('div')
    this.ui.className = 'hud prologue-ui'
    this.ui.innerHTML = `<div class="prologue-menu"></div><div class="px-panel prologue-box"><p class="prologue-text"></p><i class="hud-next" aria-hidden="true"></i></div>`
    root.append(this.ui)
    this.text = this.ui.querySelector('.prologue-text')!
    this.menu = this.ui.querySelector('.prologue-menu')!
    this.fit()
    new ResizeObserver(() => this.fit()).observe(canvas)
    this.ui.querySelector('.prologue-box')!.addEventListener('click', () => this.tap())
    window.addEventListener('keydown', this.onKey)
  }
  private onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      this.tap()
    }
  }
  /** Same footprint and scale as the HUD, over the island's picture. */
  fit() {
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    if (!cw) return
    const hs = cw >= 1680 ? 3 : cw >= 560 ? 2 : cw >= 400 ? 1.5 : Math.max(1, cw / 300)
    const cr = this.canvas.getBoundingClientRect()
    const rr = this.root.getBoundingClientRect()
    Object.assign(this.ui.style, {
      left: `${cr.left - rr.left}px`,
      top: `${cr.top - rr.top}px`,
      width: `${cw / hs}px`,
      height: `${ch / hs}px`,
      transform: `scale(${hs})`,
    })
  }
  private tap() {
    if (this.shown < this.full.length) {
      this.shown = this.full.length
      this.text.textContent = this.full
      this.showMenu()
      return
    }
    if (this.choices) return
    this.finish('')
  }
  private finish(v: string) {
    const r = this.resolve
    this.resolve = null
    this.choices = null
    this.menu.innerHTML = ''
    r?.(v)
  }
  private showMenu() {
    this.ui.classList.toggle('typing', this.shown < this.full.length)
    if (!this.choices || this.menu.childElementCount) return
    const cards = this.choices.some((c) => c.html)
    this.menu.className = `prologue-menu${cards ? ' cards' : ' px-panel'}`
    // sit just above the text box, however many lines it has
    const box = this.ui.querySelector<HTMLElement>('.prologue-box')!
    this.menu.style.bottom = `${box.offsetHeight + 20}px`
    for (const c of this.choices) {
      const b = document.createElement('button')
      b.className = cards ? 'prologue-card px-panel' : 'prologue-choice'
      b.innerHTML = c.html ?? c.label
      b.addEventListener('click', () => this.finish(c.value))
      this.menu.append(b)
    }
  }
  /** Type a line out; resolves on the next tap, or with the chosen value. */
  say(line: string, choices?: Choice[]) {
    window.clearInterval(this.timer)
    this.full = line
    this.shown = 0
    this.choices = choices ?? null
    this.menu.innerHTML = ''
    this.text.textContent = ''
    this.ui.classList.toggle('asks', !!choices)
    this.ui.classList.add('typing')
    this.timer = window.setInterval(() => {
      this.shown = Math.min(this.full.length, this.shown + 1)
      this.text.textContent = this.full.slice(0, this.shown)
      if (this.shown >= this.full.length) {
        window.clearInterval(this.timer)
        this.showMenu()
      }
    }, 28)
    return new Promise<string>((r) => (this.resolve = r))
  }
  close() {
    window.clearInterval(this.timer)
    window.removeEventListener('keydown', this.onKey)
    this.ui.remove()
  }
}

/** The black-screen conversation. Resolves with the chosen starter. */
export async function runPrologue(black: HTMLElement, canvas: HTMLCanvasElement, name: (dex: number) => string) {
  const box = new TextBox(black, canvas)
  const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000))
  await wait(0.8)
  await box.say('Hm? Oh! Hello there.')
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const t = await box.say('Sorry, I must have dozed off. What time is it?', [
    { label: `It's ${now}.`, value: 'time' },
    { label: 'No idea.', value: 'none' },
  ])
  await box.say(t === 'time' ? `${now}? Then there is still plenty of day left.` : "That's all right. I lose track of time too.")
  const pick = await box.say(
    'One more thing. Remind me, which Pokémon did you start your journey with?',
    STARTER_CHOICES.map((d) => ({ label: name(d), value: String(d), html: `<img src="${portraitUrl(d)}" alt="" /><span>${name(d)}</span>` })),
  )
  const dex = Number(pick)
  await box.say(`Of course, ${name(dex)}! You two have been together since day one.`)
  await box.say(`Your island is just ahead. ${name(dex)} knows the way.`)
  box.close()
  return dex
}

/** Lift the black screen over the clouds, which are already up behind it. */
export function liftBlack(black: HTMLElement) {
  black.classList.add('lift')
  setTimeout(() => black.remove(), 1000)
}

// ---------------------------------------------------------------------------
// the tour
// ---------------------------------------------------------------------------

export class Tour {
  private guideC: Creature | null = null
  private waiting: Dialog | null = null
  private started = false
  constructor(private x: TutorialCtx) {}

  get active() {
    const s = this.x.game.save.tutorial
    return s !== 'done' && s !== 'prologue'
  }

  /** Called every frame: starts the tour once the clouds have cleared. */
  update() {
    if (this.started || !this.active || !this.x.introDone()) return
    this.started = true
    void this.begin()
  }

  private get step() {
    return this.x.game.save.tutorial
  }
  private set(step: TutorialStep) {
    this.x.game.setTutorial(step)
  }
  private name(dex: number) {
    return this.x.game.name(dex)
  }
  /** One line from Wooper that waits for a click. */
  private line(text: string, o: Partial<Dialog> = {}) {
    return new Promise<void>((r) => this.x.hud.say({ dex: GUIDE_DEX, text, wait: true, onDone: () => r(), ...o }))
  }

  private async begin() {
    const { scene, ensure } = this.x
    // Wooper comes out of the tall grass and stands by the path to the pier
    const sp = await ensure(GUIDE_DEX)
    const gp = scene.island.grassPatch
    const c = scene.add(sp, gp.x + 4, gp.y + 2)
    const d = scene.dockTop
    const spot = scene.freeSpot({ x: d.x - 14, y: d.y - 18 })
    c.walkTo(spot.x, spot.y, 'hop')
    c.anchor = { x: spot.x, y: spot.y, r: 0 }
    this.guideC = c
    this.x.after(this.step === 'meet' ? 2.2 : 1.2, () => void this.run())
  }

  private async run() {
    const s = this.step
    if (s === 'meet') return this.meet()
    if (s === 'catch') return this.catchStep()
    if (s === 'build') return this.buildStep()
    if (s === 'focus') return this.focusStep()
  }

  private async meet() {
    await this.line("Oh! Visitors! Hi, I'm Wooper. I live on this island.", { emotion: 'Happy' })
    await this.line("Lots of Pokémon used to live here. They all drifted away, and now it's just me.")
    let skip = false
    await new Promise<void>((r) =>
      this.x.hud.say({
        dex: GUIDE_DEX,
        text: 'Will you help me fix up the island, so new friends come to stay?',
        actions: [
          { label: "I'll help", primary: true, run: () => {} },
          { label: 'Skip the tour', run: () => (skip = true) },
        ],
        onDone: () => r(),
      }),
    )
    if (skip) return this.skip()
    this.set('catch')
    return this.catchStep()
  }

  private async catchStep() {
    const g = this.x.game
    if (!g.save.wild.some((w) => w.guide)) {
      await this.line("Thank you! First, let's meet a neighbor. Listen, something's moving in the tall grass.", { emotion: 'Happy' })
      this.x.scene.rustleGrass(1.6)
      await new Promise<void>((r) => this.x.after(1.6, r))
      g.guideWild()
      await new Promise<void>((r) => this.x.after(1.6, r))
    }
    // this line stays up until the catch (onCaught closes it)
    this.waiting = { dex: GUIDE_DEX, text: `That's a wild ${this.name(16)}. Tap it, then press Throw to toss a Poké Ball.`, wait: true, task: true }
    this.x.hud.say(this.waiting)
  }

  /** Resolve once `ok()` holds, checking on sim time. */
  private until(ok: () => boolean) {
    return new Promise<void>((r) => {
      const check = () => (ok() ? r() : this.x.after(0.2, check))
      check()
    })
  }

  private async afterCatch(name: string) {
    // let the ball land and the game's own "Gotcha!" line finish first
    await this.until(() => !this.x.catching())
    await this.until(() => !this.x.hud.busy)
    await this.line(`You caught ${name}! It will live here with us now.`, { emotion: 'Happy' })
    await this.line("Every new kind of Pokémon you catch earns you a Star Piece. You use them to build habitats.")
    await this.line("I've been saving these. Take them.")
    this.x.hud.toast(`You got ${GUIDE_GIFT.shells} shells and ${GUIDE_GIFT.starPieces} Star Pieces.`)
    return this.buildStep()
  }

  private async buildStep() {
    const g = this.x.game
    if (g.save.habitats.length) {
      this.set('focus')
      return this.focusStep()
    }
    await this.line('Water Pokémon love ponds. With a pond here, more friends like me will visit.')
    // point at each control in turn: the Town Map button, the Habitats tab, then the Pond's build button
    this.x.hud.guide = () => {
      const v = this.x.hud.openView
      if (!v || v.tab !== 'island') return '[data-open-tab="island"]'
      if (v.sub !== 'habitats') return '[data-sub="habitats"]'
      return '[data-habitat="pond"]'
    }
    this.waiting = { dex: GUIDE_DEX, text: 'Tap the map button below, then Habitats, and build the Pond.', wait: true, task: true }
    this.x.hud.say(this.waiting)
  }

  private async afterBuild(name: string) {
    this.x.hud.guide = null
    this.x.hud.closeSheet()
    await new Promise<void>((r) => this.x.after(1.2, r))
    await this.line(name === 'Pond' ? 'The pond is ready! Water Pokémon can find their way here now.' : `The ${name.toLowerCase()} is ready! New Pokémon can find their way here now.`, { emotion: 'Happy' })
    this.set('focus')
    return this.focusStep()
  }

  private async focusStep() {
    await this.line("Here's the most important part. Pokémon only visit while you're focusing.")
    this.x.hud.guide = () => '[data-f="start"]'
    await this.line('Whenever you sit down to study, press Start focusing at the top left. Your team earns EXP for every minute.')
    this.x.hud.guide = () => '[data-open-tab="log"]'
    await this.line('Between sessions, catch whoever came by. Anything you miss is written in your Journal.')
    this.x.hud.guide = null
    await this.line("I'll stay and help out. Good luck with your first session!", { emotion: 'Happy' })
    this.finish()
  }

  private async skip() {
    await this.line("No problem. I'll stay and help out. Press Start focusing whenever you're ready to study.")
    this.x.game.guideGift('done')
    this.finish()
  }

  /** Wooper joins your party (or the box, if the party is full) and the tour ends. */
  private finish() {
    const g = this.x.game
    const c = this.guideC
    if (c) {
      c.anchor = undefined
      this.x.adopt(GUIDE_DEX, c)
    }
    const m = g.addMon(GUIDE_DEX, 5)
    if (!g.save.party.includes(m.id) && c) {
      const d = this.x.scene.dockTop
      c.walkTo(d.x, d.y + 4)
      c.enter('leave', 99)
    }
    g.note('catch', 'Wooper joined you.', { dex: GUIDE_DEX })
    this.x.hud.toast(g.save.party.includes(m.id) ? 'Wooper joined your party.' : 'Wooper went to your box.')
    g.setTutorial('done')
    this.x.hud.guide = null
  }

  /** Game events the tour waits on. */
  onEvent(e: GameEvent) {
    if (!this.active) return
    if (e.type === 'caught' && e.wild.guide && this.step === 'catch') {
      // the gift and the next step are saved now, so a reload mid-conversation never brings a second Pidgey
      this.x.game.guideGift('build')
      if (this.waiting) this.x.hud.close(this.waiting)
      this.waiting = null
      void this.afterCatch(this.name(e.mon.dex))
    }
    if (e.type === 'habitat' && this.step === 'build') {
      if (this.waiting) this.x.hud.close(this.waiting)
      this.waiting = null
      const names: Record<string, string> = { pond: 'Pond', rocks: 'Rocks', grass: 'Tall grass', cave: 'Cave' }
      void this.afterBuild(names[e.id] ?? 'Habitat')
    }
  }
}
