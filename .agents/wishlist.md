# Dance — Wish list and unresolved threads

*Living document · started 2026-10-11 · revised 2026-10-11 (v1: research, knob, command zone, setup decisions). Anything off-checkpoint goes here, not into current work.*

Tags: **later** (a feature for after the roadmap) · **QoL** (quality of life) · **overlooked** (something we hadn't considered) · **unresolved** (a known problem or open "is this a problem?") · **risk** (a future risk) · **bug?** (a suspected bug).
Sources: [market] = `.agents/research/market-dance-tools.md`, [workflows] = `.agents/research/dancer-workflows.md`, user = the user's own words.

## Wish list

Features we want but aren't building in R1–R5. One line each, plus why it's deferred.

| Feature | Tag | Why deferred |
|---|---|---|
| **Sync with a YouTube video** (user) | later | Past R5. YouTube allows only preset speeds and coarse seeks [market] |
| **Turn a choreography video into a teachable "choreo AI agent"** (user) | later | Large and open-ended; depends on everything else working |
| **Phone camera plugin:** phone back camera at 1×/2× zoom, phone body tracking (user) | later | Range is deferred ("gestures first"); likely the main fix for distance |
| **Wearable input** (user) | later | Future modality; would also sidestep choreography collisions |
| **Snap IN/OUT to the beat or 8-count** | later | Hides late-landing points [market, workflows]; needs beat detection |
| **"Loop the last 8 counts"** with one gesture | later | No aiming needed [workflows]; needs beat detection |
| **Tempo-synced "5, 6, 7, 8" count-in** | later | R4 has a plain 3-2-1; tempo sync needs beat detection [market] |
| **Pre-roll:** start a beat or a few seconds before IN | QoL | Lets you enter the move in tempo [market]; spec §9 Q1 |
| **Spoken confirmations** ("loop in", "loop on") | QoL | Dancers know this from DanceMaster [workflows]; sounds and banners first |
| **Big current-count display (1–8)** | later | Readable cue [market]; needs beat detection |
| **Numbered markers (1–4), jump by finger count** | later | The one place finger counts make sense [market] |
| **Fixed speed presets + one-gesture reset to 1×** | later | Fallback if the R5 knob doesn't feel right; what practice tools do [market, workflows] |
| **"Step it up":** speed rises a little each loop pass | later | Matches the 0.5 → 0.75 → 0.9 → 1.0 habit [workflows; market] |
| **Audible scrub preview** (DJ-style snippets) | QoL | R4 starts silent; spec §9 Q4 |
| **Loop off but keep the points** | QoL | Dropped when shaka was cut to shrink the vocabulary |
| **Nudge IN or OUT by small steps** (±0.1 s or ±1 beat) | QoL | Adds vocabulary [market: LoopStep] |
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

## Unresolved threads

Things we're unsure are problems, or know are problems but aren't fixing yet. One line each, plus why it's parked or what would resolve it.

| Thread | Tag | Why parked / what resolves it |
|---|---|---|
| **Choreography collides with commands** (hands-up moves, held poses, open palms overhead) | unresolved | User: leave it for now. Zone + 0.6 s dwell first; R2 logs false fires. Levers if needed: longer dwell, stillness rule, wake pose, wearable |
| **Is the above-head zone tiring, or awkward for tap vs hold** (holding ~1.5 s overhead)? | unresolved | Check feel in R2 |
| **Range / distance:** gestures first, range later (user) | unresolved | Note the tested distance in R1–R2; fixes later (phone camera, external webcam, lighting, pose-based commands) |
| **Can pinch and claw be read reliably** once you're farther away? | risk | Part of the range thread; the two-hand clutch is the most robust option |
| **Out-of-wrist range:** the knob runs out of tilt (user) | unresolved | The joystick and circling avoid it; R4 compares [spec §5] |
| **Which knob feels best:** joystick vs absolute vs relative vs circling; pinch vs claw vs two-hand | unresolved | R4 experiment (user wants to try all), recorded in Decisions |
| **Scrub (Method A) vs play-pause-set (Method B)** for placing points (user) | unresolved | R4 experiment |
| **Joystick for speed vs for scrub** may want different settings (gain, dead zone) | unresolved | Tune separately in R4 and R5 |
| **Circling looks like dance arm moves** | risk | Circling only counts while grabbed; check in R4 |
| **Tracking drops while the knob is grabbed** | risk | Value freezes, then releases [spec §5.2]; verify in R4 |
| **Points land late** (reaction + recognition) | unresolved | R4 compensates; beat snap later [workflows] |
| **Tap vs hold adds a short delay** (tap fires on release) | unresolved | Probably fine between attempts; check in R2 |
| **Two vision models every frame** (hands + pose): CPU/GPU load, fans, audio stutter | risk | Watch fps and audio in R2/R3; run pose less often if needed |
| **Mirror behind the laptop:** a reflection could be detected as extra hands or a second body | unresolved | The laptop faces you, so the camera probably won't see the mirror; check once |
| **Readability** of the screen from where you dance | unresolved | Check in R3 |
| **Lighting:** dim room, bright window behind you | risk | Test in your real space |
| **Latency budget:** camera + models + dwell + audio start | unresolved | Dwell dominates by design; check in R3 |
| **Bluetooth speakers add delay** | risk | Check in R3/R4 |
| **Loop timing precision** in the browser | risk | Choose the audio approach in R4 by ear |
| **Pitch-preserving speed quality** at 0.5×, and live changes without clicks | risk | R5 decides by ear |
| **Live speed changes may clash with precise looping** | risk | Pick an audio engine in R4 that can also do R5 |
| **Spotify / Apple Music tracks are protected** and can't be loaded | unresolved | Local files only for now |
| **Left/right label flips** in a mirrored image | unresolved | Commands treat both hands the same; two-hand clutch uses screen side |
| **Ready-made gesture labels vs our own rules** | unresolved | Labels for the three shapes, rules for pinch and claw; revisit if accuracy is poor |
| **Porting** to mobile, native, or Python if the browser falls short | risk | Decide only if R1–R3 show limits |
| **Privacy:** camera always on | unresolved | Video stays on the laptop; say so in the UI |
