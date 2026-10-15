/**
 * R4c: the whole steering-wheel chain with the real modules, the way main.ts runs it each frame:
 * hands -> clutch detectors -> modifier shape -> steering mode (debounced) -> knob (target picked by the
 * left hand) -> scrub / nudge -> a real AudioPlayer over a fake audio element; per-hand commands (marks)
 * run beside it, blocked while the wheel is held.
 */
import { describe, expect, it } from "vitest";
import { AudioPlayer, type MediaLike } from "./audioPlayer";
import { DEFAULT_BOXES, type Vec2 } from "./box";
import { initialClutchState, stepClutches, twoHandRoles } from "./clutch";
import { CLUTCH, COMMANDS, KNOB, SCRUB, SPEED, STEER } from "./config";
import { INITIAL_MACHINES, stepHandCommands } from "./handCommands";
import { IDLE_KNOB, stepKnob, type KnobChoice } from "./knob";
import type { KnobHand } from "./knobClutch";
import { selectClutch, suppressFor } from "./knobClutch";
import { NO_LOOP, type LoopState } from "./loop";
import { IDLE_SCRUB, stepScrub } from "./scrub";
import { IDLE_STEER, classifySteerShape, stepSteerMode, targetOf, type SteerMode } from "./steerMode";
import { IDLE_STEER_AUDIO, stepSteerAudio } from "./steerAudio";
import { wheelSteps } from "./speed";
import { chord } from "./test/fixtures";
import { actionForFire, runNudge, runTransport } from "./transport";

const FRAME = 33;
const DURATION = 120;
const LEFT: Vec2 = { x: 0.25, y: 0.5 };
const RIGHT: Vec2 = { x: 0.75, y: 0.5 };

/** The audio element, minimal: a playhead that advances while playing, and every call logged. */
class FakeMedia implements MediaLike {
  src = "";
  currentTime = 0;
  readonly duration = DURATION;
  paused = true;
  ended = false;
  playbackRate = 1;
  calls: string[] = [];
  play(): Promise<void> {
    this.paused = false;
    this.calls.push("play");
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    this.calls.push("pause");
  }
  load(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

interface Pose {
  /** Left (modifier) hand: the model's label and the finger reach. Omit for no left hand. */
  left?: { shape: string; clawExt?: number; score?: number; bits?: string };
  /** Right (steering) hand tilt, degrees; omit for no right hand. */
  tilt?: number;
  /** Where the right hand is (default inside its box). */
  right?: Vec2;
}

const PALM = { shape: "Open_Palm", clawExt: 1.9 };
const FIST = { shape: "Closed_Fist", clawExt: 1.0, score: 0.6 };
const V = { shape: "Victory", clawExt: 1.5 };
const INDEX = { shape: "Pointing_Up", clawExt: 1.3 };
/** The shaka has no model label: the finger chord 10001 says it (the model may say anything). */
const SHAKA = { shape: "None", clawExt: 1.2, score: 0.2, bits: "10001" };

class Wheel {
  media = new FakeMedia();
  player = new AudioPlayer(this.media, { create: () => "blob:x", revoke: () => {} });
  loop: LoopState = NO_LOOP;
  clutch = initialClutchState();
  knob = IDLE_KNOB;
  steer = IDLE_STEER;
  audio = IDLE_STEER_AUDIO;
  scrub = IDLE_SCRUB;
  machines = INITIAL_MACHINES;
  t = 1000;
  tilt = 0;
  lastScrubT = -Infinity;
  fires: string[] = [];
  modes: (SteerMode | null)[] = [];
  releases = 0;
  grabs = 0;
  seekCount = 0;
  speedAccum = 0;
  choice: KnobChoice = { clutch: "twoHand", motion: "tilt", mapping: "relative", target: "playhead", gain: 1, deadZoneDeg: 12, invert: false };

  constructor(playing = true, at = 30) {
    this.media.currentTime = at;
    this.media.paused = !playing;
  }

  get playing(): boolean {
    return this.player.state === "playing";
  }
  get grabbed(): boolean {
    return this.knob.grabbed;
  }

  /** One camera frame (33 ms) showing `pose`. */
  frame(pose: Pose): void {
    this.t += FRAME;
    if (!this.media.paused) this.media.currentTime += FRAME / 1000;

    const hands = [] as { hand: "Left" | "Right"; shape: string; palm: Vec2; clawExt: number; tiltDeg: number; score: number; bits?: string }[];
    if (pose.left) hands.push({ hand: "Left", shape: pose.left.shape, palm: LEFT, clawExt: pose.left.clawExt ?? 1.9, tiltDeg: 0, score: pose.left.score ?? 0.9, bits: pose.left.bits });
    if (pose.tilt !== undefined) hands.push({ hand: "Right", shape: "None", palm: pose.right ?? RIGHT, clawExt: 1.9, tiltDeg: pose.tilt, score: 0.9 });
    const steerShape = (h: (typeof hands)[number]) => classifySteerShape({ shape: h.shape, shapeScore: h.score, clawExt: h.clawExt, chord: h.bits ? chord(h.bits) : undefined });

    const c = stepClutches(
      this.clutch,
      {
        t: this.t,
        box: DEFAULT_BOXES,
        hands: hands.map((h) => ({ hand: h.hand, shape: h.shape, palm: h.palm, pinchRatio: 0.9, clawExt: h.clawExt, othersReach: 1.9, steerShape: steerShape(h) })),
      },
      CLUTCH,
    );
    this.clutch = c.state;
    const kh: KnobHand[] = hands.map((h) => ({ hand: h.hand, palm: h.palm, tiltDeg: h.tiltDeg }));
    const roles = twoHandRoles(kh, CLUTCH);
    const modifierShape = roles ? steerShape(hands[kh.indexOf(roles.modifier)]) : null;
    const pick = selectClutch("twoHand", c.view, kh, CLUTCH, KNOB.steeringHand, modifierShape);
    const sm = stepSteerMode(this.steer, { t: this.t, grabbed: pick.grabbed, shape: modifierShape });
    this.steer = sm.state;
    this.modes.push(sm.mode);
    const wasGrabbed = this.knob.grabbed;
    const k = stepKnob(
      this.knob,
      { t: this.t, grabbed: pick.grabbed, hand: pick.steering ? { tiltDeg: pick.steering.tiltDeg, palm: pick.steering.palm } : null, aspect: 16 / 9, target: sm.mode ? targetOf(sm.mode) : undefined },
      this.choice,
      KNOB,
      CLUTCH.releaseGraceMs,
    );
    this.knob = k.state;
    if (k.out.started && !wasGrabbed) this.grabs++;
    if (k.out.released) this.releases++;

    // Apply the knob's movement to the target the mode picked (main.ts applyKnob).
    // What the left hand does to the music (R4d: steerAudio.ts).
    this.audio = stepSteerAudio(this.audio, { grabbed: k.out.grabbed, mode: sm.mode, playing: this.playing });
    const scrubMode = this.audio.scrub;
    const speedMode = sm.mode === "speed";
    if (k.out.target === "playhead" && !speedMode) {
      const sr = stepScrub(
        this.scrub,
        { t: this.t, active: k.out.grabbed && this.player.loaded, mode: scrubMode, deltaSec: k.out.applySec, playing: this.playing, current: this.player.currentTime, duration: DURATION, seeking: false },
        SCRUB,
      );
      this.scrub = sr.state;
      if (sr.scrubbing) this.lastScrubT = this.t;
      this.run(sr.actions);
    } else {
      if (this.scrub.active) this.run(stepScrub(this.scrub, { t: this.t, active: false, mode: scrubMode, deltaSec: 0, playing: this.playing, current: this.player.currentTime, duration: DURATION }, SCRUB).actions);
      this.scrub = IDLE_SCRUB;
      if (!speedMode) this.speedAccum = 0;
      if (speedMode) this.stepSpeed(k.out.turnDeg);
      else if (k.out.applySec !== 0) this.loop = runNudge(this.player, this.loop, k.out.applySec, k.out.target as "start" | "end").loop;
    }

    // Commands (the marks), beside it.
    const grabbed = pick.grabbed || k.out.grabbed;
    const r = stepHandCommands(
      this.machines,
      {
        t: this.t,
        hands: hands.map((h) => ({ hand: h.hand, shape: h.shape, shapeScore: h.score, palmFacing: true, palm: h.palm })),
        boxes: DEFAULT_BOXES,
        suppress: suppressFor("twoHand", grabbed, pick.steering?.hand ?? null),
      },
      COMMANDS,
    );
    this.machines = r.state;
    for (const f of r.fired) {
      this.fires.push(`${f.hand} ${f.shape}`);
      const action = actionForFire(f);
      if (action) this.loop = runTransport(this.player, this.loop, action, { markAt: this.player.currentTime }).loop;
    }
  }

  /** main.ts stepSpeedWheel. */
  private stepSpeed(turnDeg: number): void {
    const w = wheelSteps(this.speedAccum, turnDeg, this.player.rate);
    this.speedAccum = w.accumDeg;
    for (let i = 0; i < Math.abs(w.steps); i++) {
      const before = this.player.rate;
      runTransport(this.player, this.loop, w.steps > 0 ? "speedUp" : "speedDown");
      if (this.player.rate === before) {
        this.speedAccum = 0;
        break;
      }
    }
  }

  private run(actions: ReturnType<typeof stepScrub>["actions"]): void {
    for (const a of actions) {
      if (a.type === "seek") {
        this.player.seek(a.to);
        this.seekCount++;
      } else if (a.type === "play") void this.player.play();
      else this.player.pause();
    }
  }

  /** Show a pose for `ms`; `tilt` may be a function of the elapsed ms (a turn). */
  show(ms: number, pose: Pose | ((elapsed: number) => Pose)): void {
    const start = this.t;
    const end = this.t + ms;
    while (this.t < end) this.frame(typeof pose === "function" ? pose(this.t + FRAME - start) : pose);
  }

  /** Turn the right hand from `from` to `to` degrees over `ms`, with the left hand showing `left`. */
  turn(ms: number, from: number, to: number, left: Pose["left"]): void {
    this.show(ms, (e) => ({ left, tilt: from + ((to - from) * Math.min(1, e / ms)) }));
    this.tilt = to;
  }
}

describe("grabbing the wheel", () => {
  it("left open palm up + right hand in its box = grabbed, and the music is left exactly as it was (R4d)", () => {
    const paused = new Wheel(false);
    paused.show(600, { left: PALM, tilt: 0 });
    expect(paused.grabbed).toBe(true);
    expect(paused.steer.mode).toBe("palm");
    expect(paused.playing).toBe(false); // the left hand never starts playback
    const playing = new Wheel(true);
    playing.show(600, { left: PALM, tilt: 0 });
    expect(playing.grabbed).toBe(true);
    expect(playing.playing).toBe(true);
  });

  it("R4d: a grab starts with palm, V or index (any left mode shape but the fist) while the right hand is in its box, at once", () => {
    for (const [left, mode] of [[PALM, "palm"], [V, "start"], [INDEX, "end"]] as const) {
      const w = new Wheel(true);
      w.loop = { start: 20, end: 40 };
      w.show(FRAME * 3, { left, tilt: 0 });
      expect(w.grabbed, mode).toBe(true);
      expect(w.steer.mode).toBe(mode);
    }
  });

  it("R4d: a fist can NOT start a grab (a loose hand hanging in view would pause the music), but it continues one", () => {
    const w = new Wheel(true);
    w.show(600, { left: FIST, tilt: 0 });
    expect(w.grabbed).toBe(false);
    expect(w.playing).toBe(true);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: FIST, tilt: 0 });
    expect(w.grabbed).toBe(true);
    expect(w.steer.mode).toBe("fist");
  });

  it("the right hand must be in its box to start (outside it a V is just a mark)", () => {
    const w = new Wheel(true);
    w.show(600, { left: V, tilt: 0, right: { x: 0.3, y: 0.5 } });
    expect(w.grabbed).toBe(false);
  });
});

describe("R4d: what the left hand does to the music", () => {
  it("palm never starts playback: paused stays paused through a whole steer; playing keeps playing", () => {
    const paused = new Wheel(false, 30);
    paused.show(300, { left: PALM, tilt: 0 });
    paused.turn(1000, 0, 40, PALM);
    paused.show(1000, { left: PALM, tilt: 40 });
    expect(paused.playing).toBe(false);
    expect(paused.player.currentTime).toBeGreaterThan(30.5); // it did scrub (in snippets) and ended paused
    const playing = new Wheel(true, 30);
    playing.show(300, { left: PALM, tilt: 0 });
    playing.turn(1000, 0, 40, PALM);
    expect(playing.playing).toBe(true);
    expect(playing.media.calls.filter((c) => c === "pause")).toEqual([]);
  });

  it("fist pauses while closed and the palm resumes it (the fist did the pausing)", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: FIST, tilt: 0 });
    expect(w.playing).toBe(false);
    expect(w.audio.fistOwns).toBe(true);
    w.show(STEER.modeDebounceMs + 300, { left: PALM, tilt: 0 });
    expect(w.playing).toBe(true);
    expect(w.audio.fistOwns).toBe(false);
  });

  it("already paused: the fist changes nothing and opening to a palm does not start the music", () => {
    const w = new Wheel(false, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: FIST, tilt: 0 });
    expect(w.playing).toBe(false);
    expect(w.audio.fistOwns).toBe(false);
    w.show(STEER.modeDebounceMs + 300, { left: PALM, tilt: 0 });
    expect(w.playing).toBe(false);
    expect(w.media.calls.filter((c) => c === "play")).toEqual([]);
  });

  it("fist -> V -> palm: the pause stays through the loop-start steering, the palm then resumes", () => {
    const w = new Wheel(true, 30);
    w.loop = { start: 20, end: 40 };
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: FIST, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: V, tilt: 0 });
    expect(w.steer.mode).toBe("start");
    expect(w.playing).toBe(false);
    w.show(STEER.modeDebounceMs + 300, { left: PALM, tilt: 0 });
    expect(w.playing).toBe(true);
  });

  it("letting go while the fist is closed leaves the music paused (a hand leaving the frame never starts it)", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: FIST, tilt: 0 });
    w.show(1500, {});
    expect(w.grabbed).toBe(false);
    expect(w.playing).toBe(false);
    expect(w.audio.fistOwns).toBe(false);
  });

  it("a V started grab keeps the music as it was too", () => {
    const w = new Wheel(true, 30);
    w.loop = { start: 20, end: 40 };
    w.show(600, { left: V, tilt: 0 });
    expect(w.playing).toBe(true);
  });
});

describe("the left hand picks the mode, live, while the grab continues", () => {
  it("palm: steers the playhead with the music PLAYING; it plays on from where you stop", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.turn(1500, 0, 40, PALM);
    expect(w.grabbed).toBe(true);
    expect(w.playing).toBe(true);
    expect(w.player.currentTime).toBeGreaterThan(30 + 1.5 + 2); // the music moved on AND the hand pushed it ahead
    const stopped = w.player.currentTime;
    w.show(1000, { left: PALM, tilt: 40 });
    expect(Math.abs(w.player.currentTime - stopped - 1)).toBeLessThan(0.15); // plays at 1x: the hand adds next to nothing once it has stopped
  });

  it("fist: PAUSES and steers the playhead; it stays exactly where you stop", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: FIST, tilt: 0 });
    expect(w.steer.mode).toBe("fist");
    expect(w.playing).toBe(false);
    const at = w.player.currentTime;
    w.turn(1000, 0, 40, FIST);
    expect(w.player.currentTime).toBeGreaterThan(at + 0.5);
    w.show(600, { left: FIST, tilt: 40 });
    const still = w.player.currentTime;
    w.show(1000, { left: FIST, tilt: 40 });
    expect(w.player.currentTime).toBe(still);
    expect(w.playing).toBe(false);
    // Let go (both hands down): it stays paused at that exact spot.
    w.show(800, {});
    expect(w.grabbed).toBe(false);
    expect(w.playing).toBe(false);
    expect(w.player.currentTime).toBeCloseTo(still, 3);
  });

  it("palm -> fist pauses and fist -> palm resumes WITHOUT letting go (one grab, one start, no release)", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    for (let i = 0; i < 3; i++) {
      w.show(400, { left: FIST, tilt: 0 });
      expect(w.playing).toBe(false);
      expect(w.grabbed).toBe(true);
      w.show(400, { left: PALM, tilt: 0 });
      expect(w.playing).toBe(true);
      expect(w.grabbed).toBe(true);
    }
    expect(w.grabs).toBe(1);
    expect(w.releases).toBe(0);
  });

  it("V steers the loop START and index the loop END (only the markers move: the music keeps doing what it was doing)", () => {
    const w = new Wheel(true, 30);
    w.loop = { start: 20, end: 40 };
    w.show(300, { left: PALM, tilt: 0 });
    w.show(300, { left: V, tilt: 0 });
    expect(w.steer.mode).toBe("start");
    w.turn(1500, 0, 30, V);
    expect((w.loop.start as number) > 20).toBe(true);
    expect(w.loop.end).toBe(40);
    expect(w.playing).toBe(true);
    const start = w.loop.start;
    w.show(300, { left: INDEX, tilt: 30 });
    expect(w.steer.mode).toBe("end");
    w.turn(1500, 30, 0, INDEX);
    expect((w.loop.end as number) < 40).toBe(true);
    expect(w.loop.start).toBe(start);
    expect(w.grabs).toBe(1);
    expect(w.releases).toBe(0);
  });

  it("the same clamps as before: START stops 0.5 s before END, and END 0.5 s after START", () => {
    const w = new Wheel(false, 30);
    w.loop = { start: 20, end: 24 };
    w.show(300, { left: PALM, tilt: 0 });
    w.show(300, { left: V, tilt: 0 });
    // A fast flick is boosted (the wheel's acceleration): one sweep reaches the clamp.
    w.turn(300, 0, 80, V);
    w.show(500, { left: V, tilt: 80 });
    expect(w.loop.start).toBeCloseTo(24 - 0.5, 2);
    // Turning further does nothing; turning back leaves the clamp at once (no wound-up travel).
    w.turn(300, 80, 95, V);
    expect(w.loop.start).toBeCloseTo(24 - 0.5, 2);
    w.turn(1500, 95, 60, V);
    expect(w.loop.start as number).toBeLessThan(24 - 0.5 - 0.5);
    w.show(300, { left: INDEX, tilt: 60 });
    w.turn(300, 60, -60, INDEX);
    w.show(500, { left: INDEX, tilt: -60 });
    expect(w.loop.end).toBeCloseTo((w.loop.start as number) + 0.5, 2);
  });

  it("V with no loop set moves nothing and creates nothing", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(300, { left: V, tilt: 0 });
    w.turn(1000, 0, 40, V);
    expect(w.loop).toEqual(NO_LOOP);
  });

  it("switching mode keeps the wheel's pose as the reference: no jump when the target changes", () => {
    const w = new Wheel(true, 30);
    w.loop = { start: 20, end: 40 };
    w.show(300, { left: PALM, tilt: 0 });
    w.turn(800, 0, 35, PALM); // the playhead moved
    w.show(500, { left: PALM, tilt: 35 });
    const before = w.loop.start;
    w.show(STEER.modeDebounceMs + 200, { left: V, tilt: 35 }); // tilt held: START must not move on the switch
    expect(w.loop.start).toBe(before);
  });
});

describe("a flicker of the left hand's shape must not toggle play / pause or let go", () => {
  it("one or two frames of fist in a held palm: still playing, still grabbed", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    for (let i = 0; i < 8; i++) {
      w.show(FRAME * 2, { left: FIST, tilt: 0 });
      w.show(300, { left: PALM, tilt: 0 });
    }
    expect(w.playing).toBe(true);
    expect(w.releases).toBe(0);
    expect(w.media.calls.filter((c) => c === "pause")).toEqual([]);
  });

  it("frames where the model has no shape for the left hand (a fist read as 'None') hold the mode and freeze the value, and do not release", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: FIST, tilt: 0 });
    expect(w.steer.mode).toBe("fist");
    const NONE = { shape: "None", clawExt: 1.6, score: 0.2 }; // not curled in, no label: no shape at all
    w.show(FRAME * 3, { left: NONE, tilt: 0 });
    expect(w.grabbed).toBe(true);
    expect(w.steer.mode).toBe("fist");
    expect(w.playing).toBe(false);
    // The wheel is frozen meanwhile: turning it moves nothing...
    const at = w.player.currentTime;
    w.show(FRAME * 3, { left: NONE, tilt: 40 });
    expect(w.player.currentTime).toBe(at);
    // ...and there is no jump when a shape comes back.
    w.show(300, { left: FIST, tilt: 40 });
    expect(w.player.currentTime).toBe(at);
  });

  it("a fist labelled 'None' with the fingers curled in still counts as a fist (the geometry fallback)", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: { shape: "None", clawExt: 1.0, score: 0 }, tilt: 0 });
    expect(w.steer.mode).toBe("fist");
    expect(w.playing).toBe(false);
  });

  it("a shape that is none of the four for longer than the grace lets go", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(CLUTCH.releaseGraceMs + 300, { left: { shape: "None", clawExt: 1.6, score: 0.2 }, tilt: 0 });
    expect(w.grabbed).toBe(false);
    expect(w.releases).toBe(1);
  });
});

describe("marks vs. steering: left V / index set IN / OUT only when the right hand is NOT steering", () => {
  it("right hand not steering: left V marks IN at the playhead, then left index marks OUT (as today)", () => {
    const w = new Wheel(true, 30);
    w.show(1000, { left: V }); // no right hand in view: ring fills, fires once
    expect(w.fires).toEqual(["Left Victory"]);
    expect(w.loop.start).not.toBeNull();
    expect(w.grabbed).toBe(false);
    w.show(1500, {});
    w.show(1000, { left: INDEX });
    expect(w.fires).toEqual(["Left Victory", "Left Pointing_Up"]);
    expect(w.loop.end).not.toBeNull();
  });

  it("right hand in view but outside its box (not steering): marks still work", () => {
    const w = new Wheel(true, 30);
    w.show(1000, { left: V, tilt: 0, right: { x: 0.3, y: 0.5 } });
    expect(w.fires).toEqual(["Left Victory"]);
    expect(w.grabbed).toBe(false);
  });

  it("while steering, V / index select the target and do NOT mark: no command fires however long they are held", () => {
    const w = new Wheel(true, 30);
    w.loop = { start: 20, end: 40 };
    w.show(300, { left: PALM, tilt: 0 });
    w.show(2500, { left: V, tilt: 0 });
    w.show(2500, { left: INDEX, tilt: 0 });
    expect(w.steer.mode).toBe("end");
    expect(w.fires).toEqual([]);
    expect(w.loop).toEqual({ start: 20, end: 40 });
  });

  it("right after the wheel lets go, a command can't fire by accident (the post-grab block holds)", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(600, { left: V, tilt: 0 });
    w.show(COMMANDS.suppressCooldownMs - FRAME * 4, { left: V });
    expect(w.fires).toEqual([]);
  });
});

describe("snappy: stopping the rotation stops the movement", () => {
  it("paused (fist): the playhead stops changing within a frame or two of the hand stopping", () => {
    const w = new Wheel(false, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: FIST, tilt: 0 });
    w.turn(500, 0, 40, FIST);
    const frames: number[] = [];
    for (let i = 0; i < 40; i++) {
      w.frame({ left: FIST, tilt: 40 });
      frames.push(w.scrub.pos);
    }
    // After the turn ended, the scrub position may move for the smoothing's tail (a couple of frames) and then never again.
    let lastChange = -1;
    frames.forEach((p, i) => {
      if (i > 0 && p !== frames[i - 1]) lastChange = i;
    });
    expect(lastChange).toBeLessThanOrEqual(3);
  });

  it("the joystick, for contrast, keeps the playhead moving for as long as the hand stays tilted", () => {
    const w = new Wheel(false, 30);
    w.choice = { ...w.choice, mapping: "joystick" };
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: FIST, tilt: 0 });
    w.turn(500, 0, 40, FIST);
    const a = w.scrub.pos;
    w.show(1000, { left: FIST, tilt: 40 });
    expect(w.scrub.pos).toBeGreaterThan(a + 1);
  });

  it("playing (palm): no seeks at all once the hand has stopped and the offset is applied", () => {
    const w = new Wheel(true, 30);
    w.show(300, { left: PALM, tilt: 0 });
    w.turn(500, 0, 40, PALM);
    w.show(500, { left: PALM, tilt: 40 });
    const n = w.seekCount;
    w.show(2000, { left: PALM, tilt: 40 });
    expect(w.seekCount).toBe(n);
  });
});

describe("R5b: the left shaka puts the wheel in speed mode (0.025 steps, the music keeps playing)", () => {
  const stepDeg = SPEED.stepDeg;
  const startSpeed = (w: Wheel) => {
    w.show(300, { left: PALM, tilt: 0 });
    w.show(STEER.modeDebounceMs + 300, { left: SHAKA, tilt: 0 });
  };

  it("a shaka (chord 10001, whatever the label) with the right hand in its box starts a grab in speed mode, at once", () => {
    const w = new Wheel(true, 30);
    w.show(FRAME * 3, { left: SHAKA, tilt: 0 });
    expect(w.grabbed).toBe(true);
    expect(w.steer.mode).toBe("speed");
  });

  it("clockwise turns speed up, counter-clockwise slow down, one 0.025 step per stepDeg, and 1.0 is a stop", () => {
    const w = new Wheel(true, 30);
    startSpeed(w);
    expect(w.player.rate).toBe(1);
    w.turn(1000, 0, -(stepDeg * 3 + 4), SHAKA);
    w.show(250, { left: SHAKA, tilt: -(stepDeg * 3 + 4) });
    expect(w.player.rate).toBeCloseTo(0.925, 6); // three steps down
    w.turn(1000, -(stepDeg * 3 + 4), -30, SHAKA);
    w.show(250, { left: SHAKA, tilt: -30 });
    expect(w.player.rate).toBeCloseTo(0.975, 6); // two steps up
    w.turn(1500, -30, 4 * stepDeg, SHAKA);
    w.show(250, { left: SHAKA, tilt: 4 * stepDeg });
    expect(w.player.rate).toBe(1); // clamped at 1.0, however far it is turned
  });

  it("the music keeps PLAYING through it, at the new speed, with no seeks and no pause", () => {
    const w = new Wheel(true, 30);
    startSpeed(w);
    w.media.calls.length = 0;
    const seeks = w.seekCount;
    w.turn(1500, 0, -4 * stepDeg, SHAKA);
    w.show(250, { left: SHAKA, tilt: -4 * stepDeg });
    w.show(500, { left: SHAKA, tilt: -4 * stepDeg });
    expect(w.playing).toBe(true);
    expect(w.player.rate).toBeCloseTo(0.9, 6);
    expect(w.media.calls).toEqual([]);
    expect(w.seekCount).toBe(seeks);
  });

  it("the whole range (0.5 to 1.0) is four full circles: it stops at 0.5 and leaves it at once when reversed (no wound-up travel)", () => {
    const w = new Wheel(true, 30);
    startSpeed(w);
    let tilt = 0;
    const rot = (to: number) => {
      w.turn(1500, tilt, to, SHAKA);
      w.show(250, { left: SHAKA, tilt: to });
      tilt = to;
    };
    for (let i = 1; i <= 8; i++) rot(-90 * i); // two turns: about 0.75
    expect(w.player.rate).toBeGreaterThanOrEqual(0.75 - 1e-9); // 10 steps (a little direction latency may cost one)
    expect(w.player.rate).toBeLessThanOrEqual(0.775 + 1e-9);
    for (let i = 9; i <= 17; i++) rot(-90 * i); // four turns and a bit: 0.5
    expect(w.player.rate).toBeCloseTo(0.5, 6);
    rot(tilt - 150); // further: nothing
    expect(w.player.rate).toBeCloseTo(0.5, 6);
    rot(tilt + stepDeg + 2); // back one step's worth: up at once
    expect(w.player.rate).toBeCloseTo(0.525, 6);
  });

  it("a shaka held still changes nothing; so does a hand that only jitters", () => {
    const w = new Wheel(true, 30);
    startSpeed(w);
    w.show(2000, (e) => ({ left: SHAKA, tilt: Math.sin(e / 60) * 2 }));
    expect(w.player.rate).toBe(1);
  });

  it("the speed mode moves no playhead and no loop marker, and no command fires", () => {
    const w = new Wheel(true, 30);
    w.loop = { start: 20, end: 40 };
    startSpeed(w);
    const at = w.player.currentTime;
    w.turn(1000, 0, -60, SHAKA);
    w.show(250, { left: SHAKA, tilt: -60 });
    expect(w.loop).toEqual({ start: 20, end: 40 });
    const moved = w.player.currentTime - at;
    expect(moved).toBeGreaterThan(1.0);
    expect(moved).toBeLessThan(1.4); // it just played on (about 1.25 s at 0.9x to 1x), no scrub
    expect(w.fires).toEqual([]);
  });

  it("palm -> shaka -> palm: the playhead scrub stops and starts again, one grab throughout", () => {
    const w = new Wheel(true, 30);
    startSpeed(w);
    w.show(STEER.modeDebounceMs + 300, { left: PALM, tilt: 0 });
    expect(w.steer.mode).toBe("palm");
    const before = w.player.currentTime;
    w.turn(1000, 0, 40, PALM);
    expect(w.player.currentTime - before).toBeGreaterThan(2); // scrubbed ahead
    expect(w.grabs).toBe(1);
    expect(w.releases).toBe(0);
  });

  it("a thumbs up (10000) or a fist (00000) in the left hand is not a shaka: no speed change", () => {
    for (const bits of ["10000", "00000"]) {
      const w = new Wheel(true, 30);
      w.show(300, { left: PALM, tilt: 0 });
      w.show(STEER.modeDebounceMs + 300, { left: { shape: "Thumb_Up", clawExt: 1.0, score: 0.9, bits }, tilt: 0 });
      expect(w.steer.mode).toBe("fist");
      w.turn(1000, 0, -150, { shape: "Thumb_Up", clawExt: 1.0, score: 0.9, bits });
      expect(w.player.rate).toBe(1);
    }
  });
});
