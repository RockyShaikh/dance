# Dance

A hands-free tool for learning choreography: dancers control the music they practice to (play/pause, restart to a point, loop in/out points, speed) with hand gestures seen by a laptop webcam, instead of fumbling with a phone or laptop mid-practice. Personal project, not a startup; existing tools are studied only to learn from.

## Stack
- Local web app in Chrome; TypeScript + Vite; MediaPipe Hand Landmarker; canvas overlay; Web Audio / HTMLMediaElement for playback. See `docs/spec.md`.

## Commands
- Install: `npm install`
- Dev: `npm run dev` → http://localhost:5173/ (Chrome; allow the camera)
- Test: `npm test` (Vitest)
- Build: `npm run build` (tsc --noEmit + vite build)

## Conventions
- Roadmap checkpoints are done strictly in order; do not build past the active one.
- Branches per checkpoint; merge each with `--no-ff` and tag `rN-done`, so any checkpoint can be reverted on its own.
- Tunable thresholds live in `src/config.ts`. Pure logic modules (e.g. `src/pseudoChord.ts`, `src/palmFacing.ts`) get Vitest tests with landmark fixtures.
- Features we can't build yet go in `.agents/wishlist.md`; open "is this a problem?" questions and known-but-deferred issues go in its **Unresolved threads** section.

## Decisions
<!-- Append when the user decides something. Newest last. -->
- 2026-10-11 — Input modality to start: computer-vision hand gestures (closed fist, open hand, finger counts, "levels", pseudo-chords with certain fingers down). Other modalities later. (why: keep it simple first)
- 2026-10-11 — First roadmap is exactly four phases, in order: (1) bring-up: webcam + hand detection with landmark/skeleton overlay, pseudo-chord detection; (2) distinguish a set of desired gestures; (3) load an audio track, show webcam + playback together, play/pause/start music; (4) in/out loop points and restart. Nothing beyond that until a new roadmap. (why: user's stated scope)
- 2026-10-11 — Feature priority from user's list: restart-to-point gesture > play/pause gesture > in/out loop points with enlarged on-laptop visual feedback > speed of current selection. Later/small: YouTube sync, video → teachable choreo AI agent.

- 2026-10-11 — Hand rotation as a "knob" is a wanted control primitive (user feels the gesture list is getting too long). Two uses: (a) **speed**: rotate to change playback speed live, DJ-deck style; you judge by ear, an on-screen number is optional/low priority; (b) **IN/OUT placement**: *superseded by the loop-setting model below: the knob only nudges the loop start.*
- 2026-10-11 — Roadmap adds **R5 = speed by rotation knob**, after R4 (loops + restart). R1–R4 unchanged otherwise.
- 2026-10-11 — Knob input, user's words: rotation is "like a windshield wiper, like a steering wheel" (tilt in the camera plane). Clutch: start with **pinch-to-grab**. User's ideal is a **claw grab** (splayed hand curls in as if grabbing a ball, then rotate). Worry: pure wrist rotation runs out of range and needs re-grabbing. Alternatives to try: **two-hand**, with the left hand held up as the modifier and the right hand steering like a DJ knob; and **"Doctor Strange portal"**, where circling the hand gives unlimited rotation like a jog wheel (user thinks it's fun and easy).
- 2026-10-11 — Knob: the spring-loaded joystick (rate control) is the favourite, but experiment with all variants (absolute wiper, joystick, Doctor Strange circle; pinch / claw / two-hand clutches).
- 2026-10-11 — *(Zone part superseded by the box + calibration entries below.)* False-trigger mitigation: hold ≥ 0.6 s **and** main command gestures only count **above the head** ("you really don't hold a crazy pose up there"). Choreography collisions beyond that = Unresolved thread. Future idea: wearable input.
- 2026-10-11 — Range/distance: don't worry now. Get gestures working first, then debug range. Future: phone camera plugin (back camera, 1x/2x zoom, phone body tracking).
- 2026-10-11 — Target user = the user, practising **solo**. Setup assumption: laptop directly in front, facing the dancer (laptop sits in front of a mirror).
- 2026-10-11 — Personal project, explicitly **not a startup**. Keep docs and scope lean; no market framing.
- 2026-10-11 — Restart = go to loop start if set, else song start. Audio = local files only (no streaming integration for now).
- 2026-10-11 — Loop-setting model: let the music play and mark points with a gesture where the playhead is. The knob is a **fine-tune**: you always overplay the start, so you nudge the loop start back a couple of counts. Loop-end precision doesn't matter ("trailing" is fine). The knob is not used to find points from scratch.
- 2026-10-11 — Repo is public on GitHub; commit project + memory files.
- 2026-10-11 — **Command zone for now = an on-screen bounding box** (default: right half of the mirrored view, adjustable; whole-frame option). A gesture counts only with the hand inside the box and held ≥ 0.6 s. No pose model or above-head detection in R2. Above-head zone is deferred until testing with real choreography (wish list). Supersedes the above-head line above for current scope.
- 2026-10-11 — Command-zone direction: a **per-session calibration sequence**. Press "calibrate", raise your hand, and only detect above that height; manual each session, no head tracking; don't worry about the laptop or camera moving. The zone is clearly visible in the camera overlay and editable by mouse click-and-drag. **For now (R2): a simple rectangle bounding box.** Calibration is **R6+** (user: "let's still not worry about it in R2. It's going to be R6+"); on the wish list.
- 2026-10-11 — Roadmap R1–R5 approved by the user, along with the spec's proposed stack. R1 active.
- 2026-10-11 — R1 accepted ("looks good to move onto the next step"). Distance stays a non-worry; a later priority is **auto-zooming onto the hand** (wish list).
- 2026-10-11 — The user started R3 before testing R2 by hand ("I think r2 was pretty trivial"). R3 builds on R2. **Each of R2 and R3 must be individually rollback-able:** separate branches (`r2-gestures`, then the R3 branch based on it); at integration, merge each as its own `--no-ff` merge commit (R2 first, then R3) and tag it, so either can be reverted alone. Tags: `r1-done`.
- 2026-10-12 — R2 accepted ("r2 is good"); merged `--no-ff`, tag `r2-done`. Pinch is rough and the user doesn't see using it often; claw is decent. Open R2 questions left at defaults (one-hand rule = block only when two hands show command shapes in the box; dwell slider min 0.6 s).
- 2026-10-12 — R3 accepted ("it seems to be working"); merged `--no-ff`, tag `r3-done`.
- 2026-10-12 — R4 plan confirmed ("go"). Split into **R4a** (loops, restart, late-mark fix, visuals, keyboard nudge) and **R4b** (knob nudge, all variants), with separate branches, merges and tags. **Default knob grab = claw**, since pinch is rough; pinch and two-hand stay as options.
- 2026-10-12 — **No duration-dependent gestures** (user: "I don't like the tap vs hold feature... there should be no button that is variable based off how long you are holding it"). Every command fires once when its ring fills. Index = restart to IN if set, else the top; the Home key goes to the top.
- 2026-10-12 — **Scrubbing is very important; two hands** (user picked "Scrub, then mark" and "audible scrub"). **Right hand:** claw grab + tilt scrubs the playhead (music follows, DJ-style; short snippets while paused), open palm = play/pause, index = restart to IN, V = clear. **Left hand:** V = set IN at the playhead, index = set OUT and loop. Each hand has its own mouse-editable box (left half / right half by default). Knob variants stay switchable. The loop wrap had no audible delay problems (user).
- 2026-10-12 — Knob grab: **two-hand steering wheel is the default** (left hand held up, right hand steers): "more consistent". Claw slips sometimes ("always going to be a problem"), but it felt snappier; revisit later. Problem to fix: steering lags after you stop rotating, especially while audio plays and skips.
- 2026-10-12 — **The left hand's shape picks the steering mode** (user): left **open palm** = steer the playhead while playing (it plays on from wherever you stop); left **fist** = pause and steer the playhead while paused (it stops exactly there). Switching palm ↔ fist mid-grab toggles play/pause without letting go. Left **peace sign** = steer loop START; left **index** = steer loop END ("good").
- 2026-10-12 — **R5 redefined: speed = literally speed the whole track up or down and let it play.** "Go to 2x speed and then un-2x speed" is a toggle, not a knob.
- 2026-10-12 — R4c feedback. **Loved:** left fist = pause, left V = immediately steer START, left index = immediately steer END ("so intuitive"). **Disliked:** the left hand starting or stopping playback. "When the left hand goes up, it simply anchors a different state. Nothing should happen to the audio... My left hand should not be able to play and pause the audio. My left hand closing into a fist can... pause it, and opening it back up [resumes]." Tilt runs out of wrist, so try the **circular one-handed wheel** (circling jog). **Biggest problem:** bringing the right hand into frame pauses the music (open palm = play/pause), so consider a fist-based play/pause on the right hand.
- 2026-10-12 — R5 "pretty good". Tweaks: **speeding up = Instagram-style hold**: 2× only while held, back on release. **Slowing down = fine 0.05 steps**, chosen by ear while it plays: the left hand picks "speed" (shaka, not thumbs up) and the right hand's wheel adjusts it. "More important than seeing the feedback is being able to listen to it." Built as R5b on top of R4d.
- 2026-10-12 — R4d built from the user's R4c feedback, using the main thread's recommended defaults (the user didn't answer; can be vetoed while testing): **right fist = play/pause** (an open right hand does nothing); music carries on when a hand leaves the frame; **circling is the default wheel motion**; the left hand never starts playback (palm = anchor only, fist = pause while closed).
- 2026-10-12 — R4d/R5b tested. **Speed wheel must be finer:** more travel between ticks and **0.025 steps** (amend R5b).
- 2026-10-12 — **R6 = top zone + zoom (no head tracking yet).** One command zone across the **top quarter** of the frame for both hands (no left/right split). **Zoom:** crop the camera image to the zone and run hand tracking on the crop, so far-away hands look bigger. **Handedness from the thumb,** assuming the palm always faces the camera; with only one hand up, assume it's the right hand. Head tracking only if this isn't enough.
- 2026-10-12 — Future thread: when scrubbing with no IN/OUT set, you must lower the right hand to set a mark and then steer it. "A bit more to be desired", but the user understands the complexity and wants a **stress test first**.
- 2026-10-13 — Distance is the next big problem: the hand isn't detected at a decent distance. Agreed cause: MediaPipe's palm detector shrinks the whole frame, so a far-away hand ends up with too few pixels; the landmark stage is fine. The user will baseline the current version's range. **Capture raised to 1080p** (R6 amendment 8760ec6). **Explore auto-tracking:** a scout first, then a range-only spike, with body-first (pose → crop at the wrists → hand model) as the lead option. Face-zoom and arm/pose gestures are alternatives.
- 2026-10-13 — **Hypothesis switch: the iPhone back camera first** (user: "over a webcam, having an iPhone back camera is actually much more feasible... If there's an iPhone app... iPhone probably has a much better engine to do this natively"). A 4K webcam is an acceptable prototyping dependency. Building our own pipeline (e.g. body-first) is welcome. A future **full-body pose version** goes to beta testing for comparison.
- 2026-10-13 — Fist is inconsistent: the label doesn't hold for the 0.6 s ring, and fist joint detection is poor. The user's idea: define a fist as **the four fingers down, ignoring the thumb**, and debounce it. Also considered: going back to an open palm on the other hand.
- 2026-10-13 — **R7 = the iPhone as the camera via Continuity Camera, built into the current app.** Use case: iPhone fixed on a tripod, laptop free to fiddle with. A USB cable is fine if it lowers latency. Start at **1080p**, running CV on that image; 2K/4K stays a thread. Measure streaming latency. Future: the iPhone runs all the CV and the laptop only receives commands, kept as a companion option. Test the "direct on Mac" path first.

## Facts
<!-- Durable, verified facts agents need: env vars, external services, gotchas. -->
- MediaPipe's Left/Right label matches the user's own hand on the un-mirrored frame (`swapHandedness: false`; verified live 2026-10-11). Palm-facing depends on it.
- The user's machine: MacBook Pro M1 Max, 64 GB (Apple Silicon), macOS 26.6.2; built-in 1080p FaceTime HD camera. iPhone: **iPhone 16 Pro Max** (macOS lists it as a Continuity camera, verified with `system_profiler SPCameraDataType` 2026-10-13).
- Hand detection and labels work at ~1 m and at 3–5 m with the built-in MacBook webcam (user's live test, 2026-10-11).
- Git repo, default branch `main`, remote https://github.com/RockyShaikh/dance (public). Repo-local git identity: RockyShaikh <91840937+RockyShaikh@users.noreply.github.com> (no global git identity on this machine).

## Memory files
- `.agents/board.md` — task board. `.agents/handoff.md` — resume point.
- `.agents/research/` — scout reports. `.agents/learning.md` — user's learning log.
- `docs/spec.md` — product spec. `.agents/roadmap.md` — checkpoints (R1…). `.agents/wishlist.md` — Wish list + Unresolved threads.
