// The dungeon editor: a whiteboard for building dungeons out of preset pieces.
// Drag rooms, caverns, ponds, grass and walls from the left onto the board,
// then move and resize them; add props and Pokémon the same way. Everything
// stays movable; the tiles are rebuilt from the pieces on every change.
// Maps save in the browser, export and import as JSON, and in dev "Save to
// project" writes public/dungeons/<id>.json so a map can ship with the game.
import './editor.css'
import { DungeonMap, Entity, EntityKind, PRESETS, Piece, PieceType, Prop, PropKind, T, TILE, Theme, bakeMap, compose, emptyMap, paintProp, uid, walkableTile } from '../dungeon/map'
import { applyLighting } from '../lighting'

const BASE = import.meta.env.BASE_URL
const STORE = 'island-dungeons'
const portrait = (dex: number) => `${BASE}sprites/${String(dex).padStart(4, '0')}/Normal.png`

type Sel = { kind: 'piece' | 'prop' | 'entity'; id: string } | null
type Tool = 'select' | 'floor' | 'wall' | 'water' | 'grass' | 'erase'

let map: DungeonMap = loadCurrent()
let sel: Sel = null
let tool: Tool = 'select'
let lit = false
let showGrid = true
const view = { x: -40, y: -40, z: 2 } // world px at the board's top-left, and zoom
const undo: string[] = []
const redo: string[] = []
let species: { dex: number; name: string }[] = []
let enemyDex = 74
let enemyLevel = 20

function loadStore(): Record<string, DungeonMap> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}')
  } catch {
    return {}
  }
}
function loadCurrent(): DungeonMap {
  const id = localStorage.getItem(STORE + '-current')
  const s = loadStore()
  return (id && s[id]) || emptyMap()
}
function saveLocal() {
  const s = loadStore()
  s[map.id] = map
  localStorage.setItem(STORE, JSON.stringify(s))
  localStorage.setItem(STORE + '-current', map.id)
}
/** Record the state before a change, for undo. */
function commit() {
  undo.push(JSON.stringify(map))
  if (undo.length > 120) undo.shift()
  redo.length = 0
}
function changed() {
  dirty = true
  saveLocal()
  renderInspector()
  draw()
}

// ---------- layout ----------
const root = document.getElementById('editor')!
root.innerHTML = `
  <div class="bar">
    <span class="brand">DUNGEON EDITOR</span>
    <input class="in name" data-k="name" />
    <select class="in" data-k="theme"><option value="cave">Cave</option><option value="forest">Forest</option><option value="ice">Ice</option><option value="volcano">Volcano</option></select>
    <label class="inl">Size <input class="in num" data-k="w" type="number" min="16" max="160" /> × <input class="in num" data-k="h" type="number" min="12" max="120" /></label>
    <label class="inl">Dark <input data-k="dark" type="range" min="0" max="1" step="0.05" /></label>
    <span class="sep"></span>
    <button class="b" data-a="new">New</button>
    <select class="in" data-a="open"><option value="">Open…</option></select>
    <button class="b" data-a="save">Save</button>
    <button class="b" data-a="export">Export</button>
    <button class="b" data-a="import">Import</button>
    <span class="sep"></span>
    <button class="b" data-a="undo" title="Cmd/Ctrl+Z">Undo</button>
    <button class="b" data-a="redo" title="Shift+Cmd/Ctrl+Z">Redo</button>
    <span class="sep"></span>
    <button class="b on" data-a="grid">Grid</button>
    <button class="b" data-a="lit">Lit preview</button>
    <span class="sep"></span>
    <button class="b gold" data-a="play">Play test</button>
    <input type="file" accept=".json,application/json" hidden />
  </div>
  <aside class="side left"></aside>
  <div class="board"><canvas></canvas><div class="help">Drag empty space to pan · scroll to zoom · Delete removes · Cmd/Ctrl+D duplicates · [ ] reorder rooms</div></div>
  <aside class="side right"></aside>`
const bar = root.querySelector<HTMLElement>('.bar')!
const left = root.querySelector<HTMLElement>('.side.left')!
const right = root.querySelector<HTMLElement>('.side.right')!
const board = root.querySelector<HTMLElement>('.board')!
const cv = board.querySelector('canvas')!
const ctx = cv.getContext('2d')!
const fileIn = bar.querySelector<HTMLInputElement>('input[type=file]')!

// ---------- palette ----------
const PIECE_COLORS: Record<PieceType, string> = { room: '#8a7f72', cavern: '#a08e78', pond: '#3a72b8', grass: '#4f8a3e', wall: '#3c342e' }
function renderPalette() {
  const piece = PRESETS.map((p, i) => `<div class="chip" draggable="true" data-drag='{"what":"piece","i":${i}}'><span class="sw" style="background:${PIECE_COLORS[p.type]};${p.type === 'cavern' || p.type === 'pond' || p.type === 'grass' ? 'border-radius:50%' : ''}"></span>${p.label}</div>`).join('')
  const props = (['torch', 'crystal', 'rock', 'tree'] as PropKind[]).map((k) => `<div class="chip" draggable="true" data-drag='{"what":"prop","kind":"${k}"}'><canvas data-prop="${k}"></canvas>${k[0].toUpperCase() + k.slice(1)}</div>`).join('')
  const ents = (['start', 'exit', 'enemy', 'boss'] as EntityKind[]).map((k) => `<div class="chip" draggable="true" data-drag='{"what":"entity","kind":"${k}"}'>${entityIcon(k)}${k === 'start' ? 'Start' : k === 'exit' ? 'Exit' : k === 'enemy' ? 'Pokémon' : 'Boss'}</div>`).join('')
  left.innerHTML = `
    <h3>TOOLS</h3>
    <div class="tools">
      ${(['select', 'floor', 'wall', 'water', 'grass', 'erase'] as Tool[]).map((t) => `<button class="b${tool === t ? ' on' : ''}" data-tool="${t}">${t === 'select' ? 'Select' : t === 'erase' ? 'Erase' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
    </div>
    <p class="hint">Brushes paint single tiles on top of the pieces. Erase removes a touch-up.</p>
    <h3>PIECES</h3><div class="grid2">${piece}</div>
    <h3>PROPS</h3><div class="grid2">${props}</div>
    <h3>POKÉMON</h3>
    <div class="pick"><select class="in" data-k="enemyDex">${species.map((s) => `<option value="${s.dex}"${s.dex === enemyDex ? ' selected' : ''}>${s.name}</option>`).join('')}</select><input class="in num" data-k="enemyLevel" type="number" min="1" max="100" value="${enemyLevel}" /></div>
    <p class="hint">New Pokémon and bosses use this species and level.</p>
    <div class="grid2">${ents}</div>`
  left.querySelectorAll<HTMLCanvasElement>('canvas[data-prop]').forEach((c) => {
    const art = paintProp(map.theme, c.dataset.prop as PropKind)
    c.width = art.img.width
    c.height = art.img.height
    c.style.width = `${art.img.width * 2}px`
    c.style.height = `${art.img.height * 2}px`
    c.getContext('2d')!.drawImage(art.img, 0, 0)
  })
}
function entityIcon(k: EntityKind) {
  const c = k === 'start' ? '#58d058' : k === 'exit' ? '#f8d060' : k === 'boss' ? '#ff6a5a' : '#6aa8ff'
  return `<span class="sw" style="background:${c};width:22px;border-radius:50%"></span>`
}

// ---------- the toolbar ----------
function syncBar() {
  ;(bar.querySelector('[data-k=name]') as HTMLInputElement).value = map.name
  ;(bar.querySelector('[data-k=theme]') as HTMLSelectElement).value = map.theme
  ;(bar.querySelector('[data-k=w]') as HTMLInputElement).value = String(map.w)
  ;(bar.querySelector('[data-k=h]') as HTMLInputElement).value = String(map.h)
  ;(bar.querySelector('[data-k=dark]') as HTMLInputElement).value = String(map.dark)
}
bar.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement
  const k = t.dataset.k
  if (t.dataset.a === 'open') return void openMap(t.value)
  if (!k) return
  commit()
  if (k === 'name') map.name = t.value.slice(0, 40)
  if (k === 'theme') {
    map.theme = t.value as Theme
    renderPalette()
  }
  if (k === 'w') map.w = Math.max(16, Math.min(160, Number(t.value) | 0))
  if (k === 'h') map.h = Math.max(12, Math.min(120, Number(t.value) | 0))
  if (k === 'dark') map.dark = Number(t.value)
  changed()
})
bar.addEventListener('click', async (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a
  if (!a) return
  if (a === 'new') {
    commit()
    map = emptyMap()
    sel = null
    syncBar()
    renderPalette()
    changed()
  }
  if (a === 'save') {
    saveLocal()
    if (import.meta.env.DEV) {
      const r = await fetch('/__dungeon', { method: 'POST', body: JSON.stringify(map) })
      flash(r.ok ? `Saved to project as public/dungeons/${map.id}.json` : 'Saved in this browser (project save failed)')
      void refreshOpen()
    } else flash('Saved in this browser')
  }
  if (a === 'export') {
    const blob = new Blob([JSON.stringify(map, null, 1)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${map.id}.json`
    link.click()
  }
  if (a === 'import') fileIn.click()
  if (a === 'undo') doUndo()
  if (a === 'redo') doRedo()
  if (a === 'grid') {
    showGrid = !showGrid
    ;(e.target as HTMLElement).classList.toggle('on', showGrid)
    draw()
  }
  if (a === 'lit') {
    lit = !lit
    ;(e.target as HTMLElement).classList.toggle('on', lit)
    dirty = true
    draw()
  }
  if (a === 'play') {
    localStorage.setItem('island-dungeon-play', JSON.stringify(map))
    window.open(`${BASE}dungeon.html?map=play`, '_blank')
  }
})
fileIn.addEventListener('change', async () => {
  const f = fileIn.files?.[0]
  if (!f) return
  try {
    const m = JSON.parse(await f.text()) as DungeonMap
    if (m.v !== 1 || !Array.isArray(m.pieces)) throw new Error('not a dungeon map')
    commit()
    map = { ...emptyMap(), ...m }
    sel = null
    syncBar()
    renderPalette()
    changed()
  } catch (err) {
    flash(`Could not import: ${String(err)}`)
  }
  fileIn.value = ''
})
async function refreshOpen() {
  const sel = bar.querySelector<HTMLSelectElement>('[data-a=open]')!
  const local = Object.values(loadStore())
  let official: { id: string; name: string }[] = []
  try {
    official = await (await fetch(`${BASE}dungeons/index.json?v=${Date.now()}`)).json()
  } catch {}
  sel.innerHTML = `<option value="">Open…</option>` + (official.length ? `<optgroup label="In the game">${official.map((o) => `<option value="game:${o.id}">${o.name}</option>`).join('')}</optgroup>` : '') + `<optgroup label="This browser">${local.map((m) => `<option value="local:${m.id}">${m.name}</option>`).join('')}</optgroup>`
}
async function openMap(v: string) {
  if (!v) return
  commit()
  if (v.startsWith('game:')) map = await (await fetch(`${BASE}dungeons/${v.slice(5)}.json?v=${Date.now()}`)).json()
  else map = loadStore()[v.slice(6)] ?? map
  sel = null
  syncBar()
  renderPalette()
  changed()
  void refreshOpen()
}
function doUndo() {
  const s = undo.pop()
  if (!s) return
  redo.push(JSON.stringify(map))
  map = JSON.parse(s)
  syncBar()
  changed()
}
function doRedo() {
  const s = redo.pop()
  if (!s) return
  undo.push(JSON.stringify(map))
  map = JSON.parse(s)
  syncBar()
  changed()
}
let flashTimer = 0
function flash(t: string) {
  const help = board.querySelector<HTMLElement>('.help')!
  help.textContent = t
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => (help.textContent = 'Drag empty space to pan · scroll to zoom · Delete removes · Cmd/Ctrl+D duplicates · [ ] reorder rooms'), 3500)
}

// ---------- palette events ----------
left.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')
  if (t) {
    tool = t.dataset.tool as Tool
    renderPalette()
  }
})
left.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement
  if (t.dataset.k === 'enemyDex') enemyDex = Number(t.value)
  if (t.dataset.k === 'enemyLevel') enemyLevel = Math.max(1, Math.min(100, Number(t.value) | 0))
})
left.addEventListener('dragstart', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]')
  if (t) e.dataTransfer!.setData('text/plain', t.dataset.drag!)
})
board.addEventListener('dragover', (e) => e.preventDefault())
board.addEventListener('drop', (e) => {
  e.preventDefault()
  const raw = e.dataTransfer?.getData('text/plain')
  if (!raw) return
  const d = JSON.parse(raw)
  const { tx, ty } = toTile(e)
  commit()
  if (d.what === 'piece') {
    const pr = PRESETS[d.i]
    const p: Piece = { id: uid(), type: pr.type, x: tx - (pr.w >> 1), y: ty - (pr.h >> 1), w: pr.w, h: pr.h }
    map.pieces.push(p)
    sel = { kind: 'piece', id: p.id }
  } else if (d.what === 'prop') {
    const p: Prop = { id: uid(), kind: d.kind, x: tx, y: ty }
    map.props.push(p)
    sel = { kind: 'prop', id: p.id }
  } else {
    // only one start, one exit and one boss
    if (d.kind !== 'enemy') map.entities = map.entities.filter((x) => x.kind !== d.kind)
    const en: Entity = { id: uid(), kind: d.kind, x: tx, y: ty }
    if (d.kind === 'enemy' || d.kind === 'boss') {
      en.dex = enemyDex
      en.level = enemyLevel
    }
    map.entities.push(en)
    sel = { kind: 'entity', id: en.id }
  }
  tool = 'select'
  renderPalette()
  changed()
})

// ---------- board: coordinates, hits, dragging ----------
function toWorld(e: { clientX: number; clientY: number }) {
  const r = cv.getBoundingClientRect()
  return { wx: view.x + (e.clientX - r.left) / view.z, wy: view.y + (e.clientY - r.top) / view.z }
}
function toTile(e: { clientX: number; clientY: number }) {
  const { wx, wy } = toWorld(e)
  return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE), wx, wy }
}
function hit(tx: number, ty: number): Sel {
  for (let i = map.entities.length - 1; i >= 0; i--) if (map.entities[i].x === tx && map.entities[i].y === ty) return { kind: 'entity', id: map.entities[i].id }
  for (let i = map.props.length - 1; i >= 0; i--) if (map.props[i].x === tx && map.props[i].y === ty) return { kind: 'prop', id: map.props[i].id }
  for (let i = map.pieces.length - 1; i >= 0; i--) {
    const p = map.pieces[i]
    if (tx >= p.x && ty >= p.y && tx < p.x + p.w && ty < p.y + p.h) return { kind: 'piece', id: p.id }
  }
  return null
}
const selected = () =>
  !sel ? null : sel.kind === 'piece' ? map.pieces.find((p) => p.id === sel!.id) : sel.kind === 'prop' ? map.props.find((p) => p.id === sel!.id) : map.entities.find((p) => p.id === sel!.id)

type Drag = { mode: 'pan' | 'move' | 'resize' | 'paint'; sx: number; sy: number; vx: number; vy: number; ox: number; oy: number; ow: number; oh: number; moved: boolean }
let drag: Drag | null = null
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId)
  const { tx, ty, wx, wy } = toTile(e)
  const base = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, ox: 0, oy: 0, ow: 0, oh: 0, moved: false }
  if (e.button === 1 || e.button === 2 || e.shiftKey) return void (drag = { mode: 'pan', ...base })
  if (tool !== 'select') {
    commit()
    paintAt(tx, ty)
    return void (drag = { mode: 'paint', ...base })
  }
  // the resize handle of the selected piece (bottom-right corner)
  const s = selected()
  if (sel?.kind === 'piece' && s) {
    const p = s as Piece
    const hx = (p.x + p.w) * TILE
    const hy = (p.y + p.h) * TILE
    if (Math.abs(wx - hx) * view.z < 10 && Math.abs(wy - hy) * view.z < 10) {
      commit()
      return void (drag = { mode: 'resize', ...base, ow: p.w, oh: p.h })
    }
  }
  sel = hit(tx, ty)
  const o = selected()
  if (o) {
    commit()
    drag = { mode: 'move', ...base, ox: o.x, oy: o.y }
  } else drag = { mode: 'pan', ...base }
  renderInspector()
  draw()
})
cv.addEventListener('pointermove', (e) => {
  if (!drag) return
  const dx = (e.clientX - drag.sx) / view.z
  const dy = (e.clientY - drag.sy) / view.z
  if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true
  if (drag.mode === 'pan') {
    view.x = drag.vx - dx
    view.y = drag.vy - dy
    return draw()
  }
  if (drag.mode === 'paint') {
    const { tx, ty } = toTile(e)
    paintAt(tx, ty)
    return
  }
  const o = selected()
  if (!o) return
  if (drag.mode === 'move') {
    o.x = drag.ox + Math.round(dx / TILE)
    o.y = drag.oy + Math.round(dy / TILE)
  } else {
    const p = o as Piece
    p.w = Math.max(1, drag.ow + Math.round(dx / TILE))
    p.h = Math.max(1, drag.oh + Math.round(dy / TILE))
  }
  dirty = true
  draw()
})
cv.addEventListener('pointerup', () => {
  if (drag && drag.mode !== 'pan') {
    if (!drag.moved && drag.mode !== 'paint') undo.pop() // a click, not a change
    changed()
  }
  drag = null
})
cv.addEventListener('contextmenu', (e) => e.preventDefault())
cv.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    const before = toWorld(e)
    view.z = Math.max(0.5, Math.min(6, view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
    const after = toWorld(e)
    view.x += before.wx - after.wx
    view.y += before.wy - after.wy
    draw()
  },
  { passive: false },
)
function paintAt(tx: number, ty: number) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return
  const k = `${tx},${ty}`
  if (tool === 'erase') delete map.paint[k]
  else map.paint[k] = tool === 'floor' ? T.Floor : tool === 'wall' ? T.Wall : tool === 'water' ? T.Water : T.Grass
  dirty = true
  draw()
}
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select')) return
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    return e.shiftKey ? doRedo() : doUndo()
  }
  const o = selected()
  if (!o || !sel) return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    commit()
    if (sel.kind === 'piece') map.pieces = map.pieces.filter((p) => p.id !== sel!.id)
    if (sel.kind === 'prop') map.props = map.props.filter((p) => p.id !== sel!.id)
    if (sel.kind === 'entity') map.entities = map.entities.filter((p) => p.id !== sel!.id)
    sel = null
    return changed()
  }
  if (mod && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    commit()
    const copy = { ...o, id: uid(), x: o.x + 2, y: o.y + 2 }
    if (sel.kind === 'piece') map.pieces.push(copy as Piece)
    if (sel.kind === 'prop') map.props.push(copy as Prop)
    if (sel.kind === 'entity') {
      if ((copy as Entity).kind !== 'enemy') return
      map.entities.push(copy as Entity)
    }
    sel = { kind: sel.kind, id: copy.id }
    return changed()
  }
  const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  if (step[e.key]) {
    e.preventDefault()
    commit()
    o.x += step[e.key][0]
    o.y += step[e.key][1]
    return changed()
  }
  if (sel.kind === 'piece' && (e.key === '[' || e.key === ']')) {
    commit()
    const i = map.pieces.findIndex((p) => p.id === sel!.id)
    const j = e.key === '[' ? Math.max(0, i - 1) : Math.min(map.pieces.length - 1, i + 1)
    const [p] = map.pieces.splice(i, 1)
    map.pieces.splice(j, 0, p)
    changed()
  }
})

// ---------- the inspector ----------
function renderInspector() {
  const o = selected()
  let body = ''
  if (!o || !sel) body = `<p class="hint">Select a piece, prop or Pokémon to edit it. Drag new ones in from the left.</p>`
  else if (sel.kind === 'piece') {
    const p = o as Piece
    body = `<h3>PIECE</h3>
      <div class="field"><span>Type</span><select class="in" data-f="type">${(['room', 'cavern', 'pond', 'grass', 'wall'] as PieceType[]).map((t) => `<option${t === p.type ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      ${(['x', 'y', 'w', 'h'] as const).map((k) => `<div class="field"><span>${k.toUpperCase()}</span><input class="in" type="number" data-f="${k}" value="${p[k]}" /></div>`).join('')}
      <p class="hint">Drag the corner handle to resize. [ and ] move it under or over other pieces.</p>`
  } else if (sel.kind === 'prop') {
    const p = o as Prop
    body = `<h3>PROP</h3><div class="field"><span>Kind</span><select class="in" data-f="kind">${(['torch', 'crystal', 'rock', 'tree'] as PropKind[]).map((k) => `<option${k === p.kind ? ' selected' : ''}>${k}</option>`).join('')}</select></div>`
  } else {
    const en = o as Entity
    const mon = en.kind === 'enemy' || en.kind === 'boss'
    body = `<h3>${en.kind.toUpperCase()}</h3>
      ${mon ? `<div class="field"><img class="sel-face" src="${portrait(en.dex ?? 1)}" alt="" /><span></span></div>
      <div class="field"><span>Species</span><select class="in" data-f="dex">${species.map((s) => `<option value="${s.dex}"${s.dex === en.dex ? ' selected' : ''}>${s.name}</option>`).join('')}</select></div>
      <div class="field"><span>Level</span><input class="in" type="number" min="1" max="100" data-f="level" value="${en.level ?? 10}" /></div>` : ''}
      <div class="field"><span>Tile</span><span>${en.x}, ${en.y}</span></div>`
  }
  right.innerHTML = body + `<button class="b" data-del style="margin-top:10px"${o ? '' : ' hidden'}>Delete</button>` + checks()
}
right.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement
  const f = t.dataset.f
  const o = selected() as unknown as Record<string, unknown>
  if (!f || !o) return
  commit()
  o[f] = f === 'type' || f === 'kind' ? t.value : Number(t.value) | 0
  changed()
})
right.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('[data-del]')) return
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
})
/** What a dungeon needs to be playable, checked live. */
function checks() {
  const tiles = compose(map)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? T.Void : tiles[y * map.w + x])
  const out: string[] = []
  const start = map.entities.find((e) => e.kind === 'start')
  if (!start) out.push('Add a Start.')
  else if (!walkableTile(at(start.x, start.y))) out.push('The Start is not on open ground.')
  if (!map.entities.some((e) => e.kind === 'boss')) out.push('Add a Boss.')
  if (!map.entities.some((e) => e.kind === 'exit')) out.push('Add an Exit (it opens when the boss is beaten).')
  const stuck = map.entities.filter((e) => e.kind !== 'start' && !walkableTile(at(e.x, e.y))).length
  if (stuck) out.push(`${stuck} Pokémon or exit${stuck === 1 ? ' is' : 's are'} on a wall or water.`)
  const n = map.entities.filter((e) => e.kind === 'enemy').length
  const lv = map.entities.filter((e) => e.level).map((e) => e.level!)
  const summary = `${n} Pokémon${lv.length ? `, levels ${Math.min(...lv)} to ${Math.max(...lv)}` : ''}`
  return `<h3>CHECKS</h3>${out.length ? out.map((t) => `<p class="warn">${t}</p>`).join('') : '<p class="ok">Ready to play.</p>'}<p class="hint">${summary}</p>`
}

// ---------- drawing ----------
const faces = new Map<number, HTMLImageElement>()
function face(dex: number) {
  let im = faces.get(dex)
  if (!im) {
    im = new Image()
    im.src = portrait(dex)
    im.onload = () => draw()
    faces.set(dex, im)
  }
  return im
}

// the map at 1×, redrawn only when something changes
const map1 = document.createElement('canvas')
let dirty = true
function renderMap1x() {
  const baked = bakeMap(map)
  map1.width = baked.color.width
  map1.height = baked.color.height
  const g = map1.getContext('2d', { willReadFrequently: true })!
  g.drawImage(baked.color, 0, 0)
  if (lit) {
    const lights = [...baked.lights]
    const start = map.entities.find((e) => e.kind === 'start')
    if (start) lights.push({ x: start.x * TILE + 8, y: start.y * TILE + 8, z: 20, r: 80, color: [1, 0.92, 0.8], power: 1.3 })
    const amb = 1 - map.dark * 0.92
    applyLighting(g, baked.normal.getContext('2d', { willReadFrequently: true })!, [amb * 0.85, amb * 0.9, amb * 1.1], lights)
  }
  dirty = false
}
function draw() {
  const r = board.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
    cv.width = Math.round(r.width * dpr)
    cv.height = Math.round(r.height * dpr)
  }
  if (dirty) renderMap1x()
  const g = ctx
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.imageSmoothingEnabled = false
  g.fillStyle = '#0f1115'
  g.fillRect(0, 0, r.width, r.height)
  const z = view.z
  const sx = (wx: number) => (wx - view.x) * z
  const sy = (wy: number) => (wy - view.y) * z
  g.drawImage(map1, sx(0), sy(0), map.w * TILE * z, map.h * TILE * z)
  // grid and bounds
  if (showGrid && z >= 1.2) {
    g.strokeStyle = 'rgba(255,255,255,0.05)'
    g.lineWidth = 1
    g.beginPath()
    for (let x = 0; x <= map.w; x++) {
      g.moveTo(Math.round(sx(x * TILE)) + 0.5, sy(0))
      g.lineTo(Math.round(sx(x * TILE)) + 0.5, sy(map.h * TILE))
    }
    for (let y = 0; y <= map.h; y++) {
      g.moveTo(sx(0), Math.round(sy(y * TILE)) + 0.5)
      g.lineTo(sx(map.w * TILE), Math.round(sy(y * TILE)) + 0.5)
    }
    g.stroke()
  }
  g.strokeStyle = 'rgba(248,208,96,0.5)'
  g.setLineDash([])
  g.strokeRect(sx(0) + 0.5, sy(0) + 0.5, map.w * TILE * z, map.h * TILE * z)
  // piece outlines
  for (const p of map.pieces) {
    const on = sel?.kind === 'piece' && sel.id === p.id
    g.strokeStyle = on ? '#f8d060' : PIECE_COLORS[p.type] + 'cc'
    g.lineWidth = on ? 2 : 1
    g.setLineDash(on ? [] : [4, 4])
    g.strokeRect(sx(p.x * TILE) + 0.5, sy(p.y * TILE) + 0.5, p.w * TILE * z, p.h * TILE * z)
    if (on) {
      g.fillStyle = '#f8d060'
      g.fillRect(sx((p.x + p.w) * TILE) - 5, sy((p.y + p.h) * TILE) - 5, 10, 10)
    }
  }
  g.setLineDash([])
  // touch-up tiles
  if (Object.keys(map.paint).length) {
    g.strokeStyle = 'rgba(106,168,255,0.6)'
    for (const k of Object.keys(map.paint)) {
      const [x, y] = k.split(',').map(Number)
      g.strokeRect(sx(x * TILE) + 1.5, sy(y * TILE) + 1.5, TILE * z - 3, TILE * z - 3)
    }
  }
  // props (selection box only; their art is in the map image)
  for (const p of map.props)
    if (sel?.kind === 'prop' && sel.id === p.id) {
      g.strokeStyle = '#f8d060'
      g.lineWidth = 2
      g.strokeRect(sx(p.x * TILE), sy(p.y * TILE), TILE * z, TILE * z)
    }
  // Pokémon and markers
  for (const en of map.entities) {
    const x = sx(en.x * TILE)
    const y = sy(en.y * TILE)
    const s = TILE * z
    const on = sel?.kind === 'entity' && sel.id === en.id
    g.fillStyle = en.kind === 'start' ? '#58d058' : en.kind === 'exit' ? '#f8d060' : en.kind === 'boss' ? '#ff6a5a' : '#6aa8ff'
    g.globalAlpha = 0.85
    g.beginPath()
    g.arc(x + s / 2, y + s / 2, (en.kind === 'boss' ? 0.75 : 0.55) * s, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
    if (en.dex) {
      const im = face(en.dex)
      const fs = (en.kind === 'boss' ? 1.4 : 1) * s
      if (im.complete) g.drawImage(im, x + s / 2 - fs / 2, y + s / 2 - fs / 2, fs, fs)
      g.font = `600 ${Math.max(9, 4 * z)}px Inter, sans-serif`
      g.fillStyle = '#fff'
      g.textAlign = 'center'
      g.fillText(`Lv${en.level}`, x + s / 2, y + s + Math.max(10, 5 * z))
    } else {
      g.font = `600 ${Math.max(9, 4 * z)}px Inter, sans-serif`
      g.fillStyle = '#10140f'
      g.textAlign = 'center'
      g.fillText(en.kind === 'start' ? 'START' : 'EXIT', x + s / 2, y + s / 2 + 3)
    }
    if (on) {
      g.strokeStyle = '#fff'
      g.lineWidth = 2
      g.strokeRect(x - 2, y - 2, s + 4, s + 4)
    }
  }
}
new ResizeObserver(() => draw()).observe(board)

// ---------- boot ----------
async function boot() {
  try {
    const r = await (await fetch(`${BASE}data/roster.json`)).json()
    species = Object.entries(r.species as Record<string, { name: string }>)
      .map(([d, s]) => ({ dex: Number(d), name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {}
  syncBar()
  renderPalette()
  renderInspector()
  void refreshOpen()
  // centre the map
  const r = board.getBoundingClientRect()
  view.z = Math.max(1, Math.min(3, Math.floor(Math.min(r.width / (map.w * TILE), r.height / (map.h * TILE)) * 10) / 10))
  view.x = (map.w * TILE) / 2 - r.width / 2 / view.z
  view.y = (map.h * TILE) / 2 - r.height / 2 / view.z
  draw()
}
void boot()
;(window as unknown as { __editor: unknown }).__editor = {
  get map() {
    return map
  },
  set map(m: DungeonMap) {
    map = m
    dirty = true
    syncBar()
    renderPalette()
    renderInspector()
    draw()
  },
}
