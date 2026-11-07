// Every tuning number for ratings (PLAN.md §6). Change numbers here, not in ratings.ts.
import type { Attribute, Position, StatKey } from "./types.ts";

/** What a formula can read, each a 0–100 percentile across the whole pool.
 *  ht/wt are height/weight; light = 100 − wt (lighter is faster). */
export type RatingInput = StatKey | "ht" | "wt" | "light";

export const ATTRIBUTE_WEIGHTS: Record<Attribute, Partial<Record<RatingInput, number>>> = {
  speed: { spe: 0.8, light: 0.2 },
  shooting: { spa: 0.55, spd: 0.25, spe: 0.2 },
  finishing: { atk: 0.5, ht: 0.25, spe: 0.25 },
  handles: { spe: 0.5, spd: 0.3, spa: 0.2 },
  passing: { spd: 0.4, spa: 0.4, spe: 0.2 },
  perimeterD: { spe: 0.5, def: 0.3, spd: 0.2 },
  interiorD: { ht: 0.4, def: 0.35, hp: 0.25 },
  rebounding: { ht: 0.4, wt: 0.25, hp: 0.2, atk: 0.15 },
  strength: { wt: 0.5, atk: 0.3, def: 0.2 },
  stamina: { hp: 1 },
};

/** Type bonuses stack (dual types get both); "all" adds to every attribute. Results cap at 99. */
export const TYPE_BONUS: Record<string, Partial<Record<Attribute | "all", number>>> = {
  electric: { speed: 5 },
  flying: { rebounding: 5, strength: -3 },
  fighting: { finishing: 5, strength: 3 },
  psychic: { passing: 5, shooting: 3 },
  steel: { interiorD: 5 },
  rock: { strength: 4 },
  ghost: { perimeterD: 5 },
  dark: { handles: 4 },
  ice: { shooting: 4 },
  fire: { finishing: 4 },
  ground: { rebounding: 4 },
  water: { stamina: 3 },
  grass: { stamina: 3 },
  bug: { speed: 4 },
  fairy: { passing: 4 },
  poison: { perimeterD: 3 },
  dragon: { all: 2 },
  normal: { handles: 2, passing: 2 },
};

export const POSITION_WEIGHTS: Record<Position, Partial<Record<Attribute, number>>> = {
  PG: { handles: 0.25, passing: 0.25, shooting: 0.2, speed: 0.15, perimeterD: 0.15 },
  SG: { shooting: 0.35, perimeterD: 0.2, speed: 0.15, handles: 0.15, finishing: 0.15 },
  SF: { finishing: 0.2, shooting: 0.2, perimeterD: 0.2, speed: 0.15, strength: 0.15, rebounding: 0.1 },
  PF: { rebounding: 0.25, interiorD: 0.2, finishing: 0.2, strength: 0.2, shooting: 0.15 },
  C: { interiorD: 0.3, rebounding: 0.3, strength: 0.2, finishing: 0.2 },
};

/** Position OVRs are rescaled so the pool's worst is OVR_MIN and its best OVR_MAX. */
/** Team OVR (PLAN.md §7): starters count this much, the bench the rest. */
export const STARTER_WEIGHT = 0.8;
/** Builder warnings: fewer than SHOOTERS_NEEDED players with Shooting ≥ SHOOTER_MIN, or average height
 *  percentile below SHORT_TEAM_HEIGHT. */
export const SHOOTER_MIN = 70;
export const SHOOTERS_NEEDED = 2;
export const SHORT_TEAM_HEIGHT = 35;

/** Salary cap (in $M): a Pokémon's salary grows steeply with its best OVR, from SALARY_MIN at OVR_MIN to
 *  SALARY_MAX at OVR_MAX (curve exponent SALARY_CURVE). All 8 salaries together must fit under SALARY_CAP. */
export const SALARY_CAP = 100;
export const SALARY_MIN = 1;
export const SALARY_MAX = 40;
export const SALARY_CURVE = 3;

/** The draft: one round per slot (PG, SG, SF, PF, C, then 3 bench), DRAFT_OFFERS Pokémon offered each round,
 *  one from each tier (best position OVR, high to low). Each tier's offer is drawn from the DRAFT_DEPTH players in
 *  it who are best at the slot being picked. */
export const DRAFT_TIERS = [
  { name: "STAR", min: 90 },
  { name: "STARTER", min: 78 },
  { name: "ROLE", min: 64 },
  { name: "SLEEPER", min: 0 },
] as const;
export const DRAFT_OFFERS = 4;
export const DRAFT_REROLLS = 2;
export const DRAFT_DEPTH = 40;
/** Unrounded team rating (chemistry included) needed for each draft grade, best first. Calibrated by simulating
 *  600 drafts per strategy with free placement: random picks on random spots land around 68.7 (D), always taking
 *  the best player around 70 (D), spending sensibly and placing well around 78.3 (B), and 79.5+ (A+) is that
 *  sensible drafter's top 10%. */
export const DRAFT_GRADES: [string, number][] = [
  ["A+", 79.5],
  ["A", 78.5],
  ["B", 77],
  ["C", 73],
  ["D", 68],
  ["F", 0],
];

/** Chemistry (chemistry.ts): OVR points each player in a link gets. Links stack, up to CHEM_MAX per player,
 *  and a boosted OVR never passes ATTR_MAX. */
export const CHEM = {
  family: 2, // 2+ from one evolution family
  starterTrio: 3, // the three starter lines of one region
  typeTrio: 1, // 3+ sharing a type
  pair: 3, // rivals and partners (Nidoking + Nidoqueen …)
  squad: 2, // 3+ of a famous group (the legendary birds, Ash's partners …)
  region: 2, // whole team: all five starters from one region
  monoType: 3, // whole team: all five starters share a type
};
export const CHEM_MAX = 6;

export const OVR_MIN = 40;
export const OVR_MAX = 99;
export const ATTR_MAX = 99;
