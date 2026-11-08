import { describe, expect, it } from "vitest";
import { COURT } from "../core/live/game.ts";
import { LIVE } from "../core/ratingConfig.ts";
import { DEV_DEFAULTS, DEV_GROUPS, devChanged, getDev, resetDev, setDev } from "./dev.ts";

describe("dev menu settings", () => {
  it("every listed setting is a real tuning number", () => {
    for (const g of DEV_GROUPS) for (const [k] of g.items) expect(DEV_DEFAULTS, k).toHaveProperty([k]);
  });

  it("changes go straight into the game's numbers (nested ones too, and the court size), and reset puts them back", () => {
    setDev("quickTap", 0.2);
    setDev("timing.perfect", 0.5);
    setDev("courtScale", 1);
    setDev("nope", 3); // not a setting: ignored
    expect(LIVE.quickTap).toBe(0.2);
    expect(LIVE.timing.perfect).toBe(0.5);
    expect(COURT.w).toBeCloseTo(15.24);
    expect(devChanged()).toBe(3);
    resetDev("quickTap");
    expect(getDev("quickTap")).toBe(DEV_DEFAULTS.quickTap);
    resetDev();
    expect(devChanged()).toBe(0);
    expect(LIVE.timing.perfect).toBe(DEV_DEFAULTS["timing.perfect"]);
  });
});
