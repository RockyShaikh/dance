/** Geometry features of one hand used by the command box and the clutch shapes. Pure functions of landmarks. */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Vec2 } from "./box";
import { LM, LANDMARK_COUNT, dist, type Point3 } from "./hand";

/** The wrist and the four finger-base knuckles: their average is the palm centre. */
const PALM_POINTS = [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP] as const;

/**
 * The palm centre, in DISPLAY-normalized coordinates (see box.ts).
 *
 * Input is the raw, un-mirrored normalized landmarks straight from the model.
 * The picture is mirrored for display, so display x = 1 - raw x; y is unchanged.
 * This is the one place where that flip is done.
 */
export function palmCentre(lm: readonly Pick<NormalizedLandmark, "x" | "y">[]): Vec2 {
  if (lm.length < LANDMARK_COUNT) throw new Error(`palmCentre needs ${LANDMARK_COUNT} landmarks, got ${lm.length}`);
  let x = 0;
  let y = 0;
  for (const i of PALM_POINTS) {
    x += lm[i].x;
    y += lm[i].y;
  }
  return { x: 1 - x / PALM_POINTS.length, y: y / PALM_POINTS.length };
}

function palmSize(lm: readonly Point3[]): number {
  return dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP]);
}

/**
 * Pinch gap: thumb tip to index tip, in palm sizes (wrist to middle knuckle), so it
 * works at any distance. About 0 with the tips touching, 0.8 or more with the hand
 * open. Landmarks are isotropic (see `Point3`).
 */
export function pinchRatio(lm: readonly Point3[]): number {
  const size = palmSize(lm);
  if (size === 0) return Infinity;
  return dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / size;
}

/** Index, middle, ring, pinky: [knuckle (MCP), tip]. */
const FINGER_ENDS = [
  [LM.INDEX_MCP, LM.INDEX_TIP],
  [LM.MIDDLE_MCP, LM.MIDDLE_TIP],
  [LM.RING_MCP, LM.RING_TIP],
  [LM.PINKY_MCP, LM.PINKY_TIP],
] as const;

/**
 * How far the four fingers reach out from the palm: the mean over index..pinky of
 * (tip to wrist) / (knuckle to wrist). A splayed open hand is about 1.9, a
 * half-curled "claw" about 1.3 to 1.6, a fist about 1.0. Used for the claw clutch.
 */
export function clawExtension(lm: readonly Point3[]): number {
  const wrist = lm[LM.WRIST];
  let sum = 0;
  for (const [mcp, tip] of FINGER_ENDS) {
    const base = dist(lm[mcp], wrist);
    sum += base === 0 ? 0 : dist(lm[tip], wrist) / base;
  }
  return sum / FINGER_ENDS.length;
}
