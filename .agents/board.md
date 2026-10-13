# Board

Updated: 2026-10-11

## In flight
| id | task | agent | branch / worktree | started |
|---|---|---|---|---|

## Waiting on user
- Test R6 at http://localhost:5188/?track=/test/click-track.wav. Decide on zoom (narrower zone vs hand-following crop). Merge chain on the user's word.
- Merge chain pending the user's word: r4a-loops → r4b-knob → r4c-steer → r5-speed (each --no-ff + tag). The user didn't answer "merge R4a/R4b now?".
- Review doc: roadmap approved by "let's start". Doc stays open for comments; pending doc fix: R3 note "two vision models" → "hand model".

## Blocked

## Done (last 10)
- B6 — R5b amendment 0311d40 (0.025 steps, 72°/step, 4 turns full range) on `r5b-speed`; R6 (`r6-zone`, 2 commits, 583 tests, zone.mjs 30/30). Finding: full-width zone zoom = ×1.00; half-width ×1.76. Worktree `.claude/worktrees/agent-ad2be58932550cc04` — 2026-10-12
- B4d — R4d (`r4d-hands`, 3 commits, 502 tests; circling direction in ~36–55°) and R5b (`r5b-speed`, 3 commits, 530 tests; hold-2× engages ~340 ms, releases ~144 ms; 0.05 steps per 36°) — pushed, NOT merged; worktree `.claude/worktrees/agent-a89f1574c4aaba37e` — 2026-10-12
- B4c — R4c (`r4c-steer`, 5 commits, 431 tests, 26/26 steer e2e; lag cause = joystick mapping + release grace; paused stop 474→110 ms) and R5 (`r5-speed`, 2 commits, 459 tests, 29/29 speed e2e) — both pushed, NOT merged; worktree `.claude/worktrees/agent-ae531b24ea41c8084` — 2026-10-12
- B4b — R4b built: tap/hold removed (921ae4f), knob pipeline, two-hand scrub-then-mark, audible scrub ≤17 seeks/s; 366 tests; 50/50 sim e2e — branch `r4b-knob` (pushed, NOT merged), worktree `.claude/worktrees/agent-a9024670d83792788` — 2026-10-12
- B4a — R4a built: 236 tests + build pass; sim e2e OK; wrap overshoot ≤6 ms idle / ≤23 ms under load — branch `r4a-loops` (pushed, NOT merged), worktree `.claude/worktrees/agent-a52adaec4e622e9c4` — 2026-10-12
- T3 — dashboard v3: R2/R3 code on main, latency lab, R4 preview — same link — 2026-10-12
- R3 — accepted ("it seems to be working"), merged --no-ff, tag `r3-done` — 2026-10-12
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
