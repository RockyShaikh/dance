// R8 auto-track comparison: Off vs Person vs Wrists (and Wrists in IMAGE mode) on still images and short clips, with the REAL
// pose + gesture models in headless Chrome (so the times are relative, not what a laptop GPU does; the detection and the palm
// pixels are the real numbers). Media goes in the git-ignored public/test/ (see README, "R8").
//
//   npx vite --port 5190 &
//   node scripts/e2e/track.mjs                       (default media list below)
//   DANCE_MEDIA="image:/test/a.jpg,video:/test/b.mp4" DANCE_SECONDS=8 node scripts/e2e/track.mjs
//
// Per run: load the page with ?image= / ?video= and the mode saved in settings, let the crops settle, reset the counters,
// sample for DANCE_SECONDS, print one row. "palm" = knuckle width in px (index MCP to pinky MCP), in the frame and at the detector.
import { launch } from "./cdp.mjs";

const BASE = process.env.DANCE_PERF_URL ?? "http://localhost:5190/";
const SECONDS = Number(process.env.DANCE_SECONDS ?? 8);
const media = (process.env.DANCE_MEDIA ?? "image:/test/sat-front.jpg,image:/test/sat-arms.jpg,image:/test/sat-arms-s60.jpg,image:/test/sat-arms-s40.jpg,video:/test/sat-clip.mp4,video:/test/sat-clip-s60.mp4,video:/test/sat-clip-s40.mp4").split(",");
const configs = [
  { name: "Off", mode: "off", measure: false },
  { name: "Off+pose(count)", mode: "off", measure: true },
  { name: "Person", mode: "person", measure: true },
  { name: "Wrists(video)", mode: "wrists", measure: true },
  ...(process.env.DANCE_WRISTS_IMAGE === "0" ? [] : [{ name: "Wrists(image)", mode: "wrists", measure: true, wrists: "image" }]),
];
const only = process.env.DANCE_MODES ? process.env.DANCE_MODES.split(",") : null;

const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9341));
const ev = (code) => p.eval(code);
const rows = [];
for (const m of media) {
  const [kind, path] = [m.slice(0, m.indexOf(":")), m.slice(m.indexOf(":") + 1)];
  for (const c of configs) {
    if (only && !only.includes(c.name)) continue;
    await p.goto(BASE);
    await ev(`localStorage.clear(); localStorage.setItem('dance.r2.settings', ${JSON.stringify(JSON.stringify({ autoTrack: c.mode, zoom: false }))})`);
    await p.goto(`${BASE}?${kind}=${path}${c.measure ? "&measure" : ""}${c.wrists ? `&wrists=${c.wrists}` : ""}`);
    let ok = false;
    for (let i = 0; i < 120 && !ok; i++) {
      await ev(`await new Promise((r) => setTimeout(r, 500))`);
      ok = await ev(`const t = window.__dance?.tracker; return !!t && !t.loading && !!t.last && t.mode === ${JSON.stringify(c.mode)}`);
    }
    if (!ok) {
      rows.push({ media: path, name: c.name, error: "tracker never ready" });
      continue;
    }
    await ev(`await new Promise((r) => setTimeout(r, 2500))`); // let the crops settle
    await ev(`window.__dance.tracker.stats.reset()`);
    const samples = [];
    for (let i = 0; i < SECONDS * 4; i++) {
      await ev(`await new Promise((r) => setTimeout(r, 250))`);
      samples.push(
        JSON.parse(
          await ev(`const t = window.__dance.tracker, f = t.last; return JSON.stringify({ fps: Number(document.getElementById('fps-value').textContent), poseMs: t.poseMs, gestureMs: t.gestureMs, hands: f.hands, crops: f.crops.map((x) => ({ label: x.label, mag: x.magnification, w: x.layout.cw, h: x.layout.ch })), note: f.note })`),
        ),
      );
    }
    const st = JSON.parse(await ev(`const s = window.__dance.tracker.stats, tr = window.__dance.tracker; return JSON.stringify({ moved: tr.cropFrames ? (100 * tr.cropMoved) / tr.cropFrames : 0, frames: s.frames, hand: s.handFrames, wrist: s.wristFrames, handWhenWrist: s.handWhenWrist, pose: s.poseFrames, poseRan: s.poseRan })`));
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    const hs = samples.flatMap((s) => s.hands);
    const mags = samples.map((s) => (s.crops.length ? Math.min(...s.crops.map((c) => c.mag)) : 1));
    const row = {
      media: path,
      name: c.name,
      frames: st.frames,
      handPct: (100 * st.hand) / Math.max(1, st.frames),
      wristPct: st.poseRan ? (100 * st.wrist) / Math.max(1, st.frames) : NaN,
      handWhenWristPct: st.wrist ? (100 * st.handWhenWrist) / st.wrist : NaN,
      moved: st.moved,
      handsMean: mean(samples.map((s) => s.hands.length)),
      palmFrame: mean(hs.map((h) => h.framePx)),
      palmDet: mean(hs.map((h) => h.detectorPx)),
      lenFrame: mean(hs.map((h) => h.lenPx)),
      lenDet: mean(hs.map((h) => h.lenDetectorPx)),
      mag: mean(mags),
      poseMs: mean(samples.map((s) => s.poseMs)),
      gestureMs: mean(samples.map((s) => s.gestureMs)),
      fps: mean(samples.map((s) => s.fps).filter((n) => n > 0)),
      note: samples[samples.length - 1].note,
    };
    rows.push(row);
    const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "-");
    console.log(
      `${path.padEnd(26)} ${c.name.padEnd(16)} hand ${f(row.handPct, 0).padStart(3)}%  (while pose sees a wrist ${f(row.handWhenWristPct, 0)}%)  hands/frame ${f(row.handsMean, 2)}  palm ${f(row.palmFrame)} px frame / ${f(row.palmDet)} px at detector (hand length ${f(row.lenFrame, 0)} / ${f(row.lenDet)})  mag x${f(row.mag, 2)}  pose ${f(row.poseMs)} ms  gesture ${f(row.gestureMs)} ms  fps ${f(row.fps)}  crop changed ${f(row.moved, 0)}% of frames  | ${row.note}`,
    );
  }
}
if (process.env.DANCE_JSON) console.log(JSON.stringify(rows));
p.close();
process.exit(0);
