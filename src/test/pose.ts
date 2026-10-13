/** Test helper: a synthetic 33-point pose for a standing person in a W x H frame, laid out in pixels and returned normalized. */
import type { PoseLm } from "../poseCrop";

export interface PoseSpec {
  W: number;
  H: number;
  /** Shoulder midpoint, px. */
  cx: number;
  sy: number;
  /** Shoulder width, px. */
  sw: number;
  /** Wrist positions in px; null = not in view (visibility 0). */
  leftWrist?: { x: number; y: number } | null;
  rightWrist?: { x: number; y: number } | null;
  /** Hand points (index / pinky / thumb) sit this far from the wrist toward the elbow's opposite side, in shoulder widths. Default 0.25. */
  handLen?: number;
  /** Elbows visible (default true). */
  elbows?: boolean;
  /** Head visible (default true). */
  head?: boolean;
}

export function makePose(spec: PoseSpec): PoseLm[] {
  const { W, H, cx, sy, sw } = spec;
  const pts: { x: number; y: number; v: number }[] = Array.from({ length: 33 }, () => ({ x: cx, y: sy, v: 0 }));
  const set = (i: number, x: number, y: number, v = 1) => (pts[i] = { x, y, v });
  const headV = spec.head === false ? 0 : 1;
  const noseY = sy - 0.55 * sw;
  set(0, cx, noseY, headV);
  set(2, cx - 0.08 * sw, noseY - 0.08 * sw, headV);
  set(5, cx + 0.08 * sw, noseY - 0.08 * sw, headV);
  set(7, cx - 0.22 * sw, noseY, headV);
  set(8, cx + 0.22 * sw, noseY, headV);
  // The dancer's own left side is the image's left on the raw frame (pose index 11 / 13 / 15).
  set(11, cx - sw / 2, sy);
  set(12, cx + sw / 2, sy);
  const elbowV = spec.elbows === false ? 0 : 1;
  const hand = (side: "l" | "r", wrist: { x: number; y: number } | null | undefined) => {
    const [sh, el, wr, pk, ix, th] = side === "l" ? [11, 13, 15, 17, 19, 21] : [12, 14, 16, 18, 20, 22];
    const sx = side === "l" ? cx - sw / 2 : cx + sw / 2;
    if (!wrist) {
      set(el, sx, sy + 0.65 * sw, elbowV);
      set(wr, sx, sy + 1.2 * sw, 0);
      return;
    }
    set(el, (sx + wrist.x) / 2 + (side === "l" ? -0.1 : 0.1) * sw, (sy + wrist.y) / 2 + 0.1 * sw, elbowV);
    set(wr, wrist.x, wrist.y);
    // The hand points continue the line from the forearm (shoulder -> wrist), a quarter of a shoulder width.
    const dx = wrist.x - sx;
    const dy = wrist.y - sy;
    const len = Math.hypot(dx, dy) || 1;
    const hl = (spec.handLen ?? 0.25) * sw;
    const ux = (dx / len) * hl;
    const uy = (dy / len) * hl;
    set(pk, wrist.x + ux - uy * 0.2, wrist.y + uy + ux * 0.2);
    set(ix, wrist.x + ux + uy * 0.2, wrist.y + uy - ux * 0.2);
    set(th, wrist.x + ux * 0.6, wrist.y + uy * 0.6);
    void sh;
  };
  hand("l", spec.leftWrist === undefined ? { x: cx - sw * 0.6, y: sy + 1.5 * sw } : spec.leftWrist);
  hand("r", spec.rightWrist === undefined ? { x: cx + sw * 0.6, y: sy + 1.5 * sw } : spec.rightWrist);
  return pts.map((p) => ({ x: p.x / W, y: p.y / H, visibility: p.v }));
}
