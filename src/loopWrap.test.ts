import { describe, expect, it } from "vitest";
import { AudioPlayer } from "./audioPlayer";
import { NO_LOOP, type LoopState } from "./loop";
import { LoopWrapper } from "./loopWrap";
import { FakeUrls, MEDIA_KINDS } from "./test/fakeMedia";

describe.each(MEDIA_KINDS)("%s element", (_kind, Media) => {
  function setup(loop: LoopState, lookahead = 0) {
    const media = new Media();
    const player = new AudioPlayer(media, new FakeUrls());
    player.loadFile(new Blob(["x"]));
    media.finishLoading();
    let current = loop;
    let clock = 0;
    const wrapper = new LoopWrapper(player, () => current, () => clock, lookahead);
    /** Advances the music in `step`-second pieces, checking after each, like a poll would. */
    const run = (seconds: number, step: number) => {
      const n = Math.round(seconds / step);
      for (let i = 0; i < n; i++) {
        media.advance(step);
        clock += step * 1000;
        wrapper.check();
      }
    };
    return { media, player, wrapper, run, setLoop: (l: LoopState) => (current = l) };
  }

  describe("LoopWrapper", () => {
    it("jumps from END back to START and keeps playing, again and again", async () => {
      const { player, wrapper, run } = setup({ start: 5, end: 8 });
      player.seek(5);
      await player.play();
      run(30, 0.01); // 10 passes of a 3 s loop
      expect(wrapper.wraps).toBeGreaterThanOrEqual(9);
      expect(player.state).toBe("playing");
      expect(player.currentTime).toBeGreaterThanOrEqual(5);
      expect(player.currentTime).toBeLessThan(8.02);
      for (const w of wrapper.history) {
        expect(w.landedAt).toBe(5);
        expect(w.overshootSec).toBeGreaterThanOrEqual(0);
        expect(w.overshootSec).toBeLessThan(0.0101); // never more than one polling step past END
      }
    });

    it("measures the overshoot: the size of the polling step", async () => {
      const { player, wrapper, run } = setup({ start: 5, end: 8 });
      player.seek(5);
      await player.play();
      run(3.2, 0.05); // coarse polling: overshoot up to 50 ms
      expect(wrapper.history).toHaveLength(1);
      expect(wrapper.history[0].overshootSec).toBeGreaterThanOrEqual(0);
      expect(wrapper.history[0].overshootSec).toBeLessThanOrEqual(0.0501);
    });

    it("records how long the seek took to finish", async () => {
      const { player, wrapper, run } = setup({ start: 5, end: 8 });
      player.seek(5);
      await player.play();
      run(3.1, 0.01);
      expect(wrapper.history[0].seekedMs).not.toBeNull();
    });

    it("a look-ahead cuts the loop short by that much (negative overshoot)", async () => {
      const { player, wrapper, run } = setup({ start: 5, end: 8 }, 0.03);
      player.seek(5);
      await player.play();
      run(3.1, 0.01);
      expect(wrapper.history[0].overshootSec).toBeLessThan(0);
      expect(wrapper.history[0].overshootSec).toBeGreaterThanOrEqual(-0.0301);
    });

    it("does nothing while paused, with no loop, or with START only", async () => {
      const { player, media, wrapper, run, setLoop } = setup({ start: 5, end: 8 });
      player.seek(8.5);
      expect(wrapper.check()).toBe(false); // paused past END: leave it alone
      await player.play();
      setLoop(NO_LOOP);
      run(1, 0.01);
      expect(wrapper.wraps).toBe(0);
      setLoop({ start: 5, end: null });
      media.advance(1);
      expect(wrapper.check()).toBe(false);
    });

    it("setting END behind the playhead starts the loop at once (an 'engage', not a measured wrap)", async () => {
      const { player, wrapper, setLoop } = setup(NO_LOOP);
      player.seek(12);
      await player.play();
      setLoop({ start: 4, end: 11 });
      expect(wrapper.check(true)).toBe(true);
      expect(player.currentTime).toBe(4);
      expect(wrapper.wraps).toBe(0);
      expect(wrapper.history).toHaveLength(0);
    });

    it("a nudged START takes effect at the next wrap", async () => {
      const { player, wrapper, run, setLoop } = setup({ start: 5, end: 8 });
      player.seek(5);
      await player.play();
      run(3.1, 0.01);
      expect(wrapper.history.at(-1)!.landedAt).toBe(5);
      setLoop({ start: 4.5, end: 8 });
      run(3.6, 0.01);
      expect(wrapper.history.at(-1)!.landedAt).toBe(4.5);
    });

    it("a loop that ends at the very end of the track keeps going when the element stops", async () => {
      const { player, media } = setup({ start: 20, end: 30 }); // FakeMedia's track is 30 s
      player.seek(29.9);
      await player.play();
      media.advance(0.5); // runs off the end: pause + ended
      expect(player.currentTime).toBe(20);
      expect(player.state).toBe("playing");
    });

    it("R5: wraps cleanly at 2x: lands on START, keeps the speed, overshoot is at most one poll of REAL time (twice that in music), and twice as many passes", async () => {
      const one = setup({ start: 5, end: 8 });
      one.player.seek(5);
      await one.player.play();
      one.run(15, 0.01);
      const two = setup({ start: 5, end: 8 });
      two.player.setRate(2);
      two.player.seek(5);
      await two.player.play();
      two.run(15, 0.01);
      expect(two.wrapper.wraps).toBeGreaterThanOrEqual(2 * one.wrapper.wraps - 1);
      expect(two.player.rate).toBe(2);
      expect(two.player.state).toBe("playing");
      for (const w of two.wrapper.history) {
        expect(w.landedAt).toBe(5);
        expect(w.overshootSec).toBeGreaterThanOrEqual(0);
        expect(w.overshootSec).toBeLessThan(0.0201); // one 10 ms poll at 2x
      }
    });

    it("R5b: wraps cleanly at the slowed speeds too (0.5, 0.75, 0.85): lands on START, keeps the speed, overshoot is one poll of real time, fewer passes", async () => {
      const base = setup({ start: 5, end: 8 });
      base.player.seek(5);
      await base.player.play();
      base.run(30, 0.01);
      for (const rate of [0.5, 0.75, 0.85]) {
        const s = setup({ start: 5, end: 8 });
        s.player.setRate(rate);
        s.player.seek(5);
        await s.player.play();
        s.run(30, 0.01);
        expect(s.player.rate).toBe(rate);
        expect(s.player.state).toBe("playing");
        expect(s.wrapper.wraps).toBeLessThan(base.wrapper.wraps);
        expect(s.wrapper.wraps).toBeGreaterThanOrEqual(Math.floor(base.wrapper.wraps * rate) - 1);
        for (const w of s.wrapper.history) {
          expect(w.landedAt).toBe(5);
          expect(w.overshootSec).toBeGreaterThanOrEqual(0);
          expect(w.overshootSec).toBeLessThan(0.0101 * rate + 1e-6);
        }
      }
    });

    it("R5: the speed can change in the middle of a loop without upsetting the wrap", async () => {
      const { player, wrapper, run } = setup({ start: 5, end: 8 });
      player.seek(5);
      await player.play();
      run(2, 0.01);
      player.setRate(2);
      run(2, 0.01);
      player.setRate(0.5);
      run(8, 0.01);
      expect(wrapper.wraps).toBeGreaterThanOrEqual(2);
      expect(player.currentTime).toBeGreaterThanOrEqual(5);
      expect(player.currentTime).toBeLessThan(8.02);
    });

    it("keeps the history capped", async () => {
      const { player, wrapper, run } = setup({ start: 1, end: 1.6 });
      player.seek(1);
      await player.play();
      run(300, 0.01);
      expect(wrapper.wraps).toBeGreaterThan(200);
      expect(wrapper.history.length).toBeLessThanOrEqual(200);
    });
  });
});
