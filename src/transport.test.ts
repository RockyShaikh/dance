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

  it("right hand = transport: the FIST toggles (R4d), index up restarts (loop start if set, else 0:00), V clears the loop", () => {
    expect(R("Closed_Fist")).toBe("toggle");
    expect(R("Pointing_Up")).toBe("restart");
    expect(R("Victory")).toBe("clearLoop");
  });
  it("left hand = marks: V sets IN (START), index up sets OUT (END); it never plays or pauses (R4d)", () => {
    expect(L("Victory")).toBe("setStart");
    expect(L("Pointing_Up")).toBe("setEnd");
    expect(L("Open_Palm")).toBeNull();
    expect(L("Closed_Fist")).toBeNull();
  });
  it("R4d: an open palm is nobody's command", () => {
    expect(R("Open_Palm")).toBeNull();
    expect(L("Open_Palm")).toBeNull();
  });
  it("the V-cycle action is no longer reachable by any gesture (key / button only), nor is the top-of-track", () => {
    const all = (["Right", "Left"] as const).flatMap((hand) => ["Open_Palm", "Pointing_Up", "Victory", "Closed_Fist", "Thumb_Up", "None"].map((shape) => actionForFire({ hand, shape })));
    expect(all).not.toContain("loopStep");
    expect(all).not.toContain("restartTop");
  });
  it("ignores other shapes", () => {
    expect(actionForFire({ hand: "Right", shape: "ILoveYou" })).toBeNull();
    expect(actionForFire({ hand: "Right", shape: "None" })).toBeNull();
  });
  it("R5b: the thumbs up fires no action (holding it is a state: holdSpeed.ts)", () => {
    expect(actionForFire({ hand: "Right", shape: "Thumb_Up" })).toBeNull();
    expect(actionForFire({ hand: "Left", shape: "Thumb_Up" })).toBeNull();
  });
});

describe("speed (R5)", () => {
  it("toggle: 1x -> 2x -> 1x, applied to the player with the pitch kept, and the music just carries on", async () => {
    const { player, media } = loadedPlayer();
    await player.play();
    media.advance(3);
    expect(runTransport(player, NO_LOOP, "speedToggle")).toEqual({ label: "SPEED 2×", changed: true, loop: NO_LOOP });
    expect(player.rate).toBe(2);
    expect(media.preservesPitch).toBe(true);
    expect(player.state).toBe("playing");
    expect(player.currentTime).toBe(3); // no jump
    media.advance(1);
    expect(player.currentTime).toBe(5); // 1 s of real time = 2 s of music
    expect(runTransport(player, NO_LOOP, "speedToggle").label).toBe("SPEED 1×");
    expect(player.rate).toBe(1);
    media.advance(1);
    expect(player.currentTime).toBe(6);
  });

  it("works while paused too, and takes effect when the music starts", () => {
    const { player, media } = loadedPlayer();
    runTransport(player, NO_LOOP, "speedToggle");
    expect(player.rate).toBe(2);
    expect(player.state).not.toBe("playing");
    void player.play();
    media.advance(1);
    expect(player.currentTime).toBe(2);
  });

  it("R5b: - and = step 0.05 within 0.5 to 1.0 and stop at the ends; 0 resets to 1x; the toggle still goes back to normal", () => {
    const { player } = loadedPlayer();
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      runTransport(player, NO_LOOP, "speedDown");
      seen.push(player.rate);
    }
    expect(seen).toEqual([0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.5, 0.5]);
    expect(runTransport(player, NO_LOOP, "speedDown")).toEqual({ label: "SPEED 0.5×", changed: false, loop: NO_LOOP });
    expect(runTransport(player, NO_LOOP, "speedToggle").label).toBe("SPEED 1×");
    runTransport(player, NO_LOOP, "speedDown");
    expect(runTransport(player, NO_LOOP, "speedReset")).toMatchObject({ label: "SPEED 1×", changed: true });
    expect(player.rate).toBe(1);
    expect(runTransport(player, NO_LOOP, "speedUp")).toMatchObject({ label: "SPEED 1×", changed: false }); // 1.0 is a natural stop
    expect(player.rate).toBe(1);
  });

  it("R5b: speedSet puts the speed at exactly the asked value (the thumbs-up hold's 2x and its restore)", () => {
    const { player } = loadedPlayer();
    runTransport(player, NO_LOOP, "speedDown");
    runTransport(player, NO_LOOP, "speedDown"); // 0.9
    runTransport(player, NO_LOOP, "speedSet", { rate: 2 });
    expect(player.rate).toBe(2);
    runTransport(player, NO_LOOP, "speedSet", { rate: 0.9 });
    expect(player.rate).toBe(0.9);
  });

  it("at a slowed speed time passes at that speed (0.5x: a second of real time is half a second of music), pitch kept", async () => {
    const { player, media } = loadedPlayer();
    await player.play();
    for (let i = 0; i < 10; i++) runTransport(player, NO_LOOP, "speedDown");
    expect(player.rate).toBe(0.5);
    expect(media.preservesPitch).toBe(true);
    media.advance(2);
    expect(player.currentTime).toBe(1);
  });

  it("a new track starts at 1x again", () => {
    const { player, media } = loadedPlayer();
    runTransport(player, NO_LOOP, "speedToggle");
    player.loadFile(new Blob(["y"]));
    media.finishLoading();
    expect(player.rate).toBe(1);
  });

  it("with no track it does nothing", () => {
    const media = new FakeMedia();
    const player = new AudioPlayer(media, new FakeUrls());
    expect(runTransport(player, NO_LOOP, "speedToggle").changed).toBe(false);
    expect(player.rate).toBe(1);
  });

  it("the rate is clamped to what browsers keep audible, and a bad number is 1x", () => {
    const { player } = loadedPlayer();
    expect(player.setRate(100)).toBe(4);
    expect(player.setRate(0)).toBe(0.25);
    expect(player.setRate(NaN)).toBe(1);
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

