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

/** CPU opponents (PLAN.md §8): a team OVR band per difficulty. For each spot the CPU samples CPU_SAMPLE Pokémon who
 *  rate near the band there and signs the one closest to its target. CPU teams ignore the salary cap. */
export const DIFFICULTIES = [
  { name: "ROOKIE", min: 55, max: 65, unlimitedOnly: false },
  { name: "PRO", min: 65, max: 75, unlimitedOnly: false },
  { name: "ALL-STAR", min: 75, max: 85, unlimitedOnly: false },
  { name: "CHAMPION", min: 85, max: 95, unlimitedOnly: true },
] as const;
export const CPU_SAMPLE = 15;

/** The game simulator (PLAN.md §9). Make chances are logistic around the base rates: each point the shooter's
 *  rating beats the defender's moves the odds by 1/SLOPE in log-odds. Tuned with scripts/balance.ts. */
export const SIM = {
  // PLAN.md §9 says "~50 possessions" but also "average score 75–110"; 50 can't score that much, so the score wins
  possessions: 80, // per team per game, before pace
  paceSwing: 0.1, // ± by the two teams' average speed
  turnover: 0.13,
  stealShare: 0.55, // share of turnovers that are steals
  rim: 0.6,
  mid: 0.42,
  three: 0.35,
  slope: 120,
  block: 0.07,
  offRebound: 0.25,
  assist: 0.6,
  drain: 1.3, // energy lost per possession on court (less with high stamina)
  recover: 3, // energy regained per possession on the bench
  subBelow: 55, // a starter this tired goes to the bench if a fresher sub is there
  tiredFloor: 0.85, // ratings at zero energy, as a share of fresh
  quarterSec: 90, // 4 × 1:30, overtime 1:00
  overtimeSec: 60,
};

/** The live arcade game (PLAN.md §10; Phase 5 is 1v1). Metres and seconds. The court runs up the screen and you
 *  always attack the top hoop. Each make/miss/steal/block is a dice roll when it happens, then animated. */
export const LIVE = {
  targetScore: 11, // first to this wins
  // moving
  speedMin: 4.2, // m/s at Speed 0
  speedMax: 7.2, // m/s at Speed 99
  accel: 30, // m/s² toward the direction held: high = snappy
  dribbleSlow: 0.92, // speed share with the ball
  turboBoost: 1.35,
  turboDrain: 0.45, // tank per second of turbo (tank is 0–1)
  turboRegen: 0.2,
  bump: 0.7, // players closer than this push apart
  // shooting: hold K, release at the top of the meter
  meterTime: 0.75, // seconds to fill the meter to the top: the perfect release
  meterOver: 1.3, // held past this, the shot goes up late by itself
  airballBelow: 2, // let go more than this many green-zone widths under the line: too weak, it falls short
  windowMin: 0.07, // half-width of the green zone at rating 0 (share of the meter)
  windowMax: 0.17, // ... at rating 99
  perfectShare: 0.35, // the middle of the green zone that counts as PERFECT
  contestRange: 1.6, // a defender this close contests
  contestShrink: 0.45, // a full contest shrinks the green zone by this share
  deepFrom: 8.5, // shots from past this are deep
  deepShrink: 0.025, // green zone lost per metre past deepFrom
  rimRange: 2.6, // closer than this is a finish (Finishing, not Shooting)
  threeAt: 6.75,
  timing: { perfect: 0.3, good: 0.12, miss: -0.25 }, // added to the base make chance (SIM rim/mid/three)
  ratingSlope: 0.004, // make chance per rating point above 60
  contestPenalty: 0.22, // make chance lost to a full contest
  dunkRange: 2.4, // turbo + K this close goes to the rim
  dunkTime: 0.45,
  // jumping and blocking
  gravity: 14,
  jumpMin: 4.2, // take-off speed m/s (from Finishing + Rebounding)
  jumpMax: 5.6,
  reachMin: 2.0, // standing reach in metres (from height percentile)
  reachMax: 2.9,
  blockRange: 1.0, // hand to ball, across the floor
  blockWindow: 0.35, // seconds after release a shot can still be blocked
  blockBase: 0.35,
  blockSlope: 0.006, // per point of the defender's Interior D over the shooter's rating
  // steals and crossovers
  stealRange: 1.4,
  stealBase: 0.22,
  stealSlope: 0.006, // per point of Perimeter D over Handles
  stealCool: 0.5,
  stumble: 0.55, // seconds frozen after a missed steal
  crossTime: 0.3,
  crossCool: 1.4,
  crossBoost: 1.5,
  ankles: 0.4, // seconds a beaten defender stumbles
  anklesChance: 0.35, // plus 0.005 per point of Handles over Perimeter D
  // loose balls
  grabBase: 0.55, // grab radius in metres at Rebounding 0
  grabSlope: 0.006,
  deadBall: 1.0, // pause after a make before the inbound
};

/** How the CPU plays in the live game, by difficulty (PLAN.md §8). */
export const LIVE_AI: Record<(typeof DIFFICULTIES)[number]["name"], {
  react: number; // seconds before it sees where you moved
  aim: number; // spread of its shot release (share of the meter)
  steal: number; // steal tries per second when in range
  block: number; // chance it tries to block a shot
  pullUp: number; // open jump shots per second
}> = {
  ROOKIE: { react: 0.45, aim: 0.16, steal: 0.5, block: 0.35, pullUp: 0.5 },
  PRO: { react: 0.3, aim: 0.11, steal: 0.8, block: 0.55, pullUp: 0.7 },
  "ALL-STAR": { react: 0.2, aim: 0.07, steal: 1.1, block: 0.75, pullUp: 0.9 },
  CHAMPION: { react: 0.12, aim: 0.04, steal: 1.4, block: 0.9, pullUp: 1.1 },
};

export const OVR_MIN = 40;
export const OVR_MAX = 99;
export const ATTR_MAX = 99;
