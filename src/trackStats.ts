/**
 * R8: the measurement HUD's numbers (pure): the palm's size as the detector sees it, and the detection-rate counters.
 *
 * "Palm width" is the distance between the index and pinky knuckles (landmarks 5 and 17), about 7-8 cm on a real hand, in
 * isotropic pixels of the full frame. The palm detector sees its input (the frame, or the crop in its square canvas) scaled so
 * the long side is 192 px, so the palm at the detector is `framePx * 192 / side`, `side` being the model canvas's side (the
 * long side of the frame with no crop). Earlier research estimated the detector fails below roughly 6-8 px (not measured).
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { TRACK } from "./config";
import { LM } from "./hand";

/** The palm's width in full-frame pixels. */
export function palmWidthPx(lm: readonly NormalizedLandmark[], W: number, H: number): number {
  const a = lm[LM.INDEX_MCP];
  const b = lm[LM.PINKY_MCP];
  return Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
}

/** The hand's length in full-frame pixels: wrist to middle fingertip (does not shrink when the palm turns edge-on, unlike the palm's width). */
export function handLengthPx(lm: readonly NormalizedLandmark[], W: number, H: number): number {
  const a = lm[LM.WRIST];
  const b = lm[LM.MIDDLE_TIP];
  return Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
}

/** A length in full-frame pixels, as the palm detector sees it, when the model's square input canvas has side `side` px. */
export function atDetector(framePx: number, side: number, detector = TRACK.detectorInput): number {
  return (framePx * detector) / side;
}

/** What one frame looked like, for the counters. */
export interface FrameObservation {
  /** Pose found a person this frame (null: pose did not run). */
  pose: boolean | null;
  /** The pose sees at least one wrist (null: pose did not run). */
  wristVisible: boolean | null;
  /** The hand model found at least one hand. */
  hand: boolean;
}

/** Running counts since the last reset. */
export class DetectionCounter {
  frames = 0;
  poseFrames = 0;
  /** Frames where pose ran. */
  poseRan = 0;
  wristFrames = 0;
  handFrames = 0;
  /** Of the frames with a pose-visible wrist: those where a hand was found too (the number that matters). */
  handWhenWrist = 0;

  push(o: FrameObservation): void {
    this.frames++;
    if (o.pose !== null) this.poseRan++;
    if (o.pose) this.poseFrames++;
    if (o.wristVisible) this.wristFrames++;
    if (o.hand) this.handFrames++;
    if (o.wristVisible && o.hand) this.handWhenWrist++;
  }

  reset(): void {
    this.frames = this.poseFrames = this.poseRan = this.wristFrames = this.handFrames = this.handWhenWrist = 0;
  }

  /** "hand 41/60 (68%) · hand while pose sees a wrist 33/40 (83%)" */
  text(): string {
    const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : "n/a");
    const hand = `hand ${this.handFrames}/${this.frames} (${pct(this.handFrames, this.frames)})`;
    if (this.poseRan === 0) return `${hand} · pose off`;
    return `${hand} · while pose sees a wrist ${this.handWhenWrist}/${this.wristFrames} (${pct(this.handWhenWrist, this.wristFrames)})`;
  }
}
