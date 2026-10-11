import { FEATURES, type FeatureConfig } from "./config";
import { LM, LANDMARK_COUNT, cross, len, sub, type Handedness, type Point3 } from "./hand";

export interface PalmFacing {
  /** Palm toward the camera and not too tilted away. */
  facing: boolean;
  /**
   * Cosine of the angle between the palm normal and the direction toward the
   * camera: +1 = palm square to the camera, 0 = side-on, -1 = back of hand.
   */
  score: number;
}

/**
 * Is the palm of this hand turned toward the camera?
 *
 * The palm normal is the cross product of (wrist -> index knuckle) and
 * (wrist -> pinky knuckle). Which way that normal points for a palm-toward-camera
 * hand flips between left and right hands, so handedness is needed.
 *
 * Coordinates are isotropic image space (x right, y down, smaller z = closer to
 * the camera). For the dancer's RIGHT hand seen palm-first by an un-mirrored
 * camera, the thumb side is at larger x, and this cross product points toward the
 * camera (z < 0). For the LEFT hand it is the opposite.
 *
 * `hand` is the dancer's own hand (already corrected for the mirrored-image
 * convention in MediaPipe's labels).
 */
export function palmFacingInfo(
  lm: readonly Point3[],
  hand: Handedness,
  cfg: FeatureConfig = FEATURES,
): PalmFacing {
  if (lm.length < LANDMARK_COUNT) {
    throw new Error(`palmFacing needs ${LANDMARK_COUNT} landmarks, got ${lm.length}`);
  }
  const wrist = lm[LM.WRIST];
  const normal = cross(sub(lm[LM.INDEX_MCP], wrist), sub(lm[LM.PINKY_MCP], wrist));
  const n = len(normal);
  if (n === 0) return { facing: false, score: 0 };

  // Right hand palm-to-camera has normal.z < 0; left has normal.z > 0.
  const towardCamera = hand === "Right" ? -normal.z : normal.z;
  const score = towardCamera / n;
  return { facing: score >= cfg.palm.minFacingCos, score };
}

export function palmFacing(
  lm: readonly Point3[],
  hand: Handedness,
  cfg: FeatureConfig = FEATURES,
): boolean {
  return palmFacingInfo(lm, hand, cfg).facing;
}
