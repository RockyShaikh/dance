import { describe, expect, it } from "vitest";
import { SPEED } from "./config";
import { formatRate, stepSpeed, toggleSpeed, wheelSteps } from "./speed";

describe("toggleSpeed (the T key)", () => {
  it("1x -> 2x -> 1x", () => {
    expect(toggleSpeed(1)).toBe(2);
    expect(toggleSpeed(2)).toBe(1);
  });

  it("from a slowed or any other speed it goes back to normal (not to 2x)", () => {
    for (const r of [0.5, 0.75, 1.5]) expect(toggleSpeed(r)).toBe(1);
  });
});

describe("stepSpeed: 0.05 steps within 0.5 to 1.0", () => {
  it("steps down in 0.05 from 1.0 to 0.5 and stops there", () => {
    let r = 1;
    const down: number[] = [];
    for (let i = 0; i < 12; i++) {
      r = stepSpeed(r, -1);
      down.push(r);
    }
    expect(down).toEqual([0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.5, 0.5]);
  });

  it("steps up and stops at 1.0 (a natural stop), without float drift after many steps", () => {
    let r = 0.5;
    const up: number[] = [];
    for (let i = 0; i < 12; i++) {
      r = stepSpeed(r, 1);
      up.push(r);
    }
    expect(up).toEqual([0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1, 1]);
    // down and up again lands exactly where it started
    let x = 0.85;
    for (let i = 0; i < 7; i++) x = stepSpeed(x, -1);
    for (let i = 0; i < 7; i++) x = stepSpeed(x, 1);
    expect(x).toBe(0.85);
  });

  it("clamps: from a rate above 1 (the 2x toggle) a step lands on 1.0; below 0.5 on 0.5", () => {
    expect(stepSpeed(2, -1)).toBe(1);
    expect(stepSpeed(2, 1)).toBe(1);
    expect(stepSpeed(0.3, 1)).toBe(0.5);
    expect(stepSpeed(0.5, -1)).toBe(0.5);
    expect(stepSpeed(1, 1)).toBe(1);
  });

  it("an off-grid rate snaps to the grid", () => {
    expect(stepSpeed(0.82, -1)).toBe(0.8);
    expect(stepSpeed(0.82, 1)).toBe(0.85);
  });
});

describe("wheelSteps: the wheel's turn in degrees becomes whole 0.05 steps", () => {
  const d = SPEED.stepDeg;
  it("one step per stepDeg (30 to 45 degrees: deliberate), clockwise positive; a short turn is none yet", () => {
    expect(d).toBeGreaterThanOrEqual(30);
    expect(d).toBeLessThanOrEqual(45);
    expect(wheelSteps(0, d * 0.9, 0.8)).toEqual({ steps: 0, accumDeg: d * 0.9 });
    expect(wheelSteps(0, d, 0.8)).toEqual({ steps: 1, accumDeg: 0 });
    expect(wheelSteps(0, -d, 0.8)).toEqual({ steps: -1, accumDeg: 0 });
  });

  it("small turns add up over frames; the leftover carries", () => {
    let acc = 0;
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const w = wheelSteps(acc, 5, 0.8);
      acc = w.accumDeg;
      total += w.steps;
    }
    expect(total).toBe(Math.trunc(500 / d));
    expect(acc).toBeCloseTo(500 - total * d, 9);
  });

  it("a big flick is several steps at once", () => {
    expect(wheelSteps(0, d * 3.5, 0.6).steps).toBe(3);
    expect(wheelSteps(0, -d * 2.2, 0.9).steps).toBe(-2);
  });

  it("pushing on against an end of the range keeps nothing: 1.0 up, 0.5 down; the other way is free", () => {
    expect(wheelSteps(10, 100, 1)).toEqual({ steps: 0, accumDeg: 0 });
    expect(wheelSteps(-10, -100, 0.5)).toEqual({ steps: 0, accumDeg: 0 });
    expect(wheelSteps(0, -d, 1).steps).toBe(-1);
    expect(wheelSteps(0, d, 0.5).steps).toBe(1);
  });

  it("a full circle covers the whole range (0.5 to 1.0 in ten steps) at 36 degrees a step", () => {
    expect(Math.round(360 / d)).toBe(Math.round((SPEED.max - SPEED.min) / SPEED.step));
  });
});

describe("formatRate", () => {
  it("is short and readable", () => {
    expect([formatRate(2), formatRate(1), formatRate(0.75), formatRate(0.95)]).toEqual(["2×", "1×", "0.75×", "0.95×"]);
  });
});
