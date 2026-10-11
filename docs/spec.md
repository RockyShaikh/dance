# Dance — Spec (v1, draft)

*Status: draft for review · revised 2026-10-11 (v1: research reports, knob decisions, command zone, setup decisions, loop model) · Companion docs: [roadmap](../.agents/roadmap.md), [wish list](../.agents/wishlist.md)*

A personal project: a tool the user is building for their own practice. Research is cited where it shaped a choice: **[market]** = `.agents/research/market-dance-tools.md` (what other practice tools do), **[workflows]** = `.agents/research/dancer-workflows.md` (how dancers drill). "User" = the user's own words (see `AGENTS.md` → Decisions).

## 1. Problem and goal

When you learn a choreography from a track, you constantly need to control the music: pause, go back to the start of a section, loop the eight counts you keep missing, slow them down. That means walking to the laptop and back, which breaks focus. The research agrees that the walk to the device and **re-finding the start point** are the two biggest frictions [workflows].

**Goal:** control the practice music hands-free with hand gestures the laptop webcam sees, so you stay in position and keep drilling.

Priorities (user's order):

1. Restart the music to a chosen point with a gesture.
2. Pause and play with a gesture.
3. Set loop **in** and **out** points, with large visual feedback readable across the room.
4. Change speed live by turning the hand like a knob (roadmap R5).

## 2. Setup (decided)

- **Who:** the user, practicing **solo**.
- **Where:** the laptop sits **directly in front of you, facing you** (it happens to be in front of a mirror). You face the laptop while practicing.
- **How you practice:** in chunks of 4–8 counts: play, stop, go back to the chunk start, repeat [workflows]. **Commands happen between attempts, not mid-move** [workflows].
- **Hardware:** the laptop's built-in webcam, and laptop or external speakers.
- **Audio source:** **local audio files only** (decided). YouTube is on the wish list.
- **Distance / range:** **not a concern yet.** Gestures first, range later (user). We work at whatever distance gestures work, note it, and tune range afterwards (wish list → Unresolved threads).

## 3. Interaction model

```
 dance a chunk ──► stop, raise a hand ABOVE YOUR HEAD, show a shape
              ──► a ring fills (≥ 0.6 s) ──► sound + full-width banner
              ──► music responds ──► dance again
```

Principles:

- **Deliberate, not accidental.** A shape only counts if it's held for **at least 0.6 s** and **above your head**, in the "command zone" (user). You rarely hold a pose up there for that long while dancing (§4.2).
- **Small vocabulary:** three shapes and one "grab," with tap vs hold covering the rest (§4.3). This is a deliberate cut, after the user's "this is getting to way too many features."
- **Always show what the system sees:** skeleton, the command-zone line, current shape, hold ring, and a "grabbed" state for the knob.
- **Confirm every command twice:** a huge banner plus a sound. Invisible loop edits confuse people [market].
- **Keyboard parity:** every gesture also has a key and an on-screen button, for setup and debugging [market].

## 4. Gesture vocabulary (v1, smaller)

### 4.1 How a hand is described

The vision model gives us **landmarks**: 21 points per hand (the wrist plus four points along each finger), each with a screen position and a rough depth. Google's MediaPipe Gesture Recognizer also gives a **ready-made label** for common shapes, including `Open_Palm`, `Pointing_Up` and `Victory` [market]. We use those labels for the command shapes because they're more reliable than hand-written rules.

We also compute each finger's up/down state as a five-letter **pseudo-chord** (Thumb, Index, Middle, Ring, Pinky; `1` = up), e.g. `01100` for a peace sign. It's shown on screen in R1 as a debugging aid, and our own rules use it for shapes with no ready-made label (pinch, claw).

### 4.2 What makes a shape count (the user's mechanism)

| Rule | Default | Why |
|---|---|---|
| **Hand is in the command zone:** above the top of your head | line drawn on screen | User: "the main gestures are above the head. You really don't hold a crazy pose up there" |
| **Shape held for the dwell time** | **0.6 s minimum** (tunable up); a ring fills | User's timer. Same idea as the "N frames in a row" confirmation in hobby gesture projects [market] |
| Palm faces the camera | checked from landmarks | Cheap extra filter; hands in choreography are often side-on |
| Cooldown after a command | 1.0 s | One long hold can't fire twice |
| Only one hand is showing a command shape | otherwise ignore | Avoids conflicts |
| *Optional:* hand is still during the hold | off by default | Kept as an extra filter if false fires show up [workflows] |

**How we find "above your head".** The hand model only sees hands, so we need a second model to find the head. Options, in plain words:

- **Pose model (recommended):** MediaPipe Pose Landmarker finds 33 body points (nose, eyes, ears, shoulders, wrists, and so on). We take the highest head point, add a small margin, and that's the zone line. It follows you as you move closer or step sideways, and works at body-scale distances, since it's built for full-body fitness video.
- **Face detector:** a lighter model that draws a box around your face. The zone line sits just above the box. Lighter, but tuned for faces near the camera.
- **Fixed line:** a horizontal line you drag to your head height once. No extra model, but it's wrong as soon as you move closer or farther. Useful as a debugging stand-in.

Both models run together, every frame, on the laptop. R1 stays hands-only. The zone arrives in R2.

**Choreography that collides with commands** (hands-up moves, held poses, open palms overhead) is **not solved now**. It's an Unresolved thread (user). If it bites, the levers are: a longer dwell, the optional stillness rule, or a wake pose.

### 4.3 The gestures

All command shapes must be made **in the command zone** (above your head).

| # | Gesture | Detected by | **Tap** (ring fills once, then drop the hand) | **Hold** (keep holding ~1.5 s) | Roadmap |
|---|---|---|---|---|---|
| 1 | **Open palm**, "stop sign" | `Open_Palm` label | **Play / Pause** (fires as soon as the ring fills) | same as tap | R3 |
| 2 | **Index up**, "one more time" | `Pointing_Up` label | **Restart:** loop start if one is set, otherwise song start (§4.5) | **Restart from the song start**, even with a loop set | R3 (song start) → R4 |
| 3 | **Peace / V** | `Victory` label | **Loop step**, marking where the music is *right now*: 1st = set loop start, 2nd = set loop end and start looping, 3rd = clear | **Clear the loop** now | R4 |
| 4 | **Pinch** (grab the knob) | our rule (§5.2) | While held: the hand is a **knob** (R4: nudge the loop start back; R5: speed). Release to let go | — | detect R2, use R4 + R5 |

What was removed, and why:

- **Fist ("clear"):** fists track worse than open hands in MediaPipe [market] and are common in choreography [workflows]. "Clear" is now V-hold, or the third V-tap.
- **Separate IN, OUT and loop-toggle shapes** (V, three fingers, shaka) collapse into one **V cycle**, copied from the Vidami looper pedal ("tap once to set start, again to set end, again to clear") [market].
- **Horns** (reserved arm gesture) are no longer needed; the command zone does that job.
- **Finger counts 1–5** are kept only as a later idea where the count *is* the message ("jump to marker 3") [market]. See the wish list.

Net change: from six command shapes plus two reserved, to **three shapes plus one grab**.

### 4.4 Tap vs hold

Borrowed from looper foot pedals: each switch does one thing on a tap and another on a hold [market].

- **Tap** = the ring fills once, then you drop the shape. It fires on the drop.
- **Hold** = you keep the shape up until a second, outer ring fills (~1.5 s total). It fires then.
- A gesture with no hold action (open palm) fires as soon as the first ring fills, so play/pause stays fast.

Cost: a tap fires a fraction of a second later, on release. That's fine between attempts.

### 4.5 Restart (decided)

- **Index tap** → jump to the **loop start if one is set, otherwise the song start**, and play (user).
- **Index hold** → jump to the song start and play, even with a loop set. This is a convenience borrowed from looper pedals, where holding rewind goes to the start [market].
- Playback restarts immediately. A lead-in (3-2-1 or "5, 6, 7, 8") is on the wish list, though both reports found dancers want time to get back into position [market, workflows].
- R3 has no loops yet, so index always goes to the song start there.

### 4.6 Making a loop: mark as it plays, then nudge the start back (R4)

The user's model (decided): you don't hunt for points. **Let the music play and mark where it is with a gesture.** You'll always overplay the start, so the knob is a **fine-tune** for pulling the loop start back a couple of counts. The end doesn't need precision; a few counts of overshoot is fine ("that's just considered trailing", user).

```
 music playing ──► V-tap above head ──► LOOP START marked (a bit late: you overplayed)
               ──► keep dancing/listening ──► V-tap ──► LOOP END marked, looping starts
               ──► (any time a start exists) grab the knob ──► nudge the START back/forward ──► release
               ──► index-tap to hear it from the new start
```

- **Mark start:** V-tap while playing. The marker lands where the music is.
- **Mark end:** V-tap again, and looping starts. No fine-tune for the end in R4.
- **Nudge the start:** grab the knob (pinch first) and turn. The loop start marker moves backward or forward while the loop bar shows it huge, with its time. The nudge moves only the marker. To hear the result, index-tap (restart from loop start), or wait for the loop to come round (assumed; §9).
- Units are seconds (no beat detection yet). With the joystick, more tilt = faster nudge, and a small dead zone means a light touch does nothing.
- A V-tap while paused also works: the point lands exactly where you paused. It falls out of the same gesture rather than being a separate method.

**Late marks, small automatic fix.** Reaction time plus recognition time makes a gesture-set mark land after the moment you meant [workflows]. We stamp the mark at the moment the shape was first recognized (when the ring *started*, not when it fired), minus a small tunable offset (default 0.15 s). This trims the lag from the 0.6 s hold. The bigger "couple of counts" overplay is what the nudge is for.

Because overplay is predictable, an **automatic pre-roll** (start every new loop N seconds earlier than marked) could remove most nudging. It's on the wish list as an option, not built.

### 4.7 Feedback (readable from where you dance)

- **Always visible:** a giant status word (PLAYING / PAUSED / LOOP), the loop bar with IN/OUT flags, and the **command-zone line** across the video.
- **While holding:** a ring around the hand fills, labelled with what will fire ("LOOP: SET IN…"); the hold ring appears outside it. The zone line brightens while your hand is above it.
- **On fire:** a full-width banner for ~1 s plus a short soft sound, distinct for transport and loop actions. The sound can be turned off.
- **Knob grabbed:** a dial graphic at the hand, with the value shown huge.
- **Spoken confirmations** are on the wish list.

## 5. The knob (hand rotation)

User: rotation scrubs two things: **speed**, live like a DJ deck, judged by ear (an on-screen number is optional and low priority), and the **loop start**, for nudging it back a couple of counts after you overplay it (R4; it's a fine-tune, not a way to find points). The motion is "like a windshield wiper, like a steering wheel," a tilt in the plane of the screen. The user wants to **experiment with every variant**. A spring-loaded joystick is the favourite to try first: "the only way that one can work, which could feel better. Who knows?"

A knob has three parts we keep separate, so any combination can be tried from a settings panel:

```
  CLUTCH (am I grabbing?)  ──►  MOTION (what am I turning?)  ──►  MAPPING (how turning changes the value)
  pinch | claw | two-hand        tilt angle | circling            joystick (rate) | absolute | relative + ratchet | jog
```

### 5.1 The out-of-wrist problem

A wrist or forearm only tilts so far, maybe 60–80° each way comfortably (an estimate; R4 will tell). If turning maps straight onto the value, you run out of wrist and have to let go and re-grab (user's worry). Each option below says how it handles this.

### 5.2 Clutch: how we know you're grabbing

A grab must **start in the command zone**. While grabbed you may lower the hand (assumed; see §9).

| Clutch | How it's measured from landmarks (plain words) | Pros | Cons |
|---|---|---|---|
| **Pinch** (start here; user) | Distance from thumb tip to index tip, divided by the hand's size (wrist to middle knuckle) so it works at any distance. Below a threshold = grabbed; it must clearly open again to release | Simple; the user's first choice | Fingertips are small in the image; may be flaky |
| **Claw** (user's ideal) | Watch for the change: a splayed open hand whose four fingertips curl partway toward the palm within ~0.5 s ("grabbing a ball"). Grabbed while the fingertips stay half-curled | Feels like grabbing a real knob | Half-curled is harder to tell from open or fist; more tuning |
| **Two-hand** (user's alternative) | One hand held up as an **open palm** = modifier; while it's up, the *other* hand is the knob. Hands are told apart by screen side, not the model's left/right label, which can flip in a mirrored image | Open palm is the most reliable shape; the steering hand can be any shape | Needs both hands free |

For all clutches: if tracking drops while grabbed, the value **freezes** (never jumps), and the knob releases after ~0.3 s without the hand.

### 5.3 Motion: what "turning" is measured as

| Motion | How it's measured | Range |
|---|---|---|
| **Tilt** (wiper / steering wheel; user) | Imagine a needle from the wrist to the base of the middle finger. Its angle on screen, compared with straight up, is the tilt. A wiper swings the forearm from the elbow; a steering wheel turns the hand. Both change this angle | Limited by the wrist and forearm |
| **Circling** ("Doctor Strange portal"; user) | Track the palm centre moving in a circle. Estimate the circle's centre as the average palm position over the last ~1 s, measure the palm's angle around that centre, and add up the changes: clockwise = forward, counter-clockwise = back. One full circle = a fixed amount (e.g. 2 s of nudge, or 10% speed) | **Unlimited**, like a jog wheel |

Circling is measured from where the whole hand is, a big and steady signal, rather than from finger detail. Its costs: it needs about half a circle before the direction is known.

### 5.4 Mapping: how turning changes the value

| Mapping | Behaviour | Out-of-wrist? |
|---|---|---|
| **Spring-loaded joystick (rate)** (user's favourite; try first) | Where you grabbed is "centre." Tilt away from centre and the value keeps moving: the more tilt, the faster. Back to centre (or let go) = it stops where it is, like a joystick springing back. A small dead zone around centre | **Never runs out** |
| **Absolute (wiper)** | Tilt angle *is* the value (e.g. straight up = 1.0×, 45° left = 0.5×) | Runs out; the whole range must fit one sweep |
| **Relative + ratchet** | The value changes by how far you've turned since you grabbed. Release, return, re-grab to keep going (like a screwdriver) | Solved by re-grabbing |
| **Jog** (circling only) | Each circle moves the value a fixed amount | Never runs out |

### 5.5 Recommendation

1. **Build first: pinch + tilt + spring-loaded joystick.** It's the user's favourite, it never runs out of wrist, and pinch is the user's chosen starting clutch.
2. **Then, in the same settings panel:** absolute wiper and relative-plus-ratchet (same tilt angle, just a different mapping, so cheap), and **circling** as a jog wheel.
3. **Then the other clutches:** claw and two-hand, swappable with pinch.

All variants stay in the experiment (user). Because clutch, motion and mapping are separate pieces, nothing closes off anything else.

Per use:

- **Nudging the loop start (R4):** the joystick moves the loop-start marker back or forward (more tilt = faster), shown huge on the loop bar. The music keeps doing what it was doing. Gain is low, since the job is "a couple of counts," i.e. a few seconds at most.
- **Speed (R5):** music playing; the joystick nudges speed up or down live, pitch preserved (time-stretching [workflows: TempoWatch]). Centre holds the current speed. A "click" (detent) at 1.0× makes normal speed easy to find. The on-screen % is optional and small (user).

Research note: practice tools and dancers usually use a few fixed speeds (0.5 / 0.75 / 0.9 / 1.0) [market, workflows]. Fixed presets stay on the wish list as a fallback if the knob doesn't feel right.

## 6. System overview

### 6.1 Pipeline

```
┌──────────┐ frames ┌──────────────────────┐ hand landmarks  ┌───────────────────────────┐
│  Webcam  │──┬───► │ Gesture Recognizer   │ + shape label ─►│ Hand features: finger     │
│ (30 fps) │  │     │ (hands)              │                 │ states, palm facing,      │
└──────────┘  │     └──────────────────────┘                 │ pinch, tilt, palm position│
              │     ┌──────────────────────┐  head height    │ + "in command zone?"      │
              └───► │ Pose Landmarker      │────────────────►│                           │
                    │ (body; R2+)          │                 └─────────┬─────────────────┘
                    └──────────────────────┘                           │
                         ┌───────────────────────────────┬─────────────┴───────────┐
                         ▼                               ▼                         │
              ┌──────────────────────┐        ┌──────────────────────┐             │
              │ Command classifier   │        │ Knob                 │             │
              │ zone, dwell, tap vs  │        │ clutch → motion →    │             │
              │ hold, cooldown       │        │ mapping              │             │
              └──────────┬───────────┘        └──────────┬───────────┘             │
                         │ commands                      │ nudge / speed value     │
                         ▼                               ▼                         ▼
              ┌──────────────────────────────────────────────┐   ┌──────────────────────────┐
              │ Audio engine: play/pause/seek, loop IN..OUT, │──►│ UI: webcam + skeleton,   │
              │ speed (pitch preserved)                      │   │ zone line, status, loop  │
              └──────────────────────────────────────────────┘   │ bar, rings, dial, banner │
                                                                 └──────────────────────────┘
```

- **Gesture Recognizer:** finds hands; gives landmarks and a shape label. **Pose Landmarker:** finds the body, so we know where your head is. Both run on the laptop; video never leaves it.
- **Hand features:** simple geometry on landmarks.
- **Command classifier:** our rule-based code for §4.2 and §4.4. Rules, not a trained model, so it's easy to understand and tune.
- **Knob:** §5, three swappable pieces.
- **Audio engine:** plays, seeks, loops, counts in, changes speed.

### 6.2 Platform: a browser app (recommended)

**A local web app in Chrome:** TypeScript, Vite (a dev server and build tool), MediaPipe Tasks Vision (Gesture Recognizer, Pose Landmarker), the browser camera API, a canvas overlay, and Web Audio. It runs at `localhost`. LoopStep (an open-source practice player) and DanceCoach (browser + MediaPipe) are handy code references [market].

| | **Browser (recommended)** | **Python desktop (OpenCV + MediaPipe)** |
|---|---|---|
| Hand + pose tracking | Same MediaPipe models, GPU in browser | Same models; slightly faster to prototype |
| Play / seek / loop | Web Audio is built for this; precise looping possible | Extra libraries; clunkier |
| Live speed, pitch preserved (R5) | Built-in for basic quality; libraries for better | More plumbing |
| Huge readable UI | HTML/CSS/canvas, fast to iterate | Crude windows or a GUI toolkit |
| YouTube sync or phone camera later | Native to the browser | Hard |
| Downsides | Chrome-first; camera needs `localhost` or HTTPS; two models per frame cost CPU/GPU | Packaging per OS |

Why the browser: the product is mostly audio control plus a big readable UI, which the browser does well, and the vision models are the same either way. No UI framework to start.

### 6.3 Range: later

The user's call: get gestures working first, debug range afterwards. We note the distance we tested at in R1–R2, but it isn't a pass/fail target. Later options, all on the wish list: better lighting, an external webcam, a **phone camera plugin** (back camera at 1×/2× zoom, phone body tracking), arm or body-pose commands, or a **wearable**.

## 7. UI sketch

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⟳ LOOP   ▶ PLAYING                              0:42.3        (0.85×)   │  ← giant status; speed small, optional
├──────────────────────────────────────────────────────────────────────────┤
│                   ✋ ◔  "LOOP: SET OUT…"   ← shape + dwell ring           │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ COMMAND ZONE ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │  ← follows your head height
│                       ( head )                                           │
│                      (mirrored webcam view + skeleton)                   │
│                                                                          │
│        ╭───╮                                                             │
│        │ ╱ │  KNOB: NUDGE START ◄◄  ← dial appears only while grabbed   │
│        ╰───╯                                                             │
│   T0 I1 M1 R0 P0  →  Victory          (debug readout, can be hidden)    │
├──────────────────────────────────────────────────────────────────────────┤
│  ════════█▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓█══════════════════════════   │  ← loop bar, LARGE flags
│        START 0:31.0        ▲ playhead       END 0:47.5                   │
├──────────────────────────────────────────────────────────────────────────┤
│  above head:  ✋ play/pause   ☝ tap: loop/song start · hold: song start  │  ← cheat sheet
│               ✌ tap: in→out→clear · hold: clear   🤏 grab knob  [keys]   │
└──────────────────────────────────────────────────────────────────────────┘

Any command: a full-width banner for ~1 s, e.g.  ⏮ RESTART FROM IN
```

## 8. Non-goals (for now)

- Anything past roadmap R5: no YouTube sync, AI choreography agent, saved sessions, or beat detection.
- No range tuning yet (gestures first).
- No solving of choreography/command collisions beyond the zone and dwell (Unresolved thread).
- No pose or step analysis, scoring, or recording of the dancer.
- Local audio files only (decided): no YouTube, Spotify or Apple Music.
- No accounts or cloud; no mobile version; no custom ML training.

## 9. Open questions for the user

Each has a working assumption so work can continue.

1. **Knob grab and the zone:** (a) the grab must start above your head, then you can lower your hand while grabbed; (b) the knob only works while your hand stays above your head; (c) the knob ignores the zone.
   **Assumption: (a).** (b) is tiring; (c) risks accidental grabs.
2. **After nudging the loop start:** (a) only the marker moves; you index-tap to hear it from the new start; (b) on release, playback jumps to the new start automatically so you hear it at once.
   **Assumption: (a)**, since it reuses an existing gesture and never interrupts the music unasked.
3. **Speed range for R5:** **Assumption: 0.5× to 1.25×**, with a detent at 1.0×.

**Decided (no longer open):** restart goes to the loop start if set, else the song start; local audio files only; loops are marked as the music plays, and the knob only nudges the start.

**Defaults we're assuming unless you object:** index *hold* = song start even with a loop set; the zone line comes from the pose model (a fixed draggable line as a debug stand-in); loop back to start automatically at the end; confirmation sound on, quiet, toggleable; either hand works for commands; laptop screen only; Chrome only.

## 10. Research sources

- `.agents/research/market-dance-tools.md`: used for the Vidami loop cycle, tap vs hold, count-in on restart, keyboard parity, fist-tracking weakness, and code references.
- `.agents/research/dancer-workflows.md`: used for "commands happen between attempts", restart behaviour, late-landing marks, and readable feedback.
