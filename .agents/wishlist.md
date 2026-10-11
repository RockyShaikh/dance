# Dance — Wish list and unresolved threads

*Living document · started 2026-10-11 · revised 2026-10-11 (v1: research, knob, setup, loop model · v1.1: above-head zone moved here; R2 uses an on-screen box · v1.2: calibration sequence added as next up after R2). Anything off-checkpoint goes here, not into current work.*

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
| **NEXT UP AFTER R2: calibration sequence for the command zone.** Press "calibrate", raise your hand to the height you want, and the zone becomes everything above that line (the box's bottom edge = calibrated hand height). Done by hand each session; no head or body tracking (user) | next up | User's intended direction. Kept out of R2, which uses a mouse-editable rectangle; needs the user's approval to become a roadmap checkpoint |
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

## Unresolved threads

Things we're unsure are problems, or know are problems but aren't fixing yet. One line each, plus why it's parked or what would resolve it.

| Thread | Tag | Why parked / what resolves it |
|---|---|---|
| **Choreography collides with commands** (held poses, open palms, peace signs) | unresolved | User: leave it for now. Box + 0.6 s dwell first; R2 logs false fires. Future levers: calibrated above-hand-height zone (next up), longer dwell, stillness rule, wake pose, wearable |
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
