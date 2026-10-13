import "./style.css";
import { analyze, type HandReading } from "./analyze";
import { Bench } from "./bench";
import { contains, normalizeBox, type Box } from "./box";
import { attachBoxEditor } from "./boxEditor";
import { CameraError, deliveredOf, openImage, openVideoFile, requestedSize, type FrameSource } from "./camera";
import { CameraPicker } from "./cameraPicker";
import { LatencyPanel } from "./latencyPanel";
import { PresentedRate } from "./latency";
import { initialClutchState, stepClutches, twoHandRoles, type ClutchView } from "./clutch";
import { chordAgrees, type MachineView } from "./commands";
import { APP, CLUTCH, COMMANDS, KNOB, SCRUB, SPEED, WAVE, type ClutchConfig, type CommandConfig, type KnobTarget } from "./config";
import { drawHands } from "./draw";
import { Cropper, cropAsDisplayBox, cropLayout, cropRectForZone, magnification, toFullFrame, type CropLayout } from "./zoom";
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
import { IDLE_SCRUB, stepScrub, type ScrubMode } from "./scrub";
import { IDLE_STEER, classifySteerShape, stepSteerMode, targetOf, type SteerMode } from "./steerMode";
import { IDLE_STEER_AUDIO, stepSteerAudio } from "./steerAudio";
import { IDLE_HOLD, stepHoldSpeed } from "./holdSpeed";
import { formatRate, wheelSteps } from "./speed";
import type { ZoomDraw } from "./waveDraw";

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
const bench = new Bench(settings, { setZone, zoomChanged: () => updateZoomUi(null) });
/** R7: the camera picker (null in the dev ?image / ?video / ?sim modes) and the timing panel. */
let picker: CameraPicker | null = null;
const latency = new LatencyPanel(
  () => deliveredOf(video)?.label ?? "",
  () => ({ width: video.videoWidth, height: video.videoHeight }),
);
/** The captureTime of the frame being processed now (null: the browser gave none), to time "frame captured -> command fired". */
let frameCapture: number | null = null;
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

/** R4c: the steering wheel's mode (the left hand's shape, debounced). */
let steer = IDLE_STEER;
/** R4d: what the left hand has done to the music during this grab (a fist's pause, and so the scrub mode). Claw / pinch have no modes: the music keeps doing what it was doing. */
let steerAudio = IDLE_STEER_AUDIO;

/** R5b: the right thumbs up held = 2x (and back on release). */
let hold = IDLE_HOLD;
/** R5b: degrees turned in speed mode that have not made a whole 0.025 step yet. */
let speedAccum = 0;

/** Audible scrub of the playhead. */
let scrub = IDLE_SCRUB;
/** The last frame time at which a scrub was running (-Infinity if never): marks right after a scrub are exact. */
let lastScrubT = -Infinity;

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
  steer = IDLE_STEER;
  steerAudio = IDLE_STEER_AUDIO;
  practice.setZoomActive(false);
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

/** R6: the one shared zone, as the per-hand boxes the reducers take. */
const zoneBoxes = (): Record<Handedness, Box> => ({ Left: settings.zone, Right: settings.zone });

function setZone(b: Box): void {
  settings.zone = normalizeBox(b);
  saveSettings(settings);
  bench.showZone(settings.zone);
  updateZoomUi(null);
  redrawHud();
}

const editor = attachBoxEditor(hudCanvas, () => settings.zone, setZone, () => redrawHud());

// --- R6: zoom (crop the frame to the zone + margin and give only the crop to the hand model) ---

let cropper: Cropper | null = null;
/** The crop used on the last frame (null: zoom off, or no frame yet). */
let currentCrop: CropLayout | null = null;
/** DEV stat: a short running average of the crop + model call, in ms (window.__dance.recognizeMs). */
let recognizeMs = 0;

/** The crop for the current zone and frame size, or null with zoom off. */
function planCrop(width: number, height: number): CropLayout | null {
  return settings.zoom ? cropLayout(cropRectForZone(settings.zone, width, height), width, height) : null;
}

/** The zoom note next to the toggle. `crop` null: work it out from a typical 16:9 frame (before the first frame, or a zone edit). */
function updateZoomUi(crop: CropLayout | null): void {
  const c = crop ?? (settings.zoom ? planCrop(requestedSize(picker?.pref.shape).width, requestedSize(picker?.pref.shape).height) : null);
  if (!c) return bench.setZoomNote("off: the whole picture is tracked");
  const mag = magnification(c);
  bench.setZoomNote(
    mag < 1.05 ? `×${mag.toFixed(1)}: the zone is as wide as the picture, so no magnification; narrow it to zoom. Only the zone is tracked.` : `×${mag.toFixed(1)}. Only the zone is tracked.`,
  );
}

function redrawHud(): void {
  drawHud(hudCtx, {
    zone: settings.zone,
    active: editor.active,
    dragging: editor.dragging,
    palms: hands.map((h) => ({ hand: h.hand, x: h.palm.x, y: h.palm.y, source: h.handSource })),
    views,
    knob: knobDraw,
    crop: currentCrop ? { box: cropAsDisplayBox(currentCrop), magnification: magnification(currentCrop) } : null,
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

  // The clutches and the knob come first: while the knob is grabbed, the steering hand's commands are blocked.
  const c = stepClutches(
    clutch,
    {
      t: ts,
      box: zoneBoxes(),
      hands: hands.map((h) => ({
        hand: h.hand,
        shape: h.shape,
        palm: h.palm,
        pinchRatio: h.pinchRatio,
        clawExt: h.clawExt,
        othersReach: h.othersReach,
        steerShape: classifySteerShape(h),
      })),
    },
    clutchCfg(),
  );
  clutch = c.state;
  clutchView = c.view;
  const knobHands: KnobHand[] = hands.map((h) => ({ hand: h.hand, palm: h.palm, tiltDeg: h.tiltDeg }));
  // R4c, the steering wheel: the left (modifier) hand's shape picks the mode, debounced, while the grab continues.
  const wheel = knobSettings.clutch === "twoHand";
  const roles = wheel ? twoHandRoles(knobHands, clutchCfg()) : null;
  const modifierShape = roles ? classifySteerShape(hands[knobHands.indexOf(roles.modifier)]) : null;
  const pick = selectClutch(knobSettings.clutch, clutchView, knobHands, clutchCfg(), KNOB.steeringHand, modifierShape);
  const sm = stepSteerMode(steer, { t: ts, grabbed: wheel && pick.grabbed, shape: modifierShape });
  steer = sm.state;
  const k = stepKnob(
    knob,
    {
      t: ts,
      grabbed: pick.grabbed,
      hand: pick.steering ? { tiltDeg: pick.steering.tiltDeg, palm: pick.steering.palm } : null,
      aspect,
      target: sm.mode ? targetOf(sm.mode) : undefined,
    },
    knobSettings,
    KNOB,
    CLUTCH.releaseGraceMs,
  );
  knob = k.state;
  applyKnob(k.out, pick.steering, ts, wheel ? sm.mode : null);
  const grabbed = pick.grabbed || k.out.grabbed;

  // Per-hand commands. The steering hand is blocked while grabbed; with the two-hand clutch the left hand is
  // the modifier, so its commands (the marks) are off altogether.
  const suppress = suppressFor(knobSettings.clutch, grabbed, pick.steering?.hand ?? null);
  const obs = hands.map((h) => ({ hand: h.hand, shape: h.shape, shapeScore: h.shapeScore, palmFacing: h.palmFacing, palm: h.palm, chord: h.chord }));
  const r = stepHandCommands(machines, { t: ts, hands: obs, boxes: zoneBoxes(), aspect, suppress }, commandCfg());
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
      rate: player.rate,
    });
    const result = action ? practice.perform(action, { markAt }) : null;
    if (frameCapture !== null) latency.captureToFire.push(performance.now() - frameCapture);
    if (import.meta.env.DEV) recordTiming(`${fired.hand} ${fired.shape}`, ts, before, result?.label ?? null, markAt);
    bench.fire(fired, result?.label);
  }
  // R5b: hold the right thumbs up = 2x while held. A state, not a command: no ring, no fire. Arming needs the hand in its box;
  // once armed it may leave it. The wheel being grabbed (or the thumb being a steering hand) ends it.
  {
    const right = hands.find((h) => h.hand === "Right");
    const shape = !!right && right.shape === "Thumb_Up" && right.shapeScore >= COMMANDS.minShapeScore && chordAgrees("Thumb_Up", right.chord);
    const thumb = shape && (hold.since !== null || contains(settings.zone, right!.palm));
    const hs = stepHoldSpeed(hold, { t: ts, thumb, suppress: grabbed, rate: player.rate });
    hold = hs.state;
    if (hs.setRate !== null) {
      const res = practice.perform("speedSet", { rate: hs.setRate });
      bench.showBanner(res.label, hold.boosted ? "HOLD THUMBS UP" : "RELEASED");
    }
  }
  // After the fire, so the stamp read above is the one from the ring that just filled.
  for (const h of ["Left", "Right"] as const) {
    ringStamps[h] = trackRingStart(ringStamps[h], machines[h].shape, machines[h].since, player.currentTime, player.state === "playing");
  }

  renderHands(hands, settings.zone);
  bench.renderCommand(r.views);
  bench.renderClutch(clutchView);
  knobPanel.setState(k.out.view?.frozen ? "HOLDING" : k.out.grabbed ? "GRABBED" : "released", k.out.grabbed);
  bench.setPinchLive(hands.map((h) => h.pinchRatio));
  redrawHud();
  if (import.meta.env.DEV) {
    const dance = ((window as unknown as { __dance?: Record<string, unknown> }).__dance ??= {});
    Object.assign(dance, { picker, latency, hands, views, clutchView, zone: settings.zone, crop: currentCrop, cropMs: cropper?.avgMs ?? 0, recognizeMs, log: bench.log, fft: bench.falseFireState(), machines, knob, knobSettings, knobView: k.out.view, scrub, steer, hold, speedAccum });
  }
}

/** What the knob's target is worth right now: the playhead, or the loop START / END (null: not set). */
function targetValue(target: KnobTarget): number | null {
  return target === "playhead" ? player.currentTime : practice.loopState[target];
}

/** The target the last frame's grab was moving, to notice the left hand switching it mid-grab (R4c). */
let lastTarget: KnobTarget | null = null;

/**
 * One frame of the knob's result: the target moves, the readout and the dial follow, the tally counts.
 * `mode` is the steering wheel's mode (null for claw / pinch, which have none).
 */
function applyKnob(out: KnobOutput, steering: KnobHand | null, ts: number, mode: SteerMode | null): void {
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
  } else if (out.grabbed && lastTarget !== null && target !== lastTarget) {
    // The left hand switched what the wheel moves: measure "since" from here, and show the new target's time.
    valueAtGrab = targetValue(target);
    practice.setNudgeHold(true, valueAtGrab === null ? `no loop ${target.toUpperCase()} yet` : "no change yet", target);
  }
  lastTarget = out.grabbed ? target : null;
  grabMovedSec += Math.abs(out.applySec);

  // What the music should be doing while the playhead is steered (R4d): what it was doing at the grab, except that a left
  // fist pauses it while closed and opening to a palm resumes it, but only if the fist did the pausing (steerAudio.ts).
  steerAudio = stepSteerAudio(steerAudio, { grabbed: out.grabbed, mode, playing: player.state === "playing" });
  const scrubMode: ScrubMode = steerAudio.scrub;
  // R5b: the left shaka puts the wheel in speed mode: its turn steps the playback speed instead of moving anything.
  const speedMode = mode === "speed";
  if (!speedMode) speedAccum = 0;
  if (target === "playhead" && !speedMode) {
    // Audible scrub: the music follows the hand (see scrub.ts for the seek policy).
    const sr = stepScrub(
      scrub,
      {
        t: ts,
        active: out.grabbed && player.loaded,
        mode: scrubMode,
        deltaSec: out.applySec,
        playing: player.state === "playing",
        current: player.currentTime,
        duration: player.duration,
        seeking: player.seeking,
      },
      SCRUB,
    );
    scrub = sr.state;
    if (sr.scrubbing) lastScrubT = ts;
    if (sr.actions.length > 0) {
      practice.runScrub(sr.actions);
      if (import.meta.env.DEV) recordScrub(ts, sr.actions.filter((a) => a.type === "seek").length);
    }
    if (out.grabbed) practice.setNudgeNote("");
  } else {
    // A grab with a different target ends any scrub that was running (the target was switched mid-grab).
    if (scrub.active) {
      practice.runScrub(
        stepScrub(scrub, { t: ts, active: false, mode: scrubMode, deltaSec: 0, playing: player.state === "playing", current: player.currentTime, duration: player.duration }, SCRUB).actions,
      );
    }
    scrub = IDLE_SCRUB;
    if (speedMode) {
      stepSpeedWheel(out.turnDeg);
    } else if (out.applySec !== 0) {
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
  const loop = practice.loopState;
  const zoom: ZoomDraw | null =
    out.view && player.loaded && practice.waveform && !speedMode
      ? {
          peaks: practice.waveform,
          target,
          centre: value ?? player.currentTime,
          halfWindow: WAVE.zoomHalfWindowSec,
          playhead: player.currentTime,
          start: loop.start,
          end: loop.end,
          title: target === "playhead" ? `PLAYHEAD · ${scrubMode === "play" ? "PLAYING" : "PAUSED"}` : target === "start" ? "LOOP START" : "LOOP END",
          note: target === "playhead" ? "" : value === null ? `no loop ${target.toUpperCase()} yet` : sinceGrab(),
        }
      : null;
  practice.setZoomActive(zoom !== null || (speedMode && out.grabbed)); // speed mode shows no big time either: the speed number is the feedback
  knobDraw = out.view
    ? {
        view: out.view,
        palm: lastKnobPalm,
        title: `${CLUTCH_NAMES[knobSettings.clutch]} + ${MOTION_NAMES[knobSettings.motion]} + ${MAPPING_NAMES[knobSettings.mapping]} → ${speedMode ? "Speed" : TARGET_NAMES[target]}`,
        deadZoneDeg: knobSettings.deadZoneDeg,
        // The huge readout (DOM) already shows the value; here only what is missing.
        note: speedMode ? `Speed ${formatRate(player.rate)}  ·  clockwise = faster  ·  steps of ${SPEED.step}` : value === null ? `No loop ${target === "start" ? "START" : "END"} yet: set one with the left hand first` : "",
        modes: mode ? { active: mode, pending: steer.pending } : null,
        zoom,
        speed: speedMode ? { rate: player.rate } : null,
      }
    : null;
}

/** R5b: the speed mode's turn: every `SPEED.stepDeg` of turn is one 0.025 step (clockwise = faster); stuck at an end, the leftover turn is dropped so reversing is not delayed. */
function stepSpeedWheel(turnDeg: number): void {
  const w = wheelSteps(speedAccum, turnDeg, player.rate);
  speedAccum = w.accumDeg;
  for (let i = 0; i < Math.abs(w.steps); i++) {
    const before = player.rate;
    practice.perform(w.steps > 0 ? "speedUp" : "speedDown");
    if (player.rate === before) {
      speedAccum = 0;
      break;
    }
  }
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
  picker = new CameraPicker(video);
  return picker.start();
}

async function main(): Promise<void> {
  setStatus("Opening camera and loading hand model…");
  setMessage("Allow camera access when Chrome asks.");
  renderHands([], settings.zone);
  updateZoomUi(null);
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
  let simRaws: import("./sim").SimRaw[] = [];
  if (sim) {
    const dance = ((window as unknown as { __dance?: Record<string, unknown> }).__dance ??= {});
    dance.setHands = (specs: import("./sim").SimHand[]) => {
      simRaws = specs.map((s) => sim.simRaw(s));
    };
  }

  const meter = new FpsMeter();
  // DEV ?sim&simfps=30: process simulated frames at a camera's rate instead of every animation frame (60+ Hz).
  const simFps = sim ? Number(new URLSearchParams(location.search).get("simfps")) || 0 : 0;
  let lastSimFrame = -Infinity;
  let lastTs = -1;
  let lastVideoTime = -1;
  const presented = new PresentedRate();
  // A new stream (the camera was switched): its clock and frame counter start over.
  if (picker) {
    picker.onSwitched = () => {
      lastVideoTime = -1;
      presented.reset();
      cropper = null;
    };
  }

  const frame = (now: number, meta?: VideoFrameCallbackMetadata) => {
    const { width, height } = source.size();
    if (width === 0 || height === 0) return;
    sizeCanvases(width, height);
    // R7: when the camera captured this frame (Chrome's captureTime), and the rate the page is really given frames at.
    const captured = meta?.captureTime ?? null;
    frameCapture = captured;
    if (meta?.presentedFrames !== undefined) presented.push(now, meta.presentedFrames);
    if (captured !== null) latency.cameraToApp.push(now - captured);
    if (source.element instanceof HTMLVideoElement) latency.onFrame(source.element, now, captured);
    // Skip duplicate frames (the loop can run faster than the camera).
    if (source.moving && source.element instanceof HTMLVideoElement) {
      const t = source.element.currentTime;
      if (t === lastVideoTime) return;
      lastVideoTime = t;
    }
    // MediaPipe needs strictly increasing timestamps (and so does the classifier's clock).
    let ts = performance.now();
    if (simFps > 0 && ts - lastSimFrame < 1000 / simFps - 2) return;
    lastSimFrame = ts;
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;

    // R6 zoom: the model is given only the zone (plus a margin) cropped out of the frame; its landmarks come back in the
    // crop's coordinates and are mapped to the full frame, so everything downstream is unchanged.
    const crop = planCrop(width, height);
    if (JSON.stringify(crop) !== JSON.stringify(currentCrop)) updateZoomUi(crop);
    currentCrop = crop;
    let result;
    if (recognizer) {
      const t0 = performance.now();
      let input: TexImageSource = source.element;
      if (crop) input = (cropper ??= new Cropper()).draw(source.element, crop);
      result = recognizer.recognizeForVideo(input, ts);
      const took = performance.now() - t0;
      recognizeMs += (took - recognizeMs) * 0.1;
      latency.model.push(took);
    } else {
      result = sim!.simRecognize(simRaws, crop);
    }
    const found = analyze(result, width, height, crop ? (lm) => lm.map((p) => ({ ...p, ...toFullFrame(p, crop) })) : undefined);
    processFrame(ts, found, width, height);
    setFps(meter.tick(ts));
    if (captured !== null) latency.captureToDone.push(performance.now() - captured);
    latency.refresh(now);
    picker?.render(presented.fps);
  };

  const loop = (now: number = performance.now(), meta?: VideoFrameCallbackMetadata) => {
    try {
      frame(now, meta);
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
