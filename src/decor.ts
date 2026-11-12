// Decorations: bought with shells (1 per focused minute), placed on one of a
// few fixed spots so a tiny window never needs a drag-and-drop editor. They are
// expression only: nothing here changes odds, growth or what friends see.
import { PAL, onIsland } from './island'
import { Pix, RGB, bayer, hex } from './pixel'

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
export const SLOTS: { id: string; x: number; y: number; minHours?: number; milestone?: number }[] = [
  { id: 'a', ...onIsland(98, 70) },
  { id: 'b', ...onIsland(134, 63) },
  { id: 'c', ...onIsland(182, 88) },
  { id: 'd', ...onIsland(176, 120) },
  { id: 'e', ...onIsland(100, 126) },
  { id: 'f', ...onIsland(157, 122) }, // moved right so the umbrella clears the dungeon doorway
  // the island grows: two more spots after 3 focused hours
  { id: 'g', ...onIsland(188, 76), minHours: 3 },
  { id: 'h', ...onIsland(58, 100), minHours: 3 },
  // a Pokédex milestone (75%) opens one more (L5)
  { id: 'i', ...onIsland(130, 114), milestone: 1 },
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
  const p = new Pix(18, 10)
  for (let y = 4; y < 10; y++) for (let x = 1; x < 17; x++) if (((x - 9) / 8) ** 2 + ((y - 6.5) / 3.5) ** 2 < 1) p.set(x, y, bayer(x, y) > 0.5 ? hex('#8a5a35') : hex('#7a4e2c'))
  const cols = [PAL.flowerA, PAL.flowerB, PAL.flowerC, PAL.flowerB, PAL.flowerA]
  ;[[4, 4], [7, 2], [10, 4], [13, 3], [9, 6], [5, 7], [12, 7]].forEach(([x, y], i) => {
    p.set(x, y + 1, PAL.grassDeep)
    const c = cols[i % cols.length]
    p.set(x, y, c)
    p.set(x - 1, y, c)
    p.set(x + 1, y, c)
    p.set(x, y - 1, c)
    p.set(x, y, PAL.flowerC)
  })
  return { img: p.toCanvas(), ax: 9, ay: 8, r: 8 }
}

function stones(): DecorArt {
  const p = new Pix(22, 10)
  for (const [cx, cy, rx, ry] of [[4, 6, 3, 2], [11, 4, 3.5, 2], [18, 6, 3, 2], [11, 8, 2.5, 1.5]] as const)
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 22; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        if (d < 1) p.set(x, y, d > 0.6 ? PAL.stoneDark : x - cx + (y - cy) < 0 ? PAL.stoneLight : PAL.stone)
      }
  return { img: p.toCanvas(), ax: 11, ay: 9, r: 0 }
}

function mushrooms(): DecorArt {
  const p = new Pix(18, 10)
  const cap = hex('#d8434c')
  const capDark = hex('#a8303a')
  ;[[3, 6], [8, 3], [14, 5], [11, 8], [5, 9]].forEach(([x, y], i) => {
    const s = i % 2 ? 1 : 2
    p.set(x, y, hex('#f2e6cf'))
    p.set(x, y - 1, hex('#f2e6cf'))
    for (let dx = -s; dx <= s; dx++) p.set(x + dx, y - 2, dx > 0 ? capDark : cap)
    for (let dx = -s + 1; dx <= s - 1; dx++) p.set(x + dx, y - 3, cap)
    p.set(x - (s > 1 ? 1 : 0), y - 2, hex('#ffffff'))
  })
  return { img: p.toCanvas(), ax: 9, ay: 9, r: 7 }
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
  const p = new Pix(24, 26)
  const red = hex('#e2525c')
  const white = hex('#fff7ea')
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 24; x++) {
      const d = ((x - 12) / 11.5) ** 2 + ((y - 9) / 9) ** 2
      if (d < 1 && y < 10) {
        const stripe = Math.floor(Math.atan2(y - 10, x - 12) * 3) % 2 === 0
        p.set(x, y, y === 9 ? hex('#b63c47') : stripe ? red : white)
      }
    }
  for (let y = 10; y < 26; y++) p.set(12, y, hex('#e9dcc2'))
  outline(p, hex('#8c3038'))
  return { img: p.toCanvas(), ax: 12, ay: 25, r: 5 }
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
  const p = new Pix(14, 20)
  const snow = hex('#f4f8fc')
  const shade = hex('#cfdced')
  const disc = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        const d = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r)
        if (d <= 1) p.set(x, y, x - cx + (y - cy) > r * 0.45 ? shade : snow)
      }
  }
  disc(7, 14, 5)
  disc(7, 6, 4)
  p.set(5, 5, hex('#2e3440'))
  p.set(8, 5, hex('#2e3440'))
  p.set(7, 7, hex('#e8803a'))
  p.set(8, 7, hex('#c86424'))
  for (let x = 3; x < 12; x++) p.set(x, 10, hex('#c84848'))
  p.set(10, 11, hex('#c84848'))
  p.set(10, 12, hex('#a83838'))
  p.set(7, 13, hex('#2e3440'))
  p.set(7, 15, hex('#2e3440'))
  outline(p, hex('#8aa0bb'))
  return { img: p.toCanvas(), ax: 7, ay: 19, r: 6 }
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
  const p = new Pix(16, 9)
  const cols = [hex('#d9893a'), hex('#c4632c'), hex('#e8b04a'), hex('#a8512a')]
  for (let y = 2; y < 9; y++)
    for (let x = 0; x < 16; x++) {
      const d = ((x - 8) / 7.5) ** 2 + ((y - 8) / 6) ** 2
      if (d < 1) p.set(x, y, cols[Math.floor(bayer(x * 3, y * 5) * 4)])
    }
  for (const [x, y] of [[4, 4], [9, 3], [12, 5], [7, 6]]) p.set(x, y, hex('#f0c870'))
  outline(p, hex('#7a3a1c'))
  return { img: p.toCanvas(), ax: 8, ay: 8, r: 6 }
}
function rockpool(): DecorArt {
  const p = new Pix(22, 12)
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 22; x++) {
      const d = ((x - 11) / 10.5) ** 2 + ((y - 6) / 5.5) ** 2
      if (d >= 1) continue
      if (d > 0.55) p.set(x, y, bayer(x, y) > 0.5 ? PAL.stone : x + y < 14 ? PAL.stoneLight : PAL.stoneDark)
      else p.set(x, y, d > 0.35 ? PAL.sea : bayer(x, y) > 0.7 ? PAL.shallow2 : PAL.shallow)
    }
  outline(p, PAL.stoneDark)
  return {
    img: p.toCanvas(),
    ax: 11,
    ay: 11,
    r: 9,
    live: (g, x, y, t) => {
      // a slow glint on the water
      const k = (t % 5) / 5
      g.fillStyle = 'rgba(255,255,255,0.7)'
      g.fillRect(x - 4 + Math.round(k * 6), y - 6, 2, 1)
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
