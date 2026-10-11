import { describe, expect, it } from "vitest";
import { chordBits, formatChord, pseudoChord } from "./pseudoChord";
import { chord, makeHand, shapes } from "./test/fixtures";
import type { Handedness } from "./hand";

const hands: Handedness[] = ["Right", "Left"];

describe("pseudoChord on named shapes", () => {
  for (const hand of hands) {
    describe(`${hand} hand, palm to camera`, () => {
      it("open palm = T1 I1 M1 R1 P1", () => {
        expect(chordBits(pseudoChord(shapes.openPalm(hand)))).toBe("11111");
      });
      it("fist = all curled", () => {
        expect(chordBits(pseudoChord(shapes.fist(hand)))).toBe("00000");
      });
      it("index up = T0 I1 M0 R0 P0", () => {
        expect(chordBits(pseudoChord(shapes.indexUp(hand)))).toBe("01000");
      });
      it("V = T0 I1 M1 R0 P0", () => {
        expect(formatChord(pseudoChord(shapes.victory(hand)))).toBe("T0 I1 M1 R0 P0");
      });
      it("thumb out, fingers curled = T1 I0 M0 R0 P0", () => {
        expect(chordBits(pseudoChord(shapes.thumbOut(hand)))).toBe("10000");
      });
    });
  }
});

describe("pseudoChord on every finger combination", () => {
  it("reads all 32 combinations for both hands", () => {
    for (const hand of hands) {
      for (let n = 0; n < 32; n++) {
        const bits = n.toString(2).padStart(5, "0");
        const lm = makeHand({ hand, fingers: chord(bits) });
        expect(chordBits(pseudoChord(lm)), `${hand} ${bits}`).toBe(bits);
      }
    }
  });
});

describe("pseudoChord tolerates rotation and distance", () => {
  const cases: Array<[string, string]> = [
    ["open palm", "11111"],
    ["fist", "00000"],
    ["index up", "01000"],
    ["V", "01100"],
    ["thumb out", "10000"],
  ];
  for (const rollDeg of [-90, -45, 45, 90, 135, 180]) {
    it(`unchanged when the hand is rolled ${rollDeg} degrees in the image`, () => {
      for (const hand of hands) {
        for (const [, bits] of cases) {
          const lm = makeHand({ hand, fingers: chord(bits), rollDeg });
          expect(chordBits(pseudoChord(lm)), `${hand} ${bits} roll ${rollDeg}`).toBe(bits);
        }
      }
    });
  }
  for (const scale of [0.5, 1, 6]) {
    it(`unchanged at scale ${scale}x`, () => {
      for (const [, bits] of cases) {
        const lm = makeHand({ hand: "Right", fingers: chord(bits), scale });
        expect(chordBits(pseudoChord(lm))).toBe(bits);
      }
    });
  }
  it("still reads the shapes with the back of the hand to the camera", () => {
    for (const hand of hands) {
      for (const [, bits] of cases) {
        const lm = makeHand({ hand, fingers: chord(bits), yawDeg: 180 });
        expect(chordBits(pseudoChord(lm)), `${hand} ${bits} back`).toBe(bits);
      }
    }
  });
});

describe("formatChord", () => {
  it("prints the T I M R P readout", () => {
    expect(formatChord(chord("00000"))).toBe("T0 I0 M0 R0 P0");
    expect(formatChord(chord("11111"))).toBe("T1 I1 M1 R1 P1");
  });
});

describe("pseudoChord input checks", () => {
  it("rejects fewer than 21 landmarks", () => {
    expect(() => pseudoChord(shapes.fist("Right").slice(0, 10))).toThrow();
  });
});
