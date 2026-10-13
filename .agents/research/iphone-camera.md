# Is an iPhone rear camera (or another camera) a better path to 3–5 m hand gestures than the laptop webcam?
Date: 2026-10-13   Brief: R7 exploration. Covers Continuity Camera ± Center Stage, native iOS Vision, four architectures, other cameras, and an ordered test plan.

## Answer
- **Yes, and the cheapest version needs zero code.**
  - Continuity Camera turns the iPhone's rear camera into an ordinary Mac camera. Chrome can use it (**sourced**).
  - On macOS 14+, the menu-bar Video menu has a manual zoom (0.5×–3×) and Center Stage auto-framing (**sourced**).
- **Narrowing the field of view is what helps both MediaPipe stages.**
  - Raising resolution alone does not help the palm detector, which always sees the whole frame shrunk to 192 px.
  - Zoom into the frame Chrome receives helps both stages: Continuity Camera's 2× zoom, Center Stage, or optical telephoto. At 2×, a palm at 4 m reaches the detector at about 5.9 px instead of 2.9 px. The hand is about 132 px instead of 65 px (**inferred**; table below).
- **Native iOS Vision is a real but costlier step.** It has hand pose with `regionOfInterest`, chirality and 4K capture. But Apple only gives landmarks, not gesture labels, and its own guidance says to keep hands "under 11 feet (3.5 m)" (**sourced**).
- **Test 1 today:** run Continuity Camera into the current app with no code changes. Compare 1×, ~2× manual zoom and Center Stage (Main lens) at 2–5 m, with Reactions turned off.

## Evidence (observed / sourced)

**Our app (r6-zone worktree `.claude/worktrees/agent-ad2be58932550cc04`)**
- `getUserMedia` uses `facingMode: "user"` and ideal 1920×1080 at 30 fps (`src/camera.ts:41-49`, `src/config.ts:55-60`).
- There is no `deviceId` and no `enumerateDevices` anywhere in `src/` (grep). So **there is no camera picker**; Chrome's default or remembered camera is used.
- The model sees raw, unmirrored frames; only the display is mirrored (`src/config.ts:62-66`, `src/box.ts:5-6`).

**Continuity Camera (CC)**
- **Requirements** (https://support.apple.com/en-us/102546):
  - iPhone XR or later, iOS 16+, macOS Ventura 13+, same Apple Account with 2FA, Wi-Fi and Bluetooth on.
  - It works over USB if the iPhone trusts the Mac.
  - Orientation: "In landscape orientation to allow apps to choose your iPhone automatically, or in portrait orientation."
  - Mounted "with its rear cameras facing you".
- **Formats** (WWDC22 "Bring Continuity Camera to your macOS app", https://developer.apple.com/videos/play/wwdc2022/10018/):
  - "three 16 by 9 formats -- from 640 by 480 to 1080p -- and one 4 by 3 format: 1920 by 1440", with "up to 30 frames per second or 60 frames per second".
  - "uses the rear camera system on the iPhone… works with all four orientations".
  - "The portrait orientation gives you a more zoomed in field of view compared to landscape orientation."
  - **No 4K stream reaches the Mac.**
- **Chrome:** in a 2026 report on macOS 26.5.1, "The same iPhone camera works in Google Chrome on the same Mac". Chrome's helper declares `NSCameraUseContinuityCameraDeviceType`; Obsidian/Electron lacked it and got no frames. With no constraints the track was 640×480 at 30 fps. https://forum.obsidian.md/t/macos-continuity-camera-is-detected-by-getusermedia-but-delivers-zero-video-frames-in-obsidian/116834
- **Older Chrome versions sometimes did not list the iPhone.** The fix was to pick it once in FaceTime, then restart Chrome. https://mobilesyrup.com/2022/12/11/how-to-use-apple-camera-continuity-with-google-chrome/
- **Lens and zoom:**
  - With Center Stage on, "choose Main or Ultra Wide" (https://support.apple.com/en-us/111102).
  - Center Stage defaults to the ultra-wide (https://discussions.apple.com/thread/255270401).
  - With Center Stage off, macOS 14+ manual framing gives "Toggle between 0.5x and 1x… drag the slider", plus pan by dragging the preview (https://support.apple.com/en-gb/guide/mac-help/mchlff01c919/14.0/mac/14.0).
  - The range is "from 3x zoomed in to 0.5x zoomed out" (https://discussions.apple.com/thread/254851641).
  - Macworld reports lens buttons 0.5/1/2/3 (or 5) on Pro models (https://www.macworld.com/article/2158264/how-to-pan-zoom-continuity-camera-macos.html; the page now returns 404, so this is secondary).
- **Center Stage:** "Mac using Continuity Camera with iPhone 11 or later (excluding iPhone SE)", or a "MacBook Pro introduced in 2024 or later". The user's 2021 M1 Max therefore has **no built-in Center Stage** (https://support.apple.com/en-us/111102). No distance or framing rules are documented.
- **Video effects are system-level.** Reactions are "a system-level camera feature, available out of the box, without any code changes needed in your app". While effects run, 60 fps may drop to 30 fps (WWDC23 10105, https://developer.apple.com/videos/play/wwdc2023/10105/).
- **Reactions gestures** (https://support.apple.com/en-us/105117):
  - Gestures: victory = balloons, thumbs up, thumbs down, two V = confetti, both thumbs up = fireworks, horns on each hand = lasers.
  - Requirements: macOS 14+ on Apple silicon, or CC with an iPhone 12+.
  - **Our V and thumbs-up shapes trigger these.**
- **Latency:** no Apple or independent measurement found for CC, wired or wireless.

**Native iOS Vision**
- **Requests and availability** (Apple doc JSON, `developer.apple.com/tutorials/data/documentation/vision/...`):
  - `VNDetectHumanHandPoseRequest`: iOS 14+ / **macOS 11+**.
  - `maximumHandCount`: default 2. "orders detected hands by relative size, with only the largest ones having key points determined".
  - `VNImageBasedRequest.regionOfInterest`: normalized rect, lower-left origin.
  - Chirality: iOS 15 / macOS 12.
  - New Swift API: `DetectHumanHandPoseRequest`, iOS 18 / macOS 15. It conforms to `ImageProcessingRequest`, which has `regionOfInterest`.
  - `DetectHumanBodyPose3DRequest`: iOS 18.
- **WWDC20 10653** (https://developer.apple.com/videos/play/wwdc2020/10653/):
  - Caveats: hands near edges, hands parallel to the view direction, gloves, "will sometimes detect feet as hands".
  - Body pose degrades with "obstructive flowing clothing", occlusion and edges.
  - "ARKit body pose can only be used with a rear-facing camera".
  - No range or fps numbers.
- **WWDC21 10039** (https://developer.apple.com/videos/play/wwdc2021/10039/):
  - Vision gives 21 joints and no gesture labels. You classify with a **Create ML Hand Pose classifier** (about 500 images per class plus a Background class) or a **Hand Action classifier** (about 100 videos per class).
  - Guidance: keep the hand "**under 11 feet (3 1/2 meters)**".
  - The classifier input is `keypointsMultiArray`.
- **No measured fps found for Vision hand pose.** One blog gives 8–12 ms for *body* pose on an iPhone 13+ (https://dev.to/benjamin_pires_59127eddff/on-device-pose-estimation-on-ios-what-actually-works-in-production-not-just-research-papers-48ma). This is secondary.
- **Apple sample:** "Detecting Hand Poses with Vision" (https://developer.apple.com/documentation/vision/detecting-hand-poses-with-vision).
- **Other APIs:**
  - `AVAudioUnitTimePitch` (iOS 8+) gives rate and pitch independently (https://developer.apple.com/documentation/avfaudio/avaudiounittimepitch).
  - `AVCaptureDevice.DeviceType.continuityCamera` is macOS 14+.
- **Free Xcode "Personal Team" installs expire after 7 days.** The paid program is $99/yr. https://developer.apple.com/forums/thread/761325, https://developer.apple.com/support/compare-memberships/

**iOS Safari (option b)**
- iOS may switch rear lenses mid-capture even with `deviceId`, `facingMode: exact` and `zoom: 1.0` set (iPhone 15 Pro, iOS 18; unanswered). https://developer.apple.com/forums/thread/776460
- MediaPipe web GPU-path bugs on iOS Safari:
  - #6142: wrong segmenter output on the GPU delegate, iPhone 12 Pro, iOS 18.7.1.
  - #5292: Web Workers on iOS 17+.
  - https://github.com/google-ai-edge/mediapipe/issues/6142 , https://github.com/google-ai-edge/mediapipe/issues/5292
- No hand-landmarker-specific Safari bug found.

**Other cameras** (retailer spec tables, secondary)

| Camera | Specs | Source |
|---|---|---|
| Logitech MX Brio | 4K30 / 1080p60, 8.5 MP, FOV 90/78/65° diagonal, 4× digital zoom | https://www.bhphotovideo.com/c/product/1811438-REG/logitech_mx_brio |
| OBSBOT Tiny 2 | 1/1.5" 50 MP, 4K30, H 72.9° / D 85.5°, 4× digital zoom, gimbal AI tracking and gesture control | https://www.bhphotovideo.com/c/product/1761726-REG/obsbot_tiny_2_4k_ai_powered.html |
| Insta360 Link 2 | 1/2", 4K30, ~79.5° diagonal, 4× digital zoom, gimbal tracking and gestures, USB 2.0 | https://www.bhphotovideo.com/c/product/1846367-REG/insta360_cinsabnb_link_2_4k_ai.html |
| OBSBOT Tail 2 | 5× **optical** zoom (H 81° → 18°), 4K60, AI tracking. HDMI/NDI/USB; UVC mode over USB not confirmed | https://www.markertek.com/product/obs-tail-2/obsbot-tail-2-ai-powered-ptzr-live-production-camera-up-to-4k-60fps-12x-optical-zoom |
| Mirrorless as webcam | Sony α7 IV is UVC/UAC "up to 4K" over USB (https://www.sony.co.uk/interchangeable-lens-cameras/products/ilce-7m4/feature5). Or HDMI into an Elgato Cam Link 4K, UVC 3840×2160 at 30 fps | Elgato |

## Reasoning (inferred unless marked)

### Pixel math
Assumptions:
- Hand length 19 cm, palm 8.5 cm.
- iPhone 1× ≈ 25 mm equivalent, ≈69° horizontal FOV. 2× = 38°, 3× = 26°.
- Palm-detector px = palm × 192 / frame long side (letterboxed). Hand px = full-resolution pixels across the hand.

"Coverage" is the field width × height at 4 m. A dancer with arms up is about 2.3 m tall.

| Setup (frame Chrome/Vision gets) | HFOV | Coverage @4 m (m) | Vertical @3 m | Hand px 3/4/5 m | Palm px to 192 detector 3/4/5 m |
|---|---|---|---|---|---|
| Today: MBP built-in 1080p (70° assumed) | 70° | 5.6 × 3.15 | 2.36 | 87 / 65 / 52 | 3.9 / 2.9 / 2.3 |
| CC 1× Main, 1080p | 69° | 5.5 × 3.1 | 2.34 | 88 / 66 / 53 | 3.9 / 2.9 / 2.4 |
| CC 1× Main, 1920×1440 (4:3) | 69° | 5.5 × 4.15 | 3.1 | 88 / 66 / 53 | 3.9 / 2.9 / 2.4 |
| CC 1.5× zoom, 1080p | 50° | 3.7 × 2.1 | 1.56 | 132 / 99 / 79 | 5.9 / 4.4 / 3.5 |
| **CC 2× zoom, 1080p** | 38° | 2.8 × 1.56 | 1.17 | **176 / 132 / 105** | **7.9 / 5.9 / 4.7** |
| CC 2× portrait (1080×1920) | 22° wide | 1.56 × 2.8 | 2.08 | 176 / 132 / 105 | 7.9 / 5.9 / 4.7 |
| CC 3× zoom, 1080p | 26° | 1.85 × 1.04 | 0.78 | 264 / 198 / 158 | 11.8 / 8.8 / 7.1 |
| Native iOS 1× 4K | 69° | 5.5 × 3.1 | 2.34 | 176 / 132 / 105 | 3.9 / 2.9 / 2.4 (whole frame) |
| Native iOS 2× 4K | 38° | 2.8 × 1.56 | 1.17 | 351 / 264 / 211 | 7.9 / 5.9 / 4.7 (whole frame) |
| Native iOS 5× (120 mm) 4K | 16° | 1.15 × 0.65 | 0.49 | 843 / 632 / 506 | 18.9 / 14.1 / 11.3 |
| 4K webcam at 90° diag (MX Brio), 4K | 82° | 7.0 × 3.9 | 2.95 | 139 / 105 / 84 | 3.1 / 2.3 / 1.9 |
| MX Brio 65° mode at 1080p (sensor crop) | 58° | 4.4 × 2.5 | 1.87 | 109 / 82 / 66 | 4.9 / 3.7 / 2.9 |
| Insta360 Link 2, 4K | ~67° | 5.3 × 3.0 | 2.24 | 184 / 138 / 110 | 4.1 / 3.1 / 2.5 |
| OBSBOT Tiny 2 1×, 4K | 73° | 5.9 × 3.3 | 2.49 | 165 / 123 / 99 | 3.7 / 2.8 / 2.2 |
| OBSBOT Tiny 2 2× tracking zoom, 4K (50 MP sensor) | 41° | 2.95 × 1.66 | 1.25 | 329 / 247 / 198 | 7.4 / 5.5 / 4.4 |
| OBSBOT Tail 2 5× optical, 4K | 18° | 1.27 × 0.71 | 0.54 | 768 / 576 / 461 | 17.2 / 12.9 / 10.3 |
| Mirrorless, ~50 mm-equivalent lens, 4K | 37° | 2.7 × 1.5 | 1.12 | 365 / 274 / 219 | 8.2 / 6.1 / 4.9 |

Reading the table (inferred):
- **Zooming the camera's own frame helps both stages.**
  - The prior report estimated the palm detector fails below about 6–8 px. CC 2× gets to 5.9 px at 4 m: borderline. 3× is comfortably above at 3–5 m but only covers 1 m vertically at 4 m.
  - So with 2× or more, **the framing must be "head + raised hands"**, not the full body. That fits R6's top-quarter command zone but loses feet and full-body view.
- **4K without zoom doubles hand pixels but leaves the detector at 2.3–3.1 px.** It needs the pose-guided crops spike to be useful.
- **CC is capped at 1080p/1440**, so CC zoom is a camera-side crop. On any iPhone, 2× of a ≥12 MP (4032-px-wide) sensor still has ≥1920 real pixels, so CC 2× should be real detail and not upscaled. This assumes the crop happens on the phone before scaling, which is how Center Stage works on iPad. It is not confirmed for CC.
  - 3× on a 12 MP main is upscaled unless it switches to a telephoto lens.
- **Center Stage defaults to Ultra Wide.** Cropping the ultra-wide to a person runs out of real pixels sooner, so pick **Main**.
  - Center Stage's framing is tuned for calls, which likely means head and shoulders. It may crop off raised hands or keep re-framing as the dancer moves. Its tightness at 3–5 m is unknown.
  - Every re-frame moves the screen-fixed command zone relative to the body. This is the same drift the prior report noted.

### Other inferences
- **Reactions burn effects into the video frames** (balloons for V, thumbs-up effects). The model then sees them too. They already apply to the M1 Max's built-in camera on macOS 14+, so this may already be happening today. Turn Reactions off in the Video menu for every test.
- **Mirroring and handedness:** CC presents a normal webcam stream, so the raw frame should be unmirrored like today and `swapHandedness: false` should hold. Verify the thumb rule with a quick left/right check in test 1.
- **Camera selection:** Chrome on macOS likely ignores `facingMode` (Mac cameras report none). It opens the default or remembered device. Test 1 can switch camera through Chrome's site camera setting with no code.

### Architecture options

**(a) CC into the existing Mac app, unchanged**
- Effort: none to test. A small ship later: camera picker, 1440 option, resolution readout.
- Latency: CC encode, Wi-Fi and decode add an unknown amount (not measured anywhere found). USB likely lower. MediaPipe and logic are unchanged.
- Code reuse: 100 %.
- Limits:
  - 1080p/1440 cap.
  - Zoom is set by hand in the Video menu.
  - Phone heat and battery over an hour (plug in via USB).
  - Needs an iPhone 11+ for Center Stage and a stand.

**(b) Web app in iPhone Safari, rear camera**
- Effort: low to medium (HTTPS on LAN, a mobile layout).
- Latency: no network hop, but MediaPipe web on an A-series GPU through WebGL is unknown. GPU-delegate bugs exist on iOS Safari (#6142, #5292). The lens may switch mid-capture (forum 776460). Resolution through Safari is unverified.
- Code reuse: high.
- **Killer:** with the rear camera on the dancer, **the phone's screen faces away**, so there is no visual feedback and the audio comes from the phone. Would need AirPlay to a TV or Mac.

**(c) Hybrid: native iPhone "sensor" app plus the Mac web app**
- Design: AVCapture at 4K, Vision body pose, then hand pose with `regionOfInterest` per wrist. Send 21 landmarks × 2 hands plus chirality (about 1 KB per frame) to the Mac.
- Transport:
  - **Multipeer is not reachable from a browser.**
  - Option 1: the iPhone app runs a WebSocket server (Network.framework) and Chrome on `http://localhost` connects to `ws://<iphone>.local`.
  - Option 2: a tiny Node relay inside the Vite dev server.
- Latency: LAN WebSocket is typically a few ms, with Wi-Fi power-save spikes of tens of ms. Vision is probably 10–30 ms per frame for body + 2 hand ROIs (**unmeasured**). Plausibly at or below today's MediaPipe path.
- Code reuse: high. Logic, audio and UI stay. A `FrameSource`-like "landmark source" adapter is needed.
- **Big catch:** our logic keys on MediaPipe gesture **labels** (`Closed_Fist`, `Victory`, `Pointing_Up`, `Thumb_Up`, `Open_Palm`; prior report). Vision gives only landmarks. Options:
  - port the label logic to chord rules on landmarks, or
  - train Create ML classifiers, or
  - feed Vision landmarks into MediaPipe's landmark-only gesture embedder (a hack, untested).
  - Vision's 21-joint order also differs from MediaPipe's and needs a mapping.
- Effort for someone new to Swift: medium to high. It involves Xcode, signing (7-day free installs), AVFoundation, Vision, a network server, and thermal management.

**(d) Full native iOS app (Swift, AVAudioEngine + `AVAudioUnitTimePitch`)**
- Effort: highest; rewrites about 580 tests' worth of logic.
- Latency: best (no network).
- Code reuse: about 0 %.
- Same "screen faces away" problem as (b).
- Not justified before (a) and (c) are measured.

**(e) (not in brief, noted) Native macOS Vision helper**
- `VNDetectHumanHandPoseRequest` exists on macOS 11+. A small Swift CLI on the Mac could read CC or a 4K webcam, run Vision with ROI, and stream landmarks to `ws://localhost`.
- It avoids iOS signing, phone thermals and the Wi-Fi hop, but loses 4K from the iPhone (CC caps at 1440).

## Options / Recommendation (ordered test plan, cheapest first)

### Test 1 (today, no code, about 30 min): CC into the current `r6-zone` app
1. **Check requirements.**
   - iPhone XR+, iOS 16+, macOS 14+ (for the zoom dial), same Apple Account, Wi-Fi and Bluetooth on.
   - Center Stage needs an iPhone 11+.
   - Optionally, a USB cable for power and possibly lower latency (tap "Trust" on the iPhone).
2. **Mount the phone.** Landscape on a tripod or stand at about head height, rear cameras toward the practice space, phone locked or screen off.
3. **Wake CC once.** Open FaceTime, pick the iPhone under Video, then quit FaceTime.
4. **Start the app** (`npm run dev` in the worktree). In Chrome, open `chrome://settings/content/camera` and choose the iPhone camera, or use the camera icon in the address bar on the localhost tab. Reload.
5. **Check the stream.** In the DevTools console, run `document.querySelector('video').videoWidth + 'x' + document.querySelector('video').videoHeight`. Expect `1920x1080`.
6. **Prepare the Video menu** (green camera icon in the menu bar): **turn Reactions off.**
7. **Run the prior report's Step 0 protocol** (tape at 2, 3, 4 and 5 m; cold-acquire at each mark, then acquire near and walk back) on four configurations:
   - **A:** CC 1×, Center Stage off. Sanity check against the built-in webcam; expect similar results.
   - **B:** CC manual zoom at about 2× (Center Stage off; hover the preview, drag the zoom dial; pan so the raised hands sit in the top quarter).
   - **C:** CC 3× (if the phone has a telephoto, or just to see).
   - **D:** Center Stage on, lens = Main.
   - **Record for each:** cold-acquire success, chord or label correct (fist, V, index, shaka, thumbs-up, open palm), left/right correct, felt lag versus the built-in webcam, and for D whether raised hands stay in frame and whether the zone drifts.

### Decision points after test 1
- **B works at 4 m (about 90 % or more correct):** distance is mostly solved by optics. R7 shrinks to a small ship: in-app camera picker, `?cam=` remembered by label, resolution readout, optional 1920×1440 mode, and a setup doc. Pose-crop spike optional.
- **B tracks after near-acquire but cold-acquire fails:** the detector is still the limit. Run the prior pose-guided-crop spike on CC 2× frames. The detector then has about 2× more margin.
- **Chords are wrong even at 2–3× at 4 m:** the landmark model itself is the limit, not pixels. More pixels will not help, and native Vision becomes the comparison (test 3).
- **Lag is noticeably worse than the built-in camera:** retry over USB. If still bad, use a USB webcam (test 2).

### Test 2 (borrow or buy, no code)
- A tracking 4K webcam with in-camera zoom, e.g. **OBSBOT Tiny 2**. Its 50 MP sensor gives about 2× real zoom and the gimbal follows the dancer. Re-check for drift relative to the zone.
- A plain 4K 90° webcam (MX Brio) only helps landmarks, not detection. Skip it unless the crop spike is planned.
- Optical-zoom PTZ (OBSBOT Tail 2) or a mirrorless camera with a 50 mm-equivalent lens are the "max pixels" options. They are pricier and need USB UVC or a Cam Link.

### Test 3 (small Xcode exercise, before any hybrid build)
- Build Apple's "Detecting Hand Poses with Vision" sample on the iPhone, switched to the back camera. Optionally set `regionOfInterest`.
- Check whether Vision keeps 21 joints at 3–5 m at 1× and 2×.
- This de-risks (c) and (e) for about an hour, given the user is new to Swift.

### Then
Hybrid (c), or the macOS helper (e), only if tests 1–3 show MediaPipe is the bottleneck and Vision is not.

## Wishlist candidates
- **Suspected bug:** macOS Reactions (V = balloons, thumbs-up) may already fire on the built-in camera in Chrome and burn effects into the frames the model sees.
- **QoL:** in-app camera picker (`enumerateDevices` plus `deviceId`, remembered), a resolution/fps readout, and a 1920×1440 4:3 option for more vertical coverage.
- **Overlooked:** with 2–3× zoom, framing becomes "upper body + raised hands". The zone and HUD assume a full-body view.
- **Future risk:** phone thermals and battery during hour-long CC sessions. Keep it plugged in.
- **Idea:** a native macOS Vision helper (option e) as an alternative to the iPhone sensor app.
- **Idea:** OBSBOT and Insta360 have built-in gesture control. It could clash with our gestures, and it is worth knowing about.
- **Risk:** Vision joint order and labels differ from MediaPipe's. Any Vision path needs a mapping, plus label replacements for `Closed_Fist`, `Victory` and the rest.

## Uncertainty and open questions
- **Which iPhone model does the user have?** It decides Center Stage (11+), Reactions (12+), whether 2× is a 48 MP crop and whether 3×/5× is optical.
- **macOS version on the M1 Max?** The manual zoom dial needs 14+; macOS 15+ per one secondary source.
- **CC latency** (wired and wireless) is unmeasured anywhere found; test 1 measures it by feel.
- **Whether the CC zoom crop happens before scaling on the iPhone** (real detail versus upscaled) is not documented.
- **How tightly Center Stage frames a single person at 3–5 m**, and whether it keeps raised hands, is undocumented.
- **Is upper-body framing acceptable?** The user must decide whether the camera may frame "head + raised hands" only, or must see the full body.
- **Vision hand pose real range and fps** on the user's phone are unknown. Apple's only guidance is "under 3.5 m" for the classifier.
- **Whether `getUserMedia` honours a portrait CC stream and the 1920×1440 format in Chrome** is untested.
