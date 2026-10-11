import type { GestureRecognizerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { APP, FEATURES } from "./config";
import type { Handedness, Point3 } from "./hand";
import { palmFacingInfo } from "./palmFacing";
import { pseudoChord, type PseudoChord } from "./pseudoChord";

/** Everything the readout and the overlay need to know about one detected hand. */
export interface HandReading {
  /** The dancer's own hand (label already corrected for the un-mirrored frame). */
  hand: Handedness;
  handScore: number;
  chord: PseudoChord;
  /** MediaPipe's shape label, e.g. Open_Palm, or "None". */
  shape: string;
  shapeScore: number;
  palmFacing: boolean;
  /** Raw palm-facing score (cosine, +1 = palm square to camera); for tuning. */
  palmScore: number;
  /** Normalized landmarks (0..1), for drawing. */
  landmarks: NormalizedLandmark[];
  /** Wrist x in the raw frame, used to order cards the way the user sees them. */
  wristX: number;
}

/** Normalized (0..1) landmarks to isotropic pixel space, so geometry is not stretched by the aspect ratio. */
export function toIsotropic(lm: readonly NormalizedLandmark[], width: number, height: number): Point3[] {
  return lm.map((p) => ({ x: p.x * width, y: p.y * height, z: p.z * width }));
}

function userHand(label: string): Handedness {
  const modelSaysLeft = label === "Left";
  const swapped = APP.swapHandedness ? !modelSaysLeft : modelSaysLeft;
  return swapped ? "Left" : "Right";
}

export function analyze(result: GestureRecognizerResult, width: number, height: number): HandReading[] {
  const readings: HandReading[] = [];
  for (let i = 0; i < result.landmarks.length; i++) {
    const landmarks = result.landmarks[i];
    const handCat = result.handedness[i]?.[0];
    const shapeCat = result.gestures[i]?.[0];
    const hand = userHand(handCat?.categoryName ?? "Right");
    const iso = toIsotropic(landmarks, width, height);
    const palm = palmFacingInfo(iso, hand, FEATURES);
    readings.push({
      hand,
      handScore: handCat?.score ?? 0,
      chord: pseudoChord(iso, FEATURES),
      shape: shapeCat?.categoryName || "None",
      shapeScore: shapeCat?.score ?? 0,
      palmFacing: palm.facing,
      palmScore: palm.score,
      landmarks,
      wristX: landmarks[0].x,
    });
  }
  // Left-most on screen first. The display is mirrored, so larger raw x is further left.
  readings.sort((a, b) => b.wristX - a.wristX);
  return readings;
}
