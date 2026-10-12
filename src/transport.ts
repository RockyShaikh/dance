/**
 * R3: what the player does when a command fires, a key is pressed or a button is clicked.
 * Pure logic over an AudioPlayer, so gestures, keys and buttons share one code path and
 * the tests can check the wiring without a browser.
 */
import type { AudioPlayer, PlayerState } from "./audioPlayer";
import type { FireEvent } from "./commands";
import { PRACTICE, type CommandConfig } from "./config";

export type TransportAction = "toggle" | "restart";

/** Open palm toggles play/pause; index up restarts. Other shapes (Victory = loops) belong to R4. */
export function actionForFire(ev: Pick<FireEvent, "shape">): TransportAction | null {
  switch (ev.shape) {
    case "Open_Palm":
      return "toggle";
    case "Pointing_Up":
      return "restart";
    default:
      return null;
  }
}

export interface TransportResult {
  /** What happened, for the banner: PLAY, PAUSE, RESTART, or why nothing did. */
  label: string;
  /** Whether the music was changed. */
  changed: boolean;
}

/** Runs one action. The player's state has already changed when this returns (the audio call is synchronous). */
export function runTransport(player: AudioPlayer, action: TransportAction): TransportResult {
  if (!player.loaded) return { label: "LOAD A TRACK FIRST", changed: false };
  if (action === "toggle") {
    const did = player.toggle();
    return { label: did === "play" ? "PLAY" : "PAUSE", changed: true };
  }
  // restart: back to 0:00 and play at once (R4: loop start comes here).
  player.seek(0);
  void player.play();
  return { label: "RESTART", changed: true };
}

/** The classifier's thresholds for the practice view: the bench's, with R3's restart timing. */
export function practiceConfig(base: CommandConfig): CommandConfig {
  return { ...base, holdShapes: PRACTICE.holdShapes };
}

/** The giant word. */
export function statusWord(state: PlayerState): string {
  switch (state) {
    case "playing":
      return "PLAYING";
    case "paused":
      return "PAUSED";
    case "ready":
      return "READY";
    case "empty":
      return "LOAD A TRACK";
  }
}

/** Seconds as m:ss.t (the playhead) or m:ss (a length). */
export function formatTime(seconds: number, tenths = true): string {
  const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(s);
  const m = Math.floor(whole / 60);
  const ss = String(whole % 60).padStart(2, "0");
  return tenths ? `${m}:${ss}.${Math.floor((s - whole) * 10)}` : `${m}:${ss}`;
}

/** Playhead position as 0..1 along the timeline. */
export function playheadFraction(current: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.min(1, Math.max(0, current / duration));
}
