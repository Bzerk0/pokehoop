import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { cpuTeam } from "../../core/cpuTeam.ts";
import { dexOf, salary, SLOTS, STARTERS } from "../../core/lineup.ts";
import { LIVE_AI, SALARY_CAP, SALARY_MIN } from "../../core/ratingConfig.ts";
import type { RatedPokemon } from "../../core/types.ts";
import type { LiveView } from "../../game/LiveView.ts";
import { BALL_SIZE, BALL_URL } from "../art/ballLogo.ts";
import { ArcadeCabinet } from "../components/ArcadeCabinet.tsx";
import { reducedMotion, SETTLE_MS } from "../components/Cabinet3D.tsx";
import { teamColor } from "../components/LineupCard.tsx";
import { Arrow } from "../components/Arrow.tsx";
import { useRated } from "../data.ts";
import { backBlip, coin, moveBlip, selectBlip } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";
import { useMusic } from "../bgm.ts";
import { usePortraitTouch } from "../touch.ts";

/** The title screen, arcade attract-mode style: a CPU game's big plays roll in the background through the replay
 *  cameras (LiveView's `attract` mode), the logo sits on top, and INSERT COIN blinks until you press a key; then the
 *  menu opens in the middle. (The previous title is OldTitle.tsx.) */
export function Title() {
  const navigate = useNavigate();
  const location = useLocation();
  // cabinet: the 3D arcade, INSERT COIN; menu: the coin's in and it's slammed in on the screen
  const [stage, setStage] = useState<"cabinet" | "menu">(location.state?.menu ? "menu" : "cabinet");
  const [ready, setReady] = useState(stage === "menu"); // the slam-in has landed: the buttons show
  useMusic("title", stage === "cabinet");
  // the title theme: muffled while you're looking at the cabinet from across the room, clear once you're in
  const [message, setMessage] = useState("");
  const [host, setHost] = useState<HTMLDivElement | null>(null); // the cabinet remounts the screen when it changes view
  const { data } = useRated();
  const portrait = usePortraitTouch(); // a phone held upright: the whole cabinet, then a full-screen menu

  // five random Pokémon (UI flair; core code never uses Math.random): a new player's first team, with room under the
  // cap for a bench
  const five = useMemo(() => {
    if (!data) return [];
    const small = data.filter((p) => p.spriteH <= 64 && p.spriteW <= 72);
    const roomFor = SALARY_CAP - (SLOTS.length - STARTERS) * SALARY_MIN;
    for (let tries = 0; ; tries++) {
      const picks = new Set<RatedPokemon>();
      while (picks.size < STARTERS) picks.add(small[Math.floor(Math.random() * small.length)]);
      const team = [...picks];
      if (team.reduce((s, p) => s + salary(p), 0) <= roomFor || tries > 50) return team;
    }
  }, [data]);

  // the background: two all-star CPU teams playing on, unseen, with their big plays shown as they happen
  useEffect(() => {
    if (!data || !host) return;
    let view: LiveView | null = null, dead = false;
    import("../../game/LiveView.ts").then(({ LiveView }) => {
      if (dead) return;
      const seed = (Math.random() * 2 ** 31) >>> 0;
      const home = cpuTeam(data, "ALL-STAR", "unlimited", seed), away = cpuTeam(data, "ALL-STAR", "unlimited", seed + 1);
      const youColor = teamColor(home.colors[0]), cpuColor = teamColor(away.colors[0] === home.colors[0] ? away.colors[1] : away.colors[0]);
      view = new LiveView(host, {
        home, away, size: 5, dex: dexOf(data), youColor, cpuColor, level: LIVE_AI["ALL-STAR"], seed, attract: true, onOver: () => {},
      });
    });
    return () => {
      dead = true;
      view?.destroy();
    };
  }, [data, host]);

  useEffect(() => {
    if (stage === "menu") return;
    const start = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        press();
      }
    };
    window.addEventListener("keydown", start);
    return () => window.removeEventListener("keydown", start);
  }, [stage]);

  /** A press on the cabinet drops the coin and slams in on the screen; the menu shows once it lands. */
  function press() {
    if (stage !== "cabinet") return;
    coin();
    setReady(false);
    setStage("menu");
    setTimeout(() => setReady(true), reducedMotion() ? 0 : SETTLE_MS);
  }

  // the menu: two big buttons (PLAY, DRAFT) side by side, two small ones (ABOUT, POKéDEX) stacked under them
  const items = [
    { label: "PLAY", onSelect: () => navigate("/play", { state: { starters: five.map((p) => p.id) } }) },
    { label: "DRAFT", onSelect: () => navigate("/draft") },
    // (ABOUT again closes it)
    { label: "ABOUT", onSelect: () => setMessage((m) => (m ? "" : "A free fan-made hoops game, created by Hudson Bjerkness. Pokémon data and sprites come from PokéAPI.")) },
    { label: "POKéDEX", onSelect: () => navigate("/dex") },
  ];
  const [pick, setPick] = useState(0);
  const choose = (i: number) => (selectBlip(), items[i].onSelect());

  // arrows move (left/right between the big two, down to the small ones), Enter/Space picks, Esc steps back
  useEffect(() => {
    if (stage !== "menu" || !ready) return;
    const MOVES: Record<string, number[]> = portrait
      ? { ArrowDown: [1, 2, 3, 3], ArrowUp: [0, 0, 1, 2] } // portrait: one column
      : { ArrowLeft: [1, 0, 2, 3], ArrowRight: [1, 0, 2, 3], ArrowDown: [2, 2, 3, 3], ArrowUp: [0, 1, 0, 2] };
    const onKey = (e: KeyboardEvent) => {
      if (message) return void (e.preventDefault(), backBlip(), setMessage("")); // any key closes ABOUT
      if (e.key in MOVES) {
        e.preventDefault();
        moveBlip();
        setPick((i) => MOVES[e.key][i]);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        choose(pick);
      } else if (e.key === "Escape") (backBlip(), setMessage(""), setStage("cabinet"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** One menu button: gold and pointed at when picked. */
  const button = (i: number, cls: string, size: number) => (
    <button
      key={i}
      className={`pop absolute flex items-center justify-center gap-[10px] border-4 bg-black/80 font-head ${pick === i ? "border-gold text-gold" : "border-white text-white"} ${cls}`}
      style={{ fontSize: size, boxShadow: `4px 4px 0 ${PALETTE.black}` }}
      onMouseEnter={() => pick !== i && (moveBlip(), setPick(i))}
      onClick={() => choose(i)}
    >
      {pick === i && <span className="blink"><Arrow /></span>}
      {items[i].label}
    </button>
  );

  // the logo, dropping in on top of the action
  const logo = (
        <div className="t-anim t-logo pointer-events-none absolute left-0 right-0 top-[18px] flex flex-col items-center">
          <div className="flex items-center gap-[12px]">
            <img src={BALL_URL} width={BALL_SIZE * 2} height={BALL_SIZE * 2} alt="" className="t-anim t-spin-ball" />
            <div className="flex items-end gap-[10px]">
              <span
                className="font-head text-[32px] leading-[40px] text-gold"
                style={{ textShadow: `2px 2px 0 ${PALETTE.orange}, 4px 4px 0 ${PALETTE.red}, 6px 6px 0 ${PALETTE.maroon}, 8px 8px 0 ${PALETTE.black}` }}
              >
                POKé
              </span>
              <span
                className="t-anim t-five font-head text-[56px] leading-[56px] text-white"
                style={{ textShadow: `3px 3px 0 ${PALETTE.gold}, 6px 6px 0 ${PALETTE.orange}, 9px 9px 0 ${PALETTE.red}, 12px 12px 0 ${PALETTE.black}` }}
              >
                HOOP
              </span>
            </div>
          </div>
          <div className="relative mt-[10px] flex items-center">
            <span className="h-[18px] w-[10px] bg-maroon" style={{ clipPath: "polygon(0 0,100% 0,100% 100%,0 100%,50% 50%)" }} />
            <span className="bg-red px-[12px] py-[5px] font-head text-[8px] tracking-[2px] text-white">A POKéMON HOOPS FAN GAME</span>
            <span className="h-[18px] w-[10px] bg-maroon" style={{ clipPath: "polygon(0 0,100% 0,50% 50%,100% 100%,0 100%)" }} />
          </div>
        </div>
  );
  const notice = (
    <div className="pointer-events-none absolute bottom-[6px] left-0 right-0 text-center font-head text-[8px] text-cloud" style={{ textShadow: `1px 1px 0 ${PALETTE.black}` }}>
      FREE FAN GAME - POKéMON © NINTENDO / CREATURES / GAME FREAK
    </div>
  );

  // portrait, coin in: a menu filling the whole screen, the big plays playing behind it cropped to fill
  if (portrait && stage === "menu" && ready) {
    const stacked = (i: number, cls: string, size: number) => (
      <button
        key={i}
        className={`pop flex items-center justify-center gap-[10px] border-4 bg-black/80 font-head ${pick === i ? "border-gold text-gold" : "border-white text-white"} ${cls}`}
        style={{ fontSize: size, boxShadow: `4px 4px 0 ${PALETTE.black}` }}
        onClick={() => (setPick(i), choose(i))}
      >
        {pick === i && <span className="blink"><Arrow /></span>}
        {items[i].label}
      </button>
    );
    return (
      <div className="screen-slam relative h-full w-full overflow-hidden bg-black">
        <div ref={setHost} className="absolute inset-0 [&_canvas]:!h-full [&_canvas]:!w-full [&_canvas]:object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-black/40" />
        {/* (a phone's narrower than the logo: a bit smaller) */}
        <div className="absolute inset-x-0 top-0 h-[150px] origin-top scale-[0.8]">{logo}</div>
        <div className="absolute inset-x-0 top-[38%] flex flex-col items-center gap-4 px-6">
          {stacked(0, "h-[84px] w-full max-w-[340px]", 28)}
          {stacked(1, "h-[84px] w-full max-w-[340px]", 28)}
          {stacked(2, "mt-2 h-[44px] w-[70%] max-w-[240px]", 12)}
          {stacked(3, "h-[44px] w-[70%] max-w-[240px]", 12)}
        </div>
        {message && (
          <button className="px-box absolute inset-x-6 top-[38%] p-[12px] text-left text-[22px] leading-[22px] text-cloud" onClick={() => (backBlip(), setMessage(""))}>
            {message}
          </button>
        )}
        {notice}
      </div>
    );
  }

  return (
    <ArcadeCabinet view={stage === "cabinet" ? "3d" : "flat"} portrait={portrait}>
      <div className="absolute inset-0 overflow-hidden bg-black" onClick={() => stage === "cabinet" && press()}>
        <div ref={setHost} className="absolute inset-0" />
        {logo}

        {stage !== "menu" ? (
          <div className="blink absolute bottom-[24px] left-0 right-0 text-center font-head text-[16px] text-white" style={{ textShadow: `2px 2px 0 ${PALETTE.black}, 4px 4px 0 ${PALETTE.red}` }}>
            INSERT COIN
          </div>
        ) : !ready ? null : (
          <>
            {button(0, "left-[118px] top-[138px] h-[76px] w-[194px]", 24)}
            {button(1, "left-[330px] top-[138px] h-[76px] w-[194px]", 24)}
            {button(2, "left-[245px] top-[262px] h-[26px] w-[150px]", 10)}
            {button(3, "left-[245px] top-[292px] h-[26px] w-[150px]", 10)}
            {message && (
              <button className="px-box absolute left-[118px] top-[138px] min-h-[76px] w-[406px] p-[10px] text-left text-[20px] leading-[20px] text-cloud" onClick={() => (backBlip(), setMessage(""))}>
                {message}
              </button>
            )}
          </>
        )}
        {/* the fan-game notice along the bottom, arcade style */}
        {notice}
      </div>
    </ArcadeCabinet>
  );
}
