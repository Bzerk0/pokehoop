import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import type { Difficulty } from "../../core/cpuTeam.ts";
import { dexOf, type Lineup } from "../../core/lineup.ts";
import { LIVE_AI } from "../../core/ratingConfig.ts";
import type { GameResult } from "../../core/sim/sim.ts";
import { score } from "../../core/stats.ts";
import { ACTION_NAME, ACTIONS, DEFAULT_KEYS, keyName, loadKeys, rebind, saveKeys, type Action } from "../../game/keys.ts";
import type { LiveView } from "../../game/LiveView.ts";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { PixelStage, STAGE_H } from "../components/PixelStage.tsx";
import { useRated } from "../data.ts";
import { backBlip, moveBlip, selectBlip } from "../sound.ts";
import type { PaletteName } from "../theme/palette.ts";
import { Results } from "./PlayPage.tsx";
import { applyDevSettings } from "../../game/dev.ts";
import { DevPanel } from "../components/DevPanel.tsx";
import { Arrow } from "../components/Arrow.tsx";
import { useMusic } from "../bgm.ts";
import { TouchControls } from "../components/TouchControls.tsx";
import { isTouch, useScrollToStart } from "../touch.ts";

applyDevSettings(); // the dev menu's saved tuning, before any game starts

/** What the Play page sends: both full lineups, how many a side, the colours and the CPU's level. */
export type ArcadeSetup = {
  home: Lineup;
  away: Lineup;
  size: 1 | 3 | 5;
  /** Your chosen players (lineup slots) from the select screen. */
  picks?: number[];
  /** One-character mode (SOLO on the Play page). */
  solo?: boolean;
  /** Half-court 1v1 (HALF 1V1 on the Play page). */
  half?: boolean;
  youColor: PaletteName;
  cpuColor: PaletteName;
  level: Difficulty;
  tutorial?: boolean; // HOW TO PLAY: a practice 3v3, step by step
};

/** An old link or a stale history entry (from an earlier version) goes back to the pre-game screen. */
const valid = (s: unknown): s is ArcadeSetup => {
  const x = s as ArcadeSetup | null;
  return !!x && Array.isArray(x.home?.ids) && Array.isArray(x.away?.ids) && [1, 3, 5].includes(x.size);
};

/** A pixel energy bar: lime when fresh, gold when tiring, red when spent. */
function Energy({ value }: { value: number }) {
  const color = value >= 70 ? "bg-lime" : value >= 50 ? "bg-gold" : "bg-red";
  return (
    <span className="inline-flex h-[8px] w-[60px] border-2 border-black bg-slate" aria-label={`Energy ${Math.round(value)}`}>
      <span className={color} style={{ width: `${Math.round(value)}%` }} />
    </span>
  );
}

/** The live game (PLAN.md Phases 5–8): the 3D game in a whole-number-scaled pixel stage; Esc pauses (subs, music,
 *  sim the rest); a full game ends on the results screen with the box score. */
export function ArcadePage() {
  useMusic(null); // the live game plays its own
  const navigate = useNavigate();
  const state = useLocation().state;
  const setup = valid(state) ? state : null;
  const { data } = useRated();
  const dex = useMemo(() => (data ? dexOf(data) : null), [data]);
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<LiveView | null>(null);
  const [round, setRound] = useState(0); // bump to restart
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<"menu" | "subs" | "controls" | "dev">("menu");
  const [keys, setKeys] = useState(loadKeys); // the CONTROLS screen
  const [listening, setListening] = useState<Action | null>(null); // waiting for the new key for this action
  const [pickOut, setPickOut] = useState<number | null>(null); // the court player chosen to come off
  const [, refresh] = useState(0); // re-read the roster after a sub
  const [final, setFinal] = useState<{ score: [number, number]; result: GameResult | null } | null>(null);

  useEffect(() => {
    if (!setup || !dex || !host.current) return;
    let dead = false;
    (async () => {
      // the HUD draws with the pixel font, so wait for it; the 3D code loads on demand (it's big)
      const [{ LiveView }] = await Promise.all([
        import("../../game/LiveView.ts"),
        document.fonts.load('8px "Press Start 2P"').catch(() => null),
      ]);
      if (dead || !host.current) return;
      game.current = new LiveView(host.current, {
        home: setup.home, away: setup.away, size: setup.size, picks: setup.picks, solo: setup.solo, half: setup.half, dex, youColor: setup.youColor, cpuColor: setup.cpuColor,
        level: LIVE_AI[setup.tutorial ? "ROOKIE" : setup.level], seed: Date.now() >>> 0, tutorial: setup.tutorial,
        onOver: (s, result) => setFinal({ score: s, result }),
      });
    })();
    return () => {
      dead = true;
      game.current?.destroy();
      game.current = null;
    };
  }, [setup, dex, round]);

  // Esc pauses and resumes (from the subs or controls screen it goes back to the pause menu)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ` opens (and closes) the dev menu, pausing the game
      if (e.code === "Backquote" && !final && !listening) {
        e.preventDefault();
        moveBlip();
        if (paused && view === "dev") {
          setView("menu");
          setPaused(false);
        } else {
          setPaused(true);
          setView("dev");
        }
        return;
      }
      if (e.key !== "Escape" || final) return;
      backBlip();
      if (listening) return setListening(null); // stop waiting for a key
      if (paused && view !== "menu") return setView("menu");
      setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [final, paused, view, listening]);
  // CONTROLS: the next key pressed becomes the action's key (saved for next time)
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return;
      e.preventDefault();
      const next = rebind(keys, listening, e.code);
      if (next !== keys) {
        saveKeys(next);
        setKeys(next);
        selectBlip();
      } else backBlip(); // a key it can't take (Enter, 1–5)
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, keys]);
  // while a menu is up the game lets go of the keys, so Enter/Space work on the buttons
  useEffect(() => {
    if (paused || final) game.current?.pause();
    else game.current?.resume();
    if (!paused) {
      setView("menu");
      setPickOut(null);
    }
  }, [paused, final]);

  // TEST (iPhone in Safari): scroll down first, so Safari tucks its bars away; then the page locks
  const scrollFirst = useScrollToStart();

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
  /** After the lesson: straight into a real 5v5 with the same teams. */
  const playForReal = () => {
    selectBlip();
    setFinal(null);
    setPaused(false);
    navigate("/play/live", { state: { ...setup, size: 5, picks: undefined, solo: false, tutorial: false } satisfies ArcadeSetup, replace: true });
  };
  const simRest = () => {
    const g = game.current;
    if (!g?.canSimRest) return;
    selectBlip();
    const result = g.simRest();
    setPaused(false);
    setFinal({ score: [score(result.teams[0]), score(result.teams[1])], result });
  };

  // ── a full game's final: the results screen, box score and all ──
  if (final?.result && dex) {
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="m-0 flex items-center gap-2 font-head text-[16px] text-gold">
            <HomeLogo />
            FINAL
          </h1>
          <button className="px-btn" onClick={toPreGame}><Arrow left /> PRE-GAME</button>
        </div>
        <Results result={final.result} dex={dex} mine={setup.home} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="px-btn" autoFocus onClick={restart}>REMATCH</button>
          <button className="px-btn" onClick={toPreGame}><Arrow left /> PRE-GAME</button>
        </div>
      </div>
    );
  }

  const live = game.current;
  const touch = isTouch();
  const roster = paused && view === "subs" ? live?.roster() : null;
  const won = final && final.score[0] > final.score[1];

  return (
    <div className="h-full min-h-[360px]" style={touch ? { touchAction: scrollFirst ? "pan-y" : "none" } : undefined /* no scrolling or zooming the game on a phone */}>
      {touch && dex && !paused && !final && !scrollFirst && <TouchControls team={setup.size > 1} nearRim={() => !!game.current?.nearRim} />}
      {scrollFirst && (
        <div className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/70 px-16 text-center [@media(orientation:portrait)]:bg-black">
          {/* sideways first; then the scroll (it tucks Safari's bars away) */}
          <span className="hidden font-head text-[16px] leading-[1.6] text-gold [@media(orientation:portrait)]:inline">TURN YOUR PHONE SIDEWAYS</span>
          <span className="hidden text-[24px] text-cloud [@media(orientation:portrait)]:inline">The court needs the whole screen.</span>
          <span className="blink font-head text-[16px] leading-[1.6] text-gold [@media(orientation:portrait)]:hidden">SCROLL DOWN TO START</span>
          <span className="text-[24px] text-cloud [@media(orientation:portrait)]:hidden">
            Swipe up from the very right side of your screen.
          </span>
          {/* a pointer on that edge */}
          <span className="blink absolute right-[24px] top-1/2 flex -translate-y-1/2 flex-col items-center gap-[4px] font-head text-[24px] text-gold [@media(orientation:portrait)]:hidden">
            <span className="inline-block -rotate-90"><Arrow /></span>
            {[0, 1, 2].map((i) => <span key={i} className="h-[6px] w-[6px] bg-gold" />)}
          </span>
        </div>
      )}
      <PixelStage>
        {(h) => (
          <div className="relative h-full w-full">
            <div ref={host} className="absolute left-0 [&_canvas]:block [&_canvas]:[image-rendering:pixelated]" style={{ top: Math.floor((h - STAGE_H) / 2) }} />
            {!dex && <p className="blink absolute inset-x-0 top-[160px] text-center font-head text-[8px] text-cloud">LOADING…</p>}

            {/* the subs screen: pick who comes off, then who goes on */}
            {roster && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70" role="dialog" aria-label="Substitutions">
                <div className="px-box flex w-[600px] flex-col gap-2 p-3">
                  <p className="m-0 text-center font-head text-[12px] text-gold">SUBS</p>
                  <p className="m-0 text-center text-[18px] leading-[18px] text-cloud">
                    {pickOut == null ? "PICK WHO COMES OFF" : "NOW PICK WHO GOES ON"}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[18px] text-fog">ON COURT</span>
                      {roster.court.map((c) => (
                        <button
                          key={c.i}
                          className={`flex items-center justify-between gap-2 border-2 px-2 text-left text-[18px] leading-[22px] ${pickOut === c.i ? "border-gold bg-navy text-white" : "border-slate bg-night text-cloud hover:bg-navy"}`}
                          onClick={() => (moveBlip(), setPickOut(pickOut === c.i ? null : c.i))}
                          aria-pressed={pickOut === c.i}
                        >
                          <span className="truncate">{c.p.name}</span>
                          <Energy value={c.energy} />
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[18px] text-fog">BENCH</span>
                      {roster.bench.map((b) => (
                        <button
                          key={b.r}
                          className="flex items-center justify-between gap-2 border-2 border-slate bg-night px-2 text-left text-[18px] leading-[22px] text-cloud hover:bg-navy disabled:opacity-50"
                          disabled={pickOut == null}
                          onClick={() => {
                            if (pickOut == null || !live) return;
                            if (live.sub(pickOut, b.r)) selectBlip();
                            setPickOut(null);
                            refresh((n) => n + 1);
                          }}
                        >
                          <span className="truncate">{b.p.name}</span>
                          <Energy value={b.energy} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-btn flex-1 !text-[18px]"
                      aria-pressed={roster.autoSub}
                      onClick={() => (moveBlip(), live?.setAutoSub(!roster.autoSub), refresh((n) => n + 1))}
                    >
                      AUTO SUBS: {roster.autoSub ? "ON" : "OFF"}
                    </button>
                    <button className="px-btn flex-1 !text-[18px]" onClick={() => (backBlip(), setView("menu"))}><Arrow left /> BACK (ESC)</button>
                  </div>
                </div>
              </div>
            )}

            {/* CONTROLS: click an action, press its new key */}
            {paused && view === "dev" && <DevPanel onClose={() => (setView("menu"), setPaused(false))} />}

            {paused && view === "controls" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70" role="dialog" aria-label="Controls">
                <div className="px-box flex w-[420px] flex-col gap-1 p-3">
                  <p className="m-0 text-center font-head text-[12px] text-gold">CONTROLS</p>
                  <p className="m-0 text-center text-[18px] leading-[18px] text-cloud">
                    {listening ? `PRESS A KEY FOR ${ACTION_NAME[listening]} (ESC: CANCEL)` : "CLICK ONE, THEN PRESS ITS NEW KEY"}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {ACTIONS.map((a) => (
                      <button
                        key={a}
                        className={`flex items-center justify-between gap-2 border-2 px-2 text-[18px] leading-[20px] ${listening === a ? "blink border-gold bg-navy text-white" : "border-slate bg-night text-cloud hover:bg-navy"}`}
                        onClick={() => (moveBlip(), setListening(listening === a ? null : a))}
                      >
                        <span className="truncate">{ACTION_NAME[a]}</span>
                        <span className="text-gold">{keyName(keys[a])}</span>
                      </button>
                    ))}
                  </div>
                  <p className="m-0 text-center text-[16px] leading-[16px] text-steel">ARROWS, SPACE AND SHIFT ALWAYS WORK TOO</p>
                  <p className="m-0 text-center text-[16px] leading-[16px] text-steel">DOUBLE-TAP SPRINT: CROSSOVER / STEAL. HOLD LEFT + RIGHT: SCREEN</p>
                  <div className="flex gap-2">
                    <button className="px-btn flex-1 !text-[18px]" onClick={() => (backBlip(), saveKeys(DEFAULT_KEYS), setKeys(DEFAULT_KEYS))}>RESET</button>
                    <button className="px-btn flex-1 !text-[18px]" onClick={() => (backBlip(), setListening(null), setView("menu"))}><Arrow left /> BACK (ESC)</button>
                  </div>
                </div>
              </div>
            )}

            {((paused && view === "menu") || final) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70" role="dialog" aria-label={final ? "Game over" : "Paused"}>
                <div className="px-box flex w-[300px] flex-col items-center gap-1 p-3 text-center">
                  {final && setup.tutorial ? (
                    <>
                      <p className="m-0 font-head text-[16px] flash-win">LESSON DONE!</p>
                      <p className="m-0 text-[20px] text-cloud">You know the moves. Time for a real game.</p>
                      <button className="px-btn w-full !py-0 !text-[20px]" autoFocus onClick={playForReal}>PLAY 5V5 <Arrow /></button>
                    </>
                  ) : final ? (
                    <>
                      <p className={`m-0 font-head text-[16px] ${won ? "flash-win" : "flash-lose"}`}>{won ? "YOU WIN!" : "YOU LOSE"}</p>
                      <p className="m-0 font-head text-[16px] text-white">{final.score[0]} - {final.score[1]}</p>
                    </>
                  ) : (
                    <p className="m-0 font-head text-[16px] text-gold">PAUSED</p>
                  )}
                  {!final && <button className="px-btn w-full !py-0 !text-[20px]" autoFocus onClick={() => (moveBlip(), setPaused(false))}>RESUME</button>}
                  {!final && live?.roster().timed && (
                    <button className="px-btn w-full !py-0 !text-[20px]" onClick={() => (moveBlip(), setView("subs"))}>SUBS</button>
                  )}
                  {!final && live && (
                    <button className="px-btn w-full !py-0 !text-[20px]" onClick={() => (live.toggleMusic(), moveBlip(), refresh((n) => n + 1))}>
                      MUSIC: {live.musicOn ? "ON" : "OFF"}
                    </button>
                  )}
                  {!final && (
                    <span className="flex w-full gap-1">
                      <button className="px-btn flex-1 !py-0 !text-[20px]" onClick={() => (moveBlip(), setView("controls"))}>CONTROLS</button>
                      <button className="px-btn flex-1 !py-0 !text-[20px]" onClick={() => (moveBlip(), setView("dev"))}>DEV (`)</button>
                    </span>
                  )}
                  {!final && live?.canSimRest && <button className="px-btn w-full !py-0 !text-[20px]" onClick={simRest}>SIM THE REST <Arrow /></button>}
                  <button className="px-btn w-full !py-0 !text-[20px]" autoFocus={!!final && !setup.tutorial} onClick={restart}>
                    {setup.tutorial ? "START OVER" : final ? "REMATCH" : "RESTART"}
                  </button>
                  <button className="px-btn w-full !py-0 !text-[20px]" onClick={toPreGame}><Arrow left /> PRE-GAME</button>
                </div>
              </div>
            )}
          </div>
        )}
      </PixelStage>
    </div>
  );
}
