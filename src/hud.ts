// The interface inside the island window. It is laid out in island pixels
// (240×180) and scaled with the canvas, so it travels into the pop-out
// window as one piece. Dialogs follow PMD: a portrait beside a text box.
import { Game, Mon, PARTY_MAX, expToNext } from './game'

const BASE = import.meta.env.BASE_URL
export const portraitUrl = (dex: number, emo = 'Normal') => `${BASE}sprites/${String(dex).padStart(4, '0')}/${emo}.png`

export interface DialogAction {
  label: string
  primary?: boolean
  run: () => void
}
export interface Dialog {
  dex?: number
  emotion?: string
  text: string
  actions?: DialogAction[]
  /** dismiss on its own after this many ms (no actions) */
  auto?: number
  onShow?: () => void
}

export interface HudHandlers {
  start: () => void
  end: () => void
  back: () => void
  stillHere: () => void
  chooseStarter: (dex: number) => void
  setLength: (sec: number | null) => void
  toggleParty: (id: string, on: boolean) => void
  allowEvolution: (id: string) => void
  enableIdle: () => void
  popOut?: () => void
}

const fmtClock = (sec: number) => {
  sec = Math.max(0, Math.floor(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
export const fmtMinutes = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} minute${m === 1 ? '' : 's'}`
  return `${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minute${m === 1 ? '' : 's'}` : ''}`
}

export class Hud {
  el: HTMLElement
  private focus: HTMLElement
  private party: HTMLElement
  private dialogEl: HTMLElement
  private toastEl: HTMLElement
  private sheet: HTMLElement
  private starter: HTMLElement
  private queue: Dialog[] = []
  private current: Dialog | null = null
  private autoTimer = 0
  private toastTimer = 0
  private sheetTab: 'mons' | 'settings' | 'credits' = 'mons'
  private lastFocusKey = ''
  private lastPartyKey = ''

  constructor(host: HTMLElement, private game: Game, private h: HudHandlers, private credits: () => string) {
    this.el = document.createElement('div')
    this.el.className = 'hud'
    this.el.innerHTML = `
      <div class="hud-focus"></div>
      <button class="hud-party" aria-label="Your Pokémon"></button>
      <div class="hud-toast" aria-live="polite"></div>
      <div class="hud-dialog" hidden>
        <img class="hud-portrait" alt="" />
        <div class="hud-dialog-body"><p class="hud-text"></p><div class="hud-actions"></div></div>
      </div>
      <div class="hud-sheet" hidden></div>
      <div class="hud-starter" hidden></div>`
    host.append(this.el)
    this.focus = this.el.querySelector('.hud-focus')!
    this.party = this.el.querySelector('.hud-party')!
    this.dialogEl = this.el.querySelector('.hud-dialog')!
    this.toastEl = this.el.querySelector('.hud-toast')!
    this.sheet = this.el.querySelector('.hud-sheet')!
    this.starter = this.el.querySelector('.hud-starter')!

    this.party.addEventListener('click', () => this.openSheet('mons'))
    this.focus.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]')
      if (!b) return
      const f = b.dataset.f
      if (f === 'start') this.h.start()
      else if (f === 'end') this.h.end()
      else if (f === 'back') this.h.back()
      else if (f === 'still') this.h.stillHere()
      else if (f?.startsWith('len:')) {
        const v = f.slice(4)
        this.h.setLength(v === 'open' ? null : Number(v) * 60)
        this.lastFocusKey = ''
      }
    })
    this.sheet.addEventListener('click', (e) => this.onSheetClick(e))
  }

  /** Scale the island-pixel layout to the canvas's on-screen size. */
  fit(canvas: HTMLCanvasElement) {
    const s = canvas.clientWidth / 240
    this.el.style.transform = `scale(${s})`
  }

  // ---------- per-frame state ----------
  update() {
    const g = this.game
    const s = g.save.session
    // focus widget: rebuild only when its shape changes, then just update the clock text
    const key = !g.hasStarter ? 'none' : !s ? `idle:${g.save.settings.length}` : s.state
    if (key !== this.lastFocusKey) {
      this.lastFocusKey = key
      const len = g.save.settings.length
      const seg = (v: string, label: string, on: boolean) => `<button class="seg${on ? ' on' : ''}" data-f="len:${v}">${label}</button>`
      this.focus.innerHTML =
        key === 'none'
          ? ''
          : !s
            ? `<button class="px-btn primary" data-f="start">Start focusing</button>
               <div class="segs">${seg('25', '25 min', len === 1500)}${seg('50', '50 min', len === 3000)}${seg('open', 'Open', len === null)}</div>`
            : s.state === 'running'
              ? `<div class="px-panel clock"><span class="clock-t"></span><span class="clock-l">${s.length ? 'Focusing' : 'Focusing, open session'}</span></div>
                 <button class="px-btn small" data-f="end">End session</button>`
              : s.state === 'asking'
                ? `<div class="px-panel clock"><span class="clock-t"></span><span class="clock-l">Waiting for you</span></div>
                   <button class="px-btn primary small" data-f="still">I am still here</button>`
                : `<div class="px-panel clock away"><span class="clock-t"></span><span class="clock-l">Paused</span></div>
                   <button class="px-btn primary small" data-f="back">I am back</button>`
    }
    const t = this.focus.querySelector('.clock-t')
    if (t && s) t.textContent = s.length ? fmtClock(s.length - s.credited) : fmtClock(s.credited)

    // party chips
    const pk = g.party.map((m) => `${m.id}:${m.dex}:${m.level}:${m.exp}`).join('|')
    if (pk !== this.lastPartyKey) {
      this.lastPartyKey = pk
      this.party.innerHTML = g.party
        .map((m) => {
          const pct = Math.round((m.exp / expToNext(m.level)) * 100)
          return `<span class="chip"><img src="${portraitUrl(m.dex)}" alt="" /><span class="lv">Lv ${m.level}</span><span class="bar"><i style="width:${pct}%"></i></span></span>`
        })
        .join('')
      this.party.setAttribute('aria-label', `Your party: ${g.party.map((m) => `${g.name(m)}, level ${m.level}`).join('; ')}. Open your Pokémon.`)
      if (!this.sheet.hidden) this.renderSheet()
    }
  }

  // ---------- dialog queue ----------
  say(d: Dialog) {
    this.queue.push(d)
    if (!this.current) this.next()
  }
  /** Replace whatever is showing right now (used to resolve a question). */
  dismiss() {
    window.clearTimeout(this.autoTimer)
    this.current = null
    this.dialogEl.classList.remove('show')
    this.dialogEl.hidden = true
    this.next()
  }
  get busy() {
    return !!this.current
  }
  get currentText() {
    return this.current?.text ?? ''
  }
  private next() {
    const d = this.queue.shift()
    if (!d) return
    this.current = d
    const img = this.dialogEl.querySelector<HTMLImageElement>('.hud-portrait')!
    if (d.dex) {
      img.hidden = false
      img.src = portraitUrl(d.dex, d.emotion ?? 'Normal')
      img.onerror = () => (img.src = portraitUrl(d.dex!))
    } else img.hidden = true
    this.dialogEl.querySelector('.hud-text')!.textContent = d.text
    const acts = this.dialogEl.querySelector('.hud-actions')!
    acts.innerHTML = ''
    for (const a of d.actions ?? []) {
      const b = document.createElement('button')
      b.className = `px-btn small${a.primary ? ' primary' : ''}`
      b.textContent = a.label
      b.addEventListener('click', () => {
        if (this.current !== d) return
        a.run()
        if (this.current === d) this.dismiss()
      })
      acts.append(b)
    }
    this.dialogEl.hidden = false
    requestAnimationFrame(() => this.dialogEl.classList.add('show'))
    d.onShow?.()
    if (!d.actions?.length) this.autoTimer = window.setTimeout(() => this.current === d && this.dismiss(), d.auto ?? 4200)
  }
  clearQueue(filter: (d: Dialog) => boolean) {
    this.queue = this.queue.filter((d) => !filter(d))
  }

  toast(text: string) {
    this.toastEl.textContent = text
    this.toastEl.classList.add('show')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 3800)
  }

  // ---------- starter ----------
  showStarter(options: number[]) {
    const g = this.game
    this.starter.hidden = false
    this.starter.innerHTML = `
      <div class="px-panel starter-panel">
        <p class="starter-title">Choose the Pokémon that will study with you.</p>
        <p class="starter-sub">It gains experience only while you focus.</p>
        <div class="starter-row">
          ${options.map((d) => `<button class="starter-pick" data-dex="${d}"><img src="${portraitUrl(d)}" alt="" /><span>${g.name(d)}</span></button>`).join('')}
        </div>
      </div>`
    this.starter.querySelectorAll<HTMLButtonElement>('.starter-pick').forEach((b) =>
      b.addEventListener('click', () => {
        this.starter.hidden = true
        this.h.chooseStarter(Number(b.dataset.dex))
      }),
    )
  }

  // ---------- sheet: your Pokémon, settings, credits ----------
  openSheet(tab: 'mons' | 'settings' | 'credits') {
    this.sheetTab = tab
    this.sheet.hidden = false
    this.renderSheet()
  }
  closeSheet() {
    this.sheet.hidden = true
  }
  private renderSheet() {
    const g = this.game
    const tab = (id: string, label: string) => `<button class="tab${this.sheetTab === id ? ' on' : ''}" data-tab="${id}">${label}</button>`
    let body = ''
    if (this.sheetTab === 'mons') {
      const inSession = !!g.save.session
      const order = [...g.party, ...g.save.mons.filter((m) => !g.save.party.includes(m.id))]
      body =
        (inSession ? `<p class="note">You can change your party between sessions.</p>` : '') +
        order.map((m) => this.monRow(m, inSession)).join('') +
        `<p class="note">${g.save.mons.length} Pokémon on your island. Up to ${PARTY_MAX} can be in your party.</p>`
    } else if (this.sheetTab === 'settings') {
      const len = g.save.settings.length
      const det = g.save.settings.detector
      const idleOk = typeof (window as unknown as { IdleDetector?: unknown }).IdleDetector === 'function'
      const streak = g.streak()
      body = `
        <p class="row-title">Session length</p>
        <div class="segs wide">
          <button class="seg${len === 1500 ? ' on' : ''}" data-len="25">25 minutes</button>
          <button class="seg${len === 3000 ? ' on' : ''}" data-len="50">50 minutes</button>
          <button class="seg${len === null ? ' on' : ''}" data-len="open">Open</button>
        </div>
        <p class="note">A visitor comes at the end of each full session. In an open session, one comes every 30 focused minutes.</p>
        <p class="row-title">Noticing when you step away</p>
        ${
          det
            ? `<p class="note">Idle detection is on. If your computer sees no keyboard or mouse use for 10 minutes, the island asks whether you are still studying. If the screen locks, the clock pauses right away.</p>`
            : `<p class="note">The island asks whether you are still studying every 20 minutes. ${idleOk ? 'If you turn on idle detection, it only asks after 10 minutes without keyboard or mouse use. The browser shares nothing about what you are doing, only whether you are active.' : ''}</p>
               ${idleOk ? `<button class="px-btn small" data-act="idle">Turn on idle detection</button>` : ''}`
        }
        <p class="row-title">Your focus</p>
        <p class="note">Today you have focused for ${fmtMinutes(g.todayMinutes())}. ${streak ? `You have focused ${streak} day${streak === 1 ? '' : 's'} in a row.` : ''}</p>
        ${this.h.popOut ? `<button class="px-btn small" data-act="popout">Pop out the island</button>` : ''}`
    } else {
      body = `<div class="credits-body">${this.credits()}</div>`
    }
    this.sheet.innerHTML = `
      <div class="px-panel sheet-panel">
        <div class="sheet-head">${tab('mons', 'Pokémon')}${tab('settings', 'Settings')}${tab('credits', 'Credits')}<button class="px-btn small close" data-act="close" aria-label="Close">Close</button></div>
        <div class="sheet-body">${body}</div>
      </div>`
  }
  private monRow(m: Mon, locked: boolean) {
    const g = this.game
    const inParty = g.save.party.includes(m.id)
    const pct = Math.round((m.exp / expToNext(m.level)) * 100)
    const next = g.species(m.dex)?.evolvesTo.find((e) => g.species(e.dex))
    const evo = m.noEvolve
      ? `<button class="px-btn small" data-allow="${m.id}">Let it evolve</button>`
      : next
        ? `<span class="hint">Evolves at level ${next.level}</span>`
        : ''
    const partyBtn = inParty
      ? `<button class="px-btn small" data-party="${m.id}:0" ${locked || g.save.party.length <= 1 ? 'disabled' : ''}>Rest in the box</button>`
      : `<button class="px-btn small" data-party="${m.id}:1" ${locked || g.save.party.length >= PARTY_MAX ? 'disabled' : ''}>Add to party</button>`
    return `
      <div class="mon-row${inParty ? ' in' : ''}">
        <img src="${portraitUrl(m.dex)}" alt="" />
        <div class="mon-main">
          <p><strong>${g.name(m)}</strong> <span>Lv ${m.level}</span>${inParty ? ' <em>In party</em>' : ''}</p>
          <span class="bar"><i style="width:${pct}%"></i></span>
          <p class="hint">Focused together for ${fmtMinutes(m.focusedMin)}. ${evo}</p>
        </div>
        ${partyBtn}
      </div>`
  }
  private onSheetClick(e: Event) {
    const t = e.target as HTMLElement
    const tab = t.closest<HTMLElement>('[data-tab]')
    if (tab) return this.openSheet(tab.dataset.tab as 'mons')
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act
    if (act === 'close') return this.closeSheet()
    if (act === 'idle') return this.h.enableIdle()
    if (act === 'popout') {
      this.closeSheet()
      return this.h.popOut?.()
    }
    const len = t.closest<HTMLElement>('[data-len]')?.dataset.len
    if (len) {
      this.h.setLength(len === 'open' ? null : Number(len) * 60)
      this.lastFocusKey = ''
      return this.renderSheet()
    }
    const p = t.closest<HTMLButtonElement>('[data-party]')
    if (p && !p.disabled) {
      const [id, on] = p.dataset.party!.split(':')
      this.h.toggleParty(id, on === '1')
      return this.renderSheet()
    }
    const allow = t.closest<HTMLElement>('[data-allow]')?.dataset.allow
    if (allow) {
      this.h.allowEvolution(allow)
      return this.renderSheet()
    }
  }
  refreshSheet() {
    if (!this.sheet.hidden) this.renderSheet()
  }
}
