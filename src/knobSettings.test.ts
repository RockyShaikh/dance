import { describe, expect, it, vi } from "vitest";
import { KNOB } from "./config";
import { formatResults, markVariant, recordNudge, setNote, variantKey, type KnobLog } from "./knobLog";
import { defaultKnobSettings, loadKnobSettings, sanitizeKnobSettings } from "./knobSettings";

describe("knob settings", () => {
  it("default to the two-hand steering wheel + tilt + relative, moving the playhead (R4c)", () => {
    const d = defaultKnobSettings();
    expect([d.clutch, d.motion, d.mapping, d.target]).toEqual(["twoHand", "tilt", "relative", "playhead"]);
    expect(d.gain).toBe(KNOB.defaults.gain);
  });

  it("sanitize: bad values fall back, numbers are clamped, circling forces jog", () => {
    const s = sanitizeKnobSettings({ clutch: "foot", motion: "circling", mapping: "absolute", target: "volume", gain: 99, deadZoneDeg: -4, invert: "yes" });
    expect(s.target).toBe("playhead");
    expect(s.clutch).toBe(defaultKnobSettings().clutch);
    expect(s.motion).toBe("circling");
    expect(s.mapping).toBe("jog");
    expect(s.gain).toBe(KNOB.gainMax);
    expect(s.deadZoneDeg).toBe(KNOB.deadZoneMinDeg);
    expect(s.invert).toBe(false);
    expect(sanitizeKnobSettings(null)).toEqual(defaultKnobSettings());
    expect(sanitizeKnobSettings({ clutch: "pinch", motion: "tilt", mapping: "relative", invert: true }).mapping).toBe("relative");
  });

  it("a saved choice round-trips through sanitize", () => {
    const saved = { clutch: "twoHand", motion: "tilt", mapping: "absolute", target: "end", gain: 1.5, deadZoneDeg: 9, invert: true };
    expect(sanitizeKnobSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it("loading with storage blocked (or empty) gives the defaults; a saved choice is read back", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadKnobSettings()).toEqual(defaultKnobSettings());
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ clutch: "pinch", mapping: "relative" }) });
    expect(loadKnobSettings()).toMatchObject({ clutch: "pinch", motion: "tilt", mapping: "relative" });
    vi.unstubAllGlobals();
  });
});

describe("experiment log", () => {
  const key = variantKey({ clutch: "claw", motion: "tilt", mapping: "joystick" });
  it("the key includes the target, defaulting to the playhead", () => {
    expect(key).toBe("claw+tilt+joystick+playhead");
    expect(variantKey({ clutch: "claw", motion: "tilt", mapping: "joystick", target: "start" })).toBe("claw+tilt+joystick+start");
  });


  it("counts nudges and marks per variant without touching the others", () => {
    let log: KnobLog = {};
    log = recordNudge(log, key);
    log = recordNudge(log, key);
    log = markVariant(log, key, "best");
    log = markVariant(log, "pinch+tilt+joystick+start", "poor");
    log = setNote(log, key, "steady");
    expect(log[key]).toEqual({ nudges: 2, best: 1, poor: 0, note: "steady" });
    expect(log["pinch+tilt+joystick+start"]).toEqual({ nudges: 0, best: 0, poor: 1, note: "" });
  });

  it("copy text lists only variants with something recorded, in a stable order, with the sliders", () => {
    let log: KnobLog = {};
    log = recordNudge(log, "twoHand+tilt+absolute+playhead");
    log = markVariant(log, key, "best");
    log = setNote(log, key, "felt steady, wrist ran out at the end");
    log = setNote(log, "pinch+tilt+relative", "   "); // blank note: nothing to report
    const text = formatResults(log, { ...defaultKnobSettings(), gain: 1.25 }, "2026-10-12");
    const lines = text.split("\n");
    expect(lines[0]).toContain("2026-10-12");
    expect(lines[1]).toContain("gain 1.25");
    expect(lines).toHaveLength(4);
    expect(lines[2]).toBe("- Claw + Tilt (wiper) + Joystick (rate) -> Playhead (scrub): 0 loop starts nudged, felt best x1, not great x0 | note: felt steady, wrist ran out at the end");
    expect(lines[3]).toContain("Two-hand + Tilt (wiper) + Absolute (wiper) -> Playhead (scrub): 1 loop starts nudged");
  });

  it("says so when nothing is recorded", () => {
    expect(formatResults({}, defaultKnobSettings(), "2026-10-12")).toContain("nothing recorded yet");
  });
});
