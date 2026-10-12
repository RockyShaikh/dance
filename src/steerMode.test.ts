import { describe, expect, it } from "vitest";
import { CLUTCH, STEER } from "./config";
import { clawExtension, othersReach } from "./handFeatures";
import { IDLE_STEER, MODE_OF, classifySteerShape, stepSteerMode, targetOf, type SteerModeState, type SteerShape } from "./steerMode";
import { shapes } from "./test/fixtures";

const FRAME = 33;

describe("classifySteerShape: the left hand as one of the four steering shapes", () => {
  const obs = (shape: string, clawExt = 1.9, shapeScore = 0.9) => ({ shape, shapeScore, clawExt });

  it("takes the model's label for open palm, V and index", () => {
    expect(classifySteerShape(obs("Open_Palm"))).toBe("palm");
    expect(classifySteerShape(obs("Victory", 1.3))).toBe("v");
    expect(classifySteerShape(obs("Pointing_Up", 1.25))).toBe("index");
  });

  it("a weakly scored palm, V or index is nothing (and is not rescued by geometry unless the fingers are curled in)", () => {
    expect(classifySteerShape(obs("Open_Palm", 1.9, STEER.minShapeScore - 0.1))).toBeNull();
    expect(classifySteerShape(obs("Victory", 1.3, 0.2))).toBeNull();
  });

  it("the model's Closed_Fist counts at a lower confidence than the other shapes (it is the weakest label)", () => {
    expect(classifySteerShape(obs("Closed_Fist", 1.0, STEER.minFistScore + 0.05))).toBe("fist");
    expect(classifySteerShape(obs("Closed_Fist", 1.0, STEER.minFistScore - 0.1))).toBe("fist"); // curled fingers: still a fist
    expect(classifySteerShape(obs("Closed_Fist", 1.6, STEER.minFistScore - 0.1))).toBeNull(); // weak label and not curled in
  });

  it("a fist the model labels None (or anything else) still counts when the fingers are curled in", () => {
    expect(classifySteerShape(obs("None", 1.0, 0))).toBe("fist");
    expect(classifySteerShape(obs("Thumb_Up", 1.05))).toBe("fist");
    expect(classifySteerShape(obs("None", 1.45))).toBeNull(); // a claw or relaxed hand is not a fist
    expect(classifySteerShape(obs("None", 1.9))).toBeNull();
  });

  it("the geometry fallback sits below every other shape's reach (the fixture hand's fist is looser than a real one, so it is compared, not thresholded)", () => {
    const reach = clawExtension;
    const fist = reach(shapes.fist("Left"));
    expect(fist).toBeLessThan(reach(shapes.indexUp("Left")) - 0.1);
    expect(fist).toBeLessThan(reach(shapes.victory("Left")));
    expect(fist).toBeLessThan(reach(shapes.openPalm("Left")));
    expect(othersReach(shapes.fist("Left"))).toBeLessThanOrEqual(fist + 0.05);
    // ...and the threshold stays under where a claw begins, so a claw is never a fist.
    expect(STEER.fistMaxReach).toBeLessThan(CLUTCH.claw.minExt);
  });
});

describe("mode and target", () => {
  it("palm and fist both steer the playhead, V = START, index = END", () => {
    expect(MODE_OF).toEqual({ palm: "palm", fist: "fist", v: "start", index: "end" });
    expect([targetOf("palm"), targetOf("fist"), targetOf("start"), targetOf("end")]).toEqual(["playhead", "playhead", "start", "end"]);
  });
});

/** Feeds a shape (or null) each frame for `ms`. */
class Run {
  state: SteerModeState = IDLE_STEER;
  t = 1000;
  modes: (string | null)[] = [];
  changes: string[] = [];
  show(ms: number, shape: SteerShape | null, grabbed = true): void {
    const end = this.t + ms;
    while (this.t < end) {
      this.t += FRAME;
      const r = stepSteerMode(this.state, { t: this.t, grabbed, shape });
      this.state = r.state;
      this.modes.push(r.mode);
      if (r.changed) this.changes.push(String(r.mode));
    }
  }
  get mode() {
    return this.state.mode;
  }
}

describe("stepSteerMode: the debounced mode of a held grab", () => {
  it("the grab first shape sets the mode at once", () => {
    const r = new Run();
    r.show(FRAME, "palm");
    expect(r.mode).toBe("palm");
    expect(r.changes).toEqual(["palm"]);
  });

  it("not grabbed: no mode", () => {
    const r = new Run();
    r.show(500, "palm", false);
    expect(r.mode).toBeNull();
  });

  it("a different shape switches the mode only after it has been stable for the debounce time", () => {
    const r = new Run();
    r.show(300, "palm");
    r.show(STEER.modeDebounceMs - 2 * FRAME, "fist");
    expect(r.mode).toBe("palm"); // not yet
    r.show(3 * FRAME, "fist");
    expect(r.mode).toBe("fist");
    expect(r.changes).toEqual(["palm", "fist"]);
  });

  it("a flicker of fist inside a held palm (1-2 frames) does NOT toggle play / pause", () => {
    const r = new Run();
    r.show(300, "palm");
    for (let i = 0; i < 10; i++) {
      r.show(2 * FRAME, "fist");
      r.show(400, "palm");
    }
    expect(r.changes).toEqual(["palm"]);
    expect(r.mode).toBe("palm");
  });

  it("a flicker of palm inside a held fist does not resume either", () => {
    const r = new Run();
    r.show(300, "palm");
    r.show(400, "fist");
    expect(r.mode).toBe("fist");
    for (let i = 0; i < 10; i++) {
      r.show(FRAME, "palm");
      r.show(400, "fist");
    }
    expect(r.changes).toEqual(["palm", "fist"]);
  });

  it("frames with no usable shape (null: a hand between shapes) keep the mode, and also restart the debounce", () => {
    const r = new Run();
    r.show(300, "palm");
    r.show(400, null);
    expect(r.mode).toBe("palm");
    // fist, a gap, fist: the two stretches do not add up to a switch
    r.show(3 * FRAME, "fist");
    r.show(FRAME, null);
    r.show(3 * FRAME, "fist");
    expect(r.mode).toBe("palm");
    r.show(STEER.modeDebounceMs + 2 * FRAME, "fist");
    expect(r.mode).toBe("fist");
  });

  it("V and index select START / END the same way, and palm <-> fist <-> V <-> index can chain without a release", () => {
    const r = new Run();
    r.show(300, "palm");
    for (const [shape, mode] of [["v", "start"], ["index", "end"], ["fist", "fist"], ["palm", "palm"], ["v", "start"], ["fist", "fist"]] as const) {
      r.show(STEER.modeDebounceMs + 3 * FRAME, shape);
      expect(r.mode).toBe(mode);
    }
    expect(r.modes.every((m) => m !== null)).toBe(true);
  });

  it("letting go resets, and the next grab starts fresh", () => {
    const r = new Run();
    r.show(300, "palm");
    r.show(400, "fist");
    r.show(100, null, false);
    expect(r.mode).toBeNull();
    r.show(FRAME, "palm");
    expect(r.mode).toBe("palm");
  });
});
