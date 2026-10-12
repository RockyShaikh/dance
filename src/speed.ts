/**
 * R5b: playback speed as pure functions. Two ways to change it:
 *  - HOLD the right thumbs up: 2x while held, back to the previous speed on release (holdSpeed.ts);
 *  - FINE speed: a left shaka puts the steering wheel in speed mode, and the wheel steps the speed in 0.05
 *    increments between 0.5x and 1.0x while the music keeps playing (so you hear it). 1.0 is a natural stop.
 * The keys `-` / `=` step the same 0.05, `0` resets to 1x, `T` still toggles 2x / 1x. The audio engine applies the
 * rate with the pitch preserved (audioPlayer.ts).
 */
import { SPEED } from "./config";

/** The toggle (the T key): from normal speed to the fast speed, and from anything else (fast or slowed) back to normal. */
export function toggleSpeed(rate: number): number {
  return rate === SPEED.normal ? SPEED.fast : SPEED.normal;
}

const EPS = 1e-9;

/** One 0.05 step up (dir +1) or down (-1) from `rate` to the next grid line (0.50, 0.55, ... 1.00) in that direction, kept to 0.5..1.0 (it stops at the ends; a faster rate than 1 comes back to 1). */
export function stepSpeed(rate: number, dir: 1 | -1): number {
  const cells = rate / SPEED.step;
  const next = dir > 0 ? Math.floor(cells + EPS) + 1 : Math.ceil(cells - EPS) - 1;
  return Number(Math.min(SPEED.max, Math.max(SPEED.min, next * SPEED.step)).toFixed(2));
}

/**
 * The speed wheel's accumulator: turning adds degrees, and every `stepDeg` of turn is one speed step (clockwise =
 * faster). Returns the whole steps to take now (signed) and the leftover turn. Pushing on against an end of the range
 * (`rate` is at 1.0 and the turn is upward, or at 0.5 and downward) takes nothing and keeps nothing, so no travel winds
 * up there and turning back leaves the end at once.
 */
export function wheelSteps(accumDeg: number, turnDeg: number, rate: number, stepDeg: number = SPEED.stepDeg): { steps: number; accumDeg: number } {
  const total = accumDeg + turnDeg;
  if ((rate >= SPEED.max - EPS && total > 0) || (rate <= SPEED.min + EPS && total < 0)) return { steps: 0, accumDeg: 0 };
  const steps = Math.trunc(total / stepDeg);
  return { steps, accumDeg: total - steps * stepDeg || 0 };
}

/** "2×", "0.75×", "1×". */
export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}
