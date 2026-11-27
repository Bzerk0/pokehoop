import type { RatedPokemon } from "../types.ts";
import type { Player } from "./game.ts";

const doubleJump = { key: "doubleJump", name: "DOUBLE JUMP", text: "Jump a second time in midair to reach the ball." } as const;

const byType = {
  normal:   { key: "scrappy",    name: "SCRAPPY",     text: "Uses less energy while on the court." },
  fire:     { key: "heatCheck",  name: "HEAT CHECK",  text: "Catches fire one straight make sooner." },
  water:    { key: "smooth",     name: "SMOOTH",      text: "Gets a wider green zone on the shot meter." },
  grass:    { key: "rooted",     name: "ROOTED",      text: "Reaches farther for rebounds and holds box-outs better." },
  electric: { key: "static",     name: "STATIC",      text: "Runs faster while sprinting." },
  ice:      { key: "iceCold",    name: "ICE COLD",    text: "Shoots better with under 5 seconds on either clock." },
  fighting: { key: "brawler",    name: "BRAWLER",     text: "Feels less pressure on contested layups and dunks." },
  poison:   { key: "toxicD",     name: "TOXIC D",     text: "Wears down the nearest opponent while on defence." },
  ground:   { key: "heavy",      name: "HEAVY",       text: "Holds defenders in screens for longer." },
  flying:   doubleJump,
  psychic:  { key: "foresight",  name: "FORESIGHT",   text: "Picks off passes more often." },
  bug:      { key: "quickHands", name: "QUICK HANDS", text: "Steals the ball more often." },
  rock:     { key: "sturdy",     name: "STURDY",      text: "Loses the ball to steals less often." },
  ghost:    { key: "phase",      name: "PHASE",       text: "Trips defenders more often and for longer on crossovers." },
  dragon:   doubleJump,
  dark:     { key: "sneak",      name: "SNEAK",       text: "Reaches farther on chase-down blocks." },
  steel:    { key: "ironWall",   name: "IRON WALL",   text: "Blocks shots more often." },
  fairy:    { key: "charm",      name: "CHARM",       text: "Can throw alley-oops to teammates with lower Finishing." },
} as const;

/** The stat card and live rules always read the current Pokémon's first type, including after a sub. */
export const abilityOf = (p: RatedPokemon) => byType[p.types[0] as keyof typeof byType];
export type AbilityKey = ReturnType<typeof abilityOf>["key"];
export const has = (pl: Player, key: AbilityKey) => abilityOf(pl.p).key === key;
