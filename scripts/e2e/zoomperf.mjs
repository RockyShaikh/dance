// R6 zoom cost: the REAL Gesture Recognizer on Chrome's fake camera (a test pattern, no hands: the palm detector runs on
// every frame, the worst case), with zoom off, on at the default zone, and on at a half-width zone. Prints the fps the app
// reports (capped by the fake camera's own frame rate), the model call's time (the number that matters) and the crop's own draw time. Headless Chrome, so the numbers are relative, not what a laptop GPU will do.
//
//   node scripts/e2e/zoomperf.mjs      (dev server on :5188; Chrome is launched with the fake camera flags and --mute-audio)
import { launch } from "./cdp.mjs";

process.env.DANCE_CHROME_FLAGS ??= "--use-fake-device-for-media-stream --use-fake-ui-for-media-stream";
const BASE = process.env.DANCE_PERF_URL ?? "http://localhost:5188/";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9340));
const ev = (code) => p.eval(code);

const configs = [
  ["zoom off (whole frame)", { zone: { x: 0, y: 0, w: 1, h: 0.25 }, zoom: false }],
  ["zoom on, default zone (full-width top quarter)", { zone: { x: 0, y: 0, w: 1, h: 0.25 }, zoom: true }],
  ["zoom on, half-width zone", { zone: { x: 0.5, y: 0, w: 0.5, h: 0.25 }, zoom: true }],
  ["zoom off again (to see the run-to-run spread)", { zone: { x: 0, y: 0, w: 1, h: 0.25 }, zoom: false }],
];

for (const [name, settings] of configs) {
  await p.goto(BASE);
  await ev(`localStorage.clear(); localStorage.setItem('dance.r2.settings', ${JSON.stringify(JSON.stringify(settings))})`);
  await p.goto(BASE);
  await ev(`await new Promise((r) => setTimeout(r, 4000))`); // model load + warm-up
  const status = await ev(`return document.getElementById('status').textContent`);
  const samples = [];
  for (let i = 0; i < 16; i++) {
    await ev(`await new Promise((r) => setTimeout(r, 500))`);
    samples.push(Number(await ev(`return document.getElementById('fps-value').textContent`)));
  }
  const valid = samples.filter((n) => n > 0);
  const mean = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
  const stats = JSON.parse(await ev(`const d = window.__dance ?? {}; return JSON.stringify({ cropMs: d.cropMs ?? null, recognizeMs: d.recognizeMs ?? null, crop: d.crop ? { srcW: d.crop.srcW, srcH: d.crop.srcH, cw: d.crop.cw, ch: d.crop.ch, side: d.crop.side } : null })`));
  const mag = stats.crop ? (Math.max(stats.crop.srcW, stats.crop.srcH) / stats.crop.side).toFixed(2) : "1.00";
  console.log(`${name.padEnd(48)} fps ${mean.toFixed(1).padStart(5)}  (${status})  model call (crop + inference) ${stats.recognizeMs === null ? "-" : stats.recognizeMs.toFixed(1) + " ms"}  of which crop draw ${stats.cropMs === null ? "-" : stats.cropMs.toFixed(2) + " ms"}  magnification x${mag}  ${stats.crop ? `crop ${stats.crop.cw}x${stats.crop.ch} in a ${stats.crop.side} square` : ""}`);
}
p.close();
process.exit(0);
