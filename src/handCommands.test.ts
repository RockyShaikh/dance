import { describe, expect, it } from "vitest";
import { DEFAULT_BOXES, PRESETS, pickBox, type Box } from "./box";
import { COMMANDS } from "./config";
import type { Handedness } from "./hand";
import { INITIAL_MACHINES, stepHandCommands, type HandCmdObs, type HandFire, type HandMachines } from "./handCommands";
import { readBox } from "./settings";

const FRAME = 33;
const R = { x: 0.75, y: 0.5 };
const L = { x: 0.25, y: 0.5 };
const obs = (hand: Handedness, shape: string, palm = hand === "Right" ? R : L, o: Partial<HandCmdObs> = {}): HandCmdObs => ({ hand, shape, shapeScore: 0.9, palmFacing: true, palm, ...o });

class Bench {
  state: HandMachines = INITIAL_MACHINES;
  t = 0;
  fires: HandFire[] = [];
  views!: ReturnType<typeof stepHandCommands>["views"];
  constructor(public boxes: Record<Handedness, Box> = DEFAULT_BOXES) {}
  show(ms: number, hands: HandCmdObs[], suppress = { Left: false, Right: false }): void {
    const end = this.t + ms;
    while (this.t < end) {
      this.t += FRAME;
      const r = stepHandCommands(this.state, { t: this.t, hands, boxes: this.boxes, suppress }, COMMANDS);
      this.state = r.state;
      this.views = r.views;
      this.fires.push(...r.fired);
    }
  }
}

describe("each fire says which hand made it", () => {
  it("right and left hands are separate classifiers", () => {
    const b = new Bench();
    b.show(900, [obs("Right", "Pointing_Up")]);
    expect(b.fires).toMatchObject([{ hand: "Right", shape: "Pointing_Up" }]);
    b.show(1500, []);
    b.show(900, [obs("Left", "Victory")]);
    expect(b.fires.at(-1)).toMatchObject({ hand: "Left", shape: "Victory" });
  });

  it("a hand's shape never feeds the other hand's ring", () => {
    const b = new Bench();
    b.show(400, [obs("Right", "Victory")]);
    b.show(400, [obs("Left", "Victory")]); // the right hand has gone: the left one starts its own ring from zero
    expect(b.fires).toEqual([]);
    expect(b.views.Left.progress).toBeLessThan(0.8);
  });
});

describe("R5b: the thumbs up is not a command (holding it is a state: holdSpeed.ts)", () => {
  it("a thumbs up, either hand, never fires and never cools anything down", () => {
    const b = new Bench();
    b.show(2000, [obs("Right", "Thumb_Up"), obs("Left", "Thumb_Up")]);
    expect(b.fires).toEqual([]);
    expect(b.views.Left.shape).toBeNull();
    expect(b.views.Right.shape).toBeNull();
    // a right-hand command right away is not blocked by a cooldown
    b.show(900, [obs("Right", "Pointing_Up")]);
    expect(b.fires).toMatchObject([{ hand: "Right", shape: "Pointing_Up" }]);
  });
});

describe("R4d: the fist is the right hand's play / pause; the open palm is nobody's command", () => {
  const FIST = { T: false, I: false, M: false, R: false, P: false };
  it("the right fist fires (palm facing not required)", () => {
    const b = new Bench();
    b.show(900, [obs("Right", "Closed_Fist", R, { palmFacing: false, chord: FIST })]);
    expect(b.fires).toMatchObject([{ hand: "Right", shape: "Closed_Fist" }]);
  });

  it("the LEFT fist is not armed: it never fires and never cools the right hand down", () => {
    const b = new Bench();
    b.show(2000, [obs("Left", "Closed_Fist", L, { chord: FIST })]);
    expect(b.fires).toEqual([]);
    expect(b.views.Left.shape).toBeNull();
    b.show(900, [obs("Right", "Pointing_Up")]);
    expect(b.fires).toMatchObject([{ hand: "Right", shape: "Pointing_Up" }]);
  });

  it("an open palm, either hand, anywhere in its box, however long: nothing (no ring, no command)", () => {
    const b = new Bench();
    b.show(10_000, [obs("Right", "Open_Palm"), obs("Left", "Open_Palm")]);
    expect(b.fires).toEqual([]);
    expect(b.views.Right.progress).toBe(0);
    expect(b.views.Left.progress).toBe(0);
  });

  it("a hand leaving the frame fires nothing", () => {
    const b = new Bench();
    b.show(400, [obs("Right", "Closed_Fist", R, { chord: FIST })]); // a ring part-filled...
    b.show(3000, []); // ...and the hand is gone
    expect(b.fires).toEqual([]);
  });
});

describe("per-hand boxes", () => {
  it("default: the right hand's box is the right half, the left hand's the left half", () => {
    expect(DEFAULT_BOXES.Right).toEqual(PRESETS.right);
    expect(DEFAULT_BOXES.Left).toEqual(PRESETS.left);
  });

  it("each hand is tested against its own box only", () => {
    const b = new Bench();
    b.show(1500, [obs("Right", "Victory", L), obs("Left", "Victory", R)]);
    expect(b.fires).toEqual([]);
    expect(b.views.Right.blocked).toBe("outside box");
    expect(b.views.Left.blocked).toBe("outside box");
  });

  it("the boxes are independent: moving one does not change the other", () => {
    const b = new Bench({ Left: PRESETS.whole, Right: PRESETS.right });
    b.show(1000, [obs("Left", "Victory", R)]); // the left hand's box is the whole frame now
    expect(b.fires).toHaveLength(1);
    const c = new Bench({ Left: PRESETS.whole, Right: PRESETS.right });
    c.show(1000, [obs("Right", "Victory", L)]); // the right hand's box is still the right half
    expect(c.fires).toEqual([]);
  });
});

describe("suppression is per hand", () => {
  it("a suppressed hand never fires, the other still does", () => {
    const b = new Bench();
    b.show(3000, [obs("Right", "Pointing_Up"), obs("Left", "Victory")], { Left: false, Right: true });
    expect(b.fires).toMatchObject([{ hand: "Left", shape: "Victory" }]);
  });

  it("a ring in progress is dropped when suppression starts, and nothing fires on release", () => {
    const b = new Bench();
    b.show(400, [obs("Right", "Victory")]);
    expect(b.views.Right.phase).toBe("dwell");
    b.show(400, [obs("Right", "Victory")], { Left: false, Right: true });
    expect(b.views.Right.phase).toBe("idle");
    b.show(2000, []);
    expect(b.fires).toEqual([]);
  });
});

describe("one command at a time", () => {
  it("when one hand fires, the other cannot START a ring until the cooldown has passed", () => {
    const b = new Bench();
    b.show(700, [obs("Right", "Pointing_Up")]);
    expect(b.fires).toHaveLength(1);
    b.show(COMMANDS.cooldownMs - 300, [obs("Left", "Victory")]);
    expect(b.views.Left.phase).toBe("idle");
    expect(b.fires).toHaveLength(1);
  });
});

describe("pickBox (mouse editing with two boxes)", () => {
  const tol = { x: 0.01, y: 0.01 };
  it("picks the box under the pointer and the part of it", () => {
    expect(pickBox(DEFAULT_BOXES, { x: 0.75, y: 0.5 }, tol)).toEqual({ key: "Right", handle: "move" });
    expect(pickBox(DEFAULT_BOXES, { x: 0.25, y: 0.5 }, tol)).toEqual({ key: "Left", handle: "move" });
    expect(["e", "w"]).toContain(pickBox(DEFAULT_BOXES, { x: 0.5, y: 0.5 }, tol)?.handle); // the shared edge: the left box's right or the right box's left
  });
  it("a corner or edge beats the inside of the other box", () => {
    const boxes = { Left: PRESETS.whole, Right: { x: 0.5, y: 0.2, w: 0.3, h: 0.5 } };
    expect(pickBox(boxes, { x: 0.5, y: 0.45 }, tol)).toEqual({ key: "Right", handle: "w" });
  });
  it("between two insides the smaller box wins (it stays grabbable on top of a bigger one)", () => {
    const boxes = { Left: PRESETS.whole, Right: { x: 0.5, y: 0.2, w: 0.3, h: 0.5 } };
    expect(pickBox(boxes, { x: 0.65, y: 0.45 }, tol)).toEqual({ key: "Right", handle: "move" });
  });
  it("nothing near a box picks nothing", () => {
    expect(pickBox({ Left: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, Right: { x: 0.6, y: 0.6, w: 0.2, h: 0.2 } }, { x: 0.45, y: 0.45 }, tol)).toBeNull();
  });
});

describe("stored boxes", () => {
  it("bad or missing numbers fall back, and the box is forced into the frame", () => {
    expect(readBox(undefined, PRESETS.left)).toEqual(PRESETS.left);
    expect(readBox({ x: 5, y: "no" as unknown as number, w: 0.5 }, PRESETS.right).x).toBeLessThanOrEqual(0.5);
    const b = readBox({ x: 0.9, y: 0, w: 0.5, h: 1 }, PRESETS.right);
    expect(b.x + b.w).toBeLessThanOrEqual(1);
  });
});

describe("loadSettings: one shared zone (R6)", () => {
  it("settings saved before R6 (per-hand boxes, or the older single box) get the default top quarter; sliders carry over", async () => {
    const { vi } = await import("vitest");
    const { loadSettings } = await import("./settings");
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ box: { x: 0.6, y: 0.1, w: 0.3, h: 0.8 }, dwellMs: 800 }) });
    const old = loadSettings();
    expect(old.zone).toEqual(PRESETS.topQuarter);
    expect(old.zoom).toBe(false);
    expect(old.dwellMs).toBe(800);
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ boxes: { Left: { x: 0, y: 0, w: 0.4, h: 1 }, Right: { x: 0.5, y: 0, w: 0.5, h: 0.5 } } }) });
    expect(loadSettings().zone).toEqual(PRESETS.topQuarter);
    vi.unstubAllGlobals();
  });

  it("keeps a stored zone and the zoom switch; a bad zone falls back and is forced into the frame", async () => {
    const { vi } = await import("vitest");
    const { loadSettings } = await import("./settings");
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ zone: { x: 0.1, y: 0.05, w: 0.5, h: 0.3 }, zoom: true }) });
    const s = loadSettings();
    expect(s.zone).toEqual({ x: 0.1, y: 0.05, w: 0.5, h: 0.3 });
    expect(s.zoom).toBe(true);
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ zone: { x: 0.9, y: "no", w: 0.5 }, zoom: "yes" }) });
    const bad = loadSettings();
    expect(bad.zone.x + bad.zone.w).toBeLessThanOrEqual(1);
    expect(bad.zoom).toBe(false);
    vi.unstubAllGlobals();
  });
});


