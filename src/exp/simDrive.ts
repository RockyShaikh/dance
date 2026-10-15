/**
 * EXP, DEV ONLY (imported dynamically under `import.meta.env.DEV` with `?exp=push&sim`): plays the scripted movements of
 * trajectories.ts into the running app in real time, so scripts/e2e/push.mjs can check the whole pipeline (hands, pose, bench,
 * recording) without a camera. The app sees the scene exactly as it would see the models' output.
 */
import { DEFAULT_NOISE, rng, sceneFrame, type NoiseSpec, type SceneFrame } from "./simScene";
import { trajectory, type TrajName, type TrajParams } from "./trajectories";

export interface PlayOptions {
  seed?: number;
  noise?: NoiseSpec | null;
  /** Milliseconds between scene updates (the app picks the latest one for each processed frame). */
  stepMs?: number;
}

export interface PlayResult {
  /** performance.now() when the movement began, and the scripted push times in seconds from then. */
  startedAt: number;
  truth: number[];
  durationSec: number;
}

/** `setScene` hands one frame of the scene to the app (hands + pose + world). */
export function makeDriver(setScene: (f: SceneFrame) => void) {
  return {
    async play(name: TrajName, params: TrajParams, o: PlayOptions = {}): Promise<PlayResult> {
      const traj = trajectory(name, params);
      const rand = rng(o.seed ?? 1);
      const noise = o.noise === undefined ? DEFAULT_NOISE : o.noise;
      const startedAt = performance.now();
      for (;;) {
        const t = (performance.now() - startedAt) / 1000;
        if (t > traj.durationSec) break;
        const scene = traj.at(t);
        if (noise) {
          scene.noise = noise;
          scene.rand = rand;
        }
        setScene(sceneFrame(scene));
        await new Promise((r) => setTimeout(r, o.stepMs ?? 16));
      }
      return { startedAt, truth: traj.truth, durationSec: traj.durationSec };
    },
  };
}
