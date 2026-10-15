import { describe, expect, it } from "vitest";
import { AudioPlayer } from "./audioPlayer";
import { DEFAULT_BOXES } from "./box";
import { COMMANDS, LOOP } from "./config";
import type { Handedness } from "./hand";
import { INITIAL_MACHINES, stepHandCommands, type HandCmdObs, type HandFire, type HandMachines } from "./handCommands";
import { NO_LOOP, markPlayhead, trackRingStart, type LoopState, type RingStamp } from "./loop";
import { FakeUrls, MEDIA_KINDS } from "./test/fakeMedia";
import { actionForFire, runNudge, runTransport } from "./transport";

describe.each(MEDIA_KINDS)("%s element", (_kind, Media) => {
  function loadedPlayer() {
    const media = new Media();
    const player = new AudioPlayer(media, new FakeUrls());
    player.loadFile(new Blob(["x"]));
    media.finishLoading();
    return { media, player };
  }

  describe("runTransport: restart targets", () => {
    it("restart goes to the loop START when one is set (even START alone), else 0:00", () => {
      const { player, media } = loadedPlayer();
      runTransport(player, NO_LOOP, "toggle");
      media.advance(20);
      const r = runTransport(player, { start: 7.5, end: null }, "restart");
      expect(r.label).toBe("BACK TO START");
      expect(player.currentTime).toBe(7.5);
      expect(player.state).toBe("playing");
      expect(runTransport(player, NO_LOOP, "restart").label).toBe("RESTART");
      expect(player.currentTime).toBe(0);
    });

    it("restartTop goes to 0:00 even with a loop set, and plays", () => {
      const { player, media } = loadedPlayer();
      const loop: LoopState = { start: 7.5, end: 12 };
      runTransport(player, loop, "toggle");
      media.advance(9);
      player.pause();
      const r = runTransport(player, loop, "restartTop");
      expect(r.label).toBe("FROM THE TOP");
      expect(r.loop).toBe(loop); // restarting never touches the loop
      expect(player.currentTime).toBe(0);
      expect(player.state).toBe("playing");
    });
  });

  describe("runTransport: marking", () => {
    it("marks the playhead when no stamp is given (keys and buttons)", () => {
      const { player, media } = loadedPlayer();
      runTransport(player, NO_LOOP, "toggle");
      media.advance(4.2);
      const a = runTransport(player, NO_LOOP, "loopStep");
      expect(a.loop).toEqual({ start: 4.2, end: null });
      expect(a.label).toBe("SET START 0:04.2");
      media.advance(5);
      const b = runTransport(player, a.loop, "loopStep");
      expect(b.loop).toEqual({ start: 4.2, end: 9.2 });
      expect(b.label).toContain("SET END");
      const c = runTransport(player, b.loop, "loopStep");
      expect(c.loop).toEqual(NO_LOOP);
      expect(c.label).toBe("LOOP CLEARED");
    });

    it("uses the stamp for a gesture mark", () => {
      const { player, media } = loadedPlayer();
      runTransport(player, NO_LOOP, "toggle");
      media.advance(10);
      expect(runTransport(player, NO_LOOP, "setStart", { markAt: 8.5 }).loop.start).toBe(8.5);
    });

    it("an END at or before START is ignored with a message and the loop is unchanged", () => {
      const { player, media } = loadedPlayer();
      runTransport(player, NO_LOOP, "toggle");
      media.advance(10);
      const loop: LoopState = { start: 10, end: null };
      const same = runTransport(player, loop, "loopStep", { markAt: 10 });
      expect(same).toMatchObject({ label: "END MUST COME AFTER START", changed: false, loop });
      const before = runTransport(player, loop, "loopStep", { markAt: 6 });
      expect(before.changed).toBe(false);
      expect(before.loop).toBe(loop);
      // ...and the next tap can still set it properly.
      expect(runTransport(player, loop, "loopStep", { markAt: 14 }).loop).toEqual({ start: 10, end: 14 });
    });

    it("setEnd with no start is refused; clear with no loop says so", () => {
      const { player } = loadedPlayer();
      expect(runTransport(player, NO_LOOP, "setEnd")).toMatchObject({ label: "SET A START FIRST", changed: false });
      expect(runTransport(player, NO_LOOP, "clearLoop")).toMatchObject({ label: "NO LOOP TO CLEAR", changed: false });
    });
  });

  describe("runNudge", () => {
    it("moves only the START marker; the music is untouched", () => {
      const { player, media } = loadedPlayer();
      runTransport(player, NO_LOOP, "toggle");
      media.advance(12);
      const r = runNudge(player, { start: 8, end: 14 }, -1);
      expect(r.loop).toEqual({ start: 7, end: 14 });
      expect(r.label).toBe("START 0:07.0");
      expect(player.currentTime).toBe(12);
      expect(player.state).toBe("playing");
    });
    it("says so when there is no START", () => {
      const { player } = loadedPlayer();
      expect(runNudge(player, NO_LOOP, 0.1)).toMatchObject({ label: "SET A START FIRST", changed: false });
    });
    it("with no track nothing changes", () => {
      const player = new AudioPlayer(new Media(), new FakeUrls());
      expect(runNudge(player, { start: 1, end: null }, 0.1).changed).toBe(false);
    });
  });

  // --- Gesture -> audio, through the real per-hand classifiers ---------------------------

  const FRAME = 33;
  const RIGHT_AT = { x: 0.75, y: 0.5 };
  const LEFT_AT = { x: 0.25, y: 0.5 };
  const hand = (h: Handedness, shape: string, palm = h === "Right" ? RIGHT_AT : LEFT_AT): HandCmdObs => ({ hand: h, shape, shapeScore: 0.9, palmFacing: true, palm });

  /**
   * Replays frames through the two per-hand classifiers and, like main.ts, hands every fire to the player,
   * with the loop state and the ring-start stamp (so marks land where the music was when the ring began).
   */
  function rig() {
    const { player, media } = loadedPlayer();
    let machines: HandMachines = INITIAL_MACHINES;
    let t = 0;
    let loop: LoopState = NO_LOOP;
    const stamps: Record<Handedness, RingStamp | null> = { Left: null, Right: null };
    let scrubbing = false;
    let lastScrubT = -Infinity;
    const fires: { fire: HandFire; stateAfter: string; timeAfter: number; label: string | null; markAt: number; changed: boolean }[] = [];
    const show = (ms: number, hands: HandCmdObs[]) => {
      const end = t + ms;
      while (t < end) {
        t += FRAME;
        if (scrubbing) lastScrubT = t;
        const r = stepHandCommands(machines, { t, hands, boxes: DEFAULT_BOXES, suppress: { Left: false, Right: false } }, COMMANDS);
        machines = r.state;
        for (const f of r.fired) {
          const action = actionForFire(f);
          const markAt = markPlayhead(stamps[f.hand], { current: player.currentTime, playing: player.state === "playing", scrubbing, lastScrubT, t, duration: player.duration });
          let label: string | null = null;
          let changed = false;
          if (action) {
            const res = runTransport(player, loop, action, { markAt });
            loop = res.loop;
            label = res.label;
            changed = res.changed;
          }
          // What the player looks like on the very frame the fire happened.
          fires.push({ fire: f, stateAfter: player.state, timeAfter: player.currentTime, label, markAt, changed });
        }
        for (const h of ["Left", "Right"] as const) stamps[h] = trackRingStart(stamps[h], machines[h].shape, machines[h].since, player.currentTime, player.state === "playing");
        media.advance(FRAME / 1000);
      }
    };
    /** Shows one hand's shape until its ring fills (the command fires then), drops the hand, and lets the cooldown pass. */
    const gesture = (h: Handedness, shape: string, palm?: { x: number; y: number }) => {
      show(COMMANDS.dwellMs + 3 * FRAME, [hand(h, shape, palm)]);
      show(COMMANDS.cooldownMs + 3 * FRAME, []);
    };
    /** Time passes (hands away, past the cooldown). */
    const wait = (ms: number) => show(ms, []);
    /** Starts the music and lets it play for `sec`. */
    const play = (sec: number) => {
      gesture("Right", "Closed_Fist");
      wait(sec * 1000);
    };
    return {
      player,
      media,
      show,
      gesture,
      wait,
      play,
      fires,
      loop: () => loop,
      setLoop: (l: LoopState) => (loop = l),
      setScrubbing: (on: boolean) => (scrubbing = on),
      last: () => fires.at(-1)!,
    };
  }

  describe("per-hand routing", () => {
    it("right hand: the fist plays, then pauses, then resumes from the same spot", () => {
      const r = rig();
      r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Right", "Closed_Fist")]);
      expect(r.last().stateAfter).toBe("playing");
      expect(r.last().fire.hand).toBe("Right");
      r.wait(1500);
      const playedTo = r.player.currentTime;
      expect(playedTo).toBeGreaterThan(1);
      r.gesture("Right", "Closed_Fist");
      expect(r.last().stateAfter).toBe("paused");
      const pausedAt = r.last().timeAfter;
      r.wait(2000);
      expect(r.player.currentTime).toBe(pausedAt);
      r.gesture("Right", "Closed_Fist");
      expect(r.last().stateAfter).toBe("playing");
      expect(r.last().timeAfter).toBe(pausedAt);
    });

    it("R4d: the left hand never plays or pauses by a command (open palm, fist: no fire, no cooldown); the right open palm is inert too", () => {
      const r = rig();
      r.show(5000, [hand("Left", "Open_Palm")]);
      r.show(5000, [hand("Left", "Closed_Fist")]);
      r.show(5000, [hand("Right", "Open_Palm")]);
      expect(r.fires).toHaveLength(0);
      expect(r.player.state).toBe("ready");
      r.play(1);
      expect(r.player.state).toBe("playing");
      r.show(5000, [hand("Left", "Open_Palm"), hand("Right", "Open_Palm")]);
      expect(r.player.state).toBe("playing"); // nothing paused it
    });

    it("holding the fist a long time fires once (does not flip-flop)", () => {
      const r = rig();
      r.show(8000, [hand("Right", "Closed_Fist")]);
      expect(r.fires).toHaveLength(1);
      expect(r.player.state).toBe("playing");
    });

    it("right index up restarts when its ring fills, not on release: the loop START if set, else 0:00", () => {
      const r = rig();
      r.play(5);
      expect(r.player.currentTime).toBeGreaterThan(4);
      r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Right", "Pointing_Up")]); // ring full, hand still up
      expect(r.last().fire).toMatchObject({ hand: "Right", shape: "Pointing_Up" });
      expect(r.last().label).toBe("RESTART");
      expect(r.last().stateAfter).toBe("playing");
      expect(r.last().timeAfter).toBeLessThan(0.1);
      r.wait(2000);
      r.setLoop({ start: 4, end: 8 });
      r.gesture("Right", "Pointing_Up");
      expect(r.last()).toMatchObject({ label: "BACK TO START", stateAfter: "playing" });
      expect(r.last().timeAfter).toBeCloseTo(4, 1);
      expect(r.loop()).toEqual({ start: 4, end: 8 }); // restarts leave the loop alone
    });

    it("right index up restarts a paused track and starts it", () => {
      const r = rig();
      r.play(2);
      r.gesture("Right", "Closed_Fist"); // pause
      r.wait(1500);
      expect(r.player.state).toBe("paused");
      r.gesture("Right", "Pointing_Up");
      expect(r.player.state).toBe("playing");
      expect(r.last().timeAfter).toBeLessThan(0.1);
    });

    it("right V clears the loop, once, however long it is held", () => {
      const r = rig();
      r.setLoop({ start: 2, end: 6 });
      r.show(10_000, [hand("Right", "Victory")]);
      expect(r.fires.filter((f) => f.fire.shape === "Victory")).toHaveLength(1);
      expect(r.loop()).toEqual(NO_LOOP);
      expect(r.last().label).toBe("LOOP CLEARED");
    });

    it("right V does NOT set marks; left index up does NOT restart; left V does NOT clear", () => {
      const r = rig();
      r.play(3);
      r.gesture("Right", "Victory");
      expect(r.loop()).toEqual(NO_LOOP);
      expect(r.last().label).toBe("NO LOOP TO CLEAR");
      r.wait(1200);
      const at = r.player.currentTime;
      r.gesture("Left", "Pointing_Up"); // OUT with no IN
      expect(r.last().label).toBe("SET A START FIRST");
      expect(r.player.currentTime).toBeGreaterThan(at); // no restart
      r.setLoop({ start: 1, end: 5 });
      r.wait(1200);
      r.gesture("Left", "Victory"); // sets IN again: does not clear
      expect(r.loop().end).toBe(5);
    });
  });

  describe("per-hand command boxes", () => {
    it("a shape counts only when that hand's palm is in that hand's box", () => {
      const r = rig();
      // The right hand in the LEFT half (the left hand's box) does nothing...
      r.show(2000, [hand("Right", "Closed_Fist", LEFT_AT)]);
      // ...and so does the left hand in the right half.
      r.show(2000, [hand("Left", "Victory", RIGHT_AT)]);
      expect(r.fires).toHaveLength(0);
      r.show(1000, [hand("Right", "Closed_Fist", RIGHT_AT)]);
      expect(r.fires).toHaveLength(1);
    });

    it("the left hand in the left half counts, in either of the halves it is not blocked by the right hand's box", () => {
      const r = rig();
      r.show(1000, [hand("Left", "Victory", LEFT_AT)]);
      expect(r.fires).toHaveLength(1);
      expect(r.fires[0].fire.hand).toBe("Left");
    });

    it("both hands showing command shapes at once are each judged on their own: one fires, the other waits out the cooldown", () => {
      const r = rig();
      r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Right", "Pointing_Up"), hand("Left", "Victory")]);
      // Both rings were running side by side and filled together: both fire (each is its own hand's command).
      expect(r.fires.map((f) => f.fire.hand).sort()).toEqual(["Left", "Right"]);
    });

    it("a hand that fired puts the other hand on cooldown too (one command at a time)", () => {
      const r = rig();
      r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Right", "Closed_Fist")]);
      expect(r.fires).toHaveLength(1);
      r.show(COMMANDS.cooldownMs - 400, [hand("Left", "Victory")]); // starts inside the cooldown: no dwell begins
      r.show(100, []);
      expect(r.fires).toHaveLength(1);
    });
  });

  describe("IN / OUT by the left hand", () => {
    it("left V sets IN at the playhead, left index up sets OUT and starts looping", () => {
      const r = rig();
      r.play(3);
      r.gesture("Left", "Victory");
      expect(r.last().label).toMatch(/^SET START/);
      expect(r.loop().start).not.toBeNull();
      expect(r.loop().end).toBeNull();
      r.wait(4000);
      r.gesture("Left", "Pointing_Up");
      expect(r.last().label).toMatch(/^SET END.*LOOPING/);
      expect(r.loop().end!).toBeGreaterThan(r.loop().start! + 3);
    });

    it("OUT at or before IN + the minimum gap is ignored with a message, and the loop is unchanged", () => {
      const r = rig();
      r.setLoop({ start: 30, end: null });
      r.player.seek(30.2); // playhead barely after IN
      r.gesture("Left", "Pointing_Up");
      expect(r.last()).toMatchObject({ label: "END MUST COME AFTER START", changed: false });
      expect(r.loop()).toEqual({ start: 30, end: null });
      r.player.seek(10); // playhead before IN
      r.gesture("Left", "Pointing_Up");
      expect(r.last()).toMatchObject({ label: "END MUST COME AFTER START", changed: false });
      expect(r.loop().end).toBeNull();
    });

    it("OUT with no IN is refused", () => {
      const r = rig();
      r.gesture("Left", "Pointing_Up");
      expect(r.last()).toMatchObject({ label: "SET A START FIRST", changed: false });
    });

    it("setting IN again while a loop exists moves IN, with the same clamps (IN must stay before OUT - gap)", () => {
      const r = rig();
      r.setLoop({ start: 10, end: 20 });
      r.player.seek(15); // paused: the mark is exactly here
      r.gesture("Left", "Victory");
      expect(r.loop()).toEqual({ start: 15, end: 20 });
      r.player.seek(19.9);
      r.gesture("Left", "Victory"); // too close to OUT
      expect(r.last()).toMatchObject({ label: "START MUST BE BEFORE END", changed: false });
      expect(r.loop()).toEqual({ start: 15, end: 20 });
      r.player.seek(25);
      r.gesture("Left", "Victory"); // past OUT
      expect(r.loop()).toEqual({ start: 15, end: 20 });
    });

    it("IN can be set before OUT in either order of the loop's life: clear (right V) and start over", () => {
      const r = rig();
      r.setLoop({ start: 10, end: 20 });
      r.gesture("Right", "Victory");
      expect(r.loop()).toEqual(NO_LOOP);
      r.player.seek(5);
      r.gesture("Left", "Victory");
      r.player.seek(9);
      r.gesture("Left", "Pointing_Up");
      expect(r.loop()).toEqual({ start: 5, end: 9 });
    });

    it("a mark near 0:00 is clamped to 0:00", () => {
      const r = rig();
      r.gesture("Left", "Victory"); // paused at 0:00
      expect(r.loop().start).toBe(0);
    });
  });

  describe("mark offset rules", () => {
    it("while PLAYING and not scrubbing: stamped where the music was when the ring STARTED, minus the offset", () => {
      const r = rig();
      r.play(3);
      const atRingStart = r.player.currentTime;
      r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Left", "Victory")]);
      const f = r.last();
      expect(f.timeAfter - atRingStart).toBeGreaterThan(0.55); // the fire is a ring-time after the shape appeared
      expect(f.markAt).toBeGreaterThan(atRingStart - LOOP.markOffsetSec - 0.001);
      expect(f.markAt).toBeLessThan(atRingStart - LOOP.markOffsetSec + FRAME / 1000 + 0.001);
      expect(r.loop().start).toBe(f.markAt);
    });

    it("while PAUSED: the exact playhead, no offset", () => {
      const r = rig();
      r.play(3);
      r.gesture("Right", "Closed_Fist"); // pause
      r.wait(1500);
      const pausedAt = r.player.currentTime;
      r.gesture("Left", "Victory");
      expect(r.loop().start).toBeCloseTo(pausedAt, 6);
    });

    it("while SCRUBBING: the exact playhead now, no offset", () => {
      const r = rig();
      r.play(6);
      r.setScrubbing(true);
      r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Left", "Victory")]);
      expect(r.last().markAt).toBeCloseTo(r.last().timeAfter, 3);
    });

    it("RIGHT AFTER a scrub: exact (the ring-start playhead); later: the offset applies again", () => {
      const r = rig();
      r.play(6);
      r.setScrubbing(true);
      r.wait(200);
      r.setScrubbing(false);
      r.wait(100);
      const atRingStart = r.player.currentTime;
      r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Left", "Victory")]);
      expect(r.last().markAt).toBeGreaterThan(atRingStart - 0.001);
      expect(r.last().markAt).toBeLessThan(atRingStart + FRAME / 1000 + 0.001);
      // Much later: back to the late-mark offset.
      r.wait(LOOP.exactAfterScrubMs + 1000);
      r.setLoop(NO_LOOP);
      const later = r.player.currentTime;
      r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Left", "Victory")]);
      expect(r.last().markAt).toBeLessThan(later - LOOP.markOffsetSec + FRAME / 1000 + 0.001);
    });
  });
});
