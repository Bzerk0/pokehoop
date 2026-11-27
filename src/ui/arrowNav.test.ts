import { describe, expect, it } from "vitest";
import { nearest } from "./arrowNav.ts";

describe("arrow navigation", () => {
  // a 2×2 grid of buttons, then one wide button under it
  const box = (left: number, top: number, w = 80, h = 30) => ({ left, top, right: left + w, bottom: top + h });
  const grid = [box(0, 0), box(100, 0), box(0, 50), box(100, 50), box(0, 100, 180)];
  it("moves to the nearest button in the arrow's direction", () => {
    expect(nearest(grid[0], [1, 0], grid)).toBe(1);
    expect(nearest(grid[0], [0, 1], grid)).toBe(2);
    expect(nearest(grid[3], [-1, 0], grid)).toBe(2);
    expect(nearest(grid[3], [0, 1], grid)).toBe(4);
    expect(nearest(grid[4], [0, -1], grid)).toBe(2);
    expect(nearest(grid[2], [0, 1], grid)).toBe(4); // the wide one right below, not a far one off to the side
  });
  it("stays put at an edge", () => {
    expect(nearest(grid[0], [0, -1], grid)).toBe(-1);
    expect(nearest(grid[1], [1, 0], grid)).toBe(-1);
  });
});
