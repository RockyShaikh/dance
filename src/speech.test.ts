import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "./audioPlayer";
import { NO_LOOP, type LoopState } from "./loop";
import { IDLE_GATE, SPEECH, Speaker, gate, phraseFor, speechForAction, speedPhrase, type SpeechEvent, type SynthLike, type UtteranceLike } from "./speech";
import { FakeUrls, MEDIA_KINDS } from "./test/fakeMedia";
import { runTransport, type TransportAction } from "./transport";

describe("phrases (the words, not chimes)", () => {
  it("each event is said in plain words", () => {
    const words: Record<string, SpeechEvent> = {
      "loop in": { type: "loopIn" },
      "loop out": { type: "loopOut" },
      "loop cleared": { type: "loopCleared" },
      "no loop set": { type: "noLoop" },
      playing: { type: "playing" },
      paused: { type: "paused" },
      "from the top": { type: "fromTop" },
    };
    for (const [phrase, e] of Object.entries(words)) expect(phraseFor(e)).toBe(phrase);
  });

  it("the speed is said as a percentage, with no float noise", () => {
    expect(speedPhrase(0.8)).toBe("80 percent");
    expect(speedPhrase(2)).toBe("200 percent");
    expect(speedPhrase(1)).toBe("100 percent");
    expect(speedPhrase(0.975)).toBe("97.5 percent");
    expect(speedPhrase(0.525)).toBe("52.5 percent");
    expect(speedPhrase(0.8 + 0.025 + 0.025)).toBe("85 percent");
  });
});

describe.each(MEDIA_KINDS)("action -> event, through the real transport on a %s element", (_kind, Media) => {
  function run(action: TransportAction, loop: LoopState, opts: { markAt?: number; startPlaying?: boolean } = {}) {
    const media = new Media();
    const player = new AudioPlayer(media, new FakeUrls());
    player.loadFile(new Blob(["x"]));
    media.finishLoading();
    if (opts.startPlaying) {
      void player.play();
    }
    const r = runTransport(player, loop, action, { markAt: opts.markAt });
    return speechForAction(action, { before: loop, after: r.loop, changed: r.changed, playing: player.state === "playing", loaded: player.loaded });
  }

  it("play / pause speak what the music is now doing", () => {
    expect(run("toggle", NO_LOOP)).toEqual({ type: "playing" });
    expect(run("toggle", NO_LOOP, { startPlaying: true })).toEqual({ type: "paused" });
  });

  it("setting START says loop in; setting END says loop out; clearing says loop cleared", () => {
    expect(run("setStart", NO_LOOP, { markAt: 5 })).toEqual({ type: "loopIn" });
    expect(run("setEnd", { start: 5, end: null }, { markAt: 9 })).toEqual({ type: "loopOut" });
    expect(run("clearLoop", { start: 5, end: 9 })).toEqual({ type: "loopCleared" });
  });

  it("the V cycle: START (loop in), then END (loop out), then clear (loop cleared)", () => {
    expect(run("loopStep", NO_LOOP, { markAt: 5 })).toEqual({ type: "loopIn" });
    expect(run("loopStep", { start: 5, end: null }, { markAt: 9 })).toEqual({ type: "loopOut" });
    expect(run("loopStep", { start: 5, end: 9 })).toEqual({ type: "loopCleared" });
  });

  it("an action that needs a loop and has none says no loop set: restart-to-IN, END with no START, clear with nothing", () => {
    expect(run("restart", NO_LOOP)).toEqual({ type: "noLoop" });
    expect(run("setEnd", NO_LOOP, { markAt: 9 })).toEqual({ type: "noLoop" });
    expect(run("clearLoop", NO_LOOP)).toEqual({ type: "noLoop" });
  });

  it("restart with a loop IN set is silent (it just goes there); Home says from the top", () => {
    expect(run("restart", { start: 5, end: null })).toBeNull();
    expect(run("restartTop", { start: 5, end: 9 })).toEqual({ type: "fromTop" });
  });

  it("a refused mark (START after END, END too close) says nothing; speed steps are said when they settle, not here", () => {
    expect(run("setStart", { start: 5, end: 9 }, { markAt: 20 })).toBeNull();
    expect(run("setEnd", { start: 5, end: null }, { markAt: 5.01 })).toBeNull();
    for (const a of ["speedToggle", "speedUp", "speedDown", "speedReset", "speedSet"] as const) expect(run(a, NO_LOOP)).toBeNull();
  });

  it("nothing is said with no file loaded", () => {
    const media = new Media();
    const player = new AudioPlayer(media, new FakeUrls());
    const r = runTransport(player, NO_LOOP, "toggle");
    expect(speechForAction("toggle", { before: NO_LOOP, after: r.loop, changed: r.changed, playing: false, loaded: player.loaded })).toBeNull();
  });
});

describe("the cooldown (gate)", () => {
  it("speaks the first word; drops anything closer than the minimum gap; speaks again after it", () => {
    let g = gate(IDLE_GATE, 1000, "loop in");
    expect(g.speak).toBe(true);
    const a = gate(g.state, 1000 + SPEECH.minGapMs - 1, "loop out");
    expect(a.speak).toBe(false);
    expect(a.state).toBe(g.state); // a dropped word does not move the clock
    g = gate(g.state, 1000 + SPEECH.minGapMs, "loop out");
    expect(g.speak).toBe(true);
  });

  it("the same words again within the repeat window are dropped, different words are not", () => {
    const first = gate(IDLE_GATE, 0, "paused");
    expect(gate(first.state, SPEECH.samePhraseMs - 1, "paused").speak).toBe(false);
    expect(gate(first.state, 600, "playing").speak).toBe(true);
    expect(gate(first.state, SPEECH.samePhraseMs, "paused").speak).toBe(true);
  });

  it("a held gesture or a mashed key (an event every 50 ms for 5 s) speaks only a few times", () => {
    let s = IDLE_GATE;
    let spoken = 0;
    for (let t = 0; t < 5000; t += 50) {
      const g = gate(s, t, "paused");
      s = g.state;
      if (g.speak) spoken++;
    }
    expect(spoken).toBeLessThanOrEqual(4);
    expect(spoken).toBeGreaterThanOrEqual(3);
  });
});

describe("Speaker", () => {
  afterEach(() => vi.useRealTimers());

  function setup(prefs = { speech: true, speechVolume: 0.5 }, hasSynth = true) {
    const said: UtteranceLike[] = [];
    let cancels = 0;
    const synth: SynthLike = {
      speak: (u) => void said.push({ ...u }),
      cancel: () => void cancels++,
    };
    let clock = 0;
    const speaker = new Speaker(prefs, hasSynth ? synth : null, (text) => ({ text, volume: 1, rate: 1 }), () => clock);
    return { speaker, said, prefs, cancels: () => cancels, at: (t: number) => (clock = t) };
  }

  it("speaks the words at the chosen volume and a brisk rate", () => {
    const { speaker, said } = setup();
    expect(speaker.say({ type: "loopIn" })).toBe(true);
    expect(said).toEqual([{ text: "loop in", volume: 0.5, rate: SPEECH.utteranceRate }]);
  });

  it("the volume setting applies live", () => {
    const { speaker, said, prefs, at } = setup();
    speaker.say({ type: "loopIn" });
    prefs.speechVolume = 1;
    at(2000);
    speaker.say({ type: "loopOut" });
    expect(said.map((u) => u.volume)).toEqual([0.5, 1]);
  });

  it("is silent when switched off, or when the browser has no speech engine", () => {
    const off = setup({ speech: false, speechVolume: 0.5 });
    expect(off.speaker.say({ type: "paused" })).toBe(false);
    expect(off.said).toEqual([]);
    const none = setup(undefined, false);
    expect(none.speaker.say({ type: "paused" })).toBe(false);
  });

  it("applies the cooldown, and a newer word cuts off an older one instead of queueing", () => {
    const { speaker, said, cancels, at } = setup();
    expect(speaker.say({ type: "paused" })).toBe(true);
    at(100);
    expect(speaker.say({ type: "playing" })).toBe(false); // too soon
    at(400);
    expect(speaker.say({ type: "playing" })).toBe(true);
    expect(said.map((u) => u.text)).toEqual(["paused", "playing"]);
    expect(cancels()).toBe(2); // each word first cut off whatever was still being said
  });

  it("the speed is said once, after it settles; a newer speed replaces the pending one", () => {
    vi.useFakeTimers();
    const { speaker, said, at } = setup();
    speaker.speedChanged(0.975);
    vi.advanceTimersByTime(300);
    speaker.speedChanged(0.95);
    vi.advanceTimersByTime(300);
    speaker.speedChanged(0.9);
    expect(said).toEqual([]);
    at(5000);
    vi.advanceTimersByTime(SPEECH.settleMs);
    expect(said.map((u) => u.text)).toEqual(["90 percent"]);
  });

  it("a pending speed word is dropped when a new file loads (cancelSettle), and when speech is off", () => {
    vi.useFakeTimers();
    const a = setup();
    a.speaker.speedChanged(0.8);
    a.speaker.cancelSettle();
    vi.advanceTimersByTime(5000);
    expect(a.said).toEqual([]);
    const b = setup({ speech: false, speechVolume: 1 });
    b.speaker.speedChanged(0.8);
    vi.advanceTimersByTime(5000);
    expect(b.said).toEqual([]);
  });

  it("the volume sample is a word at the current volume, ignoring the cooldown", () => {
    const { speaker, said } = setup();
    speaker.say({ type: "paused" });
    speaker.sample();
    expect(said.map((u) => u.text)).toEqual(["paused", "volume"]);
  });
});
