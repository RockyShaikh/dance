/**
 * EXP: the recording. Pure (no DOM): collects per-frame signal traces and the detector's events for N seconds, then makes the
 * JSON text the bench offers as a download. Nothing is computed offline from raw video: the file holds the per-frame numbers
 * (the signals, the hand sizes in pixels, the pose points used) so the analysis can recompute any candidate rule.
 */

export interface RecordingMeta {
  /** What the user typed to say what this take is ("push-2m"). */
  label: string;
  /** Wall-clock start, ISO. */
  startedAt: string;
  durationSec: number;
  camera: { label: string; width: number; height: number; shape: string | null; frameRate: number | null };
  trackMode: string;
  userAgent: string;
  /** The thresholds and swipe settings in force during the take. */
  settings: unknown;
  /** Set by the sim runs so a recording is never mistaken for a real one. */
  sim?: boolean;
}

/** One frame's numbers for one hand, all plain JSON. */
export interface HandFrame {
  hand: string;
  shape: string;
  shapeScore: number;
  level: string | null;
  /** Palm centre, display-normalized. */
  palm: [number, number];
  palmWidthPx: number;
  handLenPx: number;
  /** Smoothed size (the diagonal of the two), the forearm ratio, the wrist depth (m), and the signals a-d + lateral. */
  size: number | null;
  forearm: number | null;
  depthM: number | null;
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
  lateral: number | null;
}

export interface FrameRecord {
  /** Milliseconds since the recording began. */
  t: number;
  hands: HandFrame[];
  /** The pose points the signals used (raw frame, normalized): nose, shoulders, elbows, wrists, hips; with z, and the world z. Null with no pose. */
  pose: Record<string, [number, number, number | null, number | null, number | null]> | null;
  swipe: { touching: boolean; deltaSec: number; playhead: number } | null;
}

export interface EventRecord {
  t: number;
  type: "push" | "reject" | "touch";
  [key: string]: unknown;
}

const round = (v: unknown, digits = 4): unknown => {
  if (typeof v !== "number") return v;
  if (!Number.isFinite(v)) return null;
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/** JSON replacer: numbers to 4 decimals (the files stay small: a 30 s take at 30 fps is a few hundred KB). */
export function roundingReplacer(_key: string, value: unknown): unknown {
  return round(value);
}

export class Recorder {
  private meta: RecordingMeta | null = null;
  private t0 = 0;
  private endAt = 0;
  private frames: FrameRecord[] = [];
  private events: EventRecord[] = [];
  running = false;

  /** Begin at clock time `t` (ms). */
  start(t: number, meta: RecordingMeta): void {
    this.meta = meta;
    this.t0 = t;
    this.endAt = t + meta.durationSec * 1000;
    this.frames = [];
    this.events = [];
    this.running = true;
  }

  /** Seconds left (0 when idle). */
  remaining(t: number): number {
    return this.running ? Math.max(0, (this.endAt - t) / 1000) : 0;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  /** Add one frame (clock time `t`); returns true when this frame ended the take. */
  frame(t: number, rec: Omit<FrameRecord, "t">): boolean {
    if (!this.running) return false;
    this.frames.push({ t: t - this.t0, ...rec });
    return t >= this.endAt;
  }

  event(t: number, e: Omit<EventRecord, "t">): void {
    if (!this.running) return;
    this.events.push({ t: t - this.t0, ...e } as EventRecord);
  }

  /** Stop and return the file's text (valid JSON). */
  finish(): string {
    this.running = false;
    const fps = this.frames.length > 1 ? ((this.frames.length - 1) * 1000) / (this.frames[this.frames.length - 1].t - this.frames[0].t) : 0;
    const doc = {
      format: "dance-exp-push-swipe/1",
      meta: this.meta,
      summary: { frames: this.frames.length, measuredFps: fps, pushEvents: this.events.filter((e) => e.type === "push").length, rejects: this.events.filter((e) => e.type === "reject").length },
      events: this.events,
      frames: this.frames,
    };
    return JSON.stringify(doc, roundingReplacer);
  }
}

/** A file name for a take: label, then the time. */
export function recordingFileName(label: string, when: Date): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "take";
  const stamp = when.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `dance-exp-${slug}-${stamp}.json`;
}
