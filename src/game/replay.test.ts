import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeAi, makeCoach } from "../core/live/ai.ts";
import { COURT, lineupGame, step, type Game, type GameEvent } from "../core/live/game.ts";
import { cpuTeam } from "../core/cpuTeam.ts";
import { LIVE, LIVE_AI } from "../core/ratingConfig.ts";
import { rateAll } from "../core/ratings.ts";
import { cameraFor, ClipSpotter, frameAt, Recorder, replaySpeed, snap, type Clip } from "./replay.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = new Map(pool.map((p) => [p.id, p]));
const DT = 1 / 60;
const game = (seed = 1) => lineupGame(cpuTeam(pool, "ALL-STAR", "unlimited", 3), cpuTeam(pool, "ALL-STAR", "unlimited", 4), dex, 5, seed);
const ev = (kind: GameEvent["kind"], text: string, who: number, vs?: number): GameEvent => ({ kind, side: 0, text, who, vs });
const finite = (c: ReturnType<typeof cameraFor>) => [...c.pos, ...c.look, c.fov].every(Number.isFinite);

describe("replays", () => {
  it("the recorder keeps only the last few seconds", () => {
    const g = game(), rec = new Recorder(2);
    for (let i = 0; i < 300; i++) {
      g.time = i * DT;
      rec.push(g);
    }
    const kept = rec.between(-1, 99);
    expect(kept[0].t).toBeGreaterThanOrEqual(299 * DT - 2 - 1e-9);
    expect(kept.length).toBeLessThan(130);
  });

  it("spots dunks, step-back threes, ankle breakers and blocks; a plain make is no clip", () => {
    const g = game(), sp = new ClipSpotter();
    g.time = 10;
    expect(sp.spot(ev("release", "DUNK", 2), g)).toBeNull();
    g.time = 10.2;
    const dunk = sp.spot(ev("make", "SCORE!", 2), g)!;
    expect(dunk.kind).toBe("dunk");
    expect(dunk.who).toBe(2);
    expect(dunk.keys[0]).toBe(10.2);
    expect(dunk.start).toBeLessThan(10);

    g.time = 20;
    sp.spot(ev("move", "STEP BACK", 1), g);
    g.time = 21.5;
    expect(sp.spot(ev("make", "THREE!", 1), g)!.kind).toBe("stepback");
    g.time = 30;
    expect(sp.spot(ev("make", "SCORE!", 3), g)).toBeNull(); // nothing special
    expect(sp.spot(ev("ankles", "ANKLES!", 0, 5), g)!.vs).toBe(5);
    expect(sp.spot(ev("block", "CHASE-DOWN BLOCK!", 6, 1), g)!.kind).toBe("chase");
    expect(sp.spot(ev("block", "BLOCKED!", 6, 1), g)!.kind).toBe("block");
  });

  it("spots special dunks, eurosteps, floaters, scores off a screen and the ball swinging round the arc", () => {
    const g = game(), sp = new ClipSpotter();
    g.time = 10;
    sp.spot(ev("move", "WINDMILL!", 2), g);
    sp.spot(ev("release", "DUNK", 2), g);
    g.time = 10.4;
    const special = sp.spot(ev("make", "SCORE!", 2), g)!;
    expect([special.kind, special.title]).toEqual(["special", "WINDMILL!"]);
    expect(special.hype).toBeGreaterThan(LIVE.replayHype.dunk);

    g.time = 20;
    sp.spot(ev("move", "EUROSTEP", 1, 6), g);
    g.time = 21.2;
    const euro = sp.spot(ev("make", "SCORE!", 1), g)!;
    expect(euro.kind).toBe("eurostep");
    expect(euro.keys).toHaveLength(3); // both plants and the finish
    g.time = 30;
    sp.spot(ev("move", "EUROSTEP", 1), g);
    g.time = 33.5;
    expect(sp.spot(ev("make", "SCORE!", 1), g)).toBeNull(); // too long after

    g.time = 40;
    sp.spot(ev("release", "FLOATER", 3), g);
    g.time = 40.8;
    expect(sp.spot(ev("make", "SCORE!", 3), g)!.kind).toBe("floater");

    // a screen by 4 on defender 7 while 0 has the ball; 0 scores
    g.ball.holder = 0;
    g.ball.flight = null;
    g.time = 50;
    sp.spot(ev("screen", "SCREEN!", 4, 7), g);
    g.time = 52;
    const pick = sp.spot(ev("make", "SCORE!", 0), g)!;
    expect([pick.kind, pick.who, pick.vs, pick.aux]).toEqual(["screen", 0, 7, 4]);

    // three passes round the arc, both ends outside the line: a ball-movement clip; a three off it upgrades it
    const hoopY = COURT.l - COURT.hoopIn, far = COURT.three + 1.5;
    const spots = [[COURT.w / 2, hoopY - far], [2, hoopY - far + 2], [COURT.w - 2, hoopY - far + 2], [COURT.w / 2, hoopY - far]];
    [0, 1, 2, 3].forEach((i) => Object.assign(g.players[i], { x: spots[i][0], y: spots[i][1] }));
    let swing: Clip | null = null;
    for (const [k, [from, to]] of [[0, 1], [1, 2], [2, 3]].entries()) {
      g.time = 60 + k;
      g.ball.flight = { kind: "pass", x0: 0, y0: 0, z0: 1, x1: g.players[to].x, y1: g.players[to].y, z1: 1, peak: 2, t: 0, dur: 0.5, made: false, points: 2, by: from, to, tested: [] };
      swing = sp.spot(ev("pass", "", from, to), g) ?? swing;
    }
    expect(swing?.kind).toBe("perimeter");
    const before = swing!.hype;
    g.time = 63.5;
    sp.spot(ev("make", "THREE!", 3), g);
    expect(swing!.title).toContain("THREE");
    expect(swing!.hype).toBeGreaterThan(before);
  });

  it("an ankle breaker that goes straight into a made shot keeps filming through the shot", () => {
    const g = game(), sp = new ClipSpotter();
    g.time = 10;
    const ak = sp.spot(ev("ankles", "ANKLES!", 2, 6), g)!;
    g.time = 10.6;
    sp.spot(ev("release", "GOOD", 2), g);
    expect(ak.end).toBeGreaterThan(12);
    g.time = 11.8;
    sp.spot(ev("make", "SCORE!", 2), g);
    expect(ak.keys).toEqual([10.15, 11.8]);
    expect(ak.title).toContain("BUCKET");
    // a shot much later isn't part of it
    g.time = 20;
    const later = sp.spot(ev("ankles", "ANKLES!", 2, 6), g)!;
    g.time = 23;
    sp.spot(ev("release", "GOOD", 2), g);
    expect(later.end).toBeCloseTo(21.6);
  });

  it("an eased clip (the corner three) starts in full slow-mo and speeds up to normal", () => {
    const clip = { start: 4, keys: [5, 6], ease: 1.4 } as Clip;
    expect(replaySpeed(clip, 5)).toBeCloseTo(LIVE.replaySlow);
    expect(replaySpeed(clip, 5.7)).toBeGreaterThan(LIVE.replaySlow);
    expect(replaySpeed(clip, 5.7)).toBeLessThan(replaySpeed(clip, 6.2));
    expect(replaySpeed(clip, 6.4)).toBe(1);
    expect(replaySpeed(clip, 6)).toBeLessThan(1); // no fresh slow-down at the make
  });

  it("slow motion lands on the key moment", () => {
    const clip = { keys: [5] } as Clip;
    expect(replaySpeed(clip, 5)).toBeCloseTo(LIVE.replaySlow);
    expect(replaySpeed(clip, 2)).toBe(1);
    expect(replaySpeed(clip, 5 + LIVE.replaySlowSpan * 1.5)).toBeGreaterThan(LIVE.replaySlow);
  });

  it("a CPU game turns up clips, and every camera angle stays a real number all the way through", () => {
    const g: Game = game(7), rec = new Recorder(6), sp = new ClipSpotter();
    const ai = g.players.map((p) => makeAi(p.i, LIVE_AI["ALL-STAR"])), coaches = [makeCoach(0), makeCoach(1)];
    const pending: Clip[] = [], done: Clip[] = [];
    for (let i = 0; i < 300 * 60 && !g.over; i++) {
      step(g, g.players.map((p) => ai[p.i](g, DT)), DT);
      for (const c of coaches) c(g);
      rec.push(g);
      for (const e of g.events) {
        const c = sp.spot(e, g);
        if (c) pending.push(c);
      }
      for (const c of pending.filter((c) => g.time >= c.end)) {
        c.frames = rec.between(c.start, c.end);
        done.push(c);
        pending.splice(pending.indexOf(c), 1);
      }
    }
    expect(done.length).toBeGreaterThan(0);
    for (const c of done) {
      expect(c.frames.length).toBeGreaterThan(30);
      for (let t = c.start; t <= c.end; t += 0.05) expect(finite(cameraFor(c, t, frameAt(c.frames, t))), `${c.kind} at ${t}`).toBe(true);
    }
    // every new camera script, run over a real clip's frames
    for (const kind of ["special", "eurostep", "floater", "screen", "perimeter"] as const) {
      const c = { ...done[0], kind, keys: [done[0].keys[0] - 0.4, done[0].keys[0]], vs: (done[0].who + 5) % 10, aux: (done[0].who + 1) % 10 };
      for (let t = c.start; t <= c.end; t += 0.05) expect(finite(cameraFor(c, t, frameAt(c.frames, t))), `${kind} at ${t}`).toBe(true);
    }
    // the snapshot is a copy: changing the game doesn't change the recording
    const s = snap(g);
    g.players[0].x += 5;
    expect(s.players[0].x).not.toBe(g.players[0].x);
  }, 60_000);
});
