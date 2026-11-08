import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allowedIn, cpuTeam } from "../cpuTeam.ts";
import { dexOf, problems, SLOTS, teamOvr, teamRating } from "../lineup.ts";
import { DIFFICULTIES } from "../ratingConfig.ts";
import { rateAll } from "../ratings.ts";
import { makeRng } from "../rng.ts";
import { clock, score, totals } from "../stats.ts";
import { simGame, simRest, startGame } from "./sim.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);

describe("CPU teams (PLAN.md §8)", () => {
  it.each(DIFFICULTIES.map((d) => d.name))("%s teams are full, legal and inside their OVR band", (name) => {
    const d = DIFFICULTIES.find((x) => x.name === name)!;
    for (let seed = 0; seed < 12; seed++) {
      const t = cpuTeam(pool, name, "unlimited", seed);
      expect(t.ids.every((id) => id != null)).toBe(true);
      expect(new Set(t.ids).size).toBe(SLOTS.length);
      expect(problems(t, dex).filter((p) => !p.startsWith("Over the salary cap"))).toEqual([]); // CPU ignores the cap
      const ovr = teamOvr(t, dex)!;
      expect(ovr, `${name} seed ${seed}`).toBeGreaterThanOrEqual(d.min - 3);
      expect(ovr, `${name} seed ${seed}`).toBeLessThanOrEqual(d.max + 3);
    }
  });
  it("Champion is Unlimited only, and Classic CPU teams have no legendaries", () => {
    expect(allowedIn("CHAMPION", "classic")).toBe(false);
    expect(allowedIn("ALL-STAR", "classic")).toBe(true);
    const t = cpuTeam(pool, "ALL-STAR", "classic", 4);
    expect(t.ids.every((id) => !dex.get(id!)!.isLegendary && !dex.get(id!)!.isMythical)).toBe(true);
  });
  it("same seed, same team", () => expect(cpuTeam(pool, "PRO", "classic", 9)).toEqual(cpuTeam(pool, "PRO", "classic", 9)));
});

describe("sim (PLAN.md §9)", () => {
  const team = (name: (typeof DIFFICULTIES)[number]["name"], seed: number) => cpuTeam(pool, name, "unlimited", seed);

  it("same seed gives the same game", () => {
    const [a, b] = [team("PRO", 1), team("PRO", 2)];
    expect(simGame(a, b, dex, 7)).toEqual(simGame(a, b, dex, 7));
    expect(simGame(a, b, dex, 7)).not.toEqual(simGame(a, b, dex, 8));
  });

  it("player points add up to the team total, and every box score is consistent", () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = simGame(team("ALL-STAR", seed), team("PRO", seed + 100), dex, seed);
      for (const t of r.teams) {
        const s = totals(t.lines);
        expect(s.pts).toBe(score(t));
        expect(s.pts).toBe(2 * (s.fgm - s.tpm) + 3 * s.tpm);
        expect(s.fgm).toBeLessThanOrEqual(s.fga);
        expect(s.tpm).toBeLessThanOrEqual(s.tpa);
      }
      const [h, a] = r.teams.map(score);
      expect(h).not.toBe(a); // overtime until someone wins
      expect(r.highlights.length).toBeGreaterThanOrEqual(5);
      expect(r.highlights.length).toBeLessThanOrEqual(8);
    }
  });

  it("each team's five spots add up to the whole game clock (nobody plays two spots at once)", () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = simGame(team("ALL-STAR", seed), team("ROOKIE", seed + 50), dex, seed);
      const length = 4 * 90 + (r.teams[0].periods.length - 4) * 60;
      for (const t of r.teams) expect(totals(t.lines).sec).toBeCloseTo(5 * length, 0);
    }
  });

  it("over 2,000 games the average team score is 75–110, and a team 15 OVR better wins 75–90%", () => {
    const rng = makeRng(15);
    let points = 0, played = 0, favWins = 0;
    for (let g = 0; g < 2000; g++) {
      const a = team(rng.pick(DIFFICULTIES).name, rng.int(1e9));
      const b = team(rng.pick(DIFFICULTIES).name, rng.int(1e9));
      const r = simGame(a, b, dex, rng.int(1e9));
      const [h, w] = r.teams.map(score);
      points += h + w;
      const gap = teamRating(a, dex)! - teamRating(b, dex)!;
      if (Math.abs(Math.abs(gap) - 15) <= 3) {
        played++;
        if ((gap > 0) === (h > w)) favWins++;
      }
    }
    expect(points / 4000).toBeGreaterThanOrEqual(75);
    expect(points / 4000).toBeLessThanOrEqual(110);
    expect(played).toBeGreaterThan(100); // enough close-to-15 games that one result doesn't tip it
    expect(favWins / played).toBeGreaterThanOrEqual(0.75);
    expect(favWins / played).toBeLessThanOrEqual(0.9);
  }, 90_000);

  it("simRest finishes a game from any state (here, tip-off)", () => {
    const [a, b] = [team("ROOKIE", 5), team("CHAMPION", 6)];
    expect(simRest(startGame(a, b, dex), 11)).toEqual(simGame(a, b, dex, 11));
  });

  it("clock formats seconds", () => {
    expect(clock(95)).toBe("1:35");
    expect(clock(59.6)).toBe("1:00");
  });
});
