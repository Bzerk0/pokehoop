// Plays CPU-vs-CPU live games (both teams on autopilot, each with a CPU coach calling plays and schemes) and reports
// how possessions flow: length, passes, shots, turnovers, violations, rebounds, and which calls were made.
// Use it after tuning LIVE / LIVE_AI in ratingConfig.ts or the plays in src/core/live/plays.ts.
// Usage: npm run balance:live [size=5] [level=PRO] [games=12] [scheme]   (a scheme forces both defences into it)
import { readFileSync } from "node:fs";
import { makeAi, makeCoach } from "../src/core/live/ai.ts";
import { boxes, callScheme, lineupGame, step } from "../src/core/live/game.ts";
import type { SchemeName } from "../src/core/live/plays.ts";
import { cpuTeam, type Difficulty } from "../src/core/cpuTeam.ts";
import { dexOf } from "../src/core/lineup.ts";
import { LIVE_AI } from "../src/core/ratingConfig.ts";
import { rateAll } from "../src/core/ratings.ts";

const size = Number(process.argv[2] ?? 5), level = (process.argv[3] ?? "PRO") as Difficulty, games = Number(process.argv[4] ?? 12);
const forced = process.argv[5] as SchemeName | undefined;
const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);
const DT = 1 / 60;
const n: Record<string, number> = {};
const add = (k: string, v = 1) => (n[k] = (n[k] ?? 0) + v);

for (let s = 1; s <= games; s++) {
  // full timed games (4 quarters, fatigue, subs) for 3 and 5 a side; first to 11 for 1v1
  const g = lineupGame(cpuTeam(pool, level, "unlimited", s * 11), cpuTeam(pool, level, "unlimited", s * 13 + 5), dex, size as 1 | 3 | 5, s);
  const ai = g.players.map((p) => makeAi(p.i, LIVE_AI[level]));
  const coaches = [makeCoach(0), makeCoach(1)];
  let t = 0, poss = g.poss, start = 0;
  for (; t < 1800 && !g.over; t += DT) {
    step(g, g.players.map((p) => ai[p.i](g, DT)), DT);
    for (const c of coaches) c(g);
    if (forced) for (const s of [0, 1] as const) callScheme(g, s, forced);
    for (const e of g.events) {
      if (e.kind === "call") add(`call:${e.text}`);
      if (e.kind === "release") add(["DUNK", "LAYUP"].includes(e.text) ? "drives" : `shots:${g.lastShot?.zone}`);
      if (e.kind === "make") add("points", e.text === "THREE!" ? 3 : 2);
      if (e.kind === "make") add("makes");
      if (e.kind === "steal") add(e.text === "PICKED OFF!" ? "pickedOff" : "steals");
      if (["pass", "block", "violation", "sub"].includes(e.kind)) add(e.kind);
      if (e.kind === "period" && e.text === "OVERTIME!") add("overtimes");
      if (e.kind === "rebound") add(g.poss === g.lastShot?.side ? "offRebounds" : "rebounds");
    }
    if (g.poss !== poss) {
      add("possessions");
      add("possessionSec", t - start);
      poss = g.poss;
      start = t;
    }
  }
  add("finished", g.over ? 1 : 0);
  add("sec", t);
  add("margin", Math.abs(g.score[0] - g.score[1]));
  if (g.timed) add("benchSec", boxes(g).flatMap((b) => b.lines.filter((l) => l.slot >= 5)).reduce((x, l) => x + l.sec, 0));
}

const per = (k: string) => ((n[k] ?? 0) / games).toFixed(1);
const shots = (n.drives ?? 0) + (n["shots:rim"] ?? 0) + (n["shots:mid"] ?? 0) + (n["shots:three"] ?? 0);
const turnovers = (n.steals ?? 0) + (n.pickedOff ?? 0) + (n.violation ?? 0);
console.log(`${size}v${size} ${level}, ${games} games: ${n.finished}/${games} finished, ${per("sec")} s and ${per("points")} points a game`);
console.log(`possessions ${per("possessions")} a game, ${((n.possessionSec ?? 0) / (n.possessions || 1)).toFixed(1)} s each, ${((n.pass ?? 0) / (n.possessions || 1)).toFixed(1)} passes each`);
console.log(`shots ${(shots / games).toFixed(1)} a game (drives ${per("drives")}, rim ${per("shots:rim")}, mid ${per("shots:mid")}, three ${per("shots:three")}), ${((100 * (n.makes ?? 0)) / (shots || 1)).toFixed(0)}% made`);
console.log(`turnovers ${((100 * turnovers) / (n.possessions || 1)).toFixed(0)}% of possessions (steals ${per("steals")}, picked off ${per("pickedOff")}, shot clock ${per("violation")}), blocks ${per("block")}, offensive boards ${per("offRebounds")} of ${((n.offRebounds ?? 0) / games + (n.rebounds ?? 0) / games).toFixed(1)}`);
console.log(`margin ${per("margin")} points, overtimes ${n.overtimes ?? 0} in ${games} games, subs ${per("sub")} a game, bench minutes ${((n.benchSec ?? 0) / games / 60).toFixed(1)} a game`);
console.log(`calls a game:${Object.keys(n).filter((k) => k.startsWith("call:")).map((k) => `${k.slice(5)} ${per(k)}`).join(", ") || "none"}${forced ? ` (defences forced to ${forced})` : ""}`);
