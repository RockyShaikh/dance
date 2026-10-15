import { describe, expect, it } from "vitest";
import { IDLE_DETECTOR, stepDetector, type DetectorConfig, type DetectorEvent, type DetectorState } from "./pushDetector";

const CFG: DetectorConfig = { enter: 0.1, fallFrac: 0.6, maxRiseMs: 600, lateralMax: 0.8, refractoryMs: 600 };

/** Runs (t, v, lateral) triples through the detector and returns every event. */
function run(trace: [number, number | null, number?][], cfg = CFG): DetectorEvent[] {
  let s: DetectorState = IDLE_DETECTOR;
  const out: DetectorEvent[] = [];
  for (const [t, v, lat] of trace) {
    const r = stepDetector(s, { t, v, lateral: lat ?? 0 }, cfg);
    s = r.state;
    if (r.event) out.push(r.event);
  }
  return out;
}

/** A tent: 0 until t0, up to `peak` over `riseMs`, back down over `fallMs`, at 30 fps. */
function tent(t0: number, riseMs: number, fallMs: number, peak: number, lat = 0): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let t = 0; t <= t0 + riseMs + fallMs + 300; t += 33) {
    const v = t < t0 ? 0 : t < t0 + riseMs ? (peak * (t - t0)) / riseMs : t < t0 + riseMs + fallMs ? peak * (1 - (t - t0 - riseMs) / fallMs) : 0;
    out.push([t, v, lat]);
  }
  return out;
}

describe("push detector", () => {
  it("fires once when a fast rise stops, not before", () => {
    const events = run(tent(300, 200, 250, 0.2));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("push");
    // It fires after the peak, once the signal has fallen to 60% of it, not at the peak.
    expect(events[0].t).toBeGreaterThan(events[0].peakT);
    expect(events[0].peak).toBeCloseTo(0.2, 1);
  });

  it("ignores a signal that never reaches the threshold", () => {
    expect(run(tent(300, 200, 250, 0.07))).toEqual([]);
  });

  it("rejects a rise that goes on for longer than maxRiseMs as a slow approach", () => {
    const events = run(tent(300, 1500, 500, 0.3));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("reject");
    expect(events[0].reason).toBe("slow");
  });

  it("rejects a push the palm swept sideways through (an arm swing)", () => {
    const events = run(tent(300, 200, 250, 0.2, 1.4));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "reject", reason: "swing" });
    expect(events[0].lateral).toBeCloseTo(1.4);
  });

  it("stays quiet for the refractory time, so one push is one event", () => {
    // Two tents 300 ms apart (the second inside the 600 ms refractory + quiet rule): one event.
    const a = tent(300, 200, 250, 0.2);
    const b = tent(1000, 200, 250, 0.2).map(([t, v, l]) => [t, v, l] as [number, number, number]);
    const merged = a.map(([t, v, l], i) => [t, Math.max(v, b[i]?.[1] ?? 0), l] as [number, number, number]);
    expect(run(merged).filter((e) => e.kind === "push")).toHaveLength(1);
    // Far apart: two events.
    const far = [...tent(300, 200, 250, 0.2), ...tent(300, 200, 250, 0.2).map(([t, v, l]) => [t + 2000, v, l] as [number, number, number])];
    expect(run(far).filter((e) => e.kind === "push")).toHaveLength(2);
  });

  it("drops a rise silently when the signal goes missing (the hand was lost)", () => {
    const trace: [number, number | null, number?][] = [
      [0, 0],
      [33, 0.15],
      [66, 0.2],
      [100, null],
      [133, null],
      [166, 0],
      [200, 0],
    ];
    expect(run(trace)).toEqual([]);
  });

  it("can fire again once the signal is back to quiet", () => {
    const events = run([...tent(0, 200, 250, 0.2), ...tent(0, 200, 250, 0.2).map(([t, v, l]) => [t + 3000, v, l] as [number, number, number])]);
    expect(events.map((e) => e.kind)).toEqual(["push", "push"]);
  });
});
