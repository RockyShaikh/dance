import { describe, expect, it } from "vitest";
import { AudioPlayer, type PlayerEvent } from "./audioPlayer";
import { FakeUrls, MEDIA_KINDS } from "./test/fakeMedia";

describe.each(MEDIA_KINDS)("%s element", (_kind, Media) => {
  function setup(loaded = true) {
    const media = new Media();
    const urls = new FakeUrls();
    const player = new AudioPlayer(media, urls);
    const events: PlayerEvent[] = [];
    player.on((e) => events.push(e));
    if (loaded) {
      player.loadFile(new Blob(["x"]));
      media.finishLoading();
    }
    return { media, urls, player, events };
  }

  describe("loading", () => {
    it("is empty until a file's length is known", () => {
      const { player, media } = setup(false);
      expect(player.state).toBe("empty");
      expect(player.duration).toBe(0);
      player.loadFile(new Blob(["x"]));
      expect(player.state).toBe("empty"); // header not read yet
      media.finishLoading();
      expect(player.state).toBe("ready");
      expect(player.duration).toBe(30);
      expect(player.currentTime).toBe(0);
    });

    it("emits loaded with the duration and points the element at an object URL", () => {
      const { events, media } = setup();
      expect(events).toContainEqual({ type: "loaded", duration: 30 });
      expect(media.src).toBe("blob:fake/0");
      expect(media.loads).toBe(1);
    });

    it("frees the old object URL when a new file replaces it, and stops the old track", async () => {
      const { player, media, urls } = setup();
      await player.play();
      player.loadFile(new Blob(["y"]));
      expect(urls.revoked).toEqual(["blob:fake/0"]);
      expect(media.paused).toBe(true);
      expect(player.state).toBe("empty"); // until the new header arrives
      media.finishLoading();
      expect(player.state).toBe("ready");
      expect(player.currentTime).toBe(0);
    });

    it("does not revoke a URL it was only lent", () => {
      const { player, urls } = setup(false);
      player.loadUrl("/test/click.wav");
      player.loadUrl("/test/other.wav");
      expect(urls.revoked).toEqual([]);
    });

    it("emits a friendly error when the file can't be decoded", () => {
      const { media, events } = setup();
      media.fail();
      expect(events.at(-1)).toMatchObject({ type: "error" });
    });
  });

  describe("play, pause, toggle", () => {
    it("play starts, pause stops, and resuming continues from the same spot", async () => {
      const { player, media } = setup();
      expect(await player.play()).toBe(true);
      expect(player.state).toBe("playing");
      media.advance(7.5);
      player.pause();
      expect(player.state).toBe("paused");
      expect(player.currentTime).toBe(7.5);
      await player.play();
      expect(player.state).toBe("playing");
      expect(player.currentTime).toBe(7.5);
    });

    it("is READY at 0:00 and PAUSED anywhere else", async () => {
      const { player, media } = setup();
      expect(player.state).toBe("ready");
      await player.play();
      player.pause();
      expect(player.state).toBe("ready"); // paused right at 0:00 is still the start
      await player.play();
      media.advance(1);
      player.pause();
      expect(player.state).toBe("paused");
    });

    it("toggle flips the state synchronously and says which way it went", () => {
      const { player, media } = setup();
      expect(player.toggle()).toBe("play");
      expect(media.paused).toBe(false); // no waiting for the promise or an event
      expect(player.state).toBe("playing");
      expect(player.toggle()).toBe("pause");
      expect(media.paused).toBe(true);
      expect(player.state).not.toBe("playing");
    });

    it("toggle does nothing with no track", () => {
      const { player } = setup(false);
      expect(player.toggle()).toBe("none");
      expect(player.state).toBe("empty");
    });

    it("play and pause with no track do nothing and don't throw", async () => {
      const { player } = setup(false);
      expect(await player.play()).toBe(false);
      expect(() => player.pause()).not.toThrow();
    });

    it("emits play and pause events", async () => {
      const { player, events } = setup();
      await player.play();
      player.pause();
      expect(events.map((e) => e.type)).toEqual(["loaded", "play", "pause"]);
    });

    it("playing from the very end starts over at 0:00", async () => {
      const { player, media } = setup();
      await player.play();
      media.advance(100);
      expect(media.ended).toBe(true);
      expect(player.state).toBe("paused");
      await player.play();
      expect(player.currentTime).toBe(0);
      expect(player.state).toBe("playing");
    });

    it("emits ended when the track finishes", async () => {
      const { player, media, events } = setup();
      await player.play();
      media.advance(100);
      expect(events.map((e) => e.type)).toContain("ended");
    });
  });

  describe("play being refused", () => {
    it("reports blocked (no user activation yet) and stays stopped", async () => {
      const { player, media, events } = setup();
      media.playError = "NotAllowedError";
      expect(await player.play()).toBe(false);
      expect(events.at(-1)).toEqual({ type: "blocked" });
    });

    it("treats AbortError (a pause arrived first) as nothing", async () => {
      const { player, media, events } = setup();
      media.playError = "AbortError";
      expect(await player.play()).toBe(false);
      expect(events.some((e) => e.type === "blocked" || e.type === "error")).toBe(false);
    });

    it("reports other failures as errors", async () => {
      const { player, media, events } = setup();
      media.playError = "NotSupportedError";
      await player.play();
      expect(events.at(-1)).toMatchObject({ type: "error" });
    });
  });

  describe("seek", () => {
    it("moves the playhead and keeps playing", async () => {
      const { player, media } = setup();
      await player.play();
      media.advance(12);
      expect(player.seek(3)).toBe(3);
      expect(player.currentTime).toBe(3);
      expect(player.state).toBe("playing");
    });

    it("keeps a paused track paused", async () => {
      const { player } = setup();
      player.seek(10);
      expect(player.state).toBe("paused");
      expect(player.currentTime).toBe(10);
    });

    it("clamps to the track", () => {
      const { player } = setup();
      expect(player.seek(-5)).toBe(0);
      expect(player.seek(999)).toBe(30);
      expect(player.seek(NaN)).toBe(30); // ignored: stays where it was
    });

    it("is ignored with no track", () => {
      const { player } = setup(false);
      expect(player.seek(5)).toBe(0);
    });

    it("emits seeked with where it landed", () => {
      const { player, events } = setup();
      player.seek(4.25);
      expect(events.at(-1)).toEqual({ type: "seeked", time: 4.25 });
    });
  });

  describe("listeners", () => {
    it("can unsubscribe", async () => {
      const { player, events } = setup();
      const seen: string[] = [];
      const off = player.on((e) => seen.push(e.type));
      await player.play();
      off();
      player.pause();
      expect(seen).toEqual(["play"]);
      expect(events.map((e) => e.type)).toContain("pause");
    });
  });

  describe("the picture (R9)", () => {
    it("hasVideo is true only for a video element with a picture, and only once loaded", () => {
      const { player, media } = setup(false);
      expect(player.hasVideo).toBe(false);
      player.loadFile(new Blob(["x"]));
      expect(player.hasVideo).toBe(false); // header not read yet
      media.finishLoading();
      expect(player.hasVideo).toBe(_kind === "video");
    });
  });
});
