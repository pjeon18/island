// Guardian battles (stage 4): your party fights an island's guardian on its
// own, one Pokémon at a time. It is decided up front by a small simulation
// and then played back in the battle window, so the result never depends on
// frame timing. Damage uses the standard type chart and one signature move
// per type, so a good team for the matchup matters as much as levels.

export interface Fighter {
  name: string
  dex: number
  level: number
  types: string[]
}
export interface Step {
  side: 'you' | 'foe'
  attacker: number // index into your team (for 'you') or 0
  target: number
  move: string
  damage: number
  eff: number // 0.5, 1, 2…
  hp: number // target hp after the hit
  fainted: boolean
}
export interface BattleResult {
  win: boolean
  team: (Fighter & { hp: number; maxHp: number })[]
  foe: Fighter & { hp: number; maxHp: number }
  steps: Step[]
}

export const MOVES: Record<string, string> = {
  normal: 'Tackle', fire: 'Ember', water: 'Water Gun', grass: 'Vine Whip', electric: 'Thunder Shock', ice: 'Powder Snow',
  fighting: 'Karate Chop', poison: 'Poison Sting', ground: 'Mud-Slap', flying: 'Gust', psychic: 'Confusion', bug: 'Bug Bite',
  rock: 'Rock Throw', ghost: 'Lick', dragon: 'Twister', dark: 'Bite', steel: 'Metal Claw', fairy: 'Fairy Wind',
}

// attacking type → defending types it is strong (2) or weak (0.5) or useless (0) against
const CHART: Record<string, [string, string, string]> = {
  normal: ['', 'rock steel', 'ghost'],
  fire: ['grass ice bug steel', 'fire water rock dragon', ''],
  water: ['fire ground rock', 'water grass dragon', ''],
  grass: ['water ground rock', 'fire grass poison flying bug dragon steel', ''],
  electric: ['water flying', 'electric grass dragon', 'ground'],
  ice: ['grass ground flying dragon', 'fire water ice steel', ''],
  fighting: ['normal ice rock dark steel', 'poison flying psychic bug fairy', 'ghost'],
  poison: ['grass fairy', 'poison ground rock ghost', 'steel'],
  ground: ['fire electric poison rock steel', 'grass bug', 'flying'],
  flying: ['grass fighting bug', 'electric rock steel', ''],
  psychic: ['fighting poison', 'psychic steel', 'dark'],
  bug: ['grass psychic dark', 'fire fighting poison flying ghost steel fairy', ''],
  rock: ['fire ice flying bug', 'fighting ground steel', ''],
  ghost: ['psychic ghost', 'dark', 'normal'],
  dragon: ['dragon', 'steel', 'fairy'],
  dark: ['psychic ghost', 'fighting dark fairy', ''],
  steel: ['ice rock fairy', 'fire water electric steel', ''],
  fairy: ['fighting dragon dark', 'fire poison steel', ''],
}
export function effectiveness(attack: string, defend: string[]) {
  const row = CHART[attack]
  if (!row) return 1
  let m = 1
  for (const d of defend) {
    if (row[2].split(' ').includes(d)) m *= 0
    else if (row[0].split(' ').includes(d)) m *= 2
    else if (row[1].split(' ').includes(d)) m *= 0.5
  }
  return m
}
/** A fighter picks whichever of its own types hits hardest. */
function bestMove(a: Fighter, d: Fighter) {
  let best = { type: a.types[0] ?? 'normal', eff: -1 }
  for (const t of a.types) {
    const e = effectiveness(t, d.types)
    if (e > best.eff) best = { type: t, eff: e }
  }
  return best
}

// tuned so a party near the guardian's level wins (Snorlax Lv35: about Lv34+ wins, Lv30 loses),
// and a type advantage can make up a few levels
const hpOf = (f: Fighter, guardian: boolean) => (guardian ? 60 + f.level * 10 : 20 + f.level * 3)
const atkOf = (f: Fighter, guardian: boolean) => (guardian ? 10 + f.level * 2.2 : 8 + f.level * 2)

export function simulate(team: Fighter[], foe: Fighter, rand = Math.random): BattleResult {
  const you = team.map((f) => ({ ...f, hp: hpOf(f, false), maxHp: hpOf(f, false) }))
  const g = { ...foe, hp: hpOf(foe, true), maxHp: hpOf(foe, true) }
  const steps: Step[] = []
  let i = 0
  for (let turn = 0; turn < 200 && i < you.length && g.hp > 0; turn++) {
    const me = you[i]
    // you strike first (a guardian is slow)
    {
      const m = bestMove(me, g)
      const damage = Math.max(1, Math.round(atkOf(me, false) * (m.eff || 0.25) * (0.85 + rand() * 0.15)))
      g.hp = Math.max(0, g.hp - damage)
      steps.push({ side: 'you', attacker: i, target: 0, move: MOVES[m.type] ?? 'Tackle', damage, eff: m.eff, hp: g.hp, fainted: g.hp === 0 })
      if (g.hp === 0) break
    }
    {
      const m = bestMove(g, me)
      const damage = Math.max(1, Math.round(atkOf(g, true) * (m.eff || 0.25) * (0.85 + rand() * 0.15)))
      me.hp = Math.max(0, me.hp - damage)
      steps.push({ side: 'foe', attacker: 0, target: i, move: MOVES[m.type] ?? 'Tackle', damage, eff: m.eff, hp: me.hp, fainted: me.hp === 0 })
      if (me.hp === 0) i++
    }
  }
  // play back from full health
  const start = you.map((f) => ({ ...f, hp: f.maxHp }))
  return { win: g.hp === 0, team: start, foe: { ...g, hp: g.maxHp }, steps }
}
