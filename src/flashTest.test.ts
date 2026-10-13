import { describe, expect, it } from "vitest";
import { FLASH_DEFAULTS, FlashTest, type Marker } from "./flashTest";

/**
 * A simulated camera pointed at the screen: a frame every `frameMs`, showing what the screen showed `lagMs` ago
 * (the marker is drawn `drawMs` after it is asked for).
 */
function simulate(opts: { lagMs: number; frameMs?: number; drawMs?: number; seeScreen?: boolean; captureLagMs?: number | null; maxMs?: number; rand?: () => number }) {
  const frameMs = opts.frameMs ?? 33;
  const drawMs = opts.drawMs ?? 8;
  const events: { at: number; m: Marker }[] = [{ at: -1e9, m: "black" }];
  let clock = 0;
  const pendingDraw: { at: number; m: Marker }[] = [];
  const t = new FlashTest({ setMarker: (m) => pendingDraw.push({ at: clock + drawMs, m }) }, FLASH_DEFAULTS, opts.rand ?? (() => 0.5));
  t.start(0);
  const screenAt = (time: number): Marker => {
    let cur: Marker = "black";
    for (const e of events) if (e.at <= time) cur = e.m;
    return cur;
  };
  const end = opts.maxMs ?? 120_000;
  for (clock = 0; clock < end && t.running; clock += 1) {
    while (pendingDraw.length && pendingDraw[0].at <= clock) {
      const d = pendingDraw.shift()!;
      events.push(d);
      t.markerShown(d.at);
    }
    if (clock % frameMs === 0) {
      const seen = opts.seeScreen === false ? "black" : screenAt(clock - opts.lagMs);
      t.onFrame({
        now: clock,
        luma: seen === "white" ? 200 : 20,
        captureTime: opts.captureLagMs === null ? null : clock - (opts.captureLagMs ?? opts.lagMs / 2),
      });
    }
    if (clock % 100 === 0) t.tick(clock);
  }
  return t;
}

describe("FlashTest", () => {
  it("measures the delay of the pipeline: glass to app is the camera lag plus up to a frame, from the moment the marker is drawn", () => {
    const t = simulate({ lagMs: 150 });
    expect(t.phase).toBe("done");
    expect(t.trials).toHaveLength(FLASH_DEFAULTS.trials);
    expect(t.misses).toBe(0);
    for (const x of t.trials) {
      expect(x.glassToApp).toBeGreaterThanOrEqual(150);
      expect(x.glassToApp).toBeLessThan(150 + 33 + 1);
    }
  });
  it("a slower pipeline measures slower (the numbers compare cameras)", () => {
    const fast = simulate({ lagMs: 80 });
    const slow = simulate({ lagMs: 320 });
    const med = (t: FlashTest) => t.trials.map((x) => x.glassToApp).sort((a, b) => a - b)[10];
    expect(med(slow) - med(fast)).toBeGreaterThan(200);
  });
  it("splits flash -> captured and captured -> app when the browser gives captureTime", () => {
    const t = simulate({ lagMs: 150, captureLagMs: 60 });
    const x = t.trials[0];
    expect(x.captureToApp).toBeCloseTo(60, 5);
    expect(x.flashToCapture).toBeCloseTo(x.glassToApp - 60, 5);
  });
  it("no captureTime: the split is null, the total is still there", () => {
    const t = simulate({ lagMs: 100, captureLagMs: null });
    expect(t.trials[0].captureToApp).toBeNull();
    expect(t.trials[0].flashToCapture).toBeNull();
    expect(t.trials[0].glassToApp).toBeGreaterThan(0);
  });
  it("a camera that does not see the screen stops with a clear message", () => {
    const t = simulate({ lagMs: 100, seeScreen: false });
    expect(t.phase).toBe("failed");
    expect(t.failReason).toContain("does not see the screen");
  });
  it("no frames at all: fails on the stall timeout", () => {
    const t = new FlashTest({ setMarker: () => {} });
    t.start(0);
    t.tick(5000);
    expect(t.phase).toBe("cal-black");
    t.tick(20_000);
    expect(t.phase).toBe("failed");
    expect(t.failReason).toContain("No camera frames");
  });
  it("frames captured before the flip cannot count as the flash", () => {
    const t = new FlashTest({ setMarker: () => {} }, { ...FLASH_DEFAULTS, trials: 1 }, () => 0);
    t.start(0);
    // calibration: black 20, white 200
    for (let now = 0; now < 1300; now += 33) t.onFrame({ now, luma: 20 });
    for (let now = 1300; now < 2600; now += 33) t.onFrame({ now, luma: 200 });
    expect(t.phase).toBe("wait");
    for (let now = 2600; now < 4000; now += 33) t.onFrame({ now, luma: 20 });
    expect(t.phase).toBe("flip");
    t.markerShown(4000);
    t.onFrame({ now: 4033, luma: 200, captureTime: 3990 }); // captured before the flip: ignored
    expect(t.trials).toHaveLength(0);
    t.onFrame({ now: 4066, luma: 200, captureTime: 4040 });
    expect(t.trials).toHaveLength(1);
    expect(t.trials[0].glassToApp).toBe(66);
    expect(t.phase).toBe("done");
  });
  it("waits for the picture to go dark before flipping (a late frame still showing white is not the next flash)", () => {
    const t = new FlashTest({ setMarker: () => {} }, FLASH_DEFAULTS, () => 0);
    t.start(0);
    for (let now = 0; now < 1300; now += 33) t.onFrame({ now, luma: 20 });
    for (let now = 1300; now < 2600; now += 33) t.onFrame({ now, luma: 200 });
    expect(t.phase).toBe("wait");
    // the wait is long enough but the camera is still showing white
    for (let now = 2600; now < 5000; now += 33) t.onFrame({ now, luma: 200 });
    expect(t.phase).toBe("wait");
    t.onFrame({ now: 5033, luma: 20 });
    expect(t.phase).toBe("wait");
    t.onFrame({ now: 5066, luma: 20 });
    expect(t.phase).toBe("flip");
  });
  it("a flash that never shows is a miss, and the run still completes", () => {
    const t = new FlashTest({ setMarker: () => {} }, { ...FLASH_DEFAULTS, trials: 2 }, () => 0);
    t.start(0);
    for (let now = 0; now < 1300; now += 33) t.onFrame({ now, luma: 20 });
    for (let now = 1300; now < 2600; now += 33) t.onFrame({ now, luma: 200 });
    for (let now = 2600; now < 4000; now += 33) t.onFrame({ now, luma: 20 });
    t.markerShown(4000);
    t.tick(4000 + FLASH_DEFAULTS.timeoutMs + 1);
    expect(t.misses).toBe(1);
    expect(t.phase).toBe("wait");
  });
  it("cancel stops it; it can be started again", () => {
    const t = new FlashTest({ setMarker: () => {} });
    t.start(0);
    t.cancel();
    expect(t.running).toBe(false);
    t.start(100);
    expect(t.running).toBe(true);
    expect(t.trials).toEqual([]);
  });
});
