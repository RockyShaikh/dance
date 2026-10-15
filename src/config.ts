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
 * R2: the command classifier (command box + dwell + cooldown). Every command fires once, when its
 * ring fills: no gesture depends on how long it is held (R4a amendment).
 * Times are in milliseconds. See docs/spec.md sections 4.2 and 4.4.
 */
export interface CommandConfig {
  /** MediaPipe Gesture Recognizer labels that count as commands. */
  shapes: readonly string[];
  /** How long a shape must be held before the ring is full and the command fires. */
  dwellMs: number;
  /** Tunable range of `dwellMs` (the spec's 0.6 s is a minimum; tune up from there). */
  dwellMinMs: number;
  dwellMaxMs: number;
  /** After anything fires, no new dwell may start for this long. */
  cooldownMs: number;
  /** R4b: how long commands stay blocked after a knob grab ends (a grab suppresses them; see `StepInput.suppress`). */
  suppressCooldownMs: number;
  /**
   * A shape that vanishes for less than this (a dropped or flickering frame)
   * still counts as held. A longer gap is a release.
   */
  dropoutGraceMs: number;
  /** Ignore a shape label the model is less sure of than this. */
  minShapeScore: number;
  requirePalmFacing: boolean;
  /** Shapes that do not show the palm to the camera by nature (a thumbs up): the palm-facing rule does not apply to them. */
  palmFacingExempt: readonly string[];
  /** Shapes only the right hand commands with (the left hand is not armed for them, so it cannot cool the right hand down). */
  rightOnlyShapes: readonly string[];
  stillness: {
    /** Optional extra filter, off by default: the palm centre must stay put during the hold. */
    enabled: boolean;
    /** Largest allowed drift of the palm centre, as a fraction of the frame HEIGHT. */
    maxMove: number;
  };
}

export const COMMANDS: CommandConfig = {
  // R5: Thumb_Up (right hand) toggles the whole track between 2x and 1x.
  shapes: ["Open_Palm", "Pointing_Up", "Victory", "Thumb_Up"],
  dwellMs: 600,
  dwellMinMs: 600,
  dwellMaxMs: 1200,
  cooldownMs: 1000,
  suppressCooldownMs: 500,
  dropoutGraceMs: 120,
  minShapeScore: 0.5,
  requirePalmFacing: true,
  palmFacingExempt: ["Thumb_Up"],
  rightOnlyShapes: ["Thumb_Up"],
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
    /**
     * A fist is not a pinch: its thumb tip lies right against the curled index finger.
     * To START a pinch, the middle, ring and pinky must be at least this far out
     * (same finger-reach scale as the claw: open about 1.9, fist about 1.0).
     */
    minOthersReach: number;
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
    /**
     * What tells a claw from a relaxed, half-curled hand: the CHANGE. The hand must have
     * been clearly open (reach >= openExt) within this long before it reached the half-curled
     * band ("curls in as if grabbing a ball"). A hand that is simply half-curled at rest never
     * grabs. Real-hand tuning of the numbers is expected.
     */
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
  pinch: { grabRatio: 0.3, sliderMin: 0.1, sliderMax: 0.6, releaseFactor: 1.6, minOthersReach: 1.3 },
  claw: { openExt: 1.75, minExt: 1.25, maxExt: 1.65, stayMargin: 0.08, openToClawMs: 500 },
  twoHand: { modifierSide: "left", modifierShape: "Open_Palm" },
  releaseGraceMs: 300,
};

/**
 * R4a: loops (docs/spec.md sections 4.5 and 4.6). Times are in seconds of music.
 */
export const LOOP = {
  /**
   * A gesture mark is stamped where the music was when the ring STARTED, minus this: reaction
   * plus recognition time makes marks land late. (A key or button marks the playhead as is.)
   */
  markOffsetSec: 0.15,
  /** R4b: for this long after a scrub ends (and while one runs, or while paused) a mark is the exact playhead, no offset. */
  exactAfterScrubMs: 2500,
  /** Smallest loop: the END must be at least this far after the START (also bounds the nudge). */
  minGapSec: 0.5,
  /** Nudge step for [ and ], and with Shift. */
  nudgeStepSec: 0.1,
  nudgeBigStepSec: 1,
  /**
   * The wrap seeks when the playhead is within this of END. 0 = at END. A positive value cuts the
   * end short on purpose, to cancel the check's own delay; tuned from the measured overshoot.
   */
  wrapLookaheadSec: 0,
  /** How often the wrap check polls (a requestAnimationFrame check runs as well). */
  wrapPollMs: 4,
  /** How long the huge START time stays up after a nudge. */
  nudgeReadoutMs: 1800,
} as const;

/**
 * R4b: the knob (docs/spec.md section 5). Three separate, swappable pieces:
 *   CLUTCH (am I grabbing?) -> MOTION (what am I turning?) -> MAPPING (how turning moves the value).
 * R4b's value is the loop START, in seconds of music. Angles are in degrees, display-clockwise
 * positive (as the user sees the mirrored picture). Clockwise = later, counter-clockwise = earlier.
 */
export type ClutchKind = "claw" | "pinch" | "twoHand";
export type MotionKind = "tilt" | "circling";
export type MappingKind = "joystick" | "absolute" | "relative" | "jog";
/** What the knob moves (the output is a delta in seconds applied to one of these). Default: the playhead, audibly. */
export type KnobTarget = "playhead" | "start" | "end";

export interface KnobConfig {
  /** What the settings panel starts with (the user's choice: claw as the default grab). */
  defaults: { clutch: ClutchKind; motion: MotionKind; mapping: MappingKind; target: KnobTarget; gain: number; deadZoneDeg: number; invert: boolean };
  /** Seconds-per-second multiplier per target: scrubbing the playhead wants to be faster than nudging a marker. */
  targetScale: Record<KnobTarget, number>;
  /**
   * Which of the dancer's hands steers a claw or pinch grab (docs/spec.md 5.2, two-hand roles: the right
   * hand is transport + scrub, the left hand marks). A grab by the other hand is ignored by the knob.
   */
  steeringHand: "Left" | "Right";
  /** Panel slider ranges. `gain` multiplies every mapping; the dead zone is the joystick's. */
  gainMin: number;
  gainMax: number;
  deadZoneMinDeg: number;
  deadZoneMaxDeg: number;
  tilt: {
    /** Weight of the newest sample in a running average (1 = no smoothing). Landmarks jitter by a degree or two. */
    smoothing: number;
  };
  circling: {
    /** The circle's centre is the average palm position over this long ("a ~1 s running average"). */
    windowMs: number;
    /** The palm must be at least this far from that centre (as a fraction of the frame HEIGHT) to count as circling. */
    minRadius: number;
    /** Nothing is measured until the window holds at least this much history. */
    warmupMs: number;
  };
  joystick: {
    /** Tilt (away from where you grabbed) at which the rate is at its maximum. */
    fullTiltDeg: number;
    /** Maximum nudge speed, seconds of music per second. Low: the job is "a couple of counts". */
    maxRateSecPerSec: number;
    /** 1 = linear; above 1 gives finer control near the centre. */
    curve: number;
  };
  absolute: {
    /** The wiper's world range: tilt is clamped to +-this from straight up, so a sweep can run out. */
    worldRangeDeg: number;
    /** Seconds of START per degree of tilt. */
    secPerDeg: number;
  };
  relative: {
    /**
     * Seconds of value per degree turned, at a slow turn (no end to the range: re-grab, or flick, to keep going).
     * Fine control lives here: a degree of tilt is about 30 ms.
     */
    secPerDeg: number;
    /**
     * Jitter guard: the value follows the hand only once the tilt has moved more than this (degrees) from
     * the last place it followed to, so a hand held still stays exactly where it is (no creeping, no snippets).
     */
    holdDeg: number;
    /**
     * Pointer-style acceleration (R4c): a fast turn moves the value farther per degree than a slow one, so one
     * wrist sweep can cross a song and a slow turn still lands within milliseconds. The factor is 1 at or below
     * `slowDegPerSec`, rising to `maxBoost` at `fastDegPerSec`. It only scales a movement that is happening, so
     * stopping the turn stops the value at once whatever the boost was.
     */
    slowDegPerSec: number;
    fastDegPerSec: number;
    maxBoost: number;
    /** Weight of the newest frame in the turn-speed average that picks the boost (1 = no averaging). */
    speedSmoothing: number;
  };
  jog: {
    /** Seconds of START per full circle of the hand. */
    secPerTurn: number;
  };
  /** A frame gap longer than this counts as this long, so a stall can't make a jump. */
  maxDtSec: number;
}

export const KNOB: KnobConfig = {
  // R4c: the two-hand steering wheel (left hand up, right hand tilts) with a position-style mapping, so that
  // stopping the rotation stops the music's movement at once (the joystick keeps moving until you return to centre).
  defaults: { clutch: "twoHand", motion: "tilt", mapping: "relative", target: "playhead", gain: 1, deadZoneDeg: 12, invert: false },
  targetScale: { playhead: 1.5, start: 1, end: 1 },
  steeringHand: "Right",
  gainMin: 0.25,
  gainMax: 3,
  deadZoneMinDeg: 3,
  deadZoneMaxDeg: 30,
  tilt: { smoothing: 0.8 },
  circling: { windowMs: 1000, minRadius: 0.035, warmupMs: 300 },
  joystick: { fullTiltDeg: 60, maxRateSecPerSec: 3, curve: 1.5 },
  absolute: { worldRangeDeg: 70, secPerDeg: 0.06 },
  relative: { secPerDeg: 0.03, holdDeg: 1, slowDegPerSec: 40, fastDegPerSec: 200, maxBoost: 10, speedSmoothing: 0.8 },
  jog: { secPerTurn: 2 },
  maxDtSec: 0.1,
};

/**
 * R4b/R4c: audible scrub of the playhead (the knob's default target). While grabbed the music follows the
 * hand through seeks. The seek policy (scrub.ts) is what keeps the audio from skipping: playing, the music
 * keeps playing and is re-seeked only once the hand has moved it by more than a small threshold; the latest
 * position always wins, and a seek that is still in flight is never stacked on.
 */
export interface ScrubConfig {
  /** At most this many seeks per second. */
  maxSeeksPerSec: number;
  /** Playing: the hand's offset must reach this (seconds) before the music is re-seeked. More = fewer seeks, less skipping. */
  moveThresholdSec: number;
  /** After the hand stops, an offset of at least `settleMinSec` is still applied once the hand has been still this long. */
  settleMs: number;
  settleMinSec: number;
  /** A seek that has not finished after this long no longer blocks the next one. */
  staleSeekMs: number;
  /** Paused scrub: audio plays while the hand moves and for this long after the last movement, then pauses exactly at the position. */
  snippetMs: number;
}

export const SCRUB: ScrubConfig = {
  maxSeeksPerSec: 20,
  moveThresholdSec: 0.1,
  settleMs: 120,
  settleMinSec: 0.01,
  staleSeekMs: 250,
  snippetMs: 70,
};

/**
 * R4c: the two-hand steering wheel. The left hand's shape picks what the right hand's tilt moves, live,
 * while the grab continues:
 *   open palm = the playhead with the music PLAYING; fist = the playhead with the music PAUSED;
 *   V = loop START; index finger up = loop END.
 * A grab begins with the left open palm (and the right hand in its box). Marks (left V / index) work as
 * before when the right hand is not steering.
 */
export const STEER = {
  /** A different left-hand shape must hold this long (ms) before the mode changes: a flicker must not toggle play / pause. */
  modeDebounceMs: 120,
  /**
   * The fist is the model's weakest shape, so a hand whose label is none of the other three counts as a fist
   * when its four fingers are curled in: reach (tip-to-wrist over knuckle-to-wrist, averaged) at or below this.
   * Measured on real hands in R2: a fist is about 1.0 (the hand-made test fixture's fist is a looser 1.21),
   * a pointing index about 1.3, a claw 1.25 to 1.65, an open hand about 1.9.
   */
  fistMaxReach: 1.15,
  /** The model's confidence a label needs to count (the fist's bar is lower: it is weakly scored). */
  minShapeScore: 0.5,
  minFistScore: 0.3,
} as const;

/** R4c: the waveform. Peaks are computed once per track; drawing only reads them. */
export const WAVE = {
  /** Decode at this sample rate (peaks need no more, and memory stays small). */
  decodeRate: 22050,
  /** Samples per peak bin (about 1.5 ms): the zoomed view reads these directly. */
  binSamples: 32,
  /** The zoomed steering view shows this many seconds either side of what is being steered. */
  zoomHalfWindowSec: 3,
} as const;

/**
 * R5: playback speed. Not a knob (user: "just speeding up and slowing down the entire track and just letting it
 * play"): the right-hand thumbs up toggles the whole track between 2x and 1x, and `-` / `=` step through presets.
 */
export const SPEED = {
  /** The toggle's two speeds. */
  fast: 2,
  normal: 1,
  /** `-` and `=` step through these. */
  steps: [0.5, 0.75, 1, 1.5, 2],
} as const;
