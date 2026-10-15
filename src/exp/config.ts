/**
 * EXP (push-and-swipe measurement bench): every number here is a first guess to be replaced by what the recordings show.
 * Nothing in the product reads this file; the bench is behind `?exp=push`.
 */

export const PUSH = {
  /** The window the growth / shrink / depth change is measured over: "grew X% within ~250 ms". */
  windowMs: 250,
  /** Light smoothing of each raw series before the window comparison (EMA time constant). */
  smoothMs: 50,
  /** A gap in the samples longer than this ends the track (the hand was lost): history starts over. */
  gapMs: 300,
  /**
   * Thresholds to enter a push, per signal: a = palm size grows by this fraction in the window; b = forearm 2D length shrinks by this
   * fraction (relative to its own value); c = wrist depth moves toward the camera by this many metres (pose world z); d = the combined score
   * (each signal over its own threshold, averaged over those available), so 0.8 is "about 80% of every threshold".
   */
  enter: { a: 0.06, b: 0.15, c: 0.1, d: 0.8 },
  /** The push is over once the signal falls to this fraction of its peak ("then stops"). */
  fallFrac: 0.6,
  /** A rise that has lasted longer than this is a slow approach, not a push. */
  maxRiseMs: 600,
  /** The palm centre may not travel more than this many hand sizes within the window (an arm swing sweeps sideways; a push mostly does not). */
  lateralMax: 0.8,
  /** After an event (or a rejected rise) the same signal stays quiet this long. */
  refractoryMs: 600,
  /** A pose point counts as seen above this visibility. */
  minVisibility: 0.4,
} as const;

export type PushSignalKey = "a" | "b" | "c" | "d";
export const PUSH_KEYS: readonly PushSignalKey[] = ["a", "b", "c", "d"];

export const SIGNAL_NAMES: Record<PushSignalKey, string> = {
  a: "palm size growth",
  b: "forearm foreshortening",
  c: "wrist depth (pose z)",
  d: "combined",
};

export const SWIPE = {
  /** Seconds of scrub for a hand sweep across the whole picture width. 0 in the settings means "the whole track" (one slider). */
  gainSec: 20,
  /** Hand speed (picture widths per second) below which nothing scrubs: keeps rest jitter out. */
  minSpeed: 0.03,
  /** Ignore movement this long after touch-down (the hand is still arriving). */
  settleMs: 0,
  /** A hand missing for less than this keeps the touch (single dropped frames). */
  lostGraceMs: 100,
  /** Windows for the accidental-scrub numbers at touch-down and lift. */
  edgeWindowMs: 300,
  /** Hand speed (picture widths per second) that counts as "moving" for the stop latency. */
  fastSpeed: 0.15,
  /** The hand must be slower than this for this long before the stop latency is read. */
  stopHoldMs: 150,
} as const;
