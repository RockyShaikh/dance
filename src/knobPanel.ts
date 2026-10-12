import { KNOB } from "./config";
import { normalizeChoice } from "./knob";
import { formatResults, loadLog, markVariant, recordNudge, saveLog, setNote, variantKey, type KnobLog } from "./knobLog";
import {
  CLUTCH_NAMES,
  CLUTCHES,
  MAPPING_NAMES,
  MAPPINGS,
  MOTION_NAMES,
  MOTIONS,
  saveKnobSettings,
  type KnobSettings,
} from "./knobSettings";

/** The knob's settings panel and experiment log (collapsible). DOM only; the decisions are in knob*.ts. */

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

function fill<T extends string>(select: HTMLSelectElement, values: readonly T[], names: Record<T, string>): void {
  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = names[v];
    select.append(o);
  }
}

export class KnobPanel {
  private log: KnobLog = loadLog();
  private readonly clutch = el<HTMLSelectElement>("knob-clutch");
  private readonly motion = el<HTMLSelectElement>("knob-motion");
  private readonly mapping = el<HTMLSelectElement>("knob-mapping");
  private readonly gain = el<HTMLInputElement>("knob-gain");
  private readonly dead = el<HTMLInputElement>("knob-dead");
  private readonly invert = el<HTMLInputElement>("knob-invert");
  private readonly note = el<HTMLInputElement>("knob-note");
  private copiedTimer = 0;

  /** `onChange` runs after the user changes the variant or a slider (the caller resets the knob mid-grab). */
  constructor(
    private readonly settings: KnobSettings,
    private readonly onChange: () => void,
  ) {
    fill(this.clutch, CLUTCHES, CLUTCH_NAMES);
    fill(this.motion, MOTIONS, MOTION_NAMES);
    fill(this.mapping, MAPPINGS, MAPPING_NAMES);
    this.gain.min = String(KNOB.gainMin);
    this.gain.max = String(KNOB.gainMax);
    this.gain.step = "0.05";
    this.dead.min = String(KNOB.deadZoneMinDeg);
    this.dead.max = String(KNOB.deadZoneMaxDeg);
    this.dead.step = "1";

    this.clutch.addEventListener("change", () => this.edit(() => (this.settings.clutch = this.clutch.value as KnobSettings["clutch"])));
    this.motion.addEventListener("change", () => this.edit(() => (this.settings.motion = this.motion.value as KnobSettings["motion"])));
    this.mapping.addEventListener("change", () => this.edit(() => (this.settings.mapping = this.mapping.value as KnobSettings["mapping"])));
    this.gain.addEventListener("input", () => this.edit(() => (this.settings.gain = Number(this.gain.value))));
    this.dead.addEventListener("input", () => this.edit(() => (this.settings.deadZoneDeg = Number(this.dead.value))));
    this.invert.addEventListener("change", () => this.edit(() => (this.settings.invert = this.invert.checked)));

    el("knob-best").addEventListener("click", () => this.mark("best"));
    el("knob-poor").addEventListener("click", () => this.mark("poor"));
    this.note.addEventListener("input", () => {
      this.log = setNote(this.log, this.key(), this.note.value);
      saveLog(this.log);
    });
    el("knob-copy").addEventListener("click", () => void this.copy());
    el("knob-reset").addEventListener("click", () => {
      if (!window.confirm("Clear the whole experiment log?")) return;
      this.log = {};
      saveLog(this.log);
      this.sync();
    });
    // Keys typed in the note box must not trigger the practice shortcuts (Space, V, R ...).
    this.note.addEventListener("keydown", (e) => e.stopPropagation());
    this.sync();
  }

  private key(): string {
    return variantKey(this.settings);
  }

  private edit(apply: () => void): void {
    apply();
    Object.assign(this.settings, normalizeChoice(this.settings));
    saveKnobSettings(this.settings);
    this.sync();
    this.onChange();
    // So a later Space press is the play/pause shortcut, not a change to the dropdown.
    if (document.activeElement instanceof HTMLSelectElement) document.activeElement.blur();
  }

  private mark(kind: "best" | "poor"): void {
    this.log = markVariant(this.log, this.key(), kind);
    saveLog(this.log);
    this.sync();
  }

  /** A grab ended having moved the START: counts as one loop start nudged with this variant. */
  countNudge(): void {
    this.log = recordNudge(this.log, this.key());
    saveLog(this.log);
    this.sync();
  }

  private async copy(): Promise<void> {
    const text = formatResults(this.log, this.settings, new Date().toISOString().slice(0, 10));
    const out = el("knob-copied");
    try {
      await navigator.clipboard.writeText(text);
      out.textContent = "copied";
    } catch {
      // No clipboard access: show the text so it can be selected by hand.
      window.prompt("Copy this:", text);
      out.textContent = "";
    }
    window.clearTimeout(this.copiedTimer);
    this.copiedTimer = window.setTimeout(() => (out.textContent = ""), 2000);
  }

  /** The knob state pill in the summary line. */
  setState(text: string, on: boolean): void {
    const pill = el("knob-state");
    if (pill.textContent !== text) pill.textContent = text;
    pill.className = on ? "pill on" : "pill";
  }

  /** Shows the settings and the current variant's tally. */
  sync(): void {
    const s = this.settings;
    this.clutch.value = s.clutch;
    this.motion.value = s.motion;
    this.mapping.value = s.mapping;
    for (const o of Array.from(this.mapping.options)) o.disabled = (o.value === "jog") !== (s.motion === "circling");
    this.gain.value = String(s.gain);
    this.dead.value = String(s.deadZoneDeg);
    this.invert.checked = s.invert;
    el("knob-gain-value").textContent = `${s.gain.toFixed(2)}×`;
    el("knob-dead-value").textContent = `${s.deadZoneDeg.toFixed(0)}°`;
    this.dead.disabled = s.mapping !== "joystick";
    const name = `${CLUTCH_NAMES[s.clutch]} · ${MOTION_NAMES[s.motion]} · ${MAPPING_NAMES[s.mapping]}`;
    el("knob-label").textContent = name;
    el("knob-variant").textContent = name;
    const t = this.log[this.key()];
    el("knob-tally").innerHTML = `<span class="k">Starts nudged · felt best · not great</span><span class="v">${t?.nudges ?? 0} · ${t?.best ?? 0} · ${t?.poor ?? 0}</span>`;
    if (document.activeElement !== this.note) this.note.value = t?.note ?? "";
  }
}
