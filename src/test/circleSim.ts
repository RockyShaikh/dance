import { KNOB } from "../config";
import { startMotion, stepMotion, type MotionState } from "../knobMotion";

/**
 * A hand circling, run through the circling motion exactly as the knob does. Returns, per frame, how far the hand
 * has really gone round (degrees, clockwise positive) and what the motion reports. Deterministic jitter stands in
 * for landmark noise.
 */
export interface CircleOpts {
  fps?: number;
  /** Circle radius, in frame heights. */
  radius?: number;
  revPerSec?: number;
  /** +1 clockwise on screen, -1 counter-clockwise. */
  dir?: 1 | -1;
  /** The hand holds still this long (at the circle's start) before it starts to circle. */
  restMs?: number;
  /** Length of the circling itself, after the rest. */
  circleMs?: number;
  jitter?: number;
  aspect?: number;
  /** The hand stops dead this long into the circling (it then holds still). */
  stopMs?: number;
  /** "wave": instead of circling, the hand waves back and forth along a line at `revPerSec` cycles per second. */
  path?: "circle" | "wave";
}

export interface CircleFrame {
  t: number;
  /** True degrees travelled since the circle began (0 during the rest). */
  trueDeg: number;
  /** What the motion reports since the grab. */
  reported: number;
}

export function simulateCircle(o: CircleOpts = {}): CircleFrame[] {
  const fps = o.fps ?? 30;
  const radius = o.radius ?? 0.08;
  const rev = o.revPerSec ?? 1;
  const dir = o.dir ?? 1;
  const rest = o.restMs ?? 0;
  const aspect = o.aspect ?? 16 / 9;
  const jitter = o.jitter ?? 0.0015;
  const dt = 1000 / fps;
  const frames: CircleFrame[] = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 2;
  // The circle's centre is (0.7, 0.5); the hand starts at its left-most point.
  const cx = 0.7;
  const cy = 0.5;
  const start = 180;
  let motion: MotionState | null = null;
  const total = rest + (o.circleMs ?? 3000);
  for (let t = 0; t <= total; t += dt) {
    const moving = Math.min(Math.max(0, t - rest), o.stopMs ?? Infinity);
    const travelled = ((moving / 1000) * rev * 360) * dir;
    const a = ((start + travelled) * Math.PI) / 180;
    const palm =
      o.path === "wave"
        ? { x: cx + (radius / aspect) * Math.cos(a) + (jitter / aspect) * rnd(), y: cy + (jitter) * rnd() }
        : { x: cx + (radius / aspect) * Math.cos(a) + (jitter / aspect) * rnd(), y: cy + radius * Math.sin(a) + jitter * rnd() };
    const input = { t, tiltDeg: 0, palm, aspect };
    motion = motion === null ? startMotion("circling", input) : stepMotion(motion, input, KNOB);
    frames.push({ t, trueDeg: travelled, reported: motion.angle });
  }
  return frames;
}

/**
 * Direction latency: the true degrees the hand had gone round when the report first became right and stayed right
 * (past `minDeg` in the right direction, and never back below it afterwards). Infinity if it never did.
 */
export function directionLatencyDeg(frames: readonly CircleFrame[], dir: 1 | -1 = 1, minDeg = 5): number {
  for (let i = 0; i < frames.length; i++) {
    if (frames.slice(i).every((f) => f.reported * dir >= minDeg)) return Math.abs(frames[i].trueDeg);
  }
  return Infinity;
}
