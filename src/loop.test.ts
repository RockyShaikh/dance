import { describe, expect, it } from "vitest";
import { LOOP } from "./config";
import { NO_LOOP, clearLoop, isLooping, loopStep, markOffsetFor, markPlayhead, markTime, nudgeEnd, nudgeStart, restartTarget, setEnd, setStart, shouldWrap, trackRingStart, type LoopState } from "./loop";

const D = 60;

describe("markTime (late-mark fix)", () => {
  it("stamps at the ring-start playhead minus the offset", () => {
    expect(markTime(10, D)).toBeCloseTo(10 - LOOP.markOffsetSec, 6);
    expect(markTime(10, D, 0.25)).toBe(9.75);
  });
  it("is clamped to 0..duration", () => {
    expect(markTime(0.05, D)).toBe(0);
    expect(markTime(0, D)).toBe(0);
    expect(markTime(75, D)).toBe(D);
    expect(markTime(5, 0)).toBe(0);
  });
  it("the default offset is 0.15 s", () => {
    expect(LOOP.markOffsetSec).toBe(0.15);
  });
});

describe("the V cycle", () => {
  it("1st = START, 2nd = END and looping, 3rd = clear, then around again", () => {
    let l: LoopState = NO_LOOP;
    expect(isLooping(l)).toBe(false);
    let r = loopStep(l, 10);
    expect(r).toMatchObject({ changed: true, label: "SET START 0:10.0", loop: { start: 10, end: null } });
    l = r.loop;
    expect(isLooping(l)).toBe(false);
    r = loopStep(l, 20);
    expect(r).toMatchObject({ changed: true, loop: { start: 10, end: 20 } });
    expect(r.label).toContain("SET END");
    l = r.loop;
    expect(isLooping(l)).toBe(true);
    r = loopStep(l, 30);
    expect(r).toMatchObject({ changed: true, label: "LOOP CLEARED", loop: NO_LOOP });
    expect(loopStep(r.loop, 5).loop).toEqual({ start: 5, end: null });
  });

  it("an END at or before START is ignored, with a message; the START stays", () => {
    const l: LoopState = { start: 10, end: null };
    for (const at of [10, 9.9, 3, 0]) {
      const r = loopStep(l, at);
      expect(r.changed).toBe(false);
      expect(r.label).toBe("END MUST COME AFTER START");
      expect(r.loop).toBe(l);
    }
  });

  it("an END closer than the minimum gap is ignored too; exactly the gap is allowed", () => {
    const l: LoopState = { start: 10, end: null };
    expect(loopStep(l, 10 + LOOP.minGapSec - 0.01).changed).toBe(false);
    expect(loopStep(l, 10 + LOOP.minGapSec).loop).toEqual({ start: 10, end: 10 + LOOP.minGapSec });
  });
});

describe("explicit set and clear", () => {
  it("setStart replaces the START and keeps the END", () => {
    expect(setStart({ start: 10, end: 20 }, 12).loop).toEqual({ start: 12, end: 20 });
  });
  it("setStart is refused past END (minus the gap)", () => {
    const l: LoopState = { start: 10, end: 20 };
    expect(setStart(l, 20).changed).toBe(false);
    expect(setStart(l, 19.8).label).toBe("START MUST BE BEFORE END");
    expect(setStart(l, 19.5).changed).toBe(true);
  });
  it("setEnd needs a START and a real gap", () => {
    expect(setEnd(NO_LOOP, 20)).toMatchObject({ changed: false, label: "SET A START FIRST" });
    expect(setEnd({ start: 10, end: null }, 10).changed).toBe(false);
    expect(setEnd({ start: 10, end: 30 }, 25).loop).toEqual({ start: 10, end: 25 }); // moves an existing END
  });
  it("clearLoop clears START alone too, and says so when there is nothing", () => {
    expect(clearLoop({ start: 4, end: null })).toMatchObject({ changed: true, loop: NO_LOOP });
    expect(clearLoop(NO_LOOP)).toMatchObject({ changed: false, label: "NO LOOP TO CLEAR" });
  });
});

describe("nudgeStart", () => {
  const loop: LoopState = { start: 10, end: 20 };
  it("moves the START by the delta and leaves END alone", () => {
    expect(nudgeStart(loop, -0.1, D).loop).toEqual({ start: 9.9, end: 20 });
    expect(nudgeStart(loop, 1, D).loop).toEqual({ start: 11, end: 20 });
    expect(nudgeStart(loop, -1, D)).toMatchObject({ changed: true, limited: false, label: "START 0:09.0" });
  });
  it("ten 0.1 s nudges add up to exactly 1 s (no float drift)", () => {
    let l = loop;
    for (let i = 0; i < 10; i++) l = nudgeStart(l, 0.1, D).loop;
    expect(l.start).toBe(11);
    for (let i = 0; i < 30; i++) l = nudgeStart(l, -0.1, D).loop;
    expect(l.start).toBe(8);
  });
  it("can't go below 0:00", () => {
    const r = nudgeStart({ start: 0.3, end: 20 }, -1, D);
    expect(r.loop.start).toBe(0);
    expect(r).toMatchObject({ limited: true, changed: true });
    expect(r.label).toContain("LIMIT");
    const again = nudgeStart(r.loop, -0.1, D);
    expect(again).toMatchObject({ changed: false, limited: true });
    expect(again.loop.start).toBe(0);
  });
  it("can't go past END (keeps the minimum gap)", () => {
    const r = nudgeStart({ start: 19, end: 20 }, 5, D);
    expect(r.loop.start).toBe(20 - LOOP.minGapSec);
    expect(r.limited).toBe(true);
    expect(nudgeStart(r.loop, 0.1, D)).toMatchObject({ changed: false, limited: true });
  });
  it("with no END yet, it can go as far as the track allows (less the gap)", () => {
    expect(nudgeStart({ start: 59, end: null }, 5, D).loop.start).toBe(D - LOOP.minGapSec);
  });
  it("a forward nudge never pulls a START that is already past the ceiling backwards", () => {
    const r = nudgeStart({ start: 59.9, end: null }, 0.1, D);
    expect(r.loop.start).toBe(59.9);
    expect(r.changed).toBe(false);
  });
  it("does nothing without a START, or with a zero or NaN delta", () => {
    expect(nudgeStart(NO_LOOP, 0.1, D)).toMatchObject({ changed: false, label: "SET A START FIRST" });
    expect(nudgeStart(loop, 0, D).changed).toBe(false);
    expect(nudgeStart(loop, NaN, D).changed).toBe(false);
  });
});

describe("restartTarget", () => {
  it("loop START if set (even without END), else 0:00", () => {
    expect(restartTarget({ start: 12.5, end: 20 }, "start")).toBe(12.5);
    expect(restartTarget({ start: 12.5, end: null }, "start")).toBe(12.5);
    expect(restartTarget(NO_LOOP, "start")).toBe(0);
  });
  it("top (Home key): always 0:00", () => {
    expect(restartTarget({ start: 12.5, end: 20 }, "top")).toBe(0);
    expect(restartTarget(NO_LOOP, "top")).toBe(0);
  });
});

describe("shouldWrap", () => {
  const loop: LoopState = { start: 10, end: 20 };
  it("is true at END and anywhere past it, false before", () => {
    expect(shouldWrap(19.99, loop, 0)).toBe(false);
    expect(shouldWrap(20, loop, 0)).toBe(true);
    expect(shouldWrap(23, loop, 0)).toBe(true);
  });
  it("a look-ahead wraps that much sooner", () => {
    expect(shouldWrap(19.96, loop, 0.05)).toBe(true);
    expect(shouldWrap(19.9, loop, 0.05)).toBe(false);
  });
  it("never wraps without both marks", () => {
    expect(shouldWrap(50, NO_LOOP)).toBe(false);
    expect(shouldWrap(50, { start: 10, end: null })).toBe(false);
  });
});

describe("trackRingStart", () => {
  it("captures the playhead when a ring begins and keeps it while that ring lasts", () => {
    let s = trackRingStart(null, null, 0, 5);
    expect(s).toBeNull();
    s = trackRingStart(s, "Victory", 1000, 7);
    expect(s).toEqual({ since: 1000, playhead: 7, playing: true });
    s = trackRingStart(s, "Victory", 1000, 9);
    expect(s?.playhead).toBe(7);
  });
  it("forgets it when the shape goes, and restarts for a new ring", () => {
    let s = trackRingStart(null, "Victory", 1000, 7);
    s = trackRingStart(s, null, 1000, 8);
    expect(s).toBeNull();
    s = trackRingStart(s, "Victory", 3000, 11);
    expect(s).toEqual({ since: 3000, playhead: 11, playing: true });
  });
  it("a restarted dwell (stillness rule) takes a new stamp", () => {
    const s = trackRingStart({ since: 1000, playhead: 7, playing: true }, "Victory", 1500, 7.5);
    expect(s).toEqual({ since: 1500, playhead: 7.5, playing: true });
  });
});

describe("markOffsetFor (offset only when marking while playing and not scrubbing)", () => {
  const playing = { playing: true, scrubbing: false, msSinceScrub: Infinity };
  it("while playing and not scrubbing: the late-mark offset", () => {
    expect(markOffsetFor(playing)).toBe(LOOP.markOffsetSec);
  });
  it("while paused: exact", () => {
    expect(markOffsetFor({ ...playing, playing: false })).toBe(0);
  });
  it("while scrubbing: exact", () => {
    expect(markOffsetFor({ ...playing, scrubbing: true })).toBe(0);
  });
  it("right after a scrub: exact, until the window has passed", () => {
    expect(markOffsetFor({ ...playing, msSinceScrub: 500 })).toBe(0);
    expect(markOffsetFor({ ...playing, msSinceScrub: LOOP.exactAfterScrubMs - 1 })).toBe(0);
    expect(markOffsetFor({ ...playing, msSinceScrub: LOOP.exactAfterScrubMs })).toBe(LOOP.markOffsetSec);
  });
  it("a tunable offset still applies when it should", () => {
    expect(markOffsetFor(playing, 0.3)).toBe(0.3);
  });
});

describe("nudgeEnd (the START clamps, mirrored)", () => {
  const loop: LoopState = { start: 10, end: 20 };
  it("moves END later and earlier and reports a change", () => {
    expect(nudgeEnd(loop, 2, D).loop).toEqual({ start: 10, end: 22 });
    expect(nudgeEnd(loop, -2, D).loop).toEqual({ start: 10, end: 18 });
    expect(nudgeEnd(loop, 2, D).changed).toBe(true);
  });
  it("never before START + the minimum gap", () => {
    const r = nudgeEnd(loop, -50, D);
    expect(r.loop.end).toBe(10 + LOOP.minGapSec);
    expect(r.limited).toBe(true);
    expect(r.label).toContain("LIMIT");
  });
  it("never past the end of the track", () => {
    const r = nudgeEnd(loop, 500, D);
    expect(r.loop.end).toBe(D);
    expect(r.limited).toBe(true);
  });
  it("a backward nudge never pushes an END that is already too close to START forward", () => {
    const tight: LoopState = { start: 10, end: 10.2 };
    expect(nudgeEnd(tight, -1, D).loop.end).toBe(10.2);
  });
  it("needs an END, ignores zero, leaves START alone", () => {
    expect(nudgeEnd({ start: 10, end: null }, 1, D).label).toBe("SET AN END FIRST");
    expect(nudgeEnd(loop, 0, D).changed).toBe(false);
    expect(nudgeEnd(loop, 3, D).loop.start).toBe(10);
  });
  it("the START clamp is mirrored: START stops at END - gap, END stops at START + gap", () => {
    expect(nudgeStart(loop, 50, D).loop.start).toBe(20 - LOOP.minGapSec);
    expect(nudgeEnd(loop, -50, D).loop.end).toBe(10 + LOOP.minGapSec);
  });
});

describe("markPlayhead (where a gesture mark lands)", () => {
  const base = { current: 40, playing: true, scrubbing: false, lastScrubT: -Infinity, t: 10_000, duration: D };
  const stamp = { since: 9_400, playhead: 39.4, playing: true };

  it("playing, no scrub: the ring-start playhead less the late-mark offset", () => {
    expect(markPlayhead(stamp, base)).toBeCloseTo(39.4 - LOOP.markOffsetSec, 6);
  });
  it("paused when the ring began: the exact ring-start playhead", () => {
    expect(markPlayhead({ ...stamp, playing: false }, base)).toBe(39.4);
  });
  it("while the knob scrubs: the exact playhead NOW (the stamp is stale)", () => {
    expect(markPlayhead(stamp, { ...base, scrubbing: true })).toBe(40);
  });
  it("a scrub that ran since the ring started: the exact playhead now", () => {
    expect(markPlayhead(stamp, { ...base, lastScrubT: 9_700 })).toBe(40);
  });
  it("right after a scrub that ended before the ring began: the exact ring-start playhead, no offset", () => {
    expect(markPlayhead(stamp, { ...base, lastScrubT: 9_000 })).toBe(39.4);
  });
  it("long after the last scrub: back to the offset", () => {
    expect(markPlayhead(stamp, { ...base, lastScrubT: 9_400 - LOOP.exactAfterScrubMs - 100 })).toBeCloseTo(39.4 - LOOP.markOffsetSec, 6);
  });
  it("R5: at 2x the late-mark offset is twice as much music (the delay is real time), and still none while paused", () => {
    expect(markPlayhead(stamp, { ...base, rate: 2 })).toBeCloseTo(39.4 - 2 * LOOP.markOffsetSec, 6);
    expect(markPlayhead(stamp, { ...base, rate: 0.5 })).toBeCloseTo(39.4 - 0.5 * LOOP.markOffsetSec, 6);
    expect(markPlayhead({ ...stamp, playing: false }, { ...base, rate: 2 })).toBe(39.4);
    expect(markPlayhead(stamp, { ...base, rate: 1 })).toBeCloseTo(39.4 - LOOP.markOffsetSec, 6);
  });
  it("with no ring stamp it uses the playhead now, and is clamped to the track", () => {
    expect(markPlayhead(null, { ...base, playing: false })).toBe(40);
    expect(markPlayhead(null, { ...base, current: 0.05 })).toBe(0);
  });
});
