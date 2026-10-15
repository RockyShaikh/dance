import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, loadSettings, saveSettings } from "./settings";

/** A tiny in-memory localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe("R9 video settings", () => {
  it("the video starts mirrored with the camera view showing, and nothing stored gives those defaults", () => {
    fakeStorage();
    expect(defaultSettings().mirrorVideo).toBe(true);
    expect(defaultSettings().showCamera).toBe(true);
    expect(loadSettings().mirrorVideo).toBe(true);
  });

  it("the mirror choice persists through save and load (both ways)", () => {
    const data = fakeStorage();
    const s = loadSettings();
    s.mirrorVideo = false;
    saveSettings(s);
    expect(data.size).toBe(1);
    expect(loadSettings().mirrorVideo).toBe(false);
    s.mirrorVideo = true;
    saveSettings(s);
    expect(loadSettings().mirrorVideo).toBe(true);
  });

  it("the camera-view choice persists too, and a stored non-boolean falls back to the default", () => {
    fakeStorage();
    const s = loadSettings();
    s.showCamera = false;
    saveSettings(s);
    expect(loadSettings().showCamera).toBe(false);
    fakeStorage({ "dance.r2.settings": JSON.stringify({ mirrorVideo: "no", showCamera: 0 }) });
    expect(loadSettings()).toMatchObject({ mirrorVideo: true, showCamera: true });
  });

  it("settings saved before R9 (no video fields) load with the defaults and keep their other values", () => {
    fakeStorage({ "dance.r2.settings": JSON.stringify({ zoom: true, dwellMs: 900, sound: false }) });
    expect(loadSettings()).toMatchObject({ zoom: true, dwellMs: 900, sound: false, mirrorVideo: true, showCamera: true });
  });

  it("storage blocked: defaults, and saving does not throw", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadSettings().mirrorVideo).toBe(true);
    expect(() => saveSettings(defaultSettings())).not.toThrow();
  });
});
