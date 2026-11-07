// The live arcade game's rules (PLAN.md §10, Phase 5: 1v1). Pure: no Phaser, no React. The scene feeds in what
// the keys say and draws what comes out. Metres and seconds. x runs across the court, y runs up it (side 0, you,
// always attacks the top hoop), z is height. Every make, miss, steal and block is a seeded dice roll when it happens.
import { LIVE, SIM } from "../ratingConfig.ts";
import { makeRng, type Rng } from "../rng.ts";
import type { RatedPokemon } from "../types.ts";

export const COURT = { w: 15.24, l: 28.65, rimZ: 3.05, hoopIn: 1.575 };
export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);
/** The hoop a side attacks: you (0) go up to the top one, the CPU (1) comes down to the bottom one. */
export const hoopOf = (side: Side) => ({ x: COURT.w / 2, y: side === 0 ? COURT.l - COURT.hoopIn : COURT.hoopIn });

/** What one side asks for this step. x/y is the stick (up = +y); shoot is K held; steal/cross are presses. */
export type Input = { x: number; y: number; turbo: boolean; shoot: boolean; steal: boolean; cross: boolean };
export const NO_INPUT: Input = { x: 0, y: 0, turbo: false, shoot: false, steal: false, cross: false };

export type Act = "free" | "wind" | "air" | "dunk" | "stumble" | "cross";
export type Player = {
  side: Side;
  p: RatedPokemon;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fx: number; fy: number; // facing (unit)
  turbo: number; // tank 0–1
  act: Act;
  actT: number; // time left in the act
  crossCool: number;
  stealCool: number;
  held: boolean; // K was down last step
  wind: number; // seconds K has been held for this shot
  dunkFrom: { x: number; y: number } | null;
  dunkTested: boolean;
};

export type Flight = {
  kind: "shot" | "loose" | "dead";
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  peak: number; t: number; dur: number;
  made: boolean; points: 2 | 3; shooter: Side;
  tested: boolean; // the defender's block chance was rolled
  short?: boolean; // a weak shot that never reaches the hoop (an air ball)
};
export type Ball = { holder: Side | null; x: number; y: number; z: number; flight: Flight | null };

export type EventKind = "release" | "make" | "miss" | "block" | "steal" | "rebound" | "ankles" | "whiff" | "over";
export type GameEvent = { kind: EventKind; side: Side; text: string };

export type Timing = "perfect" | "good" | "miss";
export type Zone = "rim" | "mid" | "three";

export type Game = {
  players: [Player, Player];
  ball: Ball;
  score: [number, number];
  rng: Rng;
  time: number;
  dead: number; // dead-ball time left after a make
  next: Side; // who inbounds when it ends
  over: boolean;
  winner: Side | null;
  events: GameEvent[]; // this step's, for the scene (sounds, popups)
  lastShot: { side: Side; zone: Zone; timing: Timing; chance: number; made: boolean } | null;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// ── ratings → game numbers ─────────────────────────────────────────────────────
const a = (pl: Player) => pl.p.attrs;
export const speedOf = (pl: Player) => lerp(LIVE.speedMin, LIVE.speedMax, a(pl).speed / 99);
export const reachOf = (pl: Player) => lerp(LIVE.reachMin, LIVE.reachMax, pl.p.heightPct / 100);
const jumpOf = (pl: Player) => lerp(LIVE.jumpMin, LIVE.jumpMax, (a(pl).finishing + a(pl).rebounding) / 198);
const grabOf = (pl: Player) => LIVE.grabBase + a(pl).rebounding * LIVE.grabSlope;
/** Top of the player's hands right now. */
export const handZ = (pl: Player) => pl.z + reachOf(pl);

export const zoneAt = (d: number): Zone => (d < LIVE.rimRange ? "rim" : d >= LIVE.threeAt ? "three" : "mid");

/** Half-width of the green zone (share of the meter): bigger with the rating, smaller when contested or deep. */
export function shotWindow(rating: number, contest: number, d: number) {
  const w = lerp(LIVE.windowMin, LIVE.windowMax, rating / 99) * (1 - contest * LIVE.contestShrink);
  return Math.max(0.02, w - Math.max(0, d - LIVE.deepFrom) * LIVE.deepShrink);
}

export const timingOf = (meter: number, window: number): Timing => {
  const off = Math.abs(meter - 1);
  return off <= window * LIVE.perfectShare ? "perfect" : off <= window ? "good" : "miss";
};

/** The make chance: the sim's base rate for the zone, moved by the rating, the release timing and the contest. */
export function makeChance(zone: Zone, rating: number, timing: Timing, contest: number) {
  const base = zone === "rim" ? SIM.rim : zone === "mid" ? SIM.mid : SIM.three;
  return clamp(base + (rating - 60) * LIVE.ratingSlope + LIVE.timing[timing] - contest * LIVE.contestPenalty, 0.02, 0.97);
}

export const blockChance = (interiorD: number, shooterRating: number) =>
  clamp(LIVE.blockBase + (interiorD - shooterRating) * LIVE.blockSlope, 0.05, 0.9);

/** How hard the defender is contesting the player with the ball (0 open – 1 smothered). */
export function contestOn(g: Game, shooter: Player) {
  const def = g.players[other(shooter.side)];
  const d = dist(def, shooter);
  if (d >= LIVE.contestRange) return 0;
  const hoop = hoopOf(shooter.side);
  // a defender behind the shooter barely bothers the shot
  const ahead = (def.x - shooter.x) * (hoop.x - shooter.x) + (def.y - shooter.y) * (hoop.y - shooter.y) > 0 ? 1 : 0.4;
  return (1 - d / LIVE.contestRange) * ahead;
}

/** The green zone the player would get if they shot right now (the scene draws it on the meter). */
export function meterWindow(g: Game, pl: Player) {
  const d = dist(pl, hoopOf(pl.side));
  const zone = zoneAt(d);
  return shotWindow(zone === "rim" ? a(pl).finishing : a(pl).shooting, contestOn(g, pl), d);
}

// ── setting up ────────────────────────────────────────────────────────────────
function player(side: Side, p: RatedPokemon, x: number, y: number): Player {
  return {
    side, p, x, y, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: side === 0 ? 1 : -1, turbo: 1, act: "free", actT: 0,
    crossCool: 0, stealCool: 0, held: false, wind: 0, dunkFrom: null, dunkTested: false,
  };
}

/** A new 1v1: you start with the ball at your end, the CPU waits between you and its hoop. */
export function newGame(you: RatedPokemon, cpu: RatedPokemon, seed: number): Game {
  const g: Game = {
    players: [player(0, you, COURT.w / 2, 3), player(1, cpu, COURT.w / 2, 11)],
    ball: { holder: 0, x: COURT.w / 2, y: 3, z: 0, flight: null },
    score: [0, 0], rng: makeRng(seed), time: 0, dead: 0, next: 0, over: false, winner: null, events: [], lastShot: null,
  };
  return g;
}

// ── one step ──────────────────────────────────────────────────────────────────
export function step(g: Game, inputs: [Input, Input], dt: number) {
  g.events = [];
  if (g.over) return;
  g.time += dt;
  if (g.dead > 0) {
    g.dead -= dt;
    if (g.dead <= 0) inbound(g, g.next);
  }
  for (const pl of g.players) movePlayer(g, pl, g.dead > 0 ? { ...inputs[pl.side], shoot: false, steal: false, cross: false } : inputs[pl.side], dt);
  bumpApart(g);
  moveBall(g, dt);
}

const emit = (g: Game, kind: EventKind, side: Side, text: string) => g.events.push({ kind, side, text });
const holds = (g: Game, pl: Player) => g.ball.holder === pl.side && !g.ball.flight;

function movePlayer(g: Game, pl: Player, inp: Input, dt: number) {
  pl.actT -= dt;
  pl.crossCool = Math.max(0, pl.crossCool - dt);
  pl.stealCool = Math.max(0, pl.stealCool - dt);
  const pressed = inp.shoot && !pl.held;
  const released = !inp.shoot && pl.held;
  pl.held = inp.shoot;
  const hasBall = holds(g, pl);

  // the stick, as a unit vector (or nothing)
  const len = Math.hypot(inp.x, inp.y);
  const sx = len > 0.1 ? inp.x / Math.max(1, len) : 0, sy = len > 0.1 ? inp.y / Math.max(1, len) : 0;
  let want = 1; // share of top speed wanted
  let control = true;

  switch (pl.act) {
    case "stumble":
      control = false;
      if (pl.actT <= 0) pl.act = "free";
      break;
    case "air":
      control = false;
      pl.vz -= LIVE.gravity * dt;
      pl.z += pl.vz * dt;
      if (pl.z <= 0) {
        pl.z = pl.vz = 0;
        pl.act = "free";
      }
      break;
    case "wind":
      want = 0; // set your feet
      pl.wind += dt;
      if (released || pl.wind >= LIVE.meterTime * LIVE.meterOver) shoot(g, pl);
      break;
    case "dunk":
      dunkStep(g, pl);
      return;
    case "cross":
      control = false;
      if (pl.actT <= 0) pl.act = "free";
      break;
    case "free":
      if (hasBall && pressed) {
        if (inp.turbo && dist(pl, hoopOf(pl.side)) < LIVE.dunkRange) return startDunk(pl);
        pl.act = "wind";
        pl.wind = 0;
        want = 0;
      } else if (hasBall && inp.cross && pl.crossCool <= 0) {
        crossover(g, pl, sx, sy);
        control = false;
      } else if (!hasBall && pressed) {
        pl.act = "air"; // jump: block or rebound
        pl.vz = jumpOf(pl);
        control = false;
      } else if (!hasBall && inp.steal && pl.stealCool <= 0) {
        trySteal(g, pl);
        control = false;
      }
      break;
  }

  if (control) {
    const turbo = inp.turbo && pl.turbo > 0 && len > 0.1;
    pl.turbo = clamp(pl.turbo + (turbo ? -LIVE.turboDrain : LIVE.turboRegen) * dt, 0, 1);
    const top = speedOf(pl) * want * (hasBall ? LIVE.dribbleSlow : 1) * (turbo ? LIVE.turboBoost : 1);
    const tx = sx * top, ty = sy * top;
    const dvx = tx - pl.vx, dvy = ty - pl.vy, dv = Math.hypot(dvx, dvy), max = LIVE.accel * dt;
    const k = dv > max ? max / dv : 1;
    pl.vx += dvx * k;
    pl.vy += dvy * k;
  } else if (pl.act === "stumble") {
    pl.vx *= 0.8;
    pl.vy *= 0.8;
  }
  pl.x = clamp(pl.x + pl.vx * dt, 0.3, COURT.w - 0.3);
  pl.y = clamp(pl.y + pl.vy * dt, 0.3, COURT.l - 0.3);
  const v = Math.hypot(pl.vx, pl.vy);
  if (v > 0.5) {
    pl.fx = pl.vx / v;
    pl.fy = pl.vy / v;
  }
}

function bumpApart(g: Game) {
  const [p, q] = g.players;
  if (p.act === "dunk" || q.act === "dunk") return;
  const d = dist(p, q);
  if (d >= LIVE.bump || d === 0) return;
  const push = (LIVE.bump - d) / 2, ux = (q.x - p.x) / d, uy = (q.y - p.y) / d;
  p.x = clamp(p.x - ux * push, 0.3, COURT.w - 0.3);
  p.y = clamp(p.y - uy * push, 0.3, COURT.l - 0.3);
  q.x = clamp(q.x + ux * push, 0.3, COURT.w - 0.3);
  q.y = clamp(q.y + uy * push, 0.3, COURT.l - 0.3);
}

function shoot(g: Game, pl: Player) {
  const hoop = hoopOf(pl.side);
  const d = dist(pl, hoop);
  const zone = zoneAt(d);
  const rating = zone === "rim" ? a(pl).finishing : a(pl).shooting;
  const contest = contestOn(g, pl);
  const meter = pl.wind / LIVE.meterTime, win = shotWindow(rating, contest, d);
  const timing = timingOf(meter, win);
  // let go well short of the line and there isn't the power to reach: it drops short, the weaker the shorter
  const weakBelow = 1 - win * LIVE.airballBelow;
  const short = meter < weakBelow;
  const chance = short ? 0 : makeChance(zone, rating, timing, contest);
  const made = !short && g.rng.next() < chance;
  g.lastShot = { side: pl.side, zone, timing, chance, made };
  pl.act = "air"; // the jump shot
  pl.vz = 3.2;
  pl.vx = pl.vy = 0;
  g.ball.holder = null;
  const reach = short ? Math.max(0.15, (meter / weakBelow) ** 1.5 * 0.9) : 1; // share of the way to the hoop
  const z0 = reachOf(pl) + 0.3;
  g.ball.flight = {
    kind: "shot", x0: pl.x, y0: pl.y, z0, x1: lerp(pl.x, hoop.x, reach), y1: lerp(pl.y, hoop.y, reach), z1: short ? 0 : COURT.rimZ,
    peak: short ? z0 + 0.4 + d * reach * 0.12 : COURT.rimZ + 1.2 + d * 0.12, t: 0, dur: 0.55 + d * reach * 0.045, made,
    points: zone === "three" ? 3 : 2, shooter: pl.side, tested: false, short,
  };
  emit(g, "release", pl.side, timing === "perfect" ? "PERFECT" : timing === "good" ? "GOOD" : meter > 1 ? "LATE" : "EARLY");
}

function startDunk(pl: Player) {
  pl.act = "dunk";
  pl.actT = LIVE.dunkTime;
  pl.dunkFrom = { x: pl.x, y: pl.y };
  pl.dunkTested = false;
  pl.vx = pl.vy = 0;
}

/** Fly from where the dunk started to just in front of the rim and up; the defender can block it on the way. */
function dunkStep(g: Game, pl: Player) {
  const hoop = hoopOf(pl.side), from = pl.dunkFrom!;
  const s = clamp(1 - pl.actT / LIVE.dunkTime, 0, 1);
  const toward = pl.side === 0 ? -0.35 : 0.35; // stop just short of the rim, on the court side
  pl.x = lerp(from.x, hoop.x, s);
  pl.y = lerp(from.y, hoop.y + toward, s);
  pl.z = Math.sin(s * Math.PI * 0.5) * Math.max(0.3, COURT.rimZ + 0.2 - reachOf(pl));
  g.ball.x = pl.x;
  g.ball.y = pl.y;
  g.ball.z = pl.z + reachOf(pl);

  const def = g.players[other(pl.side)];
  if (!pl.dunkTested && def.act === "air" && dist(def, pl) < LIVE.blockRange && handZ(def) >= g.ball.z - 0.3) {
    pl.dunkTested = true;
    if (g.rng.next() < blockChance(a(def).interiorD, a(pl).finishing)) {
      pl.act = "air";
      pl.vz = 0;
      return blocked(g, def, g.ball);
    }
  }
  if (pl.actT > 0) return;
  // at the rim: the roll
  const contest = contestOn(g, pl);
  const chance = clamp(makeChance("rim", a(pl).finishing, "good", contest) + 0.1, 0.02, 0.97);
  const made = g.rng.next() < chance;
  g.lastShot = { side: pl.side, zone: "rim", timing: "good", chance, made };
  pl.act = "air";
  pl.vz = 0;
  g.ball.holder = null;
  g.ball.flight = {
    kind: "shot", x0: g.ball.x, y0: g.ball.y, z0: COURT.rimZ + 0.4, x1: hoop.x, y1: hoop.y, z1: COURT.rimZ,
    peak: COURT.rimZ + 0.45, t: 0, dur: 0.12, made, points: 2, shooter: pl.side, tested: true,
  };
  emit(g, "release", pl.side, a(pl).finishing >= 70 ? "DUNK" : "LAYUP");
}

function crossover(g: Game, pl: Player, sx: number, sy: number) {
  // burst the way the stick points, or sideways if it's centred
  let dx = sx, dy = sy;
  if (!dx && !dy) [dx, dy] = [-pl.fy, pl.fx];
  const top = speedOf(pl) * LIVE.crossBoost;
  pl.vx = dx * top;
  pl.vy = dy * top;
  pl.act = "cross";
  pl.actT = LIVE.crossTime;
  pl.crossCool = LIVE.crossCool;
  const def = g.players[other(pl.side)];
  const odds = LIVE.anklesChance + (a(pl).handles - a(def).perimeterD) * 0.005;
  if (def.act === "free" && dist(def, pl) < 1.8 && g.rng.next() < odds) {
    def.act = "stumble";
    def.actT = LIVE.ankles;
    emit(g, "ankles", pl.side, "ANKLES!");
  }
}

function trySteal(g: Game, pl: Player) {
  pl.stealCool = LIVE.stealCool;
  const handler = g.players[other(pl.side)];
  const canReach = holds(g, handler) && dist(pl, handler) < LIVE.stealRange && handler.act !== "cross" && handler.act !== "dunk";
  if (canReach && g.rng.next() < LIVE.stealBase + (a(pl).perimeterD - a(handler).handles) * LIVE.stealSlope) {
    if (handler.act === "wind") handler.act = "free";
    gain(g, pl);
    emit(g, "steal", pl.side, "STEAL!");
    return;
  }
  pl.act = "stumble";
  pl.actT = LIVE.stumble;
  emit(g, "whiff", pl.side, "");
}

function blocked(g: Game, def: Player, from: { x: number; y: number; z: number }) {
  // swatted away from the hoop, back toward the court
  const hoop = hoopOf(other(def.side));
  const ang = Math.atan2(from.y - hoop.y, from.x - hoop.x) + (g.rng.next() - 0.5) * 1.6;
  const far = 3 + g.rng.next() * 2.5;
  loose(g, from, { x: from.x + Math.cos(ang) * far, y: from.y + Math.sin(ang) * far }, from.z + 0.8, 0.6);
  g.lastShot = g.lastShot && { ...g.lastShot, made: false };
  emit(g, "block", def.side, "BLOCKED!");
}

function loose(g: Game, from: { x: number; y: number; z: number }, to: { x: number; y: number }, peak: number, dur: number) {
  g.ball.holder = null;
  g.ball.flight = {
    kind: "loose", x0: from.x, y0: from.y, z0: from.z, x1: clamp(to.x, 0.6, COURT.w - 0.6), y1: clamp(to.y, 0.6, COURT.l - 0.6),
    z1: 0, peak, t: 0, dur, made: false, points: 2, shooter: 0, tested: true,
  };
}

function gain(g: Game, pl: Player) {
  g.ball.holder = pl.side;
  g.ball.flight = null;
  g.ball.x = pl.x;
  g.ball.y = pl.y;
}

function inbound(g: Game, side: Side) {
  // the team that was scored on takes it from under the hoop at its own end
  const pl = g.players[side];
  pl.x = COURT.w / 2;
  pl.y = side === 0 ? 0.8 : COURT.l - 0.8;
  pl.z = pl.vz = pl.vx = pl.vy = 0;
  pl.act = "free";
  gain(g, pl);
}

function moveBall(g: Game, dt: number) {
  const b = g.ball;
  if (b.holder != null && !b.flight) {
    const h = g.players[b.holder];
    if (h.act !== "dunk") {
      b.x = h.x;
      b.y = h.y;
      b.z = 1;
    }
    return;
  }
  const f = b.flight;
  if (f) {
    f.t += dt;
    const s = Math.min(1, f.t / f.dur);
    b.x = lerp(f.x0, f.x1, s);
    b.y = lerp(f.y0, f.y1, s);
    b.z = lerp(f.z0, f.z1, s) + (f.peak - (f.z0 + f.z1) / 2) * 4 * s * (1 - s);

    if (f.kind === "shot" && !f.tested && f.t < LIVE.blockWindow) {
      const def = g.players[other(f.shooter)];
      if (def.act === "air" && dist(def, b) < LIVE.blockRange && handZ(def) >= b.z - 0.2) {
        f.tested = true;
        const sh = g.players[f.shooter];
        const rating = zoneAt(dist(sh, hoopOf(sh.side))) === "rim" ? a(sh).finishing : a(sh).shooting;
        if (g.rng.next() < blockChance(a(def).interiorD, rating)) return blocked(g, def, b);
      }
    }
    if (f.kind === "loose" && grab(g)) return;
    if (s < 1) return;

    if (f.kind === "shot") {
      if (f.short) {
        // an air ball: it hits the floor and skips on a little way, loose for anyone
        const ux = f.x1 - f.x0, uy = f.y1 - f.y0, len = Math.hypot(ux, uy) || 1;
        loose(g, b, { x: b.x + (ux / len) * 1.2, y: b.y + (uy / len) * 1.2 }, 0.6, 0.35);
        emit(g, "miss", f.shooter, "AIR BALL!");
        return;
      }
      if (f.made) {
        g.score[f.shooter] += f.points;
        emit(g, "make", f.shooter, f.points === 3 ? "THREE!" : g.lastShot?.timing === "perfect" ? "SWISH!" : "SCORE!");
        if (g.score[f.shooter] >= LIVE.targetScore) {
          g.over = true;
          g.winner = f.shooter;
          emit(g, "over", f.shooter, f.shooter === 0 ? "YOU WIN!" : "YOU LOSE");
          return;
        }
        g.dead = LIVE.deadBall;
        g.next = other(f.shooter);
        b.flight = { ...f, kind: "dead", x0: b.x, y0: b.y, z0: b.z, z1: 0, peak: b.z, t: 0, dur: 0.4 };
      } else {
        // off the rim, back out toward the court
        const ang = (f.shooter === 0 ? -Math.PI / 2 : Math.PI / 2) + (g.rng.next() - 0.5) * 2.4;
        const far = 1.5 + g.rng.next() * 3;
        loose(g, b, { x: b.x + Math.cos(ang) * far, y: b.y + Math.sin(ang) * far }, COURT.rimZ + 1.2, 0.75);
        emit(g, "miss", f.shooter, g.lastShot?.timing === "miss" ? "BRICK!" : "MISS");
      }
      return;
    }
    // a loose ball or a made one has landed
    b.flight = null;
    b.z = 0;
    return;
  }
  if (g.dead <= 0) grab(g); // on the floor: first to it (a made ball waits for the inbound)
}

/** Whoever can reach the loose ball takes it (the closer one if both can). */
function grab(g: Game): boolean {
  const b = g.ball;
  let best: Player | null = null, bestD = Infinity;
  for (const pl of g.players) {
    if (pl.act === "stumble") continue;
    const d = dist(pl, b);
    if (d < grabOf(pl) && handZ(pl) >= b.z && d < bestD) {
      best = pl;
      bestD = d;
    }
  }
  if (!best) return false;
  gain(g, best);
  emit(g, "rebound", best.side, "");
  return true;
}
