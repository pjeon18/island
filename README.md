# Island (working title)

Island is a small Pokémon island that sits in an always-on-top window while you study. You start a focus session yourself. Your party gains experience and evolves only during focus time, and a wild Pokémon comes out of the tall grass after each session. This repo is at T3. It has the playable loop, berries and stones, decorations, friends on Studdy accounts, and a desktop-pet mode. Add `?debug` to the URL for demo controls, and `?float` to preview the desktop pet. `docs/LOOP.md` explains how focus time turns into rewards.

To run the desktop app, install Rust first (https://rustup.rs). Then use:

```bash
npm run desktop        # transparent always-on-top island
npm run desktop:build  # Island.app and a .dmg in src-tauri/target/release/bundle
```

```bash
npm install
npm run dev        # http://localhost:5600
npm run build
```

Press **Pop out** to open the island in its own window. In Chrome and Edge that window stays on top of your other apps. Other browsers open a small ordinary window instead.

## Credits

Pokémon sprites and portraits come from the [PMD Sprite Repository](https://sprites.pmdcollab.org) and are used under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Species and evolution data come from [PokéAPI](https://pokeapi.co). Credits for each species are in `CREDITS.md`. Pokémon is © Nintendo, Creatures Inc. and GAME FREAK inc. This is a free, non-commercial fan project with no affiliation.
