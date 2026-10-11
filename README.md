# Dance

A hands-free tool for learning choreography: control the music you practice to with hand gestures seen by the laptop webcam. See `docs/spec.md` for the product and `.agents/roadmap.md` for the checkpoints.

**This is checkpoint R1 (bring-up):** open the webcam, draw a hand skeleton on it, and show a live readout of finger states. There is no audio and there are no commands yet.

## Install and run

Needs Node 22+ (tested on Node 26) and Chrome.

```sh
npm install
npm run dev
```

Then open <http://localhost:5173/> in **Chrome**. (`npm run dev` first copies the MediaPipe WASM runtime from `node_modules` into `public/wasm/`; that folder is git-ignored.)

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) for the finger-state and palm-facing logic |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Type-check, then production build into `dist/` |

## Camera access

When the page loads, Chrome asks to use the camera: click **Allow**. If you blocked it earlier, click the camera icon at the right end of the address bar, choose Allow, and reload. On macOS also check System Settings > Privacy & Security > Camera > Google Chrome. If the camera is busy (Zoom, Meet, Photo Booth), close the other app and reload. The page must be on `localhost` (or HTTPS) for Chrome to allow camera use. Video never leaves your laptop.

## What you see

The video is shown **mirrored**, like a mirror, so your right hand is on the right of the screen. The skeleton (21 dots plus lines) is drawn over each hand. Each fingertip dot is **green** when that finger counts as extended and **red** when curled.

At the top: **fps**, the number of camera frames per second the hand model is processing, and a status line (`Running (GPU)` or `Running (CPU)` shows which backend loaded).

On the right, one card per hand (left-most on screen first):

| Readout | Meaning |
|---|---|
| **Left hand / Right hand** (with %) | Which of *your* hands, and how sure the model is. See "Left vs right" below. |
| **T I M R P** chord | Thumb, Index, Middle, Ring, Pinky. `1` (green) = extended, `0` (red) = curled. A V sign is `T0 I1 M1 R0 P0`. |
| **Shape** (with %) | MediaPipe's own label: `Open palm`, `Pointing up`, `Victory`, `Closed fist`, `Thumb up`, `Thumb down`, `ILoveYou`, or `None`, with its confidence. |
| **Palm facing camera** | YES when the palm is turned toward the camera (and not tilted more than about 60 degrees away), NO for the back of the hand or a side-on hand. |

### How the finger states are worked out

Code lives in `src/pseudoChord.ts` and `src/palmFacing.ts` (pure functions of the 21 landmarks). All thresholds are in `src/config.ts`.

- **Index, middle, ring, pinky:** extended when the fingertip is farther from the wrist than the middle knuckle (PIP) is, by a ratio. This does not depend on how the hand is rotated or how far away it is.
- **Thumb:** a separate rule. Extended when the tip is well away from the index knuckle (measured in palm sizes) and the tip joint is not folded. The thumb is the hardest finger, so expect to tune `thumb.*` in `src/config.ts`.
- **Palm facing:** the palm normal (from wrist, index knuckle and pinky knuckle) points toward the camera. This is the one place the left/right label matters.

### Left vs right

The page feeds the model the un-mirrored camera frame (only the *display* is mirrored). On a live check (2026-10-11), MediaPipe's Left/Right label already matched the user's own hand, so `swapHandedness` in `src/config.ts` is `false`. **If "Right hand" appears when you raise your left hand, flip it.** Palm facing uses this label too, so a wrong setting inverts it as well.

## Dev test mode (no live hand needed)

Run the same detection and drawing on a still image or a looping video instead of the camera:

- `http://localhost:5173/?image=/test/hand.jpg`
- `http://localhost:5173/?video=/test/hand.mp4`

Put the files in `public/test/` (git-ignored, so nothing is committed).

## Model and runtime sources

- **Package:** [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.1.0 (pinned), Apache-2.0. Its WASM files are copied from `node_modules` by `scripts/copy-wasm.mjs`.
- **Model:** the Gesture Recognizer bundle (float16), vendored at `public/models/gesture_recognizer.task` (8.4 MB).
  Source: <https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task>
  SHA-256: `97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482`
  Docs and model card: <https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer>. Google publishes MediaPipe and its Tasks models under the Apache License 2.0; check the model card there if you plan to redistribute.

## Notes

- Chrome logs some MediaPipe messages as `console.error` (for example "Created TensorFlow Lite XNNPACK delegate for CPU"). They are informational.
- Range is deliberately not a target at this stage: note the distance at which your hand still tracks well, but it is not a pass/fail.
