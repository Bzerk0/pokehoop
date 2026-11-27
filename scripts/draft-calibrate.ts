// Re-checks the draft grades: simulates N drafts per strategy and prints team-rating percentiles + grade shares.
// Usage: npx tsx scripts/draft-calibrate.ts [drafts] [wins]  (default 600; "wins" also plays each one's 82-game
// season, season.ts, and prints win percentiles and the season grade shares: slow, use ~100 drafts)
import { readFileSync } from "node:fs";
import { bestSpot, draftGrade, isOver, openSlots, pickOffer, startDraft, toLineup, type Draft } from "../src/core/draft.ts";
import { dexOf, payroll, salary, SLOTS, slotOvr, teamRating } from "../src/core/lineup.ts";
import { DRAFT_GRADES, SALARY_CAP, SALARY_MAX } from "../src/core/ratingConfig.ts";
import { seasonGrade, seasonRecord } from "../src/core/season.ts";
import { SEASON } from "../src/core/ratingConfig.ts";
import { rateAll } from "../src/core/ratings.ts";
import { makeRng } from "../src/core/rng.ts";

const N = Number(process.argv[2] ?? 600);
const WINS = process.argv[3] === "wins";
const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);
type Choice = [number, number];
const rate = (d: Draft, id: number) => slotOvr(bestSpot(d, dex.get(id)!), dex.get(id)!);
const strategies: Record<string, (i: number) => (d: Draft) => Choice> = {
  random: (i) => { const r = makeRng(i); return (d) => [r.pick(d.offers).id, r.pick(openSlots(d))]; },
  sensible: () => (d) => {
    const fair = (1.6 * (SALARY_CAP - payroll(toLineup(d), dex))) / (SLOTS.length - d.round);
    const ok = d.offers.filter((o) => salary(dex.get(o.id)!) <= fair);
    const id = [...(ok.length ? ok : d.offers)].sort((a, b) => rate(d, b.id) - rate(d, a.id))[0].id;
    return [id, bestSpot(d, dex.get(id)!)];
  },
  starHeavy: () => (d) => { const id = [...d.offers].sort((a, b) => rate(d, b.id) - rate(d, a.id))[0].id; return [id, bestSpot(d, dex.get(id)!)]; },
  value: () => (d) => {
    const id = [...d.offers].sort((a, b) => rate(d, b.id) / salary(dex.get(b.id)!) - rate(d, a.id) / salary(dex.get(a.id)!))[0].id;
    return [id, bestSpot(d, dex.get(id)!)];
  },
};
console.log(`SALARY_MAX ${SALARY_MAX}, cap ${SALARY_CAP}, grades ${JSON.stringify(DRAFT_GRADES)}`);
for (const [name, mk] of Object.entries(strategies)) {
  const rs: number[] = [], ws: number[] = [];
  for (let i = 0; i < N; i++) {
    let d = startDraft(pool, dex, "classic", 1000 + i);
    const choose = mk(i);
    while (!isOver(d)) d = pickOffer(d, pool, dex, ...choose(d));
    rs.push(teamRating(toLineup(d), dex)!);
    if (WINS) ws.push(seasonRecord(toLineup(d), dex, pool).wins);
  }
  rs.sort((a, b) => a - b);
  const q = (p: number) => rs[Math.floor(p * (N - 1))].toFixed(1);
  const shares = DRAFT_GRADES.map(([g]) => `${g} ${Math.round((rs.filter((r) => draftGrade(r) === g).length / N) * 100)}%`).join(" ");
  if (WINS) {
    ws.sort((a, b) => a - b);
    const w = (p: number) => ws[Math.floor(p * (N - 1))];
    const g = SEASON.grades.map(([n]) => `${n} ${Math.round((ws.filter((x) => seasonGrade(x) === n).length / N) * 100)}%`).join(" ");
    console.log(`${name.padEnd(9)} WINS p10 ${w(0.1)} p25 ${w(0.25)} p50 ${w(0.5)} p75 ${w(0.75)} p90 ${w(0.9)} max ${ws[N - 1]} | ${g}`);
  }
  console.log(`${name.padEnd(9)} p10 ${q(0.1)} p25 ${q(0.25)} p50 ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)} | ${shares}`);
}
