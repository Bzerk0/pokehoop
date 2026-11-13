import { useEffect, useMemo, useRef, useState } from "react";
import { makeRng } from "../../core/rng.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { backBlip, blip, selectBlip, slotSpin } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";
import { Arrow } from "./Arrow.tsx";
import { Sprite } from "./PlayerCard.tsx";
import { ARCH, corners, GOLD, Lights, Shine, SpinReel } from "./slotParts.tsx";
import { TypeChip } from "./PlayerCard.tsx";

const FIRST_STOP = 650; // ms until the first reel stops, then one more every STOP_GAP
const STOP_GAP = 380;

/** The slot machine over the character select: RANDOM spins one reel per Pokémon you need, they stop one by one, and
 *  you take the result, spin again or cancel. The same gold cabinet (and the same whirl) as the arcade draft. */
export function RandomPicker({ size, pool, onUse, onClose }: {
  size: number;
  pool: RatedPokemon[];
  onUse: (ids: number[]) => void;
  onClose: () => void;
}) {
  const [spin, setSpin] = useState(0); // which spin this is (a new result each time)
  const [stopped, setStopped] = useState(0);
  const done = stopped >= size;
  const timers = useRef<number[]>([]);

  // who lands on each reel: a seeded draw (no repeats), and faces to flick past for the show
  const result = useMemo(() => {
    const rng = makeRng((Date.now() ^ (spin * 2654435761)) >>> 0);
    const taken = new Set<number>(), out: RatedPokemon[] = [];
    while (out.length < Math.min(size, pool.length)) {
      const p = rng.pick(pool);
      if (!taken.has(p.id)) (taken.add(p.id), out.push(p));
    }
    return out;
  }, [spin, size, pool]);
  const faces = useMemo(() => result.map((_, i) => Array.from({ length: 6 }, (_, k) => pool[(spin * 97 + i * 31 + k * 53) % pool.length])), [result, spin, pool]);

  // the show: the whirl, then each reel stops in turn
  useEffect(() => {
    setStopped(0);
    slotSpin((FIRST_STOP + (size - 1) * STOP_GAP) / 1000);
    result.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => (setStopped(i + 1), blip(260 + i * 90, 70, 0.06)), FIRST_STOP + i * STOP_GAP));
    });
    return () => timers.current.splice(0).forEach(clearTimeout);
  }, [result, size]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (e.stopImmediatePropagation(), backBlip(), onClose());
      else if (e.key === "Enter" && done) (e.stopImmediatePropagation(), selectBlip(), onUse(result.map((p) => p.id)));
    };
    window.addEventListener("keydown", onKey, true); // before the screen under it
    return () => window.removeEventListener("keydown", onKey, true);
  }, [done, result, onClose, onUse]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3" role="dialog" aria-label="Random pick">
      <div className="w-full max-w-[1000px]">
        {/* the sign: a stepped gold arch with chasing bulbs */}
        <div className="mx-auto w-[60%] bg-brown p-[4px]" style={{ clipPath: ARCH }}>
          <div className="px-[6%] pb-[6px] pt-[12px]" style={{ ...GOLD, clipPath: ARCH }}>
            <div className="border-4 border-brown bg-maroon px-2 py-[2px]">
              <Lights n={14} />
              <p className="m-0 text-center font-head text-[16px] leading-[24px] text-gold" style={{ textShadow: `2px 2px 0 ${PALETTE.red}, 4px 4px 0 ${PALETTE.black}` }}>
                {done ? "YOUR PICKS!" : "RANDOM"}
              </p>
              <Lights n={14} />
            </div>
          </div>
        </div>
        <div style={{ filter: `drop-shadow(6px 6px 0 ${PALETTE.black})` }}>
          <div className="bg-brown p-[4px]" style={{ clipPath: corners(4) }}>
            <section className="relative p-[12px]" style={{ ...GOLD, clipPath: corners(3) }}>
              <Shine />
              <div className="relative bg-brown p-[8px]" style={{ boxShadow: `inset 0 0 0 4px ${PALETTE.amber}`, clipPath: corners(3) }}>
                <Lights />
                <div className="my-[6px] grid gap-[6px]" style={{ gridTemplateColumns: `repeat(${result.length}, minmax(0, 1fr))` }}>
                  {result.map((p, i) =>
                    i < stopped ? (
                      <div key={`${spin}-${p.id}`} className="deal flex h-[284px] min-w-0 flex-col items-center justify-between border-4 border-amber bg-cream px-1 py-2 text-black" style={{ animationDelay: "0ms" }}>
                        <span className="font-head text-[10px] leading-[14px]">P{i + 1}</span>
                        <span className="flex h-[120px] items-end justify-center overflow-hidden">
                          <Sprite p={p} scale={p.spriteH > 60 ? 1 : 2} eager className="max-w-none" />
                        </span>
                        <span className="w-full truncate text-center text-[20px] leading-[20px]">{p.name}</span>
                        <span className="flex flex-wrap justify-center gap-1">{p.types.map((t) => <TypeChip key={t} type={t} />)}</span>
                        <span className="font-head text-[16px] leading-[20px] text-maroon">{p.ovr[p.best]} {p.best}</span>
                      </div>
                    ) : (
                      <SpinReel key={`spin${spin}-${i}`} faces={faces[i]} />
                    ),
                  )}
                </div>
                <Lights />
              </div>
              {/* the control deck */}
              <div className="relative mt-[10px] flex flex-wrap items-center justify-center gap-2">
                <button className="px-btn" onClick={() => (backBlip(), onClose())}>CANCEL <span className="hidden sm:inline">(ESC)</span></button>
                <button className="px-btn" disabled={!done} onClick={() => (selectBlip(), setSpin((n) => n + 1))}>SPIN AGAIN</button>
                <button className="px-btn !bg-gold !text-black disabled:!bg-night disabled:!text-steel" disabled={!done} onClick={() => (selectBlip(), onUse(result.map((p) => p.id)))}>
                  USE THESE <Arrow />
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
