// R8 e2e: the Auto-track selector (default, persistence, Zoom ignored while on), the measurement readout, and the fall-back with
// no person in view. Real models in headless Chrome. Needs the dev server (`npx vite --port 5190`) and the test pictures in
// public/test/ (see README, "R8"): sat-arms-s60.jpg (a far dancer) and blank.jpg (nobody).
//
//   DANCE_URL=http://localhost:5190/ node scripts/e2e/autotrack.mjs
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const SHOTS = process.env.DANCE_SHOTS ?? "/tmp/dance-e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.DANCE_URL ?? "http://localhost:5190/";
const p = await launch(Number(process.env.DANCE_CDP_PORT ?? 9342));
const ev = (code) => p.eval(code);
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};
const ready = async (mode) => {
  for (let i = 0; i < 120; i++) {
    await ev(`await new Promise((r) => setTimeout(r, 500))`);
    if (await ev(`const t = window.__dance?.tracker; return !!t && !t.loading && !!t.last && t.mode === ${JSON.stringify(mode)}`)) return true;
  }
  return false;
};
const settle = (ms) => ev(`await new Promise((r) => setTimeout(r, ${ms}))`);
const bigStage = () => ev(`const st = document.createElement('style'); st.textContent = '#practice-head, #cheat, #cam-note, #cam-reactions { display: none !important }'; document.head.append(st)`);

console.log("== 1. Defaults and persistence");
await p.goto(BASE);
await ev(`localStorage.clear()`);
await p.goto(`${BASE}?image=/test/sat-arms-s60.jpg`);
check("the selector lists Off / Person / Wrists", (await ev(`return [...document.getElementById('track-mode').options].map((o) => o.value).join()`)) === "off,person,wrists");
check("Person is the default", (await ev(`return document.getElementById('track-mode').value`)) === "person");
check("the tracker loads and runs in person mode", await ready("person"));
check("the Zoom checkbox is disabled and says it is ignored", (await ev(`return document.getElementById('zoom-toggle').disabled`)) === true && /ignored/.test(await ev(`return document.getElementById('zoom-note').textContent`)));
await settle(3000);
const person = JSON.parse(await ev(`const t = window.__dance.tracker; return JSON.stringify({ crops: t.last.crops.map((c) => c.label), mag: t.last.crops.map((c) => c.magnification), hands: t.last.hands.length, pose: !!t.last.pose, hud: !document.getElementById('track-hud').hidden, text: document.getElementById('track-hud-body').textContent })`));
check("person mode crops (magnified) and finds the far hands", person.crops.join() === "PERSON" && person.mag[0] > 2 && person.hands >= 1, JSON.stringify({ mag: person.mag, hands: person.hands }));
check("the measurement readout shows times, magnification, palm px and the detection counter", person.hud && /pose +[\d.]+ ms/.test(person.text) && /magnification ×/.test(person.text) && /px at detector/.test(person.text) && /detection: hand \d+\/\d+/.test(person.text));
await bigStage();
await settle(1000);
await p.shot(`${SHOTS}/autotrack-person.png`);

console.log("\n== 2. Switching modes (persisted)");
await ev(`const s = document.getElementById('track-mode'); s.value = 'wrists'; s.dispatchEvent(new Event('change'))`);
check("wrists mode loads and runs", await ready("wrists"));
await settle(3000);
const wr = JSON.parse(await ev(`const t = window.__dance.tracker; return JSON.stringify({ crops: t.last.crops.map((c) => c.label), hands: t.last.hands.length, saved: JSON.parse(localStorage.getItem('dance.r2.settings')).autoTrack })`));
check("one crop per wrist, the mode is saved", wr.crops.length === 2 && wr.saved === "wrists", JSON.stringify(wr));
await p.shot(`${SHOTS}/autotrack-wrists.png`);
await p.goto(`${BASE}?image=/test/sat-arms-s60.jpg`);
check("the choice survives a reload", (await ev(`return document.getElementById('track-mode').value`)) === "wrists" && (await ready("wrists")));

console.log("\n== 3. Off: R6 Zoom works again");
await ev(`const s = document.getElementById('track-mode'); s.value = 'off'; s.dispatchEvent(new Event('change'))`);
await settle(1500);
check("with Off the Zoom checkbox is enabled again", (await ev(`return document.getElementById('zoom-toggle').disabled`)) === false);
await ev(`const z = document.getElementById('zoom-toggle'); z.checked = true; z.dispatchEvent(new Event('change'))`);
await settle(1500);
check("and the zone crop is planned", (await ev(`return !!window.__dance.crop`)) === true);
check("with Off and Measure unticked there is no readout and no pose model call", (await ev(`return document.getElementById('track-hud').hidden`)) === true);

console.log("\n== 4. No person in view: person falls back to the whole frame");
await ev(`localStorage.clear(); localStorage.setItem('dance.r2.settings', JSON.stringify({ autoTrack: 'person' }))`);
await p.goto(`${BASE}?image=/test/blank.jpg`);
check("person mode with nobody in the picture", await ready("person"));
await settle(2500);
const blank = JSON.parse(await ev(`const t = window.__dance.tracker; return JSON.stringify({ crops: t.last.crops.length, note: t.last.note, hands: t.last.hands.length })`));
check("no crop, the whole frame, says so", blank.crops === 0 && /no pose: full frame/.test(blank.note), JSON.stringify(blank));

console.log(`\n${pass} passed, ${fail} failed`);
p.close();
process.exit(fail ? 1 : 0);
