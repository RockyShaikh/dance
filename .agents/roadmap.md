# Dance — Roadmap

*Revised 2026-10-11 (v1). Co-owned with the user: only the user approves changes. See [spec](../docs/spec.md) for gestures, knob, and stack, and [wish list](wishlist.md) for everything deferred.*

Checkpoints are done strictly in order. Exactly one is `active` at a time, and nothing is built past it. **All are `proposed` until the user approves.**

| # | Checkpoint | Status |
|---|---|---|
| R1 | Bring-up: camera, hand skeleton, pseudo-chords | proposed |
| R2 | Recognize the gesture set (command zone, dwell, tap/hold, clutch shapes) | proposed |
| R3 | Audio + webcam together; play/pause/restart by gesture | proposed |
| R4 | Loop IN/OUT + restart-to-last-start; A/B two ways to set points | proposed |
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
- Load a local audio file (picker or drag-and-drop).
- One screen: webcam + skeleton + zone line, giant status word, timeline with playhead.
- **Open palm** = play/pause. **Index up** (tap or hold) = restart from the top, immediately.
- Matching on-screen buttons and keys.

**Scope out:** loops, last-start restart, lead-in, knob, speed, anything in R4+.

**Done means**
- An MP3 or WAV loads; its length and a moving playhead show.
- Open palm (above the head) pauses and resumes from the same spot.
- Index up restarts from 0:00 and plays.
- Music reacts as soon as the ring completes, with no noticeable extra delay.
- Status and playhead are readable from where you dance.

**Status:** proposed

**Notes:** watch for audio stutter with two vision models running, and for Bluetooth speaker delay (Unresolved threads).

---

## R4 — Loop IN/OUT + restart-to-last-start; compare two ways to set points

**Goal:** drill a section: mark it, loop it, get back to its start with time to get in position. Find out which way of placing points, and which knob, feels best.

**Scope in**
- **V cycle:** tap 1 = set IN, tap 2 = set OUT and start looping, tap 3 = clear; **V hold** = clear [spec §4.3].
- **Restart:** index tap = last start (loop IN, else where play last began); index hold = top. Both with a **3-2-1 lead-in** (default 3 s, adjustable 0–5 s) [spec §4.5].
- **Late-point compensation:** points set while playing are stamped at ring start minus a tunable offset; points set while paused use the exact position [spec §4.6].
- Large IN/OUT flags and a highlighted region on the loop bar.
- **A/B experiment, both methods built** [spec §4.6]:
  - **Method A (scrub then set):** paused → grab in the zone → turn to move the playhead → release → V-tap. Knob order per spec §5.5: **pinch + tilt + spring-loaded joystick first**; then absolute wiper, relative + ratchet, and circling (Doctor Strange jog); then claw and two-hand clutches. All switchable in a settings panel. Silent scrub with a huge playhead readout.
  - **Method B (play, pause, set):** open palm to pause at the spot → V-tap.
- Keys and buttons for every action.

**Scope out:** speed (R5), beat snap, nudging points, saved loops, audible scrub, tempo-synced count-in, pre-roll.

**Done means**
- IN then OUT set by gesture land where you meant (within about a beat), with large flags on screen.
- Looping from OUT back to IN is clean (no noticeable gap or overshoot), repeatedly.
- Index tap goes to the loop IN (or last start), counts 3-2-1, plays. Index hold does the same from 0:00.
- The third V-tap and V-hold both clear the loop.
- **Both methods work end to end.** You've set at least 5 loops with each, tried every mapping and motion for Method A (joystick, absolute, relative, circling) and every clutch (pinch, claw, two-hand), and recorded what felt best (and why) in AGENTS.md → Decisions.
- Setting OUT before IN, or earlier than IN, is handled sensibly (swap, or ignored with a message).

**Status:** proposed

**Notes**
- This is the largest checkpoint; it may be split into R4a (loop + restart via Method B) and R4b (knob experiment, Method A). User's call (spec §9 Q6).
- Knob experiments start here because this is where rotation is first needed. The winner carries into R5.
- Research basis: Vidami loop cycle [market], "return to last start" + lead-in [workflows: DanceMaster], late-landing points [workflows].

---

## R5 — Speed by rotation knob

**Goal:** change playback speed live by turning the hand, DJ-deck style, judged by ear.

**Scope in**
- Grab + tilt changes speed **while playing**, pitch preserved, using the R4 favourite (default: pinch + spring-loaded joystick, where centre holds the current speed).
- Other mappings from R4 remain switchable for comparison on speed specifically.
- A detent ("click") at 1.0×. The range is 0.5× to 1.25× (assumed; spec §9 Q5).
- Speed stays after release and applies inside loops.
- Optional small on-screen speed number (user: not a priority).

**Scope out:** fixed speed presets, automatic "step it up" ramps, audible scrub, anything past R5.

**Done means**
- Turning while grabbed audibly changes speed right away, without a pitch change, clicks or dropouts.
- You can get back to exactly 1.0× by feel, thanks to the detent.
- Speed holds across loop restarts and lead-ins.
- You've used it on a few loops and noted which mapping feels right for speed, or whether fixed presets would be better.

**Status:** proposed

**Notes:** the user chose a continuous knob and favours the spring-loaded joystick. Practice tools usually use fixed speeds instead [market, workflows], so presets stay on the wish list as a fallback.
