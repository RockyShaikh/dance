import { DEFAULT_BOX, normalizeBox, type Box } from "./box";
import { CLUTCH, COMMANDS } from "./config";

/** The test bench's adjustable settings. Kept in the browser's localStorage so the box and sliders survive a reload. */
export interface Settings {
  box: Box;
  /** Dwell before the first ring is full, in milliseconds. */
  dwellMs: number;
  /** Pinch grab threshold (palm sizes). */
  pinchGrab: number;
  stillness: boolean;
  sound: boolean;
}

const KEY = "dance.r2.settings";

export function defaultSettings(): Settings {
  return {
    box: { ...DEFAULT_BOX },
    dwellMs: COMMANDS.dwellMs,
    pinchGrab: CLUTCH.pinch.grabRatio,
    stillness: COMMANDS.stillness.enabled,
    sound: true,
  };
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const j = JSON.parse(raw) as Partial<Settings> & { box?: Partial<Box> };
    const b: Partial<Box> = j.box ?? {};
    return {
      box: normalizeBox({
        x: num(b.x, 0, 1, d.box.x),
        y: num(b.y, 0, 1, d.box.y),
        w: num(b.w, 0, 1, d.box.w),
        h: num(b.h, 0, 1, d.box.h),
      }),
      dwellMs: num(j.dwellMs, COMMANDS.dwellMinMs, COMMANDS.dwellMaxMs, d.dwellMs),
      pinchGrab: num(j.pinchGrab, CLUTCH.pinch.sliderMin, CLUTCH.pinch.sliderMax, d.pinchGrab),
      stillness: typeof j.stillness === "boolean" ? j.stillness : d.stillness,
      sound: typeof j.sound === "boolean" ? j.sound : d.sound,
    };
  } catch {
    return d; // storage blocked or corrupt: fall back to defaults
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}
