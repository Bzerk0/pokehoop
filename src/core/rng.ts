// Seeded random numbers (mulberry32). Core code uses this, never Math.random, so a seed always gives the same result.
export type Rng = {
  /** a number in [0, 1) */
  next: () => number;
  /** a whole number in [0, n) */
  int: (n: number) => number;
  /** a random item from a non-empty list */
  pick: <T>(list: readonly T[]) => T;
};

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { next, int, pick: (list) => list[int(list.length)] };
}
