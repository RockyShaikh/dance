/**
 * R4c/R4d: the steering mode of the two-hand wheel. While a grab is held, the LEFT hand's shape says what the
 * right hand's wheel motion moves, and the shape can change mid-grab without letting go:
 *
 *   open palm = the playhead (the music is left as it is)   fist  = the playhead, and pause while the fist is closed
 *   V         = loop START                                  index = loop END
 *   shaka     = the playback SPEED (R5b: thumb and pinky out, the other three curled; the wheel steps it by 0.05)
 *
 * (What the music does is steerAudio.ts: the left hand never starts playback by itself.)
 *
 * Two pure pieces, no DOM and no clock (time is passed in):
 *  - `classifySteerShape`: a detected hand to one of the four shapes, or null. The fist is the model's
 *    weakest label, so a hand that is not clearly one of the other three counts as a fist when its fingers
 *    are curled in (geometry), instead of dropping out of the grab.
 *  - `stepSteerMode`: the debounced mode. A different shape must hold for `modeDebounceMs` before the mode
 *    changes, so a flickering fist cannot toggle play / pause.
 */
import type { KnobTarget } from "./config";
import { STEER } from "./config";
import type { PseudoChord } from "./pseudoChord";

export type SteerShape = "palm" | "fist" | "v" | "index" | "shaka";
export type SteerMode = "palm" | "fist" | "start" | "end" | "speed";

/** The bits of a detected hand the classification needs. */
export interface SteerHandObs {
  /** MediaPipe's label ("None" when it has none). */
  shape: string;
  shapeScore: number;
  /** Mean finger reach (handFeatures.clawExtension): about 1.9 open, 1.0 fist. */
  clawExt: number;
  /**
   * Which fingers are out (pseudoChord.ts). The shaka has no MediaPipe label, so it is found from this alone: thumb and
   * pinky out, index, middle and ring curled (chord 10001). Left out, no shaka is ever found.
   */
  chord?: PseudoChord;
}

/** The shaka: a custom rule on the finger chord (T I M R P = 1 0 0 0 1), whatever the model's label says. */
export function isShaka(chord: PseudoChord | undefined): boolean {
  return !!chord && chord.T && !chord.I && !chord.M && !chord.R && chord.P;
}

const LABELS: Record<string, SteerShape> = { Open_Palm: "palm", Victory: "v", Pointing_Up: "index" };

export function classifySteerShape(h: SteerHandObs, cfg: typeof STEER = STEER): SteerShape | null {
  // The shaka first: it has no label, and the model may call it a thumbs up, a fist or nothing.
  if (isShaka(h.chord)) return "shaka";
  const named = LABELS[h.shape];
  if (named && h.shapeScore >= cfg.minShapeScore) return named;
  if (h.shape === "Closed_Fist" && h.shapeScore >= cfg.minFistScore) return "fist";
  // The label is missing, weak or something else: curled-in fingers are still a fist.
  if (!named && h.clawExt <= cfg.fistMaxReach) return "fist";
  return null;
}

export const MODE_OF: Record<SteerShape, SteerMode> = { palm: "palm", fist: "fist", v: "start", index: "end", shaka: "speed" };

/** What the knob's movement is applied to in a mode (speed mode has no knob target: its turn steps the speed). */
export function targetOf(mode: SteerMode): KnobTarget {
  return mode === "start" ? "start" : mode === "end" ? "end" : "playhead";
}

/** Whether the mode steers the playhead, as opposed to a loop end. */
export const isPlayheadMode = (mode: SteerMode): mode is "palm" | "fist" => mode === "palm" || mode === "fist";

export interface SteerModeState {
  /** The committed mode; null when not grabbed. */
  mode: SteerMode | null;
  /** A different shape waiting out the debounce, and since when. */
  pending: SteerShape | null;
  since: number;
}

export const IDLE_STEER: SteerModeState = { mode: null, pending: null, since: 0 };

export interface SteerModeStep {
  state: SteerModeState;
  mode: SteerMode | null;
  /** The committed mode changed on this frame (a grab starting counts). */
  changed: boolean;
}

/**
 * One frame. `grabbed` false resets. `shape` is the left hand's shape this frame (null = not a steering
 * shape, or no hand: the mode simply holds). The first mode of a grab is taken at once (a grab starts with
 * a palm, V or index; clutch.ts); after that a different shape must be stable for `modeDebounceMs`.
 */
export function stepSteerMode(prev: SteerModeState, input: { t: number; grabbed: boolean; shape: SteerShape | null }, debounceMs: number = STEER.modeDebounceMs): SteerModeStep {
  if (!input.grabbed) return { state: IDLE_STEER, mode: null, changed: false };
  const { t, shape } = input;
  if (prev.mode === null) {
    // The grab begins: the shape that started it is the mode (without a usable shape, the palm).
    const mode = MODE_OF[shape ?? "palm"];
    return { state: { mode, pending: null, since: t }, mode, changed: true };
  }
  if (shape === null || MODE_OF[shape] === prev.mode) return { state: { ...prev, pending: null }, mode: prev.mode, changed: false };
  const since = prev.pending === shape ? prev.since : t;
  if (t - since >= debounceMs) {
    const mode = MODE_OF[shape];
    return { state: { mode, pending: null, since: t }, mode, changed: true };
  }
  return { state: { ...prev, pending: shape, since }, mode: prev.mode, changed: false };
}
