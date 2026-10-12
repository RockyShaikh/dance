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
 *    R4c: the steering default. Stopping the turn stops the value at once (the joystick keeps going until
 *    you return to centre, which reads as lag). A small hold-off keeps a still hand still, and a fast
 *    turn is boosted (pointer-style acceleration) so one sweep can cross a song while a slow turn is fine.
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
  /**
   * The angle on the previous frame: the other mappings move by the change since then. For `relative`
   * it is the last angle the value followed to (the hold-off keeps it put while the hand only jitters).
   */
  prev: number;
  /** `relative`: the angle on the previous frame, and the turn speed (degrees per second, averaged) the boost reads. */
  last: number;
  speed: number;
}

export function startMapping(kind: MappingKind, angle: number): MappingState {
  return { kind, centre: angle, prev: angle, last: angle, speed: 0 };
}

/**
 * After a tracking dropout: the new pose is taken as "no change", so the value cannot jump
 * (a position-style mapping would otherwise leap to wherever the hand reappeared).
 */
export function rebaseMapping(s: MappingState, angle: number): MappingState {
  return { ...s, prev: angle, last: angle, speed: 0 };
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

/** The boost for a turn of `degPerSec`: 1 up to the slow speed, `maxBoost` from the fast speed, linear between. */
export function turnBoost(degPerSec: number, cfg: KnobConfig): number {
  const r = cfg.relative;
  const f = Math.min(1, Math.max(0, (Math.abs(degPerSec) - r.slowDegPerSec) / Math.max(1e-6, r.fastDegPerSec - r.slowDegPerSec)));
  return 1 + (r.maxBoost - 1) * f;
}

/** One frame: how many seconds to move the value, and the next state. `dtSec` is the (capped) time since the last frame. */
export function stepMapping(s: MappingState, angle: number, dtSec: number, p: MappingParams, cfg: KnobConfig): { state: MappingState; deltaSec: number } {
  let delta = 0;
  let next: MappingState = { ...s, prev: angle, last: angle };
  switch (s.kind) {
    case "joystick":
      delta = joystickRate(angle - s.centre, p.deadZoneDeg, cfg) * dtSec;
      break;
    case "absolute":
      delta = (absoluteTilt(angle, cfg) - absoluteTilt(s.prev, cfg)) * cfg.absolute.secPerDeg;
      break;
    case "relative": {
      const r = cfg.relative;
      const inst = dtSec > 0 ? Math.abs(angle - s.last) / dtSec : 0;
      const speed = dtSec > 0 ? r.speedSmoothing * inst + (1 - r.speedSmoothing) * s.speed : s.speed;
      const turned = angle - s.prev;
      if (Math.abs(turned) <= r.holdDeg) {
        next = { ...s, last: angle, speed }; // jitter: the value stays where it is, and so does the reference
      } else {
        delta = turned * r.secPerDeg * turnBoost(speed, cfg);
        next = { ...s, prev: angle, last: angle, speed };
      }
      break;
    }
    case "jog":
      delta = ((angle - s.prev) / 360) * cfg.jog.secPerTurn;
      break;
  }
  delta *= p.gain * (p.invert ? -1 : 1);
  return { state: next, deltaSec: delta === 0 ? 0 : delta };
}
