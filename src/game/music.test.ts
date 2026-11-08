import { describe, expect, it } from "vitest";
import { SONGS } from "./music.ts";

describe("the songs", () => {
  it("every bar, bass line and drum pattern is a whole 16-step bar", () => {
    for (const [name, s] of Object.entries(SONGS)) {
      expect(s.bars.length, name).toBeGreaterThan(0);
      for (const { bar } of s.bars) expect(bar.lead.length, name).toBe(16);
      for (const line of s.bass) expect(line.length, name).toBe(16);
      for (const steps of [s.kick, s.snare, s.ghost, s.openHat, s.stabs]) for (const n of steps) expect(n >= 0 && n < 16, name).toBe(true);
    }
  });

  it("the game and defence songs share a tempo and a length, so a change of hands swaps them in place", () => {
    expect(SONGS.defence.bpm).toBe(SONGS.game.bpm);
    expect(SONGS.defence.bars.length).toBe(SONGS.game.bars.length);
  });
});
