/**
 * R4c: drawing the waveform. Both views only read the pre-computed peaks (waveform.ts):
 *  - `drawOverview`: the whole track on the timeline bar, once per load and resize.
 *  - `drawZoom`: a few seconds either side of what is being steered, large enough to read from across the
 *    room, on the HUD canvas every frame while the knob is grabbed (a few hundred columns, no decoding).
 */
import { peakColumns, type Peaks } from "./waveform";
import { formatTime } from "./time";

const START = "#38e08c";
const END = "#ff5d6c";
const LOOP = "#ffd23f";
const ACCENT = "#5cc8ff";

/** The whole track as a faint waveform on a canvas that fills the timeline bar. */
export function drawOverview(canvas: HTMLCanvasElement, peaks: Peaks | null): void {
  const w = Math.max(1, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)));
  const h = Math.max(1, Math.round(canvas.clientHeight * (window.devicePixelRatio || 1)));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!peaks) return;
  const cols = peakColumns(peaks, 0, peaks.duration, w);
  const mid = h / 2;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let x = 0; x < w; x++) {
    const top = Math.min(mid, Math.max(-cols.min[x], cols.max[x]) * peaks.gain * mid);
    const half = Math.max(top, cols.max[x] > 0 || cols.min[x] < 0 ? 1 : 0);
    if (half > 0) ctx.fillRect(x, mid - half, 1, half * 2);
  }
}

export interface ZoomDraw {
  peaks: Peaks;
  /** What is being steered, and the time at the centre of the view. */
  target: "playhead" | "start" | "end";
  centre: number;
  /** Seconds shown either side of the centre. */
  halfWindow: number;
  playhead: number;
  start: number | null;
  end: number | null;
  /** The panel's headline, e.g. "PLAYHEAD · PLAYING". */
  title: string;
  /** Under the time, e.g. "+1.4 s since grab". */
  note: string;
}

function outlined(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, align: CanvasTextAlign): void {
  ctx.font = `800 ${px}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = px / 5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/**
 * The zoomed view, in the bottom of the HUD canvas. The steered thing stays at the centre line and the
 * waveform scrolls past it (so steering the playhead while it plays looks like a moving tape); the other
 * markers are drawn where they fall in the window.
 */
export function drawZoom(ctx: CanvasRenderingContext2D, z: ZoomDraw): void {
  const { width: W, height: H } = ctx.canvas;
  const s = W / 1280;
  const x0 = 0.02 * W;
  const w = 0.96 * W;
  const y0 = 0.6 * H;
  const h = 0.38 * H;
  const accent = z.target === "start" ? START : z.target === "end" ? END : ACCENT;

  ctx.fillStyle = "rgba(8,10,14,0.82)";
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, 14 * s);
  ctx.fill();
  ctx.lineWidth = 5 * s;
  ctx.strokeStyle = accent;
  ctx.stroke();

  // Headline row.
  outlined(ctx, z.title, x0 + 20 * s, y0 + 44 * s, 32 * s, accent, "left");
  outlined(ctx, formatTime(z.centre), x0 + w - 20 * s, y0 + 52 * s, 64 * s, "#fff", "right");
  if (z.note) outlined(ctx, z.note, x0 + w / 2, y0 + 44 * s, 26 * s, "#ffb020", "center");

  // The waveform area.
  const ax = x0 + 12 * s;
  const aw = w - 24 * s;
  const ay = y0 + 70 * s;
  const ah = h - 70 * s - 34 * s;
  const mid = ay + ah / 2;
  const t0 = z.centre - z.halfWindow;
  const t1 = z.centre + z.halfWindow;
  const xOf = (t: number): number => ax + ((t - t0) / (t1 - t0)) * aw;

  // The loop region, tinted.
  if (z.start !== null && z.end !== null) {
    const a = Math.max(ax, xOf(z.start));
    const b = Math.min(ax + aw, xOf(z.end));
    if (b > a) {
      ctx.fillStyle = "rgba(255,210,63,0.20)";
      ctx.fillRect(a, ay, b - a, ah);
    }
  }
  // Before 0:00 and after the end: nothing to hear.
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  if (t0 < 0) ctx.fillRect(ax, ay, Math.min(aw, xOf(0) - ax), ah);
  if (t1 > z.peaks.duration) {
    const from = Math.max(ax, xOf(z.peaks.duration));
    ctx.fillRect(from, ay, ax + aw - from, ah);
  }

  // Waveform: one 2-px line per column.
  const step = 3 * s;
  const cols = Math.max(8, Math.floor(aw / step));
  const pk = peakColumns(z.peaks, t0, t1, cols);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  for (let c = 0; c < cols; c++) {
    const up = Math.min(1, pk.max[c] * z.peaks.gain) * (ah / 2);
    const down = Math.min(1, -pk.min[c] * z.peaks.gain) * (ah / 2);
    const hh = up + down;
    if (hh > 0) ctx.fillRect(ax + c * step, mid - up, Math.max(1, step - 1 * s), Math.max(2 * s, hh));
  }
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(ax, mid - 1 * s, aw, 2 * s);

  // Seconds ticks along the bottom.
  const firstTick = Math.ceil(Math.max(0, t0));
  for (let t = firstTick; t <= Math.min(t1, z.peaks.duration); t++) {
    const x = xOf(t);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x - 1 * s, ay + ah, 2 * s, 8 * s);
    outlined(ctx, formatTime(t, false), x, ay + ah + 28 * s, 20 * s, "rgba(255,255,255,0.7)", "center");
  }

  // Markers: START / END poles and the playhead. The steered one is thicker, and the centre line is drawn last.
  const pole = (t: number | null, color: string, label: string, thick: boolean): void => {
    if (t === null || t < t0 || t > t1) return;
    const x = xOf(t);
    ctx.fillStyle = color;
    ctx.fillRect(x - (thick ? 5 : 3) * s, ay, (thick ? 10 : 6) * s, ah);
    outlined(ctx, label, x + (label === "END" ? 10 : -10) * s, ay + 26 * s, 24 * s, color, label === "END" ? "left" : label === "START" ? "right" : "center");
  };
  pole(z.start, START, "START", z.target === "start");
  pole(z.end, END, "END", z.target === "end");
  if (z.target !== "playhead") pole(z.playhead, "#ffffff", "", false);
  const cx = xOf(z.centre);
  ctx.fillStyle = z.target === "playhead" ? "#ffffff" : LOOP;
  ctx.fillRect(cx - 3 * s, ay - 6 * s, 6 * s, ah + 12 * s);
}
