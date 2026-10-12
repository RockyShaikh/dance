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
  /** Test helper: playback advances. */
  advance(seconds: number) {
    if (this._paused) return;
    this._time = Math.min(this._duration, this._time + seconds);
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
