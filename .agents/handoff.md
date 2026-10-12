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
The user tests R4a (:5176, worktree `.claude/worktrees/agent-a52adaec4e622e9c4`). B4b is building the knob on `r4b-knob` (based on `r4a-loops`). Merge order on the user's word: r4a-loops (tag r4a-done), then r4b-knob (tag r4b-done → r4-done).

## Open questions
- After-restart behaviour (lead-in?); which hand.

## Last updated
2026-10-11 — Claude Code main thread
