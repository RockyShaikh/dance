import { CameraError, deliveredOf, listCameras, openCamera, requestedSize, stopCamera, type Delivered, type FrameSource } from "./camera";
import { findCamera, loadCameraPref, planCamera, saveCameraPref, type CameraDevice, type CameraPref, type PictureShape } from "./cameraSelect";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

/**
 * R7: the camera picker in the top bar. Lists the video inputs, remembers the choice, follows cameras appearing and
 * disappearing (an iPhone's Continuity Camera as it is picked up or put back), and shows what the camera really delivers.
 * The decisions are in cameraSelect.ts (pure, tested); this file does the media calls and the DOM.
 *
 * Switching only swaps the stream inside the one <video> element: the frame loop, the recognizer, the zone and the zoom crop
 * read the frame size every frame, so they carry on unchanged. `onSwitched` lets the loop forget its duplicate-frame guard.
 */
export class CameraPicker {
  pref: CameraPref = loadCameraPref();
  devices: CameraDevice[] = [];
  /** Why the active camera is not the saved one (null: it is, or nothing was saved). */
  note: string | null = null;
  /** Counts stream swaps (dev inspection). */
  switches = 0;
  onSwitched: () => void = () => {};

  private chain: Promise<void> = Promise.resolve();
  private timer = 0;
  private lastReadout = "";
  private readonly select = el<HTMLSelectElement>("cam-select");
  private readonly shape = el<HTMLSelectElement>("cam-shape");
  private readonly readoutEl = el("cam-readout");
  private readonly noteEl = el("cam-note");

  constructor(private readonly video: HTMLVideoElement) {
    this.shape.value = this.pref.shape;
    this.select.addEventListener("change", () => {
      this.choose(this.select.value);
      this.select.blur();
    });
    this.shape.addEventListener("change", () => {
      this.pref = { ...this.pref, shape: this.shape.value as PictureShape };
      saveCameraPref(this.pref);
      const active = deliveredOf(this.video)?.deviceId ?? null;
      this.queue(() => this.openTarget(active));
      this.shape.blur();
    });
    navigator.mediaDevices?.addEventListener?.("devicechange", () => {
      // A plug event often comes as several in a row: act once, shortly after the last.
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.queue(() => this.reconcile()), 250);
    });
  }

  /** Opens the saved camera (or the browser's default). Throws CameraError when nothing opens. */
  async start(): Promise<FrameSource> {
    this.devices = await listCameras();
    const plan = planCamera({ devices: this.devices, pref: this.pref, activeId: null, activeLive: false });
    let source: FrameSource;
    try {
      source = await openCamera(this.video, plan.deviceId, this.pref.shape);
    } catch (err) {
      if (plan.deviceId === null) throw err;
      source = await openCamera(this.video, null, this.pref.shape); // the saved id went stale: the default, then the rest is sorted below
    }
    this.watchTrack();
    // The device list had no labels before permission: sort out the saved camera now.
    this.queue(() => this.reconcile());
    return source;
  }

  /** The user picked a camera from the list: remember it and switch to it. */
  private choose(deviceId: string): void {
    const dev = this.devices.find((d) => d.deviceId === deviceId);
    if (!dev) return;
    this.pref = { deviceId: dev.deviceId, label: dev.label, shape: this.pref.shape };
    saveCameraPref(this.pref);
    this.note = null;
    this.queue(async () => {
      await this.openTarget(dev.deviceId);
      await this.relist();
    });
  }

  private queue(job: () => Promise<void>): void {
    this.chain = this.chain.then(job).catch((err) => console.warn("camera:", err));
  }

  private async relist(): Promise<void> {
    this.devices = await listCameras();
    this.render();
  }

  /** The device list or the camera changed: use the saved camera if it is there, the default if it is not. */
  private async reconcile(): Promise<void> {
    this.devices = await listCameras();
    const d = deliveredOf(this.video);
    const plan = planCamera({ devices: this.devices, pref: this.pref, activeId: d?.deviceId ?? null, activeLive: d?.live ?? false });
    this.note = plan.note;
    // Found by label under a new deviceId: remember the new id.
    const found = findCamera(this.devices, this.pref);
    if (found && found.by === "label") {
      this.pref = { ...this.pref, deviceId: found.device.deviceId };
      saveCameraPref(this.pref);
    }
    if (plan.action === "open") await this.openTarget(plan.deviceId);
    this.render();
  }

  /** Swaps the stream to `deviceId` (null: default). A saved camera that will not open falls back to the default, with a note. */
  private async openTarget(deviceId: string | null): Promise<void> {
    try {
      await openCamera(this.video, deviceId, this.pref.shape);
    } catch (err) {
      const why = err instanceof CameraError ? err.message.split("\n")[0] : String(err);
      if (deviceId === null) {
        this.note = why;
        this.render();
        return;
      }
      this.note = `Could not open that camera (${why}): using the default camera.`;
      try {
        await openCamera(this.video, null, this.pref.shape);
      } catch (err2) {
        this.note = err2 instanceof CameraError ? err2.message.split("\n")[0] : String(err2);
        this.render();
        return;
      }
    }
    this.switches++;
    this.watchTrack();
    this.onSwitched();
    await this.relist();
  }

  /** An unplugged camera's track ends: look again at once (the devicechange event may be late). */
  private watchTrack(): void {
    const track = this.video.srcObject instanceof MediaStream ? this.video.srcObject.getVideoTracks()[0] : undefined;
    track?.addEventListener("ended", () => this.queue(() => this.reconcile()), { once: true });
  }

  /** Redraws the picker and the readout. `measuredFps`: the rate the page really receives frames at (0: not measured yet). */
  render(measuredFps = 0): void {
    const d = deliveredOf(this.video);
    this.renderList(d);
    this.renderReadout(d, measuredFps);
  }

  private renderList(d: Delivered | null): void {
    const sig = JSON.stringify([this.devices, d?.deviceId, this.pref.deviceId, this.note]);
    if (sig !== this.lastReadout) {
      this.lastReadout = sig;
      this.select.textContent = "";
      this.devices.forEach((dev, i) => {
        const o = document.createElement("option");
        o.value = dev.deviceId;
        o.textContent = dev.label || `Camera ${i + 1}`;
        this.select.append(o);
      });
      if (this.pref.label && !findCamera(this.devices, this.pref)) {
        const o = document.createElement("option");
        o.disabled = true;
        o.value = "missing";
        o.textContent = `${this.pref.label} (not connected)`;
        this.select.append(o);
      }
      if (d?.deviceId) this.select.value = d.deviceId;
      this.noteEl.textContent = this.note ?? "";
      this.noteEl.hidden = this.note === null;
    }
  }

  private renderReadout(d: Delivered | null, measuredFps: number): void {
    if (!d) {
      this.readoutEl.textContent = "no camera";
      return;
    }
    const want = requestedSize(this.pref.shape);
    const smaller = d.width < want.width || d.height < want.height;
    const fps = measuredFps > 0 ? `${measuredFps.toFixed(1)} fps` : "-- fps";
    const nominal = d.frameRate ? ` (camera says ${Math.round(d.frameRate)})` : "";
    this.readoutEl.textContent = `${d.width}×${d.height} · ${fps}${nominal}${smaller ? ` · asked ${want.width}×${want.height}` : ""}`;
    this.readoutEl.classList.toggle("warn", smaller);
  }

  /** Release the camera (tests, page teardown). */
  stop(): void {
    stopCamera(this.video);
  }
}
