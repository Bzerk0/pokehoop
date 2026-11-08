import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bestSpot,
  checkDraft,
  chemPreview,
  dailySeed,
  draftGrade,
  isOver,
  openSlots,
  pickCall,
  pickOffer,
  reroll,
  startDraft,
  tierOf,
  toLineup,
  type Draft,
} from "./draft.ts";
import { budgetFor, dexOf, isEligible, payroll, problems, salary, SLOTS, slotOvr, teamRating } from "./lineup.ts";
import { ARCADE, DRAFT_GRADES, DRAFT_REROLLS, SALARY_CAP } from "./ratingConfig.ts";
import { rateAll } from "./ratings.ts";
import { makeRng } from "./rng.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);
type Choice = [id: number, slot: number];

/** Run a whole draft, choosing with `choose`, checking every round's offers on the way. */
function run(seed: number, choose: (d: Draft) => Choice, mode: "classic" | "unlimited" = "classic") {
  let d = startDraft(pool, dex, mode, seed);
  while (!isOver(d)) {
    const budget = budgetFor(toLineup(d), openSlots(d)[0], dex);
    expect(d.offers).toHaveLength(ARCADE.reels);
    expect(new Set(d.offers.map((o) => o.id)).size).toBe(ARCADE.reels);
    for (const o of d.offers) {
      const p = dex.get(o.id)!;
      expect(isEligible(p, mode)).toBe(true);
      expect(salary(p)).toBeLessThanOrEqual(budget);
      expect(d.ids).not.toContain(o.id);
      expect(o.tier).toBe(tierOf(p));
    }
    d = pickOffer(d, pool, dex, ...choose(d));
  }
  return d;
}
const randomly = (rng: ReturnType<typeof makeRng>) => (d: Draft): Choice => [rng.pick(d.offers).id, rng.pick(openSlots(d))];
/** Spend sensibly (nobody over 1.6× an even share of what's left) and put each pick where it rates highest. */
const sensibly = (d: Draft): Choice => {
  const fair = (1.6 * (SALARY_CAP - payroll(toLineup(d), dex))) / (SLOTS.length - d.round);
  const ok = d.offers.filter((o) => salary(dex.get(o.id)!) <= fair);
  const rate = (id: number) => slotOvr(bestSpot(d, dex.get(id)!), dex.get(id)!);
  const id = [...(ok.length ? ok : d.offers)].sort((a, b) => rate(b.id) - rate(a.id))[0].id;
  return [id, bestSpot(d, dex.get(id)!)];
};

describe("draft", () => {
  it("the first pull always has a STAR; after that most pulls do, and better tiers land less often", () => {
    const count: Record<string, number> = { STAR: 0, STARTER: 0, ROLE: 0, SLEEPER: 0 };
    let later = 0, laterStar = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const d = startDraft(pool, dex, "classic", seed);
      expect(d.offers.some((o) => o.tier === "STAR"), `seed ${seed}`).toBe(true);
      const r = reroll(d, pool, dex); // a later pull (same budget, so a STAR is affordable)
      later++;
      if (r.offers.some((o) => o.tier === "STAR")) laterStar++;
      for (const o of r.offers) count[o.tier]++;
    }
    expect(laterStar / later).toBeGreaterThan(ARCADE.starChance - 0.07);
    expect(laterStar / later).toBeLessThan(Math.min(1, ARCADE.starChance + 0.07));
    // without the STAR top-up, reels follow the weights: rarer tiers land less often
    expect(count.STARTER).toBeLessThan(count.ROLE);
  }, 30_000);

  it("every draft can be finished, under the cap, with no rule broken (random picks and spots, many seeds)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const l = toLineup(run(seed, randomly(makeRng(seed)), seed % 2 ? "classic" : "unlimited"));
      expect(l.ids.every((id) => id != null)).toBe(true);
      expect(payroll(l, dex)).toBeLessThanOrEqual(SALARY_CAP);
      expect(problems(l, dex)).toEqual([]);
    }
  });

  it("a pick goes on the spot you choose, and only on an open one", () => {
    const d = startDraft(pool, dex, "classic", 5);
    const [a, b] = d.offers.map((o) => o.id);
    const next = pickOffer(d, pool, dex, a, 6);
    expect(next.ids[6]).toBe(a);
    expect(next.round).toBe(1);
    expect(pickOffer(next, pool, dex, next.offers[0].id, 6)).toBe(next); // spot taken
    const notOffered = pool.find((p) => !d.offers.some((o) => o.id === p.id))!;
    expect(pickOffer(d, pool, dex, notOffered.id, 0)).toBe(d);
    expect(b).not.toBe(a);
  });

  it("bestSpot puts a Pokémon where it rates highest, and prefers starting to the bench on a tie", () => {
    const d = startDraft(pool, dex, "classic", 5);
    const p = dex.get(d.offers[0].id)!;
    expect(bestSpot(d, p)).toBe(SLOTS.indexOf(p.best as (typeof SLOTS)[number]));
  });

  it("the same seed and the same picks deal the same draft", () => {
    expect(run(42, sensibly)).toEqual(run(42, sensibly));
    expect(startDraft(pool, dex, "classic", 42).offers).not.toEqual(startDraft(pool, dex, "classic", 43).offers);
  });

  it(`rerolls deal new offers, ${DRAFT_REROLLS} per draft`, () => {
    let d = startDraft(pool, dex, "classic", 9);
    for (let i = 0; i < DRAFT_REROLLS; i++) {
      const next = reroll(d, pool, dex);
      expect(next.rerolls).toBe(d.rerolls - 1);
      expect(next.offers).not.toEqual(d.offers);
      d = next;
    }
    expect(reroll(d, pool, dex)).toBe(d);
  });

  it("the daily seed is today's date", () => {
    expect(dailySeed(new Date(2026, 10, 6))).toBe(20261106);
  });

  it("spending sensibly earns a better grade than picking at random", () => {
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const grade = (choose: (i: number) => (d: Draft) => Choice) =>
      draftGrade(median(Array.from({ length: 15 }, (_, i) => teamRating(toLineup(run(100 + i, choose(i))), dex)!)));
    const rank = (g: string) => DRAFT_GRADES.findIndex(([name]) => name === g);
    expect(rank(grade(() => sensibly))).toBeLessThan(rank(grade((i) => randomly(makeRng(i)))));
  });

  it("grades run from A+ down to F", () => {
    expect(draftGrade(99)).toBe("A+");
    expect(draftGrade(0)).toBe("F");
    for (let i = 1; i < DRAFT_GRADES.length; i++) expect(DRAFT_GRADES[i][1]).toBeLessThan(DRAFT_GRADES[i - 1][1]);
  });

  it("taking a star is a franchise pick", () => {
    const d = startDraft(pool, dex, "classic", 3);
    const star = d.offers.find((o) => o.tier === "STAR")!.id;
    expect(pickCall(d, star, bestSpot(d, dex.get(star)!), dex)).toBe("FRANCHISE PLAYER!");
  });

  it("chemPreview shows the links a pick would join", () => {
    const pichu = pool.find((p) => p.slug === "pichu")!.id;
    const raichu = pool.find((p) => p.slug === "raichu")!.id;
    const d: Draft = { ...startDraft(pool, dex, "unlimited", 1), ids: [pichu, null, null, null, null, null, null, null], round: 1 };
    expect(chemPreview(d, raichu, dex).links.map((k) => k.name)).toEqual(["EVOLUTION LINE"]);
  });

  it("a stored draft is checked before it's trusted", () => {
    const d = startDraft(pool, dex, "classic", 11);
    expect(checkDraft(JSON.parse(JSON.stringify(d)), dex)).toEqual(d);
    expect(checkDraft({ ...d, round: 3 }, dex)).toBeNull(); // claims picks it doesn't have
    expect(checkDraft({ ...d, offers: [{ id: 99999, tier: "STAR" }] }, dex)).toBeNull();
    expect(checkDraft("nonsense", dex)).toBeNull();
    const placed = pickOffer(d, pool, dex, d.offers[0].id, 7); // a pick on the bench first is fine
    expect(checkDraft(JSON.parse(JSON.stringify(placed)), dex)).toEqual(placed);
  });
});
