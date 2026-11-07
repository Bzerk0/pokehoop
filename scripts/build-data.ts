// PokéAPI → public/data/pokemon.json + public/sprites/<id>.png (cropped to visible pixels).
// Build time only. Every response is cached in .cache/, so a re-run only fetches what's missing.
// Usage: npm run data
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { toPokemonData, type ApiPokemon, type ApiSpecies } from "./convert.ts";
import type { PokemonData } from "../src/core/types.ts";

const API = "https://pokeapi.co/api/v2";
const CACHE = ".cache";
const OUT_DATA = "public/data/pokemon.json";
const OUT_SPRITES = "public/sprites";
const WORKERS = 3; // polite: a few requests at a time
const PAUSE_MS = 100; // wait after each network request

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const exists = (p: string) => access(p).then(() => true, () => false);

async function cached(url: string, file: string): Promise<Buffer> {
  if (await exists(file)) return readFile(file);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "starting5pokemon build script" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(file, buf);
      await sleep(PAUSE_MS);
      return buf;
    } catch (e) {
      if (attempt >= 4) throw new Error(`${url}: ${(e as Error).message}`);
      await sleep(1000 * attempt);
    }
  }
}

const getJson = async <T>(path: string): Promise<T> =>
  JSON.parse((await cached(`${API}/${path}`, join(CACHE, "api", path.replace(/[/?=&]/g, "_") + ".json"))).toString());

/** Crop to the bounding box of non-transparent pixels. */
async function cropSprite(png: Buffer, outFile: string) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`${outFile}: sprite is fully transparent`);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  await sharp(png).extract({ left: minX, top: minY, width: w, height: h }).png().toFile(outFile);
  return { w, h };
}

async function buildOne(id: number): Promise<PokemonData> {
  const species = await getJson<ApiSpecies>(`pokemon-species/${id}`);
  const variety = species.varieties.find((v) => v.is_default) ?? species.varieties[0];
  const pokemon = await getJson<ApiPokemon>(`pokemon/${variety.pokemon.name}`);
  const url = pokemon.sprites.front_default;
  if (!url) throw new Error(`${species.name}: no front_default sprite`);
  const png = await cached(url, join(CACHE, "sprites", `${id}.png`));
  const { w, h } = await cropSprite(png, join(OUT_SPRITES, `${id}.png`));
  return toPokemonData(species, pokemon, { path: `/sprites/${id}.png`, w, h });
}

async function main() {
  for (const dir of [join(CACHE, "api"), join(CACHE, "sprites"), OUT_SPRITES, "public/data"]) {
    await mkdir(dir, { recursive: true });
  }
  const { count } = await getJson<{ count: number }>("pokemon-species?limit=1");
  console.log(`${count} species`);

  const out: PokemonData[] = new Array(count);
  const failures: string[] = [];
  let next = 1, done = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next <= count) {
        const id = next++;
        try {
          out[id - 1] = await buildOne(id);
        } catch (e) {
          failures.push(`#${id}: ${(e as Error).message}`);
        }
        if (++done % 100 === 0) console.log(`${done}/${count}`);
      }
    }),
  );

  if (failures.length) {
    console.error(`${failures.length} failed:\n${failures.join("\n")}`);
    console.error("Nothing written. Re-run to retry (finished downloads are cached).");
    process.exit(1);
  }
  await writeFile(OUT_DATA, JSON.stringify(out));
  console.log(`Wrote ${out.length} Pokémon to ${OUT_DATA}`);
}

main();
