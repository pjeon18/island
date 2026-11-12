// The restoration story's landmarks (docs/CONTENT_PLAN.md, L1, 2026-11-12): Home Island's
// Pokémon Center hut, lighthouse and old pier, each painted ruined and restored. They use the
// decoration art shape (DecorArt), so the scene draws, lights and blocks them like decorations.
import { DecorArt } from './decor'
import { PAL, TUFT, onIsland } from './island'
import { Pix, RGB, bayer, hex } from './pixel'

/** Where each landmark stands on Home Island (ground points, through onIsland like every fixed spot). */
// (2026-11-12, Paul: the ruins sat on the island's rim and hung over the beach. They now stand
// on open grass: the hut on the north-west lawn, the lighthouse on the west lawn.)
export const LANDMARK_SPOTS: Record<string, { x: number; y: number }> = {
  hut: onIsland(81, 66),
  lighthouse: onIsland(55, 88),
  pier: onIsland(197, 117),
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

function lighthouse(restored: boolean, lit: boolean): DecorArt {
  const p = new Pix(16, 46)
  const red = hex('#d0464c')
  const white = hex('#f6f0e6')
  if (restored) {
    // a tapering tower in red and white bands, a dark lamp room, a stone base
    for (let y = 12; y < 42; y++) {
      const half = Math.round(3 + (y - 12) * 0.12)
      const band = Math.floor((y - 12) / 6) % 2 === 0 ? red : white
      for (let x = 8 - half; x < 8 + half; x++) p.set(x, y, x >= 8 + half - 1 ? (band === red ? hex('#a8343a') : hex('#d6ccbc')) : band)
    }
    rect(p, 4, 6, 8, 6, hex('#3a3a4a'))
    rect(p, 5, 7, 6, 4, lit ? hex('#ffe890') : hex('#9ab8c8'))
    rect(p, 3, 11, 10, 1, hex('#2a2a36'))
    for (let y = 2; y < 6; y++) rect(p, 8 - (y - 1), y, (y - 1) * 2, 1, red)
    p.set(8, 1, hex('#2a2a36'))
    for (let x = 2; x < 14; x++) {
      p.set(x, 42, PAL.stoneLight)
      p.set(x, 43, bayer(x, 43) > 0.5 ? PAL.stone : PAL.stoneDark)
    }
    outline(p, hex('#5a2a2a'))
    shade(p, 8, 44.5, 8, 1.5)
    return {
      img: p.toCanvas(),
      ax: 8,
      ay: 45,
      r: 6,
      glow: lit ? { x: 0, y: -36, r: 30, rgb: '255, 236, 160' } : undefined,
      live: lit
        ? (g, x, y, t, night) => {
            // the beam sweeps slowly; only after dusk, and soft
            if (night <= 0.05) return
            const k = Math.sin((t * Math.PI * 2) / 8)
            g.globalAlpha = 0.18 * night
            g.fillStyle = '#fff2b0'
            const len = Math.round(26 * Math.abs(k))
            if (k > 0) g.fillRect(x + 4, y - 37, len, 2)
            else g.fillRect(x - 4 - len, y - 37, len, 2)
            g.globalAlpha = 1
          }
        : undefined,
    }
  }
  // ruined: the bottom of the tower on its round stone footing, broken off in a jagged edge,
  // with a fallen red-and-white section and the dark lamp cage lying on the grass beside it
  const q = new Pix(26, 46)
  const tops = [33, 31, 30, 32, 29, 31, 33, 34]
  for (let i = 0; i < 8; i++)
    for (let y = tops[i]; y < 43; y++) {
      const band = Math.floor((y - 30) / 5) % 2 === 0 ? white : red
      q.set(9 + i, y, i === 7 ? (band === red ? hex('#a8343a') : hex('#d6ccbc')) : band)
    }
  // the round footing: a lit top face and a darker front
  for (let x = 6; x < 20; x++) {
    q.set(x, 43, PAL.stoneLight)
    q.set(x, 44, bayer(x, 44) > 0.5 ? PAL.stone : PAL.stoneDark)
  }
  // a fallen section of the tower, lying on its side
  for (let x = 19; x < 25; x++) for (let y = 41; y < 45; y++) q.set(x, y, Math.floor((x - 19) / 3) % 2 === 0 ? red : white)
  // the lamp cage: dark iron with a pale pane
  rect(q, 1, 40, 5, 4, hex('#3a3a4a'))
  rect(q, 2, 41, 3, 2, hex('#9ab8c8'))
  outline(q, hex('#5a4848'))
  blades(q, [[7, 45], [17, 45], [24, 45], [3, 44]])
  shade(q, 13, 45, 12, 1.5)
  return { img: q.toCanvas(), ax: 13, ay: 45, r: 7 }
}

function pier(restored: boolean): DecorArt {
  const p = new Pix(26, 14)
  if (restored) {
    // planks running out to sea, on posts
    for (let x = 0; x < 26; x++) rect(p, x, 3, 1, 6, (xx, y) => (y === 3 ? PAL.woodLight : xx % 4 === 0 ? PAL.woodGap : y === 8 ? PAL.woodDark : PAL.wood))
    for (const x of [3, 13, 23]) rect(p, x, 9, 2, 5, PAL.woodDark)
    outline(p, PAL.woodGap)
    return { img: p.toCanvas(), ax: 0, ay: 8, r: 0 }
  }
  // ruined: posts standing in the water, one loose plank
  for (const [x, h] of [[3, 5], [13, 7], [23, 4]] as const) rect(p, x, 13 - h, 2, h, PAL.woodDark)
  rect(p, 15, 9, 6, 1, PAL.wood)
  outline(p, PAL.woodGap)
  return { img: p.toCanvas(), ax: 0, ay: 8, r: 0 }
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
