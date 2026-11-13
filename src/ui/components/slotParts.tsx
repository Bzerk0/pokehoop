import { PALETTE } from "../theme/palette.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { Sprite } from "./PlayerCard.tsx";

// The slot machine's parts, shared by the draft page and the character select's RANDOM overlay.

/** A spinning reel: faces flicking past (whoever lands is decided already; this is just the show). */
export function SpinReel({ faces }: { faces: RatedPokemon[] }) {
  return (
    <div className="flex h-[284px] justify-center overflow-hidden border-4 border-slate bg-navy">
      <div className="slot-spin flex flex-col items-center">
        {[...faces, ...faces].map((p, k) => (
          <span key={k} className="flex h-[110px] shrink-0 items-center">
            <Sprite p={p} scale={2} eager className="max-w-none" />
          </span>
        ))}
      </div>
    </div>
  );
}

/** A row of marquee bulbs: every other one blinks, so they seem to chase. */
export const Lights = ({ n = 24 }: { n?: number }) => (
  <div className="flex justify-between px-1" aria-hidden>
    {Array.from({ length: n }, (_, i) => (
      <span key={i} className={`h-[6px] w-[6px] ${i % 2 ? "bg-cream" : "bg-white"} blink`} style={{ animationDelay: i % 2 ? "-0.5s" : "0s" }} />
    ))}
  </div>
);

/** Polished gold: a dark outline, a light top-left edge and a deeper bottom-right one (flat colours, no gradient). */
export const GOLD = { background: PALETTE.gold, boxShadow: `inset 4px 4px 0 ${PALETTE.cream}, inset -4px -4px 0 ${PALETTE.amber}` };
/** Rounded corners in pixel steps (three steps of `step` px), for clip-path. */
export const corners = (step = 4) => {
  const a = step, b = step * 2, c = step * 3, R = (v: number) => `calc(100% - ${v}px)`;
  return `polygon(0 ${c}px,${a}px ${c}px,${a}px ${b}px,${b}px ${b}px,${b}px ${a}px,${c}px ${a}px,${c}px 0,${R(c)} 0,${R(c)} ${a}px,${R(b)} ${a}px,${R(b)} ${b}px,${R(a)} ${b}px,${R(a)} ${c}px,100% ${c}px,100% ${R(c)},${R(a)} ${R(c)},${R(a)} ${R(b)},${R(b)} ${R(b)},${R(b)} ${R(a)},${R(c)} ${R(a)},${R(c)} 100%,${c}px 100%,${c}px ${R(a)},${b}px ${R(a)},${b}px ${R(b)},${a}px ${R(b)},${a}px ${R(c)},0 ${R(c)})`;
};
/** A stepped pixel arch for the sign on top. */
export const ARCH = "polygon(0 100%,0 38%,3% 38%,3% 22%,8% 22%,8% 10%,16% 10%,16% 3%,28% 3%,28% 0,72% 0,72% 3%,84% 3%,84% 10%,92% 10%,92% 22%,97% 22%,97% 38%,100% 38%,100% 100%)";
/** White shine on the gold: a long streak, corner glints and a few twinkles. */
export const Shine = () => (
  <>
    <span className="pointer-events-none absolute left-[10px] top-[14px] h-[45%] w-[6px] bg-white" />
    <span className="pointer-events-none absolute left-[18px] top-[14px] h-[18%] w-[2px] bg-white" />
    <span className="pointer-events-none absolute right-[12px] top-[10px] h-[4px] w-[4px] bg-white" />
    <span className="pointer-events-none absolute bottom-[12px] left-[12px] h-[4px] w-[4px] bg-white" />
    {[["8%", "22%"], ["94%", "48%"], ["50%", "96%"]].map(([x, y], i) => (
      <span key={i} className="blink pointer-events-none absolute" style={{ left: x, top: y, animationDelay: `${-i * 0.33}s` }}>
        <span className="absolute left-[-1px] top-[-5px] h-[10px] w-[2px] bg-white" />
        <span className="absolute left-[-5px] top-[-1px] h-[2px] w-[10px] bg-white" />
      </span>
    ))}
  </>
);

