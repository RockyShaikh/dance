// Sim end-to-end for R4d: the left hand never starts playback, the fist pauses while closed, the right hand's
// fist is play/pause and its open palm is inert, the fist / thumbs up guard, and the circling wheel (direction latency).
// Needs the dev server (`npx vite --port 5187`) and a test track (`node scripts/make-test-wav.mjs 120`).
//
//   DANCE_URL=http://localhost:5187/?sim\&simfps=30\&track=/test/click-track.wav node scripts/e2e/hands.mjs
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const SHOTS = process.env.DANCE_SHOTS ?? "/tmp/dance-e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const URL = process.env.DANCE_URL ?? "http://localhost:5187/?sim&simfps=30&track=/test/click-track.wav";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9338));
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
    right: (tilt, o = {}) => ({ shape: 'None', hand: 'Right', palm: { x: 0.75, y: 0.5 }, curl: 0, tilt, ...o }),
    left: (shape, o = {}) => ({ shape, hand: 'Left', palm: { x: 0.25, y: 0.5 }, ...o }),
    show: async (specs, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { __dance.setHands(specs); await T.sleep(16); } },
    // The right hand's palm going round a circle (radius in frame heights; dir +1 = clockwise on screen) while the left hand shows 'left'.
    // Records the true degrees travelled and what the wheel reports (knobView.turnedDeg) every 16 ms into 'rec'.
    circle: async (left, { rev = 1, ms = 1500, radius = 0.08, dir = 1, rec = null } = {}) => {
      const t0 = performance.now(); const aspect = 16 / 9;
      for (;;) {
        const el = performance.now() - t0; const deg = dir * (el / 1000) * rev * 360; const a = ((180 + deg) * Math.PI) / 180;
        __dance.setHands([left, T.right(0, { palm: { x: 0.75 + (radius / aspect) * Math.cos(a), y: 0.5 + radius * Math.sin(a) } })]);
        if (rec) rec.push({ t: el, trueDeg: deg, reported: __dance.knobView ? __dance.knobView.turnedDeg : null });
        if (el >= ms) break; await T.sleep(16);
      }
    },
    atStart: (left, ms, radius = 0.08) => T.show([left, T.right(0, { palm: { x: 0.75 - radius / (16 / 9), y: 0.5 } })], ms),
    state: () => __dance.player.state,
    cur: () => __dance.player.currentTime,
    loop: () => __dance.practice.loopState,
    grabbed: () => !!__dance.knob.grabbed,
    mode: () => __dance.steer.mode,
    fires: () => __dance.log.length,
  };
  T.edges = { grabs: 0, releases: 0 };
  { let was = false; setInterval(() => { const g = !!__dance.knob.grabbed; if (g && !was) T.edges.grabs++; if (!g && was) T.edges.releases++; was = g; }, 4); }
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
const FIST = `{ curl: 1 }`;

console.log("\n== 1. Left palm never starts playback; V / index start a grab; a lone fist does not");
await fresh();
await ev(`__dance.player.seek(30)`);
check("paused before", ["ready", "paused"].includes(await ev(`return T.state()`)));
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 700)`);
check("left palm + right hand in its box: grabbed, mode palm, and the music is still PAUSED", (await ev(`return JSON.stringify([T.grabbed(), T.mode(), T.state()])`)) === '[true,"palm",' + JSON.stringify(await ev(`return T.state()`)) + ']' && (await ev(`return T.state()`)) !== "playing");
await ev(`await T.circle(T.left('Open_Palm'), { ms: 1500 }); await T.show([T.left('Open_Palm'), T.right(0)], 800)`);
check("after scrubbing a whole second-and-a-half circle with the palm: still paused, and it moved", (await ev(`return T.state()`)) !== "playing" && (await ev(`return T.cur()`)) > 31, `at ${(await ev(`return T.cur()`)).toFixed(2)}`);
await ev(`await T.show([], 800)`);
await ev(`await __dance.player.play(); await T.sleep(300); T.calls.length = 0`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 1500)`);
check("playing, palm held for 1.5 s: keeps playing, no pause call", (await ev(`return T.state()`)) === "playing" && (await ev(`return T.calls.filter((c) => c.m === 'pause').length`)) === 0);
for (const [shape, mode] of [["Victory", "start"], ["Pointing_Up", "end"]]) {
  await fresh();
  await ev(`__dance.practice.perform('setStart',{markAt:20}); __dance.practice.perform('setEnd',{markAt:40}); __dance.player.seek(30); await __dance.player.play(); await T.sleep(200)`);
  await ev(`await T.show([T.left('${shape}'), T.right(0)], 300)`);
  check(`left ${shape} + right hand in its box starts a grab at once (mode ${mode}); the music keeps playing`, (await ev(`return JSON.stringify([T.grabbed(), T.mode(), T.state()])`)) === `[true,"${mode}","playing"]`);
}
await fresh();
await ev(`__dance.player.seek(30); await __dance.player.play(); await T.sleep(200)`);
await ev(`await T.show([T.left('Closed_Fist', ${FIST}), T.right(0)], 1500)`);
check("a lone left fist (a hand hanging loose) does NOT start a grab and does not pause", !(await ev(`return T.grabbed()`)) && (await ev(`return T.state()`)) === "playing");

console.log("\n== 2. Fist = pause while closed; ownership");
await fresh();
await ev(`__dance.player.seek(30); await __dance.player.play(); await T.sleep(200)`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 500)`);
for (let i = 0; i < 2; i++) {
  await ev(`await T.show([T.left('Closed_Fist', ${FIST}), T.right(0)], 400)`);
  const a = await ev(`return JSON.stringify([T.grabbed(), T.mode(), T.state()])`);
  await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 400)`);
  const b = await ev(`return JSON.stringify([T.grabbed(), T.mode(), T.state()])`);
  check(`round ${i + 1}: fist pauses, palm resumes, same grab`, a === '[true,"fist","paused"]' && b === '[true,"palm","playing"]', `${a} then ${b}`);
}
check("one grab, no release", JSON.stringify(await ev(`return T.edges`)) === '{"grabs":1,"releases":0}');
await shot("01-fist-then-palm");

await fresh();
await ev(`__dance.player.seek(30); await T.sleep(100)`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 500); T.calls.length = 0`);
await ev(`await T.show([T.left('Closed_Fist', ${FIST}), T.right(0)], 600)`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 600)`);
check("already paused: fist changes nothing and the palm does not start it", (await ev(`return T.state()`)) !== "playing" && (await ev(`return T.calls.filter((c) => c.m === 'play').length`)) === 0);

await fresh();
await ev(`__dance.practice.perform('setStart',{markAt:20}); __dance.practice.perform('setEnd',{markAt:40}); __dance.player.seek(30); await __dance.player.play(); await T.sleep(200)`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 400); await T.show([T.left('Closed_Fist', ${FIST}), T.right(0)], 400); await T.show([T.left('Victory'), T.right(0)], 400)`);
check("fist -> V: still paused, steering START", (await ev(`return JSON.stringify([T.mode(), T.state() !== 'playing'])`)) === '["start",true]');
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 400)`);
check("-> palm: the fist's pause is resumed", (await ev(`return T.state()`)) === "playing");
await ev(`await T.show([T.left('Closed_Fist', ${FIST}), T.right(0)], 400); await T.show([], 800)`);
check("fist closed, then both hands leave: the music stays paused (a hand leaving never starts it)", !(await ev(`return T.grabbed()`)) && (await ev(`return T.state()`)) !== "playing");

console.log("\n== 3. Marks when the right hand is not steering; right hand outside its box");
await fresh();
await ev(`__dance.player.seek(10); await __dance.player.play(); await T.sleep(300)`);
await ev(`await T.show([T.left('Victory')], 1000)`);
check("no right hand: left V sets START (a mark, no grab)", (await ev(`return T.loop().start`)) !== null && !(await ev(`return T.grabbed()`)));
await ev(`await T.show([], 1600)`);
await ev(`await T.show([T.left('Pointing_Up'), T.right(0, { palm: { x: 0.2, y: 0.5 } })], 1000)`);
check("right hand outside its box: left index sets END (a mark, no grab)", (await ev(`return T.loop().end`)) !== null && !(await ev(`return T.grabbed()`)));

console.log("\n== 4. Right hand: open palm inert, fist = play/pause, a hand leaving does nothing");
await fresh();
await ev(`__dance.player.seek(10); await __dance.player.play(); await T.sleep(300)`);
await ev(`await T.show([T.right(0, { shape: 'Open_Palm' })], 6000)`);
check("right open palm held 6 s: nothing fires, still playing", (await ev(`return T.fires()`)) === 0 && (await ev(`return T.state()`)) === "playing");
await ev(`await T.show([], 1200)`);
await ev(`await T.show([T.right(0, { shape: 'Closed_Fist', curl: 1 })], 400)`);
check("right fist for 0.4 s (ring not full): nothing yet", (await ev(`return T.state()`)) === "playing");
await ev(`await T.show([T.right(0, { shape: 'Closed_Fist', curl: 1 })], 500)`);
check("right fist, ring full (0.6 s): PAUSE", (await ev(`return T.state()`)) !== "playing" && (await ev(`return T.fires()`)) === 1, `fires ${await ev(`return T.fires()`)}`);
await ev(`await T.show([], 1500)`);
await ev(`await T.show([T.right(0, { shape: 'Closed_Fist', curl: 1 })], 900)`);
check("right fist again: PLAY", (await ev(`return T.state()`)) === "playing");
await ev(`await T.show([], 1500)`);
await ev(`await T.show([T.right(0, { shape: 'Closed_Fist', curl: 1 })], 350)`);
await ev(`await T.show([], 3000)`);
check("a fist that leaves the frame before the ring fills changes nothing", (await ev(`return T.state()`)) === "playing" && (await ev(`return T.fires()`)) === 2);
await ev(`await T.show([T.left('Closed_Fist', ${FIST})], 4000)`);
check("a LEFT fist (no right hand) fires nothing and pauses nothing", (await ev(`return T.fires()`)) === 2 && (await ev(`return T.state()`)) === "playing");
await ev(`await T.show([T.left('Open_Palm')], 4000)`);
check("a LEFT open palm fires nothing either", (await ev(`return T.fires()`)) === 2 && (await ev(`return T.state()`)) === "playing");

console.log("\n== 5. Guard: a fist can't fire as a thumbs up, and a thumbs up can't fire as a fist");
await fresh();
await ev(`__dance.player.seek(10); await __dance.player.play(); await T.sleep(300)`);
await ev(`await T.show([T.right(0, { shape: 'Thumb_Up', fingers: '00000', curl: 1 })], 2500)`);
check("label Thumb_Up but the thumb is in (a fist): no speed change", (await ev(`return __dance.player.rate`)) === 1 && (await ev(`return T.fires()`)) === 0);
await ev(`await T.show([], 1200)`);
await ev(`await T.show([T.right(0, { shape: 'Closed_Fist', fingers: '10000', curl: 1 })], 2500)`);
check("label Closed_Fist but the thumb is out (a thumbs up): no play/pause", (await ev(`return T.state()`)) === "playing" && (await ev(`return T.fires()`)) === 0);
await ev(`await T.show([], 1200)`);
await ev(`await T.show([T.right(0, { shape: 'Thumb_Up', curl: 1 })], 1200)`);
check("a real thumbs up held still speeds up (R5b: 2x while held)", (await ev(`return __dance.player.rate`)) === 2);

console.log("\n== 6. Circling: the default wheel, direction latency (end to end through the sim)");
await fresh();
check("defaults: two-hand + circling + jog", (await ev(`return ['knob-clutch','knob-motion','knob-mapping','knob-target'].map(i=>document.getElementById(i).value).join('+')`)) === "twoHand+circling+jog+playhead");
const latency = async (dir, rev, radius) => {
  await ev(`await T.show([], 700); __dance.player.seek(40); await __dance.player.play(); T.rec = []`);
  await ev(`await T.atStart(T.left('Open_Palm'), 700, ${radius})`);
  await ev(`await T.circle(T.left('Open_Palm'), { dir: ${dir}, rev: ${rev}, radius: ${radius}, ms: 2000, rec: T.rec })`);
  const rec = JSON.parse(await ev(`return JSON.stringify(T.rec)`));
  let at = Infinity;
  for (let i = 0; i < rec.length; i++) if (rec.slice(i).every((f) => f.reported * dir >= 5)) { at = Math.abs(rec[i].trueDeg); break; }
  const last = rec[rec.length - 1];
  return { at, ratio: last.reported / last.trueDeg };
};
const out = [];
for (const [name, dir, rev, radius] of [["clockwise 1 rev/s", 1, 1, 0.08], ["counter-clockwise 1 rev/s", -1, 1, 0.08], ["clockwise 0.5 rev/s", 1, 0.5, 0.08], ["clockwise 1.5 rev/s, small", 1, 1.5, 0.05]]) {
  const r = await latency(dir, rev, radius);
  out.push(`${name}: ${r.at.toFixed(0)} deg`);
  check(`direction latency, ${name}: within 90 degrees of the hand's travel (R4c centre-estimate: 120 in the unit sim)`, r.at <= 90, `${r.at.toFixed(0)} deg; reported/true over 2 s = ${r.ratio.toFixed(2)}`);
}
await fresh();
await ev(`__dance.player.seek(30); await __dance.player.play(); await T.sleep(200)`);
await ev(`await T.atStart(T.left('Open_Palm'), 600)`);
const c0 = await ev(`return T.cur()`);
await ev(`await T.circle(T.left('Open_Palm'), { dir: 1, rev: 1, ms: 1000 }); await T.show([T.left('Open_Palm'), T.right(0, { palm: { x: 0.75 - 0.08 / (16 / 9), y: 0.5 } })], 300)`);
const c1 = await ev(`return T.cur()`);
check("one clockwise circle in 1 s moves the playhead forward (3 s of scrub per turn, 1 s of play, minus the first ~40 degrees)", c1 - c0 > 3.2, `${c0.toFixed(2)} -> ${c1.toFixed(2)}`);
await ev(`T.calls.length = 0; await T.show([T.left('Open_Palm'), T.right(0, { palm: { x: 0.75 - 0.08 / (16 / 9), y: 0.5 } })], 1200)`);
const seeksLate = await ev(`return T.calls.filter((c) => c.m === 'seek' && c.t > performance.now() - 900).length`);
const r0 = await ev(`return T.cur()`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0, { palm: { x: 0.75 - 0.08 / (16 / 9), y: 0.5 } })], 1000)`);
const r1 = await ev(`return T.cur()`);
check("circling stopped: no more seeks, and the music just plays on at 1x", seeksLate === 0 && Math.abs(r1 - r0 - 1) < 0.15, `${seeksLate} seeks in the last 0.9 s; ${(r1 - r0).toFixed(2)} s of music in 1 s`);
await ev(`await T.atStart(T.left('Open_Palm'), 600)`);
const d0 = await ev(`return T.cur()`);
await ev(`await T.circle(T.left('Open_Palm'), { dir: -1, rev: 1, ms: 1000 })`);
const d1 = await ev(`return T.cur()`);
check("one counter-clockwise circle moves it back (net)", d1 < d0 + 1 - 2, `${d0.toFixed(2)} -> ${d1.toFixed(2)} (1 s of play = +1)`);
await shot("02-circling-steer");

console.log("\n== 7. Tilt is still selectable");
await fresh();
await ev(`T.set('knob-motion', 'tilt'); T.set('knob-mapping', 'relative'); __dance.player.seek(30); await __dance.player.play(); await T.sleep(200)`);
await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 500)`);
const t0 = await ev(`return T.cur()`);
await ev(`const t0 = performance.now(); for (;;) { const f = Math.min(1, (performance.now() - t0) / 700); __dance.setHands([T.left('Open_Palm'), T.right(35 * f)]); if (f >= 1) break; await T.sleep(16); } await T.show([T.left('Open_Palm'), T.right(35)], 500)`);
check("with Tilt chosen, a wrist turn still moves the playhead", (await ev(`return T.cur()`)) - t0 > 1.2 + 1.5, `${t0.toFixed(2)} -> ${(await ev(`return T.cur()`)).toFixed(2)}`);
console.log(`\nlatency summary: ${out.join(" | ")}`);

console.log(`\n${pass} passed, ${fail} failed`);
p.close();
process.exit(fail ? 1 : 0);
