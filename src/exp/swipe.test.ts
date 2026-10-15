import { describe, expect, it } from "vitest";
import { DEFAULT_SWIPE, IDLE_SWIPE, JitterMeter, SwipeMetrics, gainSecOf, scrubBar, stepSwipe, type SwipeInput, type SwipeSettings, type SwipeState } from "./swipe";

const S: SwipeSettings = { gainSec: 20, minSpeed: 0, settleMs: 0, lostGraceMs: 100 };
const inp = (t: number, x: number, o: Partial<SwipeInput> = {}): SwipeInput => ({ t, present: true, inZone: true, x, shapeOk: true, duration: 120, ...o });

/** Steps a list of inputs; returns the outputs. */
function run(inputs: SwipeInput[], s: SwipeSettings = S) {
  let st: SwipeState = IDLE_SWIPE;
  return inputs.map((i) => {
    const o = stepSwipe(st, i, s);
    st = o.state;
    return o;
  });
}

describe("swipe: touch-down and lift", () => {
  it("touches down when the hand enters the zone and lifts when it leaves", () => {
    const outs = run([inp(0, 0.5, { inZone: false }), inp(33, 0.5), inp(66, 0.5), inp(99, 0.5, { inZone: false })]);
    expect(outs.map((o) => o.edge)).toEqual([null, "down", null, "up"]);
    expect(outs.map((o) => o.touching)).toEqual([false, true, true, false]);
  });

  it("the touch-down frame itself scrubs nothing (relative: it starts from where the hand arrived)", () => {
    const [o] = run([inp(0, 0.9)]);
    expect(o.edge).toBe("down");
    expect(o.deltaSec).toBe(0);
  });

  it("does not touch down outside the zone, without the hand, or with the wrong shape", () => {
    const outs = run([inp(0, 0.5, { inZone: false }), inp(33, 0.5, { present: false }), inp(66, 0.5, { shapeOk: false })]);
    expect(outs.every((o) => !o.touching)).toBe(true);
  });

  it("lifts at once when the shape stops being acceptable", () => {
    const outs = run([inp(0, 0.5), inp(33, 0.5), inp(66, 0.5, { shapeOk: false })]);
    expect(outs[2].edge).toBe("up");
  });

  it("keeps the touch through a dropped frame or two, and lifts after the grace", () => {
    const outs = run([inp(0, 0.5), inp(33, 0.5), inp(66, 0.5, { present: false }), inp(99, 0.5, { present: false }), inp(132, 0.5, { present: false }), inp(165, 0.5, { present: false })]);
    expect(outs.map((o) => o.touching)).toEqual([true, true, true, true, true, false]);
    expect(outs[5].edge).toBe("up");
  });

  it("re-entering touches down again", () => {
    const outs = run([inp(0, 0.5), inp(33, 0.5, { inZone: false }), inp(66, 0.2), inp(99, 0.3)]);
    expect(outs.map((o) => o.edge)).toEqual(["down", "up", "down", null]);
  });
});

describe("swipe: the scrub mapping", () => {
  it("moves the playhead by the hand's movement times the gain (right = forward)", () => {
    const outs = run([inp(0, 0.5), inp(33, 0.6), inp(66, 0.55)]);
    expect(outs[1].deltaSec).toBeCloseTo(0.1 * 20);
    expect(outs[2].deltaSec).toBeCloseTo(-0.05 * 20);
  });

  it("is relative: the same movement scrubs the same from anywhere on the screen", () => {
    const a = run([inp(0, 0.1), inp(33, 0.2)])[1].deltaSec;
    const b = run([inp(0, 0.7), inp(33, 0.8)])[1].deltaSec;
    expect(a).toBeCloseTo(b);
  });

  it("gain 0 means the whole track per picture width (one slider)", () => {
    expect(gainSecOf({ ...S, gainSec: 0 }, 180)).toBe(180);
    const outs = run([inp(0, 0.4, { duration: 180 }), inp(33, 0.5, { duration: 180 })], { ...S, gainSec: 0 });
    expect(outs[1].deltaSec).toBeCloseTo(18);
  });

  it("ignores speeds under the minimum (rest jitter), but still reports the raw movement", () => {
    const s = { ...S, minSpeed: 0.05 };
    // 0.001 per 33 ms = 0.03 widths/s: below.
    const slow = run([inp(0, 0.5), inp(33, 0.501)], s)[1];
    expect(slow.deltaSec).toBe(0);
    expect(slow.rawSec).toBeCloseTo(0.02);
    // 0.01 per 33 ms = 0.3 widths/s: above.
    expect(run([inp(0, 0.5), inp(33, 0.51)], s)[1].deltaSec).toBeCloseTo(0.2);
  });

  it("ignores movement during the settle time after touch-down", () => {
    const s = { ...S, settleMs: 100 };
    const outs = run([inp(0, 0.5), inp(33, 0.6), inp(66, 0.7), inp(133, 0.8)], s);
    expect(outs[1].deltaSec).toBe(0);
    expect(outs[2].deltaSec).toBe(0);
    expect(outs[3].deltaSec).toBeCloseTo(2);
  });

  it("default settings exist and are sane", () => {
    expect(DEFAULT_SWIPE.gainSec).toBeGreaterThan(0);
    expect(DEFAULT_SWIPE.lostGraceMs).toBeGreaterThan(0);
  });
});

describe("swipe: the measurements", () => {
  /** Plays a hand path (x at each 33 ms frame) through the reducer and the metrics; returns the touch records. */
  function touch(xs: number[], s: SwipeSettings = S) {
    const m = new SwipeMetrics();
    let st: SwipeState = IDLE_SWIPE;
    let t = 0;
    for (const x of xs) {
      const o = stepSwipe(st, inp(t, x), s);
      st = o.state;
      m.push(t, o, false);
      t += 33;
    }
    const o = stepSwipe(st, inp(t, xs[xs.length - 1], { inZone: false }), s);
    m.push(t, o, false);
    return m.records;
  }

  it("a clean swipe: net scrub, duration, and no accidental scrub at the ends", () => {
    // Still for 10 frames, a sweep of 0.3 over 10 frames, still for 10 frames.
    const xs = [...Array(10).fill(0.4), ...Array.from({ length: 10 }, (_, i) => 0.4 + (0.3 * (i + 1)) / 10), ...Array(10).fill(0.7)];
    const [r] = touch(xs, { ...S, minSpeed: 0.05 });
    expect(r.netSec).toBeCloseTo(0.3 * 20, 3);
    expect(r.downRawSec).toBeCloseTo(0, 5);
    expect(r.upRawSec).toBeCloseTo(0, 5);
    expect(r.durMs).toBeGreaterThan(900);
  });

  it("counts the scrub made while arriving: the hand drifts sideways as it enters and as it leaves", () => {
    // 5 frames arriving at 0.005/frame, then still, then 5 frames leaving at 0.005/frame.
    const xs = [...Array.from({ length: 5 }, (_, i) => 0.5 + 0.005 * i), ...Array(30).fill(0.52), ...Array.from({ length: 5 }, (_, i) => 0.52 + 0.005 * (i + 1))];
    const [r] = touch(xs, { ...S, minSpeed: 0 });
    expect(r.downRawSec).toBeCloseTo(0.02 * 20, 3);
    expect(r.upRawSec).toBeCloseTo(0.025 * 20, 3);
    // The dead-band (minSpeed above the drift's 0.15 widths/s) removes it from what is applied, in this case entirely.
    const [m] = touch(xs, { ...S, minSpeed: 0.2 });
    expect(m.downAppliedSec).toBe(0);
    expect(m.upAppliedSec).toBe(0);
    expect(m.downRawSec).toBeCloseTo(r.downRawSec, 5);
  });

  it("stop latency: the time from the hand stopping to the last scrub movement", () => {
    // Fast for 10 frames, then dead still for 15 frames: with no dead-band the scrub stops with the hand (latency 0).
    const xs = [...Array.from({ length: 10 }, (_, i) => 0.3 + 0.02 * (i + 1)), ...Array(15).fill(0.5)];
    const [r] = touch(xs, S);
    expect(r.stopLatencyMs).toBe(0);
  });

  it("stop latency is null when the hand never moved fast, or left before it stopped", () => {
    const [still] = touch(Array(20).fill(0.5), S);
    expect(still.stopLatencyMs).toBeNull();
    const [left] = touch(Array.from({ length: 10 }, (_, i) => 0.3 + 0.02 * i), S);
    expect(left.stopLatencyMs).toBeNull();
  });

  it("stop latency counts a seek that came after the hand stopped", () => {
    const m = new SwipeMetrics();
    const f = (t: number, speed: number, seek = false, edge: "down" | "up" | null = null) => m.push(t, { edge, touching: edge !== "up", rawSec: 0, deltaSec: 0, speed }, seek);
    f(0, 0, false, "down");
    f(33, 0.5);
    f(66, 0.5);
    for (let t = 99; t < 400; t += 33) f(t, 0, t === 198);
    const rec = f(433, 0, false, "up")!;
    expect(rec.stopLatencyMs).toBe(198 - 66);
  });

  it("the jitter meter reports scrub-seconds per second of holding still, raw and applied", () => {
    const j = new JitterMeter();
    j.start(0, 2);
    for (let t = 33; t <= 2100; t += 33) j.push(t, true, 0.01, 0);
    expect(j.running).toBe(false);
    expect(j.result!.rawPerSec).toBeGreaterThan(0.2);
    expect(j.result!.appliedPerSec).toBe(0);
    expect(j.result!.touchedFrac).toBeGreaterThan(0.9);
  });

  it("the jitter meter separates the flicker (path length) from the net drift (where the playhead ends up)", () => {
    const j = new JitterMeter();
    j.start(0, 2);
    // +0.01 / -0.01 alternating: a lot of path, no drift.
    for (let t = 33, i = 0; t <= 2100; t += 33, i++) j.push(t, true, i % 2 ? -0.01 : 0.01, i % 2 ? -0.01 : 0.01);
    expect(j.result!.rawPerSec).toBeGreaterThan(0.2);
    expect(Math.abs(j.result!.netRawSec)).toBeLessThan(0.011);
    expect(Math.abs(j.result!.netAppliedSec)).toBeLessThan(0.011);
  });

  it("the jitter meter only counts time with the hand down", () => {
    const j = new JitterMeter();
    j.start(0, 1);
    for (let t = 33; t <= 1100; t += 33) j.push(t, false, 0, 0);
    expect(j.result!.touchedFrac).toBe(0);
  });
});

describe("scrub bar", () => {
  it("keeps the time under the hand at the middle and puts ticks where their times are", () => {
    const b = scrubBar(30, 10, 120);
    expect(b.ticks.length).toBeGreaterThan(3);
    for (const t of b.ticks) expect(t.frac).toBeCloseTo((t.sec - 25) / 10, 6);
    expect(b.startFrac).toBeNull();
  });

  it("shows the start and the end of the track when they are within the bar", () => {
    expect(scrubBar(2, 10, 120).startFrac).toBeCloseTo(0.3);
    expect(scrubBar(118, 10, 120).endFrac).toBeCloseTo(0.7);
    // No ticks before 0 or after the end.
    const b = scrubBar(2, 10, 120);
    expect(Math.min(...b.ticks.map((t) => t.sec))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...scrubBar(118, 10, 120).ticks.map((t) => t.sec))).toBeLessThanOrEqual(120);
  });
});
