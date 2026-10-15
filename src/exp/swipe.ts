/**
 * EXP: "the zone as a trackpad". Pure (no DOM, no player).
 *
 * The hand entering the command zone is a touch-down; while it is down, its sideways movement scrubs the playhead RELATIVELY (the
 * playhead moves by how far the hand moved, times the gain); leaving the zone is the lift; entering again continues from wherever
 * the playhead is, so a long track is scrubbed with several swipes. No static shape is needed (optionally the open palm).
 *
 * Also here: the measurements the bench shows for it (rest jitter, the accidental scrub as the hand arrives and leaves, the stop
 * latency) and the maths of the little scrub bar drawn at the hand.
 */
import { SWIPE } from "./config";

export interface SwipeSettings {
  /** Seconds of scrub per full picture width; 0 = the whole track per picture width (one slider). */
  gainSec: number;
  /** Picture widths per second below which the hand does not scrub. */
  minSpeed: number;
  /** Milliseconds after touch-down during which movement is ignored. */
  settleMs: number;
  lostGraceMs: number;
}

export const DEFAULT_SWIPE: SwipeSettings = { gainSec: SWIPE.gainSec, minSpeed: SWIPE.minSpeed, settleMs: SWIPE.settleMs, lostGraceMs: SWIPE.lostGraceMs };

export interface SwipeState {
  touching: boolean;
  downT: number;
  prevX: number;
  prevT: number;
  lastSeenT: number;
}

export const IDLE_SWIPE: SwipeState = { touching: false, downT: 0, prevX: 0, prevT: 0, lastSeenT: -Infinity };

export interface SwipeInput {
  t: number;
  /** The swiping hand is in view. */
  present: boolean;
  /** Its palm centre is inside the command zone. */
  inZone: boolean;
  /** Palm centre x, display-normalized (0 left .. 1 right as the user sees the mirrored picture). */
  x: number;
  /** The hand's shape is acceptable (always true with "any shape"). */
  shapeOk: boolean;
  duration: number;
}

export interface SwipeOutput {
  state: SwipeState;
  touching: boolean;
  /** "down" on the touch-down frame, "up" on the lift frame. */
  edge: "down" | "up" | null;
  /** What the hand's movement this frame asks of the playhead with no mitigation (dead-band, settle), seconds. */
  rawSec: number;
  /** What is actually applied, seconds. */
  deltaSec: number;
  /** Hand speed this frame, picture widths per second (0 off the touch). */
  speed: number;
}

/** Seconds of scrub per picture width for the settings and the track. */
export function gainSecOf(s: SwipeSettings, duration: number): number {
  return s.gainSec > 0 ? s.gainSec : Math.max(0, duration);
}

export function stepSwipe(prev: SwipeState, input: SwipeInput, s: SwipeSettings): SwipeOutput {
  const { t } = input;
  const want = input.present && input.inZone && input.shapeOk;
  const out = (state: SwipeState, edge: SwipeOutput["edge"], rawSec = 0, deltaSec = 0, speed = 0): SwipeOutput => ({ state, touching: state.touching, edge, rawSec, deltaSec, speed });

  if (!prev.touching) {
    if (!want) return out(prev, null);
    return out({ touching: true, downT: t, prevX: input.x, prevT: t, lastSeenT: t }, "down");
  }

  if (!want) {
    // A hand that is merely not seen for a frame or two keeps the touch; one that left the zone (or changed shape) lifts at once.
    if (!input.present && t - prev.lastSeenT < s.lostGraceMs) return out(prev, null);
    return out(IDLE_SWIPE, "up");
  }

  const dt = Math.max(1, t - prev.prevT);
  const dx = input.x - prev.prevX;
  const speed = (Math.abs(dx) / dt) * 1000;
  const rawSec = dx * gainSecOf(s, input.duration);
  const settled = t - prev.downT >= s.settleMs;
  const deltaSec = settled && speed >= s.minSpeed ? rawSec : 0;
  return out({ ...prev, prevX: input.x, prevT: t, lastSeenT: t }, null, rawSec, deltaSec, speed);
}

/** One finished touch, as the bench reports it. */
export interface TouchRecord {
  tDown: number;
  tUp: number;
  durMs: number;
  /** Net playhead movement applied during the touch, seconds. */
  netSec: number;
  /** The absolute scrub (sum of |movement|) in the first / last `edgeWindowMs` of the touch: raw = no dead-band or settle, applied = what really moved the playhead. */
  downRawSec: number;
  downAppliedSec: number;
  upRawSec: number;
  upAppliedSec: number;
  /** From the hand stopping to the last playhead movement or seek, ms; null if the hand never moved fast, or did not stop before the lift. Excludes the camera and model delay. */
  stopLatencyMs: number | null;
}

export interface TouchFrame {
  t: number;
  raw: number;
  applied: number;
  speed: number;
  seek: boolean;
}

/** Collects what happens between a touch-down and its lift. */
export class SwipeMetrics {
  records: TouchRecord[] = [];
  private frames: TouchFrame[] = [];
  private downT = 0;

  /** Feed every frame. `seek`: a seek was sent to the player this frame. Returns the record when a touch ends. */
  push(t: number, o: Pick<SwipeOutput, "edge" | "touching" | "rawSec" | "deltaSec" | "speed">, seek: boolean): TouchRecord | null {
    if (o.edge === "down") {
      this.frames = [];
      this.downT = t;
    }
    if (o.touching) this.frames.push({ t, raw: o.rawSec, applied: o.deltaSec, speed: o.speed, seek });
    if (o.edge !== "up") return null;
    // The lift frame itself carries no movement; it ends the touch.
    const rec = summarizeTouch(this.frames, this.downT, t);
    this.frames = [];
    this.records.push(rec);
    return rec;
  }
}

export function summarizeTouch(frames: readonly TouchFrame[], tDown: number, tUp: number): TouchRecord {
  const win = SWIPE.edgeWindowMs;
  const absWithin = (pick: (f: TouchFrame) => number, from: number, to: number) => frames.filter((f) => f.t >= from && f.t <= to).reduce((s, f) => s + Math.abs(pick(f)), 0);
  // Stop latency: find the last fast frame; the hand has "stopped" if it stayed slow for stopHoldMs after it.
  let lastFast = -1;
  frames.forEach((f, i) => {
    if (f.speed >= SWIPE.fastSpeed) lastFast = i;
  });
  let stopLatencyMs: number | null = null;
  if (lastFast >= 0) {
    const handStopT = frames[lastFast].t;
    const last = frames[frames.length - 1];
    if (last.t - handStopT >= SWIPE.stopHoldMs) {
      let lastActT = handStopT;
      for (const f of frames) if (f.t > handStopT && (f.applied !== 0 || f.seek)) lastActT = f.t;
      stopLatencyMs = lastActT - handStopT;
    }
  }
  return {
    tDown,
    tUp,
    durMs: tUp - tDown,
    netSec: frames.reduce((s, f) => s + f.applied, 0),
    downRawSec: absWithin((f) => f.raw, tDown, tDown + win),
    downAppliedSec: absWithin((f) => f.applied, tDown, tDown + win),
    upRawSec: absWithin((f) => f.raw, tUp - win, tUp),
    upAppliedSec: absWithin((f) => f.applied, tUp - win, tUp),
    stopLatencyMs,
  };
}

/** "Hold still for N seconds": how much the playhead would wander (raw) and does wander (applied), per second. */
export class JitterMeter {
  private t0 = 0;
  private until = 0;
  private raw = 0;
  private applied = 0;
  private touchedMs = 0;
  private lastT = 0;
  running = false;
  /** The last finished measurement (null before the first). */
  result: { rawPerSec: number; appliedPerSec: number; seconds: number; touchedFrac: number } | null = null;

  start(t: number, seconds: number): void {
    this.t0 = this.lastT = t;
    this.until = t + seconds * 1000;
    this.raw = this.applied = this.touchedMs = 0;
    this.running = true;
  }

  push(t: number, touching: boolean, rawSec: number, appliedSec: number): void {
    if (!this.running) return;
    if (touching) {
      this.raw += Math.abs(rawSec);
      this.applied += Math.abs(appliedSec);
      this.touchedMs += t - this.lastT;
    }
    this.lastT = t;
    if (t >= this.until) {
      const sec = (t - this.t0) / 1000;
      this.running = false;
      this.result = { rawPerSec: this.raw / sec, appliedPerSec: this.applied / sec, seconds: sec, touchedFrac: this.touchedMs / (t - this.t0) };
    }
  }
}

export interface BarTick {
  sec: number;
  /** Position along the bar, 0..1. */
  frac: number;
  major: boolean;
}

/**
 * The scrub bar drawn at the hand: a short timeline that scrolls so that `centreSec` (the time under the hand) is always at
 * its middle. `spanSec` is the time the whole bar shows. Ticks every "nice" step; labelled ones are the major ticks.
 */
export function scrubBar(centreSec: number, spanSec: number, duration: number): { ticks: BarTick[]; startFrac: number | null; endFrac: number | null } {
  const from = centreSec - spanSec / 2;
  const to = centreSec + spanSec / 2;
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const target = spanSec / 8;
  const step = steps.find((x) => x >= target) ?? steps[steps.length - 1];
  const ticks: BarTick[] = [];
  const first = Math.ceil(Math.max(0, from) / step);
  for (let k = first; k * step <= Math.min(to, Math.max(duration, 0)) + 1e-9; k++) {
    const sec = k * step;
    ticks.push({ sec, frac: (sec - from) / spanSec, major: k % 2 === 0 });
  }
  const frac = (s: number) => ((s - from) / spanSec >= 0 && (s - from) / spanSec <= 1 ? (s - from) / spanSec : null);
  return { ticks, startFrac: frac(0), endFrac: duration > 0 ? frac(duration) : null };
}
