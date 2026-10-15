/**
 * EXP, DEV ONLY (used by `?exp=push&sim` and the tests): a tiny physical scene to drive the push bench without a camera.
 *
 * A dancer stands `bodyDist` metres from a pinhole camera; the arm's wrist is placed in metres relative to its shoulder; the scene
 * is projected to the picture and gives back what the real pipeline would: the hand (as a `SimHand`, sized by perspective), the
 * pose points (with z) and the pose world points. The elbow comes from two-bone IK (upper arm 0.30 m, forearm 0.27 m), so
 * pushing the wrist toward the camera really shortens the forearm in 2D.
 *
 * It validates the LOGIC (that the signals and the detector respond the way the physics says). What a real pose model and hand
 * model do with a real arm (noise, lag, the lite pose model's depth) is exactly what the recordings are for.
 */
import type { PoseLm } from "../poseCrop";
import { makeHand } from "../test/fixtures";
import type { SimHand } from "../sim";
import type { WorldLm } from "./pushSignals";
import { handSizePx } from "./pushSignals";

export interface Scene {
  /** Distance from the camera to the body, metres. */
  bodyDist: number;
  /** Body centre (shoulder middle) in display-normalized x and y. Defaults 0.5 and 0.5. */
  bodyX?: number;
  shoulderY?: number;
  /** The wrist in metres relative to the arm's shoulder: x to the right on the display, y up, z toward the camera. */
  wrist: { x: number; y: number; z: number };
  /** The elbow in the same terms; when omitted it comes from two-bone IK (a fixed elbow lets a push be a forearm swinging forward, as a "stop" hand does). */
  elbow?: { x: number; y: number; z: number };
  shape?: string;
  /** Per-frame noise of the models, drawn from `rand` (both needed for any noise). */
  noise?: NoiseSpec;
  rand?: () => number;
  /** The picture, default 1280 x 720. */
  W?: number;
  H?: number;
  /** Focal length in pixels for a 1280-wide picture (about a 65 degree lens). Default 1000. */
  focal?: number;
}

/** A small seeded generator (mulberry32) so the runs are repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A normally distributed number from a uniform generator (Box-Muller). */
export function gauss(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export interface NoiseSpec {
  /** Standard deviation of the hand-size multiplier (0.02 = 2%). */
  size: number;
  /** Palm position noise, display-normalized. */
  palm: number;
  /** Pose point noise, pixels of a 1280-wide picture, independent per point and frame. */
  posePx: number;
  /** Pose world-z noise, metres per metre of distance to the camera (the lite model's depth gets worse the further away the person is). */
  depthPerM: number;
}

/** What the sim runs assume of the models: a hand size good to 2%, a palm position to 2.5 px, pose points to 1.5 px, pose depth to 1.5 cm per metre of distance. An assumption, not a measurement: the recordings replace it. */
export const DEFAULT_NOISE: NoiseSpec = { size: 0.02, palm: 0.002, posePx: 1.5, depthPerM: 0.015 };

const SHOULDER_W = 0.4;
const UPPER = 0.3;
const FORE = 0.27;
/** A real hand: palm width 0.085 m, wrist to middle fingertip 0.19 m. */
const HAND_DIAG_M = Math.hypot(0.085, 0.19);

interface V3 {
  x: number;
  y: number;
  z: number;
}
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: V3) => Math.hypot(a.x, a.y, a.z);

/** The elbow of a two-bone arm from shoulder to wrist, bending down, out and a little back. */
export function elbowOf(shoulder: V3, wrist: V3): V3 {
  const d = sub(wrist, shoulder);
  const L = Math.max(1e-6, norm(d));
  const Lc = Math.min(UPPER + FORE - 1e-3, Math.max(Math.abs(UPPER - FORE) + 1e-3, L));
  const axis = mul(d, 1 / L);
  const a = (Lc * Lc + UPPER * UPPER - FORE * FORE) / (2 * Lc);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  let pole: V3 = { x: 0.4, y: -1, z: -0.3 };
  pole = sub(pole, mul(axis, dot(pole, axis)));
  pole = mul(pole, 1 / (norm(pole) || 1));
  return add(shoulder, add(mul(axis, a), mul(pole, h)));
}

let unitPx: number | null = null;
/** The size (handSizePx) of the fixture hand at scale 1, in a 1280-wide picture, to turn a wanted pixel size into the fixture's `scale`. */
function fixtureUnitPx(): number {
  if (unitPx === null) {
    const pts = makeHand({ hand: "Right", fingers: { T: true, I: true, M: true, R: true, P: true }, scale: 1, at: { x: 0, y: 0 } });
    unitPx = handSizePx(pts.map((p) => ({ x: p.x / 1280, y: p.y / 720, z: 0, visibility: 1 })), 1280, 720);
  }
  return unitPx;
}

export interface SceneFrame {
  hands: SimHand[];
  pose: PoseLm[];
  world: WorldLm[];
  /** For the tests: the wrist and hand size in pixels, the shoulder width in pixels. */
  truth: { handPx: number; shoulderPx: number; forearmPx: number };
}

/** One frame of the scene. */
export function sceneFrame(scene: Scene): SceneFrame {
  const W = scene.W ?? 1280;
  const H = scene.H ?? 720;
  const f = (scene.focal ?? 1000) * (W / 1280);
  const bodyX = (scene.bodyX ?? 0.5) * W; // display px
  const shoulderYpx = (scene.shoulderY ?? 0.5) * H;

  // Body coordinates: X to the display's right, Y up, Z toward the camera, origin at the middle of the shoulders.
  const project = (p: V3): { x: number; y: number } => {
    const k = f / (scene.bodyDist - p.z);
    return { x: bodyX + p.x * k, y: shoulderYpx - p.y * k };
  };
  const toRaw = (p: V3): { x: number; y: number; z: number } => {
    const q = project(p);
    // The raw frame is the mirror of the display; the pose z is in the picture's own scale, nearer = smaller.
    const px = n?.spec.posePx ?? 0;
    return { x: (W - q.x + g(px)) / W, y: (q.y + g(px)) / H, z: (-p.z * (f / scene.bodyDist)) / W };
  };
  const n = scene.noise && scene.rand ? { spec: scene.noise, rand: scene.rand } : null;
  const g = (sd: number): number => (n ? gauss(n.rand) * sd : 0);
  const world = (p: V3, vis = 1): WorldLm => ({ x: -p.x, y: -p.y, z: -p.z + g((n?.spec.depthPerM ?? 0) * scene.bodyDist), visibility: vis });

  // The active arm is the display-right one (the dancer's right, as in a mirror); the pose labels it whichever way: only positions matter.
  const sR: V3 = { x: SHOULDER_W / 2, y: 0, z: 0 };
  const sL: V3 = { x: -SHOULDER_W / 2, y: 0, z: 0 };
  const wristTrue: V3 = add(sR, scene.wrist);
  const elbow = scene.elbow ? add(sR, scene.elbow) : elbowOf(sR, wristTrue);
  const restL: V3 = { x: -SHOULDER_W / 2 - 0.05, y: -0.55, z: 0.05 };
  const elbowL = elbowOf(sL, restL);

  const pts: { raw: { x: number; y: number; z: number }; w: WorldLm; v: number }[] = Array.from({ length: 33 }, () => ({ raw: { x: 0.5, y: 0.5, z: 0 }, w: { x: 0, y: 0, z: 0, visibility: 0 }, v: 0 }));
  const set = (i: number, p: V3) => (pts[i] = { raw: toRaw(p), w: world(p), v: 1 });
  set(0, { x: 0, y: 0.22, z: 0.05 });
  set(2, { x: 0.035, y: 0.26, z: 0.04 });
  set(5, { x: -0.035, y: 0.26, z: 0.04 });
  set(11, sR); // raw-left on the picture is the dancer's displayed right, see armOfHand: no label is relied on
  set(12, sL);
  set(13, elbow);
  set(14, elbowL);
  set(15, wristTrue);
  set(16, restL);
  set(23, { x: 0.1, y: -0.5, z: 0 });
  set(24, { x: -0.1, y: -0.5, z: 0 });
  const pose: PoseLm[] = pts.map((p) => ({ x: p.raw.x, y: p.raw.y, z: p.raw.z, visibility: p.v }));

  const wp = project(wristTrue);
  const handPx = ((f * HAND_DIAG_M) / (scene.bodyDist - wristTrue.z)) * (1 + g(n?.spec.size ?? 0));
  // The palm centre sits about a third of a hand length above the wrist in the picture.
  const palmUp = (f * 0.08) / (scene.bodyDist - wristTrue.z);
  const hand: SimHand = {
    shape: scene.shape ?? "Open_Palm",
    hand: "Right",
    palm: { x: wp.x / W + g(n?.spec.palm ?? 0), y: (wp.y - palmUp) / H + g(n?.spec.palm ?? 0) },
    scale: (handPx / fixtureUnitPx()) * (1280 / W),
  };
  const e = project(elbow);
  return { hands: [hand], pose, world: pts.map((p) => p.w), truth: { handPx, shoulderPx: (SHOULDER_W * f) / scene.bodyDist, forearmPx: Math.hypot(e.x - wp.x, e.y - wp.y) } };
}
