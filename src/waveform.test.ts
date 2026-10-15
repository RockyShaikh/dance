import { describe, expect, it } from "vitest";
import { computePeaks, peakColumns } from "./waveform";

const RATE = 1000;

/** A signal: `v(i)` for sample i. */
const signal = (n: number, v: (i: number) => number): Float32Array => Float32Array.from({ length: n }, (_, i) => v(i));

describe("computePeaks", () => {
  it("takes the lowest and highest sample of each bin", () => {
    const p = computePeaks([Float32Array.of(0.1, -0.5, 0.25, 0.3, -0.2, 0.9, 0, 0)], RATE, 4);
    expect(Array.from(p.min).map((x) => +x.toFixed(2))).toEqual([-0.5, -0.2]);
    expect(Array.from(p.max).map((x) => +x.toFixed(2))).toEqual([0.3, 0.9]);
    expect(p.binSec).toBe(4 / RATE);
    expect(p.duration).toBeCloseTo(8 / RATE, 9);
  });

  it("keeps a short last bin and covers the whole length", () => {
    const p = computePeaks([signal(10, () => 0.5)], RATE, 4);
    expect(p.min.length).toBe(3);
    expect(p.max[2]).toBeCloseTo(0.5, 6);
    expect(p.duration).toBeCloseTo(0.01, 9);
  });

  it("merges channels: the bin holds the widest range over all of them", () => {
    const p = computePeaks([Float32Array.of(0.2, 0.2), Float32Array.of(-0.7, 0.4)], RATE, 2);
    expect(p.min[0]).toBeCloseTo(-0.7, 6);
    expect(p.max[0]).toBeCloseTo(0.4, 6);
  });

  it("silence has zero peaks and gain 1; a quiet track is scaled up, with a cap", () => {
    expect(computePeaks([signal(100, () => 0)], RATE, 10).gain).toBe(1);
    expect(computePeaks([signal(100, () => 0.25)], RATE, 10).gain).toBeCloseTo(4, 5);
    expect(computePeaks([signal(100, () => 0.05)], RATE, 10).gain).toBe(8);
    expect(computePeaks([signal(100, () => 1)], RATE, 10).gain).toBe(1);
  });

  it("an empty input does not throw", () => {
    const p = computePeaks([new Float32Array(0)], RATE, 4);
    expect(p.min.length).toBe(1);
    expect(p.duration).toBe(0);
  });
});

describe("peakColumns", () => {
  // 1 s at 1 kHz, 10 samples per bin (10 ms): a loud burst 0.4 - 0.5 s, quiet elsewhere.
  const p = computePeaks([signal(1000, (i) => (i >= 400 && i < 500 ? (i % 2 ? 0.9 : -0.8) : 0.1 * (i % 2 ? 1 : -1)))], RATE, 10);

  it("draws one column per slice of the range, each the extreme of the bins inside it", () => {
    const c = peakColumns(p, 0, 1, 10); // 100 ms per column
    expect(c.max).toHaveLength(10);
    expect(c.max[4]).toBeCloseTo(0.9, 6); // 0.4 - 0.5 s
    expect(c.min[4]).toBeCloseTo(-0.8, 6);
    expect(c.max[3]).toBeCloseTo(0.1, 6);
    expect(c.max[9]).toBeCloseTo(0.1, 6);
  });

  it("zooming in reads the same data: a window around the burst shows it at the right place", () => {
    const c = peakColumns(p, 0.35, 0.55, 20); // 10 ms per column: one bin each
    expect(c.max[0]).toBeCloseTo(0.1, 6); // 0.35 - 0.36
    expect(c.max[5]).toBeCloseTo(0.9, 6); // 0.40 - 0.41
    expect(c.max[14]).toBeCloseTo(0.9, 6); // 0.49 - 0.50
    expect(c.max[15]).toBeCloseTo(0.1, 6); // 0.50 - 0.51
  });

  it("time before 0:00 and after the end is silent", () => {
    const c = peakColumns(p, -0.5, 1.5, 8); // 250 ms per column
    expect(c.max[0]).toBe(0);
    expect(c.min[1]).toBe(0);
    expect(c.max[2]).toBeGreaterThan(0); // 0 - 0.25 s
    expect(c.max[7]).toBe(0);
    expect(c.max[6]).toBe(0); // 1.25 - 1.5 s is past the end
  });

  it("a column narrower than a bin takes the bin it lies in; a degenerate range gives zeros", () => {
    const c = peakColumns(p, 0.4, 0.401, 4);
    expect(Array.from(c.max).every((x) => x > 0.8)).toBe(true);
    expect(Array.from(peakColumns(p, 1, 1, 5).max)).toEqual([0, 0, 0, 0, 0]);
    expect(Array.from(peakColumns(p, 0, 1, 0).max)).toEqual([]);
  });

  it("is cheap: the whole overview of a ten-minute track is one pass over its bins", () => {
    // 10 min at 22.05 kHz, 32 samples a bin = 413k bins. Build the peaks directly (no 13M-sample array).
    const bins = Math.ceil((600 * 22050) / 32);
    const big = { binSec: 32 / 22050, duration: 600, min: new Float32Array(bins).fill(-0.5), max: new Float32Array(bins).fill(0.5), gain: 1 };
    const t0 = performance.now();
    const c = peakColumns(big, 0, 600, 1600);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(c.max[800]).toBe(0.5);
  });
});
