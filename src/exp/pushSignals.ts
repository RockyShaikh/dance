/**
 * EXP: the candidate push signals, per hand, per frame. Pure (no DOM, no model).
 *
 * A "push" is the hand moving toward the camera. The camera gives no depth, so three proxies are measured and compared:
 *  (a) the hand's size in pixels grows (a perspective effect: size ~ 1 / distance);
 *  (b) the forearm's 2D length (elbow to wrist) shrinks relative to the shoulder width, as the forearm points at the camera;
 *  (c) the pose model's wrist depth (world z, metres, relative to the hips; smaller = nearer the camera) falls relative to the shoulders.
 * Each is turned into "how much did it change within the last ~250 ms", so a push (fast) stands out from a walk toward the camera (slow).
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { ARM, POSE, type PoseLm, type WristSide } from "../poseCrop";
import { handLengthPx, palmWidthPx } from "../trackStats";
import { PUSH, type PushSignalKey } from "./config";

/** A pose world landmark: metres, origin at the hips, z smaller = nearer the camera. */
export interface WorldLm {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type Level = "above" | "head" | "chest" | "below";
export const LEVELS: readonly Level[] = ["above", "head", "chest", "below"];

/** BlazePose hip points (not in poseCrop.ts's list). */
const HIP_LEFT = 23;
const HIP_RIGHT = 24;

const seen = (p: { visibility?: number } | undefined, minVis: number): boolean => !!p && (p.visibility ?? 1) >= minVis;

/** The hand's size in full-frame pixels: the diagonal of (palm width, hand length), so it holds up when either one collapses (palm edge-on, fingers pointing at the camera). */
export function handSizePx(lm: readonly NormalizedLandmark[], W: number, H: number): number {
  return Math.hypot(palmWidthPx(lm, W, H), handLengthPx(lm, W, H));
}

/** Growth of `now` against a `baseline` as a fraction (0.1 = 10% bigger); null with no usable baseline. */
export function sizeRatio(now: number, baseline: number | null): number | null {
  return baseline !== null && baseline > 0 && now > 0 ? now / baseline - 1 : null;
}

interface Px {
  x: number;
  y: number;
}

/** The distance between the pose's shoulders, in pixels (null if either is unseen). */
export function shoulderWidthPx(pose: readonly PoseLm[], W: number, H: number, minVis: number = PUSH.minVisibility): number | null {
  const l = pose[POSE.LEFT_SHOULDER];
  const r = pose[POSE.RIGHT_SHOULDER];
  if (!seen(l, minVis) || !seen(r, minVis)) return null;
  return Math.hypot((l.x - r.x) * W, (l.y - r.y) * H);
}

/** Which pose arm belongs to a hand: the one whose wrist is nearest the hand's wrist (so the model's left / right conventions do not matter); null if none is near enough. */
export function armOfHand(pose: readonly PoseLm[] | null, handWrist: Px, W: number, H: number, minVis: number = PUSH.minVisibility): WristSide | null {
  if (!pose) return null;
  const sw = shoulderWidthPx(pose, W, H, minVis);
  let best: WristSide | null = null;
  let bestD = Infinity;
  for (const side of ["left", "right"] as const) {
    const p = pose[ARM[side].wrist];
    if (!seen(p, minVis)) continue;
    const d = Math.hypot((p.x - handWrist.x) * W, (p.y - handWrist.y) * H);
    if (d < bestD) {
      bestD = d;
      best = side;
    }
  }
  // Nearer than ~1.2 shoulder widths (or, without shoulders, 15% of the frame height).
  const limit = sw !== null ? 1.2 * sw : 0.15 * H;
  return best !== null && bestD <= limit ? best : null;
}

/** (b) The 2D elbow-to-wrist length over the shoulder width (about 0.6-0.7 with the forearm square to the camera; smaller as it points at the lens). Null if a point is unseen. */
export function forearmRatio(pose: readonly PoseLm[] | null, side: WristSide, W: number, H: number, minVis: number = PUSH.minVisibility): number | null {
  if (!pose) return null;
  const sw = shoulderWidthPx(pose, W, H, minVis);
  const e = pose[ARM[side].elbow];
  const w = pose[ARM[side].wrist];
  if (sw === null || sw <= 0 || !seen(e, minVis) || !seen(w, minVis)) return null;
  return Math.hypot((e.x - w.x) * W, (e.y - w.y) * H) / sw;
}

/** (c) The wrist's depth in metres relative to the middle of the shoulders (pose world z): negative = the hand is in front of the shoulders. Null if unseen. */
export function wristDepthM(world: readonly WorldLm[] | null, side: WristSide, minVis: number = PUSH.minVisibility): number | null {
  if (!world) return null;
  const w = world[ARM[side].wrist];
  const l = world[POSE.LEFT_SHOULDER];
  const r = world[POSE.RIGHT_SHOULDER];
  if (!seen(w, minVis) || !seen(l, minVis) || !seen(r, minVis)) return null;
  return w.z - (l.z + r.z) / 2;
}

/**
 * The hand's height against the body, from the pose, in 2D (the picture's up). Units are the shoulder width, so it holds at any distance:
 *  above  = the wrist is above the top of the head (about 0.4 shoulder widths above the eyes);
 *  head   = above the shoulder line, up to there;
 *  chest  = from the shoulders down to the hips (or, with no hips in view, 1.3 shoulder widths below the shoulders);
 *  below  = lower than that.
 * Null if the wrist or the body's anchors are not seen.
 */
export function levelOf(pose: readonly PoseLm[] | null, side: WristSide, W: number, H: number, minVis: number = PUSH.minVisibility): Level | null {
  if (!pose) return null;
  const w = pose[ARM[side].wrist];
  const sw = shoulderWidthPx(pose, W, H, minVis);
  if (!seen(w, minVis) || sw === null || sw <= 0) return null;
  const l = pose[POSE.LEFT_SHOULDER];
  const r = pose[POSE.RIGHT_SHOULDER];
  const shoulderY = ((l.y + r.y) / 2) * H;
  const eyes = [pose[POSE.LEFT_EYE], pose[POSE.RIGHT_EYE], pose[POSE.NOSE]].filter((p) => seen(p, minVis));
  const headRefY = eyes.length > 0 ? (eyes.reduce((s, p) => s + p.y, 0) / eyes.length) * H : shoulderY - 0.7 * sw;
  const hl = pose[HIP_LEFT];
  const hr = pose[HIP_RIGHT];
  const hipY = seen(hl, minVis) && seen(hr, minVis) ? ((hl.y + hr.y) / 2) * H : shoulderY + 1.3 * sw;
  const y = w.y * H;
  if (y < headRefY - 0.4 * sw) return "above";
  if (y < shoulderY) return "head";
  if (y < hipY) return "chest";
  return "below";
}

/** A series of (time, value) kept for a short while, to ask "what was it ~250 ms ago". A gap in time starts the history over. */
export class Trace {
  private t: number[] = [];
  private v: number[] = [];
  constructor(
    private readonly keepMs = 2000,
    private readonly gapMs: number = PUSH.gapMs,
  ) {}

  get length(): number {
    return this.t.length;
  }

  push(t: number, v: number): void {
    const n = this.t.length;
    if (n > 0 && t - this.t[n - 1] > this.gapMs) this.reset();
    this.t.push(t);
    this.v.push(v);
    while (this.t.length > 2 && this.t[0] < t - this.keepMs) {
      this.t.shift();
      this.v.shift();
    }
  }

  reset(): void {
    this.t = [];
    this.v = [];
  }

  /** The value at time `t`, linearly interpolated; null if the history does not reach back that far (or is empty). */
  valueAt(t: number): number | null {
    const n = this.t.length;
    if (n === 0 || t < this.t[0] || t > this.t[n - 1]) return null;
    for (let i = n - 1; i >= 0; i--) {
      if (this.t[i] <= t) {
        if (i === n - 1 || this.t[i] === t) return this.v[i];
        const f = (t - this.t[i]) / (this.t[i + 1] - this.t[i]);
        return this.v[i] + (this.v[i + 1] - this.v[i]) * f;
      }
    }
    return null;
  }
}

/** One frame's inputs for one hand (null = not available this frame). */
export interface PushInput {
  t: number;
  /** (a) the hand's size, pixels. */
  size: number | null;
  /** The palm centre in pixels (for the lateral travel). */
  center: Px | null;
  /** (b) forearm length over shoulder width. */
  forearm: number | null;
  /** (c) wrist depth against the shoulders, metres. */
  depthM: number | null;
}

/** The signals for one frame. Each of a-d is null until it has a window of history. */
export interface PushSample {
  t: number;
  /** Smoothed raw values. */
  size: number | null;
  forearm: number | null;
  depthM: number | null;
  /** a: size growth in the window (fraction); b: forearm shrink in the window (fraction); c: depth moved toward the camera (metres); d: combined score. */
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
  /** How far the palm centre travelled in the window, in hand sizes. */
  lateral: number | null;
}

/** Thresholds a push signal is judged by (for the combined score). */
export type EnterThresholds = Record<PushSignalKey, number>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Smooths one series (EMA by elapsed time) and remembers its history. */
class Series {
  readonly trace = new Trace();
  private ema: number | null = null;
  private lastT = -Infinity;
  constructor(private readonly tauMs: number) {}
  push(t: number, v: number | null): number | null {
    if (v === null || !Number.isFinite(v)) return null;
    if (t - this.lastT > PUSH.gapMs || this.ema === null) this.ema = v;
    else this.ema += (v - this.ema) * (1 - Math.exp(-(t - this.lastT) / this.tauMs));
    this.lastT = t;
    this.trace.push(t, this.ema);
    return this.ema;
  }
  reset(): void {
    this.trace.reset();
    this.ema = null;
    this.lastT = -Infinity;
  }
}

/** The push signals of one hand, frame by frame. */
export class PushSignals {
  private readonly size: Series;
  private readonly forearm: Series;
  private readonly depth: Series;
  private readonly cx: Series;
  private readonly cy: Series;

  constructor(
    /** Read on every frame, so the panel's edits apply at once. */
    private readonly enter: () => EnterThresholds = () => PUSH.enter,
    private readonly windowMs: number = PUSH.windowMs,
    smoothMs: number = PUSH.smoothMs,
  ) {
    this.size = new Series(smoothMs);
    this.forearm = new Series(smoothMs);
    this.depth = new Series(smoothMs);
    this.cx = new Series(smoothMs);
    this.cy = new Series(smoothMs);
  }

  reset(): void {
    for (const s of [this.size, this.forearm, this.depth, this.cx, this.cy]) s.reset();
  }

  step(i: PushInput): PushSample {
    const { t } = i;
    const size = this.size.push(t, i.size);
    const forearm = this.forearm.push(t, i.forearm);
    const depthM = this.depth.push(t, i.depthM);
    const cx = this.cx.push(t, i.center?.x ?? null);
    const cy = this.cy.push(t, i.center?.y ?? null);
    const past = t - this.windowMs;

    const sizeThen = this.size.trace.valueAt(past);
    const foreThen = this.forearm.trace.valueAt(past);
    const depthThen = this.depth.trace.valueAt(past);
    const cxThen = this.cx.trace.valueAt(past);
    const cyThen = this.cy.trace.valueAt(past);

    const a = size !== null ? sizeRatio(size, sizeThen) : null;
    const b = forearm !== null && foreThen !== null && foreThen > 0 ? -(forearm / foreThen - 1) : null;
    const c = depthM !== null && depthThen !== null ? depthThen - depthM : null;
    const lateral = size !== null && size > 0 && cx !== null && cy !== null && cxThen !== null && cyThen !== null ? Math.hypot(cx - cxThen, cy - cyThen) / size : null;

    const enter = this.enter();
    const parts: number[] = [];
    if (a !== null) parts.push(clamp(a / enter.a, -1, 2));
    if (b !== null) parts.push(clamp(b / enter.b, -1, 2));
    if (c !== null) parts.push(clamp(c / enter.c, -1, 2));
    const d = parts.length > 0 ? parts.reduce((s, v) => s + v, 0) / parts.length : null;
    return { t, size, forearm, depthM, a, b, c, d, lateral };
  }
}

/** What the pipeline reads off one detected hand and the pose, as the inputs of PushSignals (and the level for the log). */
export function handInput(
  h: { landmarks: readonly NormalizedLandmark[]; palm: Px },
  pose: readonly PoseLm[] | null,
  world: readonly WorldLm[] | null,
  W: number,
  H: number,
  t: number,
): { input: PushInput; side: WristSide | null; level: Level | null } {
  const wrist = h.landmarks[0];
  const side = armOfHand(pose, { x: wrist.x, y: wrist.y }, W, H);
  return {
    input: {
      t,
      size: handSizePx(h.landmarks, W, H),
      // Display x is the mirror of the raw x; only distances are used, so either works: keep display coordinates.
      center: { x: h.palm.x * W, y: h.palm.y * H },
      forearm: side ? forearmRatio(pose, side, W, H) : null,
      depthM: side ? wristDepthM(world, side) : null,
    },
    side,
    level: side ? levelOf(pose, side, W, H) : null,
  };
}
