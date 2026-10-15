// Sim measurement of the steering lag: "rotation stops" -> "the playhead stops changing", and the seek traffic
// while the music plays and the hand steers. Same scripted hand motion for every variant, so the claw and the
// two-hand wheel are comparable. Needs the dev server (`npx vite --port 5178`) and a test track
// (`node scripts/make-test-wav.mjs 120`).
//
//   node scripts/e2e/lag.mjs [label]      prints one JSON line per variant, then a table
import { launch } from "./cdp.mjs";

const label = process.argv[2] ?? "run";
// WHEEL=1 (R4c and later): the two-hand wheel is driven the way it is used: grab with a left palm, and PAUSE it with a left fist.
// Without it (the R4b baseline) the left hand just holds a palm and the music is started or paused beforehand.
const WHEEL = process.env.WHEEL === "1";
const URL = process.env.DANCE_URL ?? "http://localhost:5178/?sim&simfps=30&track=/test/click-track.wav";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9334));

// Page-side helpers. Hands are scripted frame by frame (every 16 ms, like a hand that is always moving a little).
const prelude = `
  window.T = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    set: (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input')); },
    right: (tilt, o = {}) => ({ shape: 'None', hand: 'Right', palm: { x: 0.75, y: 0.5 }, curl: 0, tilt, ...o }),
    claw: (tilt) => ({ shape: 'None', hand: 'Right', palm: { x: 0.75, y: 0.5 }, curl: 0.6, tilt }),
    left: (shape) => ({ shape, hand: 'Left', palm: { x: 0.25, y: 0.5 } }),
  };
  T.tick = (ms) => T.sleep(ms);
  // Sends specs(tilt) every 16 ms while the tilt goes from a to b over ms. Resolves with the time the tilt last changed.
  T.rot = async (specs, a, b, ms) => {
    const t0 = performance.now();
    let last = t0;
    for (;;) {
      const f = Math.min(1, (performance.now() - t0) / ms);
      const tilt = a + (b - a) * f;
      __dance.setHands(specs(tilt));
      if (tilt !== T.lastTilt) { T.lastTilt = tilt; last = performance.now(); }
      if (f >= 1) break;
      await T.sleep(16);
    }
    return last;
  };
  T.hold = async (specs, tilt, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { __dance.setHands(specs(tilt)); await T.sleep(16); }
  };
  // Records every call that moves the music, and samples the playhead every ~4 ms.
  T.rec = { calls: [], samples: [] };
  { const pl = __dance.player; for (const m of ['seek', 'play', 'pause']) { const o = pl[m].bind(pl); pl[m] = (...a) => { T.rec.calls.push({ t: performance.now(), m, a: a[0], before: pl.currentTime }); return o(...a); }; } }
  setInterval(() => T.rec.samples.push([performance.now(), __dance.player.currentTime]), 4);
`;

async function fresh() {
  await p.goto(URL);
  await p.eval(`localStorage.clear()`);
  await p.goto(URL);
  await p.eval(`await new Promise(r=>setTimeout(r,1500))`);
  await p.eval(prelude);
}

/** One scripted steer: grab, rotate 0 -> 35 deg over 400 ms, hold, then back to 0, hold, release. */
async function steer({ clutch, mapping, playing, extraLeft }) {
  await fresh();
  await p.eval(`T.set('knob-clutch', '${clutch}'); T.set('knob-motion', 'tilt'); T.set('knob-mapping', '${mapping}'); T.set('knob-target', 'playhead');`);
  await p.eval(`__dance.player.seek(30); ${playing ? "await __dance.player.play();" : ""} await T.sleep(700); T.rec.calls.length = 0; T.rec.samples.length = 0;`);
  const fist = WHEEL && clutch === "twoHand" && !playing;
  const leftShape = fist ? "Closed_Fist" : (extraLeft ?? "Open_Palm");
  const specs = clutch === "claw" ? `(tilt) => [T.claw(tilt)]` : `(tilt) => [T.left('${leftShape}'), T.right(tilt)]`;
  // grab
  if (clutch === "claw") await p.eval(`await T.hold((t) => [T.right(t)], 0, 350); await T.hold(${specs}, 0, 450);`);
  else if (fist) await p.eval(`await T.hold((t) => [T.left('Open_Palm'), T.right(t)], 0, 500); await T.hold(${specs}, 0, 600); T.rec.calls.length = 0; T.rec.samples.length = 0;`);
  else await p.eval(`await T.hold(${specs}, 0, 700);`);
  const grabbed = await p.eval(`return !!__dance.knob.grabbed`);
  const out = await p.eval(`
    const specs = ${specs};
    const mark = performance.now();
    const tStopRot = await T.rot(specs, 0, 35, 400);
    await T.hold(specs, 35, 1500);
    const tBack = performance.now();
    const tStopBack = await T.rot(specs, 35, 0, 300);
    await T.hold(specs, 0, 800);
    const s = T.rec.samples;
    // The last time the playhead moved by more than 3 ms between samples, inside [tStopRot, tBack].
    const lastMove = (from, to) => {
      let last = null;
      for (let i = 1; i < s.length; i++) if (s[i][0] >= from && s[i][0] <= to && Math.abs(s[i][1] - s[i - 1][1]) > 0.003) last = s[i][0];
      return last;
    };
    const lm = lastMove(tStopRot, tBack);
    const calls = T.rec.calls.filter((c) => c.m === 'seek' && c.t >= mark);
    const during = calls.filter((c) => c.t < tStopRot);
    const afterStop = calls.filter((c) => c.t > tStopRot && c.t < tBack);
    const lmBack = lastMove(tStopBack, tStopBack + 800);
    const startPos = s.find((x) => x[0] >= mark)?.[1] ?? 0;
    const posAtStop = s.find((x) => x[0] >= tStopRot)?.[1] ?? 0;
    const posEnd = s.findLast((x) => x[0] <= tBack)?.[1] ?? 0;
    let maxPerSec = 0;
    for (let i = 0; i < calls.length; i++) { let n = 0; for (let j = i; j < calls.length && calls[j].t - calls[i].t < 1000; j++) n++; maxPerSec = Math.max(maxPerSec, n); }
    return JSON.stringify({
      stopMs: lm === null ? 0 : Math.round(lm - tStopRot),
      stillMovingAtEndOfHold: lm !== null && lm > tBack - 60,
      movedAfterStop: +(posEnd - posAtStop).toFixed(2),
      movedDuringRotation: +(posAtStop - startPos).toFixed(2),
      backStopMs: lmBack === null ? 0 : Math.round(lmBack - tStopBack),
      seeksDuringRotation: during.length,
      seeksAfterRotationStopped: afterStop.length,
      lastSeekAfterStopMs: afterStop.length ? Math.round(afterStop[afterStop.length - 1].t - tStopRot) : 0,
      totalSeeks: calls.length,
      maxSeeksPerSec: maxPerSec,
      plays: T.rec.calls.filter((c) => c.m === 'play' && c.t >= mark).length,
      pauses: T.rec.calls.filter((c) => c.m === 'pause' && c.t >= mark).length,
    });
  `);
  return { clutch, mapping, playing, grabbed, ...JSON.parse(out) };
}

/**
 * Stop by LETTING GO while the hand is still tilted (the joystick's way of stopping is to return to centre; the
 * claw's is to open the hand). How long until the music stops being moved by the knob?
 * `how`: claw: "uncurl" | "drop"; twoHand: "left-shape" (the left hand changes shape) | "drop" (the left hand leaves).
 */
async function letGo({ clutch, mapping, how, leftShape }) {
  await fresh();
  await p.eval(`T.set('knob-clutch', '${clutch}'); T.set('knob-motion', 'tilt'); T.set('knob-mapping', '${mapping}'); T.set('knob-target', 'playhead');`);
  await p.eval(`__dance.player.seek(30); await T.sleep(700);`);
  const specs = clutch === "claw" ? `(tilt) => [T.claw(tilt)]` : `(tilt) => [T.left('Open_Palm'), T.right(tilt)]`;
  if (clutch === "claw") await p.eval(`await T.hold((t) => [T.right(t)], 0, 350); await T.hold(${specs}, 0, 450);`);
  else await p.eval(`await T.hold(${specs}, 0, 700);`);
  await p.eval(`T.rec.calls.length = 0; T.rec.samples.length = 0;`);
  const after =
    how === "uncurl"
      ? `(tilt) => [T.right(tilt)]`
      : how === "left-shape"
        ? `(tilt) => [T.left('${leftShape ?? "None"}'), T.right(tilt)]`
        : clutch === "claw"
          ? `(tilt) => []`
          : `(tilt) => [T.right(tilt)]`;
  const out = await p.eval(`
    const specs = ${specs};
    await T.rot(specs, 0, 40, 300);
    await T.hold(specs, 40, 500);
    const R = performance.now();
    let releasedAt = null;
    const after = ${after};
    while (performance.now() - R < 1500) {
      __dance.setHands(after(40));
      if (releasedAt === null && !__dance.knob.grabbed) releasedAt = performance.now();
      await T.sleep(8);
    }
    const seeks = T.rec.calls.filter((c) => c.m === 'seek' && c.t >= R);
    const s = T.rec.samples;
    let lastMove = null;
    for (let i = 1; i < s.length; i++) if (s[i][0] >= R && Math.abs(s[i][1] - s[i - 1][1]) > 0.003) lastMove = s[i][0];
    return JSON.stringify({
      releasedMs: releasedAt === null ? null : Math.round(releasedAt - R),
      lastSeekMs: seeks.length ? Math.round(seeks[seeks.length - 1].t - R) : 0,
      lastPlayheadMoveMs: lastMove === null ? 0 : Math.round(lastMove - R),
      seeksAfter: seeks.length,
    });
  `);
  return { release: `${clutch}/${mapping}/${how}`, ...JSON.parse(out) };
}

/**
 * Skipping while PLAYING + steering: a slow, steady turn (what a fine adjustment looks like). Every seek is a
 * jump in the audio, so seeks per second of steering is the skipping; "jump" is how far each one moved the playhead.
 */
async function slowSteer({ clutch, mapping, deg, ms }) {
  await fresh();
  await p.eval(`T.set('knob-clutch', '${clutch}'); T.set('knob-motion', 'tilt'); T.set('knob-mapping', '${mapping}'); T.set('knob-target', 'playhead');`);
  await p.eval(`__dance.player.seek(10); await __dance.player.play(); await T.sleep(500);`);
  const specs = clutch === "claw" ? `(tilt) => [T.claw(tilt)]` : `(tilt) => [T.left('Open_Palm'), T.right(tilt)]`;
  if (clutch === "claw") await p.eval(`await T.hold((t) => [T.right(t)], 0, 350); await T.hold(${specs}, 0, 450);`);
  else await p.eval(`await T.hold(${specs}, 0, 700);`);
  const out = await p.eval(`
    const specs = ${specs};
    T.rec.calls.length = 0;
    const t0 = performance.now();
    await T.rot(specs, 0, ${deg}, ${ms});
    const t1 = performance.now();
    await T.hold(specs, ${deg}, 600);
    const seeks = T.rec.calls.filter((c) => c.m === 'seek');
    const during = seeks.filter((c) => c.t <= t1);
    const jumps = during.map((c) => Math.abs(c.a - c.before));
    const mean = jumps.length ? jumps.reduce((a, b) => a + b, 0) / jumps.length : 0;
    return JSON.stringify({
      steerSec: +((t1 - t0) / 1000).toFixed(2),
      seeksWhileTurning: during.length,
      seeksPerSec: +(during.length / ((t1 - t0) / 1000)).toFixed(1),
      meanJumpMs: Math.round(mean * 1000),
      seeksAfterStop: seeks.length - during.length,
    });
  `);
  return { slow: `${clutch}/${mapping} ${deg}deg in ${ms}ms (playing)`, ...JSON.parse(out) };
}

// Every scenario runs REPEAT times (default 3); numbers are the median, because frame timing in a headless page is jittery.
const REPEAT = Number(process.env.REPEAT ?? 3);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function repeat(fn) {
  const runs = [];
  for (let i = 0; i < REPEAT; i++) runs.push(await fn());
  const out = { ...runs[0] };
  for (const k of Object.keys(out)) if (typeof out[k] === "number") out[k] = median(runs.map((r) => r[k]));
  for (const k of Object.keys(out)) if (typeof out[k] === "boolean") out[k] = runs.some((r) => r[k]);
  return out;
}

// QUICK=1: only the two-hand + relative rows (for tuning).
const QUICK = process.env.QUICK === "1";
const slow = [];
for (const [deg, ms] of [[30, 3000], [60, 1500]]) {
  if (!QUICK) slow.push(await repeat(() => slowSteer({ clutch: "claw", mapping: "joystick", deg, ms })));
  if (!QUICK) slow.push(await repeat(() => slowSteer({ clutch: "twoHand", mapping: "joystick", deg, ms })));
  slow.push(await repeat(() => slowSteer({ clutch: "twoHand", mapping: "relative", deg, ms })));
}

const rows = [];
for (const clutch of QUICK ? ["twoHand"] : ["claw", "twoHand"])
  for (const mapping of QUICK ? ["relative"] : ["joystick", "relative"])
    for (const playing of [false, true]) rows.push(await repeat(() => steer({ clutch, mapping, playing })));
const release = [];
if (!QUICK) for (const [clutch, how] of [["claw", "uncurl"], ["claw", "drop"], ["twoHand", "left-shape"], ["twoHand", "drop"]]) release.push(await repeat(() => letGo({ clutch, mapping: "joystick", how })));
if (WHEEL) release.push(await repeat(() => letGo({ clutch: "twoHand", mapping: "relative", how: "left-shape" })));

console.log(`# ${label}`);
for (const r of rows) console.log(JSON.stringify(r));
for (const r of release) console.log(JSON.stringify(r));
for (const r of slow) console.log(JSON.stringify(r));
p.close();
