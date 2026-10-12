import { describe, expect, it } from "vitest";
import { CLUTCH, KNOB } from "./config";
import { IDLE_KNOB, normalizeChoice, stepKnob, takeWholeMs, type KnobChoice, type KnobOutput, type KnobSample, type KnobState } from "./knob";
import { nudgeStart, type LoopState } from "./loop";

const FRAME = 33;
const CHOICE: KnobChoice = { clutch: "claw", motion: "tilt", mapping: "joystick", gain: 1, deadZoneDeg: 12, invert: false };
const DURATION = 60;

/** The knob driving a real loop model, the way main.ts does (applySec -> nudgeStart). */
class Rig {
  state: KnobState = IDLE_KNOB;
  t = 1000;
  loop: LoopState = { start: 20, end: 40 };
  out!: KnobOutput;
  events = { started: 0, released: 0 };
  constructor(public choice: KnobChoice = CHOICE) {}

  /** Show a pose for `ms`. `hand` null = the steering hand is not in view. `grabbed` = what the clutch says. */
  show(ms: number, hand: KnobSample | null, grabbed = true): void {
    const end = this.t + ms;
    while (this.t < end) {
      this.t += FRAME;
      const r = stepKnob(this.state, { t: this.t, grabbed, hand, aspect: 16 / 9 }, this.choice, KNOB, CLUTCH.releaseGraceMs);
      this.state = r.state;
      this.out = r.out;
      if (r.out.started) this.events.started++;
      if (r.out.released) this.events.released++;
      if (r.out.applySec !== 0) this.loop = nudgeStart(this.loop, r.out.applySec, DURATION).loop;
    }
  }
  tilt(deg: number, ms: number): void {
    this.show(ms, pose(deg));
  }
}

const pose = (tiltDeg: number, palm = { x: 0.75, y: 0.5 }): KnobSample => ({ tiltDeg, palm });

describe("grab and joystick nudge", () => {
  it("grab starts at the current pose and does not move the START", () => {
    const r = new Rig();
    r.tilt(30, 100); // grabbed already tilted: that angle is centre
    expect(r.events.started).toBe(1);
    expect(r.out.grabbed).toBe(true);
    expect(r.loop.start).toBe(20);
  });

  it("tilting clockwise moves the START later, counter-clockwise earlier, and back to centre stops", () => {
    const r = new Rig();
    r.tilt(0, 100);
    r.tilt(45, 1000);
    const later = r.loop.start as number;
    expect(later).toBeGreaterThan(21);
    r.tilt(0, 300); // the smoothing lets the last bit run out
    const stopped = r.loop.start as number;
    expect(stopped).toBeLessThan(later + 0.3);
    r.tilt(0, 1000);
    expect(r.loop.start).toBe(stopped); // the spring: stops where it is
    r.tilt(-45, 2000);
    expect(r.loop.start as number).toBeLessThan(stopped - 1);
  });

  it("a light touch inside the dead zone does nothing", () => {
    const r = new Rig();
    r.tilt(0, 100);
    r.tilt(8, 2000);
    expect(r.loop.start).toBe(20);
  });

  it("stays low gain: even full tilt for one second moves the START only a few seconds", () => {
    const r = new Rig();
    r.tilt(0, 100);
    r.tilt(70, 1000);
    expect(Math.abs((r.loop.start as number) - 20)).toBeLessThanOrEqual(KNOB.joystick.maxRateSecPerSec + 0.2);
  });

  it("clamps: never before 0:00, never within the minimum gap of END", () => {
    const r = new Rig();
    r.tilt(0, 100);
    r.tilt(-70, 20000);
    expect(r.loop.start).toBe(0);
    r.tilt(0, 100); // release the push
    r.tilt(70, 30000);
    expect(r.loop.start as number).toBeCloseTo((r.loop.end as number) - 0.5, 3);
  });

  it("leaves a clamp as soon as you turn back (no wound-up travel to unwind)", () => {
    const r = new Rig();
    r.tilt(0, 100);
    r.tilt(-70, 20000); // pinned at 0:00
    expect(r.loop.start).toBe(0);
    r.tilt(70, 400);
    expect(r.loop.start as number).toBeGreaterThan(0.3);
  });

  it("slow turns are not lost to millisecond rounding (the remainder is carried)", () => {
    // Just past the dead zone the rate is a fraction of a millisecond per frame.
    const r = new Rig({ ...CHOICE, gain: 0.25 });
    r.tilt(0, 100);
    r.tilt(18, 20000);
    expect(r.loop.start as number).toBeGreaterThan(20.001);
  });

  it("takeWholeMs hands out whole milliseconds and keeps the rest", () => {
    expect(takeWholeMs(0.0004)).toEqual({ apply: 0, rest: 0.0004 });
    const t = takeWholeMs(0.0126);
    expect(t.apply).toBeCloseTo(0.012, 9);
    expect(t.rest).toBeCloseTo(0.0006, 9);
    expect(takeWholeMs(-0.0126).apply).toBeCloseTo(-0.012, 9);
  });
});

describe("tracking dropout", () => {
  it("freezes: the START does not move at all while the hand is missing, even mid-push", () => {
    const r = new Rig();
    r.tilt(0, 100);
    r.tilt(50, 500);
    const at = r.loop.start;
    r.show(200, null); // lost, but inside the 0.3 s grace
    expect(r.out.grabbed).toBe(true);
    expect(r.out.view?.frozen).toBe(true);
    expect(r.out.applySec).toBe(0);
    expect(r.loop.start).toBe(at);
  });

  it("releases after about 0.3 s without the hand", () => {
    const r = new Rig();
    r.tilt(0, 100);
    r.show(CLUTCH.releaseGraceMs - 70, null);
    expect(r.out.grabbed).toBe(true);
    r.show(200, null);
    expect(r.out.grabbed).toBe(false);
    expect(r.events.released).toBe(1);
    expect(r.state.grabbed).toBe(false);
  });

  it("the hand coming back within the grace does not jump any mapping", () => {
    for (const mapping of ["absolute", "relative"] as const) {
      const r = new Rig({ ...CHOICE, mapping });
      r.tilt(0, 100);
      r.tilt(30, 300);
      r.show(150, null);
      const before = r.loop.start;
      r.tilt(-50, 33); // reappears at a very different tilt
      expect(r.loop.start).toBe(before);
      r.tilt(-50, 33 * 8); // holding still there: still no drift
      expect(r.loop.start).toBe(before);
    }
  });

  it("a joystick that comes back tilted resumes at that rate, but the value itself never jumps", () => {
    const r = new Rig();
    r.tilt(0, 100);
    r.tilt(40, 300);
    r.show(150, null);
    const before = r.loop.start as number;
    r.tilt(40, 33);
    expect(Math.abs((r.loop.start as number) - before)).toBeLessThan(0.2);
  });
});

describe("release", () => {
  it("when the clutch lets go the knob releases at once and reports it once", () => {
    const r = new Rig();
    r.tilt(0, 100);
    r.show(100, pose(0), false);
    expect(r.out.grabbed).toBe(false);
    expect(r.events).toEqual({ started: 1, released: 1 });
    r.show(500, pose(0), false);
    expect(r.events.released).toBe(1);
  });

  it("a grab with the steering hand not yet in view waits for it", () => {
    const r = new Rig();
    r.show(200, null);
    expect(r.out.grabbed).toBe(false);
    r.tilt(0, 100);
    expect(r.out.grabbed).toBe(true);
  });
});

describe("relative + ratchet through the pipeline", () => {
  it("re-grabbing continues from where the START was: no jump at the re-grab, turns add up", () => {
    const r = new Rig({ ...CHOICE, mapping: "relative" });
    r.tilt(0, 100);
    r.tilt(60, 400);
    const first = r.loop.start as number;
    expect(first).toBeGreaterThan(22); // moved by about 60 degrees x 0.06 s
    r.show(300, pose(0), false); // released; the hand turns back with an open hand
    expect(r.loop.start).toBe(first);
    r.tilt(0, 100); // re-grab at 0 degrees
    expect(r.loop.start).toBe(first);
    r.tilt(60, 400);
    expect((r.loop.start as number) - first).toBeGreaterThan(2);
    expect(r.events.started).toBe(2);
  });
});

describe("absolute through the pipeline", () => {
  it("is limited by the wiper's range, however far the hand turns", () => {
    const r = new Rig({ ...CHOICE, mapping: "absolute" });
    r.tilt(0, 100);
    r.tilt(170, 1500);
    expect((r.loop.start as number) - 20).toBeCloseTo(KNOB.absolute.worldRangeDeg * KNOB.absolute.secPerDeg, 1);
  });
});

describe("circling + jog through the pipeline", () => {
  it("clockwise circles move the START later by secPerTurn per circle", () => {
    const r = new Rig({ ...CHOICE, motion: "circling", mapping: "jog" });
    const aspect = 16 / 9;
    for (let t = 0; t <= 4000; t += FRAME) {
      const a = (Math.PI * 2 * t) / 2000; // one turn per 2 s clockwise on screen
      r.show(FRAME, { tiltDeg: 0, palm: { x: 0.75 + (0.12 * Math.cos(a)) / aspect, y: 0.5 + 0.12 * Math.sin(a) } });
    }
    const moved = (r.loop.start as number) - 20;
    // About two turns, less the warm-up and the first half-circle the centre needs.
    expect(moved).toBeGreaterThan(1.5 * KNOB.jog.secPerTurn);
    expect(moved).toBeLessThan(2.1 * KNOB.jog.secPerTurn);
  });
});

describe("normalizeChoice", () => {
  it("circling goes with jog, and jog needs circling", () => {
    expect(normalizeChoice({ motion: "circling", mapping: "joystick" }).mapping).toBe("jog");
    expect(normalizeChoice({ motion: "tilt", mapping: "jog" }).mapping).toBe("joystick");
    expect(normalizeChoice({ motion: "tilt", mapping: "absolute" })).toEqual({ motion: "tilt", mapping: "absolute" });
  });
});
