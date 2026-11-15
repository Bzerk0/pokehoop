// FRANCHISE mode: one team you run season after season in an 8-team league (yours and 7 CPU teams at the difficulty
// you pick). A season is a double round robin; then the top teams play best-of-3 series to a champion. Then the
// off-season: Pokémon evolve and grow (or slow down) with age, contracts run out (re-sign or let go), a rookie draft
// of young Pokémon, free agency, and the next season. Pure and seeded: no React, no storage. Numbers live in
// ratingConfig.ts FRANCHISE.
import { cpuTeam, difficultyOf, type Difficulty } from "./cpuTeam.ts";
import { emptyLineup, isEligible, salary, SLOTS, slotOvr, type Lineup, type Mode } from "./lineup.ts";
import { ATTR_MAX, CPU_SAMPLE, DIFFICULTIES, FRANCHISE, SALARY_CAP, SALARY_MIN } from "./ratingConfig.ts";
import { makeRng, type Rng } from "./rng.ts";
import { simGame, type GameResult } from "./sim/sim.ts";
import { score, type TeamBox } from "./stats.ts";
import type { RatedPokemon } from "./types.ts";

type Dex = Map<number, RatedPokemon>;

/** A player's deal: $M a season, and the seasons left (this one included). */
export type Contract = { id: number; salary: number; years: number };
/** A team: its roster in SLOTS order (PG, SG, SF, PF, C, then the bench). */
export type FTeam = { name: string; colors: [number, number]; roster: (Contract | null)[] };
/** A game between two teams (indexes); score is [home, away] once it's played. */
export type FGame = { home: number; away: number; score?: [number, number] };
/** A playoff series: `top` is the higher seed (at home in games 1 and 3). */
export type Series = { top: number; bottom: number; games: FGame[] };
export const STAT_KEYS = ["sec", "pts", "reb", "ast", "stl", "blk", "to", "fgm", "fga", "tpm", "tpa"] as const;
export type Totals = { team: number; id: number; gp: number } & Record<(typeof STAT_KEYS)[number], number>;
/** Seasons in the league and the rating points gained (or lost) over them. */
export type Career = { exp: number; dev: number };
/** What happened to a player over the summer. */
export type Change = { team: number; kind: "evolved" | "up" | "down"; id: number; to?: number; by?: number };
export type Finish = "CHAMPIONS" | "FINALS" | "PLAYOFFS" | "MISSED PLAYOFFS";
export type SeasonRecord = {
  season: number;
  champion: string;
  you: { w: number; l: number; finish: Finish };
  mvp: { id: number; team: string; ppg: number; rpg: number; apg: number } | null;
};
export type OffStep = "review" | "resign" | "draft" | "sign";
export type DraftState = { order: number[]; pool: number[]; picks: { team: number; id: number | null }[] };
export type Offseason = {
  step: OffStep;
  changes: Change[];
  expiring: number[]; // your players whose deals ran out, still to decide (the resign step)
  released: number[]; // players let go this summer (they join the free agents)
  draft: DraftState | null;
  market: number[]; // the free agents (the sign step)
};
export type Franchise = {
  v: 1;
  seed: number;
  mode: Mode;
  level: Difficulty;
  season: number;
  phase: "season" | "playoffs" | "offseason";
  teams: FTeam[]; // yours is team YOU
  schedule: FGame[][]; // this season's rounds
  round: number; // the next round to play
  seeds: number[]; // the playoff teams, best seed first
  playoffs: Series[][]; // the playoff rounds so far
  stats: Record<string, Totals>; // this regular season, by `${team}:${id}`
  career: Record<string, Career>; // by dex number
  history: SeasonRecord[];
  off: Offseason | null;
};

export const YOU = 0;

// ── small helpers ────────────────────────────────────────────────────────────
const mix = (...xs: number[]) => xs.reduce((h, x) => Math.imul(h ^ (x >>> 0), 0x9e3779b1) >>> 0, 0x811c9dc5);
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);
const rngFor = (f: Franchise, ...xs: number[]) => makeRng(mix(f.seed, f.season, ...xs));
const inRange = (rng: Rng, [lo, hi]: [number, number]) => lo + rng.int(hi - lo + 1);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const best = (p: RatedPokemon) => p.ovr[p.best];
function shuffle<T>(rng: Rng, list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export const openSlots = (t: FTeam) => t.roster.flatMap((c, s) => (c ? [] : [s]));

/** Ratings as the league has them: each player's development added to every attribute and position OVR. */
export function leagueDex(dex: Dex, f: Pick<Franchise, "career">): Dex {
  const out = new Map(dex);
  for (const [key, c] of Object.entries(f.career)) {
    const p = dex.get(Number(key));
    if (p && c.dev) out.set(p.id, developed(p, c.dev));
  }
  return out;
}
function developed(p: RatedPokemon, by: number): RatedPokemon {
  const add = <T extends Record<string, number>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clamp(v + by, 1, ATTR_MAX)])) as T;
  return { ...p, attrs: add(p.attrs), ovr: add(p.ovr) };
}

/** What each Pokémon evolves into (dex number → its evolutions). */
export function evolutionsOf(dex: Dex): Map<number, RatedPokemon[]> {
  const out = new Map<number, RatedPokemon[]>();
  for (const p of dex.values()) if (p.from != null) out.set(p.from, [...(out.get(p.from) ?? []), p]);
  return out;
}
/** The best OVR a Pokémon could reach by evolving (its own if it can't). */
export function potential(id: number, dex: Dex, evos = evolutionsOf(dex)): number {
  const p = dex.get(id);
  if (!p) return 0;
  return Math.max(best(p), ...(evos.get(id) ?? []).map((q) => potential(q.id, dex, evos)));
}

export const lineupOf = (f: Franchise, t: number): Lineup => ({
  ...emptyLineup(f.mode),
  name: f.teams[t].name,
  colors: f.teams[t].colors,
  ids: f.teams[t].roster.map((c) => c?.id ?? null),
});
export const payroll = (t: FTeam) => t.roster.reduce((s, c) => s + (c?.salary ?? 0), 0);
/** Everyone on a roster. */
export const rostered = (f: Franchise) => new Set(f.teams.flatMap((t) => t.roster.flatMap((c) => (c ? [c.id] : []))));
/** What you can pay a player in roster slot `slot`: the cap less everyone else's deal (deals that ran out don't
 *  count: they're off the books until re-signed), keeping the minimum salary for each other open slot. */
export function room(f: Franchise, slot: number): number {
  const r = f.teams[YOU].roster;
  const others = r.reduce((s, c, i) => s + (i === slot || !c || c.years === 0 ? 0 : c.salary), 0);
  const empties = r.filter((c, i) => !c && i !== slot).length;
  return SALARY_CAP - others - empties * SALARY_MIN;
}
/** A player's price now (his rating, development included). */
export const priceOf = (f: Franchise, dex: Dex, id: number) => salary(leagueDex(dex, f).get(id)!);
export const rookieSalary = (p: RatedPokemon) => Math.max(SALARY_MIN, Math.round(salary(p) * FRANCHISE.rookieScale));

// ── a new league ─────────────────────────────────────────────────────────────
/** Every pair of teams meets twice (home and away); each round every team plays once. */
function schedule(n: number, rng: Rng): FGame[][] {
  const ids = shuffle(rng, Array.from({ length: n }, (_, i) => i));
  const rounds: FGame[][] = [];
  for (let r = 0; r < n - 1; r++) {
    rounds.push(Array.from({ length: n / 2 }, (_, i) => {
      const a = ids[i], b = ids[n - 1 - i];
      return (r + i) % 2 ? { home: a, away: b } : { home: b, away: a };
    }));
    ids.splice(1, 0, ids.pop()!); // the circle method: everyone but the first moves round one
  }
  return [...rounds, ...rounds.map((games) => games.map((g) => ({ home: g.away, away: g.home })))];
}

/** A league: your lineup (full and legal) and FRANCHISE.teams − 1 CPU teams at `level`, every Pokémon on one team. */
export function newLeague(pool: RatedPokemon[], dex: Dex, mine: Lineup, level: Difficulty, seed: number): Franchise {
  const rng = makeRng(seed >>> 0);
  const deal = (id: number): Contract => ({ id, salary: salary(dex.get(id)!), years: inRange(rng, FRANCHISE.years) });
  const teams: FTeam[] = [{ name: mine.name, colors: mine.colors, roster: mine.ids.map((id) => (id == null ? null : deal(id))) }];
  const taken = new Set(mine.ids.filter((id): id is number => id != null));
  const names = new Set([mine.name]);
  for (let k = 1; teams.length < FRANCHISE.teams; k++) {
    const l = cpuTeam(pool.filter((p) => !taken.has(p.id)), level, mine.mode, mix(seed, k));
    if (names.has(l.name)) continue;
    names.add(l.name);
    for (const id of l.ids) taken.add(id!);
    teams.push({ name: l.name, colors: l.colors, roster: l.ids.map((id) => deal(id!)) });
  }
  const f: Franchise = {
    v: 1, seed: seed >>> 0, mode: mine.mode, level, season: 1, phase: "season", teams, schedule: schedule(teams.length, rng),
    round: 0, seeds: [], playoffs: [], stats: {}, career: {}, history: [], off: null,
  };
  for (const id of rostered(f)) f.career[id] = { exp: 0, dev: 0 };
  return f;
}

// ── standings and the games to play ──────────────────────────────────────────
export type Standing = { team: number; w: number; l: number; pf: number; pa: number };
/** The regular season table: wins, then point difference, then points scored. */
export function standings(f: Franchise): Standing[] {
  const s = f.teams.map((_, team) => ({ team, w: 0, l: 0, pf: 0, pa: 0 }));
  for (const g of f.schedule.flat()) {
    if (!g.score) continue;
    const [h, a] = g.score;
    s[g.home].pf += h;
    s[g.home].pa += a;
    s[g.away].pf += a;
    s[g.away].pa += h;
    const [won, lost] = h > a ? [g.home, g.away] : [g.away, g.home];
    s[won].w++;
    s[lost].l++;
  }
  return s.sort((x, y) => y.w - x.w || y.pf - y.pa - (x.pf - x.pa) || y.pf - x.pf || x.team - y.team);
}

/** Series wins so far: [top, bottom]. */
export function seriesWins(s: Series): [number, number] {
  let top = 0, bottom = 0;
  for (const g of s.games) {
    const homeWon = g.score![0] > g.score![1];
    if ((g.home === s.top) === homeWon) top++;
    else bottom++;
  }
  return [top, bottom];
}
export function winner(s: Series): number | null {
  const [a, b] = seriesWins(s);
  return a >= FRANCHISE.seriesWins ? s.top : b >= FRANCHISE.seriesWins ? s.bottom : null;
}
const nextInSeries = (s: Series): FGame => (s.games.length % 2 === 1 ? { home: s.bottom, away: s.top } : { home: s.top, away: s.bottom });

/** The games on now, by key: this round's (in the season), or in the playoffs the next game of each live series
 *  that's played the fewest so far (the series go in step: game 2 of one waits for game 1 of the other). */
export function slate(f: Franchise): { key: string; game: FGame }[] {
  if (f.phase === "season") return (f.schedule[f.round] ?? []).map((game, i) => ({ key: `s${f.round}.${i}`, game }));
  if (f.phase !== "playoffs") return [];
  const r = f.playoffs.length - 1;
  const live = f.playoffs[r].map((s, i) => ({ s, i })).filter(({ s }) => winner(s) == null);
  const day = Math.min(...live.map(({ s }) => s.games.length));
  return live.filter(({ s }) => s.games.length === day).map(({ s, i }) => ({ key: `p${r}.${i}.${s.games.length}`, game: nextInSeries(s) }));
}
/** Your game on the slate, if you have one still to play. */
export const yourGame = (f: Franchise) => slate(f).find((x) => !x.game.score && (x.game.home === YOU || x.game.away === YOU)) ?? null;
const gameSeed = (f: Franchise, key: string) => mix(f.seed, f.season, hash(key));

/** Record a played game: `teams` = [home box, away box]. Regular season box scores add up into the season's stats.
 *  A key that's no longer on the slate (already played) changes nothing. */
export function record(f: Franchise, key: string, teams: [TeamBox, TeamBox]): Franchise {
  const at = slate(f).find((x) => x.key === key);
  if (!at || at.game.score) return f;
  const next: Franchise = structuredClone(f);
  const game: FGame = { ...at.game, score: [score(teams[0]), score(teams[1])] };
  const [r, i] = key.slice(1).split(".").map(Number);
  if (key[0] === "p") {
    next.playoffs[r][i].games.push(game);
    return next;
  }
  next.schedule[r][i] = game;
  [game.home, game.away].forEach((team, side) => {
    for (const l of teams[side].lines) {
      if (l.sec <= 0) continue;
      const t = (next.stats[`${team}:${l.id}`] ??= { team, id: l.id, gp: 0, ...Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) } as Totals);
      t.gp++;
      for (const k of STAT_KEYS) t[k] += l[k];
    }
  });
  return next;
}
/** Record your game from a result in your-team-first order (a live game always has you at home). */
export function recordYours(f: Franchise, key: string, [mine, theirs]: [TeamBox, TeamBox]): Franchise {
  const at = slate(f).find((x) => x.key === key);
  if (!at) return f;
  return record(f, key, at.game.home === YOU ? [mine, theirs] : [theirs, mine]);
}

/** Sim one game on the slate (`ld`: the league's ratings, leagueDex). */
function simWith(f: Franchise, ld: Dex, key: string): Franchise {
  const at = slate(f).find((x) => x.key === key);
  if (!at || at.game.score) return f;
  const result = simGame(lineupOf(f, at.game.home), lineupOf(f, at.game.away), ld, gameSeed(f, key));
  return record(f, key, result.teams);
}
export const simOne = (f: Franchise, dex: Dex, key: string) => simWith(f, leagueDex(dex, f), key);

/** Your opponent in a game. */
export const opponentIn = (g: FGame) => (g.home === YOU ? g.away : g.home);
/** Sim your game on the slate with your team first (as the game screens show it): the result, and the league with
 *  it recorded. null when you've no game to play. */
export function simYours(f: Franchise, dex: Dex): { f: Franchise; result: GameResult } | null {
  const at = yourGame(f);
  if (!at) return null;
  const result = simGame(lineupOf(f, YOU), lineupOf(f, opponentIn(at.game)), leagueDex(dex, f), gameSeed(f, at.key));
  return { f: recordYours(f, at.key, result.teams), result };
}

/** Sim whatever's left on the slate, then move on: the next round, the playoffs, the next playoff round, or (with a
 *  champion) the off-season. */
export function finishSlate(f: Franchise, dex: Dex): Franchise {
  const ld = leagueDex(dex, f); // (ratings only change in the off-season)
  for (const { key, game } of slate(f)) if (!game.score) f = simWith(f, ld, key);
  return moveOn(f, dex);
}
/** Sim on to the end of the regular season (or of the playoffs). */
export function simPhase(f: Franchise, dex: Dex): Franchise {
  const phase = f.phase;
  for (let guard = 0; f.phase === phase && phase !== "offseason" && guard < 200; guard++) f = finishSlate(f, dex);
  return f;
}

function moveOn(f: Franchise, dex: Dex): Franchise {
  if (slate(f).some((x) => !x.game.score)) return f;
  if (f.phase === "season") {
    const next = { ...f, round: f.round + 1 };
    return next.round >= next.schedule.length ? startPlayoffs(next) : next;
  }
  if (f.phase !== "playoffs") return f;
  const round = f.playoffs[f.playoffs.length - 1];
  const winners = round.map(winner);
  if (winners.some((w) => w == null)) return f;
  if (winners.length === 1) return startOffseason(f, dex, winners[0]!);
  const next: Series[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const [top, bottom] = [winners[i]!, winners[i + 1]!].sort((a, b) => f.seeds.indexOf(a) - f.seeds.indexOf(b));
    next.push({ top, bottom, games: [] });
  }
  return { ...f, playoffs: [...f.playoffs, next] };
}

function startPlayoffs(f: Franchise): Franchise {
  const seeds = standings(f).slice(0, FRANCHISE.playoffTeams).map((s) => s.team);
  const n = seeds.length;
  const first = Array.from({ length: n / 2 }, (_, i) => ({ top: seeds[i], bottom: seeds[n - 1 - i], games: [] as FGame[] }));
  return { ...f, phase: "playoffs", seeds, playoffs: [first] };
}

// ── awards and the season's end ──────────────────────────────────────────────
/** Efficiency a game: everything good (points, boards, assists, steals, blocks) less misses and turnovers. */
export const efficiency = (t: Totals) => (t.pts + t.reb + t.ast + t.stl + t.blk - (t.fga - t.fgm) - t.to) / Math.max(1, t.gp);
/** The MVP: the most efficient player who played at least half the season. */
export function mvp(f: Franchise): Totals | null {
  const need = Math.ceil(f.schedule.length / 2);
  return Object.values(f.stats).filter((t) => t.gp >= need).reduce<Totals | null>((a, b) => (!a || efficiency(b) > efficiency(a) ? b : a), null);
}
/** League leaders in a stat (per game), among players who've played a third of the games so far. */
export function leaders(f: Franchise, stat: (typeof STAT_KEYS)[number], n = 5): Totals[] {
  const need = Math.ceil(Math.max(0, ...Object.values(f.stats).map((t) => t.gp)) / 3);
  return Object.values(f.stats).filter((t) => t.gp >= need).sort((a, b) => b[stat] / b.gp - a[stat] / a.gp || a.id - b.id).slice(0, n);
}
const per = (t: Totals, k: (typeof STAT_KEYS)[number]) => Math.round((t[k] / Math.max(1, t.gp)) * 10) / 10;

function finishOf(f: Franchise, champion: number): Finish {
  if (champion === YOU) return "CHAMPIONS";
  const last = f.playoffs[f.playoffs.length - 1];
  if (last.some((s) => s.top === YOU || s.bottom === YOU)) return "FINALS";
  return f.seeds.includes(YOU) ? "PLAYOFFS" : "MISSED PLAYOFFS";
}

/** Chance a Pokémon evolves this summer, from his minutes a game. */
export const evolveChance = (secPerGame: number) =>
  FRANCHISE.evolve.base + FRANCHISE.evolve.minutes * Math.min(1, secPerGame / FRANCHISE.evolve.fullAt);

function startOffseason(f: Franchise, dex: Dex, champion: number): Franchise {
  const next: Franchise = structuredClone(f);
  const me = standings(f).find((s) => s.team === YOU)!;
  const star = mvp(f);
  next.history.push({
    season: f.season,
    champion: f.teams[champion].name,
    you: { w: me.w, l: me.l, finish: finishOf(f, champion) },
    mvp: star && { id: star.id, team: f.teams[star.team].name, ppg: per(star, "pts"), rpg: per(star, "reb"), apg: per(star, "ast") },
  });

  // every player grows a year older: better or worse, and maybe evolved
  const rng = rngFor(f, 101);
  const evos = evolutionsOf(dex);
  const taken = rostered(f);
  const changes: Change[] = [];
  const { dev: D } = FRANCHISE;
  next.teams.forEach((team, t) => team.roster.forEach((c, slot) => {
    if (!c) return;
    const car = next.career[c.id] ?? { exp: 0, dev: 0 };
    const span = car.exp < D.youngUntil ? D.young : car.exp >= D.oldFrom ? D.old : D.prime;
    const dev = clamp(car.dev + inRange(rng, span), D.min, D.max);
    if (dev !== car.dev) changes.push({ team: t, kind: dev > car.dev ? "up" : "down", id: c.id, by: dev - car.dev });
    const grown = { exp: car.exp + 1, dev };
    const self = dex.get(c.id)!, st = f.stats[`${t}:${c.id}`];
    const kids = (evos.get(c.id) ?? []).filter((p) => isEligible(p, f.mode) && !taken.has(p.id));
    const roll = rng.next();
    if (kids.length && roll < evolveChance(st ? st.sec / st.gp : 0)) {
      // an Alolan form stays Alolan (and a plain one plain) when it can
      const alolan = (p: RatedPokemon) => p.slug.endsWith("-alola");
      const same = kids.filter((k) => alolan(k) === alolan(self));
      const to = rng.pick(same.length ? same : kids);
      taken.delete(c.id);
      taken.add(to.id);
      delete next.career[c.id];
      next.career[to.id] = grown;
      team.roster[slot] = { ...c, id: to.id };
      changes.push({ team: t, kind: "evolved", id: c.id, to: to.id });
    } else next.career[c.id] = grown;
  }));

  // a season off every deal; CPU teams keep most of their expiring players, you decide on yours
  const ld = leagueDex(dex, next);
  const expiring: number[] = [], released: number[] = [];
  next.teams.forEach((team, t) => team.roster.forEach((c, slot) => {
    if (!c || --c.years > 0) return;
    if (t === YOU) expiring.push(c.id);
    else if (rng.next() < FRANCHISE.cpuKeep) team.roster[slot] = { id: c.id, salary: salary(ld.get(c.id)!), years: inRange(rng, FRANCHISE.years) };
    else {
      team.roster[slot] = null;
      released.push(c.id);
    }
  }));
  next.phase = "offseason";
  next.off = { step: "review", changes, expiring, released, draft: null, market: [] };
  return next;
}

// ── the off-season ───────────────────────────────────────────────────────────
/** Re-sign an expiring player of yours at his price now (if it fits under the cap), or let him go. */
export function resign(f: Franchise, dex: Dex, id: number, keep: boolean): Franchise {
  if (f.off?.step !== "resign" || !f.off.expiring.includes(id)) return f;
  const slot = f.teams[YOU].roster.findIndex((c) => c?.id === id);
  const price = priceOf(f, dex, id);
  if (keep && price > room(f, slot)) return f;
  const next: Franchise = structuredClone(f);
  const off = next.off!;
  off.expiring = off.expiring.filter((x) => x !== id);
  if (keep) next.teams[YOU].roster[slot] = { id, salary: price, years: FRANCHISE.resignYears };
  else {
    next.teams[YOU].roster[slot] = null;
    off.released.push(id);
  }
  return next;
}

/** Let one of your players go (the off-season only): the slot opens and he joins the free agents. */
export function release(f: Franchise, slot: number): Franchise {
  const c = f.teams[YOU].roster[slot];
  if (f.phase !== "offseason" || !c) return f;
  const next: Franchise = structuredClone(f);
  const off = next.off!;
  next.teams[YOU].roster[slot] = null;
  off.expiring = off.expiring.filter((x) => x !== c.id);
  off.released.push(c.id);
  if (off.step === "sign") off.market.push(c.id);
  return next;
}

/** Swap two of your roster slots (say a bench player into the starting five). Not mid-draft-pick: any time. */
export function swap(f: Franchise, a: number, b: number): Franchise {
  if (a === b || a < 0 || b < 0 || a >= SLOTS.length || b >= SLOTS.length) return f;
  const next: Franchise = structuredClone(f);
  const r = next.teams[YOU].roster;
  [r[a], r[b]] = [r[b], r[a]];
  return next;
}

/** The draft's value of a young Pokémon to a team: half what he is, half what he could become. */
export const draftValue = (p: RatedPokemon, dex: Dex, evos: Map<number, RatedPokemon[]>) => (best(p) + potential(p.id, dex, evos)) / 2;
export const draftOnClock = (d: DraftState) => (d.picks.length < d.order.length * FRANCHISE.draftRounds ? d.order[d.picks.length % d.order.length] : null);
export const draftLeft = (d: DraftState) => d.pool.filter((id) => !d.picks.some((p) => p.id === id));

function startDraft(f: Franchise, dex: Dex): Franchise {
  const rng = rngFor(f, 202);
  const evos = evolutionsOf(dex), taken = rostered(f), ld = leagueDex(dex, f);
  const young = [...ld.values()].filter((p) => isEligible(p, f.mode) && !taken.has(p.id) && evos.has(p.id) && !f.off!.released.includes(p.id));
  const cls = shuffle(rng, young).slice(0, FRANCHISE.classSize * 3).sort((a, b) => draftValue(b, ld, evos) - draftValue(a, ld, evos) || a.id - b.id).slice(0, FRANCHISE.classSize);
  const order = standings(f).map((s) => s.team).reverse(); // the worst record picks first
  const draft: DraftState = { order, pool: cls.map((p) => p.id), picks: [] };
  return runDraft({ ...f, off: { ...f.off!, step: "draft", draft } }, dex);
}

/** Put a player on a team's open slot `slot`, or the best open slot for him. */
function signTo(team: FTeam, p: RatedPokemon, deal: Omit<Contract, "id">, slot?: number) {
  const open = openSlots(team);
  const at = slot != null && open.includes(slot) ? slot : open.reduce((a, b) => (slotOvr(b, p) > slotOvr(a, p) ? b : a));
  team.roster[at] = { id: p.id, ...deal };
}

/** CPU picks (and your pass when your roster's full) until it's your turn or the draft's over. */
function runDraft(f: Franchise, dex: Dex): Franchise {
  const next: Franchise = structuredClone(f);
  const d = next.off!.draft!;
  const ld = leagueDex(dex, next), evos = evolutionsOf(dex);
  for (let team = draftOnClock(d); team != null; team = draftOnClock(d)) {
    const t = next.teams[team];
    if (!openSlots(t).length || !draftLeft(d).length) {
      d.picks.push({ team, id: null }); // no room: a pass
      continue;
    }
    if (team === YOU) break;
    const rng = makeRng(mix(next.seed, next.season, 303, d.picks.length));
    const pick = draftLeft(d).map((id) => ld.get(id)!).reduce((a, b) => (draftValue(b, ld, evos) + rng.next() * 4 > draftValue(a, ld, evos) ? b : a));
    signTo(t, pick, { salary: rookieSalary(pick), years: FRANCHISE.rookieYears });
    d.picks.push({ team, id: pick.id });
  }
  return next;
}

/** Your draft pick (`id` from the class, if you have the room and the cap space), or a pass (null). */
export function draftPick(f: Franchise, dex: Dex, id: number | null): Franchise {
  const d = f.off?.draft;
  if (f.off?.step !== "draft" || !d || draftOnClock(d) !== YOU) return f;
  const next: Franchise = structuredClone(f);
  const nd = next.off!.draft!;
  if (id != null) {
    const p = leagueDex(dex, f).get(id);
    const open = openSlots(f.teams[YOU]);
    if (!p || !draftLeft(d).includes(id) || !open.length || rookieSalary(p) > room(f, open[0])) return f;
    signTo(next.teams[YOU], p, { salary: rookieSalary(p), years: FRANCHISE.rookieYears });
  }
  nd.picks.push({ team: YOU, id });
  return runDraft(next, dex);
}

/** Free agency: everyone let go this summer and the undrafted class, plus a sample of other unsigned Pokémon. */
function startSigning(f: Franchise, dex: Dex): Franchise {
  const rng = rngFor(f, 404);
  const taken = rostered(f), ld = leagueDex(dex, f);
  const d = f.off!.draft;
  const left = new Set([...f.off!.released, ...(d ? draftLeft(d) : [])].filter((id) => !taken.has(id)));
  const others = shuffle(rng, [...ld.values()].filter((p) => isEligible(p, f.mode) && !taken.has(p.id) && !left.has(p.id))).slice(0, 30);
  const market = [...left, ...others.map((p) => p.id)].sort((a, b) => best(ld.get(b)!) - best(ld.get(a)!) || a - b);
  return { ...f, off: { ...f.off!, step: "sign", market } };
}

/** Sign a free agent at his price for FRANCHISE.signYears seasons, on open slot `slot` (or your best one for him). */
export function sign(f: Franchise, dex: Dex, id: number, slot?: number): Franchise {
  if (f.off?.step !== "sign" || !f.off.market.includes(id)) return f;
  const p = leagueDex(dex, f).get(id)!, open = openSlots(f.teams[YOU]);
  if (!open.length || salary(p) > room(f, open[0])) return f;
  const next: Franchise = structuredClone(f);
  signTo(next.teams[YOU], p, { salary: salary(p), years: FRANCHISE.signYears }, slot);
  next.off!.market = next.off!.market.filter((x) => x !== id);
  return next;
}

/** Fill your open slots from the free agents, in order: the best player for each that fits, spreading what's left of
 *  the cap (no one takes more than twice an even share). Slots nobody affordable fits stay open. */
export function autoSign(f: Franchise, dex: Dex): Franchise {
  if (f.off?.step !== "sign") return f;
  const ld = leagueDex(dex, f);
  for (const slot of openSlots(f.teams[YOU])) {
    const empties = openSlots(f.teams[YOU]).length, r = room(f, slot);
    const allowance = Math.min(r, Math.ceil((2 * (r + (empties - 1) * SALARY_MIN)) / empties));
    const fits = f.off!.market.map((id) => ld.get(id)!).filter((p) => salary(p) <= allowance);
    if (!fits.length) continue;
    const pick = fits.reduce((a, b) => (slotOvr(slot, b) > slotOvr(slot, a) ? b : a));
    f = sign(f, dex, pick.id, slot);
  }
  return f;
}

/** CPU teams fill their open slots like a CPU team is built: someone near their level's OVR band. */
function cpuFill(f: Franchise, dex: Dex): Franchise {
  const next: Franchise = structuredClone(f);
  const rng = rngFor(f, 505), ld = leagueDex(dex, next), band = difficultyOf(next.level);
  const taken = rostered(next);
  next.teams.forEach((team, t) => {
    if (t === YOU) return;
    for (const slot of openSlots(team)) {
      const target = band.min + rng.next() * (band.max - band.min);
      const free = [...ld.values()].filter((p) => isEligible(p, next.mode) && !taken.has(p.id));
      const near = free.filter((p) => Math.abs(slotOvr(slot, p) - target) <= 6);
      const from = near.length ? near : free;
      const sample = Array.from({ length: Math.min(CPU_SAMPLE, from.length) }, () => rng.pick(from));
      const p = sample.reduce((a, b) => (Math.abs(slotOvr(slot, b) - target) < Math.abs(slotOvr(slot, a) - target) ? b : a));
      team.roster[slot] = { id: p.id, salary: salary(p), years: inRange(rng, FRANCHISE.years) };
      taken.add(p.id);
    }
  });
  return next;
}

/** On to the next off-season step (review → resign → draft → sign → the new season). The new season needs your
 *  roster full: until then this changes nothing. Undecided expiring players are let go when the resign step ends. */
export function nextStep(f: Franchise, dex: Dex): Franchise {
  const off = f.off;
  if (f.phase !== "offseason" || !off) return f;
  if (off.step === "review") return { ...f, off: { ...off, step: "resign" } };
  if (off.step === "resign") {
    let g = f;
    for (const id of off.expiring) g = release(g, g.teams[YOU].roster.findIndex((c) => c?.id === id));
    return startDraft(g, dex);
  }
  if (off.step === "draft") {
    if (off.draft && draftOnClock(off.draft) === YOU) return nextStep(draftPick(f, dex, null), dex); // skipping: pass
    return startSigning(f, dex);
  }
  if (openSlots(f.teams[YOU]).length) return f;
  return startSeason(f, dex);
}

function startSeason(f: Franchise, dex: Dex): Franchise {
  const next = cpuFill(f, dex);
  for (const id of rostered(next)) next.career[id] ??= { exp: 0, dev: 0 };
  return {
    ...next,
    season: f.season + 1,
    phase: "season",
    schedule: schedule(next.teams.length, rngFor(next, 606)),
    round: 0,
    seeds: [],
    playoffs: [],
    stats: {},
    off: null,
  };
}

// ── loading a saved league ───────────────────────────────────────────────────
const isInt = (x: unknown, lo = 0, hi = Number.MAX_SAFE_INTEGER): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const isArr = Array.isArray;

/** The league in `x` if it's a sound one (from storage: it may be from an old version or damaged), else null. */
export function checkFranchise(x: unknown, dex: Dex): Franchise | null {
  const f = x as Franchise;
  try {
    const n = FRANCHISE.teams;
    const team = (t: unknown) => isInt(t, 0, n - 1);
    const game = (g: FGame) => team(g.home) && team(g.away) && g.home !== g.away && (g.score == null || (isArr(g.score) && g.score.length === 2 && g.score.every((v) => isInt(v))));
    const ok =
      f && f.v === 1 && isInt(f.seed) && (f.mode === "classic" || f.mode === "unlimited") && DIFFICULTIES.some((d) => d.name === f.level) &&
      isInt(f.season, 1) && ["season", "playoffs", "offseason"].includes(f.phase) &&
      isArr(f.teams) && f.teams.length === n &&
      f.teams.every((t) => typeof t.name === "string" && isArr(t.colors) && t.colors.length === 2 && t.colors.every((c) => isInt(c, 0, 255)) &&
        isArr(t.roster) && t.roster.length === SLOTS.length &&
        t.roster.every((c) => c === null || (dex.has(c.id) && isInt(c.salary, 0, 1000) && isInt(c.years, 0, 20)))) &&
      isArr(f.schedule) && f.schedule.every((r) => isArr(r) && r.every(game)) && isInt(f.round, 0, f.schedule.length) &&
      isArr(f.seeds) && f.seeds.every(team) &&
      isArr(f.playoffs) && f.playoffs.every((r) => isArr(r) && r.every((s) => team(s.top) && team(s.bottom) && isArr(s.games) && s.games.every(game))) &&
      typeof f.stats === "object" && f.stats !== null && Object.values(f.stats).every((t) => team(t.team) && isInt(t.id) && isInt(t.gp) && STAT_KEYS.every((k) => typeof t[k] === "number")) &&
      typeof f.career === "object" && f.career !== null && Object.values(f.career).every((c) => isInt(c.exp) && Number.isInteger(c.dev)) &&
      isArr(f.history) && f.history.every((h) => isInt(h.season, 1) && typeof h.champion === "string" && isInt(h.you?.w) && isInt(h.you?.l) &&
        typeof h.you.finish === "string" && (h.mvp === null || (typeof h.mvp === "object" && isInt(h.mvp.id) && typeof h.mvp.team === "string"))) &&
      (f.off === null || (typeof f.off === "object" && ["review", "resign", "draft", "sign"].includes(f.off.step) &&
        [f.off.expiring, f.off.released, f.off.market].every((l) => isArr(l) && l.every((id) => dex.has(id))) &&
        (f.off.draft === null || (isArr(f.off.draft.order) && isArr(f.off.draft.pool) && isArr(f.off.draft.picks)))));
    if (!ok) return null;
    // every Pokémon on one team at most
    const ids = f.teams.flatMap((t) => t.roster.flatMap((c) => (c ? [c.id] : [])));
    if (new Set(ids).size !== ids.length) return null;
    if ((f.phase === "offseason") !== (f.off !== null)) return null;
    return f;
  } catch {
    return null;
  }
}
