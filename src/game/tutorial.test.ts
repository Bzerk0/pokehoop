// HOW TO PLAY must be learnable in under two minutes (PLAN.md Phase 9). A scripted "new player" does what each
// step's box says, and the whole lesson has to finish inside 120 seconds of game time.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeAi } from "../core/live/ai.ts";
import { callPlay, dist, giveBall, hoopOf, lineupGame, NO_INPUT, step, type Input } from "../core/live/game.ts";
import { dexOf } from "../core/lineup.ts";
import { LIVE, LIVE_AI } from "../core/ratingConfig.ts";
import { rateAll } from "../core/ratings.ts";
import { STEPS, Tutorial } from "./tutorial.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);
const ids = (slugs: string[]) => slugs.map((s) => pool.find((p) => p.slug === s)!.id);
const home = { name: "YOU", ids: ids(["lucario", "greninja", "machamp", "garchomp", "snorlax", "pikachu", "charizard", "blastoise"]) };
const away = { name: "CPU", ids: ids(["alakazam", "scizor", "infernape", "tyranitar", "metagross", "jolteon", "lapras", "gengar"]) };
const DT = 1 / 60;

describe("HOW TO PLAY", () => {
  it("in DEFEND, them scoring is a try-again, not the end of the lesson", () => {
    const g = lineupGame(home, away, dex, 3, 1, true);
    const tu = new Tutorial(g);
    while (tu.step?.title !== "DEFEND") (tu as unknown as { i: number }).i++;
    tu.step.setup?.(g);
    g.dead = 0.5; // they scored: you'd inbound it next
    g.next = 0;
    expect(tu.update(DT, [{ kind: "make", side: 1, text: "SCORE!" }])).toBeNull();
    expect(tu.finished).toBe(false);
    expect(tu.step?.title).toBe("DEFEND");
    expect(g.players[g.ball.holder!].side).toBe(1); // their ball again, for another go
  });

  it("never gets stuck when the standing-still CPU ends up with the ball (a make or their rebound)", () => {
    const g = lineupGame(home, away, dex, 3, 1, true);
    const tu = new Tutorial(g);
    while (tu.step?.title !== "SHOOT") (tu as unknown as { i: number }).i++;
    tu.step.setup?.(g);
    giveBall(g, g.players.find((p) => p.side === 1)!.i); // they got it
    tu.update(DT, []);
    expect(g.players[g.ball.holder!].side).toBe(0); // yours again
    g.dead = 0.5; // or: you scored, and it's their inbound
    g.next = 1;
    tu.update(DT, []);
    expect(g.dead).toBe(0);
    expect(g.players[g.ball.holder!].side).toBe(0);
  });

  it("a new player who follows the steps finishes the lesson in under two minutes", () => {
    const g = lineupGame(home, away, dex, 3, 1, true);
    const tu = new Tutorial(g);
    const ai = g.players.map((p) => makeAi(p.i, LIVE_AI.ROOKIE));
    let t = 0, holdK = 0, result: string | null = null;
    const seen: string[] = [];
    while (t < 120 && result !== "done") {
      const you = g.players[g.control], title = tu.step?.title;
      if (title && !seen.includes(title)) seen.push(title);
      const inp: Input = { ...NO_INPUT };
      const hoop = hoopOf(0), d = dist(you, hoop);
      const before = g.events.length;
      if (!tu.between) {
        if (title === "MOVE") inp.y = 1;
        if (title === "SPRINT") Object.assign(inp, { y: Math.floor(t) % 2 ? 1 : -1, turbo: true });
        if (title === "SHOOT") {
          // hold K, let go right at the line
          holdK += DT;
          inp.shoot = holdK < LIVE.meterTime;
          if (holdK > LIVE.meterTime + 0.5) holdK = 0;
        }
        if (title === "DUNK") Object.assign(inp, { x: (hoop.x - you.x) / d, y: (hoop.y - you.y) / d, turbo: true, shoot: d < LIVE.dunkRange - 0.4 });
        if (title === "PASS") inp.steal = true; // J
        if (title === "CALL A PLAY" && t % 1 < DT) callPlay(g, 0, "MOTION"); // what Q → ENTER does
        if (title === "DEFEND") inp.cross = Math.floor(t * 4) % 2 === 0; // swipe at it (a double tap of sprint steals)
      }
      const between = g.events.slice(before); // a menu call happens between steps, as in LiveView
      const cpuIdle = !tu.cpuPlays;
      step(g, g.players.map((p) => (p.i === g.control ? inp : cpuIdle && p.side === 1 ? NO_INPUT : ai[p.i](g, DT))), DT);
      result = tu.update(DT, [...between, ...g.events]) ?? result;
      t += DT;
    }
    expect(seen).toEqual(STEPS.map((s) => s.title)); // every step came up, in order
    expect(result).toBe("done");
    expect(t).toBeLessThan(120);
  });
});
