// The interface inside the island window, in FireRed-style windows. It is
// laid out in HUD pixels at its own whole-number scale (see fit) and travels
// into the pop-out window with the canvas. Dialogs follow PMD: a portrait beside a text box. Everything
// you choose (befriend, feed, stones, party, decorations, friends) lives in
// the sheet, and the sheet's choices only unlock between sessions.
import type { CloudState, Friend, FriendRequest, Me } from './cloud'
import { CATALOG, SLOTS, decorDef } from './decor'
import { BALLS, BERRY_EXP, BOND_FOR_FRIENDSHIP, Ball, DAYCARE_EVERY, DECOR_LOVES, EGG_MAX, Evolution, FOODS, Game, HABITATS, Habitat, JOBS, Mon, PARTY_MAX, Role, aStone, expToNext, jobEvery, stoneName } from './game'

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
const TABS: [Tab, string, string][] = [
  ['mons', 'Pokémon', itemUrl('poke-ball')],
  ['dex', 'Pokédex', DEX_ICON],
  ['island', 'Island', itemUrl('town-map')],
  ['friends', 'Friends', itemUrl('pal-pad')],
  ['more', 'More', ''],
]
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

type Tab = 'mons' | 'dex' | 'island' | 'friends' | 'more'
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
    const s = g.save.session
    const breakLeft = !s && g.save.breakUntil ? (g.save.breakUntil - g.now()) / 1000 : 0
    const key = !g.hasStarter ? 'none' : !s ? `idle:${g.save.settings.length}:${breakLeft > 0}` : s.state
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
              ? `<div class="px-panel clock"><span class="clock-t"></span><span class="clock-l">${s.length ? 'Focusing' : 'Open'}</span></div>
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

    const pk = g.party.map((m) => `${m.id}:${m.dex}:${m.level}:${m.exp}`).join('|')
    if (pk !== this.lastPartyKey) {
      this.lastPartyKey = pk
      this.party.innerHTML = g.party
        .map((m) => {
          const pct = Math.round((m.exp / expToNext(m.level)) * 100)
          return `<span class="chip"><img src="${portraitUrl(m.dex)}" alt="" /><span class="lv">Lv${m.level}</span><span class="bar"><i style="width:${pct}%"></i></span></span>`
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

  private renderSheet() {
    const title = TABS.find(([id]) => id === this.tab)![1]
    const body =
      this.tab === 'mons'
        ? this.monsTab()
        : this.tab === 'dex'
          ? this.dexTab()
          : this.tab === 'island'
            ? this.islandTab()
            : this.tab === 'friends'
              ? this.friendsTab()
              : this.moreTab()
    const scroll = this.sheet.querySelector('.sheet-body')?.scrollTop ?? 0
    this.sheet.innerHTML = `
      <div class="px-panel sheet-panel">
        <div class="sheet-head"><p class="sheet-title">${title}</p><button class="close-x" data-act="close" aria-label="Close"></button></div>
        <div class="sheet-body">${this.note ? `<p class="note flash">${esc(this.note)}</p>` : ''}${body}</div>
      </div>`
    const sb = this.sheet.querySelector('.sheet-body')
    if (sb) sb.scrollTop = scroll
  }

  // Pokémon: party first, then the box; tap a row for its choices
  private monsTab() {
    const g = this.game
    const s = g.save
    const stones = Object.entries(s.bag).filter(([, n]) => n > 0)
    const balls = BALLS.filter((b) => s.balls[b.id] > 0).map((b) => `<span title="${b.name}">${icon(b.id)}<b>×${s.balls[b.id]}</b></span>`).join('')
    const inv = `<p class="inv"><span title="Shells">${icon('shoal-shell')}<b>×${s.shells}</b></span>${s.starPieces ? `<span title="Star Pieces">${icon('star-piece')}<b>×${s.starPieces}</b></span>` : ''}<span title="Oran Berries">${icon('oran-berry')}<b>×${s.berries}</b></span>${balls}${stones.map(([k, n]) => `<span title="${stoneName(k)}">${icon(k)}<b>×${n}</b></span>`).join('')}</p>`
    const locked = g.inSession ? `<p class="note">Locked while focusing.</p>` : ''
    const eggs = s.eggs.length
      ? `<p class="row-title">Eggs <span class="hint">${s.eggs.length}/${EGG_MAX}</span></p>` +
        s.eggs.map((e, i) => `<div class="decor-row"><span class="shop-ico">${icon('lucky-egg')}</span><div class="mon-main"><p>Egg</p><span class="bar"><i style="width:${Math.round((e.progress / e.need) * 100)}%"></i></span><p class="hint">${i < EGG_MAX ? `${e.progress}/${e.need} min` : 'Waiting for room'}</p></div></div>`).join('')
      : ''
    const helpers = s.mons.filter((m) => { const r = g.roleOf(m.id); return r !== 'party' && r !== 'box' })
    const box = s.mons.filter((m) => g.roleOf(m.id) === 'box')
    const jobs = JOBS.map((j) => {
      const who = s.jobs[j.id] && g.mon(s.jobs[j.id]!)
      return `<p class="hint">${j.name}: ${who ? `${g.name(who)}, every ${jobEvery(j, who.level)} min` : `free (${j.types.map((t) => t[0].toUpperCase() + t.slice(1)).join(' or ')}${j.needsDecor ? ', needs the campfire' : ''})`}</p>`
    }).join('')
    const dc = s.daycare.ids.filter(Boolean).length
    return inv + locked + eggs +
      `<p class="row-title">Party <span class="hint">${g.party.length}/${PARTY_MAX}</span></p>` + g.party.map((m) => this.monRow(m)).join('') +
      `<p class="row-title">Helpers</p><p class="hint">Day Care: ${dc}/2${dc === 2 ? `, an egg every ${DAYCARE_EVERY} min` : ''}</p>${jobs}` + helpers.map((m) => this.monRow(m)).join('') +
      (box.length ? `<p class="row-title">Box</p>` + box.map((m) => this.monRow(m)).join('') : '')
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
      role === 'daycare' ? 'At the Day Care' : role === 'expedition' && ex ? `Away, ${ex.progress}/${ex.need} min` : role.startsWith('job:') ? JOBS.find((j) => `job:${j.id}` === role)!.name : ''
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

  // Island: decorations bought with shells, placed on fixed spots
  private islandTab() {
    const g = this.game
    const d = g.save.decor
    const placed = new Set(Object.values(d.slots).filter(Boolean) as string[])
    const free = SLOTS.filter((s) => !d.slots[s.id]).length
    const locked = g.inSession
    const rows = CATALOG.map((item) => {
      const owned = d.owned.includes(item.id)
      const act = !owned
        ? `<button class="px-btn small${g.save.shells >= item.price ? ' primary' : ''}" data-buy="${item.id}" ${g.save.shells < item.price || locked ? 'disabled' : ''}>${icon('shoal-shell', 'ico-s')}${item.price}</button>`
        : placed.has(item.id)
          ? `<button class="px-btn small" data-move="${item.id}" ${locked ? 'disabled' : ''}>Move</button><button class="px-btn small" data-store="${item.id}" ${locked ? 'disabled' : ''}>Put away</button>`
          : `<button class="px-btn small primary" data-place="${item.id}" ${!free || locked ? 'disabled' : ''}>Place</button>`
      const loves = (DECOR_LOVES[item.id] ?? []).map((d) => (g.save.seen.includes(d) ? g.name(d) : '???')).join(', ')
      return `<div class="decor-row"><div class="mon-main"><p><strong>${item.name}</strong> <span class="hint">${owned ? (placed.has(item.id) ? 'On the island' : 'Put away') : `${item.price} shells`}</span></p>${loves ? `<p class="hint">Loved by ${loves}</p>` : ''}</div><div class="row-actions">${act}</div></div>`
    }).join('')
    const star = icon('star-piece', 'ico-s')
    const shell = icon('shoal-shell', 'ico-s')
    const habitats = HABITATS.map((h) => {
      const built = g.save.habitats.includes(h.id)
      const can = g.save.starPieces >= h.stars && g.save.shells >= h.shells
      const act = built ? `<span class="hint">Built</span>` : `<button class="px-btn small${can ? ' primary' : ''}" data-habitat="${h.id}" ${!can || locked ? 'disabled' : ''}>${star}${h.stars} ${shell}${h.shells}</button>`
      return `<div class="decor-row"><div class="mon-main"><p>${h.name}</p><p class="hint">${h.types.map((t) => t[0].toUpperCase() + t.slice(1)).join(', ')} types</p></div><div class="row-actions row">${act}</div></div>`
    }).join('')
    const food = FOODS.map((f) => {
      const have = g.save.foods[f.id] ?? 0
      return `<div class="decor-row"><span class="shop-ico">${icon(f.id)}</span><div class="mon-main"><p>${f.name} <span class="hint">×${have}</span></p><p class="hint">${f.types.map((t) => t[0].toUpperCase() + t.slice(1)).join(', ')}</p></div><div class="row-actions row"><button class="px-btn small" data-food="${f.id}" ${g.save.shells < f.price || locked ? 'disabled' : ''}>${shell}${f.price}</button><button class="px-btn small primary" data-bait="${f.id}" ${!have || locked || !!g.save.bait ? 'disabled' : ''}>Set out</button></div></div>`
    }).join('')
    const shop = BALLS.map(
      (b) => `<div class="decor-row"><span class="shop-ico">${icon(b.id)}</span><div class="mon-main"><p>${b.name} <span class="hint">×${g.save.balls[b.id]}</span></p></div><div class="row-actions row"><button class="px-btn small${g.save.shells >= b.price ? ' primary' : ''}" data-ball="${b.id}:1" ${g.save.shells < b.price || locked ? 'disabled' : ''}>${icon('shoal-shell', 'ico-s')}${b.price}</button><button class="px-btn small" data-ball="${b.id}:5" ${g.save.shells < b.price * 5 || locked ? 'disabled' : ''}>×5</button></div></div>`,
    ).join('')
    return `<p class="inv"><span title="Shells">${icon('shoal-shell')}<b>×${g.save.shells}</b></span>${g.save.starPieces ? `<span title="Star Pieces">${icon('star-piece')}<b>×${g.save.starPieces}</b></span>` : ''}</p>
      ${locked ? '<p class="note">Locked while focusing.</p>' : ''}
      <p class="row-title">Habitats</p>${habitats}
      <p class="row-title">Food</p>${g.save.bait ? `<p class="note">${FOODS.find((f) => f.id === g.save.bait)?.name} is out.</p>` : ''}${food}
      <p class="row-title">Balls</p>${shop}
      <p class="row-title">Decorations <span class="hint">${free}/${SLOTS.length} spots free</span></p>${rows}`
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
        const status = f.studying ? 'Studying now' : f.dayMin ? `${fmtMinutes(f.dayMin)} today` : ''
        const waveBtn = f.studying && !this.game.inSession ? `<button class="px-btn small" data-wave="${f.id}">Wave</button>` : ''
        return `<div class="friend-row${f.studying ? ' live' : ''}"><div class="mon-main"><p><strong>${esc(f.name)}</strong> <span class="hint">@${esc(f.handle)}</span></p><p class="hint">${status} ${f.dexCount ? `Pokédex: ${f.dexCount}.` : ''}</p></div><div class="mini-party">${party}</div>${waveBtn}</div>`
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
    return `
      <p class="row-title">Session length</p>
      <div class="segs wide">
        <button class="seg${len === 1500 ? ' on' : ''}" data-len="25">25 min</button>
        <button class="seg${len === 3000 ? ' on' : ''}" data-len="50">50 min</button>
        <button class="seg${len === null ? ' on' : ''}" data-len="open">Open</button>
      </div>
      <p class="row-title">Today</p>
      <p class="note">${fmtMinutes(g.todayMinutes())} focused${streak ? ` · ${streak} day${streak === 1 ? '' : 's'} in a row` : ''}</p>
      ${
        !det && idleOk ? `<p class="row-title">Idle detection</p><button class="px-btn small" data-act="idle">Turn on</button>` : ''
      }
      ${this.h.popOut ? `<p class="row-title">Window</p><button class="px-btn small" data-act="popout">Pop out</button>` : ''}
      ${this.h.quit ? `<p class="row-title">Window</p><button class="px-btn small" data-act="quit">Close</button>` : ''}
      <p class="row-title">Credits</p>
      <div class="credits-body">${this.credits()}</div>`
  }

  private async onSheetClick(e: Event) {
    const t = e.target as HTMLElement
    const at = (k: string) => t.closest<HTMLElement>(`[data-${k}]`)?.dataset[k.replace(/-./g, (x) => x[1].toUpperCase())]
    const btn = t.closest<HTMLButtonElement>('button')
    if (btn?.disabled) return
    const tab = at('tab')
    if (tab) return this.openSheet(tab as Tab)
    const act = at('act')
    if (act === 'close') return this.closeSheet()
    if (act === 'idle') return this.h.enableIdle()
    if (act === 'quit') return this.h.quit?.()
    if (act === 'popout') {
      this.closeSheet()
      return this.h.popOut?.()
    }
    if (act === 'signout') {
      await this.h.cloud.signOut()
      this.friendsCache = null
      return this.renderSheet()
    }
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
