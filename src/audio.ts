// Sound effects and the island music (2026-11-12). One AudioContext, started by the first press
// or key (browsers refuse sound before that). Sounds come from one sprite (sfx.m4a); the music
// loops sample-exactly between MUSIC_LOOP's points. Sounds: Case Portman Audio. Music: Mayra (mayragandra). Both obey the
// Settings toggles and the master volume, and nothing here plays on its own during focus: only sounds you cause, a
// session ending and the "Still studying?" question.
import { MUSIC_LOOP, SPRITE, SPRITE_ONSET, type SfxName } from './audio-sprite'

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
let musicBuf: AudioBuffer | null = null
let shift = 0 // the encoder's delay, measured on the decoded sprite
let sfxOut: GainNode
let musicOut: GainNode
let musicSrc: AudioBufferSourceNode | null = null
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
  if (musicSrc) return
  const start = (b: AudioBuffer) => {
    if (musicSrc || !ctx) return
    musicSrc = ctx.createBufferSource()
    musicSrc.buffer = b
    musicSrc.loop = true
    musicSrc.loopStart = MUSIC_LOOP.start
    musicSrc.loopEnd = MUSIC_LOOP.end
    musicSrc.connect(musicOut)
    musicSrc.start(0, MUSIC_LOOP.start)
  }
  if (musicBuf) start(musicBuf)
  else
    void load('overworld.m4a').then((b) => {
      musicBuf = b
      if (b && wantMusic && musicOn()) start(b)
    })
}
/** For checks in dev: what the audio is doing. */
export function audioState() {
  return { ctx: ctx?.state ?? 'none', sfx: !!sfxBuf, shift: +shift.toFixed(4), music: !!musicSrc, level: musicOut ? +musicOut.gain.value.toFixed(3) : 0 }
}
