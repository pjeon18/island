// The interface inside the island window, in FireRed-style windows. It is
// laid out in HUD pixels at its own whole-number scale (see fit) and travels
// into the pop-out window with the canvas. Dialogs follow PMD: a portrait beside a text box. Everything
// you choose (befriend, feed, stones, party, decorations, friends) lives in
// the sheet, and the sheet's choices only unlock between sessions.
import type { CloudState, Friend, FriendRequest, Me } from './cloud'
import { CATALOG, SLOTS, decorDef } from './decor'
import { BALLS, BERRY_EXP, LogEntry, BOND_FOR_FRIENDSHIP, Ball, DAYCARE_EVERY, DECOR_LOVES, EGG_MAX, Evolution, FOODS, GROWTH, Game, HABITATS, HABITAT_HOURS, Habitat, ISLANDS, IslandId, JOBS, Mon, PARTY_MAX, Role, aStone, expToNext, jobEvery, stoneName } from './game'

const BASE = import.meta.env.BASE_URL
export const portraitUrl = (dex: number, emo = 'Normal') => `${BASE}sprites/${String(dex).padStart(4, '0')}/${emo}.png`
/** Item icons from PokéAPI's sprite set (public/items). */
export const itemUrl = (id: string) => `${BASE}items/${id}.png`
const icon = (id: string, cls = 'ico') => `<img class="${cls}" src="${itemUrl(id)}" alt="" />`

// There is no Pokédex item icon, so this one is drawn here: a red handheld dex, 15×15.
const DEX_ICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" shape-rendering="crispEdges">
    <path fill="#5a1418" d="M3 1h9v1h1v12H2V2h1z"/>
    <path fill="#e03838" d="M3 2h9v11H3z"/>
    <path fill="#f87070" d="M3 2h9v1H3z"/>
    <path fill="#5a1418" d="M4 4h7v5H4z"/>
    <path fill="#a8e0f8" d="M5 5h5v3H5z"/>
    <path fill="#f8f8f8" d="M5 5h2v1H5z"/>
    <path fill="#5a1418" d="M4 10h2v2H4z"/><path fill="#f8d838" d="M8 10h3v1H8z"/>
    <path fill="#38a8f8" d="M2 3h1v2H2z"/>
  </svg>`,
)}`
// The journal: a small brown notebook with a bookmark, 15×15.
const LOG_ICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" shape-rendering="crispEdges">
    <path fill="#4a2810" d="M3 1h10v13H3z"/>
    <path fill="#a0582c" d="M4 2h8v11H4z"/>
    <path fill="#c87840" d="M4 2h8v1H4z"/>
    <path fill="#4a2810" d="M5 2h1v11H5z"/>
    <path fill="#f8f0d8" d="M7 4h4v1H7zM7 6h4v1H7zM7 8h3v1H7z"/>
    <path fill="#e03838" d="M10 0h2v4l-1-1-1 1z"/>
    <path fill="#2a1408" d="M2 2h1v11H2z"/>
  </svg>`,
)}`
const TABS: [Tab, string, string][] = [
  ['mons', 'Pokémon', itemUrl('poke-ball')],
  ['dex', 'Pokédex', DEX_ICON],
  ['island', 'Island', itemUrl('town-map')],
  ['friends', 'Friends', itemUrl('pal-pad')],
  ['log', 'Journal', LOG_ICON],
  ['more', 'More', ''],
]
/** Sub-tabs inside a menu, so each view stays short instead of one long scroll. */
const SUBS: Partial<Record<Tab, [string, string][]>> = {
  mons: [['party', 'Party'], ['helpers', 'Helpers'], ['box', 'Box'], ['eggs', 'Eggs'], ['bag', 'Bag']],
  island: [['map', 'Island'], ['habitats', 'Habitats'], ['decor', 'Decor'], ['shop', 'Shop']],
  more: [['focus', 'Focus'], ['settings', 'Settings'], ['credits', 'Credits']],
}
const tabIcon = (src: string) => (src ? `<img class="ico" src="${src}" alt="" />` : `<span class="dots"><i></i><i></i><i></i></span>`)

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
  feed: (id: string) => void
  giveStone: (id: string, item: string) => void
  takeStone: (id: string) => void
  buyDecor: (id: string) => void
  placeDecor: (id: string) => void
  moveDecor: (id: string) => void
  storeDecor: (id: string) => void
  enableIdle: () => void
  buyBall: (ball: Ball, n: number) => void
  buildHabitat: (id: Habitat) => void
  buyFood: (id: string, n: number) => void
  setBait: (id: string) => void
  assign: (id: string, role: Role) => void
  expedition: (id: string, long: boolean) => void
  challenge: () => void
  cheats?: () => void
  pet: (id: string) => void
  toggleSound: () => void
  visit: (id: string) => void
  gift: (friendId: string, friendName: string, kind: 'mon' | 'egg' | 'item', ref: string) => void
  sail: (to: IslandId) => void
  popOut?: () => void
  quit?: () => void
  cloud: {
    state: () => CloudState
    me: () => Me | null
    friends: () => Promise<{ friends: Friend[]; requests: FriendRequest[]; error?: string }>
    signIn: (email: string) => Promise<string>
    signOut: () => Promise<void>
    claimName: (name: string) => Promise<string>
    request: (handle: string) => Promise<string>
    answer: (rowId: number, accept: boolean) => Promise<void>
    wave: (id: string) => Promise<string>
  }
}

type Tab = 'mons' | 'dex' | 'island' | 'friends' | 'log' | 'more'
export interface CatchOpts {
  dex: number
  name: string
  level: number
  ball: Ball
  balls: Record<Ball, number>
  onBall: (b: Ball) => void
  onThrow: () => void
  onRun: () => void
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
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`)

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
  private tab: Tab = 'mons'
  private openMon: string | null = null
  private stonePick: string | null = null
  private dexPick: number | null = null
  private note = ''
  private friendsCache: { friends: Friend[]; requests: FriendRequest[]; error?: string } | null = null
  private lastFocusKey = ''
  private lastPartyKey = ''
  private catchEl!: HTMLElement
  private catchOpts: CatchOpts | null = null

  constructor(host: HTMLElement, private game: Game, private h: HudHandlers, private credits: () => string) {
    this.el = document.createElement('div')
    this.el.className = 'hud'
    this.el.innerHTML = `
      <div class="hud-focus"></div>
      <button class="hud-party" aria-label="Your Pokémon"></button>
      <nav class="hud-strip" aria-label="Menu">${TABS.map(([id, label, src]) => `<button class="strip-tab" data-open-tab="${id}" aria-label="${label}" title="${label}">${tabIcon(src)}</button>`).join('')}</nav>
      <div class="hud-toast" aria-live="polite"></div>
      <div class="hud-dialog" hidden>
        <div class="hud-portrait-frame"><img class="hud-portrait" alt="" /></div>
        <div class="hud-dialog-body"><p class="hud-text"></p><div class="hud-actions"></div><i class="hud-next" aria-hidden="true"></i></div>
      </div>
      <div class="hud-sheet" hidden></div>
      <div class="hud-catch px-panel" hidden></div>
      <div class="hud-cheats px-panel" hidden></div>
      <div class="hud-summary px-panel" hidden></div>

      <div class="hud-starter" hidden></div>`
    host.append(this.el)
    this.focus = this.el.querySelector('.hud-focus')!
    this.party = this.el.querySelector('.hud-party')!
    this.dialogEl = this.el.querySelector('.hud-dialog')!
    this.toastEl = this.el.querySelector('.hud-toast')!
    this.sheet = this.el.querySelector('.hud-sheet')!
    this.starter = this.el.querySelector('.hud-starter')!

    this.party.addEventListener('click', () => this.openSheet('mons'))
    this.el.querySelector('.hud-strip')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-open-tab]')
      if (!b) return
      if (!this.sheet.hidden && this.tab === b.dataset.openTab) this.closeSheet()
      else this.openSheet(b.dataset.openTab as Tab)
    })
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
    this.catchEl = this.el.querySelector('.hud-catch')!
    this.catchEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')
      if (!b || !this.catchOpts) return
      const c = b.dataset.c!
      if (c === 'throw') this.catchOpts.onThrow()
      else if (c === 'run') this.catchOpts.onRun()
      else this.catchOpts.onBall(c as Ball)
    })
    this.sheet.addEventListener('click', (e) => void this.onSheetClick(e))
    this.sheet.addEventListener('submit', (e) => void this.onSheetSubmit(e))
  }

  // The HUD has its own whole-number scale (Press Start 2P sits on an 8px
  // grid), independent of the island's, so a bigger island does not mean
  // bigger menus. Its box is the canvas size divided by that scale.
  fit(canvas: HTMLCanvasElement) {
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    const hs = cw >= 1680 ? 3 : cw >= 560 ? 2 : cw >= 400 ? 1.5 : Math.max(1, cw / 300)
    this.el.style.width = `${cw / hs}px`
    this.el.style.height = `${ch / hs}px`
    this.el.style.transform = `scale(${hs})`
    this.el.classList.toggle('narrow', cw / hs < 480)
  }

  // ---------- per-frame state ----------
  update() {
    const g = this.game
    const last = g.save.log[g.save.log.length - 1]?.t ?? 0
    const lk = `${last}:${g.save.logSeen}:${this.sheet.hidden}:${this.tab}`
    if (lk !== this.lastLogKey) {
      this.lastLogKey = lk
      const open = !this.sheet.hidden && this.tab === 'log'
      if (open && last > g.save.logSeen) {
        // a line written while the journal is open counts as seen, and shows up live
        g.save.logSeen = g.now()
        this.renderSheet()
      }
      this.el.querySelector('[data-open-tab="log"]')?.classList.toggle('fresh', !open && last > g.save.logSeen)
    }
    const s = g.save.session
    const breakLeft = !s && g.save.breakUntil ? (g.save.breakUntil - g.now()) / 1000 : 0
    const key = !g.hasStarter ? 'none' : !s ? `idle:${g.save.settings.length}:${breakLeft > 0}` : `${s.state}:${g.together.join(',')}`
    if (key !== this.lastFocusKey) {
      this.lastFocusKey = key
      const len = g.save.settings.length
      const seg = (v: string, label: string, on: boolean) => `<button class="seg${on ? ' on' : ''}" data-f="len:${v}">${label}</button>`
      const segs = `<div class="segs">${seg('25', '25 min', len === 1500)}${seg('50', '50 min', len === 3000)}${seg('open', 'Open', len === null)}</div>`
      this.focus.innerHTML =
        key === 'none'
          ? ''
          : !s
            ? breakLeft > 0
              ? `<div class="px-panel clock break"><span class="clock-t"></span><span class="clock-l">Break</span></div>
                 <button class="px-btn primary small" data-f="start">Start focusing</button>${segs}`
              : `<button class="px-btn primary" data-f="start">Start focusing</button>${segs}`
            : s.state === 'running'
              ? `<div class="px-panel clock"><span class="clock-t"></span><span class="clock-l">${g.together.length ? `With ${esc(g.together[0])}` : s.length ? 'Focusing' : 'Open'}</span></div>
                 <button class="px-btn small" data-f="end">End session</button>`
              : s.state === 'asking'
                ? `<div class="px-panel clock"><span class="clock-t"></span><span class="clock-l">Waiting for you</span></div>
                   <button class="px-btn primary small" data-f="still">I'm here</button>`
                : `<div class="px-panel clock away"><span class="clock-t"></span><span class="clock-l">Paused</span></div>
                   <button class="px-btn primary small" data-f="back">I am back</button>`
      if (!this.sheet.hidden) this.renderSheet()
    }
    const t = this.focus.querySelector('.clock-t')
    if (t) t.textContent = s ? (s.length ? fmtClock(s.length - s.credited) : fmtClock(s.credited)) : fmtClock(breakLeft)

    if (this.summaryId) this.renderSummary()
    const pk = g.party.map((m) => `${m.id}:${m.dex}:${m.level}:${m.exp}`).join('|')
    if (pk !== this.lastPartyKey) {
      this.lastPartyKey = pk
      this.party.innerHTML = g.party
        .map((m) => {
          const pct = Math.round((m.exp / expToNext(m.level)) * 100)
          return `<span class="chip"><img src="${portraitUrl(m.dex)}" alt="" /><span class="chip-info"><span class="chip-name">${esc(g.name(m))}</span><span class="chip-row"><span class="chip-lv">Lv${m.level}</span><span class="thin"><i style="width:${pct}%"></i></span></span></span></span>`
        })
        .join('')
      this.party.setAttribute('aria-label', `Your party: ${g.party.map((m) => `${g.name(m)}, level ${m.level}`).join('; ')}. Open your Pokémon.`)
      if (!this.sheet.hidden && this.tab !== 'friends') this.renderSheet()
    }
  }

  // ---------- dialog queue ----------
  say(d: Dialog) {
    this.queue.push(d)
    if (!this.current) this.next()
  }
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
    this.dialogEl.classList.toggle('has-actions', !!d.actions?.length)
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

  // ---------- catching ----------
  /** The catch window: pick a ball, then throw while the ring is small. */
  showCatch(o: CatchOpts) {
    this.catchOpts = o
    this.closeSheet()
    const balls = BALLS.map((b) => `<button class="ball-pick${o.ball === b.id ? ' on' : ''}" data-c="${b.id}" ${o.balls[b.id] ? '' : 'disabled'} title="${b.name}">${icon(b.id)}<span>×${o.balls[b.id]}</span></button>`).join('')
    this.catchEl.innerHTML = `
      <div class="catch-head"><img class="catch-face" src="${portraitUrl(o.dex)}" alt="" /><p>Wild ${o.name}<br /><span class="hint">Lv${o.level}</span></p></div>
      <div class="catch-balls">${balls}</div>
      <div class="catch-actions"><button class="px-btn primary" data-c="throw">Throw</button><button class="px-btn" data-c="run">Run</button></div>`
    this.catchEl.hidden = false
  }
  hideCatch() {
    this.catchOpts = null
    this.catchEl.hidden = true
  }

  // ---------- a Pokémon's summary card ----------
  private summaryId: string | null = null
  private summaryKey = ''
  /** The card you get from tapping one of your Pokémon: how it is doing, at a glance. */
  showSummary(id: string) {
    this.summaryId = id
    this.summaryKey = ''
    this.renderSummary()
  }
  hideSummary() {
    this.summaryId = null
    this.el.querySelector<HTMLElement>('.hud-summary')!.hidden = true
  }
  private renderSummary() {
    const el = this.el.querySelector<HTMLElement>('.hud-summary')!
    const g = this.game
    const m = this.summaryId ? g.mon(this.summaryId) : undefined
    if (!m) return this.hideSummary()
    const key = `${m.id}:${m.dex}:${m.level}:${m.exp}:${m.focusedMin}:${g.roleOf(m.id)}:${m.heldItem}:${g.inSession}:${g.save.berries}`
    if (key === this.summaryKey && !el.hidden) return
    this.summaryKey = key
    const sp = g.species(m.dex)
    const types = (sp?.types ?? ['normal']).map((t) => `<span class="type t-${t}">${t.toUpperCase()}</span>`).join('')
    const role = g.roleOf(m.id)
    const roleText = role === 'party' ? 'In your party' : role === 'box' ? 'Resting in the box' : role === 'daycare' ? 'At the Day Care' : role === 'expedition' ? 'Away on a trip' : JOBS.find((j) => `job:${j.id}` === role)!.name
    const need = expToNext(m.level)
    el.innerHTML = `
      <div class="sum-head"><img class="sum-face" src="${portraitUrl(m.dex, 'Happy')}" alt="" onerror="this.src='${portraitUrl(m.dex)}'" />
        <div class="sum-id"><p>${esc(g.name(m))} <span class="hint">Lv${m.level}</span></p><p class="sum-types">${types}</p></div>
        <button class="close-x" data-s="close" aria-label="Close"></button></div>
      <p class="sum-line"><span class="hint">EXP</span><span class="thin wide"><i style="width:${Math.round((m.exp / need) * 100)}%"></i></span><span class="hint">${need - m.exp} to Lv${m.level + 1}</span></p>
      <p class="sum-line hint">${roleText}. ${fmtMinutes(m.focusedMin)} together.</p>
      ${m.heldItem ? `<p class="sum-line hint">${icon(m.heldItem, 'ico-s')}Holding ${aStone(m.heldItem)}.</p>` : ''}
      <p class="sum-line hint">${this.evoText(m)}</p>
      <div class="row-actions"><button class="px-btn small primary" data-s="pet">Pet</button><button class="px-btn small" data-s="feed" ${g.inSession || g.save.berries <= 0 ? 'disabled' : ''}>${icon('oran-berry', 'ico-s')}Feed</button><button class="px-btn small" data-s="more">More</button></div>`
    el.onclick = (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-s]')?.dataset.s
      if (!a || !this.summaryId) return
      if (a === 'close') return this.hideSummary()
      if (a === 'pet') return this.h.pet(this.summaryId)
      if (a === 'feed') return this.h.feed(this.summaryId)
      if (a === 'more') {
        const r = this.game.roleOf(this.summaryId)
        this.sub.mons = r === 'party' ? 'party' : r === 'box' ? 'box' : 'helpers'
        this.openMon = this.summaryId
        this.hideSummary()
        this.openSheet('mons')
      }
    }
    el.hidden = false
  }

  // ---------- cheats (testing) ----------
  /** Show or hide the Cheats window: every event, one button each. */
  private cheatGroup = 0
  toggleCheats(groups: { title: string; items: [string, string][] }[], run: (id: string) => void) {
    const el = this.el.querySelector<HTMLElement>('.hud-cheats')!
    if (!el.hidden) {
      el.hidden = true
      return
    }
    this.closeSheet()
    this.hideSummary()
    // one tab per group, so the window never scrolls
    const draw = () => {
      const gr = groups[this.cheatGroup] ?? groups[0]
      el.innerHTML = `<div class="sheet-head"><p class="sheet-title">Cheats</p><button class="close-x" data-c-close aria-label="Close"></button></div>
        <div class="segs subtabs">${groups.map((g, i) => `<button class="seg${i === this.cheatGroup ? ' on' : ''}" data-c-group="${i}">${g.title}</button>`).join('')}</div>
        <div class="sheet-body"><div class="row-actions">${gr.items.map(([id, label]) => `<button class="px-btn small" data-cheat="${id}">${label}</button>`).join('')}</div></div>`
    }
    el.onclick = (e) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-c-close]')) {
        el.hidden = true
        return
      }
      const gi = t.closest<HTMLElement>('[data-c-group]')?.dataset.cGroup
      if (gi != null) {
        this.cheatGroup = Number(gi)
        return draw()
      }
      const id = t.closest<HTMLElement>('[data-cheat]')?.dataset.cheat
      if (id) run(id)
    }
    draw()
    el.hidden = false
  }

  // ---------- starter ----------
  showStarter(options: number[]) {
    const g = this.game
    this.starter.hidden = false
    this.starter.innerHTML = `
      <div class="px-panel starter-panel">
        <p class="starter-title">Pick a partner.</p>
        
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

  // ---------- the sheet ----------
  private markStrip() {
    this.el.querySelectorAll<HTMLElement>('.strip-tab').forEach((b) => b.classList.toggle('on', !this.sheet.hidden && b.dataset.openTab === this.tab))
  }
  openSheet(tab: Tab) {
    this.el.querySelector<HTMLElement>('.hud-cheats')!.hidden = true
    if (tab !== 'mons' || !this.openMon) this.hideSummary()
    if (tab === 'log' && (this.tab !== 'log' || this.sheet.hidden)) {
      this.logFrom = this.game.save.logSeen
      this.logPage = 0
      this.game.save.logSeen = this.game.now()
      this.game.persist()
    }
    this.tab = tab
    this.note = ''
    this.sheet.hidden = false
    this.renderSheet()
    this.markStrip()
    if (tab === 'friends') void this.loadFriends()
  }
  closeSheet() {
    this.sheet.hidden = true
    this.markStrip()
  }
  refreshSheet() {
    if (!this.sheet.hidden) this.renderSheet()
  }
  private async loadFriends() {
    if (this.h.cloud.state() !== 'ready') return
    this.friendsCache = await this.h.cloud.friends()
    if (this.tab === 'friends' && !this.sheet.hidden) this.renderSheet()
  }

  private sub: Partial<Record<Tab, string>> = {}
  private lastView = ''
  private subOf(tab: Tab) {
    return this.sub[tab] ?? SUBS[tab]?.[0][0] ?? ''
  }
  private renderSheet() {
    const title = TABS.find(([id]) => id === this.tab)![1]
    const subs = SUBS[this.tab]
    const cur = this.subOf(this.tab)
    const count = (id: string) => {
      const s = this.game.save
      if (this.tab !== 'mons') return ''
      const n = id === 'box' ? s.mons.filter((m) => this.game.roleOf(m.id) === 'box').length : id === 'eggs' ? s.eggs.length : id === 'helpers' ? this.game.helpers.length + (s.expedition ? 1 : 0) : 0
      return n ? ` ${n}` : ''
    }
    const bar = subs ? `<div class="segs subtabs">${subs.map(([id, label]) => `<button class="seg${id === cur ? ' on' : ''}" data-sub="${id}">${label}${count(id)}</button>`).join('')}</div>` : ''
    const body =
      this.tab === 'mons'
        ? this.monsTab()
        : this.tab === 'dex'
          ? this.dexTab()
          : this.tab === 'island'
            ? this.islandTab()
            : this.tab === 'friends'
              ? this.friendsTab()
              : this.tab === 'log'
                ? this.logTab()
                : this.moreTab()
    const view = `${this.tab}:${cur}`
    const scroll = view === this.lastView ? (this.sheet.querySelector('.sheet-body')?.scrollTop ?? 0) : 0
    this.lastView = view
    this.sheet.innerHTML = `
      <div class="px-panel sheet-panel">
        <div class="sheet-head"><p class="sheet-title">${title}</p><button class="close-x" data-act="close" aria-label="Close"></button></div>
        ${bar}
        <div class="sheet-body">${this.note ? `<p class="note flash">${esc(this.note)}</p>` : ''}${body}</div>
      </div>`
    const sb = this.sheet.querySelector('.sheet-body')
    if (sb) sb.scrollTop = scroll
  }

  // Pokémon, in sub-tabs: Party, Helpers, Box, Eggs, Bag
  private monsTab() {
    const g = this.game
    const s = g.save
    const locked = g.inSession ? `<p class="note">Locked while focusing.</p>` : ''
    const view = this.subOf('mons')
    if (view === 'party') return locked + g.party.map((m) => this.monRow(m)).join('') + `<p class="hint">Party ${g.party.length} of ${PARTY_MAX}. Tap one for its choices.</p>`
    if (view === 'helpers') {
      const helpers = s.mons.filter((m) => { const r = g.roleOf(m.id); return r !== 'party' && r !== 'box' })
      const dc = s.daycare.ids.filter(Boolean).length
      const jobs = JOBS.map((j) => {
        const who = s.jobs[j.id] && g.mon(s.jobs[j.id]!)
        return `<div class="job-row"><span>${j.name}</span><span class="hint">${who ? `${g.name(who)}, every ${jobEvery(j, who.level)} min` : `${j.types.map((t) => t[0].toUpperCase() + t.slice(1)).join(' or ')}${j.needsDecor ? ', campfire' : ''}`}</span></div>`
      }).join('')
      return locked + `<div class="job-row"><span>Day Care</span><span class="hint">${dc}/2${dc === 2 ? `, egg every ${DAYCARE_EVERY} min` : ''}</span></div>${jobs}` + (helpers.length ? helpers.map((m) => this.monRow(m)).join('') : `<p class="hint">Nobody is helping yet. Pick one in Box or Party.</p>`)
    }
    if (view === 'box') {
      const box = s.mons.filter((m) => g.roleOf(m.id) === 'box')
      if (!box.length) return `<p class="hint">The box is empty.</p>`
      const picked = box.find((m) => m.id === this.openMon)
      const grid = box.map((m) => `<button class="box-cell${m.id === this.openMon ? ' on' : ''}" data-open="${m.id}" title="${esc(g.name(m))}"><img src="${portraitUrl(m.dex)}" alt="" /><span>Lv${m.level}</span></button>`).join('')
      return locked + `<div class="box-grid">${grid}</div>` + (picked ? this.monRow(picked) : `<p class="hint">Tap one for its choices.</p>`)
    }
    if (view === 'eggs')
      return s.eggs.length
        ? s.eggs.map((e, i) => `<div class="decor-row"><span class="shop-ico">${icon('lucky-egg')}</span><div class="mon-main"><p>Egg</p><span class="bar"><i style="width:${Math.round((e.progress / e.need) * 100)}%"></i></span><p class="hint">${i < EGG_MAX ? `${e.progress} of ${e.need} min` : 'Waiting for room'}</p></div></div>`).join('') + `<p class="hint">${s.eggs.length} of ${EGG_MAX} in the nest. They warm while you focus.</p>`
        : `<p class="hint">No eggs. They come from the Day Care, finds, streaks and trips.</p>`
    // the bag: everything you carry, as a grid
    const item = (id: string, name: string, n: number) => `<div class="bag-cell" title="${name}">${icon(id)}<span>${name}</span><b>×${n}</b></div>`
    const cells = [
      item('shoal-shell', 'Shells', s.shells),
      item('star-piece', 'Star Pieces', s.starPieces),
      item('oran-berry', 'Oran Berries', s.berries),
      ...BALLS.map((b) => item(b.id, b.name, s.balls[b.id])),
      ...FOODS.filter((f) => s.foods[f.id]).map((f) => item(f.id, f.name, s.foods[f.id]!)),
      ...Object.entries(s.bag).filter(([, n]) => n > 0).map(([k, n]) => item(k, stoneName(k), n)),
    ]
    return `<div class="bag-grid">${cells.join('')}</div>`
  }
  private evoText(m: Mon) {
    const g = this.game
    const opts = g.evolutionOptions(m)
    if (!opts.length) return 'Final form.'
    const lv = opts.filter((e) => e.level).map((e) => `at level ${e.level} into ${g.name(e.dex)}`)
    const st = opts.filter((e) => e.item).map((e) => `with ${aStone(e.item!)} into ${g.name(e.dex)}`)
    const fr = opts.filter((e) => e.friendship).map((e) => `by friendship ${e.time ? `during the ${e.time} ` : ''}into ${g.name(e.dex)}`)
    const bond = fr.length ? ` ${icon('soothe-bell', 'ico-s')}Bond ${fmtMinutes(Math.min(m.focusedMin, BOND_FOR_FRIENDSHIP))} of ${fmtMinutes(BOND_FOR_FRIENDSHIP)}.` : ''
    return `Evolves ${list([...lv, ...st, ...fr])}.${bond}`
  }
  private monRow(m: Mon) {
    const g = this.game
    const s = g.save
    const inParty = s.party.includes(m.id)
    const open = this.openMon === m.id
    const pct = Math.round((m.exp / expToNext(m.level)) * 100)
    const role = g.roleOf(m.id)
    const ex = s.expedition
    const roleText =
      role === 'daycare' ? 'At the Day Care' : role === 'expedition' && ex ? `Away, ${ex.progress} of ${ex.need} min` : role.startsWith('job:') ? JOBS.find((j) => `job:${j.id}` === role)!.name : ''
    const status = roleText
      ? roleText
      : m.heldItem
      ? `${icon(m.heldItem, 'ico-s')} Holding ${aStone(m.heldItem)}.`
      : m.noEvolve
        ? 'Ready to evolve.'
        : `${fmtMinutes(m.focusedMin)} together`
    let detail = ''
    if (open) {
      const locked = g.inSession
      const usable = g.evolutionOptions(m).filter((e: Evolution) => e.item && (s.bag[e.item] ?? 0) > 0)
      const btn = (attrs: string, label: string, dis = false, primary = false) => `<button class="px-btn small${primary ? ' primary' : ''}" ${attrs} ${dis ? 'disabled' : ''}>${label}</button>`
      const away = role === 'expedition'
      const roleBtns = away
        ? ''
        : [
            role !== 'party' ? btn(`data-role="${m.id}|party"`, 'Party', locked || s.party.length >= PARTY_MAX) : '',
            role !== 'box' ? btn(`data-role="${m.id}|box"`, 'Box', locked || (role === 'party' && s.party.length <= 1)) : '',
            role !== 'daycare' ? btn(`data-role="${m.id}|daycare"`, 'Day Care', locked || !s.daycare.ids.includes(null) || (role === 'party' && s.party.length <= 1)) : '',
            ...JOBS.filter((j) => g.canDoJob(m, j.id) && role !== `job:${j.id}`).map((j) => btn(`data-role="${m.id}|job:${j.id}"`, j.name, locked || !!s.jobs[j.id] || (role === 'party' && s.party.length <= 1))),
            btn(`data-trip="${m.id}|0"`, 'Trip 30', locked || !!s.expedition || (role === 'party' && s.party.length <= 1)),
            btn(`data-trip="${m.id}|1"`, 'Trip 90', locked || !!s.expedition || (role === 'party' && s.party.length <= 1)),
          ].join('')
      const partyBtn = roleBtns
      const stoneRow =
        this.stonePick === m.id
          ? `<div class="row-actions">${usable.map((e) => btn(`data-give="${m.id}:${e.item}"`, `${icon(e.item!, 'ico-s')}${g.name(e.dex)}`)).join('')}${btn('data-stonecancel="1"', 'Cancel')}</div>`
          : ''
      detail = `
        <div class="mon-detail">
          <p class="hint">${this.evoText(m)}</p>
          <div class="row-actions">
            ${btn(`data-feed="${m.id}"`, `${icon('oran-berry', 'ico-s')}Feed +${BERRY_EXP} EXP`, locked || s.berries <= 0, true)}
            ${usable.length && !m.heldItem ? btn(`data-stones="${m.id}"`, 'Give a stone', locked) : ''}
            ${m.heldItem ? btn(`data-take="${m.id}"`, 'Take stone', locked) : ''}
            ${m.noEvolve ? btn(`data-allow="${m.id}"`, 'Let it evolve') : ''}
            ${partyBtn}
          </div>
          ${stoneRow}
        </div>`
    }
    return `
      <div class="mon-row${inParty ? ' in' : ''}${open ? ' open' : ''}">
        <button class="mon-head" data-open="${m.id}">
          <img src="${portraitUrl(m.dex)}" alt="" />
          <span class="mon-main">
            <span class="mon-name"><strong>${g.name(m)}</strong> <span>Lv ${m.level}</span></span>
            <span class="bar"><i style="width:${pct}%"></i></span>
            <span class="hint">${status}</span>
          </span>
        </button>
        ${detail}
      </div>`
  }

  // Pokédex: every species on the island, and how to get the ones you lack
  private dexTab() {
    const g = this.game
    const all = Object.keys(g.roster).map(Number).sort((a, b) => a - b)
    const seen = new Set(g.save.seen)
    const caught = new Set(g.save.caught)
    const cells = all
      .map((d) => {
        const cls = caught.has(d) ? 'caught' : seen.has(d) ? 'seen' : 'unseen'
        if (caught.has(d)) seen.add(d)
        return `<button class="dex-cell ${cls}${this.dexPick === d ? ' on' : ''}" data-dex="${d}" aria-label="${seen.has(d) ? g.name(d) : 'Unknown'}">${seen.has(d) ? `<img src="${portraitUrl(d)}" alt="" />` : `<span>${d}</span>`}</button>`
      })
      .join('')
    let caption = ''
    if (this.dexPick) {
      const d = this.dexPick
      const sp = g.species(d)
      const known = seen.has(d)
      const from = Object.entries(g.roster).find(([, s]) => s.evolvesTo.some((e) => e.dex === d))
      const how = (() => {
        if (sp.stage === 1) return `${sp.rarity === 'starter' ? 'Starter.' : `${sp.rarity === 'common' ? 'Common' : sp.rarity === 'uncommon' ? 'Uncommon' : 'Rare'}.`} ${g.lureNotes(d, (id) => decorDef(id)?.name ?? id).join(' ')}`
        if (!from) return ''
        const e = from[1].evolvesTo.find((x) => x.dex === d)!
        const fromName = known || seen.has(Number(from[0])) ? from[1].name : 'another Pokémon'
        if (e.level) return `${fromName}, level ${e.level}.`
        if (e.item) return `${fromName} with ${aStone(e.item)}.`
        return `${fromName}, friendship${e.time ? ` by ${e.time}` : ''}.`
      })()
      caption = `<strong>${known ? sp.name : `No. ${d}`}</strong>. ${how}`
    }
    return `<p class="note">Seen ${seen.size} · Caught ${caught.size} · ${all.length}</p>
      <div class="dex-grid">${cells}</div><p class="hint dex-cap">${caption}</p>`
  }

  /** Where you are, its guardian, the other islands and what opens them, and how the island grows. */
  private islandsHtml() {
    const g = this.game
    const here = g.islandDef
    const gd = here.guardian
    const beaten = g.save.guardians.includes(here.id)
    const dex = g.dexOf(here.id)
    const others = ISLANDS.filter((i) => i.id !== here.id)
      .map((i) => {
        const needs = g.sailNeeds(i.id)
        const can = g.canSail(i.id)
        const list = g.save.stash[i.id] || !needs.length ? '' : needs.map((n) => `<p class="hint"><i class="tick${n.done ? ' on' : ''}"></i>${n.text}</p>`).join('')
        return `<div class="decor-row"><div class="mon-main"><p>${i.name}</p>${list}</div><div class="row-actions row"><button class="px-btn small${can ? ' primary' : ''}" data-sail="${i.id}" ${!can || g.inSession ? 'disabled' : ''}>Sail</button></div></div>`
      })
      .join('')
    const hours = Math.floor(g.totalHours())
    const growth = here.id === 'home' ? GROWTH.map((x) => `<p class="hint"><i class="tick${hours >= x.hours ? ' on' : ''}"></i>${x.hours} h: ${x.text}</p>`).join('') : ''
    return `<p class="row-title">${here.name}</p>
      <p class="stat-line"><span>Pokédex</span><b>${dex.caught}</b><span>of ${dex.all.length}</span></p>
      <p class="stat-line"><span>Focused</span><b>${hours}</b><span>hours</span></p>
      <div class="decor-row"><img class="shop-ico mini-face" src="${portraitUrl(gd.dex)}" alt="" /><div class="mon-main"><p>${g.name(gd.dex)} <span class="hint">Lv${gd.level}</span></p><p class="hint">${beaten ? 'Beaten. It joined you.' : `Guardian, ${gd.where}.`}</p></div><div class="row-actions row">${beaten ? '' : `<button class="px-btn small primary" data-act="challenge" ${g.inSession ? 'disabled' : ''}>Enter</button>`}</div></div>
      ${growth}
      <p class="row-title">Islands</p>${others}`
  }

  // Island: decorations bought with shells, placed on fixed spots
  private islandTab() {
    const g = this.game
    const d = g.save.decor
    const placed = new Set(Object.values(d.slots).filter(Boolean) as string[])
    const open = SLOTS.filter((s) => g.hoursOk(s.minHours))
    const free = open.filter((s) => !d.slots[s.id]).length
    const locked = g.inSession
    const rows = CATALOG.map((item) => {
      const owned = d.owned.includes(item.id)
      const act = !owned
        ? `<button class="px-btn small${g.save.shells >= item.price ? ' primary' : ''}" data-buy="${item.id}" ${g.save.shells < item.price || locked ? 'disabled' : ''}>${icon('shoal-shell', 'ico-s')}${item.price}</button>`
        : placed.has(item.id)
          ? `<button class="px-btn small" data-move="${item.id}" ${locked ? 'disabled' : ''}>Move</button><button class="px-btn small" data-store="${item.id}" ${locked ? 'disabled' : ''}>Store</button>`
          : `<button class="px-btn small primary" data-place="${item.id}" ${!free || locked ? 'disabled' : ''}>Place</button>`
      const loves = (DECOR_LOVES[item.id] ?? []).map((d) => (g.save.seen.includes(d) ? g.name(d) : '???')).join(', ')
      return `<div class="decor-card${placed.has(item.id) ? ' on' : ''}" title="${loves ? `Loved by ${loves}` : ''}"><p>${item.name}</p><p class="hint">${owned ? (placed.has(item.id) ? 'Placed' : 'Stored') : 'Shop'}</p><div class="row-actions">${act}</div></div>`
    }).join('')
    const star = icon('star-piece', 'ico-s')
    const shell = icon('shoal-shell', 'ico-s')
    const habitats = HABITATS.map((h) => {
      const built = g.save.habitats.includes(h.id)
      const can = g.save.starPieces >= h.stars && g.save.shells >= h.shells
      const hrs = HABITAT_HOURS[h.id]
      const act = built ? `<span class="hint">Built</span>` : !g.hoursOk(hrs) ? `<span class="hint">At ${hrs} h</span>` : `<button class="px-btn small${can ? ' primary' : ''}" data-habitat="${h.id}" ${!can || locked ? 'disabled' : ''}>${star}${h.stars} ${shell}${h.shells}</button>`
      return `<div class="decor-row"><div class="mon-main"><p>${h.name}</p><p class="hint">${h.types.map((t) => t[0].toUpperCase() + t.slice(1)).join(', ')} types</p></div><div class="row-actions row">${act}</div></div>`
    }).join('')
    const food = FOODS.map((f) => {
      const have = g.save.foods[f.id] ?? 0
      return `<div class="decor-row tight" title="Draws ${f.types.join(', ')} types"><span class="shop-ico">${icon(f.id)}</span><div class="mon-main"><p>${f.name} <span class="hint">×${have}</span></p></div><div class="row-actions row"><button class="px-btn small" data-food="${f.id}" ${g.save.shells < f.price || locked ? 'disabled' : ''}>${shell}${f.price}</button><button class="px-btn small primary" data-bait="${f.id}" ${!have || locked || !!g.save.bait ? 'disabled' : ''}>Set out</button></div></div>`
    }).join('')
    const shop = BALLS.map(
      (b) => `<div class="decor-row tight"><span class="shop-ico">${icon(b.id)}</span><div class="mon-main"><p>${b.name} <span class="hint">×${g.save.balls[b.id]}</span></p></div><div class="row-actions row"><button class="px-btn small${g.save.shells >= b.price ? ' primary' : ''}" data-ball="${b.id}:1" ${g.save.shells < b.price || locked ? 'disabled' : ''}>${icon('shoal-shell', 'ico-s')}${b.price}</button><button class="px-btn small" data-ball="${b.id}:5" ${g.save.shells < b.price * 5 || locked ? 'disabled' : ''}>×5</button></div></div>`,
    ).join('')
    const view = this.subOf('island')
    if (view === 'map') return this.islandsHtml()
    const wallet = `<p class="inv"><span title="Shells">${icon('shoal-shell')}<b>×${g.save.shells}</b></span><span title="Star Pieces">${icon('star-piece')}<b>×${g.save.starPieces}</b></span></p>${locked ? '<p class="note">Locked while focusing.</p>' : ''}`
    if (view === 'habitats') return `${wallet}${habitats}`
    if (view === 'decor') return `${wallet.replace('</p>', `<span>${free} of ${open.length} spots free</span></p>`)}<div class="decor-grid">${rows}</div>`
    return `${wallet}<p class="row-title">Balls</p>${shop}
      <p class="row-title">Food</p>${g.save.bait ? `<p class="note">${FOODS.find((f) => f.id === g.save.bait)?.name} is out until the session ends.</p>` : ''}${food}`
  }

  // ---------- the journal ----------
  private logFrom = 0 // entries after this were new when the journal opened
  private logPage = 0
  private lastLogKey = ''
  /** What happened in these entries, as up to three big numbers. Only what actually happened shows. */
  private logSummary(xs: LogEntry[]) {
    const sum = (k: LogEntry['kind']) => xs.filter((x) => x.kind === k).reduce((a, x) => a + (x.n ?? 1), 0)
    const count = (k: LogEntry['kind'], has = '') => xs.filter((x) => x.kind === k && x.text.includes(has)).length
    const min = sum('focus')
    const time = min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min}m`
    // most telling first; one row of three at most, the list below has the rest
    const cells: [string, string | number][] = [
      ['Focused', time],
      ['Joined', count('catch')],
      ['Evolved', count('evolve')],
      ['Hatched', count('hatch', 'hatched')],
      ['Levels', sum('level')],
      ['Came by', count('visit')],
      ['Found', count('find')],
      ['Friends', count('friend')],
    ]
    return cells
      .filter(([, v], i) => i === 0 || v)
      .slice(0, 3)
      .map(([label, v]) => `<div class="log-cell"><b>${v}</b><span>${label}</span></div>`)
      .join('')
  }
  private logTab() {
    const log = this.game.save.log
    const day = (t: number) => new Date(t).toDateString()
    const today = day(this.game.now())
    const yest = day(this.game.now() - 864e5)
    const fresh = log.filter((x) => x.t > this.logFrom)
    const head = fresh.length ? 'Since you last looked' : 'Today'
    const pool = fresh.length ? fresh : log.filter((x) => day(x.t) === today)
    const summary = this.logSummary(pool)
    const PER = 8
    const newest = [...log].reverse()
    const pages = Math.max(1, Math.ceil(newest.length / PER))
    const page = Math.min(this.logPage, pages - 1)
    const shown = newest.slice(page * PER, page * PER + PER)
    let lastDay = ''
    const rows = shown
      .map((x) => {
        const d = day(x.t)
        const label = d === today ? 'Today' : d === yest ? 'Yesterday' : new Date(x.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        const sep = d !== lastDay ? `<p class="row-title log-day">${label}</p>` : ''
        lastDay = d
        const time = new Date(x.t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
        const face = x.dex ? `<img class="log-face" src="${portraitUrl(x.dex)}" alt="" />` : `<span class="log-face none"></span>`
        return `${sep}<div class="log-row${x.t > this.logFrom ? ' new' : ''}">${face}<span class="log-time">${time}</span><p>${esc(x.text)}</p></div>`
      })
      .join('')
    const pager =
      pages > 1
        ? `<div class="log-pager"><button class="px-btn small" data-logpage="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''}>Older</button><span>${page + 1} of ${pages}</span><button class="px-btn small" data-logpage="${page - 1}" ${page <= 0 ? 'disabled' : ''}>Newer</button></div>`
        : ''
    if (!log.length) return `<p class="note">Nothing yet. Start focusing and the island comes alive.</p>`
    return `<p class="row-title log-day">${head}</p><div class="log-cells">${pool.length ? summary : '<p class="hint">A quiet day so far.</p>'}</div>${rows}${pager}`
  }

  private sendTo: string | null = null
  /** What you can send a friend: a Pokémon (not the last in the party, not away), an egg, or one item. */
  private sendPicker(id: string, name: string) {
    const g = this.game
    const s = g.save
    const n = esc(name)
    const mons = s.mons.filter((m) => g.canGiveMon(m.id)).map((m) => `<button class="px-btn small" data-gift="${id}|${n}|mon|${m.id}">${g.name(m)} ${m.level}</button>`).join('')
    const eggs = s.eggs.map((e) => `<button class="px-btn small" data-gift="${id}|${n}|egg|${e.id}">${icon('lucky-egg', 'ico-s')}Egg</button>`).join('')
    const ids = [...BALLS.map((b) => b.id), 'star-piece', 'oran-berry', ...FOODS.map((f) => f.id), ...Object.keys(s.bag)]
    const items = ids.filter((x) => g.itemCount(x) > 0).map((x) => `<button class="px-btn small" data-gift="${id}|${n}|item|${x}" title="${x}">${icon(x, 'ico-s')}×${g.itemCount(x)}</button>`).join('')
    return `<div class="send-pick"><p class="hint">Pokémon</p><div class="row-actions">${mons || '<span class="hint">None to spare</span>'}</div>${eggs ? `<p class="hint">Eggs</p><div class="row-actions">${eggs}</div>` : ''}<p class="hint">Items (one at a time)</p><div class="row-actions">${items || '<span class="hint">None</span>'}</div></div>`
  }

  private friendsTab() {
    const c = this.h.cloud
    const st = c.state()
    if (st === 'off') return `<p class="note">Friends are not available here.</p>`
    if (st === 'signedOut')
      return `
        <p class="note">Sign in with your Studdy email.</p>
        <form class="inline-form" data-form="signin"><input class="px-input" type="email" name="email" placeholder="you@example.com" required /><button class="px-btn small primary">Send a link</button></form>`
    if (st === 'needsName')
      return `<p class="row-title">Choose a name</p>
        <p class="note">Pick a name friends can find.</p>
        <form class="inline-form" data-form="name"><input class="px-input" name="name" maxlength="20" placeholder="Your name" required /><button class="px-btn small primary">Save</button></form>`
    if (st === 'missingSchema') return `<p class="note">Friends are not set up yet.</p>`
    const me = c.me()!
    const fc = this.friendsCache
    const reqs = (fc?.requests ?? [])
      .map((r) => `<div class="decor-row"><div class="mon-main"><p><strong>${esc(r.name)}</strong> <span class="hint">@${esc(r.handle)} wants to be friends.</span></p></div><div class="row-actions"><button class="px-btn small primary" data-accept="${r.rowId}">Accept</button><button class="px-btn small" data-decline="${r.rowId}">Decline</button></div></div>`)
      .join('')
    const rows = (fc?.friends ?? [])
      .map((f) => {
        const party = f.party.map((p) => `<span class="mini"><img src="${portraitUrl(p.dex)}" alt="" /><i>${p.level}</i></span>`).join('')
        const status = f.studying ? 'Studying now.' : f.dayMin ? `${fmtMinutes(f.dayMin)} today.` : ''
        const free = !this.game.inSession
        const waveBtn = f.studying && free ? `<button class="px-btn small" data-wave="${f.id}">Wave</button>` : ''
        const acts = free ? `<div class="row-actions">${waveBtn}<button class="px-btn small" data-visit="${f.id}">Visit</button><button class="px-btn small" data-sendto="${f.id}">Send</button></div>` : ''
        const picker = this.sendTo === f.id ? this.sendPicker(f.id, f.name) : ''
        return `<div class="friend-row${f.studying ? ' live' : ''}"><div class="mon-main"><p><strong>${esc(f.name)}</strong> <span class="hint">@${esc(f.handle)}</span></p><p class="hint">${status} ${f.dexCount ? `Pokédex ${f.dexCount}.` : ''}</p>${acts}${picker}</div><div class="mini-party">${party}</div></div>`
      })
      .join('')
    return `<p class="note">@${esc(me.handle)}</p>
      ${reqs}
      ${fc ? rows || `<p class="note">No friends yet.</p>` : `<p class="note">Loading…</p>`}
      ${fc?.error ? `<p class="note">${esc(fc.error)}</p>` : ''}
      <form class="inline-form" data-form="add"><input class="px-input" name="handle" maxlength="21" placeholder="@handle" required /><button class="px-btn small">Add friend</button></form>
      <button class="px-btn small quiet" data-act="signout">Sign out</button>`
  }

  private moreTab() {
    const g = this.game
    const len = g.save.settings.length
    const det = g.save.settings.detector
    const idleOk = typeof (window as unknown as { IdleDetector?: unknown }).IdleDetector === 'function'
    const streak = g.streak()
    const view = this.subOf('more')
    if (view === 'credits') return `<div class="credits-body">${this.credits()}</div>`
    if (view === 'settings')
      return `<p class="row-title">Sound</p><button class="px-btn small" data-act="sound">Cries ${g.save.settings.sound === false ? 'off' : 'on'}</button>
      ${this.h.popOut ? `<p class="row-title">Window</p><button class="px-btn small" data-act="popout">Pop out</button>` : ''}
      ${this.h.quit ? `<p class="row-title">Window</p><button class="px-btn small" data-act="quit">Close</button>` : ''}
      ${this.h.cheats ? `<p class="row-title">Testing</p><button class="px-btn small" data-act="cheats">Cheats</button> <span class="hint">or press \`</span>` : ''}`
    return `
      <p class="row-title">Session length</p>
      <div class="segs wide">
        <button class="seg${len === 1500 ? ' on' : ''}" data-len="25">25 min</button>
        <button class="seg${len === 3000 ? ' on' : ''}" data-len="50">50 min</button>
        <button class="seg${len === null ? ' on' : ''}" data-len="open">Open</button>
      </div>
      <p class="row-title">Today</p>
      <p class="note">${fmtMinutes(g.todayMinutes())} focused${streak ? ` · ${streak} day${streak === 1 ? '' : 's'} in a row` : ''}</p>
      ${!det && idleOk ? `<p class="row-title">Idle detection</p><button class="px-btn small" data-act="idle">Turn on</button>` : ''}`
  }

  private async onSheetClick(e: Event) {
    const t = e.target as HTMLElement
    const at = (k: string) => t.closest<HTMLElement>(`[data-${k}]`)?.dataset[k.replace(/-./g, (x) => x[1].toUpperCase())]
    const btn = t.closest<HTMLButtonElement>('button')
    if (btn?.disabled) return
    const tab = at('tab')
    if (tab) return this.openSheet(tab as Tab)
    const subAt = at('sub')
    if (subAt) {
      this.sub[this.tab] = subAt
      return this.renderSheet()
    }
    const lp = at('logpage')
    if (lp != null) {
      this.logPage = Math.max(0, Number(lp))
      this.lastView = ''
      return this.renderSheet()
    }
    const act = at('act')
    if (act === 'close') return this.closeSheet()
    if (act === 'idle') return this.h.enableIdle()
    if (act === 'quit') return this.h.quit?.()
    if (act === 'challenge') return this.h.challenge()
    if (act === 'cheats') return this.h.cheats?.()
    if (act === 'sound') return this.h.toggleSound()
    if (act === 'popout') {
      this.closeSheet()
      return this.h.popOut?.()
    }
    if (act === 'signout') {
      await this.h.cloud.signOut()
      this.friendsCache = null
      return this.renderSheet()
    }
    const visitId = at('visit')
    if (visitId) return this.h.visit(visitId)
    const sendto = at('sendto')
    if (sendto) {
      this.sendTo = this.sendTo === sendto ? null : sendto
      return this.renderSheet()
    }
    const giftAt = at('gift')
    if (giftAt) {
      const [fid, fname, kind, ref] = giftAt.split('|')
      return this.h.gift(fid, fname, kind as 'mon' | 'egg' | 'item', ref)
    }
    const sailTo = at('sail')
    if (sailTo) return this.h.sail(sailTo as IslandId)
    const roleAt = at('role')
    if (roleAt) {
      const [id, r] = roleAt.split('|')
      return this.h.assign(id, r as Role)
    }
    const trip = at('trip')
    if (trip) {
      const [id, l] = trip.split('|')
      return this.h.expedition(id, l === '1')
    }
    const hab = at('habitat')
    if (hab) return this.h.buildHabitat(hab as Habitat)
    const food = at('food')
    if (food) return this.h.buyFood(food, 1)
    const bait = at('bait')
    if (bait) return this.h.setBait(bait)
    const ball = at('ball')
    if (ball) {
      const [id, n] = ball.split(':')
      this.h.buyBall(id as Ball, Number(n))
      return this.renderSheet()
    }
    const len = at('len')
    if (len) {
      this.h.setLength(len === 'open' ? null : Number(len) * 60)
      this.lastFocusKey = ''
      return this.renderSheet()
    }
    const open = at('open')
    if (open) {
      this.openMon = this.openMon === open ? null : open
      this.stonePick = null
      return this.renderSheet()
    }
    const id = (k: string) => at(k)
    let v: string | undefined
    if ((v = id('party'))) {
      const [mid, on] = v.split(':')
      this.h.toggleParty(mid, on === '1')
    } else if ((v = id('feed'))) this.h.feed(v)
    else if ((v = id('stones'))) this.stonePick = v
    else if (at('stonecancel')) this.stonePick = null
    else if ((v = id('give'))) {
      const [mid, item] = v.split(':')
      this.stonePick = null
      this.h.giveStone(mid, item)
    } else if ((v = id('take'))) this.h.takeStone(v)
    else if ((v = id('allow'))) this.h.allowEvolution(v)
    else if ((v = id('buy'))) this.h.buyDecor(v)
    else if ((v = id('place'))) this.h.placeDecor(v)
    else if ((v = id('move'))) this.h.moveDecor(v)
    else if ((v = id('store'))) this.h.storeDecor(v)
    else if ((v = id('dex'))) this.dexPick = Number(v)
    else if ((v = id('accept')) || (v = id('decline'))) {
      await this.h.cloud.answer(Number(v), !!at('accept'))
      await this.loadFriends()
    } else if ((v = id('wave'))) {
      this.note = await this.h.cloud.wave(v)
    } else return
    this.renderSheet()
  }

  private async onSheetSubmit(e: Event) {
    e.preventDefault()
    const f = e.target as HTMLFormElement
    const kind = f.dataset.form
    const val = (name: string) => (f.elements.namedItem(name) as HTMLInputElement | null)?.value ?? ''
    if (kind === 'signin') this.note = await this.h.cloud.signIn(val('email'))
    if (kind === 'name') this.note = await this.h.cloud.claimName(val('name'))
    if (kind === 'add') {
      this.note = await this.h.cloud.request(val('handle'))
      await this.loadFriends()
    }
    this.renderSheet()
  }
}
