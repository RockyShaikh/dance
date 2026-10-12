import { describe, expect, it } from "vitest";
import { KNOB } from "./config";
import { absoluteTilt, joystickRate, rebaseMapping, startMapping, stepMapping, type MappingParams, type MappingState } from "./knobMapping";

const P: MappingParams = { gain: 1, deadZoneDeg: 12, invert: false };
const DT = 1 / 30;

/** Holds `angle` for `sec` seconds and returns the total seconds the value moved. */
function hold(s: MappingState, angle: number, sec: number, p: MappingParams = P): { state: MappingState; total: number } {
  let state = s;
  let total = 0;
  for (let i = 0; i < Math.round(sec / DT); i++) {
    const r = stepMapping(state, angle, DT, p, KNOB);
    state = r.state;
    total += r.deltaSec;
  }
  return { state, total };
}

describe("joystick (rate)", () => {
  it("does nothing inside the dead zone, either side of centre", () => {
    const s = startMapping("joystick", 5); // centre is where you grabbed
    expect(hold(s, 5 + 11, 2).total).toBe(0);
    expect(hold(s, 5 - 11, 2).total).toBe(0);
    expect(joystickRate(12, 12, KNOB)).toBe(0);
  });

  it("moves later for a clockwise tilt and earlier for counter-clockwise", () => {
    const s = startMapping("joystick", 0);
    expect(hold(s, 40, 1).total).toBeGreaterThan(0);
    expect(hold(s, -40, 1).total).toBeLessThan(0);
  });

  it("more tilt = faster, and the rate rises from zero at the edge of the dead zone (no step)", () => {
    const rates = [13, 20, 30, 45, 60].map((d) => joystickRate(d, 12, KNOB));
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    expect(rates[0]).toBeLessThan(0.01);
  });

  it("tops out at the maximum rate (low: a few seconds of START per second) at full tilt and beyond", () => {
    expect(joystickRate(KNOB.joystick.fullTiltDeg, 12, KNOB)).toBeCloseTo(KNOB.joystick.maxRateSecPerSec, 6);
    expect(joystickRate(170, 12, KNOB)).toBeCloseTo(KNOB.joystick.maxRateSecPerSec, 6);
    expect(joystickRate(-170, 12, KNOB)).toBeCloseTo(-KNOB.joystick.maxRateSecPerSec, 6);
  });

  it("the value moves by rate x time: full tilt for 1 s moves the maximum", () => {
    const { total } = hold(startMapping("joystick", 0), 60, 1);
    expect(total).toBeCloseTo(KNOB.joystick.maxRateSecPerSec, 1);
  });

  it("gain scales the rate, the dead-zone slider moves the dead zone, invert flips the direction", () => {
    const s = startMapping("joystick", 0);
    const base = hold(s, 40, 1).total;
    expect(hold(s, 40, 1, { ...P, gain: 2 }).total).toBeCloseTo(2 * base, 6);
    expect(hold(s, 20, 1, { ...P, deadZoneDeg: 25 }).total).toBe(0); // inside the wider zone
    expect(hold(s, 20, 1, { ...P, deadZoneDeg: 5 }).total).toBeGreaterThan(0);
    expect(hold(s, 40, 1, { ...P, invert: true }).total).toBeCloseTo(-base, 6);
  });

  it("back at centre stops it (the spring)", () => {
    let r = hold(startMapping("joystick", 0), 40, 1);
    expect(r.total).toBeGreaterThan(0);
    r = hold(r.state, 0, 1);
    expect(r.total).toBe(0);
  });
});

describe("absolute (wiper)", () => {
  it("the tilt is the value: the total movement follows the angle, and tilting back returns it", () => {
    let r = hold(startMapping("absolute", 0), 30, 1);
    expect(r.total).toBeCloseTo(30 * KNOB.absolute.secPerDeg, 6);
    r = hold(r.state, 0, 1);
    expect(r.total).toBeCloseTo(-30 * KNOB.absolute.secPerDeg, 6);
  });

  it("is limited to the world range: past it, the value stops (it runs out)", () => {
    const range = KNOB.absolute.worldRangeDeg;
    const r = hold(startMapping("absolute", 0), 170, 1);
    expect(r.total).toBeCloseTo(range * KNOB.absolute.secPerDeg, 6);
    expect(absoluteTilt(-200, KNOB)).toBe(-range);
  });

  it("the range is the WORLD's: grabbing at +30 leaves only the rest of the sweep", () => {
    const range = KNOB.absolute.worldRangeDeg;
    const r = hold(startMapping("absolute", 30), 170, 1);
    expect(r.total).toBeCloseTo((range - 30) * KNOB.absolute.secPerDeg, 6);
  });

  it("does not move at the grab itself", () => {
    expect(stepMapping(startMapping("absolute", 40), 40, DT, P, KNOB).deltaSec).toBe(0);
  });
});

describe("relative + ratchet", () => {
  it("follows how far you turned since the grab, with no limit", () => {
    const r = hold(startMapping("relative", 0), 150, 1);
    expect(r.total).toBeCloseTo(150 * KNOB.relative.secPerDeg, 6);
  });

  it("ratchet: let go, turn back, re-grab, and the value carries on from where it was (no jump at the re-grab)", () => {
    // First grab at 0 degrees, turn to 60.
    let g = hold(startMapping("relative", 0), 60, 1);
    const first = g.total;
    expect(first).toBeCloseTo(60 * KNOB.relative.secPerDeg, 6);
    // Released. The hand returns to 0 with an open hand (the pipeline isn't stepping the mapping), then re-grabs.
    g = { state: startMapping("relative", 0), total: first };
    // The re-grab frame itself moves nothing...
    expect(stepMapping(g.state, 0, DT, P, KNOB).deltaSec).toBe(0);
    // ...and a second turn of 60 adds to the first.
    g = hold(g.state, 60, 1);
    expect(first + g.total).toBeCloseTo(120 * KNOB.relative.secPerDeg, 6);
  });
});

describe("jog (circling)", () => {
  it("each full circle moves the value by a fixed amount, clockwise later, counter-clockwise earlier", () => {
    expect(hold(startMapping("jog", 0), 360, 1).total).toBeCloseTo(KNOB.jog.secPerTurn, 6);
    expect(hold(startMapping("jog", 0), -720, 1).total).toBeCloseTo(-2 * KNOB.jog.secPerTurn, 6);
  });
});

describe("rebase after a dropout", () => {
  it("makes the new pose 'no change', so no mapping jumps when the hand reappears", () => {
    for (const kind of ["absolute", "relative", "jog"] as const) {
      const s = rebaseMapping(startMapping(kind, 0), 90);
      expect(stepMapping(s, 90, DT, P, KNOB).deltaSec).toBe(0);
    }
  });
});
