// The logo: a capture-ball drawn as a basketball. Orange top, lighter bottom half, a black band and button through
// the middle, basketball seams (one vertical, two curved) and a pixel highlight and shadow. Original pixel art.
import { disc, gridToUrl, type Grid } from "./pixelArt.ts";

export const BALL_SIZE = 32;

export const BALL_GRID: Grid = disc(BALL_SIZE, (x, y, dist, edge) => {
  if (edge) return "K";
  if (dist <= 6.5) return dist > 4.6 ? "K" : dist <= 2 && x < 0.5 && y < 0.5 ? "W" : "C"; // button: ring, face, glint
  if (Math.abs(y) < 2) return "K"; // the band (it's also the ball's horizontal seam)
  if (Math.abs(x) < 1) return "K"; // vertical seam
  // curved side seams, ")" on the left and "(" on the right (arcs of circles centred outside the ball)
  if (Math.abs(Math.hypot(Math.abs(x) - 28, y) - 19) < 0.55) return "K";
  const top = y < 0;
  if (Math.hypot(x + 5, y + 9) < 2.6) return top ? "A" : "C"; // highlight, upper left
  if (dist > 12.6 && x + y > 4) return top ? "B" : "T"; // shadow, lower right rim
  return top ? "O" : "A";
});

export const BALL_URL = gridToUrl(BALL_GRID, {
  K: "black",
  O: "orange",
  A: "amber",
  B: "brown",
  T: "tan",
  C: "cream",
  W: "white",
});
