import { describe, expect, it } from "vitest";
import type { Box, Vec2 } from "./box";
import { PRESETS } from "./box";
import { INITIAL_STATE, effectiveHoldMs, stepCommands, type FireEvent, type HandObs, type MachineState, type MachineView } from "./commands";
import { COMMANDS, type CommandConfig } from "./config";

const FRAME = 33; // ~30 fps

const INSIDE: Vec2 = { x: 0.75, y: 0.5 }; // right half of the display
const OUTSIDE: Vec2 = { x: 0.25, y: 0.5 };

function hand(shape: string, palm: Vec2 = INSIDE, o: Partial<HandObs> = {}): HandObs {
  return { shape, shapeScore: 0.9, palmFacing: true, palm, ...o };
}

/** Replays frames into the classifier and records every fire. */
class Bench {
  state: MachineState = INITIAL_STATE;
  t = 0;
  fires: FireEvent[] = [];
  view!: MachineView;
  constructor(
    public cfg: CommandConfig = COMMANDS,
    public box: Box = PRESETS.right,
  ) {}

  /** Show `hands` for `ms` of video time. `hands` may be a function of time since this call started. */
  show(ms: number, hands: readonly HandObs[] | ((elapsed: number) => readonly HandObs[]) = []): void {
    const start = this.t;
    const end = start + ms;
    while (this.t < end) {
      this.t += FRAME;
      const list = typeof hands === "function" ? hands(this.t - start) : hands;
      const r = stepCommands(this.state, { t: this.t, hands: list, box: this.box }, this.cfg);
      this.state = r.state;
      this.view = r.view;
      if (r.fired) this.fires.push(r.fired);
    }
  }

  /** No hand for `ms`. */
  idle(ms: number): void {
    this.show(ms, []);
  }
}

const cfg = (o: Partial<CommandConfig>): CommandConfig => ({ ...COMMANDS, ...o });

describe("dwell: a shape must be held", () => {
  it("open palm fires once the first ring is full, not before", () => {
    const b = new Bench();
    b.show(COMMANDS.dwellMs - 100, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(0);
    b.show(200, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(1);
    expect(b.fires[0]).toMatchObject({ shape: "Open_Palm", kind: "tap" });
    expect(b.fires[0].t).toBeGreaterThanOrEqual(COMMANDS.dwellMs);
    expect(b.fires[0].t).toBeLessThanOrEqual(COMMANDS.dwellMs + 2 * FRAME);
  });

  it("a shape dropped before the dwell is complete never fires", () => {
    for (const shape of COMMANDS.shapes) {
      const b = new Bench();
      b.show(COMMANDS.dwellMs - 100, [hand(shape)]);
      b.idle(3000);
      expect(b.fires).toHaveLength(0);
    }
  });

  it("the ring progress rises from 0 to 1 over the dwell", () => {
    const b = new Bench();
    b.show(FRAME * 9, [hand("Pointing_Up")]); // ~300 ms
    expect(b.view.phase).toBe("dwell");
    expect(b.view.progress).toBeGreaterThan(0.4);
    expect(b.view.progress).toBeLessThan(0.6);
    b.show(400, [hand("Pointing_Up")]);
    expect(b.view.progress).toBe(1);
  });

  it("the dwell slider changes the time needed", () => {
    const slow = new Bench(cfg({ dwellMs: 1000 }));
    slow.show(900, [hand("Open_Palm")]);
    expect(slow.fires).toHaveLength(0);
    slow.show(200, [hand("Open_Palm")]);
    expect(slow.fires).toHaveLength(1);
  });

  it("a single dropped or flickering frame does not reset the dwell", () => {
    const b = new Bench();
    b.show(300, [hand("Open_Palm")]);
    b.show(FRAME * 2, [hand("None")]); // 66 ms of nothing recognised
    b.show(500, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(1);
    expect(b.fires[0].t).toBeLessThan(900);
  });

  it("a gap longer than the grace is a release and restarts the dwell", () => {
    const b = new Bench();
    b.show(400, [hand("Open_Palm")]);
    b.idle(300);
    b.show(400, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(0);
    b.show(300, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(1);
  });

  it("changing shape mid-dwell restarts the dwell for the new shape", () => {
    const b = new Bench();
    b.show(400, [hand("Open_Palm")]);
    b.show(400, [hand("Victory")]);
    expect(b.fires).toHaveLength(0);
    b.idle(300);
    expect(b.fires).toHaveLength(0);
  });

  it("shapes that are not commands never fire", () => {
    const b = new Bench();
    for (const shape of ["Closed_Fist", "Thumb_Up", "Thumb_Down", "ILoveYou", "None"]) {
      b.show(5000, [hand(shape)]);
    }
    expect(b.fires).toHaveLength(0);
  });
});

describe("single fire on a long hold", () => {
  it("open palm held for 10 s fires exactly once", () => {
    const b = new Bench();
    b.show(10_000, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(1);
    expect(b.view.phase).toBe("spent");
  });

  it("index up held for 10 s fires exactly one hold, and nothing on release", () => {
    const b = new Bench();
    b.show(10_000, [hand("Pointing_Up")]);
    b.idle(3000);
    expect(b.fires).toHaveLength(1);
    expect(b.fires[0]).toMatchObject({ shape: "Pointing_Up", kind: "hold" });
  });

  it("holding on past the cooldown does not fire again", () => {
    const b = new Bench();
    b.show(COMMANDS.dwellMs + COMMANDS.cooldownMs * 3, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(1);
  });

  it("a flicker during a long hold does not re-arm it", () => {
    const b = new Bench();
    b.show(1000, [hand("Open_Palm")]);
    b.show(FRAME * 2, [hand("None")]);
    b.show(5000, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(1);
  });
});

describe("tap vs hold (index up, V)", () => {
  for (const shape of ["Pointing_Up", "Victory"]) {
    it(`${shape}: a tap fires on release, after the ring filled, as a tap`, () => {
      const b = new Bench();
      b.show(900, [hand(shape)]); // ring full at 600, hold would be at 1500
      expect(b.fires).toHaveLength(0); // nothing yet: waiting for release
      expect(b.view.phase).toBe("armed");
      b.idle(300);
      expect(b.fires).toHaveLength(1);
      expect(b.fires[0]).toMatchObject({ shape, kind: "tap" });
      expect(b.fires[0].t).toBeGreaterThan(900);
    });

    it(`${shape}: a hold fires once at the outer ring, as a hold`, () => {
      const b = new Bench();
      b.show(effectiveHoldMs(COMMANDS) - 100, [hand(shape)]);
      expect(b.fires).toHaveLength(0);
      b.show(200, [hand(shape)]);
      expect(b.fires).toHaveLength(1);
      expect(b.fires[0]).toMatchObject({ shape, kind: "hold" });
      expect(b.fires[0].t).toBeGreaterThanOrEqual(effectiveHoldMs(COMMANDS));
    });
  }

  it("the outer ring runs from 0 at the first ring to 1 at the hold time", () => {
    const b = new Bench();
    b.show(COMMANDS.dwellMs + 100, [hand("Victory")]);
    expect(b.view.holdProgress).toBeGreaterThanOrEqual(0);
    expect(b.view.holdProgress).toBeLessThan(0.3);
    b.show(500, [hand("Victory")]);
    expect(b.view.holdProgress).toBeGreaterThan(0.4);
    expect(b.view.holdProgress).toBeLessThan(0.9);
  });

  it("open palm has no outer ring", () => {
    const b = new Bench();
    b.show(300, [hand("Open_Palm")]);
    expect(b.view.holdProgress).toBeNull();
  });

  it("a shape released just before the first ring is full is not a tap", () => {
    const b = new Bench();
    b.show(COMMANDS.dwellMs - 100, [hand("Victory")]);
    b.idle(1000);
    expect(b.fires).toHaveLength(0);
  });

  it("the hold time is never squashed against a long dwell", () => {
    const c = cfg({ dwellMs: 1200 });
    expect(effectiveHoldMs(c)).toBeGreaterThanOrEqual(1200 + COMMANDS.holdMinGapMs);
    const b = new Bench(c);
    b.show(1500, [hand("Victory")]);
    expect(b.fires).toHaveLength(0); // still armed, hold not due yet
    b.idle(300);
    expect(b.fires[0]).toMatchObject({ kind: "tap" });
  });

  it("switching straight to another shape after the ring filled counts as releasing the first (a tap)", () => {
    const b = new Bench();
    b.show(900, [hand("Victory")]);
    b.show(300, [hand("Pointing_Up")]);
    expect(b.fires).toHaveLength(1);
    expect(b.fires[0]).toMatchObject({ shape: "Victory", kind: "tap" });
  });

  it("taking the hand out of the box after the ring filled counts as release", () => {
    const b = new Bench();
    b.show(900, [hand("Pointing_Up")]);
    b.show(300, [hand("Pointing_Up", OUTSIDE)]);
    expect(b.fires).toHaveLength(1);
    expect(b.fires[0]).toMatchObject({ kind: "tap" });
  });
});

describe("cooldown", () => {
  it("no new dwell starts until the cooldown has passed", () => {
    const b = new Bench();
    b.show(700, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(1);
    const first = b.fires[0].t;
    b.idle(200);
    b.show(5000, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(2);
    expect(b.fires[1].t - first).toBeGreaterThanOrEqual(COMMANDS.cooldownMs + COMMANDS.dwellMs);
  });

  it("while cooling down, nothing fires even if a different shape is shown", () => {
    const b = new Bench();
    b.show(700, [hand("Open_Palm")]);
    b.idle(200);
    b.show(COMMANDS.cooldownMs - 400, [hand("Victory")]);
    b.idle(1000);
    expect(b.fires).toHaveLength(1);
  });

  it("the cooldown counts from a tap's release, not from the ring", () => {
    const b = new Bench();
    b.show(800, [hand("Pointing_Up")]);
    b.idle(200);
    expect(b.fires).toHaveLength(1);
    const first = b.fires[0].t;
    b.show(5000, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(2);
    expect(b.fires[1].t - first).toBeGreaterThanOrEqual(COMMANDS.cooldownMs + COMMANDS.dwellMs);
  });

  it("reports the cooldown remaining", () => {
    const b = new Bench();
    b.show(700, [hand("Open_Palm")]);
    b.idle(FRAME);
    expect(b.view.cooldownLeftMs).toBeGreaterThan(0);
    b.idle(2000);
    expect(b.view.cooldownLeftMs).toBe(0);
  });
});

describe("the command box", () => {
  it("shapes made outside the box never fire", () => {
    const b = new Bench();
    for (const shape of COMMANDS.shapes) b.show(10_000, [hand(shape, OUTSIDE)]);
    expect(b.fires).toHaveLength(0);
    expect(b.view.blocked).toBe("outside box");
  });

  it("the same shapes inside the box do fire", () => {
    const b = new Bench();
    for (const shape of COMMANDS.shapes) {
      b.show(2000, [hand(shape, INSIDE)]);
      b.idle(1500);
    }
    expect(b.fires.map((f) => f.shape)).toEqual(["Open_Palm", "Pointing_Up", "Victory"]);
  });

  it("the palm centre decides, edges included", () => {
    const b = new Bench();
    b.show(2000, [hand("Open_Palm", { x: 0.5, y: 0.5 })]); // exactly on the left edge of the right-half box
    expect(b.fires).toHaveLength(1);
    const c = new Bench();
    c.show(2000, [hand("Open_Palm", { x: 0.499, y: 0.5 })]);
    expect(c.fires).toHaveLength(0);
  });

  it("a hand that never completes the dwell inside the box doesn't fire (sliding in and out)", () => {
    const b = new Bench();
    // 400 ms inside, 400 ms outside, repeated: never 600 ms continuously inside.
    for (let i = 0; i < 6; i++) {
      b.show(400, [hand("Open_Palm", INSIDE)]);
      b.show(400, [hand("Open_Palm", OUTSIDE)]);
    }
    expect(b.fires).toHaveLength(0);
  });

  it("moving the box onto a hand takes effect immediately and starts the dwell", () => {
    const b = new Bench();
    b.show(3000, [hand("Open_Palm", OUTSIDE)]);
    expect(b.fires).toHaveLength(0);
    b.box = PRESETS.left; // preset chosen / box dragged over the hand
    b.show(300, [hand("Open_Palm", OUTSIDE)]);
    expect(b.view.phase).toBe("dwell");
    b.show(500, [hand("Open_Palm", OUTSIDE)]);
    expect(b.fires).toHaveLength(1);
  });

  it("moving the box away mid-hold ends the hold; an armed shape then fires as a tap on release", () => {
    const b = new Bench();
    b.show(900, [hand("Victory", INSIDE)]);
    b.box = PRESETS.left;
    b.show(300, [hand("Victory", INSIDE)]);
    expect(b.fires).toHaveLength(1);
    expect(b.fires[0]).toMatchObject({ kind: "tap" });
  });

  it("whole-frame preset accepts a hand anywhere", () => {
    const b = new Bench(COMMANDS, PRESETS.whole);
    b.show(1000, [hand("Open_Palm", { x: 0.02, y: 0.98 })]);
    expect(b.fires).toHaveLength(1);
  });
});

describe("gates: palm facing, confidence, one hand at a time", () => {
  it("palm not facing the camera never fires", () => {
    const b = new Bench();
    b.show(5000, [hand("Open_Palm", INSIDE, { palmFacing: false })]);
    expect(b.fires).toHaveLength(0);
    expect(b.view.blocked).toBe("palm not facing");
  });

  it("palm facing can be switched off", () => {
    const b = new Bench(cfg({ requirePalmFacing: false }));
    b.show(1000, [hand("Open_Palm", INSIDE, { palmFacing: false })]);
    expect(b.fires).toHaveLength(1);
  });

  it("a low-confidence label never fires", () => {
    const b = new Bench();
    b.show(5000, [hand("Open_Palm", INSIDE, { shapeScore: 0.3 })]);
    expect(b.fires).toHaveLength(0);
    expect(b.view.blocked).toBe("low confidence");
  });

  it("two hands both showing command shapes in the box: ignored", () => {
    const b = new Bench();
    b.show(5000, [hand("Open_Palm", { x: 0.6, y: 0.5 }), hand("Victory", { x: 0.9, y: 0.5 })]);
    expect(b.fires).toHaveLength(0);
    expect(b.view.blocked).toBe("two hands");
  });

  it("one hand in the box and another outside: the one in the box counts", () => {
    const b = new Bench();
    b.show(1000, [hand("Open_Palm", OUTSIDE), hand("Open_Palm", INSIDE)]);
    expect(b.fires).toHaveLength(1);
  });

  it("a second hand showing something that is not a command does not block", () => {
    const b = new Bench();
    b.show(1000, [hand("Closed_Fist", { x: 0.9, y: 0.5 }), hand("Open_Palm", INSIDE)]);
    expect(b.fires).toHaveLength(1);
  });

  it("a second command hand appearing mid-dwell stops the dwell", () => {
    const b = new Bench();
    b.show(400, [hand("Open_Palm", INSIDE)]);
    b.show(2000, [hand("Open_Palm", INSIDE), hand("Victory", { x: 0.9, y: 0.5 })]);
    expect(b.fires).toHaveLength(0);
  });
});

describe("stillness rule (optional)", () => {
  const moving = (elapsed: number): HandObs[] => [hand("Open_Palm", { x: 0.6 + elapsed * 0.0002, y: 0.5 })]; // 0.2 per second, sideways

  it("is off by default: a moving hand still fires", () => {
    const b = new Bench();
    b.show(1500, moving);
    expect(b.fires).toHaveLength(1);
  });

  it("on: a hand that keeps moving does not fire", () => {
    const b = new Bench(cfg({ stillness: { enabled: true, maxMove: 0.06 } }));
    b.show(3000, moving);
    expect(b.fires).toHaveLength(0);
  });

  it("on: a hand that holds still does fire", () => {
    const b = new Bench(cfg({ stillness: { enabled: true, maxMove: 0.06 } }));
    b.show(1000, [hand("Open_Palm", INSIDE)]);
    expect(b.fires).toHaveLength(1);
  });

  it("on: small jitter is tolerated", () => {
    const b = new Bench(cfg({ stillness: { enabled: true, maxMove: 0.06 } }));
    b.show(1000, (e) => [hand("Open_Palm", { x: 0.75 + (Math.round(e / FRAME) % 2) * 0.01, y: 0.5 })]);
    expect(b.fires).toHaveLength(1);
  });

  it("on: a drift restarts the dwell from the new spot", () => {
    const b = new Bench(cfg({ stillness: { enabled: true, maxMove: 0.06 } }));
    b.show(400, [hand("Open_Palm", { x: 0.6, y: 0.5 })]);
    b.show(500, [hand("Open_Palm", { x: 0.9, y: 0.5 })]); // jumped: restart, 500 ms not enough
    expect(b.fires).toHaveLength(0);
    b.show(300, [hand("Open_Palm", { x: 0.9, y: 0.5 })]);
    expect(b.fires).toHaveLength(1);
  });
});

describe("view", () => {
  it("reports what is being seen even before a dwell starts, and where to draw the ring", () => {
    const b = new Bench();
    b.show(FRAME, [hand("Victory", { x: 0.7, y: 0.4 })]);
    expect(b.view.seen).toBe("Victory");
    expect(b.view.shape).toBe("Victory");
    expect(b.view.palm).toEqual({ x: 0.7, y: 0.4 });
  });

  it("is idle with no hands", () => {
    const b = new Bench();
    b.idle(500);
    expect(b.view).toMatchObject({ phase: "idle", shape: null, seen: null, blocked: null, progress: 0 });
  });
});
