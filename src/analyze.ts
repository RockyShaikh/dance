import type { GestureRecognizerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Vec2 } from "./box";
import { APP, FEATURES } from "./config";
import type { Handedness, Point3 } from "./hand";
import { clawExtension, palmCentre, pinchRatio } from "./handFeatures";
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
  /** Palm centre in display-normalized coordinates (mirrored, 0..1), the point tested against the command box. */
  palm: Vec2;
  /** Thumb tip to index tip, in palm sizes (about 0 = pinching). */
  pinchRatio: number;
  /** Finger reach: about 1.9 open, 1.3-1.6 claw, 1.0 fist. */
  clawExt: number;
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

/** Everything the app derives from one hand's landmarks plus the model's labels. */
export function readHand(
  landmarks: NormalizedLandmark[],
  modelHandLabel: string,
  handScore: number,
  shape: string,
  shapeScore: number,
  width: number,
  height: number,
): HandReading {
  const hand = userHand(modelHandLabel);
  const iso = toIsotropic(landmarks, width, height);
  const palm = palmFacingInfo(iso, hand, FEATURES);
  return {
    hand,
    handScore,
    chord: pseudoChord(iso, FEATURES),
    shape,
    shapeScore,
    palmFacing: palm.facing,
    palmScore: palm.score,
    landmarks,
    wristX: landmarks[0].x,
    palm: palmCentre(landmarks),
    pinchRatio: pinchRatio(iso),
    clawExt: clawExtension(iso),
  };
}

export function analyze(result: GestureRecognizerResult, width: number, height: number): HandReading[] {
  const readings: HandReading[] = [];
  for (let i = 0; i < result.landmarks.length; i++) {
    const handCat = result.handedness[i]?.[0];
    const shapeCat = result.gestures[i]?.[0];
    readings.push(
      readHand(
        result.landmarks[i],
        handCat?.categoryName ?? "Right",
        handCat?.score ?? 0,
        shapeCat?.categoryName || "None",
        shapeCat?.score ?? 0,
        width,
        height,
      ),
    );
  }
  // Left-most on screen first. The display is mirrored, so larger raw x is further left.
  readings.sort((a, b) => b.wristX - a.wristX);
  return readings;
}
