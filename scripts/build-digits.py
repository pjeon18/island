# Builds src/fonts/island-digits.ttf: the digits 0 to 9 drawn on Press Start 2P's own grid
# (7 x 7 pixels in an 8 x 8 cell, 125 units a pixel, the same baseline and weight), but with
# counters two pixels tall, so 8, 0, 6 and 9 read at game size. Press Start 2P's 8 has one-pixel
# holes and read as a blob or an S (Paul, 2026-11-18). The CSS loads it for U+0030-0039 only, so
# every other character stays Press Start 2P.
#   python3 scripts/build-digits.py
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from pathlib import Path

PX = 125
DIGITS = {
    "0": [".XXXXX.", "XX...XX", "XX..XXX", "XX.X.XX", "XXX..XX", "XX...XX", ".XXXXX."],
    "1": ["..XX...", ".XXX...", "..XX...", "..XX...", "..XX...", "..XX...", "XXXXXX."],
    "2": [".XXXXX.", "XX...XX", ".....XX", "..XXXX.", ".XX....", "XX.....", "XXXXXXX"],
    "3": [".XXXXX.", "XX...XX", ".....XX", "...XXX.", ".....XX", "XX...XX", ".XXXXX."],
    "4": ["...XXX.", "..XXXX.", ".XX.XX.", "XX..XX.", "XXXXXXX", "....XX.", "....XX."],
    "5": ["XXXXXXX", "XX.....", "XXXXXX.", ".....XX", ".....XX", "XX...XX", ".XXXXX."],
    "6": ["..XXXX.", ".XX....", "XX.....", "XXXXXX.", "XX...XX", "XX...XX", ".XXXXX."],
    "7": ["XXXXXXX", "XX...XX", "....XX.", "...XX..", "..XX...", "..XX...", "..XX..."],
    "8": [".XXXXX.", "XX...XX", "XX...XX", ".XXXXX.", "XX...XX", "XX...XX", ".XXXXX."],
    "9": [".XXXXX.", "XX...XX", "XX...XX", ".XXXXXX", ".....XX", "....XX.", ".XXXX.."],
}
NAMES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]


def glyph(rows):
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        top = 1000 - r * PX
        x = 0
        while x < len(row):
            if row[x] != "X":
                x += 1
                continue
            start = x
            while x < len(row) and row[x] == "X":
                x += 1
            # one horizontal run as a rectangle, drawn clockwise (TrueType's outer direction)
            x0, x1, y0, y1 = start * PX, x * PX, top - PX, top
            pen.moveTo((x0, y0))
            pen.lineTo((x0, y1))
            pen.lineTo((x1, y1))
            pen.lineTo((x1, y0))
            pen.closePath()
    return pen.glyph()


def empty():
    return TTGlyphPen(None).glyph()


order = [".notdef", "space", *NAMES]
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap({0x20: "space", **{0x30 + i: n for i, n in enumerate(NAMES)}})
glyphs = {".notdef": empty(), "space": empty()}
for i, n in enumerate(NAMES):
    glyphs[n] = glyph(DIGITS[str(i)])
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics({n: (1000, 0) for n in order})
# the same vertical metrics as Press Start 2P, so the digits sit on its baseline
fb.setupHorizontalHeader(ascent=1000, descent=0)
fb.setupOS2(version=4, sTypoAscender=1000, sTypoDescender=0, sTypoLineGap=0, usWinAscent=1000, usWinDescent=374, fsSelection=0x80)
fb.setupNameTable({"familyName": "Island Digits", "styleName": "Regular"})
fb.setupPost()
out = Path(__file__).resolve().parent.parent / "src" / "fonts" / "island-digits.ttf"
out.parent.mkdir(parents=True, exist_ok=True)
fb.save(str(out))
print("wrote", out, out.stat().st_size, "bytes")
