// Arrange mode (Paul, 2026-11-18: "make all the decorations placeable in available space on the
// island via pick/drag and drop, an edit mode where it just shows the island and not Pokémon").
//
// Decorations keep their spots (a to i) as identities, so the number you can place still opens
// with focused hours and the Pokédex, and friends' saved scenes stay valid. Each one can now
// stand anywhere it fits: fully on land, clear of the tree, bush, habitats, the nest, the tall
// grass, the pier steps and the other decorations. Positions live in save.decor.pos.
import { click } from './audio'
import { CURSOR } from './cursors'
import { CATALOG, DecorArt, SLOTS, decorArt } from './decor'
import type { Game } from './game'
import { HABITAT_SPOTS } from './habitats'
import type { Hud } from './hud'
import { H, W } from './island'
import { LANDMARK_SPOTS } from './landmarks'
import { NEST, Scene } from './scene'

interface Deps {
  canvas: HTMLCanvasElement
  scene: Scene
  game: Game
  hud: Hud
  /** Persist, publish and redraw the decorations. */
  save: () => void
}
type Oval = { x: number; y: number; rx: number; ry: number }

const opaqueCols = new WeakMap<HTMLCanvasElement, number[]>()
function cols(img: HTMLCanvasElement) {
  let c = opaqueCols.get(img)
  if (c) return c
  const d = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data
  c = []
  for (let x = 0; x < img.width; x++)
    for (let y = 0; y < img.height; y++)
      if (d[(y * img.width + x) * 4 + 3] > 40) {
        c.push(x)
        break
      }
  opaqueCols.set(img, c)
  return c
}
const foot = (art: DecorArt, x: number, y: number): Oval => {
  const c = cols(art.img)
  const w = c.length ? c[c.length - 1] - c[0] + 1 : art.img.width
  return { x: x - art.ax + (c[0] ?? 0) + w / 2, y, rx: Math.max(5, w * 0.45), ry: 5 }
}
const hits = (a: Oval, b: Oval) => ((a.x - b.x) / (a.rx + b.rx)) ** 2 + ((a.y - b.y) / (a.ry + b.ry)) ** 2 < 1

export function createArrange(d: Deps) {
  const { canvas, scene, game, hud } = d
  let active = false
  let selected: string | null = null // a slot id
  let drag: { slot: string; dx: number; dy: number; x: number; y: number; ok: boolean; moved: boolean } | null = null
  const bar = document.createElement('div')
  bar.className = 'hud-arrange px-panel'
  bar.hidden = true
  hud.el.append(bar)

  const isl = () => scene.island
  const pos = () => (game.save.decor.pos ??= {})
  const spotOf = (slot: string) => pos()[slot] ?? SLOTS.find((s) => s.id === slot)!
  /** Everything a decoration may not stand on. */
  function blocked(): Oval[] {
    const i = isl()
    const out: Oval[] = [
      { x: i.tree.x, y: i.tree.y, rx: 12, ry: 6 },
      { x: i.bush.x, y: i.bush.y, rx: 13, ry: 5 },
      { x: i.grassPatch.x, y: i.grassPatch.y, rx: i.grassPatch.r + 6, ry: i.grassPatch.r * 0.6 + 5 },
      { x: NEST.x, y: NEST.y, rx: 10, ry: 6 },
      { x: i.dock.x + i.dock.w / 2, y: i.dock.y0, rx: i.dock.w / 2 + 6, ry: 10 },
    ]
    if (scene.gate) out.push({ x: scene.gate.x, y: scene.gate.y, rx: 10, ry: 6 })
    const size: Record<string, [number, number]> = { pond: [17, 9], spring: [15, 8], rocks: [19, 6], cave: [12, 6] }
    for (const h of game.save.habitats) {
      const s = HABITAT_SPOTS[h]
      if (h === 'grass') out.push({ x: s.x, y: s.y, rx: s.r + 6, ry: s.r * 0.6 + 5 })
      else if (size[h]) out.push({ x: s.x, y: s.y, rx: size[h][0], ry: size[h][1] })
    }
    if (game.save.island === 'home') out.push({ ...LANDMARK_SPOTS.pier, rx: 16, ry: 8 })
    return out
  }
  /** Can this decoration stand here: fully on land and clear of everything else? */
  function fits(slot: string, art: DecorArt, x: number, y: number) {
    const { top, edge } = isl()
    for (const c of cols(art.img)) {
      const X = x - art.ax + c
      for (const Y of [y, y - 3]) if (X < 0 || X >= W || Y < 0 || Y >= H || !top[Y * W + X] || edge[Y * W + X] < 2) return false
    }
    const me = foot(art, x, y)
    if (blocked().some((b) => hits(me, b))) return false
    // the box an art covers on screen, shrunk a little so touching edges are fine
    const box = (a: DecorArt, px: number, py: number) => ({ x0: px - a.ax + 3, x1: px - a.ax + a.img.width - 3, y0: py - a.ay + 3, y1: py })
    const covers = (b: { x0: number; x1: number; y0: number; y1: number }, px: number, py: number) => px > b.x0 && px < b.x1 && py > b.y0 && py < b.y1
    for (const [s, id] of Object.entries(game.save.decor.slots)) {
      if (!id || s === slot) continue
      const a = decorArt(id)
      if (!a) continue
      const p = spotOf(s)
      if (hits(me, foot(a, p.x, p.y))) return false
      // neither may hide the other: the one in front can't stand over the other's foot
      if (p.y < y && covers(box(art, x, y), p.x, p.y)) return false
      if (y < p.y && covers(box(a, p.x, p.y), x, y)) return false
    }
    return true
  }
  /** The nearest spot this decoration fits, searching outward from (x, y). */
  function nearestFit(slot: string, art: DecorArt, x: number, y: number) {
    for (let r = 0; r < 120; r += 2)
      for (let k = 0; k < Math.max(1, r * 3); k++) {
        const a = (k / Math.max(1, r * 3)) * Math.PI * 2
        const px = Math.round(x + Math.cos(a) * r)
        const py = Math.round(y + Math.sin(a) * r * 0.6)
        if (fits(slot, art, px, py)) return { x: px, y: py }
      }
    return null
  }
  const toIsland = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  /** The frontmost placed decoration under the pointer. */
  function pick(x: number, y: number) {
    let best: { slot: string; y: number } | null = null
    for (const p of scene.placedDecor) {
      if (!p.slot) continue
      const x0 = p.x - p.art.ax
      const y0 = p.y - p.art.ay
      const ix = Math.floor(x - x0)
      const iy = Math.floor(y - y0)
      if (ix < 0 || iy < 0 || ix >= p.art.img.width || iy >= p.art.img.height) continue
      if (p.art.img.getContext('2d')!.getImageData(ix, iy, 1, 1).data[3] < 40) continue
      if (!best || p.y > best.y) best = { slot: p.slot, y: p.y }
    }
    return best?.slot ?? null
  }
  const redraw = () => scene.setDecor(game.save.decor.slots, pos())

  // ---------- the marker: a soft ring at the foot, gold when it fits and red when it doesn't ----------
  scene.arrangeOverlay = (g) => {
    const slot = drag?.slot ?? selected
    if (!slot) return
    const id = game.save.decor.slots[slot]
    const art = id ? decorArt(id) : undefined
    if (!art) return
    const p = drag ? drag : spotOf(slot)
    const f = foot(art, p.x, p.y)
    const ok = drag ? drag.ok : true
    g.strokeStyle = ok ? '#f8d030' : '#e84848'
    g.lineWidth = 1
    g.beginPath()
    g.ellipse(Math.round(f.x) + 0.5, Math.round(f.y) + 0.5, f.rx + 1, f.ry + 1, 0, 0, Math.PI * 2)
    g.stroke()
    if (drag) {
      // the dragged piece follows the pointer, faded where it can't go
      g.globalAlpha = ok ? 0.9 : 0.5
      g.drawImage(art.img, drag.x - art.ax, drag.y - art.ay)
      g.globalAlpha = 1
    }
  }

  // ---------- pointer ----------
  const down = (e: PointerEvent) => {
    if (!active) return
    e.preventDefault()
    e.stopImmediatePropagation()
    const { x, y } = toIsland(e)
    const slot = pick(x, y)
    selected = slot
    if (slot) {
      const p = spotOf(slot)
      drag = { slot, dx: p.x - x, dy: p.y - y, x: p.x, y: p.y, ok: true, moved: false }
      canvas.setPointerCapture(e.pointerId)
      // hide the real one while its ghost follows the pointer
      scene.setDecor({ ...game.save.decor.slots, [slot]: null }, pos())
    }
    render()
  }
  const move = (e: PointerEvent) => {
    if (!active) return
    const { x, y } = toIsland(e)
    if (!drag) {
      canvas.style.cursor = pick(x, y) ? CURSOR.grab : ''
      return
    }
    const nx = Math.round(x + drag.dx)
    const ny = Math.round(y + drag.dy)
    if (nx === drag.x && ny === drag.y) return
    drag.x = nx
    drag.y = ny
    drag.moved = true
    const art = decorArt(game.save.decor.slots[drag.slot]!)!
    drag.ok = fits(drag.slot, art, nx, ny)
    canvas.style.cursor = CURSOR.grabbing
  }
  const up = (e: PointerEvent) => {
    if (!active || !drag) return
    e.preventDefault()
    if (drag.moved && drag.ok) {
      pos()[drag.slot] = { x: drag.x, y: drag.y }
      click()
    } else if (drag.moved) hud.toast("It doesn't fit there.")
    drag = null
    redraw()
    render()
  }
  // capture phase, so the island's own tap handlers never see arrange-mode presses
  canvas.addEventListener('pointerdown', down, true)
  canvas.addEventListener('pointermove', move, true)
  canvas.addEventListener('pointerup', up, true)
  canvas.addEventListener('click', (e) => active && (e.stopImmediatePropagation(), e.preventDefault()), true)

  // ---------- the bar: what's selected, what's stored, Done ----------
  function render() {
    const s = game.save.decor
    const open = SLOTS.filter((sl) => game.slotOpen(sl))
    const free = open.filter((sl) => !s.slots[sl.id])
    const placed = new Set(Object.values(s.slots).filter(Boolean))
    const stored = s.owned.filter((id) => !placed.has(id) && CATALOG.some((c) => c.id === id && (!c.frost || game.frostOpen)))
    const name = (id: string) => CATALOG.find((c) => c.id === id)?.name ?? id
    const sel = selected && s.slots[selected] ? name(s.slots[selected]!) : null
    bar.innerHTML = `
      <p>${sel ? `${sel}. Drag it to move it.` : 'Drag a decoration to move it. Tap one to choose it.'}</p>
      ${stored.length ? `<p class="hint">${free.length ? `${free.length} free ${free.length === 1 ? 'spot' : 'spots'}. Tap a stored one to place it.` : 'No free spots. Put one away to make room.'}</p><div class="row-actions">${stored.map((id) => `<button class="px-btn small" data-a-place="${id}" ${free.length ? '' : 'disabled'}>${name(id)}</button>`).join('')}</div>` : ''}
      <div class="row-actions">
        ${sel ? '<button class="px-btn small" data-a-store="1">Put away</button>' : ''}
        <button class="px-btn small primary" data-a-done="1">Done</button>
      </div>`
  }
  bar.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!t) return
    e.stopPropagation()
    const s = game.save.decor
    if (t.dataset.aDone) return close()
    if (t.dataset.aStore && selected) {
      s.slots[selected] = null
      delete pos()[selected]
      selected = null
      redraw()
      return render()
    }
    const id = t.dataset.aPlace
    if (id) {
      const slot = SLOTS.find((sl) => game.slotOpen(sl) && !s.slots[sl.id])
      const art = decorArt(id)
      if (!slot || !art) return
      // it goes to the nearest open ground to the middle of the island
      const at = nearestFit(slot.id, art, 120, 100)
      if (!at) return hud.toast('There is no room for it.')
      s.slots[slot.id] = id
      pos()[slot.id] = at
      selected = slot.id
      redraw()
      render()
    }
  })

  function open(select?: string) {
    if (game.inSession) return hud.toast('Arrange the island at your break.')
    active = true
    scene.arranging = true
    hud.closeSheet()
    hud.hideSummary()
    hud.el.classList.add('arranging')
    selected = select ? (Object.entries(game.save.decor.slots).find(([, v]) => v === select)?.[0] ?? null) : null
    bar.hidden = false
    render()
  }
  function close() {
    active = false
    drag = null
    selected = null
    scene.arranging = false
    hud.el.classList.remove('arranging')
    bar.hidden = true
    canvas.style.cursor = ''
    d.save()
  }
  return {
    open,
    close,
    get active() {
      return active
    },
    /** Can this decoration go somewhere free right now (for Buy and Place)? Places it if so. */
    placeNew(id: string) {
      const s = game.save.decor
      const slot = SLOTS.find((sl) => game.slotOpen(sl) && !s.slots[sl.id])
      const art = decorArt(id)
      if (!slot || !art) return false
      const at = nearestFit(slot.id, art, 120, 100)
      if (!at) return false
      s.slots[slot.id] = id
      pos()[slot.id] = at
      return true
    },
  }
}
