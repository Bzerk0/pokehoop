// Chemistry: Pokémon that belong together play better together. Each link gives its members an OVR boost;
// whole-team links boost everyone. Pure: no React. Boost sizes live in ratingConfig.ts; the groups below are data.
import { CHEM, CHEM_MAX } from "./ratingConfig.ts";
import type { Lineup } from "./lineup.ts";
import { POSITIONS, type RatedPokemon } from "./types.ts";

export type Link = { name: string; slots: number[]; boost: number };

const REGIONS = ["KANTO", "JOHTO", "HOENN", "SINNOH", "UNOVA", "KALOS", "ALOLA", "GALAR", "PALDEA"];
/** Each region's first grass, fire and water starter; a line is that number and the next two (1–3, 4–6, 7–9). */
const STARTERS: Record<number, number[]> = {
  1: [1, 4, 7], 2: [152, 155, 158], 3: [252, 255, 258], 4: [387, 390, 393], 5: [495, 498, 501],
  6: [650, 653, 656], 7: [722, 725, 728], 8: [810, 813, 816], 9: [906, 909, 912],
};
/** Rivals and partners: both on the team. */
const PAIRS: [string, string[]][] = [
  ["ROYAL COUPLE", ["nidoking", "nidoqueen"]],
  ["CHEER SQUAD", ["plusle", "minun"]],
  ["FIREFLY DANCE", ["volbeat", "illumise"]],
  ["EON DUO", ["latias", "latios"]],
  ["METEOR TWINS", ["solrock", "lunatone"]],
  ["DOJO RIVALS", ["throh", "sawk"]],
  ["BLOOD FEUD", ["zangoose", "seviper"]],
  ["PREDATOR & PREY", ["heatmor", "durant"]],
  ["ORIGIN & CLONE", ["mew", "mewtwo"]],
  ["TOWER GUARDIANS", ["lugia", "ho-oh"]],
  ["PRIMAL CLASH", ["kyogre", "groudon"]],
  ["YIN & YANG", ["reshiram", "zekrom"]],
  ["LIFE & DEATH", ["xerneas", "yveltal"]],
  ["SUN & MOON", ["solgaleo", "lunala"]],
  ["SWORD & SHIELD", ["zacian", "zamazenta"]],
  ["PAST & FUTURE", ["koraidon", "miraidon"]],
];
/** Famous groups: SQUAD_NEED or more of them on the team. */
const SQUAD_NEED = 3;
const SQUADS: [string, string[]][] = [
  ["LEGENDARY BIRDS", ["articuno", "zapdos", "moltres"]],
  ["LEGENDARY BEASTS", ["raikou", "entei", "suicune"]],
  ["THE REGIS", ["regirock", "regice", "registeel", "regigigas", "regieleki", "regidrago"]],
  ["LAKE GUARDIANS", ["uxie", "mesprit", "azelf"]],
  ["CREATION TRIO", ["dialga", "palkia", "giratina"]],
  ["WEATHER TRIO", ["kyogre", "groudon", "rayquaza"]],
  ["SWORDS OF JUSTICE", ["cobalion", "terrakion", "virizion", "keldeo"]],
  ["FORCES OF NATURE", ["tornadus", "thundurus", "landorus", "enamorus"]],
  ["ISLAND GUARDIANS", ["tapu-koko", "tapu-lele", "tapu-bulu", "tapu-fini"]],
  ["TREASURES OF RUIN", ["wo-chien", "chien-pao", "ting-lu", "chi-yu"]],
  ["FOSSIL CLUB", ["omastar", "kabutops", "aerodactyl", "cradily", "armaldo", "rampardos", "bastiodon", "carracosta", "archeops", "tyrantrum", "aurorus"]],
  [
    "ASH'S PARTNERS",
    ["pikachu", "bulbasaur", "charizard", "squirtle", "pidgeot", "butterfree", "snorlax", "lapras", "heracross", "sceptile",
      "infernape", "krookodile", "greninja", "goodra", "noivern", "lucario", "dragonite", "gengar", "lycanroc", "torkoal"],
  ],
];
export const CHEMISTRY_SLUGS = [...PAIRS, ...SQUADS].flatMap(([, slugs]) => slugs);

type Dex = Map<number, RatedPokemon>;

/** Every chemistry link on the team, and each slot's total boost (capped at CHEM_MAX). */
export function chemistry(l: Lineup, dex: Dex): { links: Link[]; boosts: number[] } {
  const on = l.ids.flatMap((id, slot) => (id != null && dex.has(id) ? [{ slot, p: dex.get(id)! }] : []));
  const links: Link[] = [];
  const add = (name: string, members: typeof on, boost: number) => links.push({ name, slots: members.map((m) => m.slot), boost });
  const groups = <K,>(key: (p: RatedPokemon) => K[]) => {
    const map = new Map<K, typeof on>();
    for (const m of on) for (const k of key(m.p)) map.set(k, [...(map.get(k) ?? []), m]);
    return map;
  };

  for (const members of groups((p) => [p.chain]).values()) if (members.length >= 2) add("EVOLUTION LINE", members, CHEM.family);

  for (const [gen, bases] of Object.entries(STARTERS)) {
    const trio = bases.map((b) => on.find((m) => m.p.id >= b && m.p.id <= b + 2));
    if (trio.every(Boolean)) add(`${REGIONS[Number(gen) - 1]} STARTERS`, trio as typeof on, CHEM.starterTrio);
  }

  // same type: a trio, then bigger bonuses for ×4 … ×7, and the most for the whole squad of 8 (one link per type)
  for (const [type, members] of groups((p) => p.types)) {
    const n = members.length, t = type.toUpperCase();
    if (n === 3) add(`${t} TRIO`, members, CHEM.typeTrio);
    else if (n >= 4 && n < 8) add(`${t} ×${n}`, members, CHEM.typeMore[n - 4]);
    else if (n >= 8) add(`ALL-${t} SQUAD`, members, CHEM.typeMore[4]);
  }

  for (const [name, slugs] of PAIRS) {
    const members = on.filter((m) => slugs.includes(m.p.slug));
    if (members.length === slugs.length) add(name, members, CHEM.pair);
  }
  for (const [name, slugs] of SQUADS) {
    const members = on.filter((m) => slugs.includes(m.p.slug));
    if (members.length >= SQUAD_NEED) add(name, members, CHEM.squad);
  }

  // whole-team links: judged on the five starters, felt by everyone
  const starters = on.filter((m) => m.slot < POSITIONS.length);
  if (starters.length === POSITIONS.length) {
    const gen = starters[0].p.generation;
    if (starters.every((m) => m.p.generation === gen)) add(`${REGIONS[gen - 1]} SQUAD`, on, CHEM.region);
    for (const type of starters[0].p.types) {
      if (starters.every((m) => m.p.types.includes(type))) add(`MONO-${type.toUpperCase()}`, on, CHEM.monoType);
    }
  }

  const boosts = l.ids.map((_, slot) => Math.min(CHEM_MAX, links.reduce((s, k) => s + (k.slots.includes(slot) ? k.boost : 0), 0)));
  return { links, boosts };
}
