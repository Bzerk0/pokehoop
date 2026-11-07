import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { salary, SLOTS, STARTERS } from "../../core/lineup.ts";
import { SALARY_CAP, SALARY_MIN } from "../../core/ratingConfig.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { BALL_SIZE, BALL_URL } from "../art/ballLogo.ts";
import { ArcadeCabinet } from "../components/ArcadeCabinet.tsx";
import { Menu } from "../components/Menu.tsx";
import { Typewriter } from "../components/Typewriter.tsx";
import { Sprite } from "../components/PlayerCard.tsx";
import { useRated } from "../data.ts";
import { selectBlip } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";

const WELCOME = "Welcome, Coach! Pick your next move.";

/** A pixel hoop: backboard, square, rim and net, all hard rectangles. */
function Hoop() {
  const r = (x: number, y: number, w: number, h: number, c: string) => <rect x={x} y={y} width={w} height={h} fill={c} />;
  return (
    <svg width="96" height="150" viewBox="0 0 96 150" shapeRendering="crispEdges" className="absolute right-[24px] top-[96px]">
      {r(84, 0, 8, 150, PALETTE.steel)}
      {r(80, 30, 4, 8, PALETTE.steel)}
      {r(30, 4, 54, 40, PALETTE.white)}
      {r(30, 4, 54, 2, PALETTE.black)}
      {r(30, 42, 54, 2, PALETTE.black)}
      {r(48, 18, 18, 14, PALETTE.red)}
      {r(52, 22, 10, 10, PALETTE.white)}
      {r(36, 44, 42, 4, PALETTE.orange)}
      {[0, 1, 2, 3, 4].flatMap((row) =>
        [0, 1, 2, 3, 4, 5].map((col) => (
          <rect key={`${row}-${col}`} x={38 + row + col * 6 + (row % 2) * 3} y={48 + row * 5} width={2} height={3} fill={PALETTE.white} />
        )),
      )}
    </svg>
  );
}

export function Title() {
  const navigate = useNavigate();
  const location = useLocation();
  const [stage, setStage] = useState<"press" | "menu">(location.state?.menu ? "menu" : "press");
  const [message, setMessage] = useState(WELCOME);
  const { data } = useRated();

  // five different random Pokémon on the court (UI flair; core code never uses Math.random). They're also a new
  // player's first team, so their salaries leave room under the cap for a bench.
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

  useEffect(() => {
    if (stage !== "press") return;
    const start = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectBlip();
        setStage("menu");
      }
    };
    window.addEventListener("keydown", start);
    return () => window.removeEventListener("keydown", start);
  }, [stage]);

  const items = [
    { label: "PLAY", onSelect: () => navigate("/play", { state: { starters: five.map((p) => p.id) } }) },
    { label: "DRAFT", onSelect: () => navigate("/draft") },
    { label: "FREE BUILD", onSelect: () => navigate("/build") },
    { label: "POKéDEX", onSelect: () => navigate("/dex") },
    { label: "ABOUT", onSelect: () => setMessage("A free fan-made hoops game. Pokémon data and sprites come from PokéAPI.") },
  ];

  return (
    <ArcadeCabinet view={stage === "press" ? "3d" : "flat"}>
      <div
        className="absolute inset-0 bg-night"
        onClick={() => stage === "press" && (selectBlip(), setStage("menu"))}
      >
        {/* court floor */}
        <div className="absolute inset-x-0 bottom-0 h-[150px] bg-wood" />
        <div className="absolute inset-x-0 bottom-[148px] h-[2px] bg-brown" />
        <div className="absolute bottom-0 left-[200px] h-[150px] w-[4px] bg-white" />

        <div className="absolute left-0 right-0 top-[28px] flex items-center justify-center gap-[14px]">
          <img src={BALL_URL} width={BALL_SIZE * 2} height={BALL_SIZE * 2} alt="" />
          <div>
            <div className="font-head text-[32px] leading-[40px] text-gold" style={{ textShadow: `3px 3px 0 ${PALETTE.red}, 5px 5px 0 ${PALETTE.black}` }}>
              STARTING 5
            </div>
            <div className="mt-2 font-head text-[8px] tracking-[2px] text-cloud">A POKéMON HOOPS FAN GAME</div>
          </div>
        </div>

        <Hoop />

        <div className="absolute bottom-[112px] left-[40px] flex items-end gap-[14px]">
          {five.map((p, i) => (
            <div key={i} className="flex flex-col items-center" style={{ animation: `hop 0.6s steps(2) ${i * 0.12}s infinite` }}>
              <Sprite p={p} eager />
              {/* a round shadow, drawn as a stepped pixel oval (no smooth curves in the pixel style) */}
              <div className="flex flex-col items-center" aria-hidden>
                <div className="h-[2px] w-[20px] bg-brown" />
                <div className="h-[2px] w-[32px] bg-brown" />
                <div className="h-[2px] w-[20px] bg-brown" />
              </div>
            </div>
          ))}
        </div>

        {stage === "press" ? (
          <div className="absolute bottom-[14px] left-0 right-0 text-center font-head text-[16px] text-white blink" style={{ textShadow: `2px 2px 0 ${PALETTE.black}` }}>
            PRESS START
          </div>
        ) : (
          <>
            <div className="px-box absolute bottom-[10px] left-[10px] h-[92px] w-[400px] p-[10px] text-[22px] leading-[22px]">
              <Typewriter text={message} />
            </div>
            <div className="px-box absolute bottom-[10px] right-[10px] w-[196px] p-[8px] font-head text-[10px]">
              <Menu items={items} onBack={() => (setStage("press"), setMessage(WELCOME))} />
            </div>
          </>
        )}
      </div>
    </ArcadeCabinet>
  );
}
