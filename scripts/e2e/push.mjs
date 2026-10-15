// Sim end-to-end for the EXP push-and-swipe bench (?exp=push&sim). No camera, no model: src/exp/simScene.ts turns a scripted
// movement (a push, a slow approach, a dance arm swing) into the hand + pose + world points the real pipeline would get, and the
// bench, swipe, recorder and panel run on them for real. SILENT by design: Chrome runs with --mute-audio (cdp.mjs), the media
// element is muted, and speechSynthesis is replaced by a spy (nothing is ever spoken).
//
// Needs the dev server (`npx vite --port 5192`) and a test track (`node scripts/make-test-wav.mjs 120`).
//   node scripts/e2e/push.mjs            (DANCE_REPS=2 repeats per distance; DANCE_DISTS=2,3,4)
import { mkdirSync, writeFileSync } from "node:fs";
process.env.DANCE_E2E_PROFILE ??= "/tmp/dance-e2e-profile-exp";
const { launch } = await import("./cdp.mjs");

const SHOTS = process.env.DANCE_SHOTS ?? "/tmp/dance-exp-shots";
mkdirSync(SHOTS, { recursive: true });
const URL = process.env.DANCE_URL ?? "http://localhost:5192/?exp=push&sim&simfps=30&track=/test/click-track.wav";
const REPS = Number(process.env.DANCE_REPS ?? 2);
const DISTS = (process.env.DANCE_DISTS ?? "2,3,4").split(",").map(Number);
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9372));
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};
const ev = (code) => p.eval(code);

async function main() {
  await p.goto(URL);
  await ev(`localStorage.clear()`);
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,2000))`);
  // Silence, belt and braces: a spy in place of speechSynthesis, the audio element muted.
  await ev(`
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
    window.speechSynthesis.cancel = () => {};
    if (__dance.player.media) __dance.player.media.muted = true;
    document.querySelectorAll('audio,video').forEach((m) => (m.muted = true));
    window.T = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
  `);
  check("the bench panel is there and the player has the track", (await ev(`return !!document.getElementById('exp-panel') && __dance.player.loaded`)) === true);
  check("the media element is muted (no sound under test)", (await ev(`return !__dance.player.media || __dance.player.media.muted`)) === true);

  // ---- 1. Push vs slow approach vs arm swing -------------------------------------------------------------------------------
  console.log("\n== 1. Push detection on scripted movements (confusion counts; hits are within -0.2..+1.0 s of a scripted push)");
  const play = async (name, dist, seed) => {
    await ev(`__dance.setHands([]); await T.sleep(700)`);
    const r = await ev(`const r = await __dance.expPlay(${JSON.stringify(name)}, { dist: ${dist} }, { seed: ${seed} }); await T.sleep(500); return { r, ev: __dance.exp.events.filter((e) => e.t0 >= r.startedAt - 50).map((e) => ({ k: e.kind, s: e.signal, why: e.reason, t0: (e.t0 - r.startedAt) / 1000, level: e.level, shape: e.shape, hand: e.hand })) }`);
    return r;
  };
  const table = {};
  for (const dist of DISTS) {
    const t = (table[dist] = { push: { truth: 0, hits: { a: 0, b: 0, c: 0, d: 0 }, extra: { a: 0, b: 0, c: 0, d: 0 } }, slow: { a: 0, b: 0, c: 0, d: 0 }, swing: { fp: { a: 0, b: 0, c: 0, d: 0 }, rej: { a: 0, b: 0, c: 0, d: 0 } } });
    for (let rep = 0; rep < REPS; rep++) {
      const seed = 100 * dist + rep + 1;
      const push = await play("push", dist, seed);
      t.push.truth += push.r.truth.length;
      for (const k of "abcd") {
        const pushes = push.ev.filter((e) => e.s === k && e.k === "push");
        const used = new Set();
        for (const t0 of push.r.truth) {
          const i = pushes.findIndex((e, j) => !used.has(j) && e.t0 >= t0 - 0.2 && e.t0 <= t0 + 1.0);
          if (i >= 0) {
            used.add(i);
            t.push.hits[k]++;
          }
        }
        t.push.extra[k] += pushes.length - used.size;
      }
      if (rep === 0 && dist === DISTS[0]) {
        const first = push.ev.find((e) => e.s === "d" && e.k === "push");
        check("a d-push logs the hand, its level and the shape at the time", !!first && first.hand === "Right" && ["above", "head", "chest", "below"].includes(first.level) && first.shape === "Open_Palm", JSON.stringify(first));
        await ev(`document.getElementById('exp-panel').scrollTop = 340`);
        await p.shot(`${SHOTS}/01-push-graphs.png`);
        await ev(`document.getElementById('exp-panel').scrollTop = 0`);
      }
      const slow = await play("slow", dist, seed);
      for (const k of "abcd") t.slow[k] += slow.ev.filter((e) => e.s === k && e.k === "push").length;
      const swing = await play("swing", dist, seed);
      for (const k of "abcd") {
        t.swing.fp[k] += swing.ev.filter((e) => e.s === k && e.k === "push").length;
        t.swing.rej[k] += swing.ev.filter((e) => e.s === k && e.k === "reject").length;
      }
    }
    const row = (k) => `${k}: hits ${t.push.hits[k]}/${t.push.truth}, extra pushes ${t.push.extra[k]}, slow-approach false ${t.slow[k]}, swing false ${t.swing.fp[k]} (rejected ${t.swing.rej[k]})`;
    console.log(`   ${dist} m  |  ${["a", "b", "c", "d"].map(row).join("  |  ")}`);
    check(`${dist} m: the combined signal (d) finds every scripted push and fires on neither the slow approach nor the swing`, t.push.hits.d === t.push.truth && t.push.extra.d === 0 && t.slow.d === 0 && t.swing.fp.d === 0, row("d"));
  }
  writeFileSync(`${SHOTS}/push-confusion.json`, JSON.stringify(table, null, 1));

  // ---- 2. Swipe: touch-down, scrub, lift ---------------------------------------------------------------------------------
  console.log("\n== 2. Swipe slider");
  await ev(`__dance.expClearBody(); __dance.setHands([]); __dance.exp.settings.swipeOn = true; __dance.exp.settings.requirePalm = false; __dance.exp.settings.scrubMode = 'pause'; __dance.exp.settings.swipe.gainSec = 20; __dance.exp.settings.swipe.minSpeed = 0.03; __dance.player.pause(); __dance.player.seek(10); await T.sleep(300)`);
  const hand = (x, y, shape = "Open_Palm") => `[{ shape: ${JSON.stringify(shape)}, hand: 'Right', palm: { x: ${x}, y: ${y} } }]`;
  const sweep = (x0, x1, y, ms, shape) => `{ const t0 = performance.now(); for (;;) { const u = Math.min(1, (performance.now() - t0) / ${ms}); __dance.setHands(${hand("(" + x0 + " + (" + x1 + " - " + x0 + ") * u)", y, shape)}); if (u >= 1) break; await T.sleep(16); } }`;
  const time = async () => ev(`return __dance.player.currentTime`);
  const t0 = await time();
  await ev(`__dance.setHands(${hand(0.3, 0.5)}); await T.sleep(200)`); // below the zone: no touch
  check("a hand below the zone does not touch", (await ev(`return __dance.exp.touching`)) === false);
  await ev(`__dance.setHands(${hand(0.3, 0.12)}); await T.sleep(300)`);
  check("entering the zone is a touch-down, and holding still does not move the playhead", (await ev(`return __dance.exp.touching`)) === true && Math.abs((await time()) - t0) < 0.2, `moved ${((await time()) - t0).toFixed(2)} s`);
  await ev(sweep(0.3, 0.6, 0.12, 600));
  await ev(`await T.sleep(400)`);
  const t1 = await time();
  check("sweeping 0.3 of the picture scrubs +6 s (gain 20 s / screen), right = forward", Math.abs(t1 - t0 - 6) < 0.6, `moved ${(t1 - t0).toFixed(2)} s`);
  await p.shot(`${SHOTS}/02-swipe-bar.png`);
  await ev(`__dance.setHands(${hand(0.6, 0.5)}); await T.sleep(300)`);
  check("leaving the zone is the lift", (await ev(`return __dance.exp.touching`)) === false);
  await ev(sweep(0.6, 0.2, 0.5, 500));
  check("moving sideways OUTSIDE the zone does not scrub", Math.abs((await time()) - t1) < 0.2, `moved ${((await time()) - t1).toFixed(2)} s`);
  await ev(`__dance.setHands(${hand(0.3, 0.12)}); await T.sleep(200)`);
  await ev(sweep(0.3, 0.6, 0.12, 600));
  await ev(`await T.sleep(400)`);
  const t2 = await time();
  check("re-entering and swiping again continues from where the playhead is (multiple swipes)", Math.abs(t2 - t1 - 6) < 0.6, `moved ${(t2 - t1).toFixed(2)} s, now ${t2.toFixed(1)} s`);
  await ev(sweep(0.6, 0.3, 0.12, 600));
  await ev(`await T.sleep(400)`);
  check("swiping left scrubs backward", Math.abs((await time()) - t2 + 6) < 0.6, `now ${(await time()).toFixed(1)} s`);
  await ev(`__dance.setHands([]); await T.sleep(400)`);
  const recs = JSON.parse(await ev(`return JSON.stringify(__dance.exp.metrics.records)`));
  check("each touch is recorded with duration, net scrub and edge numbers", recs.length >= 2 && recs.every((r) => r.durMs > 0 && typeof r.downRawSec === "number"), `${recs.length} touches; first: ${JSON.stringify(recs[0] && { durMs: Math.round(recs[0].durMs), net: recs[0].netSec.toFixed(2), downRaw: recs[0].downRawSec.toFixed(2), upRaw: recs[0].upRawSec.toFixed(2), stop: recs[0].stopLatencyMs })}`);
  console.log("   touches:", recs.map((r) => `${Math.round(r.durMs)} ms net ${r.netSec.toFixed(1)} s in ${r.downRawSec.toFixed(2)}/${r.downAppliedSec.toFixed(2)} out ${r.upRawSec.toFixed(2)}/${r.upAppliedSec.toFixed(2)} stop ${r.stopLatencyMs === null ? "n/a" : Math.round(r.stopLatencyMs) + " ms"}`).join(" | "));
  // Shape option.
  await ev(`__dance.exp.settings.requirePalm = true; __dance.setHands(${hand(0.3, 0.12, "Closed_Fist")}); await T.sleep(300)`);
  check("with 'require open palm' a fist does not touch", (await ev(`return __dance.exp.touching`)) === false);
  await ev(`__dance.setHands(${hand(0.3, 0.12, "Open_Palm")}); await T.sleep(300)`);
  check("...and the open palm does", (await ev(`return __dance.exp.touching`)) === true);
  await ev(`__dance.exp.settings.requirePalm = false; __dance.setHands([]); await T.sleep(300)`);
  // Jitter at rest: the hand held still with a little position noise (about 2.5 px of a 1280 picture).
  await ev(`__dance.exp.jitter.start(performance.now(), 3); const t0 = performance.now(); while (performance.now() - t0 < 3300) { __dance.setHands([{ shape: 'Open_Palm', hand: 'Right', palm: { x: 0.5 + (Math.random() - 0.5) * 0.004, y: 0.12 + (Math.random() - 0.5) * 0.004 } }]); await T.sleep(16); }`);
  const jit = JSON.parse(await ev(`return JSON.stringify(__dance.exp.jitter.result)`));
  check("rest jitter is measured (raw and applied, scrub seconds per second)", !!jit && jit.touchedFrac > 0.9, jit ? `flicker raw ${jit.rawPerSec.toFixed(3)} / applied ${jit.appliedPerSec.toFixed(3)} s/s; net drift raw ${jit.netRawSec.toFixed(2)} / applied ${jit.netAppliedSec.toFixed(2)} s over ${jit.seconds.toFixed(1)} s` : "no result");
  await ev(`__dance.setHands([]); await T.sleep(300)`);

  // ---- 3. Recording ------------------------------------------------------------------------------------------------------
  console.log("\n== 3. Recording");
  await ev(`__dance.exp.settings.label = 'sim push 3m'; __dance.exp.settings.recordSec = 8; __dance.exp.settings.startDelaySec = 0; __dance.exp.startRecording();`);
  await ev(`await __dance.expPlay('push', { dist: 3 }, { seed: 7 }); await T.sleep(1500)`);
  await ev(`await T.sleep(1500)`);
  const lr = await ev(`return __dance.exp.lastRecording && { name: __dance.exp.lastRecording.name, bytes: __dance.exp.lastRecording.json.length }`);
  check("the take finishes by itself and a file name is made from the label", !!lr && /^dance-exp-sim-push-3m-.*\.json$/.test(lr.name), JSON.stringify(lr));
  const doc = JSON.parse(await ev(`return __dance.exp.lastRecording.json`));
  check("the JSON parses and holds camera, resolution, settings, frames and events", doc.format === "dance-exp-push-swipe/1" && doc.meta.camera.width === 1280 && doc.meta.camera.height === 720 && typeof doc.meta.camera.label === "string" && doc.frames.length > 100 && doc.events.length > 0 && doc.meta.sim === true, `${doc.frames.length} frames, ${doc.events.length} events, ${(lr?.bytes / 1024).toFixed(0)} KB, measured ${doc.summary.measuredFps.toFixed(1)} fps, camera ${JSON.stringify(doc.meta.camera)}`);
  const fr = doc.frames.find((f) => f.hands.length > 0 && f.hands[0].d !== null);
  check("frames carry the per-hand signals, the pose points and the swipe state", !!fr && fr.hands[0].size > 0 && fr.pose && fr.pose.wrL && fr.swipe && "playhead" in fr.swipe, JSON.stringify(fr?.hands[0]).slice(0, 160));
  check("the push events are in the file", doc.events.filter((e) => e.type === "push").length >= 3, `${doc.events.filter((e) => e.type === "push").length} push events (all signals)`);
  check("the download link was offered", (await ev(`return !document.getElementById('exp-dl').hidden`)) === true);

  // ---- 4. Speech is a spy, only on request --------------------------------------------------------------------------------
  console.log("\n== 4. Speech (spied, never spoken)");
  check("with 'say push' off, nothing was spoken in all of the above", (await ev(`return window.__spoken.length`)) === 0);
  await ev(`__dance.exp.settings.speak = true; window.__spoken.length = 0; await __dance.expPlay('push', { dist: 2 }, { seed: 3 }); await T.sleep(800); __dance.exp.settings.speak = false;`);
  const spoken = await ev(`return window.__spoken.slice()`);
  check("with it on, the spy hears 'push' (the real speech was replaced, so nothing is audible)", spoken.includes("push"), JSON.stringify(spoken));

  // ---- 5. The normal app is untouched ---------------------------------------------------------------------------------------
  console.log("\n== 5. Flag off");
  await p.goto(URL.replace("exp=push&", ""));
  await ev(`await new Promise(r=>setTimeout(r,1500))`);
  check("without ?exp=push there is no bench panel and no exp object", (await ev(`return !document.getElementById('exp-panel') && !__dance.exp`)) === true);
  await p.shot(`${SHOTS}/03-flag-off.png`);
}

try {
  await main();
} catch (err) {
  fail++;
  console.log("ERROR", err);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (p.logs.some((l) => l.startsWith("EXC"))) console.log("page exceptions:", p.logs.filter((l) => l.startsWith("EXC")).slice(0, 5));
  p.close();
}
process.exit(fail ? 1 : 0);
