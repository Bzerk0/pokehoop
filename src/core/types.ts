export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export type PokemonData = {
  id: number;
  name: string;
  slug: string;
  generation: number;
  /** evolution family (PokéAPI evolution chain id): Pichu, Pikachu and Raichu share one */
  chain: number;
  types: string[];
  heightM: number; // API decimetres / 10
  weightKg: number; // API hectograms / 10
  stats: Record<StatKey, number>;
  isLegendary: boolean;
  isMythical: boolean;
  sprite: string;
  spriteW: number; // cropped to visible pixels
  spriteH: number;
};

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type Position = (typeof POSITIONS)[number];

export const ATTRIBUTES = [
  "speed",
  "shooting",
  "finishing",
  "handles",
  "passing",
  "perimeterD",
  "interiorD",
  "rebounding",
  "strength",
  "stamina",
] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Record<Attribute, number>;

export type RatedPokemon = PokemonData & {
  /** height as a percentile (0–100) of the whole pool */
  heightPct: number;
  attrs: Attributes;
  ovr: Record<Position, number>;
  best: Position;
};
