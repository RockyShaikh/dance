# Learning log

Dashboard: https://claude.ai/artifact/RQnHUzBeptMZt14sownWyk (source: `.agents/learning-dashboard.html`; republish that file to update in place)
Last built: 2026-10-11 (v2: R1 merged + R2 concepts; v1 was R1 bring-up)
Stack covered: v1 — MediaPipe Tasks Vision Gesture Recognizer (palm detector → landmark model → canned classifier, tracking, 21 landmarks, world landmarks, handedness, WASM, GPU/CPU delegate); pseudo-chords (distance ratio vs joint angle, thumb, palm facing, hysteresis; interactive hand lab); browser camera pipeline (getUserMedia, secure context, rVFC vs rAF, mirroring, canvas backing store, fps vs latency); tooling (Vite 8, TS 7, Vitest 5). v2 — real R1 code map (src/main, recognizer, camera, config, analyze, pseudoChord, palmFacing, hand, draw, readout, tests); live-test lesson (handedness label drives palm-normal sign; swapHandedness: false); R2: finite state machines (idle → arming → armed → fire → cooldown), dwell/grace, debounce vs hysteresis, tap vs hold, hit-testing across raw/display/canvas/mouse spaces, pointer drag/resize handles, pinch/claw/two-hand clutch measurement; interactive gesture-timeline lab; R4/R5 rate vs position preview.

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
