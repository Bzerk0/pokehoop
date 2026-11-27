import { beforeEach, describe, expect, it } from "vitest";
import { BEST_MAX, loadBest, recordBest, type BestDraft } from "./storage.ts";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});
const row = (n: number, rating = 70): BestDraft => ({ key: `k${n}`, rating, grade: "C", ovr: 70, name: "T", at: n, daily: false, mode: "classic", kind: "ARCADE" });

describe("best drafts board", () => {
  it("keeps the best first, no draft twice, and only the top few", () => {
    recordBest(row(1, 60));
    recordBest(row(2, 80));
    recordBest(row(2, 80)); // the same draft again
    expect(loadBest().map((b) => b.key)).toEqual(["k2", "k1"]);
    for (let i = 3; i < 20; i++) recordBest(row(i, 50 + i));
    expect(loadBest()).toHaveLength(BEST_MAX);
    expect(loadBest()[0].rating).toBe(80);
  });
});
