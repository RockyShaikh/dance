import { describe, expect, it } from "vitest";
import { KNOB } from "./config";
import { tiltDeg } from "./handFeatures";
import { rebaseMotion, startMotion, stepMotion, wrap180, type MotionInput, type MotionState } from "./knobMotion";
import { LM } from "./hand";
import { shapes } from "./test/fixtures";

describe("tilt angle (needle from the wrist to the middle knuckle, against straight up)", () => {
  // The fixture hand's middle knuckle sits a few degrees off the wrist's vertical (as a real hand's does),
  // so the tests compare a turned hand with the same hand upright.
  const turned = (shape: typeof shapes.openPalm, hand: "Left" | "Right", rollDeg: number) => tiltDeg(shape(hand, { rollDeg })) - tiltDeg(shape(hand));

  it("an upright hand reads close to 0", () => {
    expect(Math.abs(tiltDeg(shapes.openPalm("Right")))).toBeLessThan(5);
    expect(Math.abs(tiltDeg(shapes.openPalm("Left")))).toBeLessThan(5);
  });

  it("a hand turned clockwise as the user sees the MIRRORED picture reads more positive", () => {
    // makeHand's roll is clockwise in the raw image; the picture is mirrored for display, so the
    // dancer's hand tilted to their right (clockwise on screen) is a NEGATIVE raw roll.
    expect(turned(shapes.openPalm, "Right", -30)).toBeCloseTo(30, 3);
    expect(turned(shapes.openPalm, "Right", 30)).toBeCloseTo(-30, 3);
    expect(turned(shapes.openPalm, "Left", -75)).toBeCloseTo(75, 3);
  });

  it("is the same for the same turn whatever the hand shape or size", () => {
    expect(turned(shapes.fist, "Right", -20)).toBeCloseTo(20, 3);
    expect(tiltDeg(shapes.fist("Right", { rollDeg: -20, scale: 1 }))).toBeCloseTo(tiltDeg(shapes.fist("Right", { rollDeg: -20, scale: 5 })), 6);
  });

  it("works from raw landmark geometry: pointing to the display right is +90, down is 180", () => {
    const lm = (dx: number, dy: number) => {
      const pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
      pts[LM.MIDDLE_MCP] = { x: dx, y: dy, z: 0 };
      return pts;
    };
    // Raw image: x right, y down. The display is mirrored, so raw -x is the display's right.
    expect(tiltDeg(lm(-1, 0))).toBeCloseTo(90, 6);
    expect(tiltDeg(lm(1, 0))).toBeCloseTo(-90, 6);
    expect(Math.abs(tiltDeg(lm(0, 1)))).toBeCloseTo(180, 6);
    expect(tiltDeg(lm(0, -1))).toBeCloseTo(0, 6);
  });
});

describe("wrap180", () => {
  it("takes the short way round", () => {
    expect(wrap180(190)).toBeCloseTo(-170);
    expect(wrap180(-190)).toBeCloseTo(170);
    expect(wrap180(350)).toBeCloseTo(-10);
    expect(wrap180(10)).toBe(10);
    expect(wrap180(720)).toBeCloseTo(0);
  });
});

const NO_SMOOTH = { ...KNOB, tilt: { smoothing: 1 } };
const at = (t: number, tilt = 0, palm = { x: 0.75, y: 0.5 }): MotionInput => ({ t, tiltDeg: tilt, palm, aspect: 16 / 9 });

describe("tilt motion", () => {
  it("starts at the hand's tilt and follows it", () => {
    let s: MotionState = startMotion("tilt", at(0, 20));
    expect(s.angle).toBe(20);
    s = stepMotion(s, at(33, 45), NO_SMOOTH);
    expect(s.angle).toBeCloseTo(45);
  });

  it("smooths a jittery reading", () => {
    let s = startMotion("tilt", at(0, 0));
    const a = KNOB.tilt.smoothing;
    s = stepMotion(s, at(33, 10), KNOB);
    expect(s.angle).toBeCloseTo(10 * a);
    s = stepMotion(s, at(66, 10), KNOB);
    expect(s.angle).toBeCloseTo(10 * (1 - (1 - a) ** 2));
  });

  it("does not jump when the needle crosses +-180 (a 2-degree step stays 2 degrees)", () => {
    let s = startMotion("tilt", at(0, 179));
    s = stepMotion(s, at(33, -179), NO_SMOOTH);
    expect(s.angle).toBeCloseTo(181);
  });

  it("rebase keeps working from the new pose", () => {
    let s = startMotion("tilt", at(0, 10));
    s = rebaseMotion(s, at(500, 50));
    expect(s.angle).toBe(50);
  });
});

/** Walks the palm round a circle of `radius` (frame heights) at `turnsPerSec`, returns the motion state after `ms`. */
function circle(opts: { ms: number; turnsPerSec: number; radius?: number; startDeg?: number; centre?: { x: number; y: number }; from?: MotionState; t0?: number }): MotionState {
  const { turnsPerSec, radius = 0.12, startDeg = 0, centre = { x: 0.75, y: 0.5 } } = opts;
  const aspect = 16 / 9;
  const t0 = opts.t0 ?? 0;
  let s: MotionState | null = opts.from ?? null;
  for (let t = 0; t <= opts.ms; t += 33) {
    // Display angle clockwise from 3 o'clock; screen y points down.
    const a = ((startDeg + 360 * turnsPerSec * (t / 1000)) * Math.PI) / 180;
    const palm = { x: centre.x + (radius * Math.cos(a)) / aspect, y: centre.y + radius * Math.sin(a) };
    const input = at(t0 + t, 0, palm);
    s = s ? stepMotion(s, input, KNOB) : startMotion("circling", input);
  }
  return s as MotionState;
}

describe("circling motion", () => {
  it("clockwise circles add up positive, about 360 degrees per turn", () => {
    const s = circle({ ms: 3000, turnsPerSec: 0.5 }); // 1.5 turns
    // The first ~0.3 s is warm-up and the centre estimate lags, so allow a margin.
    expect(s.angle).toBeGreaterThan(360 * 1.5 * 0.6);
    expect(s.angle).toBeLessThan(360 * 1.5 * 1.1);
  });

  it("counter-clockwise circles add up negative", () => {
    const s = circle({ ms: 3000, turnsPerSec: -0.5 });
    expect(s.angle).toBeLessThan(-360 * 1.5 * 0.6);
    expect(s.angle).toBeGreaterThan(-360 * 1.5 * 1.1);
  });

  it("is continuous through +-180 degrees (wrap-around): no lurch of 360 when the angle crosses the seam", () => {
    // Start just before the seam (atan2's +-180 is the palm to the LEFT of the centre).
    let s = circle({ ms: 1500, turnsPerSec: 0.25, startDeg: 150 });
    const before = s.angle;
    s = circle({ ms: 1500, turnsPerSec: 0.25, startDeg: 150 + 360 * 0.25 * 1.5, from: s, t0: 1500 + 33 });
    // 1.5 s more at a quarter turn per second = 135 degrees: crossing the seam adds no 360 jump.
    expect(s.angle - before).toBeGreaterThan(100);
    expect(s.angle - before).toBeLessThan(170);
  });

  it("measures nothing while the hand just sits (inside the minimum radius), and nothing during warm-up", () => {
    const still = circle({ ms: 2000, turnsPerSec: 0, radius: 0.1 });
    expect(still.angle).toBe(0);
    const tiny = circle({ ms: 2000, turnsPerSec: 1, radius: 0.01 });
    expect(tiny.angle).toBe(0);
    const early = circle({ ms: 200, turnsPerSec: 1 });
    expect(early.warm).toBe(false);
    expect(early.angle).toBe(0);
  });

  it("reports the estimated centre of the circle", () => {
    const s = circle({ ms: 2000, turnsPerSec: 1, centre: { x: 0.7, y: 0.4 } });
    expect(s.centre!.x).toBeCloseTo(0.7, 1);
    expect(s.centre!.y).toBeCloseTo(0.4, 1);
  });

  it("rebase keeps the total and restarts the measuring without a lurch", () => {
    const s = circle({ ms: 2000, turnsPerSec: 0.5 });
    const total = s.angle;
    const r = rebaseMotion(s, at(5000, 0, { x: 0.9, y: 0.2 }));
    expect(r.angle).toBe(total);
    expect(r.warm).toBe(false);
    const next = stepMotion(r, at(5033, 0, { x: 0.9, y: 0.2 }), KNOB);
    expect(next.angle).toBe(total);
  });
});
