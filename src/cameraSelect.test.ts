import { describe, expect, it } from "vitest";
import { findCamera, loadCameraPref, normalizeLabel, planCamera, saveCameraPref, videoConstraints, type CameraDevice, type CameraPref, type KeyValueStore } from "./cameraSelect";

const facetime: CameraDevice = { deviceId: "id-ft", label: "FaceTime HD Camera (built-in)" };
const iphone: CameraDevice = { deviceId: "id-iph", label: "Rocky's iPhone Camera" };
const prefOf = (d: CameraDevice, shape: CameraPref["shape"] = "16:9"): CameraPref => ({ deviceId: d.deviceId, label: d.label, shape });
const NONE: CameraPref = { deviceId: "", label: "", shape: "16:9" };

function fakeStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

describe("persistence", () => {
  it("round-trips the choice, with the picture shape", () => {
    const store = fakeStore();
    saveCameraPref(prefOf(iphone, "4:3"), store);
    expect(loadCameraPref(store)).toEqual({ deviceId: "id-iph", label: "Rocky's iPhone Camera", shape: "4:3" });
  });
  it("nothing saved, corrupt, or blocked storage: no choice, 16:9", () => {
    expect(loadCameraPref(fakeStore())).toEqual(NONE);
    expect(loadCameraPref(fakeStore({ "dance.r7.camera": "{not json" }))).toEqual(NONE);
    expect(loadCameraPref(null)).toEqual(NONE);
    expect(() => saveCameraPref(prefOf(iphone), null)).not.toThrow();
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(loadCameraPref(throwing)).toEqual(NONE);
    expect(() => saveCameraPref(prefOf(iphone), throwing)).not.toThrow();
  });
  it("ignores wrongly typed stored fields", () => {
    const store = fakeStore({ "dance.r7.camera": JSON.stringify({ deviceId: 5, label: null, shape: "weird" }) });
    expect(loadCameraPref(store)).toEqual(NONE);
  });
});

describe("finding the saved camera", () => {
  it("by deviceId first", () => {
    expect(findCamera([facetime, iphone], prefOf(iphone))).toEqual({ device: iphone, by: "id" });
  });
  it("by label when the deviceId changed", () => {
    const moved = { ...iphone, deviceId: "id-new" };
    expect(findCamera([facetime, moved], prefOf(iphone))).toEqual({ device: moved, by: "label" });
  });
  it("labels match ignoring case and Chrome's trailing (vendor:product)", () => {
    expect(normalizeLabel("FaceTime HD Camera (05ac:8514)")).toBe("facetime hd camera");
    const found = findCamera([{ deviceId: "x", label: "ROCKY'S iPHONE camera (1234:abcd)" }], prefOf(iphone));
    expect(found?.by).toBe("label");
  });
  it("an id that matches wins over a different device with the same label", () => {
    const twin = { deviceId: "id-twin", label: iphone.label };
    expect(findCamera([twin, iphone], prefOf(iphone))?.device).toBe(iphone);
  });
  it("not connected, or nothing saved: null (an empty label never matches an empty saved label)", () => {
    expect(findCamera([facetime], prefOf(iphone))).toBeNull();
    expect(findCamera([facetime, { deviceId: "", label: "" }], NONE)).toBeNull();
  });
});

describe("what to open (selection, fallback and reconnect)", () => {
  it("first run, nothing saved, nothing open: the browser's default, no note", () => {
    expect(planCamera({ devices: [facetime], pref: NONE, activeId: null, activeLive: false })).toEqual({ action: "open", deviceId: null, note: null, usingSaved: false });
  });
  it("nothing saved: keeps whatever is open while it stays connected", () => {
    expect(planCamera({ devices: [facetime, iphone], pref: NONE, activeId: "id-ft", activeLive: true }).action).toBe("keep");
  });
  it("nothing saved and the open camera was unplugged: the default", () => {
    expect(planCamera({ devices: [facetime], pref: NONE, activeId: "id-iph", activeLive: true }).action).toBe("open");
    expect(planCamera({ devices: [facetime, iphone], pref: NONE, activeId: "id-iph", activeLive: false }).action).toBe("open");
  });
  it("the saved camera is connected but something else is open: switch to it", () => {
    const p = planCamera({ devices: [facetime, iphone], pref: prefOf(iphone), activeId: "id-ft", activeLive: true });
    expect(p).toEqual({ action: "open", deviceId: "id-iph", note: null, usingSaved: true });
  });
  it("the saved camera is the one open and live: keep", () => {
    expect(planCamera({ devices: [facetime, iphone], pref: prefOf(iphone), activeId: "id-iph", activeLive: true }).action).toBe("keep");
  });
  it("the saved camera's track ended: reopen it", () => {
    expect(planCamera({ devices: [facetime, iphone], pref: prefOf(iphone), activeId: "id-iph", activeLive: false }).action).toBe("open");
  });
  it("the saved iPhone is missing: the default, with a visible note that names it", () => {
    const p = planCamera({ devices: [facetime], pref: prefOf(iphone), activeId: null, activeLive: false });
    expect(p.action).toBe("open");
    expect(p.deviceId).toBeNull();
    expect(p.usingSaved).toBe(false);
    expect(p.note).toContain("Rocky's iPhone Camera");
    expect(p.note).toContain("not connected");
  });
  it("the saved iPhone vanished while open: fall back to the default (the saved choice is not forgotten: the plan never changes the pref)", () => {
    const pref = prefOf(iphone);
    const p = planCamera({ devices: [facetime], pref, activeId: "id-iph", activeLive: true });
    expect(p.action).toBe("open");
    expect(p.note).not.toBeNull();
    expect(pref).toEqual(prefOf(iphone));
  });
  it("already on the fallback and the iPhone is still missing: keep it (no reopening on every device event), note stays", () => {
    const p = planCamera({ devices: [facetime], pref: prefOf(iphone), activeId: "id-ft", activeLive: true });
    expect(p.action).toBe("keep");
    expect(p.note).not.toBeNull();
  });
  it("the iPhone reappears (under a new deviceId, found by label) while on the fallback: switches back, note cleared", () => {
    const back = { ...iphone, deviceId: "id-iph-2" };
    const p = planCamera({ devices: [facetime, back], pref: prefOf(iphone), activeId: "id-ft", activeLive: true });
    expect(p).toEqual({ action: "open", deviceId: "id-iph-2", note: null, usingSaved: true });
  });
  it("a full unplug / replug sequence", () => {
    const pref = prefOf(iphone);
    let active: string | null = "id-iph";
    const step = (devices: CameraDevice[]) => {
      const p = planCamera({ devices, pref, activeId: active, activeLive: true });
      if (p.action === "open") active = p.deviceId ?? devices[0].deviceId; // the default is the first camera
      return p;
    };
    expect(step([facetime, iphone]).action).toBe("keep");
    expect(step([facetime]).action).toBe("open");
    expect(active).toBe("id-ft");
    expect(step([facetime]).action).toBe("keep");
    expect(step([facetime, iphone])).toMatchObject({ action: "open", deviceId: "id-iph" });
    expect(active).toBe("id-iph");
  });
});

describe("constraints", () => {
  it("a chosen camera is asked for by exact deviceId, with the size as ideal values", () => {
    expect(videoConstraints("id-iph", { width: 1920, height: 1080 }, 30)).toEqual({
      deviceId: { exact: "id-iph" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    });
  });
  it("no choice: the front-facing default", () => {
    expect(videoConstraints(null, { width: 1920, height: 1440 }, 30)).toMatchObject({ facingMode: "user", height: { ideal: 1440 } });
  });
});
