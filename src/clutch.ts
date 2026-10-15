/**
 * Clutch-shape detection (docs/spec.md section 5.2): pinch, claw and the two-hand
 * modifier, each reported as GRABBED or released. R2 only DETECTS them; nothing
 * is controlled yet. Pure reducers, no DOM, time passed in with every frame.
 *
 * Pinch is thumb tip to index tip, but not when the other three fingers are curled
 * into the palm (a fist has its thumb against the index too).
 *
 * Common rules, from the spec:
 *  - A grab must START inside the command box (R4b: that hand's own box); once grabbed the hand may leave it.
 *  - If the hand is lost while grabbed, the grab holds for `releaseGraceMs`
 *    (the knob value would freeze meanwhile), then releases.
 */
import { contains, type Box, type Vec2 } from "./box";
import type { ClutchConfig } from "./config";
import type { Handedness } from "./hand";

/** What the clutch detectors need to know about one detected hand. */
export interface ClutchHand {
  /** The dancer's own hand, from the model's label. */
  hand: Handedness;
  shape: string;
  /** Palm centre, display-normalized. */
  palm: Vec2;
  /** From `pinchRatio`. */
  pinchRatio: number;
  /** From `clawExtension`. */
  clawExt: number;
  /** From `othersReach`: low in a fist, which must not read as a pinch. */
  othersReach: number;
}

/** State of a clutch that follows one hand. */
export interface HandClutch {
  grabbed: boolean;
  /** When the hand was last tracked while grabbed; used for the release grace. */
  lastSeen: number;
  /** Claw only: when the hand was last clearly open. */
  lastOpen: number;
}

export interface ClutchState {
  pinch: Record<Handedness, HandClutch>;
  claw: Record<Handedness, HandClutch>;
  twoHand: { grabbed: boolean; lastSeen: number };
}

const idleHand = (): HandClutch => ({ grabbed: false, lastSeen: 0, lastOpen: -Infinity });

export function initialClutchState(): ClutchState {
  return {
    pinch: { Left: idleHand(), Right: idleHand() },
    claw: { Left: idleHand(), Right: idleHand() },
    twoHand: { grabbed: false, lastSeen: 0 },
  };
}

export interface ClutchView {
  /** Which hand is pinching/clawing, or null. */
  pinch: Handedness | null;
  claw: Handedness | null;
  twoHand: boolean;
}

/** Pinch: thumb and index tips close together. Hysteresis: it must clearly open again to release. */
function stepPinch(prev: HandClutch, t: number, hand: ClutchHand | undefined, box: Box, cfg: ClutchConfig): HandClutch {
  const s = { ...prev };
  if (!hand) return loseHand(s, t, cfg);
  s.lastSeen = t;
  if (!s.grabbed) {
    s.grabbed =
      hand.pinchRatio <= cfg.pinch.grabRatio && hand.othersReach >= cfg.pinch.minOthersReach && contains(box, hand.palm);
  } else if (hand.pinchRatio >= cfg.pinch.grabRatio * cfg.pinch.releaseFactor) {
    s.grabbed = false;
  }
  return s;
}

/**
 * Claw: a splayed open hand whose fingers curl partway in, as if grabbing a ball.
 * Entering needs the hand to have been open within `openToClawMs` before it
 * reached the half-curled range (so a half-curled hand at rest isn't a grab, and
 * neither is a fist). It stays grabbed while the fingers remain half-curled.
 */
function stepClaw(prev: HandClutch, t: number, hand: ClutchHand | undefined, box: Box, cfg: ClutchConfig): HandClutch {
  const c = cfg.claw;
  const s = { ...prev };
  if (!hand) return loseHand(s, t, cfg);
  s.lastSeen = t;
  const ext = hand.clawExt;
  if (ext >= c.openExt) s.lastOpen = t;
  if (!s.grabbed) {
    const half = ext >= c.minExt && ext <= c.maxExt;
    s.grabbed = half && t - s.lastOpen <= c.openToClawMs && contains(box, hand.palm);
  } else if (ext < c.minExt - c.stayMargin || ext > c.maxExt + c.stayMargin) {
    s.grabbed = false;
  }
  return s;
}

/** A grabbed clutch whose hand disappeared: hold for the grace period, then release. */
function loseHand(s: HandClutch, t: number, cfg: ClutchConfig): HandClutch {
  if (s.grabbed && t - s.lastSeen >= cfg.releaseGraceMs) s.grabbed = false;
  return s;
}

/**
 * Which of exactly two hands is the modifier and which steers, by screen side (never the model's
 * left/right label). Null unless two hands are in view. R4b's knob uses this to find the steering hand.
 */
export function twoHandRoles<H extends { palm: Vec2 }>(hands: readonly H[], cfg: ClutchConfig): { modifier: H; steering: H } | null {
  if (hands.length !== 2) return null;
  const [a, b] = hands;
  // Display x grows to the right as the user sees it.
  const leftMost = a.palm.x <= b.palm.x ? a : b;
  const rightMost = leftMost === a ? b : a;
  return cfg.twoHand.modifierSide === "left" ? { modifier: leftMost, steering: rightMost } : { modifier: rightMost, steering: leftMost };
}

/**
 * Two-hand: the hand on the modifier side of the screen holds an open palm up while
 * the other hand (the "steering" hand) is present. Hands are told apart by screen
 * side, not by the model's left/right label (which can flip). To start, the steering
 * hand's palm centre must be in the box; once started it may be anywhere.
 */
function stepTwoHand(prev: ClutchState["twoHand"], t: number, hands: readonly ClutchHand[], boxes: Record<Handedness, Box>, cfg: ClutchConfig): ClutchState["twoHand"] {
  const s = { ...prev };
  let present = false;
  let startOk = false;
  const roles = twoHandRoles(hands, cfg);
  if (roles) {
    present = roles.modifier.shape === cfg.twoHand.modifierShape;
    startOk = present && contains(boxes[roles.steering.hand], roles.steering.palm);
  }
  if (!s.grabbed) {
    s.grabbed = startOk;
    if (s.grabbed) s.lastSeen = t;
  } else if (present) {
    s.lastSeen = t;
  } else if (t - s.lastSeen >= cfg.releaseGraceMs) {
    s.grabbed = false;
  }
  return s;
}

export function stepClutches(
  prev: ClutchState,
  input: { t: number; hands: readonly ClutchHand[]; box: Box | Record<Handedness, Box> },
  cfg: ClutchConfig,
): { state: ClutchState; view: ClutchView } {
  const { t, hands } = input;
  // One box for both hands (R2), or one per hand (R4b: the right-hand grab must start in the right-hand box).
  const boxes: Record<Handedness, Box> = "x" in input.box ? { Left: input.box, Right: input.box } : input.box;
  const byHand: Partial<Record<Handedness, ClutchHand>> = {};
  for (const h of hands) byHand[h.hand] ??= h;

  const state: ClutchState = {
    pinch: {
      Left: stepPinch(prev.pinch.Left, t, byHand.Left, boxes.Left, cfg),
      Right: stepPinch(prev.pinch.Right, t, byHand.Right, boxes.Right, cfg),
    },
    claw: {
      Left: stepClaw(prev.claw.Left, t, byHand.Left, boxes.Left, cfg),
      Right: stepClaw(prev.claw.Right, t, byHand.Right, boxes.Right, cfg),
    },
    twoHand: stepTwoHand(prev.twoHand, t, hands, boxes, cfg),
  };
  const who = (m: Record<Handedness, HandClutch>): Handedness | null =>
    m.Right.grabbed ? "Right" : m.Left.grabbed ? "Left" : null;
  return { state, view: { pinch: who(state.pinch), claw: who(state.claw), twoHand: state.twoHand.grabbed } };
}
