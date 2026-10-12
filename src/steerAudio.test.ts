import { describe, expect, it } from "vitest";
import { IDLE_STEER_AUDIO, stepSteerAudio, type SteerAudioState } from "./steerAudio";
import type { SteerMode } from "./steerMode";

const run = (playing: boolean, modes: (SteerMode | null)[]): SteerAudioState[] => {
  const out: SteerAudioState[] = [];
  let s = IDLE_STEER_AUDIO;
  for (const mode of modes) {
    s = stepSteerAudio(s, { grabbed: true, mode, playing });
    out.push(s);
  }
  return out;
};

describe("steerAudio: the left hand and the music", () => {
  it("the grab starts in whatever the music was doing; palm, V, index never change it", () => {
    expect(run(true, ["palm", "start", "end", "palm"]).map((s) => s.scrub)).toEqual(["play", "play", "play", "play"]);
    expect(run(false, ["palm", "start", "end", "palm"]).map((s) => s.scrub)).toEqual(["pause", "pause", "pause", "pause"]);
  });

  it("the fist pauses a playing track and owns the pause; a palm then resumes it", () => {
    const s = run(true, ["palm", "fist", "fist", "palm"]);
    expect(s.map((x) => x.scrub)).toEqual(["play", "pause", "pause", "play"]);
    expect(s.map((x) => x.fistOwns)).toEqual([false, true, true, false]);
  });

  it("a fist on an already paused track owns nothing, and the palm does not play", () => {
    const s = run(false, ["palm", "fist", "palm"]);
    expect(s.map((x) => x.scrub)).toEqual(["pause", "pause", "pause"]);
    expect(s.every((x) => !x.fistOwns)).toBe(true);
  });

  it("a grab that starts with the fist pauses at once", () => {
    expect(run(true, ["fist"])[0]).toMatchObject({ scrub: "pause", fistOwns: true });
  });

  it("fist -> V -> index keeps the pause; the next palm resumes", () => {
    expect(run(true, ["fist", "start", "end", "palm"]).map((x) => x.scrub)).toEqual(["pause", "pause", "pause", "play"]);
  });

  it("clutches without modes (claw, pinch) leave the music as it was", () => {
    expect(run(true, [null, null]).map((x) => x.scrub)).toEqual(["play", "play"]);
  });

  it("letting go forgets everything; the next grab reads the music again", () => {
    let s = stepSteerAudio(IDLE_STEER_AUDIO, { grabbed: true, mode: "fist", playing: true });
    s = stepSteerAudio(s, { grabbed: false, mode: null, playing: false });
    expect(s).toEqual(IDLE_STEER_AUDIO);
    s = stepSteerAudio(s, { grabbed: true, mode: "palm", playing: false });
    expect(s).toMatchObject({ scrub: "pause", fistOwns: false });
  });
});
