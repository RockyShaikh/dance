/**
 * The experiment log (R4b): for each variant (clutch + motion + mapping) a tally of loop starts nudged
 * (counted automatically), "felt best" / "not great" marks, and a note. Kept in localStorage; "Copy
 * results" turns it into text for the user to paste. Pure functions here, DOM in knobPanel.ts.
 */
import type { ClutchKind, KnobTarget, MappingKind, MotionKind } from "./config";
import { CLUTCH_NAMES, MAPPING_NAMES, MOTION_NAMES, TARGET_NAMES, CLUTCHES, MAPPINGS, MOTIONS, TARGETS, type KnobSettings } from "./knobSettings";

export interface VariantTally {
  /** Grabs that actually moved the START (counted automatically). */
  nudges: number;
  best: number;
  poor: number;
  note: string;
}

export type KnobLog = Record<string, VariantTally>;

const KEY = "dance.r4b.log";

/** clutch+motion+mapping, and +target when it isn't the playhead (older entries without a target mean the playhead). */
export const variantKey = (v: { clutch: ClutchKind; motion: MotionKind; mapping: MappingKind; target?: KnobTarget }): string =>
  `${v.clutch}+${v.motion}+${v.mapping}+${v.target ?? "playhead"}`;

const empty = (): VariantTally => ({ nudges: 0, best: 0, poor: 0, note: "" });

/** Returns a new log with `fn` applied to that variant's tally (created if missing). */
export function update(log: KnobLog, key: string, fn: (t: VariantTally) => VariantTally): KnobLog {
  return { ...log, [key]: fn({ ...empty(), ...log[key] }) };
}

export const recordNudge = (log: KnobLog, key: string): KnobLog => update(log, key, (t) => ({ ...t, nudges: t.nudges + 1 }));
export const markVariant = (log: KnobLog, key: string, mark: "best" | "poor"): KnobLog => update(log, key, (t) => ({ ...t, [mark]: t[mark] + 1 }));
export const setNote = (log: KnobLog, key: string, note: string): KnobLog => update(log, key, (t) => ({ ...t, note }));

function describe(key: string): string {
  const [c, m, p, t = "playhead"] = key.split("+") as [ClutchKind, MotionKind, MappingKind, KnobTarget];
  const name = (names: Record<string, string>, k: string) => names[k] ?? k;
  return `${name(CLUTCH_NAMES, c)} + ${name(MOTION_NAMES, m)} + ${name(MAPPING_NAMES, p)} -> ${name(TARGET_NAMES, t)}`;
}

/** The text the "Copy results" button puts on the clipboard. Only variants that have something recorded. */
export function formatResults(log: KnobLog, settings: KnobSettings, date: string): string {
  const order = new Map<string, number>();
  for (const t of TARGETS) for (const c of CLUTCHES) for (const m of MOTIONS) for (const p of MAPPINGS) order.set(variantKey({ clutch: c, motion: m, mapping: p, target: t }), order.size);
  const rows = Object.entries(log)
    .filter(([, t]) => t.nudges > 0 || t.best > 0 || t.poor > 0 || t.note.trim() !== "")
    .sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  const lines = [`Dance R4b knob results, ${date}`, `Sliders now: gain ${settings.gain.toFixed(2)}, dead zone ${settings.deadZoneDeg.toFixed(0)} deg, direction ${settings.invert ? "inverted" : "normal"}`];
  if (rows.length === 0) lines.push("(nothing recorded yet)");
  for (const [key, t] of rows) {
    const note = t.note.trim() ? ` | note: ${t.note.trim()}` : "";
    lines.push(`- ${describe(key)}: ${t.nudges} loop starts nudged, felt best x${t.best}, not great x${t.poor}${note}`);
  }
  return lines.join("\n");
}

const clean = (raw: unknown): KnobLog => {
  const out: KnobLog = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, Partial<VariantTally>>)) {
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    out[k] = { nudges: n(v?.nudges), best: n(v?.best), poor: n(v?.poor), note: typeof v?.note === "string" ? v.note : "" };
  }
  return out;
};

export function loadLog(): KnobLog {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clean(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveLog(log: KnobLog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    /* storage unavailable: the tally just won't persist */
  }
}
