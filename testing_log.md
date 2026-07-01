# InterVue Labs — Manual Testing Log

---

## Session 1

| Field | Notes |
|-------|-------|
| **Session Date** | June 30, 2026 |
| **What I tested** | Signup/login (user: `test`), resume upload, interview config (AI Engineer · Easy · Manager), General Interview flow, 20s silence / auto-skip path |
| **What broke / felt off** | After staying silent 20+ seconds, the next question never appeared. Expected: repeat prompt → then skip to next question after ~10s. Instead, the app stayed in listening mode. Background noise was treated as candidate speech, so the dead-silence timer never fired. *(Deferred: ATS scores felt irrelevant to resume; interviewer showed "Manager" when config may have been wrong.)* |
| **Hypothesis** | VAD threshold in `Interview_arena.jsx` is too sensitive — voice-band energy (bins 1–17) crosses the speech threshold on ambient/background noise, resetting or blocking the 20s dead-silence detector and preventing the repeat-prompt / 10s skip flow. |
| **Cursor prompt** | Raise VAD threshold so background noise is not detected as speech; verify 20s silence → repeat prompt → 10s skip advances to next question. |
| **Result** | Replaced FFT energy VAD with **Silero neural VAD** (`@ricky0123/vad-web`) on the recording stream. FFT analyser kept for visual meter only. Threshold tuning alone was insufficient for AC/keyboard noise. **Needs re-test.** |

---

## Session 2

| Field | Notes |
|-------|-------|
| **Session Date** | July 1, 2026 |
| **What I tested** | Full arena flow after VAD/silence rework: rephrase on silence, motivation skip, presence monitoring, camera warning/end, audio during questions, feedback navigation, mic/cam release on Feedback page |
| **Environment** | Frontend `npm run dev` (repo root), backend `uvicorn api:app --reload`, Windows 10 |

### What we built / changed today

#### 1. Silence & speech detection (`Interview_arena.jsx`, `src/utils/speechVad.js`)

| Change | Detail |
|--------|--------|
| Silero VAD | Dynamic import in `speechVad.js` — avoids blank screen on app load. Arena lazy-loaded in `main.jsx`. |
| Silence flow (current) | **12s** no speech → LLM **rephrase** (text on screen + TTS) → **12s** again → **motivation TTS** (no on-screen text) → silent skip → next question. After **3** consecutive silent skips → wrap-up → end. |
| Removed | Old yes/no repeat prompt flow (SpeechSynthesis collision with skip countdown). |
| Constants | `FIRST_COUNTDOWN_S = 12`, `SILENCE_AFTER_SPEECH_MS = 5000`, `MAX_CONSECUTIVE_SILENT_SKIPS = 3` |

#### 2. LLM rephrase (`backend/services/question_rephraser.py`, `POST /api/interview/rephrase-question`)

- Rephrase uses GPT-4o-mini (not prefix-only). Rephrased text updates `displayedText` + `currentQuestion.text`.
- `apiRephraseQuestion()` in `src/api/client.js`.

#### 3. Silent skip intelligence (`backend/services/interview_orchestrator.py`, `realtime_response_generator.py`, `interviewer_personality.py`)

- Skips with `[No response — candidate skipped]` force `should_proceed = True` (no stuck probe).
- Dedicated silent-skip acknowledgment / transition pools (no false “great answer” praise).

#### 4. Unified interviewer voice (all arena speech via OpenAI TTS)

- `apiGenerateTts()` → `POST /api/tts/generate`.
- `playInterviewerSpeech()` for motivation, wrap-up, rephrase fallback, presence warnings.
- Browser `SpeechSynthesis` only as last-resort fallback.
- **Audio bus:** `stopAllAIAudio()`, `activePlayIdRef`, `interviewActiveRef` — one clip at a time; deferred presence warning if question/motivation still playing.

#### 5. Media lifecycle (`src/utils/interviewMedia.js`, `Feedback.jsx`)

- Camera/mic streams tracked in module-level registry.
- **`Feedback.jsx` on mount** → `releaseAllInterviewMedia()` (cam/mic off when feedback loads).
- `handleEndInterview` navigates only; arena unmount also cleans up hardware.

#### 6. Video presence monitoring (`src/utils/presenceMonitor.js`, `@mediapipe/tasks-vision`)

| Phase | Timing | Behavior |
|-------|--------|----------|
| Initial | **3s** absent | Warning banner + warning TTS; clock resets |
| Post-warning | **10s** still absent | Countdown UI → wrap-up TTS → Feedback |
| Return to frame | Any time | Full reset; **listening resumes** (fixed freeze bug) |
| Face confirm | 3 consecutive detections (~1.2s) | Prevents flicker from resetting end timer |

- Monitoring runs from **Start Interview** click until session end.
- Camera `<video>` stays mounted (hidden when Cam toggled off).
- UI while absent: *“Out of frame — interview ends in Xs”* (not generic “Preparing…”).

### Bugs found & fixed today

| # | Symptom | Root cause | Fix |
|---|---------|------------|-----|
| S2-1 | Silence timer never fired (Session 1 carry-over) | FFT / noise as speech | Silero VAD |
| S2-2 | Interview ended instead of next Q after motivation skip | Silent skip triggered probe | Orchestrator `should_proceed` + frontend `apiGetNextQuestion` fallback |
| S2-3 | “Great answer” on skipped questions | Generic ack on empty answers | Silent-skip personality pools + `is_silent_answer()` |
| S2-4 | Rephrase was same words / wrong voice | Prefix + SpeechSynthesis | LLM rephrase + backend TTS |
| S2-5 | Motivation + question audio overlapped | Independent audio paths | Unified audio bus + deferred presence warning |
| S2-6 | Question played after interview “ended” | Async responses + no end guard | `interviewActiveRef` guards on all play/listen paths |
| S2-7 | **No audio at all** after collision fix | `releaseAllMedia()` set `interviewActiveRef = false` on effect cleanup | Hardware release only in `releaseAllMedia`; end flag only in `handleEndInterview` / presence end |
| S2-8 | Presence timeout didn’t navigate to Feedback | `finishAIPlayback` bailed when `interviewActiveRef` false before wrap-up `onComplete` | `bypassActiveCheck: true` on end-of-session TTS + 12s safety navigate |
| S2-9 | Stuck on “Preparing…” after camera warning | Warning stopped listen but never resumed | `onPresent` + `resumeInterviewListen()` after warning completes |

### Files touched (reference for next session)

```
src/Pages/Interview_arena.jsx     # Main arena — audio bus, silence FSM, presence wiring
src/Pages/Feedback.jsx            # Media release on mount
src/utils/speechVad.js            # Silero VAD wrapper (dynamic import)
src/utils/presenceMonitor.js      # MediaPipe face monitor + timing constants
src/utils/interviewMedia.js       # Stream registry for Feedback cleanup
src/api/client.js                 # apiGenerateTts, apiRephraseQuestion, apiGetNextQuestion
src/main.jsx                      # Lazy InterviewArena route
vite.config.js                    # optimizeDeps exclude: vad-web, mediapipe
backend/services/question_rephraser.py
backend/services/interview_orchestrator.py
backend/services/realtime_response_generator.py
backend/services/interviewer_personality.py
backend/prompts/interview_prompts.py
backend/api.py                    # /rephrase-question endpoint
package.json                      # @ricky0123/vad-web, @mediapipe/tasks-vision
```

### Re-test checklist (before Phase 1D)

- [ ] Start interview → hear first question TTS after **Start Interview**
- [ ] Stay silent 12s → rephrase text updates + rephrase audio (same voice)
- [ ] Stay silent through rephrase window → motivation audio only (no banner text) → next question
- [ ] Step out of frame 3s → warning audio (no overlap with question)
- [ ] Stay out 10s after warning → wrap-up → Feedback; cam/mic off on Feedback
- [ ] Step out for warning, then return → listening resumes (not “Preparing…” forever)
- [ ] Answer normally through 5+ questions — no dual-voice, no premature end
- [ ] End Interview button → Feedback, no lingering audio

### Deferred / known gaps

- ATS score relevance to uploaded resume (Session 1 note).
- `bugs.md` tracker should be updated as re-test confirms fixes.
- Phase **1D** (job description personalization) — **do not start** until checklist above passes.

---
