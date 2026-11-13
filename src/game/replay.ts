// Instant replays and the top plays reel. Three parts, none of which touch Three.js (LiveView draws them):
//  - a Recorder: the last few seconds of the game, one snapshot per engine step;
//  - a ClipSpotter: watches the game's events for big plays (dunks, step-back threes, ankle breakers, blocks,
//    buzzer-beaters) and says which seconds of the recording make the clip;
//  - camera scripts: for each kind of play, where the camera sits and looks at each moment of the clip (court
//    coordinates: x across, y up the court, z height), with cuts between angles, and where the slow motion falls.
import { COURT, dist, hoopOf, type Act, type DunkStyle, type Flight, type Game, type GameEvent } from "../core/live/game.ts";
import { LIVE } from "../core/ratingConfig.ts";
import type { RatedPokemon } from "../core/types.ts";

export type PSnap = {
  side: 0 | 1; x: number; y: number; z: number; vx: number; vy: number; act: Act; onFire: boolean; p: RatedPokemon;
  dunkStyle: DunkStyle | null; euro: number; // so a replay can spin a 360 or zig-zag a eurostep
};
export type Snap = { t: number; players: PSnap[]; ball: { x: number; y: number; z: number; holder: number | null; flight: Flight | null } };

export function snap(g: Game): Snap {
  const b = g.ball;
  return {
    t: g.time,
    players: g.players.map((p) => ({
      side: p.side, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, act: p.act, onFire: p.onFire, p: p.p, dunkStyle: p.dunkStyle, euro: p.euro,
    })),
    ball: { x: b.x, y: b.y, z: b.z, holder: b.holder, flight: b.flight && { ...b.flight } },
  };
}

/** The last `seconds` of the game. */
export class Recorder {
  private buf: Snap[] = [];
  constructor(private seconds = 6) {}
  push(g: Game) {
    this.buf.push(snap(g));
    let cut = 0;
    while (cut < this.buf.length && this.buf[cut].t < g.time - this.seconds) cut++;
    if (cut) this.buf.splice(0, cut);
  }
  between(a: number, b: number) {
    return this.buf.filter((s) => s.t >= a && s.t <= b);
  }
}

export type ClipKind = "dunk" | "stepback" | "ankles" | "block" | "chase" | "shot" | "special" | "eurostep" | "floater" | "screen" | "perimeter";
/** The caption a special dunk's move event carries. */
export const isSpecialDunk = (text: string) => /^(360 DUNK|WINDMILL|TOMAHAWK|EASTBAY)!$/.test(text);
export type Clip = {
  kind: ClipKind;
  title: string; // the big caption: SLAM DUNK!
  who: number; // the star (player index)
  vs?: number; // the other one in it: the defender, the shooter who got blocked
  aux?: number; // a third: the teammate who set the screen (or, for an alley-oop, who threw it)
  oop?: boolean; // a dunk clip that's an alley-oop (its own camera scripts)
  ease?: number; // instead of slow-mo round the keys: start in full slow-mo and speed up to normal over this many seconds
  poss?: 0 | 1; // the team that should still have the ball when it's replayed (LiveView drops it once the ball changes hands)
  side: 0 | 1; // the star's team
  start: number; end: number; // game seconds the clip covers
  keys: number[]; // the moments that go to slow motion (the slam, the step, the swat)
  hype: number; // how big a play it is (LIVE.replayHype): the biggest get replayed, the top few make the reel
  frames: Snap[];
};

/** Watches events for big plays. `spot` gets each step's events (after the step) and returns any clip that starts;
 *  its frames are filled in from the Recorder once the game reaches the clip's end. */
export class ClipSpotter {
  private dunkAt = new Map<number, number>();
  private stepAt = new Map<number, number>();
  private oopAt = new Map<number, { t: number; from?: number }>();
  private euroAt = new Map<number, number>();
  private floatAt = new Map<number, number>();
  private specialAt = new Map<number, { t: number; title: string }>();
  private screenFor = new Map<number, { t: number; screener: number; vs: number }>(); // by the handler it freed
  private swing: { side: 0 | 1; start: number; times: number[] } | null = null; // passes round the arc
  private swingClip: Clip | null = null; // the last ball-movement clip, while a three off it could still land
  private ankleClip: Clip | null = null; // the last ankle breaker, while its shot could still follow

  spot(e: GameEvent, g: Game): Clip | null {
    const t = g.time, H = LIVE.replayHype, name = (i: number) => g.players[i].p.name.toUpperCase();
    const clip = (kind: ClipKind, title: string, who: number, start: number, keys: number[], end: number, hype: number, vs?: number, aux?: number): Clip =>
      ({ kind, title, who, vs, aux, side: g.players[who].side, start, end, keys, hype, frames: [] });
    if (e.who == null) return null;
    const who = e.who;
    switch (e.kind) {
      case "pass":
        return this.passed(g, who, e.vs);
      case "screen": {
        // the screener freed whoever has the ball: if they score soon, it's a clip of the pick
        const h = g.ball.holder;
        if (h != null && e.vs != null && g.players[h].side === g.players[who].side) this.screenFor.set(h, { t, screener: who, vs: e.vs });
        return null;
      }
      case "release": {
        // the ankle breaker shoots straight away: keep filming until the shot comes down
        const ak = this.ankleClip;
        if (ak && ak.who === who && t - ak.keys[0] < 1.5 && t <= ak.end) ak.end = Math.max(ak.end, t + 2.2);
        if (e.text === "DUNK") this.dunkAt.set(who, t);
        if (e.text === "FLOATER") this.floatAt.set(who, t);
        return null;
      }
      case "move":
        if (e.text === "STEP BACK") this.stepAt.set(who, t);
        if (e.text === "ALLEY-OOP!") this.oopAt.set(who, { t, from: e.vs });
        if (e.text === "EUROSTEP") this.euroAt.set(who, t);
        if (isSpecialDunk(e.text)) this.specialAt.set(who, { t, title: e.text });
        return null;
      case "make": {
        // a make that ends a quarter (or the game) is a buzzer-beater: bigger, whatever it was
        const buzzer = (g.timed && g.clock < 1.5) || g.over;
        const extra = buzzer ? H.buzzer : 0, tag = buzzer ? "BUZZER-BEATER! " : "";
        const dunk = this.dunkAt.get(who), step = this.stepAt.get(who);
        this.dunkAt.delete(who);
        const oop = this.oopAt.get(who);
        this.oopAt.delete(who);
        const special = this.specialAt.get(who), euro = this.euroAt.get(who), float = this.floatAt.get(who), pick = this.screenFor.get(who);
        for (const m of [this.specialAt, this.euroAt, this.floatAt, this.screenFor]) m.delete(who);
        // ball movement that ends in a three: the swing clip gets the shot and a bigger billing
        const ak = this.ankleClip;
        if (ak && ak.who === who && ak.end > ak.keys[0] + 1.6 && t <= ak.end) {
          // ...and it goes in: the shot's in the clip, slow-mo on the make too
          Object.assign(ak, { title: "ANKLES... AND THE BUCKET!", end: t + 1, keys: [ak.keys[0], t], hype: ak.hype + 1 });
          this.ankleClip = null;
        }
        const sw = this.swingClip;
        if (sw && sw.side === g.players[who].side && e.text === "THREE!" && t <= sw.end + 0.5) {
          Object.assign(sw, { title: "SWING, SWING... THREE!", end: t + 1, keys: [t], hype: sw.hype + H.perimeterThree, who });
          this.swingClip = null;
        }
        if (special != null && dunk != null && t - special.t < 2) return clip("special", `${tag}${special.title}`, who, special.t - 1.6, [t], t + 1.5, H.special + extra);
        if (oop != null && t - oop.t < 2.5) {
          return { ...clip("dunk", `${tag}ALLEY-OOP!`, who, oop.t - 1, [t], t + 1.2, H.oop + extra, undefined, oop.from), oop: true };
        }
        if (euro != null && t - euro < 2.5) return clip("eurostep", `${tag}EUROSTEP!`, who, euro - 1.2, [euro, euro + LIVE.euroTime / 2, t], t + 1, H.eurostep + extra);
        if (dunk != null && t - dunk < 1) return clip("dunk", `${tag}SLAM DUNK!`, who, dunk - 1.8, [t], t + 1.2, H.dunk + extra);
        if (float != null && t - float < 1.5) return clip("floater", `${tag}FLOATER!`, who, float - 1.4, [float, t], t + 1, H.floater + extra);
        if (pick != null && t - pick.t < 3.5) {
          return clip("screen", `${tag}OFF THE PICK!`, who, pick.t - 1.4, [pick.t, t], t + 1, H.screen + extra + (e.text === "THREE!" ? 0.5 : 0), pick.vs, pick.screener);
        }
        if (step != null && t - step < 3.5 && e.text === "THREE!") {
          this.stepAt.delete(who);
          return clip("stepback", `${tag}STEP-BACK THREE!`, who, step - 0.8, [step, t], t + 0.9, H.stepback + extra);
        }
        if (buzzer) return clip("shot", `BUZZER-BEATER! ${name(who)}`, who, t - 2.4, [t], t + 1, extra + (e.text === "THREE!" ? 1 : 0));
        return null;
      }
      case "ankles":
        return (this.ankleClip = clip("ankles", "ANKLE BREAKER!", who, t - 1.2, [t + 0.15], t + 1.6, H.ankles, e.vs));
      case "block": {
        const chase = e.text.startsWith("CHASE");
        return clip(chase ? "chase" : "block", chase ? "CHASE-DOWN BLOCK!" : "REJECTED!", who, t - 1.6, [t], t + 1, chase ? H.chase : H.block, e.vs);
      }
    }
    return null;
  }

  /** A pass: round the perimeter (thrower and catcher both outside the arc) it extends the swing; enough of them in
   *  a row quickly makes a ball-movement clip (mostly for the title screen). Anything else starts over. */
  private passed(g: Game, from: number, to: number | undefined): Clip | null {
    const t = g.time, a = g.players[from], b = to != null ? g.players[to] : null;
    const f = g.ball.flight, catchAt = f ? { x: f.x1, y: f.y1 } : b;
    const outside = (p: { x: number; y: number } | null) => !!p && dist(p, hoopOf(a.side)) > COURT.three + 0.3;
    if (!b || !outside(a) || !outside(catchAt) || f?.oop) return void (this.swing = null), null;
    const sw = this.swing && this.swing.side === a.side && t - this.swing.times[this.swing.times.length - 1] < 2.5 ? this.swing : null;
    this.swing = sw ?? { side: a.side, start: t, times: [] };
    this.swing.times.push(t);
    this.swing.times = this.swing.times.filter((x) => t - x <= LIVE.perimeterWindow);
    if (this.swing.times.length < LIVE.perimeterPasses) return null;
    const start = this.swing.times[0];
    this.swing = null;
    // no slow motion (a key past the end); a three off it moves the key to the shot (in `spot`)
    const c: Clip = { kind: "perimeter", title: "BALL MOVEMENT!", who: to!, side: a.side, start: start - 0.6, end: t + 2, keys: [t + 99], hype: LIVE.replayHype.perimeter, frames: [] };
    this.swingClip = c;
    return c;
  }
}

/** Playback speed at clip time `t`: slow motion around each key moment, easing back to full speed. */
export function replaySpeed(clip: Clip, t: number) {
  if (clip.ease) {
    const k = Math.max(0, Math.min(1, (t - clip.keys[0]) / clip.ease));
    return LIVE.replaySlow + (1 - LIVE.replaySlow) * k * k; // lingers slow, then picks up
  }
  const span = LIVE.replaySlowSpan * (clip.kind === "special" ? LIVE.specialSlow : 1); // a special dunk lingers
  let k = 1;
  for (const key of clip.keys) {
    const d = Math.abs(t - key);
    k = Math.min(k, d < span ? 0 : d < span * 2 ? (d - span) / span : 1);
  }
  return LIVE.replaySlow + (1 - LIVE.replaySlow) * k;
}

/** The frame at time t, in between recorded ones (so slow motion is smooth). */
export function frameAt(frames: Snap[], t: number): Snap {
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].t < t) i++;
  const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
  const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
  const mix = (x: number, y: number) => x + (y - x) * k;
  return {
    t,
    players: a.players.map((p, j) => {
      const q = b.players[j];
      return { ...p, x: mix(p.x, q.x), y: mix(p.y, q.y), z: mix(p.z, q.z), vx: mix(p.vx, q.vx), vy: mix(p.vy, q.vy) };
    }),
    ball: { ...a.ball, x: mix(a.ball.x, b.ball.x), y: mix(a.ball.y, b.ball.y), z: mix(a.ball.z, b.ball.z) },
  };
}

export type Shot = { pos: [number, number, number]; look: [number, number, number]; fov: number; cut: number };

const unit = (x: number, y: number) => {
  const d = Math.hypot(x, y) || 1;
  return [x / d, y / d] as const;
};

/** Where the camera is for this clip at time t (frame s is the picture at t). `cut` numbers the angle, so the view
 *  can tell a cut (jump) from a move. */
export function cameraFor(clip: Clip, t: number, s: Snap): Shot {
  const star = s.players[clip.who], other = clip.vs != null ? s.players[clip.vs] : null;
  const attacker = clip.kind === "block" || clip.kind === "chase" ? (other ?? star) : star;
  const behindBoard = (cut: number) => shot([hoop.x + fx * 2.2 + nx * 0.7, hoop.y + fy * 2.2 + ny * 0.7, 3.7], [hoop.x - fx * 2, hoop.y - fy * 2, rimZ - 0.6], 62, cut);
  const hoop = hoopOf(attacker === star ? clip.side : ((1 - clip.side) as 0 | 1));
  const [fx, fy] = unit(hoop.x - attacker.x, hoop.y - attacker.y); // toward the hoop
  const [nx, ny] = [-fy, fx]; // across
  const k0 = clip.keys[0], k1 = clip.keys[clip.keys.length - 1];
  const rimZ = COURT.rimZ;
  const shot = (pos: [number, number, number], look: [number, number, number], fov: number, cut: number): Shot => ({ pos, look, fov, cut });

  switch (clip.kind) {
    case "dunk": {
      // three looks for a dunk, three for an alley-oop; each clip keeps one (from when it starts, not a dice roll)
      const look = Math.floor(Math.abs(clip.start) * 7.31) % 3, after = Math.max(0, t - k0);
      const passer = clip.oop && clip.aux != null ? s.players[clip.aux] : null;
      if (clip.oop && look === 1 && passer) {
        // the fast-break oop (Wade to LeBron): from behind the passer, looking down the floor along the lob; then
        // the slam from low on the baseline
        if (t < k0 - 0.12) return shot([passer.x - fx * 4, passer.y - fy * 4, 2.4], [(star.x + hoop.x) / 2, (star.y + hoop.y) / 2, 2.6], 50, 0);
        return shot([hoop.x + nx * 2.2 + fx * 1.5, hoop.y + ny * 2.2 + fy * 1.5, 0.6], [hoop.x - fx * 0.5, hoop.y - fy * 0.5, rimZ], 62, 1);
      }
      if (clip.oop && look === 2) {
        // the lob cam: riding the ball in, then right up at the rim from in front
        const b = s.ball;
        if (t < k0 - 0.15) return shot([b.x - fx * 2.5, b.y - fy * 2.5, b.z + 0.8], [star.x, star.y, rimZ], 52, 0);
        return shot([hoop.x - fx * 2.2 + nx * 0.6, hoop.y - fy * 2.2 + ny * 0.6, rimZ + 0.6], [hoop.x, hoop.y, rimZ + 0.2], 56, 1);
      }
      if (!clip.oop && look === 1) {
        // the rim cam: high behind the board, looking down the lane at the dunker coming in, then down at the rim
        const pos: [number, number, number] = [hoop.x + nx * 0.5 + fx * 1.2, hoop.y + ny * 0.5 + fy * 1.2, rimZ + 3.2];
        return t < k0 - 0.35 ? shot(pos, [star.x, star.y, 1.2], 58, 0) : shot(pos, [hoop.x - fx * 0.3, hoop.y - fy * 0.3, rimZ], 54, 1);
      }
      if (!clip.oop && look === 2) {
        // low on the sideline, tracking the dunker; then a low side look at the rim
        if (t < k0 - 0.3) return shot([star.x + nx * 4.5, star.y + ny * 4.5, 0.7], [star.x + fx * 1.5, star.y + fy * 1.5, 1.8], 50, 0);
        return shot([hoop.x + nx * 3.2 - fx * 0.8, hoop.y + ny * 3.2 - fy * 0.8, 1], [hoop.x, hoop.y, rimZ], 50 - after * 3, 1);
      }
      // tracking from the side as they take off, then a cut to low behind the baseline, looking up at the slam
      if (t < k0 - 0.45) return shot([star.x + nx * 7 - fx * 0.5, star.y + ny * 7 - fy * 0.5, 1.8], [star.x + fx, star.y + fy, 1.4], 44, 0);
      return shot([hoop.x + nx * 2.4 + fx * 3.4, hoop.y + ny * 2.4 + fy * 3.4, 0.5 + after * 0.6], [hoop.x - fx * 0.6, hoop.y - fy * 0.6, rimZ - 0.4], 60 - after * 4, 1);
    }
    case "special": {
      // the dunk, closer and lower: from the side at knee height as they take off, then flat on the floor under the
      // rim, looking straight up at it
      if (t < k0 - 0.6) return shot([star.x + nx * 5 - fx * 1, star.y + ny * 5 - fy * 1, 0.6], [star.x + fx, star.y + fy, 1.6], 50, 0);
      const after = Math.max(0, t - k0);
      return shot([hoop.x + nx * 1.6 + fx * 2.4, hoop.y + ny * 1.6 + fy * 2.4, 0.35 + after * 0.5], [hoop.x - fx * 0.4, hoop.y - fy * 0.4, rimZ - 0.2], 66 - after * 6, 1);
    }
    case "eurostep": {
      // down low in front of the driver for the two plants, then from the side under the rim for the finish
      const plants = clip.keys[1] ?? k0;
      if (t < plants + 0.3) return shot([star.x + fx * 4.5 + nx * 0.8, star.y + fy * 4.5 + ny * 0.8, 0.8], [star.x, star.y, 1.0], 50, 0);
      const b = s.ball; // the finish: watching the ball up and in
      return shot([hoop.x - fx * 1.5 + nx * 5, hoop.y - fy * 1.5 + ny * 5, 1.2], [(hoop.x + b.x) / 2, (hoop.y + b.y) / 2, Math.max(1.5, b.z)], 55, 1);
    }
    case "floater": {
      // low from the side at the take-off, then side-on and up high to ride the arc, then the drop from behind the board
      if (t < k0) return shot([star.x + nx * 5 - fx, star.y + ny * 5 - fy, 0.9], [star.x + fx * 1.5, star.y + fy * 1.5, 1.6], 48, 0);
      if (t < k1 - 0.3) {
        const b = s.ball, mx = (star.x + hoop.x) / 2, my = (star.y + hoop.y) / 2;
        return shot([mx + nx * 8, my + ny * 8, 3], [b.x, b.y, b.z], 55, 1);
      }
      return behindBoard(2);
    }
    case "screen": {
      // high and three-quarter on, so you see the pick and the defender running into it; then with the handler; then
      // the finish from behind the board
      const scr = clip.aux != null ? s.players[clip.aux] : star, cx = (star.x + scr.x) / 2, cy = (star.y + scr.y) / 2;
      if (t < k0 + 1.2) return shot([cx - fx * 6 + nx * 6, cy - fy * 6 + ny * 6, 7], [cx, cy, 0.8], 50, 0);
      if (t < k1 - 0.4) {
        const b = s.ball, f = !!s.ball.flight; // with the handler, then with the ball once it's thrown
        return shot([(f ? b.x : star.x) - fx * 6 + nx * 3, (f ? b.y : star.y) - fy * 6 + ny * 3, 4], [(b.x + hoop.x) / 2, (b.y + hoop.y) / 2, 1], 54, 1);
      }
      return behindBoard(2);
    }
    case "perimeter": {
      // the broadcast camera: high on the sideline, wide, panning with the ball as it goes round
      const b = s.ball;
      if (t > k0 - 0.4) return behindBoard(1); // it ended in a three: the swish from behind the board
      return shot([-1, b.y - fy * 2, 9], [b.x * 0.6 + hoop.x * 0.4, b.y, 0.5], 62, 0);
    }
    case "stepback": {
      // over the defender's shoulder for the step, then a ball-cam riding the shot, then from behind the board
      const def = s.players
        .filter((q) => q.side !== clip.side)
        .reduce<PSnap | null>((best, q) => (!best || Math.hypot(q.x - star.x, q.y - star.y) < Math.hypot(best.x - star.x, best.y - star.y) ? q : best), null);
      const inAir = s.ball.flight?.kind === "shot";
      if (t < k0 + 0.55 && !inAir) {
        if (def) {
          const [dx, dy] = unit(def.x - star.x, def.y - star.y);
          return shot([def.x + dx * 1.6 + nx * 0.5, def.y + dy * 1.6 + ny * 0.5, 1.7], [star.x, star.y, 1.0], 46, 0);
        }
        return shot([star.x + fx * 3 + nx * 1, star.y + fy * 3 + ny * 1, 1.6], [star.x, star.y, 1.0], 46, 0);
      }
      if (t < k1 - 0.35 || inAir) {
        // riding just behind the ball, looking where it's going
        const b = s.ball;
        if (t < k1 - 0.35) return shot([b.x - fx * 2.6 + nx * 0.4, b.y - fy * 2.6 + ny * 0.4, b.z + 0.7], [hoop.x, hoop.y, rimZ], 56, 1);
      }
      return shot([hoop.x + fx * 2.2 + nx * 0.7, hoop.y + fy * 2.2 + ny * 0.7, 3.7], [hoop.x - fx * 2, hoop.y - fy * 2, rimZ - 0.6], 62, 2);
    }
    case "ankles": {
      // straight into a shot: ride the ball up, then the finish from behind the board
      if (clip.keys.length > 1 && t >= k1 - 0.3) return behindBoard(2);
      if (s.ball.flight?.kind === "shot") {
        const b = s.ball;
        return shot([b.x - fx * 2.6 + nx * 0.4, b.y - fy * 2.6 + ny * 0.4, b.z + 0.7], [hoop.x, hoop.y, rimZ], 56, 1);
      }
      // down on the floor, circling the defender as they go down
      const v = other ?? star, sweep = (t - clip.start) / Math.max(0.1, clip.end - clip.start);
      const a0 = Math.atan2(star.y - v.y, star.x - v.x) + Math.PI * 0.6, a = a0 + sweep * 1.7;
      return shot([v.x + Math.cos(a) * 4.2, v.y + Math.sin(a) * 4.2, 0.7], [(v.x + star.x) / 2, (v.y + star.y) / 2, 0.9], 50, 0);
    }
    case "block":
    case "chase": {
      // from the side, at the height of the play, zooming in on the swat; a chase-down starts low behind the chaser
      const b = s.ball, cx = (star.x + b.x) / 2, cy = (star.y + b.y) / 2, cz = 1 + Math.max(0, b.z - 1) * 0.45; // between the bodies and the ball
      if (clip.kind === "chase" && t < k0 - 0.5) {
        const [vx, vy] = unit(star.vx || -fx, star.vy || -fy);
        return shot([star.x - vx * 5.5 + nx * 1.5, star.y - vy * 5.5 + ny * 1.5, 1.8], [star.x + vx * 3, star.y + vy * 3, 1.3], 48, 0);
      }
      const zoom = Math.max(0, Math.min(1, (t - (k0 - 1)) / 1));
      return shot([cx + nx * 7, cy + ny * 7, 1.9], [cx, cy, cz], 46 - zoom * 10, 1);
    }
    default: {
      // a buzzer-beater jumper: a high crane swooping down behind the shooter, then from behind the board
      if (t < k0 - 0.4) {
        const k = Math.max(0, Math.min(1, (t - clip.start) / Math.max(0.1, k0 - 0.4 - clip.start)));
        return shot([star.x - fx * (6 - k * 3), star.y - fy * (6 - k * 3), 11 - k * 8], [hoop.x, hoop.y, rimZ - 1], 60, 0);
      }
      return shot([hoop.x + fx * 2.2 + nx * 0.7, hoop.y + fy * 2.2 + ny * 0.7, 3.7], [hoop.x - fx * 2, hoop.y - fy * 2, rimZ - 0.6], 62, 1);
    }
  }
}
