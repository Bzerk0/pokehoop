import { ICONS, type IconName, type Move } from "../../game/moveGuide.ts";
import { PALETTE } from "../theme/palette.ts";

/** A pixel icon from the move guide (8×8, drawn crisp). */
export function PixelIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden className="shrink-0">
      {ICONS[name].flatMap((row, y) => [...row].map((ch, x) => (ch === "#" ? <rect key={`${x},${y}`} x={x} y={y} width="1" height="1" fill={PALETTE.gold} /> : null)))}
    </svg>
  );
}

/** A key cap, like the ones on the intro card. */
export const KeyCap = ({ k }: { k: string }) => (
  <span className="shrink-0 border-2 border-white bg-black px-[4px] font-head text-[10px] leading-[16px] text-white">{k}</span>
);

/** The moves, most important first: icon, key, name, and how it works. */
export function MoveList({ title, moves }: { title: string; moves: Move[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <p className="m-0 border-b-2 border-slate font-head text-[10px] leading-[16px] text-gold">{title}</p>
      {moves.map((m, i) => (
        <div key={i} className="flex items-start gap-2">
          <PixelIcon name={m.icon} />
          <KeyCap k={m.key} />
          <p className="m-0 min-w-0 text-[16px] leading-[16px] text-cloud">
            <span className="text-white">{m.title}: </span>{m.how}
          </p>
        </div>
      ))}
    </div>
  );
}
