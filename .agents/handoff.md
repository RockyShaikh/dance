# Handoff

## Current goal
R6: both hands command only inside a top-quarter zone; zoom = run tracking on the cropped zone; handedness from the thumb (palm assumed facing the camera; one hand = right). Plus a finer speed wheel (0.025 steps). Head tracking only if needed.

## State
- Memory bootstrapped. Both scouts done (`.agents/research/market-dance-tools.md`, `dancer-workflows.md`).
- Planner v0 docs exist; P2 done: spec v1, roadmap R1–R5 (proposed), wishlist v1, committed 0a55977.
- User decisions recorded in AGENTS.md: rotation knob (wiper/steering tilt), pinch clutch first, claw/two-hand/Doctor-Strange circle as alternatives, R5 = speed knob, both in/out methods A/B in R4.
- Later decisions (in AGENTS.md): joystick knob is the favourite, but all variants get tried; above-head command zone plus a 0.6 s hold; distance deferred; solo user, laptop in front; not a startup. These were also sent to P2.
- No code yet. Git repo: public https://github.com/RockyShaikh/dance, initial commit 60ed522.

## Next step
Wait for B6. Then give the user the test link and checklist (zoom on/off at distance, L/R labels). The merge chain (r4a → r4b → r4c → r5 → r4d → r5b → r6) happens on the user's word.

## Open questions
- After-restart behaviour (lead-in?); which hand.

## Last updated
2026-10-11 — Claude Code main thread
