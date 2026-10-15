/**
 * R4c: the waveform's data. A track is decoded once (Web Audio `decodeAudioData`), reduced to min / max
 * peaks per small bin (about 1.5 ms), and only those peaks are ever read after that: the timeline reads them
 * once per load and resize, and the zoomed steering view reads a few seconds of them per frame. Nothing is
 * decoded or scanned per frame.
 *
 * `computePeaks` and `peakColumns` are pure (the tests cover them); `decodePeaks` is the browser part.
 */
import { WAVE } from "./config";

export interface Peaks {
  /** Seconds covered by one bin. */
  binSec: number;
  /** Track length, seconds. */
  duration: number;
  /** Per bin, the lowest and highest sample (-1..1), over all channels. */
  min: Float32Array;
  max: Float32Array;
  /** What to multiply by so the loudest peak fills the view (>= 1, capped so a silent track stays flat). */
  gain: number;
}

/** Reduces decoded channels to peaks: one min / max pair per `binSamples` samples (a short last bin is kept). */
export function computePeaks(channels: readonly Float32Array[], sampleRate: number, binSamples: number = WAVE.binSamples): Peaks {
  const length = channels.reduce((n, c) => Math.max(n, c.length), 0);
  const bins = Math.max(1, Math.ceil(length / binSamples));
  const min = new Float32Array(bins);
  const max = new Float32Array(bins);
  let loudest = 0;
  for (let b = 0; b < bins; b++) {
    const from = b * binSamples;
    let lo = 0;
    let hi = 0;
    for (const ch of channels) {
      const to = Math.min(ch.length, from + binSamples);
      for (let i = from; i < to; i++) {
        const v = ch[i];
        if (v < lo) lo = v;
        else if (v > hi) hi = v;
      }
    }
    min[b] = lo;
    max[b] = hi;
    loudest = Math.max(loudest, -lo, hi);
  }
  return { binSec: binSamples / sampleRate, duration: length / sampleRate, min, max, gain: loudest > 0.02 ? Math.min(8, 1 / loudest) : 1 };
}

export interface Columns {
  min: Float32Array;
  max: Float32Array;
}

/**
 * The peaks for `columns` equal slices of the time range [t0, t1] (the view's pixels), so a drawer can draw
 * one vertical line per column. Time before 0:00 or after the end is silent (zeros). A column that falls
 * between two bins (zoomed in past the bin size) takes the bin it lies in.
 */
export function peakColumns(p: Peaks, t0: number, t1: number, columns: number): Columns {
  const min = new Float32Array(columns);
  const max = new Float32Array(columns);
  const span = t1 - t0;
  if (!(span > 0) || columns <= 0) return { min, max };
  const last = p.min.length - 1;
  for (let c = 0; c < columns; c++) {
    const a = t0 + (span * c) / columns;
    const b = t0 + (span * (c + 1)) / columns;
    if (b <= 0 || a >= p.duration) continue;
    const b0 = Math.min(last, Math.max(0, Math.floor(a / p.binSec)));
    const b1 = Math.min(last, Math.max(b0, Math.ceil(b / p.binSec) - 1));
    let lo = 0;
    let hi = 0;
    for (let i = b0; i <= b1; i++) {
      if (p.min[i] < lo) lo = p.min[i];
      if (p.max[i] > hi) hi = p.max[i];
    }
    min[c] = lo;
    max[c] = hi;
  }
  return { min, max };
}

/** Decodes an audio file's bytes to peaks. Null when the browser can't decode it (the player may still play it). */
export async function decodePeaks(data: ArrayBuffer): Promise<Peaks | null> {
  try {
    const Ctx: typeof OfflineAudioContext | undefined = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctx) return null;
    // A tiny offline context only to decode: the audio comes back resampled to `decodeRate`, which keeps memory small.
    const ctx = new Ctx(1, 1, WAVE.decodeRate);
    const audio = await ctx.decodeAudioData(data);
    const channels: Float32Array[] = [];
    for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c));
    return computePeaks(channels, audio.sampleRate);
  } catch {
    return null;
  }
}
