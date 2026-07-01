# InterVue Labs — AI Interview Simulator

**Version:** v1.0.5 | **Branch:** `04-05-26-fine-tuning-project` | **Last Updated:** July 1, 2026

An AI-powered interview simulator that conducts intelligent, conversational interviews with real-time voice. Adapts questions based on answers, detects contradictions, remembers context — feels like talking to a real interviewer.

---

## Phase Status

| Phase | Status | Summary |
| ----- | ------ | ------- |
| 1A: Answer Storage | ✅ Complete | DB schema, submit/fetch APIs |
| 1B: Memory & Intelligence | ✅ Complete | Embeddings, semantic search, contradiction detection, 28+ tests |
| 1C: Intelligent Conversation + Voice | ✅ Complete | Orchestrator, decision engine, TTS, audio queue, glowing orb |
| Manual Testing Bug Fixes — Sessions 1 & 2 | ✅ Implemented | Routing, VAD, auto-listen, probes, orchestrator singleton, feedback |
| Manual Testing Bug Fixes — Session 3 | ✅ Implemented | Silero VAD, LLM rephrase, presence monitor, unified TTS, audio bus |
| Manual Verification | 🔄 Pending | **See `testing_log.md` re-test checklist** before Phase 1D |
| 1D: Job Description Personalization | ⏸️ Next | JD parsing, intro sequence, personalized questions |

---

## Tech Stack

| Layer | Technologies |
| ----- | ------------ |
| **Backend** | FastAPI, SQLModel, PostgreSQL (Supabase), JWT + bcrypt |
| **AI** | GPT-4o-mini, OpenAI TTS, `gpt-4o-transcribe`, `text-embedding-3-small` |
| **Frontend** | React 19, Vite 7, Tailwind CSS, Radix/shadcn UI, Framer Motion, Lucide |
| **Voice / Vision** | `@ricky0123/vad-web` (Silero VAD), `@mediapipe/tasks-vision` (face presence) |
| **Other** | jsPDF (client-side feedback PDFs), deterministic ATS scoring |

---

## Project Structure

```
ai-interview/
├── backend/          # FastAPI app, services, tests, audio cache
└── src/              # React frontend (repo root — not frontend/)
    ├── Pages/        # Route-level components
    ├── Components/   # UI components (glowing-orb, glass-card, shadcn ui/)
    └── api/client.js # Central API client
```

### Backend Services

| Service | Purpose |
| ------- | ------- |
| `interview_orchestrator.py` | Master controller — coordinates all intelligence |
| `interview_decision_engine.py` | Decides next action (contradiction, deep dive, probe, etc.) |
| `intelligent_question_generator.py` | Contextual question generation |
| `conversation_context.py` | Memory, topics, summaries |
| `contradiction_detector.py` | Cross-answer inconsistency detection |
| `embedding_service.py` | Semantic search over answers |
| `realtime_response_generator.py` | Acknowledgments, probes, flow control |
| `interviewer_personality.py` | 50+ response variations |
| `tts_service.py` | OpenAI TTS + MP3 cache |
| `question_selector.py` | Question bank selection |
| `job_introduction_generator.py` | JD-based intros (Phase 1D) |

---

## Running Locally

**Prerequisites:** Python 3.11+, Node.js, PostgreSQL connection (`DATABASE_URL` in `backend/.env`)

```bash
# Terminal 1 — Backend
cd backend
python -m venv venv
.\venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn api:app --reload

# Terminal 2 — Frontend (repo root)
npm install
npm run dev
# → http://localhost:5173  (proxies /api → http://127.0.0.1:8000)
```

---

## User Flow

```
Login/Signup → Home
    ├── Upload resume → Resume Analysis → Interview setup → Arena → Feedback
    └── Quick Interview → Interview setup → Arena → Feedback
```

Config (`role`, `difficulty`, `interviewer`) is stored in `localStorage` under `interviewConfig`.

---

## Routes

| Route | Access | Description |
| ----- | ------ | ----------- |
| `/` | Public | Auth gate → `/login` or `/home` |
| `/login`, `/signup` | Public | Authentication |
| `/home` | Protected | Landing — resume upload or quick actions |
| `/resume-analysis` | Protected | ATS analysis + interview config |
| `/quick-interview` | Protected | Start without resume |
| `/interview` | Protected | Interview setup |
| `/interview/arena` | Protected | Live voice interview room |
| `/feedback` | Protected | Scores, quality labels, PDF download |
| `/past-interviews` | Protected | Coming soon stub |

Protected routes use JWT from `localStorage.authToken`. Navbar/footer render via shared `layout.jsx`.

---

## Core Interview Loop

1. AI speaks question via TTS audio queue (`playAudioQueue`)
2. Auto-listen starts (**Silero VAD** on recording stream — see `src/utils/speechVad.js`)
3. User speaks → 5s silence → auto-submit → transcribe
4. Backend orchestrator stores answer, embeds, analyzes, decides next action
5. Returns acknowledgment + (probe OR next question) as audio URLs
6. `buildAudioQueue(isFollowUp)` plays clips sequentially → loop

**Silence path:** 12s no speech → LLM rephrase (on-screen text + TTS) → 12s again → motivation TTS → skip → next question (3 consecutive skips → end)

**Presence path (parallel):** 3s out of frame → warning TTS → 10s countdown → end session. Return to frame → listening resumes.

See `.cursorrules` and `testing_log.md` for full detail.

---

## Key Features

- **Conversational memory** — embeddings + semantic search across the session
- **Adaptive questioning** — contradiction challenges, deep dives, follow-up probes
- **Voice-first UX** — OpenAI TTS, automatic recording, glowing orb visual
- **Dual-mode ATS scoring** — resume-only or resume + job description match
- **Auth** — signup, login, logout, protected routes
- **Feedback PDF** — client-side export via jsPDF

---

## API Highlights

| Endpoint | Purpose |
| -------- | ------- |
| `POST /api/interview/start-with-audio` | Start interview, first question + audio |
| `POST /api/interview/submit-answer-realtime` | Submit answer, get AI response + next question |
| `POST /api/interview/submit-followup` | Follow-up elaborations |
| `POST /api/transcribe` | Speech-to-text |
| `GET /api/audio/{filename}` | Cached TTS MP3s |
| `POST /api/interview/rephrase-question` | LLM rephrase on silence timeout |
| `POST /api/tts/generate` | On-demand TTS (motivation, warnings, wrap-up) |

Full list in `.cursorrules`.

---

## Test Suite

Run from `backend/`:

```bash
pytest
```

| File | Focus |
| ---- | ----- |
| `test_embedding_service.py` | Embedding generation, similarity |
| `test_conversation_context.py` | Context building, topic extraction |
| `test_contradiction_detector.py` | Contradiction detection |
| `test_semantic_search_api.py` | Search API endpoints |
| `test_answer_storage.py` | Answer submission and retrieval |

---

## Session Bug Fixes (Summary)

**Session 1:** Routing fixes, `QuickInterview.jsx`, `PastInterviews.jsx` stub, resume analysis config UI, `interviewConfig` localStorage flow.

**Session 2:** Voice-band VAD, auto-listen state machine, dual-voice fix (`isFollowUp`), ID-based question dedup, orchestrator singleton fix, transcription upgrade, hard-mode probing, feedback quality labels, media cleanup on unmount.

**Session 3 (July 1, 2026):** Silero VAD, 12s silence → LLM rephrase flow, silent-skip intelligence, unified OpenAI TTS audio bus, MediaPipe presence monitor (3s + 10s), cam/mic release on Feedback, post-warning listen resume fix. Full log: **`testing_log.md`**. Tracker: **`bugs.md`**.

Detailed changelog in `.cursorrules`.

---

## Technical Decisions

- **Embeddings stored as JSON** in PostgreSQL TEXT columns (no pgvector required)
- **Answers stored immediately** per question (not at session end) for real-time intelligence
- **Audio cached to disk** before regenerating TTS (cost control)
- **Sequential audio queue** — never play multiple clips simultaneously

---

## Future Enhancements

- Phase 1D: Job description personalization
- Interview history dashboard
- Real-time avatars, analytics, enterprise tiers

---

## License & Copyright

**Copyright © 2025 Abhinay Lingala. All Rights Reserved.**

Permitted: educational use, personal projects, portfolio reference (with attribution).
Not permitted without authorization: commercial use, redistribution as own work, removing copyright notices.

**Contact:** abhinaylingala7@gmail.com

**Author:** Abhinay Lingala
