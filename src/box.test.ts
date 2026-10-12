import { describe, expect, it } from "vitest";
import { PRESETS, applyDrag, contains, cursorFor, hitTest, normalizeBox, type Box } from "./box";

const MIN = 0.08;
const TOL = { x: 0.01, y: 0.02 };
const box: Box = { x: 0.5, y: 0.25, w: 0.4, h: 0.5 };

describe("contains", () => {
  it("is true inside and on the edges, false outside", () => {
    expect(contains(box, { x: 0.7, y: 0.5 })).toBe(true);
    expect(contains(box, { x: 0.5, y: 0.25 })).toBe(true);
    expect(contains(box, { x: 0.9, y: 0.75 })).toBe(true);
    expect(contains(box, { x: 0.49, y: 0.5 })).toBe(false);
    expect(contains(box, { x: 0.7, y: 0.76 })).toBe(false);
  });

  it("presets: right half, left half, whole frame", () => {
    expect(contains(PRESETS.right, { x: 0.75, y: 0.5 })).toBe(true);
    expect(contains(PRESETS.right, { x: 0.25, y: 0.5 })).toBe(false);
    expect(contains(PRESETS.left, { x: 0.25, y: 0.5 })).toBe(true);
    expect(contains(PRESETS.left, { x: 0.75, y: 0.5 })).toBe(false);
    expect(contains(PRESETS.whole, { x: 0.01, y: 0.99 })).toBe(true);
  });
});

describe("hitTest", () => {
  it("inside, away from the edges, grabs the whole box to move it", () => {
    expect(hitTest(box, { x: 0.7, y: 0.5 }, TOL)).toBe("move");
  });

  it("finds each edge", () => {
    expect(hitTest(box, { x: 0.7, y: 0.25 }, TOL)).toBe("n");
    expect(hitTest(box, { x: 0.7, y: 0.75 }, TOL)).toBe("s");
    expect(hitTest(box, { x: 0.5, y: 0.5 }, TOL)).toBe("w");
    expect(hitTest(box, { x: 0.9, y: 0.5 }, TOL)).toBe("e");
  });

  it("finds each corner", () => {
    expect(hitTest(box, { x: 0.5, y: 0.25 }, TOL)).toBe("nw");
    expect(hitTest(box, { x: 0.9, y: 0.25 }, TOL)).toBe("ne");
    expect(hitTest(box, { x: 0.5, y: 0.75 }, TOL)).toBe("sw");
    expect(hitTest(box, { x: 0.9, y: 0.75 }, TOL)).toBe("se");
  });

  it("catches a click slightly outside an edge, and nothing further away", () => {
    expect(hitTest(box, { x: 0.495, y: 0.5 }, TOL)).toBe("w");
    expect(hitTest(box, { x: 0.7, y: 0.765 }, TOL)).toBe("s");
    expect(hitTest(box, { x: 0.4, y: 0.5 }, TOL)).toBeNull();
    expect(hitTest(box, { x: 0.7, y: 0.9 }, TOL)).toBeNull();
  });

  it("on a tiny box the edge zones leave the middle for moving", () => {
    const tiny: Box = { x: 0.4, y: 0.4, w: 0.09, h: 0.09 };
    expect(hitTest(tiny, { x: 0.445, y: 0.445 }, { x: 0.05, y: 0.05 })).toBe("move");
  });
});

describe("applyDrag", () => {
  it("move translates and keeps the size", () => {
    const b = applyDrag(box, "move", -0.1, 0.1, MIN);
    expect(b.x).toBeCloseTo(0.4);
    expect(b.y).toBeCloseTo(0.35);
    expect(b.w).toBeCloseTo(0.4);
    expect(b.h).toBeCloseTo(0.5);
  });

  it("move stops at the frame edges instead of squashing", () => {
    const b = applyDrag(box, "move", 5, 5, MIN);
    expect(b).toEqual({ x: 0.6, y: 0.5, w: 0.4, h: 0.5 });
    const c = applyDrag(box, "move", -5, -5, MIN);
    expect(c).toEqual({ x: 0, y: 0, w: 0.4, h: 0.5 });
  });

  it("edges resize one side and leave the opposite edge fixed", () => {
    const e = applyDrag(box, "e", -0.1, 0, MIN);
    expect(e.x).toBeCloseTo(0.5);
    expect(e.w).toBeCloseTo(0.3);
    const w = applyDrag(box, "w", -0.2, 0, MIN);
    expect(w.x).toBeCloseTo(0.3);
    expect(w.x + w.w).toBeCloseTo(0.9);
    const n = applyDrag(box, "n", 0, 0.1, MIN);
    expect(n.y).toBeCloseTo(0.35);
    expect(n.y + n.h).toBeCloseTo(0.75);
    const s = applyDrag(box, "s", 0, 0.1, MIN);
    expect(s.h).toBeCloseTo(0.6);
    expect(s.y).toBeCloseTo(0.25);
  });

  it("corners resize two sides at once", () => {
    const b = applyDrag(box, "nw", -0.1, -0.05, MIN);
    expect(b.x).toBeCloseTo(0.4);
    expect(b.y).toBeCloseTo(0.2);
    expect(b.x + b.w).toBeCloseTo(0.9);
    expect(b.y + b.h).toBeCloseTo(0.75);
    const c = applyDrag(box, "se", 0.05, 0.1, MIN);
    expect(c.x).toBeCloseTo(0.5);
    expect(c.w).toBeCloseTo(0.45);
    expect(c.h).toBeCloseTo(0.6);
  });

  it("cannot be dragged inside out or smaller than the minimum", () => {
    const e = applyDrag(box, "e", -5, 0, MIN);
    expect(e.w).toBeCloseTo(MIN);
    expect(e.x).toBeCloseTo(0.5);
    const w = applyDrag(box, "w", 5, 0, MIN);
    expect(w.w).toBeCloseTo(MIN);
    expect(w.x + w.w).toBeCloseTo(0.9);
    const n = applyDrag(box, "n", 0, 5, MIN);
    expect(n.h).toBeCloseTo(MIN);
  });

  it("cannot be dragged outside the frame", () => {
    const b = applyDrag(box, "se", 5, 5, MIN);
    expect(b.x + b.w).toBeCloseTo(1);
    expect(b.y + b.h).toBeCloseTo(1);
    const c = applyDrag(box, "nw", -5, -5, MIN);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });
});

describe("a moved or resized box changes what counts as inside, immediately", () => {
  it("moving the box onto a point that was outside brings it inside", () => {
    const p = { x: 0.2, y: 0.5 };
    expect(contains(box, p)).toBe(false);
    expect(contains(applyDrag(box, "move", -0.4, 0, MIN), p)).toBe(true);
  });

  it("resizing the left edge out to include a point", () => {
    const p = { x: 0.2, y: 0.5 };
    expect(contains(applyDrag(box, "w", -0.35, 0, MIN), p)).toBe(true);
  });

  it("shrinking excludes a point that was inside", () => {
    const p = { x: 0.88, y: 0.5 };
    expect(contains(box, p)).toBe(true);
    expect(contains(applyDrag(box, "e", -0.2, 0, MIN), p)).toBe(false);
  });
});

describe("normalizeBox and cursors", () => {
  it("pulls a bad box back into the frame at least minimum size", () => {
    const b = normalizeBox({ x: 0.95, y: -0.2, w: 0.5, h: 0.01 }, MIN);
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.h).toBeGreaterThanOrEqual(MIN);
  });

  it("maps handles to cursors", () => {
    expect(cursorFor("move")).toBe("move");
    expect(cursorFor("e")).toBe("ew-resize");
    expect(cursorFor("n")).toBe("ns-resize");
    expect(cursorFor("ne")).toBe("nesw-resize");
    expect(cursorFor("se")).toBe("nwse-resize");
    expect(cursorFor(null)).toBe("default");
  });
});
