/** Seconds as m:ss.t (the playhead) or m:ss (a length). */
export function formatTime(seconds: number, tenths = true): string {
  const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(s);
  const m = Math.floor(whole / 60);
  const ss = String(whole % 60).padStart(2, "0");
  return tenths ? `${m}:${ss}.${Math.floor((s - whole) * 10)}` : `${m}:${ss}`;
}
