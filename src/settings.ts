import { DEFAULT_BOXES, normalizeBox, type Box } from "./box";
import type { Handedness } from "./hand";
import { CLUTCH, COMMANDS } from "./config";

/** The test bench's adjustable settings. Kept in the browser's localStorage so the box and sliders survive a reload. */
export interface Settings {
  /** R4b: each hand's own command box. */
  boxes: Record<Handedness, Box>;
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
    boxes: { Left: { ...DEFAULT_BOXES.Left }, Right: { ...DEFAULT_BOXES.Right } },
    dwellMs: COMMANDS.dwellMs,
    pinchGrab: CLUTCH.pinch.grabRatio,
    stillness: COMMANDS.stillness.enabled,
    sound: true,
  };
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** A stored box: any missing or out-of-range number falls back to the default, and it is forced into the frame. */
export function readBox(b: Partial<Box> | undefined, fallback: Box): Box {
  const v = b ?? {};
  return normalizeBox({ x: num(v.x, 0, 1, fallback.x), y: num(v.y, 0, 1, fallback.y), w: num(v.w, 0, 1, fallback.w), h: num(v.h, 0, 1, fallback.h) });
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    // `box` is the R2/R3 single box: it becomes the right hand's box.
    const j = JSON.parse(raw) as Partial<Omit<Settings, "boxes">> & { box?: Partial<Box>; boxes?: Partial<Record<Handedness, Partial<Box>>> };
    return {
      boxes: {
        Left: readBox(j.boxes?.Left, d.boxes.Left),
        Right: readBox(j.boxes?.Right ?? j.box, d.boxes.Right),
      },
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
