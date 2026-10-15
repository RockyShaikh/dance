// Sim end-to-end for R4c: the two-hand steering wheel, its modes, the marks rule, and the waveform.
// Needs the dev server (`npx vite --port 5178`) and a test track (`node scripts/make-test-wav.mjs 120`).
//
//   node scripts/e2e/steer.mjs        prints PASS / FAIL lines and writes screenshots to /tmp/dance-e2e-shots/
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const SHOTS = process.env.DANCE_SHOTS ?? "/tmp/dance-e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const URL = process.env.DANCE_URL ?? "http://localhost:5178/?sim&simfps=30&track=/test/click-track.wav";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9336));
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};
const ev = (code) => p.eval(code);
const shot = (name) => p.shot(`${SHOTS}/${name}.png`);

const prelude = `
  window.T = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    set: (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input')); },
    right: (tilt, o = {}) => ({ shape: 'None', hand: 'Right', palm: { x: 0.75, y: 0.14 }, curl: 0, tilt, ...o }),
    left: (shape, o = {}) => ({ shape, hand: 'Left', palm: { x: 0.25, y: 0.14 }, ...o }),
    show: async (specs, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { __dance.setHands(specs); await T.sleep(16); } },
    // A turn of the right hand from a to b over ms, with the given left hand.
    turn: async (left, a, b, ms) => { const t0 = performance.now(); for (;;) { const f = Math.min(1, (performance.now() - t0) / ms); __dance.setHands([left, T.right(a + (b - a) * f)]); if (f >= 1) break; await T.sleep(16); } },
    state: () => __dance.player.state,
    cur: () => __dance.player.currentTime,
    loop: () => __dance.practice.loopState,
    grabbed: () => !!__dance.knob.grabbed,
    mode: () => __dance.steer.mode,
  };
  // Count grabs and releases by watching the knob every 4 ms.
  T.edges = { grabs: 0, releases: 0 };
  { let was = false; setInterval(() => { const g = !!__dance.knob.grabbed; if (g && !was) T.edges.grabs++; if (!g && was) T.edges.releases++; was = g; }, 4); }
  // Count the calls that start or stop the music.
  T.calls = [];
  { const pl = __dance.player; for (const m of ['seek', 'play', 'pause']) { const o = pl[m].bind(pl); pl[m] = (...a) => { T.calls.push({ t: performance.now(), m, a: a[0] }); return o(...a); }; } }
`;

// R4d: circling + jog is the default wheel; this script exercises the tilt wheel (still selectable), so it picks it (hands.mjs covers circling).
async function fresh(tilt = true) {
  await p.goto(URL);
  await ev(`localStorage.clear()`);
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,1500))`);
  await ev(prelude);
  if (tilt) await ev(`T.set('knob-motion', 'tilt'); T.set('knob-mapping', 'relative')`);
}

// -------------------------------------------------------------------------------------------------
console.log("\n== 1. Defaults and the waveform");
await fresh(false);
check("defaults (R4d): two-hand + circling + jog -> playhead", (await ev(`return ['knob-clutch','knob-motion','knob-mapping','knob-target'].map(i=>document.getElementById(i).value).join('+')`)) === "twoHand+circling+jog+playhead");
await ev(`T.set('knob-motion', 'tilt'); T.set('knob-mapping', 'relative')`);
await ev(`await T.sleep(1500)`);
const wave = await ev(`const pk = __dance.practice.waveform; const c = document.getElementById('tl-wave'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++; return JSON.stringify({ bins: pk ? pk.min.length : 0, binMs: pk ? +(pk.binSec * 1000).toFixed(2) : 0, duration: pk ? +pk.duration.toFixed(2) : 0, w: c.width, h: c.height, lit })`);
const wj = JSON.parse(wave);
check("the track is decoded to peaks (about 120 s, ~1.45 ms bins)", wj.duration > 119 && wj.duration < 121 && wj.binMs > 1.3 && wj.binMs < 1.6, wave);
check("the timeline canvas has the waveform drawn on it", wj.lit > wj.w * 2, `${wj.lit} lit pixels of ${wj.w}x${wj.h}`);
await ev(`__dance.practice.perform('setStart',{markAt:20}); __dance.practice.perform('setEnd',{markAt:40});`);
await ev(`await T.sleep(300)`);
await shot("01-timeline-waveform-loop");

// -------------------------------------------------------------------------------------------------
console.log("\n== 2. Grab with the left palm (music playing): palm <-> fist pauses and resumes without releasing");
await fresh();
await ev(`__dance.practice.perform('setStart',{markAt:20}); __dance.practice.perform('setEnd',{markAt:40}); __dance.player.seek(30); await __dance.player.play(); await T.sleep(300);`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 500)`);
check("left palm + right hand in its box: GRABBED, mode palm, music still playing (R4d: left leaves it as it was)", (await ev(`return JSON.stringify([T.grabbed(), T.mode(), T.state()])`)) === '[true,"palm","playing"]');
const zoomPx = await ev(`const c = document.getElementById('hud'); const y0 = Math.floor(c.height * 0.62); const d = c.getContext('2d').getImageData(0, y0, c.width, Math.floor(c.height * 0.34)).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) lit++; return lit`);
check("the zoomed waveform is drawn on the HUD while steering (and the big readout steps aside)", zoomPx > 20000 && (await ev(`return document.getElementById('nudge-readout').hidden`)), `${zoomPx} opaque pixels in the band`);
await shot("02-palm-grabbed-playing-zoom");
for (let i = 0; i < 3; i++) {
  await ev(`await T.show([T.left('Closed_Fist', { curl: 1 }), T.right(0)], 400)`);
  const a = await ev(`return JSON.stringify([T.grabbed(), T.mode(), T.state()])`);
  await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 400)`);
  const b = await ev(`return JSON.stringify([T.grabbed(), T.mode(), T.state()])`);
  check(`toggle ${i + 1}: fist pauses, palm resumes, still grabbed`, a === '[true,"fist","paused"]' && b === '[true,"palm","playing"]', `${a} then ${b}`);
}
const edges = await ev(`return JSON.stringify(T.edges)`);
check("through all of that: ONE grab, no release", JSON.parse(edges).grabs === 1 && JSON.parse(edges).releases === 0, edges);
await ev(`await T.show([T.left('Closed_Fist', { curl: 1 }), T.right(0)], 500)`);
await shot("03-fist-paused-zoom");

// -------------------------------------------------------------------------------------------------
console.log("\n== 3. Fist: the playhead moves while paused and stays exactly where you stop");
await ev(`await T.turn(T.left('Closed_Fist', { curl: 1 }), 0, 35, 800); await T.show([T.left('Closed_Fist', { curl: 1 }), T.right(35)], 600)`);
const before = await ev(`return T.cur()`);
await ev(`await T.show([T.left('Closed_Fist', { curl: 1 }), T.right(35)], 1500)`);
const after = await ev(`return T.cur()`);
check("paused and moved by the turn", (await ev(`return T.state()`)) === "paused" && before > 30.5, `now ${before.toFixed(2)} (was 30)`);
check("hand held still: the playhead does not move", before === after, `${before} -> ${after}`);
await shot("04-fist-steering-zoom");
await ev(`await T.show([], 700)`);
check("both hands down: lets go, stays paused at the same spot", !(await ev(`return T.grabbed()`)) && (await ev(`return T.state()`)) === "paused" && Math.abs((await ev(`return T.cur()`)) - after) < 0.01);

// -------------------------------------------------------------------------------------------------
console.log("\n== 4. V = START, index = END (with the same clamps), and the marks rule");
await fresh();
await ev(`__dance.practice.perform('setStart',{markAt:20}); __dance.practice.perform('setEnd',{markAt:24}); __dance.player.seek(30);`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 400)`);
await ev(`await T.show([T.left('Victory'), T.right(0)], 400)`);
check("V: mode start, still grabbed", (await ev(`return JSON.stringify([T.mode(), T.grabbed()])`)) === '["start",true]');
const s0 = await ev(`return T.loop().start`);
for (let i = 0; i < 4; i++) await ev(`await T.turn(T.left('Victory'), 0, 80, 300); await T.turn(T.left('Victory'), 80, 0, 2500)`);
await ev(`await T.turn(T.left('Victory'), 0, 80, 300); await T.show([T.left('Victory'), T.right(80)], 500)`);
const s1 = await ev(`return T.loop().start`);
check("START moved later and stopped at END - 0.5 s", s1 > s0 + 1 && Math.abs(s1 - 23.5) < 0.01, `${s0} -> ${s1}`);
check("END untouched, the music untouched while steering START", (await ev(`return T.loop().end`)) === 24);
await shot("05-start-steering-zoom-clamped");
await ev(`__dance.practice.nudgeEnd(10)`); // END well clear of START, so the clamp below is a real one
const eFar = await ev(`return T.loop().end`);
await ev(`await T.show([T.left('Pointing_Up'), T.right(80)], 400)`);
check("index: mode end, still the same grab", (await ev(`return JSON.stringify([T.mode(), T.grabbed()])`)) === '["end",true]');
for (let i = 0; i < 3; i++) await ev(`await T.turn(T.left('Pointing_Up'), 0, -80, 300); await T.turn(T.left('Pointing_Up'), -80, 0, 2500)`);
await ev(`await T.turn(T.left('Pointing_Up'), 0, -80, 300); await T.show([T.left('Pointing_Up'), T.right(-80)], 500)`);
const e1 = await ev(`return T.loop().end`);
check("END moved earlier and stopped at START + 0.5 s", e1 < eFar - 5 && Math.abs(e1 - (s1 + 0.5)) < 0.01, `END ${eFar} -> ${e1}, START ${s1}`);
await shot("06-end-steering-zoom-clamped");
const edges4 = JSON.parse(await ev(`return JSON.stringify(T.edges)`));
check("palm -> V -> index: one grab, no release", edges4.grabs === 1 && edges4.releases === 0, JSON.stringify(edges4));

console.log("\n== 5. Marks vs steering");
await fresh();
await ev(`__dance.player.seek(10); await __dance.player.play(); await T.sleep(300)`);
await ev(`await T.show([T.left('Victory')], 1000)`);
const marked = await ev(`return JSON.stringify([T.loop().start, T.state(), T.grabbed()])`);
check("right hand NOT steering: left V sets START at the playhead", JSON.parse(marked)[0] !== null && !JSON.parse(marked)[2], marked);
await ev(`await T.show([], 1600)`);
await ev(`await T.show([T.left('Pointing_Up')], 1000)`);
check("...and left index sets END", (await ev(`return T.loop().end`)) !== null);
const fires0 = await ev(`return __dance.log.length`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 300); await T.show([T.left('Victory'), T.right(0)], 2500); await T.show([T.left('Pointing_Up'), T.right(0)], 2500)`);
const loopNow = await ev(`return JSON.stringify(T.loop())`);
check("while steering, V / index held for seconds fire nothing (they select the target)", (await ev(`return __dance.log.length`)) === fires0, loopNow);

console.log("\n== 6. Debounce: a flickering left hand does not toggle play / pause or let go");
await fresh();
await ev(`__dance.player.seek(30); await __dance.player.play(); await T.show([T.left('Open_Palm'), T.right(0)], 500); T.calls.length = 0`);
await ev(`for (let i = 0; i < 12; i++) { await T.show([T.left('Closed_Fist', { curl: 1 }), T.right(0)], 50); await T.show([T.left('Open_Palm'), T.right(0)], 350); }`);
const pauses = await ev(`return T.calls.filter((c) => c.m === 'pause').length`);
check("12 flickers of fist (about 2 frames) in a held palm: no pause", pauses === 0 && (await ev(`return T.state()`)) === "playing", `pause calls: ${pauses}`);
await ev(`for (let i = 0; i < 12; i++) { await T.show([T.left('None', { curl: 0.6, score: 0.2 }), T.right(0)], 50); await T.show([T.left('Open_Palm'), T.right(0)], 350); }`);
const edges6 = JSON.parse(await ev(`return JSON.stringify(T.edges)`));
check("12 dropouts of the model's label: still one grab, no release", edges6.grabs === 1 && edges6.releases === 0, JSON.stringify(edges6));
await ev(`await T.show([T.left('Closed_Fist', { curl: 1 }), T.right(0)], 400)`);
check("a held fist does switch (after the debounce)", (await ev(`return T.state()`)) === "paused");

console.log("\n== 7. Panel: pinch is there; the claw is vaulted (only with ?claw=1)");
await fresh();
check("without ?claw=1 the claw is not in the clutch list or the clutch-shape panel", (await ev(`return JSON.stringify([...document.getElementById('knob-clutch').options].map((o) => o.value))`)) === '["pinch","twoHand"]' && (await ev(`return document.getElementById('clutch-claw-row').hidden`)) && !/claw/i.test(await ev(`return document.body.innerText`)));
await p.goto(URL + "&claw=1");
await ev(`await new Promise(r=>setTimeout(r,1500)); localStorage.clear()`);
await p.goto(URL + "&claw=1");
await ev(`await new Promise(r=>setTimeout(r,1500))`);
await ev(prelude);
check("with ?claw=1 it is back: listed and its row shown", (await ev(`return [...document.getElementById('knob-clutch').options].map((o) => o.value).join()`)) === "claw,pinch,twoHand" && !(await ev(`return document.getElementById('clutch-claw-row').hidden`)));
await ev(`T.set('knob-clutch', 'claw')`);
check("claw selectable, panel shows it", (await ev(`return document.getElementById('knob-clutch').value`)) === "claw");
await shot("07-knob-panel");

console.log(`\n${pass} passed, ${fail} failed`);
p.close();
process.exit(fail ? 1 : 0);
