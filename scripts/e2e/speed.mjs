// Sim end-to-end for R5: the speed toggle (right-hand thumbs up, keys), the big speed badge, and the loop wrap and
// the scrub at 2x. Needs the dev server (`npx vite --port 5178`) and a test track (`node scripts/make-test-wav.mjs 120`).
//
//   node scripts/e2e/speed.mjs        prints PASS / FAIL lines and writes screenshots to /tmp/dance-e2e-shots/
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const SHOTS = process.env.DANCE_SHOTS ?? "/tmp/dance-e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const URL = process.env.DANCE_URL ?? "http://localhost:5178/?sim&simfps=30&track=/test/click-track.wav";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9337));
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};
const ev = (code) => p.eval(code);

const prelude = `
  window.T = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    right: (tilt, o = {}) => ({ shape: 'None', hand: 'Right', palm: { x: 0.75, y: 0.5 }, curl: 0, tilt, ...o }),
    left: (shape, o = {}) => ({ shape, hand: 'Left', palm: { x: 0.25, y: 0.5 }, ...o }),
    show: async (specs, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { __dance.setHands(specs); await T.sleep(16); } },
    turn: async (left, a, b, ms) => { const t0 = performance.now(); for (;;) { const f = Math.min(1, (performance.now() - t0) / ms); __dance.setHands([left, T.right(a + (b - a) * f)]); if (f >= 1) break; await T.sleep(16); } },
    rate: () => __dance.player.rate,
    state: () => __dance.player.state,
    cur: () => __dance.player.currentTime,
    badge: () => { const b = document.getElementById('speed-badge'); return b.hidden ? null : b.textContent; },
    key: (code) => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })),
  };
`;
async function fresh() {
  await p.goto(URL);
  await ev(`localStorage.clear()`);
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,1500))`);
  await ev(prelude);
  await ev(`T.set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input')); }; T.set('knob-motion', 'tilt'); T.set('knob-mapping', 'relative')`); // the tilt wheel (R4d's default is circling; hands.mjs)
}
const shot = (n) => p.shot(`${SHOTS}/${n}.png`);

console.log("\n== 1. Thumbs up toggles 2x and 1x; the music just keeps playing");
await fresh();
await ev(`__dance.player.seek(10); await __dance.player.play(); await T.sleep(400)`);
check("starts at 1x, no badge", (await ev(`return T.rate()`)) === 1 && (await ev(`return T.badge()`)) === null);
const fires0 = await ev(`return __dance.log.length`);
const at0 = await ev(`return T.cur()`);
await ev(`await T.show([T.right(0, { shape: 'Thumb_Up', curl: 1 })], 3000)`);
check("right thumbs up (held 3 s): 2x, once", (await ev(`return T.rate()`)) === 2 && (await ev(`return __dance.log.length`)) === fires0 + 1, `rate ${await ev(`return T.rate()`)}, fires +${(await ev(`return __dance.log.length`)) - fires0}`);
check("the music kept playing through it, and ran at 2x after the ring filled", (await ev(`return T.state()`)) === "playing" && (await ev(`return T.cur()`)) - at0 > 3 + 1.5, `${at0.toFixed(2)} -> ${(await ev(`return T.cur()`)).toFixed(2)} in ~3.4 s`);
check("pitch preserved (preservesPitch on, playbackRate 2)", (await ev(`const m = __dance.player.media; return m.preservesPitch === true && m.playbackRate === 2`)));
check("the speed is shown big: 2×", (await ev(`return T.badge()`)) === "2×");
await p.shot(`${SHOTS}/08-speed-2x-badge.png`);
await ev(`await T.show([], 1500)`);
await ev(`await T.show([T.right(0, { shape: 'Thumb_Up', curl: 1 })], 1000)`);
check("thumbs up again: back to 1x, badge gone", (await ev(`return T.rate()`)) === 1 && (await ev(`return T.badge()`)) === null);

console.log("\n== 2. A thumbs up shows the back of the hand: it must not need the palm facing");
await fresh();
await ev(`await T.show([T.right(0, { shape: 'Thumb_Up', curl: 1, away: true })], 1000)`);
check("back of the hand to the camera: still counts", (await ev(`return T.rate()`)) === 2);
await fresh();
await ev(`await T.show([T.right(0, { shape: 'Victory', away: true })], 1500)`);
check("...but a V with the back to the camera still does not (unchanged)", (await ev(`return __dance.log.length`)) === 0);

console.log("\n== 3. Collisions: left thumbs up, thumbs up while grabbing, other shapes");
await fresh();
await ev(`await T.show([T.left('Thumb_Up', { hand: 'Left', curl: 1 })], 3000)`);
check("LEFT thumbs up does nothing at all", (await ev(`return T.rate()`)) === 1 && (await ev(`return __dance.log.length`)) === 0);
await ev(`await T.show([T.right(0, { shape: 'Closed_Fist' })], 2000)`);
check("a right fist is not a thumbs up", (await ev(`return T.rate()`)) === 1);
await ev(`await T.show([T.left('Open_Palm'), T.right(0, { shape: 'Thumb_Up', curl: 1 })], 1500)`);
check("while the wheel is held the right hand's commands are blocked, so no speed change", (await ev(`return T.rate()`)) === 1);
await ev(`await T.show([], 800)`);
await ev(`await T.show([T.right(0, { shape: 'Thumb_Up', curl: 1, curl: 1 })], 1000)`);
check("a thumbs up is not read as a claw or pinch grab (no knob grab, speed toggles)", (await ev(`return !!__dance.knob.grabbed`)) === false && (await ev(`return T.rate()`)) === 2);

console.log("\n== 4. Keys: T toggles, - and = step through 0.5 0.75 1 1.5 2");
await fresh();
await ev(`T.key('KeyT')`);
check("T: 2x", (await ev(`return T.rate()`)) === 2);
await ev(`T.key('KeyT')`);
check("T again: 1x", (await ev(`return T.rate()`)) === 1);
const down = [];
for (let i = 0; i < 4; i++) {
  await ev(`T.key('Minus')`);
  down.push(await ev(`return T.rate()`));
}
check("- steps down and stops at 0.5", JSON.stringify(down) === "[0.75,0.5,0.5,0.5]", JSON.stringify(down));
check("slow speed is shown too: 0.5×", (await ev(`return T.badge()`)) === "0.5×");
await shot("09-speed-half-badge");
await ev(`T.key('KeyT')`);
check("T from a slowed speed goes back to 1x", (await ev(`return T.rate()`)) === 1);
const up = [];
for (let i = 0; i < 4; i++) {
  await ev(`T.key('Equal')`);
  up.push(await ev(`return T.rate()`));
}
check("= steps up and stops at 2", JSON.stringify(up) === "[1.5,2,2,2]", JSON.stringify(up));

console.log("\n== 5. The loop wrap at 2x");
await fresh();
await ev(`__dance.practice.perform('setStart',{markAt:5}); __dance.practice.perform('setEnd',{markAt:7}); __dance.player.seek(5);`);
await ev(`T.key('KeyT'); await __dance.player.play(); await T.sleep(100)`);
const w0 = await ev(`return __dance.practice.wrapper.wraps`);
await ev(`await T.sleep(8000)`);
const w2 = (await ev(`return __dance.practice.wrapper.wraps`)) - w0;
check("a 2 s loop at 2x wraps about once a second (8 s -> ~8 wraps)", w2 >= 7 && w2 <= 9, `${w2} wraps`);
const hist = JSON.parse(await ev(`return JSON.stringify(__dance.practice.wrapper.history.slice(-6))`));
check("each wrap lands on START", hist.every((h) => Math.abs(h.landedAt - 5) < 0.001));
const over = hist.map((h) => h.overshootSec);
check("overshoot past END stays small at 2x (music seconds)", over.every((o) => o >= 0 && o < 0.05), over.map((o) => o.toFixed(3)).join(" "));
check("still 2x and still playing after all those wraps", (await ev(`return T.rate()`)) === 2 && (await ev(`return T.state()`)) === "playing");
const cur = await ev(`return T.cur()`);
check("the playhead is inside the loop", cur >= 5 && cur < 7.1, cur.toFixed(2));
await shot("10-loop-at-2x");

console.log("\n== 6. Scrubbing at 2x (playing, then fist = paused, then palm = resume)");
await fresh();
await ev(`T.key('KeyT'); __dance.player.seek(30); await __dance.player.play(); await T.show([T.left('Open_Palm'), T.right(0)], 500)`);
check("2x, grabbed, playing", (await ev(`return JSON.stringify([T.rate(), !!__dance.knob.grabbed, T.state()])`)) === "[2,true,\"playing\"]");
const a0 = await ev(`return T.cur()`);
await ev(`await T.turn(T.left('Open_Palm'), 0, 35, 600); await T.show([T.left('Open_Palm'), T.right(35)], 700)`);
const a1 = await ev(`return T.cur()`);
check("a steering turn at 2x moves the playhead ahead of the natural 2x run", a1 - a0 > 2 * 1.3 + 2, `${a0.toFixed(2)} -> ${a1.toFixed(2)} in ~1.3 s`);
check("still playing and still 2x", (await ev(`return T.state()`)) === "playing" && (await ev(`return T.rate()`)) === 2);
await ev(`await T.show([T.left('Closed_Fist', { curl: 1 }), T.right(35)], 600)`);
const f0 = await ev(`return T.cur()`);
await ev(`await T.turn(T.left('Closed_Fist', { curl: 1 }), 35, 0, 800); await T.show([T.left('Closed_Fist', { curl: 1 }), T.right(0)], 600)`);
const f1 = await ev(`return T.cur()`);
await ev(`await T.show([T.left('Closed_Fist', { curl: 1 }), T.right(0)], 1200)`);
const f2 = await ev(`return T.cur()`);
check("fist at 2x: paused, moved back by the turn, and then it does not move", (await ev(`return T.state()`)) === "paused" && f1 < f0 - 0.5 && f1 === f2, `${f0.toFixed(2)} -> ${f1.toFixed(2)} -> ${f2.toFixed(2)}`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 1000)`);
const p1 = await ev(`return T.cur()`);
check("palm: resumes from there at 2x", (await ev(`return T.state()`)) === "playing" && p1 - f2 > 1.5, `${f2.toFixed(2)} -> ${p1.toFixed(2)} in ~1 s`);
const edges = await ev(`return !!__dance.knob.grabbed`);
check("one grab throughout", edges === true);
await shot("11-scrub-at-2x");

console.log(`\n${pass} passed, ${fail} failed`);
p.close();
process.exit(fail ? 1 : 0);
