/**
 * Per-hand commands (R4b two-hand scheme). Each of the dancer's hands has its own command box and its
 * own classifier, so a shape counts only when THAT hand's palm centre is in THAT hand's box. Hands are
 * told apart by the model's handedness label (verified correct with `swapHandedness: false`).
 *
 * This is two instances of the R2 classifier (commands.ts) side by side, plus two rules:
 *  - one command at a time: when one hand fires, the other hand's classifier is on cooldown too;
 *  - suppression is per hand (`suppress`): the steering hand's commands are blocked while the knob is
 *    grabbed, and a hand can be switched off altogether (the left hand's marks, while the two-hand
 *    clutch uses it as the modifier).
 * Pure reducer, no DOM, no clock.
 */
import type { Box } from "./box";
import { INITIAL_STATE, stepCommands, type FireEvent, type HandObs, type MachineState, type MachineView } from "./commands";
import type { CommandConfig } from "./config";
import type { Handedness } from "./hand";

export const HANDS: readonly Handedness[] = ["Right", "Left"];

/** A detected hand as the command classifier sees it. */
export interface HandCmdObs extends HandObs {
  hand: Handedness;
}

export interface HandFire extends FireEvent {
  hand: Handedness;
}

export type HandMachines = Record<Handedness, MachineState>;

export const INITIAL_MACHINES: HandMachines = { Left: INITIAL_STATE, Right: INITIAL_STATE };

export interface HandStepInput {
  /** Milliseconds, must not go backwards. */
  t: number;
  hands: readonly HandCmdObs[];
  /** Each hand's own box. */
  boxes: Record<Handedness, Box>;
  aspect?: number;
  /** A hand whose commands are blocked this frame (knob grabbed with it, or switched off). */
  suppress: Record<Handedness, boolean>;
}

export interface HandStepResult {
  state: HandMachines;
  /** Everything that fired on this frame (almost always zero or one). */
  fired: HandFire[];
  views: Record<Handedness, MachineView>;
}

export function stepHandCommands(prev: HandMachines, input: HandStepInput, cfg: CommandConfig): HandStepResult {
  const state = { ...prev };
  const views = {} as Record<Handedness, MachineView>;
  const fired: HandFire[] = [];
  for (const h of HANDS) {
    const r = stepCommands(
      prev[h],
      { t: input.t, hands: input.hands.filter((o) => o.hand === h), box: input.boxes[h], aspect: input.aspect, suppress: input.suppress[h] },
      cfg,
    );
    state[h] = r.state;
    views[h] = r.view;
    if (r.fired) fired.push({ ...r.fired, hand: h });
  }
  // One command at a time: whichever hand fired, the other cools down as well.
  if (fired.length > 0) {
    for (const h of HANDS) {
      if (fired.some((f) => f.hand === h)) continue;
      state[h] = { ...state[h], cooldownUntil: Math.max(state[h].cooldownUntil, input.t + cfg.cooldownMs) };
    }
  }
  return { state, fired, views };
}
