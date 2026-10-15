/**
 * R4a: the loop model, as pure functions (no DOM, no audio, no clock). The user's model
 * (docs/spec.md 4.6): let the music play and mark where it is; the START is always marked a
 * little late, so it can be nudged back; the END doesn't need to be precise.
 */
import { LOOP } from "./config";
import { formatTime } from "./time";

/** A loop is START and END in seconds. START alone is a "restart point"; both = looping. */
export interface LoopState {
  start: number | null;
  end: number | null;
}

export const NO_LOOP: LoopState = { start: null, end: null };

export const isLooping = (l: LoopState): boolean => l.start !== null && l.end !== null;

export interface LoopResult {
  loop: LoopState;
  /** The banner text: what happened, or why nothing did. */
  label: string;
  changed: boolean;
  /** Nudge only: the move was cut short by 0:00 or by END. */
  limited?: boolean;
}

/** Round to a millisecond so repeated 0.1 s nudges never drift (0.1 + 0.2 = 0.30000000000000004). */
const ms = (x: number): number => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const same = (loop: LoopState, label: string): LoopResult => ({ loop, label, changed: false });

/**
 * Where a gesture mark lands: the playhead when the ring STARTED, minus a small offset
 * (the mark is late by reaction + recognition time), kept inside the track.
 */
export function markTime(ringStartPlayhead: number, duration: number, offset: number = LOOP.markOffsetSec): number {
  return ms(clamp(ringStartPlayhead - offset, 0, Math.max(0, duration)));
}

/** Sets the START at `at`. Refused when it would land after (END - minimum gap). */
export function setStart(loop: LoopState, at: number, gap: number = LOOP.minGapSec): LoopResult {
  if (loop.end !== null && at > loop.end - gap) return same(loop, "START MUST BE BEFORE END");
  return { loop: { start: at, end: loop.end }, label: `SET START ${formatTime(at)}`, changed: true };
}

/** Sets the END at `at` (and so starts looping). Refused with no START, or sooner than START + minimum gap. */
export function setEnd(loop: LoopState, at: number, gap: number = LOOP.minGapSec): LoopResult {
  if (loop.start === null) return same(loop, "SET A START FIRST");
  if (at < loop.start + gap) return same(loop, "END MUST COME AFTER START");
  return { loop: { start: loop.start, end: at }, label: `SET END ${formatTime(at)}  LOOPING`, changed: true };
}

export function clearLoop(loop: LoopState): LoopResult {
  if (loop.start === null && loop.end === null) return same(loop, "NO LOOP TO CLEAR");
  return { loop: NO_LOOP, label: "LOOP CLEARED", changed: true };
}

/** The V cycle: no loop -> set START; START only -> set END (loop on); a loop -> clear. */
export function loopStep(loop: LoopState, at: number, gap: number = LOOP.minGapSec): LoopResult {
  if (loop.start === null) return setStart(loop, at, gap);
  if (loop.end === null) return setEnd(loop, at, gap);
  return clearLoop(loop);
}

/**
 * Moves the START by `deltaSec` (negative = earlier). Only the marker moves. It can't go below
 * 0:00 or past END (minus the minimum gap; with no END yet, past the track's end).
 * R4b's knob calls this too (through Practice.nudgeStart).
 */
export function nudgeStart(loop: LoopState, deltaSec: number, duration: number, gap: number = LOOP.minGapSec): LoopResult {
  if (loop.start === null) return same(loop, "SET A START FIRST");
  if (!Number.isFinite(deltaSec) || deltaSec === 0) return same(loop, `START ${formatTime(loop.start)}`);
  // The ceiling never sits below where START already is, so a forward nudge can't pull it back.
  const ceiling = Math.max(loop.start, (loop.end ?? duration) - gap);
  const wanted = loop.start + deltaSec;
  const start = ms(clamp(wanted, 0, ceiling));
  const limited = Math.abs(start - wanted) > 0.0005;
  const label = `START ${formatTime(start)}${limited ? "  LIMIT" : ""}`;
  return { loop: { start, end: loop.end }, label, changed: start !== loop.start, limited };
}

/** Where a restart goes: "start" = the loop START if one is set, else 0:00 (index tap); "top" = 0:00 (index hold). */
export function restartTarget(loop: LoopState, kind: "start" | "top"): number {
  return kind === "start" ? (loop.start ?? 0) : 0;
}

/** True when playback has reached the END (anywhere at or past it, within `lookahead`), so it must jump back to START. */
export function shouldWrap(current: number, loop: LoopState, lookahead: number = LOOP.wrapLookaheadSec): boolean {
  return loop.start !== null && loop.end !== null && current >= loop.end - lookahead;
}

/**
 * Tracks when the ring (the dwell) began and where the music was then, so a mark made when the ring
 * FIRES can be stamped at the ring START. Feed it every frame; `prev` is what it returned last frame.
 * (On the frame a tap fires, read the stamp from `prev`: the machine has already gone idle by then.)
 */
export interface RingStamp {
  since: number;
  playhead: number;
}

export function trackRingStart(prev: RingStamp | null, shape: string | null, since: number, playhead: number): RingStamp | null {
  if (shape === null) return null;
  if (prev && prev.since === since) return prev;
  return { since, playhead };
}
