/**
 * EXP, DEV / TEST ONLY: scripted movements for the scene (simScene.ts): a true push, a slow approach and a dance arm swing. Used by the
 * tests (offline, no browser) and by the `?exp=push&sim` driver in the page (scripts/e2e/push.mjs), so both run the same movements.
 */
import type { Scene } from "./simScene";

export type TrajName = "push" | "slow" | "swing" | "rest";

export interface TrajParams {
  /** Body distance from the camera, metres. */
  dist: number;
  /** How far the push moves the wrist toward the camera, metres (default 0.25: an arm folded at the shoulder has room for about that). */
  dz?: number;
  /** The hand's height above the shoulders, metres (default 0.45: just above the head). */
  y?: number;
  /** Shoulder height in the picture, display-normalized (default 0.55). */
  shoulderY?: number;
  /** The hand shape label. */
  shape?: string;
}

export interface Trajectory {
  durationSec: number;
  /** Times (s) at which a push really starts (for scoring). */
  truth: number[];
  at(t: number): Scene;
}

/** Minimum-jerk 0..1 (a natural point-to-point movement). */
const minJerk = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return 10 * x ** 3 - 15 * x ** 4 + 6 * x ** 5;
};

export function trajectory(name: TrajName, p: TrajParams): Trajectory {
  const y0 = p.y ?? 0.45;
  const base = (): Scene => ({ bodyDist: p.dist, shoulderY: p.shoulderY ?? 0.55, wrist: { x: 0.05, y: y0, z: 0 }, shape: p.shape });
  switch (name) {
    case "rest":
      return { durationSec: 3, truth: [], at: () => base() };
    case "push": {
      // A "stop" hand: the elbow stays put and the forearm swings forward from nearly upright, the palm to the camera. 200 ms out, 300 ms
      // held, a 500 ms return; three pushes two seconds apart, so a take has several. `dz` is how far the wrist ends up toward the camera.
      const dz = p.dz ?? 0.18;
      const E = { x: 0.22, y: 0.2, z: 0.02 };
      const FORE = 0.27;
      const phi0 = (15 * Math.PI) / 180;
      const phi1 = Math.asin(Math.min(0.98, Math.sin(phi0) + dz / FORE));
      const one = (t: number) => (t < 0 ? 0 : t < 0.2 ? minJerk(t / 0.2) : t < 0.5 ? 1 : t < 1.0 ? 1 - minJerk((t - 0.5) / 0.5) : 0);
      const starts = [1, 3, 5];
      return {
        durationSec: 7,
        truth: starts,
        at: (t) => {
          const u = starts.reduce((m, t0) => Math.max(m, one(t - t0)), 0);
          const phi = phi0 + (phi1 - phi0) * u;
          const s = base();
          s.elbow = { ...E };
          s.wrist = { x: E.x, y: E.y + FORE * Math.cos(phi), z: E.z + FORE * Math.sin(phi) - FORE * Math.sin(phi0) };
          return s;
        },
      };
    }
    case "slow": {
      // Walking toward the camera by 0.6 m over 3 s while the arm slowly comes forward by 0.25 m: a slow approach.
      return {
        durationSec: 4,
        truth: [],
        at: (t) => {
          const s = base();
          const u = Math.min(1, t / 3);
          s.bodyDist = p.dist - 0.6 * u;
          s.wrist.z = 0.25 * u;
          return s;
        },
      };
    }
    case "swing": {
      // A dance arm swing: the hand sweeps 0.3 m to each side at 1.5 Hz, bobbing, and the arm swings in an arc that takes it 0.15 m toward and away from the camera.
      const f = 1.5;
      const w = 2 * Math.PI * f;
      return {
        durationSec: 5,
        truth: [],
        at: (t) => {
          const s = base();
          s.wrist = { x: 0.05 + 0.3 * Math.sin(w * t), y: y0 + 0.1 * Math.sin(2 * w * t), z: 0.15 * Math.sin(w * t + 1) };
          return s;
        },
      };
    }
  }
}
