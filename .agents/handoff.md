# Handoff

## Current goal
R1 bring-up (user: "okay lets start! let's get the r1 brought up"): webcam + hand skeleton overlay + pseudo-chord readout.

## State
- Memory bootstrapped. Both scouts done (`.agents/research/market-dance-tools.md`, `dancer-workflows.md`).
- Planner v0 docs exist; P2 done: spec v1, roadmap R1–R5 (proposed), wishlist v1, committed 0a55977.
- User decisions recorded in AGENTS.md: rotation knob (wiper/steering tilt), pinch clutch first, claw/two-hand/Doctor-Strange circle as alternatives, R5 = speed knob, both in/out methods A/B in R4.
- Later decisions (in AGENTS.md): joystick knob is the favourite, but all variants get tried; above-head command zone plus a 0.6 s hold; distance deferred; solo user, laptop in front; not a startup. These were also sent to P2.
- No code yet. Git repo: public https://github.com/RockyShaikh/dance, initial commit 60ed522.

## Next step
User tests R1 on a real hand: `cd .claude/worktrees/agent-a711e219ac20fc31d && npm install && npm run dev` → http://localhost:5173/. Check Left/Right label (`swapHandedness` in src/config.ts), finger chords, labels, fps, distance. If good and the user says so: merge branch `worktree-agent-a711e219ac20fc31d` into main, mark R1 done, stow, review the wish list, R2 active on their word.

## Open questions
- After-restart behaviour (lead-in?); which hand.

## Last updated
2026-10-11 — Claude Code main thread
