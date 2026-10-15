/**
 * The audio engine: one track, play / pause / toggle / seek, and events. R4 (loops)
 * and R5 (speed) build on this module; nothing else in the app touches the audio element.
 *
 * Why an HTMLAudioElement and not Web Audio:
 *  - The browser decodes and mixes it off the main thread, so the hand model hogging
 *    the page's main thread cannot make the music stutter.
 *  - `currentTime` seeks are sample-accurate for WAV and fine for MP3 (blob URLs are
 *    seekable), and the element streams, so a long track doesn't sit decoded in memory.
 *  - R5 needs speed with the pitch preserved: `playbackRate` + `preservesPitch` does that
 *    natively. Web Audio's AudioBufferSourceNode changes pitch with rate; we'd have to
 *    bring a time-stretch library.
 *  Cost: R4's loop wrap is checked from a timer, not sample-exact. If that proves audibly
 *  loose, a Web Audio engine can replace this behind the same interface.
 *
 * R9 (video): the same engine drives a `<video>` element. An HTMLVideoElement is an HTMLMediaElement with the same
 * clock, seeking, `playbackRate` and `preservesPitch`, so play / pause, restart, the loop wrap, the scrub, the speed and
 * the hold-2x all work unchanged; the picture just follows the clock. The app uses ONE element (a `<video>`) for every
 * file: an audio file has no picture (`hasVideo` is false) and the stage stays on the camera view.
 *
 * The element is injected (`MediaLike`), so the unit tests drive a fake (an audio-like one and a video-like one).
 */

/** The slice of HTMLMediaElement (an audio or a video element) this module uses. */
export interface MediaLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  /** True while a seek has not finished (R4c: the scrub does not stack seeks on one that is still in flight). */
  readonly seeking?: boolean;
  /** R5: playback speed (1 = normal). The browser resets it to the default whenever a new source loads. */
  playbackRate: number;
  /** R5: keep the pitch when the speed changes (the browser time-stretches). */
  preservesPitch?: boolean;
  /** R9: a video element's picture size, 0 until a picture is known (and for an audio-only file). Audio elements have none. */
  readonly videoWidth?: number;
  readonly videoHeight?: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Makes and frees object URLs for dropped files (the real ones are `URL.createObjectURL` / `revokeObjectURL`). */
export interface UrlFactory {
  create(file: Blob): string;
  revoke(url: string): void;
}

/** empty: nothing loaded. ready: loaded, at 0:00, not playing. playing. paused: stopped somewhere past 0:00 (or at the end). */
export type PlayerState = "empty" | "ready" | "playing" | "paused";

export type PlayerEvent =
  | { type: "loaded"; duration: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "ended" }
  | { type: "seeked"; time: number }
  | { type: "rate"; rate: number }
  | { type: "error"; message: string }
  /** The browser refused to start playback (no user activation yet). */
  | { type: "blocked" };

export type PlayerListener = (e: PlayerEvent) => void;

export class AudioPlayer {
  private listeners = new Set<PlayerListener>();
  private url: string | null = null;

  constructor(
    private readonly media: MediaLike,
    private readonly urls: UrlFactory,
  ) {
    const forward = (type: string, make: () => PlayerEvent) => media.addEventListener(type, () => this.emit(make()));
    forward("loadedmetadata", () => ({ type: "loaded", duration: this.duration }));
    forward("play", () => ({ type: "play" }));
    forward("pause", () => ({ type: "pause" }));
    forward("ended", () => ({ type: "ended" }));
    forward("seeked", () => ({ type: "seeked", time: this.currentTime }));
    forward("ratechange", () => ({ type: "rate", rate: this.rate }));
    forward("error", () => ({ type: "error", message: "This file can't be played. Try an MP3, WAV, or an MP4 / WebM video." }));
  }

  /** Playback speed now (1 = normal). */
  get rate(): number {
    return this.media.playbackRate;
  }

  /**
   * Sets the playback speed for the whole track (R5), pitch preserved, and returns what was set (clamped to 0.25..4,
   * the range browsers keep audible). It applies at once, while playing or paused, and stays through seeks and loop
   * wraps; loading another track puts it back to 1x (the browser resets it).
   */
  setRate(rate: number): number {
    const r = Math.min(4, Math.max(0.25, Number.isFinite(rate) ? rate : 1));
    this.keepPitch();
    this.media.playbackRate = r;
    return r;
  }

  private keepPitch(): void {
    const m = this.media as MediaLike & { webkitPreservesPitch?: boolean };
    m.preservesPitch = true;
    if ("webkitPreservesPitch" in m) m.webkitPreservesPitch = true;
  }

  /** Subscribes to events; returns the unsubscribe function. */
  on(listener: PlayerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: PlayerEvent): void {
    for (const l of [...this.listeners]) l(e);
  }

  /** Loads a track and stops whatever was playing. The "loaded" event follows when the length is known. */
  loadFile(file: Blob): void {
    this.loadUrl(this.urls.create(file), true);
  }

  /** Loads from a URL (dev and tests). `owned` URLs are revoked when replaced. */
  loadUrl(url: string, owned = false): void {
    this.media.pause();
    this.releaseUrl();
    if (owned) this.url = url;
    this.media.src = url;
    this.media.load();
    this.media.playbackRate = 1; // a new track starts at normal speed (loading resets it anyway)
  }

  private releaseUrl(): void {
    if (this.url) this.urls.revoke(this.url);
    this.url = null;
  }

  /** R9: the loaded file has a picture (a video), not only sound. */
  get hasVideo(): boolean {
    return this.loaded && (this.media.videoWidth ?? 0) > 0;
  }

  /** True once a track's length is known. */
  get loaded(): boolean {
    return Number.isFinite(this.media.duration) && this.media.duration > 0;
  }

  /** Track length in seconds; 0 when nothing is loaded. */
  get duration(): number {
    return this.loaded ? this.media.duration : 0;
  }

  /** Playhead in seconds. */
  get currentTime(): number {
    return this.loaded ? this.media.currentTime : 0;
  }

  get state(): PlayerState {
    if (!this.loaded) return "empty";
    if (!this.media.paused && !this.media.ended) return "playing";
    return this.media.currentTime > 0 ? "paused" : "ready";
  }

  /**
   * Starts (or resumes, from the same spot). From the very end it starts over at 0:00.
   * Resolves true when playing; false if there is no track or the browser refused
   * (then a "blocked" event is emitted).
   */
  async play(): Promise<boolean> {
    if (!this.loaded) return false;
    if (this.media.ended || this.media.currentTime >= this.media.duration) this.media.currentTime = 0;
    try {
      await this.media.play();
      return true;
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError") this.emit({ type: "blocked" });
      // AbortError: a pause() or a new load arrived first. That is not an error.
      else if (name !== "AbortError") this.emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  pause(): void {
    if (this.loaded) this.media.pause();
  }

  /**
   * Plays if stopped, pauses if playing, and returns what it asked for. The state flips
   * synchronously (the element's `paused` changes on the call), so the UI can read it at once.
   */
  toggle(): "play" | "pause" | "none" {
    if (!this.loaded) return "none";
    if (this.state === "playing") {
      this.pause();
      return "pause";
    }
    void this.play();
    return "play";
  }

  /** A seek is still in flight (the element has not finished moving to the last requested time). */
  get seeking(): boolean {
    return this.media.seeking === true;
  }

  /** Moves the playhead (clamped to the track) without changing playing or paused. Returns where it landed. */
  seek(seconds: number): number {
    if (!this.loaded || !Number.isFinite(seconds)) return this.currentTime;
    const t = Math.min(this.media.duration, Math.max(0, seconds));
    this.media.currentTime = t;
    return t;
  }
}

/**
 * The real thing: a media element and object URLs. Only called in the browser. Pass the page's `<video>` (R9) to play
 * video files with their picture; with none, a bare audio element (audio files only).
 */
export function createBrowserPlayer(element?: HTMLMediaElement): AudioPlayer {
  const media = element ?? new Audio();
  media.preload = "auto";
  return new AudioPlayer(media, {
    create: (f) => URL.createObjectURL(f),
    revoke: (u) => URL.revokeObjectURL(u),
  });
}
