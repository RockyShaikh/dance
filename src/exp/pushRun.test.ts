import { describe, expect, it } from "vitest";
import { PUSH_KEYS } from "./config";
import { runTrajectory, score } from "./pushRun";
import { trajectory, type TrajName } from "./trajectories";

/**
 * The detector on synthetic traces from a physical scene: a true push vs a slow approach vs a dance arm swing. The scene is a
 * pinhole camera, a two-bone arm and a hand whose size follows perspective (simScene.ts), with the noise a hand model would add.
 * This checks the LOGIC. The sensitivity of a real pose / hand model at distance is what the recordings are for.
 */
const detect = (name: TrajName, dist: number, seed = 1, extra: { dz?: number } = {}) => {
  const t = trajectory(name, { dist, ...extra });
  return { t, run: runTrajectory(t, { seed }) };
};

describe("push vs slow approach vs arm swing (synthetic)", () => {
  it("detects the true pushes with the combined signal (3 of 3) at 2, 3 and 4 m, at several noise seeds, with no extra ones", () => {
    for (const dist of [2, 3, 4]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const { t, run } = detect("push", dist, seed);
        const s = score(run.events, "d", t.truth);
        expect(s.hits, `${dist} m seed ${seed}`).toBe(3);
        expect(s.falsePushes, `${dist} m seed ${seed}`).toBe(0);
      }
    }
  });

  it("a push fires after it stops (not during it), and starts being tracked when it starts", () => {
    const { run } = detect("push", 2);
    const first = run.events.find((e) => e.signal === "d" && e.kind === "push")!;
    expect(first.t0 / 1000).toBeGreaterThan(0.95);
    expect(first.t0 / 1000).toBeLessThan(1.4);
    expect(first.t).toBeGreaterThan(first.peakT);
  });

  it("the combined signal does not fire on a slow approach (a walk toward the camera with the arm coming forward)", () => {
    for (const dist of [2, 3]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const { run } = detect("slow", dist, seed);
        expect(score(run.events, "d", []).falsePushes, `d at ${dist} m seed ${seed}`).toBe(0);
        expect(score(run.events, "b", []).falsePushes, `b at ${dist} m seed ${seed}`).toBe(0);
      }
    }
  });

  it("the palm size alone IS fooled by a walk toward the camera at 2 m (size is perspective: it cannot tell a step from a push)", () => {
    const fooled = [1, 2, 3, 4, 5].reduce((n, seed) => n + score(detect("slow", 2, seed).run.events, "a", []).falsePushes, 0);
    expect(fooled).toBeGreaterThan(0);
  });

  it("does not fire on a dance arm swing (it sweeps sideways: rejected, or never reaching the threshold)", () => {
    for (const dist of [2, 3, 4]) {
      for (const seed of [1, 2, 3]) {
        const { run } = detect("swing", dist, seed);
        for (const k of PUSH_KEYS) expect(score(run.events, k, []).falsePushes, `${k} at ${dist} m seed ${seed}`).toBe(0);
      }
    }
  });

  it("the swing is rejected because of the sideways travel (that is the rule at work)", () => {
    const { run } = detect("swing", 2);
    expect(run.events.some((e) => e.kind === "reject" && e.reason === "swing")).toBe(true);
  });

  it("a hand at rest makes no events from the combined, size or forearm signals, with noise (the depth signal alone chatters once the pose depth noise is 4+ cm: it is only trusted inside the combined one)", () => {
    for (const dist of [2, 3, 4]) {
      const { run } = detect("rest", dist);
      expect(run.events.filter((e) => e.signal !== "c")).toEqual([]);
    }
  });

  it("signals respond in the expected direction on a push: size up, forearm down, depth toward the camera", () => {
    const { run } = detect("push", 2);
    const maxOf = (k: "a" | "b" | "c") => Math.max(...run.samples.map((s) => s[k] ?? -Infinity));
    expect(maxOf("a")).toBeGreaterThan(0.1);
    expect(maxOf("b")).toBeGreaterThan(0.03);
    expect(maxOf("c")).toBeGreaterThan(0.1);
  });
});
