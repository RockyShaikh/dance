import { describe, expect, it } from "vitest";
import { nudgeEnd, nudgeStart, type LoopState } from "./loop";
import { flagDelta, nextScrubSeek, timeAtX } from "./timelineMouse";

describe("timeline mouse (R9b)", () => {
  it("timeAtX maps the bar to the track and clamps outside it", () => {
    expect(timeAtX(100, 100, 400, 200)).toBe(0);
    expect(timeAtX(300, 100, 400, 200)).toBe(100);
    expect(timeAtX(500, 100, 400, 200)).toBe(200);
    expect(timeAtX(0, 100, 400, 200)).toBe(0); // left of the bar
    expect(timeAtX(900, 100, 400, 200)).toBe(200); // right of the bar
  });
  it("timeAtX is 0 for an empty bar, an empty track or a bad x", () => {
    expect(timeAtX(50, 0, 0, 100)).toBe(0);
    expect(timeAtX(50, 0, 100, 0)).toBe(0);
    expect(timeAtX(NaN, 0, 100, 100)).toBe(0);
  });

  const loop: LoopState = { start: 10, end: 20 };
  const dragStart = (t: number, l = loop) => nudgeStart(l, flagDelta(l, "start", t), 60).loop.start;
  const dragEnd = (t: number, l = loop) => nudgeEnd(l, flagDelta(l, "end", t), 60).loop.end;

  it("dragging START follows the pointer, clamped to 0:00 and to END minus the minimum gap", () => {
    expect(dragStart(12)).toBe(12);
    expect(dragStart(-5)).toBe(0);
    const stop = dragStart(40) as number;
    expect(stop).toBeLessThan(20);
    expect(stop).toBeGreaterThan(19);
  });
  it("dragging END follows the pointer, clamped to the track end and to START plus the minimum gap", () => {
    expect(dragEnd(30)).toBe(30);
    expect(dragEnd(500)).toBe(60);
    const stop = dragEnd(0) as number;
    expect(stop).toBeGreaterThan(10);
    expect(stop).toBeLessThan(11);
  });
  it("a flag that is not set does not move", () => {
    expect(flagDelta({ start: null, end: null }, "start", 5)).toBe(0);
    expect(flagDelta({ start: 3, end: null }, "end", 5)).toBe(0);
  });

  it("nextScrubSeek: newest target wins, one seek in flight, no repeats", () => {
    expect(nextScrubSeek(null, null, false)).toBeNull();
    expect(nextScrubSeek(12, null, false)).toBe(12);
    expect(nextScrubSeek(12, null, true)).toBeNull(); // the last seek is still in flight
    expect(nextScrubSeek(12, 12, false)).toBeNull(); // already there
    expect(nextScrubSeek(13, 12, false)).toBe(13);
  });
});
