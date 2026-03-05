# InterVue Labs - AI Interview Simulator - Development Guide

## Project Overview

AI-powered interview simulator that conducts intelligent, conversational interviews with real-time voice interaction. Goes beyond basic Q&A by remembering entire conversations, detecting patterns and contradictions, and adapting questions based on candidate responses.

**Goal:** Portfolio project demonstrating advanced AI/LLM orchestration, conversational systems, and real-time audio processing for recruiters and job seekers.

**Status:** Phase 1C COMPLETE (Tasks 1-13 + Glowing Orb). Production-ready conversational interview system with voice, memory, and visual intelligence.

---

## Tech Stack

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL (Supabase)
- **Authentication:** JWT
- **LLM:** OpenAI GPT-4o-mini (question generation, decision making)
- **TTS:** OpenAI Text-to-Speech API (voice synthesis)
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dimensions)
- **Vector Search:** Semantic similarity via cosine distance
- **Audio:** MP3 generation and caching

### Frontend
- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS v3
- **Icons:** Lucide React
- **Audio:** HTML5 Audio API with queue management
- **Animations:** CSS animations + Framer Motion

### AI Services
- **Question Generation:** GPT-4o-mini with contextual prompts
- **Pattern Detection:** Semantic search across answer embeddings
- **Contradiction Detection:** LLM-based with confidence scoring
- **Voice Synthesis:** OpenAI TTS (alloy, nova voices)
- **Memory System:** Conversation context + semantic embeddings

---

## Environment Variables
```bash
# Backend (.env)
OPENAI_API_KEY=sk-...              # LLM + TTS + embeddings
DATABASE_URL=postgresql://...       # Supabase connection
JWT_SECRET=your-secret-key
SUPABASE_URL=https://...
SUPABASE_KEY=...

# Frontend (.env)
VITE_API_URL=http://localhost:8000  # Dev
# VITE_API_URL=https://api.intervuelabs.com  # Production
```

---

## Project Structure
```
InterVue-Labs/
├── backend/
│   ├── api.py                          # FastAPI endpoints (12+ routes)
│   ├── db.py                           # Database models
│   ├── models.py                       # Pydantic schemas
│   ├── ats.py                          # ATS scoring engine
│   │
│   ├── services/                       # 🧠 Intelligence Layer (11 services)
│   │   ├── interview_orchestrator.py       # Master controller
│   │   ├── intelligent_question_generator.py
│   │   ├── interview_decision_engine.py
│   │   ├── conversation_context.py         # Memory system
│   │   ├── contradiction_detector.py       # Pattern detection
│   │   ├── embedding_service.py            # Vector embeddings
│   │   ├── realtime_response_generator.py
│   │   ├── interviewer_personality.py      # 50+ response variations
│   │   ├── tts_service.py                  # Text-to-speech
│   │   ├── question_selector.py            # Question bank
│   │   └── job_introduction_generator.py   # JD personalization
│   │
│   ├── prompts/
│   │   └── interview_prompts.py            # LLM prompt templates (7 types)
│   │
│   ├── data/
│   │   └── question_bank.json              # 100+ real interview questions
│   │
│   ├── audio_cache/                    # 🔊 Generated TTS files
│   │   └── *.mp3
│   │
│   ├── migrations/
│   │   ├── 001_uuid_migration.sql
│   │   ├── 002_add_embeddings.sql
│   │   └── 003_job_descriptions.sql
│   │
│   └── tests/                          # 🧪 Test suite (28+ tests)
│       ├── test_embedding_service.py
│       ├── test_conversation_context.py
│       ├── test_contradiction_detector.py
│       ├── test_semantic_search_api.py
│       └── test_integration_phase1b.py
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── Interview.jsx               # Main interview UI
        │   ├── Dashboard.jsx
        │   └── Results.jsx
        │
        └── components/
            └── Interview/
                ├── GlowingOrb.jsx          # 🔵 AI presence visual
                ├── ConversationIndicator.jsx
                ├── AIResponseDisplay.jsx
                ├── QuestionDisplay.jsx
                └── AnswerInput.jsx         # 🎤 Voice recorder
```

---

## System Architecture

### High-Level Flow
```
User speaks answer
    ↓
Frontend records + transcribes (STT)
    ↓
POST /api/interview/submit-answer-realtime
    ↓
Interview Orchestrator
    ├─→ Store answer + generate embedding
    ├─→ Analyze quality (STAR format, specificity)
    ├─→ Detect patterns (contradictions, repetitions)
    ├─→ Decision Engine decides next action
    │   ├─ Contradiction? → Challenge question
    │   ├─ Topic repeated 3x? → Deep dive
    │   ├─ Vague answer? → Follow-up probe
    │   └─ Good answer? → Next question
    ├─→ Question Generator creates question
    ├─→ TTS converts to audio
    └─→ Return response + audio URLs
    ↓
Frontend plays audio queue
    ├─ Acknowledgment: "Great example!"
    ├─ Follow-up: "Tell me more about X"
    ├─ Transition: "Let's move on"
    └─ Next question
    ↓
Glowing orb appears during AI speech
    ↓
User hears question → answers → cycle repeats
```

---

## Database Schema

### Key Tables

**interview_sessions**
- `id` (UUID, PK)
- `user_id` (UUID, FK)
- `role` (string)
- `difficulty` (enum: easy/medium/hard)
- `started_at`, `completed_at`

**interview_answers**
- `id` (UUID, PK)
- `session_id` (UUID, FK)
- `question_id` (int)
- `question_text`, `question_intent`
- `user_answer` (text)
- `transcript_raw` (text)
- `embedding` (JSON - 1536 dimensions)
- `audio_duration_seconds` (float)
- `created_at`

**job_descriptions**
- `id` (UUID, PK)
- `session_id` (UUID, FK)
- `company_name`, `job_title`
- `responsibilities`, `requirements` (JSON arrays)
- `role_description` (text)

---

## Intelligence System

### 1. Memory & Context

**Embedding Generation:**
- Every answer → OpenAI `text-embedding-3-small` (1536 dimensions)
- Stored as JSON in database
- Used for semantic similarity search

**Semantic Search:**
- Cosine similarity to find related answers
- Threshold: >0.85 for strong relevance
- Powers referencing questions

**Conversation Context:**
- Builds summary of all answers
- Extracts topics discussed
- Tracks recent context (last 5 answers)

### 2. Pattern Detection

**Contradiction Detection:**
- Semantic similarity + LLM analysis
- Confidence scoring (0.0-1.0)
- Timeline overlap detection
- Only challenges if confidence >0.7 and question >=5

**Topic Repetition:**
- Tracks semantic mentions (not just keywords)
- "Python" = "programming in Python" = "used Python"
- Triggers deep dive after 3+ mentions

**Answer Quality Analysis:**
- STAR format completeness
- Specificity score (concrete vs vague)
- Word count, metrics presence
- Vagueness detection ("we", "things", "stuff")

### 3. Decision Engine

**Priority Logic:**

1. **Challenge Contradiction** (if Q>=5, confidence>0.7, not recent)
2. **Deep Dive** (if topic mentioned 3+ times, Q>=4)
3. **Follow-up Probe** (if answer vague/incomplete)
4. **Reference Past** (if similar answer exists, similarity>0.85)
5. **Standard Question** (default progression)

**Conversation Stages:**
- Early (Q1-3): More lenient, encouraging
- Mid (Q4-7): Balanced, probing
- Late (Q8+): Expect higher quality

### 4. Question Generation

**7 Question Types:**

1. **Standard** - Regular progression
2. **Follow-up** - Probe for missing STAR elements
3. **Reference** - "Earlier you mentioned X..."
4. **Challenge** - Address contradiction
5. **Deep Dive** - Explore expertise area
6. **Contextual** - Rich conversation context
7. **Job-Specific** - Tailored to JD

**Question Sources:**
- Real question bank (100+ questions from actual interviews)
- LLM-generated (contextual, based on conversation)
- Hybrid approach (real question + AI enhancement)

### 5. Personality & Responses

**50+ Response Variations:**
- Acknowledgments: "Great example!", "I appreciate the detail", "Interesting perspective"
- Follow-ups: "Tell me more", "Can you elaborate?", "Walk me through that"
- Transitions: "Let's shift gears", "Moving on", "Now, about..."

**Response Selection:**
- Tracks last 5 responses to avoid repetition
- Quality-based selection (excellent vs adequate vs weak)
- Context-aware (early vs late interview)

### 6. Audio System

**TTS Generation:**
- OpenAI TTS API (tts-1 model)
- Voices: alloy (default), nova (warm), echo (authoritative)
- Speed: 0.9-1.0 (clear, measured)
- Context-aware (questions slower, acknowledgments normal)

**Audio Caching:**
- MP3 files saved to `backend/audio_cache/`
- Cache key = hash(text + voice + speed)
- Reduces API costs, faster responses

**Audio Queue:**
- Sequential playback (no overlap)
- Order: acknowledgment → probe → transition → question
- Visual sync with glowing orb

---

## API Endpoints

### Core Interview Flow

**POST /api/interview/start-with-audio**
- Starts interview session
- Returns first question + audio
- Input: `{user_id, role, difficulty, generate_audio}`

**POST /api/interview/submit-answer-realtime**
- Submits answer + gets AI response + next question
- Input: `{session_id, question_id, user_answer, transcript_raw, audio_duration_seconds, ...}`
- Returns: `{answer_stored, ai_response, next_question, flow_control}`

**POST /api/interview/submit-followup**
- Handles follow-up elaborations
- Re-analyzes combined quality
- Decides if ready to proceed

**GET /api/interview/conversation-state/{session_id}**
- Returns conversation summary, topics, patterns
- Useful for debugging

### Audio & Job Description

**GET /api/audio/{filename}**
- Serves MP3 files from cache
- Headers: Content-Type: audio/mpeg

**POST /api/interview/start-with-job-description**
- Starts interview with JD introduction
- Generates warm welcome + role overview
- Returns introduction sequence + first question

**POST /api/job-description/parse**
- Parses uploaded JD (PDF/text)
- Extracts structured data via LLM

---

## Frontend Components

### Main UI (Interview.jsx)

**State Management:**
- `currentQuestion` - Active question
- `isAISpeaking` - Audio playback status
- `audioQueue` - Sequential audio clips
- `aiResponse` - Acknowledgment, probes, transitions
- `flowControl` - Should proceed or wait for follow-up
- `questionMetadata` - Patterns, stage, decision reason

**Audio Queue System:**
```javascript
audioQueue: [
  {url: "/api/audio/ack_abc.mp3", label: "acknowledgment"},
  {url: "/api/audio/probe_def.mp3", label: "follow_up"},
  {url: "/api/audio/question_ghi.mp3", label: "question"}
]
```

Plays sequentially with visual feedback.

### Visual Components

**GlowingOrb.jsx** (🔵 AI Presence)
- Appears when AI speaking
- Blue gradient orb, 120px diameter
- Pulsing animation (1.2s rhythm)
- 3-4 floating particles inside
- Premium sci-fi aesthetic

**ConversationIndicator.jsx**
- 🔗 Reference badge ("Connected to Q2")
- ✨ Pattern detection ("Python mentioned 3x")
- 🤔 Clarification badge
- Question type badges (standard/follow-up/challenge/deep-dive/reference)

**AIResponseDisplay.jsx**
- Shows acknowledgments, probes, transitions
- Speech bubble style
- Color-coded by type

---

## Testing Strategy

### Test Coverage

**Unit Tests (28+ tests):**
- Embedding service (7 tests)
- Conversation context (7 tests)
- Contradiction detector (7 tests)
- Semantic search API (7 tests)

**Integration Tests (6 tests):**
- End-to-end workflows
- Multi-service orchestration

**Edge Cases (12 tests):**
- Long answers (500+ words)
- One-word answers
- Special characters
- Concurrent submissions
- 100+ answer sessions

**Manual Test Scripts:**
- `test_answer_storage_flow.sh`
- `test_performance.sh`
- `success_criteria_check.sh`

### Success Criteria

**Core Functionality:**
- ✅ Semantic search finds related answers
- ✅ Repetition detected (>85% accuracy)
- ✅ Contradictions detected (<2s)
- ✅ Conversation context includes all answers
- ✅ Embeddings auto-generated

**Performance:**
- Answer processing: <3 seconds
- Audio generation: <2 seconds
- Pattern detection: Real-time (<500ms)
- Sequential audio: No gaps or overlaps

---

## ✅ Completed Phases

### Phase 1A: Answer Storage (COMPLETE)
- Database schema: `interview_answers` table
- API: POST /submit, GET /answers/{session_id}
- Real-time storage with metadata

### Phase 1B: Memory & Intelligence (COMPLETE)
- Embedding generation (1536 dimensions)
- Semantic search (cosine similarity)
- Conversation context builder
- Contradiction detector
- Pattern detection (repetitions, interests)
- 28 automated tests + manual scripts

### Phase 1C: Intelligent Two-Way Conversation (COMPLETE)

**Tasks 1-3: Core Intelligence**
- ✅ Task 1: Intelligent Question Generator
- ✅ Task 2: Interview Decision Engine
- ✅ Task 3: Interview Orchestrator

**Tasks 4-7: API & UI Foundation**
- ✅ Task 4: API Endpoints (Basic)
- ✅ Task 5: Prompt Templates (7 types)
- ✅ Task 5B: Real Question Integration (100+ questions)
- ✅ Task 6: Frontend Updates (Basic)
- ✅ Task 7: Visual Indicators

**Tasks 8-9: Personality & Real-Time**
- ✅ Task 8: Interviewer Personality (50+ variations)
- ✅ Task 9: Real-Time Response Generator

**Tasks 10-12: Voice & Audio**
- ✅ Task 10: TTS Service (OpenAI integration)
- ✅ Task 11: Real-Time Orchestrator Updates
- ✅ Task 12: Real-Time API Endpoints

**Tasks 13-14: Conversational UI**
- ✅ Task 13: Conversational UI (audio queue, visual feedback)
- ✅ Task 14: Glowing Orb (AI presence visual)

### Phase 1D: Job Description Personalization (PLANNED)
- ⏸️ Task 14A: Job Introduction Generator (partially complete)
- Introduction sequence generation
- JD parsing and extraction
- Personalized first question

---

## 🚀 Future Roadmap

### Phase 2: Advanced Features (PLANNED)

**Avatar & Emotions:**
- Full avatar with facial animations
- Emotion detection from voice tone
- Lip-sync with TTS
- Multiple avatar styles

**Analytics & Insights:**
- Performance metrics dashboard
- Answer quality scoring
- Strengths/weaknesses analysis
- Progress tracking over time
- Comparison with industry benchmarks

**Multi-Interviewer Panel:**
- Simulate panel interviews
- Different interviewer personalities
- Role-based questioning (technical lead, HR, manager)

**Industry-Specific Modes:**
- Tech (FAANG-style)
- Finance (case interviews)
- Consulting (framework-based)
- Healthcare, Legal, etc.

### Phase 3: Enterprise Features (PLANNED)

**Company Integration:**
- Custom question banks per company
- Company-specific scoring criteria
- White-label branding

**Candidate Screening:**
- Automated initial screening
- Scoring and ranking
- Integration with ATS systems

**Team Collaboration:**
- Shared interview sessions
- Collaborative evaluation
- Interview scheduling

### Phase 4: Platform Expansion (PLANNED)

**Mobile Apps:**
- iOS and Android native apps
- Offline practice mode
- Push notifications for daily practice

**Integrations:**
- LinkedIn profile import
- Calendar integration
- Job board connections

**Monetization:**
- Free tier (5 interviews/month)
- Pro tier ($9.99/month)
- Enterprise (custom pricing)

---

## Known Issues & Limitations

### Current Limitations

1. **No Avatar Yet** - Using glowing orb placeholder
2. **English Only** - No multilingual support
3. **Audio in Browser Only** - No mobile app TTS
4. **Single Interview Style** - No industry customization yet
5. **Manual JD Upload** - No automated job board integration

### Technical Debt

1. **Audio Cache Management** - No cleanup of old files
2. **Rate Limiting** - No API rate limits implemented
3. **Error Recovery** - Limited retry logic for API failures
4. **Scalability** - Single-server deployment
5. **Testing Coverage** - Frontend tests not automated

### Performance Considerations

- **Cold Start:** First TTS call may be slow (~5s)
- **Embedding Generation:** Adds ~1-2s per answer
- **Sequential Questions:** Not parallelized (intentional for conversation flow)
- **Memory Usage:** Grows with session length (acceptable for 10-15 questions)

---

## Development Guidelines

### When Working on This Project

**1. Always Read This File First**
- Understand current state
- Check what's complete vs planned
- Review architecture before coding

**2. Service Layer Pattern**
- New features → new service in `backend/services/`
- Keep orchestrator clean (coordination only)
- Services should be testable in isolation

**3. Prompts are Key**
- LLM quality depends on prompt quality
- Always use prompt templates from `backend/prompts/`
- Test prompts extensively before deployment

**4. Audio Caching is Critical**
- Every TTS call costs money
- Always check cache before generating
- Use descriptive cache keys

**5. Frontend State Management**
- Audio queue must be sequential
- Never play multiple audio clips simultaneously
- Visual feedback synced with audio state

**6. Testing is Non-Negotiable**
- Write tests for new services
- Update integration tests
- Manual testing checklist in testing guide

### Code Style

**Backend:**
- Type hints everywhere
- Pydantic models for validation
- Async/await for I/O operations
- Docstrings for all public methods

**Frontend:**
- Functional components + hooks
- Tailwind for styling (no custom CSS unless necessary)
- Descriptive variable names
- Comments for complex logic

---

## Deployment

### Current Status
- **Backend:** Not deployed yet
- **Frontend:** Not deployed yet
- **Database:** Supabase (hosted PostgreSQL)

### Deployment Plan (When Ready)

**Backend:**
- Platform: Render / Railway / Fly.io
- Requirements: Python 3.11+, PostgreSQL access
- Environment: Production `.env` with all keys
- Build: `pip install -r requirements.txt`
- Start: `uvicorn api:app --host 0.0.0.0 --port $PORT`

**Frontend:**
- Platform: Vercel / Netlify
- Build: `npm run build`
- Environment: `VITE_API_URL` pointing to backend

---

## Key Metrics

### What We've Built

- **11 Core Services** - Complete intelligence system
- **7 Prompt Templates** - Contextual question generation
- **100+ Real Questions** - Authentic interview questions
- **50+ Response Variations** - Natural personality
- **28+ Automated Tests** - Comprehensive coverage
- **5 UI Components** - Polished interview experience
- **12+ API Endpoints** - Complete backend interface

### Technical Achievements

- **Semantic Memory** - 1536-dimensional embeddings
- **Pattern Detection** - Real-time contradictions and repetitions
- **Contextual Questioning** - References past answers naturally
- **Voice Conversation** - Full TTS integration with caching
- **Visual Intelligence** - Transparent AI decision-making
- **Quality Analysis** - STAR format, specificity, completeness

---

## Contact & Links

**Developer:** [Your Name]  
**Email:** [your-email@example.com]  
**LinkedIn:** [Your LinkedIn]  
**GitHub:** https://github.com/yourusername/intervue-labs  

---

## License

Copyright © 2025 [Your Name]. All Rights Reserved.

See LICENSE file for details.

---

**Last Updated:** March 5, 2026  
**Current Version:** v1.0.0 (Phase 1C Complete)  
**Next Milestone:** Phase 2 (Advanced Features)

---

## Quick Start for New Developers
```bash
# Backend
cd backend
pip install -r requirements.txt --break-system-packages
cp .env.example .env  # Add your API keys
uvicorn api:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Access at http://localhost:5173
```

---

## Notes for Claude Code

When working on this project:

1. **Always check this file first** - Know what's done and what's planned
2. **Phase 1C is complete** - Don't recreate existing services
3. **Use existing services** - Extend, don't duplicate
4. **Test everything** - We have comprehensive test suite
5. **Audio is cached** - Don't regenerate unnecessarily
6. **Follow the architecture** - Service layer pattern established
7. **Prompts matter** - Quality comes from good prompts
8. **Memory is key** - Embeddings drive intelligence

**Most Important:** This is a conversational AI system, not a chatbot. Every decision should enhance the feeling of talking to a real interviewer who remembers, adapts, and responds naturally.
