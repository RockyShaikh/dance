# Handoff

## Current goal
R4c: two-hand steering wheel (left-hand shape = mode: palm play+scrub, fist pause+scrub, V START, index END), snappy, waveform. Then R5: 2× speed toggle (right thumbs up).

## State
- Memory bootstrapped. Both scouts done (`.agents/research/market-dance-tools.md`, `dancer-workflows.md`).
- Planner v0 docs exist; P2 done: spec v1, roadmap R1–R5 (proposed), wishlist v1, committed 0a55977.
- User decisions recorded in AGENTS.md: rotation knob (wiper/steering tilt), pinch clutch first, claw/two-hand/Doctor-Strange circle as alternatives, R5 = speed knob, both in/out methods A/B in R4.
- Later decisions (in AGENTS.md): joystick knob is the favourite, but all variants get tried; above-head command zone plus a 0.6 s hold; distance deferred; solo user, laptop in front; not a startup. These were also sent to P2.
- No code yet. Git repo: public https://github.com/RockyShaikh/dance, initial commit 60ed522.

## Next step
The user tests R4c (:5185, test checkout) and R5 (:5186, worktree agent-ae531b24ea41c8084). Then merge the chain r4a-loops → r4b-knob → r4c-steer → r5-speed into main, each --no-ff + tag, on the user's word. Clean up the old worktrees (R1, R2, R3, R4a, R4b, test-r4c) only with their OK.

## Open questions
- After-restart behaviour (lead-in?); which hand.

## Last updated
2026-10-11 — Claude Code main thread
