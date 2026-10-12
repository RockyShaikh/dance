/**
 * R4a: makes the music jump from END back to START, over the HTMLAudioElement engine.
 *
 * The element has no loop-region feature, so the wrap is a check on the playhead: when it reaches
 * END, seek to START (the music keeps playing through the seek). The check runs from a short
 * `setInterval` AND from `requestAnimationFrame`, whichever comes first; `timeupdate` (about 4 Hz)
 * is far too coarse. Each wrap records how far past END the playhead was when the seek was
 * issued (the "overshoot": audible as a sliver of the next bar) and how long the browser took
 * to finish the seek, so the tightness can be measured rather than guessed.
 *
 * Why this and not Web Audio: see audioPlayer.ts. If the numbers turn out too loose, a Web Audio
 * engine (AudioBufferSourceNode loopStart/loopEnd is sample-exact) can replace the player behind
 * the same interface.
 */
import type { AudioPlayer } from "./audioPlayer";
import { LOOP } from "./config";
import { isLooping, shouldWrap, type LoopState } from "./loop";

export interface WrapRecord {
  /** performance.now() when the seek was issued. */
  at: number;
  /** Seconds the playhead was past END at that moment (negative: cut early by the look-ahead). */
  overshootSec: number;
  /** Where the playhead was right after the seek (should be START). */
  landedAt: number;
  /** Milliseconds from the seek to the element's "seeked" event; null until it arrives. */
  seekedMs: number | null;
}

const HISTORY = 200;

export class LoopWrapper {
  /** The last wraps, newest last (capped). */
  readonly history: WrapRecord[] = [];
  /** Wraps since load, including ones that fell off the history. */
  wraps = 0;
  private pending: WrapRecord | null = null;

  constructor(
    private readonly player: AudioPlayer,
    private readonly getLoop: () => LoopState,
    private readonly now: () => number = () => performance.now(),
    private readonly lookaheadSec: number = LOOP.wrapLookaheadSec,
  ) {
    player.on((e) => {
      if (e.type === "seeked" && this.pending && this.pending.seekedMs === null) {
        this.pending.seekedMs = this.now() - this.pending.at;
        this.pending = null;
      }
      // A loop that ends at the very end of the track: the element stops before a check can run.
      if (e.type === "ended") {
        const loop = this.getLoop();
        if (isLooping(loop)) {
          player.seek(loop.start as number);
          void player.play();
        }
      }
    });
  }

  /**
   * One check; true if it wrapped. Call it often. `engage` is for the moment END is set while the
   * playhead is already past it (the loop starts at once): that jump is not a measured wrap.
   */
  check(engage = false): boolean {
    if (this.player.state !== "playing") return false;
    const loop = this.getLoop();
    const before = this.player.currentTime;
    if (!shouldWrap(before, loop, this.lookaheadSec)) return false;
    const rec: WrapRecord = { at: this.now(), overshootSec: before - (loop.end as number), landedAt: 0, seekedMs: null };
    this.pending = engage ? null : rec; // set before the seek: a "seeked" event may come back at once
    rec.landedAt = this.player.seek(loop.start as number);
    if (!engage) {
      this.history.push(rec);
      if (this.history.length > HISTORY) this.history.shift();
      this.wraps++;
    }
    return true;
  }

  /** Starts the polling; returns the function that stops it. Browser only. */
  start(pollMs: number = LOOP.wrapPollMs): () => void {
    const timer = window.setInterval(() => this.check(), pollMs);
    let raf = 0;
    const frame = () => {
      this.check();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }
}
