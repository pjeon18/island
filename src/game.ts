// The rules, kept apart from drawing. docs/LOOP.md is the pricing law:
// one focused minute is the only unit. Each minute gives every party Pokémon
// 1 EXP and you 1 shell; level L → L+1 costs L EXP; a finished session brings
// a visitor and ripens berries; streaks wash stones ashore; bond unlocks
// friendship evolutions. Choices (befriend, feed, stones, party, decorations)
// happen between sessions, and evolutions play out while you focus.

export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare'
export interface Evolution {
  dex: number
  level?: number
  item?: string
  friendship?: boolean
  time?: 'day' | 'night' | null
}
export interface SpeciesInfo {
  name: string
  evolvesTo: Evolution[]
  stage: number
  line: number
  rarity?: Rarity
}
export type Roster = Record<string, SpeciesInfo>

export interface Mon {
  id: string
  dex: number
  level: number
  exp: number // EXP into the current level
  focusedMin: number // bond: minutes spent focusing in the party
  metAt: number
  noEvolve?: boolean // you stopped its evolution; it waits until you allow it
  heldItem?: string // a stone given in a break; it evolves during the next session
}

export type SessionState = 'running' | 'asking' | 'away'
export interface Session {
  startedAt: number
  length: number | null // seconds; null = open session
  credited: number // verified focused seconds
  granted: number // whole minutes already turned into EXP
  lastBeat: number
  state: SessionState
  askSince?: number
  askReason?: 'idle' | 'checkin'
  idleSince?: number
  nextCheck: number // credited seconds at which the next check-in is due
  nextVisit: number // credited seconds at which an open session gets a visitor
}

export interface Save {
  v: 1
  party: string[]
  mons: Mon[]
  session: Session | null
  days: Record<string, number> // local date → focused minutes
  settings: { length: number | null; detector: boolean }
  seen: number[] // species that have visited or that you have raised
  caught: number[] // species you have owned
  shells: number
  berries: number
  bag: Record<string, number> // stones
  decor: { owned: string[]; slots: Record<string, string | null> }
  visits: { day: string; count: number }
  stonesPaid: string[] // `${day}:${streak}` milestones already paid
  breakUntil: number | null
}

export const PARTY_MAX = 3
export const START_LEVEL = 5
export const MAX_GAP = 90 // seconds: a beat is worth at most this much wall time
export const AWAY_GAP = 5 * 60 // a gap this long means you were gone
export const CHECKIN_EVERY = 20 * 60 // without idle detection
export const ANSWER_WINDOW = 2 * 60
export const IDLE_THRESHOLD = 10 * 60 // idle detector threshold
export const OPEN_VISIT_EVERY = 30 * 60
export const BERRY_EXP = 10
export const BERRIES_MAX = 9 // the bush holds this many
export const BOND_FOR_FRIENDSHIP = 10 * 60 // focused minutes together
export const VISITS_PER_DAY = 12
export const BREAK_SECONDS = 5 * 60
export const STREAK_STONES = [3, 7, 14, 30]
export const RARE_50 = 3.3 // rare-weight multiplier for a finished 50-minute session
export const STONES = ['thunder-stone', 'water-stone', 'fire-stone', 'leaf-stone', 'ice-stone', 'sun-stone']
const KEY = 'island-save-v1'

export const expToNext = (level: number) => level
export const stoneName = (item: string) => item.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
/** "a Water Stone", "an Ice Stone" */
export const aStone = (item: string) => `${/^[aeiou]/i.test(item) ? 'an' : 'a'} ${stoneName(item)}`
export const isDay = (t = Date.now()) => {
  const h = new Date(t).getHours()
  return h >= 6 && h < 18
}

export function dayKey(t = Date.now()) {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function emptySave(): Save {
  return {
    v: 1,
    party: [],
    mons: [],
    session: null,
    days: {},
    settings: { length: 25 * 60, detector: false },
    seen: [],
    caught: [],
    shells: 0,
    berries: 0,
    bag: {},
    decor: { owned: [], slots: {} },
    visits: { day: '', count: 0 },
    stonesPaid: [],
    breakUntil: null,
  }
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Save
      if (s && s.v === 1 && Array.isArray(s.mons)) {
        const m = { ...emptySave(), ...s }
        // T1 saves have no caught list: everything owned counts
        for (const mon of m.mons) if (!m.caught.includes(mon.dex)) m.caught.push(mon.dex)
        return m
      }
    }
  } catch {}
  return emptySave()
}

export type GameEvent =
  | { type: 'levelUp'; mon: Mon }
  | { type: 'evolveReady'; mon: Mon; to: number }
  | { type: 'sessionStart' }
  | { type: 'sessionEnd'; minutes: number; complete: boolean; berries: number }
  | { type: 'visit'; rareMult: number }
  | { type: 'visitCapped' }
  | { type: 'ask'; reason: 'idle' | 'checkin' }
  | { type: 'away'; reason: 'idle' | 'checkin' | 'locked' | 'gap'; retractedMin: number }
  | { type: 'back' }
  | { type: 'partyChanged' }
  | { type: 'minute'; n: number }
  | { type: 'stone'; item: string; streak: number }
  | { type: 'fed'; mon: Mon; levels: number }
  | { type: 'retract'; minutes: number }

export class Game {
  save: Save
  private listeners: ((e: GameEvent) => void)[] = []
  now = () => Date.now()

  constructor(public roster: Roster) {
    this.save = loadSave()
    this.backfillDex()
  }

  /** Everything you own, and every earlier form you raised it from, counts as seen and befriended. */
  private backfillDex() {
    const parent = new Map<number, number>()
    for (const [k, s] of Object.entries(this.roster)) for (const e of s.evolvesTo) parent.set(e.dex, Number(k))
    for (const m of this.save.mons) {
      for (let d: number | undefined = m.dex; d; d = parent.get(d)) this.mark(d, true)
    }
    for (const d of this.save.caught) if (!this.save.seen.includes(d)) this.save.seen.push(d)
  }

  on(fn: (e: GameEvent) => void) {
    this.listeners.push(fn)
  }
  private emit(e: GameEvent) {
    for (const fn of this.listeners) fn(e)
  }
  /** Pick up changes another window wrote. */
  reload() {
    this.save = loadSave()
    this.backfillDex()
    this.emit({ type: 'partyChanged' })
  }
  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.save))
    } catch {}
  }

  // ---------- Pokémon ----------
  species(dex: number) {
    return this.roster[String(dex)]
  }
  name(m: Mon | number) {
    return this.species(typeof m === 'number' ? m : m.dex)?.name ?? '???'
  }
  mon(id: string) {
    return this.save.mons.find((m) => m.id === id)
  }
  get party() {
    return this.save.party.map((id) => this.mon(id)).filter(Boolean) as Mon[]
  }
  get hasStarter() {
    return this.save.mons.length > 0
  }
  get inSession() {
    return !!this.save.session
  }
  private mark(dex: number, caught: boolean) {
    if (!this.save.seen.includes(dex)) this.save.seen.push(dex)
    if (caught && !this.save.caught.includes(dex)) this.save.caught.push(dex)
  }

  addMon(dex: number, level: number): Mon {
    const m: Mon = { id: Math.random().toString(36).slice(2, 10), dex, level, exp: 0, focusedMin: 0, metAt: this.now() }
    this.save.mons.push(m)
    this.mark(dex, true)
    if (this.save.party.length < PARTY_MAX) this.save.party.push(m.id)
    this.persist()
    this.emit({ type: 'partyChanged' })
    return m
  }

  chooseStarter(dex: number) {
    if (this.hasStarter) return
    this.addMon(dex, START_LEVEL)
  }

  /** Party changes only between sessions. Returns false if refused. */
  setInParty(id: string, on: boolean) {
    if (this.save.session) return false
    const p = this.save.party
    if (on) {
      if (p.includes(id) || p.length >= PARTY_MAX) return false
      p.push(id)
    } else {
      if (!p.includes(id) || p.length <= 1) return false
      p.splice(p.indexOf(id), 1)
    }
    this.persist()
    this.emit({ type: 'partyChanged' })
    return true
  }

  /** Which evolutions this Pokémon could ever take, with a plain description. */
  evolutionOptions(m: Mon) {
    return (this.species(m.dex)?.evolvesTo ?? []).filter((e) => this.species(e.dex))
  }

  /**
   * The evolution this Pokémon has reached, if any. Level and friendship
   * evolutions trigger on their own; a stone only once you have given it one.
   */
  evolutionDue(m: Mon, t = this.now()) {
    if (m.noEvolve) return null
    for (const e of this.evolutionOptions(m)) {
      if (e.level && m.level >= e.level) return e.dex
      if (e.item && m.heldItem === e.item) return e.dex
      if (e.friendship && m.focusedMin >= BOND_FOR_FRIENDSHIP && (!e.time || (e.time === 'day') === isDay(t))) return e.dex
    }
    return null
  }
  evolve(m: Mon, to: number) {
    m.dex = to
    m.heldItem = undefined
    this.mark(to, true)
    this.persist()
  }
  stopEvolution(m: Mon) {
    m.noEvolve = true
    this.persist()
  }
  allowEvolution(m: Mon) {
    m.noEvolve = false
    this.persist()
  }

  // ---------- break-time choices ----------
  /** Give a berry: 10 EXP to any Pokémon, party or box. Only between sessions. */
  feed(id: string) {
    const m = this.mon(id)
    if (!m || this.save.session || this.save.berries <= 0) return false
    this.save.berries--
    const before = m.level
    this.addExp(m, BERRY_EXP)
    this.persist()
    this.emit({ type: 'fed', mon: m, levels: m.level - before })
    return true
  }
  /** Give a stone; the evolution happens during the next focus session. */
  giveStone(id: string, item: string) {
    const m = this.mon(id)
    if (!m || this.save.session || !this.save.bag[item]) return false
    if (!this.evolutionOptions(m).some((e) => e.item === item)) return false
    if (m.heldItem) this.save.bag[m.heldItem] = (this.save.bag[m.heldItem] ?? 0) + 1
    this.save.bag[item]--
    m.heldItem = item
    m.noEvolve = false
    this.persist()
    this.emit({ type: 'partyChanged' })
    return true
  }
  takeStone(id: string) {
    const m = this.mon(id)
    if (!m?.heldItem || this.save.session) return false
    this.save.bag[m.heldItem] = (this.save.bag[m.heldItem] ?? 0) + 1
    m.heldItem = undefined
    this.persist()
    return true
  }
  spendShells(n: number) {
    if (this.save.shells < n) return false
    this.save.shells -= n
    this.persist()
    return true
  }

  // ---------- EXP ----------
  private addExp(m: Mon, n: number) {
    m.exp += n
    while (m.level < 100 && m.exp >= expToNext(m.level)) {
      m.exp -= expToNext(m.level)
      m.level++
      this.emit({ type: 'levelUp', mon: m })
      if (this.save.session) {
        const to = this.evolutionDue(m)
        if (to) this.emit({ type: 'evolveReady', mon: m, to })
      }
    }
  }
  private giveExp(n: number) {
    this.save.shells += n
    for (const m of this.party) {
      m.focusedMin += n
      this.addExp(m, n)
    }
  }
  /** Take back EXP for minutes that turned out not to be focused. Never de-levels. */
  private takeExp(n: number) {
    this.save.shells = Math.max(0, this.save.shells - n)
    for (const m of this.party) {
      m.focusedMin = Math.max(0, m.focusedMin - n)
      m.exp = Math.max(0, m.exp - n)
    }
  }

  // ---------- days ----------
  todayMinutes() {
    return this.save.days[dayKey(this.now())] ?? 0
  }
  /** Consecutive days (ending today or yesterday) with at least one focused minute. */
  streak() {
    let n = 0
    const d = new Date(this.now())
    if (!this.save.days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1)
    while (this.save.days[dayKey(d.getTime())]) {
      n++
      d.setDate(d.getDate() - 1)
    }
    return n
  }
  visitsToday() {
    return this.save.visits.day === dayKey(this.now()) ? this.save.visits.count : 0
  }
  private checkStreakStone() {
    const n = this.streak()
    const key = `${dayKey(this.now())}:${n}`
    if (!STREAK_STONES.includes(n) || this.save.stonesPaid.includes(key)) return
    this.save.stonesPaid.push(key)
    // prefer a stone that one of your Pokémon can use
    const useful = STONES.filter((s) => this.save.mons.some((m) => this.evolutionOptions(m).some((e) => e.item === s)))
    const pool = useful.length ? useful : STONES
    const item = pool[Math.floor(Math.random() * pool.length)]
    this.save.bag[item] = (this.save.bag[item] ?? 0) + 1
    this.emit({ type: 'stone', item, streak: n })
  }

  // ---------- focus sessions ----------
  startSession() {
    if (this.save.session || !this.hasStarter) return
    const t = this.now()
    this.save.breakUntil = null
    this.save.session = {
      startedAt: t,
      length: this.save.settings.length,
      credited: 0,
      granted: 0,
      lastBeat: t,
      state: 'running',
      nextCheck: CHECKIN_EVERY,
      nextVisit: OPEN_VISIT_EVERY,
    }
    this.persist()
    this.emit({ type: 'sessionStart' })
    // a stone given in the break, or a friendship reached, pays off now
    for (const m of this.party) {
      const to = this.evolutionDue(m)
      if (to) this.emit({ type: 'evolveReady', mon: m, to })
    }
  }

  endSession(complete = false) {
    const s = this.save.session
    if (!s) return
    this.save.session = null
    let berries = 0
    if (complete) {
      berries = s.length && s.length >= 50 * 60 ? 2 : 1
      this.save.berries = Math.min(BERRIES_MAX, this.save.berries + berries)
      this.save.breakUntil = this.now() + BREAK_SECONDS * 1000
    }
    this.persist()
    this.emit({ type: 'sessionEnd', minutes: s.granted, complete, berries })
    // a weight of 3.3 makes a rare visitor about 2.5 times as likely once the table renormalises
    if (complete) this.requestVisit(s.length && s.length >= 50 * 60 ? RARE_50 : 1)
  }

  private requestVisit(rareMult: number) {
    if (this.visitsToday() >= VISITS_PER_DAY) return this.emit({ type: 'visitCapped' })
    this.emit({ type: 'visit', rareMult })
  }

  /**
   * Called about once a second (and on wake-up). Credits real elapsed time
   * while running, capped per beat, so a sleeping laptop or a closed window
   * never counts.
   */
  beat() {
    const s = this.save.session
    if (!s) return
    const t = this.now()
    const gap = (t - s.lastBeat) / 1000
    s.lastBeat = t
    if (s.state === 'asking') {
      if (t - (s.askSince ?? t) > ANSWER_WINDOW * 1000) this.goAway(s.askReason ?? 'checkin')
      return
    }
    if (s.state !== 'running') return
    if (gap > AWAY_GAP) {
      this.goAway('gap')
      return
    }
    this.credit(Math.min(gap, MAX_GAP))
    if (this.save.session && !this.save.settings.detector && s.credited >= s.nextCheck) this.ask('checkin')
  }

  private credit(sec: number) {
    const s = this.save.session!
    s.credited += sec
    const whole = Math.floor(s.credited / 60)
    if (whole > s.granted) {
      const n = whole - s.granted
      s.granted = whole
      const k = dayKey(this.now())
      const firstToday = !this.save.days[k]
      this.save.days[k] = (this.save.days[k] ?? 0) + n
      this.giveExp(n)
      if (firstToday) this.checkStreakStone()
      this.emit({ type: 'minute', n })
    }
    this.persist()
    if (s.length && s.credited >= s.length) return this.endSession(true)
    if (!s.length && s.credited >= s.nextVisit) {
      s.nextVisit += OPEN_VISIT_EVERY
      this.save.berries = Math.min(BERRIES_MAX, this.save.berries + 1)
      this.requestVisit(1)
    }
  }

  /** Debug and tests: credit focused minutes directly. */
  grantMinutes(n: number) {
    if (!this.save.session) this.startSession()
    const s = this.save.session!
    s.state = 'running'
    s.lastBeat = this.now()
    for (let i = 0; i < n && this.save.session; i++) this.credit(60)
  }

  ask(reason: 'idle' | 'checkin') {
    const s = this.save.session
    if (!s || s.state !== 'running') return
    s.state = 'asking'
    s.askReason = reason
    s.askSince = this.now()
    if (reason === 'idle') s.idleSince = this.now() - IDLE_THRESHOLD * 1000
    this.persist()
    this.emit({ type: 'ask', reason })
  }

  /** "Yes, still here": the time spent on the question counts, on your word. */
  answerStillHere() {
    const s = this.save.session
    if (!s || s.state !== 'asking') return
    const asked = (this.now() - (s.askSince ?? this.now())) / 1000
    s.state = 'running'
    s.lastBeat = this.now()
    s.nextCheck = s.credited + CHECKIN_EVERY
    this.credit(Math.min(asked, ANSWER_WINDOW))
    this.emit({ type: 'back' })
  }

  /**
   * Pause the session. When idle detection saw you go idle and nobody
   * answered, the idle stretch before the question is taken back too.
   */
  goAway(reason: 'idle' | 'checkin' | 'locked' | 'gap') {
    const s = this.save.session
    if (!s || s.state === 'away') return
    let retracted = 0
    if (reason === 'idle' && s.state === 'asking') {
      const sec = Math.min(IDLE_THRESHOLD, s.credited)
      s.credited -= sec
      const whole = Math.floor(s.credited / 60)
      retracted = s.granted - whole
      if (retracted > 0) {
        s.granted = whole
        const k = dayKey(this.now())
        this.save.days[k] = Math.max(0, (this.save.days[k] ?? 0) - retracted)
        this.takeExp(retracted)
        this.emit({ type: 'retract', minutes: retracted })
      }
    }
    s.state = 'away'
    s.askSince = undefined
    this.persist()
    this.emit({ type: 'away', reason, retractedMin: retracted })
  }

  comeBack() {
    const s = this.save.session
    if (!s || s.state === 'running') return
    s.state = 'running'
    s.lastBeat = this.now()
    s.nextCheck = s.credited + CHECKIN_EVERY
    this.persist()
    this.emit({ type: 'back' })
  }

  // ---------- visitors ----------
  /**
   * Weighted draw of a first-stage visitor. Rare ones get likelier with a
   * 50-minute session, a 3-day streak and a long day. Species you have never
   * befriended are a little likelier, so the Pokédex keeps moving.
   */
  pickVisitor(rareMult = 1, rand = Math.random): { dex: number; level: number } {
    const caughtLines = new Set(this.save.caught.map((d) => this.species(d)?.line))
    const starterLine = this.save.mons[0] ? this.species(this.save.mons[0].dex)?.line : undefined
    const boost = rareMult * (1 + (this.streak() >= 3 ? 0.6 : 0) + (this.todayMinutes() >= 120 ? 0.4 : 0))
    const table: { dex: number; w: number; rarity: Rarity }[] = []
    for (const [k, s] of Object.entries(this.roster)) {
      if (s.stage !== 1 || !s.rarity) continue
      if (s.rarity === 'starter' && Number(k) === starterLine) continue
      // base odds per visit: rare about 4%, each other starter about 2%
      let w = s.rarity === 'common' ? 10 : s.rarity === 'uncommon' ? 5 * Math.sqrt(boost) : s.rarity === 'rare' ? 4 * boost : 2 * boost
      if (caughtLines.has(s.line)) w *= 0.5
      table.push({ dex: Number(k), w, rarity: s.rarity })
    }
    const total = table.reduce((a, b) => a + b.w, 0)
    let r = rand() * total
    let pick = table[0]
    for (const e of table) {
      r -= e.w
      if (r <= 0) {
        pick = e
        break
      }
    }
    const lo = pick.rarity === 'common' ? 2 : 4
    const level = lo + Math.floor(rand() * 5)
    this.mark(pick.dex, false)
    const today = dayKey(this.now())
    this.save.visits = { day: today, count: this.visitsToday() + 1 }
    this.persist()
    return { dex: pick.dex, level }
  }

  reset() {
    try {
      localStorage.removeItem(KEY)
    } catch {}
    this.save = emptySave()
    this.emit({ type: 'partyChanged' })
  }
}
