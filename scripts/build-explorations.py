#!/usr/bin/env python3
"""Write the surface explorations' hand-made maps (2026-11-18) to public/dungeons/.

Each is the "heart" at the end of an exploration: a wide clearing with a pond, tall grass, trees
round the edge, flowers, a few of the area's own Pokémon, two wooden crates and a big chest that
open without a Lantern charge, and the way home. There is no boss. The three clearings before it
are generated from this map's theme and species (src/dungeon/gen.ts).

    python3 scripts/build-explorations.py
"""
import json
import random
from pathlib import Path

AREAS = [
    # id, name, theme, the area's Pokémon (dex, level)
    ('blossom-meadow', 'Blossom Meadow', 'meadow', [(43, 13), (44, 16), (187, 13), (188, 16), (12, 15), (179, 14), (397, 16)]),
    ('snowdrift-woods', 'Snowdrift Woods', 'snowwood', [(220, 38), (221, 43), (459, 39), (460, 44), (361, 40), (215, 42), (225, 41)]),
    ('palm-shore', 'Palm Shore', 'shore', [(37, 52), (77, 53), (104, 52), (105, 57), (231, 53), (322, 54), (228, 56)]),
]


def area(id_, name, theme, mons, seed):
    r = random.Random(seed)
    n = iter(range(10_000))
    uid = lambda: f'{id_[:3]}{next(n)}'
    W, H = 50, 32
    pieces = [
        # the trail in from the west, the wide clearing, a nook to the east with the way home
        {'id': uid(), 'type': 'room', 'x': 2, 'y': 14, 'w': 8, 'h': 4},
        {'id': uid(), 'type': 'cavern', 'x': 8, 'y': 4, 'w': 32, 'h': 24},
        {'id': uid(), 'type': 'cavern', 'x': 36, 'y': 10, 'w': 11, 'h': 11},
        {'id': uid(), 'type': 'pond', 'x': 21, 'y': 9, 'w': 9, 'h': 5},
        {'id': uid(), 'type': 'grass', 'x': 12, 'y': 18, 'w': 8, 'h': 5},
        {'id': uid(), 'type': 'grass', 'x': 29, 'y': 19, 'w': 7, 'h': 4},
    ]
    props = []
    taken = set()

    def put(kind, x, y):
        if (x, y) in taken:
            return
        taken.add((x, y))
        props.append({'id': uid(), 'kind': kind, 'x': x, 'y': y})

    # trees round the clearing's edge, flowers and bushes inside, two rocks
    for x, y in [(12, 7), (17, 5), (33, 6), (37, 9), (11, 24), (19, 26), (30, 25), (36, 23)]:
        put('tree' if r.random() < 0.6 else 'tree2', x, y)
    for x, y in [(14, 11), (18, 14), (25, 16), (31, 13), (34, 16), (16, 22), (26, 22), (38, 13), (22, 7)]:
        put('flower', x, y)
    for x, y in [(20, 20), (33, 11), (13, 15)]:
        put('bush', x, y)
    for x, y in [(28, 7), (24, 24)]:
        put('rock', x, y)
    entities = [{'id': uid(), 'kind': 'start', 'x': 4, 'y': 15}, {'id': uid(), 'kind': 'exit', 'x': 44, 'y': 15}]
    spots = [(16, 9), (26, 14), (31, 9), (18, 17), (27, 19), (35, 14), (39, 17)]
    for (dex, level), (x, y) in zip(mons, spots):
        entities.append({'id': uid(), 'kind': 'enemy', 'x': x, 'y': y, 'dex': dex, 'level': level})
    entities += [
        {'id': uid(), 'kind': 'chest', 'x': 41, 'y': 12, 'big': True, 'free': True},
        {'id': uid(), 'kind': 'chest', 'x': 15, 'y': 25, 'free': True},
        {'id': uid(), 'kind': 'chest', 'x': 33, 'y': 20, 'free': True},
        {'id': uid(), 'kind': 'pot', 'x': 10, 'y': 13},
        {'id': uid(), 'kind': 'pot', 'x': 23, 'y': 18},
    ]
    return {'v': 1, 'id': id_, 'name': name, 'theme': theme, 'w': W, 'h': H, 'dark': 0, 'pieces': pieces, 'props': props, 'entities': entities, 'paint': {}}


def main():
    root = Path(__file__).resolve().parent.parent / 'public' / 'dungeons'
    index = json.loads((root / 'index.json').read_text())
    for i, (id_, name, theme, mons) in enumerate(AREAS):
        (root / f'{id_}.json').write_text(json.dumps(area(id_, name, theme, mons, 7 + i), indent=1))
        if not any(e['id'] == id_ for e in index):
            index.append({'id': id_, 'name': name})
    (root / 'index.json').write_text(json.dumps(index, indent=1))
    print('wrote', ', '.join(a[0] for a in AREAS))


if __name__ == '__main__':
    main()
