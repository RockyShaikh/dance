/**
 * The knob pipeline (docs/spec.md section 5): clutch -> motion -> mapping, glued by one pure reducer.
 * The three parts are separate and swappable (knobClutch.ts, knobMotion.ts, knobMapping.ts); this file
 * owns the life of one grab:
 *
 *   not grabbed --(clutch says GRABBED and the steering hand is in view)--> grabbed
 *   grabbed, hand in view      -> the mapping turns the motion into seconds of movement
 *   grabbed, hand NOT in view  -> FROZEN: no movement at all (the value never jumps); when the hand
 *                                 comes back the pose is re-based so it still doesn't jump
 *   grabbed, hand missing >= releaseGraceMs, or the clutch lets go -> released
 *
 * While `grabbed` (including frozen) the caller must suppress commands (commands.ts `suppress`).
 * The movement is handed out in whole milliseconds (the loop model rounds to a millisecond, so
 * slow turns would otherwise round to nothing and be lost); the remainder is carried to the next frame.
 */
import type { Vec2 } from "./box";
import type { ClutchKind, KnobConfig, KnobTarget, MappingKind, MotionKind } from "./config";
import { rebaseMapping, startMapping, stepMapping, type MappingParams, type MappingState } from "./knobMapping";
import { rebaseMotion, startMotion, stepMotion, type MotionState } from "./knobMotion";

/** Which variant is active, and the sliders. */
export interface KnobChoice extends MappingParams {
  clutch: ClutchKind;
  motion: MotionKind;
  mapping: MappingKind;
  /** What the movement is applied to: the playhead (audible scrub), the loop START, or the loop END. */
  target: KnobTarget;
}

/** Circling can only be read as a jog wheel, and a jog wheel needs circling: keep the pair consistent. */
export function normalizeChoice<C extends Pick<KnobChoice, "motion" | "mapping">>(c: C): C {
  if (c.motion === "circling" && c.mapping !== "jog") return { ...c, mapping: "jog" };
  if (c.motion === "tilt" && c.mapping === "jog") return { ...c, mapping: "joystick" };
  return c;
}

export interface KnobSample {
  tiltDeg: number;
  palm: Vec2;
}

export interface KnobInput {
  /** Milliseconds, must not go backwards. */
  t: number;
  /** The chosen clutch says GRABBED (knobClutch.selectClutch). */
  grabbed: boolean;
  /** The steering hand, or null when it isn't in view. */
  hand: KnobSample | null;
  /** Frame width / height. */
  aspect: number;
  /** R4c: what this frame's movement is for, overriding the chosen target (the left hand's shape picks it). */
  target?: KnobTarget;
}

export interface KnobState {
  grabbed: boolean;
  /** Last time the steering hand was in view while grabbed. */
  lastSeen: number;
  lastT: number;
  /** The hand was missing last frame (so the next sighting re-bases). */
  dropped: boolean;
  motion: MotionState | null;
  mapping: MappingState | null;
  /** Movement not yet handed out (less than a millisecond). */
  pendingSec: number;
}

export const IDLE_KNOB: KnobState = { grabbed: false, lastSeen: 0, lastT: 0, dropped: false, motion: null, mapping: null, pendingSec: 0 };

/** What the dial on screen needs. */
export interface KnobView {
  motion: MotionKind;
  mapping: MappingKind;
  /** The hand's pose is not being tracked: the value is held. */
  frozen: boolean;
  /** Tilt: the needle's angle now and the angle at the grab (the joystick's centre), degrees clockwise from straight up. */
  needleDeg: number;
  centreDeg: number;
  /** Circling: total degrees turned since the grab, the estimated centre of the circle (display-normalized) and whether it is measuring yet. */
  turnedDeg: number;
  circleCentre: Vec2 | null;
  warm: boolean;
}

export interface KnobOutput {
  /** What `applySec` is a delta FOR. The pipeline doesn't care which: the caller applies it (scrub, nudge START, nudge END). */
  target: KnobTarget;
  /** The knob is held (frozen counts): commands must be suppressed. */
  grabbed: boolean;
  /** The grab began on this frame. */
  started: boolean;
  /** The grab ended on this frame. */
  released: boolean;
  /** Move the target by this many seconds (whole milliseconds, 0 when nothing to do). Already scaled for the target. */
  applySec: number;
  view: KnobView | null;
}

const NONE: Omit<KnobOutput, "target"> = { grabbed: false, started: false, released: false, applySec: 0, view: null };

/** Splits `pending` into whole milliseconds to apply now and the sub-millisecond rest. */
export function takeWholeMs(pending: number): { apply: number; rest: number } {
  const ms = Math.trunc(pending * 1000);
  return { apply: ms / 1000, rest: pending - ms / 1000 };
}

function viewOf(s: KnobState, frozen: boolean): KnobView {
  const m = s.motion as MotionState;
  const map = s.mapping as MappingState;
  return {
    motion: m.kind,
    mapping: map.kind,
    frozen,
    needleDeg: m.kind === "tilt" ? m.angle : 0,
    centreDeg: map.centre,
    turnedDeg: m.kind === "circling" ? m.angle : 0,
    circleCentre: m.centre,
    warm: m.warm,
  };
}

export function stepKnob(prev: KnobState, input: KnobInput, choice: KnobChoice, cfg: KnobConfig, releaseGraceMs: number): { state: KnobState; out: KnobOutput } {
  // R4c: the two-hand wheel picks the target live (the left hand's shape); the motion and mapping carry on across a switch.
  const target = input.target ?? choice.target;
  const r = stepKnobCore(prev, input, choice, target, cfg, releaseGraceMs);
  return { state: r.state, out: { ...r.out, target } };
}

function stepKnobCore(prev: KnobState, input: KnobInput, choice: KnobChoice, target: KnobTarget, cfg: KnobConfig, releaseGraceMs: number): { state: KnobState; out: Omit<KnobOutput, "target"> } {
  const { t, hand } = input;
  const mi = hand ? { t, tiltDeg: hand.tiltDeg, palm: hand.palm, aspect: input.aspect } : null;

  // Not grabbed (or the clutch let go): reset. Report the release if we were holding.
  if (!input.grabbed) {
    return { state: { ...IDLE_KNOB, lastT: t }, out: prev.grabbed ? { ...NONE, released: true } : NONE };
  }

  // The grab begins once the steering hand is in view.
  if (!prev.grabbed) {
    if (!mi) return { state: { ...IDLE_KNOB, lastT: t }, out: NONE };
    const motion = startMotion(choice.motion, mi);
    const state: KnobState = {
      grabbed: true,
      lastSeen: t,
      lastT: t,
      dropped: false,
      motion,
      mapping: startMapping(choice.mapping, motion.angle),
      pendingSec: 0,
    };
    return { state, out: { grabbed: true, started: true, released: false, applySec: 0, view: viewOf(state, false) } };
  }

  // Held, but the steering hand is gone: freeze, then release after the grace period.
  if (!mi) {
    if (t - prev.lastSeen >= releaseGraceMs) return { state: { ...IDLE_KNOB, lastT: t }, out: { ...NONE, released: true } };
    const state: KnobState = { ...prev, lastT: t, dropped: true };
    return { state, out: { grabbed: true, started: false, released: false, applySec: 0, view: viewOf(state, true) } };
  }

  // Held, hand in view: measure and move.
  const dtSec = Math.min(cfg.maxDtSec, Math.max(0, (t - prev.lastT) / 1000));
  let motion = prev.motion as MotionState;
  let mapping = prev.mapping as MappingState;
  if (prev.dropped) {
    motion = rebaseMotion(motion, mi);
    mapping = rebaseMapping(mapping, motion.angle);
  } else {
    motion = stepMotion(motion, mi, cfg);
    const r = stepMapping(mapping, motion.angle, dtSec, choice, cfg);
    mapping = r.state;
    const { apply, rest } = takeWholeMs(prev.pendingSec + r.deltaSec * cfg.targetScale[target]);
    const state: KnobState = { grabbed: true, lastSeen: t, lastT: t, dropped: false, motion, mapping, pendingSec: rest };
    return { state, out: { grabbed: true, started: false, released: false, applySec: apply, view: viewOf(state, false) } };
  }
  const state: KnobState = { grabbed: true, lastSeen: t, lastT: t, dropped: false, motion, mapping, pendingSec: prev.pendingSec };
  return { state, out: { grabbed: true, started: false, released: false, applySec: 0, view: viewOf(state, false) } };
}
