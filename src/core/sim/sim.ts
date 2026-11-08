// The game simulator (PLAN.md §9): seeded, possession by possession. Each possession picks a shooter, checks for a
// turnover, picks a shot (rim, mid, three), checks for a block, rolls the make against the matched defender, then
// rebound and assist. Players tire on the court and the bench comes in. Chemistry boosts every rating.
// simRest finishes a game from any state, so the live game can hand over part-way.
import { chemistry } from "../chemistry.ts";
import type { Lineup } from "../lineup.ts";
import { ATTR_MAX, SIM } from "../ratingConfig.ts";
import { makeRng, type Rng } from "../rng.ts";
import { newLine, score, type Line, type TeamBox } from "../stats.ts";
import { ATTRIBUTES, POSITIONS, type Attributes, type RatedPokemon } from "../types.ts";

export type SimPlayer = { id: number; name: string; a: Attributes; energy: number };
export type SimTeam = { name: string; players: SimPlayer[]; onCourt: number[]; box: TeamBox };
export type GameState = {
  teams: [SimTeam, SimTeam];
  period: number; // 0–3 regulation, 4+ overtime
  poss: number; // possessions played this period (both teams)
  offense: 0 | 1;
  highlights: Highlight[];
  /** Possessions × this (1 = the sim's own pace). A live game handed over sets it to the live game's slower pace,
   *  so the rest is played at the same scoring scale. */
  pace?: number;
};
export type Highlight = { period: number; text: string; weight: number; kind: string };
export type GameResult = { teams: [TeamBox, TeamBox]; highlights: string[] };

type Dex = Map<number, RatedPokemon>;
type Shot = "rim" | "mid" | "three";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(p / (1 - p));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const periodName = (p: number) => (p < 4 ? `Q${p + 1}` : p === 4 ? "OT" : `${p - 3}OT`);

function weighted<T>(rng: Rng, items: T[], weight: (t: T) => number): T {
  const ws = items.map((t) => Math.max(0.0001, weight(t)));
  let r = rng.next() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((r -= ws[i]) <= 0) return items[i];
  return items[items.length - 1];
}

function makeTeam(l: Lineup, dex: Dex): SimTeam {
  const { boosts } = chemistry(l, dex);
  const players = l.ids.map((id, slot) => {
    const p = dex.get(id!)!;
    const a = Object.fromEntries(ATTRIBUTES.map((k) => [k, Math.min(ATTR_MAX, p.attrs[k] + boosts[slot])])) as Attributes;
    return { id: p.id, name: p.name, a, energy: 100 };
  });
  return { name: l.name, players, onCourt: POSITIONS.map((_, i) => i), box: { name: l.name, lines: l.ids.map((id, slot) => newLine(id!, slot)), periods: [] } };
}

/** A fresh game; both lineups must be full. */
export function startGame(home: Lineup, away: Lineup, dex: Dex): GameState {
  return { teams: [makeTeam(home, dex), makeTeam(away, dex)], period: 0, poss: 0, offense: 0, highlights: [] };
}

/** A player's rating right now: tired players play below their best. */
const rate = (p: SimPlayer, k: keyof Attributes) => p.a[k] * (SIM.tiredFloor + (1 - SIM.tiredFloor) * (p.energy / 100));

/** Possessions per period for both teams together (each team gets half), from the pace of all ten starters. */
function periodPossessions(s: GameState) {
  const speed = avg(s.teams.flatMap((t) => t.players.slice(0, POSITIONS.length).map((p) => p.a.speed)));
  const perTeam = SIM.possessions * (1 + SIM.paceSwing * ((speed - 50) / 50)) * (s.pace ?? 1);
  const share = s.period < 4 ? 1 / 4 : (1 / 4) * (SIM.overtimeSec / SIM.quarterSec);
  return 2 * Math.max(1, Math.round(perTeam * share));
}

function possession(s: GameState, rng: Rng, secs: number) {
  const off = s.teams[s.offense], def = s.teams[1 - s.offense];
  const o = off.onCourt.map((i) => off.players[i]), d = def.onCourt.map((i) => def.players[i]);
  const line = (t: SimTeam, p: SimPlayer) => t.box.lines[t.players.indexOf(p)];
  const pts = (n: number) => (off.box.periods[s.period] = (off.box.periods[s.period] ?? 0) + n);
  const note = (kind: string, text: string, weight: number) => s.highlights.push({ period: s.period, text, weight, kind });

  // minutes and fatigue for everyone, on court and off
  for (const t of s.teams) {
    t.players.forEach((p, i) => {
      if (t.onCourt.includes(i)) {
        t.box.lines[i].sec += secs;
        p.energy = clamp(p.energy - SIM.drain * (1.5 - p.a.stamina / 100), 0, 100);
      } else p.energy = clamp(p.energy + SIM.recover, 0, 100);
    });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const shooter = weighted(rng, o, (p) => ((rate(p, "shooting") + rate(p, "finishing") + rate(p, "handles")) / 3) ** 3);
    const guard = d[o.indexOf(shooter)];

    // turnover (only before the first shot of a possession)
    if (attempt === 0) {
      const pTo = clamp(sigmoid(logit(SIM.turnover) + (rate(guard, "perimeterD") - rate(shooter, "handles")) / (SIM.slope * 2)), 0.04, 0.3);
      if (rng.next() < pTo) {
        line(off, shooter).to++;
        if (rng.next() < SIM.stealShare) {
          const thief = weighted(rng, d, (p) => rate(p, "perimeterD") ** 2);
          line(def, thief).stl++;
          note("steal", `${thief.name} picks ${shooter.name}'s pocket!`, 2);
        }
        return;
      }
    }

    const shot: Shot = weighted(rng, ["rim", "mid", "three"] as Shot[], (k) =>
      k === "rim" ? rate(shooter, "finishing") : k === "mid" ? 0.6 * rate(shooter, "shooting") : rate(shooter, "shooting") ** 2 / 80,
    );
    const sl = line(off, shooter);
    sl.fga++;
    if (shot === "three") sl.tpa++;

    // block: a rim protector near the basket, the matched defender on jumpers
    const blocker = shot === "rim" ? weighted(rng, d, (p) => rate(p, "interiorD") ** 2) : guard;
    const pBlock = sigmoid(logit(SIM.block) + (rate(blocker, "interiorD") - rate(shooter, shot === "rim" ? "finishing" : "shooting")) / SIM.slope) * (shot === "three" ? 0.3 : 1);
    let made = false;
    if (rng.next() < pBlock) {
      line(def, blocker).blk++;
      note("block", `${blocker.name} swats ${shooter.name}'s shot away!`, 3);
    } else {
      const offRate = rate(shooter, shot === "rim" ? "finishing" : "shooting");
      const defRate = shot === "rim" ? avg([rate(guard, "interiorD"), rate(blocker, "interiorD")]) : rate(guard, "perimeterD");
      made = rng.next() < sigmoid(logit(SIM[shot]) + (offRate - defRate) / SIM.slope);
    }

    if (made) {
      const value = shot === "three" ? 3 : 2;
      sl.fgm++;
      sl.pts += value;
      if (shot === "three") sl.tpm++;
      pts(value);
      if (rng.next() < SIM.assist) {
        const passer = weighted(rng, o.filter((p) => p !== shooter), (p) => rate(p, "passing") ** 2);
        line(off, passer).ast++;
      }
      if (shot === "three") note("three", rng.next() < 0.5 ? `${shooter.name} drains a deep three!` : `${shooter.name} pulls up from downtown... BANG!`, 2);
      else if (shot === "rim" && rate(shooter, "finishing") >= 75) note("dunk", `${shooter.name} throws it down!`, 2);
      return;
    }

    // rebound
    const pOff = sigmoid(logit(SIM.offRebound) + (avg(o.map((p) => rate(p, "rebounding"))) - avg(d.map((p) => rate(p, "rebounding")))) / SIM.slope);
    const offBoard = rng.next() < pOff;
    const crashers = offBoard ? o : d;
    const reb = weighted(rng, crashers, (p) => (rate(p, "rebounding") + rate(p, "strength") / 2) ** 2);
    line(offBoard ? off : def, reb).reb++;
    if (!offBoard) return;
  }
}

/** At a stoppage: a tired player sits for the freshest bench player, who takes over his court spot. */
function substitute(t: SimTeam) {
  t.onCourt.forEach((pi, spot) => {
    const p = t.players[pi];
    if (p.energy >= SIM.subBelow) return;
    const bench = t.players.map((_, i) => i).filter((i) => !t.onCourt.includes(i));
    const fresh = bench.sort((a, b) => t.players[b].energy - t.players[a].energy)[0];
    if (fresh != null && t.players[fresh].energy > p.energy + 15) t.onCourt[spot] = fresh;
  });
  // rested starters come back in
  t.onCourt.forEach((pi, spot) => {
    if (pi !== spot && !t.onCourt.includes(spot) && t.players[spot].energy >= 90) t.onCourt[spot] = spot;
  });
}

/** Play the game out from `state` (a fresh one, or one the live game hands over) and report the result. */
export function simRest(state: GameState, seed: number): GameResult {
  const s: GameState = structuredClone(state);
  const rng = makeRng(seed);
  for (;;) {
    const total = periodPossessions(s);
    const secs = (s.period < 4 ? SIM.quarterSec : SIM.overtimeSec) / total; // each possession is on both teams' clocks
    for (const t of s.teams) t.box.periods[s.period] ??= 0;
    while (s.poss < total) {
      possession(s, rng, secs);
      s.offense = (1 - s.offense) as 0 | 1;
      s.poss++;
      if (s.poss % 6 === 0) s.teams.forEach(substitute);
    }
    const [a, b] = s.teams.map((t) => score(t.box));
    if (s.period >= 3 && a !== b) break;
    s.period++;
    s.poss = 0;
    s.teams.forEach(substitute);
  }

  // up to 8 highlights: the biggest plays (a little shuffled), at most two of each kind, in game order, then the
  // top scorer
  const perKind = new Map<string, number>();
  const picked = [...s.highlights]
    .map((h, i) => ({ ...h, i, roll: rng.next() }))
    .sort((x, y) => y.weight + y.roll - (x.weight + x.roll))
    .filter((h) => {
      const n = perKind.get(h.kind) ?? 0;
      perKind.set(h.kind, n + 1);
      return n < 2;
    })
    .slice(0, 7)
    .sort((x, y) => x.i - y.i)
    .map((h) => `${periodName(h.period)} · ${h.text}`);
  const lines = s.teams.flatMap((t) => t.box.lines.map((l) => ({ l, name: t.players[t.box.lines.indexOf(l)].name })));
  const top = lines.reduce((x, y) => (y.l.pts > x.l.pts ? y : x));
  picked.push(`${top.name} led all scorers with ${top.l.pts}.`);
  return { teams: [s.teams[0].box, s.teams[1].box], highlights: picked };
}

/** Finish a game the live game hands over part-way: `state` carries its box scores, energies and who's on court;
 *  `elapsed` is the share of the current `period` already played. */
export function simFrom(state: GameState, period: number, elapsed: number, seed: number): GameResult {
  const s: GameState = structuredClone(state);
  s.period = period;
  s.poss = Math.min(periodPossessions(s), Math.round(periodPossessions(s) * Math.max(0, Math.min(1, elapsed))));
  return simRest(s, seed);
}

/** A whole game from tip-off. Same lineups and seed, same game. */
export const simGame = (home: Lineup, away: Lineup, dex: Dex, seed: number) => simRest(startGame(home, away, dex), seed);

export type { Line };
