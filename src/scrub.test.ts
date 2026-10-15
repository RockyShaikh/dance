import { describe, expect, it } from "vitest";
import { SCRUB } from "./config";
import { IDLE_SCRUB, stepScrub, type ScrubAction, type ScrubMode, type ScrubState } from "./scrub";

const FRAME = 16; // ~60 fps: the fastest the app can ask
const DURATION = 120;

/** A tiny model of the player: playhead, playing/paused, an optional seek latency, and a log of every call. */
class Rig {
  state: ScrubState = IDLE_SCRUB;
  t = 5000;
  current: number;
  playing: boolean;
  /** R5: playback speed (the music moves this many seconds per second). */
  rate = 1;
  /** Seeks stay "in flight" this long (0 = instant). */
  seekMs = 0;
  seekingUntil = 0;
  calls: { t: number; a: ScrubAction }[] = [];
  /** Everything the hand asked for: the sum of the deltas. */
  handTotal = 0;
  /** Seconds the music played by itself (so an expected landing spot can be computed). */
  playedSec = 0;
  readonly start: number;
  /** The mode a claw / pinch grab would hold: what the music was doing at the start. */
  readonly mode: ScrubMode;
  constructor(playing: boolean, at = 30) {
    this.mode = playing ? "play" : "pause";
    this.playing = playing;
    this.current = at;
    this.start = at;
  }

  /** One frame: the knob moved the playhead by `deltaSec` (and `active` = grabbed). */
  frame(deltaSec: number, active = true, mode: ScrubMode = this.mode): void {
    this.t += FRAME;
    // The audio element plays on by itself between frames.
    if (this.playing) {
      this.current += (FRAME / 1000) * this.rate;
      this.playedSec += (FRAME / 1000) * this.rate;
    }
    this.handTotal += deltaSec;
    const r = stepScrub(
      this.state,
      { t: this.t, active, mode, deltaSec, playing: this.playing, current: this.current, duration: DURATION, seeking: this.t < this.seekingUntil },
      SCRUB,
    );
    this.state = r.state;
    for (const a of r.actions) {
      this.calls.push({ t: this.t, a });
      if (a.type === "seek") {
        this.current = Math.min(DURATION, Math.max(0, a.to));
        this.seekingUntil = this.t + this.seekMs;
      }
      if (a.type === "play") this.playing = true;
      if (a.type === "pause") this.playing = false;
    }
  }
  run(ms: number, deltaPerSec: number, active = true, mode?: ScrubMode): void {
    const n = Math.round(ms / FRAME);
    for (let i = 0; i < n; i++) this.frame((deltaPerSec * FRAME) / 1000, active, mode);
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

  it("moving the knob seeks the playhead, in the right direction, and keeps playing", () => {
    const r = new Rig(true, 30);
    r.run(1000, -2); // scrub backward
    expect(r.seeks().length).toBeGreaterThan(3);
    expect(r.current).toBeLessThan(30 - 0.5);
    expect(r.playing).toBe(true);
    expect(r.types()).not.toContain("play");
    expect(r.types()).not.toContain("pause");
    r.run(1000, +2);
    r.frame(0, false); // release
    expect(r.playing).toBe(true); // keeps playing from the new spot
  });

  it("a slow movement does not re-seek all the time: the music plays between seeks (fewer, bigger seeks)", () => {
    const r = new Rig(true, 30);
    r.run(2000, 0.3); // the hand nudges the music 0.3 s per second
    // The offset has to build to moveThresholdSec before a seek, so about 0.6 / threshold seeks in two seconds, not 40.
    expect(r.seeks().length).toBeGreaterThan(0);
    expect(r.seeks().length).toBeLessThanOrEqual(Math.ceil(0.6 / SCRUB.moveThresholdSec) + 1);
    expect(r.types()).not.toContain("pause");
    expect(r.playing).toBe(true);
  });

  it("each seek goes to where the music is NOW plus the offset the hand built up (the latest position wins)", () => {
    const r = new Rig(true, 30);
    let at = r.current;
    for (let i = 0; i < 120; i++) {
      const before = r.seeks().length;
      r.frame(0.02);
      if (r.seeks().length > before) {
        // `current` already includes this frame's playing; the seek target is current + the accumulated offset.
        expect(r.seeks().at(-1)!.to).toBeGreaterThan(at);
        at = r.seeks().at(-1)!.to;
      }
    }
  });

  it("when the hand stops, the small offset left over is applied after settleMs, so it lands where you stopped", () => {
    const r = new Rig(true, 30);
    r.run(300, 0.25); // 0.075 s: under the move threshold, so no seek yet
    expect(r.seeks()).toEqual([]);
    r.run(SCRUB.settleMs + 3 * FRAME, 0);
    expect(r.seeks().length).toBe(1);
    expect(r.current).toBeCloseTo(r.start + r.playedSec + r.handTotal, 2);
  });

  it("on release the last offset is not lost", () => {
    const r = new Rig(true, 30);
    r.run(100, -3);
    r.frame(-0.02);
    r.frame(0, false);
    expect(r.current).toBeCloseTo(r.start + r.playedSec + r.handTotal, 2);
    expect(r.playing).toBe(true);
  });

  it("while the previous seek is still in flight no new seek is stacked on it; afterwards ONE seek carries everything", () => {
    const r = new Rig(true, 30);
    r.seekMs = 120;
    r.run(2000, -1.5);
    const s = r.seeks();
    expect(s.length).toBeGreaterThan(3);
    // Never closer together than the seek takes (stale seeks are dropped, not queued).
    for (let i = 1; i < s.length; i++) expect(s[i].t - s[i - 1].t).toBeGreaterThanOrEqual(r.seekMs - FRAME);
    r.run(500, 0);
    r.frame(0, false);
    expect(r.current).toBeCloseTo(r.start + r.playedSec + r.handTotal, 1);
  });

  it("a seek that never finishes does not block the scrub for good (stale after staleSeekMs)", () => {
    const r = new Rig(true, 30);
    r.seekMs = 10_000;
    r.run(2000, -1.5);
    expect(r.seeks().length).toBeGreaterThan(2);
  });
});

describe("seek rate limit", () => {
  it("never more than maxSeeksPerSec in any one second, even with a fast hand at 60 fps", () => {
    const r = new Rig(true, 60);
    r.run(5000, -8);
    const seeks = r.seeks();
    expect(seeks.length).toBeGreaterThan(40);
    for (let i = 0; i + SCRUB.maxSeeksPerSec < seeks.length; i++) {
      expect(seeks[i + SCRUB.maxSeeksPerSec].t - seeks[i].t).toBeGreaterThanOrEqual(1000 - FRAME);
    }
  });

  it("the same limit holds while paused", () => {
    const r = new Rig(false, 30);
    r.run(4000, 6);
    const seeks = r.seeks();
    for (let i = 0; i + SCRUB.maxSeeksPerSec < seeks.length; i++) {
      expect(seeks[i + SCRUB.maxSeeksPerSec].t - seeks[i].t).toBeGreaterThanOrEqual(1000 - FRAME);
    }
  });
});

describe("scrub while paused: short snippets", () => {
  it("the first movement sounds a snippet, then it pauses again and the playhead ends at the scrub position", () => {
    const r = new Rig(false, 30);
    r.run(1000, 2);
    expect(r.types()).toContain("play");
    r.run(SCRUB.snippetMs + 3 * FRAME, 0);
    expect(r.playing).toBe(false);
    expect(r.current).toBeCloseTo(r.state.pos, 6);
    expect(r.current).toBeCloseTo(r.start + r.handTotal, 6);
  });

  it("while moving it keeps sounding (one chain, not a play per seek), and the playhead follows the hand", () => {
    const r = new Rig(false, 30);
    r.run(1500, 2);
    expect(r.playing).toBe(true);
    expect(r.types().filter((t) => t === "play")).toHaveLength(1);
    expect(r.current).toBeGreaterThan(31.5);
  });

  it("it stops sounding snippetMs after the hand stops, not before and not much later", () => {
    const r = new Rig(false, 30);
    r.run(400, 2);
    const stoppedAt = r.t;
    r.run(600, 0);
    const pauseAt = r.calls.find((c) => c.a.type === "pause")!.t;
    expect(pauseAt - stoppedAt).toBeGreaterThanOrEqual(SCRUB.snippetMs - FRAME);
    expect(pauseAt - stoppedAt).toBeLessThan(SCRUB.snippetMs + 2 * FRAME + 1);
  });

  it("stays paused on release, exactly at the scrub position", () => {
    const r = new Rig(false, 30);
    r.run(800, -2);
    r.frame(0, false); // release mid-snippet
    expect(r.playing).toBe(false);
    expect(r.current).toBeCloseTo(r.start + r.handTotal, 6);
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

  it("a slow movement does not re-seek every frame either: seeks come only when the audio has drifted from the hand", () => {
    const r = new Rig(false, 30);
    r.run(2000, 0.3);
    // The audio plays at 1x while the hand moves at 0.3x, so it drifts ahead by 0.7 s/s and is re-seeked each
    // moveThresholdSec / 0.7: about 7 a second, not 60.
    expect(r.seeks().length).toBeLessThanOrEqual(Math.ceil((2 * 0.7) / SCRUB.moveThresholdSec) + 2);
  });
});

describe("palm <-> fist: the mode switches under a held grab", () => {
  it("palm -> fist pauses at exactly the position the hand has put the music, without releasing", () => {
    const r = new Rig(true, 30);
    r.run(500, -1.5, true, "play");
    r.frame(-0.01, true, "play");
    const expected = r.start + r.playedSec + r.handTotal; // the playing music, moved by the hand so far
    r.frame(0, true, "pause");
    expect(r.playing).toBe(false);
    expect(r.state.active).toBe(true);
    expect(r.current).toBeCloseTo(expected + FRAME / 1000 * 0, 1);
    // From here it is a paused scrub: it stays exactly where the hand puts it.
    r.run(600, 1, true, "pause");
    r.run(SCRUB.snippetMs + 3 * FRAME, 0, true, "pause");
    expect(r.playing).toBe(false);
    expect(r.current).toBeCloseTo(r.state.pos, 6);
  });

  it("fist -> palm resumes playing from the exact scrub position, without releasing", () => {
    const r = new Rig(false, 30);
    r.run(500, 1.5, true, "pause");
    r.run(300, 0, true, "pause");
    const pos = r.current;
    r.frame(0, true, "play");
    expect(r.playing).toBe(true);
    expect(r.state.active).toBe(true);
    expect(r.current).toBeCloseTo(pos, 6);
    r.run(500, 0, true, "play");
    expect(r.current).toBeGreaterThan(pos + 0.4); // it plays on
  });

  it("toggling back and forth many times never releases and keeps reporting scrubbing", () => {
    const r = new Rig(true, 30);
    for (let i = 0; i < 10; i++) {
      r.run(300, 0.5, true, i % 2 === 0 ? "play" : "pause");
      expect(r.state.active).toBe(true);
    }
    expect(r.calls.filter((c) => c.a.type === "pause").length).toBeGreaterThanOrEqual(5);
    expect(r.calls.filter((c) => c.a.type === "play").length).toBeGreaterThanOrEqual(4);
  });

  it("a grab that begins in fist mode pauses music that was playing; one that begins in palm mode plays paused music", () => {
    const a = new Rig(true, 30);
    a.frame(0, true, "pause");
    expect(a.playing).toBe(false);
    const b = new Rig(false, 30);
    b.frame(0, true, "play");
    expect(b.playing).toBe(true);
  });

  it("releasing in palm mode leaves it playing, in fist mode leaves it paused at the exact spot", () => {
    const a = new Rig(true, 30);
    a.run(400, 1, true, "play");
    a.frame(0, false, "play");
    expect(a.playing).toBe(true);
    const b = new Rig(true, 30);
    b.run(400, 1, true, "play");
    b.run(300, 1, true, "pause");
    const pos = b.state.pos;
    b.frame(0, false, "pause");
    expect(b.playing).toBe(false);
    expect(b.current).toBeCloseTo(pos, 6);
  });
});

describe("at 2x speed (R5)", () => {
  it("playing: the scrub still lands where the hand put the music, whatever the speed, and keeps playing", () => {
    for (const rate of [0.5, 0.75, 0.85, 1, 2]) {
      const r = new Rig(true, 30);
      r.rate = rate;
      r.run(1500, -1.5);
      r.run(300, 0);
      r.frame(0, false);
      expect(r.current).toBeCloseTo(r.start + r.playedSec + r.handTotal, 1);
      expect(r.playing).toBe(true);
    }
  });

  it("playing: fewer, bigger seeks than frames, and never over the rate limit", () => {
    const r = new Rig(true, 30);
    r.rate = 2;
    r.run(3000, 0.3);
    const seeks = r.seeks();
    expect(seeks.length).toBeGreaterThan(0);
    expect(seeks.length).toBeLessThan(3000 / FRAME / 4);
    for (let i = 0; i + SCRUB.maxSeeksPerSec < seeks.length; i++) expect(seeks[i + SCRUB.maxSeeksPerSec].t - seeks[i].t).toBeGreaterThanOrEqual(1000 - FRAME);
  });

  it("paused: snippets play at 2x, and it still stops and lands exactly on the scrub position", () => {
    const r = new Rig(false, 30);
    r.rate = 2;
    r.run(1200, 1.5);
    expect(r.playing).toBe(true);
    r.run(SCRUB.snippetMs + 3 * FRAME, 0);
    expect(r.playing).toBe(false);
    expect(r.current).toBeCloseTo(r.start + r.handTotal, 6);
  });

  it("palm -> fist at 2x pauses exactly where the hand has put the music; fist -> palm resumes from there", () => {
    const r = new Rig(true, 30);
    r.rate = 2;
    r.run(600, -1, true, "play");
    const expected = r.start + r.playedSec + r.handTotal;
    r.frame(0, true, "pause");
    expect(r.playing).toBe(false);
    expect(Math.abs(r.current - expected)).toBeLessThan(0.1);
    const at = r.current;
    r.frame(0, true, "play");
    expect(r.playing).toBe(true);
    r.run(500, 0, true, "play");
    expect(r.current - at).toBeCloseTo(1, 0); // 0.5 s of real time at 2x
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

  it("pinned at 0:00 while paused it stops asking for seeks", () => {
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
    const inp = (active: boolean) => ({ t: 1000, active, mode: "play" as const, deltaSec: 0, playing: true, current: 5, duration: 60 });
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
