import "./style.css";
import { analyze, type HandReading } from "./analyze";
import { Bench } from "./bench";
import { normalizeBox, type Box } from "./box";
import { attachBoxEditor } from "./boxEditor";
import { CameraError, openCamera, openImage, openVideoFile, type FrameSource } from "./camera";
import { initialClutchState, stepClutches, type ClutchView } from "./clutch";
import { INITIAL_STATE, stepCommands, type HandObs, type MachineView } from "./commands";
import { APP, CLUTCH, COMMANDS, type ClutchConfig, type CommandConfig } from "./config";
import { drawHands } from "./draw";
import { drawHud } from "./hud";
import { loadRecognizer } from "./recognizer";
import { renderHands, setFps, setMessage, setStatus } from "./readout";
import { loadSettings, saveSettings } from "./settings";

const video = document.getElementById("video") as HTMLVideoElement;
const still = document.getElementById("still") as HTMLImageElement;
const canvas = document.getElementById("overlay") as HTMLCanvasElement;
const hudCanvas = document.getElementById("hud") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const hudCtx = hudCanvas.getContext("2d")!;

/** Counts processed frames over a sliding window. */
class FpsMeter {
  private times: number[] = [];
  tick(now: number): number {
    this.times.push(now);
    const cutoff = now - APP.fpsWindowSec * 1000;
    while (this.times.length > 1 && this.times[0] < cutoff) this.times.shift();
    if (this.times.length < 2) return 0;
    return ((this.times.length - 1) * 1000) / (now - this.times[0]);
  }
  reset(): void {
    this.times = [];
  }
}

// --- The test bench: settings, classifier state, panels -----------------------------

const settings = loadSettings();
const bench = new Bench(settings, { setBox });
let machine = INITIAL_STATE;
let clutch = initialClutchState();
let hands: HandReading[] = [];
let view: MachineView | null = null;
let clutchView: ClutchView | null = null;

/** Current thresholds: the config defaults with the slider/toggle settings applied. */
const commandCfg = (): CommandConfig => ({
  ...COMMANDS,
  dwellMs: settings.dwellMs,
  stillness: { ...COMMANDS.stillness, enabled: settings.stillness },
});
const clutchCfg = (): ClutchConfig => ({ ...CLUTCH, pinch: { ...CLUTCH.pinch, grabRatio: settings.pinchGrab } });

function setBox(b: Box): void {
  settings.box = normalizeBox(b);
  saveSettings(settings);
  bench.showBox(settings.box);
  redrawHud();
}

const editor = attachBoxEditor(hudCanvas, () => settings.box, setBox, () => redrawHud());

function redrawHud(): void {
  drawHud(hudCtx, {
    box: settings.box,
    active: editor.active,
    dragging: editor.dragging,
    palms: hands.map((h) => h.palm),
    view,
  });
}

function sizeCanvases(width: number, height: number): void {
  for (const c of [canvas, hudCanvas]) {
    if (c.width !== width || c.height !== height) {
      c.width = width;
      c.height = height;
    }
  }
}

/** One frame of results through the whole bench: skeleton, classifier, clutches, panels. */
function processFrame(ts: number, found: HandReading[], width: number, height: number): void {
  hands = found;
  sizeCanvases(width, height);
  drawHands(ctx, hands);

  const obs: HandObs[] = hands.map((h) => ({ shape: h.shape, shapeScore: h.shapeScore, palmFacing: h.palmFacing, palm: h.palm }));
  const r = stepCommands(machine, { t: ts, hands: obs, box: settings.box, aspect: width / height }, commandCfg());
  machine = r.state;
  view = r.view;
  if (r.fired) bench.fire(r.fired);

  const c = stepClutches(
    clutch,
    {
      t: ts,
      box: settings.box,
      hands: hands.map((h) => ({ hand: h.hand, shape: h.shape, palm: h.palm, pinchRatio: h.pinchRatio, clawExt: h.clawExt, othersReach: h.othersReach })),
    },
    clutchCfg(),
  );
  clutch = c.state;
  clutchView = c.view;

  renderHands(hands, settings.box);
  bench.renderCommand(view);
  bench.renderClutch(clutchView);
  bench.setPinchLive(hands.map((h) => h.pinchRatio));
  redrawHud();
  if (import.meta.env.DEV) {
    const dance = ((window as unknown as { __dance?: Record<string, unknown> }).__dance ??= {});
    Object.assign(dance, { hands, view, clutchView, box: settings.box, log: bench.log, fft: bench.falseFireState(), machine });
  }
}

// --- Source and recognizer ---------------------------------------------------------

async function openSource(): Promise<FrameSource> {
  // Dev-only test modes, so the pipeline can be checked without a live hand:
  //   ?image=/test/hand.jpg   or   ?video=/test/hand.mp4
  const params = new URLSearchParams(location.search);
  const image = params.get("image");
  const clip = params.get("video");
  if (image) return openImage(still, image);
  if (clip) return openVideoFile(video, clip);
  return openCamera(video);
}

async function main(): Promise<void> {
  setStatus("Opening camera and loading hand model…");
  setMessage("Allow camera access when Chrome asks.");
  renderHands([], settings.box);
  redrawHud();

  // Dev-only `?sim`: no camera and no model; hands are scripted from the console or a test
  // driver via window.__dance.setHands([...]). See src/sim.ts.
  const sim = import.meta.env.DEV && new URLSearchParams(location.search).has("sim") ? await import("./sim") : null;

  let source: FrameSource;
  let loaded: Awaited<ReturnType<typeof loadRecognizer>> | null = null;
  try {
    if (sim) {
      source = await openImage(still, sim.simBackdrop());
    } else {
      [source, loaded] = await Promise.all([openSource(), loadRecognizer()]);
    }
  } catch (err) {
    const text = err instanceof CameraError ? err.message : `Startup failed: ${err instanceof Error ? err.message : String(err)}`;
    setMessage(text);
    setStatus(text.split("\n")[0], true);
    console.error(err);
    return;
  }
  setMessage(null);
  setStatus(sim ? "Simulated hands (dev ?sim mode)" : `Running (${loaded!.delegate})`);

  const recognizer = loaded?.recognizer ?? null;
  let simHands: HandReading[] = [];
  if (sim) {
    (window as unknown as { __dance: Record<string, unknown> }).__dance = {
      setHands: (specs: Parameters<typeof sim.simReading>[0][]) => {
        simHands = specs.map((s) => sim.simReading(s));
      },
    };
  }

  const meter = new FpsMeter();
  let lastTs = -1;
  let lastVideoTime = -1;

  const frame = () => {
    const { width, height } = source.size();
    if (width === 0 || height === 0) return;
    sizeCanvases(width, height);
    // Skip duplicate frames (the loop can run faster than the camera).
    if (source.moving && source.element instanceof HTMLVideoElement) {
      const t = source.element.currentTime;
      if (t === lastVideoTime) return;
      lastVideoTime = t;
    }
    // MediaPipe needs strictly increasing timestamps (and so does the classifier's clock).
    let ts = performance.now();
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;

    const found = recognizer ? analyze(recognizer.recognizeForVideo(source.element, ts), width, height) : simHands;
    processFrame(ts, found, width, height);
    setFps(meter.tick(ts));
  };

  const loop = () => {
    try {
      frame();
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
      return; // stop the loop
    }
    schedule();
  };

  const el = source.element;
  const schedule = () => {
    if (source.moving && el instanceof HTMLVideoElement && "requestVideoFrameCallback" in el) {
      el.requestVideoFrameCallback(loop);
    } else {
      requestAnimationFrame(loop);
    }
  };
  schedule();
}

void main();
