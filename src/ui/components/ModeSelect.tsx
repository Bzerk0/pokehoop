import { selectBlip } from "../sound.ts";
import { inkOn, PALETTE, type PaletteName } from "../theme/palette.ts";
import { Arrow } from "./Arrow.tsx";

export type ModeKey = 1 | 3 | 5 | "solo" | "half";

type ModeDef = { key: ModeKey; name: string; tag: string; blurb: string; color: PaletteName; n: number; solo?: boolean; half?: boolean };

const MAIN: ModeDef[] = [
  { key: 1, name: "ONES", tag: "1 ON 1", blurb: "One on one. First to 11 wins.", color: "sky", n: 1 },
  { key: 3, name: "THREES", tag: "3 ON 3", blurb: "A full timed game with a bench.", color: "lime", n: 3 },
  { key: 5, name: "FIVES", tag: "5 ON 5", blurb: "The real thing: plays, subs, the works.", color: "gold", n: 5 },
];
const SPECIAL: ModeDef[] = [
  { key: "solo", name: "SOLO", tag: "5 ON 5, ONE POKéMON", blurb: "You play only as one. The CPU runs your team.", color: "lavender", n: 5, solo: true },
  { key: "half", name: "HALF 1V1", tag: "STREETBALL", blurb: "Half court, check it up, make it take it.", color: "orange", n: 1, half: true },
];

/** A little court seen from above with the players on it: yours (gold) against theirs (red), `n` a side. Half court
 *  puts both on the one end; solo rings the one you play. */
function CourtMini({ n, half, solo }: { n: number; half?: boolean; solo?: boolean }) {
  const dot = (side: "you" | "cpu", i: number) => {
    const y = ((i + 1) / (n + 1)) * 100;
    const x = half ? (side === "you" ? 70 : 82) : side === "you" ? 30 : 70;
    return (
      <span
        key={`${side}${i}`}
        className="absolute h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 border-2 border-black"
        style={{ left: `${x}%`, top: `${half ? 50 : y}%`, background: PALETTE[side === "you" ? "gold" : "red"], outline: solo && side === "you" && i === 2 ? `2px solid ${PALETTE.white}` : undefined }}
      />
    );
  };
  return (
    <div className="relative mx-auto h-[76px] w-full max-w-[190px] border-4 border-white bg-wood" aria-hidden>
      {!half && <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-white" />}
      {!half && <span className="absolute left-1/2 top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 border-2 border-white" />}
      <span className="absolute inset-y-[22%] left-0 w-[18%] border-2 border-l-0 border-white" />
      <span className="absolute inset-y-[22%] right-0 w-[18%] border-2 border-r-0 border-white" />
      {Array.from({ length: n }, (_, i) => dot("you", i))}
      {Array.from({ length: n }, (_, i) => dot("cpu", i))}
    </div>
  );
}

/** The first step of a game: just the game modes, as big arcade cards. */
export function ModeSelect({ playable, onPick, onTutorial }: { playable: boolean; onPick: (m: ModeKey) => void; onTutorial: () => void }) {
  const card = (m: ModeDef, big: boolean) => {
    const ink = PALETTE[inkOn(m.color)];
    return (
      <button
        key={m.key}
        className="group flex min-w-0 cursor-pointer flex-col border-4 border-black bg-night text-left transition-transform hover:-translate-y-[4px] hover:border-gold focus-visible:border-gold disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        style={{ boxShadow: `4px 4px 0 ${PALETTE.black}` }}
        disabled={!playable}
        onClick={() => (selectBlip(), onPick(m.key))}
      >
        <span className="flex items-center justify-between gap-2 px-3 py-2" style={{ background: PALETTE[m.color], color: ink }}>
          <span className={`font-head leading-[1.2] ${big ? "text-[28px]" : "text-[18px]"}`}>{m.name}</span>
          <span className="shrink-0 bg-black px-2 py-[2px] text-[20px] leading-[20px] text-white">{m.tag}</span>
        </span>
        <span className="h-[6px]" style={{ background: PALETTE[m.color], opacity: 0.55 }} />
        <span className={`flex flex-1 flex-col gap-3 px-3 ${big ? "py-4" : "py-3"}`}>
          <CourtMini n={m.n} half={m.half} solo={m.solo} />
          <span className="text-center text-[22px] leading-[22px] text-cloud">{m.blurb}</span>
        </span>
        <span className="flex items-center justify-center gap-2 bg-black py-2 font-head text-[14px] text-steel group-hover:text-gold">
          PLAY <span className="group-hover:blink"><Arrow /></span>
        </span>
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-5">
      <h2 className="m-0 text-center font-head text-[20px] leading-[1.4] text-gold" style={{ textShadow: `2px 2px 0 ${PALETTE.red}, 4px 4px 0 ${PALETTE.black}` }}>
        CHOOSE YOUR GAME
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">{MAIN.map((m) => card(m, true))}</div>
      <div>
        <p className="m-0 mb-2 text-center font-head text-[10px] text-steel">SPECIAL MODES (TEST)</p>
        <div className="mx-auto grid max-w-[760px] gap-4 sm:grid-cols-2">{SPECIAL.map((m) => card(m, false))}</div>
      </div>
      <div className="flex justify-center">
        <button className="px-btn !text-[20px]" onClick={() => (selectBlip(), onTutorial())} disabled={!playable} title="Learn the controls in a quick practice">
          NEW HERE? HOW TO PLAY <Arrow />
        </button>
      </div>
    </div>
  );
}
