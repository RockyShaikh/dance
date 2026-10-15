/**
 * R9: spoken feedback. A dancer across the room cannot read the screen, so key events are said out loud, in words ("loop in",
 * "no loop set"), not chimes: a word can also say "nothing happened, and why", which a chime cannot.
 *
 * The decisions are pure and tested: `speechForAction` (what a transport action means, as an event), `phraseFor` (the words),
 * `gate` (the cooldown). `Speaker` is the thin browser part around `speechSynthesis`; it is injected, so tests drive a fake.
 *
 * Why it cannot hurt the music: speechSynthesis hands the text to the operating system's speech engine (a separate process),
 * so nothing here decodes or mixes audio in the page, and the page does one cheap `speak()` call per event. The media element
 * is never touched, so it neither ducks nor stalls (measured: scripts/e2e/speech.mjs).
 */
import { isLooping, type LoopState } from "./loop";
import type { TransportAction } from "./transport";

export type SpeechEvent =
  | { type: "loopIn" }
  | { type: "loopOut" }
  | { type: "loopCleared" }
  /** An action needed a loop (or a loop START / END) and there is none: restart-to-IN, steering START / END, a nudge. */
  | { type: "noLoop" }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "fromTop" }
  /** The speed has settled (no change for `SPEECH.settleMs`). */
  | { type: "speed"; rate: number };

export const SPEECH = {
  /** Never two words closer than this: the newer one is dropped (a burst is one thing happening). */
  minGapMs: 250,
  /** The same words again within this long are dropped (holding a gesture or mashing a key does not repeat). */
  samePhraseMs: 1500,
  /** The speed is spoken once it has stopped changing for this long (a wheel turn is one number at the end). */
  settleMs: 700,
  /** Speaking rate: a little quicker than normal, since every phrase is one to three words. */
  utteranceRate: 1.1,
  defaultVolume: 0.8,
} as const;

/** "80 percent", "97.5 percent", "200 percent": the speed in the words a dancer says it. */
export function speedPhrase(rate: number): string {
  const pct = Number((rate * 100).toFixed(1));
  return `${pct} percent`;
}

export function phraseFor(e: SpeechEvent): string {
  switch (e.type) {
    case "loopIn":
      return "loop in";
    case "loopOut":
      return "loop out";
    case "loopCleared":
      return "loop cleared";
    case "noLoop":
      return "no loop set";
    case "playing":
      return "playing";
    case "paused":
      return "paused";
    case "fromTop":
      return "from the top";
    case "speed":
      return speedPhrase(e.rate);
  }
}

/** What the transport action just did, as something to say (null: nothing worth saying). */
export function speechForAction(
  action: TransportAction,
  r: { before: LoopState; after: LoopState; changed: boolean; playing: boolean; loaded: boolean },
): SpeechEvent | null {
  if (!r.loaded) return null;
  const { before, after } = r;
  switch (action) {
    case "toggle":
      return { type: r.playing ? "playing" : "paused" };
    case "restartTop":
      return { type: "fromTop" };
    case "restart":
      // Index up goes to the loop IN; with none set it goes to 0:00, and says why it did not go to a point.
      return after.start === null ? { type: "noLoop" } : null;
    case "setStart":
      return r.changed ? { type: "loopIn" } : null;
    case "setEnd":
      if (r.changed) return { type: "loopOut" };
      return before.start === null ? { type: "noLoop" } : null;
    case "clearLoop":
      return r.changed ? { type: "loopCleared" } : { type: "noLoop" };
    case "loopStep":
      if (!r.changed) return null;
      if (after.start === null && after.end === null) return { type: "loopCleared" };
      return isLooping(after) && !isLooping(before) ? { type: "loopOut" } : { type: "loopIn" };
    case "speedToggle":
    case "speedUp":
    case "speedDown":
    case "speedReset":
    case "speedSet":
      return null; // said once the speed settles (Speaker.speedChanged), not on every step
  }
}

export interface GateState {
  /** When the last phrase was spoken (-Infinity: never) and which. */
  lastAt: number;
  lastPhrase: string | null;
}

export const IDLE_GATE: GateState = { lastAt: -Infinity, lastPhrase: null };

/** The cooldown: speak `phrase` at `now`? Pure; the new state only records a phrase that is spoken. */
export function gate(state: GateState, now: number, phrase: string, cfg: { minGapMs: number; samePhraseMs: number } = SPEECH): { speak: boolean; state: GateState } {
  const since = now - state.lastAt;
  if (since < cfg.minGapMs) return { speak: false, state };
  if (phrase === state.lastPhrase && since < cfg.samePhraseMs) return { speak: false, state };
  return { speak: true, state: { lastAt: now, lastPhrase: phrase } };
}

/** The slice of an utterance this module sets. */
export interface UtteranceLike {
  text: string;
  volume: number;
  rate: number;
}

/** The slice of `speechSynthesis` this module uses. */
export interface SynthLike {
  speak(u: UtteranceLike): void;
  cancel(): void;
}

export interface SpeechPrefs {
  speech: boolean;
  speechVolume: number;
}

export class Speaker {
  private gateState = IDLE_GATE;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  /** The word being said (or last said). Held here so the browser can't garbage-collect it mid-word (a known Chrome bug). */
  lastUtterance: UtteranceLike | null = null;

  constructor(
    private readonly prefs: SpeechPrefs,
    private readonly synth: SynthLike | null,
    private readonly makeUtterance: (text: string) => UtteranceLike,
    private readonly now: () => number = () => performance.now(),
    private readonly schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => setTimeout(fn, ms),
  ) {}

  /** Says the event's words unless speech is off, the cooldown says no, or there is no speech engine. True when spoken. */
  say(e: SpeechEvent): boolean {
    if (!this.prefs.speech || !this.synth) return false;
    const phrase = phraseFor(e);
    const g = gate(this.gateState, this.now(), phrase);
    if (!g.speak) return false;
    this.gateState = g.state;
    this.speakNow(phrase);
    return true;
  }

  /** The playback speed changed: say it once it has stopped changing. Anything newer replaces the pending one. */
  speedChanged(rate: number): void {
    this.cancelSettle();
    if (!this.prefs.speech) return;
    this.settleTimer = this.schedule(() => {
      this.settleTimer = null;
      this.say({ type: "speed", rate });
    }, SPEECH.settleMs);
  }

  /** Forget a pending speed word (a new file loaded: its speed reset is not news). */
  cancelSettle(): void {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  /** A sample word at the current volume (the volume slider), ignoring the cooldown. */
  sample(): void {
    if (this.prefs.speech && this.synth) this.speakNow("volume");
  }

  private speakNow(text: string): void {
    const u = this.makeUtterance(text);
    u.volume = Math.min(1, Math.max(0, this.prefs.speechVolume));
    u.rate = SPEECH.utteranceRate;
    this.lastUtterance = u;
    // The newest word is the true one: cut off an older word still being said rather than queueing behind it.
    this.synth!.cancel();
    this.synth!.speak(u);
  }
}

/** The real speech engine, or null (no speechSynthesis in this browser). Browser only. */
export function createBrowserSpeaker(prefs: SpeechPrefs): Speaker {
  const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  return new Speaker(
    prefs,
    synth as unknown as SynthLike | null,
    (text) => new SpeechSynthesisUtterance(text),
  );
}
