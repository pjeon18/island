// The island: painted once, pixel by pixel, into a static base layer, plus a
// handful of props (tree, bush, lantern) that are y-sorted with the Pokémon.
//
// Logical resolution is 240×180, drawn at an integer scale. The view is a
// gentle 3/4 top-down, like the PMD overworld: you see the grassy top and a
// short cliff face on the south side.
import { Pix, RGB, bayer, distanceField, hash2, hex, noise } from './pixel'

export const W = 240
export const H = 180
const CLIFF = 7

export const PAL = {
  deep: hex('#3f86bf'),
  abyss: hex('#2b659e'), // the open sea past the island's water: darker, so it reads as out of reach
  sea: hex('#4c98cd'),
  seaRipple: hex('#58a3d4'),
  shallow: hex('#67b6da'),
  shallow2: hex('#80c8e2'),
  foam: hex('#e6f6fb'),
  sandLight: hex('#f5e2ad'),
  sand: hex('#ead09a'),
  sandDark: hex('#d4b47a'),
  cliffTop: hex('#d9ae73'),
  earth: hex('#b88350'),
  earthDark: hex('#9a6a3f'),
  earthWet: hex('#6f4b2e'),
  grassLight: hex('#a3d867'),
  grass: hex('#7fc457'),
  grassDark: hex('#5fa844'),
  grassDeep: hex('#478f3a'),
  leaf: hex('#3c8a3e'),
  leafMid: hex('#55a548'),
  leafLight: hex('#80c75d'),
  leafDeep: hex('#2b6a33'),
  trunk: hex('#8c5a35'),
  trunkDark: hex('#62401f'),
  berry: hex('#e2525c'),
  berryLight: hex('#ff9aa0'),
  wood: hex('#c79058'),
  woodLight: hex('#dcaa72'),
  woodDark: hex('#94643a'),
  woodGap: hex('#6a4527'),
  flowerA: hex('#fff7ea'),
  flowerB: hex('#ffc0cf'),
  flowerC: hex('#ffe27a'),
  stone: hex('#a9a6a0'),
  stoneLight: hex('#cfccc4'),
  stoneDark: hex('#7c7974'),
}

// Paul wanted the island and the sea more saturated (2026-11-11): boost every
// palette colour's HSL saturation, the water more than the land.
function saturate([r, g, b]: RGB, k: number): RGB {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [r * 255, g * 255, b * 255]
  const d = max - min
  let s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h /= 6
  s = Math.min(1, s * k)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, pp = 2 * l - q
  const f = (t: number) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp
  }
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)]
}
const WATER = new Set(['deep', 'sea', 'seaRipple', 'shallow', 'shallow2'])
for (const k of Object.keys(PAL) as (keyof typeof PAL)[]) PAL[k] = saturate(PAL[k], WATER.has(k) ? 1.4 : 1.25)
/** Tall grass colours (scene.ts drawTuft); Frost Isle frosts them. */
export const TUFT = { out: '#24602c', dark: '#3b8735', mid: '#4fa13f', light: '#8ad35c' }

/**
 * Frost Isle: the same shape under snow. Called before the scene is built, so
 * the island, props and decorations all paint with these colours.
 */
export function useIsland(id: string) {
  if (id !== 'frost') return
  const F: Partial<Record<keyof typeof PAL, string>> = {
    deep: '#2a6fae', abyss: '#1c5088', sea: '#3580c2', seaRipple: '#438dca', shallow: '#68b4dc', shallow2: '#a6daf0', foam: '#f4fbff',
    sandLight: '#eef3f8', sand: '#dbe4ee', sandDark: '#bfcbd9', cliffTop: '#b9c7d6', earth: '#8a9bb0', earthDark: '#6a7b92', earthWet: '#4b5a71',
    grassLight: '#f7fbfe', grass: '#e6eff7', grassDark: '#cbdcea', grassDeep: '#aac3d9',
    leaf: '#2d6a5a', leafMid: '#3d816f', leafLight: '#e8f2f7', leafDeep: '#1d4a3f', trunk: '#6e4e38', trunkDark: '#4c3424',
  }
  for (const [k, v] of Object.entries(F)) PAL[k as keyof typeof PAL] = hex(v!)
  Object.assign(TUFT, { out: '#6d8aa6', dark: '#a9c2d8', mid: '#c9dbea', light: '#f4f9fd' })
}

/** The open-sea colour, for the page behind the canvas. */
export const seaCss = () => `rgb(${PAL.abyss.join(',')})`

// ---------- shape ----------
const LOBES: [number, number, number, number][] = [
  [120, 90, 76, 42],
  [80, 100, 36, 24],
  [164, 97, 36, 26],
  [126, 71, 44, 23],
]

function inTop(x: number, y: number) {
  const wob = (noise(x / 11, y / 11, 3) - 0.5) * 0.22 + (noise(x / 4, y / 4, 9) - 0.5) * 0.06
  for (const [cx, cy, rx, ry] of LOBES) {
    const dx = (x - cx) / rx
    const dy = (y - cy) / ry
    if (dx * dx + dy * dy < 1 + wob) return true
  }
  return false
}

export interface IslandLayout {
  base: HTMLCanvasElement
  floatBase: HTMLCanvasElement // the island on a transparent background, with a small lagoon ring
  top: Uint8Array // 1 = grassy top surface
  edge: Int32Array // distance to the top's edge
  footprint: Uint8Array // top ∪ cliff, for the shoreline foam
  grassPatch: { x: number; y: number; r: number }
  tree: { x: number; y: number }
  bush: { x: number; y: number }
  dock: { x: number; y0: number; y1: number; w: number }
  lantern: { x: number; y: number }
  walkable: (x: number, y: number) => boolean
  blockers: { x: number; y: number; r: number }[] // decorations, kept clear
  shoreline: { x: number; y: number }[] // foam pixels, just outside the footprint
}

export function buildIsland(): IslandLayout {
  const top = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) top[y * W + x] = inTop(x, y) ? 1 : 0
  const edge = distanceField(top, W, H)
  const T = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && top[y * W + x] === 1

  // cliff depth below the top: 0 = not cliff, k = k px under the lip
  const cliff = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (T(x, y)) continue
      for (let k = 1; k <= CLIFF; k++)
        if (T(x, y - k)) {
          cliff[y * W + x] = k
          break
        }
    }
  const footprint = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) footprint[i] = top[i] || cliff[i] ? 1 : 0
  const fpOut = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) fpOut[i] = footprint[i] ? 0 : 1
  const seaDist = distanceField(fpOut, W, H) // distance from the shore, out at sea

  // props (ground points)
  const tree = { x: 158, y: 74 }
  const bush = { x: 184, y: 104 }
  const grassPatch = { x: 76, y: 96, r: 15 }
  const dockX = 114
  const DW = 20 // Paul asked for a bigger, wider pier (2026-11-11)
  let lip = 0
  for (let y = H - 1; y >= 0; y--)
    if (T(dockX, y) && T(dockX + DW - 1, y)) {
      lip = y
      break
    }
  // steps cut into the cliff, then a pier on the water
  const dock = { x: dockX, y0: lip - 2, y1: lip + 34, w: DW }
  const lantern = { x: dockX + DW - 2, y: dock.y1 + 1 }

  const p = new Pix(W, H)

  // ---------- water ----------
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (footprint[y * W + x]) continue
      const d = seaDist[y * W + x]
      // the island's water deepens in a soft ring, then gives way to the darker open sea,
      // which meets the window's edge in exactly the page's colour (no visible frame)
      const r = Math.hypot((x - 120) / 128, (y - 90) / 92)
      const edge = Math.min(x, W - 1 - x, y, H - 1 - y)
      const dith = bayer(x, y) - 0.5
      let c: RGB = r + dith * 0.1 > 0.84 ? PAL.deep : PAL.sea
      if (r + dith * 0.12 > 0.98 || edge + dith * 8 < 6) c = PAL.abyss
      // faint static ripples
      if (hash2(x >> 2, y, 17) < 0.035 && (x & 3) !== 3 && d > 8 && c !== PAL.abyss) c = PAL.seaRipple
      if (d < 12) c = d + bayer(x, y) * 3 < 9 ? (d < 4 + bayer(x + 1, y) * 2 ? PAL.shallow2 : PAL.shallow) : c
      p.set(x, y, c)
    }

  // ---------- cliff face ----------
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = cliff[y * W + x]
      if (!k) continue
      const strata = noise(x / 7, y / 2, 11) + bayer(x, y) * 0.3
      let c: RGB
      if (k === 1) c = PAL.cliffTop
      else if (k >= CLIFF) c = PAL.earthWet
      else if (k === CLIFF - 1) c = strata > 0.7 ? PAL.earthWet : PAL.earthDark
      else c = strata > 0.78 ? PAL.earthDark : PAL.earth
      // a pebble line two rows down
      if (k === 3 && hash2(x, y, 4) < 0.12) c = PAL.cliffTop
      p.set(x, y, c)
    }

  // ---------- top surface ----------
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!T(x, y)) continue
      const e = edge[y * W + x]
      // sand band: wider along the south-east beach
      const beach = Math.max(0, (y - 92) / 40) * Math.max(0, (x - 100) / 80)
      const sandW = 2.2 + noise(x / 9, y / 9, 7) * 2.6 + beach * 7
      const nearSand = e + bayer(x, y) * 1.4
      if (nearSand <= sandW) {
        let c = PAL.sand
        if (e <= 1) c = PAL.sandLight
        else if (nearSand > sandW - 0.8) c = PAL.sandDark
        if (hash2(x, y, 21) < 0.05) c = PAL.sandDark
        p.set(x, y, c)
        continue
      }
      // grass shading: lit from the top-left, darker toward the south-east
      const nx = (x - 120) / 80
      const ny = (y - 88) / 46
      const light = -nx * 0.35 - ny * 0.55
      const v = 0.52 + light * 0.32 + (noise(x / 10, y / 8, 13) - 0.5) * 0.4
      const t = v + (bayer(x, y) - 0.5) * 0.22
      let c = t < 0.3 ? PAL.grassDeep : t < 0.46 ? PAL.grassDark : t < 0.74 ? PAL.grass : PAL.grassLight
      // grass rim just inside the sand reads as a soft step
      if (e <= sandW + 1.2) c = PAL.grassDark
      p.set(x, y, c)
    }

  // grass tufts and flowers (deterministic sprinkles)
  for (let y = 2; y < H; y++)
    for (let x = 2; x < W - 2; x++) {
      if (!T(x, y) || edge[y * W + x] < 7) continue
      const h = hash2(x, y, 31)
      if (h < 0.022) {
        p.set(x, y, PAL.grassDeep)
        p.set(x - 1, y - 1, PAL.grassDark)
        p.set(x + 1, y - 1, PAL.grassDark)
        p.set(x, y - 1, PAL.grassLight)
      } else if (h < 0.0275 && Math.hypot(x - grassPatch.x, y - grassPatch.y) > grassPatch.r + 6) {
        const f = [PAL.flowerA, PAL.flowerB, PAL.flowerC][Math.floor(hash2(x, y, 7) * 3)]
        p.set(x, y, f)
        p.set(x, y + 1, PAL.grassDeep)
      }
    }

  // soft contact shadows painted into the grass (tree, bush)
  const shade = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = cy - ry; y <= cy + ry; y++)
      for (let x = cx - rx; x <= cx + rx; x++) {
        const dx = (x - cx) / rx
        const dy = (y - cy) / ry
        const d = dx * dx + dy * dy
        if (d < 1 && T(x, y) && d < 0.55 + bayer(x, y) * 0.45) p.set(x, y, d < 0.45 ? PAL.grassDeep : PAL.grassDark)
      }
  }
  shade(tree.x + 4, tree.y + 1, 15, 5)
  shade(bush.x + 2, bush.y + 1, 9, 3)

  // ---------- dock: wooden steps down the cliff, then a pier with posts ----------
  const { y0, y1, w } = dock
  const deckTop = lip + CLIFF + 1
  const darken = (x: number, y: number, k: number) => {
    const j = (y * W + x) * 4
    p.data[j] = p.data[j] * k
    p.data[j + 1] = p.data[j + 1] * k
    p.data[j + 2] = p.data[j + 2] * k
  }
  // steps: three treads with dark risers, set into the cliff between earth cheeks
  for (let y = y0; y < deckTop; y++)
    for (let x = dockX + 2; x < dockX + w - 2; x++) {
      const cheek = x === dockX + 2 || x === dockX + w - 3
      const r = (y - y0) % 3
      p.set(x, y, cheek ? PAL.earthWet : r === 0 ? PAL.woodLight : r === 1 ? PAL.wood : PAL.woodGap)
    }
  // shadow of the pier on the water, to the right and under the front edge
  for (let y = deckTop + 1; y <= y1 + 4; y++) for (const x of [dockX + w, dockX + w + 1]) darken(x, y, x === dockX + w ? 0.78 : 0.88)
  // the deck: planks across, staggered board joints, a soft highlight row
  for (let y = deckTop; y <= y1; y++) {
    const r = (y - deckTop) % 3
    const joint = dockX + 2 + Math.floor(hash2(y >> 2, 3, 77) * (w - 4))
    for (let x = dockX; x < dockX + w; x++) {
      let c = r === 0 ? PAL.woodLight : r === 1 ? PAL.wood : PAL.woodDark
      if (r !== 2 && x === joint) c = PAL.woodDark
      if (x === dockX || x === dockX + w - 1) c = r === 2 ? PAL.woodGap : PAL.woodDark
      if (r === 1 && hash2(x, y, 41) < 0.05) c = PAL.woodDark
      p.set(x, y, c)
    }
  }
  // the front face, then posts into the water with a ring of foam
  for (let x = dockX; x < dockX + w; x++) {
    p.set(x, y1 + 1, PAL.woodDark)
    p.set(x, y1 + 2, PAL.woodGap)
  }
  for (const px of [dockX + 1, dockX + (w >> 1) - 1, dockX + w - 3]) {
    for (let y = y1 + 3; y <= y1 + 5; y++) {
      p.set(px, y, PAL.woodGap)
      p.set(px + 1, y, PAL.woodDark)
    }
    p.set(px - 1, y1 + 6, PAL.foam)
    p.set(px, y1 + 6, PAL.foam)
    p.set(px + 1, y1 + 6, PAL.foam)
    p.set(px + 2, y1 + 6, PAL.shallow2)
  }

  // ---------- rocks in the shallows ----------
  const rock = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        const dx = (x - cx) / (r + 1)
        const dy = (y - cy) / r
        const d = dx * dx + dy * dy
        if (d > 1) continue
        const lit = dx + dy < -0.4
        p.set(x, y, d > 0.7 ? PAL.stoneDark : lit ? PAL.stoneLight : PAL.stone)
      }
    for (let x = cx - r; x <= cx + r; x++) p.set(x, cy + r + 1, PAL.shallow2)
  }
  rock(34, 128, 3)
  rock(40, 132, 2)
  rock(210, 62, 3)
  rock(198, 146, 2)

  // shoreline pixels for the animated foam
  const shoreline: { x: number; y: number }[] = []
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (footprint[i]) continue
      if (footprint[i - 1] || footprint[i + 1] || footprint[i - W] || footprint[i + W]) {
        // skip under the dock
        if (x >= dockX - 1 && x <= dockX + w + 1 && y >= y0 && y <= y1 + 6) continue
        shoreline.push({ x, y })
      }
    }

  const blockers: { x: number; y: number; r: number }[] = []
  const walkable = (x: number, y: number) => {
    x = Math.round(x)
    y = Math.round(y)
    if (!T(x, y) || edge[y * W + x] < 5) return false
    if (Math.hypot((x - tree.x) / 1.6, y - tree.y) < 7) return false
    if (Math.hypot((x - bush.x) / 1.4, y - bush.y) < 6) return false
    if (Math.hypot(x - grassPatch.x, (y - grassPatch.y) * 1.3) < grassPatch.r + 2) return false
    for (const b of blockers) if (b.r && Math.hypot((x - b.x) / 1.3, y - b.y) < b.r + 3) return false
    return true
  }

  // the desktop-pet version: keep the land, the dock and a feathered lagoon ring
  const fp = new Pix(W, H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const onDock = x >= dockX - 1 && x <= dockX + w + 1 && y >= y0 && y <= y1 + 6
      const keep = footprint[i] || onDock || seaDist[i] + bayer(x, y) * 3 < 9
      if (!keep) continue
      const j = i * 4
      fp.data[j] = p.data[j]
      fp.data[j + 1] = p.data[j + 1]
      fp.data[j + 2] = p.data[j + 2]
      fp.data[j + 3] = 255
    }

  return { base: p.toCanvas(), floatBase: fp.toCanvas(), top, edge, footprint, grassPatch, tree, bush, dock, lantern, walkable, blockers, shoreline }
}

// ---------- props (drawn per frame so they y-sort with the Pokémon) ----------

/** The tree, as its own small canvas; ground point is the trunk base. */
export function paintTree(): { img: HTMLCanvasElement; ax: number; ay: number } {
  const w = 40
  const h = 46
  const p = new Pix(w, h)
  const ax = 20
  const ay = 44
  // trunk
  for (let y = 26; y <= ay; y++)
    for (let x = ax - 3; x <= ax + 2; x++) {
      const flare = y > ay - 3 ? 1 : 0
      if (x < ax - 3 + (flare ? 0 : 1) || x > ax + 2 - (flare ? 0 : 1)) continue
      p.set(x, y, x <= ax - 2 ? PAL.trunkDark : x >= ax + 1 ? PAL.trunkDark : PAL.trunk)
    }
  p.set(ax - 4, ay, PAL.trunkDark)
  p.set(ax + 3, ay, PAL.trunkDark)
  // canopy: overlapping puffs lit from the top-left
  const puffs: [number, number, number][] = [
    [20, 17, 12],
    [11, 22, 8],
    [29, 22, 8],
    [15, 11, 8],
    [26, 11, 8],
    [20, 26, 8],
  ]
  const inside = (x: number, y: number) => puffs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < r * r)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue
      // shade per puff: lit side of whichever puff is nearest the light
      let best = -9
      for (const [cx, cy, r] of puffs) {
        const d = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r)
        if (d >= 1) continue
        const l = (-(x - cx) * 0.6 - (y - cy) * 0.8) / r
        best = Math.max(best, l * (1 - d * 0.4))
      }
      const t = best + (y / h) * -0.5 + 0.25 + (bayer(x, y) - 0.5) * 0.35
      const c = t > 0.45 ? PAL.leafLight : t > 0.05 ? PAL.leafMid : t > -0.3 ? PAL.leaf : PAL.leafDeep
      p.set(x, y, c)
    }
  // outline in the deepest leaf colour (never flat black)
  const out: [number, number][] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!p.alpha(x, y) && (p.alpha(x - 1, y) || p.alpha(x + 1, y) || p.alpha(x, y - 1) || p.alpha(x, y + 1))) out.push([x, y])
  for (const [x, y] of out) if (y < 34) p.set(x, y, PAL.leafDeep)
  return { img: p.toCanvas(), ax, ay }
}

export function paintBush(): { img: HTMLCanvasElement; ax: number; ay: number } {
  const w = 20
  const h = 15
  const p = new Pix(w, h)
  const puffs: [number, number, number][] = [
    [10, 8, 6],
    [5, 10, 4.5],
    [15, 10, 4.5],
  ]
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!puffs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < r * r)) continue
      const t = (-(x - 10) * 0.5 - (y - 8) * 0.8) / 7 + (bayer(x, y) - 0.5) * 0.4
      p.set(x, y, t > 0.4 ? PAL.leafLight : t > -0.1 ? PAL.leafMid : t > -0.6 ? PAL.leaf : PAL.leafDeep)
    }
  for (const [bx, by] of [[6, 7], [12, 5], [14, 10], [8, 11], [4, 11]]) {
    p.set(bx, by, PAL.berry)
    p.set(bx + 1, by, PAL.berry)
    p.set(bx, by + 1, PAL.berry)
    p.set(bx + 1, by + 1, hex('#b63c47'))
    p.set(bx, by, PAL.berryLight)
  }
  const out: [number, number][] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!p.alpha(x, y) && (p.alpha(x - 1, y) || p.alpha(x + 1, y) || p.alpha(x, y - 1))) out.push([x, y])
  for (const [x, y] of out) p.set(x, y, PAL.leafDeep)
  return { img: p.toCanvas(), ax: 10, ay: 14 }
}

/** The dock lantern on its post: a peaked iron cap, amber glass, a collar and an iron post.
 *  The glass is a warm mid-tone by day (it read as a blank square when it was pale); the flame
 *  is drawn live so it can glow at night. */
export function paintLantern(): { img: HTMLCanvasElement; ax: number; ay: number; flame: { x: number; y: number } } {
  const p = new Pix(7, 21)
  const iron = hex('#3e3029')
  const ironHi = hex('#6a5548')
  const glass = hex('#d6a24e')
  const glassHi = hex('#f3d48c')
  // cap
  p.set(3, 0, iron)
  for (let x = 2; x <= 4; x++) p.set(x, 1, iron)
  for (let x = 1; x <= 5; x++) p.set(x, 2, iron)
  p.set(2, 1, ironHi)
  // frame and glass
  for (let y = 3; y <= 6; y++) {
    p.set(1, y, iron)
    p.set(5, y, iron)
    for (let x = 2; x <= 4; x++) p.set(x, y, glass)
  }
  p.set(2, 3, glassHi)
  p.set(2, 4, glassHi)
  // base and collar
  for (let x = 1; x <= 5; x++) p.set(x, 7, iron)
  for (let x = 2; x <= 4; x++) p.set(x, 8, iron)
  // an iron post, so it stands out against the pier's planks
  for (let y = 9; y < 21; y++) {
    p.set(3, y, iron)
    p.set(2, y, y < 19 ? ironHi : iron)
  }
  for (let x = 1; x <= 4; x++) p.set(x, 20, iron)
  return { img: p.toCanvas(), ax: 3, ay: 20, flame: { x: 3, y: 4 } }
}
