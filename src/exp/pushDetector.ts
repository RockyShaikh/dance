/**
 * EXP: the push detector, threshold + peak. Pure reducer, one per (hand, signal).
 *
 * The signal it is given is already "change within the last ~250 ms" (pushSignals.ts), so:
 *  - IDLE -> RISING when the signal reaches `enter`;
 *  - RISING: follow the peak. The push ENDS ("then stops") once the signal falls to `fallFrac` of its peak: that is when it fires.
 *    A rise still going after `maxRiseMs` is a slow approach and is rejected; so is one in which the palm swept sideways
 *    more than `lateralMax` hand sizes (an arm swing), judged at the end;
 *  - COOL for `refractoryMs`, and until the signal is back under half the threshold.
 * A missing value (hand lost, pose lost) abandons the rise without an event.
 */

export interface DetectorConfig {
  enter: number;
  fallFrac: number;
  maxRiseMs: number;
  lateralMax: number;
  refractoryMs: number;
}

export type DetectorState =
  | { phase: "idle" }
  | { phase: "rising"; t0: number; peak: number; peakT: number; maxLateral: number }
  | { phase: "cool"; until: number };

export const IDLE_DETECTOR: DetectorState = { phase: "idle" };

export interface DetectorInput {
  t: number;
  /** The signal, null when it is not available. */
  v: number | null;
  /** The palm's travel within the window, in hand sizes (null: unknown, not judged). */
  lateral: number | null;
}

export type RejectReason = "slow" | "swing";

export interface DetectorEvent {
  kind: "push" | "reject";
  reason?: RejectReason;
  /** When it was decided; when the rise began; when the signal peaked. */
  t: number;
  t0: number;
  peakT: number;
  peak: number;
  riseMs: number;
  /** The most the palm travelled within a window during the rise, in hand sizes. */
  lateral: number;
}

export interface DetectorResult {
  state: DetectorState;
  event: DetectorEvent | null;
}

export function stepDetector(prev: DetectorState, input: DetectorInput, cfg: DetectorConfig): DetectorResult {
  const { t, v, lateral } = input;

  if (prev.phase === "cool") {
    const quiet = v === null || v < cfg.enter * 0.5;
    return { state: t >= prev.until && quiet ? IDLE_DETECTOR : prev, event: null };
  }

  if (prev.phase === "idle") {
    if (v !== null && v >= cfg.enter) {
      return { state: { phase: "rising", t0: t, peak: v, peakT: t, maxLateral: lateral ?? 0 }, event: null };
    }
    return { state: prev, event: null };
  }

  // Rising.
  if (v === null) return { state: IDLE_DETECTOR, event: null };
  const s = { ...prev, maxLateral: Math.max(prev.maxLateral, lateral ?? 0) };
  if (v >= s.peak) {
    s.peak = v;
    s.peakT = t;
  }
  const make = (kind: "push" | "reject", reason?: RejectReason): DetectorEvent => ({ kind, reason, t, t0: s.t0, peakT: s.peakT, peak: s.peak, riseMs: s.peakT - s.t0, lateral: s.maxLateral });
  const cool: DetectorState = { phase: "cool", until: t + cfg.refractoryMs };

  if (v <= s.peak * cfg.fallFrac) {
    // The signal has fallen back: the movement has stopped. Was it a push?
    if (s.maxLateral > cfg.lateralMax) return { state: cool, event: make("reject", "swing") };
    return { state: cool, event: make("push") };
  }
  if (t - s.t0 > cfg.maxRiseMs) return { state: cool, event: make("reject", "slow") };
  return { state: s, event: null };
}
