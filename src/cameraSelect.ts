/**
 * R7: which camera to use. Pure logic (no DOM, no media API) so it can be unit-tested: the saved choice, finding it again in
 * the device list, and what to do when a camera appears or disappears (an iPhone picked up from, or put back on, its tripod).
 */

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/** What is remembered: the id, plus the label as a fallback because Chrome may hand out a different deviceId later. */
export interface CameraPref {
  deviceId: string;
  label: string;
  /** The picture shape asked of the camera. */
  shape: PictureShape;
}

export type PictureShape = "16:9" | "4:3";

const KEY = "dance.r7.camera";

/** The part of `Storage` this file uses, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const browserStore = (): KeyValueStore | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export function loadCameraPref(store: KeyValueStore | null = browserStore()): CameraPref {
  const none: CameraPref = { deviceId: "", label: "", shape: "16:9" };
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return none;
    const j = JSON.parse(raw) as Partial<CameraPref>;
    return {
      deviceId: typeof j.deviceId === "string" ? j.deviceId : "",
      label: typeof j.label === "string" ? j.label : "",
      shape: j.shape === "4:3" ? "4:3" : "16:9",
    };
  } catch {
    return none; // storage blocked or corrupt
  }
}

export function saveCameraPref(pref: CameraPref, store: KeyValueStore | null = browserStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(pref));
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}

/** "Rocky's iPhone Camera (05ac:8514)" and "Rocky's iPhone Camera" are the same camera. */
export function normalizeLabel(label: string): string {
  return label
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

/** Where the saved camera is in the list: by deviceId first, then by label. Null: not connected (or no saved choice). */
export function findCamera(devices: readonly CameraDevice[], pref: CameraPref): { device: CameraDevice; by: "id" | "label" } | null {
  if (pref.deviceId) {
    const byId = devices.find((d) => d.deviceId === pref.deviceId);
    if (byId) return { device: byId, by: "id" };
  }
  const want = normalizeLabel(pref.label);
  if (want) {
    const byLabel = devices.find((d) => normalizeLabel(d.label) === want);
    if (byLabel) return { device: byLabel, by: "label" };
  }
  return null;
}

/** What to do after the device list (or the active camera) changed. */
export interface Plan {
  action: "keep" | "open";
  /** For "open": the deviceId, or null to let the browser pick its default. */
  deviceId: string | null;
  /** Why it is not the saved camera (shown on screen), or null when all is as chosen. */
  note: string | null;
  /** The saved camera is in the list and is the one in use or being opened. */
  usingSaved: boolean;
}

export interface PlanInput {
  devices: readonly CameraDevice[];
  pref: CameraPref;
  /** The deviceId of the camera in use now (null: none open). */
  activeId: string | null;
  /** The active camera's track is still live (an unplugged camera's track ends). */
  activeLive: boolean;
}

/**
 * The one rule behind picking, hot-plug and reconnect:
 *  - a saved camera that is connected is the one to use (switch to it if something else is open: that is the automatic
 *    switch back when the iPhone reappears);
 *  - a saved camera that is missing falls back to the default, with a note, and the saved choice is kept;
 *  - no saved choice: keep whatever is open while it stays connected.
 */
export function planCamera({ devices, pref, activeId, activeLive }: PlanInput): Plan {
  const saved = findCamera(devices, pref);
  if (saved) {
    const same = activeLive && activeId === saved.device.deviceId;
    return { action: same ? "keep" : "open", deviceId: saved.device.deviceId, note: null, usingSaved: true };
  }
  const hasSaved = pref.deviceId !== "" || pref.label !== "";
  const note = hasSaved ? `"${pref.label || "The chosen camera"}" is not connected: using the default camera. It switches back when it appears.` : null;
  const stillThere = activeLive && activeId !== null && devices.some((d) => d.deviceId === activeId);
  return { action: stillThere ? "keep" : "open", deviceId: null, note, usingSaved: false };
}

/** The constraints for getUserMedia: the requested size as `ideal`, a camera by exact deviceId, or the default. */
export function videoConstraints(deviceId: string | null, size: { width: number; height: number }, frameRate: number): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
    width: { ideal: size.width },
    height: { ideal: size.height },
    frameRate: { ideal: frameRate },
  };
}
