// The ARCADE DRAFT: 8 rounds. Each round is a slot-machine pull: ARCADE.reels Pokémon, each from a tier drawn by
// rarity (ARCADE.weights), with a STAR all but guaranteed (ARCADE.starChance; always on the first pull), all affordable
// under the salary cap with room left to finish the team. Pick one and place it on any open roster spot; reroll a
// round's offers a limited number of times. Seeded, so the same seed and the same picks always deal the same offers.
// Pure: no React, no storage. Numbers live in ratingConfig.ts.
import { chemistry, type Link } from "./chemistry.ts";
import { ARCADE, DRAFT_DEPTH, DRAFT_GRADES, DRAFT_REROLLS, DRAFT_TIERS } from "./ratingConfig.ts";
import { budgetFor, emptyLineup, isEligible, salary, SLOTS, slotOvr, STARTERS, type Lineup, type Mode } from "./lineup.ts";
import { makeRng } from "./rng.ts";
import type { RatedPokemon } from "./types.ts";

export type Tier = (typeof DRAFT_TIERS)[number]["name"];
export type Offer = { id: number; tier: Tier };
export type Draft = {
  seed: number;
  mode: Mode;
  daily: boolean;
  /** picks made so far; SLOTS.length once the draft is over */
  round: number;
  /** a dex number per roster slot (SLOTS order), or null while that spot is open */
  ids: (number | null)[];
  offers: Offer[];
  rerolls: number;
  /** how many deals so far: every deal gets its own random stream */
  deals: number;
};

type Dex = Map<number, RatedPokemon>;

export const tierOf = (p: RatedPokemon): Tier => DRAFT_TIERS.find((t) => p.ovr[p.best] >= t.min)!.name;
export const isOver = (d: Draft) => d.round >= SLOTS.length;
export const toLineup = (d: Draft): Lineup => ({ ...emptyLineup(d.mode), ids: [...d.ids] });
export const openSlots = (d: Draft) => d.ids.flatMap((id, slot) => (id == null ? [slot] : []));

/** The open spot where `p` rates highest (a starting spot wins a tie with the bench). */
export const bestSpot = (d: Draft, p: RatedPokemon) =>
  openSlots(d).reduce((best, slot) => (slotOvr(slot, p) > slotOvr(best, p) ? slot : best));

/** Today's date as a seed (YYYYMMDD, local time): everyone drafting today starts from the same offers. */
export const dailySeed = (date = new Date()) => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

const stream = (d: Draft) => makeRng((d.seed ^ Math.imul(d.round + 1, 0x9e3779b1) ^ Math.imul(d.deals + 1, 0x85ebca6b)) >>> 0);

/** One slot-machine pull: each reel lands on a tier drawn by rarity (among tiers with anyone free and affordable),
 *  then a random one of that tier's DRAFT_DEPTH best. No STAR? Then with ARCADE.starChance (ARCADE.firstStar on the
 *  first pull of the draft) one reel is swapped for an affordable STAR. Every open spot has the same budget, so the
 *  first one stands for all. */
function deal(d: Draft, pool: RatedPokemon[], dex: Dex): Offer[] {
  const rng = stream(d);
  const budget = budgetFor(toLineup(d), openSlots(d)[0], dex);
  const offers: Offer[] = [];
  const free = (p: RatedPokemon) =>
    isEligible(p, d.mode) && salary(p) <= budget && !d.ids.includes(p.id) && !offers.some((o) => o.id === p.id);
  const byBest = (a: RatedPokemon, b: RatedPokemon) => b.ovr[b.best] - a.ovr[a.best] || a.id - b.id;
  // each tier's options, sorted once per pull; a Pokémon that lands is taken out of its list
  const free0 = pool.filter(free);
  const tiers = DRAFT_TIERS.map((t) => ({
    tier: t.name as Tier,
    options: free0.filter((p) => tierOf(p) === t.name).sort(byBest).slice(0, DRAFT_DEPTH),
    w: Math.max(0, ARCADE.weights[t.name]),
  }));

  for (let reel = 0; reel < ARCADE.reels; reel++) {
    const open = tiers.filter((t) => t.options.length && t.w > 0);
    if (!open.length) break;
    let roll = rng.next() * open.reduce((s, t) => s + t.w, 0);
    const hit = open.find((t) => (roll -= t.w) < 0) ?? open[open.length - 1];
    const id = rng.pick(hit.options).id;
    offers.push({ id, tier: hit.tier });
    hit.options = hit.options.filter((p) => p.id !== id);
  }
  const stars = tiers[0].options; // STAR, minus any that already landed
  const chance = d.round === 0 && d.deals === 0 ? ARCADE.firstStar : ARCADE.starChance;
  if (offers.length && !offers.some((o) => o.tier === "STAR") && stars.length && rng.next() < chance)
    offers[rng.int(offers.length)] = { id: rng.pick(stars).id, tier: "STAR" };
  return offers;
}

export function startDraft(pool: RatedPokemon[], dex: Dex, mode: Mode, seed: number, daily = false): Draft {
  const d: Draft = { seed: seed >>> 0, mode, daily, round: 0, ids: SLOTS.map(() => null), offers: [], rerolls: DRAFT_REROLLS, deals: 0 };
  return { ...d, offers: deal(d, pool, dex), deals: 1 };
}

/** Put one of this round's offers on an open spot; the next round is dealt straight away. */
export function pickOffer(d: Draft, pool: RatedPokemon[], dex: Dex, id: number, slot: number): Draft {
  if (isOver(d) || !d.offers.some((o) => o.id === id) || d.ids[slot] !== null) return d;
  const next: Draft = { ...d, ids: d.ids.map((x, i) => (i === slot ? id : x)), round: d.round + 1, offers: [] };
  if (isOver(next)) return next;
  return { ...next, offers: deal(next, pool, dex), deals: d.deals + 1 };
}

/** Swap this round's offers for a fresh deal, if a reroll is left. */
export function reroll(d: Draft, pool: RatedPokemon[], dex: Dex): Draft {
  if (isOver(d) || d.rerolls <= 0) return d;
  const next = { ...d, rerolls: d.rerolls - 1 };
  return { ...next, offers: deal(next, pool, dex), deals: d.deals + 1 };
}

/** The chemistry links `id` would join if placed at `slot` (its best open spot by default), and its boost. */
export function chemPreview(d: Draft, id: number, dex: Dex, slot = bestSpot(d, dex.get(id)!)): { links: Link[]; boost: number } {
  const { links, boosts } = chemistry({ ...toLineup(d), ids: d.ids.map((x, i) => (i === slot ? id : x)) }, dex);
  return { links: links.filter((k) => k.slots.includes(slot)), boost: boosts[slot] };
}

/** What the crowd shouts when you put `id` at `slot`. */
export function pickCall(d: Draft, id: number, slot: number, dex: Dex): string {
  const offered = d.offers.map((o) => dex.get(o.id)!);
  const p = dex.get(id)!;
  const best = (x: RatedPokemon) => x.ovr[x.best];
  const value = (x: RatedPokemon) => best(x) / salary(x);
  if (tierOf(p) === "STAR") return "FRANCHISE PLAYER!";
  if (chemPreview(d, id, dex, slot).boost > 0) return "CHEMISTRY!";
  if (slot < STARTERS && slotOvr(slot, p) < best(p) - 10) return "OUT OF POSITION?";
  if (offered.every((x) => value(p) >= value(x)) && best(p) >= 70) return "STEAL!";
  if (offered.every((x) => best(p) >= best(x))) return "BEST AVAILABLE";
  return "SOLID PICK";
}

/** The letter grade for a finished draft's unrounded team rating (lineup.ts teamRating, chemistry included). */
export const draftGrade = (rating: number) => DRAFT_GRADES.find(([, min]) => rating >= min)![0];

/** A stored draft, checked: returns it if it's whole and consistent with this pool, else null. */
export function checkDraft(x: unknown, dex: Dex): Draft | null {
  const d = x as Draft;
  if (!d || typeof d !== "object") return null;
  const picked = Array.isArray(d.ids) ? d.ids.filter((id) => id !== null) : [];
  const ok =
    Number.isInteger(d.seed) && (d.mode === "classic" || d.mode === "unlimited") && typeof d.daily === "boolean" &&
    Number.isInteger(d.round) && d.round >= 0 && d.round <= SLOTS.length &&
    Array.isArray(d.ids) && d.ids.length === SLOTS.length &&
    picked.length === d.round && picked.every((id) => typeof id === "number" && dex.has(id)) && new Set(picked).size === picked.length &&
    Array.isArray(d.offers) && d.offers.every((o) => dex.has(o?.id)) && (isOver(d) || d.offers.length > 0) &&
    Number.isInteger(d.rerolls) && d.rerolls >= 0 && d.rerolls <= DRAFT_REROLLS && Number.isInteger(d.deals);
  return ok ? d : null;
}
