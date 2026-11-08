// The dev menus' settings: change tuning numbers (the live game's LIVE, the arcade draft's ARCADE) while testing. Changes
// apply at once (the engine reads LIVE every step; court size on the next game) and are saved in this browser, so a
// reload keeps them. Only the numbers that differ from the defaults are saved, so "reset" is just forgetting them.
import { ARCADE, LIVE } from "../core/ratingConfig.ts";

/** A setting's path in its settings object: "quickTap", or one level down like "timing.perfect". */
export type DevKey = string;
type Bag = Record<string, unknown>;
export type DevGroups = { title: string; items: [DevKey, string][] }[];

/** A dev menu over one settings object (`target`, edited in place), saved in this browser under `store`. */
export function makeDev(target: object, store: string, groups: DevGroups) {
  const bag = target as Bag;
  /** Every number in it (one level of nesting), with its default value as the game shipped. */
  const defaults: Record<DevKey, number> = {};
  for (const [k, v] of Object.entries(bag)) {
    if (typeof v === "number") defaults[k] = v;
    else if (v && typeof v === "object") for (const [k2, v2] of Object.entries(v as Bag)) if (typeof v2 === "number") defaults[`${k}.${k2}`] = v2;
  }
  const get = (key: DevKey): number => {
    const [a, b] = key.split(".");
    return (b ? (bag[a] as Bag)[b] : bag[a]) as number;
  };
  const put = (key: DevKey, value: number) => {
    const [a, b] = key.split(".");
    if (b) (bag[a] as Bag)[b] = value;
    else bag[a] = value;
  };
  const changedKeys = () => Object.keys(defaults).filter((k) => get(k) !== defaults[k]);
  const save = () => {
    try {
      localStorage.setItem(store, JSON.stringify(Object.fromEntries(changedKeys().map((k) => [k, get(k)]))));
    } catch {
      // storage blocked: the change still holds until the page reloads
    }
  };
  return {
    defaults,
    groups,
    get,
    /** Change a setting (now, and saved for next time). */
    set(key: DevKey, value: number) {
      if (!(key in defaults) || !Number.isFinite(value)) return;
      put(key, value);
      save();
    },
    /** Put one setting (or all of them) back to the default. */
    reset(key?: DevKey) {
      for (const k of key ? [key] : Object.keys(defaults)) put(k, defaults[k]);
      save();
    },
    /** Load the saved changes (call once, before they're needed). */
    apply() {
      try {
        const saved = JSON.parse(localStorage.getItem(store) ?? "{}") as Record<string, unknown>;
        for (const [k, v] of Object.entries(saved)) if (k in defaults && typeof v === "number" && Number.isFinite(v)) put(k, v);
      } catch {
        // nothing saved, or junk: the defaults
      }
    },
    /** How many settings are changed from the defaults (shown on the menu button). */
    changed: () => changedKeys().length,
  };
}
export type Dev = ReturnType<typeof makeDev>;

/** The settings worth reaching for, in groups, with what each one does. Anything else in LIVE is under "EVERYTHING ELSE". */
export const DEV_GROUPS: DevGroups = [
  {
    title: "QUICK SHOT",
    items: [
      ["quickTap", "seconds: let go faster than this = quick shot"],
      ["quickClose", "make chance added right at the rim"],
      ["quickCloseTo", "metres: the rim bonus fades out by here"],
      ["quickSlope", "make chance lost per metre past 1.5 m"],
      ["quickMax", "most a quick shot can lose"],
    ],
  },
  {
    title: "SHOOTING",
    items: [
      ["meterTime", "seconds to fill the meter to the line"],
      ["windowMin", "green zone half-width at rating 0"],
      ["windowMax", "green zone half-width at rating 99"],
      ["perfectShare", "share of the green zone that's PERFECT"],
      ["timing.perfect", "make chance added for PERFECT"],
      ["timing.good", "make chance added for GOOD"],
      ["timing.miss", "make chance added for a miss"],
      ["ratingSlope", "make chance per rating point over 60"],
      ["contestRange", "metres: a defender this close contests"],
      ["contestPenalty", "make chance lost to a full contest"],
      ["airballBelow", "let go this many zones early: air ball"],
      ["dunkRange", "metres: turbo + shoot this close dunks"],
      ["longFrom", "metres: long-range falloff starts here"],
      ["longFallMin", "metres to fall to a third, weakest"],
      ["longFallMax", "metres to fall to a third, best"],
      ["longPower", "how steep weak-to-best is (Shoot+Str)"],
      ["fireWindow", "× green zone when ON FIRE"],
    ],
  },
  {
    title: "BLOCKS",
    items: [
      ["blockRange", "metres: hand to ball to block"],
      ["blockWindow", "seconds after release a shot can be blocked"],
      ["blockBase", "block chance at even ratings"],
      ["blockSlope", "block chance per Interior D point"],
      ["blockNudge", "m/s: your block jump drifts to the shot"],
      ["nudgeRange", "metres: drift only if the shot's this near"],
      ["chaseRange", "metres: reach on a chase-down"],
      ["chaseSpeed", "m/s: speed needed for a chase-down"],
      ["chaseBonus", "block chance added on a chase-down"],
    ],
  },
  {
    title: "STEALS & PASSING",
    items: [
      ["stealRange", "metres: reach for a steal"],
      ["stealBase", "steal chance at even ratings"],
      ["stealSlope", "steal chance per Perimeter D point"],
      ["stumble", "seconds frozen after a missed steal"],
      ["passMin", "m/s pass speed at Passing 0"],
      ["passMax", "m/s pass speed at Passing 99"],
      ["interceptRange", "metres: a defender this near a pass can pick it"],
      ["interceptBase", "pick-off chance at even ratings"],
      ["catchRange", "metres: the receiver catches within this"],
    ],
  },
  {
    title: "MOVING",
    items: [
      ["speedMin", "m/s top speed at Speed 0"],
      ["speedMax", "m/s top speed at Speed 99"],
      ["accel", "m/s² how snappy turning and stopping is"],
      ["turboBoost", "× speed on turbo"],
      ["turboDrain", "turbo tank used per second"],
      ["turboRegen", "turbo tank back per second"],
      ["crossBoost", "× speed on a crossover"],
      ["crossCool", "seconds between crossovers"],
      ["gravity", "m/s² how fast jumps come down"],
      ["doubleJump", "Flying/Dragon second jump × the first"],
      ["doubleSteer", "× top speed: double jump turns you this fast"],
      ["doubleTap", "seconds: two sprint taps this close = crossover / steal"],
      ["stepBackBoost", "× burst on a step-back"],
    ],
  },
  {
    title: "GAME",
    items: [
      ["shotClock", "seconds on the shot clock"],
      ["courtScale", "× a real court's size (applies on RESTART)"],
      ["drain", "energy lost per second on court"],
      ["sprintDrain", "× energy lost while sprinting"],
      ["recover", "energy back per second on the bench"],
      ["fireAfter", "straight makes to catch fire"],
      ["menuSlow", "game speed while the Q menu is open"],
    ],
  },
  {
    title: "REPLAYS",
    items: [
      ["replays", "1 = instant replays on, 0 = off"],
      ["liveCine", "1 = live cuts: dunks, oops, blocks, corner 3s"],
      ["cineGap", "game seconds between live cuts"],
      ["replayMin", "hype a play needs for an instant replay"],
      ["replayGap", "game seconds between instant replays"],
      ["replaySlow", "slow-motion speed at the big moment"],
      ["replaySlowSpan", "seconds of full slow-mo either side"],
      ["topPlays", "plays in the end-of-game reel"],
      ["replayHype.dunk", "hype: slam dunk"],
      ["replayHype.stepback", "hype: step-back three"],
      ["replayHype.ankles", "hype: ankle breaker"],
      ["replayHype.block", "hype: block"],
      ["replayHype.chase", "hype: chase-down block"],
      ["replayHype.buzzer", "hype added for a buzzer-beater"],
    ],
  },
  {
    title: "LIVE CINE SHOTS",
    items: [
      ["cineShots.dunk", "1 = cut live to dunks"],
      ["cineShots.special", "1 = special dunks (360, windmill...)"],
      ["cineShots.oop", "1 = alley-oops (from the catch)"],
      ["cineShots.block", "1 = blocks"],
      ["cineShots.corner", "1 = corner threes"],
      ["cineShots.eurostep", "1 = eurosteps"],
      ["cineShots.floater", "1 = floaters"],
    ],
  },
];

/** The live game's dev menu (LIVE). */
export const liveDev = makeDev(LIVE, "s5p-dev-v1", DEV_GROUPS);
export const { defaults: DEV_DEFAULTS, get: getDev, set: setDev, reset: resetDev, apply: applyDevSettings, changed: devChanged } = liveDev;

/** The arcade draft's dev menu (ARCADE): the slot machine's odds. */
export const draftDev = makeDev(ARCADE, "s5p-dev-draft-v1", [
  {
    title: "SLOT MACHINE",
    items: [
      ["reels", "Pokémon per pull"],
      ["weights.STAR", "how often a reel lands STAR (vs the others)"],
      ["weights.STARTER", "how often a reel lands STARTER"],
      ["weights.ROLE", "how often a reel lands ROLE"],
      ["weights.SLEEPER", "how often a reel lands SLEEPER"],
      ["starChance", "chance a pull with no STAR gets one"],
      ["firstStar", "the same for the draft's first pull"],
    ],
  },
  {
    title: "PRICES (EVERY DRAFT)",
    items: [
      ["price.vary", "± share a Pokémon's price can stray (0.12 = 12%)"],
      ["price.perDraft", "1 = new price tweaks every draft (saved teams may go over the cap)"],
      ["price.seed", "which set of tweaks is in use"],
    ],
  },
]);
