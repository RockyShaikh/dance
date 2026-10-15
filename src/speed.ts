/**
 * R5: playback speed as pure functions. Speed is not a knob: a gesture toggles the whole track between
 * 2x and 1x, and `-` / `=` step through a few presets for slowing down. The audio engine applies the rate
 * with the pitch preserved (audioPlayer.ts).
 */
import { SPEED } from "./config";

/** The toggle: from normal speed to the fast speed, and from anything else (fast or slowed) back to normal. */
export function toggleSpeed(rate: number): number {
  return rate === SPEED.normal ? SPEED.fast : SPEED.normal;
}

/** One step along the presets: the next one above (dir +1) or below (dir -1) the current rate; stays at the ends. */
export function stepSpeed(rate: number, dir: 1 | -1): number {
  const steps = SPEED.steps;
  if (dir > 0) return steps.find((s) => s > rate + 1e-9) ?? steps[steps.length - 1];
  return [...steps].reverse().find((s) => s < rate - 1e-9) ?? steps[0];
}

/** "2×", "0.75×", "1×". */
export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}
