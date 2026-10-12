# Handoff

## Current goal
R4 (split): R4a = loops marked as music plays, restart to loop start, keyboard nudge; then R4b = knob nudge variants (claw default). Each gets its own branch, merge and tag.

## State
- Memory bootstrapped. Both scouts done (`.agents/research/market-dance-tools.md`, `dancer-workflows.md`).
- Planner v0 docs exist; P2 done: spec v1, roadmap R1–R5 (proposed), wishlist v1, committed 0a55977.
- User decisions recorded in AGENTS.md: rotation knob (wiper/steering tilt), pinch clutch first, claw/two-hand/Doctor-Strange circle as alternatives, R5 = speed knob, both in/out methods A/B in R4.
- Later decisions (in AGENTS.md): joystick knob is the favourite, but all variants get tried; above-head command zone plus a 0.6 s hold; distance deferred; solo user, laptop in front; not a startup. These were also sent to P2.
- No code yet. Git repo: public https://github.com/RockyShaikh/dance, initial commit 60ed522.

## Next step
Wait for B4a. Then give the user R4a test steps. Dispatch R4b (branch `r4b-knob` off `r4a-loops`) once R4a lands, which can be before the user tests it. Merge each only on the user's word.

## Open questions
- After-restart behaviour (lead-in?); which hand.

## Last updated
2026-10-11 — Claude Code main thread
