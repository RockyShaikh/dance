# Handoff

## Current goal
R2: tell gestures apart reliably. Command box (mouse-editable rectangle, default right half), 0.6 s dwell, tap vs hold, clutch-shape detection (pinch/claw/two-hand) on a test bench.

## State
- Memory bootstrapped. Both scouts done (`.agents/research/market-dance-tools.md`, `dancer-workflows.md`).
- Planner v0 docs exist; P2 done: spec v1, roadmap R1–R5 (proposed), wishlist v1, committed 0a55977.
- User decisions recorded in AGENTS.md: rotation knob (wiper/steering tilt), pinch clutch first, claw/two-hand/Doctor-Strange circle as alternatives, R5 = speed knob, both in/out methods A/B in R4.
- Later decisions (in AGENTS.md): joystick knob is the favourite, but all variants get tried; above-head command zone plus a 0.6 s hold; distance deferred; solo user, laptop in front; not a startup. These were also sent to P2.
- No code yet. Git repo: public https://github.com/RockyShaikh/dance, initial commit 60ed522.

## Next step
Wait for B2 (ship) and T2 (tutor). On B2: give the user test steps per R2 done-means; merge only on their word. R1 worktree `.claude/worktrees/agent-a711e219ac20fc31d` is merged; ask before removing it. A dev server may still be running from it on :5173.

## Open questions
- After-restart behaviour (lead-in?); which hand.

## Last updated
2026-10-11 — Claude Code main thread
