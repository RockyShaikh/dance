import { describe, expect, it } from "vitest";
import { AudioPlayer } from "./audioPlayer";
import { PRESETS } from "./box";
import { INITIAL_STATE, stepCommands, type FireEvent, type HandObs, type MachineState } from "./commands";
import { COMMANDS, LOOP } from "./config";
import { NO_LOOP, markTime, trackRingStart, type LoopState, type RingStamp } from "./loop";
import { FakeMedia, FakeUrls } from "./test/fakeMedia";
import { actionForFire, runNudge, runTransport } from "./transport";

function loadedPlayer() {
  const media = new FakeMedia();
  const player = new AudioPlayer(media, new FakeUrls());
  player.loadFile(new Blob(["x"]));
  media.finishLoading();
  return { media, player };
}

describe("config", () => {
  it("index up and V have hold actions again (R3's override is gone)", () => {
    expect(COMMANDS.holdShapes).toContain("Pointing_Up");
    expect(COMMANDS.holdShapes).toContain("Victory");
    expect(COMMANDS.holdShapes).not.toContain("Open_Palm");
  });
});

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
    const player = new AudioPlayer(new FakeMedia(), new FakeUrls());
    expect(runNudge(player, { start: 1, end: null }, 0.1).changed).toBe(false);
  });
});

// --- Gesture -> audio, through the real classifier ------------------------------------

const FRAME = 33;
const INSIDE = { x: 0.75, y: 0.5 };
const hand = (shape: string): HandObs => ({ shape, shapeScore: 0.9, palmFacing: true, palm: INSIDE });

/**
 * Replays frames through the classifier and, like main.ts, hands every fire to the player, with the
 * loop state and the ring-start stamp (so marks land where the music was when the ring began).
 */
function rig() {
  const { player, media } = loadedPlayer();
  let state: MachineState = INITIAL_STATE;
  let t = 0;
  let loop: LoopState = NO_LOOP;
  let stamp: RingStamp | null = null;
  const fires: { fire: FireEvent; stateAfter: string; timeAfter: number; label: string | null; markAt: number }[] = [];
  const show = (ms: number, hands: HandObs[]) => {
    const end = t + ms;
    while (t < end) {
      t += FRAME;
      const r = stepCommands(state, { t, hands, box: PRESETS.right }, COMMANDS);
      state = r.state;
      if (r.fired) {
        const action = actionForFire(r.fired);
        const markAt = markTime(stamp?.playhead ?? player.currentTime, player.duration);
        let label: string | null = null;
        if (action) {
          const res = runTransport(player, loop, action, { markAt });
          loop = res.loop;
          label = res.label;
        }
        // What the player looks like on the very frame the fire happened.
        fires.push({ fire: r.fired, stateAfter: player.state, timeAfter: player.currentTime, label, markAt });
      }
      stamp = trackRingStart(stamp, state.shape, state.since, player.currentTime);
      media.advance(FRAME / 1000);
    }
  };
  /** Holds a shape for a tap (ring fills, then drop). */
  const tap = (shape: string) => {
    show(COMMANDS.dwellMs + 3 * FRAME, [hand(shape)]);
    show(COMMANDS.dropoutGraceMs + 3 * FRAME, []);
  };
  /** Holds a shape past the hold ring. */
  const hold = (shape: string) => {
    show(COMMANDS.holdMs + 4 * FRAME, [hand(shape)]);
    show(COMMANDS.dropoutGraceMs + 3 * FRAME, []);
  };
  /** Time passes (hand away, past the cooldown). */
  const wait = (ms: number) => show(ms, []);
  return { player, media, show, tap, hold, wait, fires, loop: () => loop, setLoop: (l: LoopState) => (loop = l) };
}

describe("command -> audio wiring", () => {
  it("open palm: the music starts on the frame the ring completes", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Open_Palm")]);
    expect(r.fires).toHaveLength(1);
    const f = r.fires[0];
    expect(f.stateAfter).toBe("playing");
    // The dwell began on the first frame (t = FRAME); it fires on the first frame at least dwellMs later.
    expect(f.fire.t - FRAME).toBeGreaterThanOrEqual(COMMANDS.dwellMs);
    expect(f.fire.t - FRAME).toBeLessThan(COMMANDS.dwellMs + FRAME);
  });

  it("open palm again pauses, and a third time resumes from the same spot", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.wait(1500); // drop the hand; the cooldown passes and the music plays for a while
    const playedTo = r.player.currentTime;
    expect(playedTo).toBeGreaterThan(1);
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    expect(r.fires[1].stateAfter).toBe("paused");
    const pausedAt = r.fires[1].timeAfter;
    r.wait(2000); // time passes while paused: the playhead must not move
    expect(r.player.currentTime).toBe(pausedAt);
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    expect(r.fires[2].stateAfter).toBe("playing");
    expect(r.fires[2].timeAfter).toBe(pausedAt);
  });

  it("holding open palm a long time fires once (does not flip-flop)", () => {
    const r = rig();
    r.show(8000, [hand("Open_Palm")]);
    expect(r.fires).toHaveLength(1);
    expect(r.player.state).toBe("playing");
  });

  it("index TAP restarts on release, not on ring fill (tap vs hold is back)", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.wait(5000); // play for ~5 s
    expect(r.player.currentTime).toBeGreaterThan(4);
    const fired = r.fires.length;
    r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Pointing_Up")]); // ring full, hand still up
    expect(r.fires).toHaveLength(fired); // nothing yet: a tap fires on release
    expect(r.player.currentTime).toBeGreaterThan(4);
    r.wait(COMMANDS.dropoutGraceMs + 3 * FRAME); // drop the hand
    const f = r.fires.at(-1)!;
    expect(f.fire).toMatchObject({ shape: "Pointing_Up", kind: "tap" });
    expect(f.label).toBe("RESTART"); // no loop: the song start
    expect(f.stateAfter).toBe("playing");
    expect(f.timeAfter).toBeLessThan(0.1);
  });

  it("index tap restarts a paused track and starts it", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.wait(2000);
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]); // pause
    r.wait(1500);
    expect(r.player.state).toBe("paused");
    r.tap("Pointing_Up");
    expect(r.player.state).toBe("playing");
    expect(r.fires.at(-1)!.timeAfter).toBeLessThan(0.1);
  });

  it("index tap goes to the loop START when one is set; index hold goes to 0:00", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.wait(9000);
    r.setLoop({ start: 4, end: 8 });
    r.tap("Pointing_Up");
    expect(r.fires.at(-1)).toMatchObject({ label: "BACK TO START", stateAfter: "playing" });
    expect(r.fires.at(-1)!.timeAfter).toBeCloseTo(4, 1);
    r.wait(2000);
    r.hold("Pointing_Up");
    const last = r.fires.at(-1)!;
    expect(last.fire).toMatchObject({ shape: "Pointing_Up", kind: "hold" });
    expect(last.label).toBe("FROM THE TOP");
    expect(last.timeAfter).toBeLessThan(0.1);
    expect(r.loop()).toEqual({ start: 4, end: 8 }); // restarts leave the loop alone
  });

  it("index held a long time restarts once", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.wait(3000);
    r.show(6000, [hand("Pointing_Up")]); // way past the hold time
    expect(r.fires.filter((f) => f.fire.shape === "Pointing_Up")).toHaveLength(1);
    expect(r.player.currentTime).toBeGreaterThan(3); // after the single restart the music kept playing
  });
});

describe("V cycle by gesture", () => {
  it("tap 1 = START, tap 2 = END (loop on), tap 3 = clear", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.wait(3000);
    r.tap("Victory");
    expect(r.fires.at(-1)!.label).toMatch(/^SET START/);
    expect(r.loop().start).not.toBeNull();
    expect(r.loop().end).toBeNull();
    r.wait(4000);
    r.tap("Victory");
    expect(r.fires.at(-1)!.label).toMatch(/^SET END/);
    expect(r.loop().end).not.toBeNull();
    expect(r.loop().end!).toBeGreaterThan(r.loop().start! + 3);
    r.wait(1500);
    r.tap("Victory");
    expect(r.fires.at(-1)!.label).toBe("LOOP CLEARED");
    expect(r.loop()).toEqual(NO_LOOP);
  });

  it("V hold clears the loop (once)", () => {
    const r = rig();
    r.setLoop({ start: 2, end: 6 });
    r.hold("Victory");
    expect(r.fires.filter((f) => f.fire.shape === "Victory")).toHaveLength(1);
    expect(r.fires.at(-1)!.fire.kind).toBe("hold");
    expect(r.loop()).toEqual(NO_LOOP);
  });

  it("the mark is stamped where the music was when the ring STARTED, minus the offset", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.wait(3000);
    const atRingStart = r.player.currentTime; // the V appears now...
    r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Victory")]); // ...the ring fills...
    r.show(600, [hand("Victory")]); // ...and the dancer keeps it up a bit longer...
    r.show(COMMANDS.dropoutGraceMs + 3 * FRAME, []); // ...then drops it: the tap fires on release.
    const f = r.fires.at(-1)!;
    expect(f.timeAfter - atRingStart).toBeGreaterThan(1.2); // the fire is well after the ring began
    // The stamp: within one frame of the playhead at ring start, less the offset.
    expect(f.markAt).toBeGreaterThan(atRingStart - LOOP.markOffsetSec - 0.001);
    expect(f.markAt).toBeLessThan(atRingStart - LOOP.markOffsetSec + FRAME / 1000 + 0.001);
    expect(r.loop().start).toBe(f.markAt);
  });

  it("a V tap while paused marks exactly where it paused (less the offset)", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.wait(3000);
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]); // pause
    r.wait(1500);
    const pausedAt = r.player.currentTime;
    r.tap("Victory");
    expect(r.loop().start).toBeCloseTo(pausedAt - LOOP.markOffsetSec, 3);
  });

  it("a mark near 0:00 is clamped to 0:00", () => {
    const r = rig();
    r.tap("Victory"); // paused at 0:00: 0 - 0.15 would be negative
    expect(r.loop().start).toBe(0);
  });
});
