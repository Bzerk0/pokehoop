import { describe, expect, it } from "vitest";
import { PALETTE } from "../ui/theme/palette.ts";
import { MASCOTS, PLACES, randomTeamStyle } from "./cpuTeam.ts";
import { NAME_MAX } from "./lineup.ts";
import { makeRng } from "./rng.ts";

describe("randomTeamStyle", () => {
  const rng = makeRng(42);
  const styles = Array.from({ length: 128 }, () => randomTeamStyle(rng));

  it("combines a place and mascot within the team name limit", () => {
    const names = new Set(PLACES.flatMap((place) => MASCOTS.map((mascot) => `${place} ${mascot}`)));
    for (const { name } of styles) {
      expect(names).toContain(name);
      expect(name.length).toBeLessThanOrEqual(NAME_MAX);
    }
    expect(new Set(styles.map((style) => style.name)).size).toBeGreaterThan(1);
  });

  it("picks two distinct indices from the jersey picker palette", () => {
    const palette = Object.keys(PALETTE);
    for (const { colors } of styles) {
      expect(colors).toHaveLength(2);
      expect(colors[0]).not.toBe(colors[1]);
      for (const index of colors) expect(palette[index]).toBeDefined();
    }
    expect(new Set(styles.flatMap((style) => style.colors)).size).toBeGreaterThan(2);
  });

  it("replays the same sequence from the same seed", () => {
    const replay = makeRng(42);
    expect(styles.map(() => randomTeamStyle(replay))).toEqual(styles);
  });
});
