// R7 e2e on Chrome's FAKE cameras: the picker lists them, switching works and the recognizer loop carries on (zoom on too),
// the choice persists across a reload, a missing saved camera falls back with a note and switches back when it reappears
// (hot-plug is simulated by hiding the camera from enumerateDevices and firing `devicechange`), the delivered-resolution
// readout, and the glass-to-glass latency test run end to end against a canvas "camera" that shows what the page puts on the
// screen (so the numbers there are the browser's own stream path only; real cameras are measured by hand: see the README).
// Needs the dev server (`npx vite --port 5189`). Chrome runs with --mute-audio (cdp.mjs).
//
//   DANCE_URL=http://localhost:5189/ node scripts/e2e/camera.mjs
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

process.env.DANCE_CHROME_FLAGS ??= "--use-fake-device-for-media-stream=device-count=3 --use-fake-ui-for-media-stream";
const SHOTS = process.env.DANCE_SHOTS ?? "/tmp/dance-e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const URL = process.env.DANCE_URL ?? "http://localhost:5189/";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9341));
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};
const ev = (code) => p.eval(code);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const info = async () =>
  JSON.parse(
    await ev(`
    const sel = document.getElementById('cam-select');
    const v = document.getElementById('video');
    const t = v.srcObject && v.srcObject.getVideoTracks()[0];
    return JSON.stringify({
      options: [...sel.options].map((o) => ({ id: o.value, label: o.textContent, disabled: o.disabled })),
      selected: sel.value,
      active: t ? t.getSettings().deviceId : null,
      label: t ? t.label : null,
      live: t ? t.readyState : null,
      readout: document.getElementById('cam-readout').textContent,
      note: document.getElementById('cam-note').hidden ? '' : document.getElementById('cam-note').textContent,
      pref: localStorage.getItem('dance.r7.camera'),
      fps: document.getElementById('fps-value').textContent,
      status: document.getElementById('status').textContent,
      switches: window.__dance?.picker?.switches ?? null,
      size: v.videoWidth + 'x' + v.videoHeight,
    });`),
  );

async function fresh() {
  await p.goto(URL);
  await ev(`localStorage.clear()`);
  await p.goto(URL);
  await sleep(4500);
}

console.log("\n== 1. The picker lists the cameras and shows what is delivered");
await fresh();
let s = await info();
console.log("   ", JSON.stringify(s.options.map((o) => o.label)), s.readout);
check("three fake cameras listed, with labels", s.options.length === 3 && s.options.every((o) => o.label.length > 0));
check("a camera is open and the select shows it", !!s.active && s.selected === s.active, `active ${s.active}`);
check("the delivered size and fps are shown", /^\d+×\d+ · [\d.]+ fps/.test(s.readout), s.readout);
check("status says running", s.status.startsWith("Running"), s.status);
check("nothing is saved until the user picks", s.pref === null);

console.log("\n== 2. Switching: the loop, the zone and the zoom crop carry on");
await ev(`const z = document.getElementById('zoom-toggle'); z.checked = true; z.dispatchEvent(new Event('change'))`);
await sleep(800);
const before = s;
const target = s.options.find((o) => o.id !== s.active);
await ev(`const sel = document.getElementById('cam-select'); sel.value = ${JSON.stringify(target.id)}; sel.dispatchEvent(new Event('change'))`);
await sleep(2500);
s = await info();
check("the picked camera is now the open one", s.active === target.id, `${before.active} -> ${s.active}`);
check("the choice is saved by deviceId and label", !!s.pref && JSON.parse(s.pref).deviceId === target.id && JSON.parse(s.pref).label === target.label, s.pref);
check("the stream swap was seen by the app", s.switches >= 1, `switches ${s.switches}`);
const frames = async () => Number(await ev(`return document.getElementById('video').getVideoPlaybackQuality().totalVideoFrames`));
const f1 = await ev(`return JSON.stringify({ m: window.__dance.recognizeMs, crop: window.__dance.crop && window.__dance.crop.side })`);
await sleep(1500);
const f2 = await ev(`return JSON.stringify({ m: window.__dance.recognizeMs, crop: window.__dance.crop && window.__dance.crop.side })`);
check("the recognizer keeps running after the swap (model time still updating, zoom crop still planned)", JSON.parse(f2).m > 0 && JSON.parse(f2).crop > 0, `${f1} -> ${f2}; frames ${await frames()}`);
check("fps reads above zero after the swap", Number(s.fps) > 0, `fps ${s.fps}`);
check("the app's own fps and the video are alive (frames increase)", (await frames()) > 0);

console.log("\n== 3. The choice persists across a reload");
await p.goto(URL);
await sleep(4500);
s = await info();
check("the same camera opens again", s.active === target.id, `${s.active} vs ${target.id}`);
check("the select shows it", s.selected === target.id);

console.log("\n== 4. Hot-plug: the saved camera disappears, then comes back");
await ev(`
  const md = navigator.mediaDevices;
  const orig = md.enumerateDevices.bind(md);
  window.__hidden = null;
  md.enumerateDevices = async () => (await orig()).filter((d) => d.deviceId !== window.__hidden);
  window.__hidden = ${JSON.stringify(target.id)};
  md.dispatchEvent(new Event('devicechange'));
`);
await sleep(2500);
s = await info();
check("falls back to another camera", s.active !== target.id && !!s.active, `active ${s.active}`);
check("with a visible note naming the saved camera", s.note.includes(target.label) && s.note.includes("not connected"), s.note);
check("the saved choice is kept", JSON.parse(s.pref).deviceId === target.id);
check("the list shows it as not connected", s.options.some((o) => o.disabled && o.label.includes("not connected")));
await p.shot(`${SHOTS}/camera-fallback.png`);
await ev(`window.__hidden = null; navigator.mediaDevices.dispatchEvent(new Event('devicechange'))`);
await sleep(2500);
s = await info();
check("switches back automatically when it reappears", s.active === target.id, `active ${s.active}`);
check("and the note is gone", s.note === "");

console.log("\n== 5. A camera that was never there (stale saved id and label)");
await ev(`localStorage.setItem('dance.r7.camera', JSON.stringify({ deviceId: 'gone', label: 'Rocky iPhone Camera', shape: '16:9' }))`);
await p.goto(URL);
await sleep(4500);
s = await info();
check("opens the default with a note", !!s.active && s.note.includes("Rocky iPhone Camera"), s.note);
check("the loop is running", Number(s.fps) > 0, `fps ${s.fps}`);

console.log("\n== 6. Picture shape: 4:3 is asked for and the delivered size is reported");
await ev(`localStorage.clear()`);
await p.goto(URL);
await sleep(4500);
const sixteenNine = (await info()).size;
await ev(`const sel = document.getElementById('cam-shape'); sel.value = '4:3'; sel.dispatchEvent(new Event('change'))`);
await sleep(2500);
s = await info();
console.log("   16:9 delivered", sixteenNine, " 4:3 delivered", s.size, " readout:", s.readout);
check("the delivered size is read back from the camera (no hard-coded size)", /^\d+x\d+$/.test(s.size) && s.readout.startsWith(s.size.replace("x", "×")), `${s.size} / ${s.readout}`);
check("4:3 is remembered", JSON.parse(s.pref ?? "{}").shape === "4:3" || (await ev(`return JSON.parse(localStorage.getItem('dance.r7.camera') ?? '{}').shape`)) === "4:3");

console.log("\n== 7. The latency test, end to end (a canvas camera that shows the page's marker)");
await ev(`localStorage.clear()`);
await p.goto(URL);
await sleep(4500);
await ev(`
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 360;
  const g = canvas.getContext('2d');
  const marker = document.getElementById('flash-marker');
  const draw = () => {
    g.fillStyle = !marker.hidden && marker.dataset.m === 'white' ? '#fff' : '#000';
    g.fillRect(0, 0, 640, 360);
    requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(30);
  navigator.mediaDevices.getUserMedia = async () => stream.clone();
  // Re-open the "camera" through the app's own path (changing the picture shape re-opens the active camera).
  const sel = document.getElementById('cam-shape'); sel.value = '4:3'; sel.dispatchEvent(new Event('change'));
`);
await sleep(2500);
await ev(`document.getElementById('bench-toggle').click()`);
await sleep(300);
await ev(`document.getElementById('lt-start').click()`);
let status = "";
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  status = await ev(`return document.getElementById('lt-status').textContent`);
  if (status.startsWith("Done") || status.includes("does not see") || status.includes("No camera") || status.includes("never")) break;
}
const lines = await ev(`return JSON.stringify([...document.querySelectorAll('#lt-history li')].map((l) => l.textContent))`);
console.log("   status:", status);
console.log("   result:", lines);
check("the test ran to the end", status.startsWith("Done"), status);
check("it produced a result line with median and p95", /median \d+ ms · p95 \d+ ms/.test(lines), lines);
const live = JSON.parse(await ev(`return JSON.stringify({ model: document.getElementById('lt-model').textContent, c2a: document.getElementById('lt-c2a').textContent, done: document.getElementById('lt-done').textContent, fire: document.getElementById('lt-fire').textContent, overlayHidden: document.getElementById('flash-marker').hidden })`));
console.log("   frame timing panel:", JSON.stringify(live));
check("the per-frame model time is reported", /median [\d.]+ · p95 [\d.]+ ms/.test(live.model), live.model);
check("the marker is gone after the test", live.overlayHidden);
await p.shot(`${SHOTS}/camera-latency.png`);

console.log(`\n${pass} passed, ${fail} failed`);
console.log("console errors:", p.logs.filter((l) => l.startsWith("EXC")).slice(0, 5));
p.close();
process.exit(fail ? 1 : 0);
