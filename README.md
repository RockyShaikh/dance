# Dance

A hands-free tool for learning choreography: control the music you practice to with hand gestures seen by the laptop webcam. See `docs/spec.md` for the product and `.agents/roadmap.md` for the checkpoints.

**This is checkpoint R8 (auto-track: the crop follows you, from body pose) on top of R7 (camera picker, iPhone as the camera through Continuity Camera, latency measurement) on top of R6 (one command zone across the top quarter, zoom, hands told by the thumb) on top of R5b (speed rework: hold the right thumbs up for 2x, left shaka + wheel for 0.025 steps), on top of R4d (hands rework: left hand never plays, right fist plays / pauses, circling wheel), R5 (speed), R4c (the steering wheel: left-hand modes, snappy steering, waveform), R4b (the two-hand scheme and the knob), R4a (loops), R3 (audio + webcam), R2 (gesture test bench) and R1 (bring-up).** Load a local MP3/WAV and control it hands-free with two hands (see "R4c" and "R4b" below). The R2 test bench (rings, event log, clutch shapes, tuning) is still there behind the **Bench** button (key `B`).

## R9: practice video, spoken feedback, claw vaulted

- **Video.** Open (or drop) a local MP4 / MOV / M4V / WebM next to MP3 / WAV. It plays in one `<video>` element that drives everything exactly as audio did (play / pause, restart, loops and wrap, scrub / steering, speed with pitch kept, hold-2x, the speed wheel). The video fills the stage; the camera view (skeleton, zone, HUD) shrinks to a corner and can be hidden (**Camera view**). The status word and clock float over the picture. **Mirror video (like a mirror)** flips only the picture (CSS), default **on**, remembered. The timeline waveform is decoded from the video's own audio track; if that fails, or the file is over 250 MB (`WAVE.maxDecodeBytes`), there is simply no waveform. Seeks land on any frame, but a video with sparse keyframes seeks more slowly than audio (a scrub may feel less snappy; re-encode with `-g 15` if so). Test video: `node scripts/make-test-video.mjs` (needs ffmpeg; writes the git-ignored `public/test/test-video.mp4`; media is never committed).
- **Voice.** Short words through the browser's `speechSynthesis`: "loop in", "loop out", "loop cleared", "no loop set" (restart-to-IN, steering START / END, or a nudge with no loop), "paused", "playing", "from the top", and the speed ("92.5 percent") once it stops changing. Switch (default on) and volume are in the controls row, remembered; there is a short cooldown (250 ms between words, 1.5 s before the same words repeat). The old beep is off by default (Bench > "Beep on fire"). Chrome needs one click on the page before it will speak, as for the music.
- **Claw vaulted.** The claw grab is gone from the UI (Knob panel and the clutch-shape list) but all its code and tests remain. **To bring it back, open the app with `?claw=1`** (e.g. `http://localhost:5190/?claw=1`).
- **Dev:** `node scripts/e2e/video.mjs` and `node scripts/e2e/speech.mjs` (dev server on :5191, `?sim`). Both mute everything; the speech script stubs `speechSynthesis`, so nothing is ever spoken in automated runs.

## R8: Auto-track ("our own Center Stage", from body pose)

The hand model's palm detector sees its whole input shrunk to 192 px, so a hand 3-5 m away is a few pixels there and is not found. Body pose survives that shrink, so **the Pose Landmarker says where you are, the picture is cropped there, and only the crop goes to the Gesture Recognizer** (landmarks are mapped back to the full frame, so the zone, the commands, steering, speed and the thumb rule are unchanged).

**Auto-track** selector (below the zone buttons, persisted): 
- **Off**: as before (the whole picture, or the R6 Zoom crop).
- **Person**: one crop around head + shoulders + both hands (wrist, index, pinky, thumb points), with room above the head for raised hands (`TRACK.person`); square where the frame allows (extra width is free: the crop is drawn 1:1 into a square, never stretched). The crop is smoothed (`src/cropSmooth.ts`): exponential smoothing (250 ms), a **dead-band with hysteresis** (it moves only when the target is more than 6% of the crop away or 12% off in size, and stops within 2% / 4%), and a **maximum zoom rate** (zoom in at most about x1.8 per second, out about x5 per second). With no pose it holds the crop for 1 s, then relaxes to the full frame.
- **Wrists**: one square crop per visible wrist, centred just past the wrist toward the knuckles, sized from the forearm, shoulder width or the pose's hand length (largest of the three, `TRACK.wrist`), each with its **own recognizer instance** (`numHands: 1`, VIDEO mode). Why: the recognizer's VIDEO-mode tracking remembers where the hand was in the *previous input's* coordinates, so one instance alternating between a left and a right crop would feed it the wrong picture every frame; one instance per wrist always sees its own crop, which the dead-band keeps still most of the time, so a tracked hand skips the palm detector. `?wrists=image` makes them IMAGE mode (palm detector on every call, no state) for comparison. A crop's hand is the one nearest its pose wrist (a crop can hold both hands). With no wrist in view the whole frame goes to the main recognizer.
- The **Zoom** checkbox is ignored (and disabled) while Auto-track is on. The zone stays in full-frame coordinates.
- **Left / right** still comes from the thumb (R6); pose's left/right is not used.

**Measurement readout** (tick **Measure**, or any mode other than Off; shown under the controls) and on the picture: the thin pose skeleton, the wrists (L / R dots) and each crop's outline with its magnification (pink dashes). The readout has: pose ms, gesture ms (crop draw + recognizer calls), fps; the crop size and **magnification** (frame long side / crop's long side: what the detector's input is scaled by); per hand the **palm width** (index to pinky knuckle) in frame pixels and at the detector (`px * 192 / canvas side`), plus the hand length (wrist to middle fingertip), which is steadier when the palm turns edge-on; and the **detection counters** (frames with a hand / frames, and frames with a hand while pose sees a wrist; Reset counters button). With the mode Off, Measure also runs the pose model (only for those counters), so Off's fps then includes pose.

**Model:** `public/models/pose_landmarker_lite.task` (5.8 MB, float16), source <https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task>, SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`. Model card: <https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker>. Google publishes MediaPipe and its Tasks models under the Apache License 2.0; check the model card if you plan to redistribute.

**Dev:** `node scripts/e2e/track.mjs` (dev server on :5190) runs Off / Person / Wrists on stills and clips in `public/test/` with the real models in headless Chrome and prints one row per run (see the table in the R8 report: headless times are relative; detection and pixels are real). `node scripts/e2e/autotrack.mjs` (selector, persistence, Zoom ignored, readout, no-person fall-back). `window.__dance.tracker` / `setTrackMode(mode)` in dev. Test pictures: a full-body clip or photo of one person in the git-ignored `public/test/` (for example a CC-licensed dance clip from Wikimedia Commons); shrink it onto a dark canvas with `ffmpeg -vf "scale=iw*0.6:-2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2+80:color=0x141a3a"` to simulate distance.

**Test it at 2-5 m:** pick a mode, tick **Measure**, stand at the mark, hold a shape (V, index up, fist) for ~10 s, note "hand while pose sees a wrist" and the chord readout, press **Reset counters**, change mode, repeat. Compare at 2, 3, 4, 5 m. Watch that the pink crop follows you without jitter, that a raised hand stays inside it, and that it relaxes to the full frame about 1 s after you leave.

**Measured (2026-10-13, headless Chrome with the real models; no real camera, no real distance).** Test media: a solo dancer from a CC BY-SA 4.0 Wikimedia Commons clip (1080p, "Bhojan behar, a part of Sattriya dance", user Das Kamal), in the git-ignored `public/test/`. Distance is simulated by shrinking the picture onto a dark 1920x1080 canvas (x0.6, x0.4) or enlarging a crop of it (near); the label is the hand length in frame pixels and the camera distance that gives that many pixels at 1080p / 70 degrees (`260 / d` px, from the R7 pixel maths). The dancer's hands are dance mudras, not our shapes: **this measures whether a hand is found, not whether the right gesture is read.** "Hand found" = a frame with at least one hand; the pose saw a wrist in 100% of frames in every row. "Hand len @det" = wrist to middle fingertip as the palm detector sees it (its input is the model canvas scaled to 192 px). Stills loop at the display rate (fps is then set by compute); clips play at 30 fps (fps is capped by the clip). Times are headless Chrome's, so relative.

| Picture (hand length, ≈ distance) | Mode | Hand found | Hand len @det (px) | Mag | Pose ms | Gesture ms | fps |
|---|---|---|---|---|---|---|---|
| still, near (147 px, ≈1.8 m) | Off | 100% | 14.8 | x1.0 | - | 21.7 | 44.5 |
| | Person | 100% | 18.9 | x1.29 | 15.1 | 16.4 | 31.0 |
| | Wrists | 100% | 88.0 | x5.8 | 15.2 | 18.3 | 29.2 |
| still, arms out (≈60 px, ≈4 m) | Off | **0%** | - | x1.0 | - | 14.6 | 59.9 |
| | Person | **100%** (2 hands) | 17.1 | x2.77 | 15.3 | 15.2 | 32.0 |
| | Wrists (video) | 100% (1 of 2 hands) | 70.9 | x12.3 | 15.4 | 23.2 | 25.4 |
| | Wrists (image) | 100% (1 of 2 hands) | 48.3 | x12.3 | 15.5 | 30.4 | 21.4 |
| still, x0.6 (37 px, ≈7 m) | Off | **0%** | - | x1.0 | - | 14.3 | 59.8 |
| | Person | **100%** (2 hands) | 16.8 | x4.59 | 14.9 | 15.5 | 31.9 |
| | Wrists (video) | 100% (2 hands) | 46.6 | x12.7 | 14.8 | 15.8 | 31.8 |
| still, x0.4 (23 px, ≈11 m) | Off | **0%** | - | x1.0 | - | 14.5 | 60.0 |
| | Person | **100%** (2 hands) | 11.7 | x5.08 | 14.6 | 15.3 | 32.5 |
| | Wrists (video) | 100% (2 hands) | 29.4 | x12.7 | 14.5 | 15.7 | 32.0 |
| clip, near (≈120-185 px, ≈1.5-2 m) | Off | 59% | 11.6 | x1.0 | - | 22.8 | 30.0 |
| | Person | 66% | 35.2 | x2.08 | 10.5 | 20.6 | 29.0 |
| | Wrists (video) | 55% | 86.7 | x6.4 | 10.0 | 25.9 | 27.0 |
| clip (≈60-115 px, ≈3-4 m) | Off | 36% | 10.7 | x1.0 | - | 23.2 | 30.1 |
| | Person | 77% | 27.2 | x4.31 | 10.3 | 20.6 | 29.0 |
| | Wrists (video) | 70% | 73.1 | x12.3 | 10.1 | 23.1 | 28.1 |
| | Wrists (image) | 57% | 75.4 | x12.3 | 10.0 | 29.8 | 24.1 |
| clip, x0.6 (≈7 m) | Off | 6% | 8.8 | x1.0 | - | 17.9 | 30.1 |
| | Person | 85% | 23.8 | x5.04 | 10.1 | 20.0 | 29.9 |
| | Wrists (video) | 83% | 48.2 | x12.7 | 10.1 | 21.4 | 29.0 |
| | Wrists (image) | 73% | 52.6 | x12.7 | 10.0 | 30.9 | 23.8 |
| clip, x0.4 (≈11 m) | Off | **0%** | - | x1.0 | - | 15.1 | 30.4 |
| | Person | 62% | 14.8 | x5.08 | 10.3 | 20.5 | 29.3 |
| | Wrists (video) | 84% | 40.3 | x12.7 | 9.9 | 20.9 | 29.4 |
| | Wrists (image) | 62% | 38.0 | x12.7 | 10.0 | 29.8 | 24.2 |
| a picture with nobody in it | Person / Wrists | no hand; falls back to the whole frame ("no pose: full frame") | | x1.0 | 15.1 | 12.8 | 34.8 |

What it says:
- **Person finds hands where Off finds none** (still at about 4 m or more: 100% vs 0%; clip at 3-4 m: 77% vs 36%; 7 m: 85% vs 6%) and is **not worse than Off close up** (still 100% vs 100%; near clip 66% vs 59%). **It is the default** for that reason. Its cost is the pose model: about 10-15 ms per frame here and one more model on the GPU, so latency goes up a little; switch to Off if the live feel or battery suffers.
- **Wrists** gives the detector the biggest hands (hand length 29-88 px at the detector vs 12-35 for Person) and is best on the farthest clip (84% vs 62%), but it found only one of the two hands on the 4 m still, was worse than Person on the near and 3-4 m clips, and costs 2-5 ms more. **Wrists in VIDEO mode beats IMAGE mode** on both detection (clips: 70 / 83 / 84% vs 57 / 73 / 62%) and cost (21-23 ms vs 30 ms, about 28 vs 24 fps), so VIDEO per-wrist instances are what ships (`?wrists=image` stays for comparison).
- The pose's wrist points jump by up to ~100 px on the enlarged, soft "near" still, and the crop dead-band holds the crop still for most of that; on a moving dancer the crop changes on 60-85% of frames (the HUD counts it). No ground truth for the clips: a miss can be a hand hidden or blurred by the dance, not only a detector miss.

## R7: camera picker, iPhone as the camera, latency test

**The picker** is in the top bar: a list of the video inputs (the built-in FaceTime HD camera, an iPhone on Continuity Camera, any USB webcam), a picture shape (16:9 = 1920x1080, 4:3 = 1920x1440) and a readout of what the camera **really delivers**, e.g. `1920×1080 · 29.8 fps (camera says 30)`: the pixels come from the video itself, the fps is measured here (frames the page is given per second), and an amber `asked 1920×1080` appears when the camera could only give less.

- **Remembered** by deviceId, with the label as a fallback (Chrome may change ids).
- **Hot-plug**: when the iPhone is picked up or put back on its mount the list updates. If your saved camera is missing the app uses the default camera and says so in amber ("... is not connected: using the default camera. It switches back when it appears."); the saved choice is kept and it **switches back by itself** when the camera reappears.
- Switching swaps the stream inside the same video element, so the hand model, the zone, the zoom crop and the music carry on (everything reads the frame size every frame).
- The camera is asked for 1080p (`APP.camera.requested` in `src/config.ts`: the one value to change; 2K / 4K are a wishlist thread, and Continuity Camera never delivers 4K anyway). Hand tracking runs on the whole delivered frame, as before.
- **Turn off macOS Reactions** (menu bar > Video > Reactions) for every camera, the built-in one included: V and thumbs-up make macOS draw balloons and effects into the camera picture itself, and the hand model sees them. The picker shows a one-line reminder.

### Set up Continuity Camera (iPhone as the webcam)

1. **Needs:** iPhone XR or newer (iOS 16+), a Mac on macOS 13+ (14+ for the zoom control below), the same Apple Account on both with two-factor on, Wi-Fi and Bluetooth on. It also works with a **USB cable** (tap Trust on the phone the first time). Center Stage needs an iPhone 11 or newer.
2. **Mount** the phone in **landscape** on a tripod or stand, rear cameras facing the practice space, screen locked. Plugging it in keeps it charged and cool during a long session.
3. **Wake it once:** open FaceTime, choose the iPhone under Video in the menu bar, then quit FaceTime. (Older Chrome builds only list the iPhone after this and a Chrome restart.)
4. **Open the app** in Chrome and pick the iPhone in the camera list at the top (Chrome may ask for camera permission again for the new device). Check the readout: it should say 1920×1080.
5. **Framing** (macOS 14+): menu bar > Video. With **Center Stage off** there is a manual zoom (0.5x to 3x) and you can drag the preview to pan; zooming in about 2x narrows the field of view so a hand far from the camera gets more pixels. With Center Stage on, choose the **Main** lens (the default is Ultra Wide; its crops run out of real pixels sooner). Zooming is macOS's: this app does not control it. Remember the command zone is screen-fixed: re-framing moves it relative to you.
6. **Reactions off** (same Video menu).
7. The 4:3 option asks for 1920×1440 (Continuity Camera offers it): more height, so more room above a raised hand.

### The latency test (Bench panel: "Camera latency")

**Frame timing** (always on while the bench is open; rolling over the last ~150 frames): the hand model's time per frame; **camera to app** (frame captured, by the camera's own timestamp `captureTime`, to the page getting it); **captured to processed** (the same, up to the end of our work on that frame); **captured to command fired** (a command's ring completed and the music was told). A camera that gives no timestamp shows n/a for the last three.

**Glass-to-glass test** (the total delay from a screen to the app, per camera):

1. Open the Bench (key `B`). The camera must **see the laptop screen**: aim it at the screen, or at a mirror that shows it. (The iPhone on its mount works if you turn it toward the screen for the test; the built-in camera needs a mirror or a second device's reflection.)
2. Click **Start latency test**. The whole screen goes black, then white (so it learns how bright each looks to the camera; if it cannot tell the two apart it stops and says the camera does not see the screen), then flashes white 20 times at random gaps. Each flash is timed from the moment the white is drawn to the moment a bright-enough frame reaches the app. `Esc` cancels.
3. The result line shows **median and p95** (plus min, max, misses, and, where the browser gives a capture time, the split "flash to captured" + "captured to app"), labelled with the camera and the delivered size. **Copy results** puts all lines on the clipboard.
4. **Compare**: run it for the FaceTime HD camera, the iPhone wireless, and the iPhone over USB (same room, same lighting, Reactions off, the app in the same state). The numbers include the screen's own delay (a few ms, the same for every camera) and the app's event loop: the hand model runs on the same thread, so a busy frame delays the callback, which is the latency the app really has. The absolute numbers matter less than the differences.

Dev: `node scripts/e2e/camera.mjs` (Chrome's fake cameras: picker, switch, persist, hot-plug fallback and switch-back, the 4:3 readout; and the latency test end to end against a canvas camera that shows the page's marker; dev server on `:5189`).

## R6: one command zone, zoom, hands from the thumb

- **One shared command zone** across the top quarter of the picture (full width, as you see the mirrored view) replaces the two per-hand boxes. A command or a grab counts only while **that hand's palm centre is inside the zone** (both hands; the left hand's marks, the right fist, the thumbs-up hold, and both hands of the steering wheel at its start; the steering hand may leave once grabbed). Drag it on the video to move or resize it; presets **Top quarter / Whole frame** (main controls) and **Top half** (Bench). Saved settings from before R6 (per-hand boxes) are migrated to the default top quarter; the sliders carry over.
- **Zoom** (checkbox next to the zone buttons, persisted, off by default): the camera frame is cropped to the zone plus a margin (`ZOOM.margin`, 12% of the frame height on every side) and **only the crop** is given to the Gesture Recognizer; landmarks are mapped back to the full frame (`src/zoom.ts`), so drawing and hit-tests are unchanged. **With zoom on, hands outside the crop are not tracked at all** (the HUD outlines the crop in amber). The crop is drawn into a square canvas with black padding and no scaling, so the model's input aspect is known and a hand's geometry is never stretched. **Magnification is limited by the crop's long side** (the model scales its input by it): a full-width strip is as wide as the frame, so the default zone gives **x1.0** (nothing gained); narrow the zone (e.g. half the width: about x1.7) to magnify. The note next to the toggle shows the live number.
- **Left or right from the thumb** (`src/handedness.ts`), not the screen side or the model's label. The palm is assumed to face the camera, so the thumb is always on the same side of the wrist-to-middle-knuckle axis (measured on the thumb's base, which stays put in a fist or a thumbs up, and in the hand's own frame, so it holds at any roll). Two hands: each by its thumb; if both come out the same, the more confident keeps its label and the other gets the opposite. One hand: its thumb if clear (`HANDEDNESS.minThumbConf`), else **assumed right**. The model's label (and `APP.swapHandedness`) stays as a debug readout on the hand cards, and `HANDEDNESS.source: "model"` switches back to it. The steering wheel's modifier is now the dancer's **left hand** wherever it is on screen (crossed arms work). **Palm-facing is a readout only**; `COMMANDS.requirePalmFacing` is off. A back-of-hand view reads as the other hand (the stated assumption).
- **HUD**: the zone, the zoom crop, and a small **L / R** chip on each hand (`R?` = no clear thumb, assumed right).
- Dev: `node scripts/e2e/zone.mjs` (sim e2e), `node scripts/e2e/zoomperf.mjs` (real recognizer on Chrome's fake camera, zoom off / on fps). The older e2e scripts now place hands inside the top quarter.

## R5b: speed rework

- **Hold the right thumbs up = 2x while held, the previous speed back on release** (Instagram-style). Arming takes a shorter dwell, **0.3 s** (`SPEED.holdArmMs`), then it engages at once; **release** = the shape gone for **150 ms** (`SPEED.holdReleaseMs`; a dropped frame or two does not release). It restores whatever the speed was (e.g. 0.8x). This is a held *state*, not a different action by hold length: there is no ring and no command fires. The R5 thumbs-up toggle is gone (`T` still toggles 2x / 1x). It needs the right hand in its box to arm (then it may leave), a thumbs-up label whose thumb chord agrees (the R4d guard: a fist read as `Thumb_Up` does not count), and the wheel not being grabbed (grabbing ends a boost at once). Code: `src/holdSpeed.ts` (pure).
- **Fine speed: left shaka (thumb + pinky out, the rest curled; finger chord `10001`, a custom rule since MediaPipe has no shaka label) with the right hand on the wheel = speed mode.** The wheel steps the speed by **0.025 per 72 degrees** of turn (`SPEED.step`, `SPEED.stepDeg`; 20 steps = **four full circles** for 0.5 to 1.0, circling or tilt; R5b amendment: it was 0.05 per 36 degrees), clockwise = faster, clamped to **0.5 to 1.0x** (1.0 is a natural stop; pushing on against an end keeps no travel, so turning back leaves it at once). The music **keeps playing** and changes speed live (no seek, no pause), pitch preserved. Feedback is small: the modest speed badge next to the status word (was huge in R5), and in speed mode a tick strip in the wheel HUD (one tick per 0.025, a taller one every 0.1, the current rate marked); no beeps. The shaka is the fifth left-hand shape: it can start a grab like palm / V / index, and a thumbs up (`10000`) or fist (`00000`) is never a shaka. Code: `isShaka` in `src/steerMode.ts`, `wheelSteps` in `src/speed.ts`.
- **Keys:** `-` / `=` step 0.025 within 0.5 to 1.0 (a rate above 1 comes back to 1.0), `0` resets to 1x, `T` toggles 2x / 1x; buttons the same.
- The loop wrap, scrubbing and the late-mark scaling work at any speed (unit tests at 0.5, 0.75, 0.85 and 2x; `scripts/e2e/speed.mjs` at 0.75x and 0.6x).
- Dev: `node scripts/e2e/speed.mjs` (sim e2e for all of this). In the `?sim` hand specs a shaka is `{ shape: "None", fingers: "10001" }`.

## R4d: hands rework

- **The left hand never starts playback.** While the wheel is held, the left **open palm** only anchors "steer the playhead": paused stays paused, playing keeps playing. The left **fist** pauses while it is closed; opening it to a palm resumes, **only if the fist did the pausing** (already paused: the fist changes nothing and the palm does not start it). V / index (loop START / END) keep the pause as it is; fist -> V -> palm still resumes. Letting go (hands lowered or lost) while the fist is closed leaves the music paused. Left open palm is no play/pause command any more. Code: `src/steerAudio.ts` (pure).
- **A grab can start with palm, V or index** (right hand in its box), at once; V starts straight into steering loop START. **A lone fist cannot start a grab** (a hand hanging loose looks the same, and a fist pauses); it only continues one. Consequence: with the right hand in its box, left V / index steer rather than mark; to set IN / OUT the right hand must be out of its box (or out of view). `STEER.startShapes`.
- **Right hand:** open palm is **no command** (a hand coming into frame never pauses). **Fist (ring, 0.6 s) = play/pause.** Index = restart, V = clear, thumbs up = speed toggle (until R5b, above). A hand leaving the frame fires nothing.
- **Guard:** the model confuses fist and thumbs up, so a `Closed_Fist` label counts only if no finger is out **and the thumb is in**; `Thumb_Up` only if the thumb is out and the four fingers curled (`chordAgrees` in `src/commands.ts`, from the pseudo-chord). A disagreeing hand shows "fingers disagree" and does not fire. The fist is exempt from the palm-facing rule, like the thumbs up.
- **Default wheel motion = circling** (clockwise = forward, no limit; 3 s of music per turn), with the jog mapping. Tilt + relative / joystick stay selectable in the Knob panel. The turn is now read from the palm's **heading** (direction of movement), not from a circle centre estimated over 1 s: direction latency (true degrees of hand travel before the wheel reports the right direction and keeps it) went from 120 (36 % of a circle, after a 300 ms dead warm-up) to 36 to 55 (unit sim at 30 fps, radius 0.05 to 0.08 of the frame height, 0.5 to 1.5 turns/s, both directions; 72 at a 10 fps camera); end to end through `?sim` 30 to 55. Stopping stops at once (no movement from the 2nd frame after the hand halts); a hovering hand or a wave along a line reports nothing. Tunables: `KNOB.circling` (`minChord`, `lookbackMs`, `maxStepDeg`). Seek policy (latest wins, no stacking) is unchanged. The saved knob choice key is now `dance.r4d.knob`.
- Dev: `scripts/e2e/hands.mjs` (sim e2e for all of this, prints the latency numbers); the other e2e scripts now pick the tilt wheel themselves. `?sim` hands take `fingers: "10001"` (T I M R P bits) to make the label and the fingers disagree. Headless Chrome is launched with `--mute-audio`.

## R5: speed (2x and 1x) (superseded by R5b above: the toggle gesture and the preset steps are replaced)

Not a knob (user: "just speeding up and slowing down the entire track and just letting it play"). The **right-hand thumbs up** toggles the whole track between **2x and 1x** and the music just keeps playing (pitch preserved: `preservesPitch` on the audio element). From any other speed (a slowed one) the toggle goes back to 1x. It fires once, when its ring fills, like every command. Keys: **`T`** toggles, **`-`** and **`=`** step through 0.5, 0.75, 1, 1.5 and 2. The speed is shown huge next to the status word whenever it is not 1x (amber faster, blue slower). A new track starts at 1x.

- The thumbs up shows the back of the fingers, so the "palm must face the camera" rule does not apply to it (`COMMANDS.palmFacingExempt`). It is armed on the right hand only (`rightOnlyShapes`): a left thumbs up does nothing and does not cool the right hand down. While the wheel is held the right hand's commands are blocked as before.
- The loop wrap and the scrub work at any speed (tested at 2x, in the unit tests and in the sim: `scripts/e2e/speed.mjs`). A gesture mark's late-mark offset (0.15 s of real time) is scaled by the speed.
- Code: `src/speed.ts` (pure), `AudioPlayer.setRate`, the `speedToggle` / `speedUp` / `speedDown` actions in `src/transport.ts`; `SPEED` and `COMMANDS` in `src/config.ts`.

## R4c: the steering wheel

The default grab is now the **two-hand steering wheel**: hold the **left open palm** up with the **right hand in its box**, then tilt the right hand like a wheel. While you hold it, the **left hand's shape picks what the wheel moves, live, without letting go**:

| Left hand while steering | What the right hand's tilt moves |
|---|---|
| **Open palm** | the **playhead**, music **playing** (audible; it plays on from where you stop) |
| **Fist** | the **playhead**, music **paused** (snippets as it moves; it stays exactly where you stop) |
| **V** | loop **START** |
| **Index up** | loop **END** (same clamps: 0.5 s apart, inside the track) |

- Palm -> fist pauses and fist -> palm resumes, mid-grab. A new left shape must hold ~120 ms (`STEER.modeDebounceMs`) before the mode changes, so a flicker cannot toggle play / pause. The fist is the model's weakest shape, so a left hand whose label is not one of the others counts as a fist when its fingers are curled in (`STEER.fistMaxReach`). A hand showing none of the four shapes freezes the wheel at once and lets go after 0.3 s.
- A grab starts with the palm (palm = playing, so a grab with the music paused starts it). The top of the picture shows four chips (palm / fist / V / index) with the one in force lit.
- **Marks are unchanged when the right hand is not steering:** left V sets IN, left index sets OUT, at the playhead. While steering, V / index select the target instead and no mark fires. No gesture depends on how long it is held.
- **Snappy:** the default mapping is now **relative** (the value follows the turn and stops when you stop), with a 1 degree hold-off so a still hand does not creep and pointer-style acceleration (`KNOB.relative`): a slow turn is fine (about 30 ms a degree), a fast flick travels far (up to 10x), which also takes the place of re-grabbing when the wrist runs out. The joystick is still selectable.
- **Why it lagged, and the numbers** (sim at 30 fps, identical scripted hand motion, medians of 3 runs, `scripts/e2e/lag.mjs`; R4b before -> R4c after): the claw and the two-hand clutch share the whole pipeline, so the mapping was the difference. The joystick keeps moving the value for as long as the hand stays tilted off centre (it was still moving when the 1.5 s hold ended, on both clutches: by design, and it reads as lag). On the relative mapping, "rotation stops" -> "playhead stops" was 474 ms paused (claw 456) and the last seek 305 ms later while playing; now 110 ms (claw 113; most of it is the 70 ms snippet tail plus one camera frame) and 59 ms. Stopping by changing the left hand's shape used to keep moving for 308 ms (5 seeks: the clutch's 0.3 s release grace) against 26 ms for the claw's uncurl; now the wheel is frozen at once (1 seek, 104 ms, no further movement). Playing, a slow steady turn (30 degrees in 3 s) made 15 seeks a second of 89 ms each; now 3.3 a second of 125 ms (a fast flick: 21 seeks -> 12).
- **Less skipping while playing:** the music keeps playing and is only re-seeked once the hand has moved it by 0.1 s (`SCRUB.moveThresholdSec`); the latest position always wins, no seek is stacked on one still in flight, and a small leftover offset is applied once the hand has been still for 120 ms. Paused snippets play while the hand moves and for 70 ms after.
- **Waveform:** the loaded track is decoded once (`decodeAudioData`) to min / max peaks (`src/waveform.ts`, pure and tested) and drawn on the timeline with the loop region, flags and playhead. While steering, a **large zoomed waveform** (3 s either side) fills the bottom of the picture, centred on what is being steered, with START / END poles, the playhead and second ticks.
- Claw and pinch stay in the Knob panel (with the target selector). The saved knob choice key changed (`dance.r4c.knob`), so the new default applies once.
- Dev: `?sim&simfps=30` processes simulated frames at a camera's rate; `scripts/e2e/lag.mjs` measures "rotation stops" to "playhead stops" and the seek traffic (`node scripts/e2e/lag.mjs`, with the dev server on :5178 and `node scripts/make-test-wav.mjs 120`).

## R4b: two hands, scrub, mark IN / OUT

Every gesture fires once, when its ring fills (~0.6 s); nothing depends on how long you hold it (user: "no button that is variable based off how long you are holding it"). Each hand has its **own command box** (mouse-editable: drag inside to move, drag an edge or corner to resize; presets in the Bench). A shape counts only while that hand's palm centre is in that hand's box. Defaults: right hand = right half, left hand = left half of the picture as you see it.

| | Right hand (transport + scrub) | Left hand (marks) |
|---|---|---|
| **Open palm** | play / pause | play / pause |
| **Index up** | back to START (0:00 if none), plays | **set OUT (END)** at the playhead and start looping |
| **V** | clear the loop | **set IN (START)** at the playhead (again = move IN) |
| **Claw grab + tilt** | **scrub the playhead** (claw selected in the Knob panel; since R4c the default grab is the two-hand wheel above); the grab must start in the right-hand box | not a grab |

- **OUT** at or before IN + 0.5 s is ignored with a message; **IN** is refused if it would land within 0.5 s of OUT. The V-cycle is key / button only now (`V`, Mark).
- **Late-mark offset (0.15 s)** applies only when marking while playing and not scrubbing. While paused, while scrubbing, and for 2.5 s after a scrub (`LOOP.exactAfterScrubMs`) the mark is the exact playhead.
- **Scrub (audible):** while grabbed the playhead is seeked live, at most 20 times a second (`SCRUB.maxSeeksPerSec`). Playing: the music keeps playing from the new spot. Paused: each seek plays a ~160 ms snippet (`SCRUB.snippetMs`) and it stays paused on release. Tilt clockwise = later, counter-clockwise = earlier.
- **The knob** (docs/spec.md section 5) is three swappable pure pieces: **clutch** (claw, pinch, two-hand) -> **motion** (tilt, circling) -> **mapping** (joystick, absolute, relative + ratchet, jog), whose output is a delta in seconds for a **target**: the playhead (default), loop START or loop END. Pick all of them live in the collapsible **Knob** panel under the transport; the choice is saved in localStorage. Defaults (R4b): claw + tilt + joystick, playhead; (R4c): two-hand + tilt + relative. Gain and dead-zone sliders; "flip direction".
- **Two-hand clutch** (the default since R4c, see above): left open palm up = grab, right hand steers. Superseded wording from R4b: the left-hand marks are no longer switched off; they work whenever the right hand is not steering.
- **While grabbed** the steering (right) hand's commands are blocked (a claw can read as an open palm or a V), and for 0.5 s after. The left hand still works with claw or pinch. If tracking drops the value freezes and the grab releases after 0.3 s.
- **Feedback:** a big GRABBED word with a dial at the hand (tilt needle against the grab angle, dead zone shaded; circling: turns), and the target's time huge on the picture (PLAYHEAD / LOOP START / LOOP END) with "+1.4 s since grab".
- **Experiment log** (in the Knob panel): the tally counts loop edits per variant automatically; "Felt best" / "Not great" and a note are saved per variant; **Copy results** puts a text summary on the clipboard.
- Code: `src/knob.ts` (pipeline: grab life, freeze, release, ms carry), `knobClutch.ts`, `knobMotion.ts`, `knobMapping.ts`, `scrub.ts`, `handCommands.ts` (per-hand classifiers), `loop.ts` (`nudgeEnd`, `markPlayhead`). All thresholds in `src/config.ts` (`KNOB`, `SCRUB`, `LOOP`, `CLUTCH`).
- Dev sim: `window.__dance.setHands([{ shape: "None", hand: "Right", curl: 0.6, tilt: 30 }])` (`curl` ~0.6 reads as a claw; `tilt` is degrees clockwise as you see it); `__dance.scrubSeeks` lists the scrub seek times.

## R4a loops (the loop model; the gestures for it changed in R4b above)

Let the music play and mark where it is; you will always mark the start a little late, so the START can be nudged back.

(R4a's single-hand V cycle is replaced by the two-hand IN/OUT gestures above; the V key and Mark button still cycle START, END, clear.)

- Gesture marks are stamped where the music was when the ring **started**, minus `LOOP.markOffsetSec` (0.15 s, `src/config.ts`). Keys and buttons mark the playhead as it is.
- An END at or before the START (closer than `LOOP.minGapSec`, 0.5 s) is ignored with a message.
- The wrap (END back to START) is a 4 ms timer plus an animation-frame check on the audio element (`src/loopWrap.ts`); each wrap records its overshoot and seek time (`__dance.practice.wrapper.history` in dev).
- **Keys:** `V` mark (cycle), `S` set start, `E` set end, `C` clear, `R` restart (loop start), `Home` from the top (0:00, keyboard only), `[` / `]` nudge the START by 0.1 s earlier / later, with `Shift` 1 s. Only the marker moves; restart to hear it. The START can't go below 0:00 or within 0.5 s of the END. There are buttons for all of them.
- The logic is in `src/loop.ts` (pure, tested); `Practice.nudgeStart(deltaSec)` is the entry point R4b's knob will call.
- `?sim&track=/test/click-track.wav` (dev) loads a track with scripted hands; `window.__dance.setHands([{ shape: "Victory" }])` then `setHands([])` is a V tap.

## R3 practice view

- **Load a track:** drag an MP3/WAV onto the page, or click **Open track…**. Local files only.
- **Status word** (PLAYING / PAUSED / READY), a big **clock**, and a **timeline** with a moving white playhead, readable from across the room.
- **Gestures** (inside the command box, ring ~0.6 s): **open palm** toggles play/pause and resumes from the same spot; **index up** restarts and plays (to the loop start if one is set, else 0:00). Every command fires when its ring fills.
- **Keys and buttons:** `Space` = play/pause, `R` = restart, `Home` = from the top, `B` = bench (more keys in R4a below).
- Chrome lets a hand gesture start audio only after the page has seen one click or key press; if you only dragged a file in, the page asks for one click.
- Audio engine: `src/audioPlayer.ts` (an `HTMLAudioElement` behind a small interface: why is in its header comment). Gesture/key/button wiring: `src/transport.ts`; DOM: `src/practice.ts`.
- Test track: `node scripts/make-test-wav.mjs` writes `public/test/click-track.wav` (a 60 s click track with a climbing scale, git-ignored). In dev, `?sim&track=/test/click-track.wav` loads it at startup.

**R2 is described below.** Its test bench is unchanged.

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
| `npm test` | Unit tests (Vitest): camera selection and hot-plug fallback, latency stats, the flash test, finger states, palm facing, command box, command state machine, clutch shapes, audio player, gesture-to-audio wiring |
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
| Fire | Every command (open palm, index up, V) fires once, the moment the ring is full. Nothing waits for the release, and holding on or letting go afterwards adds nothing |
| Cooldown | 1.0 s after any fire, no new dwell can start |
| Hand lost or leaves the box | Before the ring is full: cancelled, nothing fires. After it fired: adds nothing |
| Stillness (checkbox, off) | If on, the palm centre must stay within 6% of the frame height during the hold, else the dwell restarts |

On fire: a banner, a beep (checkbox), and a timestamped row in the log. The **false-fire test** counts fires for 2 minutes (rows tagged `test`).

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
