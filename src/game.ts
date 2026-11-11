// The rules, kept apart from drawing. One focused minute is the only unit:
// every party Pokémon gets 1 EXP per verified focused minute, level L → L+1
// costs L EXP, evolution happens at the real levels, and a visitor comes out
// of the tall grass when a session finishes. Nothing can be bought.

export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare'
export interface SpeciesInfo {
  name: string
  evolvesTo: { dex: number; level: number }[]
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
  focusedMin: number // minutes spent focusing in the party
  metAt: number
  noEvolve?: boolean // you stopped its evolution; it waits until you allow it
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
  party: string[] // mon ids, up to PARTY_MAX
  mons: Mon[]
  session: Session | null
  days: Record<string, number> // local date → focused minutes
  settings: { length: number | null; detector: boolean }
  seen: number[] // dex numbers that have visited
}

export const PARTY_MAX = 3
export const START_LEVEL = 5
export const MAX_GAP = 90 // seconds: a beat is worth at most this much wall time
export const AWAY_GAP = 5 * 60 // a gap this long means you were gone
export const CHECKIN_EVERY = 20 * 60 // without idle detection
export const ANSWER_WINDOW = 2 * 60
export const IDLE_THRESHOLD = 10 * 60 // idle detector threshold
export const OPEN_VISIT_EVERY = 30 * 60
const KEY = 'island-save-v1'

export const expToNext = (level: number) => level

export function dayKey(t = Date.now()) {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function emptySave(): Save {
  return { v: 1, party: [], mons: [], session: null, days: {}, settings: { length: 25 * 60, detector: false }, seen: [] }
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Save
      if (s && s.v === 1 && Array.isArray(s.mons)) return { ...emptySave(), ...s }
    }
  } catch {}
  return emptySave()
}

export type GameEvent =
  | { type: 'levelUp'; mon: Mon }
  | { type: 'evolveReady'; mon: Mon; to: number }
  | { type: 'sessionStart' }
  | { type: 'sessionEnd'; minutes: number; complete: boolean }
  | { type: 'visit' }
  | { type: 'ask'; reason: 'idle' | 'checkin' }
  | { type: 'away'; reason: 'idle' | 'checkin' | 'locked' | 'gap'; retractedMin: number }
  | { type: 'back' }
  | { type: 'partyChanged' }
  | { type: 'minute' }

export class Game {
  save: Save
  private listeners: ((e: GameEvent) => void)[] = []
  now = () => Date.now()

  constructor(public roster: Roster) {
    this.save = loadSave()
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

  addMon(dex: number, level: number): Mon {
    const m: Mon = { id: Math.random().toString(36).slice(2, 10), dex, level, exp: 0, focusedMin: 0, metAt: this.now() }
    this.save.mons.push(m)
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

  /** The next evolution this Pokémon has reached, if any. */
  evolutionDue(m: Mon) {
    if (m.noEvolve) return null
    const e = this.species(m.dex)?.evolvesTo.find((x) => m.level >= x.level && this.species(x.dex))
    return e ? e.dex : null
  }
  evolve(m: Mon, to: number) {
    m.dex = to
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

  private giveExp(n: number) {
    for (const m of this.party) {
      m.focusedMin += n
      m.exp += n
      while (m.level < 100 && m.exp >= expToNext(m.level)) {
        m.exp -= expToNext(m.level)
        m.level++
        this.emit({ type: 'levelUp', mon: m })
        const to = this.evolutionDue(m)
        if (to) this.emit({ type: 'evolveReady', mon: m, to })
      }
    }
  }
  /** Take back EXP for minutes that turned out not to be focused. Never de-levels. */
  private takeExp(n: number) {
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

  // ---------- focus sessions ----------
  startSession() {
    if (this.save.session || !this.hasStarter) return
    const t = this.now()
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
  }

  endSession(complete = false) {
    const s = this.save.session
    if (!s) return
    this.save.session = null
    this.persist()
    this.emit({ type: 'sessionEnd', minutes: s.granted, complete })
    if (complete) this.emit({ type: 'visit' })
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
    if (!this.save.settings.detector && s.credited >= s.nextCheck) this.ask('checkin')
  }

  private credit(sec: number) {
    const s = this.save.session!
    s.credited += sec
    const whole = Math.floor(s.credited / 60)
    if (whole > s.granted) {
      const n = whole - s.granted
      s.granted = whole
      const k = dayKey(this.now())
      this.save.days[k] = (this.save.days[k] ?? 0) + n
      this.giveExp(n)
      this.emit({ type: 'minute' })
    }
    this.persist()
    if (s.length && s.credited >= s.length) return this.endSession(true)
    if (!s.length && s.credited >= s.nextVisit) {
      s.nextVisit += OPEN_VISIT_EVERY
      this.emit({ type: 'visit' })
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
  /** Weighted draw of a first-stage visitor. Rare ones get likelier with a streak and a long day. */
  pickVisitor(rand = Math.random): { dex: number; level: number } {
    const owned = new Set(this.save.mons.map((m) => this.species(m.dex)?.line))
    const starterLine = this.save.mons[0] ? this.species(this.save.mons[0].dex)?.line : undefined
    const rareBoost = (this.streak() >= 3 ? 3 : 0) + (this.todayMinutes() >= 120 ? 2 : 0)
    const table: { dex: number; w: number; rarity: Rarity }[] = []
    for (const [k, s] of Object.entries(this.roster)) {
      if (s.stage !== 1 || !s.rarity) continue
      if (s.rarity === 'starter' && Number(k) === starterLine) continue
      let w = s.rarity === 'common' ? 10 : s.rarity === 'uncommon' ? 5 : s.rarity === 'rare' ? 1.2 + rareBoost * 0.6 : 0.8 + rareBoost * 0.4
      if (owned.has(s.line)) w *= 0.45
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
    if (!this.save.seen.includes(pick.dex)) this.save.seen.push(pick.dex)
    this.persist()
    return { dex: pick.dex, level }
  }

  reset() {
    this.save = emptySave()
    this.persist()
    this.emit({ type: 'partyChanged' })
  }
}
