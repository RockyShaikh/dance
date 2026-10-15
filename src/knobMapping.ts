/**
 * Knob, part 3 of 3: MAPPING (docs/spec.md 5.4). How the motion's `angle` changes the value (here:
 * the loop START, in seconds). Every mapping answers one question per frame: "how many seconds
 * should the value move now?" Moving by amounts (never setting the value outright) is what keeps
 * things from jumping: at the grab, after a tracking dropout, and against 0:00 / END (the marker just
 * stops at a clamp, and leaves it the moment you turn back; there is no wound-up travel to unwind).
 *
 *  - joystick (rate): where you grabbed is centre. Tilt away and the value keeps moving, faster with
 *    more tilt; back at centre (or let go) it stops, like a joystick springing back. Dead zone around centre.
 *  - absolute (wiper): the tilt IS the value, on a fixed scale (straight up = no push), clamped to
 *    a world range, so a sweep can run out (the grab point is "where the marker was when you grabbed").
 *  - relative + ratchet: the value follows how far you have turned since you grabbed, with no end to
 *    the range; to go further, release, turn back with an open hand, and re-grab (the screwdriver).
 *  - jog (for circling): each full circle moves the value a fixed amount.
 *
 * `gain` scales every mapping; `invert` flips the direction.
 */
import type { KnobConfig, MappingKind } from "./config";

export interface MappingParams {
  gain: number;
  /** The joystick's dead zone (degrees either side of centre). */
  deadZoneDeg: number;
  invert: boolean;
}

export interface MappingState {
  kind: MappingKind;
  /** Where the angle was at the grab: the joystick's centre. */
  centre: number;
  /** The angle on the previous frame: the other mappings move by the change since then. */
  prev: number;
}

export function startMapping(kind: MappingKind, angle: number): MappingState {
  return { kind, centre: angle, prev: angle };
}

/**
 * After a tracking dropout: the new pose is taken as "no change", so the value cannot jump
 * (a position-style mapping would otherwise leap to wherever the hand reappeared).
 */
export function rebaseMapping(s: MappingState, angle: number): MappingState {
  return { ...s, prev: angle };
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * The joystick's rate in seconds of value per second for a tilt `offsetDeg` away from centre:
 * zero inside the dead zone, rising from zero (no step at the edge) to the maximum at `fullTiltDeg`.
 * Signed like the offset. Before gain and invert.
 */
export function joystickRate(offsetDeg: number, deadZoneDeg: number, cfg: KnobConfig): number {
  const j = cfg.joystick;
  const span = Math.max(1e-6, j.fullTiltDeg - deadZoneDeg);
  const past = Math.max(0, Math.abs(offsetDeg) - deadZoneDeg);
  const mag = Math.pow(Math.min(1, past / span), j.curve) * j.maxRateSecPerSec;
  return Math.sign(offsetDeg) * mag;
}

/** The tilt as the absolute mapping sees it: clamped to the wiper's world range. */
export function absoluteTilt(angle: number, cfg: KnobConfig): number {
  return clamp(angle, -cfg.absolute.worldRangeDeg, cfg.absolute.worldRangeDeg);
}

/** One frame: how many seconds to move the value, and the next state. `dtSec` is the (capped) time since the last frame. */
export function stepMapping(s: MappingState, angle: number, dtSec: number, p: MappingParams, cfg: KnobConfig): { state: MappingState; deltaSec: number } {
  let delta = 0;
  switch (s.kind) {
    case "joystick":
      delta = joystickRate(angle - s.centre, p.deadZoneDeg, cfg) * dtSec;
      break;
    case "absolute":
      delta = (absoluteTilt(angle, cfg) - absoluteTilt(s.prev, cfg)) * cfg.absolute.secPerDeg;
      break;
    case "relative":
      delta = (angle - s.prev) * cfg.relative.secPerDeg;
      break;
    case "jog":
      delta = ((angle - s.prev) / 360) * cfg.jog.secPerTurn;
      break;
  }
  delta *= p.gain * (p.invert ? -1 : 1);
  return { state: { ...s, prev: angle }, deltaSec: delta === 0 ? 0 : delta };
}
