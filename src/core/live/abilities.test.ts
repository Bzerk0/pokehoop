import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ABILITY, LIVE_AI } from "../ratingConfig.ts";
import { rateAll } from "../ratings.ts";
import { abilityOf, has } from "./abilities.ts";
import { makeAi } from "./ai.ts";
import { energyOf, handZ, hoopOf, newGame, NO_INPUT, step } from "./game.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const DT = 1 / 60;
// Identical ratings let each comparison isolate the type.
const typed = (...types: string[]) => ({ ...pool[0], types });

describe("live type abilities", () => {
  it("gives every Pokédex type its named ability and every Pokémon the ability of its first type", () => {
    const types = new Set(pool.flatMap((p) => p.types));
    expect(Object.fromEntries([...types].map((t) => [t, abilityOf(typed(t)).name]))).toEqual({
      normal: "SCRAPPY", fire: "HEAT CHECK", water: "SMOOTH", grass: "ROOTED", electric: "STATIC", ice: "ICE COLD",
      fighting: "BRAWLER", poison: "TOXIC D", ground: "HEAVY", flying: "DOUBLE JUMP", psychic: "FORESIGHT",
      bug: "QUICK HANDS", rock: "STURDY", ghost: "PHASE", dragon: "DOUBLE JUMP", dark: "SNEAK", steel: "IRON WALL", fairy: "CHARM",
    });
    for (const p of pool) {
      const ability = abilityOf(p);
      expect(ability, p.name).toEqual(abilityOf(typed(p.types[0])));
      expect(ability.text, p.name).toBeTruthy();
    }
    const [charizard] = newGame([typed("fire", "flying")], [typed("water")], 1).players;
    expect(has(charizard, "heatCheck")).toBe(true);
    expect(has(charizard, "doubleJump")).toBe(false);
  });

  it("only STATIC raises sprint speed, SCRAPPY saves energy, and TOXIC D tires the nearest opponent", () => {
    const run = (type: string, guard: string, turbo: boolean) => {
      const neutral = typed("water");
      const g = newGame([typed(type), neutral, neutral], [typed(guard), neutral, neutral], 1, { timed: true });
      const [runner, teammate, , defender] = g.players;
      Object.assign(defender, { x: runner.x + 2, y: runner.y });
      for (let k = 0; k < 45; k++) step(g, [{ ...NO_INPUT, y: 1, turbo }], DT);
      return { speed: runner.vy, drain: 100 - energyOf(g, runner), teammate: energyOf(g, teammate) };
    };
    const sprint = run("water", "water", true);
    expect(run("electric", "water", true).speed).toBeCloseTo(sprint.speed * (1 + ABILITY.static));
    expect(run("electric", "water", false).speed).toBeCloseTo(run("water", "water", false).speed);
    expect(run("normal", "water", true).drain).toBeCloseTo(sprint.drain * (1 - ABILITY.scrappy), 7);
    const guarded = run("water", "poison", true);
    expect(guarded.drain).toBeCloseTo(sprint.drain * (1 + ABILITY.toxicD), 7);
    expect(guarded.teammate).toBe(sprint.teammate);
    expect(run("poison", "water", true).drain).toBeCloseTo(sprint.drain, 7);
  });

  it("QUICK HANDS wins extra seeded steals, STURDY prevents some, and only a successful Bug thief calls its move", () => {
    function steals(defType: string, handlerType: string) {
      let wins = 0;
      for (let seed = 1; seed <= 256; seed++) {
        const g = newGame([typed(handlerType)], [typed(defType)], seed);
        const [handler, def] = g.players;
        Object.assign(def, { x: handler.x + 1, y: handler.y });
        step(g, [NO_INPUT, { ...NO_INPUT, steal: true }], DT);
        const gotBall = g.ball.holder === def.i;
        if (gotBall) wins++;
        expect(g.events.some((e) => e.kind === "move" && e.text === "QUICK HANDS!" && e.who === def.i))
          .toBe(gotBall && defType === "bug");
      }
      return wins;
    }
    const baseline = steals("water", "water");
    expect(steals("bug", "water")).toBeGreaterThan(baseline);
    expect(steals("water", "rock")).toBeLessThan(baseline);
  });

  it("ICE COLD checks either clock at release and calls the move only when the basket counts", () => {
    function shoot(shotClock: number, periodClock: number, seed = 7) {
      const g = newGame([typed("ice")], [typed("water")], seed, { timed: true });
      g.players[0].y = hoopOf(0).y - 5;
      g.players[1].x = 1;
      step(g, [{ ...NO_INPUT, shoot: true }], DT);
      g.shotClock = shotClock + DT; // the shot clock ticks before the player releases
      g.clock = periodClock;
      step(g, [], DT);
      expect(g.events.some((e) => e.text === "ICE COLD!")).toBe(false);
      const chance = g.lastShot!.chance;
      while (g.ball.flight?.kind === "shot") step(g, [], DT);
      return { chance, scored: g.score[0] > 0, call: g.events.some((e) => e.kind === "move" && e.text === "ICE COLD!" && e.who === 0) };
    }
    const early = shoot(12, 5); // the period drops under five while the ball is in flight
    expect(early.scored).toBe(true);
    expect(early.call).toBe(false);
    for (const late of [shoot(4, 20), shoot(12, 4)]) {
      expect(late.chance).toBeCloseTo(early.chance * (1 + ABILITY.iceCold));
      expect(late.scored && late.call).toBe(true);
    }
    expect(shoot(4, 20, 4)).toMatchObject({ scored: false, call: false });
  });

  it("a CPU blocker with Flying or Dragon in either slot can jump again once, on the way down", () => {
    for (const type of ["flying", "dragon", "steel"]) {
      const g = newGame([typed("water")], [typed("fire", type)], 1);
      const [shooter, def] = g.players;
      shooter.y = hoopOf(0).y - 5;
      step(g, [{ ...NO_INPUT, shoot: true }], DT);
      step(g, [], DT);
      const brain = makeAi(def.i, LIVE_AI.PRO);
      Object.assign(def, { act: "air", x: g.ball.x, y: g.ball.y, z: 0.6, vz: 1 });
      g.ball.z = handZ(def) + 0.5;
      expect(brain(g, DT).shoot).toBe(false); // still rising
      def.vz = -1;
      g.ball.z = handZ(def) - 0.1;
      expect(brain(g, DT).shoot).toBe(false); // already in reach
      g.ball.z = handZ(def) + 0.5;
      g.ball.flight!.tested.push(def.i); // keep this shot in flight while checking the jump
      step(g, [NO_INPUT, brain(g, DT)], DT);
      expect(def.doubled).toBe(type !== "steel");
      expect(g.events.some((e) => e.text === "DOUBLE JUMP" && e.who === def.i)).toBe(type !== "steel");
      def.vz = -1;
      def.held = false;
      g.ball.z = handZ(def) + 0.5;
      expect(brain(g, DT).shoot).toBe(false);
    }
  });
});
