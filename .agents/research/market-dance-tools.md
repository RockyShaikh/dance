# What existing dance/practice tools can teach a hands-free, gesture-controlled choreography practice tool?
Date: 2026-10-11   Brief: Market scan of dance-learning apps, practice players, hands-free controllers, and mirror/pose tools, to find patterns to borrow, gaps, and implications for gesture vocabulary and loop/restart UX. Not a business analysis.

Labels used throughout:
- **[S]** sourced: I read it on the cited page or in its search snippet.
- **[I]** inferred: my own reasoning, not stated by a source.

Method limitations: Reddit could not be searched or fetched (it blocks this crawler, and a mirror returned 403). App-store reviews were thin for most dance apps, which are small and new. Several feature summaries come from marketing pages or listicles. One listicle (fypdance.com) is written by a competitor (FYP Dance). I did not install or test any app.

---

## Answer

The "practice player" core is a commodity: A-B loop, speed from 0.25x to 2x without pitch change, mirror, markers or cue points, and a count-in. Over a dozen free or cheap tools already ship it ([S], table below). The gap is **control at a distance**. I found no dance tool, commercial or open-source, that uses webcam hand gestures to control playback ([S]: searches came back empty; [I]: absence of evidence, not proof). The only hands-free options dancers have today are an Apple Watch remote (DanceTribe), a musician foot pedal (Vidami, AirTurn), or general-purpose watch double-tap ([S]). Of these, only DanceTribe's watch remote can set loops and markers. Pose-scoring tools (Just Dance, SPARKY, DanceBetter, open-source DanceCoach) are a separate category with known accuracy complaints ([S]). They are relevant to the later "AI choreo agent" phase, not to the MVP. The richest design precedent for the gesture vocabulary comes from foot-pedal looper UX in musician tools: tap vs hold, one button that sets loop in, then out, then clears, and hold-to-restart ([S]: Vidami/Transcribe!).

---

## Comparison table

| Tool | Category | Loop | Speed | Mirror | Markers / restart point | Count-in / counts | Self camera | Hands-free control | Platform | Price (brief) |
|---|---|---|---|---|---|---|---|---|---|---|
| STEEZY | Class library | Yes, sub-segments | Yes | Yes | Segments | — | Split-screen | TV cast only | iOS/Android/web/TV | Subscription |
| Dance.io | Import-and-drill | A-B | 0.3x+ | Yes | — | Auto 8-count overlay, audio counts | Overlay, side-by-side | None | iOS | Free + IAP ($49.99 lifetime) |
| FYP Dance | Import-and-drill | Yes | 0.25x+ | Yes | — | — | Side-by-side + AI match score | None | iOS | Subscription |
| Mirrored Perfect | Import-and-drill | Yes | 0.25–1x | Yes | — | — | Record-in-sync takes | None | iOS/Android | ? |
| FuriCopi | Import-and-drill | Yes | 0.25–2x | Yes | — | — | Pro: record beside reference | None | iOS | Free + Pro |
| LoopStep (OSS) | Web player | A-B with ±0.1s nudge | 7 presets, 0.25–2x | Yes | "R" = play from start | 3s/5s countdown | — | Keyboard only | Web | Free |
| K-Crush Dance Mirror | Web YouTube tool | "Loop from now" | 0.25–2x | Default on | — | — | Side-by-side + ghost overlay | None | Web | Free |
| LoopIt (extension) | Browser A-B looper | A-B, N repeats, saved sections | 0.25–2x | Not stated | Prev/next section | — | — | Keyboard | Firefox | Free |
| DanceTribe (AlphaTheta) | Audio/video practice | Auto + manual, 2-tap | 0.1% steps | — | 4 markers | Tempo-synced countdown before recording | Instant Rec | **Apple Watch remote** (markers, loops, record) | iPhone | Free |
| BeatLoop | Audio practice | Unlimited | Pitch-preserved | — | 3 markers (free) | — | Record synced to loop | None | iOS/Android/web | Free / €29.99/yr |
| Show Me the Counts | Audio practice | Section loop | 50–150% | — | Named, colored sections | — | — | None ("one-thumb") | iOS/Android | Free + Pro |
| The Dancer's Remote | Teacher/choreo | Seamless loop | ? | — | 5 cue points | — | — | Name suggests remote use; unverified | iOS | ? |
| Anytune | Musician practice | Marks + loops, Step-it-Up trainer | Down to 0.05x | — | Marks | — | — | **Bluetooth/MIDI/foot pedal** (IAP) | iOS/macOS | Free + IAP |
| Transcribe! | Musician practice | Unlimited saved loops | Yes | — | Measure markers | — | — | **Foot pedal via key mapping** | Desktop | Paid |
| Moises | Musician practice | AI-detected song parts | Pitch-preserved | — | Song sections | Count-in (up to 16, Premium) | — | None found | iOS/Android/web | Freemium |
| Music Looper | Musician practice | A-B | Pitch-preserved | — | — | — | — | **BT foot pedal; Siri to start** | iOS | ? |
| Vidami pedal | Hardware for YouTube | Tap in / tap out / tap clear | 4 presets | — | Hold rewind = to start | — | — | **Foot pedal** (5 switches, tap/hold) | Chrome/Safari ext. | Hardware purchase |
| Apple Watch double tap | OS gesture | — | — | — | — | — | — | Pinch-twice = play/pause or skip | watchOS (S9+) | Hardware |
| DelayCam | Delayed mirror | — | — | — | — | — | 5–15s delayed replay | Set-and-forget | iOS/Android | Free |
| Just Dance | Pose game | — | — | Mirrored dancer | — | — | Camera scoring | Camera as controller | Consoles/phone | Paid game |
| SPARKY | K-pop AI coach | Repeat | Slow | Yes | — | — | Real-time AI feedback | None | iOS | Free + ads/IAP |
| DanceBetter / AI Sports Trainer / Dalea | Upload-and-score | — | — | — | — | — | Per-body-part feedback | None | Web/app | Varies |
| DanceCoach (OSS) | Real-time pose compare | Roadmap | Roadmap | — | — | — | Joint-angle color skeleton | None | Web (React + MediaPipe) | Free |
| MediaPipe gesture media controllers (OSS) | Hobby projects | — | — | — | Swipe = seek | — | — | **Webcam hand gestures** | Python/desktop | Free |

"—" means not mentioned in the sources, not confirmed absent. Every cell is [S] from the per-tool notes below unless marked.

---

## Evidence: per-tool notes

### A. Dance-specific practice players (import-and-drill)

**LoopStep** (open source, web): https://github.com/ytmknd/LoopStep
- [S] Loop start/stop set from the playhead, typed times, or ±0.1s nudges. Speed presets 0.25–2x. Mirror. Optional 3s or 5s count-in. "Play from start" applies the count-in. Per-video loop/speed/mirror saved in localStorage. Videos stay local.
- [S] Keyboard map: Space play/pause, R play from beginning, A set loop start, B set loop stop, L toggle loop, M mirror, arrows seek 0.5s, Shift+arrows 0.1s, Up/Down speed.
- [S] No hands-free control. [I] This is the closest existing analogue to our MVP minus gestures. Its key map is a ready-made "command set" to translate into gestures.
- Borrow [I]: A/B set-from-playhead, count-in tied to restart, per-song saved state, ±nudge for fine adjustment.

**Dance.io**: https://apps.apple.com/us/app/dance-io-mirror-loop-slow/id6748628387
- [S] A-B loop, speed down to 0.3x, plus a reset-to-original-speed button (v1.3.5). Mirror. "Visual and audio beat counting" with improved automatic eight-count detection (v1.3.7). Camera overlay (Pro). Side-by-side with your recording. Move-by-move notes. Only 2 ratings. Free + IAP ($5.99/mo, $49.99 lifetime).
- Borrow [I]: auto 8-count overlay, and a one-action "back to 1x" reset.

**FYP Dance, Mirrored Perfect, FuriCopi, SlowDance**: https://fypdance.com/blog/best-apps-to-practice-tiktok-dances/ (competitor-authored), https://apps.apple.com/gb/app/furicopi-mirror-video-player/id6802569681, https://apps.apple.com/us/app/slowdance-master-every-move/id6743317064
- [S] All offer import, mirror, slow (FYP 0.25x, SlowDance 0.1x), and loop. FYP adds a 0–100 "AI Match Score" per section. Mirrored Perfect adds "record-in-sync" with auto-labeled takes and a footwork mode. FuriCopi Pro records beside the reference.
- [S] The listicle notes none has hands-free, remote, or voice control.
- Lacks [I]: all are phone-first, so the phone has to be both the display and the controller, a few feet from a dancer who wants to be several metres back.

**K-Crush Dance Mirror** (web): https://k-crush.com/dance-mirror/
- [S] Paste a YouTube URL, mirrored by default. "Loop from now" or start+duration. 8 speeds, 0.25–2x. Webcam side-by-side and a **ghost overlay** (your semi-transparent image over the video, opacity slider). Records only the webcam locally. Free, no account.
- Borrow [I]: "loop from now" is the gesture-friendly loop model: one action, no precise targeting. The ghost overlay is a cheap mirror-comparison mode for later.

**Chuttamalle tutorial tool, YTLooper**: https://chuttamalle.com/chuttamalle-dance-tutorial, https://ytlooper.im/mirror-youtube-video-for-dance-practice/
- [S] (search snippets only; the YTLooper page failed to fetch) Browser tools for mirror, slow, and A-B loop. Chuttamalle keeps uploads local.

**LoopIt — A-B Video Looper** (browser extension): https://addons.mozilla.org/en-US/firefox/addon/loopit/
- [S] A-B loops with continuous or N repeats. Saved sections with Previous/Next. 0.25–2x. Works on YouTube, Shorts, Vimeo, and most HTML5 players. Warns that DRM and custom players may fail. Local storage.
- Borrow [I]: "N repeats then continue", and prev/next saved sections. Both map cleanly to discrete gestures.

### B. Dance class platforms

**STEEZY**: https://apps.apple.com/us/app/-/id1296001664, reviews via https://justuseapp.com/en/app/1296001664/steezy-learn-how-to-dance/reviews, critique at https://ixd.prattsi.org/2024/02/design-critique-steezy-iphone-app/
- [S] Multiple camera angles, tempo change, loop any move or section, mirror, split-screen camera beside the instructor, cast to TV, 1000+ classes. Classes are broken into segments and sub-segments.
- [S] Praise: loop, mirror ("favorite feature"), speed, and sub-segments to "recap any part".
- [S] Complaints: when casting, the view is reversed relative to preference, audio/video desync, and no autoplay. Seeking back "would just load or start lagging". Choppy streaming. Device restrictions ("I can't jump up to practice there"). Offline downloads crash.
- [S] Pratt design critique of the loop trimmer: handles don't look draggable, and changes to the loop end aren't visible "until the sample video ends at the new time".
- Lacks [I]: control still lives on the device. Casting to a big screen, which dancers want for distance, made sync and control worse.
- Lessons [I]: (1) loop edits must give **immediate visible feedback**, which supports our "enlarged visual feedback" priority. (2) Seeking must be instant, so prefer local/buffered media over streaming seeks. (3) Big-screen viewing at a distance is a real use pattern.

**SPARKY** (K-pop AI coach): https://apps.apple.com/app/1671073985, https://www.koreatechdesk.com/korean-startup-devunlimits-sparky-a-global-dance-revolution-platform-powered-by-ai-and-k-pop/
- [S] Real-time AI motion-tracking feedback, slow and repeat, own routine library only, ads for free users. No independent reviews of scoring accuracy found.

### C. Audio-first dancer tools (markers, cues, remotes)

**DanceTribe** (AlphaTheta/Pioneer DJ): https://alphatheta.com/en/landing/dancetribe-free-app-for-dancers/, https://apps.apple.com/us/app/dancetribe-for-all-dancers/id1640406639
- [S] Tempo in 0.1% steps. Up to 4 markers to start playback from. Auto and manual loops, with a "2 taps" loop in Basic mode. Waveform and skip in Advanced mode. Instant Rec records while the music plays, with a **countdown timed to the song's tempo**. Dance Editor for cutting and mixing tracks. iPhone only. Free.
- [S] **Apple Watch "DanceTribe Remote"** sets markers, creates loops, and records from the wrist, within about 10 m of Bluetooth range.
- [I] This is the closest prior art for our concept: hands-free marker, loop, and record control built specifically for dancers. It needs an Apple Watch and an iPhone, and wrist taps mid-movement still interrupt the dance. Our differentiator is no wearable and a laptop or big-screen display.
- Borrow [I]: a small fixed number of markers (4), a 2-action loop, and a tempo-synced count-in.

**BeatLoop**: https://beatloop.eu/
- [S] Loops "a chorus, transition, or 8-count". Adjust loop points on the fly. Pitch-preserved slowdown. Record practice synced to the looping audio. Sources include device uploads and YouTube streaming. Free tier: 3 markers and 2 segments per session. €29.99/yr. No hands-free control.

**Show Me the Counts**: https://showmethecounts.com/
- [S] Mark, name, and color-code sections and jump between them. Loop. 50–150% speed. Stem separation (Pro). "One-thumb controls". No remote.
- Borrow [I]: named, colored sections, which work as large visual targets readable at a distance.

**The Dancer's Remote**: https://chemixtryla.com/the-dancers-remote-app/ (403 on fetch; search snippet only)
- [S] Seamless loop points and "5 different areas of the song that you can jump to instantly". Aimed at teachers and choreographers. The listing is around 6 years old. [I] Five cue points fits a one-hand finger-count gesture (1–5) exactly.

**GR8 Count**: https://apps.appfollow.io/ios/gr8-count/960560354?country=us
- [S] Speaks 8-counts at different speeds for cheer, dance, and color guard. [I] Spoken counts are an established dancer cue.

### D. Musician practice players (A-B loop, slow-down)

**Anytune**: https://apps.apple.com/us/app/-/id415365180, https://www.airturn.com/apps/anytune
- [S] Pitch-preserved tempo down to 0.05x. Marks and loops. "Autoloop between marks". A "Step-it-Up Loop Interval Trainer" (Pro). A Remote Control IAP to "control Anytune via MIDI or from a Bluetooth keyboard or foot pedals such as the AirTurn BT-105."
- [I] Step-it-Up probably raises tempo each loop pass. The listing does not explain how it works. That would be a strong "change speed of current selection" pattern: start at 70% and climb toward 100%.

**Transcribe!** (Seventh String) with the Vidami pedal: https://seventhstring.com/xscribe/kbpedal/vidami.html
- [S] Pedals act as a keyboard. Each switch sends one command on a **tap** and another on a **hold**, so 5 switches give 10 commands. Speed tap toggles normal and a preset slow speed (e.g. 70%), and Speed hold = PlayStop. Loop tap = next saved loop, Loop hold = previous. Back/Forward taps step through measure markers, or 3s jumps, with Back hold = 10s.
- Borrow [I]: **speed as a toggle between 1x and a preset practice speed**, not a continuous dial. **Tap vs hold** doubles the vocabulary.

**Vidami pedal** (YouTube looper hardware): https://www.guitarworld.com/reviews/vidami-video-looper-pedal-review, https://the-gadgeteer.com/?p=302247, https://songnotes.net/lessons/469
- [S] Five switches: loop, speed, forward, back, and play/pause. **Loop: tap once to set start, tap again to set end, tap again to clear.** Four selectable speeds. Hold forward to scrub. **Hold rewind to go to the start of the video.** Hold play to clear all functions. Works through a Chrome/Safari extension on YouTube and 50+ learning sites.
- [S] Cons: no iPad/iPhone support. One reviewer accidentally pressed adjacent buttons.
- [I] This is the most transferable UX for our MVP. A single "loop" gesture cycles through set-in, set-out, and clear, so the dancer never has to aim at a timeline. Accidental adjacent presses are the pedal version of our gesture-confusion risk.

**Moises**: https://apps.apple.com/app/id1515796612, https://violetrecording.com/moises-review/
- [S] AI stem separation, BPM detection, pitch-preserved speed, **AI-detected song parts you can loop**, a metronome click, and a count-in (up to 16 with Premium). The App Store rating is around 4.7 from about 26K ratings. The main recurring complaint is subscription limits.
- Borrow [I]: auto-detected sections and beat grid, so "restart to a point" can snap to musically meaningful points (downbeat, 8-count, section).

**Music Looper**: https://apps.apple.com/us/app/music-looper-for-musicians/id1189818821
- [S] A-B loop, slow without pitch change, **Bluetooth foot pedal**, and Siri/Shortcuts to *start* a session (not mid-practice control).

**Music Speed Changer**: https://apps.apple.com/us/app/music-speed-changer/id1595494271
- [S] Real-time pitch-preserved speed, A-B, and BPM detect. Audio only.

### E. Hands-free and gesture media control

**Webcam hand-gesture media controllers** (open source, hobby grade):
- https://github.com/DhruvKhemka1/Gesture_Controlled_Media_Playback — [S] fist = play/pause, open-hand swipe left/right = seek. Sends keystrokes via PyAutoGUI. The fist is **edge-triggered**: it must appear 3 frames in a row, then the hand must be open or absent for 8 frames before re-arming. Swipe = wrist moves more than 15% of frame width, followed by a cooldown. Notes: "MediaPipe loses track of a fist a lot more than an open hand." "Swiping back to the middle after a swipe can count as a swipe the other way." Pinned to the legacy `mp.solutions` API.
- https://github.com/swjkrf24/camera, https://github.com/Rudragupta23/Gesture-Control-System, https://github.com/jkcog/Media-Player-Gesture-Controller — [S] (search snippets) One uses MediaPipe's official recognizer: fist = pause, open palm = resume, thumb up/down = ±20s. Another uses majority voting across frames plus a cooldown. A VLC one notes **reliability drops at distance**.
- [S] None is dance-specific. I found no dance practice tool with webcam gesture control.

**MediaPipe Gesture Recognizer** (official): https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer
- [S] Canned gestures: Closed_Fist, Open_Palm, Pointing_Up, Thumb_Down, Thumb_Up, Victory, ILoveYou, plus "None". Runs on Web/JS, Android, iOS, and Python. LIVE_STREAM mode. `num_hands` is configurable (default 1). About 17 ms per frame on Pixel 6 CPU. Custom gestures are trainable with Model Maker.
- [I] Finger counts (1–5) are not a canned class. They need landmark-based finger-extension logic or a custom classifier.

**Apple Watch double tap**: https://support.apple.com/guide/watch/apdabb7b275c, https://support.apple.com/HT213942
- [S] Index finger and thumb pinched twice = Play/Pause or Skip while Now Playing is visible. Series 9+/Ultra 2+/SE 3. Unavailable when the wrist is down or the display is inactive. [I] Wrist-down is the normal state while dancing, which limits its use mid-routine.

**Foot pedals** (AirTurn): https://www.airturn.com/collections/all/products/airturn-bt500s-6-analog-controller
- [S] Bluetooth pedals mappable to hotkeys/MIDI, with switch types Momentary, Latching, Pulse, and Command. [I] Natural for seated musicians. Awkward for dancers who move around the floor, and the pedal is a trip hazard and a fixed location.

**Voice control**
- [S] No dance or practice app found that accepts spoken "pause/repeat/slower" commands mid-practice. Searches for this returned only Siri-to-start (Music Looper) and apps that *speak* cues (Dance Buddy, GR8 Count). [I] Loud music competes with the microphone, and dancers may be counting aloud, so voice is a weak channel. It could still work as a fallback when the music is paused.

### F. Mirror, delayed-replay, and pose-comparison tools

**DelayCam**: https://www.delaycam.com/dance-practice-mirror-app
- [S] Records and replays your own dancing with a 5–15s delay. Stream to a TV for a class. Free. [I] "Delayed mirror" is a zero-interaction review mode that needs no controls at all.

**Just Dance** (camera mode): https://www.thexboxhub.com/just-dance-2026-edition-review/, https://www.tomsguide.com/reviews/just-dance-2023
- [S] Reviewers across many years say scoring feels inaccurate ("doesn't feel like it's in any way accurate"). Camera mode needs "bright, even lighting". "Zero indication... about how accurate your movements are". Rough arm-waving still scores.
- [I] Lighting dependence applies to our hand tracking too. Accuracy theatre erodes trust.

**DanceBetter, AI Sports Trainer, Dalea, DeepDance**: https://dancebetter.org/faq, https://ai-sportstrainer.com/en/dance, https://dalea.ai/, https://devpost.com/software/deepdance
- [S] Upload a video and get feedback per body part (head, arms, posture, footwork) against a reference. Some claim rhythm and timing feedback. Accuracy is undocumented.

**DanceCoach** (open source): https://github.com/livelabs-ventures/dancecoach
- [S] React 19 + Vite + MediaPipe BlazePose Lite (WASM/GPU). Compares 9 joint angles at about 60fps between the reference and the camera. Colors the skeleton green/yellow/red by angle error. The reference video is a bundled file (H.264, since VP9 fails on iOS Safari). Camera needs HTTPS. Slow-mo looping and beat-synced timing are roadmap items only.
- [I] A useful reference stack for a browser webcam app, and a reminder that the iOS Safari codec and HTTPS gotchas are real.

### G. YouTube as a source (for the later sync phase)
- [S] IFrame API (https://developers.google.com/youtube/iframe_api_reference): `setPlaybackRate` is "only a suggestion". Available rates vary per video, typically 0.25/0.5/1/1.5/2. Unsupported values round toward 1. `seekTo` goes to the nearest keyframe before the target unless that part is buffered. Native looping (`setLoop`) applies only to playlists.
- [S] LoopIt warns that DRM and custom players can break loopers.
- [I] YouTube-backed loops will be coarser (keyframe seeks) and speed will be limited to preset steps. Pitch-preserved arbitrary speeds like 0.85x are easier with local audio/video.

---

## Reasoning

**Patterns that recur across successful tools** [I, built on S facts above]
1. **Set-from-playhead looping** (LoopStep A/B, K-Crush "loop from now", Vidami tap-tap). Nobody asks users to drag handles mid-practice. Dragging is exactly where STEEZY's trimmer UX failed.
2. **Few discrete speeds plus a reset to 1x** (Transcribe! toggle to 70%, Vidami 4 speeds, Dance.io reset button, LoopStep presets). Continuous sliders are for setup, not mid-practice.
3. **A small fixed set of jump targets** (DanceTribe 4 markers, Dancer's Remote 5 cues, BeatLoop 3 free markers).
4. **Count-in on restart** (LoopStep 3s/5s, DanceTribe tempo-synced countdown, Moises count-in). Dancers need to get back into position after triggering a restart.
5. **Music-aware structure** (Dance.io auto 8-count, Moises detected song parts, Show Me the Counts named sections).
6. **Tap vs hold doubles the vocabulary** (Vidami/Transcribe!: 5 switches, 10 commands).

**Gaps nobody fills** [I]
- Device-free, wearable-free control from across the room. The only dancer-specific hands-free tool is DanceTribe's Apple Watch remote (iPhone + Watch only).
- A laptop or large-screen display designed to be read from 2–4 m: big loop-state, count, and speed indicators. Every app reviewed is phone-first or a standard desktop player.
- Loop-state feedback without touching or looking closely. STEEZY's critique shows that even touch UIs fail at this.

**Pitfalls seen in others** [I from S]
- Accidental activation: Vidami's adjacent-button presses, swipe-return false positives in the gesture projects, Just Dance scoring arm-waving. Dance moves *are* hand gestures, so false triggers are our core risk.
- Lighting and distance sensitivity (Just Dance, the VLC gesture project).
- Fist tracking is flaky in MediaPipe (DhruvKhemka1 README). This matters because the user's draft vocabulary leans on a closed fist.
- Streaming seeks lag (STEEZY reviews) and YouTube keyframe seeks are imprecise.
- Scoring without explanation erodes trust (Just Dance). That applies to the later AI-agent phase.

**Disconfirming checks attempted**
- I searched specifically for gesture-controlled dance practice, hands-free dance practice apps, and voice-command practice apps, and found none. It is still possible that small app-store apps or TikTok-only tools exist that search engines didn't surface, and Reddit was unreachable. Treat the claim that "no one does gesture control for dance" as likely, not proven.

---

## Implications for our tool

### Gesture vocabulary [I unless noted]
- **Use an "arm" (wake) gesture before commands.** Dance choreography constantly produces fists, open palms, and finger shapes. The highest-value borrowing from the hobby projects is edge-triggering, N-frame confirmation, and cooldown ([S] DhruvKhemka1). On top of that, require an unusual, deliberate *held* pose to enter command mode, e.g. a hand held still near the face for about 0.5–1s, or two hands. Equivalent: a "clutch" pose that must be held while commanding.
- **Prefer MediaPipe canned gestures where possible** ([S] Closed_Fist, Open_Palm, Pointing_Up, Thumb_Up/Down, Victory, ILoveYou) for reliability. Use finger-count logic (1–5) only for "jump to marker N", where the count is the payload. Mind the [S] note that fists track worse than open hands: make play/pause an open palm held still rather than a fist, or require the fist to be held.
- **Tap vs hold** ([S] Vidami/Transcribe!): a brief gesture gives action A and a held gesture gives action B. For example, the restart gesture *tap* goes to the current loop start or last marker, and *hold* goes to the song start.
- **One loop gesture that cycles states** ([S] Vidami): 1st = set IN at the playhead, 2nd = set OUT and start looping, 3rd = clear. This avoids needing separate in/out gestures and any timeline aiming.
- **Speed as discrete steps or a toggle** ([S] Transcribe! toggle to 70%, Vidami 4 presets): e.g. thumb up/down steps through 50/70/85/100%, and one gesture resets to 100%. Optional later: Anytune-style "step it up" auto-ramp per loop pass ([S] feature exists, mechanics [I]).
- **Expect distance and lighting limits** ([S] VLC project, Just Dance). Design for about 2–3 m and tell the user how to set up lighting and framing.

### Restart and loop UX [I]
- **Restart = jump + count-in.** After a restart gesture, pause, show a big 3-2-1 (or a tempo-synced 5-6-7-8, [S] DanceTribe/LoopStep precedent), then play. That gives the dancer time to drop the hand and get into position.
- **Pre-roll**: restart a beat or a few seconds *before* the loop IN point, so the dancer enters the move in tempo. This is common in DAWs. I did not see it explicitly in the dance tools, which makes it a possible differentiator.
- **Snap points to the beat grid** when available ([S] Dance.io auto 8-count, Moises sections). A hand gesture fires about 100–300 ms late relative to intent ([I], not measured), so snapping IN/OUT to the nearest beat or 8-count hides the latency. Provide a nudge (±0.1s or ±1 beat), as LoopStep does ([S]).
- **Enlarged, at-a-distance feedback** (user priority 3): full-width loop bar with IN/OUT flags, a big current count (1–8), a speed badge, and a flash/toast confirming each recognized command. Show "armed / listening" state continuously. STEEZY's critique is direct evidence that invisible loop edits confuse users ([S]).
- **Markers as numbered big tiles** ([S] DanceTribe 4, Dancer's Remote 5): finger count N jumps to tile N, and the tiles are readable across a room.
- **Persist per-song state** ([S] LoopStep localStorage): loops, markers, and speed survive a reload.
- **Keyboard parity** ([S] LoopStep key map): every gesture should also have a key, for setup, debugging, and accessibility.

### Scope and positioning [I]
- Don't compete on library content (STEEZY) or on scoring (Just Dance, SPARKY). Those are crowded and accuracy-fraught.
- The MVP's distinct value is "a practice player you control from the floor". The core player features can copy LoopStep's set almost one-for-one, and the open-source LoopStep and DanceCoach are useful references for a browser + MediaPipe stack.
- Mirror and a ghost overlay of the webcam (K-Crush) are cheap later additions, because the webcam is already on for gestures.
- For YouTube sync, expect preset-only speeds and keyframe-coarse seeks ([S] IFrame API). Local files give better loop precision.
- For the later "AI choreo agent" phase: the upload-and-score tools exist but report undocumented accuracy. Explainable, per-body-part feedback (DanceBetter categories, DanceCoach colored joints) is the bar to meet.

---

## Uncertainty and open questions
- **Reddit and dancer voice of customer were inaccessible.** The complaints about existing tools are thin (mostly STEEZY reviews and one design critique). The parallel dancer-workflow scout may fill this in.
- **Whether a gesture-controlled dance tool exists** that searches missed (small apps, TikTok demos, hackathon projects). Likely not mainstream, but unproven.
- Exact behaviour of Anytune's Step-it-Up trainer and The Dancer's Remote's "remote" are unverified.
- Gesture latency and false-trigger rates at 2–3 m in a mirror studio were not measured. That needs a prototype test.
- For the planner/user: is the primary display a laptop (about 13–16 in at 2–3 m) or a TV via cast/HDMI? This changes how big the "enlarged feedback" must be.
- For the planner/user: should command mode require an arm/wake gesture (safer, one extra step) or be always listening (faster, more false triggers)? This is the core trade-off the prior art points to.
