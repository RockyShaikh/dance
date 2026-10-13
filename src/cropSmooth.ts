/**
 * R8: the crop follows its target smoothly. Pure state machine, one per crop (the person crop, or each wrist).
 *
 * - Exponential smoothing (time-based, so the frame rate does not matter).
 * - A dead-band with hysteresis: the crop stays exactly where it is until the target is further off than `enter*`, then moves
 *   until it is within `exit*`. A still crop also keeps the recognizer's own VIDEO-mode tracking valid (it remembers the hand's
 *   place in the previous crop's coordinates: a moving crop makes that memory stale).
 * - A maximum zoom rate (size changes limited in ln units per second; zooming out may be faster than zooming in).
 * - When the target is missing: hold the last crop for a while (pose flickers), then either relax to the full frame (`full`,
 *   person mode) or let the crop go (`drop`, wrist mode: no crop, so the caller runs the whole frame instead).
 */
import type { SmoothConfig } from "./config";
import type { CropRect } from "./zoom";

export const FULL_RECT: CropRect = { x: 0, y: 0, w: 1, h: 1 };

export type SmoothPhase = "idle" | "tracking" | "holding" | "relaxing";

export interface SmoothState {
  /** The crop to use now (null: none, in `drop` mode after the target was lost, or before the first target). */
  rect: CropRect | null;
  /** Inside the hysteresis loop: the crop is moving toward its target. */
  engaged: boolean;
  /** When the target went missing (null while it is present). */
  lostSince: number | null;
  /** The time of the last step, for dt. */
  t: number | null;
  phase: SmoothPhase;
}

export const IDLE_SMOOTH: SmoothState = { rect: null, engaged: false, lostSince: null, t: null, phase: "idle" };

interface Cwh {
  cx: number;
  cy: number;
  w: number;
  h: number;
}
const toCwh = (r: CropRect): Cwh => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h });
const fromCwh = (c: Cwh): CropRect => {
  const w = Math.min(1, Math.max(1e-4, c.w));
  const h = Math.min(1, Math.max(1e-4, c.h));
  return { x: Math.min(1 - w, Math.max(0, c.cx - w / 2)), y: Math.min(1 - h, Math.max(0, c.cy - h / 2)), w, h };
};

/** How far a target is from the crop: centre offset as a fraction of the crop's size, and size change in ln units. */
export function cropError(cur: CropRect, target: CropRect): { pos: number; size: number } {
  const c = toCwh(cur);
  const t = toCwh(target);
  return {
    pos: Math.max(Math.abs(t.cx - c.cx) / c.w, Math.abs(t.cy - c.cy) / c.h),
    size: Math.max(Math.abs(Math.log(t.w / c.w)), Math.abs(Math.log(t.h / c.h))),
  };
}

/** One smoothing move of `cur` toward `target` over `dtMs`: exponential on the centre and on ln(size), size change rate-limited. */
export function moveToward(cur: CropRect, target: CropRect, dtMs: number, cfg: SmoothConfig): CropRect {
  const c = toCwh(cur);
  const t = toCwh(target);
  const a = 1 - Math.exp(-Math.max(0, dtMs) / cfg.tauMs);
  const sec = Math.max(0, dtMs) / 1000;
  const grow = (from: number, to: number) => {
    const d = (Math.log(to) - Math.log(from)) * a;
    // Positive d = the crop grows = zooming out.
    return Math.exp(Math.log(from) + Math.min(cfg.zoomOutPerSec * sec, Math.max(-cfg.zoomInPerSec * sec, d)));
  };
  return fromCwh({ cx: c.cx + (t.cx - c.cx) * a, cy: c.cy + (t.cy - c.cy) * a, w: grow(c.w, t.w), h: grow(c.h, t.h) });
}

/**
 * One step. `target` is the crop the pose asks for now (null: the pose does not see it); `t` is the frame time in ms.
 * `lost` picks what a long absence does: relax to the full frame, or drop the crop.
 */
export function smoothStep(s: SmoothState, target: CropRect | null, t: number, cfg: SmoothConfig, lost: "full" | "drop"): SmoothState {
  const dt = s.t === null ? 0 : Math.max(0, t - s.t);

  if (target) {
    // First crop ever (or after a drop): start right on the target.
    if (!s.rect) return { rect: target, engaged: false, lostSince: null, t, phase: "tracking" };
    // Coming back from a relax toward the full frame: the same hysteresis applies, so the crop engages at once (the target is far).
    const e = cropError(s.rect, target);
    const engaged = e.pos > cfg.enterPos || e.size > cfg.enterSize || (s.engaged && (e.pos > cfg.exitPos || e.size > cfg.exitSize));
    return { rect: engaged ? moveToward(s.rect, target, dt, cfg) : s.rect, engaged, lostSince: null, t, phase: "tracking" };
  }

  // No target.
  if (!s.rect) return { ...IDLE_SMOOTH, t };
  const lostSince = s.lostSince ?? t;
  if (t - lostSince < cfg.lostAfterMs) return { ...s, lostSince, t, phase: "holding", engaged: false };
  if (lost === "drop") return { ...IDLE_SMOOTH, t, lostSince };
  // Relax to the full frame at the zoom-out rate, then sit there.
  const e = cropError(s.rect, FULL_RECT);
  if (e.pos < 0.005 && e.size < 0.005) return { rect: FULL_RECT, engaged: false, lostSince, t, phase: "idle" };
  return { rect: moveToward(s.rect, FULL_RECT, dt, cfg), engaged: true, lostSince, t, phase: "relaxing" };
}
