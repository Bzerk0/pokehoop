// Draws the live game (the rules live in src/core/live) as a 3D arena with Three.js: 1, 3 or 5 a side. The camera
// sits behind your end and always looks up the court at the hoop you attack; it rides along with the ball but keeps
// the player you steer in shot. The scene is drawn at 640×360 and blown up by a whole number, so it stays chunky
// pixels. Pokémon are flat sprites standing in the 3D world, each on a ring in its team's colour (yours gold).
// A 2D canvas on top carries the HUD, the shot meter and the popups.
import * as THREE from "three";
import { makeAi, makeCoach, type AiLevel } from "../core/live/ai.ts";
import {
  callPlay, callScheme, COURT, energyOf, facedTeammate, handlerOf, handZ, lineupGame, liveResult, meterWindow, NO_INPUT, reachOf, step,
  subIn, type Game, type GameEvent, type Input, type Player,
} from "../core/live/game.ts";
import { PLAY, PLAYS, SCHEME_ABOUT, SCHEMES, type PlayName, type SchemeName } from "../core/live/plays.ts";
import { LIVE } from "../core/ratingConfig.ts";
import { canSimRest, simTheRest } from "../core/live/handover.ts";
import type { Lineup } from "../core/lineup.ts";
import type { GameResult } from "../core/sim/sim.ts";
import { clock as clockText } from "../core/stats.ts";
import type { RatedPokemon } from "../core/types.ts";
import { blip, boom, fanfare, swoosh, womp } from "../ui/sound.ts";
import { cameraFor, ClipSpotter, frameAt, Recorder, replaySpeed, snap, type Clip, type Snap } from "./replay.ts";
import { Music } from "./music.ts";
import { STEPS, Tutorial } from "./tutorial.ts";
import { ACTIONS, codesFor, keyName, loadKeys, type Action, type KeyMap } from "./keys.ts";
import { inkOn, PALETTE, typeColor, type PaletteName } from "../ui/theme/palette.ts";

export type LiveSetup = {
  /** Your full lineup and theirs (8 each): who starts depends on `size`, the rest are the bench. */
  home: Lineup;
  away: Lineup;
  size: 1 | 3 | 5;
  /** The lineup slots you picked on the select screen (default: by size); the rest of your team is the bench. */
  picks?: number[];
  /** One-character mode: you only play as your P1 (passing doesn't switch), and call a play every possession. */
  solo?: boolean;
  dex: Map<number, RatedPokemon>;
  youColor: PaletteName;
  cpuColor: PaletteName;
  level: AiLevel;
  seed: number;
  /** The game's over: the final score, and for full games the box score and highlights. */
  onOver: (score: [number, number], result: GameResult | null) => void;
  /** How full the arena is: 0 empty – 1 packed (default CROWD). */
  crowd?: number;
  /** HOW TO PLAY: a 3v3 practice game run as a step-by-step lesson (tutorial.ts). */
  tutorial?: boolean;
  /** The title screen's background: a silent CPU-vs-CPU game, fast-forwarded off screen, showing only its big plays
   *  through the replay cameras, one after another. No HUD, no sound, no keys. */
  attract?: boolean;
};

/** The usual crowd level; pass `crowd` in the setup (or call setCrowd) for a different one. */
export const CROWD = 0.85;
const SIMPLE_PER_FAN = 5; // filler fans for each detailed one when packed

export const VIEW_W = 640, VIEW_H = 360;
const DT = 1 / 60;
/** The game-over moment (ms after the final buzzer): the beat before anyone reacts, the fall, the menu. */
/** ms the newly controlled player flashes after a switch. */
const SWITCH_FLASH = 1200;
const ENDING = { react: 900, fall: 250, menu: 4200 };
const SPRITE_PX = 30; // sprite pixels per metre in the world
const FONT = '"Press Start 2P"';
// the court's size, read again for each new game (the dev menu can change it)
let W = COURT.w, L = COURT.l;

/** court (x across, y up the court, z height) → Three.js (X right, Y up, Z toward the camera at your end) */
const at = (x: number, y: number, z = 0) => new THREE.Vector3(x - W / 2, z, L / 2 - y);
const col = (n: PaletteName) => new THREE.Color(PALETTE[n]);
const basic = (n: PaletteName, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color: col(n), ...extra });

function pixelTexture(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paint(w: number, h: number, draw: (px: (x: number, y: number, c: PaletteName, w?: number, h?: number) => void) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw((x, y, color, pw = 1, ph = 1) => {
    ctx.fillStyle = PALETTE[color];
    ctx.fillRect(Math.round(x), Math.round(y), pw, ph);
  });
  return c;
}

export class LiveView {
  private g: Game;
  private brains: ReturnType<typeof makeAi>[]; // one per player; yours is skipped while you steer it
  private coach = makeCoach(1); // the CPU bench: calls its plays and schemes
  private tutor: Tutorial | null = null; // HOW TO PLAY
  private extraEvents: GameEvent[] = []; // events made between game steps (menu calls), for this frame
  /** The Q menu: your play (with the ball) or your defence (without), and the highlighted line. */
  private menu: { kind: "play" | "scheme"; cursor: number } | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, VIEW_W / VIEW_H, 0.1, 300);
  private hud: CanvasRenderingContext2D;
  private bodies: THREE.Sprite[] = [];
  private dressed: number[] = []; // which Pokémon each sprite shows (a sub changes it)
  private auras: THREE.Sprite[] = []; // the ON FIRE flames
  // each hoop's shot clock and violation glow (0: your end, 1: the far end)
  private hoopFx: ({ frame: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial; clock: THREE.Sprite; ctx: CanvasRenderingContext2D; tex: THREE.Texture; shown: number } | null)[] = [null, null];
  private glowUntil = [0, 0];
  private endAt = 0; // when the final buzzer went (ms)
  private ringMats: { mate: THREE.MeshBasicMaterial; target: THREE.MeshBasicMaterial } | null = null;
  private textures = new Map<string, THREE.Texture>();
  private loader = new THREE.TextureLoader();
  private music = new Music();
  private shadows: THREE.Mesh[] = [];
  private ring!: THREE.Mesh;
  private manRing!: THREE.Mesh;
  private burst!: THREE.Mesh;
  private teamRings: THREE.Mesh[] = [];
  private ball!: THREE.Sprite;
  private ballShadow!: THREE.Mesh;
  private facing: boolean[] = [];
  private focus = { x: W / 2, y: 6 };
  private shake = 0;
  private held = new Set<string>();
  private tapped = new Set<string>();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private menuPeriod = -1; // the quarter whose first possession got the full play menu (one-character mode)
  private sideUntil = 0; // the side play list shows until then
  private lastPoss = -1;
  private lastControl = -1; // who you steered last frame: a change makes the new one flash
  private flashUntil = 0;
  private whiteWho = -1; // who flashes white (a pass on its way to them) and until when
  private whiteUntil = 0; // whose ball it was last frame (one-character mode opens a play call when it turns yours)
  private passTarget = -1;
  /** Animation time (s): runs slow while the play menu is open, like the game. */
  private vt = 0;
  private started = false;
  private ended = false;
  private paused = false;
  // who: over that player; banner: a strip under the score
  private popups: { text: string; color: PaletteName; until: number; who?: number; big: boolean; banner?: boolean }[] = [];
  private disposables: { dispose: () => void }[] = [];
  private fans: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; look: THREE.Texture[]; base: number; phase: number; rate: number; seat: number }[] = [];
  private filler = { points: null as THREE.Points | null, base: new Float32Array(), phase: new Float32Array(), seat: new Float32Array() };
  private hype = 0;
  private holdFromStart = false; // K/Space still held from the press that tipped off
  private staminaUntil = 0; // show the stamina bar until then (ms)
  private crowd: number;
  // replays (replay.ts): the recording, the big-play spotter, clips still being filmed, one waiting to be shown, the
  // game's best plays for the reel, and the replay playing now
  private rec = new Recorder(6);
  private spotter = new ClipSpotter();
  private pendingClips: Clip[] = [];
  private waitingClip: Clip | null = null;
  private topClips: Clip[] = [];
  private lastReplayAt = -Infinity;
  private replay: { clip: Clip; t: number; hold: number; cut: number; hit: number; label: string; saved: Snap; reel: boolean; began: number } | null = null;
  private reel: Clip[] = [];
  private gone = false; // destroyed: late timers do nothing
  private rpos = new THREE.Vector3();
  private rlook = new THREE.Vector3();
  private replayFlashUntil = 0;
  // a live cinematic: the dunk camera cutting in while the dunk really happens (the game itself goes slow-mo)
  private cine: { clip: Clip; cut: number } | null = null;
  private cineKey = -Infinity; // when the last live-filmed slam lands (so it isn't replayed again)
  private lastActs: string[] = [];
  private cineCaption: { text: string; color: PaletteName; at: number } | null = null; // BIG BLOCK! over a live cinematic
  private ticks = { shot: 99, clock: 99 }; // the last second each clock ticked on (the countdown beeps)
  private cineBlocked = false; // the live slam got stuffed
  private lastCineAt = -Infinity; // game time the last live cut ended (LIVE.cineGap)
  private ballFire!: THREE.Sprite; // the ball on fire for a slam or an alley-oop
  private trail: { sprite: THREE.Sprite; x: number; y: number; z: number; t: number }[] = []; // its fire trail
  private nearOnly: THREE.Object3D[] = []; // your end's pole and stands: only replay angles ever see them
  private nearFade: { m: THREE.MeshBasicMaterial; o: number; on: number }[] = []; // your hoop: see-through in play, solid in replays
  private rims: THREE.Mesh[] = [];
  private nets: THREE.Mesh[] = [];
  private bend = { until: 0, end: 1 }; // a rim bending after a slam
  private ghosts: THREE.Sprite[] = []; // afterimages trailing the star of a replay
  private impact!: THREE.Mesh; // a shockwave ring at the moment of impact
  private impactAt: { x: number; y: number; z: number; t: number } | null = null;
  private dust: THREE.Sprite[] = [];
  private dustAt: { x: number; y: number; t: number } | null = null;
  private baseScale: [number, number][] = []; // each sprite's size (replays squash and stretch the star)

  constructor(private host: HTMLElement, private d: LiveSetup) {
    W = COURT.w;
    L = COURT.l;
    this.g = lineupGame(d.home, d.away, d.dex, d.tutorial ? 3 : d.size, d.seed, !!d.tutorial, d.tutorial ? undefined : d.picks);
    this.g.solo = !!d.solo && !d.tutorial && this.g.size > 1;
    this.tutor = d.tutorial ? new Tutorial(this.g) : null;
    this.crowd = d.crowd ?? CROWD;
    this.brains = this.g.players.map((p) => makeAi(p.i, d.level));
    this.facing = this.g.players.map((p) => p.side === 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    const hud = document.createElement("canvas");
    hud.width = VIEW_W;
    hud.height = VIEW_H;
    for (const c of [this.renderer.domElement, hud]) {
      c.style.cssText = `position:absolute;left:0;top:0;width:${VIEW_W}px;height:${VIEW_H}px;image-rendering:pixelated`;
      host.appendChild(c);
    }
    this.hud = hud.getContext("2d")!;

    this.reloadKeys();
    this.build();
    if (import.meta.env.DEV) (window as unknown as { __live?: LiveView }).__live = this; // dev only: poke at it from the console
    if (d.attract) this.started = true; // no intro, no music, no keys: it just plays
    else {
      window.addEventListener("keydown", this.onDown);
      window.addEventListener("keyup", this.onUp);
      window.addEventListener("blur", this.onBlur);
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  // ── for the pause menu ───────────────────────────────────────────────────────
  /** Your roster for the subs screen: who's on court (by spot) and who's on the bench, with energy. */
  roster() {
    const g = this.g, r = g.rosters[0];
    const court = g.players.filter((p) => p.side === 0).map((p) => ({ i: p.i, r: p.r, p: p.p, slot: r[p.r].slot, energy: energyOf(g, p) }));
    const on = new Set(court.map((c) => c.r));
    const bench = r.map((e, k) => ({ r: k, p: e.p, slot: e.slot, energy: e.energy })).filter((b) => !on.has(b.r));
    return { court, bench, timed: g.timed, autoSub: g.autoSub[0] };
  }
  /** Send bench player r in for whoever plays spot i. */
  sub(i: number, r: number) {
    return subIn(this.g, i, r);
  }
  setAutoSub(on: boolean) {
    this.g.autoSub[0] = on;
  }
  get canSimRest() {
    return canSimRest(this.g);
  }
  /** Hand the rest of the game to the sim: the final result (live part included). */
  simRest(): GameResult {
    if (this.replay) this.applySnap(this.replay.saved); // mid-replay: the real positions back first
    this.replay = null;
    this.ended = true;
    this.music.stop();
    return simTheRest(this.g, this.d.home, this.d.away, this.d.dex, (this.d.seed * 31 + 7) >>> 0);
  }
  get musicOn() {
    return !this.music.muted;
  }
  toggleMusic() {
    return this.music.toggle();
  }

  pause() {
    this.paused = true;
    this.menu = null;
    this.held.clear();
    this.music.stop();
  }
  resume() {
    this.paused = false;
    this.last = 0;
    this.reloadKeys(); // the CONTROLS screen may have changed them
    if (this.started && !this.ended) this.music.start();
  }
  destroy() {
    this.gone = true;
    cancelAnimationFrame(this.raf);
    this.music.stop();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    for (const x of this.disposables) x.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.host.replaceChildren();
  }

  // ── keys ──────────────────────────────────────────────────────────────────
  private keys: KeyMap = loadKeys(); // what each action is bound to (the CONTROLS screen changes it)
  private gameKeys = new Set<string>();
  /** Re-read the key map (after the CONTROLS screen) and the set of keys the game listens to. */
  reloadKeys() {
    this.keys = loadKeys();
    this.gameKeys = new Set([...ACTIONS.flatMap((a) => codesFor(this.keys, a)), "KeyL", "Enter", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5"]);
  }
  /** Is any key for this action held / just pressed? */
  /** TEST (LIVE.sprintOnL): L is sprint, and a double tap of L is the crossover / steal. */
  private lSprint = () => LIVE.sprintOnL >= 1;
  private codes = (a: Action) => {
    const list = codesFor(this.keys, a);
    if (!this.lSprint()) return list;
    if (a === "turbo") return [...list, "KeyL"];
    if (a === "cross") return list.filter((c) => c !== "KeyL");
    return list;
  };
  private act = (a: Action) => this.down(...this.codes(a));
  private tap = (a: Action) => this.codes(a).some((c) => this.tapped.has(c)) || (a === "cross" && this.doubleTapped);
  private onDown = (e: KeyboardEvent) => {
    if (this.paused || !this.gameKeys.has(e.code)) return;
    e.preventDefault(); // no page scrolling on arrows/space
    if (!e.repeat) this.tapped.add(e.code);
    if (!e.repeat && this.codes("turbo").includes(e.code)) this.turboDownAt = performance.now();
    if (!e.repeat && e.code === "KeyL" && this.lSprint()) {
      const t = performance.now();
      if (t - this.lastL < LIVE.doubleTap * 1000) (this.doubleTapped = true), (this.lastL = 0);
      else this.lastL = t;
    }
    this.held.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    // a quick tap of sprint (not a hold) counts as a crossover tap
    if (!this.lSprint() && codesFor(this.keys, "turbo").includes(e.code) && performance.now() - this.turboDownAt < LIVE.sprintTap * 1000) this.sprintTapped = true;
  };
  private lastL = 0;
  private doubleTapped = false;
  private turboDownAt = 0;
  private sprintTapped = false;
  private onBlur = () => this.held.clear();
  /** A hidden tab freezes the game (and starves the music's timer), so the music waits too. */
  private onVisibility = () => {
    if (document.hidden) this.music.stop();
    else if (this.started && !this.ended && !this.paused) this.music.start();
  };
  private down = (...codes: string[]) => codes.some((c) => this.held.has(c));

  // ── the arena ─────────────────────────────────────────────────────────────
  private keep<T extends { dispose: () => void }>(x: T) {
    this.disposables.push(x);
    return x;
  }

  private build() {
    const s = this.scene;
    s.background = col("night");

    // the floor: a pixel texture, 20 px per metre, with an apron round the court
    const R = 20, M = 1.5;
    const tw = Math.round((W + 2 * M) * R), th = Math.round((L + 2 * M) * R);
    const fx = (x: number) => (x + M) * R, fy = (y: number) => (L - y + M) * R;
    const floor = paint(tw, th, (px) => {
      px(0, 0, "brown", tw, th);
      px(fx(0), fy(L), "wood", W * R, L * R);
      for (let x = fx(0) + 5; x < fx(W); x += 5) px(x, fy(L), "tan", 1, L * R);
      const dot = (x: number, y: number) => px(fx(x), fy(y), "white");
      const arc = (cx: number, cy: number, r: number, keep = (_x: number, _y: number) => true) => {
        for (let t = 0; t < Math.PI * 2; t += 0.003) {
          const x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r;
          if (keep(x, y)) dot(x, y);
        }
      };
      // painted keys: yours at your end, theirs at the end you attack (every line scales with the court)
      const { keyW, keyL, circle, three, corner: side3 } = COURT;
      px(fx(W / 2 - keyW / 2), fy(keyL), this.d.youColor, keyW * R, keyL * R);
      px(fx(W / 2 - keyW / 2), fy(L), this.d.cpuColor, keyW * R, keyL * R);
      // lines: boundary (2 px), half court, centre circle, keys, free-throw circles, threes
      px(fx(0) - 2, fy(L) - 2, "white", W * R + 4, 2);
      px(fx(0) - 2, fy(0), "white", W * R + 4, 2);
      px(fx(0) - 2, fy(L), "white", 2, L * R);
      px(fx(W), fy(L), "white", 2, L * R);
      px(fx(0), fy(L / 2), "white", W * R, 1);
      arc(W / 2, L / 2, circle);
      for (const base of [0, L]) {
        const dir = base === 0 ? 1 : -1, ft = base + dir * keyL, hy = base + dir * COURT.hoopIn;
        px(fx(W / 2 - keyW / 2), fy(Math.max(base, ft)), "white", 1, keyL * R);
        px(fx(W / 2 + keyW / 2), fy(Math.max(base, ft)), "white", 1, keyL * R);
        px(fx(W / 2 - keyW / 2), fy(ft), "white", keyW * R, 1);
        arc(W / 2, ft, circle, (_x, y) => (y - ft) * dir >= 0);
        const corner = Math.abs(hy - base) + Math.sqrt(three ** 2 - side3 ** 2);
        px(fx(W / 2 - side3), fy(Math.max(base, base + dir * corner)), "white", 1, corner * R);
        px(fx(W / 2 + side3), fy(Math.max(base, base + dir * corner)), "white", 1, corner * R);
        arc(W / 2, hy, three, (x, y) => Math.abs(x - W / 2) <= side3 && (y - hy) * dir >= 0);
      }
    });
    const floorMesh = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(W + 2 * M, L + 2 * M)), this.keep(new THREE.MeshBasicMaterial({ map: this.keep(pixelTexture(floor)) })));
    floorMesh.rotation.x = -Math.PI / 2;
    s.add(floorMesh);

    // the stands: rows of fans rising away from the court on three sides
    const heads: PaletteName[] = ["slate", "steel", "fog", "navy", "maroon", "plum", "cloud"];
    const crowd = paint(64, 64, (px) => {
      px(0, 0, "black", 64, 64);
      for (let y = 1; y < 64; y += 4) for (let x = 1 + ((y >> 2) % 2) * 2; x < 64; x += 4) px(x, y, heads[(x * 7 + y * 13) % heads.length], 2, 2);
    });
    const crowdTex = this.keep(pixelTexture(crowd));
    crowdTex.wrapS = crowdTex.wrapT = THREE.RepeatWrapping;
    // a stand starts `edge` metres out from the middle of the court (direction ox/oz) and rises away at SLOPE,
    // in BANDS rows, each a step darker than the one below
    const SLOPE = 0.6, DEPTH_M = 14, BANDS = 5;
    const shade = (v: number) => 1 - Math.min(BANDS - 1, Math.floor(v * BANDS)) * 0.18; // top row 28% as bright
    const standAt = (ox: number, oz: number, edge: number, across: number, v: number) => {
      const out = edge + Math.cos(SLOPE) * v * DEPTH_M;
      return new THREE.Vector3(ox * out + -oz * across, Math.sin(SLOPE) * v * DEPTH_M, oz * out + ox * across);
    };
    const stands = [
      { ox: -1, oz: 0, edge: W / 2 + M, width: L + 8, turn: Math.PI / 2, fans: 60 },
      { ox: 1, oz: 0, edge: W / 2 + M, width: L + 8, turn: -Math.PI / 2, fans: 60 },
      { ox: 0, oz: -1, edge: L / 2 + M, width: W + 20, turn: 0, fans: 40 },
    ];
    for (const st of stands)
      for (let i = 0; i < BANDS; i++) {
        const t = this.keep(crowdTex.clone());
        t.repeat.set(st.width / 4, DEPTH_M / BANDS / 4); // big seats: small ones shimmer in the distance
        t.needsUpdate = true;
        const m = new THREE.Mesh(
          this.keep(new THREE.PlaneGeometry(st.width, DEPTH_M / BANDS)),
          this.keep(new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color().setScalar(shade((i + 0.5) / BANDS)) })),
        );
        m.rotation.order = "YXZ";
        m.rotation.y = st.turn;
        m.rotation.x = -Math.PI / 2 + SLOPE; // rising away from the court
        m.position.copy(standAt(st.ox, st.oz, st.edge, 0, (i + 0.5) / BANDS));
        s.add(m);
      }
    this.makeFans(stands, standAt, shade);
    // a stand behind your own end too: the play camera sits there, so it only shows in replays
    for (let i = 0; i < BANDS; i++) {
      const t = this.keep(crowdTex.clone());
      t.repeat.set((W + 20) / 4, DEPTH_M / BANDS / 4);
      t.needsUpdate = true;
      const m = new THREE.Mesh(
        this.keep(new THREE.PlaneGeometry(W + 20, DEPTH_M / BANDS)),
        this.keep(new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color().setScalar(shade((i + 0.5) / BANDS)) })),
      );
      m.rotation.order = "YXZ";
      m.rotation.y = Math.PI;
      m.rotation.x = -Math.PI / 2 + SLOPE;
      m.position.copy(standAt(0, 1, L / 2 + M, 0, (i + 0.5) / BANDS));
      m.visible = false;
      this.nearOnly.push(m);
      s.add(m);
    }

    this.hoop(1);
    this.hoop(0);

    // players, their shadows and team rings, the gold ring under the one you steer, the ball
    const shadowGeo = this.keep(new THREE.CircleGeometry(0.45, 10)), shadowMat = this.keep(basic("black", { transparent: true, opacity: 0.4, depthWrite: false }));
    const teamGeo = this.keep(new THREE.RingGeometry(0.36, 0.56, 16));
    // rings: clear blue under your teammates, the CPU's team colour under theirs; yellow marks your pass target
    const teamMat = [this.keep(basic("sky", { transparent: true, opacity: 0.95, depthWrite: false })), this.keep(basic(this.d.cpuColor, { depthWrite: false }))];
    this.ringMats = { mate: teamMat[0], target: this.keep(basic("gold", { depthWrite: false })) };
    // ON FIRE: a pixel flame behind the player, tinted to their type's colour (drawn white, coloured per player)
    const flame = this.keep(pixelTexture(paint(16, 20, (px) => {
      const rows = [[7, 2], [6, 3], [5, 4], [4, 6], [3, 8], [2, 10], [2, 11], [1, 13], [1, 14], [0, 15], [0, 16], [0, 16], [1, 14], [1, 14], [2, 12], [2, 12], [3, 10], [4, 8], [5, 6], [6, 4]];
      rows.forEach(([x, w], y) => px(x, y, "white", Math.min(w, 16 - x), 1));
      px(3, 1, "white", 1, 2); // licks of flame off the top
      px(12, 2, "white", 1, 2);
    })));
    for (const pl of this.g.players) {
      const aura = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: flame, transparent: true, opacity: 0.75, depthWrite: false })));
      aura.center.set(0.5, 0.05);
      aura.visible = false;
      this.auras.push(aura);
      s.add(aura);
      const sprite = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ alphaTest: 0.5 })));
      sprite.center.set(0.5, 0);
      this.bodies.push(sprite);
      this.dress(pl.i);
      s.add(sprite);
      const sh = new THREE.Mesh(shadowGeo, shadowMat);
      sh.rotation.x = -Math.PI / 2;
      this.shadows.push(sh);
      s.add(sh);
      const tr = new THREE.Mesh(teamGeo, teamMat[pl.side]);
      tr.rotation.x = -Math.PI / 2;
      tr.visible = this.g.size > 1 && pl.side === 0; // your team only: the CPU's just have shadows
      this.teamRings.push(tr);
      s.add(tr);
    }
    this.ring = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.55, 0.68, 14)), this.keep(basic("gold", { depthWrite: false })));
    this.ring.rotation.x = -Math.PI / 2;
    s.add(this.ring);
    // one-character mode, on defence: a red ring under the man you guard
    this.manRing = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.4, 0.6, 16)), this.keep(basic("red", { depthWrite: false })));
    this.manRing.rotation.x = -Math.PI / 2;
    this.manRing.visible = false;
    s.add(this.manRing);
    this.burst = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.5, 0.75, 20)), this.keep(basic("gold", { transparent: true, depthWrite: false })));
    this.burst.rotation.x = -Math.PI / 2;
    this.burst.visible = false;
    s.add(this.burst);
    // replay props: afterimages, an impact shockwave, dust puffs
    for (let k = 0; k < 2; k++) {
      const gh = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ transparent: true, opacity: 0.3 - k * 0.14, depthWrite: false })));
      gh.center.set(0.5, 0);
      gh.visible = false;
      this.ghosts.push(gh);
      s.add(gh);
    }
    this.ballFire = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: flame, transparent: true, depthWrite: false, color: col("orange") })));
    this.ballFire.center.set(0.5, 0.25);
    this.ballFire.visible = false;
    s.add(this.ballFire);
    for (let k = 0; k < 8; k++) {
      const sp = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: flame, transparent: true, depthWrite: false, color: col(k % 2 ? "amber" : "red") })));
      sp.visible = false;
      this.trail.push({ sprite: sp, x: 0, y: 0, z: 0, t: -1e9 });
      s.add(sp);
    }
    this.impact = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.35, 0.55, 20)), this.keep(basic("white", { transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    this.impact.rotation.x = -Math.PI / 2;
    this.impact.visible = false;
    s.add(this.impact);
    const puff = this.keep(pixelTexture(paint(4, 4, (px) => (px(1, 0, "cream", 2, 4), px(0, 1, "cream", 4, 2)))));
    for (let k = 0; k < 8; k++) {
      const d = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, color: col("tan") })));
      d.visible = false;
      this.dust.push(d);
      s.add(d);
    }

    const ballTex = this.keep(pixelTexture(paint(7, 7, (px) => {
      px(2, 0, "orange", 3, 1);
      px(1, 1, "orange", 5, 5);
      px(0, 2, "orange", 7, 3);
      px(2, 6, "orange", 3, 1);
      px(3, 0, "brown", 1, 7);
      px(0, 3, "brown", 7, 1);
      px(2, 1, "amber", 1, 1);
    })));
    this.ball = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: ballTex, alphaTest: 0.5 })));
    this.ball.scale.set(0.45, 0.45, 1);
    s.add(this.ball);
    this.ballShadow = new THREE.Mesh(this.keep(new THREE.CircleGeometry(0.2, 8)), this.keep(basic("black", { transparent: true, opacity: 0.4, depthWrite: false })));
    this.ballShadow.rotation.x = -Math.PI / 2;
    s.add(this.ballShadow);
  }

  /** Put the right Pokémon on player i's sprite (at the start, and whenever a sub comes in). Each sprite keeps its
   *  own texture per Pokémon, since flipping it to face the other way changes the texture's settings. */
  private dress(i: number) {
    const p = this.g.players[i].p, key = `${i}:${p.id}`;
    let tex = this.textures.get(key);
    if (!tex) {
      tex = this.keep(this.loader.load(p.sprite));
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(key, tex);
    }
    const sprite = this.bodies[i], k = p.spriteH < 24 ? 2 : 1;
    (sprite.material as THREE.SpriteMaterial).map = tex;
    (sprite.material as THREE.SpriteMaterial).needsUpdate = true;
    sprite.scale.set((p.spriteW * k) / SPRITE_PX, (p.spriteH * k) / SPRITE_PX, 1);
    this.baseScale[i] = [sprite.scale.x, sprite.scale.y];
    this.dressed[i] = p.id;
  }

  /** Little pixel fans dotted through the stands. They bob in their seats and throw their arms up, and go wild for a
   *  few seconds after a big play (see `hype`). */
  private makeFans(
    stands: { ox: number; oz: number; edge: number; width: number; fans: number }[],
    standAt: (ox: number, oz: number, edge: number, across: number, v: number) => THREE.Vector3,
    shade: (v: number) => number,
  ) {
    const shirts: PaletteName[] = ["red", "blue", "gold", "green", "purple", "orange", "white", "sky", "magenta", "lime", this.d.youColor, this.d.cpuColor];
    const skins: PaletteName[] = ["cream", "tan", "wood", "brown"];
    const hairs: PaletteName[] = ["black", "brown", "amber", "maroon"];
    // each look in two poses: arms down, arms up (8×12 pixels)
    const looks = shirts.map((shirt, i) => {
      const skin = skins[i % skins.length], hair = hairs[(i * 3) % hairs.length];
      return [false, true].map((up) =>
        this.keep(pixelTexture(paint(8, 12, (px) => {
          px(3, 1, skin, 2, 2);
          px(3, 0, hair, 2, 1);
          px(2, 3, shirt, 4, 5);
          px(2, 8, "navy", 4, 2);
          if (up) {
            px(1, 0, skin, 1, 1);
            px(1, 1, shirt, 1, 3);
            px(6, 0, skin, 1, 1);
            px(6, 1, shirt, 1, 3);
          } else {
            px(1, 4, shirt, 1, 3);
            px(6, 4, shirt, 1, 3);
          }
        }))),
      );
    });
    // a fixed scatter (the same crowd every game), not Math.random
    const hash = (n: number) => {
      const x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    let n = 0;
    for (const st of stands)
      for (let i = 0; i < st.fans; i++, n++) {
        const v = 0.04 + hash(n + 1) * 0.92, u = hash(n + 101) - 0.5;
        const look = looks[Math.floor(hash(n + 201) * looks.length)];
        const mat = this.keep(new THREE.SpriteMaterial({ map: look[0], alphaTest: 0.5, color: new THREE.Color().setScalar(shade(v)) }));
        const fan = new THREE.Sprite(mat);
        fan.center.set(0.5, 0);
        fan.scale.set(0.8, 1.2, 1);
        const base = standAt(st.ox, st.oz, st.edge, u * (st.width - 2), v);
        fan.position.copy(base);
        this.scene.add(fan);
        this.fans.push({ sprite: fan, mat, look, base: base.y, phase: hash(n + 301) * Math.PI * 2, rate: 4 + hash(n + 401) * 4, seat: hash(n + 501) });
      }

    // the filler crowd: hundreds of even simpler fans (a head on a shirt, no arms) that only bob. They're one
    // batch of points, so they cost about as much to draw as a single sprite.
    const shape = this.keep(pixelTexture(paint(6, 6, (px) => {
      // points are square, so the figure sits in a square: a head on a shirt
      px(2, 0, "white", 2, 2);
      px(1, 2, "white", 4, 4);
    })));
    const total = stands.reduce((s, st) => s + st.fans * SIMPLE_PER_FAN, 0);
    const pos = new Float32Array(total * 3), colors = new Float32Array(total * 3);
    const f = this.filler;
    f.base = new Float32Array(total);
    f.phase = new Float32Array(total);
    f.seat = new Float32Array(total);
    const skinOrShirt: PaletteName[] = [...shirts, "cream", "tan", "slate", "steel", "fog"];
    let k = 0;
    for (const st of stands)
      for (let i = 0; i < st.fans * SIMPLE_PER_FAN; i++, k++, n++) {
        const v = 0.03 + hash(n + 1) * 0.94, u = hash(n + 101) - 0.5;
        const p = standAt(st.ox, st.oz, st.edge, u * (st.width - 1), v);
        pos.set([p.x, p.y + 0.35, p.z], k * 3);
        f.base[k] = p.y + 0.35;
        f.phase[k] = hash(n + 301) * Math.PI * 2;
        f.seat[k] = hash(n + 501);
        const c = col(skinOrShirt[Math.floor(hash(n + 201) * skinOrShirt.length)]).multiplyScalar(shade(v));
        colors.set([c.r, c.g, c.b], k * 3);
      }
    const geo = this.keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    f.points = new THREE.Points(geo, this.keep(new THREE.PointsMaterial({ size: 0.7, map: shape, vertexColors: true, alphaTest: 0.5 })));
    this.scene.add(f.points);
    this.setCrowd(this.crowd);
  }

  /** How full the arena is: 0 empty – 1 packed. Can change mid-game (e.g. a bigger crowd for a big game). */
  setCrowd(level: number) {
    this.crowd = Math.max(0, Math.min(1, level));
    for (const fan of this.fans) fan.sprite.visible = fan.seat < this.crowd;
  }

  /** Make the crowd jump: 1 = going wild, fading over a few seconds. */
  private cheer() {
    this.hype = 1;
  }

  private animateFans(t: number, dt: number) {
    this.hype = Math.max(0, this.hype - dt * 0.35);
    const h = this.hype;
    for (const f of this.fans) {
      const bounce = Math.max(0, Math.sin(t * f.rate + f.phase));
      f.sprite.position.y = f.base + bounce * (0.04 + h * 0.3);
      const up = Math.sin(t * (1.5 + f.rate * 0.3) + f.phase * 3) > 0.8 - h * 1.6; // a few always, everyone when hyped
      f.mat.map = f.look[up ? 1 : 0];
    }
    // the filler crowd bobs too; empty seats are parked under the floor
    const { points, base, phase, seat } = this.filler;
    if (!points) return;
    const pos = points.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < base.length; i++)
      pos.setY(i, seat[i] < this.crowd ? base[i] + Math.max(0, Math.sin(t * 6 + phase[i])) * (0.03 + h * 0.25) : -50);
    pos.needsUpdate = true;
  }

  /** A hoop: pole behind the baseline, arm, glass backboard, rim and net. end 1 is the one you attack. */
  private hoop(end: 0 | 1) {
    const hy = end === 1 ? L - COURT.hoopIn : COURT.hoopIn;
    const out = end === 1 ? 1 : -1; // toward that baseline, up the court
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(this.keep(new THREE.BoxGeometry(w, h, d)), m);
      b.position.copy(at(W / 2 + x, y, z));
      this.scene.add(b);
      return b;
    };
    // your own hoop sits between the camera and the play, so it's see-through
    const fade: THREE.MeshBasicMaterialParameters = end === 0 ? { transparent: true, opacity: 0.3, depthWrite: false } : {};
    const steel = this.keep(basic("steel")), white = this.keep(basic("white", fade)), red = this.keep(basic("red", fade));
    const glass = this.keep(basic("ice", { transparent: true, opacity: end === 0 ? 0.1 : 0.25, depthWrite: false }));
    const boardY = hy + out * 0.375;
    // your own hoop's pole would stand between the camera and the play: it only shows in replays
    const support = [
      box(0.2, 3.6, 0.2, steel, 0, hy + out * 2.6, 1.8), // pole
      box(0.5, 0.25, 0.5, this.keep(basic("black")), 0, hy + out * 2.6, 0.12), // pad at the base
      box(0.1, 0.1, 2.2, steel, 0, hy + out * 1.5, 3.45), // arm out to the board
    ];
    if (end === 0) for (const m of support) (m.visible = false), this.nearOnly.push(m);
    box(1.83, 1.07, 0.04, glass, 0, boardY, 3.435); // glass board
    for (const [w, h, x, z] of [[1.83, 0.05, 0, 3.95], [1.83, 0.05, 0, 2.92], [0.05, 1.07, -0.9, 3.435], [0.05, 1.07, 0.9, 3.435]] as const)
      box(w, h, 0.05, white, x, boardY, z);
    for (const [w, h, x, z] of [[0.59, 0.04, 0, 3.45], [0.04, 0.45, -0.28, 3.25], [0.04, 0.45, 0.28, 3.25]] as const)
      box(w, h, 0.05, red, x, boardY - out * 0.01, z); // the shooter's square
    const rimMat = this.keep(basic("orange", fade));
    if (end === 0) this.nearFade.push({ m: white, o: 0.3, on: 1 }, { m: red, o: 0.3, on: 1 }, { m: rimMat, o: 0.3, on: 1 }, { m: glass, o: 0.1, on: 0.25 });
    const rim = new THREE.Mesh(this.keep(new THREE.TorusGeometry(0.23, 0.025, 4, 14)), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(at(W / 2, hy, COURT.rimZ));
    this.scene.add(rim);
    const netMat = this.keep(basic("white", { wireframe: true, ...fade }));
    if (end === 0) this.nearFade.push({ m: netMat, o: 0.3, on: 1 });
    const net = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.23, 0.15, 0.42, 8, 2, true)), netMat);
    net.position.copy(at(W / 2, hy, COURT.rimZ - 0.21));
    this.scene.add(net);
    this.rims[end] = rim;
    this.nets[end] = net;

    // a red glow round the board, lit when the shot clock runs out on this end
    const glow = this.keep(basic("red", { transparent: true, opacity: 0, depthWrite: false }));
    box(2.15, 1.4, 0.02, glow, 0, boardY + out * 0.03, 3.435);
    // the shot clock on top of the board: a little pixel display (a sprite, so it reads the right way round)
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 12;
    const tex = this.keep(pixelTexture(canvas));
    // (your own end's is near the camera, so it's smaller and fainter: it mustn't hide the play)
    const clock = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: end === 0 ? 0.45 : 1 })));
    clock.scale.set(end === 0 ? 0.5 : 0.9, end === 0 ? 0.25 : 0.45, 1);
    clock.position.copy(at(W / 2, boardY, 4.35));
    this.scene.add(clock);
    this.hoopFx[end] = { frame: white, glow, clock, ctx: canvas.getContext("2d")!, tex, shown: -1 };
  }

  /** The hoops' shot clocks (redrawn when the number changes) and the red glow after a violation. */
  private drawHoopFx(now: number) {
    const g = this.g, n = Math.max(0, Math.ceil(g.shotClock));
    for (const end of [0, 1] as const) {
      const fx = this.hoopFx[end];
      if (!fx) continue;
      fx.clock.visible = !g.practice && end === 1; // only the far hoop's: the one at your end is gone (the user's call)
      if (fx.shown !== n) {
        fx.shown = n;
        const c = fx.ctx;
        c.fillStyle = PALETTE.black;
        c.fillRect(0, 0, 24, 12);
        c.fillStyle = PALETTE[n <= 5 ? "red" : "amber"];
        c.font = `8px ${FONT}`;
        c.textAlign = "center";
        c.textBaseline = "top";
        c.fillText(String(n).padStart(2, "0"), 12, 2);
        fx.tex.needsUpdate = true;
      }
      const lit = now < this.glowUntil[end];
      fx.frame.color.copy(col(lit ? "red" : "white"));
      fx.glow.opacity = lit ? 0.45 + 0.3 * Math.sin(now / 60) : 0;
    }
  }

  // ── the loop ──────────────────────────────────────────────────────────────
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    if (this.paused) return;
    this.vt += dt * (this.menu ? LIVE.menuSlow : 1);
    if (this.d.attract) {
      if (this.replay) this.runReplay(dt, now);
      else this.attractSearch();
      if (this.replay) this.draw(dt, now); // between clips the last picture stays up
      return;
    }
    if (this.replay) {
      // a replay: the game waits while the clip plays
      this.runReplay(dt, now);
      this.tapped.clear();
      this.sprintTapped = false;
      this.doubleTapped = false;
      this.draw(dt, now);
      return;
    }

    if (!this.started) {
      if (this.tapped.has("Enter") || this.tapped.has("Space")) {
        this.started = true;
        this.holdFromStart = true; // the key that tipped off isn't a shot
        blip(990, 90);
        this.music.start();
      }
    } else if (!this.ended) {
      this.menuKeys();
      if (this.holdFromStart && !this.act("shoot")) this.holdFromStart = false;
      const steering = this.g.players[this.g.control], tankBefore = steering.turbo;
      // 1–5 pass straight to that spot in your lineup (your players come first in g.players)
      const digit = [1, 2, 3, 4, 5].find((n) => this.tapped.has(`Digit${n}`));
      const mine: Input = this.menu ? { ...NO_INPUT } : { // the menu has the keys while it's open
        x: (this.act("right") ? 1 : 0) - (this.act("left") ? 1 : 0),
        y: (this.act("up") ? 1 : 0) - (this.act("down") ? 1 : 0),
        turbo: this.act("turbo"),
        shoot: this.act("shoot") && !this.holdFromStart,
        steal: this.tap("pass"),
        // L, or a quick tap of sprint with the ball (on defence a sprint tap does nothing: L there is the steal)
        cross: this.tap("cross") || (this.sprintTapped && handlerOf(this.g) === steering),
        passTo: digit != null && digit <= this.g.size ? digit - 1 : null,
        screen: false,
      };
      this.acc += dt * (this.menu ? LIVE.menuSlow : 1) * (this.cine ? replaySpeed(this.cine.clip, this.g.time) : 1); // slower in the menu, and at a live slam
      let first = true;
      const frameEvents: GameEvent[] = this.extraEvents.splice(0); // anything from between steps (a menu call)
      // in the tutorial the CPU stands still (and has no coach) except in the defence step
      const cpuIdle = this.tutor != null && !this.tutor.cpuPlays;
      while (this.acc >= DT) {
        this.acc -= DT;
        const yours = first ? mine : { ...mine, steal: false, cross: false, passTo: null }; // a tap counts once
        const g = this.g;
        step(g, g.players.map((p) => (p.i === g.control ? yours : cpuIdle && p.side === 1 ? NO_INPUT : this.brains[p.i]?.(g, DT) ?? NO_INPUT)), DT);
        if (!this.tutor) this.coach(g); // after the step, so its calls land in this step's events
        if (!this.tutor) {
          // film it, and watch for big plays to replay
          this.rec.push(g);
          for (const e of g.events) {
            const clip = this.spotter.spot(e, g);
            if (clip) this.pendingClips.push(clip);
          }
        }
        first = false;
        for (const e of g.events) this.onEvent(e, now);
        if (!this.tutor) this.watchForCine(now);
        frameEvents.push(...g.events);
        if (g.over) break;
      }
      if (!this.tutor) this.checkClips();
      this.countdown();
      if (steering.turbo < tankBefore) this.staminaUntil = now + 1000; // turbo in use: show the bar
      const lesson = this.tutor?.update(dt * (this.menu ? LIVE.menuSlow : 1), frameEvents);
      if (lesson === "next") {
        [659, 880, 1175].forEach((f, k) => setTimeout(() => blip(f, 60, 0.05), k * 60));
        this.popups.push({ text: "NICE!", color: "lime", until: now + 1100, big: true });
      } else if (lesson === "done") {
        this.ended = true;
        this.music.stop();
        this.d.onOver([...this.g.score] as [number, number], null);
      }
      if (this.g.over) {
        // it all stops dead; a beat later the losers fall over and the winners hop about (womp womp, or a fanfare);
        // then the menu or results
        this.ended = true;
        this.endAt = now;
        this.music.stop();
        const lost = this.g.winner === 1;
        setTimeout(() => (lost ? womp() : fanfare()), ENDING.react);
        setTimeout(() => this.finishGame(), ENDING.menu); // the top plays reel, then the results
      }
    }
    if (this.tap("music")) {
      const on = this.music.toggle();
      this.popups.push({ text: on ? "MUSIC ON" : "MUSIC OFF", color: "cloud", until: now + 800, big: true });
    }
    this.tapped.clear();
    this.sprintTapped = false;
    this.doubleTapped = false;
    this.draw(dt, now);
  };

  /** Q opens your play menu (with the ball) or defence menu (without); arrows or W/S move, Enter/Space/K or a
   *  number picks, Q closes. Losing the ball closes the play menu. */
  private menuKeys() {
    const g = this.g, tap = (...codes: string[]) => codes.some((c) => this.tapped.has(c));
    if (g.size === 1) return; // no plays in a 1v1
    const f = g.ball.flight;
    const ours = handlerOf(g)?.side === 0 || (f?.kind === "pass" && g.players[f.by].side === 0);
    const options: (PlayName | SchemeName | null)[] = this.menu?.kind === "scheme" || (!this.menu && !ours) ? [...SCHEMES] : [...PLAYS, null];
    // one-character mode: a play call opens by itself at the start of each of your possessions
    const fresh = g.solo && ours && g.poss === 0 && this.lastPoss !== 0;
    this.lastPoss = ours ? 0 : 1;
    if (fresh && !this.menu) {
      if (g.period !== this.menuPeriod) {
        this.menuPeriod = g.period;
        this.menu = { kind: "play", cursor: Math.max(0, options.indexOf(g.calls[0].play)) };
        blip(660, 35);
        return;
      }
      this.sideUntil = performance.now() + LIVE.sidePlays * 1000; // the rest: a list at the side, no slow-down
    }
    // one-character mode with the ball: Q steps through the plays on the side list, called at once
    if (g.solo && ours && !this.menu && this.tap("plays")) {
      const list = [...PLAYS, null], next = list[(list.indexOf(g.calls[0].play) + 1) % list.length];
      const before = g.events.length;
      callPlay(g, 0, next);
      const evs = g.events.slice(before);
      for (const e of evs) this.onEvent(e, performance.now());
      this.extraEvents.push(...evs);
      this.sideUntil = performance.now() + LIVE.sidePlays * 1000;
      blip(880, 40);
      return;
    }
    if (this.tap("plays")) {
      if (this.menu) {
        this.menu = null;
        blip(330, 50);
      } else {
        const kind = ours ? "play" : "scheme";
        const current = kind === "play" ? g.calls[0].play : g.calls[0].scheme;
        this.menu = { kind, cursor: Math.max(0, options.indexOf(current)) };
        blip(660, 35);
      }
      return;
    }
    const m = this.menu;
    if (!m) return;
    if (m.kind === "play" && !ours && g.dead <= 0) return void (this.menu = null); // they've got it now
    if (this.tap("up")) (m.cursor = (m.cursor + options.length - 1) % options.length), blip(660, 30);
    if (this.tap("down")) (m.cursor = (m.cursor + 1) % options.length), blip(660, 30);
    const digit = [1, 2, 3, 4, 5].find((n) => tap(`Digit${n}`) && n <= options.length);
    if (digit) m.cursor = digit - 1;
    if (digit || tap("Enter") || this.tap("shoot")) {
      const pick = options[m.cursor], before = g.events.length;
      if (m.kind === "play") callPlay(g, 0, pick as PlayName | null);
      else callScheme(g, 0, pick as SchemeName);
      // the call happened between game steps, and the next step clears events: handle it now (banner, lesson)
      const fresh = g.events.slice(before);
      for (const e of fresh) this.onEvent(e, performance.now());
      this.extraEvents.push(...fresh);
      this.menu = null;
      this.holdFromStart = true; // the key that picked isn't a shot
      blip(990, 70);
    }
  }

  private onEvent(e: GameEvent, now: number) {
    const mine = e.side === 0;
    const pop = (text: string, ms = 900) => {
      this.popups.push({ text, color: mine ? "gold" : "red", until: now + ms, big: true });
      this.cheer(); // every big-text moment gets the crowd up
    };
    if (e.kind === "release" && e.text === "DUNK") this.cheer();
    switch (e.kind) {
      case "make":
        blip(e.text === "THREE!" ? 1568 : 1320, 110);
        pop(e.text);
        if (e.text === "THREE!") this.impactAt = { x: W / 2, y: e.side === 0 ? L - COURT.hoopIn : COURT.hoopIn, z: COURT.rimZ, t: now }; // a ring off the net
        break;
      case "miss":
        blip(196, 110);
        if (e.text === "AIR BALL!") this.popups.push({ text: e.text, color: "cloud", until: now + 900, big: true });
        break;
      case "block":
        blip(140, 180, 0.07);
        this.shake = 0.25;
        pop(e.text);
        this.impactAt = { x: this.g.ball.x, y: this.g.ball.y, z: this.g.ball.z, t: now }; // a shockwave off the swat
        break;
      case "steal": {
        blip(1046, 90);
        pop(e.text);
        const thief = e.who != null ? this.g.players[e.who] : null;
        if (thief) this.dustAt = { x: thief.x, y: thief.y, t: now }; // a puff where they ripped it
        break;
      }
      case "ankles":
        blip(1175, 80);
        pop(e.text);
        break;
      case "move": // a step-back: a little call over the ball handler
        blip(784, 40, 0.04);
        this.popups.push({ text: e.text, color: e.text === "DOUBLE JUMP" ? "sky" : "cloud", until: now + 700, who: e.who, big: false });
        break;
      case "release": {
        if (e.text === "PERFECT") blip(1760, 50);
        if (e.text === "DUNK") this.shake = 0.3;
        if (!mine && e.text !== "DUNK" && e.text !== "LAYUP") break;
        const color: PaletteName = e.text === "PERFECT" ? "lime" : ["GOOD", "DUNK", "LAYUP"].includes(e.text) ? "gold" : e.text === "QUICK" ? "cloud" : "red";
        this.popups.push({ text: e.text, color, until: now + 700, who: this.g.ball.flight?.by, big: false }); // over the shooter
        break;
      }
      case "rebound":
        blip(523, 40);
        break;
      case "whiff":
        blip(262, 40);
        break;
      case "pass": {
        blip(880, 20, 0.03);
        // your pass: the teammate it's going to flashes white once, as it leaves your hands
        const to = this.g.ball.flight?.to;
        if (mine && to != null && !this.g.solo) (this.whiteWho = to), (this.whiteUntil = now + 140);
        break;
      }
      case "screen":
        blip(300, 40, 0.04);
        this.popups.push({ text: "SCREEN!", color: mine ? "gold" : "red", until: now + 600, who: undefined, big: false, banner: true });
        break;
      case "fire":
        // a rising arpeggio, a shake, the crowd on its feet
        [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => blip(f, 70, 0.06), k * 70));
        this.shake = 0.3;
        pop(e.text, 1500);
        break;
      case "period":
        if (e.text === "BUZZER") blip(98, 500, 0.08);
        else this.popups.push({ text: e.text, color: "white", until: now + 2000, big: true });
        break;
      case "sub":
        blip(523, 30, 0.03);
        this.popups.push({ text: `${mine ? "" : "CPU: "}${e.text}`, color: mine ? "gold" : "red", until: now + 1600, big: false, banner: true });
        break;
      case "call":
        // a banner under the score: what each bench just called
        this.popups.push({ text: mine ? `YOU: ${e.text}` : `CPU: ${e.text}`, color: mine ? "gold" : "red", until: now + 1800, big: false, banner: true });
        break;
      case "violation":
        // the buzzer (two low blasts), and the hoop they were attacking glows red
        blip(110, 350, 0.08);
        setTimeout(() => blip(98, 450, 0.08), 380);
        this.glowUntil[e.side === 0 ? 1 : 0] = now + 1600;
        this.popups.push({ text: e.text, color: "red", until: now + 1100, big: true });
        break;
      case "over":
        pop(e.text, 3000);
        break;
    }
  }

  // ── drawing the state ───────────────────────────────────────────────────────
  private draw(dt: number, now: number) {
    const g = this.g, t = this.vt;
    if (g.control !== this.lastControl) {
      if (this.lastControl >= 0) this.flashUntil = now + SWITCH_FLASH; // you switched: flash who you have now
      this.lastControl = g.control;
    }
    // the flash: a gold shockwave rings out from under the new player
    const flashLeft = this.flashUntil - now, flashOn = flashLeft > 0;
    const wave = flashOn ? 1 - flashLeft / SWITCH_FLASH : 1;
    this.burst.visible = flashOn && !this.cinematic;
    if (flashOn) {
      this.burst.scale.setScalar(1 + wave * 5);
      (this.burst.material as THREE.MeshBasicMaterial).opacity = 1 - wave;
    }
    // who J would pass to right now (the teammate you're pushing toward or facing), when you have the ball
    const you0 = g.players[g.control];
    const sx = (this.act("right") ? 1 : 0) - (this.act("left") ? 1 : 0), sy = (this.act("up") ? 1 : 0) - (this.act("down") ? 1 : 0);
    const sl = Math.hypot(sx, sy) || 1;
    const passTarget = (this.passTarget = handlerOf(g) === you0 && g.size > 1 ? facedTeammate(g, you0, sx / sl, sy / sl)?.i ?? -1 : -1);
    g.players.forEach((pl, i) => {
      if (this.dressed[i] !== pl.p.id) this.dress(i); // a sub came in
      if (pl.vx > 0.3) this.facing[i] = true;
      else if (pl.vx < -0.3) this.facing[i] = false;
      const body = this.bodies[i], map = (body.material as THREE.SpriteMaterial).map!;
      // sprites face left; flip to face right
      map.repeat.x = this.facing[i] ? -1 : 1;
      map.offset.x = this.facing[i] ? 1 : 0;
      const moving = pl.z === 0 && Math.hypot(pl.vx, pl.vy) > 0.8;
      // the game-over moment: after a beat, the losers tip over onto their sides and the winners hop for joy
      let hop = moving && Math.floor(t * 8) % 2 ? 0.05 : 0;
      const since = this.ended && g.over && !this.tutor && !this.replay ? now - this.endAt - ENDING.react : -1;
      const mat = body.material as THREE.SpriteMaterial;
      mat.rotation = 0;
      let lift = 0;
      if (since >= 0) {
        if (pl.side === g.winner) hop = Math.abs(Math.sin((since / 1000) * 7 + i)) * 0.7;
        else {
          mat.rotation = (this.facing[i] ? -1 : 1) * (Math.PI / 2) * Math.min(1, since / ENDING.fall);
          // tipping over round its feet would sink half of it into the floor: lift it to lie on top
          lift = (body.scale.x / 2) * Math.abs(Math.sin(mat.rotation));
        }
      }
      const [bsx, bsy] = this.baseScale[i] ?? [body.scale.x, body.scale.y];
      body.scale.set(bsx, bsy, 1);
      if (this.cinematic) lift += this.replayPose(i, pl, body, mat);
      // fallen players draw on a layer above the court, so nothing of them disappears into the floor
      const fallen = mat.rotation !== 0;
      mat.depthTest = !fallen;
      body.renderOrder = fallen ? 10 : 0;
      body.position.copy(at(pl.x, pl.y, pl.z + 0.01 + hop + lift));
      this.fadeIfInTheWay(i, body, mat);
      const tint = (body.material as THREE.SpriteMaterial).color;
      if (i === this.whiteWho && now < this.whiteUntil) tint.setScalar(8); // way past white: a white silhouette
      else tint.copy(pl.act === "stumble" ? col("fog") : new THREE.Color(0xffffff));
      this.shadows[i].position.copy(at(pl.x, pl.y, 0.02));
      this.teamRings[i].position.copy(at(pl.x, pl.y, 0.025));
      if (pl.side === 0) this.teamRings[i].material = pl.i === passTarget ? this.ringMats!.target : this.ringMats!.mate;
      // the pass target's ring is bigger and pulses
      this.teamRings[i].scale.setScalar(pl.i === passTarget ? 1.35 + 0.15 * (Math.floor(now / 150) % 2) : 1);
      this.teamRings[i].visible = !this.cinematic && g.size > 1 && pl.side === 0; // replays are clean pictures
      // ON FIRE: the flame sits just behind (further from the camera), flickering in pixel steps
      const aura = this.auras[i];
      aura.visible = pl.onFire;
      if (pl.onFire) {
        const flick = 1 + (Math.floor(t * 12 + i) % 3) * 0.06;
        aura.position.copy(at(pl.x, pl.y + 0.1, pl.z));
        aura.scale.set(body.scale.x * 1.5 * flick, body.scale.y * 1.35 * flick, 1);
        (aura.material as THREE.SpriteMaterial).color.set(typeColor(pl.p.types[0]));
      }
    });
    const you = g.players[g.control];
    this.ring.position.copy(at(you.x, you.y, 0.03));
    this.ring.scale.setScalar(flashOn ? 1.6 : 1); // the gold ring pops too
    this.ring.visible = !this.cinematic;
    this.burst.position.copy(at(you.x, you.y, 0.035));
    const theirBall = g.poss === 1 || g.players[g.ball.holder ?? 0]?.side === 1;
    const man = g.solo && theirBall ? g.players.find((q) => q.side === 1 && q.slot === you.slot) : undefined;
    this.manRing.visible = !!man && !this.cinematic;
    if (man) this.manRing.position.copy(at(man.x, man.y, 0.03));

    // the ball: dribbled at the side, held up to shoot, or flying
    const b = g.ball;
    let bx = b.x, bz = b.z;
    if (b.holder != null && !b.flight) {
      const h = g.players[b.holder];
      if (h.act === "wind") bz = handZ(h) + 0.1;
      else if (h.act !== "dunk") {
        bx = h.x + (this.facing[b.holder] ? 0.45 : -0.45);
        bz = 0.15 + Math.abs(Math.sin(t * 9)) * 0.85;
      }
    }
    this.ball.position.copy(at(bx, b.y, bz + 0.22));
    this.drawBallFire(bx, b.y, bz + 0.22, now);
    this.ballShadow.position.copy(at(bx, b.y, 0.025));

    this.drawReplayFx(now);
    this.animateFans(t, dt);
    this.drawHoopFx(now);
    if (this.replay) this.cinemaCamera(dt, this.replay.clip, this.replay.t, frameAt(this.replay.clip.frames, this.replay.t), this.replay);
    else if (this.cine) this.cinemaCamera(dt, this.cine.clip, this.g.time, snap(this.g), this.cine);
    else this.moveCamera(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.d.attract) this.hud.clearRect(0, 0, VIEW_W, VIEW_H); // the title screen draws its own
    else if (this.replay) this.drawReplayHud(now);
    else if (this.cine) this.drawCineHud();
    else this.drawHud(now);
  }

  // ── replays (replay.ts has the recording, the spotting and the camera scripts) ─────────────────────────────
  /** Clips that have finished filming join the top plays; the biggest gets an instant replay at the next stoppage. */
  private checkClips() {
    const g = this.g;
    for (const c of [...this.pendingClips]) {
      if (g.time < c.end && !g.over) continue;
      this.pendingClips.splice(this.pendingClips.indexOf(c), 1);
      c.frames = this.rec.between(c.start, Math.min(c.end, g.time));
      if (c.frames.length < 20) continue;
      this.topClips.push(c);
      this.topClips.sort((a, b) => b.hype - a.hype || b.start - a.start);
      this.topClips.length = Math.min(this.topClips.length, 5);
      const shownLive = Math.abs(c.keys[c.keys.length - 1] - this.cineKey) < 1; // already seen it live
      if (LIVE.replays >= 1 && !shownLive && c.hype >= LIVE.replayMin && (!this.waitingClip || c.hype > this.waitingClip.hype)) this.waitingClip = c;
    }
    const w = this.waitingClip;
    if (!w || g.over) return;
    if (g.time - w.end > 8) return void (this.waitingClip = null); // too long ago now
    // made baskets are at a stoppage already; live-ball plays (ankles, blocks) wait for the next one
    const stoppage = g.dead > 0 || w.kind === "dunk" || w.kind === "stepback" || w.kind === "shot";
    if (!stoppage || g.time - this.lastReplayAt < LIVE.replayGap) return;
    this.waitingClip = null;
    this.lastReplayAt = g.time;
    this.startReplay(w, "REPLAY", false);
  }

  private startReplay(clip: Clip, label: string, reel: boolean) {
    this.replay = { clip, t: clip.frames[0].t, hold: 0, cut: -1, hit: 0, label, saved: snap(this.g), reel, began: performance.now() };
    this.setReplayLook(true);
    if (!this.d.attract) swoosh();
  }

  /** Attract mode: play the CPU game on, unseen (a few seconds of game a frame), until a big play has been filmed,
   *  then show it. When a game ends, a new one tips off. */
  private attractSearch() {
    let g = this.g;
    for (let k = 0; k < 300 && !this.replay; k++) {
      if (g.over) {
        g = this.g = lineupGame(this.d.home, this.d.away, this.d.dex, this.d.size, (this.d.seed = (this.d.seed * 31 + 7) >>> 0));
        this.rec = new Recorder(6);
        this.spotter = new ClipSpotter();
        this.pendingClips = [];
      }
      step(g, g.players.map((p) => this.brains[p.i](g, DT)), DT);
      this.coach(g);
      this.rec.push(g);
      for (const e of g.events) {
        const clip = this.spotter.spot(e, g);
        if (clip) this.pendingClips.push(clip);
      }
      const done = this.pendingClips.find((c) => g.time >= c.end || g.over);
      if (!done) continue;
      this.pendingClips = this.pendingClips.filter((c) => c !== done);
      done.frames = this.rec.between(done.start, Math.min(done.end, g.time));
      if (done.frames.length >= 20) this.startReplay(done, "", false);
    }
  }

  private endReplay() {
    const r = this.replay!;
    this.applySnap(r.saved); // back to the real game, exactly where it stopped
    this.replay = null;
    this.setReplayLook(false);
    if (!r.reel) return;
    const next = this.reel.shift();
    if (next) this.startReplay(next, `TOP PLAYS #${this.reel.length + 1}`, true);
    else this.overNow();
  }

  /** After the final buzzer's celebration: the top plays reel (#3 up to #1), then the results. */
  private finishGame() {
    if (this.gone) return;
    const top = this.topClips.slice(0, LIVE.topPlays);
    if (!top.length || this.tutor) return this.overNow();
    this.reel = [...top].reverse();
    const first = this.reel.shift()!;
    this.startReplay(first, `TOP PLAYS #${this.reel.length + 1}`, true);
  }

  private overNow() {
    this.d.onOver([...this.g.score] as [number, number], this.g.timed ? liveResult(this.g) : null);
  }

  /** Put the players and ball where a snapshot has them (the game itself is paused). */
  private applySnap(s: Snap) {
    const g = this.g;
    s.players.forEach((q, i) => Object.assign(g.players[i], { x: q.x, y: q.y, z: q.z, vx: q.vx, vy: q.vy, act: q.act, onFire: q.onFire, p: q.p }));
    Object.assign(g.ball, { x: s.ball.x, y: s.ball.y, z: s.ball.z, holder: s.ball.holder, flight: s.ball.flight });
  }

  /** Replay angles see your own end: give it its stands and a solid hoop with its pole. */
  private setReplayLook(on: boolean) {
    for (const o of this.nearOnly) o.visible = on;
    for (const f of this.nearFade) f.m.opacity = on ? f.on : f.o;
    for (const gh of this.ghosts) gh.visible = false;
    if (!on) {
      this.camera.fov = 52;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Move the replay on (slow motion round the key moments), set the scene to that moment, fire the effects. */
  private runReplay(dt: number, now: number) {
    const r = this.replay!, c = r.clip, last = c.frames[c.frames.length - 1].t;
    if (this.tapped.size && now - r.began > 400) return this.endReplay(); // any key skips (not one you were mashing)
    r.t = Math.min(last, r.t + dt * replaySpeed(c, r.t));
    if (r.t >= last && (r.hold += dt) > 0.6) return this.endReplay();
    while (r.hit < c.keys.length && r.t >= c.keys[r.hit]) this.replayImpact(c, r.hit++, now);
    this.applySnap(frameAt(c.frames, r.t));
  }

  /** The moment it all happens: a boom, a flash, a shockwave, the rim bending; dust when ankles go. */
  private replayImpact(c: Clip, k: number, now: number) {
    const s = c.frames.length ? frameAt(c.frames, c.keys[k]) : snap(this.g), star = s.players[c.who], b = s.ball; // live: right now
    const sfx = (play: () => void) => this.d.attract || play(); // the title screen's clips are silent
    if (c.kind === "dunk") {
      const end = c.side === 0 ? 1 : 0;
      sfx(boom);
      this.shake = 0.45;
      this.replayFlashUntil = now + 80;
      this.bend = { until: now + 450, end };
      this.impactAt = { x: W / 2, y: end === 1 ? L - COURT.hoopIn : COURT.hoopIn, z: COURT.rimZ, t: now };
    } else if (c.kind === "block" || c.kind === "chase") {
      sfx(() => blip(140, 140, 0.12));
      this.shake = 0.3;
      this.replayFlashUntil = now + 60;
      this.impactAt = { x: b.x, y: b.y, z: b.z, t: now };
    } else if (c.kind === "ankles") {
      const v = c.vs != null ? s.players[c.vs] : star;
      sfx(() => blip(220, 90, 0.08));
      this.dustAt = { x: v.x, y: v.y, t: now };
    } else if (c.kind === "stepback" && k === 0) {
      sfx(() => blip(330, 50, 0.06));
      this.dustAt = { x: star.x, y: star.y, t: now };
    } else sfx(() => blip(1320, 70, 0.05)); // the swish
  }

  /** A replay or a live cinematic is on: a clean picture (no rings), the cinematic camera and effects. */
  private get cinematic() {
    return !!(this.replay || this.cine);
  }
  /** The clip being filmed and where we are in it: a replay's playback time, or the live game's clock. */
  private get filming() {
    return this.replay ? { clip: this.replay.clip, t: this.replay.t } : this.cine ? { clip: this.cine.clip, t: this.g.time } : null;
  }

  /** After each step: someone sprinting at the hoop takes off for a slam → cut live to the dunk camera (replay.ts
   *  script), slow the game round the slam, fire the effects when it goes in, and cut back once they land. */
  private watchForCine(now: number) {
    const g = this.g, c = this.cine;
    if (c) {
      const star = g.players[c.clip.who];
      for (const e of g.events) {
        if (e.kind === "make" && e.who === c.clip.who) this.replayImpact(c.clip, c.clip.keys.length - 1, now);
        if (e.kind === "block" && e.vs === c.clip.who && e.who != null) {
          // stuffed! hold the shot a beat longer and shout about it; the slow motion moves to the block
          this.bigBlock(e.who, now);
          c.clip.end = g.time + 1.3;
          c.clip.keys = [g.time];
        }
      }
      const landed = c.clip.kind === "dunk" && !this.cineBlocked && star.act !== "dunk" && star.z === 0 && g.time > c.clip.keys[0];
      if (g.time > c.clip.end || landed || g.over) this.endCine();
    } else if (LIVE.liveCine >= 1 && !g.over && g.time - this.lastCineAt >= LIVE.cineGap) {
      const go = (kind: Clip["kind"], who: number, keys: number[], end: number, vs?: number) => {
        this.cineKey = keys[keys.length - 1];
        this.cineBlocked = false;
        this.cineCaption = null;
        this.cine = { clip: { kind, title: "", who, vs, side: g.players[who].side, start: g.time - 0.6, end, keys, hype: 0, frames: [] }, cut: -1 };
        this.setReplayLook(true);
        swoosh();
      };
      const f = g.ball.flight;
      const oop = g.events.find((e) => e.text === "ALLEY-OOP!" && e.who != null);
      const block = g.events.find((e) => e.kind === "block" && e.who != null);
      const dunker = g.players.find((pl) => pl.act === "dunk" && this.lastActs[pl.i] !== "dunk" && pl.p.attrs.finishing >= 70);
      if (oop && f?.oop) {
        // the lob's in the air: follow the receiver up, then the slam from under the rim
        const key = g.time + (f.dur - f.t) + LIVE.dunkSlamTime + 0.02;
        go("dunk", oop.who!, [key], key + 1);
      } else if (dunker) {
        const key = g.time + LIVE.dunkTime + 0.12; // when the ball goes through
        go("dunk", dunker.i, [key], key + 1);
      } else if (block) {
        go(block.text.startsWith("CHASE") ? "chase" : "block", block.who!, [g.time], g.time + 1, block.vs);
        this.bigBlock(block.who!, now);
      } else if (f?.kind === "shot" && f.points === 3 && f.t <= DT * 1.5 && this.cornerThree(f)) {
        // from the corner: over the defender's shoulder, riding the ball, then the swish from behind the board
        go("stepback", f.by, [g.time, g.time + f.dur], g.time + f.dur + 0.9);
      }
    }
    this.lastActs = g.players.map((p) => p.act);
  }

  /** A three let go from one of the corners (the straight bit of the line, beside the baseline). */
  private cornerThree(f: { x0: number; y0: number; by: number }) {
    const hoop = this.g.players[f.by].side === 0 ? { x: W / 2, y: L - COURT.hoopIn } : { x: W / 2, y: COURT.hoopIn };
    return Math.abs(f.x0 - hoop.x) > COURT.corner - 0.4 && Math.abs(f.y0 - hoop.y) < Math.sqrt(COURT.three ** 2 - COURT.corner ** 2) + 0.6;
  }

  /** Stuffed! A shake, a flash, a shockwave off the ball, and a big caption over the live cut. */
  private bigBlock(who: number, now: number) {
    const g = this.g;
    this.shake = 0.35;
    this.replayFlashUntil = now + 70;
    this.impactAt = { x: g.ball.x, y: g.ball.y, z: g.ball.z, t: now };
    blip(140, 160, 0.12);
    const name = g.players[who].p.name.toUpperCase();
    const lines = ["BIG BLOCK!", `BLOCKED BY ${name}!`, "DENIED!", "REJECTED!", `${name} SAYS NO!`];
    this.cineCaption = { text: lines[Math.floor(Math.random() * lines.length)], color: g.players[who].side === 0 ? "gold" : "red", at: now };
    this.cineBlocked = true;
  }

  /** The ball on fire while it's being slammed or lobbed for an alley-oop, leaving a trail of flame behind it. */
  private drawBallFire(x: number, y: number, z: number, now: number) {
    const g = this.g, b = g.ball, h = b.holder != null && !b.flight ? g.players[b.holder] : null;
    const lit = (h?.act === "dunk") || (b.flight?.kind === "shot" && b.flight.dur < 0.2) || !!b.flight?.oop;
    this.ballFire.visible = lit;
    if (lit) {
      const flick = 1 + (Math.floor(now / 60) % 3) * 0.12;
      this.ballFire.position.copy(at(x, y, z));
      this.ballFire.scale.set(0.75 * flick, 0.95 * flick, 1);
      // drop a flame where the ball is every few frames; they shrink and fade behind it
      const last = this.trail.reduce((p, q) => (q.t > p.t ? q : p));
      if (now - last.t > 35) Object.assign(this.trail.reduce((p, q) => (q.t < p.t ? q : p)), { x, y, z, t: now });
    }
    for (const tr of this.trail) {
      const age = (now - tr.t) / 260;
      tr.sprite.visible = age < 1;
      if (age >= 1) continue;
      tr.sprite.position.copy(at(tr.x, tr.y, tr.z + age * 0.3));
      tr.sprite.scale.setScalar(0.55 * (1 - age) + 0.1);
      (tr.sprite.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - age);
    }
  }

  private endCine() {
    this.lastCineAt = this.g.time;
    this.cine = null;
    this.setReplayLook(false);
    this.focus.x = this.g.ball.x; // the play camera picks up where the ball is
    this.focus.y = this.g.ball.y;
  }

  /** A live cinematic: the cinema bars (the scoreboard waits), a flash, and BIG BLOCK! if it got stuffed. */
  private drawCineHud() {
    const c = this.hud, now = performance.now();
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    c.fillStyle = PALETTE.white;
    if (now < this.replayFlashUntil) c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.fillStyle = PALETTE.black;
    c.fillRect(0, 0, VIEW_W, 28);
    c.fillRect(0, VIEW_H - 28, VIEW_W, 28);
    const cap = this.cineCaption;
    if (!cap) return;
    // it slams in big and settles, with a hard shadow
    const since = now - cap.at, size = since < 120 ? 32 : 24;
    c.font = `${size}px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "top";
    const y = VIEW_H - 28 - size - 14;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [4, 4]]) {
      c.fillStyle = PALETTE.black;
      c.fillText(cap.text, VIEW_W / 2 + dx, y + dy);
    }
    c.fillStyle = PALETTE[Math.floor(since / 120) % 2 ? cap.color : "white"];
    c.fillText(cap.text, VIEW_W / 2, y);
  }

  /** Beeps for the last five seconds of the shot clock, and higher, louder ones for the end of a quarter. */
  private countdown() {
    const g = this.g;
    if (g.practice || g.over) return;
    const shot = Math.ceil(g.shotClock), clock = g.timed ? Math.ceil(g.clock) : 99;
    const live = g.dead <= 0 && !g.inBreak;
    let beep: "shot" | "clock" | null = null;
    if (live && clock <= 5 && clock >= 1 && clock < this.ticks.clock) beep = "clock";
    else if (live && shot <= 5 && shot >= 1 && shot < this.ticks.shot && shot < clock) beep = "shot";
    this.ticks = { shot, clock };
    if (beep === "clock") blip(1320, 90, 0.07);
    else if (beep === "shot") blip(880, 50, 0.045);
  }

  /** In a replay, anyone standing between the camera and the play fades out of the way. */
  private fadeIfInTheWay(i: number, body: THREE.Sprite, mat: THREE.SpriteMaterial) {
    const r = this.filming;
    let fade = false;
    if (r && i !== r.clip.who && i !== r.clip.vs) {
      const star = this.bodies[r.clip.who].position;
      fade = body.position.distanceTo(this.rpos) < star.distanceTo(this.rpos) - 0.6;
    }
    if (fade === mat.transparent) return; // already right (switching recompiles the shader, so only on a change)
    mat.transparent = fade;
    mat.opacity = fade ? 0.3 : 1;
    mat.alphaTest = fade ? 0.01 : 0.5;
    mat.depthWrite = !fade;
    mat.needsUpdate = true;
  }

  /** The star stretches in the air and leans into a slam; a broken-ankled defender goes down. Returns any lift. */
  private replayPose(i: number, pl: Player, body: THREE.Sprite, mat: THREE.SpriteMaterial) {
    const r = this.filming!, c = r.clip, [sx, sy] = this.baseScale[i];
    if (i === c.who) {
      if (pl.z > 0.25) body.scale.set(sx * 0.88, sy * 1.14, 1);
      if (c.kind === "dunk" && (pl.act === "dunk" || pl.z > 1)) mat.rotation = (this.facing[i] ? -1 : 1) * 0.3;
    }
    if (c.kind === "ankles" && i === c.vs && pl.act === "stumble") {
      const k = Math.max(0, Math.min(1, (r.t - (c.keys[0] - 0.15)) / 0.25));
      mat.rotation = (this.facing[i] ? -1 : 1) * (Math.PI / 2) * k;
      return (sx / 2) * Math.abs(Math.sin(mat.rotation));
    }
    return 0;
  }

  /** Afterimages behind the star, the impact shockwave, dust, and the rim and net springing back after a slam. */
  private drawReplayFx(now: number) {
    const r = this.filming;
    const frames = r && (r.clip.frames.length ? r.clip.frames : this.rec.between(r.t - 1, r.t)); // live: the recording so far
    this.ghosts.forEach((gh, k) => {
      gh.visible = false;
      if (!r || !frames?.length) return;
      const c = r.clip, star = this.g.players[c.who];
      if (Math.hypot(star.vx, star.vy) < 5 && star.z < 0.5) return; // only when they're flying
      const past = frameAt(frames, r.t - 0.1 * (k + 1)).players[c.who];
      const body = this.bodies[c.who], m = gh.material as THREE.SpriteMaterial, map = (body.material as THREE.SpriteMaterial).map;
      if (m.map !== map) (m.map = map), (m.needsUpdate = true);
      gh.scale.copy(body.scale);
      gh.position.copy(at(past.x, past.y, past.z + 0.01));
      // a trail only reads behind them: when the camera's chasing from behind, it would smear across the star
      gh.visible = gh.position.distanceTo(this.rpos) > body.position.distanceTo(this.rpos);
    });
    const iw = this.impactAt ? (now - this.impactAt.t) / 500 : 1;
    this.impact.visible = iw < 1;
    if (this.impactAt && iw < 1) {
      this.impact.position.copy(at(this.impactAt.x, this.impactAt.y, this.impactAt.z));
      this.impact.scale.setScalar(1 + iw * 6);
      (this.impact.material as THREE.MeshBasicMaterial).opacity = 1 - iw;
    }
    const dw = this.dustAt ? (now - this.dustAt.t) / 550 : 1;
    this.dust.forEach((d, k) => {
      d.visible = dw < 1;
      if (!this.dustAt || dw >= 1) return;
      const a = (k / this.dust.length) * Math.PI * 2, rad = 0.25 + dw * 1.1;
      d.position.copy(at(this.dustAt.x + Math.cos(a) * rad, this.dustAt.y + Math.sin(a) * rad, 0.1 + Math.sin(dw * Math.PI) * 0.35));
      d.scale.setScalar(0.32 * (1 - dw) + 0.06);
    });
    for (const end of [0, 1]) {
      const rim = this.rims[end], net = this.nets[end];
      if (!rim || !net) continue;
      const w = end === this.bend.end ? Math.max(0, (this.bend.until - now) / 450) : 0;
      const wob = w * Math.cos((1 - w) * 18); // a springy wobble that dies away
      rim.position.y = COURT.rimZ - 0.09 * wob;
      net.position.y = COURT.rimZ - 0.21 - 0.12 * Math.abs(wob);
      net.scale.y = 1 + 0.6 * Math.abs(wob);
    }
  }

  /** The replay's camera: the clip's script (replay.ts), gliding within an angle and jumping on a cut. */
  private cinemaCamera(dt: number, clip: Clip, t: number, s: Snap, r: { cut: number }) {
    const sh = cameraFor(clip, t, s);
    // keep it out of the stands
    const pos = at(Math.max(-1, Math.min(W + 1, sh.pos[0])), Math.max(-1.3, Math.min(L + 1.3, sh.pos[1])), Math.max(0.3, sh.pos[2]));
    const look = at(...sh.look);
    const k = Math.min(1, dt * 7);
    if (r.cut !== sh.cut) {
      r.cut = sh.cut;
      this.rpos.copy(pos);
      this.rlook.copy(look);
      this.camera.fov = sh.fov;
    } else {
      this.rpos.lerp(pos, k);
      this.rlook.lerp(look, k);
      this.camera.fov += (sh.fov - this.camera.fov) * k;
    }
    if (this.shake > 0) this.shake -= dt;
    this.camera.position.copy(this.rpos);
    if (this.shake > 0) {
      this.camera.position.x += Math.sin(this.shake * 90) * 0.1;
      this.camera.position.y += Math.cos(this.shake * 70) * 0.1;
    }
    this.camera.lookAt(this.rlook);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** Cinema bars, a blinking REPLAY tag, SLOW-MO, and the title card sliding in. */
  private drawReplayHud(now: number) {
    const c = this.hud, r = this.replay!, clip = r.clip, g = this.g;
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    const rect = (x: number, y: number, w: number, h: number, n: PaletteName) => {
      c.fillStyle = PALETTE[n];
      c.fillRect(x, y, w, h);
    };
    const text = (s: string, x: number, y: number, n: PaletteName, size = 8, align: CanvasTextAlign = "left") => {
      c.font = `${size}px ${FONT}`;
      c.textAlign = align;
      c.textBaseline = "top";
      c.fillStyle = PALETTE[n];
      c.fillText(s, x, y);
    };
    if (now < this.replayFlashUntil) rect(0, 0, VIEW_W, VIEW_H, "white");
    const BAR = 34;
    rect(0, 0, VIEW_W, BAR, "black");
    rect(0, VIEW_H - BAR, VIEW_W, BAR, "black");
    if (Math.floor(now / 400) % 2 === 0) rect(14, 13, 8, 8, "red");
    text(r.label, 28, 13, "white");
    if (replaySpeed(clip, r.t) < 0.6 && Math.floor(now / 250) % 2 === 0) text("SLOW-MO", VIEW_W - 14, 13, "amber", 8, "right");
    const slide = Math.min(1, (now - r.began) / 300), x = Math.round(-320 + 336 * slide);
    c.font = `16px ${FONT}`;
    const tw = Math.ceil(c.measureText(clip.title).width);
    rect(x - 8, VIEW_H - BAR - 30, tw + 16, 26, "black");
    rect(x - 8, VIEW_H - BAR - 4, tw + 16, 2, clip.side === 0 ? this.d.youColor : this.d.cpuColor);
    text(clip.title, x, VIEW_H - BAR - 25, "gold", 16);
    const star = g.players[clip.who].p.name.toUpperCase(), vs = clip.vs != null ? g.players[clip.vs].p.name.toUpperCase() : "";
    text(`${star}${vs ? ` ON ${vs}` : ""} - ${g.names[clip.side].toUpperCase()}`, x, VIEW_H - BAR + 8, "white");
    text("ANY KEY: SKIP", VIEW_W - 14, VIEW_H - BAR + 20, "steel", 8, "right");
  }

  /** Behind your end, looking up the court at the hoop you attack, sliding along with the ball, but never so far
   *  that your Pokémon drops out of the picture. */
  private moveCamera(dt: number) {
    const b = this.g.ball, you = this.g.players[this.g.control];
    if (this.shake > 0) this.shake -= dt;
    // follow the ball, held back so you stay in shot (you sit at most YOU_BEHIND metres behind the focus)
    const YOU_BEHIND = 2.2, YOU_ASIDE = 3;
    const by = b.flight ? b.flight.y1 * 0.4 + b.y * 0.6 : b.y;
    const fy = Math.min(Math.max(2.5, Math.min(L - 7, by)), you.y + YOU_BEHIND);
    const fx = Math.max(you.x - YOU_ASIDE, Math.min(you.x + YOU_ASIDE, b.x));
    const k = Math.min(1, dt * 4);
    this.focus.x += (fx - this.focus.x) * k;
    this.focus.y += (fy - this.focus.y) * k;
    // hard limits, applied every frame: at the limit the camera glides along with you (no catch-up jumps)
    this.focus.y = Math.min(this.focus.y, you.y + YOU_BEHIND);
    this.focus.x = Math.max(you.x - YOU_ASIDE, Math.min(you.x + YOU_ASIDE, this.focus.x));
    this.aim();
  }

  /** Point the camera at the current focus (plus any shake). */
  private aim() {
    const look = at(W / 2 + (this.focus.x - W / 2) * 0.6, this.focus.y + 4, 1);
    const pos = at(W / 2 + (this.focus.x - W / 2) * 0.5, this.focus.y - 9, 6);
    if (this.shake > 0) {
      pos.x += Math.sin(this.shake * 90) * 0.08;
      pos.y += Math.cos(this.shake * 70) * 0.08;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();
  }

  /** Where a court spot lands on the 640×360 screen. */
  private toScreen(x: number, y: number, z: number) {
    const v = at(x, y, z).project(this.camera);
    return { x: Math.round(((v.x + 1) / 2) * VIEW_W), y: Math.round(((1 - v.y) / 2) * VIEW_H) };
  }

  private drawHud(now: number) {
    const c = this.hud, g = this.g;
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    const rect = (x: number, y: number, w: number, h: number, n: PaletteName) => {
      c.fillStyle = PALETTE[n];
      c.fillRect(x, y, w, h);
    };
    const text = (s: string, x: number, y: number, n: PaletteName, size = 8, align: CanvasTextAlign = "left", shadow = false) => {
      c.font = `${size}px ${FONT}`;
      c.textAlign = align;
      c.textBaseline = "top";
      if (shadow) {
        c.fillStyle = PALETTE.black;
        c.fillText(s, x + 2, y + 2);
      }
      c.fillStyle = PALETTE[n];
      c.fillText(s, x, y);
    };

    // the scoreboard, top centre: your team | the clocks | theirs
    const SB = { x: VIEW_W / 2 - 150, w: 300, h: 30 }, mid = VIEW_W / 2;
    rect(SB.x - 2, 0, SB.w + 4, SB.h + 2, "gold");
    rect(SB.x, 0, SB.w, SB.h, "black");
    rect(SB.x, 0, 5, SB.h, this.d.youColor);
    rect(SB.x + SB.w - 5, 0, 5, SB.h, this.d.cpuColor);
    text(g.names[0].toUpperCase().slice(0, 8), SB.x + 10, 4, "cloud", 8);
    text(String(g.score[0]), mid - 46, 11, "gold", 16, "right");
    text(g.names[1].toUpperCase().slice(0, 8), SB.x + SB.w - 10, 4, "cloud", 8, "right");
    text(String(g.score[1]), mid + 46, 11, "white", 16, "left");
    rect(mid - 40, 3, 1, SB.h - 6, "slate");
    rect(mid + 40, 3, 1, SB.h - 6, "slate");
    // the game clock (full games) or the target (1v1), and the shot clock under it (red for the last five)
    const period = g.period < 4 ? `Q${g.period + 1}` : g.period === 4 ? "OT" : `${g.period - 3}OT`;
    const middle = g.practice ? "PRACTICE" : g.timed ? `${period} ${clockText(Math.ceil(g.clock))}` : `TO ${g.target}`;
    text(middle, mid, 5, g.timed && g.clock < 10 ? "red" : "white", 8, "center");
    const clock = Math.max(0, Math.ceil(g.shotClock));
    if (!g.practice) text(String(clock).padStart(2, "0"), mid, 18, clock <= 5 ? "red" : "amber", 8, "center");
    // turbo tanks in the corners: yours, and the CPU player nearest the ball
    const theirs = g.players.filter((p) => p.side === 1).reduce((p, q) => (Math.hypot(q.x - g.ball.x, q.y - g.ball.y) < Math.hypot(p.x - g.ball.x, p.y - g.ball.y) ? q : p));
    for (const [side, pl] of [[0, g.players[g.control]], [1, theirs]] as const) {
      const tank = Math.round(pl.turbo * 10), x0 = side === 0 ? 4 : VIEW_W - 58;
      c.globalAlpha = 0.6;
      rect(x0, 3, 54, 10, "black");
      c.globalAlpha = 1;
      for (let i = 0; i < 10; i++) rect(side === 0 ? x0 + 3 + i * 5 : x0 + 47 - i * 5, 6, 4, 4, i < tank ? "lime" : "slate");
    }

    // "P1" and a down-pointing triangle over the player you steer
    if (this.started) {
      const me = g.players[g.control], s = this.toScreen(me.x, me.y, me.z + this.bodies[g.control].scale.y + 0.25); // just over the sprite
      const bob = Math.floor(now / 250) % 2; // a one-pixel bob, so it catches the eye
      const fresh = now < this.flashUntil, hop = fresh ? Math.round(Math.abs(Math.sin(now / 70)) * 6) : 0;
      const ty = s.y - 8 + bob - hop;
      if (fresh) text("YOU", s.x, ty - 26, "white", 16, "center", true); // just switched: shout it
      text("P1", s.x, ty - 11, "gold", 8, "center", true);
      for (let r = 0; r < 4; r++) rect(s.x - 4 + r, ty + r, 8 - r * 2, 1, "gold"); // the triangle, in pixel rows
    }

    // your teammates' numbers over their heads (keys 1–5 pass straight to them)
    if (g.size > 1)
      for (const pl of g.players) {
        if (pl.side !== 0 || pl.i === g.control) continue;
        const s = this.toScreen(pl.x, pl.y, pl.z + this.bodies[pl.i].scale.y + 0.25); // just over the sprite
        if (s.y < 22 || s.y > VIEW_H - 24) continue;
        if (pl.i === this.passTarget) {
          // the one J passes to: a bright box with its number and a pointer down at it
          rect(s.x - 9, s.y - 10, 18, 12, "black");
          rect(s.x - 8, s.y - 9, 16, 10, "gold");
          text(String(pl.slot + 1), s.x, s.y - 8, "black", 8, "center");
          for (let r = 0; r < 3; r++) rect(s.x - 3 + r, s.y + 1 + r, 6 - r * 2, 1, "gold");
          continue;
        }
        c.globalAlpha = 0.8;
        text(String(pl.slot + 1), s.x, s.y, "gold", 8, "center", true);
        c.globalAlpha = 1;
      }

    // the stamina (turbo) bar on your other side while you're using it, and for a moment after: 8 stacked blocks
    const you = g.players[g.control];
    if (now < this.staminaUntil) {
      const p = this.toScreen(you.x, you.y, reachOf(you) + 0.4);
      const BLOCKS = 8, x = p.x - 22, y = p.y - (BLOCKS * 4) / 2;
      const full = Math.ceil(you.turbo * BLOCKS), low = you.turbo < 0.25;
      rect(x - 1, y - 1, 7, BLOCKS * 4 + 1, "black");
      for (let i = 0; i < BLOCKS; i++) rect(x, y + (BLOCKS - 1 - i) * 4, 5, 3, i < full ? (low ? "red" : "lime") : "slate");
    }

    // the block meter (a test): on defence, a red bar by a nearby shooter fills as they wind up; jump at the line
    const h = handlerOf(g);
    if (h && h.side === 1 && h.act === "wind" && h.wind >= LIVE.quickTap && Math.hypot(h.x - you.x, h.y - you.y) < 6) {
      const H = 32, over = LIVE.meterOver, p = this.toScreen(h.x, h.y, reachOf(h) + 0.4);
      const x = p.x - 22, y = p.y - H / 2;
      const fill = Math.min(h.wind / LIVE.meterTime, over) / over;
      const jumpAt = y + H - Math.round((0.8 / over) * H); // jump a beat before the release: you're rising as it goes up
      rect(x - 1, y - 1, 7, H + 2, "black");
      rect(x, y, 5, H, "slate");
      rect(x + 1, y + H - Math.round(fill * H), 3, Math.round(fill * H), fill * over >= 0.8 ? "gold" : "red");
      rect(x - 2, jumpAt, 9, 1, "white");
      text("JUMP", x + 2, jumpAt - 10, "white", 8, "center", true);
    }

    // the shot meter beside you while K is held (not for a quick tap): fill to the white line and let go
    if (you.act === "wind" && you.wind >= LIVE.quickTap) {
      const H = 32, over = LIVE.meterOver, p = this.toScreen(you.x, you.y, reachOf(you) + 0.4);
      const x = p.x + 16, y = p.y - H / 2;
      const fill = Math.min(you.wind / LIVE.meterTime, over) / over, win = meterWindow(g, you);
      const lvl = (v: number) => y + H - Math.round((v / over) * H);
      rect(x - 1, y - 1, 7, H + 2, "black");
      rect(x, y, 5, H, "slate");
      rect(x, lvl(1 + win), 5, Math.max(1, lvl(1 - win) - lvl(1 + win)), "green");
      const h = Math.round(fill * H);
      rect(x + 1, y + H - h, 3, h, fill * over > 1 + win ? "red" : "gold");
      rect(x - 2, lvl(1), 9, 1, "white");
    }

    // what each side is running: your call on the left, the CPU's on the right, just under the score
    if (g.size > 1 && this.started) {
      const theyHave = g.poss === 1;
      const mineCall = g.calls[0].play && !theyHave ? `PLAY: ${g.calls[0].play}${this.feedHint()}` : theyHave ? `D: ${g.calls[0].scheme}` : "";
      const cpuCall = g.calls[1].play && theyHave ? `CPU: ${g.calls[1].play}` : !theyHave ? `CPU D: ${g.calls[1].scheme}` : "";
      c.globalAlpha = 0.85;
      if (mineCall) text(mineCall, 6, 36, "gold", 8, "left", true); // under the scoreboard
      if (cpuCall) text(cpuCall, VIEW_W - 6, 36, "pink", 8, "right", true);
      c.globalAlpha = 1;
    }

    this.popups = this.popups.filter((p) => p.until > now);
    const banner = this.popups.filter((p) => p.banner).at(-1); // just the latest one
    if (banner) {
      c.globalAlpha = 0.8;
      rect(VIEW_W / 2 - banner.text.length * 4 - 6, 48, banner.text.length * 8 + 12, 14, "black");
      c.globalAlpha = 1;
      text(banner.text, VIEW_W / 2, 51, banner.color, 8, "center");
    }
    for (const p of this.popups) {
      if (p.banner) continue;
      if (p.big) text(p.text, VIEW_W / 2, 140, p.color, 16, "center", true);
      else {
        const pl = g.players[p.who ?? g.control], s = this.toScreen(pl.x, pl.y, reachOf(pl) + 1.2);
        text(p.text, s.x, s.y - 10, p.color, 8, "center", true);
      }
    }

    if (!this.started) this.drawIntro(rect, text);
    else if (!this.ended) {
      this.drawControls(rect, text);
      if (this.tutor) this.drawLesson(rect, text);
      if (this.menu) this.drawMenu(rect, text);
      else if (g.solo && performance.now() < this.sideUntil && g.poss === 0) this.drawSidePlays(rect, text);
    }
  }

  /** HOW TO PLAY: the current step in a box under the score: what to do, and a hint if it's taking a while. */
  private drawLesson(rect: (x: number, y: number, w: number, h: number, n: PaletteName) => void, text: (s: string, x: number, y: number, n: PaletteName, size?: number, align?: CanvasTextAlign) => void) {
    const tu = this.tutor!, s = tu.step;
    if (!s || tu.between) return;
    const c = this.hud, x = 90, y = 68, w = VIEW_W - 180, h = tu.stuck ? 46 : 34; // under the banner strip
    c.globalAlpha = 0.85;
    rect(x - 2, y - 2, w + 4, h + 4, "gold");
    rect(x, y, w, h, "black");
    c.globalAlpha = 1;
    text(`STEP ${tu.i + 1}/${STEPS.length}: ${s.title}`, VIEW_W / 2, y + 6, "gold", 8, "center");
    // the lesson says your own keys: {shoot} → K (or whatever you bound)
    const say = (s2: string) => s2.replace(/\{(\w+)\}/g, (_, a: string) => (ACTIONS as readonly string[]).includes(a) ? keyName(this.keys[a as Action]) : a);
    text(say(s.how), VIEW_W / 2, y + 20, "white", 8, "center");
    if (tu.stuck) text(`TIP: ${say(s.hint)}`, VIEW_W / 2, y + 33, "lime", 8, "center");
  }

  /** For plays that start by getting the ball to someone (isolation, post up): who to pass to, by their number. */
  private feedHint() {
    const c = this.g.calls[0];
    if (!c.play || !PLAY[c.play].ballToKey || c.key == null || this.g.ball.holder === c.key) return "";
    return ` - PASS TO ${this.g.players[c.key].slot + 1}`;
  }

  /** The Q menu: a box of choices with a cursor, what the highlighted one does, and how to pick. */
  /** One-character mode: the plays down the left side (no slow-down); Q steps to the next one. */
  private drawSidePlays(rect: (x: number, y: number, w: number, h: number, n: PaletteName) => void, text: (s: string, x: number, y: number, n: PaletteName, size?: number, align?: CanvasTextAlign) => void) {
    const list = [...PLAYS, null], current = this.g.calls[0].play, c = this.hud;
    const x = 4, y = 60, w = 118, h = 20 + list.length * 12 + 4;
    c.globalAlpha = 0.45;
    rect(x, y, w, h, "black");
    c.globalAlpha = 1;
    text(`${keyName(this.keys.plays)}: NEXT PLAY`, x + 4, y + 4, "gold");
    list.forEach((p, i) => {
      const on = p === current;
      text(`${on ? ">" : " "}${p ?? "FREE PLAY"}`, x + 4, y + 20 + i * 12, on ? "white" : "steel");
    });
  }

  private drawMenu(rect: (x: number, y: number, w: number, h: number, n: PaletteName) => void, text: (s: string, x: number, y: number, n: PaletteName, size?: number, align?: CanvasTextAlign) => void) {
    const m = this.menu!, g = this.g;
    const options: (PlayName | SchemeName | null)[] = m.kind === "play" ? [...PLAYS, null] : [...SCHEMES];
    const current = m.kind === "play" ? g.calls[0].play : g.calls[0].scheme;
    const x = 140, y = 60, w = 360, h = 40 + options.length * 16 + 40;
    // see-through, so you can still watch the (slowed) play behind it
    const c = this.hud;
    c.globalAlpha = 0.45;
    rect(x - 2, y - 2, w + 4, h + 4, "gold");
    rect(x, y, w, h, "black");
    c.globalAlpha = 1;
    text(m.kind === "play" ? "CALL A PLAY" : "PICK A DEFENCE", x + w / 2, y + 10, "gold", 8, "center");
    text("(GAME SLOWED)", x + w / 2, y + 22, "steel", 8, "center");
    options.forEach((o, i) => {
      const yy = y + 40 + i * 16, on = i === m.cursor;
      if (on) rect(x + 8, yy - 3, w - 16, 14, "navy");
      text(`${on ? ">" : " "} ${i + 1} ${o ?? "FREE PLAY"}${o === current ? " *" : ""}`, x + 14, yy, on ? "white" : "cloud");
    });
    const pick = options[m.cursor];
    const about = m.kind === "play" ? (pick ? PLAY[pick as PlayName].about : "NO PLAY: EVERYONE SPACES OUT") : SCHEME_ABOUT[pick as SchemeName];
    const ay = y + 40 + options.length * 16 + 6;
    text(about.slice(0, 43), x + w / 2, ay, "lime", 8, "center");
    text(`UP/DOWN + ENTER, OR 1-5. ${keyName(this.keys.plays)} CLOSES`, x + w / 2, ay + 14, "steel", 8, "center");
  }

  /** Faint key icons along the bottom, for what you can do right now; a key lights up while it's held. */
  private drawControls(rect: (x: number, y: number, w: number, h: number, n: PaletteName) => void, text: (s: string, x: number, y: number, n: PaletteName) => void) {
    const g = this.g, c = this.hud;
    const withBall = g.ball.holder != null && !g.ball.flight && g.players[g.ball.holder].side === 0;
    // your own keys (the CONTROLS screen can change them)
    const k = this.keys, codes = (a: Action) => this.codes(a);
    const n = (a: Action) => (this.lSprint() && a === "turbo" ? "L" : this.lSprint() && a === "cross" ? "LL" : keyName(k[a]));
    const SHOOT = codes("shoot"), DIGITS = [1, 2, 3, 4, 5].map((d) => `Digit${d}`), shootCap = `${n("shoot")}/SPC`;
    const rows: [string, string, string[]][] =
      g.size === 1
        ? withBall
          ? [[shootCap, "SHOOT (HOLD)", SHOOT], [n("turbo"), "TURBO", codes("turbo")], [`${n("turbo")}+${n("shoot")}`, "DUNK", []], [n("cross"), "CROSSOVER", codes("cross")]]
          : [[shootCap, "JUMP / BLOCK", SHOOT], [n("cross"), "STEAL", codes("cross")], [n("turbo"), "TURBO", codes("turbo")]]
        : withBall
          ? [[shootCap, "SHOOT", SHOOT], [n("pass"), "PASS", codes("pass")], ["1-5", "PASS TO", DIGITS], [n("plays"), "PLAYS", codes("plays")], [n("turbo"), "TURBO", codes("turbo")], [n("cross"), "CROSS", codes("cross")]]
          : [[shootCap, "JUMP / BLOCK", SHOOT], [n("pass"), g.solo ? "CALL BALL" : "SWITCH", codes("pass")], [n("cross"), "STEAL", codes("cross")], [n("plays"), "DEFENCE", codes("plays")], [n("turbo"), "TURBO", codes("turbo")]];
    rows.push([n("music"), "MUSIC", codes("music")], ["ESC", "PAUSE", []]);
    // one row along the bottom, centred, on a dark see-through strip so the labels read over the court
    const widths = rows.map(([key, action]) => key.length * 8 + 6 + 5 + action.length * 8);
    const GAP = Math.min(10, Math.floor((VIEW_W - 8 - widths.reduce((a, b) => a + b, 0)) / (rows.length - 1))), y = VIEW_H - 16;
    let x = Math.round((VIEW_W - (widths.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1))) / 2);
    c.globalAlpha = 0.45;
    rect(0, y - 4, VIEW_W, 20, "black");
    rows.forEach(([key, action, codes], i) => {
      const lit = codes.length > 0 && this.down(...codes);
      c.globalAlpha = lit ? 1 : 0.7;
      const w = key.length * 8 + 6;
      // a pixel key cap: white edge, dark face, the key's name
      rect(x, y, w, 13, lit ? "gold" : "white");
      rect(x + 1, y + 1, w - 2, 11, "black");
      text(key, x + 4, y + 3, lit ? "gold" : "white");
      text(action, x + w + 5, y + 3, "cloud");
      x += widths[i] + GAP;
    });
    c.globalAlpha = 1;
  }

  private drawIntro(
    rect: (x: number, y: number, w: number, h: number, n: PaletteName) => void,
    text: (s: string, x: number, y: number, n: PaletteName, size?: number, align?: CanvasTextAlign, shadow?: boolean) => void,
  ) {
    const c = this.hud, cx = VIEW_W / 2, g = this.g, now = performance.now();
    // dim the court so the card stands out, then a gold-edged panel
    c.globalAlpha = 0.6;
    rect(0, 0, VIEW_W, VIEW_H, "black");
    c.globalAlpha = 1;
    rect(36, 36, VIEW_W - 72, VIEW_H - 72, "gold");
    rect(38, 38, VIEW_W - 76, VIEW_H - 76, "black");
    rect(42, 42, VIEW_W - 84, VIEW_H - 84, "night");
    // the matchup: team-coloured name plates, VS between them
    const names: [string, string] = g.size === 1 ? [g.players[0].p.name, g.players[1].p.name] : [g.names[0], g.names[1]];
    if (this.tutor) {
      rect(cx - 120, 52, 240, 26, this.d.youColor);
      text("HOW TO PLAY", cx, 58, inkOn(this.d.youColor), 16, "center", inkOn(this.d.youColor) === "white");
    } else {
      rect(56, 52, 236, 26, this.d.youColor);
      rect(VIEW_W - 292, 52, 236, 26, this.d.cpuColor);
      // dark ink on a light team colour, white (with a shadow) on a dark one
      text(names[0].toUpperCase().slice(0, 13), 174, 58, inkOn(this.d.youColor), 16, "center", inkOn(this.d.youColor) === "white");
      text(names[1].toUpperCase().slice(0, 13), VIEW_W - 174, 58, inkOn(this.d.cpuColor), 16, "center", inkOn(this.d.cpuColor) === "white");
      text("VS", cx, 58, "gold", 16, "center", true);
    }
    const sub = this.tutor
      ? `${STEPS.length} QUICK STEPS - YOU ATTACK THE FAR HOOP`
      : g.timed ? "4 QUARTERS OF 1:30 - YOU ATTACK THE FAR HOOP" : `FIRST TO ${g.target} - YOU ATTACK THE FAR HOOP`;
    // the format on a red ribbon
    const rw = sub.length * 8 + 24;
    rect(cx - rw / 2, 86, rw, 16, "red");
    text(sub, cx, 90, "white", 8, "center");
    // your own keys (the CONTROLS screen in the pause menu changes them), as pixel key caps in two columns
    const n = (a: Action) => keyName(this.keys[a]);
    const team = g.size > 1, move = `${n("up")}${n("left")}${n("down")}${n("right")}`, shoot = `${n("shoot")}/SPC`;
    const offence: [string, string][] = [
      [move, "MOVE (OR ARROWS)"],
      [n("turbo"), "SPRINT"],
      [shoot, "HOLD, LET GO: SHOOT"],
      [`${n("turbo")}+${n("shoot")}`, "DUNK AT THE RIM"],
      ...(team ? ([[n("pass"), "PASS"], ["1-5", "PASS TO A SLOT"], [n("plays"), "CALL A PLAY"]] as [string, string][]) : []),
      [n("cross"), "CROSSOVER"],
    ];
    const defence: [string, string][] = [
      [shoot, "JUMP / BLOCK"],
      [n("cross"), "STEAL"],
      ...(team ? ([[n("pass"), "SWITCH PLAYER"], [n("plays"), "PICK A DEFENCE"]] as [string, string][]) : []),
    ];
    const game: [string, string][] = [[n("music"), "MUSIC"], ["ESC", "PAUSE"]];
    const cap = (k: string, x: number, y: number, lit = false) => {
      const w = k.length * 8 + 8;
      rect(x, y, w, 15, lit ? "gold" : "white");
      rect(x + 1, y + 1, w - 2, 12, "black");
      text(k, x + 4, y + 4, lit ? "gold" : "white");
      return w;
    };
    const column = (title: string, list: [string, string][], x: number, y: number) => {
      text(title, x, y, "gold");
      rect(x, y + 11, 250, 1, "slate");
      list.forEach(([k, label], i) => {
        const w = cap(k, x, y + 18 + i * 19);
        text(label, x + w + 8, y + 22 + i * 19, "cloud");
      });
    };
    column("OFFENCE", offence, 58, 114);
    column("DEFENCE", defence, 338, 114);
    column("GAME", game, 338, 114 + 18 + defence.length * 19 + 8);
    // tip off: a blinking ENTER key
    const on = Math.floor(now / 450) % 2 === 0, w = 13 * 8 + 8 + 8 + 6 * 8;
    const x = cx - w / 2;
    cap("ENTER", x, VIEW_H - 64, on);
    text("TIP OFF!", x + 6 * 8 + 16, VIEW_H - 60, on ? "gold" : "fog");
  }
}

