// The CPU player for the live game: a small state machine per side (PLAN.md §10). It sees where you are only every
// `react` seconds, so slow levels bite on crossovers. Uses the game's seeded dice.
import { LIVE, LIVE_AI } from "../ratingConfig.ts";
import { COURT, hoopOf, other, reachOf, type Game, type Input, type Side } from "./game.ts";

export type AiLevel = (typeof LIVE_AI)[keyof typeof LIVE_AI];

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** A CPU brain for one side. Call it once per step for that side's input. */
export function makeAi(side: Side, level: AiLevel) {
  let seenX = 0, seenY = 0, seenT = -Infinity; // where it last noticed the other player
  let release = LIVE.meterTime; // how long it'll hold this shot
  let jumpAt: number | null = null; // when it'll jump at the shooter (Infinity: decided not to)
  let holdT = 0; // seconds with the ball this trip

  return (g: Game, dt: number): Input => {
    const me = g.players[side], foe = g.players[other(side)], b = g.ball;
    const inp: Input = { x: 0, y: 0, turbo: false, shoot: false, steal: false, cross: false };
    const go = (tx: number, ty: number, slow = 0.15) => {
      const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy);
      if (d < slow) return d;
      inp.x = dx / d;
      inp.y = dy / d;
      return d;
    };
    if (g.time - seenT >= level.react) {
      seenX = foe.x;
      seenY = foe.y;
      seenT = g.time;
    }
    if (g.dead > 0) {
      holdT = 0;
      jumpAt = null;
      return inp;
    }

    // ── on offence ──
    if (b.holder === side && !b.flight) {
      holdT += dt;
      jumpAt = null;
      if (me.act === "wind") {
        inp.shoot = me.wind < release;
        return inp;
      }
      const hoop = hoopOf(side);
      const d = dist(me, hoop);
      if (d < LIVE.dunkRange - 0.3) {
        go(hoop.x, hoop.y);
        inp.turbo = true;
        inp.shoot = !me.held; // a fresh press
        return inp;
      }
      const gap = dist(me, foe);
      // is the defender in the way (ahead of me, toward the hoop)?
      const ahead = (foe.x - me.x) * (hoop.x - me.x) + (foe.y - me.y) * (hoop.y - me.y) > 0;
      const open = gap > 2.2 || !ahead;
      const range = d < (me.p.attrs.shooting >= 65 ? 8 : 6.5) && d > LIVE.rimRange;
      // pull up when open, or when stuck too long (no shot clock yet)
      if (range && ((open && g.rng.next() < level.pullUp * dt) || holdT > 6)) {
        const r = g.rng.next() + g.rng.next() + g.rng.next() - 1.5; // a rough bell curve, –1.5 to 1.5
        release = LIVE.meterTime * (1 + r * level.aim);
        inp.shoot = true;
        holdT = 0;
        return inp;
      }
      // drive, slipping past a defender in the way
      let tx = hoop.x, ty = hoop.y;
      if (ahead && gap < 2.5) {
        const away = me.x <= foe.x ? -1 : 1;
        tx = Math.max(1, Math.min(COURT.w - 1, me.x + away * 2.5));
        ty = me.y + (hoop.y - me.y) * 0.3;
        if (me.crossCool <= 0 && g.rng.next() < 1.2 * dt) inp.cross = true;
      }
      go(tx, ty);
      inp.turbo = me.turbo > 0.3 && d < 14;
      return inp;
    }
    holdT = 0;

    // ── on defence ──
    if (b.holder === other(side) && !b.flight) {
      const guard = hoopOf(other(side)); // the hoop they're attacking
      const sx = seenX, sy = seenY;
      const dd = Math.hypot(guard.x - sx, guard.y - sy) || 1;
      const gap = Math.min(1.3, dd * 0.5);
      const far = go(sx + ((guard.x - sx) / dd) * gap, sy + ((guard.y - sy) / dd) * gap, 0.2);
      inp.turbo = far > 2.5 && me.turbo > 0.15;
      const close = dist(me, foe);
      // jump at a shot: decide once per shot, then wait for the right moment
      if (foe.act === "wind" || foe.act === "dunk") {
        if (jumpAt == null) {
          const tries = g.rng.next() < level.block;
          const wait = foe.act === "dunk" ? 0.05 : Math.max(0, LIVE.meterTime * 0.9 - foe.wind) - 0.1;
          jumpAt = tries ? g.time + wait + level.react * (g.rng.next() - 0.3) : Infinity;
        }
        if (g.time >= jumpAt && close < 2.2 && me.act === "free") {
          inp.shoot = true;
          jumpAt = Infinity;
        }
      } else {
        jumpAt = null;
        if (close < LIVE.stealRange && me.stealCool <= 0 && g.rng.next() < level.steal * dt) inp.steal = true;
      }
      return inp;
    }

    // ── loose ball or a shot in the air: get to where it'll come down ──
    jumpAt = null;
    const f = b.flight;
    const tx = f ? f.x1 : b.x, ty = f ? f.y1 : b.y;
    const d = go(tx, ty, 0.05);
    inp.turbo = d > 3 && me.turbo > 0.1;
    // jump for a ball overhead
    if (f && f.kind === "loose" && me.act === "free" && dist(me, b) < 1.4 && b.z > reachOf(me) && f.t / f.dur > 0.5) inp.shoot = true;
    return inp;
  };
}
