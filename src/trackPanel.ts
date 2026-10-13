/**
 * R8: the Auto-track controls (mode selector, measure toggle) and the measurement overlay. DOM only.
 *
 * The readout is a text block under the controls: what the tracker is doing, the model times and fps, the magnification of each
 * crop, each hand's palm width (in the frame and as the palm detector sees it) and the detection-rate counters. It is meant
 * for comparing the three modes at 2-5 m: shown whenever Auto-track is on, or the Measure box is ticked (with the mode Off the
 * pose model then runs too, so that "frames with a visible wrist" has something to count: Off's times include that).
 */
import { TRACK_MODES, type AutoTracker, type TrackMode } from "./autoTrack";

const NAMES: Record<TrackMode, string> = { off: "Off", person: "Person (auto-frame)", wrists: "Wrists (a crop per hand)" };
const HELP: Record<TrackMode, string> = {
  off: "the whole picture goes to the hand model (or the Zoom crop, if ticked)",
  person: "pose frames head + shoulders + both hands; the crop goes to the hand model",
  wrists: "pose finds each wrist; each hand gets its own crop and model",
};

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

export class TrackPanel {
  private readonly select = el<HTMLSelectElement>("track-mode");
  private readonly note = el("track-note");
  private readonly measure = el<HTMLInputElement>("track-measure");
  private readonly overlay = el("track-hud");
  private readonly body = el("track-hud-body");
  private lastText = "";
  private lastDraw = 0;

  constructor(
    private readonly tracker: AutoTracker,
    mode: TrackMode,
    private readonly hooks: { modeChanged(mode: TrackMode): void; measureChanged(on: boolean): void },
  ) {
    for (const m of TRACK_MODES) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = NAMES[m];
      this.select.append(o);
    }
    this.select.value = mode;
    this.select.addEventListener("change", () => {
      this.hooks.modeChanged(this.select.value as TrackMode);
      this.select.blur();
    });
    this.measure.checked = tracker.measurePose;
    this.measure.addEventListener("change", () => {
      this.hooks.measureChanged(this.measure.checked);
      this.measure.blur();
    });
    el("track-reset").addEventListener("click", (e) => {
      tracker.stats.reset();
      (e.currentTarget as HTMLElement).blur();
    });
    this.showMode(mode);
  }

  showMode(mode: TrackMode): void {
    this.select.value = mode;
    this.note.textContent = `${HELP[mode]}.${mode === "off" ? "" : " The Zoom box is ignored while this is on."}`;
    this.render(0, true);
  }

  /** Called every frame; redraws the text a few times a second. `fps` is the app's own frame rate. */
  render(fps: number, force = false): void {
    const t = this.tracker;
    const show = t.mode !== "off" || t.measurePose;
    this.overlay.hidden = !show;
    if (!show) return;
    const now = performance.now();
    if (!force && now - this.lastDraw < 250) return;
    this.lastDraw = now;
    const f = t.last;
    const ms = (v: number) => v.toFixed(1).padStart(5);
    const lines: string[] = [];
    lines.push(`AUTO-TRACK: ${t.mode.toUpperCase()}${t.mode === "wrists" ? ` (${t.wristRunning} mode)` : ""}   ${t.delegates || t.loading}`);
    if (t.loading) lines.push(t.loading);
    lines.push(`pose ${ms(t.poseMs)} ms · gesture ${ms(t.gestureMs)} ms · ${fps.toFixed(1)} fps`);
    if (f) {
      lines.push(f.note);
      if (f.crops.length === 0) lines.push("magnification ×1.0 (whole frame)");
      for (const c of f.crops) lines.push(`${c.label} crop ${c.layout.cw}×${c.layout.ch} px · magnification ×${c.magnification.toFixed(2)}`);
      if (f.hands.length === 0) lines.push("no hand found");
      f.hands.forEach((h, i) => lines.push(`hand ${i + 1}: palm ${h.framePx.toFixed(1)} px in frame · ${h.detectorPx.toFixed(1)} px at detector (hand length ${h.lenPx.toFixed(0)} · ${h.lenDetectorPx.toFixed(1)})${h.crop ? ` [${h.crop}]` : ""}`));
    }
    lines.push(`detection: ${t.stats.text()}`);
    const text = lines.join("\n");
    if (text !== this.lastText) {
      this.lastText = text;
      this.body.textContent = text;
    }
  }
}
