/**
 * The command classifier: turns a stream of hand observations into deliberate
 * commands (docs/spec.md sections 4.2 and 4.4). A pure reducer, no DOM, no clock:
 * the caller passes the time with every frame, so the tests can replay synthetic
 * frame sequences.
 *
 * No gesture depends on how long it is held (user, R4: "no button that is variable
 * based off how long you are holding it"): a shape is held until its ring fills,
 * and the command fires right then. Nothing waits for the release.
 *
 * Flow for one shape:
 *
 *   idle --(command shape, palm facing, palm centre in the box)--> dwell
 *   dwell --(held for dwellMs)--> fires, once --> spent
 *   spent: fired already; nothing more happens until the shape is released
 *
 * After any fire, `cooldownMs` must pass before a new dwell can start.
 */
import { contains, type Box, type Vec2 } from "./box";
import type { CommandConfig } from "./config";
import type { PseudoChord } from "./pseudoChord";

/** What the classifier needs to know about one detected hand. */
export interface HandObs {
  /** MediaPipe Gesture Recognizer label, e.g. "Victory", or "None". */
  shape: string;
  shapeScore: number;
  palmFacing: boolean;
  /** Palm centre in display-normalized coordinates (see box.ts). */
  palm: Vec2;
  /**
   * R4d: which fingers are out (pseudoChord.ts). When given, the fist and the thumbs up must agree with it
   * (see `chordAgrees`); the model confuses those two. Left out (the older tests), no check is made.
   */
  chord?: PseudoChord;
}

/**
 * R4d guard against the model's most common confusion: a closed fist read as a thumbs up and the other way round.
 * The label counts only if the thumb-extension chord agrees: a fist has no finger out and the thumb in; a thumbs up
 * has the thumb out and the four fingers curled. Other shapes are not checked here.
 */
export function chordAgrees(shape: string, chord: PseudoChord | undefined): boolean {
  if (!chord) return true;
  const fingersIn = !chord.I && !chord.M && !chord.R && !chord.P;
  if (shape === "Closed_Fist") return fingersIn && !chord.T;
  if (shape === "Thumb_Up") return fingersIn && chord.T;
  return true;
}

export interface FireEvent {
  /** Time of the frame it fired on, same clock as the input. */
  t: number;
  shape: string;
}

export type Phase = "idle" | "dwell" | "spent";

/** Why a hand showing a command shape is not counting right now. */
export type BlockReason = "outside box" | "two hands" | "low confidence" | "palm not facing" | "fingers disagree";

export interface MachineState {
  phase: Phase;
  /** The shape being tracked (null when idle). */
  shape: string | null;
  /** When the current dwell began. */
  since: number;
  /** Last time the tracked shape was seen counting. */
  lastSeen: number;
  /** Palm position when the dwell began (for the optional stillness rule). */
  anchor: Vec2 | null;
  /** No new dwell may start before this time. */
  cooldownUntil: number;
}

export const INITIAL_STATE: MachineState = {
  phase: "idle",
  shape: null,
  since: 0,
  lastSeen: 0,
  anchor: null,
  cooldownUntil: 0,
};

export interface StepInput {
  /** Milliseconds, must not go backwards. */
  t: number;
  hands: readonly HandObs[];
  box: Box;
  /** Frame width / height, to measure the stillness drift in equal units. Default 16:9. */
  aspect?: number;
  /**
   * R4b: the knob is grabbed, so no command may fire (the two-hand modifier is an open palm, and a
   * claw can read as one). The machine drops to idle WITHOUT firing (an armed tap is discarded), and
   * stays blocked for `suppressCooldownMs` after the grab ends.
   */
  suppress?: boolean;
}

/** What the UI shows: the ring progress, the state, and why a hand isn't counting. */
export interface MachineView {
  phase: Phase;
  /** The tracked shape, or null. */
  shape: string | null;
  /** The shape currently counting (in the box, facing, confident), even before a dwell starts. */
  seen: string | null;
  /** Why a command shape in view isn't counting; null when nothing is blocked. */
  blocked: BlockReason | null;
  /** Inner ring, 0..1. */
  progress: number;
  /** Seconds of dwell elapsed / needed, for text. */
  elapsedMs: number;
  cooldownLeftMs: number;
  /** Where to draw the ring (display-normalized): the tracked hand's palm centre. */
  palm: Vec2 | null;
}

export interface StepResult {
  state: MachineState;
  fired: FireEvent | null;
  view: MachineView;
}

interface Evaluation {
  hand: HandObs | null;
  /** Command shape in view but blocked. */
  blocked: BlockReason | null;
}

/**
 * Which hand, if any, may command right now. Only hands showing a command shape
 * are considered; they must have their palm centre inside the box. If two hands
 * both show a command shape in the box, neither counts (one hand at a time).
 */
export function evaluateHands(hands: readonly HandObs[], box: Box, cfg: CommandConfig): Evaluation {
  const cmd = hands.filter((h) => cfg.shapes.includes(h.shape));
  if (cmd.length === 0) return { hand: null, blocked: null };
  const inBox = cmd.filter((h) => contains(box, h.palm));
  if (inBox.length === 0) return { hand: null, blocked: "outside box" };
  if (inBox.length > 1) return { hand: null, blocked: "two hands" };
  const hand = inBox[0];
  if (hand.shapeScore < cfg.minShapeScore) return { hand: null, blocked: "low confidence" };
  // A thumbs up shows the back of the fingers, not the palm: the facing rule does not apply to it.
  if (cfg.requirePalmFacing && !hand.palmFacing && !cfg.palmFacingExempt.includes(hand.shape)) return { hand: null, blocked: "palm not facing" };
  if (!chordAgrees(hand.shape, hand.chord)) return { hand: null, blocked: "fingers disagree" };
  return { hand, blocked: null };
}

function drift(a: Vec2, b: Vec2, aspect: number): number {
  // Equal units: x scaled by width/height so the result is a fraction of the frame height.
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/** One frame. Returns the next state, the command that fired on this frame (if any), and the view. */
export function stepCommands(prev: MachineState, input: StepInput, cfg: CommandConfig): StepResult {
  const { t, box } = input;
  const aspect = input.aspect ?? 16 / 9;
  if (input.suppress) {
    const idle: MachineState = { ...INITIAL_STATE, cooldownUntil: Math.max(prev.cooldownUntil, t + cfg.suppressCooldownMs) };
    const none: Evaluation = { hand: null, blocked: null };
    return { state: idle, fired: null, view: makeView(idle, t, null, none, { ...input, hands: [] }, cfg) };
  }
  const ev = evaluateHands(input.hands, box, cfg);
  const seenShape = ev.hand?.shape ?? null;
  const s: MachineState = { ...prev };
  let fired: FireEvent | null = null;

  const fire = (): void => {
    fired = { t, shape: s.shape as string };
    s.cooldownUntil = t + cfg.cooldownMs;
  };

  const tracked = s.shape !== null && seenShape === s.shape;
  if (tracked) s.lastSeen = t;

  // Release: the tracked shape has been gone (or replaced) for longer than the grace.
  if (s.shape !== null && !tracked && t - s.lastSeen >= cfg.dropoutGraceMs) {
    s.phase = "idle";
    s.shape = null;
    s.anchor = null;
  }

  // Start a new dwell.
  if (s.shape === null && ev.hand && t >= s.cooldownUntil) {
    s.phase = "dwell";
    s.shape = ev.hand.shape;
    s.since = t;
    s.lastSeen = t;
    s.anchor = ev.hand.palm;
  } else if (s.shape !== null && seenShape === s.shape && ev.hand) {
    // Optional stillness rule: moving too far restarts the dwell from here.
    if (
      cfg.stillness.enabled &&
      s.phase === "dwell" &&
      s.anchor &&
      drift(ev.hand.palm, s.anchor, aspect) > cfg.stillness.maxMove
    ) {
      s.phase = "dwell";
      s.since = t;
      s.anchor = ev.hand.palm;
    }
    const elapsed = t - s.since;
    if (s.phase === "dwell" && elapsed >= cfg.dwellMs) {
      fire();
      s.phase = "spent";
    }
  }

  return { state: s, fired, view: makeView(s, t, seenShape, ev, input, cfg) };
}

function makeView(s: MachineState, t: number, seen: string | null, ev: Evaluation, input: StepInput, cfg: CommandConfig): MachineView {
  const idle = s.shape === null;
  const elapsed = idle ? 0 : t - s.since;
  const palm = ev.hand?.palm ?? (idle ? null : (input.hands.find((h) => h.shape === s.shape)?.palm ?? s.anchor));
  return {
    phase: s.phase,
    shape: s.shape,
    seen,
    blocked: ev.blocked,
    progress: idle ? 0 : s.phase === "dwell" ? Math.min(1, elapsed / cfg.dwellMs) : 1,
    elapsedMs: elapsed,
    cooldownLeftMs: Math.max(0, s.cooldownUntil - t),
    palm,
  };
}
