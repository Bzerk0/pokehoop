import { useEffect, useState } from "react";
import { rateAll } from "../core/ratings.ts";
import type { RatedPokemon } from "../core/types.ts";

// The site's own copy of the data (built by `npm run data`); the running site never calls PokéAPI.
let cache: Promise<RatedPokemon[]> | null = null;

export function loadRated(): Promise<RatedPokemon[]> {
  cache ??= fetch("/data/pokemon.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Couldn't load Pokémon data (HTTP ${r.status})`);
      return r.json();
    })
    .then((pool) => rateAll(pool));
  cache.catch(() => (cache = null)); // let a later visit retry
  return cache;
}

export function useRated() {
  const [state, setState] = useState<{ data?: RatedPokemon[]; error?: string }>({});
  useEffect(() => {
    let live = true;
    loadRated().then(
      (data) => live && setState({ data }),
      (e: Error) => live && setState({ error: e.message }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
