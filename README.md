# Dance

A hands-free tool for learning choreography: control the music you practice to with hand gestures seen by the laptop webcam. See `docs/spec.md` for the product and `.agents/roadmap.md` for the checkpoints.

**This is checkpoint R2 (gesture test bench), on top of R1 (bring-up):** the webcam, hand skeleton and finger readouts from R1, plus a command box, dwell rings, tap vs hold, clutch-shape detection, a banner, sound and an event log. There is no audio playback; firing a command only shows and logs it.

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
| `npm test` | Unit tests (Vitest): finger states, palm facing, command box, command state machine, clutch shapes |
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

## R2 test bench: what you see and how to use it

**Command box.** The cyan rectangle on the video (default: the right half as you see it). A shape counts only while your **palm centre** (the average of the wrist and the four finger-base knuckles; shown as a diamond, green inside the box, red outside) is inside it. Drag inside to move it, drag an edge or corner to resize it, or pick Right half / Left half / Whole frame. Changes apply immediately and are remembered in the browser.

*Coordinates:* the box is stored in **display (mirrored) normalized** coordinates, 0..1 of the picture as you see it. The camera landmarks are raw (un-mirrored), so the palm centre's x is flipped (`1 - x`) in exactly one function, `palmCentre` in `src/handFeatures.ts`. The box overlay is a separate, un-mirrored canvas, so mouse positions need no flipping.

**Commands** (labels from the Gesture Recognizer): Open palm, Index up (`Pointing_Up`), V (`Victory`). All timing is by the clock (milliseconds), not by frame count, so it does not depend on fps.

| Step | Rule |
|---|---|
| Counts | Shape label at least 50% sure, palm facing the camera, palm centre in the box, and only one hand showing a command shape in the box (two: ignored) |
| Dwell | Hold for the dwell time (slider, default 0.6 s, range 0.6 to 1.2 s); the inner ring fills. Flickers shorter than 120 ms are ignored |
| Open palm | Fires as soon as the ring is full |
| Index up, V | **Tap:** drop the hand after the ring filled and it fires on release. **Hold:** keep holding until the outer ring (1.5 s total) fills and it fires. A hold fires once; releasing afterwards adds nothing |
| Cooldown | 1.0 s after any fire, no new dwell can start |
| Hand lost or leaves the box | Before the ring is full: cancelled, nothing fires. After it is full (index up, V): counts as a release, so a tap |
| Stillness (checkbox, off) | If on, the palm centre must stay within 6% of the frame height during the hold, else the dwell restarts |

On fire: a banner, a beep (tap and hold sound different; checkbox), and a timestamped row in the log. The **false-fire test** counts fires for 2 minutes (rows tagged `test`).

**Clutch shapes** (detection only, nothing is controlled): shown as GRABBED / released. Each must *start* in the box; once grabbed the hand may leave it, and a lost hand releases after 0.3 s.
- **Pinch:** thumb tip to index tip, divided by palm size, below the slider value. It must open to 1.6x that to release. A **fist is not a pinch**: the middle, ring and pinky must be out (finger reach at least 1.3) to start one.
- **Claw:** the mean finger reach (tip-to-wrist over knuckle-to-wrist, index to pinky: open about 1.9, fist about 1.0) must drop into the half-curled band (1.25 to 1.65) **within 0.5 s of the hand having been open** (1.75 or more). That change is what separates a claw from a relaxed, half-curled hand, which never grabs. It stays grabbed while half-curled. The numbers are first guesses and need tuning on a real hand: the hand card shows the live "finger reach" and "pinch gap".
- **Two-hand:** the hand on the left of the screen shows an open palm (the modifier) while the other hand's palm centre is in the box. Hands are told apart by screen side, not by the model's left/right label.

All thresholds are in `src/config.ts` (`COMMANDS`, `BOX`, `CLUTCH`).

### Scripted hands (dev only)

`http://localhost:5173/?sim` runs the bench with no camera or model. Script hands from the console, e.g. `__dance.setHands([{ shape: "Victory", palm: { x: 0.75, y: 0.5 } }])` (palm is in display coordinates; options: `hand`, `score`, `away`, `pinch`, `curl`), and `__dance.setHands([])` for none. See `src/sim.ts`. It is not in the production build.

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
