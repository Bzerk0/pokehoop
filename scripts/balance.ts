// Sims CPU games and reports average score and the favourite's win rate by OVR gap (PLAN.md §11 Testing).
// Usage: npm run balance [games]   (default 10,000)
import { readFileSync } from "node:fs";
import { cpuTeam } from "../src/core/cpuTeam.ts";
import { dexOf, teamRating } from "../src/core/lineup.ts";
import { DIFFICULTIES } from "../src/core/ratingConfig.ts";
import { rateAll } from "../src/core/ratings.ts";
import { makeRng } from "../src/core/rng.ts";
import { simGame } from "../src/core/sim/sim.ts";
import { score, totals } from "../src/core/stats.ts";

const games = Number(process.argv[2] ?? 10_000);
const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);
const rng = makeRng(2026);
const buckets = new Map<number, { games: number; wins: number }>();
let points = 0, overtimes = 0, threes = 0, fga = 0, fgm = 0;

for (let g = 0; g < games; g++) {
  const pick = () => rng.pick(DIFFICULTIES).name;
  const home = cpuTeam(pool, pick(), "unlimited", rng.int(2 ** 31));
  const away = cpuTeam(pool, pick(), "unlimited", rng.int(2 ** 31));
  const r = simGame(home, away, dex, rng.int(2 ** 31));
  const [h, a] = r.teams.map(score);
  points += h + a;
  if (r.teams[0].periods.length > 4) overtimes++;
  for (const t of r.teams) {
    const s = totals(t.lines);
    threes += s.tpa;
    fga += s.fga;
    fgm += s.fgm;
  }
  const gap = teamRating(home, dex)! - teamRating(away, dex)!;
  const bucket = Math.min(25, Math.floor(Math.abs(gap) / 5) * 5);
  const b = buckets.get(bucket) ?? { games: 0, wins: 0 };
  b.games++;
  if ((gap >= 0 && h > a) || (gap < 0 && a > h)) b.wins++;
  buckets.set(bucket, b);
}

console.log(`${games} games · average team score ${(points / games / 2).toFixed(1)} · FG ${((fgm / fga) * 100).toFixed(1)}% · ${((threes / fga) * 100).toFixed(0)}% of shots are threes · overtime ${((overtimes / games) * 100).toFixed(1)}%`);
console.log("OVR gap → favourite wins");
for (const [gap, b] of [...buckets].sort((x, y) => x[0] - y[0])) {
  console.log(`  ${String(gap).padStart(2)}–${gap + 5}${gap === 25 ? "+" : ""}: ${((b.wins / b.games) * 100).toFixed(1)}%  (${b.games} games)`);
}
