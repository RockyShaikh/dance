// Sim end-to-end for R5b: hold the right thumbs up = 2x (and back), the left shaka + circling wheel = 0.025 speed steps,
// the keys, and the loop wrap and the scrub at slowed speeds.
// Needs the dev server (`npx vite --port 5187`) and a test track (`node scripts/make-test-wav.mjs 120`).
//
//   node scripts/e2e/speed.mjs        prints PASS / FAIL lines and writes screenshots to /tmp/dance-e2e-shots/
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const SHOTS = process.env.DANCE_SHOTS ?? "/tmp/dance-e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const URL = process.env.DANCE_URL ?? "http://localhost:5187/?sim&simfps=30&track=/test/click-track.wav";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9337));
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};
const ev = (code) => p.eval(code);
const shot = (n) => p.shot(`${SHOTS}/${n}.png`);

const prelude = `
  window.T = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    right: (tilt, o = {}) => ({ shape: 'None', hand: 'Right', palm: { x: 0.75, y: 0.5 }, curl: 0, tilt, ...o }),
    left: (shape, o = {}) => ({ shape, hand: 'Left', palm: { x: 0.25, y: 0.5 }, ...o }),
    thumb: (o = {}) => T.right(0, { shape: 'Thumb_Up', curl: 1, ...o }),
    shaka: () => T.left('None', { fingers: '10001' }),
    show: async (specs, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { __dance.setHands(specs); await T.sleep(16); } },
    // Shows the hands until the rate equals 'want' (or ms pass): returns how long it took.
    until: async (specs, want, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { __dance.setHands(specs); await T.sleep(8); if (__dance.player.rate === want) return performance.now() - t0; } return -1; },
    circle: async (left, { rev = 1, ms = 1500, radius = 0.08, dir = 1, rec = null, startDeg = 180 } = {}) => {
      const t0 = performance.now(); const aspect = 16 / 9;
      for (;;) {
        const el = performance.now() - t0; const deg = dir * (el / 1000) * rev * 360; const a = ((startDeg + deg) * Math.PI) / 180;
        __dance.setHands([left, T.right(0, { palm: { x: 0.75 + (radius / aspect) * Math.cos(a), y: 0.5 + radius * Math.sin(a) } })]);
        if (rec) rec.push({ t: el, trueDeg: deg, rate: __dance.player.rate });
        if (el >= ms) break; await T.sleep(16);
      }
    },
    atStart: (left, ms, radius = 0.08) => T.show([left, T.right(0, { palm: { x: 0.75 - radius / (16 / 9), y: 0.5 } })], ms),
    rate: () => __dance.player.rate,
    state: () => __dance.player.state,
    cur: () => __dance.player.currentTime,
    badge: () => { const b = document.getElementById('speed-badge'); return b.hidden ? null : b.textContent; },
    key: (code) => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })),
    fires: () => __dance.log.length,
  };
  T.calls = [];
  { const pl = __dance.player; for (const m of ['seek', 'play', 'pause']) { const o = pl[m].bind(pl); pl[m] = (...a) => { T.calls.push({ t: performance.now(), m, a: a[0] }); return o(...a); }; } }
`;
async function fresh() {
  await p.goto(URL);
  await ev(`localStorage.clear()`);
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,1500))`);
  await ev(prelude);
}

console.log("\n== 1. Hold the right thumbs up: 2x while held, the previous speed back on release");
await fresh();
await ev(`__dance.player.setRate(0.8); __dance.player.seek(10); await __dance.player.play(); await T.sleep(300)`);
check("starts at 0.8x (set), music playing", (await ev(`return T.rate()`)) === 0.8 && (await ev(`return T.state()`)) === "playing");
await ev(`await T.show([T.thumb()], 220)`);
check("thumbs up for 0.22 s (before the 0.3 s arm): still 0.8x", (await ev(`return T.rate()`)) === 0.8);
await ev(`await T.show([], 400)`);
const engage = await ev(`return await T.until([T.thumb()], 2, 3000)`);
check("held: 2x, engaged right after the 0.3 s arm", engage > 250 && engage < 600, `${engage.toFixed(0)} ms from the first frame`);
check("pitch preserved at 2x", (await ev(`const m = __dance.player.media; return m.preservesPitch === true && m.playbackRate === 2`)));
check("the music kept playing, no ring and no command fired", (await ev(`return T.state()`)) === "playing" && (await ev(`return T.fires()`)) === 0);
await ev(`await T.show([T.thumb()], 1500)`);
await shot("01-hold-2x");
check("held 1.5 s more: still 2x, badge shows 2×", (await ev(`return T.rate()`)) === 2 && (await ev(`return T.badge()`)) === "2×");
const t0 = await ev(`return T.cur()`);
await ev(`await T.show([T.thumb()], 1000)`);
check("it plays at 2x while held (about 2 s of music per second)", Math.abs((await ev(`return T.cur()`)) - t0 - 2) < 0.3);
const rel = await ev(`const t0 = performance.now(); for (;;) { __dance.setHands([]); await T.sleep(8); if (__dance.player.rate === 0.8) return performance.now() - t0; if (performance.now() - t0 > 2000) return -1; }`);
check("released (hand gone): back to 0.8x in about 150 ms", rel > 100 && rel < 350, `${rel.toFixed(0)} ms`);
check("badge back to 0.8×, still playing", (await ev(`return T.badge()`)) === "0.8×" && (await ev(`return T.state()`)) === "playing");
await ev(`await T.show([], 800)`);
check("a dropped frame or two does not release (3 frames out of 30 fps)", await ev(`await T.show([T.thumb()], 800); for (let i = 0; i < 3; i++) { __dance.setHands([]); await T.sleep(33); } await T.show([T.thumb()], 300); return T.rate() === 2`));
await ev(`await T.show([], 800)`);
check("...and it is back to 0.8x afterwards", (await ev(`return T.rate()`)) === 0.8);

console.log("\n== 2. What must NOT arm the hold");
await fresh();
await ev(`__dance.player.seek(10); await __dance.player.play(); await T.sleep(300)`);
await ev(`await T.show([T.thumb({ fingers: '00000' })], 2500)`);
check("label Thumb_Up but the thumb is in (a fist): nothing", (await ev(`return T.rate()`)) === 1);
await ev(`await T.show([T.right(0, { shape: 'Closed_Fist', fingers: '10000', curl: 1 })], 2500)`);
check("label Closed_Fist but the thumb is out: no play/pause either", (await ev(`return T.state()`)) === "playing" && (await ev(`return T.rate()`)) === 1);
await ev(`await T.show([], 1000); await T.show([T.thumb({ palm: { x: 0.25, y: 0.5 } })], 2000)`);
check("right thumbs up outside the right hand's box: nothing", (await ev(`return T.rate()`)) === 1);
await ev(`await T.show([], 800); await T.show([T.left('Thumb_Up', { curl: 1 })], 2000)`);
check("LEFT thumbs up: nothing", (await ev(`return T.rate()`)) === 1);
await ev(`await T.show([], 800); await T.show([T.thumb({ away: true })], 700)`);
check("right thumbs up with the back of the hand to the camera: arms", (await ev(`return T.rate()`)) === 2);
await ev(`await T.show([], 600)`);

console.log("\n== 3. Left shaka + circling wheel: 0.025 steps, 72 degrees each, the music keeps playing");
await fresh();
await ev(`__dance.player.seek(40); await __dance.player.play(); await T.sleep(200)`);
await ev(`await T.atStart(T.shaka(), 600)`);
check("shaka + right hand in its box: grabbed, mode speed, still playing at 1x", (await ev(`return JSON.stringify([!!__dance.knob.grabbed, __dance.steer.mode, T.state(), T.rate()])`)) === '[true,"speed","playing",1]');
await ev(`T.calls.length = 0; T.rec = []`);
await ev(`await T.circle(T.shaka(), { dir: -1, rev: 1, ms: 4900, rec: T.rec })`); // 4.9 turns counter-clockwise
await ev(`await T.show([T.shaka(), T.right(0, { palm: { x: 0.75 - 0.08 / (16 / 9), y: 0.5 } })], 300)`);
const rec = JSON.parse(await ev(`return JSON.stringify(T.rec)`));
const seq = [...new Set(rec.map((r) => r.rate))];
const diffs = seq.slice(1).map((v, i) => Math.round((seq[i] - v) * 1000));
check("counter-clockwise: the speed stepped down in exact 0.025 steps, one at a time (20 of them)", diffs.length === 20 && diffs.every((d) => d === 25), `sequence ${seq.join(" ")}`);
const first = rec.find((r) => r.rate < 1);
check("the first step came after about 72 degrees of turning plus the direction latency (not at once, not late)", first && Math.abs(first.trueDeg) >= 72 && Math.abs(first.trueDeg) <= 72 + 110, `first step at ${first ? Math.abs(first.trueDeg).toFixed(0) : "-"} deg of travel`);
const perStep = rec.filter((r) => r.rate <= 0.5)[0];
check("the whole range takes about four circles (1440 degrees from 1.0 to 0.5, plus latency)", perStep && Math.abs(perStep.trueDeg) >= 1440 && Math.abs(perStep.trueDeg) <= 1440 + 120, `0.5x reached at ${perStep ? Math.abs(perStep.trueDeg).toFixed(0) : "-"} deg`);
check("clamped at 0.5x", (await ev(`return T.rate()`)) === 0.5, `rate ${await ev(`return T.rate()`)}`);
check("the music kept PLAYING through all of it: no seek, no pause, no play call", (await ev(`return T.state()`)) === "playing" && (await ev(`return T.calls.length`)) === 0, `calls ${await ev(`return JSON.stringify(T.calls.map((c) => c.m))`)}`);
check("pitch kept at 0.5x", (await ev(`const m = __dance.player.media; return m.preservesPitch === true && m.playbackRate === 0.5`)));
check("the speed is shown (modest badge), no ring fired", (await ev(`return T.badge()`)) === "0.5×" && (await ev(`return T.fires()`)) === 0);
await shot("02-speed-mode-hud");
const bsize = await ev(`const b = document.getElementById('speed-badge').getBoundingClientRect(); return Math.round(b.height)`);
check("the badge is modest (under 70 px tall at this window)", bsize < 70, `${bsize} px`);
await ev(`T.rec = []; await T.circle(T.shaka(), { dir: 1, rev: 1, ms: 4900, rec: T.rec, startDeg: 180 - 4.9 * 360 })`);
await ev(`await T.show([T.shaka(), T.right(0, { palm: { x: 0.75 - 0.08 / (16 / 9), y: 0.5 } })], 300)`);
check("clockwise 4.9 turns: back up to 1.0x and stays there (a natural stop)", (await ev(`return T.rate()`)) === 1);
const held = await ev(`const r = T.rate(); await T.show([T.shaka(), T.right(0)], 1500); return r === T.rate()`);
check("hand held still in speed mode: no change", held);
check("one grab, music never stopped, no command fired", (await ev(`return T.state()`)) === "playing" && (await ev(`return T.fires()`)) === 0);

console.log("\n== 4. Shaka is not a thumbs up or a fist");
await fresh();
await ev(`__dance.player.seek(40); await __dance.player.play(); await T.sleep(200)`);
await ev(`await T.show([T.left('Thumb_Up', { curl: 1 }), T.right(0, { palm: { x: 0.75 - 0.08 / (16 / 9), y: 0.5 } })], 600)`);
check("left thumbs up + right hand: not a shaka (no speed mode; a loose fist does not start a grab)", (await ev(`return JSON.stringify([!!__dance.knob.grabbed, __dance.steer.mode])`)) === "[false,null]");
await ev(`await T.show([], 500); await T.atStart(T.left('Open_Palm'), 600)`);
await ev(`await T.show([T.left('Thumb_Up', { curl: 1 }), T.right(0, { palm: { x: 0.75 - 0.08 / (16 / 9), y: 0.5 } })], 500)`);
await ev(`await T.circle(T.left('Thumb_Up', { curl: 1 }), { dir: -1, rev: 0.5, ms: 2000 })`);
check("during a grab, a left thumbs up is never read as the speed mode, and the speed is untouched", (await ev(`return __dance.steer.mode`)) !== "speed" && (await ev(`return T.rate()`)) === 1);

console.log("\n== 5. Keys: - and = step 0.025 within 0.5..1.0, 0 resets, T toggles");
await fresh();
const down = [];
for (let i = 0; i < 21; i++) {
  await ev(`T.key('Minus')`);
  down.push(await ev(`return T.rate()`));
}
check("- steps down by 0.025 and stops at 0.5", JSON.stringify(down) === JSON.stringify([...Array.from({ length: 20 }, (_, i) => 1 - 0.025 * (i + 1)), 0.5].map((x) => Number(x.toFixed(3)))), down.join(" "));
check("modest badge reads 0.5×", (await ev(`return T.badge()`)) === "0.5×");
await ev(`T.key('Digit0')`);
check("0 resets to 1x, badge gone", (await ev(`return T.rate()`)) === 1 && (await ev(`return T.badge()`)) === null);
await ev(`T.key('Equal')`);
check("= at 1.0 stays (natural stop)", (await ev(`return T.rate()`)) === 1);
await ev(`T.key('KeyT')`);
check("T: 2x", (await ev(`return T.rate()`)) === 2);
await ev(`T.key('KeyT')`);
check("T again: 1x", (await ev(`return T.rate()`)) === 1);
await ev(`for (let i = 0; i < 4; i++) T.key('Minus'); for (let i = 0; i < 2; i++) T.key('Equal')`);
check("- x4 then = x2 lands on 0.95 exactly (no float drift)", (await ev(`return T.rate()`)) === 0.95);

console.log("\n== 6. The loop wrap and the scrub at slowed speeds");
await fresh();
await ev(`__dance.practice.perform('setStart',{markAt:5}); __dance.practice.perform('setEnd',{markAt:7}); __dance.player.seek(5); __dance.player.setRate(0.75); await __dance.player.play(); await T.sleep(100)`);
const w0 = await ev(`return __dance.practice.wrapper.wraps`);
await ev(`await T.sleep(8000)`);
const w1 = (await ev(`return __dance.practice.wrapper.wraps`)) - w0;
check("a 2 s loop at 0.75x wraps every 2.67 s (8 s -> about 3 wraps)", w1 >= 2 && w1 <= 4, `${w1} wraps`);
const hist = JSON.parse(await ev(`return JSON.stringify(__dance.practice.wrapper.history.slice(-3))`));
check("each wrap lands on START, overshoot small (music seconds)", hist.length > 0 && hist.every((h) => Math.abs(h.landedAt - 5) < 0.001 && h.overshootSec >= 0 && h.overshootSec < 0.05), hist.map((h) => h.overshootSec.toFixed(3)).join(" "));
check("still 0.75x and playing", (await ev(`return T.rate()`)) === 0.75 && (await ev(`return T.state()`)) === "playing");

await fresh();
await ev(`__dance.player.setRate(0.6); __dance.player.seek(30); await __dance.player.play(); await T.sleep(200)`);
await ev(`await T.atStart(T.left('Open_Palm'), 600)`);
const c0 = await ev(`return T.cur()`);
await ev(`await T.circle(T.left('Open_Palm'), { dir: 1, rev: 1, ms: 1000 }); await T.show([T.left('Open_Palm'), T.right(0, { palm: { x: 0.75 - 0.08 / (16 / 9), y: 0.5 } })], 400)`);
const c1 = await ev(`return T.cur()`);
check("scrubbing at 0.6x: a clockwise circle moves the playhead ahead (about 3 s per turn plus 0.6 s per second of play)", c1 - c0 > 2.5, `${c0.toFixed(2)} -> ${c1.toFixed(2)}`);
check("still 0.6x and playing after the scrub", (await ev(`return T.rate()`)) === 0.6 && (await ev(`return T.state()`)) === "playing");

console.log(`\n${pass} passed, ${fail} failed`);
p.close();
process.exit(fail ? 1 : 0);
