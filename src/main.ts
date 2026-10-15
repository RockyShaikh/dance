import "./style.css";
import { analyze, type HandReading } from "./analyze";
import { Bench } from "./bench";
import { normalizeBox, type Box } from "./box";
import { attachBoxEditor } from "./boxEditor";
import { CameraError, openCamera, openImage, openVideoFile, type FrameSource } from "./camera";
import { initialClutchState, stepClutches, type ClutchView } from "./clutch";
import type { MachineView } from "./commands";
import { APP, CLUTCH, COMMANDS, KNOB, SCRUB, type ClutchConfig, type CommandConfig, type KnobTarget } from "./config";
import { drawHands } from "./draw";
import type { Handedness } from "./hand";
import { INITIAL_MACHINES, stepHandCommands, type HandMachines } from "./handCommands";
import { drawHud } from "./hud";
import { createBrowserPlayer } from "./audioPlayer";
import { Practice } from "./practice";
import { loadRecognizer } from "./recognizer";
import { renderHands, setFps, setMessage, setStatus } from "./readout";
import { loadSettings, saveSettings } from "./settings";
import { markPlayhead, trackRingStart, type RingStamp } from "./loop";
import { actionForFire } from "./transport";
import { IDLE_KNOB, stepKnob, type KnobOutput } from "./knob";
import { selectClutch, suppressFor, type KnobHand } from "./knobClutch";
import type { KnobDraw } from "./knobHud";
import { KnobPanel } from "./knobPanel";
import { CLUTCH_NAMES, MAPPING_NAMES, MOTION_NAMES, TARGET_NAMES, loadKnobSettings } from "./knobSettings";
import { IDLE_SCRUB, stepScrub } from "./scrub";

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
/** R4b: one command classifier per hand, each with its own box. */
let machines: HandMachines = INITIAL_MACHINES;
let clutch = initialClutchState();
let hands: HandReading[] = [];
let views: Partial<Record<Handedness, MachineView>> = {};
let clutchView: ClutchView | null = null;

// --- R4b: the knob ------------------------------------------------------------------

const knobSettings = loadKnobSettings();
let knob = IDLE_KNOB;
let knobDraw: KnobDraw | null = null;
let lastKnobPalm = { x: 0.75, y: 0.5 };
/** At the start of this grab: the value of the target (null: no loop START / END to move yet), for "moved N s since grab". */
let valueAtGrab: number | null = null;
/** Total movement requested during this grab, to count it as a nudge in the log. */
let grabMovedSec = 0;
let knobPanel: KnobPanel;

/** Audible scrub of the playhead. */
let scrub = IDLE_SCRUB;
/** The last frame time at which a scrub was running (-Infinity if never): marks right after a scrub are exact. */
let lastScrubT = -Infinity;
let lastFrameT = 0;

// --- R3: the music ------------------------------------------------------------------

const player = createBrowserPlayer();
const practice = new Practice(player, {
  announce: (label, via) => bench.showBanner(label, via === "key" ? "KEY" : "BUTTON"),
});

knobPanel = new KnobPanel(knobSettings, () => {
  // A different variant or slider mid-grab: let go (the new settings apply from the next grab).
  if (knob.grabbed) practice.setNudgeHold(false);
  knob = IDLE_KNOB;
  knobDraw = null;
  valueAtGrab = null;
});

/** Current thresholds: the config defaults with the slider/toggle settings applied. */
const commandCfg = (): CommandConfig => ({
  ...COMMANDS,
  dwellMs: settings.dwellMs,
  stillness: { ...COMMANDS.stillness, enabled: settings.stillness },
});

/** Where the music was when each hand's current ring started (null when it holds no shape): gesture marks are stamped there. */
const ringStamps: Record<Handedness, RingStamp | null> = { Left: null, Right: null };
const clutchCfg = (): ClutchConfig => ({ ...CLUTCH, pinch: { ...CLUTCH.pinch, grabRatio: settings.pinchGrab } });

function setBox(hand: Handedness, b: Box): void {
  settings.boxes[hand] = normalizeBox(b);
  saveSettings(settings);
  bench.showBoxes(settings.boxes);
  redrawHud();
}

const editor = attachBoxEditor(hudCanvas, () => settings.boxes, setBox, () => redrawHud());

function redrawHud(): void {
  drawHud(hudCtx, {
    boxes: settings.boxes,
    active: editor.active,
    dragging: editor.dragging,
    palms: hands.map((h) => ({ hand: h.hand, x: h.palm.x, y: h.palm.y })),
    views,
    knob: knobDraw,
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

/** One frame of results through the whole bench: skeleton, clutches, knob, per-hand commands, panels. */
function processFrame(ts: number, found: HandReading[], width: number, height: number): void {
  hands = found;
  sizeCanvases(width, height);
  drawHands(ctx, hands);
  const aspect = width / height;
  const dtSec = lastFrameT > 0 ? Math.max(0, (ts - lastFrameT) / 1000) : 0;
  lastFrameT = ts;

  // The clutches and the knob come first: while the knob is grabbed, the steering hand's commands are blocked.
  const c = stepClutches(
    clutch,
    {
      t: ts,
      box: settings.boxes,
      hands: hands.map((h) => ({ hand: h.hand, shape: h.shape, palm: h.palm, pinchRatio: h.pinchRatio, clawExt: h.clawExt, othersReach: h.othersReach })),
    },
    clutchCfg(),
  );
  clutch = c.state;
  clutchView = c.view;
  const knobHands: KnobHand[] = hands.map((h) => ({ hand: h.hand, palm: h.palm, tiltDeg: h.tiltDeg }));
  const pick = selectClutch(knobSettings.clutch, clutchView, knobHands, clutchCfg());
  const k = stepKnob(
    knob,
    { t: ts, grabbed: pick.grabbed, hand: pick.steering ? { tiltDeg: pick.steering.tiltDeg, palm: pick.steering.palm } : null, aspect },
    knobSettings,
    KNOB,
    CLUTCH.releaseGraceMs,
  );
  knob = k.state;
  applyKnob(k.out, pick.steering, ts, dtSec);
  const grabbed = pick.grabbed || k.out.grabbed;

  // Per-hand commands. The steering hand is blocked while grabbed; with the two-hand clutch the left hand is
  // the modifier, so its commands (the marks) are off altogether.
  const suppress = suppressFor(knobSettings.clutch, grabbed, pick.steering?.hand ?? null);
  const obs = hands.map((h) => ({ hand: h.hand, shape: h.shape, shapeScore: h.shapeScore, palmFacing: h.palmFacing, palm: h.palm }));
  const r = stepHandCommands(machines, { t: ts, hands: obs, boxes: settings.boxes, aspect, suppress }, commandCfg());
  machines = r.state;
  views = r.views;
  for (const fired of r.fired) {
    // The music reacts on the very frame the ring completes, before any logging or drawing.
    const action = actionForFire(fired);
    const before = performance.now();
    // A mark lands where the music was when the ring started, less the late-mark offset: but exact while paused or around a scrub.
    const markAt = markPlayhead(ringStamps[fired.hand], {
      current: player.currentTime,
      playing: player.state === "playing",
      scrubbing: scrub.active,
      lastScrubT,
      t: ts,
      duration: player.duration,
    });
    const result = action ? practice.perform(action, { markAt }) : null;
    if (import.meta.env.DEV) recordTiming(`${fired.hand} ${fired.shape}`, ts, before, result?.label ?? null, markAt);
    bench.fire(fired, result?.label);
  }
  // After the fire, so the stamp read above is the one from the ring that just filled.
  for (const h of ["Left", "Right"] as const) {
    ringStamps[h] = trackRingStart(ringStamps[h], machines[h].shape, machines[h].since, player.currentTime, player.state === "playing");
  }

  renderHands(hands, settings.boxes);
  bench.renderCommand(r.views);
  bench.renderClutch(clutchView);
  knobPanel.setState(k.out.view?.frozen ? "HOLDING" : k.out.grabbed ? "GRABBED" : "released", k.out.grabbed);
  bench.setPinchLive(hands.map((h) => h.pinchRatio));
  redrawHud();
  if (import.meta.env.DEV) {
    const dance = ((window as unknown as { __dance?: Record<string, unknown> }).__dance ??= {});
    Object.assign(dance, { hands, views, clutchView, boxes: settings.boxes, log: bench.log, fft: bench.falseFireState(), machines, knob, knobSettings, knobView: k.out.view, scrub });
  }
}

/** What the knob's target is worth right now: the playhead, or the loop START / END (null: not set). */
function targetValue(target: KnobTarget): number | null {
  return target === "playhead" ? player.currentTime : practice.loopState[target];
}

/** R4b: one frame of the knob's result: the target moves, the readout and the dial follow, the tally counts. */
function applyKnob(out: KnobOutput, steering: KnobHand | null, ts: number, dtSec: number): void {
  const target = out.target;
  const sinceGrab = (): string => {
    const now = targetValue(target);
    if (now === null || valueAtGrab === null) return "";
    const d = Math.round((now - valueAtGrab) * 10) / 10;
    return d === 0 ? "no change yet" : `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(1)} s since grab`;
  };
  if (out.started) {
    valueAtGrab = targetValue(target);
    grabMovedSec = 0;
    practice.setNudgeHold(true, valueAtGrab === null ? `no loop ${target.toUpperCase()} yet` : "no change yet", target);
  }
  grabMovedSec += Math.abs(out.applySec);

  if (target === "playhead") {
    // Audible scrub: seek the playhead live (rate-limited); paused, play short snippets.
    const sr = stepScrub(
      scrub,
      {
        t: ts,
        dtSec,
        active: out.grabbed && player.loaded,
        deltaSec: out.applySec,
        playing: player.state === "playing",
        current: player.currentTime,
        duration: player.duration,
      },
      SCRUB,
    );
    scrub = sr.state;
    if (sr.scrubbing) lastScrubT = ts;
    if (sr.actions.length > 0) {
      practice.runScrub(sr.actions);
      if (import.meta.env.DEV) recordScrub(ts, sr.actions.filter((a) => a.type === "seek").length);
    }
    if (out.grabbed) practice.setNudgeNote(sinceGrab());
  } else {
    // A grab with a different target ends any scrub that was running (the target was switched mid-grab).
    if (scrub.active) practice.runScrub(stepScrub(scrub, { t: ts, dtSec, active: false, deltaSec: 0, playing: player.state === "playing", current: player.currentTime, duration: player.duration }, SCRUB).actions);
    scrub = IDLE_SCRUB;
    if (out.applySec !== 0) {
      const note = (limited: boolean) => `${sinceGrab()}${limited ? "  LIMIT" : ""}`;
      if (target === "start") practice.nudgeStart(out.applySec, { note });
      else practice.nudgeEnd(out.applySec, { note });
    }
  }

  if (out.released) {
    const moved = grabMovedSec >= 0.05;
    practice.setNudgeHold(false, valueAtGrab === null ? "" : sinceGrab(), target);
    if (moved) knobPanel.countNudge();
    valueAtGrab = null;
  }
  if (steering) lastKnobPalm = steering.palm;
  const value = targetValue(target);
  knobDraw = out.view
    ? {
        view: out.view,
        palm: lastKnobPalm,
        title: `${CLUTCH_NAMES[knobSettings.clutch]} + ${MOTION_NAMES[knobSettings.motion]} + ${MAPPING_NAMES[knobSettings.mapping]} → ${TARGET_NAMES[target]}`,
        deadZoneDeg: knobSettings.deadZoneDeg,
        // The huge readout (DOM) already shows the value; here only what is missing.
        note: value === null ? `No loop ${target === "start" ? "START" : "END"} yet: set one with the left hand first` : "",
      }
    : null;
}

/** DEV only: when each scrub seek was asked for, to measure the seek rate (window.__dance.scrubSeeks). */
function recordScrub(ts: number, seeks: number): void {
  const dance = ((window as unknown as { __dance?: Record<string, unknown> }).__dance ??= {});
  const list = ((dance.scrubSeeks as number[]) ??= []);
  for (let i = 0; i < seeks; i++) list.push(ts);
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
  renderHands([], settings.boxes);
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
