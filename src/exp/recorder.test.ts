import { describe, expect, it } from "vitest";
import { Recorder, recordingFileName, type RecordingMeta } from "./recorder";

const META: RecordingMeta = {
  label: "push-2m",
  startedAt: "2026-10-15T12:00:00.000Z",
  durationSec: 1,
  camera: { label: "FaceTime HD Camera", width: 1920, height: 1080, shape: "16:9", frameRate: 30 },
  trackMode: "person",
  userAgent: "test",
  settings: { enter: { a: 0.1 } },
};

describe("Recorder", () => {
  it("collects frames and events for its duration and makes valid JSON that carries the camera and resolution", () => {
    const r = new Recorder();
    r.start(1000, META);
    let ended = false;
    let logged = false;
    for (let t = 1000; t <= 2100 && !ended; t += 33) {
      ended = r.frame(t, { hands: [], pose: null, swipe: { touching: false, deltaSec: 0, playhead: 1.23456789 } });
      if (t >= 1500 && !logged) {
        logged = true;
        r.event(t, { type: "push", signal: "d", peak: 0.123456789 });
      }
    }
    expect(ended).toBe(true);
    const doc = JSON.parse(r.finish());
    expect(doc.format).toBe("dance-exp-push-swipe/1");
    expect(doc.meta.camera).toEqual({ label: "FaceTime HD Camera", width: 1920, height: 1080, shape: "16:9", frameRate: 30 });
    expect(doc.frames.length).toBeGreaterThan(25);
    expect(doc.frames[0].t).toBe(0);
    expect(doc.events).toEqual([{ t: 528, type: "push", signal: "d", peak: 0.1235 }]);
    expect(doc.summary.pushEvents).toBe(1);
    expect(doc.summary.measuredFps).toBeGreaterThan(25);
    expect(doc.frames[0].swipe.playhead).toBe(1.2346);
    expect(r.running).toBe(false);
  });

  it("ignores frames and events when idle, and turns NaN / Infinity into null (JSON has none)", () => {
    const r = new Recorder();
    expect(r.frame(0, { hands: [], pose: null, swipe: null })).toBe(false);
    r.event(0, { type: "push" });
    r.start(0, META);
    r.frame(10, { hands: [], pose: null, swipe: { touching: true, deltaSec: NaN, playhead: Infinity } });
    const doc = JSON.parse(r.finish());
    expect(doc.frames[0].swipe).toEqual({ touching: true, deltaSec: null, playhead: null });
    expect(doc.events).toEqual([]);
  });

  it("says how long is left", () => {
    const r = new Recorder();
    expect(r.remaining(0)).toBe(0);
    r.start(0, { ...META, durationSec: 30 });
    expect(r.remaining(10_000)).toBe(20);
  });

  it("makes file names from the label", () => {
    expect(recordingFileName("Push 2 m!", new Date("2026-10-15T12:34:56.789Z"))).toBe("dance-exp-push-2-m-2026-10-15T12-34-56.json");
    expect(recordingFileName("   ", new Date("2026-10-15T12:34:56Z"))).toMatch(/^dance-exp-take-/);
  });
});
