/**
 * R8: where to crop, from body pose. Pure geometry (no model, no DOM).
 *
 * Pose landmarks are normalized to the FULL raw frame (x right, y down, un-mirrored). Everything is measured in isotropic pixels
 * (x * width, y * height) so a square is a square, then returned as a normalized `CropRect` in the same frame. Crops are
 * kept square where the frame allows it (drawn 1:1 into a square canvas by zoom.ts, so extra width costs nothing and gives
 * the hands room to move sideways); where the frame is smaller they hug its edge.
 *
 * Left / right here is the pose model's: on the raw, un-mirrored frame pose point 15 is the dancer's own left wrist.
 */
import { TRACK } from "./config";
import type { CropRect } from "./zoom";

/** One pose point: normalized to the frame, with the model's visibility (0..1; missing counts as visible). */
export interface PoseLm {
  x: number;
  y: number;
  visibility?: number;
}

/** The BlazePose indices used here. */
export const POSE = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
} as const;

export type WristSide = "left" | "right";

/** The pose indices of one arm. */
export const ARM = {
  left: { shoulder: POSE.LEFT_SHOULDER, otherShoulder: POSE.RIGHT_SHOULDER, elbow: POSE.LEFT_ELBOW, wrist: POSE.LEFT_WRIST, pinky: POSE.LEFT_PINKY, index: POSE.LEFT_INDEX, thumb: POSE.LEFT_THUMB },
  right: { shoulder: POSE.RIGHT_SHOULDER, otherShoulder: POSE.LEFT_SHOULDER, elbow: POSE.RIGHT_ELBOW, wrist: POSE.RIGHT_WRIST, pinky: POSE.RIGHT_PINKY, index: POSE.RIGHT_INDEX, thumb: POSE.RIGHT_THUMB },
} as const;

interface Px {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The point in pixels, or null if the pose is missing it or is not sure it is in view. */
function seen(pose: readonly PoseLm[], i: number, W: number, H: number, minVis: number): Px | null {
  const p = pose[i];
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  if ((p.visibility ?? 1) < minVis) return null;
  return { x: p.x * W, y: p.y * H };
}

const dist = (a: Px, b: Px) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Px, b: Px): Px => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * A `cw` x `ch` pixel crop centred on (`cx`, `cy`), pushed back inside the frame (never shrunk to fit unless the frame is
 * smaller than the crop), as a normalized rect.
 */
export function placeCrop(cx: number, cy: number, cw: number, ch: number, W: number, H: number): CropRect {
  const w = Math.min(cw, W);
  const h = Math.min(ch, H);
  const x0 = clamp(cx - w / 2, 0, W - w);
  const y0 = clamp(cy - h / 2, 0, H - h);
  return { x: x0 / W, y: y0 / H, w: w / W, h: h / H };
}

/** The wrist's own reference: the shoulder width in px (the one body size that pose sees at any arm pose), or null. */
function shoulderWidth(pose: readonly PoseLm[], W: number, H: number, minVis: number): number | null {
  const l = seen(pose, POSE.LEFT_SHOULDER, W, H, minVis);
  const r = seen(pose, POSE.RIGHT_SHOULDER, W, H, minVis);
  return l && r ? dist(l, r) : null;
}

/**
 * Person mode: the crop around head + shoulders + both hands (wrist, pinky, index, thumb points), with room above the head
 * for raised hands. Null when the pose has too little in view (nothing to frame).
 */
export function personCropRect(pose: readonly PoseLm[], W: number, H: number, cfg = TRACK.person, minVis = TRACK.minVisibility): CropRect | null {
  const pts: Px[] = [];
  const at = (i: number) => seen(pose, i, W, H, minVis);
  const head = [POSE.NOSE, POSE.LEFT_EYE, POSE.RIGHT_EYE, POSE.LEFT_EAR, POSE.RIGHT_EAR].map(at).filter((p): p is Px => p !== null);
  const shoulders = [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER].map(at).filter((p): p is Px => p !== null);
  const hands: Px[] = [];
  for (const i of [POSE.LEFT_WRIST, POSE.LEFT_PINKY, POSE.LEFT_INDEX, POSE.LEFT_THUMB, POSE.RIGHT_WRIST, POSE.RIGHT_PINKY, POSE.RIGHT_INDEX, POSE.RIGHT_THUMB]) {
    const p = at(i);
    if (p) hands.push(p);
  }
  if (head.length + shoulders.length + hands.length === 0) return null;
  pts.push(...head, ...shoulders, ...hands);

  // The body unit: the shoulder width; failing that the head's width (ears) or height scale; failing that a default.
  const sw = shoulderWidth(pose, W, H, minVis);
  const ears = [at(POSE.LEFT_EAR), at(POSE.RIGHT_EAR)];
  const unit = sw ?? (ears[0] && ears[1] ? dist(ears[0], ears[1]) * 2.4 : 0.2 * H);

  // Room above the head: the top of the head is about 0.35 units above the eyes (0.5 above the nose), then the head room on top.
  if (head.length > 0) {
    const eyes = [at(POSE.LEFT_EYE), at(POSE.RIGHT_EYE)].filter((p): p is Px => p !== null);
    const top = eyes.length > 0 ? Math.min(...eyes.map((p) => p.y)) - 0.35 * unit : Math.min(...head.map((p) => p.y)) - 0.5 * unit;
    const hx = head.reduce((s, p) => s + p.x, 0) / head.length;
    pts.push({ x: hx, y: top - cfg.headRoomUnits * unit });
  } else if (shoulders.length > 0) {
    // No head in view: leave the same room above the shoulders (head plus head room).
    const sy = Math.min(...shoulders.map((p) => p.y));
    const sx = shoulders.reduce((s, p) => s + p.x, 0) / shoulders.length;
    pts.push({ x: sx, y: sy - (0.9 + cfg.headRoomUnits) * unit });
  }

  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const long = Math.max(maxX - minX, maxY - minY);
  const pad = cfg.marginFrac * long + (hands.length > 0 ? cfg.handReachUnits * unit : 0);
  const side = clamp(long + 2 * pad, cfg.minSideFrac * H, Math.max(W, H));
  return placeCrop((minX + maxX) / 2, (minY + maxY) / 2, side, side, W, H);
}

/** One wrist's crop, and where the pose says the wrist is (full frame, normalized): the anchor the model's hand must be near. */
export interface WristCrop {
  rect: CropRect;
  anchor: { x: number; y: number };
}

/**
 * Wrists mode: a square crop around one hand, centred a little past the wrist toward the knuckles (the pose's index and pinky
 * points), sized from the forearm, the shoulder width or the pose's hand length (the largest, clamped): the pose's hand points
 * are noisy at distance, the arm is not. Null when the pose does not see that wrist.
 */
export function wristCrop(pose: readonly PoseLm[], side: WristSide, W: number, H: number, cfg = TRACK.wrist): WristCrop | null {
  const a = ARM[side];
  const wrist = seen(pose, a.wrist, W, H, cfg.minVisibility);
  if (!wrist) return null;
  const minVis = TRACK.minVisibility;
  const index = seen(pose, a.index, W, H, minVis);
  const pinky = seen(pose, a.pinky, W, H, minVis);
  const elbow = seen(pose, a.elbow, W, H, minVis);
  const sw = shoulderWidth(pose, W, H, minVis);

  const knuckles = index && pinky ? mid(index, pinky) : (index ?? pinky);
  const handLen = knuckles ? dist(wrist, knuckles) : null;
  const forearm = elbow ? dist(wrist, elbow) : null;

  let centre = wrist;
  if (knuckles) {
    centre = { x: wrist.x + (knuckles.x - wrist.x) * cfg.handShift, y: wrist.y + (knuckles.y - wrist.y) * cfg.handShift };
  } else if (elbow && forearm && forearm > 0) {
    // No hand points: the hand lies along the forearm, a bit under half its length past the wrist.
    centre = { x: wrist.x + ((wrist.x - elbow.x) / forearm) * 0.35 * forearm, y: wrist.y + ((wrist.y - elbow.y) / forearm) * 0.35 * forearm };
  }

  const terms: number[] = [];
  if (forearm) terms.push(cfg.forearmFactor * forearm);
  if (sw) terms.push(cfg.shoulderFactor * sw);
  if (handLen) terms.push(cfg.handFactor * handLen);
  const wanted = terms.length > 0 ? Math.max(...terms) : cfg.fallbackSideFrac * H;
  const side_ = clamp(wanted, cfg.minSideFrac * H, Math.min(cfg.maxSideFrac * H, W, H));
  return { rect: placeCrop(centre.x, centre.y, side_, side_, W, H), anchor: { x: wrist.x / W, y: wrist.y / H } };
}

/** Which wrists the pose sees at all (visibility above the wrist threshold): the "visible wrist" the detection-rate counter divides by. */
export function visibleWrists(pose: readonly PoseLm[] | null, cfg = TRACK.wrist): WristSide[] {
  if (!pose) return [];
  return (["left", "right"] as const).filter((s) => (pose[ARM[s].wrist]?.visibility ?? 1) >= cfg.minVisibility && Number.isFinite(pose[ARM[s].wrist]?.x));
}
