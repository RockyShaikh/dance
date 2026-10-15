import { describe, expect, it } from "vitest";
import { initialClutchState } from "./clutch";
import { selectClutch } from "./knobClutch";
import { availableClutches, clawEnabled, defaultKnobSettings, sanitizeKnobSettings } from "./knobSettings";

describe("R9: the claw is vaulted (hidden unless ?claw=1)", () => {
  it("the flag is exactly ?claw=1 in the address", () => {
    expect(clawEnabled("")).toBe(false);
    expect(clawEnabled("?sim&track=/test/x.wav")).toBe(false);
    expect(clawEnabled("?claw=0")).toBe(false);
    expect(clawEnabled("?claw")).toBe(false);
    expect(clawEnabled("?claw=1")).toBe(true);
    expect(clawEnabled("?sim&claw=1&simfps=30")).toBe(true);
  });

  it("without the flag the panel offers pinch and two-hand only; with it, the claw too", () => {
    expect(availableClutches(false)).toEqual(["pinch", "twoHand"]);
    expect(availableClutches(true)).toEqual(["claw", "pinch", "twoHand"]);
    expect(availableClutches()).toEqual(["pinch", "twoHand"]); // no flag in the test environment's address
  });

  it("a saved claw choice falls back to the default without the flag, and is kept with it", () => {
    expect(sanitizeKnobSettings({ clutch: "claw" }, false).clutch).toBe(defaultKnobSettings().clutch);
    expect(sanitizeKnobSettings({ clutch: "claw" }, true).clutch).toBe("claw");
    expect(sanitizeKnobSettings({ clutch: "pinch" }, false).clutch).toBe("pinch");
  });

  it("the claw's detector and clutch code are still there (their own tests are untouched)", () => {
    expect(typeof selectClutch).toBe("function");
    expect(initialClutchState().claw.Left.grabbed).toBe(false);
  });
});
