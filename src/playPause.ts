/**
 * R9b: which right-hand shape is play / pause. The open palm is the default (the fist is hard to see at a distance and
 * from a phone camera); the fist stays selectable. Pure: the choice only decides which shape is armed and which maps to "toggle".
 */
import type { CommandConfig } from "./config";

export type PlayPauseGesture = "palm" | "fist";

export const PLAY_PAUSE_DEFAULT: PlayPauseGesture = "palm";

/** The model's label for each choice. */
export function playPauseShape(g: PlayPauseGesture): "Open_Palm" | "Closed_Fist" {
  return g === "palm" ? "Open_Palm" : "Closed_Fist";
}

export function readPlayPause(v: unknown, fallback: PlayPauseGesture = PLAY_PAUSE_DEFAULT): PlayPauseGesture {
  return v === "palm" || v === "fist" ? v : fallback;
}

/**
 * The command config with the chosen play/pause shape armed (right hand only) and the other one not: with the palm chosen the
 * right fist does nothing, and with the fist chosen the palm does nothing.
 */
export function withPlayPause(cfg: CommandConfig, g: PlayPauseGesture): CommandConfig {
  const chosen = playPauseShape(g);
  const other = chosen === "Open_Palm" ? "Closed_Fist" : "Open_Palm";
  return {
    ...cfg,
    shapes: [...cfg.shapes.filter((s) => s !== other && s !== chosen), chosen],
    rightOnlyShapes: [...cfg.rightOnlyShapes.filter((s) => s !== other && s !== chosen), chosen],
  };
}
