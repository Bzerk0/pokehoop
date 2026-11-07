import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, inkOn, PALETTE, TYPE_COLOR } from "./palette.ts";

describe("palette", () => {
  const css = readFileSync("src/index.css", "utf8");
  const cssColors = Object.fromEntries([...css.matchAll(/--color-([a-z]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));

  it("has about 32 colours", () => expect(Object.keys(PALETTE).length).toBe(32));
  it("index.css @theme mirrors palette.ts exactly", () => expect(cssColors).toEqual(PALETTE));
  it("text on every type colour reaches 4.5:1 contrast", () => {
    for (const c of Object.values(TYPE_COLOR)) expect(contrast(c, inkOn(c)), c).toBeGreaterThanOrEqual(4.5);
  });
  it("every type maps to a palette colour", () => {
    for (const c of Object.values(TYPE_COLOR)) expect(PALETTE).toHaveProperty(c);
    expect(Object.keys(TYPE_COLOR)).toHaveLength(18);
  });
});
