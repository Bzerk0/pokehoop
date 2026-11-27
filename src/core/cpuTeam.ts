// CPU opponents (PLAN.md §8): a seeded team inside a difficulty's OVR band, with a made-up name.
import { PALETTE } from "../ui/theme/palette.ts";
import { CPU_SAMPLE, DIFFICULTIES } from "./ratingConfig.ts";
import { emptyLineup, isEligible, NAME_MAX, SLOTS, slotOvr, type Lineup, type Mode } from "./lineup.ts";
import { makeRng, type Rng } from "./rng.ts";
import type { RatedPokemon } from "./types.ts";

export type Difficulty = (typeof DIFFICULTIES)[number]["name"];

export const PLACES = ["CERULEAN", "VERMILION", "SAFFRON", "ECRUTEAK", "LAVARIDGE", "SNOWPOINT", "NIMBASA", "LUMIOSE", "HAU'OLI", "MOTOSTOKE", "MESAGOZA", "PEWTER", "GOLDENROD", "MAUVILLE"];
export const MASCOTS = ["TIDE", "VIPERS", "THUNDER", "EMBERS", "GALE", "BOULDERS", "PHANTOMS", "COMETS", "BLIZZARD", "WILDCATS", "DYNAMOS", "STAMPEDE", "SPARKS", "TITANS"];

const COLOR_COUNT = Object.keys(PALETTE).length;
const randomTeamName = (rng: Rng) => `${rng.pick(PLACES)} ${rng.pick(MASCOTS)}`.slice(0, NAME_MAX);

export type TeamStyle = Pick<Lineup, "name" | "colors">;

export function randomTeamStyle(rng: Rng): TeamStyle {
  const name = randomTeamName(rng);
  const home = rng.int(COLOR_COUNT);
  // Draw from the remaining colours by skipping the home index.
  const accent = rng.int(COLOR_COUNT - 1);
  return { name, colors: [home, accent < home ? accent : accent + 1] };
}

/** The Pokémon a CPU team sends out by default for a game of `size` (what lineupGame picks with no choice made):
 *  5 a side PG–C, 3 a side PG, SF and C, 1 a side its best starter. Dex numbers, in court order. */
export function presetPicks(lineup: Lineup, size: 1 | 3 | 5, dex: Map<number, RatedPokemon>): number[] {
  const ids = lineup.ids.filter((id): id is number => id != null);
  if (size === 5) return ids.slice(0, 5);
  if (size === 3) return [ids[0], ids[2], ids[4]];
  const best = ids.slice(0, 5).reduce((x, y) => (dex.get(y)!.ovr[dex.get(y)!.best] > dex.get(x)!.ovr[dex.get(x)!.best] ? y : x));
  return [best];
}

export const difficultyOf = (name: Difficulty) => DIFFICULTIES.find((d) => d.name === name)!;
export const allowedIn = (name: Difficulty, mode: Mode) => mode === "unlimited" || !difficultyOf(name).unlimitedOnly;

/** The difficulty whose band's middle is closest to your team's OVR: a fair fight to start from (you can change it). */
export const suggestedDifficulty = (ovr: number): Difficulty =>
  DIFFICULTIES.reduce((best, d) => (Math.abs((d.min + d.max) / 2 - ovr) < Math.abs((best.min + best.max) / 2 - ovr) ? d : best)).name;

/** A CPU team: aims at a random OVR inside the band, and for each spot signs whichever of CPU_SAMPLE nearby
 *  candidates rates closest to that aim there. Same seed, same team. */
export function cpuTeam(pool: RatedPokemon[], name: Difficulty, mode: Mode, seed: number): Lineup {
  const band = difficultyOf(name);
  const rng = makeRng(seed);
  const target = band.min + rng.next() * (band.max - band.min);
  const ids: number[] = [];
  SLOTS.forEach((_, slot) => {
    const eligible = pool.filter((p) => isEligible(p, mode) && !ids.includes(p.id));
    const near = eligible.filter((p) => Math.abs(slotOvr(slot, p) - target) <= 6);
    const from = near.length ? near : eligible;
    const sample = Array.from({ length: Math.min(CPU_SAMPLE, from.length) }, () => rng.pick(from));
    const pick = sample.reduce((a, b) => (Math.abs(slotOvr(slot, b) - target) < Math.abs(slotOvr(slot, a) - target) ? b : a));
    ids.push(pick.id);
  });
  const color = () => rng.int(COLOR_COUNT);
  return { ...emptyLineup(mode), name: randomTeamName(rng), colors: [color(), color()], ids };
}
