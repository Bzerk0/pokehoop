// A team (PLAN.md §7): five starters (PG, SG, SF, PF, C) and three bench seats, a name, two jersey colours and
// a pool mode. Pure: no React, no storage. Tuning numbers live in ratingConfig.ts.
import { chemistry } from "./chemistry.ts";
import {
  ATTR_MAX,
  OVR_MAX,
  OVR_MIN,
  SALARY_CAP,
  SALARY_CURVE,
  SALARY_MAX,
  SALARY_MIN,
  SHOOTER_MIN,
  SHOOTERS_NEEDED,
  SHORT_TEAM_HEIGHT,
  STARTER_WEIGHT,
} from "./ratingConfig.ts";
import type { Rng } from "./rng.ts";
import { POSITIONS, type Position, type RatedPokemon } from "./types.ts";

export type Mode = "classic" | "unlimited";
export const SLOTS = [...POSITIONS, "B1", "B2", "B3"] as const;
export type Slot = (typeof SLOTS)[number];
export const STARTERS = POSITIONS.length;
export const NAME_MAX = 24;

export type Lineup = {
  name: string;
  mode: Mode;
  /** jersey colours, as indexes into the UI palette */
  colors: [number, number];
  /** a dex number per slot (SLOTS order), or null when empty */
  ids: (number | null)[];
};

export const emptyLineup = (mode: Mode = "classic"): Lineup => ({
  name: "MY STARTING 5",
  mode,
  colors: [9, 12],
  ids: SLOTS.map(() => null),
});

export const isEligible = (p: RatedPokemon, mode: Mode) => mode === "unlimited" || (!p.isLegendary && !p.isMythical);

/** The position a slot plays: a starter's own; a bench seat plays wherever the player is best. */
export const slotPosition = (slot: number, p: RatedPokemon): Position => (slot < STARTERS ? POSITIONS[slot] : p.best);
export const slotOvr = (slot: number, p: RatedPokemon) => p.ovr[slotPosition(slot, p)];

/** Salary in $M, from the Pokémon's best OVR: cheap role players, very expensive stars. */
export function salary(p: RatedPokemon): number {
  const t = Math.max(0, (p.ovr[p.best] - OVR_MIN) / (OVR_MAX - OVR_MIN));
  return Math.round(SALARY_MIN + (SALARY_MAX - SALARY_MIN) * t ** SALARY_CURVE);
}

type Dex = Map<number, RatedPokemon>;

/** Everyone's salaries added up. */
export const payroll = (l: Lineup, dex: Dex): number =>
  l.ids.reduce<number>((sum, id) => sum + (id != null && dex.has(id) ? salary(dex.get(id)!) : 0), 0);

/** What's left to spend on `p` in slot `slot` while still keeping the minimum salary for every other empty slot.
 *  (Swapping out the slot's current player frees their salary.) */
export function budgetFor(l: Lineup, slot: number, dex: Dex): number {
  const current = l.ids[slot];
  const others = payroll(l, dex) - (current != null && dex.has(current) ? salary(dex.get(current)!) : 0);
  const otherEmpties = l.ids.filter((id, i) => id == null && i !== slot).length;
  return SALARY_CAP - others - otherEmpties * SALARY_MIN;
}
export const dexOf = (pool: RatedPokemon[]): Dex => new Map(pool.map((p) => [p.id, p]));

const filled = (l: Lineup, dex: Dex) =>
  l.ids.flatMap((id, slot) => (id != null && dex.has(id) ? [{ slot, p: dex.get(id)! }] : []));

/** Team OVR: STARTER_WEIGHT × starters' average + the rest × bench average, over filled slots only
 *  (all starters if the bench is empty). null for an empty team. */
export function teamOvr(l: Lineup, dex: Dex): number | null {
  const r = teamRating(l, dex);
  return r == null ? null : Math.round(r);
}

/** A player's OVR in a slot plus their chemistry boost, never past ATTR_MAX. */
export const boostedOvr = (slot: number, p: RatedPokemon, boost: number) => Math.min(ATTR_MAX, slotOvr(slot, p) + boost);

/** teamOvr before rounding, for finer comparisons (draft grades). Chemistry boosts count. */
export function teamRating(l: Lineup, dex: Dex): number | null {
  const players = filled(l, dex);
  const { boosts } = chemistry(l, dex);
  const avg = (list: typeof players) => list.reduce((s, x) => s + boostedOvr(x.slot, x.p, boosts[x.slot]), 0) / list.length;
  const starters = players.filter((x) => x.slot < STARTERS);
  const bench = players.filter((x) => x.slot >= STARTERS);
  if (!starters.length && !bench.length) return null;
  if (!bench.length) return avg(starters);
  if (!starters.length) return avg(bench);
  return STARTER_WEIGHT * avg(starters) + (1 - STARTER_WEIGHT) * avg(bench);
}

/** Rule breaks: the same Pokémon twice, unknown dex numbers, a legendary/mythical in Classic, or over the cap. */
export function problems(l: Lineup, dex: Dex): string[] {
  const over = payroll(l, dex) - SALARY_CAP;
  const out = problemsBesidesCap(l, dex);
  if (over > 0) out.push(`Over the salary cap by $${over}M`);
  return out;
}

function problemsBesidesCap(l: Lineup, dex: Dex): string[] {
  const out: string[] = [];
  const seen = new Set<number>();
  for (const id of l.ids) {
    if (id == null) continue;
    const p = dex.get(id);
    if (!p) out.push(`Unknown Pokémon #${id}`);
    else if (seen.has(id)) out.push(`${p.name} is on the team twice`);
    else if (!isEligible(p, l.mode)) out.push(`${p.name} isn't allowed in Classic`);
    seen.add(id);
  }
  return out;
}

/** Advice, not rules: too few shooters, or a short team. */
export function warnings(l: Lineup, dex: Dex): string[] {
  const players = filled(l, dex).map((x) => x.p);
  if (!players.length) return [];
  const out: string[] = [];
  const shooters = players.filter((p) => p.attrs.shooting >= SHOOTER_MIN).length;
  if (shooters < SHOOTERS_NEEDED) out.push(`Only ${shooters} player${shooters === 1 ? "" : "s"} with Shooting ${SHOOTER_MIN}+`);
  const height = players.reduce((s, p) => s + p.heightPct, 0) / players.length;
  if (height < SHORT_TEAM_HEIGHT) out.push("Your team is short: expect to lose rebounds");
  return out;
}

/** Fill every empty slot, in order, with the best eligible Pokémon not already on the team that keeps the team
 *  under the cap. It spreads the money: no single pick may take more than twice an even share of what's left. */
export function autoFill(l: Lineup, pool: RatedPokemon[]): Lineup {
  const dex = dexOf(pool);
  let team = { ...l, ids: [...l.ids] };
  l.ids.forEach((id, slot) => {
    if (id != null) return;
    const empties = team.ids.filter((x) => x == null).length;
    const left = SALARY_CAP - payroll(team, dex);
    const allowance = Math.min(budgetFor(team, slot, dex), Math.ceil((2 * left) / empties));
    let best: RatedPokemon | null = null;
    for (const p of pool) {
      if (team.ids.includes(p.id) || !isEligible(p, l.mode) || salary(p) > allowance) continue;
      if (!best || slotOvr(slot, p) > slotOvr(slot, best) || (slotOvr(slot, p) === slotOvr(slot, best) && salary(p) < salary(best))) best = p;
    }
    if (best) team = { ...team, ids: team.ids.map((x, i) => (i === slot ? best!.id : x)) };
  });
  return team;
}

/** A whole new random team of eligible Pokémon that fits under the cap (same name, colours and mode). */
export function randomTeam(l: Lineup, pool: RatedPokemon[], rng: Rng): Lineup {
  const dex = dexOf(pool);
  const eligible = pool.filter((p) => isEligible(p, l.mode));
  let team: Lineup = { ...l, ids: SLOTS.map(() => null) };
  for (let slot = 0; slot < SLOTS.length; slot++) {
    const budget = budgetFor(team, slot, dex);
    const affordable = eligible.filter((p) => salary(p) <= budget && !team.ids.includes(p.id));
    const p = rng.pick(affordable);
    team = { ...team, ids: team.ids.map((x, i) => (i === slot ? p.id : x)) };
  }
  return team;
}

/** Changing mode drops anyone the new mode doesn't allow. */
export const withMode = (l: Lineup, mode: Mode, dex: Dex): Lineup => ({
  ...l,
  mode,
  ids: l.ids.map((id) => (id != null && dex.has(id) && isEligible(dex.get(id)!, mode) ? id : null)),
});

// Share codes: version, mode, two colours, eight 2-byte dex numbers (0 = empty), then the name in UTF-8,
// as URL-safe base64 with no padding.
const VERSION = 1;

export function encodeLineup(l: Lineup): string {
  const name = new TextEncoder().encode(l.name.slice(0, NAME_MAX));
  const bytes = new Uint8Array(4 + SLOTS.length * 2 + name.length);
  bytes.set([VERSION, l.mode === "unlimited" ? 1 : 0, l.colors[0], l.colors[1]]);
  l.ids.forEach((id, i) => {
    bytes[4 + i * 2] = (id ?? 0) >> 8;
    bytes[5 + i * 2] = (id ?? 0) & 0xff;
  });
  bytes.set(name, 4 + SLOTS.length * 2);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The lineup in a share code, or null if the code is damaged. Doesn't check the Pokémon: use problems(). */
export function decodeLineup(code: string, colorCount: number): Lineup | null {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const head = 4 + SLOTS.length * 2;
    if (bytes.length < head || bytes[0] !== VERSION || bytes[1] > 1) return null;
    if (bytes[2] >= colorCount || bytes[3] >= colorCount) return null;
    const ids = SLOTS.map((_, i) => (bytes[4 + i * 2] << 8) | bytes[5 + i * 2]).map((id) => id || null);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(head)).slice(0, NAME_MAX);
    return { name, mode: bytes[1] ? "unlimited" : "classic", colors: [bytes[2], bytes[3]], ids };
  } catch {
    return null;
  }
}
