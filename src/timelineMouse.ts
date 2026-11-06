/**
 * R9b: the mouse on the timeline bar. Pure maths; practice.ts owns the DOM and the player.
 *  - `timeAtX`: pointer x to a time in the track (clamped to the bar).
 *  - `flagDelta`: how far a dragged START / END flag has to move; the loop's own nudge clamps do the rest.
 *  - `nextScrubSeek`: the seek policy while dragging (one in flight, the newest target wins).
 */
import type { LoopState } from "./loop";

/** The time under pointer x on a bar spanning [left, left + width). Clamped to 0..duration; 0 for an empty bar or track. */
export function timeAtX(clientX: number, left: number, width: number, duration: number): number {
  if (!(width > 0) || !(duration > 0) || !Number.isFinite(clientX)) return 0;
  const f = Math.min(1, Math.max(0, (clientX - left) / width));
  return f * duration;
}

/** The change in a flag's time that puts it at `t` (0 when that flag is not set). Feed it to the nudge, which applies the clamps. */
export function flagDelta(loop: LoopState, which: "start" | "end", t: number): number {
  const cur = loop[which];
  return cur === null ? 0 : t - cur;
}

/** The time to seek to now, or null: nothing new, or the previous seek has not finished (latest wins, no stacking). */
export function nextScrubSeek(target: number | null, lastSeeked: number | null, seeking: boolean): number | null {
  if (target === null || seeking) return null;
  return lastSeeked !== null && Math.abs(target - lastSeeked) < 0.0005 ? null : target;
}
