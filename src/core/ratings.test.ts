import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { percentiles, rateAll } from "./ratings.ts";
import { ATTRIBUTES, POSITIONS, type Attribute, type PokemonData, type Position, type RatedPokemon } from "./types.ts";

const pool: PokemonData[] = JSON.parse(readFileSync("public/data/pokemon.json", "utf8"));
const rated = rateAll(pool);
const get = (slug: string) => {
  const p = rated.find((r) => r.slug === slug);
  if (!p) throw new Error(`${slug} not in pool`);
  return p;
};
/** share of the pool (0–1) strictly better than this value */
const shareAbove = (value: number, pick: (r: RatedPokemon) => number) =>
  rated.filter((r) => pick(r) > value).length / rated.length;
const attrTop = (slug: string, attr: Attribute) => shareAbove(get(slug).attrs[attr], (r) => r.attrs[attr]);
const ovrTop = (slug: string, pos: Position) => shareAbove(get(slug).ovr[pos], (r) => r.ovr[pos]);

describe("percentiles", () => {
  it("ranks low to high and shares ties", () => expect(percentiles([10, 20, 20, 30])).toEqual([12.5, 50, 50, 87.5]));
});

describe("ratings (PLAN.md §6 tests)", () => {
  it("Machamp finishes better than Pikachu", () =>
    expect(get("machamp").attrs.finishing).toBeGreaterThan(get("pikachu").attrs.finishing));
  it("Snorlax rebounding is in the top 10%", () => expect(attrTop("snorlax", "rebounding")).toBeLessThan(0.1));
  it("Alakazam's best position is PG or SG", () => expect(["PG", "SG"]).toContain(get("alakazam").best));
  it("Jolteon speed is in the top 5%", () => expect(attrTop("jolteon", "speed")).toBeLessThan(0.05));
  it.each(["metagross", "tyranitar"])("%s has a top-10%% PF or C OVR", (slug) =>
    expect(Math.min(ovrTop(slug, "PF"), ovrTop(slug, "C"))).toBeLessThan(0.1));
  it("every attribute and OVR is a whole number 0–99", () => {
    for (const r of rated) {
      for (const v of [...ATTRIBUTES.map((a) => r.attrs[a]), ...POSITIONS.map((p) => r.ovr[p])]) {
        expect(Number.isInteger(v) && v >= 0 && v <= 99, `${r.slug}: ${v}`).toBe(true);
      }
    }
  });
  it("overrides replace attributes and best position", () => {
    const [p] = rateAll(pool, { pikachu: { attrs: { shooting: 99 }, best: "C" } }).filter((r) => r.slug === "pikachu");
    expect(p.attrs.shooting).toBe(99);
    expect(p.best).toBe("C");
  });
});
