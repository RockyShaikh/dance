/**
 * Audible scrub (R4b, reworked in R4c): while the knob is grabbed with the playhead as its target, the music
 * follows the hand through seeks, DJ-style. A pure reducer (no DOM, no audio): each frame it is told what
 * the knob moved and what the player is doing, and returns the player calls to make.
 *
 * The scrub has two modes, and the caller can switch between them mid-grab (the left hand's palm / fist):
 *  - PLAY: the music keeps playing. The hand's movement builds up as an offset (`pending`) on top of where
 *    the music is; the music is re-seeked by that offset only once it passes a small threshold, so between
 *    seeks it just plays (this is what stops the skipping). When the hand has been still for a moment, even a
 *    small offset is applied, so it lands where you stopped. Leaving play flushes the offset.
 *  - PAUSE: the music is paused and `pos` is the exact scrub position. While the hand moves, audio plays
 *    (a snippet chain) and is re-seeked only when it has drifted from `pos` by the threshold; it keeps
 *    playing for `snippetMs` after the last movement, then pauses and seeks to exactly `pos`.
 *
 * Seek policy, both modes: at most `maxSeeksPerSec`; the latest target always wins (a seek is always to
 * where the hand is NOW, never a queued older position); and while the browser is still busy with the
 * previous seek, no new one is issued (the target keeps accumulating) unless it is stale.
 */
import type { ScrubConfig } from "./config";

export type ScrubAction = { type: "seek"; to: number } | { type: "play" } | { type: "pause" };
export type ScrubMode = "play" | "pause";

export interface ScrubState {
  active: boolean;
  mode: ScrubMode;
  /** PAUSE: the scrub position, exact (the playhead lands here). */
  pos: number;
  /** PLAY: how far the hand has moved the music beyond where it is playing, not yet applied by a seek (seconds). */
  pending: number;
  lastSeekT: number;
  lastMoveT: number;
  /** PAUSE: audio is playing (a snippet chain) and must be stopped at `snippetUntil`. */
  snippetPlaying: boolean;
  snippetUntil: number;
}

export const IDLE_SCRUB: ScrubState = {
  active: false,
  mode: "play",
  pos: 0,
  pending: 0,
  lastSeekT: -Infinity,
  lastMoveT: -Infinity,
  snippetPlaying: false,
  snippetUntil: 0,
};

export interface ScrubInput {
  /** Milliseconds, must not go backwards. */
  t: number;
  /** The knob is grabbed and its target is the playhead. */
  active: boolean;
  /** PLAY: keep the music playing while moving it. PAUSE: paused, with snippets. May change mid-grab. */
  mode: ScrubMode;
  /** How far the knob moved the playhead this frame, seconds (0 when it is at rest). */
  deltaSec: number;
  /** The player is playing right now. */
  playing: boolean;
  /** The player's playhead right now. */
  current: number;
  duration: number;
  /** The audio element has a seek in flight (it has not finished the last one). */
  seeking?: boolean;
}

export interface ScrubResult {
  state: ScrubState;
  /** Player calls to make, in order. */
  actions: ScrubAction[];
  /** The scrub is in progress (true on the frame of release too: the marks use this). */
  scrubbing: boolean;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const EPS = 0.0005;

/** What to do when a scrub ends (or its mode is left): land exactly where the hand put the music. */
function settle(s: ScrubState, input: ScrubInput): ScrubAction[] {
  const actions: ScrubAction[] = [];
  if (s.mode === "play") {
    if (Math.abs(s.pending) > EPS) actions.push({ type: "seek", to: clamp(input.current + s.pending, 0, input.duration) });
  } else {
    if (s.snippetPlaying) actions.push({ type: "pause" });
    if (s.snippetPlaying || Math.abs(input.current - s.pos) > EPS) actions.push({ type: "seek", to: s.pos });
  }
  return actions;
}

export function stepScrub(prev: ScrubState, input: ScrubInput, cfg: ScrubConfig): ScrubResult {
  const { t } = input;

  if (!input.active) {
    if (!prev.active) return { state: prev, actions: [], scrubbing: false };
    // Release: land on the exact scrub position; the music keeps doing what the mode says (playing or paused).
    return { state: IDLE_SCRUB, actions: settle(prev, input), scrubbing: true };
  }

  const s: ScrubState = prev.active ? { ...prev } : { ...IDLE_SCRUB, active: true, mode: input.mode, pos: input.current };
  const actions: ScrubAction[] = [];

  // The grab begins, or the mode switches under the hand (palm <-> fist): play / pause as the mode says.
  if (!prev.active) {
    if (input.mode === "play" && !input.playing) actions.push({ type: "play" });
    if (input.mode === "pause" && input.playing) actions.push({ type: "pause" });
  } else if (input.mode !== s.mode) {
    if (input.mode === "pause") {
      // PLAY -> PAUSE: stop at exactly where the hand has put the music.
      const to = clamp(input.current + s.pending, 0, input.duration);
      actions.push({ type: "pause" });
      if (Math.abs(s.pending) > EPS) actions.push({ type: "seek", to });
      s.pos = to;
      s.lastSeekT = t;
    } else {
      // PAUSE -> PLAY: resume from the exact scrub position.
      if (s.snippetPlaying || Math.abs(input.current - s.pos) > EPS) actions.push({ type: "seek", to: s.pos });
      actions.push({ type: "play" });
      s.lastSeekT = t;
    }
    s.pending = 0;
    s.snippetPlaying = false;
    s.mode = input.mode;
  }

  const minGapMs = 1000 / cfg.maxSeeksPerSec;
  const mayIssue = t - s.lastSeekT >= minGapMs && !(input.seeking && t - s.lastSeekT < cfg.staleSeekMs);

  if (s.mode === "play") {
    if (input.deltaSec !== 0) s.lastMoveT = t;
    s.pending += input.deltaSec;
    const size = Math.abs(s.pending);
    const still = t - s.lastMoveT >= cfg.settleMs;
    if (mayIssue && (size >= cfg.moveThresholdSec || (still && size >= cfg.settleMinSec))) {
      const to = clamp(input.current + s.pending, 0, input.duration);
      // Pinned at 0:00 or the end: there is nowhere further to go, so nothing to ask for.
      if (Math.abs(to - input.current) > EPS) {
        actions.push({ type: "seek", to });
        s.lastSeekT = t;
      }
      s.pending = 0;
    }
  } else {
    const before = s.pos;
    s.pos = clamp(s.pos + input.deltaSec, 0, input.duration);
    const moving = s.pos !== before;
    if (moving) s.lastMoveT = t;
    const drift = Math.abs(s.pos - input.current);
    // Start a snippet chain on the first movement; while the hand moves, re-seek only when the audio has drifted
    // from it. Once it stops, the audio just plays out its last `snippetMs` and then lands exactly on `pos`.
    const wantSeek = moving && (s.snippetPlaying ? drift >= cfg.moveThresholdSec : drift > EPS);
    if (mayIssue && wantSeek) {
      actions.push({ type: "seek", to: s.pos });
      s.lastSeekT = t;
      if (!s.snippetPlaying) {
        actions.push({ type: "play" });
        s.snippetPlaying = true;
      }
    }
    if (s.snippetPlaying && moving) s.snippetUntil = t + cfg.snippetMs;
    if (s.snippetPlaying && t >= s.snippetUntil) {
      actions.push({ type: "pause" }, { type: "seek", to: s.pos });
      s.snippetPlaying = false;
    }
  }
  return { state: s, actions, scrubbing: true };
}
