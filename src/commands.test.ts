import { describe, expect, it } from "vitest";
import type { Box, Vec2 } from "./box";
import { PRESETS } from "./box";
import { INITIAL_STATE, chordAgrees, stepCommands, type FireEvent, type HandObs, type MachineState, type MachineView } from "./commands";
import { COMMANDS, type CommandConfig } from "./config";

const FRAME = 33; // ~30 fps

// The classifier is generic: these tests use the open palm as a plain command shape (it is no command in the app since R4d).
const GENERIC: CommandConfig = { ...COMMANDS, shapes: ["Open_Palm", ...COMMANDS.shapes] };

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
    public cfg: CommandConfig = GENERIC,
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

const cfg = (o: Partial<CommandConfig>): CommandConfig => ({ ...GENERIC, ...o });

describe("dwell: a shape must be held", () => {
  it("open palm fires once the first ring is full, not before", () => {
    const b = new Bench();
    b.show(COMMANDS.dwellMs - 100, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(0);
    b.show(200, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(1);
    expect(b.fires[0]).toMatchObject({ shape: "Open_Palm" });
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
    for (const shape of ["Thumb_Down", "ILoveYou", "None"]) {
      b.show(5000, [hand(shape)]);
    }
    expect(b.fires).toHaveLength(0);
  });

  it("R4d: with the app's own config the open palm is no command at all (a hand coming into frame never fires)", () => {
    const b = new Bench(COMMANDS);
    b.show(10_000, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(0);
    expect(b.view.progress).toBe(0);
    expect(b.view.seen).toBeNull();
  });

  it("R5b: the thumbs up is not a classifier command any more (holding it is a state: holdSpeed.ts)", () => {
    const b = new Bench(COMMANDS);
    b.show(5000, [hand("Thumb_Up")]);
    expect(b.fires).toHaveLength(0);
    expect(COMMANDS.shapes).not.toContain("Thumb_Up");
  });

  it("the fist, like the thumbs up before it, does not show the palm, so the palm-facing rule does not apply to it (it still applies to the others)", () => {
    const b = new Bench(cfg({ requirePalmFacing: true }));
    b.show(2000, [hand("Closed_Fist", INSIDE, { palmFacing: false })]);
    expect(b.fires.map((f) => f.shape)).toEqual(["Closed_Fist"]);
    const c = new Bench(cfg({ requirePalmFacing: true }));
    c.show(2000, [hand("Victory", INSIDE, { palmFacing: false })]);
    expect(c.fires).toHaveLength(0);
    expect(c.view.blocked).toBe("palm not facing");
  });
});

describe("single fire on a long hold", () => {
  it("open palm held for 10 s fires exactly once", () => {
    const b = new Bench();
    b.show(10_000, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(1);
    expect(b.view.phase).toBe("spent");
  });

  it("index up held for 10 s fires exactly once, and nothing on release", () => {
    const b = new Bench();
    b.show(10_000, [hand("Pointing_Up")]);
    b.idle(3000);
    expect(b.fires).toHaveLength(1);
    expect(b.fires[0]).toMatchObject({ shape: "Pointing_Up" });
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

describe("no gesture depends on how long it is held (no tap vs hold)", () => {
  for (const shape of COMMANDS.shapes) {
    it(`${shape}: fires once, right when the ring fills, without waiting for the release`, () => {
      const b = new Bench();
      b.show(COMMANDS.dwellMs - 100, [hand(shape)]);
      expect(b.fires).toHaveLength(0);
      b.show(200, [hand(shape)]);
      expect(b.fires).toHaveLength(1);
      expect(b.fires[0].shape).toBe(shape);
      expect(b.fires[0].t).toBeGreaterThanOrEqual(COMMANDS.dwellMs);
      expect(b.fires[0].t).toBeLessThan(COMMANDS.dwellMs + 2 * FRAME + 100);
      expect(b.view.phase).toBe("spent");
    });

    it(`${shape}: holding 0.7 s then dropping and holding 10 s fire the same single command`, () => {
      const quick = new Bench();
      quick.show(700, [hand(shape)]);
      quick.idle(3000);
      const long = new Bench();
      long.show(10_000, [hand(shape)]);
      long.idle(3000);
      expect(quick.fires).toHaveLength(1);
      expect(long.fires).toHaveLength(1);
      expect(quick.fires[0]).toEqual(long.fires[0]);
    });

    it(`${shape}: dropping the hand after it fired adds nothing`, () => {
      const b = new Bench();
      b.show(COMMANDS.dwellMs + 300, [hand(shape)]);
      expect(b.fires).toHaveLength(1);
      b.idle(5000);
      expect(b.fires).toHaveLength(1);
    });
  }

  it("a fire event carries no tap/hold kind, and the view has no outer ring", () => {
    const b = new Bench();
    b.show(900, [hand("Victory")]);
    expect(Object.keys(b.fires[0]).sort()).toEqual(["shape", "t"]);
    expect(Object.keys(b.view)).not.toContain("holdProgress");
  });

  it("a shape released just before the ring is full never fires", () => {
    const b = new Bench();
    b.show(COMMANDS.dwellMs - 100, [hand("Victory")]);
    b.idle(1000);
    expect(b.fires).toHaveLength(0);
  });

  it("a long dwell setting just moves the moment it fires", () => {
    const b = new Bench(cfg({ dwellMs: 1200 }));
    b.show(1100, [hand("Victory")]);
    expect(b.fires).toHaveLength(0);
    b.show(300, [hand("Victory")]);
    expect(b.fires).toHaveLength(1);
  });

  it("switching straight to another shape after the first fired adds nothing until that one's ring fills", () => {
    const b = new Bench();
    b.show(900, [hand("Victory")]);
    expect(b.fires).toHaveLength(1);
    b.show(300, [hand("Pointing_Up")]);
    expect(b.fires).toHaveLength(1);
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

  it("the cooldown counts from the moment it fired", () => {
    const b = new Bench();
    b.show(800, [hand("Pointing_Up")]);
    b.idle(200);
    expect(b.fires).toHaveLength(1);
    const first = b.fires[0].t;
    b.show(5000, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(2);
    expect(b.fires[1].t - first).toBeGreaterThanOrEqual(COMMANDS.cooldownMs);
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
    expect(b.fires.map((f) => f.shape)).toEqual(["Closed_Fist", "Pointing_Up", "Victory"]);
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

  it("moving the box away before the ring is full ends the hold: nothing fires", () => {
    const b = new Bench();
    b.show(400, [hand("Victory", INSIDE)]);
    b.box = PRESETS.left;
    b.show(1000, [hand("Victory", INSIDE)]);
    expect(b.fires).toHaveLength(0);
  });

  it("whole-frame preset accepts a hand anywhere", () => {
    const b = new Bench(GENERIC, PRESETS.whole);
    b.show(1000, [hand("Open_Palm", { x: 0.02, y: 0.98 })]);
    expect(b.fires).toHaveLength(1);
  });
});

describe("gates: palm facing, confidence, one hand at a time", () => {
  it("R6: palm facing is assumed, not required, by default (the config still has the switch)", () => {
    expect(COMMANDS.requirePalmFacing).toBe(false);
    const b = new Bench(COMMANDS);
    b.show(1000, [hand("Pointing_Up", INSIDE, { palmFacing: false })]);
    expect(b.fires).toHaveLength(1);
  });

  it("palm not facing the camera never fires when the requirement is switched on", () => {
    const b = new Bench(cfg({ requirePalmFacing: true }));
    b.show(5000, [hand("Open_Palm", INSIDE, { palmFacing: false })]);
    expect(b.fires).toHaveLength(0);
    expect(b.view.blocked).toBe("palm not facing");
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
    b.show(1000, [hand("ILoveYou", { x: 0.9, y: 0.5 }), hand("Open_Palm", INSIDE)]);
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

describe("timing is by clock, not by frame count", () => {
  function fireTimes(frameMs: number, shape: string, holdMs: number): number[] {
    let state = INITIAL_STATE;
    const times: number[] = [];
    for (let t = frameMs; t <= holdMs; t += frameMs) {
      const r = stepCommands(state, { t, hands: [hand(shape)], box: PRESETS.right }, GENERIC);
      state = r.state;
      if (r.fired) times.push(r.fired.t);
    }
    return times;
  }

  it("fires at the same moment at 10, 30 and 120 fps", () => {
    for (const ms of [100, 33, 8]) {
      const [t] = fireTimes(ms, "Open_Palm", 2000);
      // the hand first appears on the first frame (t = ms); the dwell is measured from there
      expect(t - ms).toBeGreaterThanOrEqual(COMMANDS.dwellMs);
      expect(t - ms).toBeLessThanOrEqual(COMMANDS.dwellMs + ms);
    }
  });

  it("every command fires at the same moment at any frame rate", () => {
    for (const shape of COMMANDS.shapes) {
      for (const ms of [100, 33, 8]) {
        const times = fireTimes(ms, shape, 4000);
        expect(times).toHaveLength(1);
        expect(times[0] - ms).toBeGreaterThanOrEqual(COMMANDS.dwellMs);
        expect(times[0] - ms).toBeLessThanOrEqual(COMMANDS.dwellMs + ms);
      }
    }
  });
});

describe("the hand leaving view (tracking lost) mid-gesture", () => {
  for (const shape of COMMANDS.shapes) {
    it(`${shape}: vanishing before the ring is full cancels, nothing fires`, () => {
      const b = new Bench();
      b.show(COMMANDS.dwellMs - 200, [hand(shape)]);
      b.idle(5000);
      expect(b.fires).toHaveLength(0);
      expect(b.view.phase).toBe("idle");
    });
  }

  for (const shape of COMMANDS.shapes) {
    it(`${shape}: vanishing after it fired adds nothing`, () => {
      const b = new Bench();
      b.show(COMMANDS.dwellMs + 300, [hand(shape)]);
      expect(b.fires).toHaveLength(1);
      b.idle(5000);
      expect(b.fires).toHaveLength(1);
    });
  }

  it("coming back after a cancelled dwell starts fresh (the earlier time is not banked)", () => {
    const b = new Bench();
    b.show(COMMANDS.dwellMs - 200, [hand("Open_Palm")]);
    b.idle(500);
    b.show(COMMANDS.dwellMs - 200, [hand("Open_Palm")]);
    expect(b.fires).toHaveLength(0);
  });
});

describe("R4d: the fist is a command, and the fist / thumbs up guard", () => {
  const FIST = { T: false, I: false, M: false, R: false, P: false };
  const THUMB = { T: true, I: false, M: false, R: false, P: false };
  const POINT = { T: false, I: true, M: false, R: false, P: false };

  it("a closed fist fires when its ring fills (any way round: the palm-facing rule does not apply to it)", () => {
    const b = new Bench(COMMANDS);
    b.show(COMMANDS.dwellMs + 200, [hand("Closed_Fist", INSIDE, { palmFacing: false, chord: FIST })]);
    expect(b.fires.map((f) => f.shape)).toEqual(["Closed_Fist"]);
  });

  it("a fist the model labels Thumb_Up (the thumb is not out) does NOT count as a thumbs up (chordAgrees; holdSpeed's arming uses it)", () => {
    expect(chordAgrees("Thumb_Up", FIST)).toBe(false);
    expect(chordAgrees("Thumb_Up", POINT)).toBe(false);
    expect(chordAgrees("Thumb_Up", THUMB)).toBe(true);
    expect(chordAgrees("Closed_Fist", THUMB)).toBe(false);
    expect(chordAgrees("Closed_Fist", FIST)).toBe(true);
    expect(chordAgrees("Thumb_Up", undefined)).toBe(true);
  });

  it("a thumbs up the model labels Closed_Fist (the thumb is out) does NOT fire as a fist", () => {
    const b = new Bench(COMMANDS);
    b.show(5000, [hand("Closed_Fist", INSIDE, { chord: THUMB })]);
    expect(b.fires).toHaveLength(0);
    expect(b.view.blocked).toBe("fingers disagree");
  });

  it("the fist fires when label and fingers agree", () => {
    const fist = new Bench(COMMANDS);
    fist.show(2000, [hand("Closed_Fist", INSIDE, { chord: FIST })]);
    expect(fist.fires.map((f) => f.shape)).toEqual(["Closed_Fist"]);
  });

  it("a fist with a finger still out is not a fist either", () => {
    const b = new Bench(COMMANDS);
    b.show(5000, [hand("Closed_Fist", INSIDE, { chord: POINT })]);
    expect(b.fires).toHaveLength(0);
  });

  it("the guard does not touch the other shapes (V, index)", () => {
    const b = new Bench(COMMANDS);
    b.show(2000, [hand("Victory", INSIDE, { chord: FIST })]);
    expect(b.fires.map((f) => f.shape)).toEqual(["Victory"]);
  });

  it("without a chord (older callers) no check is made", () => {
    const b = new Bench(COMMANDS);
    b.show(2000, [hand("Closed_Fist")]);
    expect(b.fires).toHaveLength(1);
  });
});
