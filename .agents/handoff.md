# Handoff

## Current goal
R3: load a local track; open palm = play/pause, index up = restart; webcam + status + timeline on one screen. Built on top of R2 (not yet hand-tested). The user wants R2 and R3 individually rollback-able.

## State
- Memory bootstrapped. Both scouts done (`.agents/research/market-dance-tools.md`, `dancer-workflows.md`).
- Planner v0 docs exist; P2 done: spec v1, roadmap R1–R5 (proposed), wishlist v1, committed 0a55977.
- User decisions recorded in AGENTS.md: rotation knob (wiper/steering tilt), pinch clutch first, claw/two-hand/Doctor-Strange circle as alternatives, R5 = speed knob, both in/out methods A/B in R4.
- Later decisions (in AGENTS.md): joystick knob is the favourite, but all variants get tried; above-head command zone plus a 0.6 s hold; distance deferred; solo user, laptop in front; not a startup. These were also sent to P2.
- No code yet. Git repo: public https://github.com/RockyShaikh/dance, initial commit 60ed522.

## Next step
Wait for B3. Then give the user R3 test steps (R2 checks can be folded in). Integration only on their word: merge `r2-gestures` --no-ff → tag r2-done, then `r3-audio` --no-ff → tag r3-done. The R2 dev server may still be running on :5174.

## Open questions
- After-restart behaviour (lead-in?); which hand.

## Last updated
2026-10-11 — Claude Code main thread
