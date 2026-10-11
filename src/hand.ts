/** Shared hand types and MediaPipe landmark indices. */

/**
 * A landmark in isotropic image space: x and y in pixels (x right, y down) and
 * z in the same pixel scale (smaller z = closer to the camera, as MediaPipe
 * reports it). Equal units on all axes keep distances and angles honest.
 */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Which of the dancer's own hands (not the mirrored on-screen side). */
export type Handedness = "Left" | "Right";

/** MediaPipe's 21 hand landmarks. */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const LANDMARK_COUNT = 21;

export function sub(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function len(v: Point3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function dist(a: Point3, b: Point3): number {
  return len(sub(a, b));
}

export function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Point3, b: Point3): Point3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
