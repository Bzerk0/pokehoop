// The dev menu's settings: change the live game's tuning numbers (LIVE in ratingConfig.ts) while testing. Changes
// apply at once (the engine reads LIVE every step; court size on the next game) and are saved in this browser, so a
// reload keeps them. Only the numbers that differ from the defaults are saved, so "reset" is just forgetting them.
import { LIVE } from "../core/ratingConfig.ts";

/** A setting's path in LIVE: "quickTap", or one level down like "timing.perfect". */
export type DevKey = string;
type Bag = Record<string, unknown>;

const STORE = "s5p-dev-v1";

/** Every number in LIVE (one level of nesting), with its default value as the game shipped. */
export const DEV_DEFAULTS: Record<DevKey, number> = (() => {
  const out: Record<DevKey, number> = {};
  for (const [k, v] of Object.entries(LIVE as Bag)) {
    if (typeof v === "number") out[k] = v;
    else if (v && typeof v === "object") for (const [k2, v2] of Object.entries(v as Bag)) if (typeof v2 === "number") out[`${k}.${k2}`] = v2;
  }
  return out;
})();

export function getDev(key: DevKey): number {
  const [a, b] = key.split(".");
  return (b ? ((LIVE as Bag)[a] as Bag)[b] : (LIVE as Bag)[a]) as number;
}

function put(key: DevKey, value: number) {
  const [a, b] = key.split(".");
  if (b) ((LIVE as Bag)[a] as Bag)[b] = value;
  else (LIVE as Bag)[a] = value;
}

function save() {
  try {
    const changed = Object.fromEntries(Object.keys(DEV_DEFAULTS).filter((k) => getDev(k) !== DEV_DEFAULTS[k]).map((k) => [k, getDev(k)]));
    localStorage.setItem(STORE, JSON.stringify(changed));
  } catch {
    // storage blocked: the change still holds until the page reloads
  }
}

/** Change a setting (now, and saved for next time). */
export function setDev(key: DevKey, value: number) {
  if (!(key in DEV_DEFAULTS) || !Number.isFinite(value)) return;
  put(key, value);
  save();
}

/** Put one setting (or all of them) back to the default. */
export function resetDev(key?: DevKey) {
  for (const k of key ? [key] : Object.keys(DEV_DEFAULTS)) put(k, DEV_DEFAULTS[k]);
  save();
}

/** Load the saved changes into LIVE (call once, before a game starts). */
export function applyDevSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, unknown>;
    for (const [k, v] of Object.entries(saved)) if (k in DEV_DEFAULTS && typeof v === "number" && Number.isFinite(v)) put(k, v);
  } catch {
    // nothing saved, or junk: the defaults
  }
}

/** How many settings are changed from the defaults (shown on the menu button). */
export const devChanged = () => Object.keys(DEV_DEFAULTS).filter((k) => getDev(k) !== DEV_DEFAULTS[k]).length;

/** The settings worth reaching for, in groups, with what each one does. Anything else in LIVE is under "EVERYTHING ELSE". */
export const DEV_GROUPS: { title: string; items: [DevKey, string][] }[] = [
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
      ["sprintOnL", "TEST: 1 = L sprints, double-tap L crossover"],
      ["doubleTap", "seconds: two L taps this close = double tap"],
      ["sprintTap", "seconds: a sprint tap this short = crossover"],
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
];
