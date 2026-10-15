/**
 * EXP, TEST / DEV ONLY: runs a scripted movement (trajectories.ts) through the whole push pipeline without a browser: the scene's
 * hand goes through the real hand analysis (`simReading`), the pose through the real signal code, and the detectors give the events.
 */
import { simReading, SIM_SIZE } from "../sim";
import { DEFAULT_PUSH, PushTracker, type PushEvent, type PushSettings } from "./pushTracker";
import { handInput, type PushSample } from "./pushSignals";
import { DEFAULT_NOISE, rng, sceneFrame, type NoiseSpec } from "./simScene";
import type { Trajectory } from "./trajectories";

export interface RunResult {
  events: PushEvent[];
  samples: PushSample[];
}

export function runTrajectory(traj: Trajectory, o: { fps?: number; seed?: number; noise?: NoiseSpec | null; settings?: PushSettings } = {}): RunResult {
  const fps = o.fps ?? 30;
  const rand = rng(o.seed ?? 1);
  const noise = o.noise === undefined ? DEFAULT_NOISE : o.noise;
  const tracker = new PushTracker(() => o.settings ?? DEFAULT_PUSH);
  const events: PushEvent[] = [];
  const samples: PushSample[] = [];
  const frames = Math.round(traj.durationSec * fps);
  for (let i = 0; i <= frames; i++) {
    const tMs = (i * 1000) / fps + 1000; // the clock does not start at 0 (a gap rule must not care)
    const scene = traj.at(i / fps);
    if (noise) {
      scene.noise = noise;
      scene.rand = rand;
    }
    const frame = sceneFrame(scene);
    const reading = simReading(frame.hands[0]);
    const { input } = handInput(reading, frame.pose, frame.world, SIM_SIZE.width, SIM_SIZE.height, tMs);
    const step = tracker.step(tMs, input);
    if (step.sample) samples.push(step.sample);
    for (const e of step.events) events.push({ ...e, t: e.t - 1000, t0: e.t0 - 1000, peakT: e.peakT - 1000 });
  }
  return { events, samples };
}

/** How many pushes a run found for one signal, against the scripted truth: a detection within [-0.2 s, +1.0 s] of a true push start counts as that push. */
export function score(events: readonly PushEvent[], signal: PushEvent["signal"], truthSec: readonly number[]): { hits: number; misses: number; falsePushes: number; rejects: number } {
  const pushes = events.filter((e) => e.signal === signal && e.kind === "push");
  const used = new Set<number>();
  let hits = 0;
  for (const t0 of truthSec) {
    const idx = pushes.findIndex((e, i) => !used.has(i) && e.t0 / 1000 >= t0 - 0.2 && e.t0 / 1000 <= t0 + 1.0);
    if (idx >= 0) {
      used.add(idx);
      hits++;
    }
  }
  return { hits, misses: truthSec.length - hits, falsePushes: pushes.length - used.size, rejects: events.filter((e) => e.signal === signal && e.kind === "reject").length };
}
