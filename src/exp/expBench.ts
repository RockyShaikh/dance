/**
 * EXP: the measurement bench for push + swipe, behind `?exp=push`. It watches the hands every frame, computes the push signals and
 * the swipe, shows them (graphs, the scrub bar at the hand) and records them. It wires NOTHING to a product command: the one
 * thing it does to the app is that the right hand scrubs (swipe) and, while that is on, its normal commands are off.
 */
import type { HandReading } from "../analyze";
import { contains, type Box } from "../box";
import { SCRUB } from "../config";
import type { Handedness } from "../hand";
import { prettyShape } from "../hud";
import type { PoseLm } from "../poseCrop";
import { IDLE_SCRUB, stepScrub, type ScrubAction, type ScrubState } from "../scrub";
import { PUSH_KEYS, SIGNAL_NAMES, type PushSignalKey } from "./config";
import { ExpPanel, type GraphMark, type GraphPoint } from "./expPanel";
import { loadExpSettings, saveExpSettings, type ExpSettings } from "./expSettings";
import { handInput, handSizePx, type WorldLm } from "./pushSignals";
import { PushTracker, type PushEvent } from "./pushTracker";
import { palmWidthPx, handLengthPx } from "../trackStats";
import { Recorder, recordingFileName, type FrameRecord, type HandFrame } from "./recorder";
import { IDLE_SWIPE, JitterMeter, SwipeMetrics, gainSecOf, scrubBar, stepSwipe, type SwipeState } from "./swipe";

export interface ExpHost {
  player: { loaded: boolean; currentTime: number; duration: number; state: string; seeking?: boolean };
  /** Carry out the scrub's player calls. */
  runScrub(actions: readonly ScrubAction[]): void;
  zone(): Box;
  camera(): { label: string; width: number; height: number; shape: string | null; frameRate: number | null };
  trackMode(): string;
  /** Speak a word (the bench's optional audio cue). Replaceable so tests never make a sound. */
  speak?(word: string): void;
  /** Shown in the panel title area. */
  now?(): number;
}

export interface ExpFrame {
  ts: number;
  hands: readonly HandReading[];
  pose: readonly PoseLm[] | null;
  poseWorld: readonly WorldLm[] | null;
  width: number;
  height: number;
}

const HANDS: readonly Handedness[] = ["Right", "Left"];
const GRAPH_MS = 6000;
/** The pose points the recording keeps: nose, eyes, shoulders, elbows, wrists, hips. */
const POSE_KEEP: Record<string, number> = { nose: 0, eyeL: 2, eyeR: 5, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, hipL: 23, hipR: 24 };

/** The default speech cue: the browser's speech. Only ever called when the user ticked "say push". */
function browserSpeak(word: string): void {
  try {
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(word));
  } catch {
    /* no speech available: stay silent */
  }
}

export class ExpBench {
  readonly settings: ExpSettings = loadExpSettings();
  readonly panel: ExpPanel;
  readonly recorder = new Recorder();
  readonly metrics = new SwipeMetrics();
  readonly jitter = new JitterMeter();
  /** Everything logged since the page opened (push events and rejects), newest last. */
  readonly events: (PushEvent & { hand: Handedness; level: string | null; shape: string })[] = [];
  /** DEV (`?sim`): the scripted body the sim supplies in place of the pose model. */
  simBody: { pose: PoseLm[]; world: WorldLm[] } | null = null;
  /** The last finished take's file (name + JSON text). */
  lastRecording: { name: string; json: string } | null = null;
  /** The bench is touching the playhead right now. */
  touching = false;

  private readonly trackers: Record<Handedness, PushTracker> = {
    Right: new PushTracker(() => this.settings.push),
    Left: new PushTracker(() => this.settings.push),
  };
  private readonly points: Record<Handedness, GraphPoint[]> = { Right: [], Left: [] };
  private readonly marks: Record<Handedness, GraphMark[]> = { Right: [], Left: [] };
  private swipe: SwipeState = IDLE_SWIPE;
  private scrub: ScrubState = IDLE_SCRUB;
  private lastHand: { x: number; y: number } | null = null;
  private flash: { t: number; hand: Handedness; signal: PushSignalKey } | null = null;
  private recordStartAt: number | null = null;
  private lastPanelT = -Infinity;
  private frames = 0;
  private lastTouches = 0;
  private logLines: string[] = [];
  private lastSample: Record<Handedness, ReturnType<PushTracker["step"]>["sample"]> = { Right: null, Left: null };

  constructor(private readonly host: ExpHost) {
    this.panel = new ExpPanel(this.settings, {
      changed: () => saveExpSettings(this.settings),
      measureJitter: () => this.jitter.start(this.now(), 5),
      record: () => (this.recorder.running || this.recordStartAt !== null ? this.stopRecording() : this.startRecording()),
      clearLog: () => {
        this.logLines = [];
        this.events.length = 0;
        this.panel.setLog([]);
      },
    });
  }

  private now(): number {
    return this.host.now ? this.host.now() : performance.now();
  }

  /** The right hand's commands are off while the swipe owns it. */
  get ownsRightHand(): boolean {
    return this.settings.swipeOn;
  }

  private say(word: string): void {
    if (!this.settings.speak) return;
    (this.host.speak ?? browserSpeak)(word);
  }

  startRecording(): void {
    this.recordStartAt = this.now() + this.settings.startDelaySec * 1000;
    this.say("get ready");
  }

  stopRecording(): void {
    if (this.recorder.running) this.finishRecording();
    this.recordStartAt = null;
  }

  private finishRecording(): void {
    const json = this.recorder.finish();
    const name = recordingFileName(this.settings.label, new Date());
    this.lastRecording = { name, json };
    this.say("done");
    try {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      this.panel.setDownload(url, name);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
    } catch {
      /* no Blob / download here: the text is still in lastRecording */
    }
  }

  /** One processed frame. Call after the hands are analysed. */
  frame(f: ExpFrame): void {
    const t = f.ts;
    this.frames++;
    const pose = f.pose ?? this.simBody?.pose ?? null;
    const world = f.poseWorld ?? this.simBody?.world ?? null;
    const dims = { W: f.width, H: f.height };

    // 1. Push signals, per hand.
    const handFrames: HandFrame[] = [];
    for (const hand of HANDS) {
      const h = f.hands.find((x) => x.hand === hand);
      if (!h) {
        const step = this.trackers[hand].step(t, null);
        this.lastSample[hand] = step.sample;
        this.points[hand].push({ t, s: null });
        continue;
      }
      const { input, level } = handInput(h, pose, world, dims.W, dims.H, t);
      const step = this.trackers[hand].step(t, input);
      this.lastSample[hand] = step.sample;
      this.points[hand].push({ t, s: step.sample });
      for (const e of step.events) this.onPushEvent(t, hand, e, level, h.shape);
      const s = step.sample;
      handFrames.push({
        hand,
        shape: h.shape,
        shapeScore: h.shapeScore,
        level,
        palm: [h.palm.x, h.palm.y],
        palmWidthPx: palmWidthPx(h.landmarks, dims.W, dims.H),
        handLenPx: handLengthPx(h.landmarks, dims.W, dims.H),
        size: s?.size ?? handSizePx(h.landmarks, dims.W, dims.H),
        forearm: s?.forearm ?? null,
        depthM: s?.depthM ?? null,
        a: s?.a ?? null,
        b: s?.b ?? null,
        c: s?.c ?? null,
        d: s?.d ?? null,
        lateral: s?.lateral ?? null,
      });
    }
    for (const hand of HANDS) {
      const buf = this.points[hand];
      while (buf.length > 0 && buf[0].t < t - GRAPH_MS) buf.shift();
      const m = this.marks[hand];
      while (m.length > 0 && m[0].t < t - GRAPH_MS) m.shift();
    }

    // 2. The swipe, on the right hand.
    const right = f.hands.find((h) => h.hand === "Right");
    const sw = this.settings;
    const palmOk = !sw.requirePalm || (!!right && right.shape === "Open_Palm" && right.shapeScore >= 0.5);
    const so = stepSwipe(
      this.swipe,
      { t, present: sw.swipeOn && !!right, inZone: !!right && contains(this.host.zone(), right.palm), x: right?.palm.x ?? 0, shapeOk: palmOk, duration: this.host.player.duration },
      sw.swipe,
    );
    this.swipe = so.state;
    this.touching = so.touching;
    if (right) this.lastHand = { x: right.palm.x, y: right.palm.y };
    else if (!so.touching) this.lastHand = null;
    const p = this.host.player;
    const sr = stepScrub(
      this.scrub,
      { t, active: so.touching && p.loaded, mode: sw.scrubMode, deltaSec: so.deltaSec, playing: p.state === "playing", current: p.currentTime, duration: p.duration, seeking: p.seeking },
      SCRUB,
    );
    this.scrub = sr.state;
    if (sr.actions.length > 0) this.host.runScrub(sr.actions);
    const seeked = sr.actions.some((a) => a.type === "seek");
    const rec = this.metrics.push(t, so, seeked);
    this.jitter.push(t, so.touching, so.rawSec, so.deltaSec);
    if (rec) this.recorder.event(t, { type: "touch", ...rec });

    // 3. The recording.
    if (this.recordStartAt !== null && !this.recorder.running && t >= this.recordStartAt) {
      const cam = this.host.camera();
      this.recorder.start(t, {
        label: sw.label,
        startedAt: new Date().toISOString(),
        durationSec: sw.recordSec,
        camera: cam,
        trackMode: this.host.trackMode(),
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
        settings: { push: sw.push, swipe: sw.swipe, swipeOn: sw.swipeOn, requirePalm: sw.requirePalm, scrubMode: sw.scrubMode },
        sim: this.simBody !== null && f.pose === null ? true : undefined,
      });
      this.say("recording");
    }
    if (this.recorder.running) {
      const fr: Omit<FrameRecord, "t"> = {
        hands: handFrames,
        pose: pose ? poseSubset(pose, world) : null,
        swipe: { touching: so.touching, deltaSec: so.deltaSec, playhead: p.currentTime },
      };
      if (this.recorder.frame(t, fr)) {
        this.finishRecording();
        this.recordStartAt = null;
      }
    }

    // 4. The panel (about 15 times a second: the graphs are the expensive part).
    if (t - this.lastPanelT >= 66) {
      this.lastPanelT = t;
      this.renderPanel(t, pose !== null);
    }
  }

  private onPushEvent(t: number, hand: Handedness, e: PushEvent, level: string | null, shape: string): void {
    this.events.push({ ...e, hand, level, shape });
    this.marks[hand].push({ t: e.t, kind: e.kind, signal: e.signal });
    this.recorder.event(t, { type: e.kind, hand, signal: e.signal, reason: e.reason, peak: e.peak, riseMs: e.riseMs, lateral: e.lateral, t0Abs: e.t0, level, shape });
    if (e.signal !== this.settings.primary) return;
    if (e.kind === "push") {
      this.flash = { t, hand, signal: e.signal };
      this.say("push");
    }
    const when = new Date().toLocaleTimeString();
    const tag = e.kind === "push" ? "PUSH" : `reject (${e.reason})`;
    this.logLines.unshift(`${when} ${tag} ${hand} · ${e.signal} peak ${e.peak.toFixed(2)} · rise ${Math.round(e.riseMs)} ms · sideways ${e.lateral.toFixed(2)} · level ${level ?? "?"} · ${prettyShape(shape)}`);
    if (this.logLines.length > 40) this.logLines.pop();
  }

  private renderPanel(t: number, havePose: boolean): void {
    const enter = { ...this.settings.push.enter };
    for (const hand of HANDS) {
      this.panel.drawGraph(hand, this.points[hand], this.marks[hand], enter, t);
      const s = this.lastSample[hand];
      this.panel.setTitle(hand, `${hand} hand: ${s ? `size ${s.size?.toFixed(0)} px${s.forearm !== null ? ` · forearm/shoulders ${s.forearm.toFixed(2)}` : ""}${s.depthM !== null ? ` · wrist depth ${(s.depthM * 100).toFixed(0)} cm` : ""}` : "not seen"}`);
    }
    this.panel.setLog(this.logLines);
    if (this.metrics.records.length !== this.lastTouches) {
      this.lastTouches = this.metrics.records.length;
      this.panel.setTouches(this.metrics.records);
    }
    const j = this.jitter.result;
    this.panel.setJitter(this.jitter.running ? "measuring… hold the hand still in the zone" : j ? `rest jitter: raw ${j.rawPerSec.toFixed(3)} s/s, applied ${j.appliedPerSec.toFixed(3)} s/s (${Math.round(j.touchedFrac * 100)}% of ${j.seconds.toFixed(0)} s touched)` : "no measurement yet");
    const rs = this.recorder.running ? `RECORDING ${this.recorder.remaining(t).toFixed(0)} s left · ${this.recorder.frameCount} frames` : this.recordStartAt !== null ? `starting in ${Math.max(0, (this.recordStartAt - t) / 1000).toFixed(0)} s: step back` : this.lastRecording ? `saved ${this.lastRecording.name}` : "idle";
    this.panel.setRecording(rs, this.recorder.running || this.recordStartAt !== null);
    this.panel.setLive(`${havePose ? "pose: yes" : "pose: NONE (Auto-track needs Person; a/b/c need it)"} · events from ${SIGNAL_NAMES[this.settings.primary]} · frames ${this.frames}`);
  }

  /** The scrub bar at the hand, a PUSH flash, and the touch state. Drawn on the HUD canvas (display space, not mirrored). */
  drawHud(g: CanvasRenderingContext2D, w: number, h: number): void {
    const now = this.now();
    const p = this.host.player;
    if (this.lastHand && this.swipe.touching) {
      const gain = gainSecOf(this.settings.swipe, p.duration) || 20;
      const barW = 0.3 * w;
      const barH = Math.max(22, 0.045 * h);
      const cx = Math.min(w - barW / 2 - 4, Math.max(barW / 2 + 4, this.lastHand.x * w));
      const top = Math.min(h - barH - 30, this.lastHand.y * h + 0.1 * h);
      const span = 0.3 * gain;
      const bar = scrubBar(p.currentTime, span, p.duration);
      g.save();
      g.fillStyle = "rgba(10,14,20,0.82)";
      g.fillRect(cx - barW / 2, top, barW, barH);
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.lineWidth = 1;
      g.strokeRect(cx - barW / 2, top, barW, barH);
      // The ends of the track.
      g.fillStyle = "rgba(255,255,255,0.18)";
      if (bar.startFrac !== null) g.fillRect(cx - barW / 2, top, bar.startFrac * barW, barH);
      if (bar.endFrac !== null) g.fillRect(cx - barW / 2 + bar.endFrac * barW, top, (1 - bar.endFrac) * barW, barH);
      g.fillStyle = "#ddd";
      g.font = `600 ${Math.round(barH * 0.34)}px system-ui, sans-serif`;
      g.textAlign = "center";
      for (const tk of bar.ticks) {
        const x = cx - barW / 2 + tk.frac * barW;
        g.fillRect(x, top + barH * (tk.major ? 0.45 : 0.62), 1, barH * (tk.major ? 0.55 : 0.38));
        if (tk.major) g.fillText(fmt(tk.sec), x, top + barH * 0.38);
      }
      // The playhead, in the middle, and the time under the hand, big.
      g.fillStyle = "#38e08c";
      g.fillRect(cx - 1.5, top - 6, 3, barH + 12);
      g.fillStyle = "#38e08c";
      g.font = `800 ${Math.round(barH * 0.8)}px system-ui, sans-serif`;
      g.strokeStyle = "rgba(0,0,0,0.85)";
      g.lineWidth = 5;
      g.strokeText(fmt(p.currentTime, true), cx, top - 10);
      g.fillText(fmt(p.currentTime, true), cx, top - 10);
      g.restore();
    }
    if (this.flash && now - this.flash.t < 600) {
      const palmFlash = this.lastHand ?? { x: 0.5, y: 0.2 };
      const a = 1 - (now - this.flash.t) / 600;
      g.save();
      g.globalAlpha = a;
      g.font = `800 ${Math.round(0.08 * h)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.lineWidth = 6;
      g.strokeStyle = "rgba(0,0,0,0.85)";
      g.strokeText("PUSH", palmFlash.x * w, palmFlash.y * h + 0.2 * h);
      g.fillStyle = "#ff8a30";
      g.fillText("PUSH", palmFlash.x * w, palmFlash.y * h + 0.2 * h);
      g.restore();
    }
  }
}

function fmt(sec: number, tenths = false): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${(tenths ? r.toFixed(1) : Math.floor(r).toString()).padStart(tenths ? 4 : 2, "0")}`;
}

/** The pose points a recording keeps: [x, y, z, visibility, world z]. */
function poseSubset(pose: readonly PoseLm[], world: readonly WorldLm[] | null): NonNullable<FrameRecord["pose"]> {
  const out: NonNullable<FrameRecord["pose"]> = {};
  for (const [name, i] of Object.entries(POSE_KEEP)) {
    const p = pose[i];
    if (!p) continue;
    out[name] = [p.x, p.y, p.z ?? null, p.visibility ?? null, world?.[i]?.z ?? null];
  }
  return out;
}

export { PUSH_KEYS };
