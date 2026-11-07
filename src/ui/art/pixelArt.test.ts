import { describe, expect, it } from "vitest";
import { BALL_GRID, BALL_SIZE } from "./ballLogo.ts";
import { disc, gridToUrl } from "./pixelArt.ts";

describe("pixel art", () => {
  it("disc is round, symmetric, and outlined on its rim", () => {
    const g = disc(8, (_x, _y, _d, edge) => (edge ? "K" : "F"));
    expect(g).toEqual(["..KKKK..", ".KFFFFK.", "KFFFFFFK", "KFFFFFFK", "KFFFFFFK", "KFFFFFFK", ".KFFFFK.", "..KKKK.."]);
  });
  it("gridToUrl draws one rect per colour run, in palette colours", () => {
    const svg = decodeURIComponent(gridToUrl(["KKF."], { K: "black", F: "orange" }));
    expect(svg).toContain('<rect x="0" y="0" width="2" height="1" fill="#0b0b14"/>');
    expect(svg).toContain('<rect x="2" y="0" width="1" height="1" fill="#e8702a"/>');
    expect(svg.match(/<rect/g)).toHaveLength(2);
  });
  it("the logo is a full 32×32 grid with a black band through the middle", () => {
    expect(BALL_GRID).toHaveLength(BALL_SIZE);
    for (const row of BALL_GRID) expect(row).toHaveLength(BALL_SIZE);
    expect(BALL_GRID[15].replace(/[CW]/g, "")).toMatch(/^K+$/);
  });
});
