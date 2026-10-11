# Dance — Roadmap

*Revised 2026-10-11 (v1). Co-owned with the user: only the user approves changes. See [spec](../docs/spec.md) for gestures, knob, and stack, and [wish list](wishlist.md) for everything deferred.*

Checkpoints are done strictly in order. Exactly one is `active` at a time, and nothing is built past it. **All are `proposed` until the user approves.**

| # | Checkpoint | Status |
|---|---|---|
| R1 | Bring-up: camera, hand skeleton, pseudo-chords | proposed |
| R2 | Recognize the gesture set (command zone, dwell, tap/hold, clutch shapes) | proposed |
| R3 | Audio + webcam together; play/pause/restart by gesture | proposed |
| R4 | Loops marked as the music plays + knob nudge for the loop start; restart to loop start | proposed |
| R5 | Speed by rotation knob | proposed |

---

## R1 — Bring-up: camera, hand skeleton, pseudo-chords

**Goal:** see a hand and read its finger states.

**Scope in**
- A local web page that opens the webcam, mirrored.
- Hand detection with the skeleton (21 landmark dots plus connecting lines) drawn on each hand.
- A live pseudo-chord readout (`T0 I1 M1 R0 P0`), MediaPipe's shape label, palm-facing state, and fps.

**Scope out:** command zone / pose model, commands, dwell rings, audio, knob, range tuning, anything in R2+.

**Done means**
- Opening the page and allowing the camera shows your mirrored video within a few seconds.
- The skeleton follows either hand smoothly (about 20+ fps).
- Curling and extending each finger flips its readout correctly.
- Open palm, index up and V show the right label.
- The distance you tested at is noted (informational, not pass/fail).

**Status:** proposed

**Notes:** range is deliberately deferred: "gestures first, range later" (user). See Unresolved threads.

---

## R2 — Recognize the gesture set

**Goal:** turn shapes into deliberate commands, using the user's mechanism: held ≥ 0.6 s and above the head.

**Scope in**
- A "gesture test bench" view (no music).
- **Command zone:** add MediaPipe Pose Landmarker to find the head; draw a zone line just above it; command shapes count only above it. A fixed draggable line serves as a debug stand-in [spec §4.2].
- The three command shapes (open palm, index up, V) with **0.6 s minimum dwell** (ring), palm facing, cooldown, and one hand at a time. Optional stillness rule behind a toggle.
- **Tap vs hold** (fire on release vs an outer hold ring at ~1.5 s) [spec §4.4].
- **Clutch-shape detection:** pinch, claw, and the two-hand modifier, shown as "GRABBED / released" states. Nothing is controlled yet.
- A banner plus sound on fire, a log of fired events with timestamps, and sliders for dwell and pinch thresholds.

**Scope out:** audio, knob rotation and mapping, range tuning, fixing choreography collisions, anything in R3+.

**Done means**
- At the distance you test at, each shape fires on at least 9 of 10 deliberate attempts above the head, as itself, and tap vs hold are told apart correctly.
- The same shapes made **below** the zone line never fire.
- The zone line tracks your head as you step closer, farther, or sideways.
- Holding a shape a long time fires exactly once.
- Pinch, claw and two-hand grabs show GRABBED/released correctly, or failures are noted.
- Informational: dance for ~2 minutes with no commands intended and note the false-fire count in the log. This feeds the choreography-collision thread; it isn't a pass/fail gate.

**Status:** proposed

**Notes:** clutch shapes live here because detecting them is the same problem as detecting command shapes. Rotation waits for R4, where it's first used. The pose model is added here, not in R1, to keep bring-up minimal.

---

## R3 — Audio + webcam together; play/pause/restart by gesture

**Goal:** first useful version: dance to a track and control it hands-free.

**Scope in**
- Load a local audio file (picker or drag-and-drop). Local files only (decided).
- One screen: webcam + skeleton + zone line, giant status word, timeline with playhead.
- **Open palm** = play/pause. **Index up** (tap or hold) = restart from the top, immediately.
- Matching on-screen buttons and keys.

**Scope out:** loops, loop-start restart, lead-in, knob, speed, anything in R4+.

**Done means**
- An MP3 or WAV loads; its length and a moving playhead show.
- Open palm (above the head) pauses and resumes from the same spot.
- Index up restarts from 0:00 and plays.
- Music reacts as soon as the ring completes, with no noticeable extra delay.
- Status and playhead are readable from where you dance.

**Status:** proposed

**Notes:** watch for audio stutter with two vision models running, and for Bluetooth speaker delay (Unresolved threads).

---

## R4 — Loops marked as the music plays; nudge the start; restart to loop start

**Goal:** drill a section: mark it while the music plays, pull the start back to where you meant, and jump back to it. Find which knob variant feels best for the nudge.

**Scope in**
- **V cycle, marking where the music is right now:** tap 1 = set loop start, tap 2 = set loop end and start looping, tap 3 = clear; **V hold** = clear [spec §4.3, §4.6].
- **Restart (decided):** index tap = loop start if set, otherwise song start; index hold = song start. Plays immediately [spec §4.5].
- **Small automatic late-mark fix:** marks are stamped at ring start minus a tunable offset (default 0.15 s) [spec §4.6].
- **Knob nudge for the loop start only:** grab (in the zone) and turn to move the start marker back or forward, in seconds. The marker moves only; index-tap to hear it [spec §4.6, §9 Q2]. No fine-tune for the loop end, since overshoot is "trailing" (user).
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

**Status:** proposed

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

**Status:** proposed

**Notes:** the user chose a continuous knob and favours the spring-loaded joystick. Practice tools usually use fixed speeds instead [market, workflows], so presets stay on the wish list as a fallback.
