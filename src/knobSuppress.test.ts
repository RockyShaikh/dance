import { describe, expect, it } from "vitest";
import { PRESETS, type Box, type Vec2 } from "./box";
import { initialClutchState, stepClutches, type ClutchHand } from "./clutch";
import { INITIAL_STATE, stepCommands, type FireEvent, type HandObs } from "./commands";
import { CLUTCH, COMMANDS, KNOB, type ClutchKind } from "./config";
import type { Handedness } from "./hand";
import { IDLE_KNOB, stepKnob, type KnobChoice } from "./knob";
import { selectClutch, type KnobHand } from "./knobClutch";

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
 * The same chain main.ts runs each frame, with the real modules: clutch detectors -> knob clutch pick ->
 * knob -> command classifier (suppressed while grabbed).
 */
class Chain {
  clutch = initialClutchState();
  knob = IDLE_KNOB;
  machine = INITIAL_STATE;
  t = 0;
  fires: FireEvent[] = [];
  grabbedFrames = 0;
  moved = 0;
  constructor(
    public kind: ClutchKind,
    public box: Box = PRESETS.right,
    public suppress = true,
  ) {}

  show(ms: number, hands: readonly TestHand[]): void {
    const end = this.t + ms;
    const choice: KnobChoice = { clutch: this.kind, motion: "tilt", mapping: "joystick", gain: 1, deadZoneDeg: 12, invert: false };
    while (this.t < end) {
      this.t += FRAME;
      const c = stepClutches(
        this.clutch,
        {
          t: this.t,
          box: this.box,
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
      const obs: HandObs[] = hands.map((h) => ({ shape: h.shape, shapeScore: 0.95, palmFacing: true, palm: h.palm }));
      const r = stepCommands(this.machine, { t: this.t, hands: obs, box: this.box, suppress: this.suppress && grabbed }, COMMANDS);
      this.machine = r.state;
      if (r.fired) this.fires.push(r.fired);
    }
  }
}

describe("commands are suppressed while the knob is grabbed", () => {
  it("two-hand: the modifier's open palm never toggles play/pause, even with the box covering the whole frame", () => {
    const c = new Chain("twoHand", PRESETS.whole);
    const modifier: TestHand = { hand: "Left", shape: "Open_Palm", palm: LEFT_SIDE };
    const steering: TestHand = { hand: "Right", shape: "Open_Palm", palm: RIGHT_SIDE, tiltDeg: 0 };
    c.show(4000, [modifier, steering]); // far longer than the 0.6 s dwell
    expect(c.knob.grabbed).toBe(true);
    expect(c.fires).toEqual([]);
    expect(c.grabbedFrames).toBeGreaterThan(100);
  });

  it("the test has teeth: without suppression the same hands DO fire an open palm", () => {
    const c = new Chain("twoHand", PRESETS.whole, false);
    // One hand shows the palm and nothing is grabbed yet (the two-hand clutch needs both hands).
    c.show(1000, [{ hand: "Left", shape: "Open_Palm", palm: RIGHT_SIDE }]);
    expect(c.fires.length).toBe(1);
    const d = new Chain("twoHand", PRESETS.whole, false);
    d.show(4000, [
      { hand: "Left", shape: "Open_Palm", palm: LEFT_SIDE },
      { hand: "Right", shape: "None", palm: RIGHT_SIDE },
    ]);
    expect(d.knob.grabbed).toBe(true);
    expect(d.fires.length).toBeGreaterThan(0); // the modifier palm fired: this is what suppression prevents
    const e = new Chain("twoHand", PRESETS.whole, true);
    e.show(4000, [
      { hand: "Left", shape: "Open_Palm", palm: LEFT_SIDE },
      { hand: "Right", shape: "None", palm: RIGHT_SIDE },
    ]);
    expect(e.fires).toEqual([]);
  });

  it("claw: a claw that the recognizer reads as an open palm (or a V) does not fire while turning", () => {
    for (const shape of ["Open_Palm", "Victory", "Pointing_Up"]) {
      const c = new Chain("claw");
      c.show(300, [{ hand: "Right", shape: "None", palm: RIGHT_SIDE, clawExt: 1.95 }]); // open
      c.show(3000, [{ hand: "Right", shape, palm: RIGHT_SIDE, clawExt: 1.45 }]); // curled in: grabbed
      expect(c.knob.grabbed).toBe(true);
      expect(c.fires).toEqual([]);
    }
  });

  it("pinch: an index-up hand pinching does not fire", () => {
    const c = new Chain("pinch");
    c.show(3000, [{ hand: "Right", shape: "Pointing_Up", palm: RIGHT_SIDE, pinchRatio: 0.1 }]);
    expect(c.knob.grabbed).toBe(true);
    expect(c.fires).toEqual([]);
  });

  it("a ring that was filling when the grab began is dropped, not fired", () => {
    const c = new Chain("pinch");
    c.show(400, [{ hand: "Right", shape: "Victory", palm: RIGHT_SIDE, pinchRatio: 0.9 }]); // ring filling
    expect(c.machine.phase).toBe("dwell");
    c.show(1500, [{ hand: "Right", shape: "Victory", palm: RIGHT_SIDE, pinchRatio: 0.1 }]); // now pinching too
    expect(c.fires).toEqual([]);
    expect(c.machine.phase).toBe("idle");
  });

  it("an armed tap is discarded, not fired, when the grab begins", () => {
    const c = new Chain("pinch");
    c.show(800, [{ hand: "Right", shape: "Victory", palm: RIGHT_SIDE, pinchRatio: 0.9 }]); // ring full, armed (tap on release)
    expect(c.machine.phase).toBe("armed");
    c.show(100, [{ hand: "Right", shape: "Victory", palm: RIGHT_SIDE, pinchRatio: 0.1 }]); // grabbed
    c.show(2500, []); // hand gone: the grab releases after the grace, and the tap must not fire
    expect(c.fires).toEqual([]);
  });

  it("commands work again after the grab ends, once the short block has passed", () => {
    const c = new Chain("pinch");
    c.show(1000, [{ hand: "Right", shape: "Open_Palm", palm: RIGHT_SIDE, pinchRatio: 0.1 }]);
    expect(c.fires).toEqual([]);
    c.show(1000, []); // let go
    expect(c.knob.grabbed).toBe(false);
    c.show(1500, [{ hand: "Right", shape: "Open_Palm", palm: RIGHT_SIDE }]);
    expect(c.fires.map((f) => f.shape)).toEqual(["Open_Palm"]);
  });

  it("right after the release the block still holds, so a hand that lets go while open doesn't fire at once", () => {
    const c = new Chain("pinch");
    c.show(500, [{ hand: "Right", shape: "Open_Palm", palm: RIGHT_SIDE, pinchRatio: 0.1 }]);
    // The pinch opens: the hand is now a plain open palm. It must not fire within suppressCooldownMs + dwell.
    c.show(COMMANDS.suppressCooldownMs, [{ hand: "Right", shape: "Open_Palm", palm: RIGHT_SIDE, pinchRatio: 0.9 }]);
    expect(c.fires).toEqual([]);
  });
});

describe("grab rules (through R2's detectors)", () => {
  it("a grab must start in the command box: a claw made outside it never grabs", () => {
    const c = new Chain("claw");
    c.show(300, [{ hand: "Right", shape: "None", palm: LEFT_SIDE, clawExt: 1.95 }]);
    c.show(1500, [{ hand: "Right", shape: "None", palm: LEFT_SIDE, clawExt: 1.45 }]);
    expect(c.knob.grabbed).toBe(false);
  });

  it("once grabbed the hand may leave the box and keeps steering", () => {
    const c = new Chain("claw");
    c.show(300, [{ hand: "Right", shape: "None", palm: RIGHT_SIDE, clawExt: 1.95 }]);
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

  it("two-hand: the hand opposite the modifier steers, and tilting it moves the value", () => {
    const c = new Chain("twoHand");
    const modifier: TestHand = { hand: "Left", shape: "Open_Palm", palm: LEFT_SIDE };
    c.show(300, [modifier, { hand: "Right", shape: "None", palm: RIGHT_SIDE, tiltDeg: 0 }]);
    expect(c.knob.grabbed).toBe(true);
    // Turning the MODIFIER hand does nothing.
    c.show(1000, [{ ...modifier, tiltDeg: -60 }, { hand: "Right", shape: "None", palm: RIGHT_SIDE, tiltDeg: 0 }]);
    expect(c.moved).toBe(0);
    c.show(1000, [modifier, { hand: "Right", shape: "None", palm: RIGHT_SIDE, tiltDeg: 50 }]);
    expect(c.moved).toBeGreaterThan(0.5);
  });

  it("two-hand: if the modifier hand is lost the value freezes, and everything releases after the grace", () => {
    const c = new Chain("twoHand");
    const modifier: TestHand = { hand: "Left", shape: "Open_Palm", palm: LEFT_SIDE };
    c.show(300, [modifier, { hand: "Right", shape: "None", palm: RIGHT_SIDE, tiltDeg: 0 }]);
    c.show(300, [modifier, { hand: "Right", shape: "None", palm: RIGHT_SIDE, tiltDeg: 50 }]);
    const moved = c.moved;
    c.show(150, [{ hand: "Right", shape: "None", palm: RIGHT_SIDE, tiltDeg: 50 }]); // one hand only: which is which is unknown
    expect(c.knob.grabbed).toBe(true);
    expect(c.moved).toBe(moved);
    c.show(400, [{ hand: "Right", shape: "None", palm: RIGHT_SIDE, tiltDeg: 50 }]);
    expect(c.knob.grabbed).toBe(false);
  });
});
