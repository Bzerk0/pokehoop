// Plays and defensive schemes for the live game (PLAN.md §10, Phase 7), as data. The AI (ai.ts) reads them.
// Spots are [across, out] in metres from the hoop the team attacks: across + is to the right as you look up the
// court, out is toward half court. Times are seconds since the play was called.
import type { RatedPokemon } from "../types.ts";

export const PLAYS = ["PICK & ROLL", "ISOLATION", "POST UP", "MOTION"] as const;
export type PlayName = (typeof PLAYS)[number];
export const SCHEMES = ["MAN", "2-3 ZONE", "PRESS", "DOUBLE STAR"] as const;
export type SchemeName = (typeof SCHEMES)[number];
export type Spot = [number, number];

export type PlayDef = {
  about: string; // one line for the menu
  key: "big" | "star"; // who the play is built around: the best big (Finishing + Strength) or the best player
  length: number; // seconds before it breaks into free play
  ballToKey: boolean; // get the ball to the key player first
  /** Where the key player goes, by time: a spot, "screen" (beside the ball handler's defender) or "rim" (roll). */
  keyPath: { at: number; to: Spot | "screen" | "rim" }[];
  screen?: [number, number]; // the key player screens between these times
  handlerWait?: number; // the ball handler holds up top until then (waiting for the screen)
  spacers: Spot[]; // where everyone else stands, in lineup order
  passRate?: number; // how keen the ball handler is to pass (× the usual)
  rotate?: number; // motion: everyone moves on to the next spot every this many seconds
};

export const PLAY: Record<PlayName, PlayDef> = {
  "PICK & ROLL": {
    about: "BIG SCREENS UP TOP, THEN ROLLS TO THE RIM",
    key: "big",
    length: 7,
    ballToKey: false,
    keyPath: [{ at: 0, to: "screen" }, { at: 2.4, to: "rim" }],
    screen: [0.5, 2.4],
    handlerWait: 1.7,
    spacers: [[-6.4, 1.2], [6.4, 1.2], [-5.3, 5.6]],
  },
  ISOLATION: {
    about: "CLEAR ONE SIDE: YOUR STAR GOES 1-ON-1",
    key: "star",
    length: 7,
    ballToKey: true,
    keyPath: [{ at: 0, to: [4.2, 6.6] }],
    spacers: [[-6.6, 1.0], [-6.0, 5.4], [-2.2, 8.4], [-6.6, 3.4]],
    passRate: 0.15,
  },
  "POST UP": {
    about: "FEED THE BIG ON THE BLOCK; HE BACKS DOWN",
    key: "big",
    length: 8,
    ballToKey: true,
    keyPath: [{ at: 0, to: [2.2, 1.8] }],
    spacers: [[0, 7.6], [-5.3, 5.2], [6.4, 5.0], [-6.4, 1.2]],
  },
  MOTION: {
    about: "KEEP MOVING; THE BALL FINDS THE OPEN MAN",
    key: "star",
    length: 10,
    ballToKey: false,
    keyPath: [],
    spacers: [],
    rotate: 2.4,
    passRate: 2,
  },
};

export const SCHEME_ABOUT: Record<SchemeName, string> = {
  MAN: "EVERYONE GUARDS THEIR OWN MAN",
  "2-3 ZONE": "GUARD AN AREA: TWO UP TOP, THREE UNDER",
  PRESS: "TRAP ALL OVER THE COURT: STEALS, BUT RISKY",
  "DOUBLE STAR": "SEND TWO AT THEIR BEST PLAYER",
};

/** 2-3 zone spots [across, out] from the hoop being defended, by lineup slot (5 a side; 3 a side uses ZONE3). */
export const ZONE: Spot[] = [[-2.6, 6.0], [2.6, 6.0], [-4.2, 2.0], [4.2, 2.0], [0, 1.4]];
export const ZONE3: Spot[] = [[0, 5.6], [-3.6, 2.0], [3.6, 2.0]];

export const ovrOf = (p: RatedPokemon) => p.ovr[p.best];

/** How much the CPU likes each play for this lineup (and "NONE" for free play), from its ratings. Each play gets a
 *  score from the players it needs; the lineup's best fit is the favourite and each point behind it costs a little,
 *  so every team leans on what it's built for but still mixes it up. */
export function playWeights(team: RatedPokemon[]): Record<PlayName | "NONE", number> {
  const avg = (f: (p: RatedPokemon) => number) => team.reduce((s, p) => s + f(p), 0) / team.length;
  const bigs = team.slice(-2);
  const big = Math.max(...bigs.map((p) => (p.attrs.finishing + p.attrs.strength) / 2));
  const star = team.reduce((p, q) => (ovrOf(q) > ovrOf(p) ? q : p));
  const score: Record<PlayName, number> = {
    "PICK & ROLL": (team[0].attrs.handles + big) / 2, // a point guard who can handle it and a big who can finish
    ISOLATION: (star.attrs.handles + star.attrs.shooting) / 2 + (ovrOf(star) - avg(ovrOf)) * 0.5 - 4, // a real star
    "POST UP": big,
    MOTION: avg((p) => p.attrs.passing) + 4, // everyone can pass
  };
  const best = Math.max(...Object.values(score));
  const w = (s: number) => Math.exp((s - best) / 9);
  const avgScore = Object.values(score).reduce((a, b) => a + b, 0) / PLAYS.length;
  return {
    "PICK & ROLL": w(score["PICK & ROLL"]),
    ISOLATION: w(score.ISOLATION),
    "POST UP": w(score["POST UP"]),
    MOTION: w(score.MOTION),
    NONE: w(avgScore) * 0.8, // freelancing: as likely as an average play
  };
}
