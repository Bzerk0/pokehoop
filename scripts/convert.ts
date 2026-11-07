// Pure PokéAPI → PokemonData conversions (no network, no files), so they can be unit-tested.
import type { PokemonData, StatKey } from "../src/core/types.ts";

const STAT_NAMES: Record<string, StatKey> = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10 };

export const decimetresToMetres = (dm: number) => Math.round(dm) / 10;
export const hectogramsToKg = (hg: number) => Math.round(hg) / 10;

/** "generation-iv" → 4 */
export function generationNumber(name: string): number {
  const roman = name.replace("generation-", "");
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const v = ROMAN[roman[i]];
    const next = ROMAN[roman[i + 1]] ?? 0;
    if (!v) throw new Error(`bad generation name: ${name}`);
    total += v < next ? -v : v;
  }
  return total;
}

type Named = { name: string };
export type ApiSpecies = {
  id: number;
  name: string;
  names: { name: string; language: Named }[];
  generation: Named;
  evolution_chain: { url: string };
  is_legendary: boolean;
  is_mythical: boolean;
  varieties: { is_default: boolean; pokemon: Named & { url: string } }[];
};
export type ApiPokemon = {
  height: number;
  weight: number;
  types: { slot: number; type: Named }[];
  stats: { base_stat: number; stat: Named }[];
  sprites: { front_default: string | null };
};

export function toPokemonData(
  species: ApiSpecies,
  pokemon: ApiPokemon,
  sprite: { path: string; w: number; h: number },
): PokemonData {
  const stats = {} as Record<StatKey, number>;
  for (const s of pokemon.stats) {
    const key = STAT_NAMES[s.stat.name];
    if (key) stats[key] = s.base_stat;
  }
  for (const key of Object.values(STAT_NAMES)) {
    if (typeof stats[key] !== "number") throw new Error(`${species.name}: missing stat ${key}`);
  }
  const chain = Number(species.evolution_chain?.url.match(/evolution-chain\/(\d+)/)?.[1]);
  if (!chain) throw new Error(`${species.name}: missing evolution chain`);
  return {
    id: species.id,
    name: species.names.find((n) => n.language.name === "en")?.name ?? species.name,
    slug: species.name,
    generation: generationNumber(species.generation.name),
    chain,
    types: [...pokemon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    heightM: decimetresToMetres(pokemon.height),
    weightKg: hectogramsToKg(pokemon.weight),
    stats,
    isLegendary: species.is_legendary,
    isMythical: species.is_mythical,
    sprite: sprite.path,
    spriteW: sprite.w,
    spriteH: sprite.h,
  };
}
