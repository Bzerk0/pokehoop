import { useEffect, useMemo, useRef } from "react";
import { PALETTE, type PaletteName } from "../theme/palette.ts";
import { reducedMotion } from "./Cabinet3D.tsx";
import { RectCanvas, type Rect } from "./RectCanvas.tsx";

// The PRESS START screen (640×360): a wood-floor frame around a panel of TV static, a basketball on fire, and the
// POKéHOOP logo in chunky chrome letters. Everything is flat palette colours in hard pixels; the "chrome" is stacked
// bands of colour, not a gradient.

const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const PANEL = { x: 80, y: 36, w: 480, h: 284 }; // the static screen inside the wood
const BALL_C = { x: 320, y: 178 }; // where the ball sits

/** Vertical wood planks with dark seams and staggered end joints. */
const WOOD: Rect[] = (() => {
  const planks: Rect[] = [];
  for (let i = 0; i < 16; i++) {
    const x = i * 40;
    planks.push([x, 0, 40, 360, i % 2 ? PALETTE.wood : PALETTE.tan], [x, 0, 2, 360, PALETTE.brown]);
    for (let j = 0; j < 3; j++) planks.push([x, Math.floor(hash(i * 7 + j) * 340) + 10, 40, 2, PALETTE.brown]);
    for (let j = 0; j < 4; j++) planks.push([x + 6 + Math.floor(hash(i * 11 + j) * 26), Math.floor(hash(i * 13 + j) * 330), 2, 18, i % 2 ? PALETTE.tan : PALETTE.wood]); // grain
  }
  return planks;
})();
const Wood = () => <RectCanvas w={640} h={360} rects={WOOD} className="absolute left-0 top-0" />;

/** A black-framed panel of moving TV static (2-pixel snow in greys from the palette). */
function Static() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current?.getContext("2d");
    if (!c) return;
    const w = PANEL.w / 2, h = PANEL.h / 2, img = c.createImageData(w, h);
    const greys = (["black", "black", "black", "night", "night", "slate", "steel", "fog"] as PaletteName[]).map((n) => {
      const v = parseInt(PALETTE[n].slice(1), 16);
      return [v >> 16, (v >> 8) & 255, v & 255];
    });
    const draw = () => {
      for (let i = 0; i < w * h; i++) {
        const [cr, cg, cb] = greys[Math.floor(Math.random() * greys.length)]; // UI flair only (core uses the seeded RNG)
        img.data.set([cr, cg, cb, 255], i * 4);
      }
      c.putImageData(img, 0, 0);
    };
    draw();
    if (reducedMotion()) return;
    const t = setInterval(draw, 70);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute border-2 border-black" style={{ left: PANEL.x - 6, top: PANEL.y - 6, width: PANEL.w + 12, height: PANEL.h + 12, boxShadow: `0 0 0 2px ${PALETTE.steel}, 0 0 0 4px ${PALETTE.black}` }}>
      <canvas ref={canvas} width={PANEL.w / 2} height={PANEL.h / 2} className="absolute left-[4px] top-[4px]" style={{ width: PANEL.w, height: PANEL.h, imageRendering: "pixelated" }} />
    </div>
  );
}

// the flaming ball is drawn on a grid of 4-screen-pixel blocks: ball radius 30 blocks, the grid 90 blocks across
const PX = 4, R = 30, G = 45, K = R / 24; // K scales the seam and shading shapes (drawn for radius 24)

/** Rows of same-coloured blocks, merged into runs (far fewer rects than one per block). */
function runs(cell: (x: number, y: number) => PaletteName | null) {
  const out: Rect[] = [];
  for (let y = 0; y < G * 2; y++) {
    let start = 0, cur: PaletteName | null = null;
    for (let x = 0; x <= G * 2; x++) {
      const c = x < G * 2 ? cell(x, y) : null;
      if (c !== cur) {
        if (cur) out.push([start, y, x - start, 1, PALETTE[cur]]);
        start = x;
        cur = c;
      }
    }
  }
  return out;
}

/** The ball: orange with a black outline, tilted seams, a dark crescent and a shine, and a pebbly texture. */
function ballCell(x: number, y: number): PaletteName | null {
  const bx = x + 0.5 - G, by = y + 0.5 - G, d = Math.hypot(bx, by);
  if (d > R) return null;
  if (d > R - 1.2) return "black";
  const a = 0.35, u = bx * Math.cos(a) + by * Math.sin(a), v = -bx * Math.sin(a) + by * Math.cos(a);
  if (Math.abs(v - (u * u) / (70 * K)) < 0.7 || Math.abs(u) < 0.7 || Math.abs(Math.abs(u) - K * (12 + (v * v) / (36 * K * K))) < 0.7) return "black";
  const shine = Math.hypot(bx + 9 * K, by + 10 * K);
  if (shine < 2.5 * K) return "cream";
  if (shine < 5.5 * K) return "amber";
  const shade = Math.hypot(bx + 7 * K, by + 8 * K);
  if (shade > 31 * K) return "brown";
  if (shade > 26 * K) return "red";
  return (x * 3 + y * 5) % 11 === 0 ? "red" : "orange";
}

/** Fire round the ball for one frame: tongues reach further at the top, hottest (gold) next to the ball. */
function fireCell(f: number) {
  return (x: number, y: number): PaletteName | null => {
    const bx = x + 0.5 - G, by = y + 0.5 - G, d = Math.hypot(bx, by);
    if (d <= R - 1) return null;
    const t = Math.atan2(by, bx), up = Math.max(0, -Math.sin(t));
    const n = 0.5 + 0.25 * Math.sin(5 * t + f * 1.7) + 0.15 * Math.sin(11 * t - f * 2.3 + 1) + 0.1 * Math.sin(17 * t + f * 3.1 + 2);
    const reach = R + 2 + 7 * n + 5 * up * n;
    if (d > reach) return hash(x * 76 + y + f * 999) < 0.012 && d < reach + 5 ? "amber" : null; // a stray ember
    const k = (d - R) / (reach - R);
    return k < 0.3 ? "gold" : k < 0.6 ? "amber" : k < 0.85 ? "orange" : "red";
  };
}

function FlamingBall() {
  const ball = useMemo(() => runs(ballCell), []);
  const fire = useMemo(() => [0, 1, 2].map((f) => runs(fireCell(f))), []);
  const size = G * 2 * PX, n = G * 2;
  // each flame frame is its own canvas (its own layer), so the flicker only swaps pictures: nothing is redrawn
  return (
    <div className="t-anim t-ball-in absolute" style={{ left: BALL_C.x - size / 2, top: BALL_C.y - size / 2, width: size, height: size }}>
      <div className="t-anim t-ignite absolute inset-0">
        {fire.map((frame, f) => <RectCanvas key={f} w={n} h={n} rects={frame} scale={PX} className={`t-anim t-fire t-fire-${f} absolute inset-0`} />)}
      </div>
      <RectCanvas w={n} h={n} rects={ball} scale={PX} className="absolute inset-0" />
    </div>
  );
}

/** Pixel-font letters in chrome: a black outline and 3D edge underneath, then bands of colour stacked on top. */
function Chrome({ text, size }: { text: string; size: number }) {
  const o = 3, outline = [[-o, -o], [0, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [0, o], [o, o]].map(([x, y]) => `${x}px ${y}px 0 ${PALETTE.black}`);
  const edge = [2, 4, 6].map((k) => `${k + o}px ${k + o}px 0 ${PALETTE.maroon}`).concat(`${10 + o}px ${10 + o}px 0 ${PALETTE.black}`);
  const bands: [PaletteName, number, number][] = [["cream", 0, 18], ["white", 18, 26], ["gold", 26, 50], ["amber", 50, 66], ["orange", 66, 82], ["red", 82, 100]];
  const style = { fontSize: size, lineHeight: `${size}px` };
  return (
    <span className="relative inline-block font-head" style={style}>
      <span style={{ color: PALETTE.black, textShadow: [...outline, ...edge].join(",") }}>{text}</span>
      {bands.map(([c, a, b]) => (
        <span key={c} aria-hidden className="absolute inset-0" style={{ color: PALETTE[c], clipPath: `inset(${a}% 0 ${100 - b}% 0)` }}>{text}</span>
      ))}
    </span>
  );
}

/** The whole PRESS START screen. */
export function TitleLogo() {
  const plate = "polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%)"; // a long angled plate, pointed both ends
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <Wood />
      <Static />
      <FlamingBall />

      {/* the logo: drops in on its plate across the middle of the ball once it has landed, the tagline under it */}
      <div className="t-anim t-logo-late absolute inset-0">
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 px-[32px] py-[10px]" style={{ top: BALL_C.y }}>
          <div className="absolute inset-0 bg-black" style={{ clipPath: plate }} />
          <div className="absolute inset-[4px] bg-steel" style={{ clipPath: plate }} />
          <div className="absolute inset-[8px] bg-navy" style={{ clipPath: plate }} />
          <div className="relative flex flex-col items-center gap-[4px]">
            <Chrome text="POKé" size={36} />
            <Chrome text="HOOP" size={48} />
          </div>
        </div>
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center" style={{ top: 300 }}>
          <span className="h-[18px] w-[10px] bg-maroon" style={{ clipPath: "polygon(0 0,100% 0,100% 100%,0 100%,50% 50%)" }} />
          <span className="bg-red px-[12px] py-[5px] font-head text-[8px] tracking-[2px] text-white">A POKéMON HOOPS FAN GAME</span>
          <span className="h-[18px] w-[10px] bg-maroon" style={{ clipPath: "polygon(0 0,100% 0,50% 50%,100% 100%,0 100%)" }} />
        </div>
      </div>
      <div className="t-anim t-whiteout-late pointer-events-none absolute inset-0 bg-white" />

      <div className="blink absolute bottom-[10px] left-0 right-0 text-center font-head text-[16px] text-white" style={{ textShadow: `2px 2px 0 ${PALETTE.black}, 4px 4px 0 ${PALETTE.red}` }}>
        PRESS START
      </div>
    </div>
  );
}
