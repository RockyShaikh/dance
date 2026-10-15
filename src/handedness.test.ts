import type { GestureRecognizerResult } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { analyze } from "./analyze";
import { HANDEDNESS } from "./config";
import { LM, type Handedness, type Point3 } from "./hand";
import { chordAgrees } from "./commands";
import { assignHands, thumbSide, type ThumbSide } from "./handedness";
import { pseudoChord } from "./pseudoChord";
import { classifySteerShape } from "./steerMode";
import { chord, makeHand, shapes } from "./test/fixtures";

const W = 1280;
const H = 720;
const SHAPES = { "open palm": "11111", V: "01100", index: "01000", fist: "00000", "thumbs up": "10000", shaka: "10001" } as const;
const HANDS: Handedness[] = ["Right", "Left"];

const side = (hand: Handedness, conf: number): ThumbSide => ({ hand, signed: hand === "Right" ? conf : -conf, conf });

/** A hand whose thumb base lies on the hand's own axis: the thumb says nothing. */
function noThumbInfo(hand: Handedness): Point3[] {
  const lm = makeHand({ hand, fingers: chord("11111") }).map((p) => ({ ...p }));
  const w = lm[LM.WRIST];
  const m = lm[LM.MIDDLE_MCP];
  lm[LM.THUMB_MCP] = { x: w.x + (m.x - w.x) * 0.4, y: w.y + (m.y - w.y) * 0.4, z: w.z };
  return lm;
}

describe("thumbSide: the hand from the thumb (palm assumed to face the camera)", () => {
  for (const [name, bits] of Object.entries(SHAPES)) {
    for (const hand of HANDS) {
      it(`${name}, ${hand} hand: upright and rolled -30 / +30 degrees all read ${hand}, confidently`, () => {
        for (const rollDeg of [-30, 0, 30]) {
          const t = thumbSide(makeHand({ hand, fingers: chord(bits), rollDeg, scale: 2, at: { x: 640, y: 360 } }));
          expect(t.hand, `roll ${rollDeg}`).toBe(hand);
          expect(t.conf, `roll ${rollDeg}`).toBeGreaterThanOrEqual(HANDEDNESS.minThumbConf * 2);
        }
      });
    }
  }

  it("holds at any rotation in the image plane (it is measured against the hand's own axis)", () => {
    for (const hand of HANDS) {
      for (const rollDeg of [-150, -90, -60, 60, 90, 135, 180]) {
        expect(thumbSide(shapes.victory(hand, { rollDeg })).hand, `${hand} roll ${rollDeg}`).toBe(hand);
      }
    }
  });

  it("does not depend on where the hand is, how big it is, or the frame's aspect", () => {
    const a = thumbSide(shapes.fist("Left", { at: { x: 100, y: 80 }, scale: 1 }));
    const b = thumbSide(shapes.fist("Left", { at: { x: 1200, y: 600 }, scale: 4 }));
    expect(a.hand).toBe("Left");
    expect(b.hand).toBe("Left");
    expect(a.conf).toBeCloseTo(b.conf, 6);
  });

  it("is the assumption it says it is: the back of the hand to the camera reads as the OTHER hand", () => {
    expect(thumbSide(shapes.openPalm("Right", { yawDeg: 180 })).hand).toBe("Left");
    expect(thumbSide(shapes.openPalm("Left", { yawDeg: 180 })).hand).toBe("Right");
  });

  it("has no opinion when the thumb sits on the axis (zero confidence), and on degenerate landmarks", () => {
    expect(thumbSide(noThumbInfo("Left")).conf).toBeLessThan(HANDEDNESS.minThumbConf);
    const zeros = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    expect(thumbSide(zeros).conf).toBe(0);
  });
});

describe("fist and thumbs up (the hard cases): the thumb rule, the fist / Thumb_Up guard and the steer modes", () => {
  it("a fist and a thumbs up are read by the thumb's base: right and confident, both hands, rolled; the guard still tells them apart", () => {
    for (const hand of HANDS) {
      for (const rollDeg of [-30, 0, 30]) {
        const fist = makeHand({ hand, fingers: chord("00000"), rollDeg });
        const up = makeHand({ hand, fingers: chord("10000"), rollDeg });
        expect(thumbSide(fist).hand).toBe(hand);
        expect(thumbSide(up).hand).toBe(hand);
        expect(thumbSide(fist).conf).toBeGreaterThan(0.5);
        expect(thumbSide(up).conf).toBeGreaterThan(0.5);
        // the guard (chordAgrees) does not use the hand: a fist is not a thumbs up, and the other way round
        expect(chordAgrees("Thumb_Up", pseudoChord(up))).toBe(true);
        expect(chordAgrees("Thumb_Up", pseudoChord(fist))).toBe(false);
        expect(chordAgrees("Closed_Fist", pseudoChord(fist))).toBe(true);
        expect(chordAgrees("Closed_Fist", pseudoChord(up))).toBe(false);
      }
    }
  });

  it("the steer modes see the same shapes whichever hand it is (a left-hand fist is the fist mode, a shaka the speed mode)", () => {
    for (const hand of HANDS) {
      const fist = makeHand({ hand, fingers: chord("00000") });
      const shaka = makeHand({ hand, fingers: chord("10001") });
      expect(classifySteerShape({ shape: "Closed_Fist", shapeScore: 0.9, clawExt: 1.0, chord: pseudoChord(fist) })).toBe("fist");
      expect(classifySteerShape({ shape: "None", shapeScore: 0, clawExt: 1.4, chord: pseudoChord(shaka) })).toBe("shaka");
    }
  });
});

describe("assignHands", () => {
  it("two hands with different thumbs: each by its thumb", () => {
    expect(assignHands([{ thumb: side("Left", 0.7), modelHand: "Right" }, { thumb: side("Right", 0.7), modelHand: "Left" }])).toEqual([
      { hand: "Left", source: "thumb" },
      { hand: "Right", source: "thumb" },
    ]);
  });

  it("two hands, both thumbs say right: the more confident keeps it, the other gets left (either order)", () => {
    expect(assignHands([{ thumb: side("Right", 0.8), modelHand: "Right" }, { thumb: side("Right", 0.4), modelHand: "Right" }])).toEqual([
      { hand: "Right", source: "thumb" },
      { hand: "Left", source: "pair" },
    ]);
    expect(assignHands([{ thumb: side("Right", 0.4), modelHand: "Right" }, { thumb: side("Right", 0.8), modelHand: "Right" }])).toEqual([
      { hand: "Left", source: "pair" },
      { hand: "Right", source: "thumb" },
    ]);
  });

  it("two hands, both thumbs say left: the more confident keeps it, the other gets right", () => {
    expect(assignHands([{ thumb: side("Left", 0.3), modelHand: "Left" }, { thumb: side("Left", 0.9), modelHand: "Left" }])).toEqual([
      { hand: "Right", source: "pair" },
      { hand: "Left", source: "thumb" },
    ]);
  });

  it("one hand: a confident thumb decides, left or right", () => {
    expect(assignHands([{ thumb: side("Left", 0.6), modelHand: "Right" }])).toEqual([{ hand: "Left", source: "thumb" }]);
    expect(assignHands([{ thumb: side("Right", 0.6), modelHand: "Left" }])).toEqual([{ hand: "Right", source: "thumb" }]);
  });

  it("one hand, no confident thumb: the default, RIGHT (whatever the model says)", () => {
    expect(assignHands([{ thumb: side("Left", HANDEDNESS.minThumbConf - 0.01), modelHand: "Left" }])).toEqual([{ hand: "Right", source: "default" }]);
    expect(assignHands([{ thumb: side("Right", 0), modelHand: "Left" }])).toEqual([{ hand: "Right", source: "default" }]);
  });

  it("no hands: nothing; the model-label fallback takes the labels as they are", () => {
    expect(assignHands([])).toEqual([]);
    const model = { ...HANDEDNESS, source: "model" as const };
    expect(assignHands([{ thumb: side("Right", 0.9), modelHand: "Left" }, { thumb: side("Left", 0.9), modelHand: "Left" }], model)).toEqual([
      { hand: "Left", source: "model" },
      { hand: "Left", source: "model" },
    ]);
  });
});

/** A recognizer result for hands laid out in full-frame pixels, with the model's labels given (and possibly wrong). */
function resultFor(hands: { lm: Point3[]; label: string; shape?: string }[]): GestureRecognizerResult {
  return {
    landmarks: hands.map((h) => h.lm.map((p) => ({ x: p.x / W, y: p.y / H, z: p.z / W, visibility: 1 }))),
    worldLandmarks: [],
    handedness: hands.map((h) => [{ score: 0.9, index: 0, categoryName: h.label, displayName: h.label }]),
    gestures: hands.map((h) => [{ score: 0.9, index: 0, categoryName: h.shape ?? "None", displayName: "" }]),
  } as unknown as GestureRecognizerResult;
}

describe("analyze: the labels come from the thumbs, not from the model or the screen side", () => {
  it("two hands crossed over (the left hand is on the right of the picture): still L and R by thumb, whatever the model says", () => {
    const left = shapes.openPalm("Left", { at: { x: 400, y: 200 } }); // raw x small = right of the mirrored picture
    const right = shapes.openPalm("Right", { at: { x: 900, y: 200 } });
    const out = analyze(resultFor([{ lm: left, label: "Right" }, { lm: right, label: "Left" }]), W, H); // model labels both wrong
    const byHand = Object.fromEntries(out.map((r) => [r.hand, r]));
    expect(out.map((r) => r.hand).sort()).toEqual(["Left", "Right"]);
    expect(byHand.Left.palm.x).toBeGreaterThan(byHand.Right.palm.x); // the dancer's left hand is displayed on the right
    expect(out.every((r) => r.handSource === "thumb")).toBe(true);
    expect(byHand.Left.modelHand).toBe("Right"); // the model's label is kept as a readout
  });

  it("two hands side by side, the normal way round", () => {
    const left = shapes.fist("Left", { at: { x: 900, y: 200 } });
    const right = shapes.victory("Right", { at: { x: 400, y: 200 } });
    const out = analyze(resultFor([{ lm: left, label: "Left" }, { lm: right, label: "Right" }]), W, H);
    const byHand = Object.fromEntries(out.map((r) => [r.hand, r]));
    expect(byHand.Left.palm.x).toBeLessThan(byHand.Right.palm.x);
    expect(out.map((r) => r.hand).sort()).toEqual(["Left", "Right"]);
  });

  it("two hands the thumbs cannot tell apart (both read right): one is made the left", () => {
    const a = shapes.openPalm("Right", { at: { x: 400, y: 200 } });
    const b = shapes.openPalm("Right", { at: { x: 900, y: 200 }, scale: 3 });
    const out = analyze(resultFor([{ lm: a, label: "Right" }, { lm: b, label: "Right" }]), W, H);
    expect(out.map((r) => r.hand).sort()).toEqual(["Left", "Right"]);
    expect(out.filter((r) => r.handSource === "pair")).toHaveLength(1);
  });

  it("one hand: a left hand alone is left (confident thumb); an unreadable thumb defaults to right", () => {
    const left = analyze(resultFor([{ lm: shapes.openPalm("Left", { at: { x: 640, y: 200 } }), label: "Right" }]), W, H);
    expect(left[0].hand).toBe("Left");
    const lost = analyze(resultFor([{ lm: noThumbInfo("Left"), label: "Left" }]), W, H);
    expect(lost[0].hand).toBe("Right");
    expect(lost[0].handSource).toBe("default");
  });

  it("palmFacing is still computed (from the model's label) as a readout", () => {
    const out = analyze(resultFor([{ lm: shapes.openPalm("Right", { at: { x: 640, y: 200 } }), label: "Right" }]), W, H);
    expect(out[0].palmFacing).toBe(true);
    const back = analyze(resultFor([{ lm: shapes.openPalm("Right", { at: { x: 640, y: 200 }, yawDeg: 180 }), label: "Right" }]), W, H);
    expect(back[0].palmFacing).toBe(false);
  });
});
