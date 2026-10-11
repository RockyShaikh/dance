# How do dancers actually learn and drill choreography, and where do devices get in the way?
Date: 2026-10-11   Brief: Research dancer practice workflows (esp. solo practice with phone/laptop) and pain points, to inform a webcam hand-gesture music controller.

## Answer
Yes, there is a fairly consistent workflow, and its central loop is "play a small chunk, stop, go back to the start of the chunk, maybe slow it down, repeat." Every step of that loop needs the playback device. The best-documented pain is the **round trip to the device**: walking forward to check or rewind the video, then walking back to dance. A 2025 contextual inquiry reported it, a 2021 smartwatch study for instructors was built around it, a 2024 teacher's blog complains about it, and a 2013 student project tried to fix it with a Kinect. The next pain is **re-finding the start point** after stopping. A 2015 Dance Teacher piece describes "searching frantically for the start of the fouetté section each time you stop," and app makers talk about tiny, hard-to-drag progress bars. Existing workarounds (Bluetooth remotes, Apple Watch, voice, a friend on the aux, rehearsal apps that jump back to the last start) all show the need, and some are documented as flaky. **Honest caveat:** first-person complaints from everyday dancers are thin in what I could reach. Reddit blocks this crawler, and the ACM Digital Library and the Princeton course blog would not load. So most of the evidence comes from HCI papers, teacher magazines, and how-to guides, not forum threads.

## Evidence
Each item is tagged **[observed]** (I read it in the source) or **[snippet]** (seen only in a search-engine summary; I could not open the full page).

### A. Workflow evidence
- **[observed] Interview study, 12 dancers (Hassan et al., CHI '24).** Seven of 12 "reported frequently pausing while watching dance videos to focus on specific snippets." D5: "I would slow it to 0.5 speed or something, and try to follow it." Seven of 12 "typically learn dance video segments in parts rather than as a whole." D9: "you have people that count music 1-2-3-4-5-6-7-8, people that make noises..., and people who mix noises and numbers." Eight of 12 found remembering the sequence hard. D8: "the little in-between is where it can get a little more difficult." Mirroring, D6: "I find it impossible to learn when someone records the person by facing them." Sped-up source videos, D4: "it's definitely harder to learn something when it's sped up to look nice." Source: Hassan, Pataca, Nourian, Tigwell, Davis, Silver Wagman, "Designing and Evaluating an Advanced Dance Video Comprehension Tool with In-situ Move Identification Capabilities," CHI '24, §4.1. NSF copy: https://par.nsf.gov/servlets/purl/10521042 (DOI 10.1145/3613904.3642710).
- **[observed] Contextual inquiry, 3 participants, KAIST studio (AfforDance, CHI '25 workshop).** §2.2.1 "Device Usage Disrupts Learning Flow": P1 and P3 said, "It is hard to watch myself in the mirror and the device at the same time." Participants "experienced discomfort from moving forward to check the video and then back to dance, disrupting their learning process." Phones and laptops were called "unsuitable for learning" because of their size. §2.2.2: participants forgot upcoming moves and struggled to sync to the beat at fast tempos. https://arxiv.org/abs/2505.09376
- **[snippet] MoveOn (Rivière, Fdili Alaoui, Caramiaux, Mackay, CSCW 2019).** Contemporary dancers decompose video "into short, repeatable clips." Teacher-imposed decomposition suits beginners; personal decomposition suits experts. https://hal-lara.archives-ouvertes.fr/HCI-SORBONNE/hal-02378487v1 (DOI 10.1145/3359188)
- **[observed] K-pop cover practice.** Rockstar Academy: "Experiment with various learning speeds, such as 0.5x, 0.75x, and 0.9x"; "start by concentrating on the first verse or chorus"; "gradually increase it"; "Opt for high-quality mirror dance videos"; "recording your dance practices." https://www.rockstaracademy.com/blog/how-to-learn-kpop-dance-step-by-step-guide . Steezy (2024): prefer practice videos for their "clean, simple environment," flip the video, loop tricky sections. https://www.steezy.co/posts/how-to-learn-k-pop-dances
- **[snippet] Dance Magazine, 2021.** Lisa Rhee (multi-million-subscriber cover YouTuber): "flip the video and slow down the speed," using the Chrome extension YouTube Video Flipper. https://dancemagazine.com/the-art-of-the-k-pop-dance-cover/ (403 when fetched directly)
- **[observed] General guide (dance-masterclass.com).** "Pause, rewind, speed up or slow down, loop or mirror the video"; "Divide the choreography into digestible chunks"; "record yourself"; "Move on even if you have trouble remembering a step or two." https://www.dance-masterclass.com/blog/how-to-learn-choreography-from-a-video
- **[observed] Cleaning in teams and studios (Dance Teacher).** "Each week we teach and clean four to eight counts per hour" (Joanne Chapman). "Some days we'll only get through three eight-counts" (Kandace Hale). Tayler Lowe: "I pause the music on count seven" to check that everyone matches; "I teach using both counts and lyrics or sounds." https://dance-teacher.com/the-nitty-gritty-of-cleaning-choreography-for-recitals-competitions-and-collegiate-dance-numbers/
- **[observed] Steezy, "How To Clean Your Dance Team" (2024).** "Try running a piece 4 or 8 counts at a time"; "get all of them to match the music, first." https://steezy.co/posts/how-to-clean-your-dance-team
- **[observed] Student-run teams (Dance Spirit).** "Put another person in charge of bringing music"; "Someone else can run the sound equipment"; Purdue coach: "taking sections one eight-count at a time"; "If possible, rehearse in front of mirrors." https://dancespirit.com/no_coach_no_problem/
- **[snippet] Marking vs full-out.** Marking is a reduced-energy run. Dancers "sometimes even mak[e] hand movements in place of difficult steps like turns." A UC Santa Cruz study (Warburton et al.) found marked routines were performed better than ones rehearsed full out. https://csmusic.net/content/articles/marking-in-rehearsal-what-is-it-and-when-to-use-it ; https://www.psychologicalscience.org/news/releases/going-through-the-motions-improves-dance-performance.html

### B. Device-friction evidence
- **[observed] Re-finding the start point (Dance Teacher, 2015, Alyssa Marks).** The problem: "searching frantically for the start of the fouetté section each time you stop to give a correction." DanceMaster's fix: "Each time you pause..., DanceMaster automatically returns to the last place you started from." It also offers named cues, a configurable lead-in before each cue, and spoken cue names. https://dance-teacher.com/?p=3075
- **[observed] Instructors need to "stay in position" (TempoWatch, TEI '21).** Roth, Ehlers, Getschmann, Echtler. Instructors need to stay in position while controlling playback and need time-stretching (speed change without pitch change). Common stereo decks and mobile music apps don't meet these needs. Nine semi-professional instructors used the smartwatch interface productively after a short learning phase. https://vbn.aau.dk/en/publications/tempowatch-a-wearable-music-control-interface-for-dance-instructo (DOI 10.1145/3430524.3442461)
- **[observed] Apple Watch workaround breaking (delta.dance, Feb 2024, George Pytlik).** "The Apple Watch is then used to start and stop the music, change songs, and change the volume." After watchOS 10 the Music complication times out after a pause; the author calls this "the death knell for the flow of the class." Walking back to the iPhone "wastes time that people are paying for." https://delta.dance/2024/02/apple-watch-broken-for-dance-teachers/
- **[snippet] Princeton HCI course project "Team X / Kinect Jukebox" (2013).** This was the same idea as this project, tried before. Problem statement: a dancer must go "back and forth to whatever device they are using to play music while practicing or choreographing." Tasks were play/pause (easy), set and return to "breakpoints" (medium), and match tempo to the dancer (hard). From their final post: "our system struggled to recognize some gestures, and this was the main source of frustration for our users." They reweighted body parts so arm gestures counted arm movement more heavily. https://blogs.princeton.edu/humancomputerinterface/2013/05/14/final-project-team-x (now redirects to a WordPress homepage; content seen only in search snippets)
- **[observed] Scrubbing (Practy app listing; developer copy, not user reports).** The thin progress bar "makes it almost impossible to land on the exact second you want"; the color-tag feature is pitched as a way to avoid "always replaying from the beginning." https://apps.apple.com/ca/app/practy-frame-loop-practice/id6755472534
- **[observed] Screen placement (Tribe Nawaar).** "you don't want to be crouching over trying to look at a screen while you are dancing"; "If you have a large screen and can step back far enough that your full body is in the screen." https://www.tribenawaar.com/online-dance-classes-best-practices/
- **[snippet] Red Bull home-learning guide.** "keep the remote nearby so you can pause and rewind when you need to see a step again." https://www.redbull.com/in-en/how-to-learn-dance-at-home (page body was empty when fetched)
- **[snippet] Voice.** One 2019 Apple Community report says "Hey Siri" stopped responding while music played (iOS 13). This is weak, single-report evidence. https://discussions-jp-prz.apple.com/thread/251516423
- **[snippet] Sweaty touchscreens.** This is documented only generically: device-maker support pages and a gym-goer forum post. I found no dance-specific complaint. https://forums.macrumors.com/threads/touch-screen-response-with-sweaty-fingers.2061277/
- **[snippet] Foot pedals (Vidami, AirTurn/XSonic Airstep, Elmore pedal).** They loop, rewind, change speed and pause YouTube with the feet, but they are marketed to instrument learners. I found no evidence of dancers using them. https://www.thomannmusic.com/vidami_original_video_foot_controller.htm
- **[observed] Mirror confusion, from the choreographer side (Make it Simple, Make it Dance, arXiv 2604.10490, §3.3).** Choreographer P20: "learners get confused when their mirrored image looks different from another direction." Novice survey (n=30): half reported frustration; P1: "I get frustrated that I can't keep up." https://arxiv.org/html/2604.10490v1

### C. Gesture-recognition constraints
- **[snippet] NIME 2014.** Air-gesture systems handle smooth, continuous control well, but discrete triggering is "difficult to heuristically design... with a precision that would allow for a complex rhythmic performance." https://www.nime.org/proceedings/2014/nime2014_514.pdf
- **[snippet] Gesture framework (arXiv 2504.19460).** It suggests shortening the observation window "in scenarios like dance performances to minimize misinterpretation." https://arxiv.org/html/2504.19460v1
- **[snippet] FitCoach (Smart Health, 2020).** It distinguishes custom control gestures from regular exercise movement across 12 exercise types, so the "workout motion vs command" confusion problem is recognized in the literature.
- **[observed] MediaPipe Hand Landmarker docs** give no maximum working distance. https://developers.google.com/mediapipe/solutions/vision/hand_landmarker/web_js

## Reasoning

### Workflow map (synthesised from Section A; the step order is **inferred**, but each step is sourced)
| # | Step | What the dancer does | Device touchpoints |
|---|---|---|---|
| 0 | Pick a source | Practice video > MV; mirrored, full-body; or a step-by-step tutorial | Search, choose version |
| 1 | Overview | Watch or listen to the whole piece; sometimes visualise it | Play from top |
| 2 | Section | Split into 8-counts or song parts (verse, chorus); learn the counts | Find section boundaries |
| 3 | Learn a chunk | Watch, pause, slow (0.5x), mirror, copy, repeat | **Pause, rewind to chunk start, set speed. Most frequent loop.** |
| 4 | Stitch | Add the next chunk; drill transitions ("the little in-between") | Loop across two chunks; move the in/out points |
| 5 | Speed up | 0.5 → 0.75 → 0.9 → 1.0x | Change speed; keep loop |
| 6 | Run with music | Drop the video; mark or go full-out | Restart from section or top |
| 7 | Record & compare | Film self, compare with the reference, note corrections | Start the camera, then the music |
| 8 | Clean | 4–8 counts at a time, stop on a specific count, repeat full-out | **Stop at count N, back to the section start, repeat** |
| 9 | Full runs | From the top, performance energy | Play from top |

Steps 3, 4 and 8 are where the device is touched most, often every 10–30 seconds (**inferred** from "4–8 counts at a time" ≈ 4–16 seconds of music at typical tempos).

### Ranked pain points
Ranking = (strength of evidence) × (how often it hits in the core loop). The ranking itself is **inferred**.

1. **Round trip to the device breaks flow.** Sourced: AfforDance P1/P3, TempoWatch, delta.dance, the Princeton project, Red Bull. Hits every repetition in steps 3, 4 and 8. This is the product's core premise, and the evidence supports it.
2. **Getting back to the right start point.** Sourced: Dance Teacher/DanceMaster, Practy, the "pause on count seven" practice. Scrubbing a thin timeline from across the room is imprecise. The best-liked existing fix is "return to the last start" plus named cues with a lead-in.
3. **Can't see the screen and the mirror or yourself at once; screen too small or too far.** Sourced: AfforDance, Tribe Nawaar. Dancers stand far back so their full body fits the frame or mirror, which makes small UI unreadable.
4. **Tempo too fast; speed must be stepped up gradually without pitch change.** Sourced: Hassan D4/D5, Rockstar's 0.5/0.75/0.9x, the DanceMaster reviewer, TempoWatch's time-stretch requirement.
5. **Remembering what comes next and the transitions.** Sourced: Hassan (8 of 12; D8), AfforDance. This is not a device pain, but it drives the need to loop across chunk boundaries.
6. **Mirroring and orientation confusion.** Sourced: Hassan D6, Dance Magazine/Rhee, Make it Simple P20. This is about the video, not the music, so it is relevant only to the later YouTube-sync feature.
7. **Workaround controllers are unreliable or awkward.** Sourced: Apple Watch timeouts, the single Siri report, generic sweaty-touchscreen reports. Moderate to weak evidence.
8. **Precise loop setting.** Only **inferred**: setting loops at exact counts while moving is hard. Apps market A–B loops and colour tags, but I found no first-person complaint.

### Style and context differences (sourced where noted; otherwise **inferred**)
- **K-pop and hip-hop covers (solo or small group, from video).** Heavy on mirrored practice videos, speed stepping and section loops (sourced). Usually a bedroom or rented practice room with a phone or laptop (inferred). This is the closest fit to the product.
- **Studio, competition and collegiate teams.** A teacher or captain runs the music. Cleaning works in 8-counts with stops at specific counts (sourced). Someone else runs the sound (sourced). The pain falls on whoever runs the music, which is why the instructor tools exist (DanceMaster, TempoWatch, Cadance).
- **Ballet.** Class often uses a live pianist. One academy pianist said a recorded-music teacher "can't change the tempo or call out in the middle of class" (snippet, Queensland Ballet). Solo ballet variation practice resembles the cover workflow (inferred). Ballet is a weaker fit for a webcam gesture tool than solo video learners are (inferred).
- **Contemporary.** Personal decomposition into clips (MoveOn, snippet).

### Implications for gesture design and features (all **inferred** from the evidence above unless marked)
1. **Commands happen between attempts, not mid-move.** Teachers stop "on count seven" and dancers stop when a chunk breaks down. So a command can require a short **stillness or neutral-stance precondition** (for example, hold the pose for 0.5–1 s). This removes most false triggers without hurting the real use case.
2. **The current gesture vocabulary collides with choreography.** AGENTS.md lists closed fist, open hand and finger counts. Fists, open palms, pointing, finger counts and "peace" shapes are everyday choreography vocabulary, and marking substitutes hand movements for steps (snippet). Use a **wake or arm gesture** (a deliberate, unusual pose held for a dwell time) before a command shape, or require the shape in an unusual location (for example, both hands crossed above the head). The Princeton team's main user frustration was recognition failure (snippet), so plan to test with real choreography footage for false positives.
3. **Distance.** Dancers stand far enough back to see their full body (sourced). On a laptop webcam at roughly 2–3 m, fingers are only a few pixels wide. Finger-count shapes may be unreliable at that distance; arm and body poses are easier to detect. MediaPipe documents no range (observed), so this needs to be measured early (roadmap phase 1).
4. **Restart = "back to the last start," with a lead-in.** This is the most-validated behaviour in existing tools (sourced: DanceMaster). After a restart gesture the dancer needs time to get back into their starting pose. Add a configurable pre-roll or count-in ("5, 6, 7, 8") before the music resumes.
5. **Loop points will land late.** Reaction time plus recognition latency means a gesture-set "out" point lands after the intended moment. Snap points to the beat or 8-count grid, or offer "loop the last 8 counts." A beat grid needs tempo detection, which is a feature cost.
6. **Feedback must be readable from across the room, and audible.** Use full-screen, high-contrast state (big LOOP / 0.75x / PAUSED), a confirm cue, and possibly spoken confirmations (sourced: DanceMaster speaks cue names). The dancer may be facing a mirror rather than the laptop.
7. **Speed as discrete steps (0.5 / 0.75 / 0.9 / 1.0), time-stretched without pitch change** (sourced practice). Steps are easier to signal by gesture than a continuous slider.
8. **Multiple people in frame** (teams, a friend filming). Lock control to one person, or use an explicit "claim control" gesture.
9. **"Someone on the aux" is the human workaround the product replaces** (sourced: Dance Spirit). Framing the product as a "virtual music runner" matches what dancers already do.

### Disconfirming checks
- I looked for evidence that dancers are fine with existing remotes. I found the opposite for the Apple Watch, but I found no data on the Bluetooth remotes most dancers would use. The size of the "remote already solves it" counter-case remains **unknown**.
- I looked for dancers using foot pedals and found none. Pedals are marketed to musicians. This is absence of evidence, not evidence of absence.

## Options / Recommendation
- Lead with the **"return to last start + lead-in"** behaviour for the restart gesture. It has the strongest evidence and the most mature prior art.
- Before locking the gesture set, record 2–3 minutes of real choreography (K-pop or hip-hop) in front of the target webcam and count false triggers for each candidate gesture. A cheap counterfactual test of the fist/open-hand plan.
- Add a stillness/dwell gate in phase 2 (distinguishing gestures). It is cheap and directly targets false positives.
- Measure hand-landmark reliability at 1, 2 and 3 m in phase 1, and keep arm or body poses as a fallback.

## Uncertainty and open questions
- **Source gap:** Reddit (r/Dance, r/kpop, r/ballet) blocks this crawler, the ACM DL returned 403, and the Princeton blog is gone. Everyday first-person voice is under-represented, so the user may want to skim a few Reddit threads by hand.
- How far do bedroom dancers actually stand from the laptop? 2–3 m is an inference. This matters for hand-shape gestures versus arm or body poses.
- Will the main user practise facing the laptop, or facing a mirror with the laptop to the side?
- Is the target user solo cover dancers (best fit to the evidence) or teachers/captains (best documented music-control pain, but multi-person)? This is a **user decision** that affects whether multi-person control matters.
- TempoWatch's requirements section and the Princeton P6 test details could not be read in full.
