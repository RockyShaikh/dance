import { describe, expect, it } from "vitest";
import { palmFacing, palmFacingInfo } from "./palmFacing";
import { shapes } from "./test/fixtures";
import type { Handedness } from "./hand";

const hands: Handedness[] = ["Right", "Left"];

describe("palmFacing", () => {
  for (const hand of hands) {
    it(`${hand} hand, palm to camera: facing`, () => {
      for (const make of Object.values(shapes)) {
        expect(palmFacing(make(hand), hand)).toBe(true);
      }
      expect(palmFacingInfo(shapes.openPalm(hand), hand).score).toBeGreaterThan(0.9);
    });

    it(`${hand} hand, back of hand to camera: not facing`, () => {
      for (const make of Object.values(shapes)) {
        const lm = make(hand, { yawDeg: 180 });
        expect(palmFacing(lm, hand)).toBe(false);
      }
      expect(palmFacingInfo(shapes.openPalm(hand, { yawDeg: 180 }), hand).score).toBeLessThan(-0.9);
    });

    it(`${hand} hand, side-on (80 degrees): not facing`, () => {
      expect(palmFacing(shapes.openPalm(hand, { yawDeg: 80 }), hand)).toBe(false);
      expect(palmFacing(shapes.openPalm(hand, { yawDeg: -80 }), hand)).toBe(false);
    });

    it(`${hand} hand, tilted 30 degrees toward the camera: still facing`, () => {
      expect(palmFacing(shapes.openPalm(hand, { yawDeg: 30 }), hand)).toBe(true);
      expect(palmFacing(shapes.openPalm(hand, { yawDeg: -30 }), hand)).toBe(true);
    });

    it(`${hand} hand: unchanged by rolling in the image plane`, () => {
      for (const rollDeg of [-90, -45, 45, 90, 180]) {
        expect(palmFacing(shapes.victory(hand, { rollDeg }), hand), `roll ${rollDeg}`).toBe(true);
        expect(palmFacing(shapes.victory(hand, { rollDeg, yawDeg: 180 }), hand), `back roll ${rollDeg}`).toBe(false);
      }
    });
  }

  it("depends on handedness: the same landmarks with the wrong hand flip the answer", () => {
    const rightPalm = shapes.openPalm("Right");
    expect(palmFacing(rightPalm, "Right")).toBe(true);
    expect(palmFacing(rightPalm, "Left")).toBe(false);
  });

  it("is not facing for degenerate (all-zero) landmarks", () => {
    const zeros = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    expect(palmFacing(zeros, "Right")).toBe(false);
  });

  it("rejects fewer than 21 landmarks", () => {
    expect(() => palmFacing(shapes.fist("Left").slice(0, 5), "Left")).toThrow();
  });
});
