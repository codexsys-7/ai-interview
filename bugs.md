# InterVue Labs — Bug Tracker

**Branch:** `04-05-26-fine-tuning-project`
**Last Updated:** May 4, 2026

---

## How to Use

| Status | Meaning |
|--------|---------|
| 🔴 Open | Bug confirmed, not started |
| 🟡 In Progress | Being worked on |
| 🟢 Fixed | Fix implemented and verified |
| ⚫ Wont Fix | Acknowledged, decided not to fix |

---

## Open Bugs

*No bugs logged yet. Start testing and report bugs here.*

---

## Fixed Bugs (Session 1 & 2 — previous branch)

| # | Bug | Fix Summary | Status |
|---|-----|-------------|--------|
| 1 | "View Past Interviews" routed to wrong page | Created `PastInterviews.jsx` stub, registered `/past-interviews` route | 🟢 Fixed |
| 2 | No `QuickInterview` page existed | Created `QuickInterview.jsx` with role grid, difficulty, interviewer picker | 🟢 Fixed |
| 3 | Step 2 config interactive even when coming from ResumeAnalysis | Added `configLocked` state in `Interview.jsx` — shows read-only pills when config pre-set | 🟢 Fixed |
| 4 | First question audio not playing on "Ready to Begin" screen | `handleReady()` now triggers audio queue for first question | 🟢 Fixed |
| 5 | Interview ending prematurely after 3 questions | Removed duplicate `get_orchestrator()` definition that was resetting session state every request | 🟢 Fixed |
| 6 | Recording triggered by mouse clicks, keyboard, ambient noise | Replaced flat FFT average with voice-band energy (bins 1–17, ~80–3000 Hz) + 6-frame consecutive guard | 🟢 Fixed |
| 7 | Dual-voice / conflicting audio playing simultaneously | `buildAudioQueue` now takes mandatory `isFollowUp` flag — paths are mutually exclusive | 🟢 Fixed |
| 8 | Recording cutting off 5–6s after saying "yes" to repeat | Reset `hasSpeechRef` and `consecutiveSpeechFramesRef` in `handleRepeatQuestion` and `startRepeatListening` | 🟢 Fixed |
| 9 | Motivational message not playing on second consecutive silence | Fixed state machine phase transitions for second-silence path | 🟢 Fixed |
| 10 | Hard difficulty not probing on perfect answers | Added hard mode check at top of `decide_response_action` — always returns probe action | 🟢 Fixed |
| 11 | Quality badge always showed "Strong Response" | Now uses `quality_metrics.overall_quality` from backend + word count < 10 guard | 🟢 Fixed |
| 12 | Status banners overlapping the glowing orb | Moved banners to `absolute bottom-5` container — stacks cleanly below orb | 🟢 Fixed |
| 13 | Camera/mic still active on feedback page | Added full media cleanup to `useEffect` unmount in `Interview_arena.jsx` | 🟢 Fixed |
| 14 | Follow-up context not shown on feedback page | `Feedback.jsx` now reads `qualityLabel` and `isFollowUp` from localStorage session data | 🟢 Fixed |
| 15 | Poor transcription accuracy | Upgraded to `gpt-4o-transcribe` with `whisper-1` as fallback | 🟢 Fixed |
| 16 | Interview ending after Q11 due to text-based dedup | Switched to ID-only dedup — prevents false match when question bank wraps around | 🟢 Fixed |

---
