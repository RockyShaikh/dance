# Learning log

Dashboard: https://claude.ai/artifact/RQnHUzBeptMZt14sownWyk (source: `.agents/learning-dashboard.html`; republish that file to update in place)
Last built: 2026-10-12 (v3: R2 + R3 merged, R3 audio, R4 preview; v2: R1 merged + R2 concepts; v1: R1 bring-up)
Stack covered: v1 — MediaPipe Tasks Vision Gesture Recognizer (palm detector → landmark model → canned classifier, tracking, 21 landmarks, world landmarks, handedness, WASM, GPU/CPU delegate); pseudo-chords (distance ratio vs joint angle, thumb, palm facing, hysteresis; interactive hand lab); browser camera pipeline (getUserMedia, secure context, rVFC vs rAF, mirroring, canvas backing store, fps vs latency); tooling (Vite 8, TS 7, Vitest 5). v2 — real R1 code map (src/main, recognizer, camera, config, analyze, pseudoChord, palmFacing, hand, draw, readout, tests); live-test lesson (handedness label drives palm-normal sign; swapHandedness: false); R2: finite state machines (idle → arming → armed → fire → cooldown), dwell/grace, debounce vs hysteresis, tap vs hold, hit-testing across raw/display/canvas/mouse spaces, pointer drag/resize handles, pinch/claw/two-hand clutch measurement; interactive gesture-timeline lab; R4/R5 rate vs position preview. v3 — R2 as built (real pointers on main; display-space box + single flip in palmCentre; clock-timed dwell; idle/dwell/armed/spent + cooldownUntil; hand-lost rules; fist rule; claw open-then-curl; hysteresis on clutches only); R3: HTMLAudioElement vs Web Audio, audio latency chain + latency lab (with live baseLatency/outputLatency measure), seeking precision (WAV/CBR/VBR, encoder delay), autoplay policy / user activation, main vs audio thread and where stutter comes from, time-stretch preview (resampling vs WSOLA vs phase vocoder); R4 preview: loop-wrap overshoot and look-ahead, rate vs position control for the R4b knob.

## Known well
<!-- topics the user is comfortable with; tutor skips these -->
- (none yet)

## Entries

### 2026-10-11 — dashboard v1 (background, R1)
- Built the Learning Dashboard grounded in docs/spec.md v1.2, roadmap R1, and the R1 branch's package.json + installed `vision.d.ts`. R1 src/ did not exist yet; the "Where in the code" section uses grep commands to find each piece. Update with real paths once R1 merges.
- Facts verified in `vision.d.ts`: `numHands` defaults to 1 (spec wants either hand → set 2); `delegate: "CPU" | "GPU"`; `recognizeForVideo(video, timestamp)`; `minTrackingConfidence` default 0.5; result has `landmarks`, `worldLandmarks`, `handedness`, `gestures`. WASM folder ships a `nosimd` fallback.
- Open (verify in R1): fps cost of `numHands: 2` with one hand visible (palm detector likely runs every frame); whether the handedness label comes out swapped on unmirrored frames; whether index pointing at the camera reads as down with a 2D ratio rule.

### 2026-10-11 — dashboard v2 (background, R1 merged, R2 active)
- Republished same URL (version 2). Replaced grep placeholders with real R1 file/line pointers on main (6d0fdff).
- Added live-test lesson: Left/Right flipped and palm-facing inverted together; the palm normal = cross(index MCP − wrist, pinky MCP − wrist), whose z sign is only a 2D turning direction. Right-back and left-palm look identical to it, so the hand label picks the sign (palmFacing.ts:43). Fix: swapHandedness: false (config.ts:66, commit 50517b6). Unit tests passed because they assume a correct label. pseudoChord is label-independent, so the chord stayed right.
- Added R2 section grounded in spec §4.2–4.4, §5.2 (R2 code not on main yet): FSM, dwell, debounce/hysteresis, tap vs hold, hit-testing coordinate spaces, drag/resize handles, pinch/claw/two-hand. Timeline lab: 6 presets verified by running the lab's own state machine in Node (flicker preset fires only with hysteresis on; dropped-frames preset fires only with grace > 0; pass-through never fires).
- Noted: R1 finger rule has a single threshold (1.08), no hysteresis, so half-bent fingers can flicker.
- Open (check when R2 lands): box stored in raw or display space; dwell measured from timestamps or frame counts; what fires if the hand leaves view while a tap is ARMED (likely TAP, maybe unwanted); whether a fist reads as pinch; how claw is told apart from a relaxed half-curled hand; which thresholds get hysteresis.
- Open from R1: "choppy until a hand appears" plausibly palm-detector cost with no hand tracked (plus GPU warm-up); unmeasured.

### 2026-10-12 — dashboard v3 (background, R2 + R3 merged, R4a in progress)
- Republished same URL (version 3). Started 2026-10-11 against branches, resumed after R2/R3 merged; all pointers now on main (r1/r2/r3-done). Refreshed R1 line numbers that moved (main.ts, analyze.ts, style.css:109).
- R2 open questions answered from code: box in display coords, flip only in palmCentre (handFeatures.ts:24); dwell clock-timed (commands.test.ts:436); hand lost >120 ms after ring = TAP, before = nothing; fist excluded by othersReach ≥ 1.3; claw = open (≥1.75) within 500 ms then band 1.25–1.65; hysteresis on pinch/claw only, not score or box edge. v2 predicted a COOLDOWN state; the build uses SPENT + a cooldownUntil timestamp (corrected on the page). Timeline lab kept as a teaching model with a note on its differences.
- R3 section: engine is HTMLAudioElement (audioPlayer.ts:5–14); one path for gestures/keys/buttons (transport.ts); measured 2–8 ms is fire → element event, NOT fire → ear (buffer, device, air come after; Bluetooth adds ~150–300 ms). Latency lab "Measure this device" reads the viewer's AudioContext baseLatency/outputLatency.
- R4 preview: per-frame loop check overshoots up to a frame (+ model call) plus a seek gap; look-ahead timer fixes most of it; only Web Audio scheduling is sample-exact. Rate vs position: dt, dead zone, reaction overshoot, atan2 unwrap.
- Open (check when R4a lands): where the loop-end check runs and whether it uses look-ahead and divides by playbackRate; whether the R3 index-hold override is removed; real seek-gap size on the user's machine.
- Open: should R4 subtract outputLatency from loop marks (Bluetooth)? With the whole-frame box, the two-hand clutch's open-palm modifier would also toggle play/pause.
- No user interaction this session; nothing yet known about what the user understood.
