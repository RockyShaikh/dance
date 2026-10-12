import { describe, expect, it } from "vitest";
import { SCRUB } from "./config";
import { IDLE_SCRUB, stepScrub, type ScrubAction, type ScrubState } from "./scrub";

const FRAME = 16; // ~60 fps: the fastest the app can ask
const DURATION = 120;

/** A tiny model of the player: playhead, playing/paused, and a log of every call. */
class Rig {
  state: ScrubState = IDLE_SCRUB;
  t = 5000;
  current: number;
  playing: boolean;
  calls: { t: number; a: ScrubAction }[] = [];
  constructor(playing: boolean, at = 30) {
    this.playing = playing;
    this.current = at;
  }

  /** One frame: the knob moved the playhead by `deltaSec` (and `active` = grabbed). */
  frame(deltaSec: number, active = true): void {
    this.t += FRAME;
    // The audio element plays on by itself between frames.
    if (this.playing) this.current += FRAME / 1000;
    const r = stepScrub(this.state, { t: this.t, dtSec: FRAME / 1000, active, deltaSec, playing: this.playing, current: this.current, duration: DURATION }, SCRUB);
    this.state = r.state;
    for (const a of r.actions) {
      this.calls.push({ t: this.t, a });
      if (a.type === "seek") this.current = Math.min(DURATION, Math.max(0, a.to));
      if (a.type === "play") this.playing = true;
      if (a.type === "pause") this.playing = false;
    }
  }
  run(ms: number, deltaPerSec: number, active = true): void {
    const n = Math.round(ms / FRAME);
    for (let i = 0; i < n; i++) this.frame((deltaPerSec * FRAME) / 1000, active);
  }
  seeks(): { t: number; to: number }[] {
    return this.calls.filter((c) => c.a.type === "seek").map((c) => ({ t: c.t, to: (c.a as { to: number }).to }));
  }
  types(): string[] {
    return this.calls.map((c) => c.a.type);
  }
}

describe("scrub while playing", () => {
  it("does nothing while the knob is at rest, and the music just plays on", () => {
    const r = new Rig(true);
    r.run(2000, 0);
    expect(r.calls).toEqual([]);
    expect(r.playing).toBe(true);
  });

  it("moving the knob seeks the playhead live, in the right direction, and keeps playing", () => {
    const r = new Rig(true, 30);
    r.run(1000, -2); // scrub backward
    expect(r.seeks().length).toBeGreaterThan(5);
    expect(r.current).toBeLessThan(30 - 0.5);
    expect(r.playing).toBe(true);
    expect(r.types()).not.toContain("play");
    expect(r.types()).not.toContain("pause");
    r.run(1000, +2);
    r.frame(0, false); // release
    expect(r.playing).toBe(true); // keeps playing from the new spot
  });

  it("on release the last position is not lost to the rate limit", () => {
    const r = new Rig(true, 30);
    r.run(100, -3);
    const before = r.seeks().length;
    r.frame(-0.02); // a movement inside the rate-limit gap...
    r.frame(0, false); // ...then release at once
    const last = r.seeks().at(-1)!;
    expect(r.seeks().length).toBeGreaterThanOrEqual(before);
    expect(Math.abs(r.current - last.to)).toBeLessThan(0.05);
  });
});

describe("seek rate limit", () => {
  it("never more than maxSeeksPerSec in any one second, even with the knob moving every frame at 60 fps", () => {
    const r = new Rig(true, 60);
    r.run(5000, -1.5);
    const seeks = r.seeks();
    expect(seeks.length).toBeGreaterThan(40);
    for (let i = 0; i + SCRUB.maxSeeksPerSec < seeks.length; i++) {
      // Any maxSeeksPerSec + 1 consecutive seeks span at least one second (minus a frame of rounding).
      expect(seeks[i + SCRUB.maxSeeksPerSec].t - seeks[i].t).toBeGreaterThanOrEqual(1000 - FRAME);
    }
  });

  it("the same limit holds while paused", () => {
    const r = new Rig(false, 30);
    r.run(4000, 2);
    const seeks = r.seeks();
    for (let i = 0; i + SCRUB.maxSeeksPerSec < seeks.length; i++) {
      expect(seeks[i + SCRUB.maxSeeksPerSec].t - seeks[i].t).toBeGreaterThanOrEqual(1000 - FRAME);
    }
  });

  it("consecutive seeks are at least 1/maxSeeksPerSec apart", () => {
    const r = new Rig(true, 60);
    r.run(3000, 3);
    const s = r.seeks();
    for (let i = 1; i < s.length; i++) expect(s[i].t - s[i - 1].t).toBeGreaterThanOrEqual(1000 / SCRUB.maxSeeksPerSec - 0.001);
  });
});

describe("scrub while paused: short snippets", () => {
  it("each seek plays a short snippet, then pauses again, and the playhead ends at the scrub position", () => {
    const r = new Rig(false, 30);
    r.run(1000, 2);
    expect(r.types()).toContain("play");
    // Stop moving: the snippet ends with a pause and a seek back to the scrub position.
    r.run(SCRUB.snippetMs + 3 * FRAME, 0);
    expect(r.playing).toBe(false);
    expect(r.current).toBeCloseTo(r.state.pos, 6);
  });

  it("while moving it keeps sounding (snippets chain), and the playhead follows the hand", () => {
    const r = new Rig(false, 30);
    r.run(1500, 2);
    expect(r.playing).toBe(true); // mid-scrub, a snippet is sounding
    expect(r.current).toBeGreaterThan(31.5);
  });

  it("a snippet is about snippetMs long: pause comes within a rate-limit gap of snippetMs after the last seek", () => {
    const r = new Rig(false, 30);
    r.run(200, 2);
    r.run(600, 0);
    const lastSeekBeforePause = r.calls.filter((c) => c.a.type === "seek").map((c) => c.t);
    const pauseAt = r.calls.find((c) => c.a.type === "pause")!.t;
    const lastMoveSeek = Math.max(...lastSeekBeforePause.filter((t) => t < pauseAt));
    expect(pauseAt - lastMoveSeek).toBeGreaterThanOrEqual(SCRUB.snippetMs);
    expect(pauseAt - lastMoveSeek).toBeLessThan(SCRUB.snippetMs + 2 * FRAME + 1);
  });

  it("stays paused on release, exactly at the scrub position", () => {
    const r = new Rig(false, 30);
    r.run(800, -2);
    r.frame(0, false); // release mid-snippet
    expect(r.playing).toBe(false);
    expect(r.current).toBeCloseTo(30 - 1.6, 0);
    expect(r.current).toBeCloseTo(r.seeks().at(-1)!.to, 6);
    // ...and nothing more happens afterwards.
    const n = r.calls.length;
    r.run(1000, 0, false);
    expect(r.calls.length).toBe(n);
  });

  it("a paused grab with no movement makes no sound and no calls", () => {
    const r = new Rig(false, 30);
    r.run(1000, 0);
    expect(r.calls).toEqual([]);
    r.frame(0, false);
    expect(r.calls).toEqual([]);
  });
});

describe("clamps", () => {
  it("never seeks before 0:00 or past the end", () => {
    const r = new Rig(true, 2);
    r.run(3000, -5);
    for (const s of r.seeks()) expect(s.to).toBeGreaterThanOrEqual(0);
    const q = new Rig(true, DURATION - 2);
    q.run(3000, 5);
    for (const s of q.seeks()) expect(s.to).toBeLessThanOrEqual(DURATION);
  });

  it("pinned at 0:00 it stops asking for seeks", () => {
    const r = new Rig(false, 0.2);
    r.run(1000, -5);
    const n = r.seeks().length;
    r.run(1000, -5);
    expect(r.seeks().length).toBe(n);
  });
});

describe("state", () => {
  it("reports scrubbing while active and on the frame of release, not before or after", () => {
    let s: ScrubState = IDLE_SCRUB;
    const inp = (active: boolean) => ({ t: 1000, dtSec: 0.016, active, deltaSec: 0, playing: true, current: 5, duration: 60 });
    let r = stepScrub(s, inp(false), SCRUB);
    expect(r.scrubbing).toBe(false);
    r = stepScrub(r.state, inp(true), SCRUB);
    expect(r.scrubbing).toBe(true);
    r = stepScrub(r.state, inp(false), SCRUB);
    expect(r.scrubbing).toBe(true);
    s = r.state;
    expect(stepScrub(s, inp(false), SCRUB).scrubbing).toBe(false);
  });
});
