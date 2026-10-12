/**
 * What the player does when a command fires, a key is pressed or a button is clicked (R3 transport,
 * R4a loops). Pure logic over an AudioPlayer and a LoopState, so gestures, keys and buttons share one
 * code path and the tests can check the wiring without a browser.
 */
import type { AudioPlayer, PlayerState } from "./audioPlayer";
import type { FireEvent } from "./commands";
import { clearLoop, isLooping, loopStep, nudgeStart, restartTarget, setEnd, setStart, type LoopState } from "./loop";
import { formatTime } from "./time";

export { formatTime };

export type TransportAction =
  | "toggle"
  /** Index tap: back to the loop START if one is set, else 0:00; plays. */
  | "restart"
  /** Index hold: 0:00, even with a loop set; plays. */
  | "restartTop"
  /** V tap: START, then END (loop on), then clear. */
  | "loopStep"
  | "setStart"
  | "setEnd"
  /** V hold. */
  | "clearLoop";

/** Open palm toggles; index up restarts (tap: loop start, hold: song start); V steps the loop (hold: clears it). */
export function actionForFire(ev: Pick<FireEvent, "shape" | "kind">): TransportAction | null {
  switch (ev.shape) {
    case "Open_Palm":
      return "toggle";
    case "Pointing_Up":
      return ev.kind === "hold" ? "restartTop" : "restart";
    case "Victory":
      return ev.kind === "hold" ? "clearLoop" : "loopStep";
    default:
      return null;
  }
}

export interface TransportResult {
  /** What happened, for the banner: PLAY, SET START 0:31.2, or why nothing did. */
  label: string;
  /** Whether the music or the loop was changed. */
  changed: boolean;
  /** The loop after the action (unchanged unless this was a loop action). */
  loop: LoopState;
  /** Nudge only: cut short by 0:00 or by END. */
  limited?: boolean;
}

export interface TransportOptions {
  /**
   * Where a loop mark lands, in seconds. A gesture passes the ring-start stamp (markTime); keys and
   * buttons leave it out and mark the playhead as it is right now.
   */
  markAt?: number;
}

/** Runs one action. The player's state has already changed when this returns (the audio call is synchronous). */
export function runTransport(player: AudioPlayer, loop: LoopState, action: TransportAction, opts: TransportOptions = {}): TransportResult {
  if (!player.loaded) return { label: "LOAD A TRACK FIRST", changed: false, loop };
  switch (action) {
    case "toggle": {
      const did = player.toggle();
      return { label: did === "play" ? "PLAY" : "PAUSE", changed: true, loop };
    }
    case "restart":
    case "restartTop": {
      const kind = action === "restart" ? "start" : "top";
      player.seek(restartTarget(loop, kind));
      void player.play();
      const label = kind === "top" ? "FROM THE TOP" : loop.start !== null ? "BACK TO START" : "RESTART";
      return { label, changed: true, loop };
    }
    case "loopStep":
    case "setStart":
    case "setEnd":
    case "clearLoop": {
      const at = opts.markAt ?? player.currentTime;
      const r =
        action === "loopStep" ? loopStep(loop, at) : action === "setStart" ? setStart(loop, at) : action === "setEnd" ? setEnd(loop, at) : clearLoop(loop);
      return { label: r.label, changed: r.changed, loop: r.loop };
    }
  }
}

/** Moves the loop START (keys, buttons, and R4b's knob). Only the marker moves; the music is untouched. */
export function runNudge(player: AudioPlayer, loop: LoopState, deltaSec: number): TransportResult {
  if (!player.loaded) return { label: "LOAD A TRACK FIRST", changed: false, loop };
  const r = nudgeStart(loop, deltaSec, player.duration);
  return { label: r.label, changed: r.changed, loop: r.loop, limited: r.limited };
}

/** The giant word. LOOP while a loop (START and END) is playing. */
export function statusWord(state: PlayerState, loop?: LoopState): string {
  switch (state) {
    case "playing":
      return loop && isLooping(loop) ? "LOOP" : "PLAYING";
    case "paused":
      return "PAUSED";
    case "ready":
      return "READY";
    case "empty":
      return "LOAD A TRACK";
  }
}

/** Playhead position as 0..1 along the timeline. */
export function playheadFraction(current: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.min(1, Math.max(0, current / duration));
}
