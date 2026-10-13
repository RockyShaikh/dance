import type { Category, GestureRecognizerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { analyze } from "./analyze";
import { mapLandmarks, mergeCropResults, nearestHand, type CropResult } from "./cropMerge";
import { personCropRect, wristCrop } from "./poseCrop";
import { makePose } from "./test/pose";
import { makeHand, shapes } from "./test/fixtures";
import { atDetector, DetectionCounter, palmWidthPx } from "./trackStats";
import { cropLayout, fromFullFrame, type CropLayout } from "./zoom";

const W = 1920;
const H = 1080;

/** A hand in full-frame normalized landmarks, built from the fixture hand (scale in px) and placed with its wrist at (wx, wy) px. */
function handAt(wx: number, wy: number, scale = 1.2): NormalizedLandmark[] {
  const pts = makeHand({ hand: "Right", fingers: { T: true, I: true, M: true, R: true, P: true }, scale });
  const w0 = pts[0];
  return pts.map((p) => ({ x: (p.x - w0.x + wx) / W, y: (p.y - w0.y + wy) / H, z: p.z / W, visibility: 1 }));
}

/** What the recognizer would return for a crop: the hand(s) projected into its square canvas. */
function inCrop(hands: NormalizedLandmark[][], L: CropLayout): GestureRecognizerResult {
  const cat = (name: string): Category => ({ score: 0.9, index: -1, categoryName: name, displayName: name });
  return {
    landmarks: hands.map((h) => h.map((p) => ({ ...p, ...fromFullFrame(p, L) }))),
    worldLandmarks: hands.map(() => []),
    handedness: hands.map(() => [cat("Right")]),
    handednesses: hands.map(() => [cat("Right")]),
    gestures: hands.map(() => [cat("Open_Palm")]),
  };
}

const near = (a: NormalizedLandmark[], b: NormalizedLandmark[]) => {
  for (let i = 0; i < a.length; i++) {
    expect(a[i].x).toBeCloseTo(b[i].x, 9);
    expect(a[i].y).toBeCloseTo(b[i].y, 9);
    expect(a[i].z).toBeCloseTo(b[i].z, 9);
  }
};

describe("landmark round trip for both modes", () => {
  const hand = handAt(1000, 500);

  it("person mode: the hand projected into the person crop's canvas maps back to the full frame exactly", () => {
    const pose = makePose({ W, H, cx: 960, sy: 450, sw: 200, rightWrist: { x: 1000, y: 500 } });
    const L = cropLayout(personCropRect(pose, W, H)!, W, H);
    near(mapLandmarks(inCrop([hand], L).landmarks[0], L), hand);
  });

  it("wrists mode: the same for each wrist's crop (square, pushed against the frame edge too)", () => {
    const pose = makePose({ W, H, cx: 960, sy: 450, sw: 200, leftWrist: { x: 1900, y: 40 }, rightWrist: { x: 1000, y: 500 } });
    for (const side of ["left", "right"] as const) {
      const L = cropLayout(wristCrop(pose, side, W, H)!.rect, W, H);
      near(mapLandmarks(inCrop([hand], L).landmarks[0], L), hand);
    }
  });

  it("a crop that is not square (a person who fills the frame height) round-trips through its padding", () => {
    const L = cropLayout({ x: 0.2, y: 0, w: 0.5, h: 1 }, W, H);
    expect(L.ox).toBeGreaterThan(0);
    near(mapLandmarks(inCrop([hand], L).landmarks[0], L), hand);
  });

  it("through analyze(): the palm lands where it would with a whole-frame pass", () => {
    const L = cropLayout(personCropRect(makePose({ W, H, cx: 960, sy: 450, sw: 200, rightWrist: { x: 1000, y: 500 } }), W, H)!, W, H);
    const whole = analyze(inCrop([hand], cropLayout({ x: 0, y: 0, w: 1, h: 1 }, W, H)), W, H, (lm) => mapLandmarks(lm, cropLayout({ x: 0, y: 0, w: 1, h: 1 }, W, H)));
    const viaCrop = analyze(inCrop([hand], L), W, H, (lm) => mapLandmarks(lm, L));
    expect(viaCrop[0].palm.x).toBeCloseTo(whole[0].palm.x, 9);
    expect(viaCrop[0].palm.y).toBeCloseTo(whole[0].palm.y, 9);
    expect(viaCrop[0].tiltDeg).toBeCloseTo(whole[0].tiltDeg, 6);
    expect(viaCrop[0].chord).toEqual(whole[0].chord);
    void shapes;
  });
});

describe("nearestHand / mergeCropResults (wrists mode)", () => {
  const rightHand = handAt(1000, 500);
  const leftHand = handAt(700, 500);
  const pose = makePose({ W, H, cx: 850, sy: 450, sw: 200, leftWrist: { x: 700, y: 500 }, rightWrist: { x: 1000, y: 500 } });
  const lc = wristCrop(pose, "left", W, H)!;
  const rc = wristCrop(pose, "right", W, H)!;
  const partOf = (c: typeof lc, hands: NormalizedLandmark[][]): CropResult => {
    const layout = cropLayout(c.rect, W, H);
    return { result: inCrop(hands, layout), layout, anchor: c.anchor };
  };

  it("each crop gives its own hand, in full-frame coordinates, with the source crop recorded", () => {
    const m = mergeCropResults([partOf(lc, [leftHand]), partOf(rc, [rightHand])]);
    expect(m.result.landmarks).toHaveLength(2);
    near(m.result.landmarks[0], leftHand);
    near(m.result.landmarks[1], rightHand);
    expect(m.sources).toEqual([0, 1]);
    expect(m.result.gestures).toHaveLength(2);
  });

  it("a crop that holds both hands (they are close together) keeps the one nearest its wrist", () => {
    const part = partOf(rc, [leftHand, rightHand]);
    expect(nearestHand(part)).toBe(1);
    const m = mergeCropResults([part]);
    near(m.result.landmarks[0], rightHand);
  });

  it("the same hand found by both crops is counted once", () => {
    const together = makePose({ W, H, cx: 850, sy: 450, sw: 200, leftWrist: { x: 840, y: 500 }, rightWrist: { x: 850, y: 505 } });
    const l = wristCrop(together, "left", W, H)!;
    const r = wristCrop(together, "right", W, H)!;
    const one = handAt(845, 502);
    const m = mergeCropResults([partOf(l, [one]), partOf(r, [one])]);
    expect(m.result.landmarks).toHaveLength(1);
    expect(m.sources).toEqual([0]);
  });

  it("a hand far from the pose wrist (someone else's) is ignored; a crop with no hand adds none", () => {
    const stranger = handAt(1900, 900);
    expect(nearestHand(partOf(rc, [stranger]))).toBe(-1);
    expect(mergeCropResults([partOf(rc, []), partOf(lc, [])]).result.landmarks).toHaveLength(0);
  });
});

describe("palm size at the detector (trackStats)", () => {
  it("palm width is the index-to-pinky knuckle distance in isotropic pixels", () => {
    const h = handAt(1000, 500, 2);
    const w = palmWidthPx(h, W, H);
    expect(w).toBeGreaterThan(5);
    expect(w).toBeCloseTo(Math.hypot((h[5].x - h[17].x) * W, (h[5].y - h[17].y) * H), 9);
  });

  it("the detector sees the model canvas shrunk to 192: a whole 1920 frame divides by 10, a 640 crop by 3.33", () => {
    expect(atDetector(30, 1920)).toBeCloseTo(3, 9);
    expect(atDetector(30, 640)).toBeCloseTo(9, 9);
  });

  it("the detection counter reports hand frames and hand-while-wrist frames", () => {
    const c = new DetectionCounter();
    c.push({ pose: true, wristVisible: true, hand: true });
    c.push({ pose: true, wristVisible: true, hand: false });
    c.push({ pose: false, wristVisible: false, hand: false });
    c.push({ pose: true, wristVisible: false, hand: true });
    expect([c.frames, c.handFrames, c.wristFrames, c.handWhenWrist]).toEqual([4, 2, 2, 1]);
    expect(c.text()).toContain("hand 2/4 (50%)");
    expect(c.text()).toContain("while pose sees a wrist 1/2 (50%)");
    c.reset();
    expect(c.frames).toBe(0);
    const off = new DetectionCounter();
    off.push({ pose: null, wristVisible: null, hand: true });
    expect(off.text()).toContain("pose off");
  });
});
