// Decorations: bought with shells (1 per focused minute), placed on one of a
// few fixed spots so a tiny window never needs a drag-and-drop editor. They are
// expression only: nothing here changes odds, growth or what friends see.
import { PAL, onIsland } from './island'
import { Pix, RGB, bayer, hex } from './pixel'
import { piece } from './nature'

/** A decoration made of Flurmimon's pieces (2026-11-18): [name, x, y] on a w by h canvas. */
function compose(w: number, h: number, parts: [string, number, number][], ax: number, ay: number, r: number): DecorArt {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  for (const [n, x, y] of parts) g.drawImage(piece(n), x, y)
  return { img: c, ax, ay, r }
}

export interface DecorDef {
  id: string
  name: string
  price: number // shells = focused minutes
  blurb: string
  frost?: boolean // sold once Frost Isle is open
  gift?: boolean // never sold: a Pokédex milestone gives it
}

// Price bands follow Studdy's ECONOMY.md, re-anchored on shells:
// small things cost under an hour, statement pieces several hours.
export const CATALOG: DecorDef[] = [
  { id: 'flowers', name: 'Flower bed', price: 40, blurb: 'A small bed of white and pink flowers.' },
  { id: 'stones', name: 'Stepping stones', price: 50, blurb: 'Flat stones set into the grass.' },
  { id: 'mushrooms', name: 'Mushroom ring', price: 60, blurb: 'A ring of red mushrooms.' },
  { id: 'sign', name: 'Signpost', price: 80, blurb: 'A wooden signpost by the path.' },
  { id: 'bench', name: 'Wooden bench', price: 120, blurb: 'A bench for watching the sea.' },
  { id: 'umbrella', name: 'Beach umbrella', price: 150, blurb: 'A striped umbrella for the beach.' },
  { id: 'lantern', name: 'Stone lantern', price: 220, blurb: 'It glows softly after dark.' },
  { id: 'campfire', name: 'Campfire', price: 300, blurb: 'It burns low and warm after dark.' },
  { id: 'windmill', name: 'Little windmill', price: 400, blurb: 'Its sails turn slowly in the sea breeze.' },
  // Frost Isle pieces: late-game places for shells to go (review 2026-11-11)
  { id: 'snowman', name: 'Snowman', price: 300, blurb: 'A snowman with a stick scarf.', frost: true },
  { id: 'icecarving', name: 'Ice carving', price: 500, blurb: 'A clear ice carving that catches the light.', frost: true },
  { id: 'aurora', name: 'Aurora lamp', price: 800, blurb: 'At night it glows green, then violet.', frost: true },
  // 2026-11-12 (docs/CONTENT_PLAN.md, L9): something for each species no decoration drew
  { id: 'leafpile', name: 'Leaf pile', price: 50, blurb: 'A soft heap of fallen leaves.' },
  { id: 'rockpool', name: 'Rock pool', price: 140, blurb: 'A ring of stones around clear sea water.' },
  { id: 'lightningrod', name: 'Lightning rod', price: 180, blurb: 'A copper rod that hums in a storm.' },
  { id: 'batroost', name: 'Bat roost', price: 200, blurb: 'A little wooden box for sleeping by day.' },
  { id: 'mudpatch', name: 'Mud patch', price: 120, blurb: 'Warm mud, good for rolling in.', frost: true },
  { id: 'statue', name: 'Pokédex statue', price: 0, blurb: 'For finishing an island’s Pokédex.', gift: true },
]

/** Ground points on the grassy top where a decoration can stand. */
// (2026-11-18, the bigger island and Flurmimon's bigger pieces: every spot was re-solved so the
// widest decoration, 32 px, stands fully on land at every spot, two spots never overlap, the one
// in front never hides the other's foot even with the tallest decoration, and none sits under
// the tree's canopy or on a habitat, the nest, the tall grass or the pier steps)
export const SLOTS: { id: string; x: number; y: number; minHours?: number; milestone?: number }[] = [
  { id: 'a', ...onIsland(95, 73) },
  { id: 'b', ...onIsland(124, 55) },
  { id: 'c', ...onIsland(182, 88) },
  { id: 'd', ...onIsland(172, 115) },
  { id: 'e', ...onIsland(100, 126) },
  { id: 'f', ...onIsland(150, 122) },
  // the island grows: two more spots after 3 focused hours
  { id: 'g', ...onIsland(139, 106), minHours: 3 },
  { id: 'h', ...onIsland(111, 113), minHours: 3 },
  // a Pokédex milestone (75%) opens one more (L5)
  { id: 'i', ...onIsland(84, 62), milestone: 1 },
]

export interface DecorArt {
  img: HTMLCanvasElement
  ax: number
  ay: number
  /** a feathered light at night, relative to the ground point */
  glow?: { x: number; y: number; r: number; rgb: string }
  /** drawn every frame on top of img (windmill sails, fire) */
  live?: (g: CanvasRenderingContext2D, x: number, y: number, t: number, night: number) => void
  r: number // footprint radius, kept clear of wandering Pokémon
}

const outline = (p: Pix, c: RGB) => {
  const pts: [number, number][] = []
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (!p.alpha(x, y) && (p.alpha(x - 1, y) || p.alpha(x + 1, y) || p.alpha(x, y - 1) || p.alpha(x, y + 1))) pts.push([x, y])
  for (const [x, y] of pts) p.set(x, y, c)
}

function flowers(): DecorArt {
  // three of Flurmimon's flower clumps
  return compose(30, 19, [['flower1', 0, 4], ['flower2', 14, 0], ['flower0', 9, 5], ['flower1', 16, 4]], 15, 17, 8)
}

function stones(): DecorArt {
  // single cobbles from Flurmimon's stone path, set into the grass in a short curve
  return compose(32, 11, [['stone0', 0, 3], ['stone1', 8, 1], ['stone2', 16, 2], ['stone0', 24, 0]], 16, 10, 0)
}

function mushrooms(): DecorArt {
  // a ring of Flurmimon's red mushrooms
  return compose(30, 22, [['mushroom', 8, 0], ['mushroom', 0, 6], ['mushroom', 16, 7]], 15, 21, 7)
}

function sign(): DecorArt {
  const p = new Pix(14, 18)
  for (let y = 7; y < 18; y++) {
    p.set(6, y, PAL.wood)
    p.set(7, y, PAL.woodDark)
  }
  for (let y = 1; y < 8; y++) for (let x = 1; x < 13; x++) p.set(x, y, y === 1 ? PAL.woodLight : y === 7 ? PAL.woodDark : PAL.wood)
  for (let x = 3; x < 11; x += 2) p.set(x, 4, PAL.woodGap)
  outline(p, PAL.woodGap)
  return { img: p.toCanvas(), ax: 7, ay: 17, r: 4 }
}

function bench(): DecorArt {
  const p = new Pix(22, 14)
  for (let x = 1; x < 21; x++) {
    p.set(x, 3, PAL.woodLight)
    p.set(x, 4, PAL.wood)
    p.set(x, 7, PAL.woodLight)
    p.set(x, 8, PAL.wood)
    p.set(x, 9, PAL.woodDark)
  }
  for (const x of [3, 18]) for (let y = 1; y < 14; y++) if (y < 3 || y > 9) p.set(x, y, PAL.woodDark)
  for (const x of [3, 18]) for (let y = 5; y < 7; y++) p.set(x, y, PAL.woodDark)
  outline(p, PAL.woodGap)
  return { img: p.toCanvas(), ax: 11, ay: 13, r: 9 }
}

function umbrella(): DecorArt {
  // Flurmimon's canopy raised on a pole, with a soft shadow on the grass (2026-11-18: its own sand
  // disc read as a cropped beige blob on the lawn, and without it the dome sat on the ground)
  const src = piece('umbrella-red')
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 40
  const g = c.getContext('2d')!
  // the shadow first, a little to the right, as the light comes from the top-left
  g.fillStyle = 'rgba(30, 70, 30, 0.28)'
  g.beginPath()
  g.ellipse(18, 37, 12, 2.5, 0, 0, Math.PI * 2)
  g.fill()
  // the pole: pale wood with a darker right edge, from under the canopy to the ground
  g.fillStyle = '#5a4a3a'
  g.fillRect(14, 22, 4, 17)
  g.fillStyle = '#e8dcc0'
  g.fillRect(15, 22, 1, 16)
  g.fillStyle = '#b8a888'
  g.fillRect(16, 22, 1, 16)
  // the canopy down to its own outline (row 28), without the sand around it or the stub of pole
  // under it (2026-11-18: cutting at row 26 sliced off the canopy's bottom edge)
  const top = document.createElement('canvas')
  top.width = 32
  top.height = 29
  const tg = top.getContext('2d')!
  tg.drawImage(src, 0, 0, 32, 29, 0, 0, 32, 29)
  const id = tg.getImageData(0, 0, 32, 29)
  const d = id.data
  const sand = (i: number) => d[i] > 170 && d[i + 1] > 140 && d[i + 2] < 120 // the yellow towel
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && sand(i)) d[i + 3] = 0
  tg.putImageData(id, 0, 0)
  g.drawImage(top, 0, 0)
  return { img: c, ax: 16, ay: 38, r: 5 }
}

function lantern(): DecorArt {
  const p = new Pix(12, 20)
  const st = PAL.stone
  for (let y = 12; y < 20; y++) for (let x = 4; x < 8; x++) p.set(x, y, x === 4 ? PAL.stoneLight : PAL.stone)
  for (let x = 2; x < 10; x++) p.set(x, 19, PAL.stoneDark)
  for (let x = 1; x < 11; x++) {
    p.set(x, 2, PAL.stoneLight)
    p.set(x, 3, st)
  }
  for (let x = 3; x < 9; x++) p.set(x, 1, PAL.stoneLight)
  for (let y = 4; y < 10; y++) {
    p.set(2, y, st)
    p.set(9, y, PAL.stoneDark)
    for (let x = 3; x < 9; x++) p.set(x, y, hex('#5c4a3a'))
  }
  for (let x = 2; x < 10; x++) p.set(x, 10, PAL.stoneDark)
  for (let x = 3; x < 9; x++) p.set(x, 11, st)
  outline(p, hex('#5d5a55'))
  return {
    img: p.toCanvas(),
    ax: 6,
    ay: 19,
    r: 5,
    glow: { x: 0, y: -12, r: 22, rgb: '255, 196, 120' },
    live: (g, x, y, _t, night) => {
      if (night <= 0.02) return
      g.globalAlpha = night
      g.fillStyle = '#ffe2a0'
      g.fillRect(x - 3, y - 15, 6, 6)
      g.fillStyle = '#fff6d6'
      g.fillRect(x - 1, y - 13, 2, 2)
      g.globalAlpha = 1
    },
  }
}

function campfire(): DecorArt {
  const p = new Pix(18, 10)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const x = Math.round(9 + Math.cos(a) * 6)
    const y = Math.round(6 + Math.sin(a) * 2.6)
    p.set(x, y, PAL.stone)
    p.set(x + 1, y, PAL.stoneDark)
  }
  for (let x = 5; x < 13; x++) p.set(x, 6, x % 2 ? PAL.trunk : PAL.trunkDark)
  for (let x = 6; x < 12; x++) p.set(x, 5, PAL.trunkDark)
  return {
    img: p.toCanvas(),
    ax: 9,
    ay: 8,
    r: 8,
    glow: { x: 0, y: -6, r: 30, rgb: '255, 150, 70' },
    live: (g, x, y, t, night) => {
      // a low flame: a few pixels that sway slowly, brighter after dark
      const k = 0.55 + night * 0.45
      const sway = Math.round(Math.sin(t * 2.2) * 0.8)
      g.globalAlpha = k
      g.fillStyle = '#e8572f'
      g.fillRect(x - 2, y - 5, 5, 3)
      g.fillStyle = '#ffa23a'
      g.fillRect(x - 1 + sway, y - 7, 3, 3)
      g.fillStyle = '#ffe28a'
      g.fillRect(x + sway, y - 8, 1, 2)
      g.globalAlpha = 1
    },
  }
}

function windmill(): DecorArt {
  const p = new Pix(16, 30)
  for (let y = 10; y < 30; y++) {
    const half = 2 + Math.floor((y - 10) / 5)
    for (let x = 8 - half; x <= 8 + half - 1; x++) p.set(x, y, x < 8 - half + 1 ? hex('#f3e7d2') : x > 8 + half - 2 ? hex('#c9b79a') : hex('#e6d6ba'))
  }
  for (let x = 5; x < 11; x++) {
    p.set(x, 9, hex('#b0543c'))
    p.set(x + (x < 8 ? 1 : -1), 8, hex('#c4654a'))
  }
  p.set(7, 7, hex('#c4654a'))
  p.set(8, 7, hex('#c4654a'))
  for (let y = 24; y < 30; y++) {
    p.set(7, y, PAL.woodDark)
    p.set(8, y, PAL.woodDark)
  }
  outline(p, hex('#7d6a52'))
  return {
    img: p.toCanvas(),
    ax: 8,
    ay: 29,
    r: 7,
    live: (g, x, y, t) => {
      // four sails turning once every 14 seconds
      const cx = x
      const cy = y - 21
      g.fillStyle = '#5a4634'
      for (let s = 0; s < 4; s++) {
        const a = (t / 14) * Math.PI * 2 + (s * Math.PI) / 2
        for (let r = 1; r <= 9; r++) {
          const px = Math.round(cx + Math.cos(a) * r)
          const py = Math.round(cy + Math.sin(a) * r)
          g.fillStyle = '#6b5440'
          g.fillRect(px, py, 1, 1)
          if (r > 3) {
            g.fillStyle = '#fff7ea'
            g.fillRect(Math.round(cx + Math.cos(a + 0.22) * r), Math.round(cy + Math.sin(a + 0.22) * r), 1, 1)
          }
        }
      }
      g.fillStyle = '#4a3a2c'
      g.fillRect(cx - 1, cy - 1, 2, 2)
    },
  }
}

function snowman(): DecorArt {
  return compose(11, 16, [['snowman', 0, 0]], 5, 15, 5)
}

function icecarving(): DecorArt {
  const p = new Pix(14, 22)
  const ice = hex('#bfe4f6')
  const deep = hex('#86c2e4')
  const shine = hex('#f2fbff')
  // a plinth, then a tall faceted shape
  for (let x = 2; x < 12; x++) for (let y = 18; y < 21; y++) p.set(x, y, y === 18 ? hex('#a9b4c2') : hex('#7d8898'))
  for (let y = 2; y < 18; y++) {
    const half = Math.round(1 + Math.sin((y / 17) * Math.PI) * 4)
    for (let x = 7 - half; x <= 6 + half; x++) p.set(x, y, x < 7 ? ice : deep)
  }
  for (let y = 4; y < 14; y += 3) p.set(5, y, shine)
  outline(p, hex('#4f7ea6'))
  return {
    img: p.toCanvas(),
    ax: 7,
    ay: 20,
    r: 6,
    live: (g, x, y, t) => {
      // a glint that slides up the carving now and then
      const k = (t % 6) / 6
      if (k > 0.25) return
      g.fillStyle = '#ffffff'
      g.fillRect(x - 3 + Math.round(k * 8), y - 6 - Math.round(k * 40), 1, 2)
    },
  }
}
function aurora(): DecorArt {
  const p = new Pix(10, 24)
  for (let y = 8; y < 23; y++) for (let x = 4; x < 6; x++) p.set(x, y, x === 4 ? hex('#5a6878') : hex('#3c4858'))
  for (let x = 2; x < 8; x++) p.set(x, 23, hex('#3c4858'))
  for (let y = 1; y < 8; y++) for (let x = 2; x < 8; x++) p.set(x, y, hex('#2e3a4a'))
  for (let y = 2; y < 7; y++) for (let x = 3; x < 7; x++) p.set(x, y, hex('#9fd8c4'))
  outline(p, hex('#28303c'))
  return {
    img: p.toCanvas(),
    ax: 5,
    ay: 23,
    r: 5,
    glow: { x: 0, y: -19, r: 26, rgb: '150, 230, 200' },
    live: (g, x, y, t, night) => {
      if (night <= 0.02) return
      // the light drifts slowly between green and violet
      const k = (Math.sin((t * Math.PI * 2) / 12) + 1) / 2
      const r = Math.round(150 + k * 60)
      const gg = Math.round(230 - k * 90)
      g.globalAlpha = night
      g.fillStyle = `rgb(${r}, ${gg}, 220)`
      g.fillRect(x - 2, y - 21, 4, 5)
      g.globalAlpha = 1
    },
  }
}

function leafpile(): DecorArt {
  // a heap of Flurmimon's fallen leaves with a few loose ones
  return compose(26, 15, [['leaves-orange', 13, 2], ['leaves-heap', 2, 0], ['leaves-heap', 9, 1]], 13, 14, 6)
}

function rockpool(): DecorArt {
  // Flurmimon's stone-rimmed pool, cut down to its four corners
  const src = piece('pool')
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 22
  const g = c.getContext('2d')!
  g.drawImage(src, 0, 0, 16, 11, 0, 0, 16, 11)
  g.drawImage(src, 32, 0, 16, 11, 16, 0, 16, 11)
  g.drawImage(src, 0, 37, 16, 11, 0, 11, 16, 11)
  g.drawImage(src, 32, 37, 16, 11, 16, 11, 16, 11)
  return {
    img: c,
    ax: 16,
    ay: 21,
    r: 10,
    live: (g, x, y, t) => {
      // a slow glint on the water
      const k = (t % 5) / 5
      g.fillStyle = 'rgba(255,255,255,0.7)'
      g.fillRect(x - 6 + Math.round(k * 8), y - 13, 2, 1)
    },
  }
}

function lightningrod(): DecorArt {
  const p = new Pix(8, 26)
  const cu = hex('#d08a4a')
  const cuDark = hex('#9a5a2c')
  for (let y = 2; y < 22; y++) {
    p.set(3, y, cu)
    p.set(4, y, cuDark)
  }
  p.set(3, 1, hex('#f0c080'))
  p.set(3, 0, hex('#f0c080'))
  for (let y = 22; y < 26; y++) for (let x = 1; x < 7; x++) p.set(x, y, y === 22 ? PAL.stoneLight : PAL.stone)
  outline(p, hex('#5a3418'))
  return {
    img: p.toCanvas(),
    ax: 4,
    ay: 25,
    r: 4,
    live: (g, x, y, t) => {
      // a spark at the tip now and then, small and soft
      if (t % 7 > 0.35) return
      g.fillStyle = 'rgba(255,240,150,0.85)'
      g.fillRect(x - 1, y - 27, 2, 1)
      g.fillRect(x, y - 28, 1, 3)
    },
  }
}
function batroost(): DecorArt {
  const p = new Pix(12, 24)
  for (let y = 10; y < 24; y++) {
    p.set(5, y, PAL.woodDark)
    p.set(6, y, PAL.wood)
  }
  for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) p.set(x, y, y === 1 ? PAL.woodLight : x < 3 ? PAL.woodLight : x > 8 ? PAL.woodDark : PAL.wood)
  for (let x = 4; x < 8; x++) p.set(x, 9, hex('#2a1a0e')) // the slot underneath
  for (let x = 0; x < 12; x++) p.set(x, 0, PAL.woodDark)
  outline(p, PAL.woodGap)
  return { img: p.toCanvas(), ax: 6, ay: 23, r: 4 }
}
function mudpatch(): DecorArt {
  const p = new Pix(20, 9)
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 20; x++) {
      const d = ((x - 10) / 9.5) ** 2 + ((y - 4.5) / 4.2) ** 2
      if (d < 1) p.set(x, y, d > 0.6 ? hex('#7a5232') : bayer(x, y) > 0.6 ? hex('#8e6440') : hex('#6a4428'))
    }
  for (const [x, y] of [[6, 3], [13, 5], [9, 6]]) p.set(x, y, hex('#a87c52'))
  return { img: p.toCanvas(), ax: 10, ay: 8, r: 0 }
}

function statue(): DecorArt {
  const p = new Pix(14, 22)
  // a stone plinth with a Poké Ball on top
  for (let y = 12; y < 22; y++) for (let x = 2; x < 12; x++) p.set(x, y, y === 12 ? PAL.stoneLight : x > 9 ? PAL.stoneDark : PAL.stone)
  for (let y = 1; y < 12; y++)
    for (let x = 1; x < 13; x++) {
      const d = ((x - 7) / 5.5) ** 2 + ((y - 6.5) / 5.5) ** 2
      if (d >= 1) continue
      p.set(x, y, y === 6 || y === 7 ? PAL.stoneDark : y < 6 ? (x < 6 && y < 4 ? hex('#ff9aa0') : hex('#e2525c')) : hex('#f4f0e8'))
    }
  for (let y = 5; y < 9; y++) for (let x = 5; x < 9; x++) p.set(x, y, hex('#f4f0e8'))
  outline(p, PAL.stoneDark)
  return { img: p.toCanvas(), ax: 7, ay: 21, r: 5 }
}

const PAINTERS: Record<string, () => DecorArt> = { statue,  flowers, stones, mushrooms, sign, bench, umbrella, lantern, campfire, windmill, snowman, icecarving, aurora, leafpile, rockpool, lightningrod, batroost, mudpatch }
const cache = new Map<string, DecorArt>()
export function decorArt(id: string) {
  let a = cache.get(id)
  if (!a && PAINTERS[id]) {
    a = PAINTERS[id]()
    cache.set(id, a)
  }
  return a
}
export const decorDef = (id: string) => CATALOG.find((d) => d.id === id)
