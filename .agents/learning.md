# Learning log

Dashboard: https://claude.ai/artifact/RQnHUzBeptMZt14sownWyk (source: `.agents/learning-dashboard.html`; republish that file to update in place)
Last built: 2026-10-11 (v1, for R1 bring-up)
Stack covered: MediaPipe Tasks Vision Gesture Recognizer (palm detector → landmark model → canned classifier, tracking, 21 landmarks, world landmarks, handedness, WASM, GPU/CPU delegate); pseudo-chords (distance ratio vs joint angle, thumb, palm facing, hysteresis, scale/rotation tolerance; interactive hand lab); browser camera pipeline (getUserMedia, secure context, video element, rVFC vs rAF, mirroring, canvas backing store, fps vs latency); tooling (Vite 8, TypeScript 7 / tsc --noEmit, Vitest 5, npm scripts); previews of R2 debounce/dwell state machine and R4/R5 rate vs position control.

## Known well
<!-- topics the user is comfortable with; tutor skips these -->
- (none yet)

## Entries

### 2026-10-11 — dashboard v1 (background, R1)
- Built the Learning Dashboard grounded in docs/spec.md v1.2, roadmap R1, and the R1 branch's package.json + installed `vision.d.ts`. R1 src/ did not exist yet; the "Where in the code" section uses grep commands to find each piece. Update with real paths once R1 merges.
- Facts verified in `vision.d.ts`: `numHands` defaults to 1 (spec wants either hand → set 2); `delegate: "CPU" | "GPU"`; `recognizeForVideo(video, timestamp)`; `minTrackingConfidence` default 0.5; result has `landmarks`, `worldLandmarks`, `handedness`, `gestures`. WASM folder ships a `nosimd` fallback.
- Open (verify in R1): fps cost of `numHands: 2` with one hand visible (palm detector likely runs every frame); whether the handedness label comes out swapped on unmirrored frames; whether index pointing at the camera reads as down with a 2D ratio rule.
