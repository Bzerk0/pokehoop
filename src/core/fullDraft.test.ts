import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { available, budgetOf, isDone, lineupOf, onClock, startFull, standings, totalPicks, YOU, youPick, type FullDraft } from "./fullDraft.ts";
import { dexOf, problems, salary, SLOTS, slotOvr } from "./lineup.ts";
import { FULL } from "./ratingConfig.ts";
import { rateAll } from "./ratings.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);
const best = (id: number) => dex.get(id)!.ovr[dex.get(id)!.best];

/** You take the best player you can afford each time, at your best open spot. */
function finish(fd: FullDraft) {
  while (!isDone(fd)) {
    expect(onClock(fd)).toBe(YOU); // the CPU picks run themselves
    const open = fd.rosters[YOU].flatMap((id, s) => (id == null ? [s] : []));
    const p = available(fd, dex).find((q) => salary(q) <= budgetOf(fd, YOU, dex))!;
    const slot = open.reduce((a, b) => (slotOvr(b, p) > slotOvr(a, p) ? b : a));
    fd = youPick(fd, dex, p.id, slot);
  }
  return fd;
}

describe("full draft", () => {
  it("deals a bell-curve class, a shuffled pick order, and the CPU picks up to your turn", () => {
    const fd = startFull(pool, dex, "classic", 7);
    expect(fd.pool).toHaveLength(Math.round(FULL.teams * SLOTS.length * FULL.classSize));
    const ovr = fd.pool.map(best), mean = ovr.reduce((a, b) => a + b, 0) / ovr.length;
    expect(Math.abs(mean - FULL.mean)).toBeLessThan(3);
    const sd = Math.sqrt(ovr.reduce((s, x) => s + (x - mean) ** 2, 0) / ovr.length);
    expect(Math.abs(sd - FULL.sd)).toBeLessThan(3);
    expect([...fd.order].sort()).toEqual(Array.from({ length: FULL.teams }, (_, i) => i));
    expect(new Set([1, 2, 3, 4, 5].map((s) => startFull(pool, dex, "classic", s).order.indexOf(YOU))).size).toBeGreaterThan(1); // the lottery moves you
    expect(onClock(fd)).toBe(YOU);
    expect(fd.picks).toHaveLength(fd.order.indexOf(YOU)); // the teams ahead of you have picked
  });

  it("a whole draft fills every roster, nobody twice, everyone under the cap, picking in lottery order every round", () => {
    for (const seed of [1, 2, 3]) {
      const fd = finish(startFull(pool, dex, seed % 2 ? "classic" : "unlimited", seed));
      expect(fd.picks).toHaveLength(totalPicks(fd));
      expect(new Set(fd.picks.map((p) => p.id)).size).toBe(fd.picks.length);
      fd.picks.forEach((p, n) => expect(p.team).toBe(fd.order[n % fd.order.length]));
      for (let t = 0; t < FULL.teams; t++) expect(problems(lineupOf(fd, t), dex)).toEqual([]);
      expect(standings(fd, dex)).toHaveLength(FULL.teams);
    }
  });

  it("refuses a pick out of turn, already taken, or over your budget", () => {
    const fd = startFull(pool, dex, "classic", 11);
    const gone = fd.picks[0]?.id;
    if (gone != null) expect(youPick(fd, dex, gone, 0)).toBe(fd);
    const pricey = available(fd, dex).find((p) => salary(p) > budgetOf(fd, YOU, dex));
    if (pricey) expect(youPick(fd, dex, pricey.id, 0)).toBe(fd);
    expect(youPick(fd, dex, available(fd, dex).at(-1)!.id, 0)).not.toBe(fd);
  });
});
