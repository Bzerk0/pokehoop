import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import type { Difficulty } from "../../core/cpuTeam.ts";
import { dexOf } from "../../core/lineup.ts";
import { LIVE_AI } from "../../core/ratingConfig.ts";
import type { LiveView } from "../../game/LiveView.ts";
import { PixelStage, STAGE_H } from "../components/PixelStage.tsx";
import { useRated } from "../data.ts";
import { backBlip, moveBlip, selectBlip } from "../sound.ts";
import type { PaletteName } from "../theme/palette.ts";

/** What the Play page sends: who plays whom. */
export type ArcadeSetup = { you: number; cpu: number; youColor: PaletteName; cpuColor: PaletteName; level: Difficulty };

/** The live 1v1 (PLAN.md Phase 5): the 3D game in a whole-number-scaled pixel stage, plus pause and end menus. */
export function ArcadePage() {
  const navigate = useNavigate();
  const setup = useLocation().state as ArcadeSetup | null;
  const { data } = useRated();
  const dex = useMemo(() => (data ? dexOf(data) : null), [data]);
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<LiveView | null>(null);
  const [round, setRound] = useState(0); // bump to restart
  const [paused, setPaused] = useState(false);
  const [final, setFinal] = useState<[number, number] | null>(null);

  const you = setup && dex?.get(setup.you), cpu = setup && dex?.get(setup.cpu);

  useEffect(() => {
    if (!you || !cpu || !setup || !host.current) return;
    let dead = false;
    (async () => {
      // the HUD draws with the pixel font, so wait for it; the 3D code loads on demand (it's big)
      const [{ LiveView }] = await Promise.all([
        import("../../game/LiveView.ts"),
        document.fonts.load('8px "Press Start 2P"').catch(() => null),
      ]);
      if (dead || !host.current) return;
      game.current = new LiveView(host.current, {
        you, cpu, youColor: setup.youColor, cpuColor: setup.cpuColor, level: LIVE_AI[setup.level],
        seed: Date.now() >>> 0, onOver: (s) => setFinal(s),
      });
    })();
    return () => {
      dead = true;
      game.current?.destroy();
      game.current = null;
    };
  }, [you, cpu, setup, round]);

  // Esc pauses (and resumes)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || final) return;
      backBlip();
      setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [final]);
  // while a menu is up the game lets go of the keys, so Enter/Space work on the buttons
  useEffect(() => {
    if (paused || final) game.current?.pause();
    else game.current?.resume();
  }, [paused, final]);

  if (!setup) return <Navigate to="/play" replace />;

  const restart = () => {
    selectBlip();
    setFinal(null);
    setPaused(false);
    setRound((r) => r + 1);
  };
  const toPreGame = () => {
    backBlip();
    navigate("/play");
  };
  const won = final && final[0] > final[1];

  return (
    <div className="h-full min-h-[360px]">
      <PixelStage>
        {(h) => (
          <div className="relative h-full w-full">
            <div ref={host} className="absolute left-0 [&_canvas]:block [&_canvas]:[image-rendering:pixelated]" style={{ top: Math.floor((h - STAGE_H) / 2) }} />
            {!dex && <p className="blink absolute inset-x-0 top-[160px] text-center font-head text-[8px] text-cloud">LOADINGâ€¦</p>}
            {(paused || final) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70" role="dialog" aria-label={final ? "Game over" : "Paused"}>
                <div className="px-box flex w-[300px] flex-col items-center gap-2 p-4 text-center">
                  {final ? (
                    <>
                      <p className={`m-0 font-head text-[16px] ${won ? "flash-win" : "flash-lose"}`}>{won ? "YOU WIN!" : "YOU LOSE"}</p>
                      <p className="m-0 font-head text-[16px] text-white">{final[0]} - {final[1]}</p>
                    </>
                  ) : (
                    <p className="m-0 font-head text-[16px] text-gold">PAUSED</p>
                  )}
                  {!final && <button className="px-btn w-full" autoFocus onClick={() => (moveBlip(), setPaused(false))}>RESUME</button>}
                  <button className="px-btn w-full" autoFocus={!!final} onClick={restart}>{final ? "REMATCH" : "RESTART"}</button>
                  <button className="px-btn w-full" onClick={toPreGame}>â—€ PRE-GAME</button>
                </div>
              </div>
            )}
          </div>
        )}
      </PixelStage>
    </div>
  );
}
