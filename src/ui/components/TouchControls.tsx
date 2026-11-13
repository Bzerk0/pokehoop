import { useEffect, useRef, useState } from "react";
import { loadKeys, type KeyMap } from "../../game/keys.ts";
import { Arrow } from "./Arrow.tsx";
import type { PaletteName } from "../theme/palette.ts";
import { PALETTE } from "../theme/palette.ts";

// The live game on a phone: a thumb stick on the left, buttons on the right. They don't talk to the game directly:
// each one presses the key it stands for (from your key map), so every mode, menu and the tutorial work as they do
// on a keyboard.

/** Press or let go of a key, as if on a keyboard. */
function key(code: string, down: boolean) {
  const name = code === "Escape" ? "Escape" : code === "Space" ? " " : code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
  window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: name, bubbles: true }));
}

/** Keep getting this finger's moves and lift even once it slides off (a pointer the browser doesn't know: skip it). */
function capture(e: React.PointerEvent) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // not a live pointer: the press still counts
  }
}

const STICK = 46; // the stick's reach, in CSS pixels
const DEAD = 0.38; // push it this far (of the reach) before a direction counts

/** A thumb stick: holds the move keys for the way it's pushed (8 ways), and works the menus' up/down too. */
function Stick({ keys }: { keys: KeyMap }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const held = useRef(new Set<string>());
  const set = (want: string[]) => {
    for (const c of held.current) if (!want.includes(c)) (key(c, false), held.current.delete(c));
    for (const c of want) if (!held.current.has(c)) (key(c, true), held.current.add(c));
  };
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > STICK) (dx *= STICK / d), (dy *= STICK / d);
    setKnob([Math.round(dx), Math.round(dy)]);
    const x = dx / STICK, y = dy / STICK, want: string[] = [];
    if (x > DEAD) want.push(keys.right);
    if (x < -DEAD) want.push(keys.left);
    if (y < -DEAD) want.push(keys.up);
    if (y > DEAD) want.push(keys.down);
    set(want);
  };
  const end = () => (setKnob([0, 0]), set([]));
  useEffect(() => () => set([]), []); // let go of everything when the controls go away
  return (
    <div
      ref={base}
      className="relative h-[112px] w-[112px] border-4 border-white/60 bg-black/40"
      onPointerDown={(e) => (capture(e), move(e))}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Move"
    >
      <span className="absolute left-1/2 top-1/2 h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 bg-white/60" />
      <span
        className="absolute left-1/2 top-1/2 h-[44px] w-[44px] border-4 border-black bg-gold"
        style={{ transform: `translate(calc(-50% + ${knob[0]}px), calc(-50% + ${knob[1]}px))`, boxShadow: `inset -4px -4px 0 ${PALETTE.amber}` }}
      />
    </div>
  );
}

/** Another button a held finger can slide onto (TURBO onto SHOOT: the dunk), pressing its keys too. */
type Slide = { to: React.RefObject<HTMLButtonElement | null>; codes: string[] };

/** A button that holds its keys down while your finger's on it (`tap`: a quick press instead, on touch). */
function Pad({ label, codes, color, size = 52, wide, tap, slide, ref, onHold, flash = false }: {
  label: string; codes: string[]; color: PaletteName; size?: number; wide?: number; tap?: () => void; slide?: Slide;
  ref?: React.Ref<HTMLButtonElement>; onHold?: (down: boolean) => void; flash?: boolean; // flash: press me now
}) {
  const [on, setOn] = useState(false);
  const downRef = useRef(false);
  const pressed = useRef<string[]>([]); // the keys this press holds (the label, and so the keys, may change meanwhile)
  const slid = useRef(false); // the finger's over the slide target now
  const slideTo = (over: boolean) => {
    if (!slide || over === slid.current) return;
    slid.current = over;
    for (const c of slide.codes) key(c, over);
    const el = slide.to.current;
    if (el) el.style.opacity = over ? "1" : ""; // the target lights up as if pressed
  };
  const press = (down: boolean) => {
    if (down === downRef.current) return;
    downRef.current = down;
    setOn(down);
    onHold?.(down);
    if (!down) slideTo(false);
    // (the keys this press took are what it lets go: a button can switch jobs mid-press, SCREEN to STEAL)
    if (down) pressed.current = tap ? [] : codes;
    if (down && tap) tap();
    for (const c of pressed.current) key(c, down);
  };
  const move = (e: React.PointerEvent) => {
    const r = slide?.to.current?.getBoundingClientRect();
    if (downRef.current && r) slideTo(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
  };
  useEffect(() => () => press(false), []);
  return (
    <button
      ref={ref}
      className={`flex select-none items-center justify-center border-4 border-black font-head text-[8px] text-black ${flash ? "flash-outline" : ""}`}
      style={{
        width: wide ?? size, height: size, background: PALETTE[color], opacity: on ? 1 : 0.75,
        boxShadow: on ? "none" : `inset -4px -4px 0 ${PALETTE.black}59`, transform: on ? "translate(2px, 2px)" : undefined,
      }}
      onPointerDown={(e) => (e.preventDefault(), capture(e), press(true))}
      onPointerMove={move}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/** While TURBO's held: a dotted pixel path from it to SHOOT, saying you can slide your thumb across. */
function SlidePath() {
  return (
    <span className="blink pointer-events-none absolute left-[calc(100%-6px)] top-1/2 flex -translate-y-1/2 items-center gap-[3px] text-white">
      {[0, 1, 2].map((i) => <span key={i} className="h-[4px] w-[4px] border border-black bg-white" />)}
      <span className="text-[20px] leading-none"><Arrow /></span>
    </span>
  );
}

/** Keep clear of a phone's notch and rounded corners (iPhone, landscape). */
const SAFE: React.CSSProperties = {
  paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)", paddingBottom: "env(safe-area-inset-bottom)",
};
/** Android and iPad can go full screen from a button; an iPhone can't (a home-screen app can). */
const canFull = () => !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
function goFull() {
  document.documentElement.requestFullscreen?.().then(
    () => (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.("landscape").catch(() => {}),
    () => {}, // refused: carry on in the page
  );
}
const TIP = "s5p-ios-tip-v1";
/** The add-to-home-screen tip: on an iPhone in the browser (not already a home-screen app), until it's hidden. */
function showTip() {
  const iphone = /iPhone|iPod/.test(navigator.userAgent);
  const app = (navigator as { standalone?: boolean }).standalone || window.matchMedia("(display-mode: standalone)").matches;
  try {
    return iphone && !app && localStorage.getItem(TIP) !== "1";
  } catch {
    return iphone && !app;
  }
}
function hideTip() {
  try {
    localStorage.setItem(TIP, "1");
  } catch {
    // shown again next time
  }
}

/** The live game's touch controls, over the edges of the screen; a "turn it sideways" card in portrait. */
type TouchState = { dunk: boolean; defence: boolean; euro: boolean };
const NONE: TouchState = { dunk: false, defence: false, euro: false };

export function TouchControls({ team, state, onBack }: { team: boolean; state?: () => TouchState | undefined; onBack?: () => void }) {
  const keys = loadKeys();
  const shoot = useRef<HTMLButtonElement>(null);
  const [turbo, setTurbo] = useState(false); // held: show the slide path to SHOOT
  // what the buttons say, polled from the game: DUNK by the rim, STEAL/JUMP on defence, flashing in a eurostep
  const [now, setNow] = useState<TouchState>(NONE);
  useEffect(() => {
    if (!state) return;
    const t = window.setInterval(() => {
      const s = state() ?? NONE;
      setNow((p) => (p.dunk === s.dunk && p.defence === s.defence && p.euro === s.euro ? p : s));
    }, 100);
    return () => clearInterval(t);
  }, [state]);
  const { dunk, defence, euro } = now;
  // a double tap of sprint: the crossover with the ball, a steal without
  const steal = () => [true, false, true, false].forEach((d) => key(keys.turbo, d));
  // an iPad: everything a third bigger, and higher up (thumbs sit further up a tablet)
  const tablet = Math.min(window.innerWidth, window.innerHeight) >= 700;
  const big = (corner: "left" | "right"): React.CSSProperties =>
    tablet ? { bottom: 110, transform: "scale(1.35)", transformOrigin: corner === "left" ? "0 100%" : "100% 100%" } : {};
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  const [tip, setTip] = useState(showTip);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-30 select-none" style={{ touchAction: "none", ...SAFE }}>
      <div className="pointer-events-auto absolute bottom-[36px] left-[107px]" style={big("left")}>
        <Stick keys={keys} />
      </div>
      <div className="pointer-events-auto absolute right-[36px] top-[16px] flex gap-2">
        {canFull() && !full && <Pad label="FULL" codes={[]} tap={goFull} color="cloud" size={36} wide={48} />}
        {team && <Pad label="PLAYS" codes={[keys.plays]} color="cloud" size={36} wide={56} />}
        <Pad label="II" codes={["Escape"]} color="cloud" size={36} />
      </div>
      {/* the buttons, in an arc for the right thumb: SHOOT biggest, nearest the corner */}
      <div className="pointer-events-auto absolute bottom-[36px] right-[59px] grid grid-cols-3 items-end gap-[10px]" style={big("right")}>
        <span /> {/* (the crossover / steal: double-tap TURBO, like sprint on a keyboard) */}
        <Pad label="PASS" codes={[keys.pass]} color="sky" size={64} flash={euro} />
        <span />
        {/* on defence: STEAL (a double tap of sprint); on offence in team games: SCREEN */}
        {defence ? <Pad label="STEAL" codes={[]} tap={steal} color="red" size={46} wide={60} />
          : team ? <Pad label="SCREEN" codes={["ArrowLeft", "ArrowRight"]} color="steel" size={46} wide={60} /> : <span />}
        {/* hold TURBO and slide onto SHOOT: the dunk, without lifting your thumb */}
        <span className="relative">
          <Pad label="TURBO" codes={[keys.turbo]} color="lime" size={64} slide={{ to: shoot, codes: ["Space"] }} onHold={setTurbo} />
          {turbo && <SlidePath />}
        </span>
        {/* Space always shoots, and tips off; by the rim it's DUNK and holds turbo too */}
        <Pad
          ref={shoot} label={defence ? "JUMP" : dunk ? "DUNK" : "SHOOT"} codes={dunk && !defence ? [keys.turbo, "Space"] : ["Space"]}
          color={dunk && !defence ? "orange" : "gold"} size={84} flash={euro}
        />
      </div>
      {/* an iPhone's browser keeps its bars: only a home-screen app gets the whole screen, so say how (once) */}
      {tip && (
        <button
          className="pointer-events-auto absolute left-1/2 top-[52px] -translate-x-1/2 border-4 border-black bg-gold px-3 py-1 font-head text-[8px] leading-[1.8] text-black"
          onClick={() => (setTip(false), hideTip())}
        >
          FULL SCREEN: TAP SHARE, THEN ADD TO HOME SCREEN (TAP TO HIDE)
        </button>
      )}
      {/* in portrait the court's too small: ask for the phone sideways */}
      <div className="pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-3 bg-black p-6 text-center [@media(orientation:portrait)]:flex">
        <span className="font-head text-[16px] leading-[1.6] text-gold">TURN YOUR PHONE SIDEWAYS</span>
        <span className="text-[24px] text-cloud">The court needs the whole screen.</span>
        {onBack && <button className="px-btn" onClick={onBack}><Arrow left /> BACK</button>}
      </div>
    </div>
  );
}
