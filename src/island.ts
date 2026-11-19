// The island: painted once, pixel by pixel, into a static base layer, plus a
// handful of props (tree, bush, lantern) that are y-sorted with the Pokémon.
//
// Logical resolution is 240×180, drawn at an integer scale. The view is a
// gentle 3/4 top-down, like the PMD overworld: you see the grassy top and a
// short cliff face on the south side.
import { Pix, RGB, bayer, distanceField, hash2, hex, noise } from './pixel'
import { piece, pixels, recolor } from './nature'

export const W = 240
export const H = 180
const CLIFF = 7

export const PAL = {
  deep: hex('#3f86bf'),
  dusk: hex('#2b659e'), // the open sea past the island's water: darker, so it reads as out of reach
  abyss: hex('#1d4a7c'), // only at the very edge of the window (main.ts edge layer)
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
  islandId = id
  LOBES = scaleLobes([...BASE_LOBES, ...(EXTRA_LOBES[id] ?? [])])
  // Home's greens are Flurmimon's grass tiles' own, so tufts, shading and ruins match the ground
  if (id === 'home') Object.assign(PAL, { grassLight: hex('#a3da9a'), grass: hex('#89cf7e'), grassDark: hex('#5ebe50'), grassDeep: hex('#469b39') })
  if (id === 'ember') return useEmber()
  if (id !== 'frost') return
  const F: Partial<Record<keyof typeof PAL, string>> = {
    deep: '#2a6fae', dusk: '#1c5088', abyss: '#123866', sea: '#3580c2', seaRipple: '#438dca', shallow: '#68b4dc', shallow2: '#a6daf0', foam: '#f4fbff',
    sandLight: '#eef3f8', sand: '#dbe4ee', sandDark: '#bfcbd9', cliffTop: '#b9c7d6', earth: '#8a9bb0', earthDark: '#6a7b92', earthWet: '#4b5a71',
    grassLight: '#f7fbfe', grass: '#e6eff7', grassDark: '#cbdcea', grassDeep: '#aac3d9',
    leaf: '#2d6a5a', leafMid: '#3d816f', leafLight: '#e8f2f7', leafDeep: '#1d4a3f', trunk: '#6e4e38', trunkDark: '#4c3424',
  }
  for (const [k, v] of Object.entries(F)) PAL[k as keyof typeof PAL] = hex(v!)
  Object.assign(TUFT, { out: '#6d8aa6', dark: '#a9c2d8', mid: '#c9dbea', light: '#f4f9fd' })
}

/** Ember Cove (L2): black sand, red earth, dry olive grass, a warmer sea. */
function useEmber() {
  const E: Partial<Record<keyof typeof PAL, string>> = {
    deep: '#2f6f9e', dusk: '#245682', abyss: '#163a5e', sea: '#3a86b8', seaRipple: '#4690c0', shallow: '#5fb0c8', shallow2: '#8ccfd8', foam: '#eef6f6',
    sandLight: '#8e837c', sand: '#716760', sandDark: '#58504b', cliffTop: '#7e5c4a', earth: '#8c4c34', earthDark: '#6c3628', earthWet: '#4a2418',
    grassLight: '#cdc476', grass: '#aaa254', grassDark: '#888240', grassDeep: '#6a6432',
    leaf: '#4a6a2e', leafMid: '#5e8038', leafLight: '#86a04a', leafDeep: '#34501f', trunk: '#5a3a28', trunkDark: '#3c2418',
  }
  for (const [k, v] of Object.entries(E)) PAL[k as keyof typeof PAL] = hex(v!)
  Object.assign(TUFT, { out: '#5a5228', dark: '#888240', mid: '#aaa254', light: '#d4cc80' })
}

/**
 * Seasons on Home Island (L7, 2026-11-12): in autumn the tree's leaves turn amber and the grass
 * warms a little. Applied after useIsland and before the scene is built.
 */
export function useSeason(season: string, id: string) {
  currentSeason = season
  if (id !== 'home' || season !== 'autumn') return
  const A: Partial<Record<keyof typeof PAL, string>> = {
    leaf: '#c0702e', leafMid: '#d88a3c', leafLight: '#eeb054', leafDeep: '#8e4a22',
    grassLight: '#b4d466', grass: '#92bf52', grassDark: '#74a442', grassDeep: '#5a8a36',
  }
  for (const [k, v] of Object.entries(A)) PAL[k as keyof typeof PAL] = hex(v!)
}

let islandId = 'home'
/** The island the scene is being painted for. */
export const islandName = () => islandId
let currentSeason = 'summer'

/**
 * Home Island's lighthouse stands on its own small rock in the south-east sea (Paul, 2026-11-18:
 * the ruins crowded the lawn). Pokémon can't walk there; it is painted, not part of the top.
 */
export const ISLET = { x: 210, y: 158, rx: 14, ry: 5 }
/** Small rocks in the shallows, in window pixels (bottom centre), clear of the land and the pier. */
export const SEA_ROCKS: Record<string, [number, number][]> = {
  home: [[14, 142], [26, 150], [228, 58]],
}

/** The open-sea colour, for the page behind the canvas. */
export const seaCss = () => `rgb(${PAL.dusk.join(',')})`
/** The darkest water, drawn only in a thin band at the window's edges. */
export const seaEdge = () => PAL.abyss

// ---------- shape ----------
/**
 * The island is drawn 24% bigger than it was first laid out, about its centre, so the
 * Pokémon read smaller against it (Paul, 2026-11-11: 14%; 2026-11-18: 24%, more land). Every fixed spot on it (props,
 * habitats, decoration slots, the nest, the shallows' rocks) goes through `onIsland`.
 */
export const ISLAND_SCALE = 1.24
export const onIsland = (x: number, y: number) => ({ x: Math.round(120 + (x - 120) * ISLAND_SCALE), y: Math.round(92 + (y - 92) * ISLAND_SCALE) })
const BASE_LOBES: [number, number, number, number][] = [
  [120, 90, 76, 42],
  [80, 100, 36, 24],
  [164, 97, 36, 26],
  [126, 71, 44, 23],
]
/** Each island adds a lobe of its own to the shared shape, so every fixed spot stays on land (L2). */
const EXTRA_LOBES: Record<string, [number, number, number, number][]> = {
  frost: [[58, 82, 22, 14]], // an ice spit to the west
  ember: [[180, 68, 26, 17]], // the crater's shoulder to the north-east
}
let LOBES = scaleLobes(BASE_LOBES)
function scaleLobes(xs: [number, number, number, number][]): [number, number, number, number][] {
  return xs.map(([x, y, rx, ry]) => {
    const p = onIsland(x, y)
    return [p.x, p.y, rx * ISLAND_SCALE, ry * ISLAND_SCALE]
  })
}

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
  boat: { x: number; y: number } // the rowboat to the surface exploration
  walkable: (x: number, y: number) => boolean
  blockers: { x: number; y: number; r: number }[] // decorations, kept clear
  shoreline: { x: number; y: number }[] // foam pixels, just outside the footprint
}

/**
 * `keepClear`: spots where decorations, habitats and landmarks stand (in window pixels), so the
 * ground's tufts and flowers stay off them.
 */
export function buildIsland(keepClear: { x: number; y: number; r: number }[] = []): IslandLayout {
  groundTiles()
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
  const tree = onIsland(158, 74)
  const bush = onIsland(184, 104)
  const grassPatch = { ...onIsland(76, 96), r: Math.round(15 * ISLAND_SCALE) }
  const dockX = onIsland(114, 0).x
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
  // the rowboat, moored to the right of the pier near its end
  const boat = { x: dockX + DW + 16, y: dock.y1 - 10 }

  const p = new Pix(W, H)

  // ---------- water ----------
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (footprint[y * W + x]) continue
      const d = seaDist[y * W + x]
      // the island's water deepens in a soft ring, then gives way to the darker open sea,
      // which meets the window's edge in exactly the page's colour (no visible frame)
      // clean rings, no dithering (Paul, 2026-11-18: the dithered ground and sea felt rasterized):
      // pale shallows, the island's water, a deep ring, then the open sea. A slow wave keeps the
      // ring edges from looking ruled. The canvas edge is always exactly the open sea's colour,
      // the page's, so no frame shows.
      // (2026-11-18, Paul: "rings around rings". The rings now wander: slow noise pushes the deep
      // and open-sea edges in and out by up to a tenth, and the shallows by a few pixels, so they
      // read as shelves under the water rather than ellipses)
      const r0 = Math.hypot((x - 120) / 120, (y - 92) / 90)
      const r = r0 + (noise(x / 34, y / 26, 21) - 0.5) * 0.2 + (noise(x / 11, y / 9, 23) - 0.5) * 0.04
      const edge = Math.min(x, W - 1 - x, y, H - 1 - y)
      const wave = Math.sin(x * 0.35 + y * 0.2) * 0.6
      // (2026-11-18, Paul: the inner rings were too thin and too close: the pale shallows are now
      // about 7 px, the next band about 9 more, and the deep ring starts further out)
      const shelf = (noise(x / 16, y / 12, 25) - 0.5) * 8
      let c: RGB = PAL.sea
      if (r > 0.9 + wave * 0.01) c = PAL.deep
      if (r > 1.02 || edge < 5) c = PAL.dusk
      if (d < 16 + wave + shelf) c = PAL.shallow
      if (d < 7 + wave * 0.5 + shelf * 0.35) c = PAL.shallow2
      // a few short ripple dashes on the island's water
      if (c === PAL.sea && hash2(x >> 2, y, 17) < 0.03 && (x & 3) !== 3) c = PAL.seaRipple
      p.set(x, y, c)
    }

  // ---------- cliff face ----------
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = cliff[y * W + x]
      if (!k) continue
      // clean bands: a lit lip, earth with one darker stratum, and a wet foot at the water
      const foot = k >= CLIFF || !footprint[(y + 1) * W + x]
      const stratum = k === 4 || (k === 3 && noise(x / 6, 0, 11) > 0.62) || (k === 5 && noise(x / 6, 0, 11) < 0.3)
      p.set(x, y, k === 1 ? PAL.cliffTop : foot ? PAL.earthWet : stratum ? PAL.earthDark : PAL.earth)
    }

  // ---------- top surface ----------
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!T(x, y)) continue
      const e = edge[y * W + x]
      // sand band: wider along the south-east beach
      const beach = Math.max(0, (y - 92) / 40) * Math.max(0, (x - 100) / 80)
      const sandW = 2.2 + noise(x / 9, y / 9, 7) * 2.6 + beach * 7
      // a clean sand band (a lit rim, sand, a darker inner edge), then one even green with a
      // darker step just inside the sand; the grass's few deviations are placed below
      if (e <= sandW) {
        p.set(x, y, e <= 1 ? PAL.sandLight : e > sandW - 1 ? PAL.sandDark : PAL.sand)
        continue
      }
      // grass: Flurmimon's two grass tiles (2026-11-18), repeated on a 16px grid. The old lighting
      // (lit from the top-left, shaded to the south-east) and its slow noise still cut the lawn
      // into clean-edged regions: the darker tile in the shade and just inside the sand
      // (2026-11-18, Paul: the dark patches were "too random and abrupt", with sharp flat edges.
      // The shade now follows the light: the island darkens toward its south-east and along that
      // rim, with only slow, wide wobble, and a middle tone two or three pixels wide between the
      // two greens so no edge is a hard step)
      const nx = (x - 120) / 95
      const ny = (y - 88) / 55
      const toward = nx * 0.45 + ny * 0.75 // + toward the south-east, away from the light
      const rimShade = Math.max(0, toward) * Math.max(0, 1 - e / 22)
      const v = 0.6 - toward * 0.22 - rimShade * 0.35 + (noise(x / 30, y / 20, 13) - 0.5) * 0.22
      const t = (v < 0.4 ? groundDark : v < 0.45 || e <= sandW + 1 ? groundMid : groundLight).data
      const j = ((y & 15) * 16 + (x & 15)) * 4
      p.set(x, y, [t[j], t[j + 1], t[j + 2]])
    }

  // ---------- grass particles: Flurmimon's tufts and small flowers, placed on purpose ----------
  // on open lawn away from everything that stands there
  const busy = [...keepClear, { ...tree, r: 26 }, { ...bush, r: 12 }, { ...lantern, r: 8 }, { x: grassPatch.x, y: grassPatch.y, r: grassPatch.r + 8 }]
  const open = (x: number, y: number, pad = 0) => T(x, y) && edge[y * W + x] > 7 + pad && !busy.some((b) => Math.hypot(x - b.x, (y - b.y) * 1.4) < b.r * 0.75 + pad)
  let seed = 3
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const scatter = (names: string[], n: number, pad: number) => {
    for (let k = 0, tries = 0; tries < 1500 && k < n; tries++) {
      const x = Math.round(24 + rnd() * 192)
      const y = Math.round(40 + rnd() * 108)
      if (!open(x, y, pad)) continue
      const im = particle(names[k % names.length])
      blit(p, im, x - (im.width >> 1), y - im.height + 1)
      k++
    }
  }
  const warm = currentSeason === 'autumn' && islandId === 'home'
  scatter(['tuft'], 30, 0)
  if (islandId === 'home') {
    scatter(warm ? ['small3', 'small5', 'small0'] : ['small0', 'small1', 'small2', 'small3', 'small4', 'small5'], 14, 1)
    scatter(warm ? ['leaves-orange', 'leaves-heap'] : ['flower1', 'flower3', 'flower0'], 3, 4)
  }

  // ---------- the water's layers (after Kimo's water thread, 2026-11-18) ----------
  // water uses a few fixed tones and each layer swaps one for another, never blends
  const WT: RGB[] = [PAL.abyss, PAL.dusk, PAL.deep, PAL.sea, PAL.seaRipple, PAL.shallow, PAL.shallow2, PAL.foam]
  const toneAt = (x: number, y: number) => {
    const j = (y * W + x) * 4
    return WT.findIndex((c) => p.data[j] === c[0] && p.data[j + 1] === c[1] && p.data[j + 2] === c[2])
  }
  const wet = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !footprint[y * W + x] && toneAt(x, y) >= 0
  // the south cliff mirrored into the sea: flipped, squashed to 80%, cut into three dark water
  // tones by brightness, each row shifted a pixel or two on a sine; the darker of reflection and
  // water wins, so it never lightens the sea
  const src = p.data.slice()
  for (let x = 0; x < W; x++) {
    let foot = -1
    for (let y = H - 2; y > 0; y--)
      if (footprint[y * W + x] && !top[y * W + x] && wet(x, y + 1)) {
        foot = y
        break
      }
    if (foot < 0) continue
    let lipY = foot
    while (lipY > 0 && footprint[(lipY - 1) * W + x] && !top[(lipY - 1) * W + x]) lipY--
    const rh = Math.max(1, Math.round((foot - lipY + 1) * 0.8))
    for (let r = 0; r < rh; r++) {
      const shift = r < 2 ? 0 : Math.round(Math.sin(r * 0.9 + x * 0.15) * (r < 4 ? 1 : 1.5))
      const sy = foot - Math.floor(r / 0.8)
      const sx = Math.min(W - 1, Math.max(0, x - shift))
      if (sy < lipY) break
      const ty = foot + 1 + r
      if (!wet(x, ty)) continue
      const si = (sy * W + sx) * 4
      const l = 0.3 * src[si] + 0.59 * src[si + 1] + 0.11 * src[si + 2]
      const tone = l < 95 ? 0 : l < 140 ? 1 : 2
      if (tone < toneAt(x, ty)) p.set(x, ty, WT[tone])
    }
  }
  // the cliff's last row is damp where it meets the water
  for (let y = 1; y < H - 1; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (footprint[i] && !top[i] && wet(x, y + 1)) p.set(x, y, PAL.earthWet)
    }
  // short light dashes lapping two pixels off the shore
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (footprint[i] || !(footprint[i - 1] || footprint[i + 1] || footprint[i - W] || footprint[i + W])) continue
      const qx = x + (x < 120 ? -2 : 2)
      const qy = y + (y < 92 ? -1 : 2)
      const v2 = Math.sin(x * 0.45 + y * 0.3) + Math.sin(x * 0.13 - y * 0.21) * 0.6
      if (v2 > 0.7 && wet(qx, qy)) p.set(qx, qy, PAL.shallow2)
    }
  // in autumn on Home, a few leaves float by the shore, each with a one-pixel shadow
  if (warm)
    for (let n = 0, tries = 0; n < 6 && tries < 600; tries++) {
      const x = Math.round(10 + rnd() * 220)
      const y = Math.round(10 + rnd() * 160)
      if (!wet(x, y) || !wet(x + 1, y + 1) || !wet(x + 4, y) || seaDist[y * W + x] > 6 || seaDist[y * W + x] < 3) continue
      p.set(x + 1, y + 1, PAL.deep)
      p.set(x, y, hex('#e8843c'))
      p.set(x + 1, y, hex('#cc602c'))
      n++
    }

  // ---------- the lighthouse's rock (Home only) ----------
  // a low rocky outcrop: a lit stone top with a tuft of grass, a darker rock face, a wet foot and
  // a ring of foam, wider than the tower so it stands on something
  if (islandId === 'home') {
    const { x: cx, y: cy, rx, ry } = ISLET
    const lump = (x: number, y: number) => (noise(x / 4, y / 3, 61) - 0.5) * 0.35
    const inside = (x: number, y: number, k = 1) => ((x + 0.5 - cx) / (rx * k)) ** 2 + ((y + 0.5 - cy) / (ry * k)) ** 2 < 1 + lump(x, y)
    const DROP = 5
    for (let y = cy - ry - 2; y <= cy + ry + DROP + 4; y++)
      for (let x = cx - rx - 4; x <= cx + rx + 4; x++) {
        if (inside(x, y)) {
          const lit = (x - cx) / rx + (y - cy) / ry < -0.3
          const grassy = inside(x, y, 0.55) && x < cx + 2 && y < cy + 1
          p.set(x, y, grassy ? PAL.grassDark : lit ? PAL.stoneLight : PAL.stone)
          continue
        }
        let k = 0
        for (let d = 1; d <= DROP; d++) if (inside(x, y - d)) { k = d; break }
        if (k) p.set(x, y, k === 1 ? PAL.stone : k === DROP ? PAL.earthWet : (x + k) % 5 === 0 ? PAL.stone : PAL.stoneDark)
        else if (inside(x, y - DROP, 1.15) || inside(x, y, 1.12)) p.set(x, y, PAL.foam)
        else if (inside(x, y - DROP, 1.3)) p.set(x, y, PAL.shallow2)
      }
  }

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

  // ---------- the rowboat tied beside the pier, for the surface explorations (2026-11-18) ----------
  {
    const bx = boat.x
    const by = boat.y
    // seen from above at the island's angle: a pointed hull with a light rim, the dark inside,
    // two seats across, the side below the rim, and its shadow on the water
    const rimC = hex('#d8a468')
    const side = hex('#8c5a35')
    const sideDark = hex('#5e3a20')
    const inside = hex('#6e4426')
    const seat = hex('#c88a54')
    const RX = 12
    const RY = 4.5
    const inHull = (x: number, y: number, k = 1) => {
      // pointed at the bow (right): the half-width narrows toward +x
      const t = x / (RX * k)
      const half = RY * k * Math.sqrt(Math.max(0, 1 - t * t)) * (t > 0 ? 1 - t * 0.35 : 1)
      return Math.abs(y) <= half
    }
    for (let y = -6; y <= 9; y++)
      for (let x = -RX - 1; x <= RX + 1; x++) {
        if (inHull(x, y - 3)) p.set(bx + x, by + y, y - 3 > 0 ? sideDark : side) // the side, three pixels lower
      }
    for (let x = -RX - 1; x <= RX + 1; x++) if (inHull(x, 2)) p.set(bx + x, by + 6, PAL.deep) // shadow
    for (let y = -6; y <= 6; y++)
      for (let x = -RX - 1; x <= RX + 1; x++) {
        if (!inHull(x, y)) continue
        p.set(bx + x, by + y, inHull(x, y, 0.78) ? inside : rimC)
      }
    for (const sx of [-5, 3]) for (let y = -3; y <= 3; y++) if (inHull(sx, y, 0.78)) p.set(bx + sx, by + y, seat), p.set(bx + sx + 1, by + y, seat)
    // an oar resting across, and the rope to the pier
    for (let k = 0; k < 10; k++) p.set(bx - 4 + k, by - 2 + (k >> 2), hex('#e8c890'))
    p.set(bx - RX - 2, by, hex('#e8d8a8'))
    p.set(bx - RX - 3, by - 1, hex('#e8d8a8'))
    // foam where the hull meets the water
    for (const x of [-10, -4, 2, 8]) p.set(bx + x, by + 8, PAL.foam)
  }

  // ---------- rocks in the shallows: Flurmimon's small rocks with their foam rim ----------
  const seaRock = pixels(islandId === 'frost' ? 'rock-s4' : 'rock-snow-s')
  for (const [x, y] of SEA_ROCKS[islandId] ?? SEA_ROCKS.home) blit(p, seaRock, x - (seaRock.width >> 1), y - seaRock.height + 1)

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
    if (Math.hypot((x - tree.x) / 2.2, y - tree.y) < 8) return false
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

  return { base: p.toCanvas(), floatBase: fp.toCanvas(), top, edge, footprint, grassPatch, tree, bush, dock, lantern, boat, walkable, blockers, shoreline }
}

// ---------- props (drawn per frame so they y-sort with the Pokémon) ----------

/**
 * The tree, as its own small canvas; ground point is the trunk base. Flurmimon's tree in the
 * season's leaves on Home Island (pink in spring, green in summer, orange in autumn, snow-capped
 * in winter), under snow on Frost Isle, and a coconut palm on Ember Cove.
 */
export function paintTree(): { img: HTMLCanvasElement; ax: number; ay: number } {
  const name =
    islandId === 'frost' ? 'tree-snow'
    : islandId === 'ember' ? 'palm-coco'
    : ({ spring: 'tree-pink', summer: 'tree-green', autumn: 'tree-orange', winter: 'tree-snowcap' } as Record<string, string>)[currentSeason] ?? 'tree-green'
  const img = piece(name)
  return { img, ax: img.width >> 1, ay: img.height - 6 }
}

/** Flurmimon's tall grass, in the island's tall-grass colours off Home Island. */
export function paintTallGrass(): HTMLCanvasElement {
  // the whole sprite; each tuft cuts its own top off by a few rows (scene.ts addTufts)
  return islandId === 'home' ? piece('tallgrass') : recolor('tallgrass', [hex(TUFT.out), hex(TUFT.dark), hex(TUFT.mid), hex(TUFT.light)])
}

/** The berry bush: two of Flurmimon's bushes side by side, with the island's berries in them. */
export function paintBush(): { img: HTMLCanvasElement; ax: number; ay: number } {
  const frost = islandId === 'frost'
  const a = piece(frost ? 'bush-frost' : 'bush')
  const b = piece(frost ? 'bush2-frost' : 'bush2')
  const c = document.createElement('canvas')
  c.width = 26
  c.height = 17
  const g = c.getContext('2d')!
  g.drawImage(b, 10, 1)
  g.drawImage(a, 0, 2)
  const px = (x: number, y: number, col: RGB) => {
    g.fillStyle = `rgb(${col.join(',')})`
    g.fillRect(x, y, 1, 1)
  }
  for (const [bx, by] of [[5, 6], [10, 9], [16, 5], [20, 9], [13, 13]]) {
    px(bx, by, PAL.berry)
    px(bx + 1, by, PAL.berry)
    px(bx, by + 1, PAL.berry)
    px(bx + 1, by + 1, hex('#b63c47'))
    px(bx, by, PAL.berryLight)
  }
  return { img: c, ax: 13, ay: 15 }
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

// ---------- Flurmimon pieces in the island's colours ----------
/** The two ground tiles (shade, light), in the current island's greens. */
let groundDark: ImageData
let groundMid: ImageData
let groundLight: ImageData
function groundTiles() {
  const dark = recolor('grass2', [PAL.grassDeep, PAL.grassDark, PAL.grass])
  const light = recolor('grass', [PAL.grassDark, PAL.grass, PAL.grassLight])
  groundDark = dark.getContext('2d')!.getImageData(0, 0, 16, 16)
  groundLight = light.getContext('2d')!.getImageData(0, 0, 16, 16)
  // the middle tone: the two tiles averaged pixel by pixel, so it keeps their texture
  groundMid = new ImageData(16, 16)
  for (let i = 0; i < groundMid.data.length; i++) groundMid.data[i] = Math.round((groundDark.data[i] + groundLight.data[i]) / 2)
}
/** Tufts on Frost Isle and Ember Cove take the island's tall-grass colours; flowers keep their own. */
function particle(name: string): ImageData {
  if (islandId !== 'home' && name.startsWith('tuft')) {
    const c = recolor(name, [hex(TUFT.out), hex(TUFT.dark), hex(TUFT.mid), hex(TUFT.light)])
    return c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  }
  return pixels(name)
}
/** Alpha-composite a piece into a Pix. */
function blit(p: Pix, im: ImageData, x0: number, y0: number) {
  for (let y = 0; y < im.height; y++)
    for (let x = 0; x < im.width; x++) {
      const i = (y * im.width + x) * 4
      const a = im.data[i + 3]
      if (!a) continue
      const X = x0 + x
      const Y = y0 + y
      if (X < 0 || Y < 0 || X >= p.w || Y >= p.h) continue
      const j = (Y * p.w + X) * 4
      const k = a / 255
      p.data[j] = Math.round(p.data[j] * (1 - k) + im.data[i] * k)
      p.data[j + 1] = Math.round(p.data[j + 1] * (1 - k) + im.data[i + 1] * k)
      p.data[j + 2] = Math.round(p.data[j + 2] * (1 - k) + im.data[i + 2] * k)
    }
}
