/**
 * R7: the glass-to-glass latency test, as a pure state machine (no DOM, no clock of its own: every call is given `now`).
 *
 * The camera must SEE the laptop screen. The screen flips from black to white at a known moment (t0); the test reports how long
 * until a camera frame that is bright enough reaches the app (the rVFC callback time). That sums everything between the glass of
 * the screen and the app's code: the screen's own delay (up to one refresh, a few ms, the same for every camera), exposure,
 * the camera's pipeline, the USB or Wi-Fi link, decode, and the app's event loop (the hand model runs on the same thread, so a
 * busy frame delays the callback: that is the latency the app really has). Where the browser gives a frame's `captureTime`, the
 * time is split: flash -> captured (optical + exposure) and captured -> app (link + decode).
 *
 * Steps: (1) black for a moment, then white for a moment, to learn how bright each is as the camera sees it; if the two are too
 * close the camera does not see the screen and the test stops with that message. (2) N trials: wait on black (a random time, and
 * until the picture is dark again), flip to white, time until the picture crosses the midpoint; repeat.
 */

export type Marker = "black" | "white";

export interface FlashConfig {
  trials: number;
  /** Calibration: ignore the first ms after a colour change (the camera's picture lags), then average the next. */
  settleMs: number;
  sampleMs: number;
  /** The white and black pictures must differ by at least this much (mean brightness, 0..255) for the camera to count as seeing the screen. */
  minSwing: number;
  minWaitMs: number;
  maxWaitMs: number;
  /** A trial with no bright frame this long after the flip is a miss. */
  timeoutMs: number;
  /** The picture must be dark for this many frames in a row before a flip. */
  quietFrames: number;
  /** Give up when a calibration step makes no progress for this long (no frames arriving). */
  stallMs: number;
}

export const FLASH_DEFAULTS: FlashConfig = {
  trials: 20,
  settleMs: 700,
  sampleMs: 500,
  minSwing: 15,
  minWaitMs: 800,
  maxWaitMs: 1400,
  timeoutMs: 2000,
  quietFrames: 2,
  stallMs: 6000,
};

export interface FlashFrame {
  /** When the app got the frame (the rVFC callback time, ms, performance.now() timebase). */
  now: number;
  /** Mean brightness of the whole picture, 0..255. */
  luma: number;
  /** When the camera captured it, if the browser says (same timebase). */
  captureTime?: number | null;
}

export interface Trial {
  /** Screen flipped -> frame reached the app. */
  glassToApp: number;
  /** Screen flipped -> captured (null: the browser gave no captureTime). Can include the screen's own delay. */
  flashToCapture: number | null;
  /** Captured -> reached the app. */
  captureToApp: number | null;
}

export type FlashPhase = "idle" | "cal-black" | "cal-white" | "wait" | "flip" | "flash" | "done" | "failed";

export interface FlashIo {
  /** Show the black or white marker over the whole screen (the UI should then call `markerShown` with the time it was drawn). */
  setMarker(m: Marker): void;
}

export class FlashTest {
  phase: FlashPhase = "idle";
  trials: Trial[] = [];
  misses = 0;
  failReason = "";
  black = 0;
  white = 0;
  threshold = 0;
  /** Trials finished (hit or miss). */
  get completed(): number {
    return this.trials.length + this.misses;
  }

  private phaseStart = 0;
  private samples: number[] = [];
  private waitUntil = 0;
  private quiet = 0;
  private t0 = 0;

  constructor(
    private readonly io: FlashIo,
    private readonly cfg: FlashConfig = FLASH_DEFAULTS,
    private readonly rand: () => number = Math.random,
  ) {}

  get running(): boolean {
    return this.phase !== "idle" && this.phase !== "done" && this.phase !== "failed";
  }

  start(now: number): void {
    this.trials = [];
    this.misses = 0;
    this.failReason = "";
    this.enter("cal-black", now);
    this.io.setMarker("black");
  }

  cancel(): void {
    if (this.running) {
      this.phase = "idle";
    }
  }

  /** The marker is on the screen (UI: the time of the animation frame that drew it). */
  markerShown(t: number): void {
    if (this.phase === "flip") {
      this.t0 = t;
      this.phase = "flash";
    }
  }

  onFrame(f: FlashFrame): void {
    const c = this.cfg;
    switch (this.phase) {
      case "cal-black":
      case "cal-white": {
        const since = f.now - this.phaseStart;
        if (since < c.settleMs) return;
        this.samples.push(f.luma);
        if (since < c.settleMs + c.sampleMs) return;
        const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
        if (this.phase === "cal-black") {
          this.black = mean;
          this.enter("cal-white", f.now);
          this.io.setMarker("white");
        } else {
          this.white = mean;
          if (this.white - this.black < c.minSwing) {
            return this.fail(
              `The camera does not see the screen: white ${this.white.toFixed(0)} vs black ${this.black.toFixed(0)} (brightness 0-255, needs a difference of ${c.minSwing}). Point it at the screen (a mirror works) and retry.`,
            );
          }
          this.threshold = (this.black + this.white) / 2;
          this.beginWait(f.now);
        }
        return;
      }
      case "wait":
        this.quiet = f.luma < this.threshold ? this.quiet + 1 : 0;
        if (f.now >= this.waitUntil && this.quiet >= c.quietFrames) {
          this.phase = "flip";
          this.phaseStart = f.now;
          this.io.setMarker("white");
        }
        return;
      case "flash": {
        // A frame captured before the flip cannot show it (a lit-up frame like that is noise): skip it.
        if (f.captureTime != null && f.captureTime < this.t0) return;
        if (f.luma < this.threshold) return;
        this.trials.push({
          glassToApp: f.now - this.t0,
          flashToCapture: f.captureTime != null ? f.captureTime - this.t0 : null,
          captureToApp: f.captureTime != null ? f.now - f.captureTime : null,
        });
        this.trialDone(f.now);
        return;
      }
      default:
        return;
    }
  }

  /** Timeouts (call a few times a second): a stalled calibration, a miss, a flip that never got drawn. */
  tick(now: number): void {
    const c = this.cfg;
    switch (this.phase) {
      case "cal-black":
      case "cal-white":
        if (now - this.phaseStart > c.settleMs + c.sampleMs + c.stallMs) this.fail("No camera frames arrived. Is the camera running?");
        return;
      case "flip":
        if (now - this.phaseStart > c.timeoutMs) this.fail("The marker was never drawn (is this tab visible?).");
        return;
      case "flash":
        if (now - this.t0 > c.timeoutMs) {
          this.misses++;
          this.trialDone(now);
        }
        return;
      case "wait":
        if (now - this.phaseStart > c.stallMs + c.maxWaitMs) this.fail("The picture never went dark again between flashes (is something else flashing?).");
        return;
      default:
        return;
    }
  }

  private trialDone(now: number): void {
    if (this.completed >= this.cfg.trials) {
      this.phase = "done";
      this.io.setMarker("black");
      return;
    }
    this.beginWait(now);
  }

  private beginWait(now: number): void {
    this.enter("wait", now);
    this.quiet = 0;
    this.waitUntil = now + this.cfg.minWaitMs + this.rand() * (this.cfg.maxWaitMs - this.cfg.minWaitMs);
    this.io.setMarker("black");
  }

  private enter(phase: FlashPhase, now: number): void {
    this.phase = phase;
    this.phaseStart = now;
    this.samples = [];
  }

  private fail(reason: string): void {
    this.phase = "failed";
    this.failReason = reason;
  }
}
