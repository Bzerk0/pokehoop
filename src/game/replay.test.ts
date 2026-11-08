import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeAi, makeCoach } from "../core/live/ai.ts";
import { lineupGame, step, type Game, type GameEvent } from "../core/live/game.ts";
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
    // the snapshot is a copy: changing the game doesn't change the recording
    const s = snap(g);
    g.players[0].x += 5;
    expect(s.players[0].x).not.toBe(g.players[0].x);
  }, 60_000);
});
