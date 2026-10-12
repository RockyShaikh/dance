import type { AudioPlayer } from "./audioPlayer";
import { formatTime, playheadFraction, runTransport, statusWord, type TransportAction, type TransportResult } from "./transport";

/**
 * R3's practice view: file loading (picker and drag-and-drop), the giant status word, the
 * clock and timeline, and the keys and buttons. DOM only; the decisions live in transport.ts.
 * Gestures reach the player from main.ts through `perform`, the same path the keys and buttons use.
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

  constructor(
    private readonly player: AudioPlayer,
    private readonly hooks: PracticeHooks,
  ) {
    el("btn-open").addEventListener("click", () => this.fileInput.click());
    this.fileInput.addEventListener("change", () => {
      const f = this.fileInput.files?.[0];
      if (f) this.load(f);
      this.fileInput.value = ""; // so choosing the same file again still fires
    });
    this.bindButton("btn-toggle", "toggle");
    this.bindButton("btn-restart", "restart");
    this.bindDrop();
    this.bindKeys();

    player.on((e) => {
      if (e.type === "loaded") this.needClick = this.needsClick();
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
    document.addEventListener("pointerdown", clear);
    document.addEventListener("keydown", clear);

    const tick = () => {
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** The one entry point for every way of controlling the music. Returns what happened. */
  perform(action: TransportAction): TransportResult {
    const result = runTransport(this.player, action);
    this.showHint(result.changed ? null : result.label);
    this.render();
    return result;
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
      if (e.code === "Space") return "toggle";
      if (e.code === "Home" || e.code === "KeyR") return "restart";
      return null;
    };
    document.addEventListener("keydown", (e) => {
      const action = keyAction(e);
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return; // holding a key must not toggle over and over
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
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
    this.setText("status", this.statusEl, statusWord(state));
    this.statusEl.dataset.state = state;
    this.setText("elapsed", this.elapsedEl, formatTime(p.currentTime));
    this.setText("total", this.totalEl, `/ ${formatTime(p.duration, false)}`);
    this.setText("toggle", this.toggleLabel, state === "playing" ? "Pause" : "Play");
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
  }
}
