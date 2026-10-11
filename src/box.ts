/**
 * The command box: a rectangle on the camera view. Pure geometry, no DOM.
 *
 * Coordinates are DISPLAY-normalized: (0,0) is the top-left of the picture as the
 * user sees it (the video is mirrored for display), (1,1) the bottom-right.
 * The raw camera landmarks are un-mirrored, so a landmark's raw x becomes
 * display x = 1 - raw x. That flip happens in exactly one place (`palmCentre`
 * in handFeatures.ts); everything here, and the HUD canvas and mouse events,
 * work in display space and never flip.
 */
import { BOX } from "./config";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PRESETS = {
  right: { x: 0.5, y: 0, w: 0.5, h: 1 },
  left: { x: 0, y: 0, w: 0.5, h: 1 },
  whole: { x: 0, y: 0, w: 1, h: 1 },
} as const satisfies Record<string, Box>;

export type PresetName = keyof typeof PRESETS;

/** Default: the right half of the frame as the user sees it. */
export const DEFAULT_BOX: Box = { ...PRESETS.right };

/** Which part of the box the pointer is on: the inside (move), an edge, or a corner. */
export type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Is the point inside the box (edges included)? */
export function contains(box: Box, p: Vec2): boolean {
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

/** Forces a box to lie inside the frame and be at least the minimum size. */
export function normalizeBox(b: Box, minSize: number = BOX.minSize): Box {
  const w = clamp(b.w, minSize, 1);
  const h = clamp(b.h, minSize, 1);
  return { x: clamp(b.x, 0, 1 - w), y: clamp(b.y, 0, 1 - h), w, h };
}

/**
 * What would a mouse press at `p` grab? `tol` is the grab distance from an edge
 * in normalized units (x and y differ because the picture isn't square), counted
 * on both sides of the edge so a slightly-outside click still catches it.
 * Returns null when the pointer is nowhere near the box.
 */
export function hitTest(box: Box, p: Vec2, tol: Vec2): Handle | null {
  // On a small box, never let the edge zones swallow the inside.
  const tx = Math.min(tol.x, box.w / 3);
  const ty = Math.min(tol.y, box.h / 3);
  const left = box.x;
  const right = box.x + box.w;
  const top = box.y;
  const bottom = box.y + box.h;
  if (p.x < left - tx || p.x > right + tx || p.y < top - ty || p.y > bottom + ty) return null;

  const ns = Math.abs(p.y - top) <= ty ? "n" : Math.abs(p.y - bottom) <= ty ? "s" : "";
  const ew = Math.abs(p.x - left) <= tx ? "w" : Math.abs(p.x - right) <= tx ? "e" : "";
  const handle = (ns + ew) as Handle | "";
  return handle === "" ? "move" : handle;
}

/**
 * The box after dragging `handle`, given the box as it was when the drag began
 * and the pointer's total movement since then (normalized). Always stays inside
 * the frame and at least `minSize` big; the dragged edge stops at the limit.
 */
export function applyDrag(start: Box, handle: Handle, dx: number, dy: number, minSize: number = BOX.minSize): Box {
  if (handle === "move") {
    return {
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
      w: start.w,
      h: start.h,
    };
  }
  let l = start.x;
  let r = start.x + start.w;
  let t = start.y;
  let b = start.y + start.h;
  if (handle === "w" || handle === "nw" || handle === "sw") l = clamp(l + dx, 0, r - minSize);
  if (handle === "e" || handle === "ne" || handle === "se") r = clamp(r + dx, l + minSize, 1);
  if (handle === "n" || handle === "nw" || handle === "ne") t = clamp(t + dy, 0, b - minSize);
  if (handle === "s" || handle === "sw" || handle === "se") b = clamp(b + dy, t + minSize, 1);
  return { x: l, y: t, w: r - l, h: b - t };
}

/** CSS cursor for a handle. */
export function cursorFor(handle: Handle | null): string {
  switch (handle) {
    case "move":
      return "move";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
      return "nwse-resize";
    default:
      return "default";
  }
}
