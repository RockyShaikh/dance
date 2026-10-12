import { LANDMARK_COUNT, type Handedness, type Point3 } from "../hand";
import type { PseudoChord } from "../pseudoChord";

/**
 * Hand-written landmark fixtures for the unit tests.
 *
 * A hand is laid out by hand in its own frame, for the dancer's RIGHT hand with
 * the palm toward the camera and the fingers up (as an un-mirrored camera sees
 * it): x to the right of the image, v up the image, w away from the camera.
 * Units: the wrist to middle-knuckle distance is 100.
 * `makeHand` then turns it over (yaw), mirrors it for a left hand, rolls it in
 * the image plane and scales it, and returns landmarks in image space
 * (x right, y down, z away; smaller z = closer), like the app feeds the features.
 */

type V3 = [x: number, v: number, w: number];

const WRIST: V3 = [0, 0, 0];
const THUMB_CMC: V3 = [15, 10, 0];

/** Thumb joints: MCP, IP, TIP. */
const THUMB_OUT: V3[] = [
  [40, 33, 0],
  [64, 48, 0],
  [84, 58, 0],
];
/** Thumb folded in across the palm. */
const THUMB_TUCKED: V3[] = [
  [38, 34, 0],
  [30, 56, -10],
  [14, 68, -14],
];

interface FingerDef {
  mcp: V3;
  /** Segment lengths MCP->PIP, PIP->DIP, DIP->TIP. */
  lens: [number, number, number];
  /** Sideways splay of the finger, degrees from straight up (+ = toward the thumb). */
  splayDeg: number;
}

const FINGER_DEFS: Record<"I" | "M" | "R" | "P", FingerDef> = {
  I: { mcp: [28, 98, 0], lens: [40, 24, 19], splayDeg: 4 },
  M: { mcp: [5, 100, 0], lens: [44, 27, 20], splayDeg: 0 },
  R: { mcp: [-16, 94, 0], lens: [40, 25, 19], splayDeg: -4 },
  P: { mcp: [-36, 84, 0], lens: [32, 19, 16], splayDeg: -9 },
};

/** Cumulative bend of each segment away from the finger's straight line, toward the camera. */
const BEND_STRAIGHT = [0, 0, 0];
const BEND_CURLED = [30, 100, 170];

const rad = (deg: number) => (deg * Math.PI) / 180;

function finger(def: FingerDef, extended: boolean, curl?: number): V3[] {
  // `curl` (0 = straight, 1 = fully curled) overrides the extended flag, for half-curled "claw" fingers.
  const bends = curl !== undefined ? BEND_CURLED.map((b) => b * curl) : extended ? BEND_STRAIGHT : BEND_CURLED;
  const s = rad(def.splayDeg);
  const pts: V3[] = [];
  let [x, v, w] = def.mcp;
  pts.push([x, v, w]);
  for (let i = 0; i < 3; i++) {
    const th = rad(bends[i]);
    const len = def.lens[i];
    x += len * Math.sin(s) * Math.cos(th);
    v += len * Math.cos(s) * Math.cos(th);
    w += len * -Math.sin(th);
    pts.push([x, v, w]);
  }
  return pts; // MCP, PIP, DIP, TIP
}

export interface HandSpec {
  /** The dancer's own hand. */
  hand: Handedness;
  fingers: PseudoChord;
  /** Turn about the vertical axis in degrees: 0 = palm to camera, 180 = back of hand, ~80 = side-on. */
  yawDeg?: number;
  /** Rotation in the image plane, degrees. */
  rollDeg?: number;
  /** Curl all four fingers by this fraction (0 = straight, 1 = fist), ignoring `fingers` for them. */
  curl?: number;
  /** Size relative to the 100-unit hand. */
  scale?: number;
  /** Where the wrist lands in the image. */
  at?: { x: number; y: number };
}

export function makeHand(spec: HandSpec): Point3[] {
  const { hand, fingers, curl, yawDeg = 0, rollDeg = 0, scale = 3, at = { x: 640, y: 560 } } = spec;

  const local: V3[] = [WRIST, THUMB_CMC, ...(fingers.T ? THUMB_OUT : THUMB_TUCKED)];
  for (const k of ["I", "M", "R", "P"] as const) {
    local.push(...finger(FINGER_DEFS[k], fingers[k], curl));
  }

  const yaw = rad(yawDeg);
  const roll = rad(rollDeg);
  const out = local.map(([x0, v0, w0]): Point3 => {
    // Turn about the vertical axis.
    let x = x0 * Math.cos(yaw) + w0 * Math.sin(yaw);
    const w = -x0 * Math.sin(yaw) + w0 * Math.cos(yaw);
    // A left hand is the mirror image of a right hand.
    if (hand === "Left") x = -x;
    // To image axes (y down), then roll in the image plane.
    const y = -v0;
    const xr = x * Math.cos(roll) - y * Math.sin(roll);
    const yr = x * Math.sin(roll) + y * Math.cos(roll);
    return { x: at.x + xr * scale, y: at.y + yr * scale, z: w * scale };
  });
  if (out.length !== LANDMARK_COUNT) throw new Error("fixture must have 21 landmarks");
  return out;
}

const chord = (bits: string): PseudoChord => ({
  T: bits[0] === "1",
  I: bits[1] === "1",
  M: bits[2] === "1",
  R: bits[3] === "1",
  P: bits[4] === "1",
});

/** Named shapes, palm toward the camera, upright, for either hand. */
export const shapes = {
  openPalm: (hand: Handedness, o: Partial<HandSpec> = {}) => makeHand({ hand, fingers: chord("11111"), ...o }),
  fist: (hand: Handedness, o: Partial<HandSpec> = {}) => makeHand({ hand, fingers: chord("00000"), ...o }),
  indexUp: (hand: Handedness, o: Partial<HandSpec> = {}) => makeHand({ hand, fingers: chord("01000"), ...o }),
  victory: (hand: Handedness, o: Partial<HandSpec> = {}) => makeHand({ hand, fingers: chord("01100"), ...o }),
  thumbOut: (hand: Handedness, o: Partial<HandSpec> = {}) => makeHand({ hand, fingers: chord("10000"), ...o }),
  shaka: (hand: Handedness, o: Partial<HandSpec> = {}) => makeHand({ hand, fingers: chord("10001"), ...o }),
};

export { chord };
