import { describe, expect, it } from "vitest";
import { PresentedRate, RollingSamples, latencyStats, ms, percentile, statsLine } from "./latency";

describe("latencyStats", () => {
  it("no samples: null", () => {
    expect(latencyStats([])).toBeNull();
    expect(latencyStats([NaN, Infinity])).toBeNull();
  });
  it("one sample is every statistic", () => {
    expect(latencyStats([42])).toEqual({ n: 1, min: 42, median: 42, p95: 42, max: 42, mean: 42 });
  });
  it("median of an odd and an even count", () => {
    expect(latencyStats([30, 10, 20])?.median).toBe(20);
    expect(latencyStats([40, 10, 20, 30])?.median).toBe(25);
  });
  it("p95 is the nearest rank: of 20 samples the 19th, of 100 the 95th", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(twenty, 95)).toBe(19);
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(hundred, 95)).toBe(95);
    expect(percentile(hundred, 100)).toBe(100);
    expect(percentile(hundred, 0)).toBe(1);
  });
  it("order does not matter, min / max / mean", () => {
    const s = latencyStats([100, 20, 60, 40, 80])!;
    expect(s).toMatchObject({ n: 5, min: 20, max: 100, median: 60, mean: 60, p95: 100 });
  });
  it("a slow outlier moves p95 and max but not the median", () => {
    const base = Array.from({ length: 19 }, () => 100);
    const s = latencyStats([...base, 900])!;
    expect(s.median).toBe(100);
    expect(s.p95).toBe(100); // 19th of 20 is still a 100
    expect(s.max).toBe(900);
    expect(latencyStats([...base.slice(1), 900, 900])!.p95).toBe(900);
  });
  it("ignores non-finite values and does not modify its input", () => {
    const input = [3, NaN, 1, 2];
    expect(latencyStats(input)?.n).toBe(3);
    expect(input).toEqual([3, NaN, 1, 2]);
  });
});

describe("RollingSamples", () => {
  it("keeps the last N", () => {
    const r = new RollingSamples(3);
    [1, 2, 3, 4, 5].forEach((v) => r.push(v));
    expect(r.stats()).toMatchObject({ n: 3, min: 3, max: 5 });
    r.clear();
    expect(r.stats()).toBeNull();
  });
});

describe("formatting", () => {
  it("ms and statsLine", () => {
    expect(ms(112.4)).toBe("112 ms");
    expect(ms(null)).toBe("-");
    expect(ms(NaN)).toBe("-");
    expect(statsLine(null)).toBe("-");
    expect(statsLine(latencyStats([10, 20, 30]), 1)).toBe("median 20.0 · p95 30.0 ms (n 3)");
  });
});

describe("PresentedRate", () => {
  it("reports the rate of the frame counter over a window", () => {
    const r = new PresentedRate(1000);
    for (let i = 0; i <= 90; i++) r.push(i * (1000 / 30), i); // 30 fps for 3 s
    expect(r.fps).toBeCloseTo(30, 0);
  });
  it("counts frames the app skipped (the counter jumps)", () => {
    const r = new PresentedRate(1000);
    // the app only gets a callback every 100 ms but the video presented 3 frames each time
    for (let i = 0; i <= 20; i++) r.push(i * 100, i * 3);
    expect(r.fps).toBeCloseTo(30, 0);
  });
  it("a new stream (the counter drops) starts over", () => {
    const r = new PresentedRate(1000);
    for (let i = 0; i <= 40; i++) r.push(i * 33, i);
    expect(r.fps).toBeGreaterThan(20);
    r.push(2000, 0);
    expect(r.fps).toBe(0);
  });
});
