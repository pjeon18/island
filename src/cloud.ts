// The online half of the island (T2), on Studdy's Supabase project. It is
// entirely optional: without env vars, or before supabase/island.sql has been
// run, the island stays fully playable on its own.
//
// Accounts are Studdy accounts. On GitHub Pages both apps live on
// pjeon18.github.io, so a Studdy sign-in carries over automatically. The
// island never signs anyone in anonymously: you sign in by email when you
// want friends, and Studdy's friends become your island's friends.
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

export type CloudState = 'off' | 'signedOut' | 'needsName' | 'missingSchema' | 'ready'
export interface Me {
  id: string
  handle: string
  name: string
  email?: string
}
export interface Friend {
  id: string
  handle: string
  name: string
  party: { dex: number; level: number }[]
  dexCount: number
  dayMin: number
  studying: boolean
}
export interface FriendRequest {
  rowId: number
  id: string
  handle: string
  name: string
}

let supa: SupabaseClient | null = null
let session: Session | null = null
let me: Me | null = null
let state: CloudState = url && anonKey ? 'signedOut' : 'off'
const listeners: ((s: CloudState) => void)[] = []
const setState = (s: CloudState) => {
  state = s
  listeners.forEach((f) => f(s))
}
export const cloudState = () => state
export const whoami = () => me
export const onCloud = (f: (s: CloudState) => void) => listeners.push(f)

const missing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42883' || e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PGRST205' || /does not exist|Could not find/i.test(e.message ?? ''))

// ---------- Turnstile (Studdy requires a captcha for sign-ins) ----------
declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void }
  }
}
async function captcha(): Promise<string | undefined> {
  if (!turnstileSiteKey) return undefined
  if (!window.turnstile) {
    await new Promise<void>((res) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = () => res()
      s.onerror = () => res()
      document.head.append(s)
    })
  }
  if (!window.turnstile) return undefined
  return new Promise((resolve) => {
    const el = document.createElement('div')
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:200'
    document.body.append(el)
    let id: string | undefined
    let done = false
    const finish = (t?: string) => {
      if (done) return
      done = true
      resolve(t)
      try {
        if (id) window.turnstile!.remove(id)
      } catch {}
      el.remove()
    }
    try {
      id = window.turnstile!.render(el, {
        sitekey: turnstileSiteKey,
        appearance: 'interaction-only',
        callback: (t: string) => finish(t),
        'error-callback': () => finish(undefined),
        'expired-callback': () => finish(undefined),
      })
      setTimeout(() => finish(undefined), 25000)
    } catch {
      finish(undefined)
    }
  })
}

// ---------- boot ----------
export async function initCloud() {
  if (state === 'off') return state
  supa = createClient(url!, anonKey!)
  supa.auth.onAuthStateChange((_e, s) => {
    const was = session?.user.id
    session = s
    if (s?.user.id !== was) void loadMe()
  })
  const { data } = await supa.auth.getSession()
  session = data.session
  await loadMe()
  return state
}

async function loadMe() {
  if (!supa) return
  if (!session) {
    me = null
    return setState('signedOut')
  }
  const { data } = await supa.from('profiles').select('handle, name').eq('user_id', session.user.id).maybeSingle()
  if (!data) {
    me = { id: session.user.id, handle: '', name: '', email: session.user.email ?? undefined }
    return setState('needsName')
  }
  me = { id: session.user.id, handle: data.handle, name: data.name, email: session.user.email ?? undefined }
  // is the island part of the database set up?
  const probe = await supa.rpc('island_friends')
  setState(missing(probe.error) ? 'missingSchema' : 'ready')
}

/** Send a sign-in link to the email you use for Studdy. */
export async function signIn(email: string) {
  if (!supa) return 'The online service is not set up in this build.'
  const captchaToken = await captcha()
  const { error } = await supa.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname, captchaToken, shouldCreateUser: true },
  })
  return error ? `The link could not be sent: ${error.message}` : 'Check your email for a sign-in link. Open it in this browser.'
}

export async function signOut() {
  await supa?.auth.signOut()
  session = null
  me = null
  setState('signedOut')
}

/** First time on the shared accounts: claim a Studdy profile with a handle. */
export async function claimName(name: string) {
  if (!supa || !session) return 'You are not signed in.'
  const clean = name.trim().slice(0, 20)
  if (!clean) return 'Please enter a name.'
  const base = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16) || 'trainer'
  for (let attempt = 0; attempt < 6; attempt++) {
    const salt = attempt ? String(Math.floor(Math.random() * 900 + 100)) : ''
    const handle = (base.length < 3 ? base + 'xyz'.slice(0, 3 - base.length) : base).slice(0, 19 - salt.length) + salt
    const { error } = await supa.from('profiles').insert({ user_id: session.user.id, handle, name: clean })
    if (!error) {
      await loadMe()
      return ''
    }
    if (!/duplicate|unique/i.test(error.message)) return `That did not work: ${error.message}`
  }
  return 'That name is taken. Try another.'
}

// ---------- verified sessions ----------
let sessionId: number | null = null
let beatTimer = 0
export async function sessionBegin() {
  if (state !== 'ready' || !supa || sessionId) return
  const { data, error } = await supa.rpc('island_session_begin')
  if (error || typeof data !== 'number' || data < 0) return
  sessionId = data
  window.clearInterval(beatTimer)
  // beats ~once a minute; the server counts at most 90 s per beat
  beatTimer = window.setInterval(() => void beat(), 60_000)
}
async function beat() {
  if (!supa || !sessionId) return
  const { data } = await supa.rpc('island_session_beat', { p_id: sessionId })
  if (data === -1) sessionId = null
}
export async function sessionEnd() {
  window.clearInterval(beatTimer)
  if (!supa || !sessionId) return
  const id = sessionId
  sessionId = null
  await supa.rpc('island_session_end', { p_id: id })
}

// ---------- your public island ----------
let publishTimer = 0
export function publish(party: { dex: number; level: number }[], dexCount: number) {
  if (state !== 'ready' || !supa) return
  window.clearTimeout(publishTimer)
  publishTimer = window.setTimeout(() => void supa!.rpc('island_publish', { p_party: party, p_dex_count: dexCount }), 4000)
}

// ---------- friends ----------
export async function listFriends(): Promise<{ friends: Friend[]; requests: FriendRequest[]; error?: string }> {
  if (state !== 'ready' || !supa || !me) return { friends: [], requests: [] }
  const [f, r] = await Promise.all([
    supa.rpc('island_friends'),
    supa.from('friends').select('id, requester').eq('addressee', me.id).eq('status', 'pending'),
  ])
  if (f.error) return { friends: [], requests: [], error: f.error.message }
  const friends: Friend[] = (f.data as Record<string, unknown>[]).map((x) => ({
    id: String(x.user_id),
    handle: String(x.handle ?? ''),
    name: String(x.name ?? '').slice(0, 20),
    party: (Array.isArray(x.party) ? x.party : [])
      .slice(0, 3)
      .map((p: { dex?: unknown; level?: unknown }) => ({ dex: Number(p.dex) | 0, level: Number(p.level) | 0 }))
      .filter((p) => p.dex >= 1 && p.dex <= 493),
    dexCount: Number(x.dex_count) | 0,
    dayMin: Number(x.day_min) | 0,
    studying: x.studying === true,
  }))
  let requests: FriendRequest[] = []
  const rows = (r.data ?? []) as { id: number; requester: string }[]
  if (rows.length) {
    const { data } = await supa.from('profiles').select('user_id, handle, name').in('user_id', rows.map((x) => x.requester))
    const byId = new Map((data ?? []).map((p) => [p.user_id as string, p]))
    requests = rows
      .map((x) => ({ rowId: x.id, id: x.requester, handle: String(byId.get(x.requester)?.handle ?? '?'), name: String(byId.get(x.requester)?.name ?? 'Someone') }))
  }
  return { friends, requests }
}

export async function requestFriend(handle: string) {
  if (!supa || !me) return 'You are not signed in.'
  const h = handle.trim().replace(/^@/, '').toLowerCase().slice(0, 20)
  if (!h) return 'Enter a handle, like @paul.'
  const { data } = await supa.from('profiles').select('user_id, name').eq('handle', h).maybeSingle()
  if (!data) return `Nobody is called @${h}.`
  if (data.user_id === me.id) return 'That is you.'
  const { error } = await supa.from('friends').insert({ requester: me.id, addressee: data.user_id })
  if (!error) return `Friend request sent to ${data.name}.`
  if (/duplicate|unique/i.test(error.message)) return `You and ${data.name} already have a request or friendship.`
  return `That did not work: ${error.message}`
}
export async function answerRequest(rowId: number, accept: boolean) {
  if (!supa) return
  if (accept) await supa.from('friends').update({ status: 'accepted' }).eq('id', rowId)
  else await supa.from('friends').delete().eq('id', rowId)
}

export async function wave(userId: string) {
  if (!supa) return 'You are not signed in.'
  const { data, error } = await supa.rpc('island_wave', { p_to: userId })
  if (error) return `That did not work: ${error.message}`
  return data === 'ok'
    ? 'You waved. They will see it at their next break.'
    : data === 'already waved'
      ? 'You waved a few minutes ago. Give them a little time.'
      : data === 'too many'
        ? 'You have waved a lot today. Try again tomorrow.'
        : 'You can only wave to friends.'
}

/** Waves that arrived while you were focusing. Marks them seen. */
export async function collectWaves(): Promise<string[]> {
  if (state !== 'ready' || !supa || !me) return []
  const { data } = await supa.from('island_waves').select('id, sender').eq('recipient', me.id).eq('seen', false).limit(10)
  const rows = (data ?? []) as { id: number; sender: string }[]
  if (!rows.length) return []
  await supa.from('island_waves').update({ seen: true }).in('id', rows.map((r) => r.id))
  const { data: ps } = await supa.from('profiles').select('user_id, name').in('user_id', [...new Set(rows.map((r) => r.sender))])
  const names = new Map((ps ?? []).map((p) => [p.user_id as string, String(p.name).slice(0, 20)]))
  return [...new Set(rows.map((r) => names.get(r.sender) ?? 'A friend'))]
}

// ---------- stage 5: visiting and gifts (supabase/island_stage5.sql) ----------
export interface Scene5 {
  island: 'home' | 'frost' | 'ember'
  habitats: string[]
  decor: Record<string, string>
}
export interface FriendScene {
  name: string
  handle: string
  party: { dex: number; level: number }[]
  scene: Scene5
  studying: boolean
}
export type GiftKind = 'mon' | 'egg' | 'item'
export interface Gift {
  id: number
  from: string
  kind: GiftKind
  payload: { dex?: number; level?: number; id?: string; n?: number }
}
let stage5 = true // turns false once we learn the stage 5 SQL has not been run
export const hasStage5 = () => state === 'ready' && stage5

let sceneTimer = 0
export function publishScene(scene: Scene5) {
  if (!hasStage5() || !supa) return
  window.clearTimeout(sceneTimer)
  sceneTimer = window.setTimeout(async () => {
    const { error } = await supa!.rpc('island_publish_scene', { p_scene: scene })
    if (missing(error)) stage5 = false
  }, 5000)
}
export async function friendScene(id: string): Promise<FriendScene | string> {
  if (!supa || state !== 'ready') return 'You are not signed in.'
  const { data, error } = await supa.rpc('island_friend_scene', { p_id: id })
  if (missing(error)) {
    stage5 = false
    return 'Visiting is not set up yet.'
  }
  if (error) return `That did not work: ${error.message}`
  const row = (data as Record<string, unknown>[])[0]
  if (!row) return 'You can only visit friends.'
  const sc = (row.scene ?? {}) as Partial<Scene5>
  return {
    name: String(row.name ?? '').slice(0, 20),
    handle: String(row.handle ?? ''),
    party: (Array.isArray(row.party) ? row.party : []).slice(0, 3).map((p: { dex?: unknown; level?: unknown }) => ({ dex: Number(p.dex) | 0, level: Number(p.level) | 0 })).filter((p) => p.dex >= 1 && p.dex <= 493),
    scene: { island: sc.island === 'frost' || sc.island === 'ember' ? sc.island : 'home', habitats: Array.isArray(sc.habitats) ? sc.habitats.map(String) : [], decor: sc.decor && typeof sc.decor === 'object' ? (sc.decor as Record<string, string>) : {} },
    studying: row.studying === true,
  }
}
export async function sendGift(to: string, kind: GiftKind, payload: Gift['payload']) {
  if (!supa || state !== 'ready') return 'You are not signed in.'
  const { data, error } = await supa.rpc('island_send_gift', { p_to: to, p_kind: kind, p_payload: payload })
  if (missing(error)) {
    stage5 = false
    return 'Gifts are not set up yet.'
  }
  if (error) return `That did not work: ${error.message}`
  return data === 'ok' ? 'ok' : data === 'too many' ? 'You have sent a lot today. Try again tomorrow.' : data === 'not friends' ? 'You can only send gifts to friends.' : 'That gift cannot be sent.'
}
export async function claimGifts(): Promise<Gift[]> {
  if (!hasStage5() || !supa) return []
  const { data, error } = await supa.rpc('island_claim_gifts')
  if (missing(error)) {
    stage5 = false
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    from: String(r.sender_name ?? 'A friend').slice(0, 20),
    kind: r.kind as GiftKind,
    payload: (r.payload ?? {}) as Gift['payload'],
  }))
}

// ---------- stage 7: dungeon invites (supabase/island_stage7.sql) ----------
export interface DungeonInvite {
  id: number
  from: string
  code: string
  dungeon: string
}
let stage7 = true // turns false once we learn the stage 7 SQL has not been run
export const hasStage7 = () => state === 'ready' && stage7
/** Invite a friend into the co-op dungeon you are hosting (room `code`). 'ok' or a reason. */
export async function inviteToDungeon(to: string, code: string, dungeon: string): Promise<string> {
  if (!hasStage7() || !supa) return 'Dungeon invites are not set up yet.'
  const { data, error } = await supa.rpc('island_dungeon_invite', { p_to: to, p_code: code, p_dungeon: dungeon })
  if (missing(error)) {
    stage7 = false
    return 'Dungeon invites are not set up yet.'
  }
  if (error) return 'Could not send the invite.'
  return String(data)
}
/** Invites to you from the last ten minutes. */
export async function dungeonInvites(): Promise<DungeonInvite[]> {
  if (!hasStage7() || !supa) return []
  const { data, error } = await supa.rpc('island_dungeon_invites')
  if (missing(error)) {
    stage7 = false
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: Number(r.id), from: String(r.sender_name ?? 'A friend').slice(0, 20), code: String(r.code), dungeon: String(r.dungeon) }))
}
/** Answered (joined or not now): it won't be offered again. */
export async function clearDungeonInvite(id: number) {
  if (!hasStage7() || !supa) return
  await supa.rpc('island_dungeon_invite_clear', { p_id: id })
}

// ---------- stage 8 (island_stage8.sql): trades and visit marks ----------
let stage8 = true // turns false once we learn the stage 8 SQL has not been run
export const hasStage8 = () => state === 'ready' && stage8
export interface TradeMon {
  dex: number
  level: number
  shiny?: boolean
}
export interface Trade {
  id: number
  other: string // the friend's name
  mine: boolean // you offered it
  state: 'offered' | 'accepted' | 'declined' | 'done' | 'returned'
  offered: TradeMon
  back: TradeMon | null
  expired: boolean
}
const asMon = (x: unknown): TradeMon | null => {
  const o = x as Record<string, unknown> | null
  return o && typeof o.dex === 'number' && typeof o.level === 'number' ? { dex: o.dex, level: o.level, shiny: o.shiny === true } : null
}
async function rpc8<T>(fn: string, args: Record<string, unknown>, fallback: T): Promise<T | { error: string }> {
  if (!hasStage8() || !supa) return fallback
  const { data, error } = await supa.rpc(fn, args)
  if (missing(error)) {
    stage8 = false
    return fallback
  }
  if (error) return { error: error.message }
  return data as T
}
/** Offer one of your Pokémon to a friend. 'ok' or a reason. */
export async function tradeOffer(to: string, mon: TradeMon): Promise<string> {
  if (!hasStage8()) return 'Trading is not set up yet.'
  const r = await rpc8<string>('island_trade_offer', { p_to: to, p_mon: mon }, 'Trading is not set up yet.')
  return typeof r === 'string' ? r : 'Could not send the offer.'
}
/** Offers to you, and yours that are waiting or ready to claim. */
export async function trades(): Promise<Trade[]> {
  const r = await rpc8<Record<string, unknown>[]>('island_trades', {}, [])
  if (!Array.isArray(r)) return []
  return r
    .map((t) => ({ id: Number(t.id), other: String(t.other_name ?? 'A friend').slice(0, 20), mine: !!t.mine, state: String(t.state) as Trade['state'], offered: asMon(t.sender_mon)!, back: asMon(t.recipient_mon), expired: !!t.expired }))
    .filter((t) => t.offered)
}
/** Accept an offer by sending one of yours: returns the Pokémon you receive, or null. */
export async function tradeAccept(id: number, mon: TradeMon): Promise<TradeMon | null> {
  const r = await rpc8<unknown>('island_trade_accept', { p_id: id, p_mon: mon }, null)
  return r && !(r as { error?: string }).error ? asMon(r) : null
}
/** Say no to an offer, or take back your own. */
export async function tradeDecline(id: number) {
  await rpc8('island_trade_decline', { p_id: id }, null)
}
/** Claim what a trade of yours brought back: the friend's Pokémon, or yours if declined or expired. */
export async function tradeClaim(id: number): Promise<{ kind: 'traded' | 'returned'; mon: TradeMon } | null> {
  const r = (await rpc8<Record<string, unknown> | null>('island_trade_claim', { p_id: id }, null)) as Record<string, unknown> | null
  if (!r || r.error) return null
  const mon = asMon(r.mon)
  return mon ? { kind: r.kind === 'traded' ? 'traded' : 'returned', mon } : null
}
/** Leave something on a friend's island: a food in the dish, your name on the signpost, a pet. */
export async function visitMark(to: string, kind: 'berry' | 'sign' | 'pet', payload: Record<string, unknown> = {}): Promise<string> {
  if (!hasStage8()) return 'This is not set up yet.'
  const r = await rpc8<string>('island_visit_mark', { p_to: to, p_kind: kind, p_payload: payload }, 'This is not set up yet.')
  return typeof r === 'string' ? r : 'Could not leave it.'
}
export interface VisitMark {
  id: number
  from: string
  kind: 'berry' | 'sign' | 'pet'
  payload: { food?: string; dex?: number }
}
/** What friends left on your island since you last looked; marks them seen. */
export async function takeVisitMarks(): Promise<VisitMark[]> {
  const r = await rpc8<Record<string, unknown>[]>('island_visit_marks', {}, [])
  if (!Array.isArray(r) || !r.length) return []
  const marks = r.map((m) => ({ id: Number(m.id), from: String(m.sender_name ?? 'A friend').slice(0, 20), kind: String(m.kind) as VisitMark['kind'], payload: (m.payload ?? {}) as VisitMark['payload'] }))
  await rpc8('island_visit_marks_seen', { p_ids: marks.map((m) => m.id) }, null)
  return marks
}
