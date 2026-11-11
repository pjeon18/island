// The page around the island, in the PokéMAPs overworld style: a grass
// clearing with forest down both sides and animated Black and White sprites.
// None of it is part of the game: your Pokémon stand on the left, and ones
// still out there wait on the right.
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

/** Place a sprite with its feet on (left, bottom), at 2x, or 1.5x for big ones. */
function mon(dex: number, left: string, bottom: number, flip: boolean, z = 3) {
  const el = document.createElement('img')
  el.className = 'px mon'
  el.alt = ''
  el.src = gif(dex)
  el.style.cssText = `left:${left};bottom:${bottom}px;z-index:${z};visibility:hidden;--flip:${flip ? -1 : 1}`
  el.onload = () => {
    const k = el.naturalHeight >= 70 ? 1.5 : 2
    el.style.width = `${el.naturalWidth * k}px`
    el.style.height = `${el.naturalHeight * k}px`
    el.style.visibility = 'visible'
  }
  return el
}

// spots in the side clearings (wide screens only): yours on the left, wild on the right, as top %
const LEFT = [30, 50, 70, 88]
const RIGHT = [24, 44, 64, 84]

let lastKey = ''
/** Your Pokémon stand in the left clearing; species you have not caught wait on the right. */
export function paintPageMons(app: HTMLElement, mine: number[], wild: number[]) {
  const key = mine.join() + '|' + wild.join()
  if (key === lastKey) return
  lastKey = key
  const clearing = app.querySelector<HTMLElement>('.clearing')
  if (!clearing) return
  clearing.replaceChildren()
  const put = (dex: number | undefined, side: 'l' | 'r', top: number) => {
    if (!dex) return
    const el = mon(dex, side === 'l' ? 'var(--clear-l)' : 'var(--clear-r)', 0, side === 'r', 1)
    el.style.bottom = ''
    el.style.top = `${top}%`
    clearing.append(el)
  }
  LEFT.forEach((t, i) => put(mine[i] ?? wild[RIGHT.length + i], 'l', t))
  RIGHT.forEach((t, i) => put(wild[i], 'r', t))
}
