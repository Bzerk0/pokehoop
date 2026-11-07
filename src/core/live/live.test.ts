import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIVE, LIVE_AI } from "../ratingConfig.ts";
import { rateAll } from "../ratings.ts";
import type { RatedPokemon } from "../types.ts";
import { makeAi } from "./ai.ts";
import {
  blockChance, COURT, hoopOf, makeChance, newGame, NO_INPUT, shotWindow, step, timingOf, type Game, type Input,
} from "./game.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const named = (slug: string) => pool.find((p) => p.slug === slug)!;
const DT = 1 / 60;
const hold = (inp: Partial<Input>): Input => ({ ...NO_INPUT, ...inp });

/** Both sides played by the CPU, until someone wins or time runs out. */
function cpuGame(you: RatedPokemon, cpu: RatedPokemon, seed: number, level = LIVE_AI.PRO, maxSec = 1200) {
  const g = newGame(you, cpu, seed);
  const ai = [makeAi(0, level), makeAi(1, level)];
  for (let t = 0; t < maxSec && !g.over; t += DT) step(g, [ai[0](g, DT), ai[1](g, DT)], DT);
  return g;
}

describe("shot odds", () => {
  it("timing, rating and contests move the make chance the right way", () => {
    expect(makeChance("mid", 70, "perfect", 0)).toBeGreaterThan(makeChance("mid", 70, "good", 0));
    expect(makeChance("mid", 70, "good", 0)).toBeGreaterThan(makeChance("mid", 70, "miss", 0));
    expect(makeChance("three", 90, "good", 0)).toBeGreaterThan(makeChance("three", 50, "good", 0));
    expect(makeChance("rim", 70, "good", 1)).toBeLessThan(makeChance("rim", 70, "good", 0));
    for (const zone of ["rim", "mid", "three"] as const)
      for (const t of ["perfect", "good", "miss"] as const) {
        const p = makeChance(zone, 99, t, 0);
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
      }
  });

  it("the green zone grows with the rating and shrinks when contested or deep", () => {
    expect(shotWindow(90, 0, 5)).toBeGreaterThan(shotWindow(40, 0, 5));
    expect(shotWindow(70, 1, 5)).toBeLessThan(shotWindow(70, 0, 5));
    expect(shotWindow(70, 0, 11)).toBeLessThan(shotWindow(70, 0, 7));
    expect(timingOf(1, 0.1)).toBe("perfect");
    expect(timingOf(1.08, 0.1)).toBe("good");
    expect(timingOf(0.8, 0.1)).toBe("miss");
  });

  it("good shot blockers beat weak shooters more often", () => {
    expect(blockChance(90, 50)).toBeGreaterThan(blockChance(50, 90));
  });
});

describe("the live 1v1 engine", () => {
  const you = named("lucario"), cpu = named("machamp");

  it("holding up runs you toward the top hoop, and the court edge stops you", () => {
    const g = newGame(you, cpu, 1);
    g.players[1].x = 1; // out of the way
    const y0 = g.players[0].y;
    for (let i = 0; i < 60; i++) step(g, [hold({ y: 1 }), NO_INPUT], DT);
    expect(g.players[0].y).toBeGreaterThan(y0 + 3);
    expect(hoopOf(0).y).toBeGreaterThan(COURT.l / 2); // you attack the top
    for (let i = 0; i < 60 * 10; i++) step(g, [hold({ y: 1, x: 1, turbo: true }), NO_INPUT], DT);
    expect(g.players[0].y).toBeLessThanOrEqual(COURT.l);
    expect(g.players[0].x).toBeLessThanOrEqual(COURT.w);
  });

  it("the same seed and keys give the same game", () => {
    const a = cpuGame(you, cpu, 42, LIVE_AI.PRO, 60);
    const b = cpuGame(you, cpu, 42, LIVE_AI.PRO, 60);
    expect(a.score).toEqual(b.score);
    expect([a.players[0].x, a.players[1].y, a.ball.x]).toEqual([b.players[0].x, b.players[1].y, b.ball.x]);
  });

  it.each(Object.keys(LIVE_AI))("a %s CPU-vs-CPU game always finishes", (level) => {
    for (let seed = 1; seed <= 4; seed++) {
      const g = cpuGame(pool[(seed * 97) % pool.length], pool[(seed * 31) % pool.length], seed, LIVE_AI[level as keyof typeof LIVE_AI]);
      expect(g.over, `${level} seed ${seed}: ${g.score}`).toBe(true);
      expect(Math.max(...g.score)).toBeGreaterThanOrEqual(LIVE.targetScore);
    }
  });

  it("a well-timed open shot goes in far more often than a mistimed one", () => {
    const rate = (holdSteps: number) => {
      let made = 0;
      for (let seed = 0; seed < 200; seed++) {
        const g: Game = newGame(you, cpu, seed);
        g.players[1].x = 1; // wide open
        g.players[1].y = 1;
        g.players[0].y = hoopOf(0).y - 5;
        for (let i = 0; i < holdSteps; i++) step(g, [hold({ shoot: true }), NO_INPUT], DT);
        step(g, [NO_INPUT, NO_INPUT], DT);
        made += g.lastShot?.made ? 1 : 0;
      }
      return made / 200;
    };
    const perfect = Math.round((LIVE.meterTime * 60));
    expect(rate(perfect)).toBeGreaterThan(rate(10) + 0.3);
  });

  it("blocks are timeable: jump with the release and you can block it, jump way early and you can't", () => {
    const blocks = (jumpEarly: number) => {
      let n = 0;
      for (let seed = 0; seed < 150; seed++) {
        const g = newGame(you, named("snorlax"), seed);
        const sh = g.players[0], def = g.players[1];
        sh.y = hoopOf(0).y - 5;
        def.x = sh.x;
        def.y = sh.y + 0.8; // right in front
        const steps = Math.round(LIVE.meterTime * 60);
        let blocked = false;
        for (let i = 0; i <= steps + 30; i++) {
          const jump = i === steps - jumpEarly;
          step(g, [hold({ shoot: i < steps }), hold({ shoot: jump })], DT);
          if (g.events.some((e) => e.kind === "block")) blocked = true;
        }
        n += blocked ? 1 : 0;
      }
      return n / 150;
    };
    expect(blocks(2)).toBeGreaterThan(0.15);
    expect(blocks(90)).toBe(0);
  });

  it("a weak release falls short as an air ball, the weaker the shorter; a full one reaches the rim", () => {
    const landing = (holdSteps: number) => {
      const g = newGame(you, cpu, 9);
      g.players[1].x = 1; // wide open
      g.players[1].y = 1;
      g.players[0].y = hoopOf(0).y - 7;
      for (let i = 0; i < holdSteps; i++) step(g, [hold({ shoot: true }), NO_INPUT], DT);
      step(g, [NO_INPUT, NO_INPUT], DT);
      const f = g.ball.flight!;
      const toHoop = Math.hypot(f.x1 - hoopOf(0).x, f.y1 - hoopOf(0).y);
      let airball = false;
      for (let i = 0; i < 120; i++) {
        step(g, [NO_INPUT, NO_INPUT], DT);
        if (g.events.some((e) => e.text === "AIR BALL!")) airball = true;
      }
      return { short: !!f.short, toHoop, airball };
    };
    const tap = landing(8), weak = landing(Math.round(LIVE.meterTime * 60 * 0.6)), full = landing(Math.round(LIVE.meterTime * 60));
    expect(tap.short && tap.airball).toBe(true);
    expect(weak.short).toBe(true);
    expect(tap.toHoop).toBeGreaterThan(weak.toHoop); // a tap falls shorter than a half-hearted shot
    expect(weak.toHoop).toBeGreaterThan(1.5); // "far short", not a rim graze
    expect(full.short).toBe(false);
    expect(full.toHoop).toBeLessThan(0.01);
  });

  it("a missed steal leaves you stumbling", () => {
    const g = newGame(you, cpu, 3);
    g.players[1].x = 1; // nowhere near the ball
    step(g, [NO_INPUT, hold({ steal: true })], DT);
    expect(g.players[1].act).toBe("stumble");
  });
});
