// Guards for the core rules in CLAUDE.md, and the Phase 1 "done when": the generated data is complete.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PokemonData } from "./types.ts";

describe("src/core stays pure", () => {
  const files = readdirSync("src/core", { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f));
  it.each(files)("%s imports no React/Phaser and uses no Math.random", (f) => {
    const src = readFileSync(join("src/core", f), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/from\s+["'](react|react-dom|phaser)/);
    if (!f.endsWith(".test.ts")) expect(src).not.toMatch(/Math\.random/);
  });
});

describe("public/data/pokemon.json", () => {
  const pool: PokemonData[] = JSON.parse(readFileSync("public/data/pokemon.json", "utf8"));
  const statKeys = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

  it("has every species once, in dex order, then the Alolan forms", () => {
    const species = pool.filter((p) => p.id < 10000), forms = pool.slice(species.length);
    expect(species.length).toBeGreaterThanOrEqual(1025);
    species.forEach((p, i) => expect(p.id).toBe(i + 1));
    expect(forms.length).toBeGreaterThanOrEqual(18);
    expect(forms.every((p) => p.id > 10000 && p.name.startsWith("Alolan ") && p.slug.endsWith("-alola"))).toBe(true);
    expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length);
    expect(pool.find((p) => p.slug === "raichu-alola")).toMatchObject({ types: ["electric", "psychic"], generation: 7 });
  });
  it("has no missing fields and every sprite file exists", () => {
    for (const p of pool) {
      const ok =
        p.name && p.slug && p.generation >= 1 && p.chain >= 1 && p.types.length >= 1 && p.heightM > 0 && p.weightKg > 0 &&
        statKeys.every((k) => p.stats[k] > 0) && typeof p.isLegendary === "boolean" &&
        typeof p.isMythical === "boolean" && p.spriteW > 0 && p.spriteH > 0 && existsSync(join("public", p.sprite));
      expect(ok, `#${p.id} ${p.slug}`).toBeTruthy();
    }
  });
  it("spot checks: Pikachu", () => {
    const p = pool[24];
    expect(p).toMatchObject({ name: "Pikachu", types: ["electric"], heightM: 0.4, weightKg: 6, generation: 1 });
  });
});
