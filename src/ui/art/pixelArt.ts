// Tiny pixel-art kit: art is a grid of letters (one letter = one pixel, "." = clear), turned into a crisp SVG
// data URL. Draw it with <img> at a whole-number scale; image-rendering: pixelated keeps the edges hard.
import { PALETTE, type PaletteName } from "../theme/palette.ts";

export type Grid = string[];

export function gridToUrl(grid: Grid, colors: Record<string, PaletteName>): string {
  const h = grid.length, w = grid[0].length;
  let rects = "";
  grid.forEach((row, y) => {
    // one rect per run of the same letter, to keep the SVG small
    for (let x = 0; x < w; ) {
      const c = row[x];
      let end = x + 1;
      while (end < w && row[end] === c) end++;
      if (c !== ".") rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${PALETTE[colors[c]]}"/>`;
      x = end;
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A pixel disc of diameter d. paint() picks each inside pixel's letter; x, y are pixel centres measured from the
 *  disc's centre, dist is the distance from it, edge is true on the outermost ring. */
export function disc(d: number, paint: (x: number, y: number, dist: number, edge: boolean) => string): Grid {
  const r = d / 2;
  const inside = (px: number, py: number) =>
    px >= 0 && py >= 0 && px < d && py < d && (px + 0.5 - r) ** 2 + (py + 0.5 - r) ** 2 <= r * r;
  return Array.from({ length: d }, (_, py) =>
    Array.from({ length: d }, (_, px) => {
      if (!inside(px, py)) return ".";
      const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1);
      const x = px + 0.5 - r, y = py + 0.5 - r;
      return paint(x, y, Math.hypot(x, y), edge);
    }).join(""),
  );
}
