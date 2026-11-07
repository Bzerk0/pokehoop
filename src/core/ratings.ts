// Ratings (PLAN.md §6): stats → pool percentiles → attributes (+ type bonuses) → position OVRs → best position.
// Pure: no React, no Phaser. Numbers live in ratingConfig.ts; hand fixes in overrides.json.
import {
  ATTR_MAX,
  ATTRIBUTE_WEIGHTS,
  OVR_MAX,
  OVR_MIN,
  POSITION_WEIGHTS,
  TYPE_BONUS,
  type RatingInput,
} from "./ratingConfig.ts";
import {
  ATTRIBUTES,
  POSITIONS,
  type Attribute,
  type Attributes,
  type PokemonData,
  type Position,
  type RatedPokemon,
} from "./types.ts";
import defaultOverrides from "./overrides.json";

export type Overrides = Record<string, { attrs?: Partial<Attributes>; best?: Position }>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Percentile (0–100) of each value within its own list; ties share the midpoint. */
export function percentiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const bound = (v: number, strict: boolean) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (strict ? sorted[mid] < v : sorted[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return values.map((v) => {
    const below = bound(v, true);
    const equal = bound(v, false) - below;
    return ((below + equal / 2) / values.length) * 100;
  });
}

export function rateAll(pool: PokemonData[], overrides: Overrides = defaultOverrides as Overrides): RatedPokemon[] {
  // log(height) and log(weight) rank the same as height and weight, so their percentiles are taken directly.
  const column = (get: (p: PokemonData) => number) => percentiles(pool.map(get));
  const wt = column((p) => p.weightKg);
  const cols: Record<RatingInput, number[]> = {
    hp: column((p) => p.stats.hp),
    atk: column((p) => p.stats.atk),
    def: column((p) => p.stats.def),
    spa: column((p) => p.stats.spa),
    spd: column((p) => p.stats.spd),
    spe: column((p) => p.stats.spe),
    ht: column((p) => p.heightM),
    wt,
    light: wt.map((w) => 100 - w),
  };

  const attrs: Attributes[] = pool.map((p, i) => {
    const a = {} as Attributes;
    for (const attr of ATTRIBUTES) {
      let v = 0;
      for (const [input, w] of Object.entries(ATTRIBUTE_WEIGHTS[attr])) v += w! * cols[input as RatingInput][i];
      for (const type of p.types) v += (TYPE_BONUS[type]?.[attr] ?? 0) + (TYPE_BONUS[type]?.all ?? 0);
      a[attr] = Math.round(clamp(v, 0, ATTR_MAX));
    }
    const fix = overrides[p.slug]?.attrs;
    if (fix) for (const [k, v] of Object.entries(fix)) a[k as Attribute] = clamp(Math.round(v!), 0, ATTR_MAX);
    return a;
  });

  // raw position scores, then rescale each position across the pool to OVR_MIN..OVR_MAX
  const ovrs = pool.map(() => ({}) as Record<Position, number>);
  for (const pos of POSITIONS) {
    const raw = attrs.map((a) => {
      let v = 0;
      for (const [attr, w] of Object.entries(POSITION_WEIGHTS[pos])) v += w! * a[attr as Attribute];
      return v;
    });
    const lo = Math.min(...raw), hi = Math.max(...raw);
    raw.forEach((v, i) => (ovrs[i][pos] = Math.round(OVR_MIN + ((v - lo) / (hi - lo || 1)) * (OVR_MAX - OVR_MIN))));
  }

  return pool.map((p, i) => {
    const ovr = ovrs[i];
    const best = overrides[p.slug]?.best ?? POSITIONS.reduce((b, pos) => (ovr[pos] > ovr[b] ? pos : b));
    return { ...p, heightPct: cols.ht[i], attrs: attrs[i], ovr, best };
  });
}
