// NOTHING IS EVER SPOKEN HERE: speechSynthesis.speak / cancel are replaced by stubs that only record (a standing rule: macOS speech
// can bypass Chrome's mute), and the media element is muted. Real, audible speech is a by-ear check for the user.
// Sim end-to-end for R9 (spoken feedback): the right words fire on the right events (a spy on speechSynthesis.speak), the cooldown
// holds, the switch and volume work, the beep is off by default, and speaking does not disturb the playing video (its clock, its
// frames, the main thread). What is checked is what the page ASKS the browser to say; whether it is heard, and whether the
// OS ducks the music, is a by-ear check.
// Needs the dev server (`npx vite --port 5191`) and the synthetic video (`node scripts/make-test-video.mjs`).
//
//   node scripts/e2e/speech.mjs      prints PASS / FAIL lines and always closes Chrome
import { launch } from "./cdp.mjs";

const URL = process.env.DANCE_URL ?? "http://localhost:5191/?sim&simfps=30&track=/test/test-video.mp4";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9342));
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
    right: (tilt, o = {}) => ({ shape: 'None', hand: 'Right', palm: { x: 0.75, y: 0.14 }, curl: 0, tilt, ...o }),
    left: (shape, o = {}) => ({ shape, hand: 'Left', palm: { x: 0.25, y: 0.14 }, ...o }),
    thumb: (o = {}) => T.right(0, { shape: 'Thumb_Up', curl: 1, ...o }),
    show: async (specs, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { __dance.setHands(specs); await T.sleep(16); } },
    key: (code) => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })),
    media: () => document.getElementById('media'),
    cur: () => __dance.player.currentTime,
    // What the page asked the browser to say.
    said: [],
    texts: () => T.said.map((s) => s.text),
    clear: () => { T.said.length = 0; },
  };
  { const synth = window.speechSynthesis;
    synth.cancel = () => {};
    synth.speak = (u) => { const t0 = performance.now(); T.said.push({ text: u.text, volume: u.volume, rate: u.rate, at: t0 }); T.lastSpeakMs = performance.now() - t0; };
  }
  document.getElementById('media').muted = true;
`;

async function fresh() {
  await p.goto(URL);
  await ev(`localStorage.clear()`);
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,2500))`);
  await ev(prelude);
}

try {
  console.log("\n== 1. Defaults and the spoken words on key events");
  await fresh();
  const d = JSON.parse(await ev(`return JSON.stringify({ speech: document.getElementById('speech-on').checked, vol: +document.getElementById('speech-volume').value, beep: document.getElementById('sound').checked, hasSynth: 'speechSynthesis' in window, voices: speechSynthesis.getVoices().length })`));
  check("speech is on by default, the beep is off", d.speech === true && d.beep === false && d.hasSynth, JSON.stringify(d));

  const step = async (name, code, want, wait = 450) => {
    await ev(`T.clear(); ${code}; await T.sleep(${wait})`);
    const got = await ev(`return T.texts()`);
    check(name, JSON.stringify(got) === JSON.stringify(want), `said ${JSON.stringify(got)}`);
  };
  await step("Space (play): 'playing'", `T.key('Space')`, ["playing"]);
  await ev(`await T.sleep(1500)`);
  await step("Space (pause): 'paused'", `T.key('Space')`, ["paused"]);
  await step("R with no loop set: 'no loop set' (it still restarts at 0:00)", `T.key('KeyR')`, ["no loop set"]);
  await ev(`T.key('Space'); await T.sleep(400)`); // pause again
  await ev(`__dance.player.seek(8); await T.sleep(300)`);
  await step("S (loop in): 'loop in'", `T.key('KeyS')`, ["loop in"]);
  await ev(`__dance.player.seek(12); await T.sleep(300)`);
  await step("E (loop out): 'loop out'", `T.key('KeyE')`, ["loop out"]);
  await step("R with a loop set goes to the loop IN, silently", `T.key('KeyR')`, []);
  await ev(`T.key('Space'); await T.sleep(400)`);
  await step("Home: 'from the top'", `T.key('Home')`, ["from the top"]);
  await ev(`T.key('Space'); await T.sleep(400)`);
  await step("C (clear): 'loop cleared'", `T.key('KeyC')`, ["loop cleared"]);
  await step("C again with nothing to clear: 'no loop set'", `T.key('KeyC')`, ["no loop set"], 1700);

  console.log("\n== 2. Gestures say it too: left V sets START ('loop in'), left index sets END ('loop out'), right fist toggles, steering with no loop");
  await ev(`__dance.player.seek(5); await __dance.player.play(); await T.sleep(500); T.clear()`);
  await ev(`await T.show([T.left('Victory')], 900)`);
  await ev(`await T.show([], 500)`);
  check("left V in the zone: 'loop in'", JSON.stringify(await ev(`return T.texts()`)) === '["loop in"]', JSON.stringify(await ev(`return T.texts()`)));
  await ev(`T.clear(); await T.show([T.left('Pointing_Up')], 900); await T.show([], 500)`);
  check("left index up: 'loop out'", JSON.stringify(await ev(`return T.texts()`)) === '["loop out"]', JSON.stringify(await ev(`return T.texts()`)));
  await ev(`await T.show([], 1500); T.clear(); await T.show([T.right(0, { shape: 'Closed_Fist', curl: 1 })], 900); await T.show([], 500)`);
  check("right fist: 'paused' (it was playing)", JSON.stringify(await ev(`return T.texts()`)) === '["paused"]', JSON.stringify(await ev(`return T.texts()`)));
  await ev(`__dance.practice.perform('clearLoop'); await T.sleep(1700); T.clear()`);
  // Steer the loop START with no loop: left V as the modifier while the right hand is in the zone.
  await ev(`await T.show([T.left('Victory'), T.right(0)], 1200)`);
  await ev(`await T.show([T.left('Victory'), T.right(0)], 1200)`);
  await ev(`await T.show([], 600)`);
  const steerSaid = await ev(`return T.texts()`);
  check("steering START with no loop: 'no loop set', said once (the cooldown holds for the whole grab)", steerSaid.length >= 1 && steerSaid.every((t) => t === "no loop set") && steerSaid.length <= 2, JSON.stringify(steerSaid));

  console.log("\n== 3. Speed words: once, when it settles");
  await ev(`__dance.practice.perform('speedSet', { rate: 1 }); await T.sleep(1700); T.clear()`);
  await ev(`T.key('Minus'); await T.sleep(120); T.key('Minus'); await T.sleep(120); T.key('Minus'); await T.sleep(300)`);
  check("three quick steps down: nothing is said while it is still changing", (await ev(`return T.texts()`)).length === 0);
  await ev(`await T.sleep(900)`);
  check("then once: '92.5 percent'", JSON.stringify(await ev(`return T.texts()`)) === '["92.5 percent"]', JSON.stringify(await ev(`return T.texts()`)));
  await ev(`__dance.practice.perform('speedSet', { rate: 0.8 }); await T.sleep(1100)`);
  check("set to 0.8: '80 percent'", (await ev(`return T.texts().at(-1)`)) === "80 percent");
  await ev(`__dance.practice.perform('speedSet', { rate: 1 }); await T.sleep(1100)`);
  await ev(`T.clear(); await __dance.practice.load(new File([await (await fetch('/test/click-track.wav')).blob()], 'click-track.wav', { type: 'audio/wav' })); await T.sleep(1500)`);
  check("loading another file says nothing (its speed reset is not news)", (await ev(`return T.texts()`)).length === 0);
  await ev(`await __dance.practice.load(new File([await (await fetch('/test/test-video.mp4')).blob()], 'test-video.mp4', { type: 'video/mp4' })); await T.sleep(1500)`);

  console.log("\n== 4. The cooldown: mashing keys never chatters");
  await ev(`T.clear(); for (let i = 0; i < 20; i++) { T.key('Space'); await T.sleep(100); }`);
  const n = await ev(`return T.said.length`);
  check("20 toggles in 2 s are spoken as at most 8 words (not 20), spaced at least 250 ms apart", n >= 3 && n <= 8 && (await ev(`return T.said.every((s, i) => i === 0 || s.at - T.said[i - 1].at >= 245)`)), `${n} words`);
  await ev(`__dance.player.pause(); await T.sleep(500)`);

  console.log("\n== 5. Switch and volume");
  await ev(`T.clear(); __dance.practice.perform('clearLoop'); await T.sleep(1700); T.clear(); const v = document.getElementById('speech-volume'); v.value = '0.3'; v.dispatchEvent(new Event('input')); await T.sleep(50); __dance.practice.perform('toggle'); await T.sleep(500); __dance.practice.perform('toggle'); await T.sleep(500)`);
  check("volume 0.3 is applied to the words", (await ev(`return T.said.length > 0 && T.said.every((s) => Math.abs(s.volume - 0.3) < 1e-6)`)), JSON.stringify(await ev(`return T.said.map((s) => s.volume)`)));
  await ev(`document.getElementById('speech-on').click(); await T.sleep(100); T.clear(); __dance.practice.perform('toggle'); await T.sleep(500); __dance.practice.perform('toggle'); await T.sleep(500)`);
  check("Speak unticked: silence, and the volume slider is disabled", (await ev(`return T.texts()`)).length === 0 && (await ev(`return document.getElementById('speech-volume').disabled`)));
  await p.goto(URL);
  await ev(`await new Promise(r=>setTimeout(r,2000))`);
  check("the choices persist across a reload (off, volume 0.3)", !(await ev(`return document.getElementById('speech-on').checked`)) && Math.abs((await ev(`return +document.getElementById('speech-volume').value`)) - 0.3) < 1e-9);

  console.log("\n== 6. Speaking does not disturb the video (measured, headless Chrome, speak() stubbed: this is the page's own cost; the OS speech engine is not exercised)");
  await fresh();
  const measure = (speaking) => `
    const m = T.media(); __dance.player.seek(20); await __dance.player.play(); await T.sleep(600);
    const q0 = m.getVideoPlaybackQuality(); const c0 = m.currentTime; const w0 = performance.now();
    let last = performance.now(); let maxGap = 0; let n = 0; let maxSpeakMs = 0; let stop = false;
    const raf = () => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; n++; if (!stop) requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    for (let i = 0; i < 8; i++) {
      if (${speaking}) { __dance.speaker.say({ type: i % 2 ? 'loopIn' : 'loopOut' }); maxSpeakMs = Math.max(maxSpeakMs, T.lastSpeakMs || 0); }
      await T.sleep(1000);
    }
    stop = true;
    const q1 = m.getVideoPlaybackQuality(); const wall = (performance.now() - w0) / 1000;
    return JSON.stringify({ rate: +((m.currentTime - c0) / wall).toFixed(4), frames: q1.totalVideoFrames - q0.totalVideoFrames, dropped: q1.droppedVideoFrames - q0.droppedVideoFrames, maxRafGapMs: +maxGap.toFixed(1), rafs: n, speakCallMs: +maxSpeakMs.toFixed(2), vol: m.volume, muted: m.muted });`;
  const quiet = JSON.parse(await ev(measure(false)));
  await ev(`__dance.player.pause(); T.clear()`);
  const loud = JSON.parse(await ev(measure(true)));
  console.log(`      silent 8 s : ${JSON.stringify(quiet)}`);
  console.log(`      speaking   : ${JSON.stringify(loud)}  (${await ev(`return T.said.length`)} words asked)`);
  check("the video clock runs at 1.000x while speaking (within 0.5%)", Math.abs(loud.rate - 1) < 0.005, `${loud.rate} vs ${quiet.rate} silent`);
  check("no extra dropped frames, no longer main-thread gaps", loud.dropped <= quiet.dropped + 2 && loud.maxRafGapMs < quiet.maxRafGapMs + 30, `dropped ${loud.dropped} vs ${quiet.dropped}; max rAF gap ${loud.maxRafGapMs} vs ${quiet.maxRafGapMs} ms`);
  check("a speak() call costs the page well under a frame", loud.speakCallMs < 8, `${loud.speakCallMs} ms`);
  check("the media element's own volume is never touched (the page never ducks it)", loud.vol === quiet.vol && loud.vol === 1 && loud.muted === quiet.muted, `volume ${loud.vol}`);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  p.close();
}
process.exit(fail ? 1 : 0);
