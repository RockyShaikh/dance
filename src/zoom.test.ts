import type { GestureRecognizerResult } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { analyze, toIsotropic } from "./analyze";
import { DEFAULT_ZONE, PRESETS } from "./box";
import { ZOOM } from "./config";
import { dist, type Point3 } from "./hand";
import { palmCentre } from "./handFeatures";
import { shapes } from "./test/fixtures";
import { cropAsDisplayBox, cropLayout, cropRectForZone, fromFullFrame, insideCrop, magnification, toFullFrame } from "./zoom";

const W = 1280;
const H = 720;

describe("cropRectForZone: the zone plus a margin, flipped to the raw (un-mirrored) frame", () => {
  it("the default zone (full-width top quarter): the full width and the top quarter plus the margin", () => {
    const r = cropRectForZone(DEFAULT_ZONE, W, H);
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.w).toBeCloseTo(1, 9);
    expect(r.y).toBe(0); // clamped at the top of the frame
    expect(r.h).toBeCloseTo(0.25 + ZOOM.margin, 9);
  });

  it("a zone on the RIGHT of the mirrored picture is on the LEFT of the raw frame", () => {
    const r = cropRectForZone({ x: 0.6, y: 0.1, w: 0.4, h: 0.25 }, W, H, 0);
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.w).toBeCloseTo(0.4, 9);
    const m = cropRectForZone({ x: 0.1, y: 0.1, w: 0.3, h: 0.25 }, W, H, 0);
    expect(m.x).toBeCloseTo(0.6, 9); // display 0.1..0.4 = raw 0.6..0.9
  });

  it("the margin is the same number of pixels in x and y (a fraction of the frame height), and is clamped to the frame", () => {
    const r = cropRectForZone({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, W, H, 0.1);
    expect(r.h).toBeCloseTo(0.2 + 0.2, 9); // 0.1 of the height each side
    expect((r.w * W - 0.2 * W) / 2).toBeCloseTo(0.1 * H, 6); // the same 72 px each side in x
    const edge = cropRectForZone({ x: 0, y: 0, w: 0.2, h: 0.2 }, W, H, 0.1);
    expect(edge.y).toBe(0);
    expect(edge.x + edge.w).toBeLessThanOrEqual(1);
  });

  it("a tiny zone is grown to the minimum crop, and always stays inside the frame", () => {
    const r = cropRectForZone({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, W, H, 0);
    expect(r.w).toBeGreaterThanOrEqual(ZOOM.minCropFrac - 1e-9);
    expect(r.h).toBeGreaterThanOrEqual(ZOOM.minCropFrac - 1e-9);
    for (const v of [r.x, r.y, r.x + r.w, r.y + r.h]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("cropLayout: the crop in whole pixels, centred in a square model canvas", () => {
  it("default zone: 1280 x 266 in a 1280 square, padded top and bottom", () => {
    const L = cropLayout(cropRectForZone(DEFAULT_ZONE, W, H), W, H);
    expect([L.x0, L.y0, L.cw, L.ch]).toEqual([0, 0, 1280, 266]);
    expect(L.side).toBe(1280);
    expect([L.ox, L.oy]).toEqual([0, 507]);
  });

  it("a tall crop is padded left and right", () => {
    const L = cropLayout({ x: 0.4, y: 0, w: 0.1, h: 0.9 }, W, H);
    expect(L.side).toBe(L.ch);
    expect(L.ox).toBe(Math.floor((L.side - L.cw) / 2));
    expect(L.oy).toBe(0);
  });

  it("stays inside the frame whatever the rounding", () => {
    const L = cropLayout({ x: 0.9999, y: 0.9999, w: 0.5, h: 0.5 }, W, H);
    expect(L.x0 + L.cw).toBeLessThanOrEqual(W);
    expect(L.y0 + L.ch).toBeLessThanOrEqual(H);
  });
});

describe("magnification: how much bigger a hand is to the model (its long side scales the input)", () => {
  it("the default full-width zone gives NONE (1.0x): the crop is as wide as the frame", () => {
    expect(magnification(cropLayout(cropRectForZone(DEFAULT_ZONE, W, H), W, H))).toBeCloseTo(1, 6);
  });

  it("narrowing the zone is what magnifies: a half-width quarter-height zone is about 1.6x, a third of the width about 2.2x", () => {
    const half = magnification(cropLayout(cropRectForZone({ x: 0.5, y: 0, w: 0.5, h: 0.25 }, W, H), W, H));
    expect(half).toBeCloseTo(W / (0.5 * W + ZOOM.margin * H), 1);
    expect(half).toBeGreaterThan(1.5);
    const third = magnification(cropLayout(cropRectForZone({ x: 0.3, y: 0, w: 0.33, h: 0.25 }, W, H), W, H));
    expect(third).toBeGreaterThan(2.1);
  });

  it("no zoom (the whole frame) is 1x by definition", () => {
    expect(magnification(cropLayout(cropRectForZone(PRESETS.whole, W, H), W, H))).toBe(1);
  });
});

describe("landmark mapping: model canvas <-> full frame", () => {
  const rects = [
    cropRectForZone(DEFAULT_ZONE, W, H), // wide: padded top and bottom
    cropRectForZone({ x: 0.55, y: 0.1, w: 0.2, h: 0.5 }, W, H), // tall: padded left and right
    cropRectForZone({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, W, H),
    { x: 0, y: 0, w: 1, h: 1 }, // the whole frame (16:9, padded top and bottom)
  ];
  const sample = [
    { x: 0.5, y: 0.5, z: 0.01 },
    { x: 0.05, y: 0.02, z: -0.02 },
    { x: 0.95, y: 0.3, z: 0 },
  ];

  it("round trip: full frame -> model canvas -> full frame returns the same landmark (incl. the aspect padding)", () => {
    for (const rect of rects) {
      const L = cropLayout(rect, W, H);
      for (const p of sample) {
        const back = toFullFrame(fromFullFrame(p, L), L);
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
        expect(back.z).toBeCloseTo(p.z, 9);
      }
    }
  });

  it("the crop's corners land where the padding says; its centre is the canvas centre (a crop pixel is a source pixel, no scaling)", () => {
    const L = cropLayout(rects[0], W, H);
    const tl = fromFullFrame({ x: L.x0 / W, y: L.y0 / H, z: 0 }, L);
    expect(tl.x).toBeCloseTo(L.ox / L.side, 9);
    expect(tl.y).toBeCloseTo(L.oy / L.side, 9);
    const c = fromFullFrame({ x: (L.x0 + L.cw / 2) / W, y: (L.y0 + L.ch / 2) / H, z: 0 }, L);
    expect(c.x).toBeCloseTo(0.5, 2);
    expect(c.y).toBeCloseTo(0.5, 2);
  });

  it("geometry is not distorted: pixel distances between landmarks survive the round trip (isotropic, any crop shape)", () => {
    const hand = shapes.victory("Right", { at: { x: 640, y: 120 }, scale: 1.6 });
    const full = hand.map((p) => ({ x: p.x / W, y: p.y / H, z: p.z / W }));
    for (const rect of rects) {
      const L = cropLayout(rect, W, H);
      const inCanvas = full.map((p) => fromFullFrame(p, L));
      // in the model's canvas (square, isotropic at side x side) the hand has the same pixel size as in the frame
      const canvasPx: Point3[] = inCanvas.map((p) => ({ x: p.x * L.side, y: p.y * L.side, z: p.z * L.side }));
      expect(dist(canvasPx[0], canvasPx[12])).toBeCloseTo(dist(hand[0], hand[12]), 6);
      const back = toIsotropic(inCanvas.map((p) => ({ ...toFullFrame(p, L), visibility: 1 })), W, H);
      expect(dist(back[0], back[12])).toBeCloseTo(dist(hand[0], hand[12]), 6);
      expect(dist(back[4], back[8])).toBeCloseTo(dist(hand[4], hand[8]), 6);
    }
  });

  it("insideCrop and the crop as a display-space box (mirrored)", () => {
    const L = cropLayout(cropRectForZone({ x: 0.6, y: 0, w: 0.4, h: 0.25 }, W, H, 0), W, H);
    expect(insideCrop({ x: 0.2, y: 0.1 }, L)).toBe(true); // raw x 0.2 = display x 0.8
    expect(insideCrop({ x: 0.6, y: 0.1 }, L)).toBe(false);
    expect(insideCrop({ x: 0.2, y: 0.4 }, L)).toBe(false);
    const box = cropAsDisplayBox(L);
    expect(box.x).toBeCloseTo(0.6, 2);
    expect(box.w).toBeCloseTo(0.4, 2);
    expect(box.h).toBeCloseTo(0.25, 2);
  });
});

describe("analyze with a crop: the readings equal the no-zoom readings", () => {
  const model = (hands: Point3[][], crop: ReturnType<typeof cropLayout> | null, labels: string[]): GestureRecognizerResult =>
    ({
      landmarks: hands.map((h) => h.map((p) => (crop ? fromFullFrame({ x: p.x / W, y: p.y / H, z: p.z / W }, crop) : { x: p.x / W, y: p.y / H, z: p.z / W }))),
      worldLandmarks: [],
      handedness: labels.map((l) => [{ score: 0.9, index: 0, categoryName: l, displayName: l }]),
      gestures: labels.map(() => [{ score: 0.9, index: 0, categoryName: "Victory", displayName: "" }]),
    }) as unknown as GestureRecognizerResult;

  it("palm centre, thumb side, finger chord and tilt come out the same through the crop and back", () => {
    const hands = [shapes.victory("Left", { at: { x: 900, y: 100 }, scale: 1.5, rollDeg: 20 }), shapes.openPalm("Right", { at: { x: 300, y: 110 }, scale: 1.5, rollDeg: -25 })];
    const L = cropLayout(cropRectForZone(DEFAULT_ZONE, W, H), W, H);
    const plain = analyze(model(hands, null, ["Left", "Right"]), W, H);
    const zoomed = analyze(model(hands, L, ["Left", "Right"]), W, H, (lm) => lm.map((p) => ({ ...p, ...toFullFrame(p, L) })));
    expect(zoomed.map((r) => r.hand)).toEqual(plain.map((r) => r.hand));
    for (let i = 0; i < 2; i++) {
      expect(zoomed[i].palm.x).toBeCloseTo(plain[i].palm.x, 9);
      expect(zoomed[i].palm.y).toBeCloseTo(plain[i].palm.y, 9);
      expect(zoomed[i].thumb.signed).toBeCloseTo(plain[i].thumb.signed, 9);
      expect(zoomed[i].tiltDeg).toBeCloseTo(plain[i].tiltDeg, 6);
      expect(zoomed[i].clawExt).toBeCloseTo(plain[i].clawExt, 9);
      expect(zoomed[i].chord).toEqual(plain[i].chord);
    }
    // and the palm centre is where the fixture put it (display space: x mirrored)
    const want = palmCentre(hands[0].map((p) => ({ x: p.x / W, y: p.y / H })));
    const got = zoomed.find((r) => r.hand === "Left")!.palm;
    expect(got.x).toBeCloseTo(want.x, 9);
    expect(got.y).toBeCloseTo(want.y, 9);
  });
});
