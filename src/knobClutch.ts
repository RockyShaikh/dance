/**
 * Knob, part 1 of 3: CLUTCH (docs/spec.md 5.2). R2's detectors (clutch.ts) already decide GRABBED or
 * released for pinch, claw and two-hand, including the rules that a grab must start with the hand in
 * the command box and that a lost hand holds for a grace period. This module only picks the one the
 * user chose and says which hand is steering.
 */
import type { Vec2 } from "./box";
import { twoHandRoles, type ClutchView } from "./clutch";
import { KNOB, type ClutchConfig, type ClutchKind } from "./config";
import type { Handedness } from "./hand";
import type { SteerShape } from "./steerMode";

/** The bits of a detected hand the knob needs. */
export interface KnobHand {
  hand: Handedness;
  palm: Vec2;
  /** handFeatures.tiltDeg. */
  tiltDeg: number;
}

export interface ClutchPick {
  /** The chosen clutch says GRABBED. */
  grabbed: boolean;
  /** The hand to steer with, if it is in view (null while it is lost: the knob freezes). */
  steering: KnobHand | null;
}

/**
 * Pinch and claw: the hand that is pinching / clawing steers. Two-hand: the hand on the side opposite
 * the modifier steers; with fewer than two hands in view it can't be told which is which, so none does.
 * R4c: while the modifier shows none of the steering shapes (`modifierShape` null: a hand between shapes, or
 * relaxed) nothing steers either, so the value is held at once and the grab lets go after the grace period;
 * it does not keep moving while the clutch waits.
 */
export function selectClutch(
  kind: ClutchKind,
  view: ClutchView,
  hands: readonly KnobHand[],
  cfg: ClutchConfig,
  steeringHand: Handedness = KNOB.steeringHand,
  modifierShape: SteerShape | null = "palm",
): ClutchPick {
  if (kind === "twoHand") {
    return { grabbed: view.twoHand, steering: modifierShape === null ? null : (twoHandRoles(hands, cfg)?.steering ?? null) };
  }
  // Only the steering hand's claw or pinch is a grab: the other hand marks, and must not grab the knob.
  const who = view[kind] === steeringHand ? steeringHand : null;
  return { grabbed: who !== null, steering: who === null ? null : (hands.find((h) => h.hand === who) ?? null) };
}

/**
 * Which hands' commands are blocked this frame (R4b). While the knob is grabbed the STEERING hand's
 * commands are blocked (a claw can read as an open palm or a V; its own shapes must not fire). The other
 * hand keeps working: with claw or pinch the left hand can still mark while the right hand scrubs.
 * The two-hand clutch (R4c): while grabbed BOTH hands' commands are blocked (the left hand's shapes are
 * steering modes and the right hand is the wheel). When nothing is grabbed the left hand's V / index
 * set IN / OUT as always.
 */
export function suppressFor(kind: ClutchKind, grabbed: boolean, steering: Handedness | null, steeringHand: Handedness = KNOB.steeringHand): Record<Handedness, boolean> {
  if (kind === "twoHand") return { Left: grabbed, Right: grabbed };
  const steer = steering ?? steeringHand;
  return { Left: grabbed && steer === "Left", Right: grabbed && steer === "Right" };
}
