import { FEATURES, type FeatureConfig } from "./config";
import { LM, LANDMARK_COUNT, dist, dot, len, sub, type Point3 } from "./hand";

/** true = finger extended ("up"), false = curled ("down"). */
export interface PseudoChord {
  T: boolean;
  I: boolean;
  M: boolean;
  R: boolean;
  P: boolean;
}

/** Display order of the chord. */
export const CHORD_ORDER = ["T", "I", "M", "R", "P"] as const;

/** Index, middle, ring, pinky: [pip, tip] landmark indices. */
const FINGERS = {
  I: [LM.INDEX_PIP, LM.INDEX_TIP],
  M: [LM.MIDDLE_PIP, LM.MIDDLE_TIP],
  R: [LM.RING_PIP, LM.RING_TIP],
  P: [LM.PINKY_PIP, LM.PINKY_TIP],
} as const;

/**
 * Which fingers are extended, from the 21 landmarks of one hand.
 *
 * Pure function of the landmarks (isotropic coordinates, see `Point3`).
 *
 * Index..pinky: the tip is farther from the wrist than the PIP joint is. That
 * holds at any rotation of the hand and any distance from the camera.
 *
 * Thumb (separate rule, it bends sideways rather than curling toward the palm):
 * out when the tip is well away from the index knuckle, in palm sizes, and the
 * tip joint is not folded. Both are measured against the palm's own axes, so the
 * same rule works for a left and a right hand and for a palm or the back of the
 * hand facing the camera. (Handedness is therefore not an input here; it matters
 * for `palmFacing`.)
 */
export function pseudoChord(lm: readonly Point3[], cfg: FeatureConfig = FEATURES): PseudoChord {
  if (lm.length < LANDMARK_COUNT) {
    throw new Error(`pseudoChord needs ${LANDMARK_COUNT} landmarks, got ${lm.length}`);
  }
  const wrist = lm[LM.WRIST];
  const out = { T: false, I: false, M: false, R: false, P: false };

  for (const key of ["I", "M", "R", "P"] as const) {
    const [pip, tip] = FINGERS[key];
    const pipDist = dist(lm[pip], wrist);
    out[key] = pipDist > 0 && dist(lm[tip], wrist) / pipDist >= cfg.fingerExtendRatio;
  }

  out.T = thumbExtended(lm, cfg);
  return out;
}

function thumbExtended(lm: readonly Point3[], cfg: FeatureConfig): boolean {
  const palmSize = dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP]);
  if (palmSize === 0) return false;

  const tipOut = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) / palmSize;

  // Angle at the IP joint between the two thumb segments; 180 = straight.
  const toMcp = sub(lm[LM.THUMB_MCP], lm[LM.THUMB_IP]);
  const toTip = sub(lm[LM.THUMB_TIP], lm[LM.THUMB_IP]);
  const denom = len(toMcp) * len(toTip);
  const ipAngle = denom === 0 ? 0 : (Math.acos(clamp(dot(toMcp, toTip) / denom, -1, 1)) * 180) / Math.PI;

  return tipOut >= cfg.thumb.minTipToIndexMcp && ipAngle >= cfg.thumb.minIpAngleDeg;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** `T0 I1 M1 R0 P0` */
export function formatChord(chord: PseudoChord): string {
  return CHORD_ORDER.map((k) => `${k}${chord[k] ? 1 : 0}`).join(" ");
}

/** `01100` (T I M R P) */
export function chordBits(chord: PseudoChord): string {
  return CHORD_ORDER.map((k) => (chord[k] ? "1" : "0")).join("");
}
