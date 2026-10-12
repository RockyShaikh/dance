// Writes a test track for R3 (no downloaded music): 60 s, 120 bpm, mono 16-bit WAV.
// Every beat is a click plus a short note; the note climbs a scale over 8 beats (one 4 s phrase),
// and beat 1 of each phrase is louder, so you can hear where a seek or a restart landed.
//
//   node scripts/make-test-wav.mjs [seconds] [outfile]
//
// Default output is public/test/click-track.wav (git-ignored).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const seconds = Number(process.argv[2] ?? 60);
const out = process.argv[3] ?? "public/test/click-track.wav";
const rate = 44100;
const bpm = 120;
const beat = 60 / bpm;
const scale = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25]; // C major

const n = Math.floor(seconds * rate);
const pcm = new Int16Array(n);
for (let i = 0; i < n; i++) {
  const t = i / rate;
  const b = Math.floor(t / beat);
  const into = t - b * beat; // seconds since this beat began
  const accent = b % 8 === 0 ? 1 : 0.6;
  const click = into < 0.02 ? (Math.random() * 2 - 1) * (1 - into / 0.02) : 0;
  const note = Math.sin(2 * Math.PI * scale[b % 8] * t) * Math.exp(-into * 6) * 0.6;
  pcm[i] = Math.round(Math.max(-1, Math.min(1, (click * 0.5 + note) * accent)) * 0.8 * 32767);
}

const data = Buffer.from(pcm.buffer);
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, data]));
console.log(`wrote ${out}: ${seconds} s, ${(44 + data.length) / 1e6} MB`);
