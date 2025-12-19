# 1. InterVue Labs — Initial MVP Cleanup & Code Refactor Summary

This update finalizes the Initial MVP for the InterVue Labs AI Interview Simulator.
We performed a complete cleanup, structural re-organization, and bug-fix pass to prepare the project for public testing and future feature releases.

## 🔧 Core Improvements
### 1. Full File Cleanup & Refactoring

Removed unused components, placeholder code, and legacy mocks.

Consolidated repeated logic into cleaner React hooks and reusable functions.

Improved folder structure for Components / Pages / Upload / Interview / Feedback.

Added clear separation between UI logic, state, and API interactions.

### 2. Resume Parsing Flow

Removed hardcoded mock resume parsing values.

Connected the Resume Parser to the actual FastAPI backend (OpenAI-powered).

Implemented clean error states:

No resume uploaded

Resume parsing failed

Invalid or empty extracted content

Disabled access to Resume Analysis, Interview, and Feedback when no resume exists.

### 🎙️ 3. Interview System Enhancements

Added safe page redirection:

Users cannot start Interview or view Feedback without uploading a resume first.

Fully cleaned & fixed Interview flow:

Think timer (3 seconds)

Automatic mic start after thinking

Question read-out (TTS)

Start/Stop recording handlers

Transcript cleaning (removes "I don’t know why" junk)

Prevented browser camera/mic from activating before permissions are valid.

Added automatic camera/mic shutdown when user ends interview.

### 🎥 4. Camera & Microphone Handling

No more auto-activation of camera/mic before permissions.

Camera + mic are now requested only when a valid interview plan exists.

Stream and tracks are fully cleaned when:

user ends the interview

component unmounts

user navigates away

### 🧭 5. Navigation & UX

Removed top-level breadcrumb system.

Added clean page-specific browser titles using useEffect.

Removed unnecessary nav bar clutter; simplified design.

Homepage Upload section repositioned for better UI balance.

### 🧪 6. Error Boundaries & Stability

Global ErrorBoundary added to catch unexpected UI crashes.

Clear fallback screens for:

Missing interview plan

Missing feedback results

Parsing errors

Invalid state transitions

### ✨ 7. Branding & Visual Improvements

Updated branding across all pages:

New app name: InterVue Labs

Tagline: Humanlike Interview Simulation

Replaced generic Sparkles icon with branded custom icon support.

Cleaned colors, spacing, shadows, and overall UI consistency.

### 📦 8. File Storage & Local State Management

Centralized all runtime data in localStorage keys:

parsedResumeData

interviewPlan

interviewResults

Added automatic cleanup on entering Home page to prevent stale data flow.

Removed accidental auto-loading of old results.

### 🧼 9. General Cleanup & Minor Fixes

Removed all console spam logs.

Cleaned transcript buffering logic.

Ensured buttons are fully disabled when not usable (Next, Repeat, etc.).

Improved wording across UI components (fun, humanlike tone).

Fixed Next Question bug caused by missing variable (answers undefined).

Fixed Resume Upload slow render issue (useEffect import missing).

## 🎉 Initial MVP is Now Production-Ready for Testing

This refactor stabilizes the entire product, removes all major bugs, and sets up a rock-solid foundation for:

- Speech scoring
- Answer evaluation
- Multi-role interviews
- Dashboard analytics
- User accounts
- Database integration (SQLite → PostgreSQL)





# 2. 🎯 InterVue Labs, Second Upgrades and features – AI Interview Simulator

InterVue Labs is an **AI-powered interview simulation platform** designed to help candidates practice realistic interviews, receive structured feedback, and understand their **ATS (Applicant Tracking System) readiness**.

The platform supports **two intelligent modes**:
- Resume-only analysis
- Resume + Job Description comparison (JD-aware)

Unlike typical AI tools, InterVue Labs combines **deterministic ATS scoring** with **LLM-based human-style evaluation**, ensuring **stable, explainable, and meaningful results**.

---

## 🚀 Features

### ✅ Resume Parsing
- Supports **PDF** and **DOCX**
- Extracts:
  - Skills
  - Keywords
  - Resume structure
  - Potential target roles
- Generates:
  - ATS Score
  - RARe Score (Readability, Applicability, Remarkability)

---

### ✅ Dual-Mode ATS Scoring (Core Feature)

#### 🔹 Mode A — Resume Only
Evaluates **general ATS readiness**:
- Searchability (contact info, links)
- ATS essentials (sections, bullets)
- Content quality (skills, metrics)
- Recruiter best practices

#### 🔹 Mode B — Resume + Job Description
Evaluates **job match + readiness**:
- Hard skill overlap (Jobscan-style)
- Responsibility alignment (Enhancv-style)
- Seniority match
- Missing keyword detection

➡️ ATS scores are **deterministic**, repeatable, and not random.

---

### ✅ Intelligent Interview Question Generation
- Resume-only → skill-based questions
- Resume + JD → JD-aligned questions
- Difficulty-aware (Junior / Associate / Senior)
- Simulated interviewer panel

---

### ✅ Interview Feedback & Scoring
- Scores each answer on:
  - Content
  - Structure
  - Clarity
  - Relevance
  - Confidence
- JD-aware feedback when JD is provided
- Actionable improvement suggestions

---

## 🧠 Architecture Overview
Frontend (React + Vite)
│
├── Resume Upload + Job Description
├── Resume Analysis
├── Interview Simulation
└── Feedback Dashboard
│
▼
Backend (FastAPI)
│
├── Resume Parser
├── Deterministic ATS Engine (ats.py)
├── Question Generator (LLM)
├── Feedback Scorer (LLM + rules)
└── PostgreSQL (Supabase)


---

## 🛠️ Tech Stack

### Frontend
- React
- Vite
- Tailwind CSS

### Backend
- FastAPI
- Pydantic v2
- SQLModel
- OpenAI (GPT-4o-mini)

### Database
- PostgreSQL (Supabase)

---

## 📂 Important Backend Files

| File | Description |
|----|----|
| `api.py` | All API endpoints |
| `ats.py` | Deterministic ATS scoring logic |
| `models.py` | Database models |
| `db.py` | Database initialization |
| `ParseOut` | Strict response schema |

---

## ⚖️ ATS Scoring Logic (Jobscan + Enhancv Inspired)

### 🔹 Resume-Only Mode (100 points)

| Category | Weight |
|------|------|
| ATS Essentials | 25 |
| Searchability | 25 |
| Content Quality | 30 |
| Recruiter Tips | 20 |

---

### 🔹 Resume + Job Description Mode (100 points)

| Category | Weight |
|------|------|
| Hard Skills Match | 35 |
| Responsibilities Match | 25 |
| ATS Essentials + Searchability | 20 |
| Seniority Match | 10 |
| Recruiter Tips | 10 |

**ATS Outputs Include**
- `atsScore`
- `jobMatchScore`
- `matchedKeywords`
- `missingKeywords`
- `atsBreakdown`

---

## 🧩 Issues Faced During Development & Solutions

### ❌ Issue 1: ATS Score Was Identical for All Resumes
**Cause**  
ATS score was generated entirely by the LLM, leading to random and repetitive results.

**Solution**  
Introduced a **deterministic ATS engine (`ats.py`)** inspired by Jobscan and Enhancv.  
LLMs are now used only for qualitative reasoning, not scoring math.

---

### ❌ Issue 2: Interview Feedback Saved Twice
**Cause**  
React StrictMode caused `useEffect()` to execute twice during development.

**Solution**
**js**
const hasScoredRef = useRef(false);
if (hasScoredRef.current) return;
hasScoredRef.current = true;

---

### ❌ Issue 3: Resume + JD Caused OpenAI Validation Errors

**Error**
Input should be a valid dictionary or instance of Rare

**Cause**
LLM occasionally returned "rare": 4.5 instead of a structured object.

**Solution**
Added a repair guard to normalize malformed LLM output before schema validation.

---

### ❌ Issue 4: Keywords Not Affecting Question Generation

**Cause**
A typo in the request payload (eywords instead of keywords).

**Solution**
Corrected the payload key, immediately improving question relevance.

---

### ❌ Issue 5: Resume + JD Logic Was Inconsistent

**Cause**
JD context was parsed but not consistently propagated across endpoints.

**Solution**
- Introduced explicit dual-mode logic
- Job Description applied only if length ≥ 40 characters
- Frontend and backend logic fully synchronized

---

### 🧪 Test Scenarios
#### ✅ Test A — Resume Only

- Upload resume
- Skip job description
- Receive:
- General ATS score
- Resume-based interview questions
- Resume-focused feedback
- Only one feedback record saved

#### ✅ Test B — Resume + Job Description

- Upload resume
- Paste job description
- Receive:
- JD-aligned ATS score
- JD-specific interview questions
- JD-aware feedback
- Only one feedback record saved

---

### ▶️ Running the Project Locally
**Backend**
- cd backend
- python -m venv venv
- source venv/bin/activate
- pip install -r requirements.txt
- uvicorn api:app --reload

**Frontend**
- cd frontend
- npm install
- npm run dev

---

### 🌱 Future Enhancements

- ATS breakdown visualization (Jobscan-style bars)
- JD keyword highlighting in Resume Analysis UI
- Interview history and comparison reports
- Resume improvement recommendations
- Authentication and user profiles

---

### 📌 Final Note

InterVue Labs intentionally avoids LLM-only scoring for ATS and instead uses a hybrid AI + deterministic architecture.
This approach ensures evaluations are trustworthy, explainable, and production-ready, reflecting how real-world AI systems should be designed.

This project demonstrates responsible AI system design by combining machine intelligence with rule-based guarantees.
