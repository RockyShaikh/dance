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
The user is checking R2 by hand at http://localhost:5174/ (dev server from `.claude/worktrees/agent-aca1e0441ea8b7677`). Then: fix anything R2 needs, then resume R3 from the partial worktree `.claude/worktrees/agent-a9b979ebc902653be` (branch `r3-audio`, uncommitted work; do not discard).

## Open questions
- After-restart behaviour (lead-in?); which hand.

## Last updated
2026-10-11 — Claude Code main thread
