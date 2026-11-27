import { cpuTeam, type Difficulty } from "./cpuTeam.ts";
import type { Lineup, Mode } from "./lineup.ts";
import { SEASON } from "./ratingConfig.ts";
import { simGame } from "./sim/sim.ts";
import type { RatedPokemon } from "./types.ts";

type Dex = Map<number, RatedPokemon>;
export type Record82 = { wins: number; losses: number };

const leagues = new WeakMap<RatedPokemon[], Partial<Record<Mode, Lineup[]>>>();
/** The league every draft is judged against: the same CPU teams for a pool and mode, every time. */
export function seasonLeague(pool: RatedPokemon[], mode: Mode): Lineup[] {
  const byMode = leagues.get(pool) ?? {};
  leagues.set(pool, byMode);
  let n = 0;
  return (byMode[mode] ??= Object.entries(SEASON.league).flatMap(([name, count]) =>
    Array.from({ length: count }, () => cpuTeam(pool, name as Difficulty, mode, SEASON.seed + n++)),
  ));
}

/** A whole season for a full lineup: one game against each league team in turn until SEASON.games are played,
 *  home and away alternating. The seeds come from the picks, so a team always gets the same record. */
export function seasonRecord(l: Lineup, dex: Dex, pool: RatedPokemon[]): Record82 {
  const league = seasonLeague(pool, l.mode);
  const base = l.ids.reduce<number>((h, id) => (Math.imul(h, 31) + (id ?? 0)) >>> 0, SEASON.seed);
  let wins = 0;
  for (let g = 0; g < SEASON.games; g++) {
    const opp = league[g % league.length], home = g % 2 === 0;
    const r = simGame(home ? l : opp, home ? opp : l, dex, (base + g * 7919) >>> 0);
    const [a, b] = r.teams.map((t) => t.lines.reduce((s, x) => s + x.pts, 0));
    if (home ? a > b : b > a) wins++;
  }
  return { wins, losses: SEASON.games - wins };
}

/** The letter grade for a season's wins. */
export const seasonGrade = (wins: number) => SEASON.grades.find(([, min]) => wins >= min)![0];
