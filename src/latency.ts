/** R7: numbers about timing. Pure. */

export interface LatencyStats {
  n: number;
  min: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
}

/** Nearest-rank percentile of an ascending list (p in 0..100): the smallest value that at least p% of the samples are at or below. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** Median, p95, min, max and mean of the samples (non-finite ones are ignored); null when there are none. */
export function latencyStats(samples: readonly number[]): LatencyStats | null {
  const v = samples.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const median = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return { n: v.length, min: v[0], median, p95: percentile(v, 95), max: v[v.length - 1], mean: v.reduce((a, b) => a + b, 0) / v.length };
}

/** The last `capacity` values pushed, with their stats on demand. */
export class RollingSamples {
  private values: number[] = [];
  constructor(private readonly capacity: number) {}
  push(v: number): void {
    if (!Number.isFinite(v)) return;
    this.values.push(v);
    if (this.values.length > this.capacity) this.values.shift();
  }
  clear(): void {
    this.values = [];
  }
  stats(): LatencyStats | null {
    return latencyStats(this.values);
  }
}

/** "112 ms" for a number, "-" for none. */
export const ms = (v: number | undefined | null, digits = 0): string => (v === undefined || v === null || !Number.isFinite(v) ? "-" : `${v.toFixed(digits)} ms`);

/** "median 12 / p95 19 ms (n 120)" or "-". */
export function statsLine(s: LatencyStats | null, digits = 0): string {
  return s ? `median ${s.median.toFixed(digits)} · p95 ${s.p95.toFixed(digits)} ms (n ${s.n})` : "-";
}

/**
 * The rate the video element actually presents frames at, from rVFC's running `presentedFrames` count (so frames that the app
 * was too slow to process still count: this is the camera's delivered rate, not the app's). A drop in the count (a new stream)
 * restarts the window.
 */
export class PresentedRate {
  private first: { t: number; frames: number } | null = null;
  private last: { t: number; frames: number } | null = null;
  fps = 0;
  constructor(private readonly windowMs = 1000) {}
  push(t: number, presentedFrames: number): void {
    if (this.last && presentedFrames < this.last.frames) this.reset();
    if (!this.first || !this.last) {
      this.first = this.last = { t, frames: presentedFrames };
      return;
    }
    this.last = { t, frames: presentedFrames };
    const dt = t - this.first.t;
    if (dt >= this.windowMs) {
      this.fps = ((presentedFrames - this.first.frames) * 1000) / dt;
      this.first = this.last;
    }
  }
  reset(): void {
    this.first = this.last = null;
    this.fps = 0;
  }
}
