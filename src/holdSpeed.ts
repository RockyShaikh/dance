/**
 * R5b: hold the right thumbs up to speed up, Instagram-style: 2x while it is held, back to the speed it was at
 * (e.g. 0.8x) when it is released. A pure reducer (time passed in, no DOM, no audio).
 *
 * This is a held STATE, not "a different action by how long you hold": there is one thing to do (show the thumbs up)
 * and the state follows the shape. Arming uses a short dwell (`SPEED.holdArmMs`, 0.3 s) so a thumbs up passing
 * through is ignored, and once armed it engages at once. The release is the shape being gone for `holdReleaseMs`
 * (about 150 ms: long enough to ride out a dropped frame, short enough to feel immediate).
 *
 * The caller says whether the thumbs up counts this frame (right hand, label Thumb_Up and the thumb chord agrees,
 * confident, and in its box to ARM; once armed it may leave the box) and applies `setRate`.
 */
import { SPEED } from "./config";

export interface HoldSpeedState {
  /** When the current uninterrupted thumbs up began (null: none). */
  since: number | null;
  /** Last time it counted. */
  lastSeen: number;
  /** 2x is on right now. */
  boosted: boolean;
  /** The speed to go back to. */
  restore: number;
}

export const IDLE_HOLD: HoldSpeedState = { since: null, lastSeen: 0, boosted: false, restore: 1 };

export interface HoldSpeedInput {
  t: number;
  /** The right thumbs up counts this frame. */
  thumb: boolean;
  /** The wheel is grabbed (or another reason to stand down): a boost ends at once and nothing arms. */
  suppress: boolean;
  /** The player's speed now. */
  rate: number;
}

export interface HoldSpeedStep {
  state: HoldSpeedState;
  /** Set the player to this speed now (null: leave it). */
  setRate: number | null;
}

export function stepHoldSpeed(prev: HoldSpeedState, input: HoldSpeedInput, cfg: { fast: number; holdArmMs: number; holdReleaseMs: number } = SPEED): HoldSpeedStep {
  const { t } = input;
  const s: HoldSpeedState = { ...prev };
  let setRate: number | null = null;

  const release = (): void => {
    if (s.boosted) setRate = s.restore;
    s.boosted = false;
    s.since = null;
  };

  if (input.suppress) {
    release();
    return { state: s, setRate };
  }
  if (input.thumb) {
    s.lastSeen = t;
    if (s.since === null) s.since = t;
  } else if (s.since !== null && t - s.lastSeen >= cfg.holdReleaseMs) {
    release();
  }
  if (!s.boosted && s.since !== null && input.thumb && t - s.since >= cfg.holdArmMs) {
    s.boosted = true;
    s.restore = input.rate;
    if (input.rate !== cfg.fast) setRate = cfg.fast;
  }
  return { state: s, setRate };
}
