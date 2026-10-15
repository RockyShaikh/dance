/**
 * R4d: what the LEFT hand does to the music while the steering wheel is held. A pure reducer (no DOM, no audio):
 * it only decides which scrub mode the playhead steering runs in (PLAY: the music keeps playing while it is moved;
 * PAUSE: it is paused and moved in snippets); scrub.ts turns a change of that mode into the play / pause calls.
 *
 * The rules (user, R4c review: "my left hand should not be able to play and pause the audio... my left hand
 * closing into a fist can play and pause the audio"):
 *  - The left hand NEVER starts playback by itself. An open palm, V and index leave the music exactly as it was:
 *    paused stays paused, playing keeps playing.
 *  - A fist PAUSES the music while it is closed, and the fist owns that pause: opening back to a palm resumes,
 *    but only a pause the fist made. If the music was already paused, the fist changes nothing and the palm does
 *    not start it.
 *  - V and index (loop START / END) keep the pause as it is; the fist's ownership waits, so fist -> V -> palm
 *    still resumes. Letting go of the grab (hand lowered or lost) just ends the ownership: nothing is resumed,
 *    because a hand leaving the frame must not start the music.
 */
import type { ScrubMode } from "./scrub";
import type { SteerMode } from "./steerMode";

export interface SteerAudioState {
  /** A grab is being tracked. */
  active: boolean;
  /** The scrub mode now: how the music is being played while the playhead is steered. */
  scrub: ScrubMode;
  /** The fist paused the music (so the palm may resume it). */
  fistOwns: boolean;
}

export const IDLE_STEER_AUDIO: SteerAudioState = { active: false, scrub: "play", fistOwns: false };

export interface SteerAudioInput {
  /** The knob is grabbed. */
  grabbed: boolean;
  /** The left hand's committed mode (null for the claw / pinch clutches, which have none: the music is left as it was). */
  mode: SteerMode | null;
  /** The player is playing right now (only read when a grab begins). */
  playing: boolean;
}

export function stepSteerAudio(prev: SteerAudioState, input: SteerAudioInput): SteerAudioState {
  if (!input.grabbed) return IDLE_STEER_AUDIO;
  const s: SteerAudioState = prev.active ? { ...prev } : { active: true, scrub: input.playing ? "play" : "pause", fistOwns: false };
  if (input.mode === "fist" && !s.fistOwns && s.scrub === "play") {
    s.scrub = "pause";
    s.fistOwns = true;
  } else if (input.mode === "palm" && s.fistOwns) {
    s.scrub = "play";
    s.fistOwns = false;
  }
  return s;
}
