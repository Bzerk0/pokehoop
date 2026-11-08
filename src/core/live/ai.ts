// The CPU players for the live game (PLAN.md §10): a small state machine per player. Each one reads the situation
// (I have the ball / a teammate does / they do / it's loose) and steers like a player with a stick would.
// Offence: space out to your spot, cut now and then, the ball handler drives, shoots or passes to whoever's open.
// Defence: man-to-man (each guards the same spot), the nearest helper steps in on a drive, box out on shots.
// Each one sees where its man is only every `react` seconds, so slow levels bite on crossovers and cuts.
// Phase 7: when the team has called a play (plays.ts), everyone runs their part of it; on defence each player follows
// the team's scheme (man, 2-3 zone, full-court press, double the star). makeCoach is the CPU bench: it calls the
// plays and schemes.
import { AI_STYLES, LIVE, LIVE_AI, type StyleName } from "../ratingConfig.ts";
import type { RatedPokemon } from "../types.ts";
import {
  callPlay, callScheme, COURT, courtwards, dist, farOut, handlerOf, hoopOf, NO_INPUT, other, reachOf, spotOf, team, towardHoop,
  type Game, type Input, type Player, type Side,
} from "./game.ts";
import { ovrOf, PLAY, PLAYS, playWeights, ZONE, ZONE3, type PlayName, type SchemeName, type Spot } from "./plays.ts";

export type AiLevel = (typeof LIVE_AI)[keyof typeof LIVE_AI];

/** How far the nearest player of `side` is from a spot (how open it is). */
function space(g: Game, side: Side, at: { x: number; y: number }) {
  let d = Infinity;
  for (const q of g.players) if (q.side === side) d = Math.min(d, dist(q, at));
  return d;
}

/** Is any player of `side` within `r` of the straight line from a to b (in the passing lane)? The passer's own
 *  defender, right on top of him, doesn't count: you pass round him. */
function laneBlocked(g: Game, side: Side, a: { x: number; y: number }, b: { x: number; y: number }, r = 1.1) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
  return g.players.some((q) => {
    if (q.side !== side || dist(q, a) < 1.5) return false;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
    return Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y) < r;
  });
}

/** How a Pokémon plays when the CPU runs it (AI_STYLES): good passers lean pass-first, good shooters sharpshooter,
 *  quick finishers aggressive, stars sometimes hog it; most are balanced. Fixed per Pokémon (a hash, not a draw). */
export function styleOf(p: RatedPokemon): StyleName {
  const a = p.attrs, x = Math.sin(p.id * 12.9898 + 4.1) * 43758.5453, h = x - Math.floor(x);
  if (a.passing >= 75 && h < 0.7) return "PASS FIRST";
  if (a.shooting >= 78 && h < 0.7) return "SHARPSHOOTER";
  if (a.finishing >= 75 && a.speed >= 70 && h < 0.6) return "AGGRESSIVE";
  if (ovrOf(p) >= 85 && h < 0.4) return "BALL HOG";
  return h < 0.12 ? "BALL HOG" : h < 0.3 ? "AGGRESSIVE" : "BALANCED";
}

/** A CPU brain for player i. Call it once per step for that player's input. `style` overrides the one its ratings
 *  give it (styleOf). */
export function makeAi(i: number, level: AiLevel, style?: StyleName) {
  let seenX = 0, seenY = 0, seenT = -Infinity; // where it last noticed its man
  let release = LIVE.meterTime; // how long it'll hold this shot
  let jumpAt: number | null = null; // when it'll jump at a shooter (Infinity: decided not to)
  let holdT = 0; // seconds with the ball
  let cutUntil = 0, nextCut = 0; // cutting to the basket, and when it may next
  let screenFor = -1, screenUntil = 0, planted = false; // setting a screen for this teammate (outside plays), until then

  return (g: Game, dt: number): Input => {
    const me = g.players[i], side = me.side, b = g.ball, size = g.size;
    const styleName = style ?? styleOf(me.p), st = AI_STYLES[styleName];
    const inp: Input = { ...NO_INPUT };
    /** Steer toward a spot (stop within `slow`); turbo if it's far. Returns the distance. */
    const go = (tx: number, ty: number, slow = 0.25, turboFrom = 4) => {
      const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy);
      if (d < slow) return d;
      inp.x = dx / d;
      inp.y = dy / d;
      inp.turbo = d > turboFrom && me.turbo > 0.25;
      return d;
    };
    const foes = g.players.filter((q) => q.side !== side);
    const man = foes.find((q) => q.slot === me.slot) ?? foes[0];
    if (g.time - seenT >= level.react) {
      seenX = man.x;
      seenY = man.y;
      seenT = g.time;
    }
    const h = handlerOf(g);
    const myHoop = hoopOf(side), theirHoop = hoopOf(other(side)); // the one we attack / the one we guard
    // the play we're running (if any), how long it's been going, and whether it's built around me
    // (a play's clock runs slower on a bigger court: everyone has further to go)
    const call = g.calls[side], play = call.play ? PLAY[call.play] : null, tPlay = (g.time - call.playAt) / COURT.scale;
    const isKey = call.key === i;
    /** A play spot [across, out] → the court, measured from the hoop we attack. */
    const out = courtwards(side); // from our hoop toward the court
    const at = (s: Spot) => ({ x: COURT.w / 2 + s[0] * COURT.scale, y: myHoop.y + out * s[1] * COURT.scale });

    // ── dead ball: get set for the inbound ──
    if (g.dead > 0) {
      holdT = 0;
      jumpAt = null;
      if (g.next === side) {
        // we'll inbound from our own baseline: the point guard comes to get it, the rest head up court
        const baseY = side === 0 ? 0.8 : COURT.l - 0.8;
        if (me.slot === 0 && size > 1) go(COURT.w / 2 - 2, baseY + (side === 0 ? 4 : -4));
        else {
          const s = spotOf(side, me.slot, size);
          go(s.x, s.y);
        }
      } else guard(man, false);
      return inp;
    }

    // ── I have the ball ──
    if (h === me) return handle();
    holdT = 0;

    // ── a teammate has it (or it's being passed between us) ──
    const pass = b.flight?.kind === "pass" ? b.flight : null;
    const ourPass = pass && g.players[pass.by].side === side;
    if (ourPass && pass.to === i) {
      // meet the pass: step from where it's aimed back toward the ball coming in
      go(pass.x1 + (b.x - pass.x1) * 0.35, pass.y1 + (b.y - pass.y1) * 0.35, 0.05, 99);
      return inp;
    }
    if ((h && h.side === side) || ourPass) return offBall();

    // ── they have it: defend, the way the team's scheme says ──
    if ((h && h.side !== side) || pass) {
      const handler = h ?? g.players[pass!.to!];
      const scheme = size === 1 ? "MAN" : call.scheme;
      if (scheme === "2-3 ZONE") zone(handler);
      else if (scheme === "PRESS") press(handler);
      else if (scheme === "DOUBLE STAR") double(handler);
      else manToMan(handler);
      return inp;
    }

    // ── a shot in the air or a loose ball ──
    return chase();

    // ── the pieces ──
    function handle(): Input {
      holdT += dt;
      jumpAt = null;
      if (me.act === "wind") {
        inp.shoot = me.wind < release;
        return inp;
      }
      const d = dist(me, myHoop);
      if (g.mustClear === side) {
        // half-court, after a stop: take it back behind the arc before anything else
        go(COURT.w / 2 + (me.x < COURT.w / 2 ? -1.5 : 1.5), myHoop.y + out * (COURT.three + 1.2), 0.3, 99);
        return inp;
      }
      // half-court: a beat after taking it back or a check (a stationary dribble) before going at you
      if (g.half && g.time - g.resetAt < LIVE.halfPause) {
        holdT = 0;
        return inp;
      }
      if (d < LIVE.dunkRange - 0.3) {
        go(myHoop.x, myHoop.y, 0.05, 99);
        inp.turbo = true;
        inp.shoot = !me.held; // a fresh press
        return inp;
      }
      const near = foes.reduce((p, q) => (dist(q, me) < dist(p, me) ? q : p));
      const gap = dist(me, near);
      // is a defender in the way (ahead of me, toward the hoop)?
      const ahead = (near.x - me.x) * (myHoop.x - me.x) + (near.y - me.y) * (myHoop.y - me.y) > 0;
      const open = gap > 2.2 || !ahead;
      const shooter = me.p.attrs.shooting;
      const range = d < (shooter >= 65 ? 8 : 6.5) * COURT.scale && d > LIVE.rimRange; // the arc moves with the court
      const shoot = () => {
        const r = g.rng.next() + g.rng.next() + g.rng.next() - 1.5; // a rough bell curve, –1.5 to 1.5
        release = LIVE.meterTime * (1 + r * level.aim);
        inp.shoot = true;
        holdT = 0;
        return inp;
      };
      // the shot clock running down (or stuck too long in a 1v1): get a shot up, play or no play
      if ((g.shotClock < 3 && d < 9 * COURT.scale) || g.shotClock < 1.2) return shoot();
      // stuck with it (guarded tight, nothing on) for longer than my patience: force something. In range, shoot over
      // him; out of range, cross him up and attack the rim (no more dribbling in the corner)
      if (holdT > st.patience) {
        if (range || d < LIVE.rimRange + 1.5) return shoot();
        go(myHoop.x, myHoop.y, 0.05, 99);
        inp.turbo = me.turbo > 0.2;
        if (me.crossCool <= 0 && g.rng.next() < 3 * dt) inp.cross = true;
        return inp;
      }

      // running a play
      const hurry = g.shotClock < 4;
      if (play && size > 1 && !hurry) {
        // get it to the key player first (the star to isolate, the big on the block)
        if (play.ballToKey && !isKey && call.key != null) {
          const key = g.players[call.key];
          // once he's at his spot (it's lobbed in if they're in the lane)
          const set = dist(key, at(play.keyPath[0].to as Spot)) < 1.3 || tPlay > 2.2;
          if (tPlay > 0.8 && set && g.rng.next() < 4 * dt) {
            inp.passTo = key.i;
            holdT = 0;
            return inp;
          }
          return inp; // hold it up top while the key player gets to his spot
        }
        // pick and roll: wait up top for the screen
        if (play.handlerWait && tPlay < play.handlerWait) {
          const top = at([0, 7.8]);
          go(top.x, top.y, 0.6, 99);
          return inp;
        }
        // post up: back him down, then go up near the rim
        if (call.play === "POST UP" && isKey) {
          if (d < 2.3 || holdT > 3.5) return shoot();
          const ux = (myHoop.x - me.x) / d, uy = (myHoop.y - me.y) / d;
          inp.x = ux * 0.5; // half speed: backing down, not sprinting
          inp.y = uy * 0.5;
          return inp;
        }
      }

      // driving at the rim with a man close: now and then a floater a few metres out (a quick tap) or a eurostep
      const traffic = gap < 2.5 && towardHoop(me) > LIVE.driveSpeed;
      if (traffic && d > 2.5 && d < 4.5 && g.rng.next() < LIVE.floaterAi * st.drive * dt) {
        release = 0;
        inp.shoot = true;
        holdT = 0;
        return inp;
      }
      if (traffic && d < LIVE.eurostepRange && me.crossCool <= 0 && g.rng.next() < LIVE.euroAi * st.drive * dt) {
        go(myHoop.x, myHoop.y, 0.05, 99);
        inp.cross = true;
        return inp;
      }
      // shoot when open in range. Good shooters like the open three, most of all right after the catch (or every
      // possession ends in a drive)
      const three = d >= COURT.three && shooter >= 65;
      const keen = (three ? 2.5 * st.three : 1) * (size > 1 && holdT < 1 ? 1.5 : 1);
      if (range && open && g.rng.next() < level.pullUp * st.shoot * dt * (shooter / 70) * keen) return shoot();
      // pass: more often when a defender is in my face, or in a motion play; the point guard brings it up first
      if (size > 1 && holdT > 0.35) {
        const backcourt = out < 0 ? me.y < COURT.l / 2 : me.y > COURT.l / 2;
        const pressure = ahead && gap < 1.8 ? 2.5 : 1;
        const keenToPass = play?.passRate ?? 1;
        if (g.rng.next() < level.pass * st.pass * dt * pressure * keenToPass * (backcourt && me.slot === 0 ? 0.15 : 1)) {
          const to = outlet(me);
          if (to) {
            inp.passTo = to.i;
            holdT = 0;
            return inp;
          }
        }
      }
      // drive, slipping past a defender in the way (off a pick and roll or any teammate's screen, round the screener's
      // side first)
      let tx = myHoop.x, ty = myHoop.y;
      const pnr = call.play === "PICK & ROLL" && tPlay < (play?.handlerWait ?? 0) + 1.2;
      const screener = g.players.find((q) => q.side === side && q !== me && dist(me, q) < 4 && dist(q, myHoop) < d + 0.5 && (q.screening || (pnr && q.i === call.key)));
      if (screener) {
        tx = Math.max(1, Math.min(COURT.w - 1, screener.x + (screener.x >= me.x ? 1.4 : -1.4)));
        ty = screener.y + (myHoop.y - screener.y) * 0.3;
      } else if (ahead && gap < 2.5) {
        // slip round him, away from his side; pinned near a sideline, cut back toward the middle instead
        const away = me.x < 2.5 ? 1 : me.x > COURT.w - 2.5 ? -1 : me.x <= near.x ? -1 : 1;
        tx = Math.max(1, Math.min(COURT.w - 1, me.x + away * 2.5));
        ty = me.y + (myHoop.y - me.y) * 0.3;
        if (me.crossCool <= 0 && g.rng.next() < 1.2 * st.drive * dt) inp.cross = true;
      }
      go(tx, ty, 0.05, 99);
      inp.turbo = me.turbo > 0.3 && d < 14 && d > 4;
      return inp;
    }

    /** The best teammate to pass to: open, a clear lane, nearer the hoop, a good shooter. Null if nobody is. */
    function outlet(from: Player) {
      let best: Player | null = null, bestScore = 1.5;
      for (const q of g.players) {
        if (q.side !== side || q === from) continue;
        const open = space(g, other(side), q);
        if (open < 2 || laneBlocked(g, other(side), from, q)) continue;
        const score = Math.min(open, 5) + (q.p.attrs.shooting / 99) * 2 - dist(q, myHoop) * 0.15 - dist(from, q) * 0.05;
        if (score > bestScore) {
          best = q;
          bestScore = score;
        }
      }
      return best;
    }

    function offBall(): Input {
      jumpAt = null;
      // running a play: go where it says (and set the screen if that's my job)
      const t = play && size > 1 ? playSpot() : null;
      if (t) {
        const d = go(t.x, t.y, 0.2, 3);
        if (isKey && play!.screen && tPlay >= play!.screen[0] && tPlay <= play!.screen[1] && d < 0.8) inp.screen = true;
        return inp;
      }
      // now and then (no play on) the teammate nearest the ball comes up and screens for him, then rolls to the rim
      const hh = handlerOf(g);
      const mates = hh?.side === side ? team(g, side).filter((q) => q !== hh) : [];
      const nearest = mates.length ? mates.reduce((p, q) => (dist(q, hh!) < dist(p, hh!) ? q : p)) : null;
      if (screenFor < 0 && !play && nearest === me && g.time > cutUntil && dist(hh!, myHoop) > 4 && dist(hh!, myHoop) < COURT.three + 3
        && g.rng.next() < LIVE.aiScreenRate * dt) {
        screenFor = hh!.i;
        screenUntil = g.time + 2.5; // time to get there
        planted = false;
      }
      if (screenFor >= 0 && (g.time > screenUntil || (!planted && hh?.i !== screenFor))) {
        if (planted) cutUntil = g.time + 1.4; // done: roll to the rim
        screenFor = -1;
      }
      if (screenFor >= 0) {
        if (planted) inp.screen = true; // hold the spot (whoever has the ball can use it)
        else {
          const spot = screenSpot(hh!);
          if (go(spot.x, spot.y, 0.2, 3) < 0.8) {
            inp.screen = true;
            planted = true;
            screenUntil = g.time + LIVE.aiScreenHold;
          }
        }
        return inp;
      }
      const s = spotOf(side, me.slot, size);
      // now and then, cut hard to the basket, then drift back out
      if (g.time > nextCut && g.rng.next() < 0.25 * dt) {
        cutUntil = g.time + 1.4;
        nextCut = g.time + 4 + g.rng.next() * 4;
      }
      if (g.time < cutUntil) go(myHoop.x + (me.slot % 2 ? 1 : -1), myHoop.y + out * 1.2, 0.2, 2);
      else go(s.x, s.y);
      return inp;
    }

    /** Where the play puts me right now, or null for my usual spot. */
    function playSpot(): { x: number; y: number } | null {
      const p = play!;
      if (isKey) {
        let step = p.keyPath[0];
        for (const s of p.keyPath) if (s.at <= tPlay) step = s;
        if (!step) return null;
        if (step.to === "rim") return { x: myHoop.x + 0.8, y: myHoop.y + out * 1.3 }; // the roll
        if (step.to === "screen") return screenSpot(handlerOf(g) ?? me);
        return at(step.to);
      }
      // motion: everyone moves round the spots
      if (p.rotate) return spotOf(side, (me.slot + Math.floor(tPlay / p.rotate)) % size, size);
      // everyone else spaces out: the spacer spots in lineup order, skipping the key player and the ball handler
      const rest = team(g, side).filter((q) => q.i !== call.key && q !== handlerOf(g));
      const s = p.spacers[rest.indexOf(me)];
      return s ? at(s) : null;
    }

    /** Where a screen for this ball handler goes: beside him, a step toward the hoop, right where his defender stands. */
    function screenSpot(hh: Player) {
      const dd = dist(hh, myHoop) || 1, ux = (myHoop.x - hh.x) / dd, uy = (myHoop.y - hh.y) / dd;
      return { x: hh.x + ux * 1.2 - uy * 0.7, y: hh.y + uy * 1.2 + ux * 0.7 };
    }

    /** Stay between my man and the hoop: tight on the ball, sagging toward the hoop off it. `tight` (the press)
     *  plays everyone close, denying the pass. Guarding anyone but my own man, I see him straight away. */
    function guard(m: Player, onBall: boolean, tight = false) {
      const sx = m === man ? seenX : m.x, sy = m === man ? seenY : m.y;
      const dd = Math.hypot(theirHoop.x - sx, theirHoop.y - sy) || 1;
      // 1v1, unless AGGRESSIVE: no reaching while he can't score yet (backcourt; half court: taking it back or past the
      // arc), and room while he can't shoot at all (half court keeps the arc contested once it's taken back)
      const calm = onBall && size === 1 && styleName !== "AGGRESSIVE" && farOut(g, m);
      const sag = calm && (!g.half || g.mustClear === m.side);
      const gap = sag ? Math.min(LIVE.pickupGap, dd * 0.7) : onBall ? Math.min(tight ? 0.9 : 1.3, dd * 0.5) : tight ? Math.min(1.2, dd * 0.2) : Math.min(3, dd * 0.3);
      const far = go(sx + ((theirHoop.x - sx) / dd) * gap, sy + ((theirHoop.y - sy) / dd) * gap, 0.2, 2.5);
      inp.turbo = far > 2.5 && me.turbo > 0.15;
      if (!onBall) return;
      const close = dist(me, m);
      // jump at a shot: decide once per shot, then wait for the right moment
      if (m.act === "wind" || m.act === "dunk") {
        if (jumpAt == null) {
          const tries = g.rng.next() < level.block;
          const wait = m.act === "dunk" ? 0.05 : Math.max(0, LIVE.meterTime * 0.9 - m.wind) - 0.1;
          jumpAt = tries ? g.time + wait + level.react * (g.rng.next() - 0.3) : Infinity;
        }
        if (g.time >= jumpAt && close < 2.2 && me.act === "free") {
          inp.shoot = true;
          jumpAt = Infinity;
        }
      } else {
        jumpAt = null;
        // fewer swipes in team games: with help behind, a gamble isn't needed (and turnovers swamped possessions);
        // the press gambles more
        const rate = level.steal * st.steal * (size > 1 ? 0.3 : 1) * (tight ? 1.25 : 1);
        const wait = calm || (size === 1 && g.time - g.gainAt < LIVE.stealGrace); // 1v1: a moment with the ball first
        if (!wait && close < LIVE.stealRange && me.stealCool <= 0 && g.rng.next() < rate * dt) inp.steal = true;
      }
    }

    function manToMan(handler: Player) {
      if (handler === man) guard(man, true);
      else help(handler);
    }

    /** 2-3 zone: hold my area, shaded toward the ball; whoever's area the ball comes into steps up on it. */
    function zone(handler: Player) {
      const spots = size >= 5 ? ZONE : ZONE3;
      const z = spots[me.slot] ?? spots[0];
      const base = { x: COURT.w / 2 + z[0] * COURT.scale, y: theirHoop.y + (side === 1 ? -z[1] : z[1]) * COURT.scale };
      const mates = team(g, side);
      const nearest = mates.reduce((p, q) => (dist(q, handler) < dist(p, handler) ? q : p));
      if (nearest === me && dist(handler, base) < 4.5) return guard(handler, true);
      const k = Math.min(1, 2.5 / (dist(handler, base) || 1)) * 0.35; // lean toward the ball, but not far
      go(base.x + (handler.x - base.x) * k, base.y + (handler.y - base.y) * k, 0.2, 3);
    }

    /** Full-court press: the two nearest the ball trap it (in front and to the side, hands busy); everyone else
     *  denies their man up close, all over the court. */
    function press(handler: Player) {
      const mates = team(g, side).sort((p, q) => dist(p, handler) - dist(q, handler));
      const k = mates.indexOf(me);
      const trapping = k < 2 && dist(handler, hoopOf(handler.side)) > 5; // near the hoop, just guard
      if (!trapping) return guard(man, man === handler, true);
      const dd = dist(handler, hoopOf(handler.side)) || 1;
      const ux = (hoopOf(handler.side).x - handler.x) / dd, uy = (hoopOf(handler.side).y - handler.y) / dd;
      // one in front of him, one on his side toward the middle
      const side_ = handler.x < COURT.w / 2 ? 1 : -1;
      const tx = k === 0 ? handler.x + ux * 0.9 : handler.x + side_ * 0.9;
      const ty = k === 0 ? handler.y + uy * 0.9 : handler.y + uy * 0.3;
      go(tx, ty, 0.1, 1.5);
      const rate = level.steal * st.steal * 0.3 * 1.5; // trapping is all about the steal (but not every trip)
      if (dist(me, handler) < LIVE.stealRange && me.stealCool <= 0 && g.rng.next() < rate * dt) inp.steal = true;
    }

    /** Double the star: when their best player has it, the man guarding their weakest leaves him to help. */
    function double(handler: Player) {
      const star = foes.reduce((p, q) => (ovrOf(q.p) > ovrOf(p.p) ? q : p));
      const weakest = foes.filter((q) => q !== star).reduce((p, q) => (ovrOf(q.p) < ovrOf(p.p) ? q : p), foes.find((q) => q !== star) ?? star);
      if (handler === star && man === weakest && star !== weakest) {
        const dd = dist(star, theirHoop) || 1;
        go(star.x + ((theirHoop.x - star.x) / dd) * 0.9 + (star.x < COURT.w / 2 ? 0.8 : -0.8), star.y + ((theirHoop.y - star.y) / dd) * 0.9, 0.1, 1.5);
        const rate = level.steal * st.steal * 0.3 * 2;
        if (dist(me, star) < LIVE.stealRange && me.stealCool <= 0 && g.rng.next() < rate * dt) inp.steal = true;
        return;
      }
      manToMan(handler);
    }

    /** Off the ball: guard my man, but the nearest helper steps in front of a drive (and may go up for the block). */
    function help(handler: Player) {
      const helpers = g.players.filter((q) => q.side === side && q !== g.players.find((d) => d.side === side && d.slot === handler.slot));
      const nearest = helpers.reduce((p, q) => (dist(q, handler) < dist(p, handler) ? q : p), helpers[0]);
      const driving = dist(handler, theirHoop) < 5;
      if (driving && nearest === me) {
        const dd = dist(handler, theirHoop) || 1;
        go(handler.x + ((theirHoop.x - handler.x) / dd) * 1.2, handler.y + ((theirHoop.y - handler.y) / dd) * 1.2, 0.2, 2);
        if (handler.act === "wind" || handler.act === "dunk") {
          if (jumpAt == null) jumpAt = g.rng.next() < level.block * 0.6 ? g.time + 0.25 + level.react * g.rng.next() : Infinity;
          if (g.time >= jumpAt && dist(me, handler) < 1.8 && me.act === "free") {
            inp.shoot = true;
            jumpAt = Infinity;
          }
        } else jumpAt = null;
        return;
      }
      jumpAt = null;
      guard(man, false);
    }

    /** The ball's up for grabs: bigs crash the glass, defenders box out, the closest two of each team chase a loose
     *  ball, the point guard of the shooting team gets back. */
    function chase(): Input {
      jumpAt = null;
      const f = b.flight;
      const shotBy = f?.kind === "shot" ? g.players[f.by].side : null;
      if (shotBy != null) {
        if (shotBy === side) {
          const big = me.slot >= 3 || (size === 3 && me.slot === 2) || size === 1;
          if (big) go(myHoop.x + (me.slot % 2 ? 1.2 : -1.2), myHoop.y + out * 1.4, 0.2, 2);
          else if (me.slot === 0) go(COURT.w / 2, COURT.l / 2 + (side === 0 ? -2 : 2)); // get back
          else {
            const s = spotOf(side, me.slot, size);
            go(s.x, s.y);
          }
        } else {
          // box out: get between my man and the hoop, right on him
          const dd = Math.hypot(theirHoop.x - man.x, theirHoop.y - man.y) || 1;
          go(man.x + ((theirHoop.x - man.x) / dd) * 0.8, man.y + ((theirHoop.y - man.y) / dd) * 0.8, 0.15, 2);
        }
        return inp;
      }
      // a loose ball: the two of us nearest to where it'll land go for it
      const tx = f ? f.x1 : b.x, ty = f ? f.y1 : b.y;
      const mates = g.players.filter((q) => q.side === side).sort((p, q) => dist(p, { x: tx, y: ty }) - dist(q, { x: tx, y: ty }));
      if (mates.indexOf(me) < 2) {
        go(tx, ty, 0.05, 3);
        // jump for a ball coming down overhead
        if (f && me.act === "free" && dist(me, b) < 1.4 && b.z > reachOf(me) && f.t / f.dur > 0.5) inp.shoot = true;
      } else if (g.poss === side) {
        const s = spotOf(side, me.slot, size);
        go(s.x, s.y);
      } else guard(man, false);
      return inp;
    }
  };
}

/** The CPU's bench: once the ball's over half court it calls a play its lineup suits (or lets them freelance), and
 *  each time it goes on defence it picks a scheme: press when it's behind, double a star, zone poor shooters, else
 *  man. Call it once per step for the CPU side. */
export function makeCoach(side: Side) {
  let lastPoss: Side | null = null, called = false;
  return (g: Game) => {
    if (g.size === 1) return;
    if (g.poss !== lastPoss) {
      lastPoss = g.poss;
      called = false;
      if (g.poss !== side) callScheme(g, side, pickScheme(g, side));
    }
    if (g.poss !== side || called) return;
    const h = handlerOf(g);
    if (!h || h.side !== side || dist(h, hoopOf(side)) > COURT.l / 2) return; // wait until it's over half court
    called = true;
    const w = playWeights(team(g, side).map((q) => q.p));
    const total = Object.values(w).reduce((s, v) => s + v, 0);
    let r = g.rng.next() * total;
    for (const name of [...PLAYS, "NONE"] as const) {
      r -= w[name];
      if (r <= 0) {
        if (name !== "NONE") callPlay(g, side, name as PlayName);
        return;
      }
    }
  };
}

function pickScheme(g: Game, side: Side): SchemeName {
  const lead = g.score[side] - g.score[other(side)];
  const them = team(g, other(side)).map((q) => q.p);
  const ovrs = them.map(ovrOf).sort((a, b) => b - a);
  const shooting = them.reduce((s, p) => s + p.attrs.shooting, 0) / them.length;
  if (lead <= -6) return "PRESS";
  if (ovrs[0] - (ovrs[1] ?? ovrs[0]) >= 8) return "DOUBLE STAR";
  if (shooting < 58) return "2-3 ZONE";
  return g.rng.next() < 0.2 ? "2-3 ZONE" : "MAN"; // a change of look now and then
}
