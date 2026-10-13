/**
 * R8: putting per-crop recognizer results back together in full-frame coordinates (pure).
 *
 * Person mode has one crop, so its landmarks just go through `toFullFrame` (`mapLandmarks`). Wrists mode runs the recognizer on
 * one crop per wrist: each crop's result is filtered to the hand that belongs to that wrist (a crop can hold both hands when the
 * arms cross or the hands are together, and a stranger's hand), mapped back, and the pieces are merged into one result, so
 * `analyze()` and everything downstream see the same thing as with a whole-frame pass.
 */
import type { GestureRecognizerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { TRACK } from "./config";
import { toFullFrame, type CropLayout } from "./zoom";

/** Hand landmarks found in a crop's square canvas, mapped to the full raw frame (normalized). Visibility etc. are kept. */
export function mapLandmarks(lm: readonly NormalizedLandmark[], L: CropLayout): NormalizedLandmark[] {
  return lm.map((p) => ({ ...p, ...toFullFrame(p, L) }));
}

/** One crop's result: what the recognizer returned for it, how it was cropped, and where the pose says the wrist is. */
export interface CropResult {
  result: GestureRecognizerResult;
  layout: CropLayout;
  /** The pose wrist, full frame, normalized. */
  anchor: { x: number; y: number };
}

/**
 * The index of the hand in `result` whose wrist (mapped to the full frame) is nearest `anchor`, within `maxFrac` of the
 * crop's side; -1 if there is none. Distances are isotropic pixels.
 */
export function nearestHand(part: CropResult, maxFrac = TRACK.wrist.maxAnchorFrac): number {
  const { result, layout: L, anchor } = part;
  let best = -1;
  let bestD = maxFrac * L.side;
  for (let i = 0; i < result.landmarks.length; i++) {
    const w = toFullFrame(result.landmarks[i][0], L);
    const d = Math.hypot((w.x - anchor.x) * L.srcW, (w.y - anchor.y) * L.srcH);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * One result for the whole frame from several crops (plus which crop each hand came from): for each crop, its hand nearest its wrist, in full-frame coordinates. Two
 * crops that found the same hand (wrists closer than `dupFrac` of the frame height) count it once, the first crop's.
 */
export function mergeCropResults(parts: readonly CropResult[], dupFrac = TRACK.wrist.dupFrac): { result: GestureRecognizerResult; sources: number[] } {
  const merged: GestureRecognizerResult = { landmarks: [], worldLandmarks: [], handedness: [], handednesses: [], gestures: [] };
  /** For each merged hand, the index in `parts` of the crop it came from. */
  const sources: number[] = [];
  const kept: { x: number; y: number }[] = [];
  for (const [pi, part] of parts.entries()) {
    const i = nearestHand(part);
    if (i < 0) continue;
    const L = part.layout;
    const mapped = mapLandmarks(part.result.landmarks[i], L);
    const w = mapped[0];
    if (kept.some((k) => Math.hypot((k.x - w.x) * L.srcW, (k.y - w.y) * L.srcH) < dupFrac * L.srcH)) continue;
    kept.push({ x: w.x, y: w.y });
    sources.push(pi);
    merged.landmarks.push(mapped);
    merged.worldLandmarks.push(part.result.worldLandmarks[i] ?? []);
    merged.handedness.push(part.result.handedness[i] ?? []);
    merged.handednesses.push(part.result.handednesses?.[i] ?? part.result.handedness[i] ?? []);
    merged.gestures.push(part.result.gestures[i] ?? []);
  }
  return { result: merged, sources };
}
