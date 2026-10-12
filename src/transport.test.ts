import { describe, expect, it } from "vitest";
import { AudioPlayer } from "./audioPlayer";
import { PRESETS } from "./box";
import { INITIAL_STATE, stepCommands, type FireEvent, type HandObs, type MachineState } from "./commands";
import { COMMANDS } from "./config";
import { FakeMedia, FakeUrls } from "./test/fakeMedia";
import { actionForFire, formatTime, playheadFraction, practiceConfig, runTransport, statusWord } from "./transport";

function loadedPlayer() {
  const media = new FakeMedia();
  const player = new AudioPlayer(media, new FakeUrls());
  player.loadFile(new Blob(["x"]));
  media.finishLoading();
  return { media, player };
}

describe("actionForFire", () => {
  it("maps open palm to toggle and index up to restart, tap or hold alike", () => {
    expect(actionForFire({ shape: "Open_Palm" })).toBe("toggle");
    expect(actionForFire({ shape: "Pointing_Up" })).toBe("restart");
  });
  it("leaves other shapes (V = loops, R4) alone", () => {
    expect(actionForFire({ shape: "Victory" })).toBeNull();
    expect(actionForFire({ shape: "Closed_Fist" })).toBeNull();
  });
});

describe("runTransport", () => {
  it("toggle plays, then pauses, and resumes from the same spot", async () => {
    const { player, media } = loadedPlayer();
    expect(runTransport(player, "toggle")).toEqual({ label: "PLAY", changed: true });
    expect(player.state).toBe("playing");
    media.advance(8.2);
    expect(runTransport(player, "toggle")).toEqual({ label: "PAUSE", changed: true });
    expect(player.state).toBe("paused");
    expect(player.currentTime).toBe(8.2);
    runTransport(player, "toggle");
    expect(player.state).toBe("playing");
    expect(player.currentTime).toBe(8.2);
  });

  it("restart from the middle goes to 0:00 and plays", () => {
    const { player, media } = loadedPlayer();
    runTransport(player, "toggle");
    media.advance(12);
    expect(runTransport(player, "restart")).toEqual({ label: "RESTART", changed: true });
    expect(player.currentTime).toBe(0);
    expect(player.state).toBe("playing");
  });

  it("restart while paused or stopped plays from 0:00 too", () => {
    const { player, media } = loadedPlayer();
    runTransport(player, "toggle");
    media.advance(5);
    runTransport(player, "toggle"); // paused at 5
    runTransport(player, "restart");
    expect(player.currentTime).toBe(0);
    expect(player.state).toBe("playing");
    player.pause();
    runTransport(player, "restart"); // from READY
    expect(player.state).toBe("playing");
  });

  it("restart after the track ended plays from the top", () => {
    const { player, media } = loadedPlayer();
    runTransport(player, "toggle");
    media.advance(999);
    runTransport(player, "restart");
    expect(player.currentTime).toBe(0);
    expect(player.state).toBe("playing");
  });

  it("with no track nothing changes and it says why", () => {
    const player = new AudioPlayer(new FakeMedia(), new FakeUrls());
    expect(runTransport(player, "toggle")).toEqual({ label: "LOAD A TRACK FIRST", changed: false });
    expect(runTransport(player, "restart").changed).toBe(false);
    expect(player.state).toBe("empty");
  });
});

describe("status word and clock", () => {
  it("has one word per state", () => {
    expect(statusWord("playing")).toBe("PLAYING");
    expect(statusWord("paused")).toBe("PAUSED");
    expect(statusWord("ready")).toBe("READY");
    expect(statusWord("empty")).toBe("LOAD A TRACK");
  });
  it("formats the clock", () => {
    expect(formatTime(0)).toBe("0:00.0");
    expect(formatTime(42.37)).toBe("0:42.3");
    expect(formatTime(125.99)).toBe("2:05.9");
    expect(formatTime(125.99, false)).toBe("2:05");
    expect(formatTime(NaN)).toBe("0:00.0");
    expect(formatTime(-3)).toBe("0:00.0");
  });
  it("places the playhead along the timeline", () => {
    expect(playheadFraction(15, 30)).toBe(0.5);
    expect(playheadFraction(40, 30)).toBe(1);
    expect(playheadFraction(5, 0)).toBe(0);
  });
});

// --- Gesture -> audio, through the real classifier ------------------------------------

const FRAME = 33;
const INSIDE = { x: 0.75, y: 0.5 };
const hand = (shape: string): HandObs => ({ shape, shapeScore: 0.9, palmFacing: true, palm: INSIDE });

/** Replays frames through the classifier and, like main.ts, hands every fire straight to the player. */
function rig(useBenchConfig = false) {
  const { player, media } = loadedPlayer();
  const cfg = useBenchConfig ? COMMANDS : practiceConfig(COMMANDS);
  let state: MachineState = INITIAL_STATE;
  let t = 0;
  const fires: { fire: FireEvent; stateAfter: string; timeAfter: number }[] = [];
  const show = (ms: number, hands: HandObs[]) => {
    const end = t + ms;
    while (t < end) {
      t += FRAME;
      const r = stepCommands(state, { t, hands, box: PRESETS.right }, cfg);
      state = r.state;
      if (r.fired) {
        const action = actionForFire(r.fired);
        if (action) runTransport(player, action);
        // What the player looks like on the very frame the ring completed.
        fires.push({ fire: r.fired, stateAfter: player.state, timeAfter: player.currentTime });
      }
      media.advance(FRAME / 1000);
    }
  };
  return { player, media, show, fires, now: () => t };
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
    r.show(1500, []); // drop the hand; the cooldown passes and the music plays for a while
    const playedTo = r.player.currentTime;
    expect(playedTo).toBeGreaterThan(1);
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    expect(r.fires[1].stateAfter).toBe("paused");
    const pausedAt = r.fires[1].timeAfter;
    r.show(2000, []); // time passes while paused: the playhead must not move
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

  it("index up restarts from 0:00 and plays on the frame the ring completes, not on release", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.show(5000, []); // play for ~5 s
    expect(r.player.currentTime).toBeGreaterThan(4);
    // Hold index up for just over the ring, hand still raised: the restart is already done.
    r.show(COMMANDS.dwellMs + FRAME, [hand("Pointing_Up")]);
    expect(r.fires).toHaveLength(2);
    const f = r.fires[1];
    expect(f.fire.shape).toBe("Pointing_Up");
    expect(f.stateAfter).toBe("playing");
    expect(f.timeAfter).toBeLessThan(0.1); // right back at the top
  });

  it("index up restarts a paused track and starts it", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.show(2000, []);
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]); // pause
    r.show(1500, []);
    expect(r.player.state).toBe("paused");
    r.show(COMMANDS.dwellMs + FRAME, [hand("Pointing_Up")]);
    expect(r.player.state).toBe("playing");
    expect(r.fires.at(-1)!.timeAfter).toBeLessThan(0.1);
  });

  it("index up held long (a 'hold') does not restart a second time", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.show(3000, []);
    r.show(5000, [hand("Pointing_Up")]); // way past the hold time
    expect(r.fires.filter((f) => f.fire.shape === "Pointing_Up")).toHaveLength(1);
    // After the single restart the music just keeps playing: it must be well past 0 by now.
    expect(r.player.currentTime).toBeGreaterThan(3);
  });

  it("a V (R4's loop shape) does nothing to the music in R3", () => {
    const r = rig();
    r.show(COMMANDS.dwellMs + FRAME, [hand("Victory")]);
    r.show(500, []); // released: the V tap fires
    expect(r.fires.at(-1)?.fire.shape).toBe("Victory");
    expect(r.player.state).toBe("ready");
  });

  it("with the bench's own thresholds index up would wait for the release: that is why the practice view overrides it", () => {
    const r = rig(true);
    r.show(COMMANDS.dwellMs + FRAME, [hand("Open_Palm")]);
    r.show(3000, []);
    r.show(COMMANDS.dwellMs + 3 * FRAME, [hand("Pointing_Up")]); // ring full, hand still up
    expect(r.fires.filter((f) => f.fire.shape === "Pointing_Up")).toHaveLength(0);
  });
});

describe("practiceConfig", () => {
  it("only changes which shapes have a hold action", () => {
    const p = practiceConfig(COMMANDS);
    expect(p.holdShapes).not.toContain("Pointing_Up");
    expect(p.holdShapes).toContain("Victory");
    expect({ ...p, holdShapes: COMMANDS.holdShapes }).toEqual(COMMANDS);
  });
});
