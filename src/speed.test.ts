import { describe, expect, it } from "vitest";
import { SPEED } from "./config";
import { formatRate, stepSpeed, toggleSpeed } from "./speed";

describe("toggleSpeed", () => {
  it("1x -> 2x -> 1x", () => {
    expect(toggleSpeed(1)).toBe(2);
    expect(toggleSpeed(2)).toBe(1);
  });

  it("from a slowed or any other speed it goes back to normal (not to 2x)", () => {
    for (const r of [0.5, 0.75, 1.5]) expect(toggleSpeed(r)).toBe(1);
  });
});

describe("stepSpeed", () => {
  it("steps through 0.5, 0.75, 1, 1.5, 2 in both directions", () => {
    expect([...SPEED.steps]).toEqual([0.5, 0.75, 1, 1.5, 2]);
    let r = 2;
    const down: number[] = [];
    for (let i = 0; i < 5; i++) {
      r = stepSpeed(r, -1);
      down.push(r);
    }
    expect(down).toEqual([1.5, 1, 0.75, 0.5, 0.5]);
    const up: number[] = [];
    for (let i = 0; i < 5; i++) {
      r = stepSpeed(r, 1);
      up.push(r);
    }
    expect(up).toEqual([0.75, 1, 1.5, 2, 2]);
  });

  it("from a rate between presets it goes to the neighbour in that direction", () => {
    expect(stepSpeed(1.2, 1)).toBe(1.5);
    expect(stepSpeed(1.2, -1)).toBe(1);
  });
});

describe("formatRate", () => {
  it("is short and readable", () => {
    expect([formatRate(2), formatRate(1), formatRate(0.75), formatRate(1.5)]).toEqual(["2×", "1×", "0.75×", "1.5×"]);
  });
});
