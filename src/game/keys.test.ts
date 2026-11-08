import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS, keyName, rebind } from "./keys.ts";

describe("key remapping", () => {
  it("rebinding swaps keys so no key does two jobs, and reserved keys can't be taken", () => {
    const m = rebind(DEFAULT_KEYS, "shoot", "KeyJ"); // J was pass
    expect(m.shoot).toBe("KeyJ");
    expect(m.pass).toBe("KeyK"); // pass gets shoot's old key
    expect(rebind(DEFAULT_KEYS, "shoot", "Escape")).toEqual(DEFAULT_KEYS);
    expect(rebind(DEFAULT_KEYS, "pass", "Digit3")).toEqual(DEFAULT_KEYS);
  });

  it("keys get short names for the HUD", () => {
    expect([keyName("KeyK"), keyName("ShiftLeft"), keyName("Space"), keyName("ArrowUp"), keyName("Digit4")]).toEqual(["K", "SHIFT", "SPC", "UP", "4"]);
  });
});
