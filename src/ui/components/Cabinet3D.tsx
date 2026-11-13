// The arcade cabinet as a 3D object, built from flat CSS panels (so the screen is the live page, not a picture).
// Shaped like a classic upright: a tall marquee box that overhangs the screen, a sloping speaker panel under it,
// a screen tilted back, a control panel box jutting out toward you, a straight lower body, notched side panels.
// Coordinates: x right, y down, z toward you, in art pixels, with the screen's centre at (CAB_W / 2, SCREEN_CY, 0).
// The whole model is shifted down to wherever the flat cabinet's screen is, so when the camera looks square-on at
// the screen the two line up exactly.
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { BALL_URL } from "../art/ballLogo.ts";
import { PALETTE } from "../theme/palette.ts";
import { Band, Bezel, CAB_W, DeckControls, Stripes } from "./cabinetParts.tsx";
import { STAGE_H } from "./PixelStage.tsx";
import { GAME_NAME } from "../name.ts";

type Pt = { y: number; z: number }; // a point on the side profile

// The screen panel: bezel with 8px above and below the screen, then 8px of panel down to the control panel.
const PANEL_PAD = 8;
const SCREEN_Y = 72; // where the screen's top is in this model
const PANEL_Y0 = SCREEN_Y - PANEL_PAD;
const PANEL_Y1 = SCREEN_Y + STAGE_H + 2 * PANEL_PAD;
const SCREEN_CY = SCREEN_Y + STAGE_H / 2; // screen centre (z = 0)

const TILT = 22; // the screen leans back this many degrees
const tilt = (TILT * Math.PI) / 180;
// a point on the screen panel, leaned back about the screen's centre
const along = (flatY: number): Pt => ({ y: SCREEN_CY + (flatY - SCREEN_CY) * Math.cos(tilt), z: (flatY - SCREEN_CY) * Math.sin(tilt) });
const PANEL_TOP = along(PANEL_Y0);
const PANEL_BOTTOM = along(PANEL_Y1);

const TOP_Y = -140; // cabinet top
const MARQUEE: Pt = { y: -10, z: 60 }; // the marquee's bottom front edge (its face runs from TOP_Y down to here)
const BACK_Z = -400;
const BODY_Z = PANEL_BOTTOM.z; // the lower body's front, straight down from the screen's bottom edge
const CP_BACK = PANEL_BOTTOM; // control panel: top back edge…
const CP_FRONT: Pt = { y: CP_BACK.y + 20, z: 230 }; // …top front edge (it slopes gently toward you)…
const CP_LIP: Pt = { y: CP_BACK.y + 122, z: 200 }; // …and the bottom of its front face, which leans back
const FLOOR_Y = 1050;

const BODY: Pt[] = [
  { y: TOP_Y, z: BACK_Z }, { y: TOP_Y, z: MARQUEE.z }, MARQUEE, PANEL_TOP, PANEL_BOTTOM,
  { y: FLOOR_Y, z: BODY_Z }, { y: FLOOR_Y, z: BACK_Z },
];
const CONTROL_PANEL: Pt[] = [CP_BACK, CP_FRONT, CP_LIP, { y: CP_LIP.y, z: BODY_Z }];

/** A panel from a to b on the side profile: where it starts, how it leans, how long it is. */
const span = (a: Pt, b: Pt) => ({
  y: a.y,
  z: a.z,
  h: Math.hypot(b.y - a.y, b.z - a.z),
  deg: (Math.atan2(b.z - a.z, b.y - a.y) * 180) / Math.PI,
});
const SPEAKER = span(MARQUEE, PANEL_TOP);
const CP_TOP = span(CP_BACK, CP_FRONT);
const CP_FACE = span(CP_FRONT, CP_LIP);

// Camera. Looking at it: seen a little from above, swaying, framed on the top half (the top of the marquee down
// to the control panel's front). Front: square-on to the screen.
const PERSPECTIVE = 1400;
const VIEW = -12;
const BASE_YAW = 24;
const SWAY = 12; // degrees either side
const SPIN_FRICTION = 0.997; // spin speed kept per millisecond after you let go (0.997 ≈ coasts about a second)
const FILL = 0.94; // the top half fills this much of the stage's height
export const SETTLE_MS = 700;

// It spins about the middle of the body. To face the screen the camera tips by -TILT about that point, which
// would move the screen; FRONT_SHIFT moves it back so the screen's centre stays put (t = d − R·d).
const PIVOT = { x: CAB_W / 2, y: (TOP_Y + FLOOR_Y) / 2, z: (BACK_Z + BODY_Z) / 2 };
const FRONT_SHIFT = (() => {
  const dy = SCREEN_CY - PIVOT.y, dz = -PIVOT.z;
  const c = Math.cos(-tilt), s = Math.sin(-tilt);
  return { y: dy - (dy * c - dz * s), z: dz - (dy * s + dz * c) };
})();

type P3 = { x: number; y: number; z: number };
/** The corners that bound the top half: the top of the marquee (front and back) and the control panel's front. */
const FRAME_POINTS: P3[] = [0, CAB_W].flatMap((x) => [
  { x, y: TOP_Y, z: MARQUEE.z },
  { x, y: TOP_Y, z: BACK_Z },
  { x, y: CP_FRONT.y, z: CP_FRONT.z },
  { x, y: CP_LIP.y, z: CP_LIP.z },
]);

/** The whole cabinet, top to floor (the portrait title shows all of it). */
const WHOLE_POINTS: P3[] = [0, CAB_W].flatMap((x) => [
  { x, y: TOP_Y, z: MARQUEE.z },
  { x, y: TOP_Y, z: BACK_Z },
  { x, y: FLOOR_Y, z: BODY_Z },
  { x, y: FLOOR_Y, z: BACK_Z },
]);

/** Where a model point lands on the stage (y only) in the looking-at-it pose: the same rotateY, rotateX about the
 *  pivot, translate and perspective the browser applies. */
function projectY(p: P3, lift: number, push: number, shift: number, stageH: number) {
  const ay = (BASE_YAW * Math.PI) / 180, ax = (VIEW * Math.PI) / 180;
  const x = p.x - PIVOT.x, y = p.y - PIVOT.y, z0 = p.z - PIVOT.z;
  const z1 = -x * Math.sin(ay) + z0 * Math.cos(ay);
  const y2 = y * Math.cos(ax) - z1 * Math.sin(ax);
  const z2 = y * Math.sin(ax) + z1 * Math.cos(ax);
  const wy = y2 + PIVOT.y + lift + shift, wz = z2 + PIVOT.z - push;
  return stageH / 2 + (wy - stageH / 2) * (PERSPECTIVE / (PERSPECTIVE - wz));
}

/** How far back (push) and how far up (lift) to hold the cabinet so its top half fills a stage `stageH` tall.
 *  The model sits `shift` lower than its own coordinates (to line up with the flat screen). */
function framing(stageH: number, shift: number, whole = false) {
  const points = whole ? WHOLE_POINTS : FRAME_POINTS, fill = whole ? 0.88 : FILL;
  const centred = (push: number) => {
    let lift = 0, top = 0, bottom = 0;
    for (let i = 0; i < 8; i++) {
      const ys = points.map((p) => projectY(p, lift, push, shift, stageH));
      top = Math.min(...ys);
      bottom = Math.max(...ys);
      lift += stageH / 2 - (top + bottom) / 2;
    }
    return { lift, span: bottom - top };
  };
  let near = -600, far = 6000; // binary search: farther away = smaller
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2;
    if (centred(mid).span > stageH * fill) near = mid;
    else far = mid;
  }
  return { push: far, lift: centred(far).lift };
}
type Framing = ReturnType<typeof framing>;

const pose = (yaw: number, pitch: number, away: boolean, cam: Framing) => {
  const ty = away ? cam.lift : FRONT_SHIFT.y, tz = away ? -cam.push : FRONT_SHIFT.z;
  return `translate3d(0px, ${ty}px, ${tz}px) rotateX(${pitch}deg) rotateY(${yaw}deg)`;
};
const FRONT = pose(0, -TILT, false, { push: 0, lift: 0 });

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One flat panel. Its top-left corner goes to (x, y, z), then `turn` swings it about that corner. */
function Face(props: { x?: number; y?: number; z?: number; turn?: string; w: number; h: number; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const { x = 0, y = 0, z = 0, turn = "", w, h, className = "", style, children } = props;
  return (
    <div
      className={`absolute left-0 top-0 ${className}`}
      style={{
        width: w,
        height: h,
        transformOrigin: "0 0",
        transform: `translate3d(${x}px, ${y}px, ${z}px) ${turn}`,
        backfaceVisibility: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const SIDE_W = CP_FRONT.z - BACK_Z;
const SIDE_H = FLOOR_Y - TOP_Y;

/** A side panel: the body's notched outline plus the control panel's end, in navy with red edge trim, jersey
 *  stripes and the logo. */
function SidePanel({ side }: { side: "left" | "right" }) {
  // the left panel faces left, so its x runs back→front; the right one runs front→back
  const local = ({ y, z }: Pt) => [side === "left" ? z - BACK_Z : CP_FRONT.z - z, y - TOP_Y];
  const pts = (list: Pt[]) => list.map((p) => local(p).join(",")).join(" ");
  const id = `cab-side-${side}`;
  const [lx, ly] = local({ y: 330, z: (BACK_Z + BODY_Z) / 2 - 40 });
  const band = (y0: number, y1: number): Pt[] => [
    { y: y0 + 260, z: BACK_Z }, { y: y0, z: BODY_Z }, { y: y1, z: BODY_Z }, { y: y1 + 260, z: BACK_Z },
  ];
  return (
    <svg width={SIDE_W} height={SIDE_H} shapeRendering="crispEdges" className="block">
      <defs>
        <clipPath id={id}>
          <polygon points={pts(BODY)} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <polygon points={pts(BODY)} fill={PALETTE.navy} />
        <polygon points={pts(band(640, 690))} fill={PALETTE.orange} />
        <polygon points={pts(band(706, 724))} fill={PALETTE.gold} />
        <image href={BALL_URL} x={lx - 96} y={ly - 96} width={192} height={192} style={{ imageRendering: "pixelated" }} />
        <polygon points={pts(BODY)} fill="none" stroke={PALETTE.red} strokeWidth={12} />
      </g>
      <polygon points={pts(CONTROL_PANEL)} fill={PALETTE.navy} stroke={PALETTE.red} strokeWidth={6} />
    </svg>
  );
}

/**
 * Drawn on a stage the width of the screen panel (CAB_W wide, stageH tall); the cabinet spills past it.
 * front: square-on to the screen, which then lands exactly on the flat screen's spot (top screenTop).
 * Otherwise it sways and you can drag it.
 */
export function Cabinet3D({ children, front, screenTop, stageH, whole = false }: {
  children: ReactNode; front: boolean; screenTop: number; stageH: number;
  whole?: boolean; // frame the whole cabinet, not just its top half (portrait)
}) {
  const rig = useRef<HTMLDivElement>(null);
  const st = useRef({ yaw: BASE_YAW, base: BASE_YAW, pitch: VIEW, phase: 0, dragging: false, moved: 0, vel: 0 }).current;
  const shift = screenTop - SCREEN_Y;
  const cam = useRef<Framing>(null!);
  const framed = useMemo(() => framing(stageH, shift, whole), [stageH, shift, whole]);
  cam.current = framed;

  useEffect(() => {
    const el = rig.current!;
    const reduce = reducedMotion();
    if (front) {
      st.vel = 0;
      // after a few spins, take the short way round to face you
      const turns = Math.round(st.yaw / 360) * 360;
      st.yaw -= turns;
      st.base -= turns;
      el.style.transition = "none";
      el.style.transform = pose(st.yaw, st.pitch, true, cam.current);
    }
    getComputedStyle(el).transform; // flush the current pose so the change below animates
    // to the screen it speeds up all the way in (a slam); back out to the room it eases
    el.style.transition = reduce ? "none" : `transform ${SETTLE_MS}ms ${front ? "cubic-bezier(0.6, 0, 1, 0.5)" : "ease-in-out"}`;
    if (front) {
      el.style.transform = FRONT;
      return;
    }
    el.style.transform = pose(st.yaw, st.pitch, true, cam.current);
    let raf = 0, last = 0;
    const sway = setTimeout(() => {
      el.style.transition = "none";
      const tick = (t: number) => {
        const dt = last ? t - last : 0;
        last = t;
        if (!st.dragging && !reduce) {
          // inertia: a flick keeps spinning and slows down
          st.base += st.vel * dt;
          st.vel = Math.abs(st.vel) < 0.001 ? 0 : st.vel * SPIN_FRICTION ** dt;
          st.phase += dt / 1800;
          st.yaw = st.base + SWAY * Math.sin(st.phase);
        }
        el.style.transform = pose(st.yaw, st.pitch, true, cam.current);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, reduce ? 0 : SETTLE_MS);
    return () => {
      clearTimeout(sway);
      cancelAnimationFrame(raf);
    };
  }, [front, st]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (front) return;
    st.dragging = true;
    st.moved = 0;
    st.vel = 0; // grabbing it stops a spin
    let lx = e.clientX, ly = e.clientY, lt = e.timeStamp;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - lx, dy = ev.clientY - ly;
      const dt = Math.max(1, ev.timeStamp - lt);
      lx = ev.clientX;
      ly = ev.clientY;
      lt = ev.timeStamp;
      st.moved += Math.abs(dx) + Math.abs(dy);
      st.yaw += dx * 0.4;
      st.vel = st.vel * 0.5 + ((dx * 0.4) / dt) * 0.5; // degrees per ms, smoothed over the last few moves
      st.pitch = Math.min(5, Math.max(-40, st.pitch - dy * 0.25));
    };
    const up = (ev: PointerEvent) => {
      st.dragging = false;
      if (ev.timeStamp - lt > 80) st.vel = 0; // held still before letting go: no flick
      st.vel = Math.max(-1.5, Math.min(1.5, st.vel));
      st.base = st.yaw - SWAY * Math.sin(st.phase); // sway on from where you let go
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className={`absolute inset-0 touch-none select-none ${front ? "" : "cursor-grab active:cursor-grabbing"}`}
      style={{ perspective: PERSPECTIVE, perspectiveOrigin: `${CAB_W / 2}px ${stageH / 2}px` }}
      onPointerDown={onPointerDown}
      onClickCapture={(e) => {
        if (st.moved > 6) e.stopPropagation(); // that was a drag, not a click on the screen
      }}
    >
      {/* a drag anywhere in the window spins it, not just on the stage */}
      <div className="absolute inset-y-0" style={{ left: -2000, right: -2000 }} />
      <div
        ref={rig}
        data-cabinet-rig
        className="absolute left-0"
        style={{
          top: shift,
          width: CAB_W,
          height: FLOOR_Y,
          transformStyle: "preserve-3d",
          transformOrigin: `${PIVOT.x}px ${PIVOT.y}px ${PIVOT.z}px`,
          transform: FRONT,
        }}
      >
        {/* floor, with the cabinet's shadow on it */}
        <Face x={-100} y={FLOOR_Y + 1} z={BACK_Z - 100} turn="rotateX(90deg)" w={CAB_W + 200} h={CP_FRONT.z - BACK_Z + 260} className="bg-night">
          <div className="absolute bg-black" style={{ left: 100, top: 100, width: CAB_W, height: BODY_Z - BACK_Z }} />
        </Face>

        <Face y={TOP_Y} z={BACK_Z} turn="rotateX(90deg)" w={CAB_W} h={MARQUEE.z - BACK_Z} className="border-2 border-black bg-slate" />
        <Face x={CAB_W} y={TOP_Y} z={BACK_Z} turn="rotateY(180deg)" w={CAB_W} h={SIDE_H} className="border-2 border-black bg-night" />
        <Face y={TOP_Y} z={BACK_Z} turn="rotateY(-90deg)" w={SIDE_W} h={SIDE_H}>
          <SidePanel side="left" />
        </Face>
        <Face x={CAB_W} y={TOP_Y} z={CP_FRONT.z} turn="rotateY(90deg)" w={SIDE_W} h={SIDE_H}>
          <SidePanel side="right" />
        </Face>

        {/* marquee: a tall lit sign */}
        <Face y={TOP_Y} z={MARQUEE.z} w={CAB_W} h={MARQUEE.y - TOP_Y} className="overflow-hidden bg-navy">
          <Stripes height={MARQUEE.y - TOP_Y} />
          <div
            className="absolute flex items-center justify-center gap-6 border-4 border-gold bg-black"
            style={{ left: 28, top: 14, right: 28, bottom: 14, boxShadow: `0 0 0 2px ${PALETTE.black}` }}
          >
            <img src={BALL_URL} width={64} height={64} alt="" />
            <span className="font-head text-[32px] text-gold" style={{ textShadow: `3px 3px 0 ${PALETTE.red}` }}>
              {GAME_NAME}
            </span>
            <img src={BALL_URL} width={64} height={64} alt="" />
          </div>
        </Face>

        {/* speaker panel, sloping back under the marquee */}
        <Face y={SPEAKER.y} z={SPEAKER.z} turn={`rotateX(${SPEAKER.deg}deg)`} w={CAB_W} h={SPEAKER.h} className="overflow-hidden border-2 border-black bg-night">
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-[160px]">
            {[0, 1].map((i) => (
              <div key={i} className="grid grid-cols-6 gap-[6px]">
                {Array.from({ length: 18 }, (_, j) => <div key={j} className="h-[6px] w-[6px] bg-black" />)}
              </div>
            ))}
          </div>
        </Face>

        {/* the screen panel: bezel and live screen, leaned back */}
        <Face y={PANEL_TOP.y} z={PANEL_TOP.z} turn={`rotateX(${TILT}deg)`} w={CAB_W} h={PANEL_Y1 - PANEL_Y0} className="overflow-hidden bg-navy">
          <Stripes height={PANEL_Y1 - PANEL_Y0} />
          <Band y={0} h={STAGE_H + 2 * PANEL_PAD}>
            <Bezel pad={PANEL_PAD}>{children}</Bezel>
          </Band>
        </Face>

        {/* control panel box: top with the stick and buttons, and its front face */}
        <Face y={CP_TOP.y} z={CP_TOP.z} turn={`rotateX(${CP_TOP.deg}deg)`} w={CAB_W} h={CP_TOP.h} className="border-2 border-black bg-slate" style={{ transformStyle: "preserve-3d" }}>
          <div className="absolute left-[10px] right-[10px] h-[52px]" style={{ top: (CP_TOP.h - 52) / 2, transformStyle: "preserve-3d" }}>
            <DeckControls stickStyle={{ transformOrigin: "50% 100%", transform: `rotateX(${-CP_TOP.deg}deg)` }} />
          </div>
        </Face>
        <Face y={CP_FACE.y} z={CP_FACE.z} turn={`rotateX(${CP_FACE.deg}deg)`} w={CAB_W} h={CP_FACE.h} className="flex items-center justify-center overflow-hidden border-2 border-black bg-navy">
          <div className="absolute inset-x-0 top-0 h-[6px] bg-red" />
          <span className="font-head text-[24px] text-gold" style={{ textShadow: `2px 2px 0 ${PALETTE.red}` }}>{GAME_NAME}</span>
        </Face>

        {/* lower body, under the control panel */}
        <Face y={CP_LIP.y} z={BODY_Z} w={CAB_W} h={FLOOR_Y - CP_LIP.y} className="overflow-hidden bg-navy">
          <Stripes height={FLOOR_Y} />
          <img src={BALL_URL} width={128} height={128} alt="" className="absolute left-1/2 top-[110px] -translate-x-1/2" />
          <div className="absolute left-1/2 top-[268px] -translate-x-1/2 border-2 border-black bg-night px-3 py-2 font-head text-[10px] text-gold">
            FREE PLAY
          </div>
          <div className="absolute inset-x-0 bottom-[44px] h-[6px] bg-orange" />
          <div className="absolute inset-x-0 bottom-[36px] h-[4px] bg-gold" />
          <div className="absolute inset-x-0 bottom-0 h-[36px] bg-black" />
        </Face>
      </div>

      {/* the stage can be wider than a phone screen: keep the hint inside the window's right edge */}
      {!front && <div className="absolute right-[max(10px,calc(50%-50vw+10px))] top-[8px] font-head text-[8px] text-steel">DRAG TO SPIN</div>}
    </div>
  );
}
