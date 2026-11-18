// The restoration story's landmarks (docs/CONTENT_PLAN.md, L1, 2026-11-12): Home Island's
// Pokémon Center hut, lighthouse and old pier, each painted ruined and restored. They use the
// decoration art shape (DecorArt), so the scene draws, lights and blocks them like decorations.
import { DecorArt } from './decor'
import { ISLET, PAL, TUFT, onIsland } from './island'
import { Pix, RGB, bayer, hex } from './pixel'

/** Where each landmark stands on Home Island (ground points, through onIsland like every fixed spot). */
// (2026-11-12, Paul: the ruins sat on the island's rim and hung over the beach; 2026-11-18: the
// side buildings crowded the lawn. The hut is no longer drawn: it lives in Goals only. The
// lighthouse stands on a rock in the sea and the pier stays at the shore.)
/** Landmarks drawn on the island; the hut is a Goals entry with no art (2026-11-18). */
export const DRAWN_LANDMARKS = new Set(['lighthouse', 'pier'])
export const LANDMARK_SPOTS: Record<string, { x: number; y: number }> = {
  hut: onIsland(81, 66),
  lighthouse: { x: ISLET.x, y: ISLET.y + 1 }, // on its own rock in the sea (2026-11-18)
  pier: { x: 92, y: 147 }, // the cliff's foot on the south shore, west of the dock (2026-11-18)
}

const outline = (p: Pix, c: RGB) => {
  const pts: [number, number][] = []
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (!p.alpha(x, y) && (p.alpha(x - 1, y) || p.alpha(x + 1, y) || p.alpha(x, y - 1) || p.alpha(x, y + 1))) pts.push([x, y])
  for (const [x, y] of pts) p.set(x, y, c)
}
const rect = (p: Pix, x0: number, y0: number, w: number, h: number, c: RGB | ((x: number, y: number) => RGB)) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) p.set(x, y, typeof c === 'function' ? c(x, y) : c)
}

const wall = hex('#f4ecdc')
const wallShade = hex('#d8ccb4')
const roof = hex('#d8434c')
const roofDark = hex('#a8303a')
const roofLight = hex('#ee6a70')
const door = hex('#4a78b8')
const rubble = (x: number, y: number) => (bayer(x, y) > 0.5 ? PAL.stone : PAL.stoneDark)
/** A soft, dithered shadow on the grass under a landmark, so it sits in the ground. */
const shade = (p: Pix, cx: number, cy: number, rx: number, ry: number) => {
  const c = hex(TUFT.out)
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
      if (d < 1 && !p.alpha(x, y) && bayer(x, y) < 0.75 - d * 0.5) p.set(x, y, c, 110)
    }
}
/** A few blades of grass growing up through the ruin's edge. */
const blades = (p: Pix, pts: [number, number][]) => {
  for (const [x, y] of pts) {
    p.set(x, y, hex(TUFT.mid))
    p.set(x, y - 1, hex(TUFT.light))
  }
}
function hut(restored: boolean): DecorArt {
  const p = new Pix(30, 26)
  if (restored) {
    // walls, a red roof, a blue door and a round window
    rect(p, 3, 12, 24, 13, (x) => (x > 22 ? wallShade : wall))
    for (let y = 2; y < 13; y++) {
      const half = Math.round(4 + (y - 2) * 1.2)
      for (let x = 15 - half; x < 15 + half; x++) p.set(x, y, y < 4 ? roofLight : x > 15 + half - 3 ? roofDark : roof)
    }
    rect(p, 1, 12, 28, 1, roofDark)
    rect(p, 12, 17, 6, 8, door)
    rect(p, 13, 18, 4, 1, hex('#7aa4d8'))
    rect(p, 5, 15, 4, 4, hex('#8fc8e8'))
    rect(p, 21, 15, 4, 4, hex('#8fc8e8'))
    // the white plate over the door
    rect(p, 13, 13, 4, 3, hex('#ffffff'))
    p.set(15, 14, roof)
    outline(p, hex('#7a2a24'))
    shade(p, 15, 25, 14, 1)
    return { img: p.toCanvas(), ax: 15, ay: 25, r: 11, glow: { x: 0, y: -8, r: 22, rgb: '255, 210, 160' } }
  }
  // ruined: the hut's back wall stands to about knee height with its doorway, the red roof lies
  // in pieces in front, and the round Poké Ball sign leans against the step
  const tops = [5, 7, 8, 6, 7, 9, 0, 0, 0, 0, 0, 8, 6, 5, 7, 4, 6, 5, 3, 4]
  tops.forEach((h, i) => {
    if (!h) return
    rect(p, 5 + i, 19 - h, 1, h, (x, y) => (x > 21 ? wallShade : bayer(x, y) > 0.8 ? wallShade : wall))
  })
  rect(p, 11, 13, 4, 6, hex('#4a3a2e')) // the empty doorway
  // the floor's stone edge in front
  for (let x = 4; x < 26; x++) p.set(x, 19, bayer(x, 19) > 0.4 ? PAL.stone : PAL.stoneDark)
  // fallen roof: two red slabs, lit on top
  rect(p, 16, 17, 9, 3, (x, y) => (y === 17 ? roofLight : x > 22 ? roofDark : roof))
  rect(p, 3, 18, 6, 2, (x, y) => (y === 18 ? roofLight : roof))
  // the Poké Ball sign: red top, white bottom, a dark band and a white button
  const ball = hex('#e04848')
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 6; x++) {
      const d = (x - 2.5) ** 2 + (y - 2.5) ** 2
      if (d > 8.5) continue
      p.set(10 + x, 15 + y, y < 2 ? ball : y === 2 || y === 3 ? (x === 2 || x === 3 ? hex('#ffffff') : hex('#3a2a2a')) : hex('#f4f0e8'))
    }
  outline(p, hex('#6a5a4c'))
  blades(p, [[4, 20], [14, 20], [21, 20], [26, 19]])
  shade(p, 15, 20.5, 14, 3)
  return { img: p.toCanvas(), ax: 15, ay: 20, r: 10 }
}

/**
 * The lighthouse (2026-11-18, Paul: the old one was "small in scale", "awkward" and "a little toy").
 * At the island's scale a Pokémon is 20 to 30 px, so the tower stands about 54 px: a tapering
 * tower in broad red and white bands, lit from the left, with a door and two small windows, a
 * dark iron gallery, a glass lamp room with mullions, and a red domed cap. The ruin keeps the
 * whole tower but has lost its lamp room: the top is broken off at the gallery, with a bent
 * rail, dark gaps in the brickwork and rubble at the foot, so it still reads as a lighthouse.
 */
function lighthouse(restored: boolean, lit: boolean): DecorArt {
  const W = 24
  const H = 58
  const p = new Pix(W, H)
  const cx = 12
  const red = hex('#d84a4e')
  const redLit = hex('#ee7470')
  const redShade = hex('#a8343a')
  const white = hex('#f6f0e6')
  const whiteLit = hex('#ffffff')
  const whiteShade = hex('#d2c8b8')
  const iron = hex('#3a3c4a')
  const ironLit = hex('#5c6070')
  const base = 55 // the foot of the tower
  const top = 19 // where the tower meets the gallery
  const halfAt = (y: number) => 4 + ((y - top) / (base - top)) * 3.5 // 8 px wide at the top, 15 at the foot
  // the tower: four bands, each lit on the left and shaded on the right
  for (let y = top; y <= base; y++) {
    const half = halfAt(y)
    const band = Math.floor((y - top) / 9) % 2 === 0 ? 'r' : 'w'
    for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half - 0.01); x++) {
      const u = (x - (cx - half)) / (half * 2) // 0 at the left edge, 1 at the right
      const c = band === 'r' ? (u < 0.22 ? redLit : u > 0.72 ? redShade : red) : u < 0.22 ? whiteLit : u > 0.72 ? whiteShade : white
      p.set(x, y, c)
    }
  }
  // the door at the foot and two small windows up the tower
  rect(p, cx - 2, base - 6, 4, 6, hex('#5a3a2a'))
  rect(p, cx - 1, base - 7, 2, 1, hex('#5a3a2a'))
  rect(p, cx - 1, base - 5, 2, 1, hex('#7a5038'))
  for (const wy of [41, 28]) rect(p, cx - 1, wy, 2, 3, hex('#3a4a5e')), p.set(cx - 1, wy, hex('#7ea0c0'))
  // a stone footing under it
  for (let x = cx - 9; x <= cx + 9; x++) {
    p.set(x, base + 1, x < cx - 3 ? PAL.stoneLight : PAL.stone)
    p.set(x, base + 2, PAL.stoneDark)
  }
  if (restored) {
    // the gallery: a dark ledge wider than the tower, with a railing
    rect(p, cx - 7, top - 1, 14, 2, iron)
    rect(p, cx - 7, top - 1, 14, 1, ironLit)
    for (let x = cx - 7; x <= cx + 6; x += 2) p.set(x, top - 3, iron), p.set(x, top - 2, iron)
    rect(p, cx - 7, top - 4, 14, 1, iron)
    // the lamp room: glass between iron mullions, warm when the Generator keeps it lit
    const glass = lit ? hex('#ffe68a') : hex('#a8cce0')
    const glassLit = lit ? hex('#fff6c8') : hex('#d8eef8')
    rect(p, cx - 4, 8, 8, 8, glass)
    rect(p, cx - 3, 9, 2, 6, glassLit)
    for (const mx of [cx - 4, cx - 1, cx + 2]) rect(p, mx, 8, 1, 8, iron)
    rect(p, cx + 3, 8, 1, 8, iron)
    rect(p, cx - 5, 15, 10, 1, iron)
    // the cap: a red dome with a vent and a little ball on top
    rect(p, cx - 5, 7, 10, 1, redShade)
    for (let y = 3; y < 7; y++) {
      const half = [2, 3, 4, 5][y - 3]
      for (let x = cx - half; x < cx + half; x++) p.set(x, y, x < cx - half + 2 ? redLit : x >= cx + half - 2 ? redShade : red)
    }
    rect(p, cx - 1, 1, 2, 2, iron)
    p.set(cx - 1, 0, ironLit)
  } else {
    // the ruin: the tower ends in a jagged break where the gallery was, with dark gaps and a bent rail
    const jag = [3, 1, 0, 2, 4, 2, 1, 3, 5, 3, 2, 4, 1, 3, 2]
    for (let x = 0; x < W; x++)
      for (let y = top; y <= top + 6; y++) if (p.alpha(x, y) && y < top + (jag[(x + 3) % jag.length] ?? 0)) p.set(x, y, [0, 0, 0], 0)
    for (const [x, y] of [[cx - 2, top + 4], [cx + 1, top + 6], [cx + 3, 33], [cx - 3, 37], [cx + 2, 46]] as [number, number][]) p.set(x, y, hex('#5a3a34'))
    // a bent piece of railing sticking up from the break
    for (let k = 0; k < 6; k++) p.set(cx + 3 + (k >> 1), top + 2 - k, iron)
    // rubble and a fallen pane of the lamp room at the foot
    for (const [x, y, c] of [[cx - 9, base, PAL.stoneDark], [cx - 8, base, PAL.stone], [cx + 8, base, PAL.stone], [cx + 9, base - 1, PAL.stoneLight], [cx + 6, base, redShade], [cx - 6, base, hex('#a8cce0')]] as [number, number, RGB][])
      p.set(x, y, c)
  }
  outline(p, hex('#5a2a2a'))
  const glowY = -(base - 11)
  return {
    img: p.toCanvas(),
    ax: cx,
    ay: base + 2,
    r: 7,
    glow: restored && lit ? { x: 0, y: glowY, r: 34, rgb: '255, 236, 160' } : undefined,
    live:
      restored && lit
        ? (g, x, y, t, night) => {
            // the beam sweeps slowly; only after dusk, and soft
            if (night <= 0.05) return
            const k = Math.sin((t * Math.PI * 2) / 8)
            g.globalAlpha = 0.2 * night
            g.fillStyle = '#fff2b0'
            const len = Math.round(40 * Math.abs(k))
            const by = y + glowY
            if (k > 0) g.fillRect(x + 5, by - 1, len, 3)
            else g.fillRect(x - 5 - len, by - 1, len, 3)
            g.globalAlpha = 1
          }
        : undefined,
  }
}

/**
 * The old pier, beside the new one on the south shore (2026-11-18: it moved here so the
 * lighthouse could have the south-east sea). It runs out from the cliff's foot, straight south.
 * Ruined, only its posts stand in the water, with the first plank still on and one floating loose.
 */
function pier(restored: boolean): DecorArt {
  const W = 12
  const H = 26
  const p = new Pix(W, H)
  const post = (x: number, y0: number, h: number) => {
    rect(p, x, y0, 2, h, PAL.woodDark)
    p.set(x, y0, PAL.wood)
    p.set(x - 1, y0 + h, PAL.foam)
    p.set(x, y0 + h, PAL.foam)
    p.set(x + 1, y0 + h, PAL.foam)
    p.set(x + 2, y0 + h, PAL.shallow2)
  }
  if (restored) {
    // the deck: planks across, a lit front edge every third row, dark sides, posts at the end
    for (let y = 0; y < 21; y++)
      for (let x = 1; x < W - 1; x++) {
        const r = y % 3
        p.set(x, y, x === 1 || x === W - 2 ? PAL.woodDark : r === 0 ? PAL.woodLight : r === 1 ? PAL.wood : PAL.woodDark)
      }
    rect(p, 1, 21, W - 2, 1, PAL.woodGap)
    post(1, 22, 3)
    post(W - 3, 22, 3)
    outline(p, PAL.woodGap)
    return { img: p.toCanvas(), ax: W >> 1, ay: 0, r: 0 }
  }
  // the first plank, then posts in pairs going out, and a loose plank adrift
  for (let x = 1; x < W - 1; x++) p.set(x, 0, PAL.woodLight), p.set(x, 1, PAL.wood), p.set(x, 2, PAL.woodDark)
  post(1, 6, 4)
  post(W - 3, 7, 3)
  post(1, 15, 3)
  post(W - 3, 17, 4)
  rect(p, 4, 12, 5, 1, PAL.woodLight)
  rect(p, 4, 13, 5, 1, PAL.woodDark)
  outline(p, PAL.woodGap)
  return { img: p.toCanvas(), ax: W >> 1, ay: 0, r: 0 }
}

const cache = new Map<string, DecorArt>()
export function landmarkArt(id: string, restored: boolean, lit = false): DecorArt {
  const key = `${id}:${restored}:${lit}`
  let a = cache.get(key)
  if (!a) {
    a = id === 'hut' ? hut(restored) : id === 'lighthouse' ? lighthouse(restored, lit) : pier(restored)
    cache.set(key, a)
  }
  return a
}

/** Ember Cove's crater (L2), on the island's north-east shoulder: a dark cone that glows and smokes. */
export const CRATER_SPOT = onIsland(184, 68)
export function craterArt(): DecorArt {
  const key = 'crater'
  const have = cache.get(key)
  if (have) return have
  const p = new Pix(34, 22)
  for (let y = 4; y < 22; y++) {
    const half = Math.round(6 + (y - 4) * 0.62)
    for (let x = 17 - half; x < 17 + half; x++) p.set(x, y, x < 17 - half + 2 ? hex('#6a5248') : x > 17 + half - 4 ? hex('#3e302a') : bayer(x, y) > 0.7 ? hex('#5a463e') : hex('#4c3a33'))
  }
  // the glowing mouth
  for (let x = 12; x < 22; x++) p.set(x, 4, x > 13 && x < 20 ? hex('#ff9a3c') : hex('#c8502a'))
  for (let x = 13; x < 21; x++) p.set(x, 5, hex('#a83c22'))
  // a lava seam down the near side
  for (let y = 7; y < 15; y++) p.set(18 + ((y * 3) % 2), y, hex('#d8622c'))
  outline(p, hex('#2a1e1a'))
  const a: DecorArt = {
    img: p.toCanvas(),
    ax: 17,
    ay: 21,
    r: 10,
    glow: { x: 0, y: -17, r: 34, rgb: '255, 140, 60' },
    live: (g, x, y, t) => {
      // smoke rising slowly from the mouth, three puffs on their own clocks
      for (let i = 0; i < 3; i++) {
        const k = (t / 6 + i / 3) % 1
        g.globalAlpha = 0.3 * (1 - k)
        g.fillStyle = '#9a8e88'
        const s = 2 + Math.round(k * 3)
        g.fillRect(Math.round(x - 2 + Math.sin(t / 2 + i) * 3 + k * 6), Math.round(y - 19 - k * 22), s, s)
      }
      g.globalAlpha = 1
    },
  }
  cache.set(key, a)
  return a
}
