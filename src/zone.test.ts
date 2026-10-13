import { describe, expect, it } from "vitest";
import { DEFAULT_ZONE, PRESETS, contains, hitTest, normalizeBox, type Box } from "./box";
import { COMMANDS } from "./config";
import type { Handedness } from "./hand";
import { INITIAL_MACHINES, stepHandCommands, type HandCmdObs, type HandFire, type HandMachines } from "./handCommands";

describe("the command zone: top quarter of the mirrored picture, full width", () => {
  it("is the default, the preset, and spans the whole width", () => {
    expect(DEFAULT_ZONE).toEqual({ x: 0, y: 0, w: 1, h: 0.25 });
    expect(PRESETS.topQuarter).toEqual(DEFAULT_ZONE);
  });

  it("hit-test: inside, the edges count, outside does not (either side of the picture)", () => {
    const z = DEFAULT_ZONE;
    expect(contains(z, { x: 0.1, y: 0.1 })).toBe(true);
    expect(contains(z, { x: 0.9, y: 0.1 })).toBe(true);
    expect(contains(z, { x: 0.5, y: 0 })).toBe(true);
    expect(contains(z, { x: 0.5, y: 0.25 })).toBe(true); // the bottom edge
    expect(contains(z, { x: 0.5, y: 0.2501 })).toBe(false);
    expect(contains(z, { x: 0.5, y: 0.6 })).toBe(false);
  });

  it("mouse editing: the zone moves, resizes from its bottom edge, and stays in the frame", () => {
    const tol = { x: 0.01, y: 0.02 };
    expect(hitTest(DEFAULT_ZONE, { x: 0.5, y: 0.1 }, tol)).toBe("move");
    expect(hitTest(DEFAULT_ZONE, { x: 0.5, y: 0.25 }, tol)).toBe("s");
    expect(hitTest(DEFAULT_ZONE, { x: 0.5, y: 0.5 }, tol)).toBeNull();
    const dragged: Box = normalizeBox({ x: 0.3, y: 0.9, w: 0.5, h: 0.25 });
    expect(dragged.y + dragged.h).toBeLessThanOrEqual(1);
  });
});

const FRAME = 33;
const obs = (hand: Handedness, shape: string, palm: { x: number; y: number }): HandCmdObs => ({ hand, shape, shapeScore: 0.9, palmFacing: true, palm });

/** Both hands tested against the ONE shared zone (what main.ts passes). */
function run(hands: HandCmdObs[], ms: number): HandFire[] {
  let state: HandMachines = INITIAL_MACHINES;
  const fires: HandFire[] = [];
  for (let t = FRAME; t <= ms; t += FRAME) {
    const r = stepHandCommands(state, { t, hands, boxes: { Left: DEFAULT_ZONE, Right: DEFAULT_ZONE }, suppress: { Left: false, Right: false } }, COMMANDS);
    state = r.state;
    fires.push(...r.fired);
  }
  return fires;
}

describe("both hands' commands count only with the palm centre inside the one zone", () => {
  it("right hand inside the zone fires; the same hand below the zone does not", () => {
    expect(run([obs("Right", "Pointing_Up", { x: 0.7, y: 0.12 })], 900)).toMatchObject([{ hand: "Right", shape: "Pointing_Up" }]);
    expect(run([obs("Right", "Pointing_Up", { x: 0.7, y: 0.4 })], 900)).toEqual([]);
  });

  it("left hand: the zone is the same one, anywhere across the top, even on the right of the picture (crossed arms)", () => {
    expect(run([obs("Left", "Victory", { x: 0.2, y: 0.1 })], 900)).toMatchObject([{ hand: "Left", shape: "Victory" }]);
    expect(run([obs("Left", "Victory", { x: 0.85, y: 0.1 })], 900)).toMatchObject([{ hand: "Left", shape: "Victory" }]);
    expect(run([obs("Left", "Victory", { x: 0.2, y: 0.5 })], 900)).toEqual([]);
  });

  it("the right fist (play / pause) works anywhere across the top, and nowhere else", () => {
    expect(run([obs("Right", "Closed_Fist", { x: 0.1, y: 0.1 })], 900)).toMatchObject([{ hand: "Right", shape: "Closed_Fist" }]);
    expect(run([obs("Right", "Closed_Fist", { x: 0.1, y: 0.3 })], 900)).toEqual([]);
  });
});
