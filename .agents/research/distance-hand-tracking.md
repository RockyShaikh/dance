# Can body-first auto-tracking (pose, then a crop around each wrist, then the hand model) make finger gestures work at 3–5 m?
Date: 2026-10-13   Brief: R7 scout. MediaPipe hand pipeline limits, web Holistic, pose-guided wrist crops, alternatives, and a range-only spike plan.

## Answer
**Probably yes for finding the hands. Whether the finger shapes read correctly at 3–5 m is still unproven.**

- **What fails is the palm detector, not the pixels.** It sees the whole frame shrunk to 192×192, so a palm at 4 m is about 3 px wide to it. This does not change with capture resolution (**observed** in the model and source; the pixel numbers are **inferred**).
- **The landmark stage already uses full-resolution pixels.** It crops the hand out of whatever image it is given at full resolution. Giving the palm detector a small crop around each wrist fixes detection. It does nothing for how sharp the hand is to the landmark model. That sharpness is the same in every approach and has not been measured.
- **Web `HolisticLandmarker` exists.** It is in `@mediapipe/tasks-vision` from 0.10.10 (2024-02-22) and is in our 1.1.0. It does exactly "pose → each wrist → hand landmarks on a full-resolution crop", with no palm detector at all. But it gives no gesture labels, always runs the face model, and has an open GPU bug on the web.
- **Recommendation:**
  1. Run a no-code "acquire near, walk back" test first.
  2. Then spike pose-guided wrist crops feeding our existing Gesture Recognizer, with Holistic as a cheap comparison in the same spike.

## Evidence (observed)

**1. Our hand pipeline (Gesture Recognizer, tasks-vision 1.1.0)**
- Installed version is `@mediapipe/tasks-vision` 1.1.0 (`package.json`, `package-lock.json:11`), released 2026-10-06 (`npm view @mediapipe/tasks-vision time`).
- The app runs `GestureRecognizer` in VIDEO mode with `numHands: APP.numHands` (2) (`src/recognizer.ts:25-26`). It captures at an ideal 1920×1080 (`src/config.ts:57-58`).
- Tensor shapes, read straight from the tflite files inside our vendored `public/models/gesture_recognizer.task` (parsed with a small flatbuffer reader):
  - `hand_detector.tflite` (the palm detector): input **[1,192,192,3]**. Its output has 2016 anchors.
  - `hand_landmarks_detector.tflite`: input **[1,224,224,3]**.
  - `gesture_embedder.tflite`: inputs are [1,21,3] landmarks, [1,1] handedness and [1,21,3] world landmarks. **No image input**: the gesture label is computed from landmarks alone.
- Official docs give the bundle input as "192 x 192, 224 x 224". They say the landmark model works "on the cropped hand image defined by the palm detection model". In VIDEO and LIVE_STREAM modes, palm detection is skipped while hands are tracked. Docs state no distance or hand-size limit. https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- How the palm detector sees the frame (letterboxing, `hand_detector_graph.cc`):
  - Input is the whole frame letterboxed to 192: `set_keep_aspect_ratio(true)`, `BORDER_ZERO` (lines 238-240).
  - Anchor strides are 8/16/16/16 on a 192 input (lines 110-122).
  - The palm box is scaled ×2.6 to cover the whole hand (lines 137-138).
  - https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/hand_detector/hand_detector_graph.cc
- **The landmark stage crops from the full input image.** `hand_landmarks_detector_graph.cc` passes `image_in` plus `hand_rect` into preprocessing (lines 265-266). The next-frame ROI is the landmark box ×2.0, square, shifted y −0.1 (lines 148-151). https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/hand_landmarker/hand_landmarks_detector_graph.cc
- How tracking works (`hand_landmarker_graph.cc`):
  - In stream mode the detector is skipped only when the previous frame tracked at least `max_num_hands` hands (lines ~280-305).
  - So with `numHands: 2` and only one hand visible, **palm detection runs every frame**.
  - In IMAGE mode the detector always runs (lines ~322-330).
  - https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/hand_landmarker/hand_landmarker_graph.cc
- **There is no ROI option for hand tasks.**
  - `ImageProcessingOptions.regionOfInterest` is declared in `vision.d.ts` (lines 1602-1617).
  - But the web `HandLandmarker`, `GestureRecognizer`, `PoseLandmarker` and `HolisticLandmarker` all pass `/* roiAllowed= */ false`: `hand_landmarker.ts:156-160`, `gesture_recognizer.ts:168-172`, `pose_landmarker.ts:159-163`, `holistic_landmarker.ts:289-293` under https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/tasks/web/vision.
  - The bundled JS throws `"This task doesn't support region-of-interest."` (found in `node_modules/@mediapipe/tasks-vision/vision_bundle.mjs`).
  - The C++ `hand_landmarker.cc` also uses `roi_allowed=false`.
  - **Cropping must be done by us**, as R6 does.
- **Documented or reported range:**
  - Legacy Hands docs: the palm detector must cover "a large scale span (~20x)", and "providing additional context, like arm, body, or person features, aids accurate hand localization" (`docs/solutions/hands.md:100-112` in the mediapipe repo).
  - A Google engineer on small hands: "the detector has limitations on detecting small hands, we experimented before with larger model size and more number of anchors but it gives us a lot more false positive without much gain". The reporter's failure was at about 1.5 m. https://github.com/google-ai-edge/mediapipe/issues/377
- **R6 already confirms the long-side rule.**
  - The Cropper draws the crop 1:1 into a square, padded canvas (`src/zoom.ts:130-153`, `drawImage` at :149).
  - Magnification = frame long side / crop long side (`src/zoom.ts:113`).
  - The README records a full-width strip as ×1.0 and a half-width strip as ≈×1.7 (README "R6").

**2. Holistic on the web**
- **It ships in our version.** `HolisticLandmarker` is declared in our installed `vision.d.ts` (line 1089ff: options 1330-1371, result 1379-1400). It first appears in **0.10.10** (absent in 0.10.9, present in 0.10.10, .12 and .14 per jsDelivr `vision.d.ts`). 0.10.10 was published 2024-02-22.
- **Official web guide:** https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker/web_js (IMAGE and VIDEO modes; no performance or limitations section). Overview page: https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker
- **What the result contains:** `poseLandmarks`, `faceLandmarks`, `leftHandLandmarks`, `rightHandLandmarks` and world versions. **No handedness scores and no gesture categories** (`vision.d.ts:1379-1400`). Options: face/pose thresholds, `minHandLandmarksConfidence`. There is no `numPoses`, so it tracks one person.
- **Models in `holistic_landmarker.task`** (13.7 MB, listed from the bundle):

  | Model | Input |
  |---|---|
  | `pose_detector` | 224 |
  | `pose_landmarks_detector` (2,818,358 B) | 256 |
  | `hand_roi_refinement` | 256 |
  | `hand_landmarks_detector` | 224 |
  | `face_detector` | 128 |
  | `face_landmarks_detector` | 192 |
  | `face_blendshapes` | n/a |

  There is **no palm detector**. Its pose landmark model is byte-for-byte the size of the one in `pose_landmarker_lite.task` (2,818,390 B), versus 6,438,874 B in `pose_landmarker_full.task`.
- **How it finds each hand** (`holistic_hand_tracking.cc` and `holistic_landmarker_graph.cc`, https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/tasks/cc/vision/holistic_landmarker):
  - It takes pose wrist, pinky and index (`holistic_landmarker_graph.cc:425-480`, left = pose 15/17/19, right = 16/18/20).
  - It drops the hand if pose wrist visibility ≤ 0.1 (`holistic_hand_tracking.cc:80-92`).
  - It turns those three points into a box, then ×2.7 square, shifted y −0.1 (:94-111).
  - A **re-crop model** (`HandRoiRefinementGraph`) refines the box (:113-126).
  - Tracking against the previous landmarks uses ×2.0 (:128-160).
  - The hand landmark model then runs on the **full input image** in that ROI (:163-176).
- **Legacy design doc:** pose runs at 256×256, which is "too low for accurate articulation". So the pipeline crops "the full-resolution input frame to these ROIs". The re-crop model costs "~10% of hand model inference time". Pose also prevents "a mixup between left and right hands" (`docs/solutions/holistic.md:45-90`).
- **The web task always runs face.** It always adds the `FACE_LANDMARKS` output stream (`holistic_landmarker.ts` ~lines 676-700). The only face-related switch is blendshapes.
- **Known issues:**
  - [#5166](https://github.com/google-ai-edge/mediapipe/issues/5166) "Holistic GPU delegation does not work" (JS), **still open** (last update 2025-02-04). Reported: CPU-only "hardly over 10" fps. GPU worked for some users from 0.10.15/0.10.16 (">20 fps" demo), but not in a Web Worker. GPU plus blendshapes fails in 0.10.20.
  - Only Android/Python bugs otherwise: [#6348](https://github.com/google-ai-edge/mediapipe/issues/6348), [#6354](https://github.com/google-ai-edge/mediapipe/issues/6354).

**3. Pose Landmarker**
- **Models:** lite, full and heavy all use a 224 detector and a 256 landmark model. Docs give no range and no latency. https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- **Bundle sizes** (HTTP HEAD): lite 5.8 MB, full 9.4 MB, heavy 30.7 MB.
- **Range:** the evaluation sets contain a single person "located 2-4 meters from the camera". On Dance PCK@0.2 the scores are Lite 92.5, Full 96.3, Heavy 97.2. The detector uses the face as "a proxy for a person detector" (`docs/solutions/pose.md:88-135`).
- **Landmark indices:** 0 nose; 1-6 eyes; 7/8 ears; 11/12 shoulders; 13/14 elbows; 15/16 wrists; 17/18 pinky; 19/20 index; 21/22 thumb (official page).
- **Left/right on unmirrored input:** in a repro on 1.1.0 (Python), pose 15 (left wrist) and Holistic `left_hand` fell on the subject's **own** left hand. Mirroring the image swaps them. Hand/Gesture "Left" means the subject's left too (since v0.10.5). https://github.com/google-ai-edge/mediapipe/issues/6376. This was one photo, not a video stress test. Our model input is the raw, unmirrored frame (`src/zoom.ts` header). `APP.swapHandedness` is false (`src/config.ts:67`), which agrees.

**4. Alternatives**
- **Center Stage:** M4 MacBook Pro and iMac have a 12 MP Center Stage camera; earlier Macs had 1080p. https://9to5mac.com/2024/10/30/new-macbook-pro-lineup-m4-features/ , https://digitalcameraworld.com/news/macbook-pro-m4-gets-12mp-camera-incremental-update-or-content-creators-dream
- **How our code depends on gesture labels:**
  - `Closed_Fist` and `Thumb_Up` are checked against the chord (`src/commands.ts:46-47`).
  - The command shapes list is `["Closed_Fist","Pointing_Up","Victory"]` (`src/config.ts:112`).
  - The steering modifier is `Open_Palm` (`src/config.ts:186`).
  - The shaka is already a custom chord rule (README R5b).
- **Dev replay already exists:** `?video=URL` plays a looping clip instead of the camera (`src/camera.ts:59-66`, `src/main.ts:489-492`). The headless perf harness is `scripts/e2e/zoomperf.mjs`.

## Reasoning

**Why it fails at distance (inferred).**
- **Assumption:** a laptop webcam has a horizontal field of view of about 70°. Palm width is 8.5 cm and hand length 19 cm.
- **Size to the palm detector** = palm × 192 × M / (2·d·tan 35°) ≈ **11.7·M / d px**, where d is distance in metres and M is magnification. **It does not depend on capture resolution**, because the whole frame is shrunk to 192 regardless.

| Setup | 1 m | 2 m | 3 m | 4 m | 5 m |
|---|---|---|---|---|---|
| Whole frame (M=1, today) | 11.7 | 5.8 | 3.9 | 2.9 | 2.3 |
| R6 half-width zone (M≈1.76) | — | — | 6.8 | 5.1 | 4.1 |
| Person crop, 2.3 m tall (arms up) | ≈7 at any distance | | | | |
| Wrist crop, 1.0 m side / 0.6 m side | ≈16 / ≈27 at any distance | | | | |

- The reported failures at about 1.5–2 m (#377) suggest detection becomes unreliable below roughly 6–8 px of palm at 192. **That is an estimate, not a measured number.**
- **The landmark stage** gets the hand from full-resolution pixels: hand length ≈ 260/d px at 1080p, i.e. 87 / 65 / 52 px at 3 / 4 / 5 m. Its ROI (about 2× the hand, so about 174 / 130 / 104 px) is **upscaled** to 224. At 1 m it was downscaled from about 520 px.
- **Every crop approach keeps these same landmark pixels**, because R6's Cropper copies 1:1 and Holistic crops from the full frame. **Crops fix detection only.** Whether V / index / shaka / thumbs-up still read correctly from a 65 px hand is **unknown**. The user believes it does; that is not yet verified.

**Smallest counterfactual (no code).**
- In VIDEO mode, once a hand is tracked, the palm detector is skipped and the landmark model follows the hand on full-resolution pixels.
- **Test:** acquire the hand at 1 m, then step back while holding the shape.
- **If detection is the only bottleneck:** tracking and correct chords will survive well beyond the distance where a fresh hand can be acquired.
- **Falsifier:** chords go wrong at the same distance acquisition fails. Then landmark fidelity is the limit, and no crop strategy will fix it. More pixels on the hand would be needed: 4K, a phone camera, or optical zoom.
- **Caveat:** with only one hand up and `numHands: 2`, the detector also runs every frame. It may still find nothing, which is harmless.

**Manual pose → wrist crops → Gesture Recognizer (how, and the pitfalls; inferred).**
- **Steps:**
  1. Run `PoseLandmarker` (VIDEO mode) on the full frame.
  2. For each side, take wrist, index and pinky (15/19/17 and 16/20/18). Build a box, ×2.7 square, shifted toward the fingers (Holistic's recipe).
  3. Floor the crop side at about 0.8–1.0× shoulder width (11↔12), because pose hand points are noisy at distance.
  4. Draw each crop with the existing `Cropper` and run the recognizer.
  5. Map landmarks back with `toFullFrame`.
  6. Keep the detected hand whose wrist is nearest the pose wrist (a crop can hold both hands when the arms cross).
- **Pitfalls:**
  - **VIDEO-mode state across crops.** The recognizer remembers the last hand rect in the *previous input's* normalized coordinates. If the crop moves, that rect is stale; if one instance alternates between two crops, it is wrong. Use IMAGE mode (detector every call, stateless, correct). Or use **one VIDEO instance per hand**, each with its own strictly increasing timestamps, plus a crop deadband so the crop only moves when the hand nears its edge.
  - **Per-frame cost.** The work is pose plus 2 × (palm + landmarks + embedder). Google's hand number is Pixel 6, 12 ms GPU for the whole hand pipeline. **No figures exist for a Mac in Chrome; this must be measured.**
  - **Pose lag and smoothing.** Fast hands can leave the crop, so keep a margin. When pose visibility drops (≤0.1, as in Holistic), fall back to a whole-frame pass.
  - **Coordinates.** Non-square crops need the square padding `zoom.ts` already does. `analyze()` takes one remap for all hands (`src/analyze.ts:97-109`), so remap per crop before calling it.
  - **GPU contexts.** Pose plus 1–2 recognizers means 2–3 GPU task instances on one page. Keep the GPU→CPU fallback per task.
  - **Left/right comes free from pose** (15 = dancer's left on raw frames). This could cross-check R6's thumb rule.

**Holistic as an option (inferred).**
- **Pros:**
  - It is Google's tuned version of exactly the requested design: pose prior, re-crop model, tracking.
  - It needs no palm detector, so a small far palm doesn't matter.
  - It has pose-consistent left/right.
  - It is only a few lines to try.
- **Cons:**
  - No gesture labels, so our label-based logic (`Closed_Fist`, `Victory`, `Pointing_Up`, `Thumb_Up`, `Open_Palm`) would need chord-only replacements.
  - It always pays for face mesh.
  - It uses the lite pose landmark model.
  - It has an open web GPU issue (#5166). The 1.1.0 behaviour is unknown.
  - One person only.
- **Best use:** as the **fidelity control** in the spike. If Holistic's hand landmarks give correct chords at 4 m, the pixels are enough.

**Pose range at 3–5 m (inferred).**
- 2–4 m is inside the evaluation distance, so 3–4 m should be fine.
- At 5 m the face (the detector's proxy) is only about 6 px tall in the 224 letterboxed input. First detection may get flaky. Once acquired, VIDEO tracking runs at 256 on the person ROI and should hold.
- **Model choice:** Full is the spike default (+4 PCK over Lite on Dance for +3.6 MB). Lite is the fps fallback. Heavy (30 MB) only if wrists jitter.
- **Head height:** use nose and eyes (0–6) with per-landmark visibility. Head top ≈ eye y − about 1.5× (eye-to-mouth distance) (inferred). That is enough for an above-head zone.

**Alternatives, briefly (inferred).**

| Option | Pros | Cons |
|---|---|---|
| **A. Person crop** (pose bbox driving R6's zoom crop, Center Stage-like) | Reuses `zoom.ts`. One recognizer call. Labels and tracking unchanged. | Only about ×2–3, i.e. ≈7–9 px palms ≈ "1.3–1.6 m feel" at any distance. May be marginal. Face-only driving is weak: the tasks face detector is short-range, so pose is needed anyway. macOS Center Stage gives a real 12 MP gain on M4 Macs with zero code, but reframes as you move, so the screen zone drifts relative to the body. |
| **B. Hand-following crop, no pose** | No extra model. | Acquiring a far hand is the unsolved part. Needs a tiled scan (several calls per frame) or acquire-near. |
| **C. Higher capture resolution** | Helps the landmark stage only. | Detection at 192 is unchanged. 4K would raise the fidelity ceiling (wishlist: phone camera). |
| **D. Arm/pose-only gestures** | Robust to 5 m. | Loses fist/V/index/shaka/thumbs-up, which must stay. Good as a complement (e.g. a raised-arm "listen" clutch), not a replacement. |

## Options / Recommendation

**Prototype first:** pose-guided per-wrist crops feeding the **existing Gesture Recognizer**.
- It keeps labels, chords, the thumb rule, the zone and commands untouched.
- It gives about 16–27 px palms to the detector at any distance.
- Holistic runs in the same spike as the fidelity control.
- The person crop is a cheap third arm, since it needs the same pose model.

**Spike plan (range and fps only; no gesture or logic changes).** Branch `r7-range-spike` off `r6-zone`.

**Step 0 (user, no code, about 15 min, on the current `r6-zone` build, zoom off).**
- Tape marks at 1, 2, 3, 4 and 5 m.
- (a) Acquire at each mark: raise the right hand and hold each shape for 5 s. Note whether the skeleton appears and whether the chord readout is right.
- (b) Acquire at 1 m, then step back mark by mark while holding the shape still at each mark.
- This test decides whether crops can work at all (see the counterfactual above).

**Step 1 (ship).** A dev-only `?track=frame|person|wrists|holistic` switch, plus `&pose=lite|full` and `&delegate=GPU|CPU`.
- `wrists` starts in IMAGE mode. A VIDEO-per-hand variant is added only if fps is under 20.
- A dev range panel shows, over a rolling window and a labelled 10 s capture (key press, JSON to console):
  - per-hand detection rate;
  - % of frames with the expected chord and, in Gesture Recognizer modes, the expected label;
  - hand size in full-resolution px (wrist → middle knuckle);
  - fps and ms per stage (pose, each hand call, crop draw);
  - time to re-acquire after lowering the hands.
- Optional: a dev "record 10 s" key (MediaRecorder on the same stream). Replay through the existing `?video=` so every mode sees identical frames. Live numbers stay authoritative because webm compression costs detail.

**Files the spike touches:**
- `src/config.ts`: a `TRACK` block (mode, model paths, crop factors ×2.7, floor as a fraction of shoulder width, deadband).
- `src/recognizer.ts`: `loadPose`, `loadHolistic`, crop-recognizer loaders, each with the GPU→CPU fallback.
- New `src/poseCrop.ts` and `src/poseCrop.test.ts`: pure functions. Pose → per-hand `CropRect`, the person `CropRect`, and picking the hand nearest the pose wrist.
- `src/zoom.ts`: reuse `cropLayout`, `toFullFrame`, `Cropper` and `cropAsDisplayBox` (one `Cropper` per crop). Ideally no edits.
- `src/main.ts`: the frame loop (around lines 543-577, `recognizeForVideo` at :570). Branch by mode, merge per-crop results into full-frame landmarks before `analyze`, and publish stats on `window.__dance`.
- New `src/rangeLog.ts`: the dev stats panel and capture.
- `src/hud.ts` or `src/draw.ts`: a dev overlay of pose wrists and crop outlines.
- `public/models/`: vendor `pose_landmarker_full.task` (9.4 MB), `pose_landmarker_lite.task` (5.8 MB) and `holistic_landmarker.task` (13.7 MB).
- `README.md`: model notes (around line 200) and an "R7 spike" section.
- New `scripts/e2e/trackperf.mjs`: a copy of `zoomperf.mjs` for relative ms per mode.
- Not touched: `commands.ts`, `handedness.ts`, the zone, gestures and audio.

**Spike done means:**
- A table of mode × distance (2–5 m) × shape → detection %, chord-correct %, hand px, fps and ms, on the user's laptop with the GPU delegate.
- Whether Holistic's GPU path works in 1.1.0.
- **Suggested decision rule:** pick the cheapest mode with ≥90 % detection and ≥90 % chord-correct at 4 m at ≥20 fps.

## Wishlist candidates
- **Idea:** pose wrists (15/16) as a handedness source, or a cross-check on R6's thumb rule. It should cover crossed arms and back-of-hand views.
- **Overlooked cost:** with `numHands: 2` and one hand visible, the palm detector runs every frame (`hand_landmarker_graph.cc`). This matters for the low-power wish.
- **Risk:** if Holistic is adopted, the open web GPU bug #5166 and the always-on face mesh.
- **QoL / zero-code test:** macOS Center Stage, if the user's Mac has the 12 MP camera.
- **Later feature:** a body-relative command zone (above the head, from pose nose and eyes) instead of a fixed area of the frame.
- **Future risk:** landmark fidelity at 5 m (about 52 px hands) may need more pixels (4K or phone camera, already on the wishlist).
- **Docs gotcha:** handedness labels follow the subject on unmirrored input (#6376). Ours agrees (`swapHandedness: false`). Keep it that way if crops or pose are added.

## Uncertainty and open questions
- **Field of view:** the user's Mac model and camera field of view are unknown. All px numbers assume about 70° horizontal; Center Stage availability depends on the model.
- **Detection threshold:** the palm detector's real minimum palm size is not documented. The "6–8 px at 192" figure is an inference from reports.
- **Landmark fidelity** at 65 px hands (4 m) is unmeasured. Step 0 answers it.
- **Real resolution:** whether the camera actually delivers 1920×1080 (versus upscaled 720p) through Chrome. The spike should log `videoWidth`/`videoHeight`.
- **Holistic in 1.1.0:** GPU status and fps on the web are unknown (issue last updated Feb 2025).
- **Pose at 5 m:** first-detection reliability at 5 m with a 16:9 frame letterboxed into 224 is unmeasured.
- **Lighting and motion blur** at distance (dancing) are not modelled.
