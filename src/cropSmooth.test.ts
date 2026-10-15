import { describe, expect, it } from "vitest";
import { TRACK } from "./config";
import { cropError, FULL_RECT, IDLE_SMOOTH, smoothStep, type SmoothState } from "./cropSmooth";
import type { CropRect } from "./zoom";

const cfg = TRACK.person.smooth;
const sq = (cx: number, cy: number, s: number): CropRect => ({ x: cx - s / 2, y: cy - s / 2, w: s, h: s });
const centre = (r: CropRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Runs `n` steps of `dt` ms with a constant target. */
function run(s: SmoothState, target: CropRect | null, n: number, dt = 33, t0 = 0, lost: "full" | "drop" = "full", c = cfg): { s: SmoothState; t: number } {
  let t = t0;
  for (let i = 0; i < n; i++) {
    t += dt;
    s = smoothStep(s, target, t, c, lost);
  }
  return { s, t };
}

describe("smoothStep: first target, dead-band and hysteresis", () => {
  it("the first target is adopted as is", () => {
    const target = sq(0.5, 0.5, 0.4);
    const s = smoothStep(IDLE_SMOOTH, target, 1000, cfg, "full");
    expect(s.rect).toEqual(target);
  });

  it("a small wobble of the target inside the dead-band does not move the crop at all", () => {
    const a = sq(0.5, 0.5, 0.4);
    let s = smoothStep(IDLE_SMOOTH, a, 0, cfg, "full");
    let t = 0;
    for (let i = 0; i < 90; i++) {
      t += 33;
      // +-1% of the crop's size in position, +-2% in size: well inside enter (6% / 12%).
      const w = sq(0.5 + (i % 2 ? 0.004 : -0.004), 0.5 + (i % 3 ? 0.003 : -0.003), 0.4 * (i % 2 ? 1.02 : 0.98));
      s = smoothStep(s, w, t, cfg, "full");
    }
    expect(s.rect).toEqual(a);
    expect(s.engaged).toBe(false);
  });

  it("a real move engages the crop: it goes toward the target without overshooting, then stops inside the exit band", () => {
    let s = smoothStep(IDLE_SMOOTH, sq(0.4, 0.5, 0.4), 0, cfg, "full");
    const target = sq(0.6, 0.5, 0.4);
    let last = centre(s.rect!).x;
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 33;
      s = smoothStep(s, target, t, cfg, "full");
      const x = centre(s.rect!).x;
      expect(x).toBeGreaterThanOrEqual(last - 1e-12); // monotone
      expect(x).toBeLessThanOrEqual(0.6 + 1e-9); // no overshoot
      last = x;
    }
    const e = cropError(s.rect!, target);
    expect(e.pos).toBeLessThanOrEqual(cfg.exitPos + 1e-3);
    expect(s.engaged).toBe(false);
  });

  it("hysteresis: once settled just inside the exit band, a drift that is between exit and enter does NOT restart the move", () => {
    let s = smoothStep(IDLE_SMOOTH, sq(0.4, 0.5, 0.4), 0, cfg, "full");
    ({ s } = run(s, sq(0.6, 0.5, 0.4), 120));
    const settled = s.rect!;
    // Drift by 4% of the crop (between exit 2% and enter 6%): the crop stays.
    const drift = sq(centre(settled).x + 0.04 * 0.4, centre(settled).y, 0.4);
    const after = run(s, drift, 60);
    expect(after.s.rect).toEqual(settled);
    // A drift beyond enter (10%) engages again.
    const far = sq(centre(settled).x + 0.1 * 0.4, centre(settled).y, 0.4);
    const moved = run(s, far, 10);
    expect(centre(moved.s.rect!).x).toBeGreaterThan(centre(settled).x);
  });

  it("does not depend on the frame rate: 1 s of 60 fps and 1 s of 15 fps end up in about the same place", () => {
    const start = smoothStep(IDLE_SMOOTH, sq(0.3, 0.5, 0.4), 0, cfg, "full");
    const target = sq(0.6, 0.5, 0.4);
    const a = run(start, target, 60, 1000 / 60).s.rect!;
    const b = run(start, target, 15, 1000 / 15).s.rect!;
    expect(Math.abs(centre(a).x - centre(b).x)).toBeLessThan(0.03);
  });
});

describe("smoothStep: zoom rate limit", () => {
  it("zooming in (crop shrinking) is limited per second", () => {
    let s = smoothStep(IDLE_SMOOTH, sq(0.5, 0.5, 0.9), 0, cfg, "full");
    const target = sq(0.5, 0.5, 0.2);
    let t = 0;
    let prev = s.rect!.w;
    for (let i = 0; i < 30; i++) {
      t += 33;
      s = smoothStep(s, target, t, cfg, "full");
      const ratio = s.rect!.w / prev;
      expect(Math.log(ratio)).toBeGreaterThanOrEqual(-cfg.zoomInPerSec * 0.033 - 1e-9);
      prev = s.rect!.w;
    }
    // After about one second the crop has not got anywhere near the target yet (0.9 -> 0.2 is ln 4.5 = 1.5, and the limit is 0.6/s).
    expect(s.rect!.w).toBeGreaterThan(0.45);
  });

  it("zooming out is faster than zooming in", () => {
    const small = smoothStep(IDLE_SMOOTH, sq(0.5, 0.5, 0.2), 0, cfg, "full");
    const big = smoothStep(IDLE_SMOOTH, sq(0.5, 0.5, 0.9), 0, cfg, "full");
    const out = run(small, sq(0.5, 0.5, 0.9), 15).s.rect!.w / 0.2;
    const inn = 0.9 / run(big, sq(0.5, 0.5, 0.2), 15).s.rect!.w;
    expect(out).toBeGreaterThan(inn);
  });

  it("keeps the rect inside the frame always", () => {
    let s = smoothStep(IDLE_SMOOTH, sq(0.1, 0.1, 0.2), 0, cfg, "full");
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += 33;
      s = smoothStep(s, sq(0.02, 0.98, 0.6), t, cfg, "full");
      const r = s.rect!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("smoothStep: the pose is lost", () => {
  const crop = sq(0.5, 0.5, 0.35);

  it("person mode: the last crop is held for about a second, then relaxes to the full frame (and stays there)", () => {
    let s = smoothStep(IDLE_SMOOTH, crop, 0, cfg, "full");
    // Hold: 0.9 s of nothing.
    let r = run(s, null, 27, 33, 0);
    expect(r.s.rect).toEqual(crop);
    expect(r.s.phase).toBe("holding");
    // Past the second: it grows, monotonically, to the full frame.
    let prevW = r.s.rect!.w;
    let relaxed = false;
    for (let i = 0; i < 200; i++) {
      r.t += 33;
      r.s = smoothStep(r.s, null, r.t, cfg, "full");
      expect(r.s.rect!.w).toBeGreaterThanOrEqual(prevW - 1e-12);
      prevW = r.s.rect!.w;
      if (r.s.phase === "relaxing") relaxed = true;
    }
    expect(relaxed).toBe(true);
    expect(r.s.rect).toEqual(FULL_RECT);
    expect(r.s.phase).toBe("idle");
  });

  it("the relax obeys the zoom-out rate (it takes a moment, it does not jump)", () => {
    let s = smoothStep(IDLE_SMOOTH, crop, 0, cfg, "full");
    const r = run(s, null, 1, 1100, 0); // first missing step: lostSince set now
    const r2 = run(r.s, null, 1, 1000, r.t); // one second more of nothing: relaxing begins
    const r3 = smoothStep(r2.s, null, r2.t + 100, cfg, "full");
    expect(r3.rect!.w / r2.s.rect!.w).toBeLessThanOrEqual(Math.exp(cfg.zoomOutPerSec * 0.1) + 1e-9);
    expect(r3.rect!.w).toBeLessThan(1);
  });

  it("a pose that comes back during the hold cancels it; one that comes back during the relax pulls the crop back", () => {
    let s = smoothStep(IDLE_SMOOTH, crop, 0, cfg, "full");
    let r = run(s, null, 20, 33, 0); // 0.66 s missing
    r = run(r.s, crop, 3, 33, r.t);
    expect(r.s.phase).toBe("tracking");
    expect(r.s.lostSince).toBeNull();
    expect(r.s.rect).toEqual(crop);
    // Lost for 3 s: relaxed some way; the pose returns: the crop shrinks back toward the target.
    r = run(r.s, null, 90, 33, r.t);
    const wide = r.s.rect!.w;
    expect(wide).toBeGreaterThan(crop.w);
    r = run(r.s, crop, 30, 33, r.t);
    expect(r.s.rect!.w).toBeLessThan(wide);
  });

  it("wrist mode (drop): held briefly, then there is no crop at all", () => {
    const c = TRACK.wrist.smooth;
    let s = smoothStep(IDLE_SMOOTH, crop, 0, c, "drop");
    let r = run(s, null, 5, 33, 0, "drop", c); // 165 ms: held
    expect(r.s.rect).toEqual(crop);
    r = run(r.s, null, 20, 33, r.t, "drop", c); // past 300 ms: gone
    expect(r.s.rect).toBeNull();
    // A new target starts straight on it.
    const back = smoothStep(r.s, sq(0.2, 0.2, 0.3), r.t + 33, c, "drop");
    expect(back.rect).toEqual(sq(0.2, 0.2, 0.3));
  });

  it("no target and no crop ever: nothing", () => {
    const s = smoothStep(IDLE_SMOOTH, null, 100, cfg, "full");
    expect(s.rect).toBeNull();
  });
});
