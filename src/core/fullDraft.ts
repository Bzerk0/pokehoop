// The FULL DRAFT: like a real NBA draft. A draft class whose ratings follow a bell curve (FULL.mean ± FULL.sd), FULL.teams
// teams, a lottery that shuffles the pick order (the same every round, NBA style) and one round per roster spot. CPU
// teams take the best player left that fits under their cap (give or take FULL.cpuNoise, scouts disagree); on your
// pick you choose from what's left that fits under yours, and place them. Seeded and pure: no React, no storage.
import { MASCOTS, PLACES } from "./cpuTeam.ts";
import { budgetFor, emptyLineup, isEligible, salary, SLOTS, slotOvr, teamRating, type Lineup, type Mode } from "./lineup.ts";
import { FULL } from "./ratingConfig.ts";
import { makeRng, type Rng } from "./rng.ts";
import type { RatedPokemon } from "./types.ts";

type Dex = Map<number, RatedPokemon>;
export type FullPick = { team: number; id: number; slot: number };
export type FullDraft = {
  seed: number;
  mode: Mode;
  names: string[]; // one per team; yours is team YOU
  order: number[]; // the lottery: teams in pick order, the same every round
  pool: number[]; // the draft class (dex numbers), best first
  rosters: (number | null)[][]; // per team, a dex number per roster spot (SLOTS order)
  picks: FullPick[];
};

export const YOU = 0;
const best = (p: RatedPokemon) => p.ovr[p.best];
export const totalPicks = (fd: FullDraft) => fd.order.length * SLOTS.length;
export const isDone = (fd: FullDraft) => fd.picks.length >= totalPicks(fd);
/** Whose pick it is. */
export const onClock = (fd: FullDraft) => fd.order[fd.picks.length % fd.order.length];
export const lineupOf = (fd: FullDraft, team: number): Lineup => ({ ...emptyLineup(fd.mode), name: fd.names[team], ids: [...fd.rosters[team]] });
const openSpots = (roster: (number | null)[]) => roster.flatMap((id, s) => (id == null ? [s] : []));
/** Who's still on the board, best first. */
export function available(fd: FullDraft, dex: Dex): RatedPokemon[] {
  const gone = new Set(fd.picks.map((p) => p.id));
  return fd.pool.filter((id) => !gone.has(id)).map((id) => dex.get(id)!);
}
/** What a team can spend on its next pick (every open spot has the same budget). */
export const budgetOf = (fd: FullDraft, team: number, dex: Dex) => budgetFor(lineupOf(fd, team), openSpots(fd.rosters[team])[0] ?? 0, dex);

/** A bell-curve number (mean 0, spread 1). */
function gauss(rng: Rng) {
  return Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
}

export function startFull(pool: RatedPokemon[], dex: Dex, mode: Mode, seed: number): FullDraft {
  const rng = makeRng(seed >>> 0);
  // the class: for each place, a rating drawn from the bell curve, and one of the few closest to it not yet in
  const eligible = pool.filter((p) => isEligible(p, mode));
  const size = Math.min(eligible.length, Math.round(FULL.teams * SLOTS.length * FULL.classSize));
  const picked = new Set<number>();
  const cls: RatedPokemon[] = [];
  while (cls.length < size) {
    const target = FULL.mean + FULL.sd * gauss(rng);
    const near = eligible.filter((p) => !picked.has(p.id)).sort((a, b) => Math.abs(best(a) - target) - Math.abs(best(b) - target) || a.id - b.id);
    const p = rng.pick(near.slice(0, 4));
    picked.add(p.id);
    cls.push(p);
  }
  cls.sort((a, b) => best(b) - best(a) || a.id - b.id);
  // the lottery
  const order = Array.from({ length: FULL.teams }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const names = ["YOUR TEAM"];
  while (names.length < FULL.teams) {
    const name = `${rng.pick(PLACES)} ${rng.pick(MASCOTS)}`;
    if (!names.includes(name)) names.push(name);
  }
  const fd: FullDraft = { seed: seed >>> 0, mode, names, order, pool: cls.map((p) => p.id), rosters: order.map(() => SLOTS.map(() => null)), picks: [] };
  return runCpu(fd, dex);
}

const place = (fd: FullDraft, team: number, id: number, slot: number): FullDraft => ({
  ...fd,
  rosters: fd.rosters.map((r, t) => (t === team ? r.map((x, s) => (s === slot ? id : x)) : r)),
  picks: [...fd.picks, { team, id, slot }],
});

/** A CPU team on the clock: the best player left it can afford (rated at its best open spot, give or take a little),
 *  put where they rate highest. */
function cpuPick(fd: FullDraft, dex: Dex): FullDraft {
  const team = onClock(fd), open = openSpots(fd.rosters[team]), budget = budgetOf(fd, team, dex);
  const rng = makeRng((fd.seed ^ Math.imul(fd.picks.length + 1, 0x9e3779b1)) >>> 0);
  const left = available(fd, dex);
  const fits = left.filter((p) => salary(p) <= budget);
  let pick = (fits.length ? fits : left)[0], top = -Infinity;
  for (const p of fits.length ? fits : left) {
    const score = Math.max(...open.map((s) => slotOvr(s, p))) + (rng.next() * 2 - 1) * FULL.cpuNoise;
    if (score > top) (top = score), (pick = p);
  }
  const slot = open.reduce((a, b) => (slotOvr(b, pick) > slotOvr(a, pick) ? b : a));
  return place(fd, team, pick.id, slot);
}

/** Let the CPU teams pick until it's your turn (or the draft's over). */
export function runCpu(fd: FullDraft, dex: Dex): FullDraft {
  while (!isDone(fd) && onClock(fd) !== YOU) fd = cpuPick(fd, dex);
  return fd;
}

/** Your pick: `id` (still on the board, and affordable) on open spot `slot`; then the CPU picks on to your next turn. */
export function youPick(fd: FullDraft, dex: Dex, id: number, slot: number): FullDraft {
  const p = dex.get(id);
  if (!p || isDone(fd) || onClock(fd) !== YOU || fd.rosters[YOU][slot] !== null) return fd;
  if (!available(fd, dex).some((q) => q.id === id) || salary(p) > budgetOf(fd, YOU, dex)) return fd;
  return runCpu(place(fd, YOU, id, slot), dex);
}

/** Every team by rating (chemistry included), best first. */
export const standings = (fd: FullDraft, dex: Dex) =>
  fd.names.map((name, team) => ({ team, name, rating: teamRating(lineupOf(fd, team), dex) ?? 0 })).sort((a, b) => b.rating - a.rating);
