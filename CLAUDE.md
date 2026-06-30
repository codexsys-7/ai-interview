# InterVue Labs - Claude Code Guide

## What This Is

AI-powered interview simulator. Conducts intelligent, conversational interviews with real-time voice. Adapts questions based on answers, detects contradictions, remembers context — feels like talking to a real interviewer.

**Current Branch:** `manual_testing_bug_fixes-clean-ui`
**Current State:** Phase 1C COMPLETE. Session 2 bug fixes complete. Do NOT start Phase 1D until the duplicate `get_orchestrator()` bug is resolved and all fixes are manually verified.

---

## Tech Stack

**Backend:** FastAPI (Python 3.11+), Supabase (PostgreSQL), JWT auth
**AI:** OpenAI GPT-4o-mini (LLM), OpenAI TTS (voice), `text-embedding-3-small` (1536-dim embeddings)
**Frontend:** React 18, Vite, Tailwind CSS v3, Lucide React, Framer Motion

---

## Project Structure

```
InterVue-Labs/
├── backend/
│   ├── api.py                            # 12+ FastAPI routes
│   ├── db.py                             # DB models
│   ├── models.py                         # Pydantic schemas
│   ├── ats.py                            # ATS scoring
│   ├── services/                         # Core intelligence (11 services)
│   │   ├── interview_orchestrator.py     # Master controller — start here
│   │   ├── intelligent_question_generator.py
│   │   ├── interview_decision_engine.py
│   │   ├── conversation_context.py       # Memory system
│   │   ├── contradiction_detector.py
│   │   ├── embedding_service.py
│   │   ├── realtime_response_generator.py
│   │   ├── interviewer_personality.py    # 50+ response variations
│   │   ├── tts_service.py
│   │   ├── question_selector.py
│   │   └── job_introduction_generator.py
│   ├── prompts/interview_prompts.py      # 7 LLM prompt templates
│   ├── data/question_bank.json           # 100+ real interview questions
│   └── audio_cache/                      # Generated TTS MP3s
│
└── frontend/src/
    ├── Pages/                            # All page components (capital P)
    │   ├── Home.jsx                      # Landing: upload resume or quick practice
    │   ├── Interview.jsx                 # Interview setup (role, difficulty, interviewer)
    │   ├── ResumeAnalysis.jsx            # Post-upload analysis + config selection
    │   ├── Interview_arena.jsx           # 🎯 Live interview room (auto-listen, TTS, orb)
    │   ├── QuickInterview.jsx            # Quick start without resume (role grid + Just Battle)
    │   ├── PastInterviews.jsx            # Past sessions viewer (coming soon stub)
    │   ├── Feedback.jsx                  # Post-interview feedback
    │   └── Dashboard.jsx
    ├── api/
    │   └── client.js                     # Central API client — all backend calls go here
    └── components/Interview/
        ├── GlowingOrb.jsx               # AI presence visual
        ├── ConversationIndicator.jsx
        ├── AIResponseDisplay.jsx
        ├── QuestionDisplay.jsx
        └── AnswerInput.jsx              # Voice recorder
```

---

## Core Interview Flow

```
AI plays question audio (TTS via OpenAI)
    ↓
Audio queue ends → auto-listen starts (Web Audio API + MediaRecorder)
    ↓
20s dead-silence detector running in background (FFT volume monitoring)
    │
    ├─ User speaks within 20s
    │       ↓  speech detected (FFT avg > threshold)
    │   Recording in progress (waveform bars animate)
    │       ↓  5s of silence after speech ends
    │   Auto-submit — no button press needed
    │       ↓
    │   POST /api/interview/submit-answer-realtime
    │       ↓
    │   Orchestrator: store + embed + analyze quality + detect patterns
    │   Decision Engine: contradiction? follow-up? deep-dive? next?
    │   Question Generator → TTS → return audio URLs + flow_control
    │       ↓
    │   buildAudioQueue(aiResponse, nextQuestion, isFollowUp):
    │     isFollowUp=true  → ack + probe only (no transition/next question)
    │     isFollowUp=false → ack + transition + next question (no probe)
    │       ↓
    │   GlowingOrb pulses → audio ends → auto-listen restarts
    │
    └─ No speech detected for 20s
            ↓
        "Do you want me to repeat the question?" (SpeechSynthesis)
        Listen 8s for yes/no (transcribed, natural language detected)
            ├─ Yes → replay question audio → fresh 20s window
            │           ↓  silent again
            │       Motivational message (random, 6 variants) → 10s → skip
            └─ No / silence → 10s countdown → skip to next question
                (skip submits "[No response — skipped]" to backend)
```

---

## Key API Endpoints

| Endpoint                                             | Purpose                                        |
| ---------------------------------------------------- | ---------------------------------------------- |
| `POST /api/interview/start-with-audio`               | Start session, get first question + audio      |
| `POST /api/interview/submit-answer-realtime`         | Submit answer, get AI response + next question |
| `POST /api/interview/submit-followup`                | Handle follow-up elaborations                  |
| `GET /api/interview/conversation-state/{session_id}` | Debug: get full context                        |
| `GET /api/audio/{filename}`                          | Serve cached MP3 files                         |
| `POST /api/interview/start-with-job-description`     | Start with JD intro                            |
| `POST /api/job-description/parse`                    | Parse uploaded JD                              |

> **Missing endpoint (TODO):** No `/api/tts` endpoint exists for on-demand text generation.
> Repeat prompt and motivational messages currently use browser `SpeechSynthesis` as fallback.
> A future session should add `/api/tts` to match these to the interviewer's OpenAI voice.

---

## Decision Engine Priority

1. Challenge contradiction (Q≥5, confidence>0.7)
2. Deep dive (topic mentioned 3+ times, Q≥4)
3. Follow-up probe (vague/incomplete answer)
4. Reference past answer (similarity>0.85)
5. Standard next question (default)

---

## What's Done / What's Next

| Phase                                | Status             | Summary                                                                             |
| ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------- |
| 1A: Answer Storage                   | ✅ Complete        | DB schema, submit/fetch APIs                                                        |
| 1B: Memory & Intelligence            | ✅ Complete        | Embeddings, semantic search, contradiction detection, 28 tests                      |
| 1C: Intelligent Conversation + Voice | ✅ Complete        | Orchestrator, decision engine, TTS, audio queue, glowing orb                        |
| Manual Testing Bug Fixes — Session 1 | ✅ Done            | Routing fixes, new pages (QuickInterview, PastInterviews, ResumeAnalysis config UI) |
| Manual Testing Bug Fixes — Session 2 | ✅ Done            | Audio system, auto-listen, dual-voice, follow-up probe logic, interview-end bug     |
| 1D: Job Description Personalization  | ⏸️ After bug fixes | JD parsing, intro sequence, personalized questions                                  |
| 2+: Avatar, Analytics, Enterprise    | 📋 Planned         | —                                                                                   |

### Session 1 Bug Fixes (complete)

- ✅ Fixed "View Past Interviews" routing to wrong page — created `PastInterviews.jsx` stub
- ✅ Created `QuickInterview.jsx` — role grid, difficulty, interviewer picker, "Just Battle" random start
- ✅ `Home.jsx` — fixed quick-action button routes, added symmetric descriptions
- ✅ `ResumeAnalysis.jsx` — added role/difficulty/interviewer config above Start; removed skip-able top-right Start button; added X reset
- ✅ `Interview.jsx` — reads `interviewConfig` from localStorage (set by ResumeAnalysis / QuickInterview)
- ✅ Registered `/past-interviews` and `/quick-interview` routes in `main.jsx`

### Session 2 Bug Fixes (complete)

#### Audio & Recording System

- ✅ Fixed dual-voice / conflicting audio bug: `buildAudioQueue` now takes `isFollowUp` flag — paths are mutually exclusive
- ✅ Fixed duplicate question bug: `usedQuestionIdsRef` Set deduplicates by question text (primary) then ID (secondary); duplicate → `handleEndInterview()`
- ✅ Fixed audio overlap: `playAudioQueue` hard-stops in-flight audio via `activePlayIdRef` before starting new queue
- ✅ Replaced manual record/submit buttons with fully automatic listen system:
  - Auto-starts recording after AI finishes speaking (no button needed)
  - 20s dead-silence detector — only fires if **zero speech** detected (not an answer time limit)
  - 5s silence-after-speech → auto-submit
  - "Want a repeat?" prompt via SpeechSynthesis + natural yes/no detection
  - Motivational messages on second consecutive silence
  - SVG countdown ring, animated waveform bars, per-phase status UI
- ✅ Silence-after-speech timer increased to 5s (from 2.5s) to avoid cutting off mid-thought answers

#### Follow-Up Probe System — Round 1

- ✅ Fixed "weak"/"vague" acknowledgment text sounding like probe questions — `interviewer_personality.py`: replaced all probe-sounding phrases in the `"weak"` and `"vague"` acknowledgment lists with neutral ones (`"Alright, noted."`, `"Got it."`, etc.)
- ✅ Fixed early stage (Q1–3) never generating follow-up probes — `realtime_response_generator.py` → `decide_response_action`: was always returning `"encourage"` for below-adequate early answers; now correctly returns `"probe_vague"` or `"probe_missing"`
- ✅ Fixed probe history blocking all probes after first — `_generate_probe_if_needed`: changed tracking key from `session_id` → `f"{session_id}_{question_id}"` so the 1-probe limit is per-question, not per-entire-session

#### Follow-Up Probe System — Round 2

- ✅ Fixed weak answers with no `is_vague` flag or `missing_elements` bypassing probes — `decide_response_action`: removed the `else → "encourage"` fallback for weak answers in early and mid stage. Any answer below `ADEQUATE_THRESHOLD` now always returns `"probe_missing"` (if elements missing) or `"probe_vague"` — structural detection gaps can no longer silently skip probing
- ✅ Fixed interview ending after answering a follow-up probe poorly — `interview_orchestrator.py` → `handle_follow_up_answer`: `should_proceed` was gated on `current_count >= MAX_FOLLOW_UPS`, but `get_orchestrator()` creates a fresh `InterviewOrchestrator` per request so `_follow_up_counts` always resets to 0. A weak follow-up answer produced `should_proceed=False` → no next question → frontend called `handleEndInterview()`. Fixed: `should_proceed = True` unconditionally — once a follow-up response is received, always proceed to the next question

### Known Bug — Not Yet Fixed

- ⚠️ **Duplicate `get_orchestrator()` in `api.py`** (~line 3911): A second definition overwrites the intended singleton (~line 2352), causing every API request to create a fresh `InterviewOrchestrator`. All instance-level state (`_follow_up_counts`, `_probe_history`) resets on every call. The `should_proceed = True` fix above papers over the worst symptom. Root cause fix requires careful surgery — the JD endpoint depends on the overriding version via FastAPI `Depends` and must not break.

---

## Key Frontend Architecture Notes

- **`Interview_arena.jsx`** owns the entire listen/record/submit cycle. Do not add recording logic anywhere else.
- **`buildAudioQueue(aiResponse, nextQuestion, isFollowUp)`** — the `isFollowUp` boolean is **mandatory**. Wrong value = dual-voice bug returns.
- **`interviewConfig` localStorage key** = `{ role, difficulty, interviewer }` — written by `ResumeAnalysis.jsx` or `QuickInterview.jsx`, read by `Interview.jsx`.
- **Auto-listen state machine phases:** `idle → countdown → speaking → processing` (normal path) or `→ repeat_prompt → repeat_countdown → second_countdown → motivating` (silence path).
- **No `/api/tts` endpoint** — repeat/motivational messages use `SpeechSynthesis` until one is added.

---

## Rules for Claude Code

- **Read this file first every session**
- **Do NOT recreate existing services** — Phase 1C is complete, extend don't duplicate
- **Current focus = bug fixes only** — no Phase 1D until bugs are resolved and verified
- **Audio caching is critical** — always check cache before generating TTS (costs money)
- **Audio queue must be sequential** — never play multiple clips simultaneously
- **`isFollowUp` flag is mandatory** in every `buildAudioQueue` call — see architecture notes above
- **Service layer pattern** — new features go in `backend/services/`, keep orchestrator clean
- **Always use prompt templates** from `backend/prompts/interview_prompts.py`
- **Type hints + async/await** on all backend code
- **Tailwind only** on frontend — no custom CSS unless absolutely necessary
- **Write tests** for any new service added

---

## Bug Fixing Protocol

### Before attempting ANY fix:

1. READ the relevant files first. Do not guess.
2. State your hypothesis in ONE sentence: "The bug is caused by X in file Y"
3. Wait for my confirmation before changing code.

### While fixing:

4. Make the SMALLEST possible change that tests your hypothesis.
5. If a fix doesn't work after 2 attempts with the same hypothesis, STOP.
   - Say: "My hypothesis was wrong. Here's what I've learned so far: [summary]"
   - Propose a NEW hypothesis.

### Never:

- Do not refactor unrelated code while fixing a bug.
- Do not change more than 2 files per fix attempt.
- Do not repeat a fix you already tried.

## Local Dev

```bash
# Backend
cd backend && pip install -r requirements.txt --break-system-packages
uvicorn api:app --reload

# Frontend
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

---

**Developer:** Abhinay Lingala
**Last Updated:** April 1, 2026 | v1.0.4
