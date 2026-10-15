import { describe, expect, it } from "vitest";
import { TRACK } from "./config";
import { personCropRect, placeCrop, visibleWrists, wristCrop } from "./poseCrop";
import { makePose } from "./test/pose";
import { cropLayout, magnification } from "./zoom";

const W = 1920;
const H = 1080;
const px = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H });
const inside = (r: { x: number; y: number; w: number; h: number }) => {
  for (const v of [r.x, r.y, r.x + r.w, r.y + r.h]) {
    expect(v).toBeGreaterThanOrEqual(-1e-9);
    expect(v).toBeLessThanOrEqual(1 + 1e-9);
  }
};

describe("placeCrop", () => {
  it("centres on the point and is pushed back into the frame, never shrunk", () => {
    const r = placeCrop(100, 100, 600, 600, W, H);
    expect(px(r)).toMatchObject({ x: 0, y: 0, w: 600, h: 600 });
    const br = placeCrop(W - 10, H - 10, 600, 600, W, H);
    expect(px(br).x + px(br).w).toBeCloseTo(W, 6);
    expect(px(br).y + px(br).h).toBeCloseTo(H, 6);
    expect(px(br).w).toBe(600);
  });
  it("a crop bigger than the frame hugs the frame on that axis (not square any more)", () => {
    const r = placeCrop(960, 540, 3000, 3000, W, H);
    expect(r).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("personCropRect: head + shoulders + both hands, room above the head", () => {
  const stand = makePose({ W, H, cx: 960, sy: 500, sw: 200, leftWrist: { x: 800, y: 700 }, rightWrist: { x: 1120, y: 700 } });

  it("contains the shoulders, the head and both hands, and is square when the frame allows", () => {
    const r = personCropRect(stand, W, H)!;
    const p = px(r);
    expect(p.w).toBeCloseTo(p.h, 6);
    for (const [x, y] of [[860, 500], [1060, 500], [960, 390], [800, 700], [1120, 700]]) {
      expect(x).toBeGreaterThanOrEqual(p.x);
      expect(x).toBeLessThanOrEqual(p.x + p.w);
      expect(y).toBeGreaterThanOrEqual(p.y);
      expect(y).toBeLessThanOrEqual(p.y + p.h);
    }
    inside(r);
  });

  it("leaves room above the head for raised hands (about a shoulder width above the head top)", () => {
    const r = personCropRect(stand, W, H)!;
    const headTop = 500 - 0.55 * 200 - 0.08 * 200 - 0.35 * 200; // eyes minus 0.35 units
    expect(px(r).y).toBeLessThanOrEqual(headTop - 0.9 * 200 + 1e-6);
  });

  it("raised hands pull the crop up and out; it still contains them", () => {
    const up = makePose({ W, H, cx: 960, sy: 600, sw: 200, leftWrist: { x: 700, y: 200 }, rightWrist: { x: 1220, y: 150 } });
    const down = makePose({ W, H, cx: 960, sy: 600, sw: 200 });
    const ru = px(personCropRect(up, W, H)!);
    const rd = px(personCropRect(down, W, H)!);
    expect(ru.y).toBeLessThan(rd.y + 1e-6);
    expect(150).toBeGreaterThanOrEqual(ru.y);
    expect(700).toBeGreaterThanOrEqual(ru.x);
    expect(1220).toBeLessThanOrEqual(ru.x + ru.w);
  });

  it("is clamped to the frame (pushed back, not shrunk) for a person at the edge", () => {
    const edge = makePose({ W, H, cx: 250, sy: 500, sw: 200, leftWrist: { x: 90, y: 700 }, rightWrist: { x: 410, y: 700 } });
    const r = personCropRect(edge, W, H)!;
    inside(r);
    const centred = px(personCropRect(stand, W, H)!);
    expect(px(r).w).toBeCloseTo(centred.w, 3);
    expect(r.x).toBe(0);
  });

  it("never smaller than the minimum (a far person is a small box)", () => {
    const far = makePose({ W, H, cx: 960, sy: 500, sw: 30 });
    const r = personCropRect(far, W, H)!;
    expect(px(r).h).toBeGreaterThanOrEqual(TRACK.person.minSideFrac * H - 1e-6);
    expect(px(r).w).toBeGreaterThanOrEqual(TRACK.person.minSideFrac * H - 1e-6);
    // Also the magnification for the model is at most 1 / minSide... (long side of the frame over the crop's long side)
    expect(magnification(cropLayout(r, W, H))).toBeLessThanOrEqual(W / (TRACK.person.minSideFrac * H) + 1e-6);
  });

  it("never bigger than the frame (a person who fills it gets the whole frame height)", () => {
    const big = makePose({ W, H, cx: 960, sy: 500, sw: 1400, leftWrist: { x: 100, y: 1000 }, rightWrist: { x: 1800, y: 1000 } });
    const r = personCropRect(big, W, H)!;
    inside(r);
    expect(r.h).toBeCloseTo(1, 6);
    expect(r.w).toBeLessThanOrEqual(1);
  });

  it("the crop on whole pixels pads to a square with NO stretching (square crop: no padding at all)", () => {
    const L = cropLayout(personCropRect(stand, W, H)!, W, H);
    expect(L.cw).toBe(L.ch);
    expect([L.ox, L.oy]).toEqual([0, 0]);
    expect(L.side).toBe(L.cw);
  });

  it("points the pose is unsure of are left out; nothing in view gives null", () => {
    const noHands = makePose({ W, H, cx: 960, sy: 500, sw: 200, leftWrist: null, rightWrist: null });
    expect(personCropRect(noHands, W, H)).not.toBeNull();
    const none = noHands.map((p) => ({ ...p, visibility: 0 }));
    expect(personCropRect(none, W, H)).toBeNull();
    expect(personCropRect([], W, H)).toBeNull();
  });

  it("with no head in view there is still head room above the shoulders", () => {
    const nohead = makePose({ W, H, cx: 960, sy: 600, sw: 200, head: false });
    const r = px(personCropRect(nohead, W, H)!);
    expect(r.y).toBeLessThan(600 - 200);
  });
});

describe("wristCrop: a square crop per wrist", () => {
  const pose = makePose({ W, H, cx: 960, sy: 500, sw: 200, leftWrist: { x: 700, y: 400 }, rightWrist: { x: 1300, y: 300 } });

  it("is centred a little past the wrist toward the knuckles, and the anchor is the wrist", () => {
    const c = wristCrop(pose, "right", W, H)!;
    const p = px(c.rect);
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    // The hand points go up and to the right of the wrist (away from the shoulder).
    expect(cx).toBeGreaterThan(1300);
    expect(cy).toBeLessThan(300);
    expect(Math.hypot(cx - 1300, cy - 300)).toBeLessThan(120);
    expect(c.anchor.x).toBeCloseTo(1300 / W, 9);
    expect(c.anchor.y).toBeCloseTo(300 / H, 9);
  });

  it("left and right use their own arm (pose 15 is the left wrist)", () => {
    const l = wristCrop(pose, "left", W, H)!;
    expect(l.anchor.x).toBeCloseTo(700 / W, 9);
    const only = makePose({ W, H, cx: 960, sy: 500, sw: 200, leftWrist: null, rightWrist: { x: 1300, y: 300 } });
    expect(wristCrop(only, "left", W, H)).toBeNull();
    expect(wristCrop(only, "right", W, H)).not.toBeNull();
  });

  it("is square (in pixels), inside the frame, and sized from the arm: bigger arm, bigger crop", () => {
    const small = makePose({ W, H, cx: 960, sy: 500, sw: 100, rightWrist: { x: 1100, y: 400 } });
    const big = makePose({ W, H, cx: 960, sy: 500, sw: 300, rightWrist: { x: 1300, y: 300 } });
    const a = wristCrop(small, "right", W, H)!;
    const b = wristCrop(big, "right", W, H)!;
    for (const c of [a, b]) {
      expect(px(c.rect).w).toBeCloseTo(px(c.rect).h, 6);
      inside(c.rect);
    }
    expect(px(b.rect).w).toBeGreaterThan(px(a.rect).w);
  });

  it("is clamped between the minimum and maximum side", () => {
    const tiny = makePose({ W, H, cx: 960, sy: 500, sw: 20, rightWrist: { x: 980, y: 480 } });
    expect(px(wristCrop(tiny, "right", W, H)!.rect).w).toBeGreaterThanOrEqual(TRACK.wrist.minSideFrac * H - 1e-6);
    const huge = makePose({ W, H, cx: 960, sy: 400, sw: 1500, rightWrist: { x: 1500, y: 300 } });
    expect(px(wristCrop(huge, "right", W, H)!.rect).w).toBeLessThanOrEqual(TRACK.wrist.maxSideFrac * H + 1e-6);
  });

  it("at the edge of the frame the crop is pushed back in, not shrunk", () => {
    const edge = makePose({ W, H, cx: 960, sy: 500, sw: 200, rightWrist: { x: 1915, y: 5 } });
    const c = wristCrop(edge, "right", W, H)!;
    inside(c.rect);
    // Flush against the top-right corner, and still a full-size square (not cut down to what fits).
    expect(c.rect.y).toBe(0);
    expect(c.rect.x + c.rect.w).toBeCloseTo(1, 9);
    expect(px(c.rect).w).toBeCloseTo(px(c.rect).h, 6);
    expect(px(c.rect).w).toBeGreaterThanOrEqual(TRACK.wrist.minSideFrac * H - 1e-6);
  });

  it("no elbow and no shoulders: the fallback side; no hand points: still a crop along the forearm", () => {
    const base = makePose({ W, H, cx: 960, sy: 500, sw: 200, rightWrist: { x: 1300, y: 300 } });
    const bare = base.map((p, i) => ([11, 12, 13, 14, 17, 18, 19, 20, 21, 22].includes(i) ? { ...p, visibility: 0 } : p));
    const c = wristCrop(bare, "right", W, H)!;
    expect(px(c.rect).w).toBeCloseTo(TRACK.wrist.fallbackSideFrac * H, 6);
    const noHand = base.map((p, i) => ([17, 18, 19, 20, 21, 22].includes(i) ? { ...p, visibility: 0 } : p));
    expect(wristCrop(noHand, "right", W, H)).not.toBeNull();
  });
});

describe("visibleWrists", () => {
  it("lists the wrists the pose sees", () => {
    const both = makePose({ W, H, cx: 960, sy: 500, sw: 200 });
    expect(visibleWrists(both)).toEqual(["left", "right"]);
    const one = makePose({ W, H, cx: 960, sy: 500, sw: 200, leftWrist: null });
    expect(visibleWrists(one)).toEqual(["right"]);
    expect(visibleWrists(null)).toEqual([]);
  });
});
