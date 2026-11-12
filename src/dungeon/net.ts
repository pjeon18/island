// Co-op dungeons over WebRTC (Trystero): no server and no accounts; the room code
// is the whole handshake, so it works straight off GitHub Pages. The pattern is
// MISCHIEF's (assets/mischief/src/net/net.js), including its two gotchas:
//   1. onMessage / onPeerJoin / onPeerLeave are assignable properties, not methods.
//   2. send(data, { target }) takes the target INSIDE an options object; a bare id
//      is read as options and the message goes to everyone.
//
// The host runs the whole dungeon and sends snapshots; the guest moves its own
// lead locally (so it never lags) and sends its position and button presses.
import { joinRoom, selfId } from 'trystero'

const APP_ID = 'island-dungeon-pjeon18'
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no I, L, O, 0 or 1

export { selfId }
export const makeRoomCode = () => Array.from({ length: 4 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('')

export interface TeamMon {
  dex: number
  level: number
  name: string
  types: string[]
}
/** guest -> host: here is my team */
export interface Hello {
  name: string
  team: TeamMon[]
  v: string // the build: different builds would quietly generate different floors
  charged: boolean // the guest lit a Lantern charge, so chests open for them too
}
/** host -> guest: the run, and which actors are yours */
export interface Start {
  dungeon: string
  gate: string | null
  seed: number
  floor: number
  mine: number[] // actor ids the guest controls (its lead first)
}
/** guest -> host, about 20 times a second */
export interface Input {
  id: number // the guest's lead's actor id
  floor: number // inputs from an old floor are ignored
  x: number
  y: number
  dir: number
  moving: boolean
  acts: string[] // '1', '2', 'dash', 'q', 'e', 'tab'
}
/** host -> guest, about 15 times a second (compact; see play.ts snapshot()) */
export type Snap = Record<string, unknown>
/** host -> guest: things that happen once */
export interface Event {
  kind: 'floor' | 'chest' | 'end' | 'toast' | 'refuse' // refuse: text is 'full', 'version' or 'started'
  floor?: number
  big?: boolean
  win?: boolean
  text?: string
}

export function connectRoom(code: string) {
  const room = joinRoom({ appId: APP_ID }, code.toUpperCase())
  const ch = {
    hello: room.makeAction('hello'),
    start: room.makeAction('start'),
    input: room.makeAction('input'),
    snap: room.makeAction('snap'),
    event: room.makeAction('event'),
  }
  const send = (c: keyof typeof ch, data: unknown, target?: string) => {
    try {
      // the target must live inside the options object, or the message reaches everyone
      ;(ch[c] as { send: (d: unknown, o?: { target: string }) => Promise<void> }).send(data, target ? { target } : undefined)?.catch?.(() => {})
    } catch {
      /* a peer vanished mid-send */
    }
  }
  const on = <T>(c: keyof typeof ch, cb: (data: T, peer: string) => void) => {
    ;(ch[c] as { onMessage: unknown }).onMessage = (data: T, ctx: unknown) => cb(data, peerIdOf(ctx))
  }
  return {
    code: code.toUpperCase(),
    peers: () => Object.keys(room.getPeers()),
    leave: () => {
      try {
        void room.leave()
      } catch {
        /* already gone */
      }
    },
    sendHello: (h: Hello) => send('hello', h),
    sendStart: (s: Start, to?: string) => send('start', s, to),
    sendInput: (i: Input, to?: string) => send('input', i, to),
    sendSnap: (s: Snap) => send('snap', s),
    sendEvent: (e: Event, to?: string) => send('event', e, to),
    onHello: (cb: (h: Hello, peer: string) => void) => on('hello', cb),
    onStart: (cb: (s: Start, peer: string) => void) => on('start', cb),
    onInput: (cb: (i: Input, peer: string) => void) => on('input', cb),
    onSnap: (cb: (s: Snap, peer: string) => void) => on('snap', cb),
    onEvent: (cb: (e: Event, peer: string) => void) => on('event', cb),
    onPeerJoin: (cb: (peer: string) => void) => {
      room.onPeerJoin = (id) => cb(peerIdOf(id))
    },
    onPeerLeave: (cb: (peer: string) => void) => {
      room.onPeerLeave = (id) => cb(peerIdOf(id))
    },
  }
}
export type Net = ReturnType<typeof connectRoom>

/** Tolerate either shape, so a Trystero upgrade can't silently turn peer ids into objects. */
function peerIdOf(x: unknown): string {
  if (typeof x === 'string') return x
  if (x && typeof (x as { peerId?: unknown }).peerId === 'string') return (x as { peerId: string }).peerId
  return String(x ?? '')
}
