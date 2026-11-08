// HOW TO PLAY (PLAN.md Phase 9: "a new player learns the game in under 2 min"): a 3v3 practice game in short steps.
// Each step sets up the court, says what to press, gives a hint if you're stuck, and moves on when you've done it.
// The CPU stands still except in the defence step.
import { dist, giveBall, hoopOf, spotOf, type Game, type GameEvent } from "../core/live/game.ts";

/** What a step can check: how long it's been going, how far you've run and sprinted, and what just happened. */
type Check = { t: number; sprint: number; moved: number; events: GameEvent[]; g: Game };
type Step = {
  title: string;
  how: string; // what to press
  hint: string; // shown if it's taking a while
  cpu?: boolean; // the CPU plays (the defence step)
  setup?: (g: Game) => void;
  done: (c: Check) => boolean;
};

const released = (c: Check, ...texts: string[]) => c.events.some((e) => e.kind === "release" && e.side === 0 && texts.includes(e.text));

/** Your point guard with the ball, `d` metres from the hoop; teammates on their spots; the CPU out of the way. */
function ready(g: Game, d: number) {
  const hoop = hoopOf(0);
  for (const p of g.players) {
    const s = p.side === 0 ? spotOf(0, p.slot, g.size) : { x: 1 + p.slot * 6.5, y: 2 }; // CPU parked at the far end
    Object.assign(p, { x: s.x, y: s.y, vx: 0, vy: 0, streak: 0 });
  }
  Object.assign(g.players[0], { x: hoop.x, y: hoop.y - d });
  giveBall(g, 0);
}

/** Their point guard brings it up; you defend. */
function theirBall(g: Game) {
  for (const p of g.players) {
    const s = p.side === 1 ? spotOf(1, p.slot, g.size) : { x: spotOf(1, p.slot, g.size).x, y: spotOf(1, p.slot, g.size).y - 1.5 };
    Object.assign(p, { x: s.x, y: s.y + (p.side === 1 && p.slot === 0 ? 4 : 0), vx: 0, vy: 0 });
  }
  giveBall(g, g.players.find((p) => p.side === 1 && p.slot === 0)!.i);
}

// The words say your own keys: {action} is swapped for whatever key it's bound to (keys.ts) when it's shown.
export const STEPS: Step[] = [
  { title: "MOVE", how: "ARROWS OR {up}{left}{down}{right} TO RUN AROUND", hint: "TRY RUNNING UP THE COURT", done: (c) => c.moved > 4 },
  { title: "SPRINT", how: "HOLD {turbo} WHILE RUNNING TO SPRINT", hint: "SPRINTING USES THE GREEN BAR", done: (c) => c.sprint > 0.8 },
  {
    title: "SHOOT",
    how: "HOLD {shoot} (OR SPACE), LET GO AT THE WHITE LINE",
    hint: "LET GO JUST AS THE GOLD BAR REACHES THE LINE",
    setup: (g) => ready(g, 5),
    done: (c) => released(c, "GOOD", "PERFECT"),
  },
  {
    title: "DUNK",
    how: "RUN AT THE RIM, HOLD {turbo} AND PRESS {shoot}",
    hint: "GET RIGHT UNDER THE HOOP FIRST",
    setup: (g) => ready(g, 6),
    done: (c) => released(c, "DUNK", "LAYUP"),
  },
  {
    title: "PASS",
    how: "{pass} PASSES TO WHO YOU FACE, 1-3 TO A TEAMMATE",
    hint: "THE GOLD NUMBERS ARE YOUR TEAMMATES",
    setup: (g) => ready(g, 8),
    done: (c) => c.events.some((e) => e.kind === "pass" && e.side === 0),
  },
  {
    title: "CALL A PLAY",
    how: "PRESS {plays}, PICK A PLAY WITH THE ARROWS, ENTER",
    hint: "ON DEFENCE, {plays} PICKS A DEFENCE INSTEAD",
    setup: (g) => ready(g, 8),
    done: (c) => c.events.some((e) => e.kind === "call" && e.side === 0),
  },
  {
    title: "DEFEND",
    how: "{cross} NEAR THE BALL STEALS, {shoot} JUMPS TO BLOCK",
    hint: "{pass} SWITCHES TO WHOEVER IS NEAREST THE BALL",
    cpu: true,
    setup: theirBall,
    done: (c) => (c.g.poss === 0 && c.t > 0.5) || c.t > 30, // get it back (or just survive 30 seconds)
  },
];

export class Tutorial {
  i = 0;
  private t = 0;
  private sprint = 0;
  private moved = 0;
  private last = { x: 0, y: 0 };
  private wait = 0; // the "NICE!" pause between steps
  finished = false;

  constructor(private g: Game) {
    this.begin();
  }

  get step(): Step | undefined {
    return STEPS[this.i];
  }
  /** The CPU only plays in the steps that need it. */
  get cpuPlays() {
    return !!this.step?.cpu && this.wait <= 0;
  }
  /** Show the hint once a step has taken a while. */
  get stuck() {
    return this.t > 8;
  }
  get between() {
    return this.wait > 0;
  }

  private begin() {
    this.step?.setup?.(this.g);
    const you = this.g.players[this.g.control];
    this.t = this.sprint = this.moved = 0;
    this.last = { x: you.x, y: you.y };
  }

  /** Call once a frame with that frame's events. "next": a step was just done; "done": the whole tutorial. */
  update(dt: number, events: GameEvent[]): "next" | "done" | null {
    if (this.finished || !this.step) return null;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait > 0) return null;
      this.i++;
      if (!this.step) {
        this.finished = true;
        return "done";
      }
      this.begin();
      return null;
    }
    // the CPU stands still outside the defence step, so if it ends up with the ball (your shot went in, or it got the
    // rebound) it would hold it for ever: put the ball back in your hands for another go
    const g = this.g, h = g.ball.holder != null && !g.ball.flight ? g.players[g.ball.holder] : null;
    if (!this.step.cpu && ((h && h.side === 1) || (g.dead > 0 && g.next === 1))) {
      g.dead = 0;
      (this.step.setup ?? ((g2: Game) => ready(g2, 8)))(g);
    }
    const you = this.g.players[this.g.control];
    this.t += dt;
    this.moved += dist(you, this.last);
    this.last = { x: you.x, y: you.y };
    if (you.sprinting) this.sprint += dt;
    if (this.step.done({ t: this.t, sprint: this.sprint, moved: this.moved, events, g: this.g })) {
      this.wait = 1.3;
      return "next";
    }
    return null;
  }
}
