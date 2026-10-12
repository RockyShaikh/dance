/**
 * Audible scrub (R4b): while the knob is grabbed with the playhead as its target, the playhead is
 * seeked live so the music follows the hand, DJ-style. A pure reducer (no DOM, no audio): each frame it
 * is told what the knob moved and what the player is doing, and returns the player calls to make.
 *
 *  - Playing: the music keeps playing; the playhead is moved by seeks. Resumes from the new spot on release.
 *  - Paused: each seek plays a short snippet (~160 ms) at the scrub position and pauses again, so you
 *    hear where you are as it moves; on release it stays paused at the exact scrub position.
 *  - Seeks are rate-limited (`maxSeeksPerSec`) so the audio element isn't hammered; between seeks the
 *    scrub position keeps accumulating, and the next seek goes to the latest position.
 */
import type { ScrubConfig } from "./config";

export type ScrubAction = { type: "seek"; to: number } | { type: "play" } | { type: "pause" };

export interface ScrubState {
  active: boolean;
  /** Where the scrub has got to (the target of the next seek), seconds. */
  pos: number;
  /** The music was playing when the grab began (so it keeps playing, or stays paused, accordingly). */
  wasPlaying: boolean;
  lastSeekT: number;
  /** The position moved since the last seek. */
  dirty: boolean;
  /** Paused scrub: a snippet is playing and must be stopped at `snippetUntil`. */
  snippetPlaying: boolean;
  snippetUntil: number;
}

export const IDLE_SCRUB: ScrubState = { active: false, pos: 0, wasPlaying: false, lastSeekT: -Infinity, dirty: false, snippetPlaying: false, snippetUntil: 0 };

export interface ScrubInput {
  /** Milliseconds, must not go backwards. */
  t: number;
  /** Seconds since the previous frame. */
  dtSec: number;
  /** The knob is grabbed and its target is the playhead. */
  active: boolean;
  /** How far the knob moved the playhead this frame, seconds (0 when it is at rest). */
  deltaSec: number;
  /** The player is playing right now. */
  playing: boolean;
  /** The player's playhead right now. */
  current: number;
  duration: number;
}

export interface ScrubResult {
  state: ScrubState;
  /** Player calls to make, in order. */
  actions: ScrubAction[];
  /** The scrub is in progress (true on the frame of release too: the marks use this). */
  scrubbing: boolean;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function stepScrub(prev: ScrubState, input: ScrubInput, cfg: ScrubConfig): ScrubResult {
  const { t } = input;

  if (!input.active) {
    if (!prev.active) return { state: prev, actions: [], scrubbing: false };
    // Release: stop any snippet, and land on the exact scrub position.
    const actions: ScrubAction[] = [];
    if (!prev.wasPlaying && prev.snippetPlaying) actions.push({ type: "pause" });
    if (prev.dirty || (!prev.wasPlaying && prev.snippetPlaying)) actions.push({ type: "seek", to: prev.pos });
    return { state: IDLE_SCRUB, actions, scrubbing: true };
  }

  const s: ScrubState = prev.active ? { ...prev } : { ...IDLE_SCRUB, active: true, pos: input.current, wasPlaying: input.playing };
  // Playing: the music itself advances, so build on where the player is unless seeks are pending;
  // pending ones carry on from the scrub position, moving at the normal rate meanwhile.
  const base = s.wasPlaying ? (s.dirty ? s.pos + input.dtSec : input.current) : s.pos;
  const pos = clamp(base + input.deltaSec, 0, input.duration);
  s.dirty = s.dirty || pos !== base;
  s.pos = pos;

  const actions: ScrubAction[] = [];
  const minGapMs = 1000 / cfg.maxSeeksPerSec;
  if (s.dirty && t - s.lastSeekT >= minGapMs) {
    actions.push({ type: "seek", to: s.pos });
    s.lastSeekT = t;
    s.dirty = false;
    if (!s.wasPlaying) {
      if (!s.snippetPlaying) actions.push({ type: "play" });
      s.snippetPlaying = true;
      s.snippetUntil = t + cfg.snippetMs;
    }
  }
  if (!s.wasPlaying && s.snippetPlaying && t >= s.snippetUntil) {
    actions.push({ type: "pause" }, { type: "seek", to: s.pos });
    s.snippetPlaying = false;
  }
  return { state: s, actions, scrubbing: true };
}
