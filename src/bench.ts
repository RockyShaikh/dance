import { PRESETS, type Box, type PresetName } from "./box";
import type { Handedness } from "./hand";
import type { ClutchView } from "./clutch";
import type { FireEvent, MachineView } from "./commands";
import { CLUTCH, COMMANDS } from "./config";
import { prettyShape } from "./hud";
import { saveSettings, type Settings } from "./settings";
import { beep, unlockAudio } from "./sound";

/** The test bench's side panels, banner, event log and false-fire test. DOM only. */

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

export interface LogEntry {
  /** Wall-clock time the command fired. */
  at: number;
  shape: string;
  /** R4b: which hand fired it. */
  hand?: Handedness;
  /** Fired while the false-fire test was running. */
  test: boolean;
}

export interface BenchHooks {
  setZone(b: Box): void;
  /** The zoom toggle changed (settings.zoom is already updated and saved). */
  zoomChanged(): void;
}

const FFT_MS = 2 * 60 * 1000;
const BANNER_MS = 1100;
const LOG_MAX = 500;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${pad(Math.floor(ms / 1000) % 60)}`;

export class Bench {
  readonly log: LogEntry[] = [];
  private fft = { running: false, endAt: 0, count: 0, timer: 0 };
  private lastTexts = new Map<string, string>();
  private bannerTimer = 0;

  private readonly banner = el("banner");
  private readonly bannerMain = el("banner-main");
  private readonly bannerSub = el("banner-sub");
  private readonly logList = el("log");
  private readonly fftButton = el<HTMLButtonElement>("fft-button");
  private readonly fftStatus = el("fft-status");
  private readonly dwell = el<HTMLInputElement>("dwell");
  private readonly pinch = el<HTMLInputElement>("pinch");

  constructor(
    private readonly settings: Settings,
    private readonly hooks: BenchHooks,
  ) {
    const save = () => saveSettings(this.settings);

    // Browsers only allow sound after a user gesture.
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);

    for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-zone]")) {
      btn.addEventListener("click", () => {
        this.hooks.setZone({ ...PRESETS[btn.dataset.zone as PresetName] });
        btn.blur();
      });
    }
    const zoom = el<HTMLInputElement>("zoom-toggle");
    zoom.checked = this.settings.zoom;
    zoom.addEventListener("change", () => {
      this.settings.zoom = zoom.checked;
      save();
      this.hooks.zoomChanged();
      zoom.blur();
    });

    this.dwell.min = String(COMMANDS.dwellMinMs / 1000);
    this.dwell.max = String(COMMANDS.dwellMaxMs / 1000);
    this.dwell.step = "0.05";
    this.dwell.value = String(this.settings.dwellMs / 1000);
    const showDwell = () => (el("dwell-value").textContent = `${(this.settings.dwellMs / 1000).toFixed(2)} s`);
    this.dwell.addEventListener("input", () => {
      this.settings.dwellMs = Math.round(Number(this.dwell.value) * 1000);
      showDwell();
      save();
    });
    showDwell();

    this.pinch.min = String(CLUTCH.pinch.sliderMin);
    this.pinch.max = String(CLUTCH.pinch.sliderMax);
    this.pinch.step = "0.01";
    this.pinch.value = String(this.settings.pinchGrab);
    const showPinch = () => (el("pinch-value").textContent = this.settings.pinchGrab.toFixed(2));
    this.pinch.addEventListener("input", () => {
      this.settings.pinchGrab = Number(this.pinch.value);
      showPinch();
      save();
    });
    showPinch();

    const sound = el<HTMLInputElement>("sound");
    sound.checked = this.settings.sound;
    sound.addEventListener("change", () => {
      this.settings.sound = sound.checked;
      if (sound.checked) {
        unlockAudio();
        beep(); // so you hear what it sounds like right away
      }
      save();
    });

    const still = el<HTMLInputElement>("stillness");
    still.checked = this.settings.stillness;
    still.addEventListener("change", () => {
      this.settings.stillness = still.checked;
      save();
    });

    this.fftButton.addEventListener("click", () => (this.fft.running ? this.stopFalseFireTest(true) : this.startFalseFireTest()));
    el("log-clear").addEventListener("click", () => {
      this.log.length = 0;
      this.logList.textContent = "";
    });
    this.showZone(this.settings.zone);
  }

  /** Updates a text node only when its text changed (called every frame). */
  private setText(id: string, text: string, cls?: string): void {
    const key = `${id}|${cls ?? ""}`;
    if (this.lastTexts.get(id) === key + text) return;
    this.lastTexts.set(id, key + text);
    const node = el(id);
    node.textContent = text;
    if (cls !== undefined) node.className = cls;
  }

  showZone(zone: Box): void {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    this.setText("box-readout", `Zone: left ${pct(zone.x)}, top ${pct(zone.y)}, ${pct(zone.w)} wide, ${pct(zone.h)} tall. Drag it on the video to move it; drag an edge or corner to resize.`);
  }

  /** The zoom note next to the toggle: the live magnification, or why there is none. */
  setZoomNote(text: string): void {
    this.setText("zoom-note", text);
  }

  /** R8: the zone-zoom checkbox does nothing while Auto-track is on. */
  setZoomDisabled(disabled: boolean): void {
    el<HTMLInputElement>("zoom-toggle").disabled = disabled;
  }

  setPinchLive(ratios: readonly number[]): void {
    this.setText("pinch-live", ratios.length ? ratios.map((r) => r.toFixed(2)).join(" / ") : "no hand");
  }

  /** Both hands' command state, one line each. */
  renderCommand(views: Record<Handedness, MachineView>): void {
    const both = (f: (v: MachineView) => string): string => `R: ${f(views.Right)} · L: ${f(views.Left)}`;
    this.setText("cmd-seen", both((v) => (v.seen ? prettyShape(v.seen) : "—")));
    const anyBlocked = views.Right.blocked !== null || views.Left.blocked !== null;
    this.setText("cmd-blocked", both((v) => v.blocked ?? "—"), anyBlocked ? "v warn" : "v");
    this.setText("cmd-state", both((v) => this.phaseText(v)));
  }

  private phaseText(view: MachineView): string {
    const s = (ms: number) => (ms / 1000).toFixed(2);
    let state: string;
    switch (view.phase) {
      case "idle":
        state = view.cooldownLeftMs > 0 ? `cooldown ${s(view.cooldownLeftMs)} s` : "idle";
        break;
      case "dwell":
        state = `holding ${s(view.elapsedMs)} / ${s(this.settings.dwellMs)} s`;
        break;
      case "spent":
        state = "fired: drop the hand to re-arm";
        break;
    }
    return state;
  }

  renderClutch(v: ClutchView): void {
    const pill = (id: string, on: boolean, who: string | null) =>
      this.setText(id, on ? `GRABBED${who ? ` (${who})` : ""}` : "released", on ? "pill on" : "pill");
    pill("clutch-pinch", v.pinch !== null, v.pinch);
    pill("clutch-claw", v.claw !== null, v.claw);
    pill("clutch-two", v.twoHand, null);
  }

  /** The full-width banner, for ~1 s. R3 also uses it for key and button actions. */
  showBanner(main: string, sub: string): void {
    this.bannerMain.textContent = main;
    this.bannerSub.textContent = sub;
    this.banner.hidden = false;
    this.banner.classList.remove("flash");
    void this.banner.offsetWidth; // restart the CSS animation
    this.banner.classList.add("flash");
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.banner.hidden = true), BANNER_MS);
  }

  /**
   * A command fired: banner, sound, log, and the false-fire count. `label` replaces the
   * banner's big text (R3 shows what the music did, e.g. "PAUSE", instead of the shape).
   */
  fire(ev: FireEvent & { hand?: Handedness }, label?: string): void {
    const entry: LogEntry = { at: Date.now(), shape: ev.shape, hand: ev.hand, test: this.fft.running };
    const prev = this.log[0];
    this.log.unshift(entry);
    if (this.log.length > LOG_MAX) this.log.pop();
    if (this.fft.running) this.fft.count++;

    const li = document.createElement("li");
    const gap = prev ? `+${((entry.at - prev.at) / 1000).toFixed(1)} s` : "";
    li.innerHTML =
      `<span class="time">${clock(entry.at)}</span>` +
      `<span class="shape">${ev.hand ? `${ev.hand} ` : ""}${prettyShape(ev.shape)}</span>` +
      `<span class="gap">${gap}${entry.test ? " · test" : ""}</span>`;
    this.logList.prepend(li);
    while (this.logList.children.length > LOG_MAX) this.logList.lastElementChild?.remove();

    this.showBanner(label ?? prettyShape(ev.shape).toUpperCase(), "GESTURE");

    if (this.settings.sound) beep();
    this.renderFalseFire();
  }

  startFalseFireTest(): void {
    this.fft = { running: true, endAt: Date.now() + FFT_MS, count: 0, timer: window.setInterval(() => this.tickFalseFire(), 250) };
    this.fftButton.textContent = "Cancel test";
    this.renderFalseFire();
  }

  private tickFalseFire(): void {
    if (Date.now() >= this.fft.endAt) this.stopFalseFireTest(false);
    else this.renderFalseFire();
  }

  private stopFalseFireTest(cancelled: boolean): void {
    window.clearInterval(this.fft.timer);
    const count = this.fft.count;
    this.fft.running = false;
    this.fftButton.textContent = "Start 2-minute test";
    this.fftStatus.textContent = cancelled ? `False-fire test cancelled: ${count} fires` : `False-fire test done: ${count} fires in 2:00`;
    this.fftStatus.className = "done";
  }

  private renderFalseFire(): void {
    if (!this.fft.running) return;
    const left = Math.max(0, this.fft.endAt - Date.now());
    this.fftStatus.textContent = `False-fire test ${mmss(left)} left · ${this.fft.count} fires`;
    this.fftStatus.className = "running";
  }

  /** For dev inspection. */
  falseFireState(): { running: boolean; count: number } {
    return { running: this.fft.running, count: this.fft.count };
  }
}
