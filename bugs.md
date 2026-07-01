# InterVue Labs — Bug Tracker

**Branch:** `04-05-26-fine-tuning-project` *(verify with `git branch` — may differ locally)*
**Last Updated:** July 1, 2026

---

## How to Use

| Status | Meaning |
|--------|---------|
| 🔴 Open | Bug confirmed, not started |
| 🟡 In Progress | Being worked on |
| 🟢 Fixed | Fix implemented — needs manual re-verification |
| ✅ Verified | Fix confirmed in manual testing |
| ⚫ Wont Fix | Acknowledged, decided not to fix |

---

## Open Bugs

| # | Bug | Notes | Status |
|---|-----|-------|--------|
| — | ATS scores feel irrelevant to uploaded resume | Logged Session 1; not investigated | 🔴 Open |

---

## Session 3 Fixes — July 1, 2026 (needs re-verification)

| # | Bug | Fix Summary | Status |
|---|-----|-------------|--------|
| 17 | Background noise blocked silence / skip flow | Silero VAD via `src/utils/speechVad.js`; FFT kept for meter only | 🟢 Fixed |
| 18 | Yes/no repeat flow collided with skip countdown | Removed repeat prompt; linear rephrase → motivation → skip | 🟢 Fixed |
| 19 | Silent skip caused probe / no next question | Orchestrator forces proceed; silent-skip ack/transition text | 🟢 Fixed |
| 20 | Rephrase was cosmetic / wrong voice | LLM rephrase service + backend TTS; text shown on screen | 🟢 Fixed |
| 21 | Motivation used browser voice (male) vs question (female) | All short speech via `playInterviewerSpeech` + `/api/tts/generate` | 🟢 Fixed |
| 22 | Presence warning overlapped question/motivation audio | Unified audio bus; deferred warning until AI clip finishes | 🟢 Fixed |
| 23 | Questions played after session should have ended | `interviewActiveRef` guards on async play/listen paths | 🟢 Fixed |
| 24 | No audio at all after audio-bus refactor | `releaseAllMedia` no longer sets `interviewActiveRef = false` on effect cleanup | 🟢 Fixed |
| 25 | Camera timeout didn’t end session | `bypassActiveCheck` on wrap-up TTS so `onComplete` navigates to Feedback | 🟢 Fixed |
| 26 | Stuck on “Preparing…” after camera warning | Resume listen on `onPresent` + after warning audio if user returned | 🟢 Fixed |
| 27 | Cam/mic active on Feedback page | `releaseAllInterviewMedia()` on Feedback mount + stream registry | 🟢 Fixed |

---

## Fixed Bugs (Sessions 1 & 2 — previous branch)

| # | Bug | Fix Summary | Status |
|---|-----|-------------|--------|
| 1 | "View Past Interviews" routed to wrong page | Created `PastInterviews.jsx` stub, registered `/past-interviews` route | 🟢 Fixed |
| 2 | No `QuickInterview` page existed | Created `QuickInterview.jsx` with role grid, difficulty, interviewer picker | 🟢 Fixed |
| 3 | Step 2 config interactive even when coming from ResumeAnalysis | Added `configLocked` state in `Interview.jsx` — shows read-only pills when config pre-set | 🟢 Fixed |
| 4 | First question audio not playing on "Ready to Begin" screen | `handleReady()` now triggers audio queue for first question | 🟢 Fixed |
| 5 | Interview ending prematurely after 3 questions | Removed duplicate `get_orchestrator()` definition that was resetting session state every request | 🟢 Fixed |
| 6 | Recording triggered by mouse clicks, keyboard, ambient noise | Replaced flat FFT average with voice-band energy (bins 1–17, ~80–3000 Hz) + 6-frame consecutive guard | 🟢 Fixed |
| 7 | Dual-voice / conflicting audio playing simultaneously | `buildAudioQueue` now takes mandatory `isFollowUp` flag — paths are mutually exclusive | 🟢 Fixed |
| 8 | Recording cutting off 5–6s after saying "yes" to repeat | Reset `hasSpeechRef` and frame counters in repeat handlers | 🟢 Fixed |
| 9 | Motivational message not playing on second consecutive silence | Fixed state machine phase transitions for second-silence path | 🟢 Fixed |
| 10 | Hard difficulty not probing on perfect answers | Added hard mode check at top of `decide_response_action` — always returns probe action | 🟢 Fixed |
| 11 | Quality badge always showed "Strong Response" | Now uses `quality_metrics.overall_quality` from backend + word count < 10 guard | 🟢 Fixed |
| 12 | Status banners overlapping the glowing orb | Moved banners to `absolute bottom-5` container — stacks cleanly below orb | 🟢 Fixed |
| 13 | Camera/mic still active on feedback page | Media cleanup on Feedback mount + arena unmount | 🟢 Fixed |
| 14 | Follow-up context not shown on feedback page | `Feedback.jsx` now reads `qualityLabel` and `isFollowUp` from localStorage session data | 🟢 Fixed |
| 15 | Poor transcription accuracy | Upgraded to `gpt-4o-transcribe` with `whisper-1` as fallback | 🟢 Fixed |
| 16 | Interview ending after Q11 due to text-based dedup | Switched to ID-only dedup — prevents false match when question bank wraps around | 🟢 Fixed |

---

## Key constants (arena — keep in sync with code)

| Constant | Value | File |
|----------|-------|------|
| `FIRST_COUNTDOWN_S` | 12 | `Interview_arena.jsx` |
| `PRESENCE_WARN_MS` | 3000 | `presenceMonitor.js` |
| `PRESENCE_END_AFTER_WARN_MS` | 10000 | `presenceMonitor.js` |
| `MAX_CONSECUTIVE_SILENT_SKIPS` | 3 | `Interview_arena.jsx` |
