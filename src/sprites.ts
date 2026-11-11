// PMD Collab sprite sheets: one PNG per action, 8 rows (facing directions) ×
// N columns (frames). Durations are in 1/60 s ticks. The ground point of each
// frame is taken from the matching Shadow sheet, so tall anims like Hop keep
// their feet on the island.

export interface AnimMeta {
  w: number
  h: number
  durations: number[]
}
export interface SpeciesMeta {
  name: string
  shadowSize: number
  anims: Record<string, AnimMeta>
  portraits: string[]
  credits: { sprite: { name: string; contact: string }[]; portrait: { name: string; contact: string }[] }
}
export interface Manifest {
  source: string
  commit: string
  licence: string
  species: Record<string, SpeciesMeta>
}

export interface Anim extends AnimMeta {
  img: HTMLImageElement
  rows: number
  cols: number
  total: number // ticks per loop
  ax: number
  ay: number
}

export interface Species {
  dex: string
  meta: SpeciesMeta
  anims: Record<string, Anim>
  portrait?: HTMLImageElement
}

const base = import.meta.env.BASE_URL + 'sprites/'

function load(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('failed ' + src))
    i.src = src
  })
}

/** Ground point = centre of the shadow pixels in the first frame, facing down. */
function groundPoint(shadow: HTMLImageElement, w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(shadow, 0, 0, w, h, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h).data
  let x0 = w
  let x1 = -1
  let y0 = h
  let y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3]) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  if (x1 < 0) return { ax: w / 2, ay: h / 2 + 4 }
  return { ax: (x0 + x1 + 1) / 2, ay: (y0 + y1 + 1) / 2 }
}

export async function loadManifest(): Promise<Manifest> {
  return (await fetch(base + 'manifest.json')).json()
}

export async function loadSpecies(m: Manifest, dex: string): Promise<Species> {
  const meta = m.species[dex]
  const anims: Record<string, Anim> = {}
  await Promise.all(
    Object.entries(meta.anims).map(async ([name, a]) => {
      const [img, shadow] = await Promise.all([load(`${base}${dex}/${name}-Anim.png`), load(`${base}${dex}/${name}-Shadow.png`)])
      const { ax, ay } = groundPoint(shadow, a.w, a.h)
      anims[name] = {
        ...a,
        img,
        rows: Math.max(1, Math.round(img.height / a.h)),
        cols: a.durations.length,
        total: a.durations.reduce((s, d) => s + d, 0),
        ax,
        ay,
      }
    }),
  )
  const portrait = meta.portraits.includes('Normal') ? await load(`${base}${dex}/Normal.png`).catch(() => undefined) : undefined
  return { dex, meta, anims, portrait }
}

/** Frame index for an anim that has been playing for `t` seconds. */
export function frameAt(a: Anim, t: number, loop = true) {
  let tick = t * 60
  if (loop) tick %= a.total
  else if (tick >= a.total) return a.cols - 1
  for (let i = 0; i < a.durations.length; i++) {
    tick -= a.durations[i]
    if (tick < 0) return i
  }
  return a.cols - 1
}

export function drawFrame(g: CanvasRenderingContext2D, a: Anim, frame: number, dir: number, x: number, y: number) {
  const row = a.rows === 1 ? 0 : dir % a.rows
  g.drawImage(a.img, frame * a.w, row * a.h, a.w, a.h, Math.round(x - a.ax), Math.round(y - a.ay), a.w, a.h)
}

/**
 * Sheet rows: 0 down, 1 down-right, 2 right, 3 up-right, 4 up, 5 up-left,
 * 6 left, 7 down-left. Screen angle sectors (0 = right, clockwise) map onto
 * those rows.
 */
const SECTOR_TO_ROW = [2, 1, 0, 7, 6, 5, 4, 3]
export function dirFrom(dx: number, dy: number) {
  const s = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  return SECTOR_TO_ROW[((s % 8) + 8) % 8]
}
