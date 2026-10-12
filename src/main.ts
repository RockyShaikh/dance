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
import { createBrowserPlayer } from "./audioPlayer";
import { Practice } from "./practice";
import { loadRecognizer } from "./recognizer";
import { renderHands, setFps, setMessage, setStatus } from "./readout";
import { loadSettings, saveSettings } from "./settings";
import { markTime, trackRingStart, type RingStamp } from "./loop";
import { actionForFire } from "./transport";

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

// --- R3: the music ------------------------------------------------------------------

const player = createBrowserPlayer();
const practice = new Practice(player, {
  announce: (label, via) => bench.showBanner(label, via === "key" ? "KEY" : "BUTTON", "tap"),
});

/** Current thresholds: the config defaults with the slider/toggle settings applied. */
const commandCfg = (): CommandConfig => ({
  ...COMMANDS,
  dwellMs: settings.dwellMs,
  stillness: { ...COMMANDS.stillness, enabled: settings.stillness },
});

/** Where the music was when the current ring started (null when no shape is being held): gesture marks are stamped there. */
let ringStamp: RingStamp | null = null;
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
  if (r.fired) {
    // The music reacts on the very frame the ring completes, before any logging or drawing.
    const action = actionForFire(r.fired);
    const before = performance.now();
    // A loop mark lands where the music was when the ring started, minus the late-mark offset.
    const markAt = markTime(ringStamp?.playhead ?? player.currentTime, player.duration);
    const result = action ? practice.perform(action, { markAt }) : null;
    if (import.meta.env.DEV) recordTiming(r.fired.shape, ts, before, result?.label ?? null, markAt);
    bench.fire(r.fired, result?.label);
  }
  // After the fire (a tap fires on release, when the machine has already gone idle).
  ringStamp = trackRingStart(ringStamp, machine.shape, machine.since, player.currentTime);

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

/** DEV only: how long from "the ring completed" to "the audio element changed state" (see window.__dance.timings). */
function recordTiming(shape: string, frameTs: number, before: number, label: string | null, markAt: number): void {
  const dance = ((window as unknown as { __dance?: Record<string, unknown> }).__dance ??= {});
  const list = ((dance.timings as unknown[]) ??= []);
  list.push({ shape, label, frameTs, calledAt: before, returnedAt: performance.now(), state: player.state, currentTime: player.currentTime, markAt });
}

/** DEV only: ?track=/test/click-track.wav loads a track at startup; every player event is time-stamped. */
function devAudioHooks(): void {
  const dance = ((window as unknown as { __dance?: Record<string, unknown> }).__dance ??= {});
  const events: unknown[] = [];
  player.on((e) => events.push({ ...e, at: performance.now(), state: player.state, currentTime: player.currentTime }));
  Object.assign(dance, { player, practice, audioEvents: events });
  const track = new URLSearchParams(location.search).get("track");
  if (track) {
    void fetch(track)
      .then((res) => res.blob())
      .then((blob) => practice.load(new File([blob], track.split("/").pop() ?? "track", { type: blob.type || "audio/wav" })));
  }
}
if (import.meta.env.DEV) devAudioHooks();

// --- The bench toggle: the R2 test bench lives behind a button; the practice view is the default ---

const BENCH_KEY = "dance.r3.bench";
function setBenchOpen(open: boolean): void {
  document.body.classList.toggle("bench-open", open);
  document.getElementById("bench-toggle")!.setAttribute("aria-pressed", String(open));
  try {
    localStorage.setItem(BENCH_KEY, open ? "1" : "0");
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}
{
  let open = false;
  try {
    open = localStorage.getItem(BENCH_KEY) === "1";
  } catch {
    /* ignore */
  }
  setBenchOpen(open);
  document.getElementById("bench-toggle")!.addEventListener("click", (e) => {
    setBenchOpen(!document.body.classList.contains("bench-open"));
    (e.currentTarget as HTMLElement).blur();
  });
  document.addEventListener("keydown", (e) => {
    if (e.code === "KeyB" && !e.ctrlKey && !e.metaKey && !e.altKey) setBenchOpen(!document.body.classList.contains("bench-open"));
  });
}

// The camera picture is as tall as the stage allows (the status word and timeline take the rest of the window).
{
  const stage = document.getElementById("stage")!;
  const fit = () => document.documentElement.style.setProperty("--stage-h", `${stage.clientHeight}px`);
  new ResizeObserver(fit).observe(stage);
  fit();
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
    const dance = ((window as unknown as { __dance?: Record<string, unknown> }).__dance ??= {});
    dance.setHands = (specs: Parameters<typeof sim.simReading>[0][]) => {
      simHands = specs.map((s) => sim.simReading(s));
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
