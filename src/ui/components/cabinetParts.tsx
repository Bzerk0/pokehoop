// Pieces of the 3D arcade cabinet's front (Cabinet3D). Front view, in art pixels: CAB_W wide, the 640×360 screen
// at SCREEN_X. Each piece draws inside a band of the height it's given.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { disc, gridToUrl } from "../art/pixelArt.ts";
import { PALETTE, type PaletteName } from "../theme/palette.ts";
import { STAGE_H, STAGE_W } from "./PixelStage.tsx";

export const SIDE = 28; // side trim width, front view
export const SCREEN_X = SIDE + 16;
export const CAB_W = STAGE_W + 2 * (SIDE + 16); // 728

/** A round arcade button: black rim, flat colour, a lit corner (gone while pressed). */
const button = (d: number, fill: PaletteName, light: PaletteName | null) =>
  gridToUrl(disc(d, (x, y, _dist, edge) => (edge ? "K" : light && Math.hypot(x + d / 5, y + d / 5) < d / 6 ? "L" : "F")), {
    K: "black",
    F: fill,
    L: light ?? fill,
  });

const BUTTONS = [
  { key: "j", label: "PASS", up: button(16, "red", "pink"), down: button(16, "maroon", null) },
  { key: "k", label: "SHOOT", up: button(16, "gold", "cream"), down: button(16, "amber", null) },
  { key: "l", label: "MOVE", up: button(16, "blue", "sky"), down: button(16, "ocean", null) },
];
const STICK_BALL = button(14, "red", "pink");

const STICK_DIR: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0],
  ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
};

/** Which keys are held right now (lowercased letters, arrow names as-is). Watches only: never blocks a key. */
function useHeldKeys() {
  const [held, setHeld] = useState<Set<string>>(new Set());
  useEffect(() => {
    const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k);
    const down = (e: KeyboardEvent) => setHeld((h) => (h.has(norm(e.key)) ? h : new Set(h).add(norm(e.key))));
    const up = (e: KeyboardEvent) =>
      setHeld((h) => {
        const n = new Set(h);
        n.delete(norm(e.key));
        return n;
      });
    const clear = () => setHeld(new Set());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);
  return held;
}

/** A horizontal slice of the front, `h` tall, starting `y` from the top. */
export function Band({ y, h, children, className = "" }: { y: number; h: number; children?: ReactNode; className?: string }) {
  if (h <= 0) return null;
  return (
    <div className={`absolute left-0 ${className}`} style={{ top: y, width: CAB_W, height: h }}>
      {children}
    </div>
  );
}

/** The jersey stripes and red edge trim down both front edges, from the top to `height`. */
export function Stripes({ height }: { height: number }) {
  const s = (x: number, w: number, color: PaletteName) => (
    <div className="absolute top-0" style={{ left: x, width: w, height, background: PALETTE[color] }} />
  );
  return (
    <>
      {s(0, 2, "black")}
      {s(2, 3, "red")}
      {s(10, 4, "orange")}
      {s(16, 2, "gold")}
      {s(CAB_W - 18, 2, "gold")}
      {s(CAB_W - 14, 4, "orange")}
      {s(CAB_W - 5, 3, "red")}
      {s(CAB_W - 2, 2, "black")}
    </>
  );
}

/** The black bezel and the 640×360 screen (showing `children`), with `pad` of bezel above and below. */
export function Bezel({ pad, children }: { pad: number; children: ReactNode }) {
  return (
    <>
      <div className="absolute top-0 bg-black" style={{ left: SIDE, right: SIDE, height: STAGE_H + 2 * pad }} />
      <div
        className="absolute border-2 border-slate"
        style={{ left: SCREEN_X - 3, top: pad - 3, width: STAGE_W + 6, height: STAGE_H + 6 }}
      />
      <div className="absolute overflow-hidden" style={{ left: SCREEN_X, top: pad, width: STAGE_W, height: STAGE_H }}>
        {children}
      </div>
    </>
  );
}

/** The control deck's contents, centred in whatever box holds them (needs 34px of height): joystick, FREE PLAY
 *  light, J/K/L buttons, all moving with your keys. stickStyle stands the joystick up off a tilted 3D deck. */
export function DeckControls({ stickStyle }: { stickStyle?: CSSProperties }) {
  const held = useHeldKeys();
  let dx = 0, dy = 0;
  for (const k of held) {
    const d = STICK_DIR[k];
    if (d) (dx += d[0]), (dy += d[1]);
  }
  dx = Math.sign(dx) * 3;
  dy = Math.sign(dy) * 2;

  return (
    <div className="absolute inset-0 flex items-center pl-[48px] pr-[38px]" style={{ transformStyle: "preserve-3d" }}>
      <div className="relative h-[32px] w-[40px] shrink-0" style={stickStyle}>
        <div className="absolute bottom-0 left-[6px] h-[4px] w-[28px] bg-black" />
        <div
          className="absolute bg-black"
          style={{ left: 18 + Math.round(dx / 2), top: 10 + Math.round(dy / 2), width: 4, height: 18 - Math.round(dy / 2) }}
        />
        <img src={STICK_BALL} width={14} height={14} alt="" className="absolute" style={{ left: 13 + dx, top: 1 + dy }} />
      </div>

      <div className="ml-[50px] border-2 border-black bg-night px-2 py-1 font-head text-[8px] text-gold">
        <span className="blink">FREE PLAY</span>
      </div>

      <div className="ml-auto flex gap-[20px]">
        {BUTTONS.map((b) => {
          const down = held.has(b.key);
          return (
            <div key={b.key} className="flex w-[44px] flex-col items-center gap-[2px]">
              <span className="relative h-[17px] w-[16px]">
                <img src={down ? b.down : b.up} width={16} height={16} alt="" className="absolute left-0" style={{ top: down ? 1 : 0 }} />
                <span
                  className="absolute left-0 w-[16px] text-center font-head text-[8px] leading-[16px] text-black"
                  style={{ top: down ? 1 : 0 }}
                >
                  {b.key.toUpperCase()}
                </span>
              </span>
              <span className="font-head text-[8px] text-cloud">{b.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
