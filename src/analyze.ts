import type { GestureRecognizerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Vec2 } from "./box";
import { APP, FEATURES } from "./config";
import type { Handedness, Point3 } from "./hand";
import { clawExtension, othersReach, palmCentre, pinchRatio, tiltDeg } from "./handFeatures";
import { assignHands, thumbSide, type HandSource, type ThumbSide } from "./handedness";
import { palmFacingInfo } from "./palmFacing";
import { pseudoChord, type PseudoChord } from "./pseudoChord";

/** Everything the readout and the overlay need to know about one detected hand. */
export interface HandReading {
  /**
   * The dancer's own hand. R6: told from the THUMB (handedness.ts: palm assumed to face the camera), and with two hands
   * the pair is made consistent; the model's label is only `modelHand`. Set by `analyze` (`readHand` alone gives the model's label).
   */
  hand: Handedness;
  /** How `hand` was decided: the thumb, the pair rule (the opposite of the other hand), the one-hand default (right), or the model's label. */
  handSource: HandSource;
  /** The model's own label (corrected for APP.swapHandedness) and its confidence: kept as a fallback and a debug readout. */
  modelHand: Handedness;
  handScore: number;
  /** The thumb rule's own reading (side, and its confidence: 0 = no information). */
  thumb: ThumbSide;
  chord: PseudoChord;
  /** MediaPipe's shape label, e.g. Open_Palm, or "None". */
  shape: string;
  shapeScore: number;
  /** READOUT ONLY since R6 (the palm is assumed to face the camera): whether the model's label and the hand's geometry agree that the palm is to the camera. */
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
  /** The same for middle, ring and pinky only (low in a fist). */
  othersReach: number;
  /** R4b knob: the wrist-to-middle-knuckle needle against straight up, degrees, clockwise positive as the user sees the mirrored picture. */
  tiltDeg: number;
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
  const modelHand = userHand(modelHandLabel);
  const iso = toIsotropic(landmarks, width, height);
  const palm = palmFacingInfo(iso, modelHand, FEATURES);
  return {
    hand: modelHand,
    handSource: "model",
    modelHand,
    handScore,
    thumb: thumbSide(iso),
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
    othersReach: othersReach(iso),
    tiltDeg: tiltDeg(iso),
  };
}

/**
 * Readings for every detected hand. `remap` maps a hand's landmarks to full-frame coordinates when the model was given a
 * crop (zoom.ts); `width`/`height` are the full frame's, so geometry stays isotropic.
 */
export function analyze(
  result: GestureRecognizerResult,
  width: number,
  height: number,
  remap?: (lm: NormalizedLandmark[]) => NormalizedLandmark[],
): HandReading[] {
  const readings: HandReading[] = [];
  for (let i = 0; i < result.landmarks.length; i++) {
    const handCat = result.handedness[i]?.[0];
    const shapeCat = result.gestures[i]?.[0];
    readings.push(
      readHand(
        remap ? remap(result.landmarks[i]) : result.landmarks[i],
        handCat?.categoryName ?? "Right",
        handCat?.score ?? 0,
        shapeCat?.categoryName || "None",
        shapeCat?.score ?? 0,
        width,
        height,
      ),
    );
  }
  // R6: the dancer's hands from the thumbs (and the pair rule), not from the model's labels.
  const labels = assignHands(readings);
  readings.forEach((r, i) => {
    r.hand = labels[i].hand;
    r.handSource = labels[i].source;
  });
  // Left-most on screen first. The display is mirrored, so larger raw x is further left.
  readings.sort((a, b) => b.wristX - a.wristX);
  return readings;
}
