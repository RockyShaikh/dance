import { describe, expect, it } from "vitest";
import { DEFAULT_BOXES, PRESETS, type Box, type Vec2 } from "./box";
import { initialClutchState, stepClutches, type ClutchHand } from "./clutch";
import { CLUTCH, COMMANDS, KNOB, type ClutchKind, type KnobTarget } from "./config";
import type { Handedness } from "./hand";
import { INITIAL_MACHINES, stepHandCommands, type HandFire } from "./handCommands";
import { IDLE_KNOB, stepKnob, type KnobChoice } from "./knob";
import { selectClutch, suppressFor, type KnobHand } from "./knobClutch";

const FRAME = 33;
const RIGHT_SIDE: Vec2 = { x: 0.75, y: 0.5 };
const LEFT_SIDE: Vec2 = { x: 0.25, y: 0.5 };

interface TestHand {
  hand: Handedness;
  shape: string;
  palm: Vec2;
  pinchRatio?: number;
  clawExt?: number;
  tiltDeg?: number;
}

/**
 * The same chain main.ts runs each frame, with the real modules: clutch detectors (per-hand boxes) ->
 * knob clutch pick -> knob -> per-hand command classifiers, blocked per hand while grabbed.
 */
class Chain {
  clutch = initialClutchState();
  knob = IDLE_KNOB;
  machines = INITIAL_MACHINES;
  t = 0;
  fires: HandFire[] = [];
  grabbedFrames = 0;
  moved = 0;
  constructor(
    public kind: ClutchKind,
    public boxes: Record<Handedness, Box> = DEFAULT_BOXES,
    public suppress = true,
    public target: KnobTarget = "playhead",
  ) {}

  show(ms: number, hands: readonly TestHand[]): void {
    const end = this.t + ms;
    const choice: KnobChoice = { clutch: this.kind, motion: "tilt", mapping: "joystick", target: this.target, gain: 1, deadZoneDeg: 12, invert: false };
    while (this.t < end) {
      this.t += FRAME;
      const c = stepClutches(
        this.clutch,
        {
          t: this.t,
          box: this.boxes,
          hands: hands.map((h): ClutchHand => ({ hand: h.hand, shape: h.shape, palm: h.palm, pinchRatio: h.pinchRatio ?? 0.9, clawExt: h.clawExt ?? 1.9, othersReach: 1.9 })),
        },
        CLUTCH,
      );
      this.clutch = c.state;
      const kh: KnobHand[] = hands.map((h) => ({ hand: h.hand, palm: h.palm, tiltDeg: h.tiltDeg ?? 0 }));
      const pick = selectClutch(this.kind, c.view, kh, CLUTCH);
      const k = stepKnob(this.knob, { t: this.t, grabbed: pick.grabbed, hand: pick.steering, aspect: 16 / 9 }, choice, KNOB, CLUTCH.releaseGraceMs);
      this.knob = k.state;
      this.moved += k.out.applySec;
      const grabbed = pick.grabbed || k.out.grabbed;
      if (grabbed) this.grabbedFrames++;
      const none = { Left: false, Right: false };
      const r = stepHandCommands(
        this.machines,
        {
          t: this.t,
          hands: hands.map((h) => ({ hand: h.hand, shape: h.shape, shapeScore: 0.95, palmFacing: true, palm: h.palm })),
          boxes: this.boxes,
          suppress: this.suppress ? suppressFor(this.kind, grabbed, pick.steering?.hand ?? null) : none,
        },
        COMMANDS,
      );
      this.machines = r.state;
      this.fires.push(...r.fired);
    }
  }
}

const open = (clawExt = 1.95): TestHand => ({ hand: "Right", shape: "None", palm: RIGHT_SIDE, clawExt });

describe("commands are suppressed while the knob is grabbed (claw, the default)", () => {
  it("a claw that the recognizer reads as an open palm, a V or an index does not fire its own command", () => {
    for (const shape of ["Open_Palm", "Closed_Fist", "Victory", "Pointing_Up"]) {
      const c = new Chain("claw");
      c.show(300, [open()]);
      c.show(3000, [{ hand: "Right", shape, palm: RIGHT_SIDE, clawExt: 1.45 }]); // curled in: grabbed
      expect(c.knob.grabbed).toBe(true);
      expect(c.fires).toEqual([]);
    }
  });

  it("the test has teeth: with suppression off the same claw does fire", () => {
    const c = new Chain("claw", DEFAULT_BOXES, false);
    c.show(300, [open()]);
    c.show(3000, [{ hand: "Right", shape: "Closed_Fist", palm: RIGHT_SIDE, clawExt: 1.45 }]);
    expect(c.knob.grabbed).toBe(true);
    expect(c.fires.length).toBeGreaterThan(0);
  });

  it("the right hand's own shapes do not fire during the whole claw, even for many seconds with the hand tilted", () => {
    const c = new Chain("claw");
    c.show(300, [open()]);
    for (const tilt of [0, 30, -30, 45, 0]) c.show(1500, [{ hand: "Right", shape: "Pointing_Up", palm: RIGHT_SIDE, clawExt: 1.45, tiltDeg: tilt }]);
    expect(c.knob.grabbed).toBe(true);
    expect(c.fires).toEqual([]);
  });

  it("the LEFT hand still marks while the right hand is grabbed (only the steering hand is blocked)", () => {
    const c = new Chain("claw");
    c.show(300, [open()]);
    c.show(2000, [
      { hand: "Right", shape: "None", palm: RIGHT_SIDE, clawExt: 1.45 },
      { hand: "Left", shape: "Victory", palm: LEFT_SIDE },
    ]);
    expect(c.knob.grabbed).toBe(true);
    expect(c.fires.map((f) => [f.hand, f.shape])).toEqual([["Left", "Victory"]]);
  });

  it("a ring that was filling when the grab began is dropped, not fired", () => {
    const c = new Chain("pinch");
    c.show(400, [{ hand: "Right", shape: "Victory", palm: RIGHT_SIDE, pinchRatio: 0.9 }]); // ring filling
    expect(c.machines.Right.phase).toBe("dwell");
    c.show(1500, [{ hand: "Right", shape: "Victory", palm: RIGHT_SIDE, pinchRatio: 0.1 }]); // now pinching too
    expect(c.fires).toEqual([]);
    expect(c.machines.Right.phase).toBe("idle");
  });

  it("commands work again after the grab ends, once the short block has passed", () => {
    const c = new Chain("pinch");
    c.show(1000, [{ hand: "Right", shape: "Closed_Fist", palm: RIGHT_SIDE, pinchRatio: 0.1 }]);
    expect(c.fires).toEqual([]);
    c.show(1000, []); // let go
    expect(c.knob.grabbed).toBe(false);
    c.show(1500, [{ hand: "Right", shape: "Closed_Fist", palm: RIGHT_SIDE }]);
    expect(c.fires.map((f) => f.shape)).toEqual(["Closed_Fist"]);
  });

  it("right after the release the block still holds, so a hand that lets go while open doesn't fire at once", () => {
    const c = new Chain("pinch");
    c.show(500, [{ hand: "Right", shape: "Closed_Fist", palm: RIGHT_SIDE, pinchRatio: 0.1 }]);
    c.show(COMMANDS.suppressCooldownMs, [{ hand: "Right", shape: "Closed_Fist", palm: RIGHT_SIDE, pinchRatio: 0.9 }]);
    expect(c.fires).toEqual([]);
  });
});

describe("two-hand clutch (left open palm starts the grab)", () => {
  const modifier: TestHand = { hand: "Left", shape: "Open_Palm", palm: LEFT_SIDE };
  const steering = (tiltDeg = 0, shape = "None"): TestHand => ({ hand: "Right", shape, palm: RIGHT_SIDE, tiltDeg });

  it("the modifier's open palm never toggles play/pause, even with a whole-frame box and for seconds", () => {
    const c = new Chain("twoHand", { Left: PRESETS.whole, Right: PRESETS.whole });
    c.show(4000, [modifier, steering(0, "Open_Palm")]);
    expect(c.knob.grabbed).toBe(true);
    expect(c.fires).toEqual([]);
    expect(c.grabbedFrames).toBeGreaterThan(100);
  });

  it("the test has teeth: without suppression a modifier V fires its mark", () => {
    const c = new Chain("twoHand", { Left: PRESETS.whole, Right: PRESETS.whole }, false);
    c.show(4000, [{ ...modifier, shape: "Victory" }, steering()]);
    expect(c.fires.length).toBeGreaterThan(0);
  });

  it("R4c: with two-hand selected the left hand still MARKS when the right hand is not steering (V = IN, index = OUT)", () => {
    const c = new Chain("twoHand");
    c.show(2000, [{ hand: "Left", shape: "Victory", palm: LEFT_SIDE }]);
    expect(c.fires.map((f) => `${f.hand} ${f.shape}`)).toEqual(["Left Victory"]);
    expect(suppressFor("twoHand", false, null)).toEqual({ Left: false, Right: false });
    expect(suppressFor("twoHand", true, "Right")).toEqual({ Left: true, Right: true });
  });

  it("the hand opposite the modifier steers, and tilting it moves the value; tilting the modifier does nothing", () => {
    const c = new Chain("twoHand");
    c.show(300, [modifier, steering(0)]);
    expect(c.knob.grabbed).toBe(true);
    c.show(1000, [{ ...modifier, tiltDeg: -60 }, steering(0)]);
    expect(c.moved).toBe(0);
    c.show(1000, [modifier, steering(50)]);
    expect(c.moved).toBeGreaterThan(0.5);
  });

  it("if the modifier hand is lost the value freezes, and everything releases after the grace", () => {
    const c = new Chain("twoHand");
    c.show(300, [modifier, steering(0)]);
    c.show(300, [modifier, steering(50)]);
    const moved = c.moved;
    c.show(150, [steering(50)]); // one hand only: which is which is unknown
    expect(c.knob.grabbed).toBe(true);
    expect(c.moved).toBe(moved);
    c.show(400, [steering(50)]);
    expect(c.knob.grabbed).toBe(false);
  });
});

describe("which hand may grab (right-hand grab must start in the right-hand box)", () => {
  it("a claw made by the LEFT hand is not a knob grab (the left hand marks)", () => {
    const c = new Chain("claw");
    c.show(300, [{ hand: "Left", shape: "None", palm: LEFT_SIDE, clawExt: 1.95 }]);
    c.show(2000, [{ hand: "Left", shape: "None", palm: LEFT_SIDE, clawExt: 1.45, tiltDeg: 40 }]);
    expect(c.knob.grabbed).toBe(false);
    expect(c.moved).toBe(0);
  });

  it("a right-hand claw made outside the RIGHT-hand box (in the left half) never grabs", () => {
    const c = new Chain("claw");
    c.show(300, [{ hand: "Right", shape: "None", palm: LEFT_SIDE, clawExt: 1.95 }]);
    c.show(1500, [{ hand: "Right", shape: "None", palm: LEFT_SIDE, clawExt: 1.45 }]);
    expect(c.knob.grabbed).toBe(false);
  });

  it("moving the right-hand box moves where a grab may start", () => {
    const c = new Chain("claw", { Left: PRESETS.left, Right: PRESETS.left });
    c.show(300, [{ hand: "Right", shape: "None", palm: LEFT_SIDE, clawExt: 1.95 }]);
    c.show(500, [{ hand: "Right", shape: "None", palm: LEFT_SIDE, clawExt: 1.45 }]);
    expect(c.knob.grabbed).toBe(true);
  });

  it("once grabbed the hand may leave the box and keeps steering", () => {
    const c = new Chain("claw");
    c.show(300, [open()]);
    c.show(300, [{ hand: "Right", shape: "None", palm: RIGHT_SIDE, clawExt: 1.45, tiltDeg: 0 }]);
    expect(c.knob.grabbed).toBe(true);
    c.show(1000, [{ hand: "Right", shape: "None", palm: LEFT_SIDE, clawExt: 1.45, tiltDeg: 50 }]); // outside the box, tilted
    expect(c.knob.grabbed).toBe(true);
    expect(c.moved).toBeGreaterThan(0.2);
  });

  it("dropout while grabbed: the value freezes, then everything releases after the grace", () => {
    const c = new Chain("pinch");
    c.show(300, [{ hand: "Right", shape: "None", palm: RIGHT_SIDE, pinchRatio: 0.1, tiltDeg: 0 }]);
    c.show(500, [{ hand: "Right", shape: "None", palm: RIGHT_SIDE, pinchRatio: 0.1, tiltDeg: 45 }]);
    const moved = c.moved;
    expect(moved).toBeGreaterThan(0);
    c.show(CLUTCH.releaseGraceMs - 80, []);
    expect(c.knob.grabbed).toBe(true);
    expect(c.moved).toBe(moved);
    c.show(300, []);
    expect(c.knob.grabbed).toBe(false);
    expect(c.moved).toBe(moved);
  });
});

describe("the knob is target-agnostic", () => {
  it("the same turn produces the same movement whichever target it is for (scaled per target), and names its target", () => {
    const run = (target: KnobTarget) => {
      const c = new Chain("pinch", DEFAULT_BOXES, true, target);
      c.show(300, [{ hand: "Right", shape: "None", palm: RIGHT_SIDE, pinchRatio: 0.1, tiltDeg: 0 }]);
      c.show(1000, [{ hand: "Right", shape: "None", palm: RIGHT_SIDE, pinchRatio: 0.1, tiltDeg: 45 }]);
      return c;
    };
    const play = run("playhead");
    const start = run("start");
    const end = run("end");
    expect(start.moved).toBeCloseTo(end.moved, 6);
    expect(play.moved / start.moved).toBeCloseTo(KNOB.targetScale.playhead / KNOB.targetScale.start, 2);
    expect([play.knob.grabbed, start.knob.grabbed, end.knob.grabbed]).toEqual([true, true, true]);
  });
});
