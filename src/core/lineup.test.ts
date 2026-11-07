import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SALARY_CAP, SALARY_MAX, SALARY_MIN } from "./ratingConfig.ts";
import {
  autoFill,
  budgetFor,
  payroll,
  salary,
  decodeLineup,
  dexOf,
  emptyLineup,
  encodeLineup,
  isEligible,
  problems,
  randomTeam,
  SLOTS,
  slotOvr,
  teamOvr,
  warnings,
  withMode,
  type Lineup,
} from "./lineup.ts";
import { rateAll } from "./ratings.ts";
import { makeRng } from "./rng.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);
const id = (slug: string) => pool.find((p) => p.slug === slug)!.id;
const team = (slugs: (string | null)[], mode: Lineup["mode"] = "unlimited"): Lineup => ({
  ...emptyLineup(mode),
  ids: SLOTS.map((_, i) => (slugs[i] ? id(slugs[i]!) : null)),
});

describe("rng", () => {
  it("same seed, same numbers; all in [0, 1)", () => {
    const a = makeRng(42), b = makeRng(42);
    const xs = Array.from({ length: 100 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(makeRng(43).next()).not.toBe(xs[0]);
  });
});

describe("team OVR", () => {
  it("is 80% starters' average at their slots + 20% bench's best-position average", () => {
    const l = team(["alakazam", "jolteon", "machamp", "tyranitar", "snorlax", "pikachu", "magikarp", "shuckle"]);
    const at = (slot: number) => slotOvr(slot, dex.get(l.ids[slot]!)!);
    const starters = [0, 1, 2, 3, 4].reduce((s, i) => s + at(i), 0) / 5;
    const bench = [5, 6, 7].reduce((s, i) => s + at(i), 0) / 3;
    expect(teamOvr(l, dex)).toBe(Math.round(0.8 * starters + 0.2 * bench));
    expect(at(5)).toBe(dex.get(id("pikachu"))!.ovr[dex.get(id("pikachu"))!.best]);
  });
  it("uses starters only when the bench is empty, and is null for an empty team", () => {
    expect(teamOvr(team(["alakazam"]), dex)).toBe(dex.get(id("alakazam"))!.ovr.PG);
    expect(teamOvr(emptyLineup(), dex)).toBeNull();
  });
});

describe("rules and warnings", () => {
  it("catches duplicates and legendaries in Classic", () => {
    expect(problems(team(["pikachu", "pikachu"]), dex)).toEqual(["Pikachu is on the team twice"]);
    expect(problems(team(["mewtwo"], "classic"), dex)).toEqual(["Mewtwo isn't allowed in Classic"]);
    expect(problems(team(["mewtwo"], "unlimited"), dex)).toEqual([]);
  });
  it("switching to Classic drops legendaries", () => {
    expect(withMode(team(["mewtwo", "pikachu"]), "classic", dex).ids.slice(0, 2)).toEqual([null, id("pikachu")]);
  });
  it("warns about too few shooters and a short team", () => {
    const small = team(["magikarp", "caterpie", "weedle", "pichu", "joltik"]);
    expect(warnings(small, dex)).toHaveLength(2);
    expect(warnings(emptyLineup(), dex)).toEqual([]);
  });
});

describe("salary cap", () => {
  it("salaries rise with best OVR, from SALARY_MIN to SALARY_MAX", () => {
    const sorted = [...pool].sort((a, b) => a.ovr[a.best] - b.ovr[b.best]);
    for (let i = 1; i < sorted.length; i++) expect(salary(sorted[i])).toBeGreaterThanOrEqual(salary(sorted[i - 1]));
    expect(salary(sorted[0])).toBe(SALARY_MIN);
    expect(salary(sorted[sorted.length - 1])).toBe(SALARY_MAX);
  });
  it("a team of stars is over the cap, and that's a problem", () => {
    const stars = team(["groudon", "kyogre", "rayquaza", "dialga", "palkia"]);
    expect(payroll(stars, dex)).toBeGreaterThan(SALARY_CAP);
    expect(problems(stars, dex).at(-1)).toMatch(/^Over the salary cap by \$\d+M$/);
  });
  it("budgetFor keeps the minimum salary for every other empty slot, and frees the current player's salary", () => {
    const l = team(["groudon"]);
    expect(budgetFor(l, 1, dex)).toBe(SALARY_CAP - salary(dex.get(id("groudon"))!) - 6 * SALARY_MIN);
    expect(budgetFor(l, 0, dex)).toBe(SALARY_CAP - 7 * SALARY_MIN);
  });
});

describe("auto-fill and random teams", () => {
  it("auto-fill fills every slot with unique, eligible players under the cap and keeps your picks", () => {
    for (const mode of ["classic", "unlimited"] as const) {
      const l = autoFill(team(["pikachu"], mode), pool);
      expect(l.ids[0]).toBe(id("pikachu"));
      expect(l.ids.every((x) => x != null)).toBe(true);
      expect(new Set(l.ids).size).toBe(SLOTS.length);
      expect(problems(l, dex)).toEqual([]);
      expect(payroll(l, dex)).toBeLessThanOrEqual(SALARY_CAP);
    }
  });
  it("auto-fill spreads the money: it beats just signing the best player and filling with the cheapest", () => {
    const filled = autoFill(emptyLineup("classic"), pool);
    const cheapest = [...pool].filter((p) => isEligible(p, "classic")).sort((a, b) => salary(a) - salary(b) || b.ovr[b.best] - a.ovr[a.best]);
    const lopsided = autoFill(team(["gengar", ...cheapest.slice(0, 7).map((p) => p.slug)], "classic"), pool);
    expect(teamOvr(filled, dex)!).toBeGreaterThan(teamOvr(lopsided, dex)!);
  });
  it("random teams are full, valid, under the cap, and the same for the same seed", () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = randomTeam(emptyLineup("classic"), pool, makeRng(seed));
      expect(a.ids.every((x) => x != null)).toBe(true);
      expect(problems(a, dex)).toEqual([]);
    }
    expect(randomTeam(emptyLineup("classic"), pool, makeRng(7))).toEqual(randomTeam(emptyLineup("classic"), pool, makeRng(7)));
  });
});

describe("share codes", () => {
  it("round-trip a team, including empty slots and a non-ASCII name", () => {
    const l: Lineup = { ...team(["alakazam", null, "machamp", "tyranitar", "snorlax", null, "eevee", "mew"]), name: "Pokémon Ballers ★", colors: [3, 31] };
    const code = encodeLineup(l);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeLineup(code, 32)).toEqual(l);
  });
  it("reject damaged codes", () => {
    for (const bad of ["", "abc", "!!!", encodeLineup(emptyLineup()).slice(0, 10)]) expect(decodeLineup(bad, 32)).toBeNull();
    expect(decodeLineup(encodeLineup({ ...emptyLineup(), colors: [40, 1] }), 32)).toBeNull();
  });
});
