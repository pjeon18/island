// The page around the island, in the PokéMAPs overworld style: a grass
// clearing with forest down both sides, a route band along the top, and
// animated Black and White sprites. None of it is part of the game; the
// route shows your own Pokémon and the clearing shows ones still out there.
const BASE = import.meta.env.BASE_URL
const scene = (n: string) => `${BASE}scene/${n}.png`
const gif = (dex: number) => `${BASE}scene/mons/${dex}.gif`

function img(name: string, style: string, cls = 'px') {
  return `<img class="${cls}" src="${scene(name)}" alt="" aria-hidden="true" draggable="false" style="${style}">`
}
const tree = (i: number, style: string) => img(i % 3 === 1 ? 'pine' : 'tree', `width:136px;height:320px;${i % 2 === 0 ? 'transform:scaleX(-1);' : ''}${style}`)

function treeLine(edge: 'top' | 'bottom', offset = 0, lift = 0, z = 0) {
  let s = ''
  for (let i = 0; i < 24; i++) {
    const x = i * 112 - 40 + offset
    s +=
      edge === 'top'
        ? tree(i, `left:${x}px;top:${-170 - lift + (i % 2) * 18}px;z-index:${z}`)
        : tree(i + 1, `left:${x}px;bottom:${-130 - lift + (i % 2) * 22}px;z-index:${z}`)
  }
  return s
}

export function backdropHtml() {
  let side = ''
  for (let i = 0; i < 8; i++) {
    side += tree(i, `left:${-96 + (i % 2) * 30}px;top:${i * 150 - 60}px;z-index:${i}`)
    side += tree(i + 1, `left:calc(100% - ${40 + (i % 2) * 30}px);top:${i * 150 - 20}px;z-index:${i}`)
  }
  return `
  <div class="backdrop" aria-hidden="true">
    <div class="grass"></div>
    ${side}
    <div class="clearing"></div>
    <div class="treeline-bottom">${treeLine('bottom', 56, 0, 10)}${treeLine('bottom', 0, 0, 11)}</div>
  </div>`
}

export function routeHtml() {
  return `
  <div class="route" aria-hidden="true">
    <div class="grass"></div>
    ${treeLine('top', 0, 70)}
    ${img('flowers-red', 'left:14%;bottom:18px;width:116px;height:56px;z-index:2')}
    <div class="pond"><img class="px" src="${scene('lily')}" alt="" style="left:22%;top:30%"><img class="px" src="${scene('lily')}" alt="" style="left:64%;top:48%"></div>
    <div class="route-mons"></div>
  </div>`
}

/** Place a sprite with its feet on (left, bottom), at 2x, or 1.5x for big ones. */
function mon(dex: number, left: string, bottom: number, flip: boolean, z = 3) {
  const el = document.createElement('img')
  el.className = 'px mon'
  el.alt = ''
  el.src = gif(dex)
  el.style.cssText = `left:${left};bottom:${bottom}px;z-index:${z};visibility:hidden;--flip:${flip ? -1 : 1}`
  el.onload = () => {
    const small = matchMedia('(max-width: 640px)').matches
    const k = (el.naturalHeight >= 70 ? 1.5 : 2) * (small ? 0.75 : 1)
    el.style.width = `${el.naturalWidth * k}px`
    el.style.height = `${el.naturalHeight * k}px`
    el.style.visibility = 'visible'
  }
  return el
}

// spots on the route band, wide then narrow
const ROUTE: [string, number, boolean][] = [
  ['8%', 14, false], ['24%', 22, false], ['38%', 8, true], ['50%', 26, false],
  ['78%', 14, true], ['88%', 30, true], ['96%', 10, true],
]
const ROUTE_NARROW: [string, number, boolean][] = [['16%', 10, false], ['44%', 18, true], ['84%', 12, true]]
// spots in the side clearings (wide screens only), as [side, top%]
const CLEARING: ['l' | 'r', number][] = [['l', 34], ['r', 40], ['l', 56], ['r', 62], ['l', 76], ['r', 82]]

let lastKey = ''
/** Your Pokémon walk the route; species you have not caught wait in the clearing. */
export function paintPageMons(app: HTMLElement, mine: number[], wild: number[]) {
  const key = mine.join() + '|' + wild.join()
  if (key === lastKey) return
  lastKey = key
  const route = app.querySelector<HTMLElement>('.route-mons')
  const clearing = app.querySelector<HTMLElement>('.clearing')
  if (!route || !clearing) return
  route.replaceChildren()
  const narrow = matchMedia('(max-width: 640px)').matches
  const spots = narrow ? ROUTE_NARROW : ROUTE
  // the clearing (wide screens) takes the first wild ones; the route tops up from the rest
  const spare = narrow || innerWidth <= 1240 ? wild : wild.slice(CLEARING.length)
  spots.forEach(([l, b, f], i) => {
    const dex = i < mine.length ? mine[i] : spare[i - mine.length]
    if (dex) route.append(mon(dex, l, b, f))
  })
  clearing.replaceChildren()
  CLEARING.forEach(([side, top], i) => {
    const dex = wild[i]
    if (!dex) return
    const el = mon(dex, side === 'l' ? 'var(--clear-l)' : 'var(--clear-r)', 0, side === 'r', 1)
    el.style.bottom = ''
    el.style.top = `${top}%`
    clearing.append(el)
  })
}
