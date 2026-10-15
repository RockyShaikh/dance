/** A short Web Audio beep on fire. */

let ctx: AudioContext | null = null;

/** Browsers only allow audio after a user gesture, so this is called from clicks and key presses. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null; // no Web Audio: stay silent
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** Returns true if a sound was scheduled (false when audio is locked or unavailable). */
export function beep(): boolean {
  if (!ctx || ctx.state !== "running") return false;
  tone(ctx, 880, ctx.currentTime, 0.12);
  return true;
}
