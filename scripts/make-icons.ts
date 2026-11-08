// App icons (home screen, browser tab) from the pixel ball logo: the ball on navy, each art pixel a whole block of
// pixels. Run once with `npx tsx scripts/make-icons.ts`; writes public/icons/.
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { BALL_GRID } from "../src/ui/art/ballLogo.ts";
import { PALETTE, type PaletteName } from "../src/ui/theme/palette.ts";

const COLORS: Record<string, PaletteName> = { K: "black", O: "orange", A: "amber", B: "brown", T: "tan", C: "cream", W: "white" };
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function icon(size: number, file: string) {
  const n = BALL_GRID.length, k = Math.max(1, Math.floor((size * 0.8) / n)), off = Math.floor((size - n * k) / 2);
  const px = Buffer.alloc(size * size * 3);
  const bg = hex(PALETTE.navy);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - off) / k), gy = Math.floor((y - off) / k);
      const c = gx >= 0 && gy >= 0 && gx < n && gy < n ? BALL_GRID[gy][gx] : ".";
      px.set(c === "." ? bg : hex(PALETTE[COLORS[c]]), (y * size + x) * 3);
    }
  await sharp(px, { raw: { width: size, height: size, channels: 3 } }).png().toFile(file);
}

mkdirSync("public/icons", { recursive: true });
await icon(180, "public/icons/apple-touch-icon.png");
await icon(192, "public/icons/icon-192.png");
await icon(512, "public/icons/icon-512.png");
await icon(32, "public/icons/favicon-32.png");
console.log("icons written to public/icons/");
