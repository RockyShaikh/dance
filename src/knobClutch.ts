/**
 * Knob, part 1 of 3: CLUTCH (docs/spec.md 5.2). R2's detectors (clutch.ts) already decide GRABBED or
 * released for pinch, claw and two-hand, including the rules that a grab must start with the hand in
 * the command box and that a lost hand holds for a grace period. This module only picks the one the
 * user chose and says which hand is steering.
 */
import type { Vec2 } from "./box";
import { twoHandRoles, type ClutchView } from "./clutch";
import type { ClutchConfig, ClutchKind } from "./config";
import type { Handedness } from "./hand";

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
 */
export function selectClutch(kind: ClutchKind, view: ClutchView, hands: readonly KnobHand[], cfg: ClutchConfig): ClutchPick {
  if (kind === "twoHand") {
    return { grabbed: view.twoHand, steering: twoHandRoles(hands, cfg)?.steering ?? null };
  }
  const who = view[kind];
  return { grabbed: who !== null, steering: who === null ? null : (hands.find((h) => h.hand === who) ?? null) };
}
