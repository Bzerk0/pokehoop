// Key remapping (PLAN.md Phase 9): which key does what in the live game, saved in this browser. The arrow keys
// (movement), Space (shoot) and both Shifts (turbo) always work too, so nobody can lock themselves out. Two moves
// have no key of their own: a double tap of sprint is the crossover (with the ball) or a steal, and holding left and
// right together sets a screen.

export const ACTIONS = ["up", "down", "left", "right", "turbo", "shoot", "pass", "plays", "music"] as const;
export type Action = (typeof ACTIONS)[number];
export type KeyMap = Record<Action, string>; // action → KeyboardEvent.code

export const DEFAULT_KEYS: KeyMap = {
  up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", turbo: "KeyL", shoot: "KeyK", pass: "KeyJ",
  plays: "KeyQ", music: "KeyM",
};

/** The keys that always work as well, whatever the map says. */
export const BACKUP: Partial<Record<Action, string[]>> = {
  up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"], turbo: ["ShiftLeft", "ShiftRight"], shoot: ["Space"],
};

/** What each action is called on the controls screen. */
export const ACTION_NAME: Record<Action, string> = {
  up: "MOVE UP", down: "MOVE DOWN", left: "MOVE LEFT", right: "MOVE RIGHT", turbo: "TURBO", shoot: "SHOOT / BLOCK",
  pass: "PASS / SWITCH", plays: "PLAYS / DEFENCE", music: "MUSIC",
};

/** Keys you can't bind: Escape pauses, Enter starts and picks, 1–5 pass to a teammate. */
export const RESERVED = new Set(["Escape", "Enter", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5"]);

const STORE = "s5p-keys-v2";
const OLD_STORE = "s5p-keys-v1"; // turbo on Shift and a crossover key: those two give way to the new defaults

export function loadKeys(): KeyMap {
  try {
    const now = localStorage.getItem(STORE);
    const saved = JSON.parse(now ?? localStorage.getItem(OLD_STORE) ?? "{}") as Partial<KeyMap>;
    if (now == null) delete saved.turbo; // from the old map: sprint moves to L (its crossover key is simply ignored)
    const map = { ...DEFAULT_KEYS };
    for (const a of ACTIONS) if (typeof saved[a] === "string" && !RESERVED.has(saved[a]!)) map[a] = saved[a]!;
    // a saved key that clashes with sprint's new default: the saved one wins, sprint goes back to Shift
    if (ACTIONS.some((a) => a !== "turbo" && map[a] === map.turbo)) map.turbo = "ShiftLeft";
    return map;
  } catch {
    return { ...DEFAULT_KEYS }; // storage blocked or junk: the defaults
  }
}

export function saveKeys(map: KeyMap) {
  try {
    localStorage.setItem(STORE, JSON.stringify(map));
  } catch {
    // not saved; it still works for this visit
  }
}

/** Bind a key to an action. A key does one job: whatever had it before gets this action's old key. */
export function rebind(map: KeyMap, action: Action, code: string): KeyMap {
  if (RESERVED.has(code)) return map;
  const next = { ...map };
  const clash = ACTIONS.find((a) => a !== action && next[a] === code);
  if (clash) next[clash] = map[action];
  next[action] = code;
  return next;
}

/** Every key code that does something for an action (its binding plus any backups). */
export const codesFor = (map: KeyMap, a: Action) => [map[a], ...(BACKUP[a] ?? [])];

/** A short name for a key, for the HUD and the controls screen: KeyK → K, ShiftLeft → SHIFT, ArrowUp → UP. */
export function keyName(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  if (code.startsWith("Shift")) return "SHIFT";
  if (code.startsWith("Control")) return "CTRL";
  if (code.startsWith("Alt")) return "ALT";
  if (code === "Space") return "SPC";
  if (code.startsWith("Numpad")) return `NUM${code.slice(6)}`;
  return code.replace(/(Left|Right)$/, "").toUpperCase().slice(0, 6);
}
