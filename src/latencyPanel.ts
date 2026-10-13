import { FLASH_DEFAULTS, FlashTest, type Marker } from "./flashTest";
import { RollingSamples, latencyStats, ms, statsLine } from "./latency";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

/** What the picker knows about the camera, for labelling a result. */
export type CameraLabel = () => string;

/**
 * R7, in the Bench panel: per-frame timings, and the glass-to-glass flash test (flashTest.ts has the method).
 *
 * Per-frame timings (rolling, last ~150 frames), all from the frame's `captureTime` where Chrome gives one:
 *  - model: the hand model call alone (crop + inference);
 *  - camera -> app: captured to the page's callback (the link, decode and the browser's queue);
 *  - captured -> processed: captured to this app finishing that frame (the above plus our work: the end of the "seeing" part);
 *  - captured -> command fired: the same, measured at the moment a command's ring completed and the music was told.
 */
export class LatencyPanel {
  readonly model = new RollingSamples(150);
  readonly cameraToApp = new RollingSamples(150);
  readonly captureToDone = new RollingSamples(150);
  readonly captureToFire = new RollingSamples(50);
  /** The tester. */
  readonly test: FlashTest;
  /** How many frames in a row had no captureTime (Chrome gives none for some sources). */
  noCaptureTime = true;

  private readonly marker = el("flash-marker");
  private readonly info = el("flash-info");
  private readonly button = el<HTMLButtonElement>("lt-start");
  private readonly status = el("lt-status");
  private readonly history = el("lt-history");
  private readonly lines: string[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private lastRefresh = 0;
  private timer = 0;
  private lastPhase = "idle";

  constructor(private readonly cameraLabel: CameraLabel, private readonly size: () => { width: number; height: number }) {
    this.test = new FlashTest({ setMarker: (m) => this.setMarker(m) });
    this.button.addEventListener("click", () => (this.test.running ? this.stop(true) : this.start()));
    el("lt-copy").addEventListener("click", () => {
      void navigator.clipboard?.writeText(this.lines.join("\n")).catch(() => {});
      this.button.blur();
    });
    document.addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.test.running) this.stop(true);
    });
  }

  private start(): void {
    this.test.start(performance.now());
    this.marker.hidden = false;
    this.button.textContent = "Cancel test";
    this.timer = window.setInterval(() => {
      this.test.tick(performance.now());
      this.syncPhase();
    }, 100);
  }

  private stop(cancelled: boolean): void {
    if (cancelled) {
      this.test.cancel();
      this.lastPhase = "idle";
      this.status.textContent = "Cancelled.";
      this.status.className = "note";
    }
    window.clearInterval(this.timer);
    this.marker.hidden = true;
    this.button.textContent = "Start latency test";
  }

  /** Black or white over the whole screen; the time it was actually drawn (next animation frame) is t0 of the trial. */
  private setMarker(m: Marker): void {
    requestAnimationFrame(() => {
      this.marker.dataset.m = m;
      this.test.markerShown(performance.now());
    });
  }

  /** One camera frame reached the app (called from the frame loop, before the model runs). Cheap unless the test is running. */
  onFrame(video: HTMLVideoElement, now: number, captureTime: number | null): void {
    this.noCaptureTime = captureTime === null;
    if (!this.test.running) return;
    this.test.onFrame({ now, luma: this.luma(video), captureTime });
    this.syncPhase();
  }

  /** Mean brightness (0..255) of the whole picture, from a 32 x 18 copy. */
  private luma(video: HTMLVideoElement): number {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = 32;
      this.canvas.height = 18;
      this.g = this.canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!this.g || video.videoWidth === 0) return 0;
    this.g.drawImage(video, 0, 0, 32, 18);
    const px = this.g.getImageData(0, 0, 32, 18).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    return sum / (px.length / 4);
  }

  private syncPhase(): void {
    const t = this.test;
    const label =
      t.phase === "cal-black" || t.phase === "cal-white"
        ? "Measuring black and white as the camera sees them…"
        : t.running
          ? `Flash ${Math.min(t.completed + 1, FLASH_DEFAULTS.trials)} of ${FLASH_DEFAULTS.trials}`
          : "";
    this.info.textContent = t.running ? `${label}   Esc cancels` : "";
    if (t.running) this.status.textContent = label;
    if (t.phase !== this.lastPhase) {
      this.lastPhase = t.phase;
      if (t.phase === "done") this.finish();
      else if (t.phase === "failed") {
        this.stop(false);
        this.status.textContent = t.failReason;
        this.status.className = "note warn";
      } else if (t.phase === "idle") {
        this.status.textContent = "Cancelled.";
        this.status.className = "note";
      }
    }
  }

  private finish(): void {
    this.stop(false);
    const t = this.test;
    const g = latencyStats(t.trials.map((x) => x.glassToApp));
    const c = latencyStats(t.trials.flatMap((x) => (x.flashToCapture === null ? [] : [x.flashToCapture])));
    const a = latencyStats(t.trials.flatMap((x) => (x.captureToApp === null ? [] : [x.captureToApp])));
    const { width, height } = this.size();
    const head = `${this.cameraLabel() || "camera"} · ${width}×${height}`;
    const line = `${head}: glass to app median ${ms(g?.median)} · p95 ${ms(g?.p95)} · min ${ms(g?.min)} · max ${ms(g?.max)} (${t.trials.length} flashes, ${t.misses} missed)${
      c && a ? ` · flash to captured ${ms(c.median)} + captured to app ${ms(a.median)}` : ""
    }`;
    this.lines.push(line);
    const li = document.createElement("li");
    li.textContent = line;
    this.history.prepend(li);
    this.status.textContent = `Done: median ${ms(g?.median)}, p95 ${ms(g?.p95)}.`;
    this.status.className = "note ok";
  }

  /** Called every frame: redraws the numbers a couple of times a second. */
  refresh(now: number): void {
    if (now - this.lastRefresh < 500) return;
    this.lastRefresh = now;
    const set = (id: string, text: string) => {
      const n = el(id);
      if (n.textContent !== text) n.textContent = text;
    };
    set("lt-model", statsLine(this.model.stats(), 1));
    set("lt-c2a", this.noCaptureTime ? "n/a (no capture time from this camera)" : statsLine(this.cameraToApp.stats()));
    set("lt-done", this.noCaptureTime ? "n/a" : statsLine(this.captureToDone.stats()));
    set("lt-fire", this.noCaptureTime ? "n/a" : statsLine(this.captureToFire.stats()));
  }
}
