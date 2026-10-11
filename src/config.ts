/**
 * All tunable thresholds live here, in one place.
 *
 * Geometry thresholds are ratios or angles, so they do not depend on how far
 * the hand is from the camera or how the hand is rotated.
 */

export interface FeatureConfig {
  /**
   * A finger (index..pinky) counts as extended when its tip is farther from the
   * wrist than its PIP joint (the middle knuckle) by this ratio.
   * tipDist / pipDist: an extended finger is about 1.3, a curled one under 1.0.
   */
  fingerExtendRatio: number;
  thumb: {
    /**
     * The thumb is "out" when its tip is at least this far from the index
     * knuckle (MCP), measured in palm sizes (wrist to middle knuckle).
     * A tucked thumb sits around 0.2-0.4; an extended one around 0.6 and up.
     */
    minTipToIndexMcp: number;
    /**
     * ...and its tip joint is not folded: the angle at the IP joint
     * (180 = straight) must be at least this many degrees.
     */
    minIpAngleDeg: number;
  };
  palm: {
    /**
     * The palm counts as facing the camera when the palm normal points toward
     * the camera AND is within acos(this) of the camera axis.
     * 0.5 means up to 60 degrees of tilt; lower is more forgiving to side-on hands.
     */
    minFacingCos: number;
  };
}

export const FEATURES: FeatureConfig = {
  fingerExtendRatio: 1.08,
  thumb: {
    minTipToIndexMcp: 0.5,
    minIpAngleDeg: 125,
  },
  palm: {
    minFacingCos: 0.5,
  },
};

export const APP = {
  /** Gesture Recognizer model, vendored under public/ (see README for source). */
  modelPath: "models/gesture_recognizer.task",
  /** MediaPipe WASM runtime, copied to public/wasm by scripts/copy-wasm.mjs. */
  wasmPath: "wasm",
  numHands: 2,
  camera: {
    width: 1280,
    height: 720,
    frameRate: 30,
  },
  /**
   * Whether to swap MediaPipe's Left/Right label. The webcam frame is fed to the
   * model un-mirrored (we only mirror the display). Verified on a live hand
   * (2026-10-11): the model's label already matches the user's own hand here, so
   * no swap. Palm-facing depends on this label, so a wrong value inverts it too.
   */
  swapHandedness: false,
  /** Seconds over which the fps readout is averaged. */
  fpsWindowSec: 1,
} as const;
