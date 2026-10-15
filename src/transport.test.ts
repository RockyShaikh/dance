import { describe, expect, it } from "vitest";
import { AudioPlayer } from "./audioPlayer";
import { NO_LOOP, type LoopState } from "./loop";
import { FakeMedia, FakeUrls } from "./test/fakeMedia";
import { actionForFire, formatTime, playheadFraction, runTransport, statusWord } from "./transport";

function loadedPlayer() {
  const media = new FakeMedia();
  const player = new AudioPlayer(media, new FakeUrls());
  player.loadFile(new Blob(["x"]));
  media.finishLoading();
  return { media, player };
}

describe("actionForFire (two hands)", () => {
  const R = (shape: string) => actionForFire({ hand: "Right", shape });
  const L = (shape: string) => actionForFire({ hand: "Left", shape });

  it("right hand = transport: open palm toggles, index up restarts (loop start if set, else 0:00), V clears the loop", () => {
    expect(R("Open_Palm")).toBe("toggle");
    expect(R("Pointing_Up")).toBe("restart");
    expect(R("Victory")).toBe("clearLoop");
  });
  it("left hand = marks: V sets IN (START), index up sets OUT (END), open palm also toggles", () => {
    expect(L("Victory")).toBe("setStart");
    expect(L("Pointing_Up")).toBe("setEnd");
    expect(L("Open_Palm")).toBe("toggle");
  });
  it("the V-cycle action is no longer reachable by any gesture (key / button only), nor is the top-of-track", () => {
    const all = (["Right", "Left"] as const).flatMap((hand) => ["Open_Palm", "Pointing_Up", "Victory", "Closed_Fist", "Thumb_Up", "None"].map((shape) => actionForFire({ hand, shape })));
    expect(all).not.toContain("loopStep");
    expect(all).not.toContain("restartTop");
  });
  it("ignores other shapes", () => {
    expect(actionForFire({ hand: "Right", shape: "Closed_Fist" })).toBeNull();
  });
});

describe("runTransport", () => {
  it("toggle plays, then pauses, and resumes from the same spot", async () => {
    const { player, media } = loadedPlayer();
    expect(runTransport(player, NO_LOOP, "toggle")).toEqual({ label: "PLAY", changed: true, loop: NO_LOOP });
    expect(player.state).toBe("playing");
    media.advance(8.2);
    expect(runTransport(player, NO_LOOP, "toggle")).toEqual({ label: "PAUSE", changed: true, loop: NO_LOOP });
    expect(player.state).toBe("paused");
    expect(player.currentTime).toBe(8.2);
    runTransport(player, NO_LOOP, "toggle");
    expect(player.state).toBe("playing");
    expect(player.currentTime).toBe(8.2);
  });

  it("restart from the middle goes to 0:00 and plays", () => {
    const { player, media } = loadedPlayer();
    runTransport(player, NO_LOOP, "toggle");
    media.advance(12);
    expect(runTransport(player, NO_LOOP, "restart")).toEqual({ label: "RESTART", changed: true, loop: NO_LOOP });
    expect(player.currentTime).toBe(0);
    expect(player.state).toBe("playing");
  });

  it("restart while paused or stopped plays from 0:00 too", () => {
    const { player, media } = loadedPlayer();
    runTransport(player, NO_LOOP, "toggle");
    media.advance(5);
    runTransport(player, NO_LOOP, "toggle"); // paused at 5
    runTransport(player, NO_LOOP, "restart");
    expect(player.currentTime).toBe(0);
    expect(player.state).toBe("playing");
    player.pause();
    runTransport(player, NO_LOOP, "restart"); // from READY
    expect(player.state).toBe("playing");
  });

  it("restart after the track ended plays from the top", () => {
    const { player, media } = loadedPlayer();
    runTransport(player, NO_LOOP, "toggle");
    media.advance(999);
    runTransport(player, NO_LOOP, "restart");
    expect(player.currentTime).toBe(0);
    expect(player.state).toBe("playing");
  });

  it("with no track nothing changes and it says why", () => {
    const player = new AudioPlayer(new FakeMedia(), new FakeUrls());
    expect(runTransport(player, NO_LOOP, "toggle")).toEqual({ label: "LOAD A TRACK FIRST", changed: false, loop: NO_LOOP });
    expect(runTransport(player, NO_LOOP, "restart").changed).toBe(false);
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
  it("says LOOP while a loop is playing, and only then", () => {
    const looping: LoopState = { start: 2, end: 6 };
    expect(statusWord("playing", looping)).toBe("LOOP");
    expect(statusWord("playing", { start: 2, end: null })).toBe("PLAYING");
    expect(statusWord("playing", NO_LOOP)).toBe("PLAYING");
    expect(statusWord("paused", looping)).toBe("PAUSED");
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

