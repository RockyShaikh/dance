import { KNOB, type ClutchKind, type KnobTarget, type MappingKind, type MotionKind } from "./config";
import { normalizeChoice, type KnobChoice } from "./knob";

/** The knob's chosen variant and sliders, kept in localStorage so they survive a reload. Defaults: claw + tilt + joystick. */
export type KnobSettings = KnobChoice;

const KEY = "dance.r4b.knob";

export const CLUTCHES: readonly ClutchKind[] = ["claw", "pinch", "twoHand"];
export const MOTIONS: readonly MotionKind[] = ["tilt", "circling"];
export const MAPPINGS: readonly MappingKind[] = ["joystick", "absolute", "relative", "jog"];

export const TARGETS: readonly KnobTarget[] = ["playhead", "start", "end"];
export const TARGET_NAMES: Record<KnobTarget, string> = { playhead: "Playhead (scrub)", start: "Loop START", end: "Loop END" };

export const CLUTCH_NAMES: Record<ClutchKind, string> = { claw: "Claw", pinch: "Pinch", twoHand: "Two-hand" };
export const MOTION_NAMES: Record<MotionKind, string> = { tilt: "Tilt (wiper)", circling: "Circling" };
export const MAPPING_NAMES: Record<MappingKind, string> = {
  joystick: "Joystick (rate)",
  absolute: "Absolute (wiper)",
  relative: "Relative + ratchet",
  jog: "Jog (circles)",
};

export function defaultKnobSettings(): KnobSettings {
  return { ...KNOB.defaults };
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const pick = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback);

/** Anything out of range or unknown falls back to the default for that field. */
export function sanitizeKnobSettings(raw: unknown): KnobSettings {
  const d = defaultKnobSettings();
  const j = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof KnobSettings, unknown>>;
  return normalizeChoice({
    clutch: pick(j.clutch, CLUTCHES, d.clutch),
    motion: pick(j.motion, MOTIONS, d.motion),
    mapping: pick(j.mapping, MAPPINGS, d.mapping),
    target: pick(j.target, TARGETS, d.target),
    gain: num(j.gain, KNOB.gainMin, KNOB.gainMax, d.gain),
    deadZoneDeg: num(j.deadZoneDeg, KNOB.deadZoneMinDeg, KNOB.deadZoneMaxDeg, d.deadZoneDeg),
    invert: typeof j.invert === "boolean" ? j.invert : d.invert,
  });
}

export function loadKnobSettings(): KnobSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeKnobSettings(JSON.parse(raw)) : defaultKnobSettings();
  } catch {
    return defaultKnobSettings(); // storage blocked or corrupt
  }
}

export function saveKnobSettings(s: KnobSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}
