// Pixel cursors (Paul, 2026-11-18: "could we have the cursor be something else, and have it
// indicate when it is hovering over something clickable"). A white arrow everywhere, a pointing
// glove over anything you can press or tap on the island, an open hand over what you can drag
// and a closed one while dragging. Each is drawn on a 16-pixel grid in the HUD's ink and white,
// doubled to 32 px so it stays crisp. Importing this module adds them to the page as CSS
// variables (--cur-arrow, --cur-hand, --cur-grab, --cur-grabbing); the pop-out window copies the
// page's <style> tags, so it gets them too.

const INK = '#0c1830'
const WHITE = '#f8f8f8'
const SHADE = '#b8c4d8'

// o = outline, w = white, s = shade, . = clear
const ARROW = [
  'o...........',
  'oo..........',
  'owo.........',
  'owwo........',
  'owwwo.......',
  'owwwwo......',
  'owwwwwo.....',
  'owwwwwwo....',
  'owwwwwwwo...',
  'owwwwwwwwo..',
  'owwwwwoooo..',
  'owwowwo.....',
  'owo.owwo....',
  'oo..owso....',
  'o....owso...',
  '.....ooo....',
]
const HAND = [
  '.....oo.........',
  '....owwo........',
  '....owwo........',
  '....owwo........',
  '....owwoooo.....',
  '....owwowwoooo..',
  '.oo.owwowwowwoo.',
  'owwoowwwwwwwwwo.',
  'owwwowwwwwwwwwo.',
  '.owwwwwwwwwwwso.',
  '..owwwwwwwwwwso.',
  '..owwwwwwwwwsso.',
  '...owwwwwwwwso..',
  '....owwwwwwsso..',
  '.....owwwwwso...',
  '.....oooooooo...',
]
const OPEN = [
  '......oo........',
  '...oooowo.oo....',
  '..owowowoowwo...',
  '..owowowowowo...',
  '..owowowowowo...',
  '..owwwwwwwwwo.oo',
  '..owwwwwwwwwoowo',
  '..owwwwwwwwwwwwo',
  '..owwwwwwwwwwwso',
  '..owwwwwwwwwwso.',
  '..owwwwwwwwwsso.',
  '...owwwwwwwwso..',
  '....owwwwwwsso..',
  '.....owwwwwso...',
  '.....oooooooo...',
  '................',
]
const FIST = [
  '................',
  '................',
  '................',
  '....oooooooo....',
  '...owwowwowwoo..',
  '..oowwowwowwowo.',
  '.owwowwwwwwwwwo.',
  '.owwwwwwwwwwwwo.',
  '.owwwwwwwwwwwso.',
  '..owwwwwwwwwwso.',
  '..owwwwwwwwwsso.',
  '...owwwwwwwwso..',
  '....owwwwwwsso..',
  '.....owwwwwso...',
  '.....oooooooo...',
  '................',
]

function svg(grid: string[]) {
  const col: Record<string, string> = { o: INK, w: WHITE, s: SHADE }
  let rects = ''
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (col[ch]) rects += `<rect x="${x * 2}" y="${y * 2}" width="2" height="2" fill="${col[ch]}"/>`
    }),
  )
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">${rects}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(s)}")`
}

const css = `:root {
  --cur-arrow: ${svg(ARROW)} 1 1, default;
  --cur-hand: ${svg(HAND)} 11 1, pointer;
  --cur-grab: ${svg(OPEN)} 16 14, grab;
  --cur-grabbing: ${svg(FIST)} 16 16, grabbing;
}
html, body { cursor: var(--cur-arrow); }
a[href], button:not(:disabled), select, label[for], summary { cursor: var(--cur-hand); }
button:disabled { cursor: var(--cur-arrow); }`

if (typeof document !== 'undefined' && !document.getElementById('pixel-cursors')) {
  const el = document.createElement('style')
  el.id = 'pixel-cursors'
  el.textContent = css
  document.head.append(el)
}

/** For canvas.style.cursor: '' goes back to the arrow. */
export const CURSOR = { hand: 'var(--cur-hand)', grab: 'var(--cur-grab)', grabbing: 'var(--cur-grabbing)' }
