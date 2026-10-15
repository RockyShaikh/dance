import { describe, expect, it } from "vitest";
import { makeHand, shapes } from "../test/fixtures";
import { Trace, PushSignals, armOfHand, forearmRatio, handSizePx, levelOf, sizeRatio, wristDepthM, type Level, type PushInput } from "./pushSignals";
import { sceneFrame, type Scene } from "./simScene";
import { trajectory } from "./trajectories";

const W = 1280;
const H = 720;

const scene = (o: Partial<Scene> & { wrist: Scene["wrist"] }): Scene => ({ bodyDist: 3, shoulderY: 0.55, ...o });

describe("palm size", () => {
  const norm = (pts: { x: number; y: number }[]) => pts.map((p) => ({ x: p.x / W, y: p.y / H, z: 0, visibility: 1 }));

  it("scales with the hand: 10% bigger hand = 10% bigger size", () => {
    const a = handSizePx(norm(shapes.openPalm("Right", { scale: 2 })), W, H);
    const b = handSizePx(norm(shapes.openPalm("Right", { scale: 2.2 })), W, H);
    expect(b / a).toBeCloseTo(1.1, 3);
    expect(sizeRatio(b, a)).toBeCloseTo(0.1, 3);
  });

  it("holds up when the palm turns edge-on (the width collapses, the length does not)", () => {
    const flat = handSizePx(norm(makeHand({ hand: "Right", fingers: { T: true, I: true, M: true, R: true, P: true }, scale: 2 })), W, H);
    const edge = handSizePx(norm(makeHand({ hand: "Right", fingers: { T: true, I: true, M: true, R: true, P: true }, scale: 2, yawDeg: 85 })), W, H);
    expect(edge / flat).toBeGreaterThan(0.85);
  });

  it("sizeRatio needs a baseline", () => {
    expect(sizeRatio(10, null)).toBeNull();
    expect(sizeRatio(10, 0)).toBeNull();
  });
});

describe("forearm foreshortening and depth, from the scene's pose", () => {
  const arm = (z: number) => {
    const f = sceneFrame(scene({ wrist: { x: 0.05, y: 0.45, z } }));
    return { f, side: armOfHand(f.pose, { x: 1 - f.hands[0].palm!.x, y: f.hands[0].palm!.y }, W, H) };
  };

  it("pairs the hand with the nearest pose wrist, whichever way the model labels the sides", () => {
    const { side } = arm(0);
    expect(side).toBe("left"); // the scene puts the active arm in the model's index-15 slot
    expect(armOfHand(null, { x: 0.5, y: 0.5 }, W, H)).toBeNull();
    // A hand nowhere near either wrist belongs to no arm.
    const f = sceneFrame(scene({ wrist: { x: 0.05, y: 0.55, z: 0 } }));
    expect(armOfHand(f.pose, { x: 0.02, y: 0.95 }, W, H)).toBeNull();
  });

  it("the forearm shortens in 2D as the wrist comes toward the camera, with the shoulder width unchanged", () => {
    // The scripted push (elbow fixed, the forearm swinging forward from nearly upright): at rest and held at the far end.
    const push = trajectory("push", { dist: 3 });
    const f0 = sceneFrame(push.at(0));
    const f1 = sceneFrame(push.at(1.35));
    const r0 = forearmRatio(f0.pose, "left", W, H)!;
    const r1 = forearmRatio(f1.pose, "left", W, H)!;
    expect(r0).toBeGreaterThan(0.3);
    expect(r1).toBeLessThan(r0 * 0.85);
  });

  it("the forearm ratio does not change when the whole body just moves nearer (a walk, not a push)", () => {
    const near = sceneFrame(scene({ bodyDist: 2, wrist: { x: 0.05, y: 0.55, z: 0 } }));
    const far = sceneFrame(scene({ bodyDist: 4, wrist: { x: 0.05, y: 0.55, z: 0 } }));
    expect(forearmRatio(near.pose, "left", W, H)!).toBeCloseTo(forearmRatio(far.pose, "left", W, H)!, 1);
    // ...but the hand's size in pixels does grow: that is what the walk-vs-push separation has to cope with.
    expect(near.truth.handPx / far.truth.handPx).toBeCloseTo(2, 1);
  });

  it("wrist depth: the pose world z against the shoulders goes negative as the hand reaches out", () => {
    const d0 = wristDepthM(arm(0).f.world, "left")!;
    const d1 = wristDepthM(arm(0.3).f.world, "left")!;
    expect(d0).toBeCloseTo(0, 2);
    expect(d1).toBeCloseTo(-0.3, 2);
    expect(wristDepthM(null, "left")).toBeNull();
  });

  it("returns null when the points are unseen", () => {
    const f = sceneFrame(scene({ wrist: { x: 0.05, y: 0.55, z: 0 } }));
    const pose = f.pose.map((p, i) => (i === 13 ? { ...p, visibility: 0.05 } : p));
    expect(forearmRatio(pose, "left", W, H)).toBeNull();
    expect(forearmRatio(null, "left", W, H)).toBeNull();
  });
});

describe("level from the pose", () => {
  const levelAt = (y: number, extra: Partial<Scene> = {}): Level | null => {
    const f = sceneFrame(scene({ wrist: { x: 0.05, y, z: 0 }, ...extra }));
    return levelOf(f.pose, "left", W, H);
  };

  it("above the head, head, chest, below", () => {
    expect(levelAt(0.7)).toBe("above");
    expect(levelAt(0.25)).toBe("head");
    expect(levelAt(-0.2)).toBe("chest");
    expect(levelAt(-0.7)).toBe("below");
  });

  it("is the same at any distance (units are shoulder widths)", () => {
    for (const dist of [2, 3, 5]) {
      expect(levelAt(0.7, { bodyDist: dist })).toBe("above");
      expect(levelAt(-0.2, { bodyDist: dist })).toBe("chest");
    }
  });

  it("uses a torso estimate when the hips are out of view", () => {
    const f = sceneFrame(scene({ wrist: { x: 0.05, y: -0.4, z: 0 } }));
    const noHips = f.pose.map((p, i) => (i === 23 || i === 24 ? { ...p, visibility: 0 } : p));
    expect(levelOf(noHips, "left", W, H)).toBe("chest");
  });

  it("is null without a pose or a visible wrist", () => {
    expect(levelOf(null, "left", W, H)).toBeNull();
    const f = sceneFrame(scene({ wrist: { x: 0.05, y: 0.5, z: 0 } }));
    expect(levelOf(f.pose.map((p, i) => (i === 15 ? { ...p, visibility: 0 } : p)), "left", W, H)).toBeNull();
  });
});

describe("Trace", () => {
  it("interpolates and says null beyond its history", () => {
    const tr = new Trace();
    tr.push(0, 0);
    tr.push(100, 10);
    expect(tr.valueAt(50)).toBeCloseTo(5);
    expect(tr.valueAt(-1)).toBeNull();
    expect(tr.valueAt(101)).toBeNull();
  });

  it("starts over after a gap", () => {
    const tr = new Trace(2000, 300);
    tr.push(0, 1);
    tr.push(100, 2);
    tr.push(1000, 3);
    expect(tr.length).toBe(1);
    expect(tr.valueAt(100)).toBeNull();
  });
});

describe("PushSignals", () => {
  const frame = (t: number, o: Partial<PushInput> = {}): PushInput => ({ t, size: 100, center: { x: 600, y: 200 }, forearm: 0.6, depthM: 0, ...o });

  it("has no signal until a window of history exists, then reads the change over ~250 ms", () => {
    const s = new PushSignals();
    let last = s.step(frame(0));
    expect(last.a).toBeNull();
    for (let t = 33; t <= 500; t += 33) last = s.step(frame(t));
    expect(last.a).toBeCloseTo(0, 5);
    // 20% growth within 250 ms.
    for (let t = 533; t <= 783; t += 33) last = s.step(frame(t, { size: 100 + ((t - 500) / 250) * 20, forearm: 0.6 * (1 - ((t - 500) / 250) * 0.3), depthM: -((t - 500) / 250) * 0.25 }));
    expect(last.a).toBeGreaterThan(0.1);
    expect(last.b).toBeGreaterThan(0.1);
    expect(last.c).toBeGreaterThan(0.1);
    expect(last.d).toBeGreaterThan(0.8);
  });

  it("a slow drift of the same total size change reads far lower than a fast one", () => {
    const s = new PushSignals();
    let last = s.step(frame(0));
    for (let t = 33; t <= 3000; t += 33) last = s.step(frame(t, { size: 100 + (t / 3000) * 20 }));
    expect(last.a!).toBeLessThan(0.03);
  });

  it("reports the palm's travel in hand sizes", () => {
    const s = new PushSignals();
    let last = s.step(frame(0));
    for (let t = 33; t <= 600; t += 33) last = s.step(frame(t, { center: { x: 600 + t * 0.4, y: 200 } }));
    // 0.4 px/ms * 250 ms = 100 px = 1 hand size.
    expect(last.lateral).toBeCloseTo(1, 1);
  });

  it("leaves missing inputs null and the combined score from what there is", () => {
    const s = new PushSignals();
    let last = s.step(frame(0, { forearm: null, depthM: null }));
    for (let t = 33; t <= 500; t += 33) last = s.step(frame(t, { forearm: null, depthM: null, size: 100 + (t / 500) * 40 }));
    expect(last.b).toBeNull();
    expect(last.c).toBeNull();
    expect(last.d).not.toBeNull();
  });
});
