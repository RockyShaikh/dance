// Sim end-to-end for R9 (video): a local MP4 drives the same engine as audio (play / pause / restart, loop wrap, scrub, 0.5x, hold-2x),
// the layout (video large, camera in the corner), the mirror switch (default on, persisted), the waveform from the video's audio.
// Needs the dev server (`npx vite --port 5191`) and the synthetic video (`node scripts/make-test-video.mjs`, git-ignored).
// Chrome runs with --mute-audio (cdp.mjs).
//
//   node scripts/e2e/video.mjs        prints PASS / FAIL lines, writes screenshots to /tmp/dance-e2e-shots/ and always closes Chrome
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const SHOTS = process.env.DANCE_SHOTS ?? "/tmp/dance-e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const URL = process.env.DANCE_URL ?? "http://localhost:5191/?sim&simfps=30&track=/test/test-video.mp4";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9341));
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
    right: (tilt, o = {}) => ({ shape: 'None', hand: 'Right', palm: { x: 0.75, y: 0.14 }, curl: 0, tilt, ...o }),
    left: (shape, o = {}) => ({ shape, hand: 'Left', palm: { x: 0.25, y: 0.14 }, ...o }),
    thumb: (o = {}) => T.right(0, { shape: 'Thumb_Up', curl: 1, ...o }),
    show: async (specs, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { __dance.setHands(specs); await T.sleep(16); } },
    turn: async (left, a, b, ms) => { const t0 = performance.now(); for (;;) { const f = Math.min(1, (performance.now() - t0) / ms); __dance.setHands([left, T.right(a + (b - a) * f)]); if (f >= 1) break; await T.sleep(16); } },
    set: (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input')); },
    until: async (specs, want, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { __dance.setHands(specs); await T.sleep(8); if (__dance.player.rate === want) return performance.now() - t0; } return -1; },
    media: () => document.getElementById('media'),
    cur: () => __dance.player.currentTime,
    state: () => __dance.player.state,
    rect: (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; },
    // R9b: a pointer event on the timeline bar at a fraction f (0..1) of its width; the last argument picks another element to press on.
    ptr: (type, f, on = 'timeline') => { const r = document.getElementById('timeline').getBoundingClientRect(); const x = r.left + f * r.width, y = r.top + r.height / 2; document.getElementById(on).dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse' })); },
    key: (code) => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })),
  };
  { const synth = window.speechSynthesis; if (synth) { synth.cancel = () => {}; synth.speak = () => {}; } } // quiet machine: nothing is ever spoken
`;

async function fresh() {
  await p.goto(URL);
  await ev(`localStorage.clear()`);
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,2500))`);
  await ev(prelude);
  await ev(`document.getElementById('media').muted = true`); // nothing audible, ever (also --mute-audio)
}

try {
  console.log("\n== 1. Load: the video is the player, the layout, the waveform");
  await fresh();
  const info = JSON.parse(await ev(`const m = T.media(); return JSON.stringify({ dur: __dance.player.duration, hasVideo: __dance.player.hasVideo, vw: m.videoWidth, vh: m.videoHeight, cls: document.body.className, ready: m.readyState, src: m.src.slice(0, 5), state: T.state() })`));
  check("the MP4 loads into the <video> element (60 s, 1280x720)", info.dur > 59.9 && info.dur < 60.2 && info.vw === 1280 && info.vh === 720 && info.src === "blob:", JSON.stringify(info));
  check("the player knows it has a picture; body.has-video", info.hasVideo === true && /has-video/.test(info.cls));
  const lay = JSON.parse(await ev(`return JSON.stringify({ stage: T.rect('stage'), media: T.rect('media'), frame: T.rect('frame'), win: innerHeight })`));
  check("the video fills the stage (large: more than half the window's height)", lay.media.w >= lay.stage.w - 2 && lay.media.h >= lay.stage.h - 2 && lay.stage.h > lay.win * 0.5, JSON.stringify({ stage: lay.stage, media: lay.media, win: lay.win }));
  check("the camera view is a small corner picture, inside the stage's bottom-right", lay.frame.w < lay.stage.w * 0.35 && lay.frame.h < lay.stage.h * 0.55 && lay.frame.x + lay.frame.w <= lay.stage.x + lay.stage.w + 1 && lay.frame.y > lay.stage.y + lay.stage.h * 0.4, JSON.stringify(lay.frame));
  await ev(`await T.sleep(1200)`);
  const wave = JSON.parse(await ev(`const pk = __dance.practice.waveform; const c = document.getElementById('tl-wave'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++; return JSON.stringify({ duration: pk ? +pk.duration.toFixed(2) : 0, lit, w: c.width })`));
  check("the waveform is decoded from the video's audio track and drawn", wave.duration > 59 && wave.duration < 61 && wave.lit > wave.w, JSON.stringify(wave));

  console.log("\n== 2. Play / pause / restart on video (keys, as the buttons and gestures take the same path)");
  await ev(`T.key('Space'); await T.sleep(1500)`);
  const t1 = await ev(`return T.cur()`);
  check("Space plays: the playhead and the video clock move", (await ev(`return T.state()`)) === "playing" && t1 > 1.2 && Math.abs(t1 - (await ev(`return T.media().currentTime`))) < 0.3, `playhead ${t1.toFixed(2)}`);
  const frames = JSON.parse(await ev(`const q = T.media().getVideoPlaybackQuality(); return JSON.stringify({ total: q.totalVideoFrames, dropped: q.droppedVideoFrames })`));
  check("the picture is really decoding frames (about 30 per second)", frames.total > 30, JSON.stringify(frames));
  await ev(`T.key('Space'); await T.sleep(300)`);
  const tp = await ev(`return T.cur()`);
  await ev(`await T.sleep(500)`);
  check("Space pauses and holds the spot", (await ev(`return T.state()`)) === "paused" && (await ev(`return T.cur()`)) === tp);
  await ev(`__dance.practice.perform('setStart', { markAt: 10 }); T.key('KeyR'); await T.sleep(400)`);
  check("restart goes back to the loop START (10 s) and plays", Math.abs((await ev(`return T.cur()`)) - 10.3) < 0.6 && (await ev(`return T.state()`)) === "playing", `at ${(await ev(`return T.cur()`)).toFixed(2)}`);
  await ev(`T.key('Home'); await T.sleep(400)`);
  check("Home goes to 0:00 and plays", (await ev(`return T.cur()`)) < 1 && (await ev(`return T.state()`)) === "playing");

  console.log("\n== 3. A loop wraps cleanly on video");
  await ev(`__dance.practice.perform('clearLoop'); __dance.practice.perform('setStart', { markAt: 10 }); __dance.practice.perform('setEnd', { markAt: 14 }); __dance.player.seek(9); await __dance.player.play(); await T.sleep(100);`);
  await ev(`await T.sleep(13500)`);
  const wr = JSON.parse(await ev(`const h = __dance.practice.wrapper.history; return JSON.stringify({ wraps: __dance.practice.wrapper.wraps, over: h.map(r => +(r.overshootSec * 1000).toFixed(1)), seeked: h.map(r => r.seekedMs === null ? null : +r.seekedMs.toFixed(1)), landed: h.map(r => +r.landedAt.toFixed(2)), cur: T.cur(), state: T.state() })`));
  check("it wrapped at least 3 times in 13.5 s (a 4 s loop)", wr.wraps >= 3, JSON.stringify(wr));
  check("every wrap lands on START (10.00)", wr.landed.every((x) => x === 10), wr.landed.join(","));
  const over = wr.over;
  check("overshoot past END is small (report; limit 80 ms)", over.length > 0 && Math.max(...over) < 80, `overshoot ms: ${over.join(", ")} (max ${Math.max(...over)})`);
  const seeked = wr.seeked.filter((x) => x !== null);
  console.log(`      seek-to-seeked ms on video: ${seeked.join(", ")}`);
  check("the playhead stays inside the loop and keeps playing", wr.cur >= 9.9 && wr.cur <= 14.1 && wr.state === "playing", `at ${wr.cur.toFixed(2)}`);
  await shot("01-video-loop-playing");

  console.log("\n== 4. Scrub (steering wheel) on video");
  await ev(`__dance.practice.perform('clearLoop'); __dance.player.seek(20); __dance.player.pause(); T.set('knob-motion', 'tilt'); T.set('knob-mapping', 'relative'); await T.sleep(300)`);
  await ev(`await T.show([T.left('Open_Palm'), T.right(0)], 500)`);
  await ev(`await T.turn(T.left('Open_Palm'), 0, 40, 900); await T.show([T.left('Open_Palm'), T.right(40)], 400)`);
  const sc = JSON.parse(await ev(`return JSON.stringify({ cur: T.cur(), media: T.media().currentTime, grabbed: !!__dance.knob.grabbed })`));
  check("a wheel turn scrubs the video's playhead (and the picture follows)", sc.grabbed && sc.cur > 20.4 && Math.abs(sc.cur - sc.media) < 0.2, JSON.stringify(sc));
  await ev(`await T.show([], 700)`);
  await shot("02-video-scrub-zoom");

  console.log("\n== 5. Speed: 0.5x, and hold-2x");
  await ev(`__dance.player.seek(30); await __dance.player.play(); __dance.practice.perform('speedSet', { rate: 0.5 }); await T.sleep(300)`);
  const a0 = await ev(`return [T.cur(), performance.now()]`);
  await ev(`await T.sleep(3000)`);
  const a1 = await ev(`return [T.cur(), performance.now(), T.media().playbackRate, T.media().preservesPitch]`);
  const ratio = (a1[0] - a0[0]) / ((a1[1] - a0[1]) / 1000);
  check("0.5x on video: the clock advances at half speed, pitch preserved", Math.abs(ratio - 0.5) < 0.04 && a1[2] === 0.5 && a1[3] === true, `${ratio.toFixed(3)} s of video per s`);
  const f0 = await ev(`return T.media().getVideoPlaybackQuality().totalVideoFrames`);
  await ev(`await T.sleep(2000)`);
  const f1 = await ev(`return T.media().getVideoPlaybackQuality().totalVideoFrames`);
  check("at 0.5x the picture shows about 15 new frames a second", f1 - f0 > 20 && f1 - f0 < 45, `${f1 - f0} frames in 2 s`);
  await ev(`__dance.practice.perform('speedSet', { rate: 1 }); await T.sleep(200)`);
  const engage = await ev(`return await T.until([T.thumb()], 2, 3000)`);
  check("hold the right thumbs up: 2x engages on video", engage > 250 && engage < 700, `${engage.toFixed(0)} ms`);
  const h0 = await ev(`return [T.cur(), performance.now()]`);
  await ev(`await T.show([T.thumb()], 1500)`);
  const h1 = await ev(`return [T.cur(), performance.now(), T.media().playbackRate]`);
  const hr = (h1[0] - h0[0]) / ((h1[1] - h0[1]) / 1000);
  check("held: the video plays at 2x", h1[2] === 2 && Math.abs(hr - 2) < 0.2, `${hr.toFixed(2)} s of video per s`);
  const rel = await ev(`const t0 = performance.now(); for (;;) { __dance.setHands([]); await T.sleep(8); if (__dance.player.rate === 1) return performance.now() - t0; if (performance.now() - t0 > 2000) return -1; }`);
  check("released: back to 1x", rel > 0 && rel < 400, `${rel.toFixed(0)} ms`);
  await ev(`__dance.player.pause()`);

  console.log("\n== 6. Mirror switch");
  const m0 = JSON.parse(await ev(`const m = T.media(); const cb = document.getElementById('mirror-video'); return JSON.stringify({ t: getComputedStyle(m).transform, checked: cb.checked, label: cb.parentElement.textContent.trim() })`));
  check("default: mirrored, and the label says so", m0.t === "matrix(-1, 0, 0, 1, 0, 0)" && m0.checked && /mirror/i.test(m0.label), JSON.stringify(m0));
  await ev(`document.getElementById('mirror-video').click(); await T.sleep(100)`);
  const m1 = await ev(`return getComputedStyle(T.media()).transform`);
  check("untick: the picture is not flipped", m1 === "none", m1);
  check("only the picture flips: the camera view and the HUD are unchanged", (await ev(`return getComputedStyle(document.getElementById('mirror')).transform`)) === "matrix(-1, 0, 0, 1, 0, 0)");
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,2000))`);
  await ev(prelude);
  check("the choice persists across a reload", (await ev(`return getComputedStyle(T.media()).transform`)) === "none" && !(await ev(`return document.getElementById('mirror-video').checked`)));
  await ev(`document.getElementById('mirror-video').click(); await T.sleep(100)`);
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,2000))`);
  check("and so does turning it back on", (await ev(`return getComputedStyle(document.getElementById('media')).transform`)) === "matrix(-1, 0, 0, 1, 0, 0)");

  console.log("\n== 7. Camera view switch, and an audio file keeps the camera large");
  await ev(prelude);
  await ev(`document.getElementById('show-camera').click(); await T.sleep(100)`);
  check("camera view off: the corner picture is hidden", (await ev(`return getComputedStyle(document.getElementById('frame')).visibility`)) === "hidden");
  await shot("03-video-camera-hidden");
  await ev(`document.getElementById('show-camera').click(); await T.sleep(100)`);
  check("camera view on: back", (await ev(`return getComputedStyle(document.getElementById('frame')).visibility`)) === "visible");
  const aud = JSON.parse(await ev(`const r = await fetch('/test/click-track.wav'); const b = await r.blob(); __dance.practice.load(new File([b], 'click-track.wav', { type: 'audio/wav' })); await T.sleep(1500); return JSON.stringify({ cls: document.body.className, hasVideo: __dance.player.hasVideo, pos: getComputedStyle(document.getElementById('frame')).position, media: T.rect('media'), frame: T.rect('frame'), stage: T.rect('stage') })`));
  check("loading an audio file afterwards: no video stage, the camera is large again", !aud.hasVideo && !/has-video/.test(aud.cls) && aud.pos === 'relative' && aud.frame.w >= 400 && aud.media.w === 0, JSON.stringify(aud));
  await ev(`__dance.practice.load(new File([new Blob(['nope'])], 'notes.txt', { type: 'text/plain' }))`);
  check("a non-media file is refused with a message", (await ev(`return document.getElementById('hint').textContent`)).includes("not an audio or video file"));

  console.log("\n== R9b. Mouse on the timeline, upload button, play/pause dropdown");
  await fresh();
  check("a prominent 'Open video / audio' button is on the main screen, and the file input accepts video and audio", (await ev(`const b = document.getElementById('btn-open'); const i = document.getElementById('file-input'); const r = b.getBoundingClientRect(); return b.textContent.includes('Open video / audio') && r.width > 0 && r.bottom <= innerHeight && /video/.test(i.accept) && /audio/.test(i.accept) && /mp4/.test(i.accept) && /mov/.test(i.accept) && /webm/.test(i.accept) && /m4v/.test(i.accept)`)) === true);
  await ev(`T.ptr('pointerdown', 0.5); T.ptr('pointerup', 0.5); await T.sleep(400)`);
  const c1 = await ev(`return T.cur()`);
  check("click at the middle of the timeline seeks to about 30 s (paused stays paused)", Math.abs(c1 - 30) < 1.5 && (await ev(`return T.state()`)) !== "playing", `cur ${c1}`);
  await ev(`T.ptr('pointerdown', 0.2); for (let f = 0.2; f <= 0.8; f += 0.02) { T.ptr('pointermove', f); await T.sleep(20); } T.ptr('pointerup', 0.8); await T.sleep(500)`);
  const c2 = await ev(`return T.cur()`);
  check("press and drag 20% to 80%: the playhead ends at about 48 s, the video frame is there too, still paused", Math.abs(c2 - 48) < 1.5 && (await ev(`return T.state()`)) !== "playing" && Math.abs((await ev(`return T.media().currentTime`)) - c2) < 0.05, `cur ${c2}`);
  const seeks = await ev(`T.key('Space'); await T.sleep(300); const a = []; T.ptr('pointerdown', 0.1); for (let f = 0.1; f <= 0.6; f += 0.01) { T.ptr('pointermove', f); a.push(T.cur()); await T.sleep(16); } T.ptr('pointerup', 0.6); await T.sleep(500); return JSON.stringify({ state: T.state(), cur: T.cur() })`);
  const sk = JSON.parse(seeks);
  check("dragging while playing: still playing afterwards, and landed near 36 s (+ a moment of play)", sk.state === "playing" && sk.cur > 35 && sk.cur < 38.5, seeks);
  await ev(`T.key('Space'); await T.sleep(200)`);
  await ev(`T.key('KeyV'); await T.sleep(100)`); // START at the playhead
  const s0 = await ev(`return __dance.practice.loopState.start`);
  await ev(`__dance.player.seek(40); await T.sleep(300); T.key('KeyE'); await T.sleep(100)`);
  const e0 = await ev(`return __dance.practice.loopState.end`);
  await ev(`T.ptr('pointerdown', 0.5, 'flag-start'); T.ptr('pointermove', 0.45); T.ptr('pointermove', 0.4); T.ptr('pointerup', 0.4); await T.sleep(200)`);
  const lp = JSON.parse(await ev(`return JSON.stringify(__dance.practice.loopState)`));
  check("dragging the START flag moves it to about 24 s (END untouched)", Math.abs(lp.start - 24) < 1.0 && lp.end === e0, JSON.stringify({ s0, e0, lp }));
  await ev(`T.ptr('pointerdown', 0.6, 'flag-start'); T.ptr('pointermove', 0.95); T.ptr('pointerup', 0.95); await T.sleep(200)`);
  const lp2 = JSON.parse(await ev(`return JSON.stringify(__dance.practice.loopState)`));
  check("START dragged past END stops short of END (clamp)", lp2.start < lp2.end && lp2.end - lp2.start < 1.0, JSON.stringify(lp2));
  await ev(`T.ptr('pointerdown', 0.7, 'flag-end'); T.ptr('pointermove', 1.0); T.ptr('pointerup', 1.0); await T.sleep(200)`);
  const lp3 = JSON.parse(await ev(`return JSON.stringify(__dance.practice.loopState)`));
  check("END dragged to the right edge stops at the track end (60 s)", Math.abs(lp3.end - 60) < 0.2, JSON.stringify(lp3));
  check("the Play/pause dropdown defaults to Open palm", (await ev(`return document.getElementById('playpause-gesture').value`)) === "palm");
  await ev(`T.set('playpause-gesture', 'fist')`);
  check("choosing Fist persists in storage", (await ev(`return JSON.parse(localStorage.getItem('dance.r2.settings')).playPauseGesture`)) === "fist");
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  const errs = p.logs.filter((l) => /EXC|Uncaught|error/i.test(l));
  if (errs.length) console.log("console errors:\n  " + errs.slice(0, 8).join("\n  "));
  p.close();
}
process.exit(fail ? 1 : 0);
