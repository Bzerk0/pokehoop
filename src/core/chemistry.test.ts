import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chemistry, CHEMISTRY_SLUGS } from "./chemistry.ts";
import { boostedOvr, dexOf, emptyLineup, SLOTS, slotOvr, teamRating, type Lineup } from "./lineup.ts";
import { CHEM, CHEM_MAX } from "./ratingConfig.ts";
import { rateAll } from "./ratings.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);
const id = (slug: string) => pool.find((p) => p.slug === slug)!.id;
const team = (slugs: (string | null)[]): Lineup => ({ ...emptyLineup("unlimited"), ids: SLOTS.map((_, i) => (slugs[i] ? id(slugs[i]!) : null)) });
const names = (l: Lineup) => chemistry(l, dex).links.map((k) => k.name);

describe("chemistry", () => {
  it("every Pokémon named in a pair or squad exists", () => {
    for (const slug of CHEMISTRY_SLUGS) expect(pool.some((p) => p.slug === slug), slug).toBe(true);
  });
  it("links an evolution line, but not unrelated Pokémon", () => {
    expect(names(team(["pichu", "raichu"]))).toEqual(["EVOLUTION LINE"]);
    expect(chemistry(team(["pichu", "raichu"]), dex).boosts.slice(0, 2)).toEqual([CHEM.family, CHEM.family]);
    expect(names(team(["pichu", "bulbasaur"]))).toEqual([]);
  });
  it("finds the starter trio, type trios, rival pairs and squads", () => {
    expect(names(team(["bulbasaur", "charmeleon", "blastoise"]))).toContain("KANTO STARTERS");
    expect(names(team(["pikachu", "jolteon", "magnezone"]))).toContain("ELECTRIC TRIO");
    const four = names(team(["pikachu", "jolteon", "magnezone", "electabuzz"]));
    expect(four).toContain("ELECTRIC ×4");
    expect(four).not.toContain("ELECTRIC TRIO"); // the bigger bonus replaces the trio
    const eight = team(["pikachu", "jolteon", "magnezone", "electabuzz", "raichu", "zapdos", "ampharos", "manectric"]);
    expect(names(eight)).toContain("ALL-ELECTRIC SQUAD");
    expect(chemistry(eight, dex).boosts.every((b) => b >= CHEM.typeMore[4])).toBe(true);
    expect(names(team(["nidoking", null, null, null, null, "nidoqueen"]))).toContain("ROYAL COUPLE");
    expect(names(team(["articuno", "zapdos", "moltres"]))).toContain("LEGENDARY BIRDS");
    expect(names(team(["articuno", "zapdos"]))).not.toContain("LEGENDARY BIRDS");
  });
  it("whole-team links need all five starters and boost all eight", () => {
    const kanto = team(["pikachu", "gengar", "machamp", "snorlax", "onix", "mewtwo", "lugia", "kyogre"]);
    const { links, boosts } = chemistry(kanto, dex);
    expect(links.find((k) => k.name === "KANTO SQUAD")!.slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(boosts.every((b) => b >= CHEM.region)).toBe(true);
    expect(names(team(["pikachu", "gengar", "machamp", "snorlax"]))).not.toContain("KANTO SQUAD");
  });
  it("boosts stack up to CHEM_MAX and raise team rating", () => {
    const stacked = team(["charmander", "charmeleon", "charizard", "bulbasaur", "squirtle"]); // line + trio + fire trio + region
    expect(Math.max(...chemistry(stacked, dex).boosts)).toBe(CHEM_MAX);
    const l = team(["pichu", "raichu"]);
    const plain = (slot: number) => slotOvr(slot, dex.get(l.ids[slot]!)!);
    expect(teamRating(l, dex)).toBeCloseTo((plain(0) + plain(1) + 2 * CHEM.family) / 2);
  });
  it("a boosted OVR never passes 99", () => {
    const p = dex.get(id("mewtwo"))!;
    expect(boostedOvr(0, p, CHEM_MAX)).toBeLessThanOrEqual(99);
  });
});
