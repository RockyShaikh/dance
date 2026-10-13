// Sim end-to-end for R6: the shared command zone (top quarter), thumb-based handedness (L / R chips), and zoom (crop the
// frame to the zone + margin, give only the crop to the model, map the landmarks back).
// In ?sim the "model" is src/sim.ts simRecognize: it returns landmarks in the CROP's coordinates when zoom is on, exactly as
// the real recognizer does, so the app's mapping back to the full frame is exercised for real.
// Needs the dev server (`npx vite --port 5188`) and a test track (`node scripts/make-test-wav.mjs 120`). Chrome runs with --mute-audio.
//
//   DANCE_URL='http://localhost:5188/?sim&simfps=30&track=/test/click-track.wav' node scripts/e2e/zone.mjs
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const SHOTS = process.env.DANCE_SHOTS ?? "/tmp/dance-e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const URL = process.env.DANCE_URL ?? "http://localhost:5188/?sim&simfps=30&track=/test/click-track.wav";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9339));
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
    // Palm centres are display-normalized (as the user sees the mirrored picture). Default y 0.12 = inside the top quarter.
    hand: (hand, shape, x, o = {}) => ({ shape, hand, palm: { x, y: 0.12 }, ...o }),
    show: async (specs, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { __dance.setHands(specs); await T.sleep(16); } },
    labels: () => __dance.hands.map((h) => h.hand + '@' + h.palm.x.toFixed(2)).sort().join(' '),
    sources: () => __dance.hands.map((h) => h.handSource).join(','),
    state: () => __dance.player.state,
    loop: () => __dance.practice.loopState,
    grabbed: () => !!__dance.knob.grabbed,
    fires: () => __dance.log.length,
  };
`;
async function fresh(settings = null) {
  await p.goto(URL);
  await ev(`localStorage.clear(); ${settings ? `localStorage.setItem('dance.r2.settings', ${JSON.stringify(JSON.stringify(settings))});` : ""}`);
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,1500))`);
  await ev(prelude);
}

console.log("\n== 1. The shared zone: the top quarter, both hands, gating");
await fresh({ boxes: { Left: { x: 0, y: 0, w: 0.5, h: 1 }, Right: { x: 0.5, y: 0, w: 0.5, h: 1 } }, dwellMs: 800 }); // an OLD saved settings blob
const zone = JSON.parse(await ev(`return JSON.stringify(__dance.zone)`));
check("old per-hand boxes migrated to the default top quarter (and the old dwell slider carried over)", zone.x === 0 && zone.y === 0 && zone.w === 1 && zone.h === 0.25 && (await ev(`return JSON.parse(localStorage.getItem('dance.r2.settings') ?? '{}').dwellMs ?? 800`)) === 800, JSON.stringify(zone));
await ev(`__dance.player.seek(10); await __dance.player.play(); await T.sleep(300)`);
await ev(`await T.show([T.hand('Right', 'Closed_Fist', 0.3, { palm: { x: 0.3, y: 0.4 } })], 1500)`);
check("right fist BELOW the zone: nothing fires, still playing", (await ev(`return T.fires()`)) === 0 && (await ev(`return T.state()`)) === "playing");
await ev(`await T.show([], 800)`);
await ev(`await T.show([T.hand('Right', 'Closed_Fist', 0.3)], 1500)`);
check("right fist INSIDE the zone, on the LEFT of the picture: play/pause fires (paused)", (await ev(`return T.state()`)) === "paused" && (await ev(`return T.fires()`)) === 1);
await ev(`await T.show([], 1500); await T.show([T.hand('Left', 'Victory', 0.85)], 1200)`);
check("left V inside the zone on the RIGHT of the picture (no left-half box any more): sets START", (await ev(`return T.loop().start`)) !== null);
await ev(`await T.show([], 1500); await T.show([T.hand('Left', 'Pointing_Up', 0.2, { palm: { x: 0.2, y: 0.3 } })], 1200)`);
check("left index just below the zone: no END set", (await ev(`return T.loop().end`)) === null);
await shot("01-zone-default");

console.log("\n== 2. Handedness from the thumb (L / R labels)");
await fresh();
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.25), T.hand('Right', 'Open_Palm', 0.75)], 400)`);
check("two hands side by side: L on the left, R on the right", (await ev(`return T.labels()`)) === "Left@0.25 Right@0.75", await ev(`return T.labels()`));
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.8), T.hand('Right', 'Open_Palm', 0.2)], 400)`);
check("crossed over (left hand on the right of the picture): the labels follow the thumbs", (await ev(`return T.labels()`)) === "Right@0.20 Left@0.80".split(" ").sort().join(" "), await ev(`return T.labels()`));
await shot("02-crossed-labels");
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.25, { label: 'Right' }), T.hand('Right', 'Open_Palm', 0.75, { label: 'Left' })], 400)`);
check("the model's labels both WRONG: the thumbs still win", (await ev(`return T.labels()`)) === "Left@0.25 Right@0.75" && (await ev(`return T.sources()`)) === "thumb,thumb", `${await ev(`return T.labels()`)} ${await ev(`return T.sources()`)}`);
await ev(`await T.show([T.hand('Right', 'Open_Palm', 0.3), T.hand('Right', 'Open_Palm', 0.7, { scale: 3 })], 400)`);
check("two hands whose thumbs both read right: the pair rule makes one of them left", (await ev(`return JSON.stringify(__dance.hands.map((h) => h.hand).sort())`)) === '["Left","Right"]' && (await ev(`return T.sources()`)).includes("pair"), await ev(`return T.sources()`));
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.5)], 400)`);
check("one LEFT hand alone with a clear thumb: it is left (thumb)", (await ev(`return T.labels()`)) === "Left@0.50" && (await ev(`return T.sources()`)) === "thumb");
await ev(`await T.show([T.hand('Right', 'Open_Palm', 0.5)], 400)`);
check("one RIGHT hand alone: right (thumb)", (await ev(`return T.labels()`)) === "Right@0.50");
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.5, { noThumb: true, label: 'Left' })], 400)`);
check("one hand, no readable thumb (and the model says left): assumed RIGHT, marked as a default", (await ev(`return T.labels()`)) === "Right@0.50" && (await ev(`return T.sources()`)) === "default");
await shot("03-one-hand-default");
const sh = {};
for (const [name, spec] of Object.entries({ palm: ["Open_Palm", {}], v: ["Victory", {}], index: ["Pointing_Up", {}], fist: ["Closed_Fist", {}], thumbsUp: ["Thumb_Up", {}], shaka: ["None", { fingers: "10001" }] })) {
  for (const hand of ["Left", "Right"]) {
    await ev(`await T.show([T.hand('${hand}', '${spec[0]}', 0.5, ${JSON.stringify({ ...spec[1], tilt: 30 })})], 200)`);
    sh[`${name} ${hand}`] = await ev(`return __dance.hands[0].hand + ' ' + __dance.hands[0].thumb.conf.toFixed(2)`);
  }
}
check("every fixture shape (palm, V, index, fist, thumbs up, shaka), both hands, rolled 30 degrees, one hand in view: read as the right hand", Object.entries(sh).every(([k, v]) => v.startsWith(k.split(" ")[1])), JSON.stringify(sh));

console.log("\n== 3. The steering wheel with crossed arms, and the zone for both hands");
await fresh();
await ev(`__dance.player.seek(10); await __dance.player.play(); await T.sleep(300)`);
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.8), T.hand('Right', 'None', 0.2)], 800)`);
check("LEFT palm on the right of the picture + RIGHT hand on the left (crossed): grabbed (roles by hand, not by screen side)", (await ev(`return T.grabbed()`)) && (await ev(`return __dance.steer.mode`)) === "palm");
await ev(`await T.show([], 800)`);
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.25, { palm: { x: 0.25, y: 0.5 } }), T.hand('Right', 'None', 0.75)], 800)`);
check("the left palm BELOW the zone: no grab", !(await ev(`return T.grabbed()`)));
await ev(`await T.show([], 800)`);
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.25), T.hand('Right', 'None', 0.75)], 800)`);
check("both in the zone, side by side: grabbed", await ev(`return T.grabbed()`));
await ev(`await T.show([T.hand('Left', 'Closed_Fist', 0.25, { curl: 1 }), T.hand('Right', 'None', 0.75)], 800)`);
check("left FIST during the grab: still grabbed, fist mode (the guard and the steer modes work on the thumb-labelled hand)", (await ev(`return T.grabbed()`)) && (await ev(`return __dance.steer.mode`)) === "fist");

console.log("\n== 4. Zoom: crop to the zone + margin; landmarks mapped back to the full frame");
const spots = [
  [0.1, 0.05],
  [0.5, 0.12],
  [0.9, 0.2],
];
const measure = async (zoomOn) => {
  const out = [];
  for (const [x, y] of spots) {
    await ev(`await T.show([T.hand('Right', 'Victory', ${x}, { palm: { x: ${x}, y: ${y} } })], 250)`);
    out.push(JSON.parse(await ev(`const h = __dance.hands[0]; return JSON.stringify(h ? { palm: h.palm, lm: h.landmarks[8], n: __dance.hands.length } : null)`)));
  }
  return out;
};
await fresh();
check("zoom off by default (persisted setting)", !(await ev(`return document.getElementById('zoom-toggle').checked`)) && (await ev(`return __dance.crop`)) === null);
const off = await measure(false);
await ev(`document.getElementById('zoom-toggle').click(); await T.sleep(300)`);
check("the Zoom checkbox turns the crop on (persisted in localStorage)", (await ev(`return !!__dance.crop`)) && (await ev(`return JSON.parse(localStorage.getItem('dance.r2.settings')).zoom`)) === true);
const crop = JSON.parse(await ev(`return JSON.stringify(__dance.crop)`));
const mag = Math.max(crop.srcW, crop.srcH) / crop.side;
check("default zone: crop is the full width x top quarter + margin (square canvas, padded)", crop.x0 === 0 && crop.cw === 1280 && crop.y0 === 0 && crop.ch === 266 && crop.side === 1280, JSON.stringify({ cw: crop.cw, ch: crop.ch, side: crop.side, oy: crop.oy }));
console.log(`      effective magnification at the default zone: x${mag.toFixed(2)} (a full-width strip is as wide as the frame)`);
const on = await measure(true);
const maxErr = Math.max(...off.flatMap((o, i) => [Math.abs(o.palm.x - on[i].palm.x), Math.abs(o.palm.y - on[i].palm.y), Math.abs(o.lm.x - on[i].lm.x), Math.abs(o.lm.y - on[i].lm.y)]));
check("landmarks mapped back: palm centre and the index tip with zoom ON equal zoom OFF at three spots (max difference)", maxErr < 1e-6, `${maxErr.toExponential(2)}`);
const want = spots.map(([x, y], i) => Math.abs(on[i].palm.x - x) + Math.abs(on[i].palm.y - y));
check("...and the palm centre is where it was put (display space)", Math.max(...want) < 1e-6);
check("the note beside the toggle says there is no magnification for a full-width zone", (await ev(`return document.getElementById('zoom-note').textContent`)).includes("no magnification"), await ev(`return document.getElementById('zoom-note').textContent`));
await ev(`await T.show([T.hand('Right', 'Victory', 0.6, { palm: { x: 0.6, y: 0.5 } })], 300)`);
check("zoom on: a hand well below the zone (outside the crop) is not tracked at all", (await ev(`return __dance.hands.length`)) === 0);
await ev(`await T.show([T.hand('Right', 'Victory', 0.6, { palm: { x: 0.6, y: 0.3 } })], 300)`);
check("zoom on: a hand in the margin (between the zone and the crop edge) is tracked, but is not in the zone", (await ev(`return __dance.hands.length`)) === 1 && (await ev(`return __dance.hands[0].palm.y`)) > 0.25);
await ev(`document.getElementById('zoom-toggle').click(); await T.sleep(300); await T.show([T.hand('Right', 'Victory', 0.6, { palm: { x: 0.6, y: 0.5 } })], 300)`);
check("zoom off again: the same low hand is tracked (drawn) but outside the zone", (await ev(`return __dance.hands.length`)) === 1 && !(await ev(`return !!__dance.crop`)));

console.log("\n== 5. Zoom with a narrower zone (right half of the picture, top quarter)");
await fresh({ zone: { x: 0.5, y: 0, w: 0.5, h: 0.25 }, zoom: true });
const crop2 = JSON.parse(await ev(`return JSON.stringify(__dance.crop)`));
const mag2 = Math.max(crop2.srcW, crop2.srcH) / crop2.side;
console.log(`      effective magnification at a half-width zone: x${mag2.toFixed(2)} (crop ${crop2.cw}x${crop2.ch}, side ${crop2.side})`);
check("crop = the zone's half of the RAW frame (the mirror flips x: display right = raw left) plus margin, magnification above 1.5", crop2.x0 === 0 && crop2.cw > 640 && crop2.cw < 760 && mag2 > 1.5, JSON.stringify({ x0: crop2.x0, cw: crop2.cw, ch: crop2.ch, mag: mag2 }));
const spots2 = [
  [0.55, 0.05],
  [0.75, 0.15],
  [0.95, 0.22],
];
let worst = 0;
for (const [x, y] of spots2) {
  await ev(`await T.show([T.hand('Right', 'Open_Palm', ${x}, { palm: { x: ${x}, y: ${y} } })], 250)`);
  const got = JSON.parse(await ev(`const h = __dance.hands[0]; return JSON.stringify(h ? h.palm : null)`));
  worst = Math.max(worst, got ? Math.abs(got.x - x) + Math.abs(got.y - y) : 9);
}
check("hands in the narrow zone come back at exactly the right place (mapping through a non-square crop)", worst < 1e-6, worst.toExponential(2));
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.6), T.hand('Right', 'Open_Palm', 0.9)], 300)`);
check("two hands in the narrow zone: both tracked, L and R by thumb", (await ev(`return T.labels()`)) === "Left@0.60 Right@0.90", await ev(`return T.labels()`));
await ev(`await T.show([T.hand('Left', 'Open_Palm', 0.2), T.hand('Right', 'Open_Palm', 0.9)], 300)`);
check("zoom on: a hand on the other half of the picture (outside the crop) is not tracked: one hand in view", (await ev(`return __dance.hands.length`)) === 1);
await shot("04-zoom-narrow-zone");

console.log(`\n${pass} passed, ${fail} failed`);
p.close();
process.exit(fail ? 1 : 0);
