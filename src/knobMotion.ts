/**
 * Knob, part 2 of 3: MOTION (docs/spec.md 5.3). What "turning" is measured as. Pure reducers, no
 * DOM, no clock: the time is passed in with every frame.
 *
 *  - tilt: the wrist-to-middle-knuckle needle against straight up (see `tiltDeg` in handFeatures.ts),
 *    lightly smoothed and unwrapped so it never jumps at +-180. Limited by the wrist.
 *  - circling: the palm centre going round a circle. The circle's centre is the average palm position
 *    over the last ~1 s; the palm's angle around it is measured each frame and the changes are added
 *    up (clockwise = forward). Unlimited, like a jog wheel.
 *
 * Both give ONE number, `angle`, in degrees, clockwise positive: for tilt the (unwrapped) needle angle,
 * for circling the total turned since the grab. A mapping (knobMapping.ts) turns it into a value.
 */
import type { Vec2 } from "./box";
import type { KnobConfig, MotionKind } from "./config";

export interface MotionInput {
  /** Milliseconds, must not go backwards. */
  t: number;
  /** The steering hand's tilt (handFeatures.tiltDeg). */
  tiltDeg: number;
  /** The steering hand's palm centre, display-normalized. */
  palm: Vec2;
  /** Frame width / height, so a circle on screen is a circle in the maths. */
  aspect: number;
}

interface TrailPoint {
  t: number;
  /** x in frame-height units, y in frame heights. */
  x: number;
  y: number;
}

export interface MotionState {
  kind: MotionKind;
  /** The number the mapping reads (degrees, clockwise positive, unwrapped). */
  angle: number;
  /** Circling only: recent palm positions, and the last measured angle around the centre (null = not circling right now). */
  trail: TrailPoint[];
  lastCircleAngle: number | null;
  /** Circling only, for the display: the estimated centre (display-normalized) and the palm's distance from it (frame heights). */
  centre: Vec2 | null;
  radius: number;
  /** Circling only: whether the window holds enough history to measure yet. */
  warm: boolean;
}

/** Any angle difference, folded into -180..180 (the short way round). */
export function wrap180(deg: number): number {
  return deg - 360 * Math.round(deg / 360);
}

const point = (i: MotionInput): TrailPoint => ({ t: i.t, x: i.palm.x * i.aspect, y: i.palm.y });

export function startMotion(kind: MotionKind, input: MotionInput): MotionState {
  return {
    kind,
    angle: kind === "tilt" ? wrap180(input.tiltDeg) : 0,
    trail: kind === "circling" ? [point(input)] : [],
    lastCircleAngle: null,
    centre: null,
    radius: 0,
    warm: false,
  };
}

/** After the hand was lost and came back: keep the value, restart the measuring from the new pose. */
export function rebaseMotion(s: MotionState, input: MotionInput): MotionState {
  if (s.kind === "tilt") return { ...s, angle: wrap180(input.tiltDeg) };
  return { ...s, trail: [point(input)], lastCircleAngle: null, centre: null, radius: 0, warm: false };
}

export function stepMotion(s: MotionState, input: MotionInput, cfg: KnobConfig): MotionState {
  return s.kind === "tilt" ? stepTilt(s, input, cfg) : stepCircling(s, input, cfg);
}

function stepTilt(s: MotionState, input: MotionInput, cfg: KnobConfig): MotionState {
  // A running average that takes the short way round, so +179 to -179 is a 2-degree step, not 358.
  const a = cfg.tilt.smoothing;
  return { ...s, angle: s.angle + a * wrap180(input.tiltDeg - s.angle) };
}

function stepCircling(s: MotionState, input: MotionInput, cfg: KnobConfig): MotionState {
  const c = cfg.circling;
  const p = point(input);
  const trail = [...s.trail, p].filter((q) => q.t >= input.t - c.windowMs);
  const span = p.t - trail[0].t;
  const next: MotionState = { ...s, trail, warm: span >= c.warmupMs };
  if (!next.warm) {
    next.lastCircleAngle = null;
    return next;
  }
  let cx = 0;
  let cy = 0;
  for (const q of trail) {
    cx += q.x;
    cy += q.y;
  }
  cx /= trail.length;
  cy /= trail.length;
  next.centre = { x: cx / input.aspect, y: cy };
  const dx = p.x - cx;
  const dy = p.y - cy;
  next.radius = Math.hypot(dx, dy);
  if (next.radius < c.minRadius) {
    // Hovering near the middle: not a circle. Forget the last angle so the first real move doesn't lurch.
    next.lastCircleAngle = null;
    return next;
  }
  // Screen y points down, so atan2(dy, dx) grows clockwise as the user sees it.
  const here = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (s.lastCircleAngle !== null) next.angle = s.angle + wrap180(here - s.lastCircleAngle);
  next.lastCircleAngle = here;
  return next;
}
