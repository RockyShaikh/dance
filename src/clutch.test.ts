import { describe, expect, it } from "vitest";
import type { Box, Vec2 } from "./box";
import { PRESETS } from "./box";
import { initialClutchState, stepClutches, type ClutchHand, type ClutchState, type ClutchView } from "./clutch";
import { CLUTCH, type ClutchConfig } from "./config";
import { LM, type Handedness, type Point3 } from "./hand";
import { clawExtension, othersReach, palmCentre, pinchRatio } from "./handFeatures";
import { chord, makeHand, shapes } from "./test/fixtures";

const FRAME = 33;
const INSIDE: Vec2 = { x: 0.75, y: 0.5 };
const OUTSIDE: Vec2 = { x: 0.25, y: 0.5 };

function ch(hand: Handedness, o: Partial<ClutchHand> = {}): ClutchHand {
  return { hand, shape: "None", palm: INSIDE, pinchRatio: 0.9, clawExt: 1.9, othersReach: 1.9, ...o };
}

class Bench {
  state: ClutchState = initialClutchState();
  t = 0;
  view!: ClutchView;
  constructor(
    public cfg: ClutchConfig = CLUTCH,
    public box: Box = PRESETS.right,
  ) {}
  show(ms: number, hands: readonly ClutchHand[] | ((elapsed: number) => readonly ClutchHand[]) = []): void {
    const start = this.t;
    const end = start + ms;
    while (this.t < end) {
      this.t += FRAME;
      const list = typeof hands === "function" ? hands(this.t - start) : hands;
      const r = stepClutches(this.state, { t: this.t, hands: list, box: this.box }, this.cfg);
      this.state = r.state;
      this.view = r.view;
    }
  }
}

describe("pinch", () => {
  it("is grabbed when thumb and index tips are close and released when clearly open", () => {
    const b = new Bench();
    b.show(200, [ch("Right")]);
    expect(b.view.pinch).toBeNull();
    b.show(200, [ch("Right", { pinchRatio: 0.1 })]);
    expect(b.view.pinch).toBe("Right");
    b.show(200, [ch("Right", { pinchRatio: 0.9 })]);
    expect(b.view.pinch).toBeNull();
  });

  it("has hysteresis: wobbling just above the grab threshold stays grabbed, it must clearly open", () => {
    const b = new Bench();
    b.show(200, [ch("Right", { pinchRatio: 0.1 })]);
    b.show(200, [ch("Right", { pinchRatio: CLUTCH.pinch.grabRatio + 0.1 })]);
    expect(b.view.pinch).toBe("Right");
    b.show(200, [ch("Right", { pinchRatio: CLUTCH.pinch.grabRatio * CLUTCH.pinch.releaseFactor + 0.05 })]);
    expect(b.view.pinch).toBeNull();
  });

  it("the threshold slider moves where a grab begins", () => {
    const loose = new Bench({ ...CLUTCH, pinch: { ...CLUTCH.pinch, grabRatio: 0.5 } });
    loose.show(200, [ch("Right", { pinchRatio: 0.4 })]);
    expect(loose.view.pinch).toBe("Right");
    const tight = new Bench({ ...CLUTCH, pinch: { ...CLUTCH.pinch, grabRatio: 0.15 } });
    tight.show(200, [ch("Right", { pinchRatio: 0.2 })]);
    expect(tight.view.pinch).toBeNull();
  });

  it("must start inside the box, but may leave it once grabbed", () => {
    const b = new Bench();
    b.show(300, [ch("Right", { pinchRatio: 0.1, palm: OUTSIDE })]);
    expect(b.view.pinch).toBeNull();
    b.show(300, [ch("Right", { pinchRatio: 0.1, palm: INSIDE })]);
    expect(b.view.pinch).toBe("Right");
    b.show(300, [ch("Right", { pinchRatio: 0.1, palm: OUTSIDE })]);
    expect(b.view.pinch).toBe("Right");
  });

  it("losing the hand holds the grab briefly, then releases", () => {
    const b = new Bench();
    b.show(200, [ch("Right", { pinchRatio: 0.1 })]);
    b.show(CLUTCH.releaseGraceMs - 100, []);
    expect(b.view.pinch).toBe("Right");
    b.show(300, []);
    expect(b.view.pinch).toBeNull();
  });

  it("tracks the pinching hand, not the other one", () => {
    const b = new Bench();
    b.show(200, [ch("Left", { pinchRatio: 0.9 }), ch("Right", { pinchRatio: 0.1 })]);
    expect(b.view.pinch).toBe("Right");
  });
});

describe("claw", () => {
  const open = ch("Right", { clawExt: 1.9 });
  const claw = ch("Right", { clawExt: 1.45 });
  const fist = ch("Right", { clawExt: 1.0 });

  it("an open hand that curls halfway is grabbed", () => {
    const b = new Bench();
    b.show(300, [open]);
    expect(b.view.claw).toBeNull();
    b.show(300, [claw]);
    expect(b.view.claw).toBe("Right");
  });

  it("stays grabbed while half-curled and releases when it opens or closes to a fist", () => {
    const b = new Bench();
    b.show(200, [open]);
    b.show(2000, [claw]); // far longer than the open-to-claw window
    expect(b.view.claw).toBe("Right");
    b.show(200, [open]);
    expect(b.view.claw).toBeNull();

    const c = new Bench();
    c.show(200, [open]);
    c.show(200, [claw]);
    c.show(200, [fist]);
    expect(c.view.claw).toBeNull();
  });

  it("a half-curled hand that was not just open is not a grab (no open-to-claw curl)", () => {
    const b = new Bench();
    b.show(2000, [claw]);
    expect(b.view.claw).toBeNull();
  });

  it("an open hand closing to a fist skipping through the claw band quickly is not held as a grab", () => {
    const b = new Bench();
    b.show(200, [open]);
    b.show(200, [fist]);
    expect(b.view.claw).toBeNull();
  });

  it("the curl must follow the open hand within the window", () => {
    const b = new Bench();
    b.show(200, [open]);
    b.show(CLUTCH.claw.openToClawMs + 300, [fist]); // closed for a while: not a curl from open
    b.show(200, [claw]);
    expect(b.view.claw).toBeNull();
  });

  it("must start inside the box", () => {
    const b = new Bench();
    b.show(200, [{ ...open, palm: OUTSIDE }]);
    b.show(300, [{ ...claw, palm: OUTSIDE }]);
    expect(b.view.claw).toBeNull();
  });

  it("is not triggered by a pinch of an otherwise open hand", () => {
    const b = new Bench();
    b.show(500, [ch("Right", { clawExt: 1.9, pinchRatio: 0.05 })]);
    expect(b.view.claw).toBeNull();
    expect(b.view.pinch).toBe("Right");
  });
});

describe("two-hand modifier", () => {
  const modifier = (x: number): ClutchHand => ch("Left", { shape: "Open_Palm", palm: { x, y: 0.5 } });
  const steering = (x: number, shape = "None"): ClutchHand => ch("Right", { shape, palm: { x, y: 0.5 } });

  it("grabbed when the screen-left hand is an open palm and the other hand is in the box", () => {
    const b = new Bench();
    b.show(200, [modifier(0.2), steering(0.75)]);
    expect(b.view.twoHand).toBe(true);
  });

  it("not grabbed with just one hand, or with the modifier showing another shape", () => {
    const b = new Bench();
    b.show(200, [modifier(0.2)]);
    expect(b.view.twoHand).toBe(false);
    b.show(200, [ch("Left", { shape: "Victory", palm: { x: 0.2, y: 0.5 } }), steering(0.75)]);
    expect(b.view.twoHand).toBe(false);
  });

  it("tells the hands apart by screen side, not by the model's left/right label", () => {
    const b = new Bench();
    // both labelled "Right" (the model can flip): still the left-of-screen one is the modifier
    const left = ch("Right", { shape: "Open_Palm", palm: { x: 0.2, y: 0.5 } });
    const right = ch("Left", { shape: "None", palm: { x: 0.75, y: 0.5 } });
    b.show(200, [right, left]);
    expect(b.view.twoHand).toBe(true);
  });

  it("an open palm on the wrong side of the screen is not the modifier", () => {
    const b = new Bench();
    b.show(200, [steering(0.2), ch("Left", { shape: "Open_Palm", palm: { x: 0.75, y: 0.5 } })]);
    expect(b.view.twoHand).toBe(false);
  });

  it("modifier side is configurable", () => {
    const b = new Bench({ ...CLUTCH, twoHand: { ...CLUTCH.twoHand, modifierSide: "right" } }, PRESETS.left);
    b.show(200, [steering(0.2), ch("Left", { shape: "Open_Palm", palm: { x: 0.9, y: 0.5 } })]);
    expect(b.view.twoHand).toBe(true);
  });

  it("the steering hand must start in the box, but may leave it afterwards", () => {
    const b = new Bench();
    b.show(200, [modifier(0.1), steering(0.4)]); // steering hand outside the right-half box
    expect(b.view.twoHand).toBe(false);
    b.show(200, [modifier(0.1), steering(0.8)]);
    expect(b.view.twoHand).toBe(true);
    b.show(200, [modifier(0.1), steering(0.4)]);
    expect(b.view.twoHand).toBe(true);
  });

  it("releases when the modifier hand drops, after the grace", () => {
    const b = new Bench();
    b.show(200, [modifier(0.2), steering(0.75)]);
    b.show(CLUTCH.releaseGraceMs - 100, [steering(0.75)]);
    expect(b.view.twoHand).toBe(true);
    b.show(300, [steering(0.75)]);
    expect(b.view.twoHand).toBe(false);
  });
});

describe("two-hand steering wheel (R4c): the modifier's shape picks the mode and must not let go", () => {
  const left = (steerShape: ClutchHand["steerShape"], shape = "None"): ClutchHand => ch("Left", { shape, steerShape, palm: { x: 0.2, y: 0.5 } });
  const right = (x = 0.75): ClutchHand => ch("Right", { palm: { x, y: 0.5 } });

  it("a grab starts only with the palm: V, index or fist held up do not grab", () => {
    for (const shape of ["v", "index", "fist", null] as const) {
      const b = new Bench();
      b.show(400, [left(shape), right()]);
      expect(b.view.twoHand).toBe(false);
    }
    const b = new Bench();
    b.show(100, [left("palm"), right()]);
    expect(b.view.twoHand).toBe(true);
  });

  it("once grabbed it holds through palm, fist, V and index, in any order, with no release", () => {
    const b = new Bench();
    b.show(100, [left("palm"), right()]);
    for (const shape of ["fist", "palm", "v", "index", "fist", "v", "palm"] as const) {
      b.show(600, [left(shape), right()]);
      expect(b.view.twoHand).toBe(true);
    }
  });

  it("a shape that is none of the four is not 'present': it lets go after the grace period, not before", () => {
    const b = new Bench();
    b.show(100, [left("palm"), right()]);
    b.show(CLUTCH.releaseGraceMs - 100, [left(null), right()]);
    expect(b.view.twoHand).toBe(true);
    b.show(300, [left(null), right()]);
    expect(b.view.twoHand).toBe(false);
  });

  it("a short gap (a fist the model dropped for a few frames) is bridged by the grace", () => {
    const b = new Bench();
    b.show(100, [left("palm"), right()]);
    b.show(150, [left(null), right()]);
    b.show(200, [left("fist"), right()]);
    expect(b.view.twoHand).toBe(true);
  });

  it("without steerShape, only an open palm label counts (R4b callers)", () => {
    const b = new Bench();
    b.show(100, [ch("Left", { shape: "Open_Palm", palm: { x: 0.2, y: 0.5 } }), right()]);
    expect(b.view.twoHand).toBe(true);
  });
});

describe("independence", () => {
  it("pinch, claw and two-hand report separately", () => {
    const b = new Bench();
    b.show(200, [ch("Left", { shape: "Open_Palm", palm: { x: 0.2, y: 0.5 } }), ch("Right", { pinchRatio: 0.05, clawExt: 1.9 })]);
    expect(b.view).toEqual({ pinch: "Right", claw: null, twoHand: true });
  });
});

describe("a fist is not a pinch", () => {
  it("thumb against the index with the other fingers curled does not grab", () => {
    const b = new Bench();
    b.show(500, [ch("Right", { pinchRatio: 0.02, othersReach: 1.05, clawExt: 1.05 })]);
    expect(b.view.pinch).toBeNull();
  });

  it("the same thumb-to-index touch with the other fingers out is a pinch", () => {
    const b = new Bench();
    b.show(200, [ch("Right", { pinchRatio: 0.02, othersReach: 1.8 })]);
    expect(b.view.pinch).toBe("Right");
  });

  it("works on real landmark geometry: a fist with its thumb pressed on the index tip never grabs, a pinching open hand does", () => {
    const W = 1280;
    const H = 720;
    const toHand = (pts: Point3[], hand: Handedness): ClutchHand => ({
      hand,
      shape: "None",
      palm: palmCentre(pts.map((p) => ({ x: p.x / W, y: p.y / H }))),
      pinchRatio: pinchRatio(pts),
      clawExt: clawExtension(pts),
      othersReach: othersReach(pts),
    });
    const touch = (pts: Point3[]): Point3[] => {
      const out = pts.map((p) => ({ ...p }));
      out[LM.THUMB_TIP] = { ...pts[LM.INDEX_TIP] };
      return out;
    };
    // Put the palm inside the right-half box: raw x is mirrored, so draw it at raw x = 400 (display 0.69).
    const at = { x: 400, y: 360 };
    const fist = toHand(touch(shapes.fist("Right", { at })), "Right");
    expect(fist.pinchRatio).toBeLessThan(0.05); // worst case: tips exactly together
    const a = new Bench();
    a.show(1000, [fist]);
    expect(a.view.pinch).toBeNull();

    const pinching = toHand(touch(makeHand({ hand: "Right", fingers: chord("01111"), at })), "Right");
    const b = new Bench();
    b.show(200, [pinching]);
    expect(b.view.pinch).toBe("Right");
  });
});

describe("claw vs a relaxed, half-curled hand (real landmark geometry)", () => {
  const W = 1280;
  const H = 720;
  const at = { x: 400, y: 360 };
  const clawHand = (curl: number): ClutchHand => {
    const pts = makeHand({ hand: "Right", fingers: chord("11111"), curl, at });
    return {
      hand: "Right",
      shape: "None",
      palm: palmCentre(pts.map((p) => ({ x: p.x / W, y: p.y / H }))),
      pinchRatio: pinchRatio(pts),
      clawExt: clawExtension(pts),
      othersReach: othersReach(pts),
    };
  };

  it("a hand that is half-curled from the start (relaxed) never grabs", () => {
    const b = new Bench();
    b.show(3000, [clawHand(0.5)]);
    expect(b.view.claw).toBeNull();
  });

  it("an open hand that then curls halfway grabs, and holds while it stays half-curled", () => {
    const b = new Bench();
    b.show(200, [clawHand(0)]);
    b.show(200, [clawHand(0.5)]);
    expect(b.view.claw).toBe("Right");
    b.show(3000, [clawHand(0.5)]);
    expect(b.view.claw).toBe("Right");
  });

  it("an open hand that relaxes only after a pause does not grab", () => {
    const b = new Bench();
    b.show(200, [clawHand(0)]);
    b.show(CLUTCH.claw.openToClawMs + 500, [clawHand(1)]); // closed to a fist, out of the band
    b.show(500, [clawHand(0.5)]);
    expect(b.view.claw).toBeNull();
  });
});
