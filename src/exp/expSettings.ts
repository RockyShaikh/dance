/** EXP: the bench's own settings, kept in localStorage (separately from the product's settings). */
import { PUSH_KEYS, type PushSignalKey } from "./config";
import { DEFAULT_PUSH, type PushSettings } from "./pushTracker";
import { DEFAULT_SWIPE, type SwipeSettings } from "./swipe";

export interface ExpSettings {
  push: PushSettings;
  swipe: SwipeSettings;
  /** The right hand scrubs by swiping in the zone (and its normal commands are off while this is on). */
  swipeOn: boolean;
  /** Touch down needs the open palm (false: any shape). */
  requirePalm: boolean;
  /** Scrub while the music plays, or paused with short snippets. */
  scrubMode: "play" | "pause";
  /** The signal whose events are shown in the log, flashed on the hand and (if `speak`) spoken. All four are always recorded. */
  primary: PushSignalKey;
  /** Say "push" out loud on a primary push (off by default; the recording start / end are spoken too when on). */
  speak: boolean;
  recordSec: number;
  startDelaySec: number;
  label: string;
}

const KEY = "dance.exp.settings";

export function defaultExpSettings(): ExpSettings {
  return {
    push: { ...DEFAULT_PUSH, enter: { ...DEFAULT_PUSH.enter } },
    swipe: { ...DEFAULT_SWIPE },
    swipeOn: true,
    requirePalm: false,
    scrubMode: "play",
    primary: "d",
    speak: false,
    recordSec: 30,
    startDelaySec: 5,
    label: "push-2m",
  };
}

const num = (v: unknown, lo: number, hi: number, fb: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb);

export function loadExpSettings(): ExpSettings {
  const d = defaultExpSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const j = JSON.parse(raw) as Partial<ExpSettings> & { push?: Partial<PushSettings> & { enter?: Partial<Record<PushSignalKey, number>> }; swipe?: Partial<SwipeSettings> };
    const enter = { ...d.push.enter };
    for (const k of PUSH_KEYS) enter[k] = num(j.push?.enter?.[k], 0.005, 5, enter[k]);
    return {
      push: {
        enter,
        fallFrac: num(j.push?.fallFrac, 0.1, 0.95, d.push.fallFrac),
        maxRiseMs: num(j.push?.maxRiseMs, 100, 3000, d.push.maxRiseMs),
        lateralMax: num(j.push?.lateralMax, 0, 10, d.push.lateralMax),
        refractoryMs: num(j.push?.refractoryMs, 0, 3000, d.push.refractoryMs),
      },
      swipe: {
        gainSec: num(j.swipe?.gainSec, 0, 600, d.swipe.gainSec),
        minSpeed: num(j.swipe?.minSpeed, 0, 2, d.swipe.minSpeed),
        settleMs: num(j.swipe?.settleMs, 0, 1000, d.swipe.settleMs),
        lostGraceMs: num(j.swipe?.lostGraceMs, 0, 1000, d.swipe.lostGraceMs),
      },
      swipeOn: typeof j.swipeOn === "boolean" ? j.swipeOn : d.swipeOn,
      requirePalm: typeof j.requirePalm === "boolean" ? j.requirePalm : d.requirePalm,
      scrubMode: j.scrubMode === "pause" ? "pause" : "play",
      primary: PUSH_KEYS.includes(j.primary as PushSignalKey) ? (j.primary as PushSignalKey) : d.primary,
      speak: typeof j.speak === "boolean" ? j.speak : d.speak,
      recordSec: num(j.recordSec, 3, 300, d.recordSec),
      startDelaySec: num(j.startDelaySec, 0, 30, d.startDelaySec),
      label: typeof j.label === "string" ? j.label.slice(0, 60) : d.label,
    };
  } catch {
    return d;
  }
}

export function saveExpSettings(s: ExpSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the settings just will not persist */
  }
}
