/**
 * R4d: the circling wheel (the default), measured on a simulated hand going round at camera rate with landmark
 * jitter. The headline number is the DIRECTION LATENCY: how far round the hand has really gone when the wheel's
 * report first has the right sign and keeps it. The R4c centre-estimating version needed 120 degrees of a circle
 * (36 % of it, and its first 300 ms were a dead warm-up); the target is within about 90.
 */
import { describe, expect, it } from "vitest";
import { directionLatencyDeg, simulateCircle, type CircleOpts } from "./test/circleSim";

const SCENARIOS: Record<string, CircleOpts> = {
  "clockwise, cold start": {},
  "counter-clockwise": { dir: -1 },
  "after resting 500 ms at the start": { restMs: 500 },
  "small circle (radius 0.05 of the frame height)": { radius: 0.05 },
  "slow (0.5 turn/s)": { revPerSec: 0.5 },
  "fast (1.5 turns/s)": { revPerSec: 1.5 },
  "10 fps camera": { fps: 10 },
  "rough landmarks (jitter 0.004)": { jitter: 0.004 },
};

describe("direction latency: how far round the hand goes before the wheel reports the right direction", () => {
  for (const [name, o] of Object.entries(SCENARIOS)) {
    it(`${name}: within 90 degrees of the hand's travel`, () => {
      const dir = o.dir ?? 1;
      const frames = simulateCircle(o);
      const latency = directionLatencyDeg(frames, dir);
      expect(latency).toBeLessThanOrEqual(90);
    });
  }

  it("the common cases are well under that: within 60 degrees (R4c needed 120)", () => {
    for (const name of ["clockwise, cold start", "counter-clockwise", "after resting 500 ms at the start", "slow (0.5 turn/s)", "fast (1.5 turns/s)"]) {
      const o = SCENARIOS[name];
      expect(directionLatencyDeg(simulateCircle(o), o.dir ?? 1), name).toBeLessThanOrEqual(60);
    }
  });
});

describe("tracking", () => {
  it("what is reported follows what the hand did, within 10 %, over several turns and both ways round", () => {
    for (const dir of [1, -1] as const) {
      const frames = simulateCircle({ dir, circleMs: 4000 });
      const last = frames[frames.length - 1];
      expect(last.reported / last.trueDeg).toBeGreaterThan(0.9);
      expect(last.reported / last.trueDeg).toBeLessThan(1.1);
    }
  });

  it("stopping stops it at once: no further movement from the second frame after the hand halts", () => {
    const frames = simulateCircle({ stopMs: 1500, circleMs: 3000 });
    const stopIdx = frames.findIndex((f) => f.t >= 1500);
    const atStop = frames[stopIdx + 2].reported;
    for (const f of frames.slice(stopIdx + 2)) expect(f.reported).toBe(atStop);
    // ...and it had been moving right up to then.
    expect(frames[stopIdx].reported - frames[stopIdx - 6].reported).toBeGreaterThan(50);
  });

  it("a hand hovering with landmark jitter reports nothing", () => {
    const frames = simulateCircle({ radius: 0, jitter: 0.003, circleMs: 4000 });
    expect(Math.max(...frames.map((f) => Math.abs(f.reported)))).toBe(0);
  });

  it("a hand waving back and forth along a line does not wind the wheel up", () => {
    const frames = simulateCircle({ path: "wave", radius: 0.1, revPerSec: 1.5, circleMs: 4000 });
    expect(Math.max(...frames.map((f) => Math.abs(f.reported)))).toBeLessThan(60);
  });
});
