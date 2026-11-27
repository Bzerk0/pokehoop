import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cpuTeam } from "./cpuTeam.ts";
import { dexOf } from "./lineup.ts";
import { rateAll } from "./ratings.ts";
import { SEASON } from "./ratingConfig.ts";
import { seasonGrade, seasonLeague, seasonRecord } from "./season.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);

describe("draft season", () => {
  it("plays a full season, the same every time, and stronger teams win more", () => {
    const weak = cpuTeam(pool, "ROOKIE", "classic", 5), strong = cpuTeam(pool, "CHAMPION", "classic", 5);
    const a = seasonRecord(strong, dex, pool);
    expect(a.wins + a.losses).toBe(SEASON.games);
    expect(seasonRecord(strong, dex, pool)).toEqual(a);
    expect(a.wins).toBeGreaterThan(seasonRecord(weak, dex, pool).wins + 30);
  });
  it("uses one fixed league per mode", () => {
    expect(seasonLeague(pool, "classic")).toBe(seasonLeague(pool, "classic"));
    expect(seasonLeague(pool, "classic").length).toBe(Object.values(SEASON.league).reduce((s, n) => s + n, 0));
  });
  it("grades by wins", () => {
    expect(seasonGrade(SEASON.games)).toBe("A+");
    expect(seasonGrade(0)).toBe("F");
  });
});
