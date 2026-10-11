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

/**
 * R2: the command classifier (command box + dwell + tap/hold + cooldown).
 * Times are in milliseconds. See docs/spec.md sections 4.2 and 4.4.
 */
export interface CommandConfig {
  /** MediaPipe Gesture Recognizer labels that count as commands. */
  shapes: readonly string[];
  /** Shapes that also have a hold action (an outer ring). The others fire when the first ring fills. */
  holdShapes: readonly string[];
  /** How long a shape must be held before the first ring is full. */
  dwellMs: number;
  /** Tunable range of `dwellMs` (the spec's 0.6 s is a minimum; tune up from there). */
  dwellMinMs: number;
  dwellMaxMs: number;
  /** Hold fires when the shape has been held this long in total (outer ring)... */
  holdMs: number;
  /** ...but never sooner than this long after the first ring fills, so the slider can't squash the tap window. */
  holdMinGapMs: number;
  /** After anything fires, no new dwell may start for this long. */
  cooldownMs: number;
  /**
   * A shape that vanishes for less than this (a dropped or flickering frame)
   * still counts as held. A longer gap is a release.
   */
  dropoutGraceMs: number;
  /** Ignore a shape label the model is less sure of than this. */
  minShapeScore: number;
  requirePalmFacing: boolean;
  stillness: {
    /** Optional extra filter, off by default: the palm centre must stay put during the hold. */
    enabled: boolean;
    /** Largest allowed drift of the palm centre, as a fraction of the frame HEIGHT. */
    maxMove: number;
  };
}

export const COMMANDS: CommandConfig = {
  shapes: ["Open_Palm", "Pointing_Up", "Victory"],
  holdShapes: ["Pointing_Up", "Victory"],
  dwellMs: 600,
  dwellMinMs: 600,
  dwellMaxMs: 1200,
  holdMs: 1500,
  holdMinGapMs: 400,
  cooldownMs: 1000,
  dropoutGraceMs: 120,
  minShapeScore: 0.5,
  requirePalmFacing: true,
  stillness: { enabled: false, maxMove: 0.06 },
};

/** R2: the command box, in display-normalized coordinates (0..1 of the mirrored view as the user sees it). */
export const BOX = {
  /** Smallest width or height the mouse can resize it to. */
  minSize: 0.08,
  /** How close (in screen pixels) the pointer must be to an edge to grab it. */
  grabPx: 14,
} as const;

/**
 * R2: clutch shapes (pinch, claw, two-hand). Detected and displayed only; nothing
 * is controlled by them yet. Distances are in palm sizes (wrist to middle knuckle).
 */
export interface ClutchConfig {
  pinch: {
    /** Thumb tip to index tip below this = grabbed. Settable with the slider. */
    grabRatio: number;
    sliderMin: number;
    sliderMax: number;
    /** Released once the gap is above grabRatio * releaseFactor ("must clearly open again"). */
    releaseFactor: number;
  };
  claw: {
    /**
     * Finger extension = tip-to-wrist distance / knuckle-to-wrist distance, averaged
     * over index..pinky. An open hand is about 1.9, a fist about 1.0.
     * The hand counts as "open" at or above openExt...
     */
    openExt: number;
    /** ...and as a claw (half-curled) between minExt and maxExt. */
    minExt: number;
    maxExt: number;
    /** Once grabbed, the range widens by this much each side so a wobble doesn't drop it. */
    stayMargin: number;
    /** A claw must follow an open hand within this long ("curls in as if grabbing a ball"). */
    openToClawMs: number;
  };
  twoHand: {
    /** Which screen side (as the user sees it, mirrored) the modifier hand is on. */
    modifierSide: "left" | "right";
    /** The modifier shape. */
    modifierShape: string;
  };
  /** A grab with no hand tracked releases after this long (the value would freeze meanwhile). */
  releaseGraceMs: number;
}

export const CLUTCH: ClutchConfig = {
  pinch: { grabRatio: 0.3, sliderMin: 0.1, sliderMax: 0.6, releaseFactor: 1.6 },
  claw: { openExt: 1.75, minExt: 1.25, maxExt: 1.65, stayMargin: 0.08, openToClawMs: 500 },
  twoHand: { modifierSide: "left", modifierShape: "Open_Palm" },
  releaseGraceMs: 300,
};
