// The live arcade game's rules (PLAN.md §10; Phase 5 was 1v1, Phase 6 is teams: 1, 3 or 5 a side). Pure: no
// Three.js, no React. The view feeds in what the keys say and draws what comes out. Metres and seconds. x runs
// across the court, y runs up it (side 0, you, always attacks the top hoop), z is height. Every make, miss, steal,
// block and interception is a seeded dice roll when it happens.
import { LIVE, SIM } from "../ratingConfig.ts";
import { makeRng, type Rng } from "../rng.ts";
import { newLine, type Line, type TeamBox } from "../stats.ts";
import type { RatedPokemon } from "../types.ts";
import { ovrOf, PLAY, type PlayName, type SchemeName } from "./plays.ts";

/** The court, scaled by LIVE.courtScale (a real court × it): size, where the hoops sit, the painted lines. The rim
 *  height doesn't scale (the players don't). */
// (getters, so the dev menu can change the size; a new game picks it up)
export const COURT = {
  get w() { return 15.24 * LIVE.courtScale; },
  get l() { return 28.65 * LIVE.courtScale; },
  rimZ: 3.05,
  get hoopIn() { return 1.575 * LIVE.courtScale; },
  get three() { return 6.75 * LIVE.courtScale; }, // the three-point arc
  get corner() { return 6.6 * LIVE.courtScale; }, // the straight corner lines' distance from the middle
  get keyW() { return 4.88 * LIVE.courtScale; }, // the painted key
  get keyL() { return 5.79 * LIVE.courtScale; },
  get circle() { return 1.8 * LIVE.courtScale; },
  get scale() { return LIVE.courtScale; }, // for spots measured on a real court
};
export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);
/** The hoop a side attacks: you (0) go up to the top one, the CPU (1) comes down to the bottom one. */
export const hoopOf = (side: Side) => ({ x: COURT.w / 2, y: side === 0 ? COURT.l - COURT.hoopIn : COURT.hoopIn });

/** What one player asks for this step. x/y is the stick (up = +y); shoot is K held.
 *  steal (J): pass to the teammate you face with the ball. Without it: the player you steer switches to the
 *    defender nearest the ball; a CPU player steals.
 *  cross (L): crossover with the ball; without it, the player you steer goes for the steal.
 *  passTo: pass straight to this player (index), e.g. keys 1–5.
 *  screen: set a screen (stand still; defenders who run into you are held up). */
export type Input = {
  x: number; y: number; turbo: boolean; shoot: boolean; steal: boolean; cross: boolean; passTo: number | null; screen: boolean;
};
export const NO_INPUT: Input = { x: 0, y: 0, turbo: false, shoot: false, steal: false, cross: false, passTo: null, screen: false };

/** What a team has called: an offensive play (for this possession, until it runs out) and a defensive scheme. */
export type Call = { play: PlayName | null; playAt: number; key: number | null; scheme: SchemeName };

export type Act = "free" | "wind" | "air" | "dunk" | "stumble" | "cross";

/** Everyone on a team's roster, on the court or the bench: energy (0–100) and their box-score line. */
export type RosterEntry = { p: RatedPokemon; slot: number; energy: number; line: Line };

export type Player = {
  i: number; // index in g.players
  r: number; // which roster entry is playing this spot right now (subs swap it)
  home: number; // the roster entry who started here (comes back in when rested)
  sprinting: boolean; // used turbo this step (tires you faster)
  side: Side;
  slot: number; // 0 = PG … 4 = C (its spot in the lineup)
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
  dunkTested: number[]; // defenders whose block on this dunk was rolled
  screening: boolean; // standing in a screen this step
  slow: number; // seconds left held up by a screen
  screenedAt: number; // when it last ran into one (one hold-up per screen)
  doubled: boolean; // used its double jump this time in the air
  streak: number; // straight makes (a miss or a sub resets it)
  onFire: boolean; // ON FIRE: bigger green zone, endless turbo, until the other team scores
};

export type Flight = {
  kind: "shot" | "loose" | "dead" | "pass";
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  peak: number; t: number; dur: number;
  made: boolean; points: 2 | 3;
  by: number; // who threw it (player index)
  to: number | null; // a pass's receiver
  oop?: boolean; // an alley-oop lob: thrown to just above the rim, caught in the air and slammed
  tested: number[]; // defenders whose block/interception was rolled
  short?: boolean; // a weak shot that never reaches the hoop (an air ball)
};
export type Ball = { holder: number | null; x: number; y: number; z: number; flight: Flight | null };

export type EventKind =
  | "release" | "make" | "miss" | "block" | "steal" | "rebound" | "ankles" | "whiff" | "over" | "pass" | "violation"
  | "screen" | "call" | "period" | "sub" | "fire" | "move";
/** A moment for the results screen's highlights (same shape as the sim's). */
export type Highlight = { period: number; text: string; weight: number; kind: string };
export type GameEvent = { kind: EventKind; side: Side; text: string; who?: number; vs?: number }; // who: the player it's about; vs: the other one in it

export type Timing = "perfect" | "good" | "miss";
export type Zone = "rim" | "mid" | "three";

export type Game = {
  size: number; // players a side
  players: Player[]; // side 0 first (slots in order), then side 1
  ball: Ball;
  score: [number, number];
  target: number; // first to this wins
  rng: Rng;
  time: number;
  dead: number; // dead-ball time left (after a make or a violation)
  next: Side; // who inbounds when it ends
  poss: Side; // the team with the ball (or that last had it)
  shotClock: number;
  clockReset: boolean; // the shot hit the rim: the next team to touch it gets a fresh clock
  control: number; // the side-0 player you're steering
  solo: boolean; // one-character mode: you only ever steer `control` (no switching on a pass or on defence)
  calls: [Call, Call]; // each team's play and scheme
  practice: boolean; // the tutorial: no shot clock, nobody wins
  // the full game (Phase 8; `timed` games only): the clock, periods, fatigue and subs
  timed: boolean;
  period: number; // 0–3 quarters, 4+ overtime
  clock: number; // seconds left in the period
  inBreak: boolean; // between periods (the clock waits)
  periods: [number[], number[]]; // points by period
  rosters: [RosterEntry[], RosterEntry[]];
  autoSub: [boolean, boolean]; // tired players come off at stoppages
  names: [string, string];
  lastPass: { side: Side; by: number; to: number; at: number } | null; // for assists (roster entries)
  reboundable: boolean; // the loose ball came off a shot: whoever gets it, it's a rebound
  highlights: Highlight[];
  over: boolean;
  winner: Side | null;
  events: GameEvent[]; // this step's, for the view (sounds, popups)
  lastShot: { side: Side; zone: Zone; timing: Timing; chance: number; made: boolean } | null;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// ── ratings → game numbers ─────────────────────────────────────────────────────
const a = (pl: Player) => pl.p.attrs;
export const speedOf = (pl: Player) => lerp(LIVE.speedMin, LIVE.speedMax, a(pl).speed / 99);
export const reachOf = (pl: Player) => lerp(LIVE.reachMin, LIVE.reachMax, pl.p.heightPct / 100);
const jumpOf = (pl: Player) => lerp(LIVE.jumpMin, LIVE.jumpMax, (a(pl).finishing + a(pl).rebounding) / 198);
const grabOf = (pl: Player) => LIVE.grabBase + a(pl).rebounding * LIVE.grabSlope;
/** Special abilities (prototype): Flying and Dragon types have a double jump. */
export const canDoubleJump = (pl: Player) => pl.p.types.some((t) => t === "flying" || t === "dragon");
/** Top of the player's hands right now. */
export const handZ = (pl: Player) => pl.z + reachOf(pl);

export const zoneAt = (d: number): Zone => (d < LIVE.rimRange ? "rim" : d >= COURT.three ? "three" : "mid");

/** Half-width of the green zone (share of the meter): bigger with the rating, smaller when contested or deep. */
export function shotWindow(rating: number, contest: number, d: number) {
  const w = lerp(LIVE.windowMin, LIVE.windowMax, rating / 99) * (1 - contest * LIVE.contestShrink);
  return Math.max(0.02, w - Math.max(0, d - LIVE.deepFrom * COURT.scale) * LIVE.deepShrink); // "deep" moves with the arc
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

export const interceptChance = (perimeterD: number, passing: number) =>
  clamp(LIVE.interceptBase + (perimeterD - passing) * LIVE.interceptSlope, 0.02, 0.45);

// ── who's who ─────────────────────────────────────────────────────────────────
export const team = (g: Game, side: Side) => g.players.filter((p) => p.side === side);
/** The player holding the ball (not while it's in the air). */
export const handlerOf = (g: Game) => (g.ball.holder != null && !g.ball.flight ? g.players[g.ball.holder] : null);
const holds = (g: Game, pl: Player) => g.ball.holder === pl.i && !g.ball.flight;
const sideOf = (g: Game, i: number) => g.players[i].side;
/** The opponent nearest a spot. */
function nearestFoe(g: Game, pl: Player) {
  let best: Player | null = null;
  for (const q of g.players) if (q.side !== pl.side && (!best || dist(q, pl) < dist(best, pl))) best = q;
  return best!;
}

/** How hard the defence is contesting the player with the ball (0 open – 1 smothered): the closest contest. */
export function contestOn(g: Game, shooter: Player) {
  const hoop = hoopOf(shooter.side);
  let c = 0;
  for (const def of g.players) {
    if (def.side === shooter.side) continue;
    const d = dist(def, shooter);
    if (d >= LIVE.contestRange) continue;
    // a defender behind the shooter barely bothers the shot
    const ahead = (def.x - shooter.x) * (hoop.x - shooter.x) + (def.y - shooter.y) * (hoop.y - shooter.y) > 0 ? 1 : 0.4;
    c = Math.max(c, (1 - d / LIVE.contestRange) * ahead);
  }
  return c;
}

/** The green zone the player would get if they shot right now (the view draws it on the meter): bigger on fire. */
export function meterWindow(g: Game, pl: Player) {
  const d = dist(pl, hoopOf(pl.side));
  const zone = zoneAt(d);
  return shotWindow(zone === "rim" ? a(pl).finishing : a(pl).shooting, contestOn(g, pl), d) * (pl.onFire ? LIVE.fireWindow : 1);
}

// ── where everyone stands ───────────────────────────────────────────────────────
/** Offensive spots by team size: [across from the middle, out from the hoop] in metres, in lineup order.
 *  5: PG top, SG and SF on the wings, PF in the corner, C on the low block. */
const SPOTS: Record<number, [number, number][]> = {
  1: [[0, 6]],
  3: [[0, 7.4], [-5.4, 4.8], [2.6, 1.8]],
  5: [[0, 7.6], [5.3, 5.2], [-5.3, 5.2], [6.4, 1.2], [-2.6, 1.8]],
};
/** Where a player stands on offence when nothing's happening (spacing). */
export function spotOf(side: Side, slot: number, size: number) {
  const [across, out] = ((SPOTS[size] ?? SPOTS[5])[slot] ?? [0, 6]).map((v) => v * COURT.scale); // spots grow with the court
  const hoop = hoopOf(side);
  return { x: COURT.w / 2 + across, y: hoop.y + (side === 0 ? -out : out) };
}

// ── setting up ────────────────────────────────────────────────────────────────
function player(i: number, side: Side, slot: number, p: RatedPokemon, x: number, y: number): Player {
  return {
    i, r: slot, home: slot, sprinting: false,
    side, slot, p, x, y, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: side === 0 ? 1 : -1, turbo: 1, act: "free", actT: 0,
    crossCool: 0, stealCool: 0, held: false, wind: 0, dunkFrom: null, dunkTested: [], screening: false, slow: 0,
    screenedAt: -Infinity, streak: 0, onFire: false, doubled: false,
  };
}

/** Options for a full game: `timed` plays 4 quarters (plus overtime) instead of first to a score, with fatigue and
 *  subs. Benches and lineup slots (for the box score) are the rest of each roster. */
export type GameOptions = {
  timed?: boolean;
  practice?: boolean; // the tutorial: no shot clock, nobody wins
  names?: [string, string];
  youSlots?: number[]; // lineup slot of each player on court (default 0, 1, 2…)
  cpuSlots?: number[];
  youBench?: { p: RatedPokemon; slot: number }[];
  cpuBench?: { p: RatedPokemon; slot: number }[];
};

/** A new game, `you.length` a side (1, 3 or 5): your point guard starts with the ball at your end, the CPU waits
 *  between you and its hoop. */
export function newGame(you: RatedPokemon[], cpu: RatedPokemon[], seed: number, o: GameOptions = {}): Game {
  const size = you.length;
  const across = size === 1 ? [0] : size === 3 ? [0, -4.5, 4.5] : [0, 4.5, -4.5, 6, -6];
  const players: Player[] = [];
  const k = COURT.scale; // starting spots grow with the court
  you.forEach((p, s) => players.push(player(players.length, 0, s, p, COURT.w / 2 + across[s] * k, (s === 0 ? 3 : 7) * k)));
  cpu.forEach((p, s) => players.push(player(players.length, 1, s, p, COURT.w / 2 + across[s] * k, (s === 0 ? 11 : 13) * k)));
  const roster = (court: RatedPokemon[], slots: number[] | undefined, bench: { p: RatedPokemon; slot: number }[] = []) => [
    ...court.map((p, k) => ({ p, slot: slots?.[k] ?? k, energy: 100, line: newLine(p.id, slots?.[k] ?? k) })),
    ...bench.map(({ p, slot }) => ({ p, slot, energy: 100, line: newLine(p.id, slot) })),
  ];
  return {
    size, players, ball: { holder: 0, x: COURT.w / 2, y: 3 * k, z: 0, flight: null }, score: [0, 0],
    target: o.timed || o.practice ? Infinity : LIVE.targetBySize[size] ?? LIVE.targetScore, rng: makeRng(seed), time: 0, dead: 0,
    practice: !!o.practice,
    next: 0, poss: 0, shotClock: LIVE.shotClock, clockReset: false, control: 0, solo: false, over: false, winner: null, events: [],
    lastShot: null, calls: [0, 1].map(() => ({ play: null, playAt: 0, key: null, scheme: "MAN" as SchemeName })) as [Call, Call],
    timed: !!o.timed, period: 0, clock: SIM.quarterSec, inBreak: false, periods: [[0], [0]],
    rosters: [roster(you, o.youSlots, o.youBench), roster(cpu, o.cpuSlots, o.cpuBench)], autoSub: [true, true],
    names: o.names ?? ["YOU", "CPU"], lastPass: null, reboundable: false, highlights: [],
  };
}

/** A game between two full lineups (8 ids each): 5 a side starts PG–C, 3 a side PG, SF and C, 1 a side each team's
 *  best starter; everyone else is on the bench. Team games are timed (4 quarters, fatigue, subs); 1v1 is first to 11. */
export function lineupGame(
  home: { name: string; ids: (number | null)[] }, away: { name: string; ids: (number | null)[] },
  dex: Map<number, RatedPokemon>, size: 1 | 3 | 5, seed: number, practice = false, homePicks?: number[],
) {
  // homePicks: the lineup slots you chose on the select screen (in your order); the rest of the team is the bench
  const pick = (ids: (number | null)[], chosen?: number[]) => {
    const all = ids.map((id, slot) => ({ p: dex.get(id!)!, slot }));
    const valid = chosen?.length === size && new Set(chosen).size === size && chosen.every((s) => all[s]?.p);
    const slots = valid ? chosen! : size === 5 ? [0, 1, 2, 3, 4] : size === 3 ? [0, 2, 4] : [all.slice(0, 5).reduce((x, y) => (ovrOf(y.p) > ovrOf(x.p) ? y : x)).slot];
    return { court: slots.map((s) => all[s].p), slots, bench: size === 1 ? [] : all.filter((e) => !slots.includes(e.slot)) };
  };
  const h = pick(home.ids, homePicks), a2 = pick(away.ids);
  return newGame(h.court, a2.court, seed, {
    timed: size > 1 && !practice, practice, names: [home.name || "YOU", away.name || "CPU"],
    youSlots: h.slots, cpuSlots: a2.slots, youBench: h.bench, cpuBench: a2.bench,
  });
}

// ── box score, fatigue, subs ─────────────────────────────────────────────────────
/** The box-score line of whoever is playing this spot. */
export const lineOf = (g: Game, pl: Player) => g.rosters[pl.side][pl.r].line;
export const energyOf = (g: Game, pl: Player) => g.rosters[pl.side][pl.r].energy;
/** How fresh a player is: 1 fresh … SIM.tiredFloor exhausted (untimed games never tire). */
const fresh = (g: Game, pl: Player) => (g.timed ? SIM.tiredFloor + (1 - SIM.tiredFloor) * (energyOf(g, pl) / 100) : 1);
const note = (g: Game, kind: string, text: string, weight: number) => g.highlights.push({ period: g.period, text, weight, kind });

/** Swap a bench player (roster entry r) in for whoever is playing spot i. */
export function subIn(g: Game, i: number, r: number) {
  const pl = g.players[i], roster = g.rosters[pl.side];
  if (!roster[r] || g.players.some((q) => q.side === pl.side && q.r === r)) return false; // already on
  const out = roster[pl.r].p.name;
  pl.r = r;
  pl.p = roster[r].p;
  pl.streak = 0; // the fire belongs to whoever caught it
  pl.onFire = false;
  if (pl.act === "wind") pl.act = "free";
  emit(g, "sub", pl.side, `${roster[r].p.name.toUpperCase()} IN FOR ${out.toUpperCase()}`);
  return true;
}

/** At a stoppage: anyone tired sits for the freshest bench player, and rested starters come back (like the sim). */
export function substitute(g: Game, side: Side) {
  if (!g.timed) return;
  const roster = g.rosters[side];
  const onCourt = () => new Set(g.players.filter((q) => q.side === side).map((q) => q.r));
  for (const pl of team(g, side)) {
    if (pl.home !== pl.r && !onCourt().has(pl.home) && roster[pl.home].energy >= 90) {
      subIn(g, pl.i, pl.home);
      continue;
    }
    if (roster[pl.r].energy >= SIM.subBelow) continue;
    const bench = roster.map((_, r) => r).filter((r) => !onCourt().has(r)).sort((x, y) => roster[y].energy - roster[x].energy);
    if (bench.length && roster[bench[0]].energy > roster[pl.r].energy + 15) subIn(g, pl.i, bench[0]);
  }
}

/** A stoppage: the benches make their changes. */
function stoppage(g: Game) {
  for (const s of [0, 1] as const) if (g.autoSub[s]) substitute(g, s);
}

/** Minutes, tiredness and rest for this step. */
function tire(g: Game, dt: number) {
  for (const s of [0, 1] as const) {
    const playing = new Set(team(g, s).map((q) => q.r));
    g.rosters[s].forEach((e, r) => {
      if (!playing.has(r)) e.energy = Math.min(100, e.energy + LIVE.recover * dt);
    });
  }
  for (const pl of g.players) {
    const e = g.rosters[pl.side][pl.r];
    e.line.sec += dt;
    if (!g.timed) continue;
    const drain = LIVE.drain * (1.5 - a(pl).stamina / 99) * (pl.sprinting ? LIVE.sprintDrain : 1);
    e.energy = Math.max(0, e.energy - drain * dt);
  }
}

/** The box scores so far, in the same shape the sim gives (lines in lineup-slot order). */
export function boxes(g: Game): [TeamBox, TeamBox] {
  return [0, 1].map((s) => ({
    name: g.names[s],
    lines: [...g.rosters[s]].sort((x, y) => x.slot - y.slot).map((e) => ({ ...e.line })),
    periods: g.timed ? [...g.periods[s]] : [g.score[s]],
  })) as [TeamBox, TeamBox];
}

const periodName = (p: number) => (p < 4 ? `Q${p + 1}` : p === 4 ? "OT" : `${p - 3}OT`);

/** Up to eight highlight lines from a list (the biggest moments, at most two of a kind, in game order), plus the top
 *  scorer. The same picking as the sim, so the results screen reads the same. */
export function pickHighlights(list: Highlight[], g: Game) {
  const perKind = new Map<string, number>();
  const picked = list
    .map((h, i) => ({ ...h, i }))
    .sort((x, y) => y.weight - x.weight || x.i - y.i)
    .filter((h) => {
      const n = perKind.get(h.kind) ?? 0;
      perKind.set(h.kind, n + 1);
      return n < 2;
    })
    .slice(0, 7)
    .sort((x, y) => x.i - y.i)
    .map((h) => `${periodName(h.period)} · ${h.text}`);
  const lines = g.rosters.flatMap((r) => r.map((e) => e));
  const top = lines.reduce((x, y) => (y.line.pts > x.line.pts ? y : x));
  if (top.line.pts > 0) picked.push(`${top.p.name} led all scorers with ${top.line.pts}.`);
  return picked;
}

/** The finished (or current) game as a result for the results screen. */
export const liveResult = (g: Game) => ({ teams: boxes(g), highlights: pickHighlights(g.highlights, g) });

// ── the game clock ──────────────────────────────────────────────────────────────
/** Run the clock; at zero (once any shot in the air has landed) the period ends. */
function tickClock(g: Game, dt: number) {
  if (!g.timed || g.inBreak) return;
  g.clock = Math.max(0, g.clock - dt);
  if (g.clock > 0 || g.ball.flight?.kind === "shot") return;
  const [a0, a1] = g.score;
  emit(g, "period", 0, "BUZZER");
  if (g.period >= 3 && a0 !== a1) {
    g.over = true;
    g.winner = a0 > a1 ? 0 : 1;
    emit(g, "over", g.winner, g.winner === 0 ? "YOU WIN!" : "YOU LOSE");
    return;
  }
  g.period++;
  g.clock = g.period < 4 ? SIM.quarterSec : SIM.overtimeSec;
  for (const p of g.periods) p[g.period] = 0;
  emit(g, "period", 0, g.period < 4 ? `END OF Q${g.period}` : g.period === 4 ? "OVERTIME!" : `${g.period - 3}OT!`);
  // a short break, then the next period starts with an inbound (the teams take turns)
  g.inBreak = true;
  g.dead = LIVE.periodBreak;
  g.next = (g.period % 2) as Side;
  g.shotClock = LIVE.shotClock;
  const h = handlerOf(g);
  if (h?.act === "wind") h.act = "free";
  const b = g.ball;
  b.holder = null;
  b.flight = {
    kind: "dead", x0: b.x, y0: b.y, z0: Math.max(b.z, 1), x1: b.x, y1: b.y, z1: 0, peak: Math.max(b.z, 1), t: 0, dur: 0.4,
    made: false, points: 2, by: -1, to: null, tested: [],
  };
  for (const c of g.calls) c.play = c.key = null;
  stoppage(g);
}

// ── plays and schemes ───────────────────────────────────────────────────────────
/** The team's best big (Finishing + Strength, among its last two spots) or its best player. */
export function keyPlayer(g: Game, side: Side, who: "big" | "star") {
  const mates = team(g, side);
  if (who === "star") return mates.reduce((p, q) => (ovrOf(q.p) > ovrOf(p.p) ? q : p));
  const bigs = mates.length > 2 ? mates.slice(-2) : mates.slice(-1);
  const power = (q: Player) => a(q).finishing + a(q).strength;
  return bigs.reduce((p, q) => (power(q) > power(p) ? q : p));
}

/** Call an offensive play for this possession (null: free play). One-a-side games have none. */
export function callPlay(g: Game, side: Side, play: PlayName | null) {
  const c = g.calls[side];
  if (g.size === 1) play = null;
  c.play = play;
  c.playAt = g.time;
  c.key = play ? keyPlayer(g, side, PLAY[play].key).i : null;
  emit(g, "call", side, play ?? "FREE PLAY");
}

/** Change a team's defence. */
export function callScheme(g: Game, side: Side, scheme: SchemeName) {
  if (g.calls[side].scheme === scheme) return;
  g.calls[side].scheme = scheme;
  emit(g, "call", side, scheme);
}

/** How long the team's play has been running (Infinity if none). */
export const playTime = (g: Game, side: Side) => (g.calls[side].play ? g.time - g.calls[side].playAt : Infinity);

// ── one step ──────────────────────────────────────────────────────────────────
/** Move the game on by dt seconds. inputs[i] is what player i asks for (the view gives yours to g.control). */
export function step(g: Game, inputs: Input[], dt: number) {
  g.events = [];
  if (g.over) return;
  g.time += dt;
  if (g.dead > 0) {
    g.dead -= dt;
    if (g.dead <= 0) {
      g.inBreak = false;
      inbound(g, g.next);
    }
  } else if (g.ball.flight?.kind !== "shot" && !g.practice) {
    g.shotClock -= dt; // a shot already in the air beats the buzzer
    if (g.shotClock <= 0) violation(g);
  }
  for (const c of g.calls) if (c.play && g.time - c.playAt > PLAY[c.play].length * COURT.scale) c.play = c.key = null; // ran its course
  for (const pl of g.players) {
    const inp = inputs[pl.i] ?? NO_INPUT;
    movePlayer(g, pl, g.dead > 0 ? { ...inp, shoot: false, steal: false, cross: false, passTo: null, screen: false } : inp, dt);
  }
  bumpApart(g);
  screens(g);
  moveBall(g, dt);
  tire(g, dt);
  if (!g.over) tickClock(g, dt);
}

/** A defender (without the ball) who runs into a player setting a screen is held up for a moment. */
function screens(g: Game) {
  for (const s of g.players) {
    if (!s.screening) continue;
    for (const d of g.players) {
      if (d.side === s.side || holds(g, d) || d.act !== "free" || g.time - d.screenedAt < 1.5) continue;
      if (dist(d, s) > LIVE.screenRange || Math.hypot(d.vx, d.vy) < 1) continue;
      d.slow = LIVE.screenTime;
      d.screenedAt = g.time;
      d.vx *= 0.2;
      d.vy *= 0.2;
      emit(g, "screen", s.side, "SCREEN!");
    }
  }
}

const emit = (g: Game, kind: EventKind, side: Side, text: string, who?: number, vs?: number) => g.events.push({ kind, side, text, who, vs });

function movePlayer(g: Game, pl: Player, inp: Input, dt: number) {
  pl.actT -= dt;
  pl.crossCool = Math.max(0, pl.crossCool - dt);
  pl.stealCool = Math.max(0, pl.stealCool - dt);
  pl.slow = Math.max(0, pl.slow - dt);
  // a screen only counts while you're planted (no ball, on the floor, barely moving)
  pl.screening = inp.screen && !holds(g, pl) && pl.act === "free" && Math.hypot(pl.vx, pl.vy) < 1.2;
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
      // a special ability (prototype): Flying and Dragon types can jump again once in the air
      if (pressed && !hasBall && !pl.doubled && canDoubleJump(pl)) {
        pl.doubled = true;
        pl.vz = jumpOf(pl) * LIVE.doubleJump;
        // and push off the air the way the stick points (no stick: keep drifting as before)
        if (sx || sy) {
          const sp = Math.max(Math.hypot(pl.vx, pl.vy), speedOf(pl) * LIVE.doubleSteer);
          pl.vx = sx * sp;
          pl.vy = sy * sp;
        }
        emit(g, "move", pl.side, "DOUBLE JUMP", pl.i);
      }
      pl.vz -= LIVE.gravity * dt;
      pl.z += pl.vz * dt;
      if (pl.z <= 0) {
        pl.z = pl.vz = 0;
        pl.act = "free";
        pl.doubled = false;
      }
      break;
    case "wind":
      want = 0; // set your feet
      pl.wind += dt;
      if (!hasBall) pl.act = "free"; // stripped mid-shot
      else if (released || pl.wind >= LIVE.meterTime * LIVE.meterOver) shoot(g, pl);
      break;
    case "dunk":
      dunkStep(g, pl);
      return;
    case "cross":
      control = false;
      if (pl.actT <= 0) pl.act = "free";
      break;
    case "free": {
      const target = inp.passTo != null ? g.players[inp.passTo] : null;
      if (hasBall && pressed) {
        if (inp.turbo && dist(pl, hoopOf(pl.side)) < LIVE.dunkRange) return startDunk(pl);
        pl.act = "wind";
        pl.wind = 0;
        want = 0;
      } else if (hasBall && target && target.side === pl.side && target !== pl) {
        passBall(g, pl, target);
      } else if (hasBall && inp.steal) {
        const to = facedTeammate(g, pl, sx, sy);
        if (to) passBall(g, pl, to);
      } else if (hasBall && inp.cross && pl.crossCool <= 0) {
        crossover(g, pl, sx, sy);
        control = false;
      } else if (!hasBall && pressed) {
        pl.act = "air"; // jump: block or rebound
        pl.vz = jumpOf(pl);
        control = false;
        // aimed for you: drift toward a shot going up nearby (keeping any speed you had: a sprint stays a sprint).
        // Only for the player you steer: it's an aid for you, and on the CPU it made your shots get swatted a lot
        const t = pl.side === 0 && pl.i === g.control ? blockTarget(g, pl) : null;
        if (t) {
          const dx = t.x - pl.x, dy = t.y - pl.y, d = Math.hypot(dx, dy) || 1;
          const v = Math.max(Math.hypot(pl.vx, pl.vy), Math.min(LIVE.blockNudge, d / 0.4));
          pl.vx = (dx / d) * v;
          pl.vy = (dy / d) * v;
        }
      } else if (!hasBall && inp.steal && pl.side === 0 && pl.i === g.control && g.solo) {
        const h = handlerOf(g); // one-character mode: the pass key calls for the ball
        if (h && h.side === 0 && h.act === "free" && !g.ball.flight) passBall(g, h, pl);
      } else if (!hasBall && inp.steal && pl.side === 0 && pl.i === g.control) {
        switchControl(g); // you: the pass key switches on defence (like the big basketball games)
      } else if (!hasBall && pl.stealCool <= 0 && (pl.side === 0 && pl.i === g.control ? inp.cross : inp.steal)) {
        trySteal(g, pl); // you steal with the crossover key; the CPU's brains still say steal
        control = false;
      }
      break;
    }
  }

  pl.sprinting = false;
  if (control) {
    const turbo = inp.turbo && pl.turbo > 0 && len > 0.1;
    pl.sprinting = turbo && !pl.onFire; // on fire, sprinting is free
    pl.turbo = clamp(pl.turbo + (pl.sprinting ? -LIVE.turboDrain : LIVE.turboRegen) * dt, 0, 1);
    const legs = g.timed ? LIVE.tiredSpeed + (1 - LIVE.tiredSpeed) * (energyOf(g, pl) / 100) : 1; // tired legs
    const top = speedOf(pl) * want * legs * (hasBall ? LIVE.dribbleSlow : 1) * (turbo ? LIVE.turboBoost : 1) * (pl.slow > 0 ? LIVE.screenSlow : 1);
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
  const ps = g.players;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const p = ps[i], q = ps[j];
      if (p.act === "dunk" || q.act === "dunk") continue;
      const d = dist(p, q);
      if (d >= LIVE.bump || d === 0) continue;
      const push = (LIVE.bump - d) / 2, ux = (q.x - p.x) / d, uy = (q.y - p.y) / d;
      p.x = clamp(p.x - ux * push, 0.3, COURT.w - 0.3);
      p.y = clamp(p.y - uy * push, 0.3, COURT.l - 0.3);
      q.x = clamp(q.x + ux * push, 0.3, COURT.w - 0.3);
      q.y = clamp(q.y + uy * push, 0.3, COURT.l - 0.3);
    }
}

// ── passing and control ─────────────────────────────────────────────────────────
/** The teammate most in the direction you're pushing (or facing), nearer ones first. */
export function facedTeammate(g: Game, pl: Player, sx = 0, sy = 0) {
  const dx = sx || sy ? sx : pl.fx, dy = sx || sy ? sy : pl.fy;
  let best: Player | null = null, bestScore = -Infinity;
  for (const q of g.players) {
    if (q.side !== pl.side || q === pl) continue;
    const d = dist(q, pl) || 0.01;
    const score = ((q.x - pl.x) * dx + (q.y - pl.y) * dy) / d - d * 0.03; // how well lined up, a bit for nearness
    if (score > bestScore) {
      best = q;
      bestScore = score;
    }
  }
  return best;
}

/** Is a defender standing in the lane between two players (not counting the passer's own man, right on him)? */
function inLane(g: Game, from: Player, to: Player) {
  const dx = to.x - from.x, dy = to.y - from.y, len2 = dx * dx + dy * dy || 1;
  return g.players.some((q) => {
    if (q.side === from.side || dist(q, from) < 1.5) return false;
    const t = Math.max(0, Math.min(1, ((q.x - from.x) * dx + (q.y - from.y) * dy) / len2));
    return t < 0.95 && Math.hypot(from.x + dx * t - q.x, from.y + dy * t - q.y) < 1;
  });
}

/** Throw it to a teammate, leading them a little: a lob over the top if a defender's in the lane (slower, but it can
 *  only be picked off where it comes down). Weak passers are less accurate; your control follows the ball. */
export function passBall(g: Game, from: Player, to: Player) {
  const d = dist(from, to);
  const lob = inLane(g, from, to);
  const speed = lerp(LIVE.passMin, LIVE.passMax, a(from).passing / 99);
  const dur = Math.max(0.18, d / speed) * (lob ? 1.35 : 1);
  const off = g.rng.next() * (1 - a(from).passing / 99) * LIVE.passError * d, ang = g.rng.next() * Math.PI * 2;
  const tx = clamp(to.x + to.vx * dur * 0.8 + Math.cos(ang) * off, 0.4, COURT.w - 0.4);
  const ty = clamp(to.y + to.vy * dur * 0.8 + Math.sin(ang) * off, 0.4, COURT.l - 0.4);
  g.ball.holder = null;
  // to a good finisher already near the rim (and not a hand-off): an alley-oop, lobbed to just above the rim, where the
  // receiver will be at the top of the leap
  const hoop = hoopOf(to.side), oop = to.act === "free" && dist(to, hoop) < LIVE.oopRange && d > 2.5 && a(to).finishing >= LIVE.oopFinishing;
  if (oop) {
    const z1 = COURT.rimZ + LIVE.dunkApex;
    g.ball.flight = {
      kind: "pass", x0: from.x, y0: from.y, z0: 1.2, x1: hoop.x, y1: hoop.y + (to.side === 0 ? -0.35 : 0.35), z1, peak: z1 + 1.2 + d * 0.04,
      t: 0, dur: Math.max(0.55, (d / speed) * 1.25), made: false, points: 2, by: from.i, to: to.i, tested: [], oop: true,
    };
    g.lastPass = { side: from.side, by: from.r, to: to.r, at: g.time };
    emit(g, "pass", from.side, "");
    emit(g, "move", to.side, "ALLEY-OOP!", to.i, from.i);
    return;
  }
  g.ball.flight = {
    kind: "pass", x0: from.x, y0: from.y, z0: 1.2, x1: tx, y1: ty, z1: 1.1, peak: lob ? 3.6 + d * 0.05 : 1.4 + d * 0.04, t: 0, dur,
    made: false, points: 2, by: from.i, to: to.i, tested: [],
  };
  // (you keep the passer until the catch: gain() hands you the receiver then)
  g.lastPass = { side: from.side, by: from.r, to: to.r, at: g.time };
  emit(g, "pass", from.side, "");
}

/** Put the ball in player i's hands, live, right now (the tutorial sets up its drills with this). */
export function giveBall(g: Game, i: number) {
  g.dead = 0;
  g.inBreak = false;
  g.ball.flight = null;
  const pl = g.players[i];
  pl.act = "free";
  pl.z = pl.vz = 0;
  gain(g, pl); // (if it's theirs, you take your defender nearest the ball)
}

/** On defence: take over your defender nearest the ball (other than the one you have). */
export function switchControl(g: Game) {
  if (g.solo) return;
  let best: Player | null = null;
  for (const q of g.players)
    if (q.side === 0 && q.i !== g.control && (!best || dist(q, g.ball) < dist(best, g.ball))) best = q;
  if (best) g.control = best.i;
}

// ── shots, dunks, steals ────────────────────────────────────────────────────────
/** Where a block jump should drift: an opponent winding up or dunking nearby, or their shot just in the air. */
function blockTarget(g: Game, pl: Player): { x: number; y: number } | null {
  const h = handlerOf(g);
  if (h && h.side !== pl.side && (h.act === "wind" || h.act === "dunk") && dist(h, pl) < LIVE.nudgeRange) return h;
  const f = g.ball.flight;
  if (f?.kind === "shot" && g.players[f.by].side !== pl.side && f.t < LIVE.blockWindow && dist(g.ball, pl) < LIVE.nudgeRange) return g.ball;
  return null;
}

/** A chase-down: the defender is coming in fast from behind the shooter (further from the hoop, moving). */
const chasing = (def: Player, shooter: Player) =>
  dist(def, hoopOf(shooter.side)) > dist(shooter, hoopOf(shooter.side)) && Math.hypot(def.vx, def.vy) > LIVE.chaseSpeed;

/** How much of the make chance is left from long range (1 inside longFrom): exponential falloff over a distance
 *  that grows with Shooting and Strength on a steep curve. */
export function longShotFactor(shooting: number, strength: number, d: number) {
  const from = LIVE.longFrom * COURT.scale;
  if (d <= from) return 1;
  const skill = Math.max(0, Math.min(1, (0.6 * shooting + 0.4 * strength) / 99));
  const fall = LIVE.longFallMin + (LIVE.longFallMax - LIVE.longFallMin) * skill ** LIVE.longPower;
  return Math.exp(-(d - from) / fall);
}

/** The quick shot's make chance: a timed shot's, plus a bonus right at the rim (fading out by quickCloseTo), less a
 *  penalty that grows with distance: a quick tap is great up close and poor from deep. */
export const quickChance = (zone: Zone, rating: number, contest: number, d: number) =>
  clamp(
    makeChance(zone, rating, "good", contest)
      + LIVE.quickClose * Math.max(0, 1 - (d - 1) / Math.max(0.1, LIVE.quickCloseTo - 1))
      - Math.min(LIVE.quickMax, Math.max(0, d - 1.5) * LIVE.quickSlope),
    0.02, 0.97,
  );

function shoot(g: Game, pl: Player) {
  const hoop = hoopOf(pl.side);
  const d = dist(pl, hoop);
  const zone = zoneAt(d);
  const rating = (zone === "rim" ? a(pl).finishing : a(pl).shooting) * fresh(g, pl);
  const contest = contestOn(g, pl);
  const meter = pl.wind / LIVE.meterTime, win = shotWindow(rating, contest, d) * (pl.onFire ? LIVE.fireWindow : 1);
  const line = lineOf(g, pl);
  line.fga++;
  if (zone === "three") line.tpa++;
  const timing = timingOf(meter, win);
  // let go well short of the line and there isn't the power to reach: it drops short, the weaker the shorter
  const weakBelow = 1 - win * LIVE.airballBelow;
  // a quick shot: K tapped and let go at once, no meter; fine up close, wild from deep (never an air ball)
  const quick = pl.wind < LIVE.quickTap;
  const short = !quick && meter < weakBelow;
  const base = short ? 0 : quick ? quickChance(zone, rating, contest, d) : makeChance(zone, rating, timing, contest);
  const chance = base * longShotFactor(a(pl).shooting * fresh(g, pl), a(pl).strength, d); // half/full court: rare
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
    points: zone === "three" ? 3 : 2, by: pl.i, to: null, tested: [], short,
  };
  emit(g, "release", pl.side, quick ? "QUICK" : timing === "perfect" ? "PERFECT" : timing === "good" ? "GOOD" : meter > 1 ? "LATE" : "EARLY");
}

function startDunk(pl: Player) {
  pl.act = "dunk";
  pl.actT = LIVE.dunkTime;
  pl.dunkFrom = { x: pl.x, y: pl.y };
  pl.dunkTested = [];
  pl.vx = pl.vy = 0;
}

/** Fly from where the dunk started to just in front of the rim and up; defenders can block it on the way. */
function dunkStep(g: Game, pl: Player) {
  const hoop = hoopOf(pl.side), from = pl.dunkFrom!;
  const s = clamp(1 - pl.actT / LIVE.dunkTime, 0, 1);
  const toward = pl.side === 0 ? -0.35 : 0.35; // stop just short of the rim, on the court side
  pl.x = lerp(from.x, hoop.x, s);
  pl.y = lerp(from.y, hoop.y + toward, s);
  pl.z = Math.sin(s * Math.PI * 0.5) * Math.max(0.3, COURT.rimZ + LIVE.dunkApex - reachOf(pl)); // easing up to the apex
  const has = holds(g, pl); // (an alley-oop: still in the air on its way)
  if (has) {
    g.ball.x = pl.x;
    g.ball.y = pl.y;
    g.ball.z = pl.z + reachOf(pl);
  }

  for (const def of g.players) {
    if (def.side === pl.side || def.act !== "air" || pl.dunkTested.includes(def.i)) continue;
    const chase = chasing(def, pl); // sprinting in from behind: more reach, a better chance
    if (dist(def, pl) >= (chase ? LIVE.chaseRange : LIVE.blockRange) || handZ(def) < g.ball.z - 0.3) continue;
    pl.dunkTested.push(def.i);
    if (g.rng.next() < blockChance(a(def).interiorD, a(pl).finishing) + (chase ? LIVE.chaseBonus : 0)) {
      pl.act = "air";
      pl.vz = 0;
      return blocked(g, def, g.ball, chase);
    }
  }
  if (pl.actT > 0 || !has) return; // an alley-oop hangs at the top until the lob arrives
  // at the rim: the roll
  const contest = contestOn(g, pl);
  const chance = clamp(makeChance("rim", a(pl).finishing * fresh(g, pl), "good", contest) + 0.1, 0.02, 0.97);
  lineOf(g, pl).fga++;
  const made = g.rng.next() < chance;
  g.lastShot = { side: pl.side, zone: "rim", timing: "good", chance, made };
  pl.act = "air";
  pl.vz = -LIVE.dunkSlam; // pulled down with it
  g.ball.holder = null;
  // the slam: from the apex straight down, speeding up all the way (a peak this high makes the arc a pure ease-in)
  const z0 = g.ball.z, z1 = made ? COURT.rimZ - 0.25 : COURT.rimZ;
  g.ball.flight = {
    kind: "shot", x0: g.ball.x, y0: g.ball.y, z0, x1: hoop.x, y1: hoop.y, z1,
    peak: (z0 + z1) / 2 + (z0 - z1) / 4, t: 0, dur: LIVE.dunkSlamTime, made, points: 2, by: pl.i, to: null,
    tested: g.players.map((q) => q.i), // too late to block now
  };
  emit(g, "release", pl.side, a(pl).finishing >= 70 ? "DUNK" : "LAYUP", pl.i);
}

function crossover(g: Game, pl: Player, sx: number, sy: number) {
  // burst the way the stick points, or sideways if it's centred
  let dx = sx, dy = sy;
  if (!dx && !dy) [dx, dy] = [-pl.fy, pl.fx];
  // pushing away from the hoop: a step-back, a hop straight back to make room for the shot
  const hoop = hoopOf(pl.side), hd = dist(pl, hoop) || 1;
  const stepBack = (dx * (hoop.x - pl.x) + dy * (hoop.y - pl.y)) / hd < -0.5;
  const top = speedOf(pl) * LIVE.crossBoost * (stepBack ? LIVE.stepBackBoost : 1);
  pl.vx = dx * top;
  pl.vy = dy * top;
  pl.act = "cross";
  pl.actT = LIVE.crossTime;
  pl.crossCool = LIVE.crossCool;
  if (stepBack) emit(g, "move", pl.side, "STEP BACK", pl.i);
  const def = nearestFoe(g, pl);
  const odds = (LIVE.anklesChance + (a(pl).handles - a(def).perimeterD) * 0.005) * (stepBack ? 0.5 : 1);
  if (def.act === "free" && dist(def, pl) < 1.8 && g.rng.next() < odds) {
    def.act = "stumble";
    def.actT = LIVE.ankles;
    emit(g, "ankles", pl.side, "ANKLES!", pl.i, def.i);
    note(g, "ankles", `${pl.p.name} breaks ${def.p.name}'s ankles!`, 2);
  }
}

function trySteal(g: Game, pl: Player) {
  pl.stealCool = LIVE.stealCool;
  const h = handlerOf(g);
  const canReach = h && h.side !== pl.side && dist(pl, h) < LIVE.stealRange && h.act !== "cross" && h.act !== "dunk";
  if (h && canReach && g.rng.next() < LIVE.stealBase + (a(pl).perimeterD - a(h).handles) * LIVE.stealSlope) {
    if (h.act === "wind") h.act = "free";
    lineOf(g, pl).stl++;
    lineOf(g, h).to++;
    note(g, "steal", `${pl.p.name} picks ${h.p.name}'s pocket!`, 2);
    gain(g, pl);
    emit(g, "steal", pl.side, "STEAL!", pl.i, h.i);
    return;
  }
  pl.act = "stumble";
  pl.actT = LIVE.stumble;
  emit(g, "whiff", pl.side, "");
}

function blocked(g: Game, def: Player, from: { x: number; y: number; z: number }, chase = false) {
  lineOf(g, def).blk++;
  const shooter = g.ball.flight ? g.players[g.ball.flight.by] : handlerOf(g);
  if (shooter) shooter.streak = 0; // a block ends the run too
  note(g, "block", `${def.p.name} swats ${shooter?.p.name ?? "it"} away!`, 3);
  g.reboundable = true;
  // swatted away from the hoop, back toward the court
  const hoop = hoopOf(other(def.side));
  const ang = Math.atan2(from.y - hoop.y, from.x - hoop.x) + (g.rng.next() - 0.5) * 1.6;
  const far = 3 + g.rng.next() * 2.5;
  loose(g, from, { x: from.x + Math.cos(ang) * far, y: from.y + Math.sin(ang) * far }, from.z + 0.8, 0.6);
  g.lastShot = g.lastShot && { ...g.lastShot, made: false };
  emit(g, "block", def.side, chase ? "CHASE-DOWN BLOCK!" : "BLOCKED!", def.i, shooter?.i);
}

function loose(g: Game, from: { x: number; y: number; z: number }, to: { x: number; y: number }, peak: number, dur: number) {
  g.ball.holder = null;
  g.ball.flight = {
    kind: "loose", x0: from.x, y0: from.y, z0: from.z, x1: clamp(to.x, 0.6, COURT.w - 0.6), y1: clamp(to.y, 0.6, COURT.l - 0.6),
    z1: 0, peak, t: 0, dur, made: false, points: 2, by: -1, to: null, tested: [],
  };
}

/** pl has the ball now. A change of hands (or the first touch after a shot hit the rim) restarts the shot clock.
 *  On offence your control follows the ball; when the CPU gets it you take the defender nearest it. */
function gain(g: Game, pl: Player) {
  const changed = pl.side !== g.poss;
  g.ball.holder = pl.i;
  g.ball.flight = null;
  g.ball.x = pl.x;
  g.ball.y = pl.y;
  if (changed || g.clockReset) g.shotClock = LIVE.shotClock;
  g.clockReset = false;
  g.reboundable = false;
  if (changed) {
    for (const c of g.calls) c.play = c.key = null; // a new possession: plays start over
    g.lastPass = null;
  }
  g.poss = pl.side;
  if (g.solo) return; // one-character mode: you stay who you are
  if (pl.side === 0) g.control = pl.i;
  else if (changed) {
    let best: Player | null = null;
    for (const q of g.players) if (q.side === 0 && (!best || dist(q, pl) < dist(best, pl))) best = q;
    if (best) g.control = best.i;
  }
}

/** The shot clock ran out: the other team's ball, from its own baseline. */
function violation(g: Game) {
  const h = handlerOf(g);
  if (h && h.act === "wind") h.act = "free";
  if (h) lineOf(g, h).to++;
  emit(g, "violation", g.poss, "SHOT CLOCK!");
  g.dead = LIVE.deadBall;
  g.next = other(g.poss);
  g.shotClock = LIVE.shotClock;
  const b = g.ball;
  b.holder = null;
  b.flight = {
    kind: "dead", x0: b.x, y0: b.y, z0: Math.max(b.z, 1), x1: b.x, y1: b.y, z1: 0, peak: Math.max(b.z, 1), t: 0, dur: 0.4,
    made: false, points: 2, by: -1, to: null, tested: [],
  };
  stoppage(g);
}

/** The team takes it out from under the hoop at its own end: one player inbounds it to the point guard. */
function inbound(g: Game, side: Side) {
  const baseY = side === 0 ? 0.8 : COURT.l - 0.8;
  const mates = team(g, side);
  // one-character mode: you never take it out yourself (you'd have to pass it straight away): you get it
  const you = g.solo && side === 0 && mates.length > 1 ? g.players[g.control] : null;
  const takers = you ? mates.filter((p) => p !== you) : mates;
  // whoever is nearest the baseline takes it out (the least teleporting)
  const inb = takers.reduce((p, q) => (dist(q, { x: COURT.w / 2, y: baseY }) < dist(p, { x: COURT.w / 2, y: baseY }) ? q : p));
  inb.x = COURT.w / 2 + (mates.length > 1 ? 1.5 : 0);
  inb.y = baseY;
  inb.z = inb.vz = inb.vx = inb.vy = 0;
  inb.act = "free";
  gain(g, inb);
  g.shotClock = LIVE.shotClock;
  const rec = you ?? mates.find((p) => p.slot === 0 && p !== inb) ?? mates.find((p) => p !== inb);
  if (rec) passBall(g, inb, rec);
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

    if (f.kind === "shot" && f.t < LIVE.blockWindow) {
      const sh = g.players[f.by];
      for (const def of g.players) {
        if (def.side === sh.side || def.act !== "air" || f.tested.includes(def.i)) continue;
        const chase = chasing(def, sh);
        if (dist(def, b) >= (chase ? LIVE.chaseRange : LIVE.blockRange) || handZ(def) < b.z - 0.2) continue;
        f.tested.push(def.i);
        const rating = zoneAt(dist(sh, hoopOf(sh.side))) === "rim" ? a(sh).finishing : a(sh).shooting;
        if (g.rng.next() < blockChance(a(def).interiorD, rating) + (chase ? LIVE.chaseBonus : 0)) return blocked(g, def, b, chase);
      }
    }
    if (f.kind === "pass") return passStep(g, f, s);
    if (f.kind === "loose" && grab(g)) return;
    if (s < 1) return;

    if (f.kind === "shot") {
      const side = sideOf(g, f.by);
      if (!f.made) g.players[f.by].streak = 0; // a miss ends the run (but not the fire)
      if (f.short) {
        // an air ball: it hits the floor and skips on a little way, loose for anyone
        const ux = f.x1 - f.x0, uy = f.y1 - f.y0, len = Math.hypot(ux, uy) || 1;
        loose(g, b, { x: b.x + (ux / len) * 1.2, y: b.y + (uy / len) * 1.2 }, 0.6, 0.35);
        g.reboundable = true;
        emit(g, "miss", side, "AIR BALL!");
        return;
      }
      if (f.made) {
        g.score[side] += f.points;
        g.periods[side][g.period] = (g.periods[side][g.period] ?? 0) + f.points;
        const shooter = g.players[f.by], line = lineOf(g, shooter);
        line.fgm++;
        line.pts += f.points;
        if (f.points === 3) line.tpm++;
        // an assist: the pass that set it up, a few seconds ago
        const lp = g.lastPass;
        if (lp && lp.side === side && lp.to === shooter.r && g.time - lp.at < 5) g.rosters[side][lp.by].line.ast++;
        g.lastPass = null;
        // ON FIRE: straight makes heat you up; the other team scoring cools them all down
        for (const q of g.players)
          if (q.side !== side) {
            q.streak = 0;
            q.onFire = false;
          }
        shooter.streak++;
        if (shooter.streak >= LIVE.fireAfter && !shooter.onFire) {
          shooter.onFire = true;
          emit(g, "fire", side, `${shooter.p.name.toUpperCase()} IS ON FIRE!`);
          note(g, "fire", `${shooter.p.name} catches fire!`, 3);
        }
        if (f.points === 3) note(g, "three", `${shooter.p.name} drains a three!`, 2);
        else if (f.dur < 0.2 && a(shooter).finishing >= 70) note(g, "dunk", `${shooter.p.name} throws it down!`, 2); // a dunk
        emit(g, "make", side, f.points === 3 ? "THREE!" : g.lastShot?.timing === "perfect" ? "SWISH!" : "SCORE!", f.by);
        if (g.score[side] >= g.target) {
          g.over = true;
          g.winner = side;
          emit(g, "over", side, side === 0 ? "YOU WIN!" : "YOU LOSE");
          return;
        }
        g.dead = LIVE.deadBall;
        g.next = other(side);
        b.flight = { ...f, kind: "dead", x0: b.x, y0: b.y, z0: b.z, z1: 0, peak: b.z, t: 0, dur: f.dur < 0.2 ? 0.25 : 0.4 }; // a slammed ball hits the floor fast
        stoppage(g);
      } else {
        // off the rim, back out toward the court; whoever gets it gets a fresh shot clock
        g.clockReset = true;
        g.reboundable = true;
        const ang = (side === 0 ? -Math.PI / 2 : Math.PI / 2) + (g.rng.next() - 0.5) * 2.4;
        const far = 1.5 + g.rng.next() * 3;
        loose(g, b, { x: b.x + Math.cos(ang) * far, y: b.y + Math.sin(ang) * far }, COURT.rimZ + 1.2, 0.75);
        emit(g, "miss", side, g.lastShot?.timing === "miss" ? "BRICK!" : "MISS");
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

/** A pass on its way: defenders in the lane get one try each to pick it off; the receiver catches it on arrival. */
function passStep(g: Game, f: Flight, s: number) {
  const b = g.ball, passer = g.players[f.by], rec = g.players[f.to!];
  const leaving = Math.hypot(b.x - f.x0, b.y - f.y0) < 1.2; // just out of the hands: thrown round the man on him
  for (const def of g.players) {
    if (leaving || def.side === passer.side || f.tested.includes(def.i) || def.act === "stumble") continue;
    if (dist(def, b) >= LIVE.interceptRange || handZ(def) < b.z) continue;
    f.tested.push(def.i);
    if (g.rng.next() < interceptChance(a(def).perimeterD, a(passer).passing)) {
      lineOf(g, def).stl++;
      lineOf(g, passer).to++;
      note(g, "steal", `${def.p.name} jumps the lane and picks it off!`, 2);
      gain(g, def);
      emit(g, "steal", def.side, "PICKED OFF!");
      return;
    }
  }
  if (f.oop) {
    if (rec.act === "free" && (1 - s) * f.dur <= LIVE.dunkTime) startDunk(rec); // take off: at the top as it arrives
    if (s < 1) return;
    if (rec.act === "dunk") return gain(g, rec); // caught in the air: dunkStep slams it
    const ux = f.x1 - f.x0, uy = f.y1 - f.y0, len = Math.hypot(ux, uy) || 1; // nobody went up for it
    return loose(g, b, { x: b.x + (ux / len) * 1.5, y: b.y + (uy / len) * 1.5 }, 0.6, 0.4);
  }
  const near = dist(rec, b) < LIVE.catchRange && rec.act !== "stumble" && handZ(rec) >= b.z;
  if (near && s > 0.5) return gain(g, rec);
  if (s < 1) return;
  // nobody there: it skips on, loose
  const ux = f.x1 - f.x0, uy = f.y1 - f.y0, len = Math.hypot(ux, uy) || 1;
  loose(g, b, { x: b.x + (ux / len) * 1.5, y: b.y + (uy / len) * 1.5 }, 0.6, 0.4);
}

/** Whoever can reach the loose ball takes it (the closest if several can). */
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
  if (g.reboundable) lineOf(g, best).reb++;
  gain(g, best);
  emit(g, "rebound", best.side, "");
  return true;
}
