import { describe, expect, it } from "vitest";
import { SPEED } from "./config";
import { IDLE_HOLD, stepHoldSpeed, type HoldSpeedState } from "./holdSpeed";

const FRAME = 33;

/** Feeds frames; `rate` is whatever the player is at (the test applies setRate like main.ts does). */
class Run {
  state: HoldSpeedState = IDLE_HOLD;
  t = 1000;
  rate = 1;
  sets: { t: number; rate: number }[] = [];
  show(ms: number, thumb: boolean, suppress = false): void {
    const end = this.t + ms;
    while (this.t < end) {
      this.t += FRAME;
      const r = stepHoldSpeed(this.state, { t: this.t, thumb, suppress, rate: this.rate });
      this.state = r.state;
      if (r.setRate !== null) {
        this.rate = r.setRate;
        this.sets.push({ t: this.t, rate: r.setRate });
      }
    }
  }
}

describe("hold the thumbs up: 2x while held, the previous speed back on release", () => {
  it("arms after the short dwell (0.3 s), engages at once, 2x while held", () => {
    const r = new Run();
    r.show(SPEED.holdArmMs - 2 * FRAME, true);
    expect(r.rate).toBe(1); // not yet
    r.show(4 * FRAME, true);
    expect(r.rate).toBe(2);
    expect(r.sets).toHaveLength(1);
    expect(r.sets[0].t - 1000).toBeLessThanOrEqual(SPEED.holdArmMs + 2 * FRAME);
    r.show(5000, true);
    expect(r.rate).toBe(2);
    expect(r.sets).toHaveLength(1); // no repeated sets while held
  });

  it("released (the shape gone for ~150 ms): back to the speed it was at, e.g. 0.8x", () => {
    const r = new Run();
    r.rate = 0.8;
    r.show(1000, true);
    expect(r.rate).toBe(2);
    r.show(SPEED.holdReleaseMs - 2 * FRAME, false);
    expect(r.rate).toBe(2); // a dropped frame or two does not release
    r.show(3 * FRAME, false);
    expect(r.rate).toBe(0.8);
    expect(r.sets.map((s) => s.rate)).toEqual([2, 0.8]);
    r.show(2000, false);
    expect(r.rate).toBe(0.8); // and nothing more happens
  });

  it("a dropout shorter than the release does not end the hold (and the dwell is not restarted)", () => {
    const r = new Run();
    r.show(1000, true);
    for (let i = 0; i < 5; i++) {
      r.show(2 * FRAME, false);
      r.show(300, true);
    }
    expect(r.rate).toBe(2);
    expect(r.sets).toHaveLength(1);
  });

  it("a thumbs up that goes before the dwell is full never changes the speed", () => {
    const r = new Run();
    r.show(SPEED.holdArmMs - 3 * FRAME, true);
    r.show(1000, false);
    expect(r.sets).toEqual([]);
    expect(r.rate).toBe(1);
  });

  it("two short thumbs up with a gap longer than the release do not add up to an arm", () => {
    const r = new Run();
    r.show(SPEED.holdArmMs - 3 * FRAME, true);
    r.show(SPEED.holdReleaseMs + 2 * FRAME, false);
    r.show(SPEED.holdArmMs - 3 * FRAME, true);
    expect(r.sets).toEqual([]);
  });

  it("it can be held again after a release, from whatever the speed is then", () => {
    const r = new Run();
    r.rate = 0.9;
    r.show(800, true);
    r.show(500, false);
    expect(r.rate).toBe(0.9);
    r.rate = 0.7; // the speed changed meanwhile (wheel, keys)
    r.show(800, true);
    expect(r.rate).toBe(2);
    r.show(500, false);
    expect(r.rate).toBe(0.7);
  });

  it("already at 2x (the T key): nothing is set, and the release puts 2x back (nothing lost)", () => {
    const r = new Run();
    r.rate = 2;
    r.show(1000, true);
    expect(r.sets).toEqual([]);
    r.show(500, false);
    expect(r.rate).toBe(2);
  });

  it("the wheel being grabbed ends a boost at once and nothing arms meanwhile", () => {
    const r = new Run();
    r.rate = 0.85;
    r.show(800, true);
    expect(r.rate).toBe(2);
    r.show(FRAME, true, true);
    expect(r.rate).toBe(0.85);
    r.show(2000, true, true);
    expect(r.rate).toBe(0.85);
    expect(r.sets.map((s) => s.rate)).toEqual([2, 0.85]);
  });

  it("the arm dwell and the release are configurable", () => {
    let s = IDLE_HOLD;
    const cfg = { fast: 2, holdArmMs: 100, holdReleaseMs: 400 };
    let t = 0;
    const out: (number | null)[] = [];
    for (let i = 0; i < 20; i++) out.push((({ state, setRate }) => ((s = state), setRate))(stepHoldSpeed(s, { t: (t += FRAME), thumb: true, suppress: false, rate: 1 }, cfg)));
    expect(out.filter((x) => x !== null)).toEqual([2]);
    expect(out.findIndex((x) => x !== null) * FRAME).toBeLessThanOrEqual(100 + 2 * FRAME);
    for (let i = 0; i < 10; i++) expect(stepHoldSpeed(s, { t: (t += FRAME), thumb: false, suppress: false, rate: 2 }, cfg).setRate).toBeNull(); // 330 ms: still held
  });
});
