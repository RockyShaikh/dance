# Dance — Wish list and unresolved threads

*Living document · started 2026-10-11 · revised 2026-10-11 (v1: research, knob, setup, loop model · v1.1: above-head zone moved here; R2 uses an on-screen box · v1.2: calibration sequence added, slated R6+). Anything off-checkpoint goes here, not into current work.*

Tags: **next up** (proposed to follow the current checkpoint; needs user approval) · **closed** (resolved or dropped by the user) · **later** (a feature for after the roadmap) · **QoL** (quality of life) · **overlooked** (something we hadn't considered) · **unresolved** (a known problem or open "is this a problem?") · **risk** (a future risk) · **bug?** (a suspected bug).
Sources: [market] = `.agents/research/market-dance-tools.md`, [workflows] = `.agents/research/dancer-workflows.md`, user = the user's own words.

## Wish list

Features we want but aren't building in R1–R5. One line each, plus why it's deferred.

| Feature | Tag | Why deferred |
|---|---|---|
| **Sync with a YouTube video** (user) | later | Local files only for now (decided). YouTube allows only preset speeds and coarse seeks [market] |
| **Turn a choreography video into a teachable "choreo AI agent"** (user) | later | Large and open-ended; depends on everything else working |
| **Phone camera plugin:** phone back camera at 1×/2× zoom, phone body tracking (user) | later | Range is deferred ("gestures first"); likely the main fix for distance |
| **Wearable input** (user) | later | Future modality; would also sidestep choreography collisions |
| **R6+: calibration sequence for the command zone.** Press "calibrate", raise your hand to the height you want, and the zone becomes everything above that line (the box's bottom edge = calibrated hand height). Done by hand each session; no head or body tracking (user) | later | User's intended direction, slated R6+ ("let's still not worry about it in R2. It's going to be R6+"). R2 uses a mouse-editable rectangle |
| **Automatic above-head zone** found with a body or face tracker (e.g. MediaPipe Pose) | later | Superseded by manual calibration, which needs no extra model; only if calibration proves annoying |
| **Snap loop start/end to the beat or 8-count** | later | Hides late-landing points [market, workflows]; needs beat detection |
| **"Loop the last 8 counts"** with one gesture | later | No aiming needed [workflows]; needs beat detection |
| **Lead-in after restart:** a 3-2-1 countdown, or a tempo-synced "5, 6, 7, 8" | QoL | Restart plays immediately for now (user). Both reports say dancers want time to get into position [market, workflows]; tempo sync needs beat detection |
| **Automatic pre-roll on the loop start:** new loops start N s earlier than marked | QoL | You "always overplay at the beginning" (user), so a fixed shift could replace most nudging; an option, not built |
| **Spoken confirmations** ("loop in", "loop on") | QoL | Dancers know this from DanceMaster [workflows]; sounds and banners first |
| **Big current-count display (1–8)** | later | Readable cue [market]; needs beat detection |
| **Numbered markers (1–4), jump by finger count** | later | The one place finger counts make sense [market] |
| **Fixed speed presets + one-gesture reset to 1×** | later | Fallback if the R5 knob doesn't feel right; what practice tools do [market, workflows] |
| **"Step it up":** speed rises a little each loop pass | later | Matches the 0.5 → 0.75 → 0.9 → 1.0 habit [workflows; market] |
| **Audible nudge preview** (hear snippets while nudging the start) | QoL | R4 moves the marker silently; index-tap to hear |
| **Auto-play from the new start on knob release** | QoL | Spec §9 Q2; R4 assumes the marker moves only |
| **Nudge the loop end** | QoL | Not needed: overshoot at the end is fine, "just considered trailing" (user) |
| **Loop off but keep the points** | QoL | Dropped when shaka was cut to shrink the vocabulary |
| **Nudge in fixed steps** (±1 beat) instead of seconds | later | Needs beat detection [market: LoopStep uses ±0.1 s] |
| **Loop N times, then continue** | later | Maps well to gestures [market] |
| **Save loops, markers and speed per song** | later | No persistence yet |
| **Webcam "ghost" overlay or delayed replay** for self-review | later | Cheap since the camera is already on [market] |
| **Reference video beside the webcam** (mirrored) | later | Overlaps with YouTube sync |
| **TV / big-screen layout** | QoL | Laptop screen first |
| **Voice commands** as a fallback while paused | later | Music and counting aloud make voice weak [market] |
| **Foot pedal / Bluetooth clicker** fallback | later | Other modalities later |
| **Arm or body-pose commands** | later | Easier at distance [workflows]; option once range matters |
| **Volume by gesture** | later | Not in the user's list |
| **Group use** ("claim control" so one person drives) | later | Low priority; the user practices solo |
| **Restart to the last place you pressed play** (DanceMaster style) | later | User chose loop start / song start [workflows: DanceMaster] |
| **Finger-state debounce / hysteresis** (readouts flicker near thresholds) | QoL | Surfaced in R1; natural home is R2's hold logic |
| **Debug toggle**: raw palm score, landmark indices | QoL | Surfaced in R1; data already exposed in dev |
| **Low-power mode**: 1 hand or lower video resolution if fps is low | QoL | Surfaced in R1; only if real fps disappoints |
| **CI / pre-commit hook** (tests + typecheck) | overlooked | Surfaced in R1; repo has none |
| **Auto-zoom onto the hand** (digitally crop or scale up the hand region, like Apple's Center Stage / face tracking) | later | User 2026-10-11: more important than raw distance; distance stays a non-worry for now |
| **Suppress commands while a clutch is grabbed** (esp. two-hand) | QoL | Surfaced in R2; decide in R4 when clutches control something |
| **Collapsible settings panel** (side panel scrolls on a laptop screen) | QoL | Surfaced in R2 |
| **Tune the tap's 0.12 s release delay** (dropout grace) | QoL | Surfaced in R2 |
| **Click/drag the timeline to seek** | QoL | Surfaced in R3; `seek` already exists |
| **Mute or change the confirm beep during practice** (plays over the music) | QoL | Surfaced in R3; needs ears |
| **Volume control; show track name / recent files** | QoL | Surfaced in R3 |
| **Commit the e2e browser driver** (`?sim` checks) under `scripts/` | overlooked | Surfaced in R3; currently lives in /tmp only |
| **Ring says what will fire** (e.g. "V: SET START / hold: CLEAR") | QoL | Surfaced in R4a; spec §4.7 |
| **Nudge readout and banner overlap** on short windows | QoL | Surfaced in R4a |
| **Late-mark offset as a bench slider** (config-only now, 0.15 s) | QoL | Surfaced in R4a |
| **Wrap look-ahead tune** (`LOOP.wrapLookaheadSec`, now 0) | QoL | Surfaced in R4a; one-line tune if the loop end feels late |
| **Pre-grab hint ("curl now")** for the claw | QoL | Surfaced in R4b |
| **Key to cycle knob variants; HUD shows "left marks off" in two-hand** | QoL | Surfaced in R4b |
| **Separate scrub speed slider** (`KNOB.targetScale.playhead` fixed at 1.5) | QoL | Surfaced in R4b |
| **Sim scripts claw sequences natively** | later | Surfaced in R4b |
| **Audible preview while steering START/END** | QoL | Surfaced in R4c |
| **V/index steer with no loop set could create the mark at the playhead** | QoL | Surfaced in R4c |
| **Zoom waveform panel overlaps dial/hand in small windows** | QoL | Surfaced in R4c |
| **Per-window waveform gain; long tracks decode large (~53 MB for 10 min)** | QoL | Surfaced in R4c |
| **Remember speed across tracks** (new track resets to 1×) | QoL | Surfaced in R5 |
| **Web Audio engine for true scrubbing** instead of seeks | later | Surfaced in R4c |
| **Arming feedback for the 0.3 s thumbs-up hold** (no ring now) | QoL | Surfaced in R5b |
| **Mini 0.5–1.0 speed gauge in speed mode** instead of text | QoL | Surfaced in R5b |
| **Hand-following crop window** (zoom that tracks the hand, with hysteresis) so zoom helps a full-width zone | later | R6 finding: a full-width top-quarter crop gives ×1.00 (the model scales by the long side); needs a real hand to tune |
| **Zoom toggle key; persisted zone margin** | QoL | Surfaced in R6 |
| **Pose as the left/right source** (body knows its own arms) | later | S3 2026-10-13 |
| **Body-relative command zone** (above head from pose) | later | S3 2026-10-13; links to the deferred above-head zone |
| **macOS Center Stage as a zero-code zoom test** | QoL | S3 2026-10-13; only if the Mac/camera supports it |
| **Full-body pose control version** for beta testing against hand gestures | later | User 2026-10-13 |
| **Own detection pipeline** (body-first crops into the gesture model) | later | User 2026-10-13: "making our own pipeline might be good" |
| **Fist = four fingers down (ignore thumb) + dropout-tolerant dwell** | next up | User 2026-10-13: the fist label drops before 0.6 s; fist joints are poor. Must not swallow thumbs up (right hand) |
| **Bump capture to 2K/4K and run CV on it** | next up | User 2026-10-13: start at 1080p, then try 2K/4K. Note (S4): Continuity Camera maxes out at 1080p / 1920×1440, so 4K needs a different camera |
| **iPhone-native companion**: the iPhone runs all the CV and sends commands to the laptop | later | User 2026-10-13: keep as an option after the direct-on-Mac test |
| **Native macOS Vision helper** (Apple hand pose on the Mac) as an alternative to an iPhone app | later | S4 2026-10-13 |
| **Latency results: include camera label, CSV export** | QoL | Surfaced in R7 |
| **Run the hand model in a worker** (separate it from the frame callback; cleaner latency) | later | Surfaced in R7 |

## Unresolved threads

Things we're unsure are problems, or know are problems but aren't fixing yet. One line each, plus why it's parked or what would resolve it.

| Thread | Tag | Why parked / what resolves it |
|---|---|---|
| **Choreography collides with commands** (held poses, open palms, peace signs) | unresolved | User: leave it for now. Box + 0.6 s dwell first; R2 logs false fires. Future levers: calibrated above-hand-height zone (R6+), longer dwell, stillness rule, wake pose, wearable |
| **Laptop or camera moves, or a different person's height** | closed | User: don't worry about it. You recalibrate or re-drag the box each session |
| **Range / distance:** gestures first, range later (user) | unresolved | Note the tested distance in R1–R2; fixes later (phone camera, external webcam, lighting, body-pose commands) |
| **Can pinch and claw be read reliably** once you're farther away? | risk | Part of the range thread; the two-hand clutch is the most robust option |
| **Out-of-wrist range:** the knob runs out of tilt (user) | unresolved | The joystick and circling avoid it; R4 compares [spec §5] |
| **Which knob feels best for nudging the loop start:** joystick vs absolute vs relative vs circling; pinch vs claw vs two-hand | unresolved | R4 experiment (user wants to try all), recorded in Decisions |
| **Joystick for speed vs for the start nudge** may want different settings (gain, dead zone) | unresolved | Tune separately in R4 and R5 |
| **Circling looks like dance arm moves** | risk | Circling only counts while grabbed; check in R4 |
| **Tracking drops while the knob is grabbed** | risk | Value freezes, then releases [spec §5.2]; verify in R4 |
| **How much do you overplay the loop start?** Is it consistent? | unresolved | The nudge handles it in R4; if it's always about the same, automatic pre-roll (wish list) could replace it |
| **Tap vs hold adds a short delay** (tap fires on release) | unresolved | Probably fine between attempts; check in R2 |
| **Laptop load:** the hand model every frame plus audio (CPU/GPU, fans, stutter) | risk | Watch fps and audio in R2/R3. Calibration adds no extra model; an automatic body tracker would |
| **Mirror behind the laptop:** a reflection could be detected as extra hands or a second body | unresolved | The laptop faces you, so the camera probably won't see the mirror; check once |
| **Readability** of the screen from where you dance | unresolved | Check in R3 |
| **Lighting:** dim room, bright window behind you | risk | Test in your real space |
| **Latency budget:** camera + models + dwell + audio start | unresolved | Dwell dominates by design; check in R3 |
| **Bluetooth speakers add delay** | risk | Check in R3/R4 |
| **Loop timing precision** in the browser | risk | Choose the audio approach in R4 by ear |
| **Pitch-preserving speed quality** at 0.5×, and live changes without clicks | risk | R5 decides by ear |
| **Live speed changes may clash with precise looping** | risk | Pick an audio engine in R4 that can also do R5 |
| **Left/right label flips** in a mirrored image | unresolved | Commands treat both hands the same; two-hand clutch uses screen side |
| **Ready-made gesture labels vs our own rules** | unresolved | Labels for the three shapes, rules for pinch and claw; revisit if accuracy is poor |
| **Porting** to mobile, native, or Python if the browser falls short | risk | Decide only if R1–R3 show limits |
| **Privacy:** camera always on | unresolved | Video stays on the laptop; say so in the UI |
| **Left/right label + palm-facing unverified on a real hand** (`swapHandedness` in src/config.ts) | closed | Live check 2026-10-11: labels were flipped; fixed with `swapHandedness: false` |
| **Thumb is the weakest finger read** (tucked thumb read differently on mirrored photo; may be landmark error, not threshold) | risk | User 2026-10-11: thumb "pretty decent", the four fingers matter most. Tune `thumb.*` only if needed |
| **Model license** stated as Apache-2.0 from MediaPipe pages, not checked against the model card | unresolved | Confirm before anyone else reuses the repo |
| **8.4 MB model committed to git history** | risk | Fine for one model; consider Git LFS if more arrive |
| **Choppy frame rate at startup until a hand appears** | bug? | Seen in R1 live test; smooth once a hand is in view. Minor |
| **Claw and fist-vs-pinch thresholds tuned on synthetic hands** (real fist reach probably ~1.0 vs fixture 1.21) | risk | Live test 2026-10-12: claw decent, **pinch a little rough**; the user rarely expects to use pinch, which matters if pinch stays the default knob grab (R4) |
| **"One hand at a time" rule**: currently only blocks when two hands show command shapes inside the box | unresolved | Builder's reading; user to confirm or tighten |
| **Quick shape switches** (index up → V): old shape lingers 120 ms, can tap-fire if its ring was full | risk | Surfaced in R2 |
| **Gesture Recognizer labels may carry their own palm-orientation bias** | risk | Real 9/10 tests will show |
| **Loop wrap with HTMLAudioElement is timer-based** and may sound loose at the loop point | risk | Check by ear in R4; fallback is a Web Audio engine behind the same `AudioPlayer` interface |
| **R3 makes Pointing_Up fire on ring-fill** (`PRACTICE.holdShapes` override) | risk | R4 must remove it to restore tap vs hold |
| **Chrome needs one click/key before gesture-started audio** (handled with a hint; non-Chrome wording untested) | unresolved | Surfaced in R3 |
| **Loop marks and Bluetooth/output latency**: should marks subtract the audio output delay? | unresolved | Surfaced by the tutor 2026-10-12; matters with Bluetooth speakers |
| **Two-hand grab vs open palm**: with the whole-frame box, the open palm used as the two-hand modifier also toggles play/pause | risk | Surfaced 2026-10-12; relevant to R4b (suppress commands while grabbed) |
| **Seek gap not measured on the user's machine** | unresolved | Check during R4a ear test |
| **~5 ms silent gaps now and then at the loop wrap** (HTMLAudioElement re-buffer) | risk | R4a measured overshoot ≤6 ms idle and ≤23 ms under 25 ms/frame load; fallback is a Web Audio looping buffer |
| **Background tab throttles the wrap timer** (overshoot could reach ~1 s) | risk | Low priority: dancing uses the foreground tab |
| **Possible click at the wrap** if START sits mid-waveform | unresolved | Beat snap or a micro-fade would address it |
| **Claw starts from an open hand, and a right open palm held 0.6 s toggles play/pause** | risk | Must curl within ~0.5 s; may force a design change (different claw entry, longer dwell, or play/pause on another shape). Check by hand |
| **Absolute vs relative mapping nearly identical for nudging** | unresolved | Keep both only if they feel different |
| **Scrubbing near loop END while playing**: the wrap may fight the seek | risk | Untested |
| **MP3 seek accuracy/latency** | risk | Only WAV tested so far |
| **1 s cooldown shared across hands** may slow IN-then-OUT marking | risk | Surfaced in R4b |
| **Left-hand marks stay live while the right hand grabs** | unresolved | Builder's choice; the user to confirm |
| **UI says START/END; gestures say IN/OUT** | unresolved | Naming; the user to pick |
| **Real-hand tuning:** `STEER.fistMaxReach` (1.15), `KNOB.relative` hold-off/boost, tilt smoothing (not on panel) | unresolved | Surfaced in R4c |
| **Thumb_Up vs fist confusion**: right-box false fires could toggle 2× | risk | Run the bench false-fire test |
| **Left palm grab while paused starts playback** (palm = playing) | unresolved | User to confirm, or respect paused |
| **Thumbs up from a slowed speed goes to 1×, not 2×** | unresolved | User to confirm |
| **Fast flick drifts ~0.4 s of music past the stop** | risk | Surfaced in R4c; tune acceleration if it bothers |
| **Marking while the right hand rests in its box is impossible** (left V/index steer instead) | unresolved | R4d decision 1; option: marks win unless the right hand moves |
| **Fist/thumb chord guard false-reject rate on real hands** (`chordAgrees`) | risk | Real-hand tuning |
| **Circling tuned on simulated jitter** (`KNOB.circling.*`) | risk | Real-hand tuning |
| **Thumb_Up flicker over 150 ms drops 2× momentarily** | risk | Surfaced in R5b |
| **Hold-to-2× overwrites any key speed change made during the boost** | overlooked | Surfaced in R5b |
| **Hands dropping with the left fist closed leaves the music paused** | unresolved | R4d decision 2; the user to confirm |
| **Scrubbing with no IN/OUT set: you must lower the right hand to mark, then steer** | unresolved | User 2026-10-12: "a little bit more to be desired"; wants a stress test first before redesigning |
| **Thumb rule flips L/R if the back of the hand is shown** | risk | Assumption: palm always faces camera (user) |
| **Very small hands rejected even when zoomed**; zone below ~12% of the frame is clamped | risk | Surfaced in R6 |
| **`scripts/e2e/lag.mjs` didn't finish within 7 min after R6 hand-position edits** | bug? | Unknown whether hung or slow |
| **HolisticLandmarker GPU bug (#5166); no gesture labels; always runs the face model** | risk | S3 2026-10-13 |
| **Palm detection runs every frame while only one hand is up** (cost) | risk | S3 2026-10-13 |
| **Finger shapes at 3–5 m unmeasured**: crops fix detection only; landmark pixels are the same (~65 px hand at 4 m) | unresolved | No-code test: grab near, step back |
| **Is hand-gesture detection the right modality at distance at all?** | unresolved | User 2026-10-13: resolution may run out; OK if tracking works; a 4K webcam is acceptable for prototyping; compare against a full-body pose version |
| **Continuity Camera streaming latency** (wireless vs USB) | unresolved | Measure in R7 |
| **macOS Reactions draw effects into camera frames on V sign / thumbs up** (our gestures!) | bug? | S4 2026-10-13: turn Reactions off in the menu-bar Video menu; affects the built-in camera too |
| **2× zoom at 4 m frames only about 1.56 m tall** (head + raised hands, not the full body) | unresolved | S4 2026-10-13; fine for the top-zone design, a problem for future full-body pose |
| **Glass-to-glass test needs the camera to see the screen** (built-in camera needs a mirror) | risk | Surfaced in R7 |
| **Real Continuity Camera labels/ids across sleep/wake, Desk View listing** | unresolved | Untested in R7 |
| **With phone zoom, the screen-fixed zone moves relative to the body** | unresolved | Surfaced in R7 |
