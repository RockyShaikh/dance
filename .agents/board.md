# Board

Updated: 2026-10-11

## In flight
| id | task | agent | branch / worktree | started |
|---|---|---|---|---|

## Waiting on user
- R3 real-hand/ear test at http://localhost:5175/ (worktree `.claude/worktrees/agent-a9b979ebc902653be`, branch `r3-audio`), then merge --no-ff + tag `r3-done` on the user's word.
- Review doc: roadmap approved by "let's start". Doc stays open for comments; pending doc fix: R3 note "two vision models" → "hand model".

## Blocked
- T3 — dashboard R2/R3 update stopped mid-work (session limit). Resume later.

## Done (last 10)
- B3 — R3 built: 186 tests + build pass, 26/26 sim e2e checks; audio reacts 2–8 ms after fire; real hand/ears unverified — branch `r3-audio` (pushed, NOT merged; only R3 commits on top of r2-gestures) — 2026-10-12
- R2 — accepted by the user, merged to main (--no-ff), tag `r2-done` — 2026-10-12
- B2 — R2 built: 145 tests + build pass; 43/43 Playwright sim checks; real-hand unverified — branch `worktree-agent-aca1e0441ea8b7677` (pushed, NOT merged), worktree `.claude/worktrees/agent-aca1e0441ea8b7677` — 2026-10-11
- T2 — dashboard v2: real R1 code pointers, handedness/palm lesson, R2 concepts + timeline lab — same link — 2026-10-11
- B1 — R1 built: build + 36 tests pass, fake-camera + still-photo checks OK; real-hand unverified — branch `worktree-agent-a711e219ac20fc31d` (merged to main 6d0fdff after the user's live test + handedness fix 50517b6; worktree kept until the user OKs cleanup), worktree `.claude/worktrees/agent-a711e219ac20fc31d` — 2026-10-11
- T1 — R1 Learning Dashboard — https://claude.ai/artifact/RQnHUzBeptMZt14sownWyk — 2026-10-11
- D1 — review doc published (3 tabs, synced to v1.2) — https://claude.ai/code/artifact/57c28193-d565-486b-a796-75bcfb44eaf1 — 2026-10-11
- P4 — v1.2: R2 box is mouse-editable; per-session calibration = wish list, R6+ — main — 2026-10-11
- P3 — v1.1: command zone = on-screen box (palm centre inside box, default right half); pose model removed; above-head → wish list — main — 2026-10-11
- P2 — spec v1 / roadmap R1–R5 (all proposed) / wishlist revised with research + all user decisions — main — 2026-10-11
- S2 — dancer workflows done; top pains: walking to screen, re-finding start point; planned shapes collide with choreo/marking; command between attempts → stillness gate; prior art: 2013 Princeton Kinect jukebox (recognition failures) — `.agents/research/dancer-workflows.md` — 2026-10-11
- S1 — market research done; no webcam-gesture dance tool found; DanceTribe Watch remote closest; Vidami one-button A/B loop pattern; tap-vs-hold doubles vocab; Reddit unreachable — `.agents/research/market-dance-tools.md` — 2026-10-11
- P1 — spec/roadmap/wishlist v0 drafted (research not yet folded in) — docs/ — 2026-10-11

## Plans & docs
- Learning Dashboard (R1 stack) — https://claude.ai/artifact/RQnHUzBeptMZt14sownWyk — live
- Review doc (Spec / Roadmap / Wish list tabs) — https://claude.ai/code/artifact/57c28193-d565-486b-a796-75bcfb44eaf1 — v1.2, roadmap approved 2026-10-11
- Spec — `docs/spec.md` — v1.2 (source of truth)
- Roadmap — `.agents/roadmap.md` — v1.2, approved; R1 done, R2 active; R6+ = calibration
- Wish list + Unresolved threads — `.agents/wishlist.md` — v1.2
