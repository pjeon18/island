// The restoration story's landmarks (docs/CONTENT_PLAN.md, L1, 2026-11-12): Home Island's
// Pokémon Center hut, lighthouse and old pier, each painted ruined and restored. They use the
// decoration art shape (DecorArt), so the scene draws, lights and blocks them like decorations.
import { DecorArt } from './decor'
import { PAL, onIsland } from './island'
import { Pix, RGB, bayer, hex } from './pixel'

/** Where each landmark stands on Home Island (ground points, through onIsland like every fixed spot). */
export const LANDMARK_SPOTS: Record<string, { x: number; y: number }> = {
  hut: onIsland(80, 58),
  lighthouse: onIsland(53, 73),
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
    return { img: p.toCanvas(), ax: 15, ay: 25, r: 11, glow: { x: 0, y: -8, r: 22, rgb: '255, 210, 160' } }
  }
  // ruined: broken walls, no roof, a plank or two
  const tops = [6, 5, 8, 9, 7, 10, 12, 11, 9, 8, 10, 7, 6, 8, 9, 12, 13, 11, 10, 9, 7, 8, 10, 11]
  for (let i = 0; i < 24; i++) rect(p, 3 + i, 25 - tops[i], 1, tops[i], (x, y) => (bayer(x, y) > 0.75 ? wallShade : wall))
  rect(p, 12, 19, 6, 6, hex('#5a4a3a'))
  rect(p, 0, 23, 30, 3, rubble)
  rect(p, 18, 21, 9, 1, PAL.woodDark)
  rect(p, 4, 22, 7, 1, PAL.wood)
  outline(p, hex('#6a6058'))
  return { img: p.toCanvas(), ax: 15, ay: 25, r: 10 }
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
    rect(p, 2, 42, 12, 4, rubble)
    outline(p, hex('#5a2a2a'))
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
  // ruined: a broken stump of the tower and its fallen stones
  for (let y = 30; y < 42; y++) {
    const half = Math.round(3 + (y - 12) * 0.12)
    const top = 30 + ((y * 7) % 3)
    if (y < top) continue
    for (let x = 8 - half; x < 8 + half; x++) if (y > 31 || bayer(x, y) > 0.4) p.set(x, y, Math.floor((y - 12) / 6) % 2 === 0 ? red : white)
  }
  rect(p, 0, 42, 16, 4, rubble)
  p.set(13, 40, PAL.stone)
  p.set(2, 41, PAL.stoneLight)
  outline(p, hex('#5a4848'))
  return { img: p.toCanvas(), ax: 8, ay: 45, r: 6 }
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
