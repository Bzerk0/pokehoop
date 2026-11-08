import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_STYLES, LIVE, LIVE_AI } from "../ratingConfig.ts";
import { rateAll } from "../ratings.ts";
import type { RatedPokemon } from "../types.ts";
import { makeAi, makeCoach, styleOf } from "./ai.ts";
import {
  blockChance, boxes, callPlay, passBall, callScheme, COURT, dist, energyOf, giveBall, hoopOf, keyPlayer, lineupGame, longShotFactor, makeChance, meterWindow, newGame, quickChance,
  NO_INPUT, shotWindow, spotOf, step, timingOf, type Game, type GameEvent, type Input,
} from "./game.ts";
import { canSimRest, simTheRest } from "./handover.ts";
import { score } from "../stats.ts";
import { cpuTeam } from "../cpuTeam.ts";
import { playWeights, ZONE, type PlayName, type SchemeName } from "./plays.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const named = (slug: string) => pool.find((p) => p.slug === slug)!;
const DT = 1 / 60;
const hold = (inp: Partial<Input>): Input => ({ ...NO_INPUT, ...inp });

/** Both sides played by the CPU, until someone wins or time runs out. */
function cpuGame(you: RatedPokemon, cpu: RatedPokemon, seed: number, level = LIVE_AI.PRO, maxSec = 1200) {
  const g = newGame([you], [cpu], seed);
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
    const g = newGame([you], [cpu], 1);
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
        const g: Game = newGame([you], [cpu], seed);
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
        const g = newGame([you], [named("snorlax")], seed);
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
      const g = newGame([you], [cpu], 9);
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
    const g = newGame([you], [cpu], 3);
    g.players[1].x = 1; // nowhere near the ball
    step(g, [NO_INPUT, hold({ steal: true })], DT);
    expect(g.players[1].act).toBe("stumble");
  });
});

describe("team games (Phase 6)", () => {
  // two fixed, full lineups: PG, SG, SF, PF, C
  const homeFive = ["lucario", "greninja", "machamp", "garchomp", "snorlax"].map(named);
  const awayFive = ["alakazam", "scizor", "infernape", "tyranitar", "metagross"].map(named);
  const stepAll = (g: Game, ai: ((g: Game, dt: number) => Input)[], mine?: Input) =>
    step(g, g.players.map((p) => (mine && p.i === g.control ? mine : ai[p.i](g, DT))), DT);

  /** All ten played by the CPU; counts what happened. */
  function teamGame(size: 3 | 5, seed: number, level = LIVE_AI.PRO, maxSec = 1800) {
    const pick = (five: RatedPokemon[]) => (size === 5 ? five : [five[0], five[2], five[4]]);
    const g = newGame(pick(homeFive), pick(awayFive), seed);
    const ai = g.players.map((p) => makeAi(p.i, level));
    const n = { pass: 0, steal: 0, violation: 0, shots: 0, makes: 0, possessions: 1 };
    let poss = g.poss;
    for (let t = 0; t < maxSec && !g.over; t += DT) {
      stepAll(g, ai);
      for (const e of g.events) {
        if (e.kind === "pass") n.pass++;
        if (e.kind === "steal") n.steal++;
        if (e.kind === "violation") n.violation++;
        if (e.kind === "release") n.shots++;
        if (e.kind === "make") n.makes++;
      }
      if (g.poss !== poss) {
        n.possessions++;
        poss = g.poss;
      }
    }
    return { g, n };
  }

  it("a 5v5 game sets up five a side, the point guard with the ball and you steering him", () => {
    const g = newGame(homeFive, awayFive, 1);
    expect(g.players.length).toBe(10);
    expect(g.players.filter((p) => p.side === 0).map((p) => p.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(g.ball.holder).toBe(0);
    expect(g.control).toBe(0);
    expect(g.target).toBe(LIVE.targetBySize[5]);
  });

  it("J passes to the teammate you face, the pass arrives, and your control moves on the catch", () => {
    const g = newGame(homeFive, awayFive, 2);
    for (const p of g.players) if (p.side === 1) p.x = p.slot < 3 ? 0.5 : COURT.w - 0.5; // defenders out of the lane
    const sg = g.players[1];
    sg.x = g.players[0].x + 4; // the shooting guard straight to your right
    sg.y = g.players[0].y;
    step(g, g.players.map((p) => (p.i === 0 ? hold({ x: 1, steal: true }) : NO_INPUT)), DT);
    expect(g.ball.flight?.kind).toBe("pass");
    expect(g.ball.flight?.to).toBe(1);
    expect(g.control).toBe(0); // you keep the passer while the ball's in the air…
    for (let i = 0; i < 60 && g.ball.holder !== 1; i++) step(g, g.players.map(() => NO_INPUT), DT);
    expect(g.ball.holder).toBe(1);
    expect(g.control).toBe(1); // …and take the receiver on the catch
  });

  it("1–5 passes straight to that player; a defender in the lane forces a lob; one sitting on the receiver picks some off", () => {
    /** Pass from the PG to the centre 8 m up court with their PG standing `gap` metres short of the centre. */
    const trial = (seed: number, gap: number) => {
      const g = newGame(homeFive, awayFive, seed);
      for (const p of g.players) if (p.side === 1) p.x = 0.5;
      const c = g.players[4];
      c.x = g.players[0].x;
      c.y = g.players[0].y + 8;
      const thief = g.players[5];
      thief.x = c.x;
      thief.y = c.y - gap;
      step(g, g.players.map((p) => (p.i === 0 ? hold({ passTo: 4 }) : NO_INPUT)), DT);
      const f = g.ball.flight!;
      expect(f.to).toBe(4);
      for (let i = 0; i < 90 && g.ball.flight; i++) step(g, g.players.map(() => NO_INPUT), DT);
      return { lob: f.peak > 3, picked: g.ball.holder === thief.i };
    };
    expect(trial(1, 4).lob).toBe(true); // mid-lane: thrown over him
    expect(trial(1, 4).picked).toBe(false);
    let picked = 0;
    for (let seed = 0; seed < 120; seed++) if (trial(seed, 0.7).picked) picked++; // fronting the receiver
    expect(picked).toBeGreaterThan(5);
    expect(picked).toBeLessThan(80);
  });

  it("holding the ball for the whole shot clock is a violation: their ball, and you switch to defence", () => {
    const g = newGame(homeFive, awayFive, 3);
    for (const p of g.players) if (p.side === 1) p.x = COURT.w - 0.5; // nobody bothers you
    let violation = false;
    for (let i = 0; i < 60 * (LIVE.shotClock + 0.5); i++) {
      step(g, g.players.map(() => NO_INPUT), DT);
      if (g.events.some((e) => e.kind === "violation")) violation = true;
    }
    expect(violation).toBe(true);
    for (let i = 0; i < 60 * (LIVE.deadBall + 1); i++) step(g, g.players.map(() => NO_INPUT), DT);
    expect(g.poss).toBe(1);
    expect(g.players[g.control].side).toBe(0); // you always steer one of yours
  });

  it("the pass key (J) on defence takes over the next defender nearest the ball; L goes for the steal", () => {
    const g = newGame(homeFive, awayFive, 4);
    g.ball.holder = 5; // their PG has it
    g.poss = 1;
    g.control = 4; // you have the centre
    step(g, g.players.map((p) => (p.i === 4 ? hold({ steal: true }) : NO_INPUT)), DT);
    expect(g.control).not.toBe(4);
    expect(g.players[g.control].side).toBe(0);
    const you = g.control; // now L: a steal try (far from the ball, so a whiff and a stumble), no switch
    step(g, g.players.map((p) => (p.i === you ? hold({ cross: true }) : NO_INPUT)), DT);
    expect(g.control).toBe(you);
    expect(g.events.some((e) => e.kind === "whiff" || e.kind === "steal")).toBe(true);
  });

  it.each(["ROOKIE", "PRO", "CHAMPION"] as const)("%s 5v5 CPU-vs-CPU games flow: passes, shots, few violations, and they finish", (level) => {
    for (const seed of [1, 2]) {
      const { g, n } = teamGame(5, seed, LIVE_AI[level]);
      const why = `${level} seed ${seed}: ${g.score} ${JSON.stringify(n)}`;
      expect(g.over, why).toBe(true);
      expect(n.pass, why).toBeGreaterThan(n.possessions * 0.5); // the ball moves
      expect(n.shots, why).toBeGreaterThan(n.possessions * 0.4);
      expect(n.violation, why).toBeLessThan(n.possessions * 0.25);
    }
  });

  it("a 3v3 CPU-vs-CPU game finishes too", () => {
    const { g } = teamGame(3, 7);
    expect(g.over).toBe(true);
    expect(Math.max(...g.score)).toBeGreaterThanOrEqual(LIVE.targetBySize[3]);
  });
});

describe("plays and schemes (Phase 7)", () => {
  const homeFive = ["lucario", "greninja", "machamp", "garchomp", "snorlax"].map(named);
  const awayFive = ["alakazam", "scizor", "infernape", "tyranitar", "metagross"].map(named);

  /** A half-court set: your five on their spots with the ball at the top, theirs guarding man to man. */
  function halfCourt(seed: number, play?: PlayName, scheme?: SchemeName) {
    const g = newGame(homeFive, awayFive, seed);
    const hoop = hoopOf(0);
    for (const p of g.players) {
      if (p.side === 0) Object.assign(p, spotOf(0, p.slot, 5));
      else {
        const m = g.players[p.slot], d = dist(m, hoop);
        Object.assign(p, { x: m.x + ((hoop.x - m.x) / d) * 1.3, y: m.y + ((hoop.y - m.y) / d) * 1.3 });
      }
    }
    g.ball.holder = 0;
    if (scheme) callScheme(g, 1, scheme);
    if (play) callPlay(g, 0, play);
    return { g, ai: g.players.map((p) => makeAi(p.i, LIVE_AI.PRO)) };
  }
  const run = (g: Game, ai: ((g: Game, dt: number) => Input)[], sec: number, each?: () => void) => {
    for (let i = 0; i < sec * 60 && !g.over; i++) {
      step(g, g.players.map((p) => ai[p.i](g, DT)), DT);
      each?.();
    }
  };
  const share = (n: number, f: (seed: number) => boolean) => {
    let ok = 0;
    for (let seed = 1; seed <= n; seed++) ok += f(seed) ? 1 : 0;
    return ok / n;
  };

  it("the CPU likes the plays its lineup is built for", () => {
    const bigs = playWeights(["lucario", "greninja", "machamp", "snorlax", "tyranitar"].map(named));
    const guards = playWeights(["alakazam", "greninja", "jolteon", "weavile", "lucario"].map(named));
    expect(bigs["POST UP"] / bigs.MOTION).toBeGreaterThan(guards["POST UP"] / guards.MOTION);
  });

  it("a screen holds up a defender who runs into it", () => {
    const g = newGame(homeFive, awayFive, 1);
    const scr = g.players[4], def = g.players[5];
    Object.assign(scr, { x: 7, y: 15 });
    Object.assign(def, { x: 7, y: 13 });
    let held = false;
    for (let i = 0; i < 60; i++) {
      step(g, g.players.map((p) => (p === scr ? hold({ screen: true }) : p === def ? hold({ y: 1 }) : NO_INPUT)), DT);
      if (g.events.some((e) => e.kind === "screen")) held = true;
    }
    expect(held).toBe(true);
    expect(def.y).toBeLessThan(16); // still stuck around the screen a second later, not through it
  });

  it("PICK & ROLL runs: the big screens beside the ball handler, then rolls to the rim", () => {
    const ok = share(10, (seed) => {
      const { g, ai } = halfCourt(seed, "PICK & ROLL");
      const big = g.players[g.calls[0].key!];
      let screened = false, nearHandler = Infinity;
      run(g, ai, 2.3, () => {
        if (big.screening) screened = true;
        const h = g.players[g.ball.holder ?? 0];
        if (h.side === 0 && h !== big) nearHandler = Math.min(nearHandler, dist(big, h));
      });
      run(g, ai, 1.6);
      return screened && nearHandler < 2.5 && (dist(big, hoopOf(0)) < 3.5 || g.ball.holder === big.i || g.ball.flight != null);
    });
    expect(ok).toBeGreaterThanOrEqual(0.7);
  });

  it("POST UP runs: the ball goes into the big on the low block", () => {
    const ok = share(10, (seed) => {
      const { g, ai } = halfCourt(seed, "POST UP");
      const big = g.calls[0].key!;
      let fed = false;
      run(g, ai, 5, () => {
        if (g.ball.holder === big && !g.ball.flight && dist(g.players[big], hoopOf(0)) < 4) fed = true;
      });
      return fed;
    });
    expect(ok).toBeGreaterThanOrEqual(0.6);
  });

  it("ISOLATION runs: everyone else clears to the far side and the star gets the ball", () => {
    const ok = share(10, (seed) => {
      const { g, ai } = halfCourt(seed, "ISOLATION");
      const star = g.calls[0].key!;
      let got = false;
      run(g, ai, 3, () => {
        if (g.ball.holder === star) got = true;
      });
      const cleared = g.players.filter((p) => p.side === 0 && p.i !== star && p.i !== g.ball.holder).every((p) => p.x < COURT.w / 2);
      return got && cleared;
    });
    expect(ok).toBeGreaterThanOrEqual(0.6);
  });

  it("MOTION runs: players keep moving round the spots", () => {
    const ok = share(6, (seed) => {
      const { g, ai } = halfCourt(seed, "MOTION");
      const sg = g.players[1];
      run(g, ai, 1.5);
      const before = { x: sg.x, y: sg.y };
      run(g, ai, 2.6);
      return g.ball.holder !== 1 ? dist(before, sg) > 2.5 : true;
    });
    expect(ok).toBeGreaterThanOrEqual(0.6);
  });

  it("the 2-3 zone holds its areas: off the ball, defenders stay near their spots", () => {
    // (the first seed from 3 whose possession lasts the 2.5 s: after a turnover the zone would be on offence)
    let g = halfCourt(3, undefined, "2-3 ZONE").g;
    for (let seed = 3; seed < 12; seed++) {
      const set = halfCourt(seed, undefined, "2-3 ZONE");
      run(set.g, set.ai, 2.5);
      g = set.g;
      if (g.poss === 0) break;
    }
    expect(g.poss).toBe(0);
    const hoop = hoopOf(0);
    const off = g.players.filter((p) => p.side === 1 && dist(p, g.ball) > 3);
    for (const p of off) {
      const z = ZONE[p.slot];
      expect(dist(p, { x: COURT.w / 2 + z[0], y: hoop.y - z[1] }), `slot ${p.slot}`).toBeLessThan(3.5);
    }
  });

  it("the full-court press forces more turnovers than man-to-man", () => {
    const turnovers = (scheme: SchemeName) => {
      let lost = 0, poss = 0;
      for (let seed = 1; seed <= 30; seed++) { // many short games: a steadier sample than a few long ones
        const g = newGame(homeFive, awayFive, seed);
        const ai = g.players.map((p) => makeAi(p.i, LIVE_AI.PRO));
        let last = g.poss;
        callScheme(g, 1, scheme);
        for (let i = 0; i < 60 * 70 && !g.over; i++) {
          step(g, g.players.map((p) => ai[p.i](g, DT)), DT);
          for (const e of g.events) if ((e.kind === "steal" && e.side === 1) || (e.kind === "violation" && e.side === 0)) lost++;
          if (g.poss !== last) {
            if (last === 0) poss++;
            last = g.poss;
          }
        }
      }
      return lost / Math.max(1, poss);
    };
    expect(turnovers("PRESS")).toBeGreaterThan(turnovers("MAN") * 1.25);
  }, 90_000); // sixty simulated games: give it time

  it("the CPU coach calls plays it likes and switches defences", () => {
    const g = newGame(homeFive, awayFive, 5);
    const ai = g.players.map((p) => makeAi(p.i, LIVE_AI.PRO));
    const coaches = [makeCoach(0), makeCoach(1)];
    const calls = new Set<string>();
    for (let i = 0; i < 60 * 300 && !g.over; i++) {
      step(g, g.players.map((p) => ai[p.i](g, DT)), DT);
      for (const c of coaches) c(g); // after the step, so its calls land in this step's events
      for (const e of g.events) if (e.kind === "call") calls.add(e.text);
    }
    const plays = [...calls].filter((c) => ["PICK & ROLL", "ISOLATION", "POST UP", "MOTION"].includes(c));
    expect(plays.length).toBeGreaterThanOrEqual(2);
    expect(keyPlayer(g, 0, "big").slot).toBeGreaterThanOrEqual(3);
  });
});

describe("the full game (Phase 8)", () => {
  const dex = new Map(pool.map((p) => [p.id, p]));
  const homeL = cpuTeam(pool, "PRO", "unlimited", 11), awayL = cpuTeam(pool, "PRO", "unlimited", 12);

  /** A timed CPU-vs-CPU game between two full lineups, with coaches; `levels` per side. */
  function fullGame(seed: number, sec = 900, levels: [keyof typeof LIVE_AI, keyof typeof LIVE_AI] = ["PRO", "PRO"], away = awayL) {
    const g = lineupGame(homeL, away, dex, 5, seed);
    const ai = g.players.map((p) => makeAi(p.i, LIVE_AI[levels[p.side]]));
    const coaches = [makeCoach(0), makeCoach(1)];
    const events: string[] = [];
    for (let i = 0; i < sec * 60 && !g.over; i++) {
      step(g, g.players.map((p) => ai[p.i](g, DT)), DT);
      for (const c of coaches) c(g);
      for (const e of g.events) events.push(e.kind);
    }
    return { g, events };
  }

  it("a full game plays four quarters on the clock and ends at the final buzzer", () => {
    const { g } = fullGame(1);
    expect(g.over).toBe(true);
    expect(g.period).toBeGreaterThanOrEqual(3);
    expect(g.time).toBeGreaterThanOrEqual(4 * 90 - 1);
    for (const s of [0, 1] as const) expect(g.periods[s].reduce((x, y) => x + y, 0)).toBe(g.score[s]);
    expect(g.score[0]).not.toBe(g.score[1]);
  }, 20_000);

  it("the players you pick on the select screen take the court; the rest of the team is the bench", () => {
    const g = lineupGame(homeL, awayL, dex, 3, 1, false, [6, 1, 3]);
    expect(g.players.filter((p) => p.side === 0).map((p) => p.p.id)).toEqual([6, 1, 3].map((s) => homeL.ids[s]));
    expect(g.rosters[0].length).toBe(8);
    const one = lineupGame(homeL, awayL, dex, 1, 1, false, [7]);
    expect(one.players[0].p.id).toBe(homeL.ids[7]);
    const bad = lineupGame(homeL, awayL, dex, 3, 1, false, [1, 1, 2]); // junk picks: the default PG, SF, C
    expect(bad.players.filter((p) => p.side === 0).map((p) => p.p.id)).toEqual([0, 2, 4].map((s) => homeL.ids[s]));
  });

  it("a tie at the end of the fourth goes to a one-minute overtime", () => {
    const g = lineupGame(homeL, awayL, dex, 5, 2);
    g.period = 3;
    g.clock = 0.01;
    g.score = [40, 40];
    step(g, g.players.map(() => NO_INPUT), DT);
    expect(g.over).toBe(false);
    expect(g.period).toBe(4);
    expect(g.clock).toBe(60);
  });

  it("the box score adds up: everyone's points make the team score, makes never beat attempts", () => {
    const { g } = fullGame(3);
    const [home, away] = boxes(g);
    for (const [s, box] of [[0, home], [1, away]] as const) {
      expect(box.lines.length).toBe(8); // the whole roster, bench too
      expect(box.lines.reduce((t, l) => t + l.pts, 0)).toBe(g.score[s]);
      for (const l of box.lines) {
        expect(l.fgm).toBeLessThanOrEqual(l.fga);
        expect(l.tpm).toBeLessThanOrEqual(l.tpa);
        expect(l.tpm).toBeLessThanOrEqual(l.fgm);
      }
      // five on the court all game: minutes add up to five times the game
      expect(box.lines.reduce((t, l) => t + l.sec, 0)).toBeCloseTo(g.time * 5, -1);
    }
  }, 20_000);

  it("players tire (faster when sprinting) and the tired ones sit at stoppages", () => {
    const g = lineupGame(homeL, awayL, dex, 5, 4);
    const [walker, sprinter] = [g.players[0], g.players[1]];
    for (let i = 0; i < 60 * 20; i++)
      step(g, g.players.map((p) => (p === walker ? hold({ y: i % 120 < 60 ? 1 : -1 }) : p === sprinter ? hold({ y: i % 120 < 60 ? 1 : -1, turbo: true }) : NO_INPUT)), DT);
    expect(energyOf(g, sprinter)).toBeLessThan(energyOf(g, walker));
    const { g: g2, events } = fullGame(5);
    expect(events.filter((e) => e === "sub").length).toBeGreaterThan(0);
    expect(boxes(g2)[0].lines.filter((l) => l.slot >= 5).some((l) => l.sec > 0)).toBe(true); // the bench played
  }, 20_000);

  it("SIM THE REST picks up a live game where it left off and finishes it", () => {
    const { g } = fullGame(6, 140); // into the second quarter
    expect(canSimRest(g)).toBe(true);
    const live = boxes(g);
    const r = simTheRest(g, homeL, awayL, dex, 7);
    for (const s of [0, 1] as const) {
      const box = r.teams[s];
      expect(box.periods.length).toBeGreaterThanOrEqual(4);
      expect(box.periods[0]).toBe(live[s].periods[0]); // the first quarter as it was played
      expect(box.lines.reduce((t, l) => t + l.pts, 0)).toBe(box.periods.reduce((x, y) => x + y, 0));
      box.lines.forEach((l, i) => expect(l.pts).toBeGreaterThanOrEqual(live[s].lines[i].pts)); // nobody loses points
      expect(score(box)).toBeLessThan(60); // the rest is played at the live game's pace, not the sim's
    }
    expect(r.highlights.length).toBeGreaterThan(0);
  }, 20_000);

  it("difficulty matters: a Champion-level team beats the same lineup played at Rookie level", () => {
    // (measured over 20 games: Champion wins about 75%, by 3–6 points; 10 fixed seeds keep this steady)
    let wins = 0, margin = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { g } = fullGame(seed, 900, ["CHAMPION", "ROOKIE"], homeL); // the same five on both sides
      if (g.winner === 0) wins++;
      margin += g.score[0] - g.score[1];
    }
    expect(wins).toBeGreaterThanOrEqual(7);
    expect(margin).toBeGreaterThan(0);
  }, 120_000);
});

describe("ON FIRE (Phase 9)", () => {
  const five = ["lucario", "greninja", "machamp", "garchomp", "snorlax"].map(named);
  const other5 = ["alakazam", "scizor", "infernape", "tyranitar", "metagross"].map(named);
  /** Put a sure two in for player i (a made shot dropping through the hoop) and play it out. */
  function sink(g: Game, i: number) {
    const pl = g.players[i], hoop = hoopOf(pl.side);
    g.events = []; // (the last basket's "make" would end the wait straight away)
    g.dead = 0;
    g.ball.holder = null;
    g.ball.flight = {
      kind: "shot", x0: pl.x, y0: pl.y, z0: 2.5, x1: hoop.x, y1: hoop.y, z1: COURT.rimZ, peak: 4, t: 0, dur: 0.1,
      made: true, points: 2, by: i, to: null, tested: g.players.map((p) => p.i),
    };
    for (let k = 0; k < 20 && !g.events.some((e) => e.kind === "make"); k++) step(g, g.players.map(() => NO_INPUT), DT);
  }

  it("three straight makes set a player on fire: a bigger green zone and free sprinting, until the other team scores", () => {
    const g = newGame(five, other5, 1);
    const pl = g.players[0];
    const before = meterWindow(g, pl);
    sink(g, 0);
    sink(g, 0);
    expect(pl.onFire).toBe(false);
    let fired = false;
    sink(g, 0);
    fired = pl.onFire;
    expect(fired).toBe(true);
    expect(meterWindow(g, pl)).toBeGreaterThan(before * 1.3);
    // sprinting on fire costs nothing
    giveBall(g, 0);
    for (let k = 0; k < 60; k++) step(g, g.players.map((p) => (p === pl ? hold({ x: k % 60 < 30 ? 1 : -1, turbo: true }) : NO_INPUT)), DT);
    expect(pl.turbo).toBeCloseTo(1, 5);
    // they score: the fire's out
    sink(g, 5);
    expect(pl.onFire).toBe(false);
  });
});

describe("gameplay aids", () => {
  const you = named("lucario"), big = named("snorlax");
  const five = ["lucario", "greninja", "machamp", "garchomp", "snorlax"].map(named);
  const other5 = ["alakazam", "scizor", "infernape", "tyranitar", "metagross"].map(named);

  it("a quick shot (K tapped) goes straight up with no air ball: close to a timed shot near the rim, far worse from deep", () => {
    const g = newGame([you], [big], 1);
    g.players[1].x = 1;
    g.players[0].y = hoopOf(0).y - 7;
    step(g, [hold({ shoot: true }), NO_INPUT], DT);
    step(g, [hold({ shoot: true }), NO_INPUT], DT);
    step(g, [NO_INPUT, NO_INPUT], DT);
    expect(g.events.some((e) => e.text === "QUICK")).toBe(true);
    expect(g.ball.flight?.short).toBe(false);
    const timed = makeChance("rim", 70, "good", 0);
    expect(quickChance("rim", 70, 0, 1.5)).toBeGreaterThan(timed + 0.05); // right at the rim: better than a timed shot
    expect(quickChance("three", 70, 0, 8)).toBeLessThan(makeChance("three", 70, "good", 0) - 0.15); // from deep: much worse
  });

  it("your block jump drifts toward the shooter (the CPU's doesn't)", () => {
    const g = newGame([big], [you], 2); // you defend: their Lucario shoots at your hoop
    const def = g.players[0], sh = g.players[1];
    giveBall(g, 1);
    Object.assign(sh, { x: COURT.w / 2, y: hoopOf(1).y + 5 });
    Object.assign(def, { x: sh.x + 2, y: sh.y - 0.5 });
    for (let i = 0; i < 20; i++) step(g, [hold({ shoot: i === 19 }), hold({ shoot: true })], DT);
    expect(def.act).toBe("air");
    expect(def.vx).toBeLessThan(-1); // moving toward the shooter on his left
  });

  it("jumping at the block meter's line blocks a fair share of shots", () => {
    let n = 0;
    for (let seed = 0; seed < 100; seed++) {
      const g = newGame([you], [big], seed);
      const sh = g.players[0], def = g.players[1];
      sh.y = hoopOf(0).y - 5;
      Object.assign(def, { x: sh.x, y: sh.y + 0.8 });
      const release = Math.round(LIVE.meterTime * 60), jump = Math.round(LIVE.meterTime * 0.8 * 60);
      let blocked = false;
      for (let i = 0; i <= release + 30; i++) {
        step(g, [hold({ shoot: i < release }), hold({ shoot: i === jump })], DT);
        if (g.events.some((e) => e.kind === "block")) blocked = true;
      }
      if (blocked) n++;
    }
    expect(n).toBeGreaterThan(15);
  });

  it("a defender sprinting in from behind can chase down a dunk", () => {
    let chased = 0;
    for (let seed = 0; seed < 60; seed++) {
      const g = newGame(five, other5, seed);
      for (const p of g.players) if (p.i !== 0 && p.i !== 9) p.x = 0.5; // everyone else out of the way
      const dunker = g.players[0], chaser = g.players[9]; // their C
      Object.assign(dunker, { x: COURT.w / 2, y: hoopOf(0).y - 2 });
      Object.assign(chaser, { x: COURT.w / 2 + 0.3, y: dunker.y - 3.2 });
      let done = false, jumped = false;
      for (let i = 0; i < 90 && !done; i++) {
        // the chaser is already sprinting up behind; the dunker goes up; the chaser leaps when he's near
        const go = i === 10, leap = dunker.act === "dunk" && !jumped && dist(chaser, dunker) < 1.8;
        if (leap) jumped = true;
        step(g, g.players.map((p) => (p === dunker ? hold({ shoot: go, turbo: go }) : p === chaser ? hold({ y: 1, turbo: true, shoot: leap }) : NO_INPUT)), DT);
        if (g.events.some((e) => e.text === "CHASE-DOWN BLOCK!")) {
          chased++;
          done = true;
        }
      }
    }
    expect(chased).toBeGreaterThan(3);
  });

  it("a teammate being passed to steps toward the ball", () => {
    const g = newGame(five, other5, 3);
    for (const p of g.players) if (p.side === 1) p.x = 0.5;
    const ai = g.players.map((p) => makeAi(p.i, LIVE_AI.PRO));
    const c = g.players[4];
    Object.assign(c, { x: g.players[0].x, y: g.players[0].y + 8 });
    step(g, g.players.map((p) => (p.i === 0 ? hold({ passTo: 4 }) : NO_INPUT)), DT);
    const start = dist(c, g.players[0]);
    for (let i = 0; i < 12 && g.ball.flight; i++) step(g, g.players.map((p) => (p.i === 0 ? NO_INPUT : ai[p.i](g, DT))), DT);
    expect(dist(c, g.players[0])).toBeLessThan(start - 0.3);
  });
});
describe("step-back", () => {
  it("a crossover pushing away from the hoop is a step-back: you hop back, away from the hoop", () => {
    const g = newGame([named("lucario")], [named("machamp")], 1);
    const pl = g.players[0];
    pl.y = hoopOf(0).y - 6;
    g.players[1].x = 1;
    const before = dist(pl, hoopOf(0));
    step(g, [hold({ y: -1, cross: true }), NO_INPUT], DT); // pushing down = away from the hoop you attack
    expect(g.events.some((e) => e.text === "STEP BACK")).toBe(true);
    for (let i = 0; i < 10; i++) step(g, [NO_INPUT, NO_INPUT], DT);
    expect(dist(pl, hoopOf(0))).toBeGreaterThan(before + 0.5);
    const g2 = newGame([named("lucario")], [named("machamp")], 1);
    step(g2, [hold({ x: 1, cross: true }), NO_INPUT], DT); // sideways: a normal crossover
    expect(g2.events.some((e) => e.text === "STEP BACK")).toBe(false);
  });
});
describe("long shots and double jumps", () => {
  it("half- and full-court shots: next to impossible for weak shooters, rare but real for the best", () => {
    const k = COURT.scale, half = 16 * k, full = 30 * k;
    expect(longShotFactor(50, 50, 6)).toBe(1); // normal range: untouched
    expect(longShotFactor(40, 40, full)).toBeLessThan(0.001); // weak: no chance from full court
    expect(longShotFactor(99, 99, full)).toBeGreaterThan(0.01); // elite: a sliver
    expect(longShotFactor(99, 99, full)).toBeLessThan(0.15); // …but still hard
    expect(longShotFactor(99, 99, half)).toBeGreaterThan(longShotFactor(70, 70, half) * 2); // steep at the top end
    expect(longShotFactor(70, 70, half)).toBeGreaterThan(longShotFactor(40, 40, half) * 5);
  });

  it("Flying and Dragon types can jump again in mid-air; others can't", () => {
    const flyer = pool.find((p) => p.types.includes("flying"))!, ground = named("snorlax");
    for (const [p, can] of [[flyer, true], [ground, false]] as const) {
      const g = newGame([named("lucario")], [p], 1);
      const pl = g.players[1];
      pl.x = 1;
      step(g, [NO_INPUT, hold({ shoot: true })], DT); // jump
      for (let i = 0; i < 10; i++) step(g, [NO_INPUT, NO_INPUT], DT);
      const vzBefore = pl.vz;
      step(g, [NO_INPUT, hold({ shoot: true })], DT); // jump again, mid-air
      expect(pl.vz > vzBefore + 0.3, p.name).toBe(can); // a second push upward (without one, it only keeps falling)
    }
  });

  it("one-character mode: passing and defence never switch who you are; the pass key calls for the ball", () => {
    const dex = new Map(pool.map((p) => [p.id, p]));
    const homeL = cpuTeam(pool, "PRO", "unlimited", 11), awayL = cpuTeam(pool, "PRO", "unlimited", 12);
    const g = lineupGame(homeL, awayL, dex, 3, 1);
    g.solo = true;
    const me = g.players[0], mate = g.players[1];
    giveBall(g, me.i);
    me.x = 0; me.y = 5; mate.x = 3; mate.y = 6;
    for (const q of g.players) if (q.side === 1) (q.x = -8), (q.y = 2); // out of the lane
    step(g, g.players.map((q) => (q === me ? hold({ passTo: 1 }) : NO_INPUT)), DT);
    for (let i = 0; i < 120 && g.ball.holder !== mate.i; i++) step(g, g.players.map(() => NO_INPUT), DT);
    expect(g.ball.holder).toBe(mate.i);
    expect(g.control).toBe(me.i); // still you
    step(g, g.players.map((q) => (q === me ? hold({ steal: true }) : NO_INPUT)), DT); // call for it
    for (let i = 0; i < 120 && g.ball.holder !== me.i; i++) step(g, g.players.map(() => NO_INPUT), DT);
    expect(g.ball.holder).toBe(me.i);
  });

  it("one-character mode: you never take the inbound out yourself; it comes to you", () => {
    const dex = new Map(pool.map((p) => [p.id, p]));
    const g = lineupGame(cpuTeam(pool, "PRO", "unlimited", 11), cpuTeam(pool, "PRO", "unlimited", 12), dex, 5, 3);
    g.solo = true;
    g.control = 2;
    const me = g.players[2];
    me.x = COURT.w / 2; me.y = 0.5; // right on our baseline: without the rule you'd be the one taking it out
    g.next = 0;
    g.dead = 0.001;
    step(g, g.players.map(() => NO_INPUT), DT);
    expect(g.ball.holder === me.i || g.ball.flight?.to === me.i).toBe(true);
    for (let i = 0; i < 180 && g.ball.holder !== me.i; i++) step(g, g.players.map(() => NO_INPUT), DT);
    expect(g.ball.holder).toBe(me.i);
    expect(g.control).toBe(2);
  });

  it("a dunk rises to an apex above the rim, then the ball is hammered down, faster and faster", () => {
    const g = newGame([named("lucario")], [named("snorlax")], 3);
    const me = g.players[0], hoop = hoopOf(0);
    g.players[1].x = 1; // out of the way
    me.x = hoop.x; me.y = hoop.y - 1.2;
    giveBall(g, 0);
    step(g, [hold({ turbo: true, shoot: true }), NO_INPUT], DT);
    expect(me.act).toBe("dunk");
    while (g.ball.flight?.kind !== "shot") step(g, [NO_INPUT, NO_INPUT], DT);
    expect(g.ball.z).toBeGreaterThan(COURT.rimZ + 0.3); // up above the rim
    expect(me.vz).toBeLessThan(0); // the dunker comes down with it
    const f = g.ball.flight!, z = (s: number) => f.z0 + (f.z1 - f.z0) * s + (f.peak - (f.z0 + f.z1) / 2) * 4 * s * (1 - s);
    expect(z(0.25) - z(0.5)).toBeLessThan(z(0.75) - z(1)); // speeding up on the way down
    expect(z(0.01)).toBeLessThanOrEqual(f.z0); // never rises first
  });

  it("a pass to a finisher near the rim is an alley-oop: lobbed, caught at the top of the leap, slammed", () => {
    const g = newGame([named("lucario"), named("garchomp")], [named("snorlax"), named("metagross")], 5);
    const hoop = hoopOf(0), [pg, big] = g.players;
    for (const q of g.players.filter((q) => q.side === 1)) (q.x = 1), (q.y = 2); // defence asleep at the other end
    pg.x = hoop.x; pg.y = hoop.y - 8;
    big.x = hoop.x + 1.5; big.y = hoop.y - 2;
    giveBall(g, pg.i);
    passBall(g, pg, big);
    expect(g.ball.flight?.oop).toBe(true);
    expect(g.events.some((e) => e.text === "ALLEY-OOP!" && e.who === big.i)).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 180 && !seen.includes("make") && !seen.includes("miss"); i++) {
      step(g, g.players.map(() => NO_INPUT), DT);
      if (big.act === "dunk") seen.push("leap");
      seen.push(...g.events.map((e) => (e.kind === "release" ? e.text : e.kind)));
    }
    expect(seen).toContain("leap");
    expect(seen).toContain("DUNK"); // slammed from the air, not a jumper
    // and a pass to someone out at the arc is just a pass
    const g2 = newGame([named("lucario"), named("garchomp")], [named("snorlax"), named("metagross")], 5);
    g2.players[1].x = hoop.x; g2.players[1].y = hoop.y - 7;
    giveBall(g2, 0);
    passBall(g2, g2.players[0], g2.players[1]);
    expect(g2.ball.flight?.oop).toBeFalsy();
  });

  it("a quick tap right under the rim is a layup; a quick tap in your own half does nothing (holding still shoots)", () => {
    const g = newGame([named("lucario")], [named("snorlax")], 3);
    const me = g.players[0], hoop = hoopOf(0);
    g.players[1].x = 1; g.players[1].y = 1;
    me.x = hoop.x + 0.8; me.y = hoop.y - 1.2;
    giveBall(g, 0);
    step(g, [hold({ shoot: true }), NO_INPUT], DT);
    step(g, [NO_INPUT, NO_INPUT], DT); // let go at once: a quick tap
    expect(g.events.some((e) => e.kind === "release" && e.text === "LAYUP")).toBe(true);
    // in the backcourt
    const g2 = newGame([named("lucario")], [named("snorlax")], 3);
    g2.players[0].y = COURT.l / 2 - 3;
    giveBall(g2, 0);
    step(g2, [hold({ shoot: true }), NO_INPUT], DT);
    step(g2, [NO_INPUT, NO_INPUT], DT);
    expect(g2.ball.holder).toBe(0); // no shot
    expect(g2.players[0].act).toBe("free");
    for (let i = 0; i < 60; i++) step(g2, [hold({ shoot: true }), NO_INPUT], DT); // holding winds up a real shot
    step(g2, [NO_INPUT, NO_INPUT], DT);
    expect(g2.ball.flight?.kind).toBe("shot");
    // behind the arc: no quick three, just a reminder to hold it
    const g3 = newGame([named("lucario")], [named("snorlax")], 3);
    Object.assign(g3.players[1], { x: 1, y: 1 });
    g3.players[0].y = hoop.y - (COURT.three + 1);
    giveBall(g3, 0);
    step(g3, [hold({ shoot: true }), NO_INPUT], DT);
    step(g3, [NO_INPUT, NO_INPUT], DT);
    expect(g3.ball.holder).toBe(0);
    expect(g3.events.some((e) => e.text === "HOLD FOR A THREE")).toBe(true);
  });

  it("half-court 1v1: both attack the far hoop, a stop means taking it back, a make means a check at the top", () => {
    const g = newGame([named("lucario")], [named("garchomp")], 4, { half: true });
    expect(hoopOf(1)).toEqual(hoopOf(0)); // one hoop for both
    const [me, them] = g.players, hoop = hoopOf(0);
    expect(g.ball.holder).toBe(me.i); // you check it first, behind the arc
    expect(dist(me, hoop)).toBeGreaterThan(COURT.three);
    // they rebound (a change of hands): they must take it back before they can shoot
    them.x = hoop.x; them.y = hoop.y - 2;
    giveBall(g, them.i);
    expect(g.mustClear).toBe(1);
    step(g, [NO_INPUT, hold({ shoot: true })], DT);
    expect(g.events.some((e) => e.text === "TAKE IT BACK!")).toBe(true);
    expect(them.act).toBe("free");
    them.y = hoop.y - (COURT.three + 1); // out past the arc
    step(g, [NO_INPUT, NO_INPUT], DT);
    expect(g.mustClear).toBeNull();
    // after a make, the other side checks it at the top
    g.dead = 0.001;
    g.next = 0;
    step(g, [NO_INPUT, NO_INPUT], DT);
    expect(g.ball.holder).toBe(me.i);
    expect(dist(me, hoop)).toBeGreaterThan(COURT.three);
    expect(g.mustClear).toBeNull();
    newGame([named("lucario")], [named("garchomp")], 4); // a normal game puts the hoops back
    expect(hoopOf(1)).not.toEqual(hoopOf(0));
  });

  it("a CPU ball handler pinned in the corner doesn't just dribble there: it shoots or drives within a few seconds", () => {
    let acted = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = newGame([named("snorlax")], [named("lucario")], seed);
      const cpu = g.players[1], def = g.players[0], hoop = hoopOf(1);
      cpu.x = 0.9; cpu.y = hoop.y + 4; // the corner by their hoop
      def.x = 1.8; def.y = hoop.y + 3.2;
      giveBall(g, cpu.i);
      const d = makeAi(def.i, LIVE_AI.CHAMPION), o = makeAi(cpu.i, LIVE_AI.PRO, "BALANCED");
      for (let i = 0; i < 6 * 60; i++) {
        step(g, [d(g, DT), o(g, DT)], DT);
        if (g.events.some((e) => e.kind === "release" && e.side === 1) || g.ball.holder !== cpu.i) {
          acted++;
          break;
        }
      }
    }
    expect(acted).toBe(6);
  });

  it("play styles: picked from ratings, fixed per Pokémon, and varied across the pool", () => {
    const styles = new Set(pool.map(styleOf));
    expect(styles.size).toBeGreaterThanOrEqual(4);
    expect(styleOf(named("lucario"))).toBe(styleOf(named("lucario")));
    expect(AI_STYLES["BALL HOG"].pass).toBeLessThan(AI_STYLES["PASS FIRST"].pass);
  });

  it("the double jump turns you the way the stick points", () => {
    const flyer = pool.find((p) => p.types.includes("flying"))!;
    const g = newGame([named("lucario")], [flyer], 1);
    const pl = g.players[1];
    pl.x = 1;
    step(g, [NO_INPUT, hold({ shoot: true, x: 1 })], DT); // jump drifting right
    for (let i = 0; i < 10; i++) step(g, [NO_INPUT, hold({ x: 1 })], DT);
    step(g, [NO_INPUT, hold({ shoot: true, x: -1 })], DT); // jump again, stick left
    const x0 = pl.x;
    for (let i = 0; i < 5; i++) step(g, [NO_INPUT, hold({ x: -1 })], DT);
    expect(pl.vx).toBeLessThan(0);
    expect(pl.x).toBeLessThan(x0);
  });
});

describe("1v1 pacing, screens, floaters, eurosteps and special dunks", () => {
  const lucario = named("lucario"), snorlax = named("snorlax");
  const five = ["lucario", "greninja", "machamp", "garchomp", "snorlax"].map(named);
  const other5 = ["alakazam", "scizor", "infernape", "tyranitar", "metagross"].map(named);
  /** Did `side` shoot or pass this step? */
  const acted = (g: Game, side: 0 | 1) => g.events.some((e) => e.side === side && (e.kind === "release" || e.kind === "pass"));
  /** Did `side` go for a steal this step? */
  const reached = (g: Game, side: 0 | 1) => g.events.some((e) => e.side === side && (e.kind === "steal" || e.kind === "whiff"));
  /** How often each event text comes up in CPU-vs-CPU games of `size` a side (and steps with someone screening). */
  function cpuEvents(size: 1 | 5, seeds: number[], sec: number, style?: "AGGRESSIVE") {
    const seen: Record<string, number> = {};
    for (const seed of seeds) {
      const g = size === 1 ? newGame([pool[(seed * 97) % pool.length]], [pool[(seed * 31) % pool.length]], seed) : newGame(five, other5, seed);
      const ai = g.players.map((p) => makeAi(p.i, LIVE_AI.PRO, style));
      for (let i = 0; i < sec * 60 && !g.over; i++) {
        step(g, g.players.map((p) => ai[p.i](g, DT)), DT);
        for (const e of g.events) seen[e.text] = (seen[e.text] ?? 0) + 1;
        if (g.players.some((p) => p.screening)) seen.screening = (seen.screening ?? 0) + 1;
      }
    }
    return seen;
  }

  it("half-court: the CPU holds a beat after taking it back, and after a check at the top", () => {
    const g = newGame([snorlax], [lucario], 2, { half: true });
    const [me, cpu] = g.players, hoop = hoopOf(1);
    const ai = makeAi(cpu.i, LIVE_AI.PRO);
    Object.assign(me, { x: 1, y: 1 }); // out of the way
    Object.assign(cpu, { x: hoop.x, y: hoop.y - 2 });
    giveBall(g, cpu.i); // a rebound: it has to take it back first
    for (let i = 0; i < 600 && g.mustClear === 1; i++) step(g, [NO_INPUT, ai(g, DT)], DT);
    expect(g.mustClear).toBeNull();
    const beat = () => {
      const start = g.time;
      let busy = false;
      while (g.time - start < LIVE.halfPause - 0.05) {
        step(g, [NO_INPUT, ai(g, DT)], DT);
        if (acted(g, 1)) busy = true;
      }
      expect(busy).toBe(false);
      expect(Math.hypot(cpu.vx, cpu.vy)).toBeLessThan(0.3); // a stationary dribble
      let went = false; // then it goes (or shoots)
      for (let i = 0; i < 90 && !went; i++) {
        step(g, [NO_INPUT, ai(g, DT)], DT);
        went = acted(g, 1) || Math.hypot(cpu.vx, cpu.vy) > 1.5;
      }
      expect(went).toBe(true);
    };
    beat();
    g.dead = 0.001; // a make: it checks the ball at the top
    g.next = 1;
    step(g, [NO_INPUT, ai(g, DT)], DT);
    expect(g.ball.holder).toBe(cpu.i);
    beat();
  });

  it("1v1: most CPU defenders pick you up loose in your backcourt and don't reach; AGGRESSIVE ones press", () => {
    const run = (style: "BALANCED" | "AGGRESSIVE", seed: number) => {
      const g = newGame([lucario], [named("garchomp")], seed); // you start with it under your own hoop
      const def = makeAi(1, LIVE_AI.CHAMPION, style);
      let tries = 0, gap = Infinity;
      for (let i = 0; i < 4 * 60; i++) {
        step(g, [NO_INPUT, def(g, DT)], DT);
        if (reached(g, 1)) tries++;
        if (i > 120) gap = Math.min(gap, dist(g.players[0], g.players[1]));
      }
      return { tries, gap };
    };
    for (const seed of [1, 2, 3]) {
      const calm = run("BALANCED", seed);
      expect(calm.tries).toBe(0);
      expect(calm.gap).toBeGreaterThan(2);
    }
    expect([1, 2, 3].reduce((n, seed) => n + run("AGGRESSIVE", seed).tries, 0)).toBeGreaterThan(0);
  });

  it("1v1: a whiffed steal out in the handler's backcourt stumbles longer than one over half court", () => {
    const g = newGame([lucario], [snorlax], 3); // you're in your backcourt
    g.players[1].x = 1; // nowhere near: a whiff
    step(g, [NO_INPUT, hold({ steal: true })], DT);
    expect(g.players[1].actT).toBeCloseTo(LIVE.stumble * LIVE.pressWhiff, 5);
    const g2 = newGame([lucario], [snorlax], 3);
    g2.players[0].y = hoopOf(0).y - 5; // over half court
    g2.players[1].x = 1;
    step(g2, [NO_INPUT, hold({ steal: true })], DT);
    expect(g2.players[1].actT).toBeCloseTo(LIVE.stumble, 5);
  });

  it("1v1: the CPU gives you a moment with the ball before it reaches", () => {
    let early = 0, later = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = newGame([snorlax], [lucario], seed);
      const [me, cpu] = g.players;
      Object.assign(me, { x: COURT.w / 2, y: hoopOf(0).y - 6 }); // over half court
      Object.assign(cpu, { x: me.x, y: me.y + 1.2 });
      giveBall(g, me.i);
      const ai = makeAi(cpu.i, LIVE_AI.CHAMPION, "AGGRESSIVE");
      for (let i = 0; i < 180; i++) {
        step(g, [NO_INPUT, ai(g, DT)], DT);
        if (!reached(g, 1)) continue;
        if (g.time < LIVE.stealGrace) early++;
        else later++;
        break;
      }
    }
    expect(early).toBe(0);
    expect(later).toBeGreaterThan(0);
  });

  it("planting a screen stops you even with the stick held; the event names the screener and the defender held", () => {
    const g = newGame(five, other5, 1);
    const scr = g.players[4], def = g.players[5];
    g.control = 4; // you
    Object.assign(scr, { x: 7, y: 15, vx: 0, vy: 5 });
    Object.assign(def, { x: 7, y: 12.5 });
    let ev: GameEvent | undefined;
    for (let i = 0; i < 60; i++) {
      step(g, g.players.map((p) => (p === scr ? hold({ screen: true, y: 1 }) : p === def ? hold({ y: 1 }) : NO_INPUT)), DT);
      if (i === 20) {
        expect(Math.hypot(scr.vx, scr.vy)).toBeLessThan(0.1);
        expect(scr.screening).toBe(true);
      }
      ev ??= g.events.find((e) => e.kind === "screen");
    }
    expect(ev?.who).toBe(scr.i);
    expect(ev?.vs).toBe(def.i);
  });

  it("CPU teammates come up to screen for you outside plays, then roll to the rim; CPU teams do it too", () => {
    let screened = 0, rolled = 0;
    for (const seed of [1, 2, 3]) {
      const g = newGame(five, other5, seed);
      for (const p of g.players) if (p.side === 0) Object.assign(p, spotOf(0, p.slot, 5));
      for (const p of g.players) if (p.side === 1) Object.assign(p, { x: 0.5, y: 2 + p.slot }); // defence asleep
      const ai = g.players.map((p) => makeAi(p.i, LIVE_AI.PRO));
      let who: number | null = null;
      for (let i = 0; i < 60 * 18; i++) {
        step(g, g.players.map((p) => (p.side === 0 && p.i !== 0 ? ai[p.i](g, DT) : NO_INPUT)), DT); // you stand at the top
        const s = g.players.find((p) => p.side === 0 && p.screening);
        if (s && who == null) who = s.i;
        if (who != null && !g.players[who].screening && dist(g.players[who], hoopOf(0)) < 3) {
          rolled++;
          break;
        }
      }
      if (who != null) screened++;
    }
    expect(screened).toBeGreaterThan(0);
    expect(rolled).toBeGreaterThan(0);
    const seen = cpuEvents(5, [1], 120); // CPU vs CPU, no coach (so no plays)
    expect(seen.screening ?? 0).toBeGreaterThan(0);
  });

  it("a CPU ball handler drives off a teammate's planted screen", () => {
    const g = newGame(five, other5, 2);
    const hh = g.players[5], scr = g.players[9], def = g.players[0], hoop = hoopOf(1);
    for (const p of g.players) Object.assign(p, { x: 0.5, y: COURT.l / 2 }); // everyone else out of it
    Object.assign(hh, { x: COURT.w / 2, y: hoop.y + 7.6 * COURT.scale });
    Object.assign(def, { x: hh.x, y: hh.y - 1.3 }); // right in his way (alone, he'd slip round him to the left)
    Object.assign(scr, { x: hh.x + 1, y: hh.y - 1 }); // planted on his right
    giveBall(g, hh.i);
    const ai = makeAi(hh.i, LIVE_AI.PRO);
    for (let i = 0; i < 10; i++) step(g, g.players.map((p) => (p === hh ? ai(g, DT) : p === scr ? hold({ screen: true }) : NO_INPUT)), DT);
    expect(scr.screening).toBe(true);
    expect(hh.vx).toBeGreaterThan(0.5); // round the screener's side
  });

  it("a quick tap on the drive a few metres out is a floater: high and soft, and a contest bothers it half as much", () => {
    const tap = (seed: number, moving: boolean, guarded: boolean) => {
      const g = newGame([lucario], [snorlax], seed);
      const [me, def] = g.players, hoop = hoopOf(0);
      Object.assign(me, { x: hoop.x, y: hoop.y - 3.6, vx: 0, vy: moving ? 5 : 0 });
      Object.assign(def, guarded ? { x: hoop.x, y: hoop.y - 2.6 } : { x: 1, y: 1 });
      giveBall(g, 0);
      step(g, [hold({ shoot: true, y: moving ? 1 : 0 }), NO_INPUT], DT);
      step(g, [hold({ y: moving ? 1 : 0 }), NO_INPUT], DT); // let go at once
      return g;
    };
    const g = tap(1, true, false), e = g.events.find((e) => e.kind === "release");
    expect(e?.text).toBe("FLOATER");
    expect(e?.who).toBe(0);
    expect(g.ball.flight?.peak).toBeCloseTo(COURT.rimZ + 2.3, 5);
    expect(g.ball.flight?.dur).toBeCloseTo(0.8, 5);
    expect(tap(1, false, false).events.find((e) => e.kind === "release")?.text).toBe("QUICK"); // standing still: a plain quick shot
    let floaters = 0, quick = 0;
    for (let s = 0; s < 300; s++) {
      if (tap(s, true, true).lastShot?.made) floaters++;
      if (tap(s, false, true).lastShot?.made) quick++;
    }
    expect(floaters).toBeGreaterThan(quick + 15); // over the man in front
  });

  it("the crossover on a drive near the rim is a eurostep: out to one side, back across, still going, the man in front caught leaning", () => {
    const g = newGame([lucario], [snorlax], 1);
    const [me, def] = g.players, hoop = hoopOf(0);
    Object.assign(me, { x: hoop.x, y: hoop.y - 4.5, vx: 0, vy: 5 });
    Object.assign(def, { x: hoop.x + 0.2, y: hoop.y - 3.2 });
    giveBall(g, 0);
    step(g, [hold({ y: 1, cross: true }), NO_INPUT], DT);
    const e = g.events.find((e) => e.text === "EUROSTEP");
    expect(e?.who).toBe(0);
    expect(e?.vs).toBe(1);
    expect(def.slow).toBeGreaterThan(0);
    const x0 = me.x, y0 = me.y, xs: number[] = [];
    for (let i = 0; i < Math.round(LIVE.euroTime * 60); i++) {
      step(g, [hold({ y: 1 }), NO_INPUT], DT);
      xs.push(me.x - x0);
    }
    const out = xs[Math.floor(xs.length / 2)];
    expect(Math.abs(out)).toBeGreaterThan(0.5); // out to one side…
    expect(Math.abs(xs[xs.length - 1])).toBeLessThan(Math.abs(out) - 0.4); // …and back across
    expect(me.y).toBeGreaterThan(y0 + 1); // still going at the rim
    // and it finishes itself: a layup (or a floater if it's still a way out), no button needed
    let finished = "";
    for (let i = 0; i < 10 && !finished; i++) {
      step(g, [hold({ y: 1 }), NO_INPUT], DT);
      finished = g.events.find((e) => e.kind === "release" && (e.text === "LAYUP" || e.text === "FLOATER"))?.text ?? "";
    }
    expect(finished).not.toBe("");
    expect(g.ball.flight?.kind).toBe("shot");
    // further out it's a plain crossover
    const g2 = newGame([lucario], [snorlax], 1);
    Object.assign(g2.players[0], { x: hoop.x, y: hoop.y - 9, vx: 0, vy: 5 });
    step(g2, [hold({ y: 1, cross: true }), NO_INPUT], DT);
    expect(g2.events.some((e) => e.text === "EUROSTEP")).toBe(false);
    expect(g2.players[0].act).toBe("cross");
  });

  it("in a team game a smothered eurostep is sometimes dished to the open man; an open one never is", () => {
    const team = (a: string, b: string, c: string) => [named(a), named(b), named(c)];
    const finishes = (smother: boolean, seed: number) => {
      const g = newGame(team("lucario", "pikachu", "eevee"), team("snorlax", "machamp", "onix"), seed);
      const me = g.players[0], hoop = hoopOf(0);
      for (const p of g.players) Object.assign(p, { x: p.side ? 1 : COURT.w - 1, y: hoop.y - 8, vx: 0, vy: 0 }); // everyone out of the way
      Object.assign(me, { x: hoop.x, y: hoop.y - 4.5, vx: 0, vy: 5 });
      giveBall(g, 0);
      step(g, g.players.map((p) => (p.i === 0 ? hold({ y: 1, cross: true }) : NO_INPUT)), DT);
      for (let i = 0; i < 90; i++) {
        const d = g.players.find((p) => p.side === 1)!; // a big right in his face as he finishes
        if (smother) Object.assign(d, { x: me.x, y: me.y + 0.5, vx: 0, vy: 0 });
        step(g, g.players.map((p) => (p.i === 0 ? hold({ y: 1 }) : NO_INPUT)), DT);
        const e = g.events.find((e) => e.text === "DISH!" || (e.kind === "release" && (e.text === "LAYUP" || e.text === "FLOATER")));
        if (e) return e.text;
      }
      return "none";
    };
    const tight = Array.from({ length: 30 }, (_, s) => finishes(true, s + 1));
    const open = Array.from({ length: 15 }, (_, s) => finishes(false, s + 1));
    expect(tight.filter((t) => t === "DISH!").length).toBeGreaterThan(5);
    expect(tight.some((t) => t !== "DISH!")).toBe(true); // not every time
    expect(open.includes("DISH!")).toBe(false);
    expect(open.includes("none")).toBe(false);
  });

  it("the CPU throws floaters and eurosteps on its drives (drive-heavy styles most)", () => {
    const seen = cpuEvents(1, [1, 2, 3, 4, 5, 6, 7, 8], 300, "AGGRESSIVE");
    expect(seen.FLOATER ?? 0).toBeGreaterThan(0);
    expect(seen.EUROSTEP ?? 0).toBeGreaterThan(0);
  });

  it("special dunks are rare: likelier on fire, or all alone for a big finisher; the release still says DUNK", () => {
    const dunks = (setup: (g: Game) => void) => {
      let special = 0;
      const texts = new Set<string>();
      for (let seed = 0; seed < 200; seed++) {
        const g = newGame([lucario], [snorlax], seed); // Lucario: Finishing 80+
        const [me, def] = g.players, hoop = hoopOf(0);
        Object.assign(me, { x: hoop.x, y: hoop.y - 1.5 });
        Object.assign(def, { x: 1, y: 1 });
        setup(g);
        giveBall(g, 0);
        step(g, [hold({ turbo: true, shoot: true }), NO_INPUT], DT);
        expect(me.act).toBe("dunk");
        if (me.dunkStyle) {
          special++;
          const ev = g.events.find((e) => e.kind === "move");
          expect(ev?.who).toBe(0);
          texts.add(ev!.text);
        }
        let release = "";
        for (let i = 0; i < 120 && !(me.act === "free" && me.z === 0); i++) {
          step(g, [NO_INPUT, NO_INPUT], DT);
          release ||= g.events.find((e) => e.kind === "release")?.text ?? "";
        }
        expect(release).toBe("DUNK");
        expect(me.dunkStyle).toBeNull(); // cleared on landing
      }
      return { share: special / 200, texts };
    };
    const fire = dunks((g) => (g.players[0].onFire = true));
    const alone = dunks(() => {});
    const crowded = dunks((g) => Object.assign(g.players[1], { x: hoopOf(0).x + 1.5, y: hoopOf(0).y - 2.5 }));
    expect(fire.share).toBeGreaterThan(0.22);
    expect(fire.share).toBeLessThan(0.5);
    expect(alone.share).toBeGreaterThan(0.06);
    expect(alone.share).toBeLessThan(0.26);
    expect(crowded.share).toBeLessThan(0.07);
    expect(fire.texts.size).toBeGreaterThanOrEqual(3);
    for (const t of fire.texts) expect(["360 DUNK!", "WINDMILL!", "TOMAHAWK!", "EASTBAY!"]).toContain(t);
  });
});
