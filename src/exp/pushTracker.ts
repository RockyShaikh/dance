/**
 * EXP: one hand's whole push pipeline: the signals (pushSignals.ts) and one detector per signal a-d (pushDetector.ts).
 * Pure; the bench runs one per hand, and the tests and the offline scene runner drive the same class.
 */
import { PUSH, PUSH_KEYS, type PushSignalKey } from "./config";
import { IDLE_DETECTOR, stepDetector, type DetectorConfig, type DetectorEvent, type DetectorState } from "./pushDetector";
import { PushSignals, type EnterThresholds, type PushInput, type PushSample } from "./pushSignals";

/** The numbers the panel edits, read on every frame. */
export interface PushSettings {
  enter: EnterThresholds;
  fallFrac: number;
  maxRiseMs: number;
  lateralMax: number;
  refractoryMs: number;
}

export const DEFAULT_PUSH: PushSettings = { enter: { ...PUSH.enter }, fallFrac: PUSH.fallFrac, maxRiseMs: PUSH.maxRiseMs, lateralMax: PUSH.lateralMax, refractoryMs: PUSH.refractoryMs };

export type PushEvent = DetectorEvent & { signal: PushSignalKey };

export interface TrackerStep {
  /** Null while the hand is absent. */
  sample: PushSample | null;
  events: PushEvent[];
}

export class PushTracker {
  private readonly signals: PushSignals;
  private readonly det: Record<PushSignalKey, DetectorState> = { a: IDLE_DETECTOR, b: IDLE_DETECTOR, c: IDLE_DETECTOR, d: IDLE_DETECTOR };

  constructor(private readonly settings: () => PushSettings = () => DEFAULT_PUSH) {
    this.signals = new PushSignals(() => this.settings().enter);
  }

  reset(): void {
    this.signals.reset();
    for (const k of PUSH_KEYS) this.det[k] = IDLE_DETECTOR;
  }

  /** `input` null: the hand is not in view this frame (the history ends and any rise is dropped). */
  step(t: number, input: PushInput | null): TrackerStep {
    if (input === null) {
      // Not seen: nothing to measure. The next sample after a gap starts the history afresh (Trace / Series gap rule).
      for (const k of PUSH_KEYS) this.det[k] = stepDetector(this.det[k], { t, v: null, lateral: null }, this.cfg(k)).state;
      return { sample: null, events: [] };
    }
    const sample = this.signals.step(input);
    const events: PushEvent[] = [];
    for (const k of PUSH_KEYS) {
      const r = stepDetector(this.det[k], { t, v: sample[k], lateral: sample.lateral }, this.cfg(k));
      this.det[k] = r.state;
      if (r.event) events.push({ ...r.event, signal: k });
    }
    return { sample, events };
  }

  private cfg(k: PushSignalKey): DetectorConfig {
    const s = this.settings();
    return { enter: s.enter[k], fallFrac: s.fallFrac, maxRiseMs: s.maxRiseMs, lateralMax: s.lateralMax, refractoryMs: s.refractoryMs };
  }
}
