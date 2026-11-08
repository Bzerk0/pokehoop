// Instant replays and the top plays reel. Three parts, none of which touch Three.js (LiveView draws them):
//  - a Recorder: the last few seconds of the game, one snapshot per engine step;
//  - a ClipSpotter: watches the game's events for big plays (dunks, step-back threes, ankle breakers, blocks,
//    buzzer-beaters) and says which seconds of the recording make the clip;
//  - camera scripts: for each kind of play, where the camera sits and looks at each moment of the clip (court
//    coordinates: x across, y up the court, z height), with cuts between angles, and where the slow motion falls.
import { COURT, hoopOf, type Act, type Flight, type Game, type GameEvent } from "../core/live/game.ts";
import { LIVE } from "../core/ratingConfig.ts";
import type { RatedPokemon } from "../core/types.ts";

export type PSnap = { side: 0 | 1; x: number; y: number; z: number; vx: number; vy: number; act: Act; onFire: boolean; p: RatedPokemon };
export type Snap = { t: number; players: PSnap[]; ball: { x: number; y: number; z: number; holder: number | null; flight: Flight | null } };

export function snap(g: Game): Snap {
  const b = g.ball;
  return {
    t: g.time,
    players: g.players.map((p) => ({ side: p.side, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, act: p.act, onFire: p.onFire, p: p.p })),
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

export type ClipKind = "dunk" | "stepback" | "ankles" | "block" | "chase" | "shot";
export type Clip = {
  kind: ClipKind;
  title: string; // the big caption: SLAM DUNK!
  who: number; // the star (player index)
  vs?: number; // the other one in it: the defender, the shooter who got blocked
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
  private oopAt = new Map<number, number>();

  spot(e: GameEvent, g: Game): Clip | null {
    const t = g.time, H = LIVE.replayHype, name = (i: number) => g.players[i].p.name.toUpperCase();
    const clip = (kind: ClipKind, title: string, who: number, start: number, keys: number[], end: number, hype: number, vs?: number): Clip =>
      ({ kind, title, who, vs, side: g.players[who].side, start, end, keys, hype, frames: [] });
    if (e.who == null) return null;
    const who = e.who;
    switch (e.kind) {
      case "release":
        if (e.text === "DUNK") this.dunkAt.set(who, t);
        return null;
      case "move":
        if (e.text === "STEP BACK") this.stepAt.set(who, t);
        if (e.text === "ALLEY-OOP!") this.oopAt.set(who, t);
        return null;
      case "make": {
        // a make that ends a quarter (or the game) is a buzzer-beater: bigger, whatever it was
        const buzzer = (g.timed && g.clock < 1.5) || g.over;
        const extra = buzzer ? H.buzzer : 0, tag = buzzer ? "BUZZER-BEATER! " : "";
        const dunk = this.dunkAt.get(who), step = this.stepAt.get(who);
        this.dunkAt.delete(who);
        const oop = this.oopAt.get(who);
        this.oopAt.delete(who);
        if (oop != null && t - oop < 2.5) return clip("dunk", `${tag}ALLEY-OOP!`, who, oop - 1, [t], t + 1.2, H.oop + extra);
        if (dunk != null && t - dunk < 1) return clip("dunk", `${tag}SLAM DUNK!`, who, dunk - 1.8, [t], t + 1.2, H.dunk + extra);
        if (step != null && t - step < 3.5 && e.text === "THREE!") {
          this.stepAt.delete(who);
          return clip("stepback", `${tag}STEP-BACK THREE!`, who, step - 0.8, [step, t], t + 0.9, H.stepback + extra);
        }
        if (buzzer) return clip("shot", `BUZZER-BEATER! ${name(who)}`, who, t - 2.4, [t], t + 1, extra + (e.text === "THREE!" ? 1 : 0));
        return null;
      }
      case "ankles":
        return clip("ankles", "ANKLE BREAKER!", who, t - 1.2, [t + 0.15], t + 1.6, H.ankles, e.vs);
      case "block": {
        const chase = e.text.startsWith("CHASE");
        return clip(chase ? "chase" : "block", chase ? "CHASE-DOWN BLOCK!" : "REJECTED!", who, t - 1.6, [t], t + 1, chase ? H.chase : H.block, e.vs);
      }
    }
    return null;
  }
}

/** Playback speed at clip time `t`: slow motion around each key moment, easing back to full speed. */
export function replaySpeed(clip: Clip, t: number) {
  const span = LIVE.replaySlowSpan;
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
  const hoop = hoopOf(attacker === star ? clip.side : ((1 - clip.side) as 0 | 1));
  const [fx, fy] = unit(hoop.x - attacker.x, hoop.y - attacker.y); // toward the hoop
  const [nx, ny] = [-fy, fx]; // across
  const k0 = clip.keys[0], k1 = clip.keys[clip.keys.length - 1];
  const rimZ = COURT.rimZ;
  const shot = (pos: [number, number, number], look: [number, number, number], fov: number, cut: number): Shot => ({ pos, look, fov, cut });

  switch (clip.kind) {
    case "dunk": {
      // tracking from the side as they take off, then a cut to low behind the baseline, looking up at the slam
      if (t < k0 - 0.45) return shot([star.x + nx * 7 - fx * 0.5, star.y + ny * 7 - fy * 0.5, 1.8], [star.x + fx, star.y + fy, 1.4], 44, 0);
      const after = Math.max(0, t - k0);
      return shot([hoop.x + nx * 2.4 + fx * 3.4, hoop.y + ny * 2.4 + fy * 3.4, 0.5 + after * 0.6], [hoop.x - fx * 0.6, hoop.y - fy * 0.6, rimZ - 0.4], 60 - after * 4, 1);
    }
    case "stepback": {
      // over the defender's shoulder for the step, then a ball-cam riding the shot, then from behind the board
      const def = s.players
        .filter((q) => q.side !== clip.side)
        .reduce<PSnap | null>((best, q) => (!best || Math.hypot(q.x - star.x, q.y - star.y) < Math.hypot(best.x - star.x, best.y - star.y) ? q : best), null);
      if (t < k0 + 0.55) {
        if (def) {
          const [dx, dy] = unit(def.x - star.x, def.y - star.y);
          return shot([def.x + dx * 1.6 + nx * 0.5, def.y + dy * 1.6 + ny * 0.5, 1.7], [star.x, star.y, 1.0], 46, 0);
        }
        return shot([star.x + fx * 3 + nx * 1, star.y + fy * 3 + ny * 1, 1.6], [star.x, star.y, 1.0], 46, 0);
      }
      if (t < k1 - 0.35) {
        const b = s.ball;
        return shot([b.x - fx * 2.6 + nx * 0.4, b.y - fy * 2.6 + ny * 0.4, b.z + 0.7], [hoop.x, hoop.y, rimZ], 56, 1);
      }
      return shot([hoop.x + fx * 2.2 + nx * 0.7, hoop.y + fy * 2.2 + ny * 0.7, 3.7], [hoop.x - fx * 2, hoop.y - fy * 2, rimZ - 0.6], 62, 2);
    }
    case "ankles": {
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
