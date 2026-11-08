// "Sim the rest" (PLAN.md §10): hand a live 5v5 game to the sim part-way. The sim picks up the score by period,
// every box-score line, everyone's energy and who's on the court, then plays out the rest of the period and the game.
import type { Lineup } from "../lineup.ts";
import { LIVE, SIM } from "../ratingConfig.ts";
import { simFrom, startGame, type GameResult } from "../sim/sim.ts";
import type { RatedPokemon } from "../types.ts";
import { pickHighlights, type Game } from "./game.ts";

/** Can this game be handed over? The sim plays five a side, and only timed games have a clock to finish. */
export const canSimRest = (g: Game) => g.size === 5 && g.timed && !g.over;

/** Finish the live game in the sim. `home`/`away` are the full lineups the rosters came from. */
export function simTheRest(g: Game, home: Lineup, away: Lineup, dex: Map<number, RatedPokemon>, seed: number): GameResult {
  const s = startGame(home, away, dex);
  s.pace = LIVE.simPace; // the rest at live-game pace, so the score stays on the same scale
  ([0, 1] as const).forEach((side) => {
    const t = s.teams[side];
    for (const e of g.rosters[side]) {
      t.players[e.slot].energy = e.energy;
      t.box.lines[e.slot] = { ...e.line };
    }
    t.box.periods = [...g.periods[side]];
    // who's on court, spot by spot (PG spot first)
    t.onCourt = g.players.filter((p) => p.side === side).sort((x, y) => x.slot - y.slot).map((p) => g.rosters[side][p.r].slot);
  });
  const length = g.period < 4 ? SIM.quarterSec : SIM.overtimeSec;
  const r = simFrom(s, g.period, 1 - g.clock / length, seed);
  // the live part's moments first (without its own top-scorer line), then the sim's
  const live = pickHighlights(g.highlights, g).filter((h) => !h.includes("led all scorers"));
  return { teams: r.teams, highlights: [...live.slice(0, 4), ...r.highlights] };
}
