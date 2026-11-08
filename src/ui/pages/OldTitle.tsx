import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { salary, SLOTS, STARTERS } from "../../core/lineup.ts";
import { SALARY_CAP, SALARY_MIN } from "../../core/ratingConfig.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { BALL_SIZE, BALL_URL } from "../art/ballLogo.ts";
import { ArcadeCabinet } from "../components/ArcadeCabinet.tsx";
import { Menu } from "../components/Menu.tsx";
import { RectCanvas, type Rect } from "../components/RectCanvas.tsx";
import { TitleLogo } from "../components/TitleLogo.tsx";
import { Typewriter } from "../components/Typewriter.tsx";
import { Sprite } from "../components/PlayerCard.tsx";
import { useRated } from "../data.ts";
import { selectBlip } from "../sound.ts";
import { PALETTE, type PaletteName } from "../theme/palette.ts";

const WELCOME = "Welcome, Coach! Pick your next move.";

// the screen is 640×360; the court floor starts here, and the five stand in fixed slots so the dunk can find the rim
const FLOOR = 210;
const SLOT_X = (i: number) => 64 + i * 76; // centre of each Pokémon's slot
const RIM = { x: 577, y: 140 }; // where the hoop's rim is

const r = (x: number, y: number, w: number, h: number, c: string, key?: string | number) => <rect key={key} x={x} y={y} width={w} height={h} fill={c} />;

/** A pixel hoop: backboard, square, rim and net, all hard rectangles. It shudders when it's dunked on. */
function Hoop() {
  return (
    <svg width="96" height="150" viewBox="0 0 96 150" shapeRendering="crispEdges" className="t-anim t-rim absolute left-[520px] top-[96px]">
      {r(84, 0, 8, 150, PALETTE.steel)}
      {r(80, 30, 4, 8, PALETTE.steel)}
      {r(30, 4, 54, 40, PALETTE.white)}
      {r(30, 4, 54, 2, PALETTE.black)}
      {r(30, 42, 54, 2, PALETTE.black)}
      {r(48, 18, 18, 14, PALETTE.red)}
      {r(52, 22, 10, 10, PALETTE.white)}
      {r(36, 44, 42, 4, PALETTE.orange)}
      {[0, 1, 2, 3, 4].flatMap((row) => [0, 1, 2, 3, 4, 5].map((col) => r(38 + row + col * 6 + (row % 2) * 3, 48 + row * 5, 2, 3, PALETTE.white, `${row}-${col}`)))}
    </svg>
  );
}

/** A small pixel basketball (12×12). */
function Ball() {
  const rows = [[4, 4], [2, 8], [1, 10], [1, 10], [0, 12], [0, 12], [0, 12], [0, 12], [1, 10], [1, 10], [2, 8], [4, 4]];
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges">
      {rows.map(([x, w], y) => r(x, y, w, 1, PALETTE.orange, y))}
      {r(5, 0, 1, 12, PALETTE.black)}
      {r(0, 6, 12, 1, PALETTE.black)}
      {r(2, 2, 2, 1, PALETTE.amber)}
    </svg>
  );
}

/** A little hash so the crowd is the same every visit (UI only; core code uses the seeded RNG). */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const CROWD: PaletteName[] = ["red", "blue", "gold", "green", "purple", "orange", "pink", "sky", "lime", "cloud"];

/** The stands: rows of fans (a head on a shirt) getting darker toward the back, with camera flashes going off. */
const STANDS: Rect[] = (() => {
  const out: Rect[] = [[0, 50, 640, FLOOR - 50, PALETTE.navy]];
  for (let row = 0; row < 9; row++) out.push([0, 70 + row * 17, 640, 2, PALETTE.black]);
  for (let row = 0; row < 9; row++) {
    const y = 56 + row * 17, dark = row < 3; // the back rows sit in shadow
    for (let k = 0; k < 44; k++) {
      const x = k * 15 + (row % 2) * 7 + Math.floor(hash(row * 99 + k) * 4);
      if (hash(row * 31 + k * 7) < 0.12) continue; // an empty seat
      const shirt = dark ? PALETTE.slate : PALETTE[CROWD[Math.floor(hash(row * 13 + k) * CROWD.length)]];
      out.push([x, y + 6, 10, 9, shirt], [x + 2, y, 6, 6, dark ? PALETTE.steel : PALETTE.tan]);
    }
  }
  // the arena wall in front of the stands, with a banner of light dots
  out.push([0, FLOOR - 12, 640, 12, PALETTE.black]);
  for (let i = 0; i < 40; i++) out.push([4 + i * 16, FLOOR - 7, 4, 2, i % 2 ? PALETTE.red : PALETTE.gold]);
  return out;
})();

function Stands() {
  const flashes = Array.from({ length: 16 }, (_, i) => ({ x: Math.floor(hash(i + 500) * 620) + 8, y: 56 + Math.floor(hash(i + 900) * 130), d: (hash(i + 77) * 3).toFixed(2) }));
  return (
    <>
      <RectCanvas w={640} h={FLOOR} rects={STANDS} className="absolute left-0 top-0" />
      {flashes.map((f, i) => (
        <span key={i} className="t-anim t-flash absolute h-[4px] w-[4px] bg-white" style={{ left: f.x, top: f.y, animationDelay: `${f.d}s` }} />
      ))}
    </>
  );
}

/** A spotlight: a dithered cone of light (every other pixel, no blur) swinging back and forth. */
function Spotlight({ x, delay }: { x: number; delay: string }) {
  return (
    <svg width="240" height="330" viewBox="0 0 240 330" shapeRendering="crispEdges" className="t-anim t-spot pointer-events-none absolute top-0" style={{ left: x - 120, animationDelay: delay }}>
      <defs>
        <pattern id="dither" width="4" height="4" patternUnits="userSpaceOnUse">
          {r(0, 0, 2, 2, PALETTE.cream)}
          {r(2, 2, 2, 2, PALETTE.cream)}
        </pattern>
      </defs>
      <polygon points="112,0 128,0 240,330 0,330" fill="url(#dither)" opacity="0.35" />
    </svg>
  );
}

/** Pixel sunburst rays behind the logo; two sets swap back and forth so it seems to turn. */
function Burst() {
  const ray = (a: number, i: number, c: string) => {
    const w = Math.PI / 16, R = 260;
    const p = (t: number) => `${320 + Math.cos(t) * R},${80 + Math.sin(t) * R * 0.55}`;
    return <polygon key={i} points={`320,80 ${p(a - w)} ${p(a + w)}`} fill={c} />;
  };
  const set = (off: number, c: string) => Array.from({ length: 8 }, (_, i) => ray((i / 8) * Math.PI * 2 + off, i, c));
  return (
    <>
      <svg width="640" height="170" viewBox="0 0 640 170" shapeRendering="crispEdges" className="t-anim t-rays-a absolute left-0 top-0">{set(0, PALETTE.plum)}</svg>
      <svg width="640" height="170" viewBox="0 0 640 170" shapeRendering="crispEdges" className="t-anim t-rays-b absolute left-0 top-0">{set(Math.PI / 8, PALETTE.plum)}</svg>
    </>
  );
}

/** The previous title screen (arena, flaming-ball PRESS START), kept while the attract-mode one is tested: route
 *  "/" to this in App.tsx to bring it back. */
export function OldTitle() {
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

  // where the dunker (the last of the five) has to fly to: just under the rim
  const dunker = five[STARTERS - 1];
  const h = dunker ? dunker.spriteH * (dunker.spriteH < 24 ? 2 : 1) : 0; // as Sprite draws it
  const feet = FLOOR + 32; // where the five's feet are (their shadow sits under them)
  const ball0 = { x: SLOT_X(STARTERS - 1) + 14, y: FLOOR + 10 }; // the ball at the dunker's side
  const vars = {
    "--dx": `${RIM.x - 22 - SLOT_X(STARTERS - 1)}px`, // the dunker flies to just left of the rim…
    "--dy": `${RIM.y - 8 - (feet - h)}px`, // …with its head over it
    "--bx": `${RIM.x - 6 - ball0.x}px`, // the ball goes to the rim…
    "--by": `${RIM.y - 6 - ball0.y}px`,
    "--bf": `${FLOOR + 40 - ball0.y}px`, // …and drops to the floor under it
  } as React.CSSProperties;

  return (
    <ArcadeCabinet view={stage === "press" ? "3d" : "flat"}>
      {stage === "press" ? (
        <div className="absolute inset-0" onClick={() => (selectBlip(), setStage("menu"))}>
          <TitleLogo />
        </div>
      ) : (
      <div className="t-anim t-shake absolute inset-0 overflow-hidden bg-night" style={vars}>
        <Stands />

        {/* court floor: wood, the baseline and a painted key */}
        <div className="absolute inset-x-0 bottom-0 bg-wood" style={{ top: FLOOR }} />
        <div className="absolute inset-x-0 h-[2px] bg-brown" style={{ top: FLOOR }} />
        <div className="absolute bottom-0 w-[4px] bg-white" style={{ top: FLOOR, left: 200 }} />
        <div className="absolute bottom-0 w-[110px] border-x-4 border-t-4 border-white bg-red" style={{ top: FLOOR + 40, left: 500 }} />

        <Spotlight x={150} delay="0s" />
        <Spotlight x={490} delay="-1.6s" />

        <Burst />

        {/* the logo slams down from above, bounces, and the arena flashes */}
        <div className="t-anim t-logo absolute left-0 right-0 top-[18px] flex flex-col items-center">
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
          {/* the tagline on a red ribbon with notched ends */}
          <div className="relative mt-[10px] flex items-center">
            <span className="h-[18px] w-[10px] bg-maroon" style={{ clipPath: "polygon(0 0,100% 0,100% 100%,0 100%,50% 50%)" }} />
            <span className="bg-red px-[12px] py-[5px] font-head text-[8px] tracking-[2px] text-white">A POKéMON HOOPS FAN GAME</span>
            <span className="h-[18px] w-[10px] bg-maroon" style={{ clipPath: "polygon(0 0,100% 0,50% 50%,100% 100%,0 100%)" }} />
          </div>
        </div>
        <div className="t-anim t-whiteout pointer-events-none absolute inset-0 bg-white" />

        <Hoop />

        {/* the five: four bounce in place, the last one takes off for a dunk every few seconds */}
        {five.map((p, i) => {
          const last = i === STARTERS - 1;
          return (
            <div
              key={i}
              className={`t-anim absolute flex flex-col items-center ${last ? "t-dunker" : "t-hop"}`}
              style={{ left: SLOT_X(i) - 36, width: 72, bottom: 360 - feet - 6, animationDelay: last ? undefined : `${i * 0.12}s` }}
            >
              <Sprite p={p} eager />
              {/* a round shadow, drawn as a stepped pixel oval (no smooth curves in the pixel style) */}
              <div className="flex flex-col items-center" aria-hidden>
                <div className="h-[2px] w-[20px] bg-brown" />
                <div className="h-[2px] w-[32px] bg-brown" />
                <div className="h-[2px] w-[20px] bg-brown" />
              </div>
            </div>
          );
        })}
        {dunker && (
          <div className="t-anim t-ball absolute" style={{ left: ball0.x, top: ball0.y }}>
            <Ball />
          </div>
        )}
        {/* SLAM! */}
        <div className="t-anim t-slam pointer-events-none absolute flex items-center justify-center" style={{ left: RIM.x - 175, top: RIM.y - 22, width: 140, height: 70 }}>
          <svg width="140" height="70" viewBox="0 0 140 70" shapeRendering="crispEdges" className="absolute inset-0">
            <polygon points="70,0 84,20 120,8 102,30 140,36 104,44 118,66 82,52 70,70 58,52 22,66 36,44 0,36 38,30 20,8 56,20" fill={PALETTE.gold} stroke={PALETTE.black} strokeWidth="2" />
          </svg>
          <span className="relative font-head text-[16px] text-red" style={{ textShadow: `2px 2px 0 ${PALETTE.black}` }}>SLAM!</span>
        </div>

          <>
            <div className="px-box absolute bottom-[10px] left-[10px] h-[92px] w-[400px] p-[10px] text-[22px] leading-[22px]">
              <Typewriter text={message} />
            </div>
            <div className="px-box absolute bottom-[10px] right-[10px] w-[196px] p-[8px] font-head text-[10px]">
              <Menu items={items} onBack={() => (setStage("press"), setMessage(WELCOME))} />
            </div>
          </>
      </div>
      )}
    </ArcadeCabinet>
  );
}
