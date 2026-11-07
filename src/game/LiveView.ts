// Draws the live 1v1 (the rules live in src/core/live) as a 3D arena with Three.js. The camera sits behind your end
// and always looks up the court at the hoop you attack; it rides along with the ball. The scene is drawn at 640×360
// and blown up by a whole number, so it stays chunky pixels. Pokémon are flat sprites standing in the 3D world.
// A 2D canvas on top carries the HUD, the shot meter and the popups.
import * as THREE from "three";
import { makeAi, type AiLevel } from "../core/live/ai.ts";
import {
  COURT, handZ, meterWindow, newGame, reachOf, step, type Game, type GameEvent, type Input,
} from "../core/live/game.ts";
import { LIVE } from "../core/ratingConfig.ts";
import type { RatedPokemon } from "../core/types.ts";
import { blip } from "../ui/sound.ts";
import { Music } from "./music.ts";
import { PALETTE, type PaletteName } from "../ui/theme/palette.ts";

export type LiveSetup = {
  you: RatedPokemon;
  cpu: RatedPokemon;
  youColor: PaletteName;
  cpuColor: PaletteName;
  level: AiLevel;
  seed: number;
  onOver: (score: [number, number]) => void;
  /** How full the arena is: 0 empty – 1 packed (default CROWD). */
  crowd?: number;
};

/** The usual crowd level; pass `crowd` in the setup (or call setCrowd) for a different one. */
export const CROWD = 0.85;
const SIMPLE_PER_FAN = 5; // filler fans for each detailed one when packed

export const VIEW_W = 640, VIEW_H = 360;
const DT = 1 / 60;
const SPRITE_PX = 30; // sprite pixels per metre in the world
const FONT = '"Press Start 2P"';
const { w: W, l: L } = COURT;

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
  private ai: ReturnType<typeof makeAi>;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, VIEW_W / VIEW_H, 0.1, 300);
  private hud: CanvasRenderingContext2D;
  private bodies: THREE.Sprite[] = [];
  private music = new Music();
  private shadows: THREE.Mesh[] = [];
  private ring!: THREE.Mesh;
  private ball!: THREE.Sprite;
  private ballShadow!: THREE.Mesh;
  private facing: [boolean, boolean] = [false, true];
  private focus = { x: W / 2, y: 6 };
  private shake = 0;
  private held = new Set<string>();
  private tapped = new Set<string>();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private started = false;
  private ended = false;
  private paused = false;
  private popups: { text: string; color: PaletteName; until: number; side?: number; big: boolean }[] = [];
  private disposables: { dispose: () => void }[] = [];
  private fans: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; look: THREE.Texture[]; base: number; phase: number; rate: number; seat: number }[] = [];
  private filler = { points: null as THREE.Points | null, base: new Float32Array(), phase: new Float32Array(), seat: new Float32Array() };
  private hype = 0;
  private holdFromStart = false; // K/Space still held from the press that tipped off
  private staminaUntil = 0; // show the stamina bar until then (ms)
  private crowd: number;

  constructor(private host: HTMLElement, private d: LiveSetup) {
    this.g = newGame(d.you, d.cpu, d.seed);
    this.crowd = d.crowd ?? CROWD;
    this.ai = makeAi(1, d.level);

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

    this.build();
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.raf = requestAnimationFrame(this.frame);
  }

  pause() {
    this.paused = true;
    this.held.clear();
    this.music.stop();
  }
  resume() {
    this.paused = false;
    this.last = 0;
    if (this.started && !this.ended) this.music.start();
  }
  destroy() {
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
  private static GAME_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "KeyJ", "KeyK", "KeyL", "KeyM", "Space", "Enter"]);
  private onDown = (e: KeyboardEvent) => {
    if (this.paused || !LiveView.GAME_KEYS.has(e.code)) return;
    e.preventDefault(); // no page scrolling on arrows/space
    if (!e.repeat) this.tapped.add(e.code);
    this.held.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => this.held.delete(e.code);
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
      // painted keys: yours at your end, theirs at the end you attack
      px(fx(W / 2 - 2.44), fy(5.79), this.d.youColor, 4.88 * R, 5.79 * R);
      px(fx(W / 2 - 2.44), fy(L), this.d.cpuColor, 4.88 * R, 5.79 * R);
      // lines: boundary (2 px), half court, centre circle, keys, free-throw circles, threes
      px(fx(0) - 2, fy(L) - 2, "white", W * R + 4, 2);
      px(fx(0) - 2, fy(0), "white", W * R + 4, 2);
      px(fx(0) - 2, fy(L), "white", 2, L * R);
      px(fx(W), fy(L), "white", 2, L * R);
      px(fx(0), fy(L / 2), "white", W * R, 1);
      arc(W / 2, L / 2, 1.8);
      for (const base of [0, L]) {
        const dir = base === 0 ? 1 : -1, ft = base + dir * 5.79, hy = base + dir * COURT.hoopIn;
        px(fx(W / 2 - 2.44), fy(Math.max(base, ft)), "white", 1, 5.79 * R);
        px(fx(W / 2 + 2.44), fy(Math.max(base, ft)), "white", 1, 5.79 * R);
        px(fx(W / 2 - 2.44), fy(ft), "white", 4.88 * R, 1);
        arc(W / 2, ft, 1.8, (_x, y) => (y - ft) * dir >= 0);
        const corner = Math.abs(hy - base) + Math.sqrt(6.75 ** 2 - 6.6 ** 2);
        px(fx(W / 2 - 6.6), fy(Math.max(base, base + dir * corner)), "white", 1, corner * R);
        px(fx(W / 2 + 6.6), fy(Math.max(base, base + dir * corner)), "white", 1, corner * R);
        arc(W / 2, hy, 6.75, (x, y) => Math.abs(x - W / 2) <= 6.6 && (y - hy) * dir >= 0);
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

    this.hoop(1);
    this.hoop(0);

    // players, shadows, the ring under you, the ball
    const loader = new THREE.TextureLoader();
    for (const p of [this.d.you, this.d.cpu]) {
      const tex = this.keep(loader.load(p.sprite));
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 })));
      const k = p.spriteH < 24 ? 2 : 1;
      sprite.center.set(0.5, 0);
      sprite.scale.set((p.spriteW * k) / SPRITE_PX, (p.spriteH * k) / SPRITE_PX, 1);
      this.bodies.push(sprite);
      s.add(sprite);
      const sh = new THREE.Mesh(this.keep(new THREE.CircleGeometry(0.45, 10)), this.keep(basic("black", { transparent: true, opacity: 0.4, depthWrite: false })));
      sh.rotation.x = -Math.PI / 2;
      this.shadows.push(sh);
      s.add(sh);
    }
    this.ring = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.55, 0.68, 14)), this.keep(basic("gold", { depthWrite: false })));
    this.ring.rotation.x = -Math.PI / 2;
    s.add(this.ring);

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
    if (end === 1) {
      // your own hoop's pole would stand between the camera and the play, so only the far one has one
      box(0.2, 3.6, 0.2, steel, 0, hy + out * 2.6, 1.8); // pole
      box(0.5, 0.25, 0.5, this.keep(basic("black")), 0, hy + out * 2.6, 0.12); // pad at the base
      box(0.1, 0.1, 2.2, steel, 0, hy + out * 1.5, 3.45); // arm out to the board
    }
    box(1.83, 1.07, 0.04, glass, 0, boardY, 3.435); // glass board
    for (const [w, h, x, z] of [[1.83, 0.05, 0, 3.95], [1.83, 0.05, 0, 2.92], [0.05, 1.07, -0.9, 3.435], [0.05, 1.07, 0.9, 3.435]] as const)
      box(w, h, 0.05, white, x, boardY, z);
    for (const [w, h, x, z] of [[0.59, 0.04, 0, 3.45], [0.04, 0.45, -0.28, 3.25], [0.04, 0.45, 0.28, 3.25]] as const)
      box(w, h, 0.05, red, x, boardY - out * 0.01, z); // the shooter's square
    const rim = new THREE.Mesh(this.keep(new THREE.TorusGeometry(0.23, 0.025, 4, 14)), this.keep(basic("orange", fade)));
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(at(W / 2, hy, COURT.rimZ));
    this.scene.add(rim);
    const net = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.23, 0.15, 0.42, 8, 2, true)), this.keep(basic("white", { wireframe: true, ...fade })));
    net.position.copy(at(W / 2, hy, COURT.rimZ - 0.21));
    this.scene.add(net);
  }

  // ── the loop ──────────────────────────────────────────────────────────────
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    if (this.paused) return;

    if (!this.started) {
      if (this.tapped.has("Enter") || this.tapped.has("Space")) {
        this.started = true;
        this.holdFromStart = true; // the key that tipped off isn't a shot
        blip(990, 90);
        this.music.start();
      }
    } else if (!this.ended) {
      if (this.holdFromStart && !this.down("KeyK", "Space")) this.holdFromStart = false;
      const tankBefore = this.g.players[0].turbo;
      const mine: Input = {
        x: (this.down("ArrowRight", "KeyD") ? 1 : 0) - (this.down("ArrowLeft", "KeyA") ? 1 : 0),
        y: (this.down("ArrowUp", "KeyW") ? 1 : 0) - (this.down("ArrowDown", "KeyS") ? 1 : 0),
        turbo: this.down("ShiftLeft", "ShiftRight"),
        shoot: this.down("KeyK", "Space") && !this.holdFromStart,
        steal: this.tapped.has("KeyJ"),
        cross: this.tapped.has("KeyL"),
      };
      this.acc += dt;
      let first = true;
      while (this.acc >= DT) {
        this.acc -= DT;
        step(this.g, [first ? mine : { ...mine, steal: false, cross: false }, this.ai(this.g, DT)], DT); // a tap counts once
        first = false;
        for (const e of this.g.events) this.onEvent(e, now);
        if (this.g.over) break;
      }
      if (this.g.players[0].turbo < tankBefore) this.staminaUntil = now + 1000; // turbo in use: show the bar
      if (this.g.over) {
        this.ended = true;
        this.music.stop();
        setTimeout(() => this.d.onOver([...this.g.score] as [number, number]), 1600);
      }
    }
    if (this.tapped.has("KeyM")) {
      const on = this.music.toggle();
      this.popups.push({ text: on ? "MUSIC ON" : "MUSIC OFF", color: "cloud", until: now + 800, big: true });
    }
    this.tapped.clear();
    this.draw(dt, now);
  };

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
        break;
      case "miss":
        blip(196, 110);
        if (e.text === "AIR BALL!") this.popups.push({ text: e.text, color: "cloud", until: now + 900, big: true });
        break;
      case "block":
        blip(140, 180, 0.07);
        this.shake = 0.25;
        pop(e.text);
        break;
      case "steal":
        blip(1046, 90);
        pop(e.text);
        break;
      case "ankles":
        blip(1175, 80);
        pop(e.text);
        break;
      case "release": {
        if (e.text === "PERFECT") blip(1760, 50);
        if (e.text === "DUNK") this.shake = 0.3;
        if (!mine && e.text !== "DUNK" && e.text !== "LAYUP") break;
        const color: PaletteName = e.text === "PERFECT" ? "lime" : ["GOOD", "DUNK", "LAYUP"].includes(e.text) ? "gold" : "red";
        this.popups.push({ text: e.text, color, until: now + 700, side: e.side, big: false });
        break;
      }
      case "rebound":
        blip(523, 40);
        break;
      case "whiff":
        blip(262, 40);
        break;
      case "over":
        pop(e.text, 3000);
        break;
    }
  }

  // ── drawing the state ───────────────────────────────────────────────────────
  private draw(dt: number, now: number) {
    const g = this.g, t = now / 1000;
    g.players.forEach((pl, i) => {
      if (pl.vx > 0.3) this.facing[i] = true;
      else if (pl.vx < -0.3) this.facing[i] = false;
      const body = this.bodies[i], map = (body.material as THREE.SpriteMaterial).map!;
      // sprites face left; flip to face right
      map.repeat.x = this.facing[i] ? -1 : 1;
      map.offset.x = this.facing[i] ? 1 : 0;
      const moving = pl.z === 0 && Math.hypot(pl.vx, pl.vy) > 0.8;
      body.position.copy(at(pl.x, pl.y, pl.z + 0.01 + (moving && Math.floor(t * 8) % 2 ? 0.05 : 0)));
      (body.material as THREE.SpriteMaterial).color.copy(pl.act === "stumble" ? col("fog") : new THREE.Color(0xffffff));
      this.shadows[i].position.copy(at(pl.x, pl.y, 0.02));
    });
    const you = g.players[0];
    this.ring.position.copy(at(you.x, you.y, 0.03));

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
    this.ballShadow.position.copy(at(bx, b.y, 0.025));

    this.animateFans(t, dt);
    this.moveCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.drawHud(now);
  }

  /** Behind your end, looking up the court at the hoop you attack, sliding along with the ball, but never so far
   *  that your Pokémon drops out of the picture. */
  private moveCamera(dt: number) {
    const b = this.g.ball, you = this.g.players[0];
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

    // score bar
    rect(0, 0, VIEW_W, 20, "black");
    rect(0, 18, VIEW_W / 2, 2, this.d.youColor);
    rect(VIEW_W / 2, 18, VIEW_W / 2, 2, this.d.cpuColor);
    text(`YOU ${g.score[0]}`, 6, 6, "gold");
    text(`${g.score[1]} CPU`, VIEW_W - 6, 6, "white", 8, "right");
    text(`FIRST TO ${LIVE.targetScore}`, VIEW_W / 2, 6, "cloud", 8, "center");
    for (const side of [0, 1] as const) {
      const tank = Math.round(g.players[side].turbo * 10);
      for (let i = 0; i < 10; i++) rect(side === 0 ? 76 + i * 5 : VIEW_W - 80 - i * 5, 7, 4, 4, i < tank ? "lime" : "slate");
    }

    // the stamina (turbo) bar on your other side while you're using it, and for a moment after: 8 stacked blocks
    const you = g.players[0];
    if (now < this.staminaUntil) {
      const p = this.toScreen(you.x, you.y, reachOf(you) + 0.4);
      const BLOCKS = 8, x = p.x - 22, y = p.y - (BLOCKS * 4) / 2;
      const full = Math.ceil(you.turbo * BLOCKS), low = you.turbo < 0.25;
      rect(x - 1, y - 1, 7, BLOCKS * 4 + 1, "black");
      for (let i = 0; i < BLOCKS; i++) rect(x, y + (BLOCKS - 1 - i) * 4, 5, 3, i < full ? (low ? "red" : "lime") : "slate");
    }

    // the shot meter beside you while K is held: fill to the white line and let go
    if (you.act === "wind") {
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

    this.popups = this.popups.filter((p) => p.until > now);
    for (const p of this.popups) {
      if (p.big) text(p.text, VIEW_W / 2, 140, p.color, 16, "center", true);
      else {
        const pl = g.players[p.side ?? 0], s = this.toScreen(pl.x, pl.y, reachOf(pl) + 1.2);
        text(p.text, s.x, s.y - 10, p.color, 8, "center", true);
      }
    }

    if (!this.started) this.drawIntro(rect, text);
    else if (!this.ended) this.drawControls(rect, text);
  }

  /** Faint key icons along the bottom, for what you can do right now; a key lights up while it's held. */
  private drawControls(rect: (x: number, y: number, w: number, h: number, n: PaletteName) => void, text: (s: string, x: number, y: number, n: PaletteName) => void) {
    const g = this.g, c = this.hud;
    const withBall = g.ball.holder === 0 && !g.ball.flight;
    const SHIFT = ["ShiftLeft", "ShiftRight"], SHOOT = ["KeyK", "Space"];
    const rows: [string, string, string[]][] = withBall
      ? [["K/SPC", "SHOOT (HOLD)", SHOOT], ["SHIFT", "TURBO", SHIFT], ["SHIFT+K", "DUNK", []], ["L", "CROSSOVER", ["KeyL"]]]
      : [["K/SPC", "JUMP / BLOCK", SHOOT], ["J", "STEAL", ["KeyJ"]], ["SHIFT", "TURBO", SHIFT]];
    rows.push(["M", "MUSIC", ["KeyM"]], ["ESC", "PAUSE", []]);
    // one row along the bottom, centred, on a dark see-through strip so the labels read over the court
    const GAP = 10, y = VIEW_H - 16;
    const widths = rows.map(([key, action]) => key.length * 8 + 6 + 5 + action.length * 8);
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

  private drawIntro(rect: (x: number, y: number, w: number, h: number, n: PaletteName) => void, text: (s: string, x: number, y: number, n: PaletteName, size?: number, align?: CanvasTextAlign) => void) {
    rect(110, 70, 420, 220, "white");
    rect(112, 72, 416, 216, "black");
    const cx = VIEW_W / 2;
    text(`${this.d.you.name.toUpperCase()} VS ${this.d.cpu.name.toUpperCase()}`, cx, 86, "gold", 8, "center");
    text(`FIRST TO ${LIVE.targetScore} - YOU ATTACK THE FAR HOOP`, cx, 102, "cloud", 8, "center");
    const rows: [string, string][] = [
      ["ARROWS/WASD", "MOVE"],
      ["SHIFT", "TURBO"],
      ["K/SPACE", "HOLD, LET GO AT THE LINE: SHOOT"],
      ["K/SPACE", "ON DEFENCE: JUMP TO BLOCK"],
      ["SHIFT+K", "DUNK NEAR THE RIM"],
      ["J", "STEAL"],
      ["L", "CROSSOVER"],
      ["M", "MUSIC ON/OFF"],
      ["ESC", "PAUSE"],
    ];
    rows.forEach(([k, v], i) => {
      text(k, 136, 128 + i * 14, "white");
      text(v, 248, 128 + i * 14, "fog");
    });
    if (Math.floor(performance.now() / 500) % 2) text("PRESS ENTER TO TIP OFF", cx, 260, "gold", 8, "center");
  }
}

