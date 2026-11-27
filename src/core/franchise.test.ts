import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  autoSign, lineupOf, checkFranchise, draftLeft, draftOnClock, draftPick, draftValue, evolutionsOf, finishDay, finishSlate, leagueDex, newLeague, nextStep,
  openSlots, payroll, potential, record, recordYours, release, resign, resignPrice, room, rookieSalary, rostered, seriesWins, sign, simPhase,
  simYours, slate, standings, swap, train, winner, YOU, yourGame, type Franchise,
} from "./franchise.ts";
import { autoFill, decodeLineup, dexOf, encodeLineup, emptyLineup, problems, salary, SLOTS } from "./lineup.ts";
import { FRANCHISE, SALARY_CAP, SALARY_MIN } from "./ratingConfig.ts";
import { rateAll } from "./ratings.ts";
import { simGame } from "./sim/sim.ts";

const pool = rateAll(JSON.parse(readFileSync("public/data/pokemon.json", "utf8")));
const dex = dexOf(pool);
const byName = (n: string) => pool.find((p) => p.name === n)!;
// your team: Charmander and Pichu (young, they can evolve) in the five, the rest filled under the cap
const mine = autoFill({ ...emptyLineup("classic"), name: "TEST TEAM", ids: [byName("Pichu").id, null, byName("Charmander").id, null, null, null, null, null] }, pool);
const league = () => newLeague(pool, dex, mine, "PRO", 1234);
const ids = (f: Franchise) => f.teams.flatMap((t) => t.roster.flatMap((c) => (c ? [c.id] : [])));

/** Sim from wherever it is to the off-season. */
const toOffseason = (f: Franchise) => simPhase(simPhase(f, dex), dex);

describe("a new league", () => {
  it("has your team first, CPU teams full, and every Pokémon on one team", () => {
    expect(problems(mine, dex)).toEqual([]);
    const f = league();
    expect(f.teams).toHaveLength(FRANCHISE.teams);
    expect(f.teams[YOU].roster.map((c) => c!.id)).toEqual(mine.ids);
    expect(f.teams.every((t) => t.roster.every((c) => c && c.years >= FRANCHISE.years[0] && c.years <= FRANCHISE.years[1]))).toBe(true);
    expect(new Set(ids(f)).size).toBe(FRANCHISE.teams * SLOTS.length);
    expect(new Set(f.teams.map((t) => t.name)).size).toBe(FRANCHISE.teams);
  });

  it("plays a double round robin: everyone once a round, every pair home and away", () => {
    const f = league();
    expect(f.schedule).toHaveLength(2 * (FRANCHISE.teams - 1));
    for (const round of f.schedule) expect(new Set(round.flatMap((g) => [g.home, g.away])).size).toBe(FRANCHISE.teams);
    const pairs = new Map<string, number>();
    for (const g of f.schedule.flat()) pairs.set(`${g.home}-${g.away}`, (pairs.get(`${g.home}-${g.away}`) ?? 0) + 1);
    expect(pairs.size).toBe(FRANCHISE.teams * (FRANCHISE.teams - 1)); // each ordered pair (home, away) once
    expect([...pairs.values()].every((n) => n === 1)).toBe(true);
  });
});

describe("the season", () => {
  it("your roster as it stands saves as a team and loads back the same (what SAVE TEAM stores)", () => {
    const l = lineupOf(league(), YOU);
    expect(decodeLineup(encodeLineup(l), 32)?.ids).toEqual(l.ids);
  });

  it("is the same every time from the same seed", () => {
    expect(toOffseason(league())).toEqual(toOffseason(league()));
  });

  it("adds up standings and stats as games are played, then seeds the playoffs", () => {
    let f = league();
    const mineFirst = yourGame(f)!;
    expect(mineFirst).not.toBeNull();
    f = finishSlate(f, dex);
    expect(f.round).toBe(1);
    expect(standings(f).reduce((s, t) => s + t.w, 0)).toBe(FRANCHISE.teams / 2);
    f = simPhase(f, dex);
    expect(f.phase).toBe("playoffs");
    const table = standings(f);
    expect(table.every((t) => t.w + t.l === f.schedule.length)).toBe(true);
    expect(f.seeds).toEqual(table.slice(0, FRANCHISE.playoffTeams).map((t) => t.team));
    // every regular season point is in someone's stat line
    const points = f.schedule.flat().reduce((s, g) => s + g.score![0] + g.score![1], 0);
    expect(Object.values(f.stats).reduce((s, t) => s + t.pts, 0)).toBe(points);
    // 1 v 4 and 2 v 3, the higher seed on top
    expect(f.playoffs[0].map((s) => [s.top, s.bottom])).toEqual([[f.seeds[0], f.seeds[3]], [f.seeds[1], f.seeds[2]]]);
  });

  it("plays best-of-3 series to a champion, then opens the off-season", () => {
    let f = simPhase(league(), dex);
    f = simPhase(f, dex);
    expect(f.phase).toBe("offseason");
    expect(f.playoffs).toHaveLength(2);
    for (const s of f.playoffs.flat()) {
      const [a, b] = seriesWins(s);
      expect(Math.max(a, b)).toBe(FRANCHISE.seriesWins);
      expect(s.games.length).toBe(a + b);
    }
    const final = f.playoffs[1][0];
    expect(f.history).toHaveLength(1);
    expect(f.history[0].champion).toBe(f.teams[winner(final)!].name);
    expect(f.history[0].mvp).not.toBeNull();
  });

  it("records your own game from a your-team-first result, whether you're home or away", () => {
    let f = league();
    for (let r = 0; r < 4; r++) {
      const g = yourGame(f)!;
      const result = simGame(mine, { ...mine, name: "THEM" }, dex, r).teams; // any two box scores will do
      f = recordYours(f, g.key, result);
      const played = f.schedule[r].find((x) => x.home === YOU || x.away === YOU)!;
      const [you, them] = played.home === YOU ? played.score! : [played.score![1], played.score![0]];
      expect([you, them]).toEqual(result.map((t) => t.periods.reduce((a, b) => a + b, 0)));
      expect(record(f, g.key, result)).toBe(f); // already played: no change
      f = finishSlate(f, dex);
    }
  });

  it("plays the playoff series in step: your game, then the rest of that day, never your next game", () => {
    let f = simPhase(league(), dex);
    expect(f.phase).toBe("playoffs");
    for (let day = 0; day < 6 && f.phase === "playoffs"; day++) {
      const counts = f.playoffs[f.playoffs.length - 1].map((s) => s.games.length);
      const mine = yourGame(f);
      if (mine) f = simYours(f, dex)!.f;
      const after = mine ? finishDay(f, dex) : finishSlate(f, dex);
      if (after.phase === "playoffs" && after.playoffs.length === f.playoffs.length) {
        // every live series played exactly one more game than at the start of the day
        after.playoffs[after.playoffs.length - 1].forEach((s, i) => {
          if (winner(f.playoffs[f.playoffs.length - 1][i]) == null) expect(s.games.length).toBe(counts[i] + 1);
        });
      }
      f = after;
    }
  });

  it("sims your game with you first and records it the right way round", () => {
    let f = league();
    for (let r = 0; r < 6; r++) {
      const { f: next, result } = simYours(f, dex)!;
      const g = next.schedule[r].find((x) => x.home === YOU || x.away === YOU)!;
      const mineScore = g.home === YOU ? g.score![0] : g.score![1];
      expect(mineScore).toBe(result.teams[0].periods.reduce((a, b) => a + b, 0));
      expect(result.teams[0].name).toBe(f.teams[YOU].name);
      expect(yourGame(next)).toBeNull();
      f = finishDay(next, dex);
    }
  });
});

describe("the off-season", () => {
  it("ages everyone a year, evolves along real evolution lines, and runs every deal down a season", () => {
    const before = simPhase(simPhase(league(), dex), dex);
    expect(before.phase).toBe("offseason");
    const evos = evolutionsOf(dex);
    for (const c of before.off!.changes.filter((x) => x.kind === "evolved")) {
      expect(evos.get(c.id)!.map((p) => p.id)).toContain(c.to);
      // still on the team, unless his deal ran out and the CPU let him go
      expect(before.teams[c.team].roster.some((x) => x?.id === c.to) || before.off!.released.includes(c.to!)).toBe(true);
    }
    expect(new Set(ids(before)).size).toBe(ids(before).length);
    expect(Object.values(before.career).every((c) => c.exp === 1 && c.dev >= FRANCHISE.dev.min && c.dev <= FRANCHISE.dev.max)).toBe(true);
    // your deals that ran out wait for you; nobody else of yours is at 0 years
    for (const c of before.teams[YOU].roster) expect(c!.years > 0 || before.off!.expiring.includes(c!.id)).toBe(true);
  });

  it("follows the real evolution lines, and none that need a regional form the data doesn't have", () => {
    const evos = evolutionsOf(dex);
    const into = (n: string) => (evos.get(byName(n).id) ?? []).map((p) => p.name).sort();
    expect(into("Charmander")).toEqual(["Charmeleon"]);
    expect(into("Silcoon")).toEqual(["Beautifly"]);
    expect(into("Alolan Rattata")).toEqual(["Alolan Raticate"]);
    expect(into("Eevee")).toHaveLength(8);
    expect(into("Farfetch’d")).toEqual([]); // Sirfetch'd comes from the Galarian form
    expect(into("Sneasel")).toEqual(["Weavile"]); // not Sneasler (Hisuian Sneasel)
  });

  it("evolves a starter who plays big minutes most summers", () => {
    let evolved = 0;
    for (let seed = 0; seed < 8; seed++) {
      const f = toOffseason(newLeague(pool, dex, mine, "PRO", seed));
      if (f.off!.changes.some((c) => c.team === YOU && c.kind === "evolved" && (c.id === byName("Charmander").id || c.id === byName("Pichu").id))) evolved++;
    }
    expect(evolved).toBeGreaterThanOrEqual(5); // two starters at ~70% each: at least one evolves ~90% of summers
  }, 60_000);

  it("re-signs for 1 to 3 seasons (a longer deal is cheaper a season) within the cap, or lets the player go", () => {
    let f = nextStep(toOffseason(league()), dex);
    expect(f.off!.step).toBe("resign");
    for (const id of [...f.off!.expiring]) {
      const slot = f.teams[YOU].roster.findIndex((c) => c?.id === id);
      const price = salary(leagueDex(dex, f).get(id)!);
      expect(resignPrice(f, dex, id, 2)).toBe(price);
      expect(resignPrice(f, dex, id, 1)).toBeGreaterThanOrEqual(price);
      expect(resignPrice(f, dex, id, 3)).toBeLessThanOrEqual(price);
      expect(resign(f, dex, id, 5)).toBe(f); // no such deal
      const kept = resign(f, dex, id, 3);
      if (resignPrice(f, dex, id, 3) <= room(f, slot)) {
        expect(kept.teams[YOU].roster[slot]).toEqual({ id, salary: resignPrice(f, dex, id, 3), years: 3 });
        f = kept;
      } else {
        expect(kept).toBe(f); // can't afford him
        f = resign(f, dex, id, 0);
        expect(f.teams[YOU].roster[slot]).toBeNull();
        expect(f.off!.released).toContain(id);
      }
    }
    expect(f.off!.expiring).toEqual([]);
    expect(payroll(f.teams[YOU])).toBeLessThanOrEqual(SALARY_CAP);
  });

  it("doesn't count one expiring deal against re-signing another", () => {
    let f = nextStep(toOffseason(league()), dex);
    // two of your players' deals run out at once: each one's old salary is off the books
    const r = f.teams[YOU].roster;
    f = structuredClone(f);
    f.teams[YOU].roster = r.map((c, i) => (i >= 6 ? { ...c!, years: 0 } : { ...c!, years: Math.max(1, c!.years) }));
    f.off!.expiring = f.teams[YOU].roster.slice(6).map((c) => c!.id);
    const others = f.teams[YOU].roster.slice(0, 6).reduce((s, c) => s + c!.salary, 0);
    // …less the minimum salary kept back for the other one's spot (if he leaves, someone must fill it)
    expect(room(f, 6)).toBe(SALARY_CAP - others - SALARY_MIN);
    expect(room(f, 7)).toBe(SALARY_CAP - others - SALARY_MIN);
  });

  it("sends one player a summer to training camp", () => {
    const f = toOffseason(league());
    const id = f.teams[YOU].roster[7]!.id, before = f.career[id].dev;
    const t = train(f, id);
    expect(t.career[id].dev).toBe(Math.min(FRANCHISE.dev.max, before + FRANCHISE.campBoost));
    expect(t.off!.trained).toBe(id);
    expect(train(t, f.teams[YOU].roster[6]!.id)).toBe(t); // one a summer
    expect(train(f, f.teams[1].roster[0]!.id)).toBe(f); // not someone else's player
    expect(leagueDex(dex, t).get(id)!.ovr.PG).toBe(Math.min(99, leagueDex(dex, f).get(id)!.ovr.PG + t.career[id].dev - before));
  });

  it("draws the draft order: lottery teams first, then playoff teams, the champions last", () => {
    const first = new Map<number, number>();
    for (let seed = 0; seed < 12; seed++) {
      let f = toOffseason(newLeague(pool, dex, mine, "PRO", seed));
      const table = standings(f).map((s) => s.team), champ = f.teams.findIndex((t) => t.name === f.history[0].champion);
      f = nextStep(nextStep(f, dex), dex);
      const { order } = f.off!.draft!;
      expect([...order].sort()).toEqual(table.map((_, i) => i));
      expect(new Set(order.slice(0, 4))).toEqual(new Set(table.slice(4))); // the four that missed the playoffs
      expect(order[order.length - 1]).toBe(champ);
      const worstGotIt = order[0] === table[table.length - 1];
      first.set(Number(worstGotIt), (first.get(Number(worstGotIt)) ?? 0) + 1);
    }
    expect(first.get(1) ?? 0).toBeGreaterThan(0); // the worst team wins the lottery sometimes…
    expect(first.get(1) ?? 0).toBeLessThan(12); // …but not every time
  }, 60_000);

  it("CPU teams draft the prospects they rate highest, never the bottom of the class", () => {
    let f = nextStep(nextStep(toOffseason(league()), dex), dex);
    const d = f.off!.draft!, ld = leagueDex(dex, f), evos = evolutionsOf(dex);
    const value = (id: number) => draftValue(ld.get(id)!, ld, evos);
    const cpu = d.picks.filter((p) => p.team !== YOU && p.id != null);
    expect(cpu.length).toBeGreaterThan(0);
    let gone: number[] = [];
    for (const p of d.picks) {
      if (p.id == null) continue;
      const bestLeft = Math.max(...d.pool.filter((id) => !gone.includes(id)).map(value));
      expect(value(p.id)).toBeGreaterThanOrEqual(bestLeft - 4); // within the scouts' disagreement of the best left
      gone = [...gone, p.id];
    }
    f = draftPick(f, dex, null);
    expect(f.off!.draft!.picks.length).toBeGreaterThan(d.picks.length);
  });

  it("drafts onto an open slot, or over a player (released to the free agents), on a rookie deal", () => {
    let f = nextStep(nextStep(toOffseason(league()), dex), dex);
    expect(f.off!.step).toBe("draft");
    const d = f.off!.draft!;
    const evos = evolutionsOf(dex);
    expect(d.pool.every((id) => evos.has(id) && potential(id, dex, evos) > dex.get(id)!.ovr[dex.get(id)!.best])).toBe(true);
    expect(draftOnClock(d)).toBe(YOU); // you're never passed over without a say
    // round 1: over your last bench player
    const id = draftLeft(d)[0], out = f.teams[YOU].roster[7]?.id;
    const full = openSlots(f.teams[YOU]).length === 0;
    if (full) expect(draftPick(f, dex, id)).toBe(f); // no open slot: you must say where
    const next = draftPick(f, dex, id, 7);
    expect(next.teams[YOU].roster[7]).toEqual({ id, salary: rookieSalary(leagueDex(dex, f).get(id)!), years: FRANCHISE.rookieYears });
    if (out != null) {
      expect(next.off!.released).toContain(out);
      expect(next.off!.draft!.picks.find((p) => p.team === YOU)).toEqual({ team: YOU, id, out });
    }
    f = next;
    while (draftOnClock(f.off!.draft!) === YOU) f = draftPick(f, dex, null);
    expect(draftOnClock(f.off!.draft!)).toBeNull();
    const picked = f.off!.draft!.picks.flatMap((p) => (p.id == null ? [] : [p.id]));
    expect(new Set(picked).size).toBe(picked.length);
    expect(new Set(ids(f)).size).toBe(ids(f).length);
    // everyone released for a rookie is a free agent now
    const fa = nextStep(f, dex);
    for (const p of fa.off!.draft!.picks) if (p.out != null) expect(fa.off!.market).toContain(p.out);
  });

  it("signs free agents under the cap (the other teams move after you), then starts the next season with full rosters", () => {
    let f = toOffseason(league());
    while (f.off!.step !== "sign") f = nextStep(f, dex);
    f = release(f, 6);
    f = release(f, 7);
    expect(openSlots(f.teams[YOU]).length).toBeGreaterThanOrEqual(2);
    expect(nextStep(f, dex)).toBe(f); // not with holes in your roster
    const id = f.off!.market.find((x) => salary(leagueDex(dex, f).get(x)!) <= room(f, 7))!;
    const signed = sign(f, dex, id, 7);
    expect(signed.teams[YOU].roster[7]).toEqual({ id, salary: salary(leagueDex(dex, f).get(id)!), years: FRANCHISE.signYears });
    expect(signed.off!.market).not.toContain(id);
    expect(signed.off!.signings[0]).toEqual({ team: YOU, id });
    // the CPU teams' signings are off the market and on their rosters
    for (const s of signed.off!.signings.slice(1)) {
      expect(s.team).not.toBe(YOU);
      expect(signed.off!.market).not.toContain(s.id);
      expect(signed.teams[s.team].roster.some((c) => c?.id === s.id)).toBe(true);
    }
    // over a player: he goes back on the market
    const other = signed.off!.market.find((x) => salary(leagueDex(dex, signed).get(x)!) <= room(signed, 7))!;
    const swapped = sign(signed, dex, other, 7);
    expect(swapped.teams[YOU].roster[7]!.id).toBe(other);
    expect(swapped.off!.market).toContain(id);
    f = autoSign(swapped, dex);
    expect(openSlots(f.teams[YOU])).toEqual([]);
    expect(payroll(f.teams[YOU])).toBeLessThanOrEqual(SALARY_CAP);
    const season2 = nextStep(f, dex);
    expect(season2.season).toBe(2);
    expect(season2.phase).toBe("season");
    expect(season2.stats).toEqual({});
    expect(season2.teams.every((t) => t.roster.every((c) => c))).toBe(true);
    expect(new Set(ids(season2)).size).toBe(FRANCHISE.teams * SLOTS.length);
    expect([...rostered(season2)].every((x) => season2.career[x])).toBe(true);
  });

  it("stays sound over five seasons run by an automatic manager", () => {
    for (const seed of [3, 77]) {
      let f = newLeague(pool, dex, mine, seed === 3 ? "ROOKIE" : "ALL-STAR", seed);
      for (let season = 1; season <= 5; season++) {
        f = toOffseason(f);
        expect(f.history).toHaveLength(season);
        f = train(f, f.teams[YOU].roster[season % SLOTS.length]!.id);
        f = nextStep(f, dex);
        // keep whoever fits on the longest deal, lose the rest
        for (const id of [...f.off!.expiring]) {
          const kept = resign(f, dex, id, 3);
          f = kept === f ? resign(f, dex, id, 0) : kept;
        }
        f = nextStep(f, dex);
        // draft the best prospect over the last bench spot if he's affordable there
        while (draftOnClock(f.off!.draft!) === YOU) {
          const picked = draftPick(f, dex, draftLeft(f.off!.draft!)[0], openSlots(f.teams[YOU])[0] ?? 7);
          f = picked === f ? draftPick(f, dex, null) : picked;
        }
        f = autoSign(nextStep(f, dex), dex);
        expect(openSlots(f.teams[YOU]), `season ${season}`).toEqual([]);
        expect(payroll(f.teams[YOU])).toBeLessThanOrEqual(SALARY_CAP);
        f = nextStep(f, dex);
        expect(f.season).toBe(season + 1);
        expect(f.teams.every((t) => t.roster.every((c) => c && dex.has(c.id)))).toBe(true);
        expect(new Set(ids(f)).size).toBe(FRANCHISE.teams * SLOTS.length);
        expect(checkFranchise(JSON.parse(JSON.stringify(f)), dex)).toEqual(f);
      }
    }
  }, 120_000);

  it("swaps your roster slots", () => {
    const f = league();
    const s = swap(f, 0, 5);
    expect(s.teams[YOU].roster[0]).toEqual(f.teams[YOU].roster[5]);
    expect(s.teams[YOU].roster[5]).toEqual(f.teams[YOU].roster[0]);
    expect(swap(f, 0, 99)).toBe(f);
  });
});

describe("saved leagues", () => {
  it("load back the same, and damaged ones don't load", () => {
    const f = finishSlate(league(), dex);
    expect(checkFranchise(JSON.parse(JSON.stringify(f)), dex)).toEqual(f);
    const off = toOffseason(league());
    expect(checkFranchise(JSON.parse(JSON.stringify(off)), dex)).toEqual(off);
    // a save from before free-agency rounds and training camp still loads
    const old = JSON.parse(JSON.stringify(off));
    delete old.off.signings;
    delete old.off.trained;
    expect(checkFranchise(old, dex)).toEqual(off);
    expect(checkFranchise(null, dex)).toBeNull();
    expect(checkFranchise({ ...f, v: 2 }, dex)).toBeNull();
    expect(checkFranchise({ ...f, teams: f.teams.slice(1) }, dex)).toBeNull();
    const twice = structuredClone(f);
    twice.teams[1].roster[0] = { ...twice.teams[0].roster[0]! };
    expect(checkFranchise(twice, dex)).toBeNull(); // a Pokémon on two teams
    const unknown = structuredClone(f);
    unknown.teams[2].roster[3]!.id = 999999;
    expect(checkFranchise(unknown, dex)).toBeNull();
    expect(slate(f).length).toBeGreaterThan(0);
  });
});
