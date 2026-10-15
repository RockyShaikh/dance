/**
 * EXP: the bench's panel (DOM only): controls, the rolling graphs, the readouts and the recording button. Built in code and put at
 * the top of the side column, so index.html and style.css stay as they are.
 */
import { PUSH_KEYS, SIGNAL_NAMES, type PushSignalKey } from "./config";
import type { ExpSettings } from "./expSettings";
import type { PushSample } from "./pushSignals";
import type { TouchRecord } from "./swipe";

const CSS = `
#exp-panel { border: 1px solid #c8782a; }
#exp-panel h2 .tag { font-size: 11px; font-weight: 600; color: #ffb020; margin-left: 6px; }
#exp-panel .row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 6px 0; font-size: 13px; }
#exp-panel .row label { display: inline-flex; gap: 4px; align-items: center; }
#exp-panel input[type=number] { width: 64px; }
#exp-panel input[type=text] { width: 120px; }
#exp-panel canvas.graph { width: 100%; height: auto; background: #0b0f14; border-radius: 4px; display: block; margin: 4px 0; }
#exp-panel ol { margin: 4px 0; padding-left: 18px; font: 12px ui-monospace, monospace; max-height: 150px; overflow-y: auto; }
#exp-panel .mono { font: 12px ui-monospace, monospace; white-space: pre-wrap; }
#exp-panel .rec { color: #ff5d6c; font-weight: 700; }
`;

/** One point of a rolling graph (a hand's sample, or null while the hand is away). */
export interface GraphPoint {
  t: number;
  s: PushSample | null;
}
export interface GraphMark {
  t: number;
  kind: "push" | "reject";
  signal: PushSignalKey;
}

export interface PanelHooks {
  changed(): void;
  measureJitter(): void;
  record(): void;
  clearLog(): void;
}

const GRAPH_MS = 6000;
const ROW_H = 46;
const GRAPH_W = 420;
const COLORS: Record<PushSignalKey, string> = { a: "#5cc8ff", b: "#c79bff", c: "#38e08c", d: "#ffb020" };

const unit: Record<PushSignalKey, (v: number) => string> = {
  a: (v) => `${(v * 100).toFixed(0)}%`,
  b: (v) => `${(v * 100).toFixed(0)}%`,
  c: (v) => `${(v * 100).toFixed(0)} cm`,
  d: (v) => v.toFixed(2),
};

export class ExpPanel {
  readonly root: HTMLElement;
  private readonly q = <T extends HTMLElement>(id: string): T => this.root.querySelector(`#${id}`) as T;
  private readonly graphs: Record<"Left" | "Right", HTMLCanvasElement>;
  private lastText = new Map<string, string>();

  constructor(
    private readonly s: ExpSettings,
    hooks: PanelHooks,
    doc: Document = document,
  ) {
    const style = doc.createElement("style");
    style.textContent = CSS;
    doc.head.appendChild(style);
    this.root = doc.createElement("section");
    this.root.className = "panel";
    this.root.id = "exp-panel";
    this.root.innerHTML = `
      <h2>EXP: push + swipe bench <span class="tag">?exp=push · measuring, nothing is wired to a command</span></h2>

      <h2>Swipe slider (zone as a trackpad)</h2>
      <div class="note">The right hand in the zone is a touch; moving it sideways scrubs the playhead relatively; leaving the zone lifts. The right hand's normal commands are off while this is on.</div>
      <div class="row">
        <label><input id="exp-swipe-on" type="checkbox" /> swipe on</label>
        <label><input id="exp-palm" type="checkbox" /> require open palm</label>
        <label>gain <select id="exp-gain"><option value="10">10 s / screen</option><option value="20">20 s / screen</option><option value="40">40 s / screen</option><option value="0">whole track / screen</option></select></label>
        <label>scrub <select id="exp-mode"><option value="play">while playing</option><option value="pause">paused, snippets</option></select></label>
      </div>
      <div class="row">
        <label>min speed <input id="exp-minspeed" type="number" step="0.01" min="0" /> screens/s</label>
        <label>settle <input id="exp-settle" type="number" step="10" min="0" /> ms</label>
      </div>
      <div class="row"><button type="button" id="exp-jitter" class="small">Hold still: measure jitter (5 s)</button><span id="exp-jitter-out" class="mono">no measurement yet</span></div>
      <div class="note">Per touch: net scrub · scrub in the first / last 300 ms (raw / applied, seconds: the accidental scrub as the hand arrives and leaves) · hand-stop to scrub-stop (excludes camera + model delay).</div>
      <ol id="exp-touches" aria-live="polite"></ol>

      <h2>Push signals <span class="note">each row is the signal over its threshold (the line = 1.0), last 6 s</span></h2>
      <div class="row">
        <label>a size +<input id="exp-ta" type="number" step="1" min="0.5" /> %</label>
        <label>b forearm −<input id="exp-tb" type="number" step="1" min="0.5" /> %</label>
        <label>c depth <input id="exp-tc" type="number" step="1" min="0.5" /> cm</label>
        <label>d combined <input id="exp-td" type="number" step="0.05" min="0.05" /></label>
        <label>swing if palm moves > <input id="exp-lat" type="number" step="0.1" min="0" /> hand sizes</label>
      </div>
      <div class="row">
        <label>events from <select id="exp-primary"></select></label>
        <label><input id="exp-speak" type="checkbox" /> say "push" (off = silent)</label>
      </div>
      <div class="mono" id="exp-right-title">Right hand</div>
      <canvas class="graph" id="exp-g-right" width="${GRAPH_W}" height="${ROW_H * 4}"></canvas>
      <div class="mono" id="exp-left-title">Left hand</div>
      <canvas class="graph" id="exp-g-left" width="${GRAPH_W}" height="${ROW_H * 4}"></canvas>
      <div class="mono" id="exp-live">—</div>
      <h2>PUSH events <button type="button" id="exp-clear" class="small">Clear</button></h2>
      <ol id="exp-log" aria-live="polite"></ol>

      <h2>Recording</h2>
      <div class="row">
        <label>label <input id="exp-label" type="text" /></label>
        <label>length <input id="exp-sec" type="number" step="5" min="3" /> s</label>
        <label>start in <input id="exp-delay" type="number" step="1" min="0" /> s</label>
        <button type="button" id="exp-rec">Record</button>
      </div>
      <div id="exp-rec-status" class="mono">idle</div>
      <div class="row"><a id="exp-dl" href="#" hidden>download last take</a></div>
    `;
    const side = doc.getElementById("side");
    if (side) side.insertBefore(this.root, side.firstChild);
    this.graphs = { Right: this.q("exp-g-right") as HTMLCanvasElement, Left: this.q("exp-g-left") as HTMLCanvasElement };

    const primary = this.q<HTMLSelectElement>("exp-primary");
    for (const k of PUSH_KEYS) primary.add(new Option(`${k}: ${SIGNAL_NAMES[k]}`, k));
    this.writeSettings();

    const on = (id: string, ev: string, fn: () => void) => this.q(id).addEventListener(ev, fn);
    for (const id of ["exp-swipe-on", "exp-palm", "exp-gain", "exp-mode", "exp-minspeed", "exp-settle", "exp-ta", "exp-tb", "exp-tc", "exp-td", "exp-lat", "exp-primary", "exp-speak", "exp-label", "exp-sec", "exp-delay"]) {
      on(id, "change", () => {
        this.readSettings();
        hooks.changed();
      });
    }
    on("exp-jitter", "click", () => hooks.measureJitter());
    on("exp-rec", "click", () => hooks.record());
    on("exp-clear", "click", () => hooks.clearLog());
  }

  private writeSettings(): void {
    const s = this.s;
    const set = (id: string, v: string | number | boolean) => {
      const el = this.q<HTMLInputElement>(id);
      if (typeof v === "boolean") el.checked = v;
      else el.value = String(v);
    };
    set("exp-swipe-on", s.swipeOn);
    set("exp-palm", s.requirePalm);
    set("exp-gain", s.swipe.gainSec);
    if (this.q<HTMLSelectElement>("exp-gain").value !== String(s.swipe.gainSec)) this.q<HTMLSelectElement>("exp-gain").add(new Option(`${s.swipe.gainSec} s / screen`, String(s.swipe.gainSec)));
    set("exp-gain", s.swipe.gainSec);
    set("exp-mode", s.scrubMode);
    set("exp-minspeed", s.swipe.minSpeed);
    set("exp-settle", s.swipe.settleMs);
    set("exp-ta", +(s.push.enter.a * 100).toFixed(1));
    set("exp-tb", +(s.push.enter.b * 100).toFixed(1));
    set("exp-tc", +(s.push.enter.c * 100).toFixed(1));
    set("exp-td", s.push.enter.d);
    set("exp-lat", s.push.lateralMax);
    set("exp-primary", s.primary);
    set("exp-speak", s.speak);
    set("exp-label", s.label);
    set("exp-sec", s.recordSec);
    set("exp-delay", s.startDelaySec);
  }

  private readSettings(): void {
    const s = this.s;
    const n = (id: string, fb: number) => {
      const v = Number(this.q<HTMLInputElement>(id).value);
      return Number.isFinite(v) ? v : fb;
    };
    const c = (id: string) => this.q<HTMLInputElement>(id).checked;
    s.swipeOn = c("exp-swipe-on");
    s.requirePalm = c("exp-palm");
    s.swipe.gainSec = n("exp-gain", s.swipe.gainSec);
    s.scrubMode = this.q<HTMLSelectElement>("exp-mode").value === "pause" ? "pause" : "play";
    s.swipe.minSpeed = Math.max(0, n("exp-minspeed", s.swipe.minSpeed));
    s.swipe.settleMs = Math.max(0, n("exp-settle", s.swipe.settleMs));
    s.push.enter.a = Math.max(0.005, n("exp-ta", s.push.enter.a * 100) / 100);
    s.push.enter.b = Math.max(0.005, n("exp-tb", s.push.enter.b * 100) / 100);
    s.push.enter.c = Math.max(0.005, n("exp-tc", s.push.enter.c * 100) / 100);
    s.push.enter.d = Math.max(0.05, n("exp-td", s.push.enter.d));
    s.push.lateralMax = Math.max(0, n("exp-lat", s.push.lateralMax));
    s.primary = this.q<HTMLSelectElement>("exp-primary").value as PushSignalKey;
    s.speak = c("exp-speak");
    s.label = this.q<HTMLInputElement>("exp-label").value;
    s.recordSec = Math.max(3, n("exp-sec", s.recordSec));
    s.startDelaySec = Math.max(0, n("exp-delay", s.startDelaySec));
  }

  /** Writes text only when it changed (cheap to call every frame). */
  private text(id: string, v: string): void {
    if (this.lastText.get(id) === v) return;
    this.lastText.set(id, v);
    this.q(id).textContent = v;
  }

  setLive(v: string): void {
    this.text("exp-live", v);
  }

  setTitle(hand: "Left" | "Right", v: string): void {
    this.text(hand === "Right" ? "exp-right-title" : "exp-left-title", v);
  }

  setJitter(v: string): void {
    this.text("exp-jitter-out", v);
  }

  setRecording(status: string, active: boolean): void {
    this.text("exp-rec-status", status);
    this.q("exp-rec-status").classList.toggle("rec", active);
    this.q<HTMLButtonElement>("exp-rec").textContent = active ? "Stop" : "Record";
  }

  setDownload(href: string, name: string): void {
    const a = this.q<HTMLAnchorElement>("exp-dl");
    a.href = href;
    a.download = name;
    a.textContent = `download last take (${name})`;
    a.hidden = false;
  }

  /** Newest first. */
  setLog(lines: readonly string[]): void {
    this.fillList("exp-log", lines);
  }

  setTouches(recs: readonly TouchRecord[]): void {
    const f = (v: number) => v.toFixed(2);
    this.fillList(
      "exp-touches",
      recs
        .slice(-6)
        .reverse()
        .map(
          (r, i) =>
            `#${recs.length - i} ${(r.durMs / 1000).toFixed(1)}s net ${r.netSec >= 0 ? "+" : ""}${r.netSec.toFixed(1)}s · in ${f(r.downRawSec)}/${f(r.downAppliedSec)} · out ${f(r.upRawSec)}/${f(r.upAppliedSec)} · stop ${r.stopLatencyMs === null ? "n/a" : `${Math.round(r.stopLatencyMs)} ms`}`,
        ),
    );
  }

  private fillList(id: string, lines: readonly string[]): void {
    const key = lines.join("\n");
    if (this.lastText.get(id) === key) return;
    this.lastText.set(id, key);
    const ol = this.q(id);
    ol.replaceChildren(...lines.map((l) => Object.assign(document.createElement("li"), { textContent: l })));
  }

  /** Draws one hand's four rolling traces, each over its own threshold. */
  drawGraph(hand: "Left" | "Right", points: readonly GraphPoint[], marks: readonly GraphMark[], enter: Record<PushSignalKey, number>, now: number): void {
    const cv = this.graphs[hand];
    const g = cv.getContext("2d");
    if (!g) return;
    const W = cv.width;
    g.clearRect(0, 0, W, cv.height);
    const x = (t: number) => W - ((now - t) / GRAPH_MS) * W;
    PUSH_KEYS.forEach((k, row) => {
      const top = row * ROW_H;
      const y = (norm: number) => top + ROW_H - 6 - (Math.max(-0.5, Math.min(2.5, norm)) + 0.5) * ((ROW_H - 12) / 3);
      g.strokeStyle = "rgba(255,255,255,0.12)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, top + ROW_H - 0.5);
      g.lineTo(W, top + ROW_H - 0.5);
      g.stroke();
      // The threshold (1.0) and zero.
      g.setLineDash([4, 4]);
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.beginPath();
      g.moveTo(0, y(1));
      g.lineTo(W, y(1));
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = "rgba(255,255,255,0.15)";
      g.beginPath();
      g.moveTo(0, y(0));
      g.lineTo(W, y(0));
      g.stroke();
      // The trace.
      g.strokeStyle = COLORS[k];
      g.lineWidth = 1.6;
      g.beginPath();
      let pen = false;
      let last: number | null = null;
      for (const p of points) {
        const v = p.s?.[k];
        if (v === null || v === undefined) {
          pen = false;
          continue;
        }
        const px = x(p.t);
        if (px < 0) continue;
        const py = y(v / enter[k]);
        if (pen) g.lineTo(px, py);
        else g.moveTo(px, py);
        pen = true;
        last = v;
      }
      g.stroke();
      for (const m of marks) {
        if (m.signal !== k || now - m.t > GRAPH_MS) continue;
        g.strokeStyle = m.kind === "push" ? "#ff8a30" : "#ff5d6c";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x(m.t), top + 2);
        g.lineTo(x(m.t), top + ROW_H - 2);
        g.stroke();
      }
      g.fillStyle = COLORS[k];
      g.font = "11px ui-monospace, monospace";
      g.fillText(`${k} ${SIGNAL_NAMES[k]}  ${last === null ? "—" : unit[k](last)}  (thr ${unit[k](enter[k])})`, 4, top + 12);
    });
  }
}
