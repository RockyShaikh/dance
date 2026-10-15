import { DEFAULT_ZONE, normalizeBox, type Box } from "./box";
import type { TrackMode } from "./autoTrack";
import { CLUTCH, COMMANDS } from "./config";
import { SPEECH } from "./speech";

/** The test bench's adjustable settings. Kept in the browser's localStorage so the box and sliders survive a reload. */
export interface Settings {
  /** R6: the one command zone both hands use (display-normalized; default the top quarter). */
  zone: Box;
  /** R6: crop the camera frame to the zone (plus a margin) before the hand model sees it. */
  zoom: boolean;
  /** R8: auto-track (off / person / wrists): pose decides where to crop, and the crop goes to the hand model. While on, `zoom` is ignored. */
  autoTrack: TrackMode;
  /** Dwell before the first ring is full, in milliseconds. */
  dwellMs: number;
  /** Pinch grab threshold (palm sizes). */
  pinchGrab: number;
  stillness: boolean;
  /** The old beep on every fired command. R9: off by default, because the spoken words (below) say it better. */
  sound: boolean;
  /** R9: say short words on key events ("loop in", "paused", "no loop set"...). */
  speech: boolean;
  /** R9: how loud the words are, 0..1 (the music's own volume is untouched). */
  speechVolume: number;
  /** R9: show the practice video flipped left-to-right, like a mirror (dancers often learn mirrored). CSS only; the file is untouched. */
  mirrorVideo: boolean;
  /** R9: while a video is loaded, show the small camera view (skeleton, zone, HUD) in the corner. */
  showCamera: boolean;
}

const KEY = "dance.r2.settings";

export function defaultSettings(): Settings {
  return {
    zone: { ...DEFAULT_ZONE },
    zoom: false,
    autoTrack: "person",
    dwellMs: COMMANDS.dwellMs,
    pinchGrab: CLUTCH.pinch.grabRatio,
    stillness: COMMANDS.stillness.enabled,
    sound: false,
    speech: true,
    speechVolume: SPEECH.defaultVolume,
    mirrorVideo: true,
    showCamera: true,
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
    // Migration (R6): the older per-hand boxes (`boxes`, and the R2/R3 single `box`) were halves of the frame and do not
    // carry over to one shared zone: settings saved before R6 get the default top quarter (the sliders below still carry over).
    const j = JSON.parse(raw) as Partial<Omit<Settings, "zone">> & { zone?: Partial<Box> };
    return {
      zone: readBox(j.zone, d.zone),
      zoom: typeof j.zoom === "boolean" ? j.zoom : d.zoom,
      autoTrack: j.autoTrack === "person" || j.autoTrack === "wrists" || j.autoTrack === "off" ? j.autoTrack : d.autoTrack,
      dwellMs: num(j.dwellMs, COMMANDS.dwellMinMs, COMMANDS.dwellMaxMs, d.dwellMs),
      pinchGrab: num(j.pinchGrab, CLUTCH.pinch.sliderMin, CLUTCH.pinch.sliderMax, d.pinchGrab),
      stillness: typeof j.stillness === "boolean" ? j.stillness : d.stillness,
      // Settings saved before R9 have no `speech`: their beep (the old default, on) gives way to the spoken words.
      sound: typeof j.speech === "boolean" && typeof j.sound === "boolean" ? j.sound : d.sound,
      speech: typeof j.speech === "boolean" ? j.speech : d.speech,
      speechVolume: num(j.speechVolume, 0, 1, d.speechVolume),
      mirrorVideo: typeof j.mirrorVideo === "boolean" ? j.mirrorVideo : d.mirrorVideo,
      showCamera: typeof j.showCamera === "boolean" ? j.showCamera : d.showCamera,
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
