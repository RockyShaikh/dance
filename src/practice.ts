import type { AudioPlayer } from "./audioPlayer";
import { LOOP } from "./config";
import { NO_LOOP, type LoopState } from "./loop";
import type { ScrubAction } from "./scrub";
import { LoopWrapper } from "./loopWrap";
import { formatRate } from "./speed";
import { drawOverview } from "./waveDraw";
import { decodePeaks, type Peaks } from "./waveform";
import { formatTime, playheadFraction, runNudge, runTransport, statusWord, type TransportAction, type TransportOptions, type TransportResult } from "./transport";

/**
 * The practice view: file loading (picker and drag-and-drop), the giant status word, the
 * clock and timeline with the loop flags, and the keys and buttons. DOM only; the decisions live
 * in transport.ts and loop.ts. Gestures reach the player from main.ts through `perform`, the same
 * path the keys and buttons use. R4a: this also owns the loop state and the END-to-START wrap.
 */

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

const CLICK_HINT = "Click anywhere on the page once, so Chrome lets your hand start the music.";
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/i;

export function looksLikeAudio(file: { name: string; type: string }): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
}

export interface PracticeHooks {
  /** A key or button ran an action: show the banner (gestures are shown by the bench). */
  announce(label: string, via: "key" | "button"): void;
}

export class Practice {
  private readonly statusEl = el("status-word");
  private readonly rateEl = el("speed-badge");
  private readonly elapsedEl = el("t-elapsed");
  private readonly totalEl = el("t-total");
  private readonly head = el("tl-head");
  private readonly fill = el("tl-fill");
  private readonly timeline = el("timeline");
  private readonly toggleLabel = el("btn-toggle-label");
  private readonly trackName = el("track-name");
  private readonly hint = el("hint");
  private readonly fileInput = el<HTMLInputElement>("file-input");
  private readonly dropOverlay = el("drop-overlay");
  private readonly last = new Map<string, string>();
  private fileName = "";
  private dragDepth = 0;

  // --- R4a: the loop ---
  private readonly regionEl = el("loop-region");
  private readonly flagStart = el("flag-start");
  private readonly flagEnd = el("flag-end");
  private readonly flagStartTime = el("flag-start-time");
  private readonly flagEndTime = el("flag-end-time");
  private readonly nudgeEl = el("nudge-readout");
  private readonly nudgeTime = el("nudge-time");
  private readonly nudgeSub = el("nudge-sub");
  private loop: LoopState = NO_LOOP;
  private nudgeUntil = 0;
  private nudgeNote = "";
  /** R4b: the knob is grabbed, so the START readout stays up. */
  private nudgeHeld = false;
  /** Which time the huge readout shows: the loop START, END or the playhead. */
  private readoutTarget: "start" | "end" | "playhead" = "start";
  private readonly nudgeTitle = el("nudge-title");
  // --- R4c: the waveform ---
  private readonly waveEl = el<HTMLCanvasElement>("tl-wave");
  private peaks: Peaks | null = null;
  /** Bumped by each load, so a slow decode of an earlier track can't land on a newer one. */
  private waveToken = 0;
  /** The zoomed steering view is up (it carries the time itself), so the big readout stays down. */
  private zoomActive = false;
  /** The END-to-START wrap. Public so the dev console can read its measurements. */
  readonly wrapper: LoopWrapper;

  constructor(
    private readonly player: AudioPlayer,
    private readonly hooks: PracticeHooks,
  ) {
    this.wrapper = new LoopWrapper(player, () => this.loop);
    this.wrapper.start();
    el("btn-open").addEventListener("click", () => this.fileInput.click());
    this.fileInput.addEventListener("change", () => {
      const f = this.fileInput.files?.[0];
      if (f) this.load(f);
      this.fileInput.value = ""; // so choosing the same file again still fires
    });
    this.bindButton("btn-toggle", "toggle");
    this.bindButton("btn-restart", "restart");
    this.bindButton("btn-top", "restartTop");
    this.bindButton("btn-loopstep", "loopStep");
    this.bindButton("btn-setstart", "setStart");
    this.bindButton("btn-setend", "setEnd");
    this.bindButton("btn-clear", "clearLoop");
    this.bindButton("btn-speed", "speedToggle");
    this.bindButton("btn-slower", "speedDown");
    this.bindButton("btn-faster", "speedUp");
    this.bindButton("btn-speed-reset", "speedReset");
    for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-nudge]")) {
      btn.addEventListener("click", () => {
        this.nudgeStart(Number(btn.dataset.nudge));
        btn.blur();
      });
    }
    this.bindDrop();
    this.bindKeys();

    player.on((e) => {
      if (e.type === "loaded") {
        this.needClick = this.needsClick();
        this.loop = NO_LOOP; // a new track: the old marks mean nothing
      }
      if (e.type === "blocked") this.needClick = true;
      if (e.type === "error") this.message = e.message;
      this.updateHint();
      this.render();
    });

    // Chrome lets a hand gesture start audio only after the page has seen a click or key.
    const clear = () => {
      this.needClick = false;
      this.updateHint();
    };
    window.addEventListener("resize", () => this.last.delete("loop")); // flag labels are placed by measuring
    new ResizeObserver(() => drawOverview(this.waveEl, this.peaks)).observe(this.timeline);
    document.addEventListener("pointerdown", clear);
    document.addEventListener("keydown", clear);

    const tick = () => {
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** The one entry point for every way of controlling the music. Returns what happened. */
  perform(action: TransportAction, opts: TransportOptions = {}): TransportResult {
    const result = runTransport(this.player, this.loop, action, opts);
    this.loop = result.loop;
    // Setting END while the playhead is already past it starts the loop at once, not at the next pass.
    this.wrapper.check(true);
    this.showHint(result.changed ? null : result.label);
    this.render();
    return result;
  }

  /**
   * Moves the loop START by `deltaSec` (negative = earlier) and shows it huge for a moment. Only the
   * marker moves: index up to hear it. Keys, buttons and (R4b) the knob all come through here.
   */
  nudgeStart(deltaSec: number, opts: { note?: (limited: boolean) => string } = {}): TransportResult {
    return this.nudgeMarker("start", deltaSec, opts);
  }

  /** R4b: the same for the loop END, with the clamps mirrored (END stays at least the minimum gap after START, and inside the track). */
  nudgeEnd(deltaSec: number, opts: { note?: (limited: boolean) => string } = {}): TransportResult {
    return this.nudgeMarker("end", deltaSec, opts);
  }

  private nudgeMarker(which: "start" | "end", deltaSec: number, opts: { note?: (limited: boolean) => string }): TransportResult {
    const result = runNudge(this.player, this.loop, deltaSec, which);
    this.loop = result.loop;
    if (this.loop[which] !== null) {
      this.readoutTarget = which;
      if (!this.nudgeHeld) this.nudgeUntil = performance.now() + LOOP.nudgeReadoutMs;
      const mag = Math.round(Math.abs(deltaSec) * 1000) / 1000;
      this.nudgeNote = opts.note ? opts.note(!!result.limited) : `${deltaSec < 0 ? "−" : "+"}${mag} s${result.limited ? "  LIMIT" : ""}`;
    }
    this.showHint(this.loop[which] === null ? result.label : null);
    this.render();
    return result;
  }

  /**
   * R4b: runs the player calls the scrub asked for (seek, play a snippet, pause). The seek lands on the
   * audio element at once; the playhead on screen follows on the next frame.
   */
  runScrub(actions: readonly ScrubAction[]): void {
    for (const a of actions) {
      if (a.type === "seek") this.player.seek(a.to);
      else if (a.type === "play") void this.player.play();
      else this.player.pause();
    }
    if (actions.length > 0) this.render();
  }

  /**
   * R4b: while the knob is grabbed the huge time of its target (the playhead, the START or the END)
   * stays up, also when nothing is moving, with `note` under it; letting go starts the usual timeout.
   * With no START / END set there is nothing to show for those.
   */
  setNudgeHold(held: boolean, note = "", target: "start" | "end" | "playhead" = this.readoutTarget): void {
    this.nudgeHeld = held;
    this.readoutTarget = target;
    this.nudgeNote = note;
    this.nudgeUntil = held ? Infinity : performance.now() + LOOP.nudgeReadoutMs;
    this.render();
  }

  /** Under the huge START time while the knob is grabbed (a note of how far it has moved). */
  setNudgeNote(note: string): void {
    this.nudgeNote = note;
  }

  /** The decoded peaks of the loaded track (null until decoded, or if it can't be decoded). */
  get waveform(): Peaks | null {
    return this.peaks;
  }

  /** R4c: the zoomed steering view is showing; it carries the target's time itself, so the big readout steps aside. */
  setZoomActive(active: boolean): void {
    this.zoomActive = active;
  }

  /** The loop as the view knows it (for the dev console and tests). */
  get loopState(): LoopState {
    return this.loop;
  }

  load(file: File): void {
    if (!looksLikeAudio(file)) {
      this.showHint(`"${file.name}" is not an audio file. Try an MP3 or WAV.`);
      return;
    }
    this.fileName = file.name;
    this.showHint(null);
    this.player.loadFile(file);
    this.render();
    void this.decodeWaveform(file);
  }

  /** Decodes the track once for the waveform; the player has its own copy and plays regardless. */
  private async decodeWaveform(file: File): Promise<void> {
    const token = ++this.waveToken;
    this.peaks = null;
    drawOverview(this.waveEl, null);
    let peaks: Peaks | null = null;
    try {
      peaks = await decodePeaks(await file.arrayBuffer());
    } catch {
      peaks = null;
    }
    if (token !== this.waveToken) return;
    this.peaks = peaks;
    drawOverview(this.waveEl, peaks);
  }

  private needsClick(): boolean {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    return ua !== undefined && !ua.hasBeenActive;
  }

  private bindButton(id: string, action: TransportAction): void {
    const btn = el<HTMLButtonElement>(id);
    btn.addEventListener("click", () => {
      this.hooks.announce(this.perform(action).label, "button");
      btn.blur(); // so a later Space press is the shortcut, not a second click on this button
    });
  }

  private bindKeys(): void {
    const keyAction = (e: KeyboardEvent): TransportAction | null => {
      if (e.ctrlKey || e.metaKey || e.altKey) return null;
      switch (e.code) {
        case "Space":
          return "toggle";
        case "KeyR":
          return "restart"; // loop START if set, else 0:00 (like index up)
        case "Home":
          return "restartTop"; // 0:00 (keyboard only)
        case "KeyV":
          return "loopStep"; // like V
        case "KeyS":
          return "setStart";
        case "KeyE":
          return "setEnd";
        case "KeyC":
          return "clearLoop";
        case "KeyT":
          return "speedToggle"; // 2x <-> 1x
        case "Minus":
        case "NumpadSubtract":
          return "speedDown"; // R5b: one 0.05 step down (0.5 to 1.0)
        case "Equal":
        case "NumpadAdd":
          return "speedUp";
        case "Digit0":
        case "Numpad0":
          return "speedReset"; // back to 1x
        default:
          return null;
      }
    };
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // [ and ] nudge the loop START by 0.1 s, Shift = 1 s. Holding the key repeats.
      if (e.code === "BracketLeft" || e.code === "BracketRight") {
        e.preventDefault();
        this.blurFocus();
        const step = e.shiftKey ? LOOP.nudgeBigStepSec : LOOP.nudgeStepSec;
        this.nudgeStart(e.code === "BracketLeft" ? -step : step);
        return;
      }
      const action = keyAction(e);
      if (!action) return;
      e.preventDefault();
      // Holding a key must not toggle over and over; for the speed steps, holding is a run of single steps, which is fine.
      if (e.repeat && action !== "speedUp" && action !== "speedDown") return;
      this.blurFocus();
      this.hooks.announce(this.perform(action).label, "key");
    });
    // Space also "clicks" a focused button or checkbox on key-up; swallow that.
    document.addEventListener("keyup", (e) => {
      if (e.code === "Space") e.preventDefault();
    });
  }

  private bindDrop(): void {
    const show = (on: boolean) => (this.dropOverlay.hidden = !on);
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    window.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      this.dragDepth++;
      show(true);
    });
    window.addEventListener("dragover", (e) => {
      if (hasFiles(e)) e.preventDefault(); // required, or the browser opens the file instead
    });
    window.addEventListener("dragleave", (e) => {
      if (!hasFiles(e)) return;
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) show(false);
    });
    window.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      this.dragDepth = 0;
      show(false);
      const f = e.dataTransfer?.files[0];
      if (f) this.load(f);
    });
  }

  private message: string | null = null;
  private needClick = false;

  /** A message about the last action or file; null clears it. */
  private showHint(text: string | null): void {
    this.message = text;
    this.updateHint();
  }

  private updateHint(): void {
    const text = this.message ?? (this.needClick ? CLICK_HINT : null);
    this.hint.hidden = text === null;
    this.hint.textContent = text ?? "";
  }

  private setText(key: string, node: HTMLElement, text: string): void {
    if (this.last.get(key) === text) return;
    this.last.set(key, text);
    node.textContent = text;
  }

  /** Reads the player and updates the status word, clock, timeline and buttons. Cheap enough to run every frame. */
  render(): void {
    const p = this.player;
    const state = p.state;
    const word = statusWord(state, this.loop);
    this.setText("status", this.statusEl, word);
    this.statusEl.dataset.state = word === "LOOP" ? "loop" : state;
    this.setText("elapsed", this.elapsedEl, formatTime(p.currentTime));
    this.setText("total", this.totalEl, `/ ${formatTime(p.duration, false)}`);
    this.setText("toggle", this.toggleLabel, state === "playing" ? "Pause" : "Play");
    // R5: the speed, whenever it is not 1x (R5b: a modest number; hearing it matters more than seeing it).
    const fast = Math.abs(p.rate - 1) > 1e-9;
    if (this.rateEl.hidden === fast) this.rateEl.hidden = !fast;
    if (fast) {
      this.setText("rate", this.rateEl, formatRate(p.rate));
      this.rateEl.dataset.slow = p.rate < 1 ? "1" : "0";
    }
    this.setText("track", this.trackName, state === "empty" && !this.fileName ? "No track loaded. Drop an MP3 or WAV anywhere, or click Open track." : this.fileName);
    const f = playheadFraction(p.currentTime, p.duration);
    const pct = `${(f * 100).toFixed(2)}%`;
    if (this.last.get("pct") !== pct) {
      this.last.set("pct", pct);
      this.head.style.left = pct;
      this.fill.style.width = pct;
      this.timeline.setAttribute("aria-valuemax", String(Math.round(p.duration)));
      this.timeline.setAttribute("aria-valuenow", String(Math.round(p.currentTime)));
    }
    this.renderLoop(p.duration);
  }

  /** The loop flags, the highlighted region, and the huge START time while nudging. */
  private renderLoop(duration: number): void {
    const { start, end } = this.loop;
    const pct = (t: number) => `${(Math.min(1, Math.max(0, t / duration)) * 100).toFixed(2)}%`;
    const showStart = start !== null && duration > 0;
    const showEnd = end !== null && duration > 0;
    const key = `${showStart ? start : "-"}|${showEnd ? end : "-"}|${duration}`;
    if (this.last.get("loop") !== key) {
      this.last.set("loop", key);
      this.flagStart.hidden = !showStart;
      this.flagEnd.hidden = !showEnd;
      this.regionEl.hidden = !(showStart && showEnd);
      if (showStart) {
        this.flagStart.style.left = pct(start as number);
        this.flagStartTime.textContent = formatTime(start as number);
      }
      if (showEnd) {
        this.flagEnd.style.left = pct(end as number);
        this.flagEndTime.textContent = formatTime(end as number);
      }
      if (showStart && showEnd) {
        this.regionEl.style.left = pct(start as number);
        this.regionEl.style.width = pct((end as number) - (start as number));
      }
      this.layoutFlags();
    }

    const shown = this.readoutTarget === "playhead" ? this.player.currentTime : this.loop[this.readoutTarget];
    const nudging = shown !== null && performance.now() < this.nudgeUntil && !this.zoomActive;
    if (this.nudgeEl.hidden === nudging) this.nudgeEl.hidden = !nudging;
    if (nudging) {
      this.setText("nudge-title", this.nudgeTitle, this.readoutTarget === "playhead" ? "PLAYHEAD" : this.readoutTarget === "start" ? "LOOP START" : "LOOP END");
      this.nudgeEl.dataset.target = this.readoutTarget;
      this.setText("nudge-time", this.nudgeTime, formatTime(shown as number));
      this.setText("nudge-sub", this.nudgeSub, this.nudgeNote);
      this.nudgeEl.dataset.limit = this.nudgeNote.includes("LIMIT") ? "1" : "0";
    }
  }

  /**
   * START's label points left of its pole and END's points right, so they never meet. Near an edge
   * of the bar a label is slid back inside; if the two still touch (a very short loop at an edge),
   * END's label goes up a row.
   */
  private layoutFlags(): void {
    const [s, e] = [this.flagStart, this.flagEnd].map((f) => f.firstElementChild as HTMLElement);
    s.style.transform = "";
    e.style.transform = "";
    const bar = this.timeline.getBoundingClientRect();
    if (!this.flagStart.hidden) {
      const r = s.getBoundingClientRect();
      if (r.left < bar.left) s.style.transform = `translateX(${bar.left - r.left}px)`;
    }
    if (!this.flagEnd.hidden) {
      const r = e.getBoundingClientRect();
      if (r.right > bar.right) e.style.transform = `translateX(${bar.right - r.right}px)`;
    }
    if (!this.flagStart.hidden && !this.flagEnd.hidden) {
      const a = s.getBoundingClientRect();
      const b = e.getBoundingClientRect();
      if (a.right > b.left && b.right > a.left) e.style.transform = `${e.style.transform} translateY(-105%)`;
    }
  }

  private blurFocus(): void {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
  }
}
