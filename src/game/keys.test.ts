import { afterEach, describe, expect, it } from "vitest";
import { codesFor, DEFAULT_KEYS, keyName, loadKeys, rebind } from "./keys.ts";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

describe("key remapping", () => {
  it("rebinding swaps keys so no key does two jobs, and reserved keys can't be taken", () => {
    const m = rebind(DEFAULT_KEYS, "shoot", "KeyJ"); // J was pass
    expect(m.shoot).toBe("KeyJ");
    expect(m.pass).toBe("KeyK"); // pass gets shoot's old key
    expect(rebind(DEFAULT_KEYS, "shoot", "Escape")).toEqual(DEFAULT_KEYS);
    expect(rebind(DEFAULT_KEYS, "pass", "Digit3")).toEqual(DEFAULT_KEYS);
  });

  afterEach(() => store.clear());

  it("L sprints by default and both Shifts always sprint too", () => {
    expect(DEFAULT_KEYS.turbo).toBe("KeyL");
    expect(codesFor(DEFAULT_KEYS, "turbo")).toEqual(["KeyL", "ShiftLeft", "ShiftRight"]);
  });

  it("an old saved map keeps your other keys but sprint moves to L and the crossover key goes", () => {
    store.set("s5p-keys-v1", JSON.stringify({ ...DEFAULT_KEYS, turbo: "ShiftLeft", cross: "KeyL", shoot: "KeyU" }));
    const m = loadKeys();
    expect(m.turbo).toBe("KeyL");
    expect(m.shoot).toBe("KeyU");
    expect("cross" in m).toBe(false);
    store.set("s5p-keys-v2", JSON.stringify({ ...DEFAULT_KEYS, turbo: "KeyO" })); // a new-style map is kept as saved
    expect(loadKeys().turbo).toBe("KeyO");
  });

  it("an old map that put another action on L keeps it there, and sprint stays on Shift", () => {
    store.set("s5p-keys-v1", JSON.stringify({ shoot: "KeyL" }));
    const m = loadKeys();
    expect(m.shoot).toBe("KeyL");
    expect(m.turbo).toBe("ShiftLeft");
  });

  it("keys get short names for the HUD", () => {
    expect([keyName("KeyK"), keyName("ShiftLeft"), keyName("Space"), keyName("ArrowUp"), keyName("Digit4")]).toEqual(["K", "SHIFT", "SPC", "UP", "4"]);
  });
});
