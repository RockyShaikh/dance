import { describe, expect, it } from "vitest";
import { CLUTCH } from "./config";
import { LM, type Point3 } from "./hand";
import { clawExtension, palmCentre, pinchRatio } from "./handFeatures";
import { makeHand, shapes, chord } from "./test/fixtures";

const W = 1280;
const H = 720;

const toNorm = (pts: Point3[]) => pts.map((p) => ({ x: p.x / W, y: p.y / H }));

/** Same hand, with the thumb tip moved to `gap` palm sizes from the index tip. */
function withPinch(pts: Point3[], gap: number): Point3[] {
  const out = pts.map((p) => ({ ...p }));
  const palm = Math.hypot(pts[LM.MIDDLE_MCP].x - pts[LM.WRIST].x, pts[LM.MIDDLE_MCP].y - pts[LM.WRIST].y);
  out[LM.THUMB_TIP] = { x: pts[LM.INDEX_TIP].x + gap * palm, y: pts[LM.INDEX_TIP].y, z: pts[LM.INDEX_TIP].z };
  return out;
}

describe("palmCentre (display coordinates)", () => {
  it("is the mean of the wrist and the four knuckles, with x mirrored", () => {
    const raw = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    raw[LM.WRIST] = { x: 0.1, y: 0.9 };
    raw[LM.INDEX_MCP] = { x: 0.2, y: 0.5 };
    raw[LM.MIDDLE_MCP] = { x: 0.3, y: 0.5 };
    raw[LM.RING_MCP] = { x: 0.4, y: 0.5 };
    raw[LM.PINKY_MCP] = { x: 0.5, y: 0.5 };
    // mean raw x = 0.3, y = 0.58; display x = 1 - 0.3
    const c = palmCentre(raw);
    expect(c.x).toBeCloseTo(0.7);
    expect(c.y).toBeCloseTo(0.58);
  });

  it("ignores fingertips and thumb", () => {
    const hand = toNorm(shapes.openPalm("Right", { at: { x: 900, y: 500 } }));
    const fist = toNorm(shapes.fist("Right", { at: { x: 900, y: 500 } }));
    const a = palmCentre(hand);
    const b = palmCentre(fist);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });

  it("a hand on the right of the raw frame is on the LEFT of the display", () => {
    const raw = toNorm(shapes.openPalm("Right", { at: { x: 1000, y: 360 } }));
    expect(palmCentre(raw).x).toBeLessThan(0.5);
    const rawLeft = toNorm(shapes.openPalm("Right", { at: { x: 280, y: 360 } }));
    expect(palmCentre(rawLeft).x).toBeGreaterThan(0.5);
  });
});

describe("pinchRatio", () => {
  it("is near 0 with the tips together and large for an open hand", () => {
    const open = shapes.openPalm("Right");
    expect(pinchRatio(open)).toBeGreaterThan(0.8);
    expect(pinchRatio(withPinch(open, 0.02))).toBeLessThan(0.1);
  });

  it("does not depend on hand size (distance from the camera)", () => {
    const near = shapes.openPalm("Right", { scale: 5 });
    const far = shapes.openPalm("Right", { scale: 1 });
    expect(pinchRatio(near)).toBeCloseTo(pinchRatio(far), 6);
  });
});

describe("clawExtension", () => {
  const ext = (curl: number) => clawExtension(makeHand({ hand: "Right", fingers: chord("11111"), curl }));

  it("is high for an open hand and low for a fist", () => {
    expect(ext(0)).toBeGreaterThanOrEqual(CLUTCH.claw.openExt);
    expect(clawExtension(shapes.fist("Right"))).toBeLessThan(CLUTCH.claw.minExt);
  });

  it("falls monotonically as the fingers curl, and a half-curl lands in the claw band", () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map(ext);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
    const half = ext(0.5);
    expect(half).toBeGreaterThanOrEqual(CLUTCH.claw.minExt);
    expect(half).toBeLessThanOrEqual(CLUTCH.claw.maxExt);
  });
});
