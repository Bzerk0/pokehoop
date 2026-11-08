import { describe, expect, it } from "vitest";
import { decimetresToMetres, generationNumber, hectogramsToKg, toPokemonData } from "./convert.ts";

describe("unit conversions", () => {
  it("decimetres → metres", () => {
    expect(decimetresToMetres(4)).toBe(0.4);
    expect(decimetresToMetres(17)).toBe(1.7);
    expect(decimetresToMetres(200)).toBe(20);
  });
  it("hectograms → kg", () => {
    expect(hectogramsToKg(60)).toBe(6);
    expect(hectogramsToKg(4600)).toBe(460);
    expect(hectogramsToKg(1)).toBe(0.1);
  });
  it("generation names → numbers", () => {
    expect(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"].map((r) => generationNumber(`generation-${r}`)))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("toPokemonData", () => {
  it("maps an API species + pokemon", () => {
    const stat = (name: string, base_stat: number) => ({ base_stat, stat: { name } });
    const p = toPokemonData(
      {
        id: 25, name: "pikachu", generation: { name: "generation-i" }, is_legendary: false, is_mythical: false,
        evolution_chain: { url: "https://pokeapi.co/api/v2/evolution-chain/10/" },
        names: [{ name: "ピカチュウ", language: { name: "ja" } }, { name: "Pikachu", language: { name: "en" } }],
        varieties: [],
      },
      {
        id: 25, name: "pikachu", height: 4, weight: 60, sprites: { front_default: "x" },
        types: [{ slot: 1, type: { name: "electric" } }],
        stats: [stat("hp", 35), stat("attack", 55), stat("defense", 40), stat("special-attack", 50),
          stat("special-defense", 50), stat("speed", 90)],
      },
      { path: "/sprites/25.png", w: 30, h: 28 },
    );
    expect(p).toEqual({
      id: 25, name: "Pikachu", slug: "pikachu", generation: 1, chain: 10, types: ["electric"], heightM: 0.4, weightKg: 6,
      stats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 }, isLegendary: false, isMythical: false,
      sprite: "/sprites/25.png", spriteW: 30, spriteH: 28,
    });
  });
});
