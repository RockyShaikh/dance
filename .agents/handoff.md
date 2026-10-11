# Handoff

## Current goal
"Make a dance tool for learning choreography": hands-free control of practice music via webcam hand gestures. Right now: finish spec + roadmap (R1–R5) + wish list, then run the review loop with the user.

## State
- Memory bootstrapped. Both scouts done (`.agents/research/market-dance-tools.md`, `dancer-workflows.md`).
- Planner v0 docs exist; P2 done: spec v1, roadmap R1–R5 (proposed), wishlist v1, committed 0a55977.
- User decisions recorded in AGENTS.md: rotation knob (wiper/steering tilt), pinch clutch first, claw/two-hand/Doctor-Strange circle as alternatives, R5 = speed knob, both in/out methods A/B in R4.
- Later decisions (in AGENTS.md): joystick knob is the favourite, but all variants get tried; above-head command zone plus a 0.6 s hold; distance deferred; solo user, laptop in front; not a startup. These were also sent to P2.
- No code yet. Git repo: public https://github.com/RockyShaikh/dance, initial commit 60ed522.

## Next step
The review doc is live: https://claude.ai/code/artifact/57c28193-d565-486b-a796-75bcfb44eaf1 . Wait for the user to say "iterate", then run the review-loop iterate pass (collect comments C1..Cn, delegate, Revisions row, reply on each thread). Also fix the doc's roadmap R3 note ("two vision models" → "hand model"). When the review ends, roadmap is approved → R1 goes active only on the user's word.

## Open questions
- After-restart behaviour (lead-in?); which hand.

## Last updated
2026-10-11 — Claude Code main thread
