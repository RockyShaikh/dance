# Dance

A hands-free tool for learning choreography: dancers control the music they practice to (play/pause, restart to a point, loop in/out points, speed) with hand gestures seen by a laptop webcam, instead of fumbling with a phone or laptop mid-practice. Personal project, not a startup; existing tools are studied only to learn from.

## Stack
- Proposed (pending roadmap approval): local web app in Chrome; TypeScript + Vite; MediaPipe Hand Landmarker; canvas overlay; Web Audio / HTMLMediaElement for playback. See `docs/spec.md`.

## Commands
- Install: TBD
- Dev: TBD
- Test: TBD
- Build: TBD

## Conventions
- Roadmap phases are done strictly in order; do not build past the current roadmap.
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
- 2026-10-11 — False-trigger mitigation: hold ≥ 0.6 s **and** main command gestures only count **above the head** ("you really don't hold a crazy pose up there"). Choreography collisions beyond that = Unresolved thread. Future idea: wearable input.
- 2026-10-11 — Range/distance: don't worry now. Get gestures working first, then debug range. Future: phone camera plugin (back camera, 1x/2x zoom, phone body tracking).
- 2026-10-11 — Target user = the user, practising **solo**. Setup assumption: laptop directly in front, facing the dancer (laptop sits in front of a mirror).
- 2026-10-11 — Personal project, explicitly **not a startup**. Keep docs and scope lean; no market framing.
- 2026-10-11 — Restart = go to loop start if set, else song start. Audio = local files only (no streaming integration for now).
- 2026-10-11 — Loop-setting model: let the music play and mark points with a gesture where the playhead is. The knob is a **fine-tune**: you always overplay the start, so you nudge the loop start back a couple of counts. Loop-end precision doesn't matter ("trailing" is fine). The knob is not used to find points from scratch.
- 2026-10-11 — Repo is public on GitHub; commit project + memory files.
- 2026-10-11 — **Command zone for now = an on-screen bounding box** (default: right half of the mirrored view, adjustable; whole-frame option). A gesture counts only with the hand inside the box and held ≥ 0.6 s. No pose model or above-head detection in R2. Above-head zone is deferred until testing with real choreography (wish list). Supersedes the above-head line above for current scope.

## Facts
<!-- Durable, verified facts agents need: env vars, external services, gotchas. -->
- Git repo, default branch `main`, remote https://github.com/RockyShaikh/dance (public). Repo-local git identity: RockyShaikh <91840937+RockyShaikh@users.noreply.github.com> (no global git identity on this machine).

## Memory files
- `.agents/board.md` — task board. `.agents/handoff.md` — resume point.
- `.agents/research/` — scout reports. `.agents/learning.md` — user's learning log.
- `docs/spec.md` — product spec. `.agents/roadmap.md` — checkpoints (R1…). `.agents/wishlist.md` — Wish list + Unresolved threads.
