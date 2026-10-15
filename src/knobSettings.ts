import { KNOB, type ClutchKind, type KnobTarget, type MappingKind, type MotionKind } from "./config";
import { normalizeChoice, type KnobChoice } from "./knob";

/** The knob's chosen variant and sliders, kept in localStorage so they survive a reload. Defaults: claw + tilt + joystick. */
export type KnobSettings = KnobChoice;

// Bumped in R4d so the new defaults (circling + jog) apply once instead of the saved R4c choice (tilt + relative).
const KEY = "dance.r4d.knob";

export const CLUTCHES: readonly ClutchKind[] = ["claw", "pinch", "twoHand"];

/**
 * R9: the claw grab is VAULTED: all of its code and tests stay, but it is not offered anywhere in the UI (no dropdown entry, no
 * clutch-shape row) unless the page is opened with `?claw=1`, so it can be shown to dancers later. A saved "claw" choice falls
 * back to the default while the flag is off.
 */
export function clawEnabled(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("claw") === "1";
}

/** The clutches the panel offers: all of them with the claw flag, otherwise without the claw. */
export function availableClutches(claw: boolean = clawEnabled()): readonly ClutchKind[] {
  return claw ? CLUTCHES : CLUTCHES.filter((c) => c !== "claw");
}
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
export function sanitizeKnobSettings(raw: unknown, claw: boolean = clawEnabled()): KnobSettings {
  const d = defaultKnobSettings();
  const j = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof KnobSettings, unknown>>;
  return normalizeChoice({
    clutch: pick(j.clutch, availableClutches(claw), d.clutch),
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
