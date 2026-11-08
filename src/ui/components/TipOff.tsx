import { useEffect, useRef, useState } from "react";
import type { Lineup } from "../../core/lineup.ts";
import { SIM } from "../../core/ratingConfig.ts";
import type { GameResult } from "../../core/sim/sim.ts";
import { clock, score } from "../../core/stats.ts";
import { blip } from "../sound.ts";
import { inkOn, PALETTE } from "../theme/palette.ts";
import { teamColor } from "./LineupCard.tsx";
import { Arrow } from "./Arrow.tsx";

// The game is already decided; this plays it back fast so the result lands with some drama.
const INTRO_MS = 1100; // teams walk out, TIP-OFF!
const QUARTER_MS = 850;
const OVERTIME_MS = 600;
const BUZZER_MS = 1100; // FINAL, then the results
const periodName = (p: number) => (p < 4 ? `Q${p + 1}` : p === 4 ? "OT" : `${p - 3}OT`);

/** A fast playback of a simmed game: the teams face off, the scoreboard counts up quarter by quarter with that
 *  quarter's big play, the buzzer sounds, then `onDone`. Enter, Space, Esc or SKIP jump to the end. */
export function TipOff({ result, home, away, onDone }: { result: GameResult; home: Lineup; away: Lineup; onDone: () => void }) {
  const [t, setT] = useState(0);
  const lastPeriod = useRef(-1);
  const done = useRef(false);
  const periods = result.teams[0].periods;
  const lengths = periods.map((_, i) => (i < 4 ? QUARTER_MS : OVERTIME_MS));
  const playEnd = INTRO_MS + lengths.reduce((a, b) => a + b, 0);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  // a timer, not animation events: it keeps going even in a tab that isn't drawing frames
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setT(performance.now() - start), 50);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (t >= playEnd + BUZZER_MS) finish();
  });
  useEffect(() => {
    const skip = (e: KeyboardEvent) => {
      if (!["Enter", " ", "Escape"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      finish();
    };
    window.addEventListener("keydown", skip, { capture: true });
    return () => window.removeEventListener("keydown", skip, { capture: true });
  });

  // where the playback is: which period, how far through it
  let rest = t - INTRO_MS, period = -1, frac = 0;
  if (rest >= 0) {
    period = 0;
    while (period < lengths.length && rest >= lengths[period]) rest -= lengths[period++];
    frac = period < lengths.length ? rest / lengths[period] : 1;
  }
  const over = t >= playEnd;
  const shown = (i: 0 | 1) =>
    periods.reduce((sum, _, p) => sum + (p < period ? result.teams[i].periods[p] : p === period ? Math.floor(frac * result.teams[i].periods[p]) : 0), 0);
  const now = over ? periods.length - 1 : period;
  const play = now >= 0 ? result.highlights.filter((h) => h.startsWith(`${periodName(now)} ·`)).at(-1) : undefined;

  // a horn at each new period, the buzzer at the end
  useEffect(() => {
    const p = over ? lengths.length : period;
    if (p === lastPeriod.current || p < 0) return;
    lastPeriod.current = p;
    if (p === lengths.length) blip(score(result.teams[0]) > score(result.teams[1]) ? 1320 : 180, 400);
    else blip(520, 90);
  });

  const side = (l: Lineup, from: "left" | "right") => {
    const c = teamColor(l.colors[0]);
    return (
      <div className={`${from === "left" ? "oak-in" : "slide-in-right"} min-w-0 flex-1 border-4 border-black px-3 py-2`} style={{ background: PALETTE[c], color: PALETTE[inkOn(c)] }}>
        <span className="block truncate font-head text-[16px] leading-[24px] sm:text-[24px] sm:leading-[32px]">{l.name || "UNNAMED"}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-label="Game in progress">
      <div className="px-box flex w-[min(900px,100%)] flex-col items-center gap-4 overflow-hidden p-4">
        <div className="flex w-full items-center gap-3">
          {side(home, "left")}
          <span className="font-head text-[24px] text-gold">VS</span>
          {side(away, "right")}
        </div>

        {period < 0 ? (
          <p className="pop m-0 py-10 font-head text-[32px] text-gold sm:text-[48px]">TIP-OFF!</p>
        ) : (
          <>
            <div className="flex items-center gap-4 border-4 border-black bg-black px-6 py-3 font-head text-[40px] sm:text-[64px]" aria-live="off">
              <span className="text-gold">{shown(0)}</span>
              <span className="text-steel">-</span>
              <span className="text-gold">{shown(1)}</span>
            </div>
            <p className={`m-0 font-head text-[16px] sm:text-[24px] ${over ? "blink text-red" : "text-white"}`}>
              {over ? "FINAL" : `${periodName(period)} ${clock((1 - frac) * (period < 4 ? SIM.quarterSec : SIM.overtimeSec))}`}
            </p>
            <table className="border-collapse text-[22px]">
              <thead>
                <tr className="text-cloud">
                  <th />
                  {periods.map((_, p) => <th key={p} className="w-[48px] font-normal">{periodName(p)}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.teams.map((team, i) => (
                  <tr key={i} className="text-white">
                    <td className="max-w-[180px] truncate pr-3 text-cloud">{team.name}</td>
                    {team.periods.map((pts, p) => <td key={p} className="text-center">{p < period || over ? pts : p === period ? Math.floor(frac * pts) : ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p key={play} className="pop m-0 min-h-[24px] text-center text-[22px] text-lime">{play ?? " "}</p>
          </>
        )}

        <button className="px-btn self-end" onClick={finish}>SKIP <Arrow /><Arrow /></button>
      </div>
    </div>
  );
}
