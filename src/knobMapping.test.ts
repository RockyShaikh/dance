import { describe, expect, it } from "vitest";
import { KNOB } from "./config";
import { absoluteTilt, joystickRate, rebaseMapping, startMapping, stepMapping, turnBoost, type MappingParams, type MappingState } from "./knobMapping";

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

/** Turns the hand at a steady `degPerSec` from `from` to `to`, frame by frame, and returns the total movement and the end state. */
function turn(s: MappingState, from: number, to: number, degPerSec: number, p: MappingParams = P): { state: MappingState; total: number } {
  let state = s;
  let total = 0;
  const frames = Math.max(1, Math.round(Math.abs(to - from) / degPerSec / DT));
  for (let i = 1; i <= frames; i++) {
    const r = stepMapping(state, from + ((to - from) * i) / frames, DT, p, KNOB);
    state = r.state;
    total += r.deltaSec;
  }
  return { state, total };
}

describe("relative + ratchet", () => {
  const R = KNOB.relative;

  it("follows how far you turned since the grab, with no limit (a slow turn: 1x, within the hold-off)", () => {
    const r = turn(startMapping("relative", 0), 0, 150, R.slowDegPerSec * 0.5);
    expect(r.total).toBeLessThanOrEqual(150 * R.secPerDeg + 1e-9);
    expect(r.total).toBeGreaterThan((150 - R.holdDeg - 0.01) * R.secPerDeg);
  });

  it("ratchet: let go, turn back, re-grab, and the value carries on from where it was (no jump at the re-grab)", () => {
    let g = turn(startMapping("relative", 0), 0, 60, R.slowDegPerSec * 0.5);
    const first = g.total;
    expect(first).toBeGreaterThan((60 - R.holdDeg - 0.01) * R.secPerDeg);
    // Released. The hand returns to 0 with an open hand (the pipeline isn't stepping the mapping), then re-grabs.
    g = { state: startMapping("relative", 0), total: first };
    // The re-grab frame itself moves nothing...
    expect(stepMapping(g.state, 0, DT, P, KNOB).deltaSec).toBe(0);
    // ...and a second turn of 60 adds to the first.
    const second = turn(g.state, 0, 60, R.slowDegPerSec * 0.5).total;
    expect(first + second).toBeGreaterThan(2 * (60 - R.holdDeg - 0.01) * R.secPerDeg);
  });

  it("STOPPING THE TURN STOPS THE VALUE AT ONCE, however fast the turn was (the joystick keeps going)", () => {
    for (const speed of [20, 100, 400]) {
      const turned = turn(startMapping("relative", 0), 0, 50, speed);
      const next = stepMapping(turned.state, 50, DT, P, KNOB);
      expect(next.deltaSec).toBe(0);
      // ...and it stays stopped while the hand is held there.
      expect(hold(next.state, 50, 2).total).toBe(0);
    }
    // The joystick, by contrast, is still moving a second later.
    expect(hold(startMapping("joystick", 0), 40, 1).total).toBeGreaterThan(1);
  });

  it("a hand held still does not creep: jitter inside the hold-off moves nothing", () => {
    let s = startMapping("relative", 10);
    let total = 0;
    for (let i = 0; i < 90; i++) {
      const r = stepMapping(s, 10 + (i % 2 === 0 ? 0.8 : -0.8) * R.holdDeg, DT, P, KNOB);
      s = r.state;
      total += r.deltaSec;
    }
    expect(total).toBe(0);
  });

  it("a fast turn is boosted, a slow one is not: one flick crosses far more than the same turn done slowly", () => {
    const slow = turn(startMapping("relative", 0), 0, 60, R.slowDegPerSec * 0.5).total;
    const fast = turn(startMapping("relative", 0), 0, 60, R.fastDegPerSec * 1.5).total;
    expect(fast / slow).toBeGreaterThan(R.maxBoost * 0.5);
    expect(fast / slow).toBeLessThanOrEqual(R.maxBoost + 0.01);
    expect(turnBoost(R.slowDegPerSec * 0.9, KNOB)).toBe(1);
    expect(turnBoost(R.fastDegPerSec * 3, KNOB)).toBe(R.maxBoost);
    expect(turnBoost(-(R.slowDegPerSec + R.fastDegPerSec) / 2, KNOB)).toBeGreaterThan(1);
  });

  it("direction follows the turn: clockwise later, counter-clockwise earlier, and invert flips it", () => {
    expect(turn(startMapping("relative", 0), 0, 30, 20).total).toBeGreaterThan(0);
    expect(turn(startMapping("relative", 0), 0, -30, 20).total).toBeLessThan(0);
    expect(turn(startMapping("relative", 0), 0, 30, 20, { ...P, invert: true }).total).toBeLessThan(0);
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
