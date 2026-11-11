// Per-pixel 2D lighting, after the Moonfell pixel lighter: every sprite and
// prop gets a normal map generated from its own silhouette (a soft bevel, so
// edges lean outward), the scene's normals are drawn into a second buffer in
// the same order as the colours, and each light shades a pixel by how much it
// faces the light, fading with distance. Night is a dark, cool ambient that
// the lights add to, so a Pokémon beside the campfire lights up on the side
// facing it and stays dark on the far side.
//
// Everything runs on the CPU at the island's 240×180, only when it is dark
// enough to matter (dusk, night, dungeons).

export interface Light {
  x: number
  y: number
  z: number // height above the ground, in island pixels
  r: number // reach
  color: [number, number, number] // 0..1
  power: number
}

const BEVEL = 3 // how many pixels in from the edge a silhouette rounds off
const STRENGTH = 2.6 // how steeply the bevel leans
const normals = new WeakMap<CanvasImageSource, HTMLCanvasElement>()

/**
 * A normal map for an image (a whole sprite sheet works: frames are separated
 * by transparent pixels). Opaque pixels near the silhouette's edge tilt
 * outward; a little of the colour's brightness adds surface detail.
 */
export function normalMapFor(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const hit = normals.get(img)
  if (hit) return hit
  const w = img.width
  const h = img.height
  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  const sg = src.getContext('2d', { willReadFrequently: true })!
  sg.drawImage(img, 0, 0)
  const px = sg.getImageData(0, 0, w, h).data
  // distance (in pixels, up to BEVEL) to the nearest transparent pixel
  const dist = new Uint8Array(w * h)
  const q: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] < 128) {
      dist[i] = 0
      q.push(i)
    } else dist[i] = 255
  }
  for (let head = 0; head < q.length; head++) {
    const i = q[head]
    const d = dist[i]
    if (d >= BEVEL) continue
    const x = i % w
    const y = (i / w) | 0
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
    for (const j of nb) if (j >= 0 && dist[j] > d + 1) {
      dist[j] = d + 1
      q.push(j)
    }
  }
  const height = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] < 128) continue
    const lum = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255
    height[i] = Math.min(dist[i], BEVEL) / BEVEL + lum * 0.12
  }
  const out = sg.createImageData(w, h)
  const o = out.data
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : height[y * w + x])
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (px[i * 4 + 3] < 128) continue
      let nx = (at(x - 1, y) - at(x + 1, y)) * STRENGTH
      let ny = (at(x, y - 1) - at(x, y + 1)) * STRENGTH
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      o[i * 4] = (nx * 0.5 + 0.5) * 255
      o[i * 4 + 1] = (ny * 0.5 + 0.5) * 255
      o[i * 4 + 2] = (nz * 0.5 + 0.5) * 255
      o[i * 4 + 3] = 255
    }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(out, 0, 0)
  normals.set(img, c)
  return c
}

let accBuf = new Float32Array(0)

/** A flat-ground normal, encoded. */
export const FLAT = 'rgb(128,128,255)'

/**
 * Light the colours in `g` using the normals in `n`. `ambient` is the night's
 * base light (the existing day/night tint as 0..1 RGB).
 */
export function applyLighting(g: CanvasRenderingContext2D, n: CanvasRenderingContext2D, ambient: [number, number, number], lights: Light[]) {
  const W = g.canvas.width
  const H = g.canvas.height
  const img = g.getImageData(0, 0, W, H)
  const c = img.data
  const nd = n.getImageData(0, 0, W, H).data
  // accumulated light per pixel, starting at the ambient (one buffer, reused every frame)
  if (accBuf.length !== W * H * 3) accBuf = new Float32Array(W * H * 3)
  const acc = accBuf
  for (let i = 0; i < W * H; i++) {
    acc[i * 3] = ambient[0]
    acc[i * 3 + 1] = ambient[1]
    acc[i * 3 + 2] = ambient[2]
  }
  for (const L of lights) {
    const x0 = Math.max(0, Math.floor(L.x - L.r))
    const x1 = Math.min(W - 1, Math.ceil(L.x + L.r))
    const y0 = Math.max(0, Math.floor(L.y - L.r))
    const y1 = Math.min(H - 1, Math.ceil(L.y + L.r))
    const r2 = L.r * L.r
    const z2 = L.z * L.z
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = L.x - x
        const dy = L.y - y
        const d2 = dx * dx + dy * dy
        if (d2 > r2) continue
        const d = Math.sqrt(d2)
        const i = y * W + x
        const nx = nd[i * 4] / 127.5 - 1
        const ny = nd[i * 4 + 1] / 127.5 - 1
        const nz = nd[i * 4 + 2] / 127.5 - 1
        const len = Math.sqrt(d2 + z2)
        const ndl = Math.max(0, (nx * dx + ny * dy + nz * L.z) / len)
        const fall = 1 - d / L.r
        // a little wrap so the light still reads on surfaces turned away
        const k = L.power * fall * fall * (0.2 + 0.8 * ndl)
        acc[i * 3] += L.color[0] * k
        acc[i * 3 + 1] += L.color[1] * k
        acc[i * 3 + 2] += L.color[2] * k
      }
  }
  for (let i = 0; i < W * H; i++) {
    c[i * 4] = Math.min(255, c[i * 4] * acc[i * 3])
    c[i * 4 + 1] = Math.min(255, c[i * 4 + 1] * acc[i * 3 + 1])
    c[i * 4 + 2] = Math.min(255, c[i * 4 + 2] * acc[i * 3 + 2])
  }
  g.putImageData(img, 0, 0)
}
