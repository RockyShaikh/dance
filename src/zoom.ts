/**
 * R6: zoom. With zoom on, the camera frame is cropped to the command zone plus a margin, and only the crop goes to the
 * Gesture Recognizer. Landmarks come back in the crop's coordinates and are mapped back to the full frame, so drawing,
 * the zone hit-test and every feature work in full-frame coordinates as before.
 *
 * Coordinates: the zone is in DISPLAY space (mirrored, box.ts); the camera frame and the crop are RAW (un-mirrored, what
 * the model sees). The crop is drawn into a SQUARE canvas (the crop in the middle, black padding around it, no scaling),
 * so the model's input aspect is known and the mapping is exact whatever the crop's shape: a hand's geometry is never
 * stretched. The model resizes its input to a small square (palm detector 192 px) keeping aspect, so what counts for how
 * big a hand is to the model is the LONG side of what it is given: `magnification` below.
 *
 * Pure geometry plus one small canvas helper (`Cropper`), which is only constructed in the browser.
 */
import type { Box } from "./box";
import { ZOOM } from "./config";

/** A rectangle in the RAW frame, normalized 0..1 (x right, y down). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The crop in pixels plus how it sits in the square model canvas. */
export interface CropLayout {
  /** Source frame size. */
  srcW: number;
  srcH: number;
  /** The crop's top-left and size in source pixels (whole pixels). */
  x0: number;
  y0: number;
  cw: number;
  ch: number;
  /** The square canvas the model is given: side in pixels, and where the crop sits in it. */
  side: number;
  ox: number;
  oy: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The crop for a zone (display space): the zone plus `margin` (a fraction of the frame HEIGHT, on every side, equal pixels
 * in x and y), flipped to raw space, clamped to the frame, and never smaller than `minCropFrac` in either direction.
 */
export function cropRectForZone(zone: Box, srcW: number, srcH: number, margin: number = ZOOM.margin, minFrac: number = ZOOM.minCropFrac): CropRect {
  const mx = (margin * srcH) / srcW;
  const my = margin;
  // Display x -> raw x = 1 - x: the zone's right edge is the crop's left edge.
  let l = 1 - (zone.x + zone.w + mx);
  let r = 1 - (zone.x - mx);
  let t = zone.y - my;
  let b = zone.y + zone.h + my;
  // Not smaller than the minimum: grow around the middle.
  if (r - l < minFrac) {
    const c = (l + r) / 2;
    l = c - minFrac / 2;
    r = c + minFrac / 2;
  }
  if (b - t < minFrac) {
    const c = (t + b) / 2;
    t = c - minFrac / 2;
    b = c + minFrac / 2;
  }
  l = clamp(l, 0, 1 - minFrac);
  t = clamp(t, 0, 1 - minFrac);
  r = clamp(r, l + minFrac, 1);
  b = clamp(b, t + minFrac, 1);
  return { x: l, y: t, w: r - l, h: b - t };
}

/** The crop on whole pixels, and its place in the square model canvas. */
export function cropLayout(rect: CropRect, srcW: number, srcH: number): CropLayout {
  const x0 = clamp(Math.round(rect.x * srcW), 0, srcW - 1);
  const y0 = clamp(Math.round(rect.y * srcH), 0, srcH - 1);
  const cw = clamp(Math.round(rect.w * srcW), 1, srcW - x0);
  const ch = clamp(Math.round(rect.h * srcH), 1, srcH - y0);
  const side = Math.max(cw, ch);
  return { srcW, srcH, x0, y0, cw, ch, side, ox: Math.floor((side - cw) / 2), oy: Math.floor((side - ch) / 2) };
}

/** A landmark: x, y normalized to the image it was found in (z on the same scale as x, as MediaPipe reports it). */
export interface Lm {
  x: number;
  y: number;
  z: number;
}

/** A landmark in the model's square canvas back to the full raw frame (normalized). */
export function toFullFrame(p: Lm, L: CropLayout): Lm {
  return {
    x: (p.x * L.side - L.ox + L.x0) / L.srcW,
    y: (p.y * L.side - L.oy + L.y0) / L.srcH,
    z: (p.z * L.side) / L.srcW,
  };
}

/** The inverse: a landmark in the full raw frame to the model's square canvas (used by the simulator, and the tests). */
export function fromFullFrame(p: Lm, L: CropLayout): Lm {
  return {
    x: (p.x * L.srcW - L.x0 + L.ox) / L.side,
    y: (p.y * L.srcH - L.y0 + L.oy) / L.side,
    z: (p.z * L.srcW) / L.side,
  };
}

/**
 * How much bigger things are to the model than with the whole frame: the model scales its input by its long side, so
 * (long side of the frame) / (long side of the crop). A full-width strip is 1.0x (nothing gained: its width is the frame's
 * width); a crop half the frame wide is 2x.
 */
export function magnification(L: CropLayout): number {
  return Math.max(L.srcW, L.srcH) / L.side;
}

/** Whether a raw-frame point lies inside the crop (the model sees nothing outside it). */
export function insideCrop(p: { x: number; y: number }, L: CropLayout): boolean {
  const x = p.x * L.srcW;
  const y = p.y * L.srcH;
  return x >= L.x0 && x <= L.x0 + L.cw && y >= L.y0 && y <= L.y0 + L.ch;
}

/** The crop as a box in DISPLAY space (mirrored), for drawing the outline on the HUD. */
export function cropAsDisplayBox(L: CropLayout): Box {
  return { x: 1 - (L.x0 + L.cw) / L.srcW, y: L.y0 / L.srcH, w: L.cw / L.srcW, h: L.ch / L.srcH };
}

/** Draws crops into one reusable square canvas (no scaling: crop pixels are source pixels). Browser only. */
export class Cropper {
  private readonly canvas = document.createElement("canvas");
  private readonly ctx = this.canvas.getContext("2d", { alpha: false })!;
  private key = "";
  /** Milliseconds spent drawing the last crops (a short average), for the dev stats. */
  avgMs = 0;

  /** Draws the crop of `source` and returns the canvas to hand to the recognizer. */
  draw(source: CanvasImageSource, L: CropLayout): HTMLCanvasElement {
    const t0 = performance.now();
    const key = `${L.side}|${L.ox}|${L.oy}|${L.cw}|${L.ch}`;
    if (key !== this.key) {
      // A new shape: resize (which clears) and paint the padding black once; the crop overwrites the middle every frame.
      this.canvas.width = L.side;
      this.canvas.height = L.side;
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, L.side, L.side);
      this.key = key;
    }
    this.ctx.drawImage(source, L.x0, L.y0, L.cw, L.ch, L.ox, L.oy, L.cw, L.ch);
    this.avgMs += (performance.now() - t0 - this.avgMs) * 0.1;
    return this.canvas;
  }
}
