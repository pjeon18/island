// Sound effects and the music (2026-11-12). One AudioContext, started by the first press or key
// (browsers refuse sound before that). Sounds come from one sprite (sfx.m4a); each music track
// loops sample-exactly between its loop points. Sounds: Case Portman Audio. Music: Mayra
// (mayragandra) by day; FSM Team (free-stock-music.com) at night and in the dungeon (2026-11-19).
// All obey the Settings toggles and the master volume, and nothing here plays on its own during
// focus: only sounds you cause, a session ending and the "Still studying?" question.
import { MUSIC_LOOP, SPRITE, SPRITE_ONSET, type SfxName } from './audio-sprite'
import { LOOPS } from './music-loops'

export type { SfxName }
const BASE = import.meta.env.BASE_URL

// each sound's level, by ear from the pack's measured loudness (the UI ones sit well under the music)
const GAIN: Partial<Record<SfxName, number>> = {
  click: 0.28,
  tab: 0.3,
  open: 0.45,
  close: 0.4,
  blip: 0.5,
  speak: 0.45,
  coin: 0.6,
  buy: 0.55,
  confirm: 0.65,
  cancel: 0.45,
  success: 0.5,
  unlock: 0.6,
  start: 0.45,
  pause: 0.45,
  warn: 0.55,
  give: 0.55,
  fail: 0.4,
}
const MUSIC_LEVEL = 0.32
const MUSIC_FADE = 3 // seconds to fade the music in or out

let ctx: AudioContext | null = null
let sfxBuf: AudioBuffer | null = null
/** The music tracks. One plays at a time; changing track crossfades over MUSIC_FADE. */
export type Track = 'day' | 'night' | 'dungeon'
const TRACKS: Record<Track, { file: string; loop: { start: number; end: number } }> = {
  day: { file: 'overworld.m4a', loop: MUSIC_LOOP },
  night: { file: 'night.m4a', loop: LOOPS.night },
  dungeon: { file: 'dungeon.m4a', loop: LOOPS.dungeon },
}
const musicBufs: Partial<Record<Track, Promise<AudioBuffer | null>>> = {}
let track: Track = 'day'
let playing: { track: Track; src: AudioBufferSourceNode; gain: GainNode } | null = null
let shift = 0 // the encoder's delay, measured on the decoded sprite
let sfxOut: GainNode
let musicOut: GainNode
let sfxOn = () => true
let musicOn = () => false
let volume = () => 1 // the master volume setting, 0 to 1
let master: GainNode
let wantMusic = false
const last = new Map<SfxName, number>()

function context() {
  if (ctx) return ctx
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = volume()
  master.connect(ctx.destination)
  sfxOut = ctx.createGain()
  sfxOut.connect(master)
  musicOut = ctx.createGain()
  musicOut.gain.value = 0
  musicOut.connect(master)
  return ctx
}
async function load(file: string) {
  const c = context()
  if (!c) return null
  try {
    const res = await fetch(`${BASE}audio/${file}?v=${__BUILD__}`)
    return await c.decodeAudioData(await res.arrayBuffer())
  } catch {
    return null
  }
}
/** Where the decoded sprite's first sound actually starts, against where it was written. */
function measureShift(b: AudioBuffer) {
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 600 / 32768) return i / b.sampleRate - SPRITE_ONSET
  return 0
}

/**
 * Set up sound for this page. `sounds` and `music` say whether each is switched on right now.
 * Sound starts on the first press or key anywhere on the page (or in the small window).
 */
let unlock = () => {}
export function initAudio(opts: { sounds: () => boolean; music?: () => boolean; volume?: () => number }) {
  sfxOn = opts.sounds
  musicOn = opts.music ?? (() => false)
  volume = opts.volume ?? (() => 1)
  unlock = () => {
    const c = context()
    if (!c) return
    if (c.state === 'suspended') void c.resume()
    if (!sfxBuf)
      void load('sfx.m4a').then((b) => {
        sfxBuf = b
        if (b) shift = Math.max(-0.2, Math.min(0.2, measureShift(b)))
      })
    syncMusic()
  }
  listenIn(document)
}
/** Listen for the first press in another document too (the small window). */
export function listenIn(doc: Document) {
  doc.addEventListener('pointerdown', () => unlock(), { capture: true })
  doc.addEventListener('keydown', () => unlock(), { capture: true })
}

/** Play a sound now (if sounds are on). A sound already played in the last 60 ms is skipped. */
export function sfx(name: SfxName, gain = 1) {
  pendingClick = 0
  if (!sfxOn() || !ctx || !sfxBuf || ctx.state !== 'running') return
  applyVolume() // another window may have changed it
  const now = performance.now()
  if (now - (last.get(name) ?? 0) < 60) return
  last.set(name, now)
  const [at, len] = SPRITE[name]
  const src = ctx.createBufferSource()
  src.buffer = sfxBuf
  const g = ctx.createGain()
  g.gain.value = (GAIN[name] ?? 0.5) * gain
  src.connect(g).connect(sfxOut)
  src.start(0, Math.max(0, at + shift), len + 0.02)
}
let pendingClick = 0
/**
 * A plain button's click: it waits for the rest of this press, and any other sound played in the
 * meantime (a purchase, a menu opening) replaces it, so a press never makes two sounds.
 */
export function click() {
  const id = ++clickSeq
  pendingClick = id
  setTimeout(() => {
    if (pendingClick === id) sfx('click')
  }, 0)
}
let clickSeq = 0

/** Follow the master volume setting (a short ramp, so a change never clicks). */
export function applyVolume() {
  if (!ctx || !master) return
  const v = Math.max(0, Math.min(1, volume()))
  if (Math.abs(master.gain.value - v) < 0.001) return
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.05)
}
/** Start or stop the music to match the setting (and whether this page wants it). */
export function wantsMusic(on: boolean) {
  if (on === wantMusic) return
  wantMusic = on
  syncMusic()
}
/** Pick the track: night or day on the island, the dungeon's own in the dungeon. */
export function musicTrack(t: Track) {
  if (t === track) return
  track = t
  syncMusic()
}
export function syncMusic() {
  const c = ctx
  if (!c || c.state === 'closed') return
  const on = wantMusic && musicOn()
  const t = c.currentTime
  musicOut.gain.cancelScheduledValues(t)
  musicOut.gain.setValueAtTime(musicOut.gain.value, t)
  if (!on) {
    musicOut.gain.linearRampToValueAtTime(0, t + MUSIC_FADE / 2)
    return
  }
  musicOut.gain.linearRampToValueAtTime(MUSIC_LEVEL, t + MUSIC_FADE)
  if (playing?.track === track) return
  // the old track fades out while the new one fades in
  if (playing) {
    const old = playing
    playing = null
    old.gain.gain.cancelScheduledValues(t)
    old.gain.gain.setValueAtTime(old.gain.gain.value, t)
    old.gain.gain.linearRampToValueAtTime(0, t + MUSIC_FADE)
    old.src.stop(t + MUSIC_FADE + 0.05)
  }
  const want = track
  musicBufs[want] ??= load(TRACKS[want].file)
  void musicBufs[want]!.then((b) => {
    if (!b || !ctx || playing || track !== want) return
    const { start, end } = TRACKS[want].loop
    const src = ctx.createBufferSource()
    src.buffer = b
    src.loop = true
    src.loopStart = start
    src.loopEnd = end
    const gain = ctx.createGain()
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + MUSIC_FADE)
    src.connect(gain).connect(musicOut)
    src.start(0, start)
    playing = { track: want, src, gain }
  })
}

// ---------- hit sounds (2026-11-19, Paul: "very minimal and quiet") ----------
// A short soft knock made here, not a file: a sine thump falling in pitch under a breath of
// low-passed noise, about 80 ms. Three takes, picked at random and pitched a few percent either
// way, so a run of hits never sounds like one sample repeating.
let hits: AudioBuffer[] = []
let lastHit = 0
function makeHits(c: BaseAudioContext) {
  return ([[260, 110, 0.32, 0.08], [300, 130, 0.36, 0.07], [230, 95, 0.3, 0.09]] as const).map(([f0, f1, noise, len]) => {
    const n = Math.round(c.sampleRate * len)
    const b = c.createBuffer(1, n, c.sampleRate)
    const d = b.getChannelData(0)
    let phase = 0
    let lp = 0
    for (let i = 0; i < n; i++) {
      const t = i / c.sampleRate
      phase += (2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t * 45))) / c.sampleRate
      const attack = Math.min(1, t / 0.0015)
      const tail = Math.min(1, (len - t) / 0.01) // no click at the end
      lp += (Math.random() * 2 - 1 - lp) * 0.18
      d[i] = (Math.sin(phase) * Math.exp(-t * 40) + lp * noise * Math.exp(-t * 110)) * attack * tail
    }
    return b
  })
}
/**
 * A landed hit. `level` is 1 for the Pokémon you steer, lower for followers; `heavy` for a
 * strong move or a super-effective one (a little lower and fuller). Hits closer than 45 ms
 * together make one sound, so a burst through a crowd is a single knock.
 */
export function hitSound(level = 1, heavy = false) {
  if (!sfxOn() || !ctx || ctx.state !== 'running') return
  const now = performance.now()
  if (now - lastHit < 45) return
  lastHit = now
  if (!hits.length) hits = makeHits(ctx)
  applyVolume()
  const src = ctx.createBufferSource()
  src.buffer = hits[Math.floor(Math.random() * hits.length)]
  src.playbackRate.value = (heavy ? 0.82 : 1) * (0.94 + Math.random() * 0.12)
  const g = ctx.createGain()
  g.gain.value = HIT_GAIN * level * (heavy ? 1.35 : 1)
  src.connect(g).connect(sfxOut)
  src.start()
}
// about the dialogue blip's level for your own hits, half that for a follower's (measured
// against the sprite's sounds, 2026-11-19)
const HIT_GAIN = 0.1

/** For checks in dev: what the audio is doing. */
export function audioState() {
  return { ctx: ctx?.state ?? 'none', sfx: !!sfxBuf, shift: +shift.toFixed(4), track: playing?.track ?? null, want: track, level: musicOut ? +musicOut.gain.value.toFixed(3) : 0 }
}
