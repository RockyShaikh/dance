import type { MediaLike, UrlFactory } from "../audioPlayer";

/**
 * A stand-in for HTMLAudioElement: it keeps the same rules the player relies on
 * (duration is NaN until the metadata is in, `paused` flips on the play() call, seeking
 * clamps, `ended` at the end) and lets a test advance the clock.
 */
export class FakeMedia implements MediaLike {
  private _src = "";
  private _time = 0;
  private _paused = true;
  private _ended = false;
  private _duration = NaN;
  private _rate = 1;
  /** Like the real element: the pitch is kept when the speed changes (the player turns it on). */
  preservesPitch = false;
  private handlers = new Map<string, Set<() => void>>();
  /** What the next play() does: resolve, or reject with this error name. */
  playError: string | null = null;
  /** The length the "file" will have once loaded. */
  fileDuration = 30;
  loads = 0;

  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    this._duration = NaN;
    this._time = 0;
    this._ended = false;
  }
  get currentTime() {
    return this._time;
  }
  set currentTime(v: number) {
    this._time = Math.min(this._duration, Math.max(0, v));
    this._ended = false;
    this.fire("seeked");
  }
  get duration() {
    return this._duration;
  }
  get playbackRate() {
    return this._rate;
  }
  set playbackRate(v: number) {
    if (v === this._rate) return;
    this._rate = v;
    this.fire("ratechange");
  }
  get paused() {
    return this._paused;
  }
  get ended() {
    return this._ended;
  }
  load() {
    this.loads++;
  }
  /** Test helper: the browser has read the file's header. */
  finishLoading() {
    this._duration = this.fileDuration;
    this.fire("loadedmetadata");
  }
  async play() {
    if (this.playError) {
      const e = new Error("nope");
      e.name = this.playError;
      throw e;
    }
    this._paused = false;
    this.fire("play");
  }
  pause() {
    if (this._paused) return;
    this._paused = true;
    this.fire("pause");
  }
  /** Test helper: `seconds` of real time pass; the music moves `seconds * playbackRate`. */
  advance(seconds: number) {
    if (this._paused) return;
    this._time = Math.min(this._duration, this._time + seconds * this._rate);
    if (this._time >= this._duration) {
      this._ended = true;
      this._paused = true;
      this.fire("pause");
      this.fire("ended");
    }
  }
  fail() {
    this.fire("error");
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.handlers.get(type)?.delete(fn);
  }
  private fire(type: string) {
    for (const h of [...(this.handlers.get(type) ?? [])]) h();
  }
}

export class FakeUrls implements UrlFactory {
  made: string[] = [];
  revoked: string[] = [];
  create(): string {
    const u = `blob:fake/${this.made.length}`;
    this.made.push(u);
    return u;
  }
  revoke(u: string): void {
    this.revoked.push(u);
  }
}

/**
 * A stand-in for HTMLVideoElement (R9): the same clock, seeking and speed rules as the audio fake, plus a picture size that
 * is known once the metadata is in. The player must drive it exactly as it drives audio.
 */
export class FakeVideoMedia extends FakeMedia {
  private _vw = 0;
  private _vh = 0;
  get videoWidth() {
    return this._vw;
  }
  get videoHeight() {
    return this._vh;
  }
  set src(v: string) {
    super.src = v;
    this._vw = 0;
    this._vh = 0;
  }
  get src() {
    return super.src;
  }
  finishLoading() {
    this._vw = 1280;
    this._vh = 720;
    super.finishLoading();
  }
}

/** Every transport / loop / audio test runs against both kinds: `describe.each(MEDIA_KINDS)("%s element", (_name, Media) => ...)`. */
export const MEDIA_KINDS: ReadonlyArray<readonly [string, new () => FakeMedia]> = [
  ["audio", FakeMedia],
  ["video", FakeVideoMedia],
];
