# Dance — Roadmap

*Revised 2026-10-11 (v1; v1.1: R2 uses an on-screen command box instead of the above-head zone; v1.2: the box is mouse-editable, and calibration is wish-listed for R6+). Co-owned with the user: only the user approves changes. See [spec](../docs/spec.md) for gestures, knob, and stack, and [wish list](wishlist.md) for everything deferred.*

Checkpoints are done strictly in order. Exactly one is `active` at a time, and nothing is built past it. **Approved by the user 2026-10-11** ("okay lets start! let's get the r1 brought up"). R1 done 2026-10-11. R2 done 2026-10-12 (tag `r2-done`). R3 done 2026-10-12 (tag `r3-done`). R4 active 2026-10-12, split into R4a and R4b (user: "go").

| # | Checkpoint | Status |
|---|---|---|
| R1 | Bring-up: camera, hand skeleton, pseudo-chords | done |
| R2 | Recognize the gesture set (command box, dwell, tap/hold, clutch shapes) | done |
| R3 | Audio + webcam together; play/pause/restart by gesture | done |
| R4 | Loops marked as the music plays + knob nudge for the loop start; restart to loop start | **active** (R4a → R4b) |
| R5 | Speed by rotation knob | planned |

---

## R1 — Bring-up: camera, hand skeleton, pseudo-chords

**Goal:** see a hand and read its finger states.

**Scope in**
- A local web page that opens the webcam, mirrored.
- Hand detection with the skeleton (21 landmark dots plus connecting lines) drawn on each hand.
- A live pseudo-chord readout (`T0 I1 M1 R0 P0`), MediaPipe's shape label, palm-facing state, and fps.

**Scope out:** command box, commands, dwell rings, audio, knob, range tuning, anything in R2+.

**Done means**
- Opening the page and allowing the camera shows your mirrored video within a few seconds.
- The skeleton follows either hand smoothly (about 20+ fps).
- Curling and extending each finger flips its readout correctly.
- Open palm, index up and V show the right label.
- The distance you tested at is noted (informational, not pass/fail).

**Status:** done (2026-10-11; merged to main 6d0fdff)

**Result (user's live test):** frame rate good (a bit choppy at startup until a hand appears); finger readouts good, thumb decent; open palm / pointing up / victory labels right; Left/Right was flipped and palm-facing inverted. Fixed by `swapHandedness: false`. Detection still works at 3–5 m; tested at ~1 m and 3–5 m.

**Notes:** range is deliberately deferred: "gestures first, range later" (user). See Unresolved threads.

---

## R2 — Recognize the gesture set

**Goal:** turn shapes into deliberate commands: held ≥ 0.6 s with the hand inside a command box on screen.

**Scope in**
- A "gesture test bench" view (no music).
- **Command box:** a simple rectangle, clearly outlined on the camera view; a shape counts only while the hand's palm centre is inside it. Default: the right half of the mirrored view. **Edit it with the mouse:** click and drag inside to move it, drag an edge or corner to resize it. Presets: right half, left half, whole frame [spec §4.2]. User: "it just needs to find my hand in some bounding box."
- The three command shapes (open palm, index up, V) with **0.6 s minimum dwell** (ring), palm facing, cooldown, and one hand at a time. Optional stillness rule behind a toggle.
- **Tap vs hold** (fire on release vs an outer hold ring at ~1.5 s) [spec §4.4].
- **Clutch-shape detection:** pinch, claw, and the two-hand modifier, shown as "GRABBED / released" states. Nothing is controlled yet.
- A banner plus sound on fire, a log of fired events with timestamps, and sliders for dwell and pinch thresholds.

**Scope out:** the calibration sequence (wish list, R6+), above-head zone and any head/body tracking, audio, knob rotation and mapping, range tuning, fixing choreography collisions, anything in R3+.

**Done means**
- At the distance you test at, each shape fires on at least 9 of 10 deliberate attempts inside the box, as itself, and tap vs hold are told apart correctly.
- The same shapes made **outside** the box never fire.
- The box is clearly visible on the camera view, and you can **move and resize it by mouse click-and-drag**. The new area takes effect immediately, and so does choosing a preset (e.g. whole frame).
- Holding a shape a long time fires exactly once.
- Pinch, claw and two-hand grabs show GRABBED/released correctly, or failures are noted.
- Informational: dance for ~2 minutes with no commands intended and note the false-fire count in the log. This feeds the choreography-collision thread; it isn't a pass/fail gate.

**Status:** done (2026-10-12; merged to main with `--no-ff`, tag `r2-done`)

**Result (user's live test):** "r2 is good". Pinch is "a little rough", but the user doesn't expect to use pinch often. Claw is "decently good". Two-hand works.

**Notes:** clutch shapes live here because detecting them is the same problem as detecting command shapes. Rotation waits for R4, where it's first used. The planned zone direction is a per-session calibration ("raise your hand: only above here"). It's wish-listed for R6+ (user), not part of R2.

---

## R3 — Audio + webcam together; play/pause/restart by gesture

**Goal:** first useful version: dance to a track and control it hands-free.

**Scope in**
- Load a local audio file (picker or drag-and-drop). Local files only (decided).
- One screen: webcam + skeleton + command box, giant status word, timeline with playhead.
- **Open palm** = play/pause. **Index up** (tap or hold) = restart from the top, immediately.
- Matching on-screen buttons and keys.

**Scope out:** loops, loop-start restart, lead-in, knob, speed, anything in R4+.

**Done means**
- An MP3 or WAV loads; its length and a moving playhead show.
- Open palm (in the box) pauses and resumes from the same spot.
- Index up restarts from 0:00 and plays.
- Music reacts as soon as the ring completes, with no noticeable extra delay.
- Status and playhead are readable from where you dance.

**Status:** done (2026-10-12; merged `--no-ff`, tag `r3-done`). User: "it seems to be working".

**Notes:** watch for audio stutter while the hand model runs every frame, and for Bluetooth speaker delay (Unresolved threads).

---

## R4 — Loops marked as the music plays; nudge the start; restart to loop start

**Goal:** drill a section: mark it while the music plays, pull the start back to where you meant, and jump back to it. Find which knob variant feels best for the nudge.

**Scope in**
- **V cycle, marking where the music is right now:** tap 1 = set loop start, tap 2 = set loop end and start looping, tap 3 = clear; **V hold** = clear [spec §4.3, §4.6].
- **Restart (decided):** index tap = loop start if set, otherwise song start; index hold = song start. Plays immediately [spec §4.5].
- **Small automatic late-mark fix:** marks are stamped at ring start minus a tunable offset (default 0.15 s) [spec §4.6].
- **Knob nudge for the loop start only:** grab (starting in the box) and turn to move the start marker back or forward, in seconds. The marker moves only; index-tap to hear it [spec §4.6, §9 Q2]. No fine-tune for the loop end, since overshoot is "trailing" (user).
- **Knob experiment, all variants switchable in a settings panel** [spec §5.5]: **pinch + tilt + spring-loaded joystick first**; then absolute wiper, relative + ratchet, and circling (Doctor Strange jog); then claw and two-hand clutches.
- Large START/END flags and a highlighted region on the loop bar; the start time is shown huge while nudging.
- Keys and buttons for every action, including nudge.

**Scope out:** speed (R5), loop-end nudge, lead-in/count-in, automatic pre-roll, beat snap, saved loops, audible nudge preview.

**Done means**
- With music playing, V-tap marks a loop start and a second V-tap marks the end and starts looping; both flags appear large on screen.
- After marking a start late, you can nudge it back a couple of counts with the knob and land where you meant (by ear, checked with index-tap).
- Looping from end back to start is clean (no noticeable gap or overshoot), repeatedly.
- Index tap goes to the loop start (or the song start if no loop); index hold goes to the song start.
- The third V-tap and V-hold both clear the loop.
- You've nudged at least 5 loop starts with each mapping and motion (joystick, absolute, relative, circling) and each clutch (pinch, claw, two-hand), and recorded what felt best (and why) in AGENTS.md → Decisions.
- A nudge can't move the start past the end, or before 0:00.

**Status:** active (started 2026-10-12)

**Split (approved 2026-10-12):** two branches, each merged `--no-ff` and tagged on its own.
- **R4a** (`r4a-loops`): V cycle marking, late-mark fix, restart to loop start (restores index tap vs hold), START/END flags and loop bar, huge start time, **keyboard/button nudge** of the loop start, clean loop wrap.
- **R4b** (`r4b-knob`, built on R4a): **revised 2026-10-12.** Two-hand "scrub, then mark": the right-hand claw + tilt scrubs the playhead audibly; left V = IN, left index = OUT; per-hand command boxes. Tap vs hold is removed everywhere (separate "R4a amendment" commit). All knob variants stay switchable. Earlier wording: **Default grab = claw** (user found pinch rough); pinch and two-hand stay as options. Joystick tilt first, then absolute wiper, relative + ratchet, circling.

**Notes**
- The loop model is the user's: let it play, mark it, then fine-tune only the start, because "you will always overplay at the beginning." It replaces the earlier "rotate to find points" vs "play-pause-set" A/B.
- If nudging turns out to be the same amount every time, an automatic pre-roll on the loop start (wish list) could replace most of it.
- The knob experiments start here because this is where rotation is first needed. The winner carries into R5.
- Research basis: Vidami loop cycle [market]; late-landing marks [workflows].

---

## R5 — Speed by rotation knob

**Goal:** change playback speed live by turning the hand, DJ-deck style, judged by ear.

**Scope in**
- Grab + tilt changes speed **while playing**, pitch preserved, using the R4 favourite (default: pinch + spring-loaded joystick, where centre holds the current speed).
- Other mappings from R4 remain switchable for comparison on speed specifically.
- A detent ("click") at 1.0×. The range is 0.5× to 1.25× (assumed; spec §9 Q3).
- Speed stays after release and applies inside loops.
- Optional small on-screen speed number (user: not a priority).

**Scope out:** fixed speed presets, automatic "step it up" ramps, lead-in, anything past R5.

**Done means**
- Turning while grabbed audibly changes speed right away, without a pitch change, clicks or dropouts.
- You can get back to exactly 1.0× by feel, thanks to the detent.
- Speed holds across loop restarts.
- You've used it on a few loops and noted which mapping feels right for speed, or whether fixed presets would be better.

**Status:** planned

**Notes:** remove R3's `PRACTICE.holdShapes` override (index up fires on ring-fill in R3) to restore tap vs hold. Check the loop wrap by ear: HTMLAudioElement wrap is timer-based. Pinch is rough per the user, so consider defaulting the grab to claw.  the user chose a continuous knob and favours the spring-loaded joystick. Practice tools usually use fixed speeds instead [market, workflows], so presets stay on the wish list as a fallback.
