/**
 * What the player does when a command fires, a key is pressed or a button is clicked (R3 transport,
 * R4a loops). Pure logic over an AudioPlayer and a LoopState, so gestures, keys and buttons share one
 * code path and the tests can check the wiring without a browser.
 */
import type { AudioPlayer, PlayerState } from "./audioPlayer";
import type { HandFire } from "./handCommands";
import { clearLoop, isLooping, loopStep, nudgeEnd, nudgeStart, restartTarget, setEnd, setStart, type LoopState } from "./loop";
import { formatTime } from "./time";
import { formatRate, stepSpeed, toggleSpeed } from "./speed";

export { formatTime };

export type TransportAction =
  | "toggle"
  /** Index up: back to the loop START if one is set, else 0:00; plays. */
  | "restart"
  /** Home key / button only: 0:00, even with a loop set; plays. No gesture: gestures never depend on hold time. */
  | "restartTop"
  /** The V key / Mark button: START, then END (loop on), then clear. */
  | "loopStep"
  | "setStart"
  | "setEnd"
  | "clearLoop"
  /** R5: the whole track between 2x and 1x (anything else back to 1x); the music just carries on. */
  | "speedToggle"
  /** R5: keys `=` and `-`: the next preset up / down (0.5, 0.75, 1, 1.5, 2). */
  | "speedUp"
  | "speedDown";

/**
 * Which action a fired command is. Every command fires once, when its ring fills. R4b's two-hand scheme:
 *  - RIGHT hand = transport (+ scrub, by the knob): FIST = play/pause (R4d; an open palm is no command, so a hand
 *    coming into frame never pauses), index up = restart (to the loop START if set, else 0:00), V = clear the loop.
 *  - LEFT hand = marks: V = set IN (START) at the playhead, index up = set OUT (END) at the playhead and
 *    loop. The left hand never plays or pauses by a command (its fist only pauses while steering: steerAudio.ts).
 * The V key / Mark button still cycle START, END, clear (`loopStep`); no gesture does.
 * R5: the RIGHT hand's thumbs up toggles the speed (2x <-> 1x).
 */
export function actionForFire(ev: Pick<HandFire, "shape" | "hand">): TransportAction | null {
  if (ev.hand === "Right") {
    if (ev.shape === "Closed_Fist") return "toggle";
    if (ev.shape === "Pointing_Up") return "restart";
    if (ev.shape === "Victory") return "clearLoop";
    if (ev.shape === "Thumb_Up") return "speedToggle";
    return null;
  }
  if (ev.shape === "Victory") return "setStart";
  if (ev.shape === "Pointing_Up") return "setEnd";
  return null;
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
    case "speedToggle":
    case "speedUp":
    case "speedDown": {
      const next = action === "speedToggle" ? toggleSpeed(player.rate) : stepSpeed(player.rate, action === "speedUp" ? 1 : -1);
      if (next === player.rate) return { label: `SPEED ${formatRate(next)}`, changed: false, loop };
      return { label: `SPEED ${formatRate(player.setRate(next))}`, changed: true, loop };
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

/** Moves the loop START or END (keys, buttons, and R4b's knob). Only the marker moves; the music is untouched. */
export function runNudge(player: AudioPlayer, loop: LoopState, deltaSec: number, which: "start" | "end" = "start"): TransportResult {
  if (!player.loaded) return { label: "LOAD A TRACK FIRST", changed: false, loop };
  const r = which === "start" ? nudgeStart(loop, deltaSec, player.duration) : nudgeEnd(loop, deltaSec, player.duration);
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
