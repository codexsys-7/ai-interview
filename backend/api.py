# This is my final version of MVP

from dotenv import load_dotenv
load_dotenv()

from ats import compute_ats_score


import io, json, os, re, logging, tempfile, time, random
from typing import Any, Dict, List, Optional

import fitz          
import docx
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from openai import OpenAI
from openai import RateLimitError

from typing import Optional

from dotenv import load_dotenv
from pathlib import Path


from sqlmodel import Session, select
from db import engine, init_db, InterviewSession
from models import Resume, User

from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta

from fastapi.middleware.cors import CORSMiddleware



# Load .env from this file's directory and OVERRIDE any existing env vars
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)


# ---------- FastAPI & CORS ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)



@app.options("/{path:path}")
def preflight_handler(path: str):
    return Response(status_code=200)


@app.options("/{path:path}")
def options_handler(path: str):
    return Response(status_code=200)


@app.get("/api/__debug")
def debug():
    return {
        "ok": True,
        "file": __file__,
        "origins": ["http://localhost:5173", "http://127.0.0.1:5173"],
    }



# These are my Config + helpers
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "dev_secret_change_me")
JWT_ALG = "HS256"
JWT_EXPIRE_MIN = 60 * 24 * 7  # 7 days

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


class SignupReq(BaseModel):
    full_name: str
    email: EmailStr
    password: str

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class AuthResp(BaseModel):
    token: str
    user: dict


# These are my Longin and Sign Up page Endpoints.
@app.post("/api/auth/signup", response_model=AuthResp)
def signup(req: SignupReq):
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    # bcrypt limit: 72 bytes (not chars)
    if len(req.password.encode("utf-8")) > 100:
        raise HTTPException(status_code=400, detail="Password too long (max 100 bytes). Use a shorter password.")


    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == req.email.lower())).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered.")

        user = User(
            full_name=req.full_name.strip(),
            email=req.email.lower().strip(),
            password_hash=hash_password(req.password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        token = create_access_token(user.id, user.email)
        return AuthResp(token=token, user={"id": user.id, "full_name": user.full_name, "email": user.email})


@app.post("/api/auth/login", response_model=AuthResp)
def login(req: LoginReq):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == req.email.lower())).first()

        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account disabled.")

        token = create_access_token(user.id, user.email)
        return AuthResp(token=token, user={"id": user.id, "full_name": user.full_name, "email": user.email})


# This is a startup endpoint
@app.on_event("startup")
def on_startup():
    # Create tables if they do not exist
    init_db()

# ---------- OpenAI client ----------
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
print("OPENAI KEY DEBUG:", (OPENAI_KEY or "MISSING")[:8], "...", (OPENAI_KEY or "")[-4:])

client = OpenAI(api_key=OPENAI_KEY)


def call_openai_with_backoff(*, messages, model="gpt-4o-mini", response_format=None, temperature=0.3):
    """Retries OpenAI calls with exponential backoff to avoid 429 rate-limit errors."""
    for attempt in range(5):
        try:
            return client.chat.completions.create(
                model=model,
                temperature=temperature,
                response_format=response_format,
                messages=messages,
            )
        except RateLimitError as e:
            wait = min(20, 2 ** attempt) + random.random()
            print(f"[WARN] Rate limit hit. Retrying in {wait:.1f}s...")
            time.sleep(wait)
    # Final attempt (let it raise if still failing)
    return client.chat.completions.create(
        model=model,
        temperature=temperature,
        response_format=response_format,
        messages=messages,
    )


SYSTEM_PROMPT = """
You are an ATS + resume analysis engine.

Your job is to ANALYZE THE GIVEN RESUME TEXT ONLY and return STRICT JSON.

Rules:
- Use ONLY information that is explicitly present or clearly implied in the resume.
- Avoid generic guesses like "team player", "good communication", etc. unless those words exist.
- Pay close attention to:
  - Tools, libraries, frameworks, languages, platforms
  - Domains (finance, banking, healthcare, e-commerce, technology, telecommunications, advertising, media and entertainment, manufacturing and industrial, textile and fashion, energy, oil and gas, transportation, government and public sector, education, real estate and construction, hospitality, gaming, robotics, cybersecurity.)
  - Seniority level (intern, junior, senior, lead, architect)
  - Measurable impact (%, $, time saved) if present
- If something is unclear, LEAVE IT OUT instead of hallucinating.

Schema expectations:
- skills:
  - 5-30 items.
  - Each item must be a specific skill or tool actually supported by the text.
  - Examples: "Python", "FastAPI", "Kafka", "Time-series forecasting", "ATS optimization".
- fallbackRoles:
  - Up to 4 realistic role titles based on the experience in the resume.
  - Examples: "Data Scientist", "ML Engineer", "Python Developer", "Business Analyst".
- rare:
  - readability, applicability, remarkability, total — floats between 0 and 5 with 1 decimal.
  - total must be the average of the first three, rounded to 1 decimal.
  - Be discriminative: 3.0 is "okay", 4.0 is "strong", 4.8+ is "exceptional".
- atsScore:
  - 0-100.
  - Base it on:
    - Keyword density vs skills/experience,
    - Clarity of section headings,
    - Simplicity of layout (no tables/columns),
    - Match between skills and likely target roles.
- atsSuggestions:
  - If atsScore < 90: return 3-7 concrete, resume-specific suggestions.
  - Each suggestion must mention something from THIS resume (a missing keyword, weak bullet, etc.).
  - If atsScore ≥ 90: return [].
- keywords:
  - 3-15 short phrases.
  - Use domain + tech combos where possible, e.g. "healthcare analytics", "ETL pipelines", "LLM-powered chatbots".

Response:
- Return ONLY compact JSON that conforms exactly to the provided schema.
- No markdown, no prose outside JSON.
""".strip()


SYSTEM_PROMPT_JD = """
You are an ATS + job-match engine.

You will receive:
- RESUME TEXT
- JOB DESCRIPTION TEXT

You MUST compare the resume against the job description and return STRICT JSON ONLY.

Rules:
- Use ONLY info that exists in the resume or JD. No hallucinations.
- skills: 5-30 items from the resume ONLY (tools, frameworks, methods, domain skills).
- keywords: 5-20 important phrases derived from the JD + resume.
- fallbackRoles: up to 4 roles based primarily on the resume.
- rare: 0-5 with 1 decimal (readability, applicability, remarkability, total=avg rounded 1 decimal).
  * "applicability" MUST reflect match to the job description when JD is present.
- atsScore: 0-100. This MUST reflect how well the resume matches the job description.

ATS rubric (match-based):
- Searchability (20): clean headings, contact signals, standard sections inferred from text.
- Hard skills match (35): tools/tech overlap with JD requirements.
- Responsibilities match (25): resume evidence for JD responsibilities.
- Seniority match (10): job level alignment.
- Recruiter tips (10): metrics, impact, clarity, web presence.

Also include:
- jobMatchScore: 0-100 (can be same as atsScore, but include it)
- matchedKeywords: 5-20 strings found in both resume and JD
- missingKeywords: 5-30 important JD terms not found in resume

atsSuggestions:
- If atsScore < 90 return 4-8 JD-specific suggestions.
- Suggestions MUST reference missing keywords/responsibilities from this JD.
- If atsScore >= 90 return [].

- rare MUST be a JSON object with keys: readability, applicability, remarkability, total.
  Example: "rare": {"readability": 4.2, "applicability": 4.0, "remarkability": 3.8, "total": 4.0}
  NEVER return rare as a number.


Return ONLY JSON. No markdown. No extra keys outside schema. no prose outside JSON.
""".strip()



# ---------- Helpers ----------
def extract_pdf_text(data: bytes) -> str:
    with fitz.open(stream=data, filetype="pdf") as doc:
        return "\n".join(p.get_text() for p in doc)

def extract_docx_text(data: bytes) -> str:
    d = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in d.paragraphs)

def clean_text(t: str) -> str:
    t = t.replace("\x00", " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{2,}", "\n", t)
    return t.strip()

# ------------------- Question generation helpers (LLM) -------------------
INTERVIEWER_HINTS = {
    "Manager": "delivery, prioritization, stakeholder communication, sprint planning, on-call ownership",
    "HR": "culture add, values alignment, teamwork, conflict resolution, communication",
    "CEO": "business outcomes, vision, strategy, growth levers, risk, trade-offs, impact",
    "President": "org-wide impact, strategic initiatives, competitive advantage, ROI",
    "Vice President": "cross-functional leadership, scaling, OKRs, portfolio prioritization",
    "CFO": "financial impact, unit economics, cost/benefit, budgeting, margins, ROI",
}

def interviewer_to_hint(name: str) -> str:
    return INTERVIEWER_HINTS.get(name, "mix of technical depth, problem solving, and business impact")

def count_for_level(level: str) -> int:
    lvl = (level or "").lower()
    if lvl == "senior": return 26
    if lvl == "associate": return 25
    if lvl == "junior": return 20
    return 15  # Intern

def questions_schema_text() -> str:
    return """
Return ONLY JSON with this shape:
{
  "questions": [
    {
      "prompt": string,
      "topic": string,
      "interviewer": string,
      "type": string,
      "idealAnswer": string,
      "rubric": {
        "content": string,
        "clarity": string,
        "structure": string
      }
    }
  ]
}
No extra keys. No prose outside JSON. No markdown.
""".strip()

def build_questions_system_prompt() -> str:
    return (
        "You are an interview question generator. "
        "You must return STRICT JSON ONLY (no prose, no markdown) following the given schema."
    )


def build_questions_user_prompt(
    role: str,
    difficulty: str,
    interviewers: List[str],
    requested_total: int,
    skills: List[str],
    keywords: List[str],
    job_description: Optional[str] = None,
) -> str:
    total_allowed = count_for_level(difficulty)
    target = min(requested_total or total_allowed, total_allowed)

    if not interviewers:
        interviewers = ["Interviewer"]

    hints = "\n".join(f"- {n}: {interviewer_to_hint(n)}" for n in interviewers)

    skills_text = ", ".join(skills[:30]) if skills else "Not provided"
    kw_text = ", ".join(keywords[:20]) if keywords else "Not provided"

    jd_text = (job_description or "").strip()
    has_jd = len(jd_text) >= 40

    jd_block = ""
    if has_jd:
        jd_block = f"""
JOB DESCRIPTION (PRIMARY GUIDANCE):
{jd_text[:7000]}

IMPORTANT:
- Questions must align to the responsibilities, tools, and requirements in the JD.
- Prefer questions that verify the candidate can do the JD tasks in practice.
- If the JD mentions specific tools (e.g., Kafka, Airflow, Snowflake), include at least 2–4 questions on them.
- Include 2–3 gap-check questions where a candidate may be weak (missing keywords).
""".strip()

    return f"""
ROLE: {role or "Candidate"}
DIFFICULTY: {difficulty or "Junior"}

CANDIDATE PROFILE FROM RESUME:
- Core skills: {skills_text}
- Keywords / domains: {kw_text}

{jd_block}

INTERVIEWER PANEL & FOCUS:
{hints}

GOAL:
- Produce exactly {target} total questions.
- The FIRST 3 must be welcoming warm-up questions (type="warmup") in this order:
  1) "Could you please walk me through your professional background?"
  2) "What attracted you to this opportunity and our organization?"
  3) "What would you consider to be your key strengths and areas for improvement?"

- The remaining {max(target - 3, 0)} must:
  - Mix technical and behavioral questions.
  - If JOB DESCRIPTION is provided, prioritize JD alignment over generic role questions.
  - Make questions concrete and realistic: tools, trade-offs, debugging, metrics, delivery, ownership.
  - Avoid repeating the same concept with different wording.

DIFFICULTY CALIBRATION:
- Senior: strategy, architecture, trade-offs, leadership, business impact.
- Junior/Intern: fundamentals, reasoning, learning mindset, basic design decisions.

SCHEMA (must follow exactly):
{questions_schema_text()}
""".strip()



# ---------- Response schema (validates the LLM output) ----------
class Rare(BaseModel):
    readability: float = Field(ge=0, le=5)
    applicability: float = Field(ge=0, le=5)
    remarkability: float = Field(ge=0, le=5)
    total: float = Field(ge=0, le=5)

class ParseOut(BaseModel):
    skills: List[str]
    fallbackRoles: List[str]
    rare: Rare
    atsScore: int = Field(ge=0, le=100)
    atsSuggestions: List[str]
    keywords: List[str] = []

    # NEW: ATS breakdown + JD match fields (optional so resume-only still works)
    atsBreakdown: Optional[Dict[str, Any]] = None

    # JD-mode extras (optional)
    jobMatchScore: Optional[int] = None
    matchedKeywords: Optional[List[str]] = []
    missingKeywords: Optional[List[str]] = []
    hasJobDescription: Optional[bool] = False




# ---------- OpenAI call with strict JSON ----------
def call_openai(resume_text: str, job_desc_text: Optional[str] = None) -> Dict[str, Any]:
    resume_snippet = (resume_text or "")[:28000]
    jd_snippet = (job_desc_text or "").strip()[:12000]

    has_jd = bool(job_desc_text and len(job_desc_text.strip()) >= 40)

    system_prompt = SYSTEM_PROMPT_JD if has_jd else SYSTEM_PROMPT
    user_content = (
        f"RESUME TEXT:\n\n{resume_snippet}\n\nJOB DESCRIPTION TEXT:\n\n{jd_snippet}"
        if has_jd
        else f"RESUME TEXT:\n\n{resume_snippet}"
    )

    # 1) Call OpenAI and parse JSON
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.3,
        presence_penalty=0.2,
        frequency_penalty=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    )

    raw_json = resp.choices[0].message.content
    data = json.loads(raw_json)

        # --- Normalize/repair model output for Rare if it comes back malformed ---
    rare_val = data.get("rare")

    if isinstance(rare_val, (int, float)):
        # Model incorrectly returned rare as a number, convert to structured object
        v = float(rare_val)
        data["rare"] = {
            "readability": v,
            "applicability": v,
            "remarkability": v,
            "total": v,
        }
    elif isinstance(rare_val, dict):
        # Ensure required keys exist
        r = rare_val
        data["rare"] = {
            "readability": float(r.get("readability", 4.0) or 4.0),
            "applicability": float(r.get("applicability", 4.0) or 4.0),
            "remarkability": float(r.get("remarkability", 4.0) or 4.0),
            "total": float(r.get("total", 0.0) or 0.0),
        }
    else:
        # Missing or wrong type
        data["rare"] = {
            "readability": 4.0,
            "applicability": 4.0,
            "remarkability": 4.0,
            "total": 4.0,
        }


    skills_val = data.get("skills")
    if isinstance(skills_val, str):
        data["skills"] = [s.strip() for s in skills_val.split(",") if s.strip()]
    elif not isinstance(skills_val, list):
        data["skills"] = []



    # 2) Validate to ParseOut -> NOW parsed exists
    parsed = ParseOut.model_validate(data).model_dump()
    parsed["hasJobDescription"] = has_jd

    # 3) Apply deterministic ATS override (Jobscan/Enhancv style)
    ats = compute_ats_score(resume_text, job_desc_text if has_jd else None)

    parsed["atsScore"] = int(ats.get("atsScore", parsed.get("atsScore", 0)) or 0)
    parsed["atsBreakdown"] = ats.get("breakdown")

    parsed["jobMatchScore"] = ats.get("jobMatchScore")
    parsed["matchedKeywords"] = ats.get("matchedKeywords", [])
    parsed["missingKeywords"] = ats.get("missingKeywords", [])

    # 4) Safety defaults
    if not parsed.get("fallbackRoles"):
        parsed["fallbackRoles"] = ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"]

    r = parsed.get("rare") or {}
    if not isinstance(r.get("total"), (int, float)):
        avg = (float(r["readability"]) + float(r["applicability"]) + float(r["remarkability"])) / 3
        parsed["rare"]["total"] = round(avg, 1)

    if has_jd and parsed.get("jobMatchScore") is None:
        parsed["jobMatchScore"] = parsed["atsScore"]

    return parsed


# ---------- Parse Resume ----------
@app.post("/api/parse-resume")
async def parse_resume(
    file: UploadFile = File(...),
    job_description: Optional[str] = Form(None),
) -> Dict[str, Any]:
    data = await file.read()
    name = (file.filename or "").lower()

    # --- Extract text from file ---
    if name.endswith(".pdf"):
        text = extract_pdf_text(data)
    elif name.endswith(".docx"):
        text = extract_docx_text(data)
    else:
        try:
            text = extract_pdf_text(data)
        except Exception:
            try:
                text = extract_docx_text(data)
            except Exception:
                return {"error": "Unsupported file. Please upload a PDF or DOCX."}

    text = clean_text(text)

    if len(text) < 20:
        return {"error": "Could not read text from file (image-only PDF?). Try a text-based PDF/DOCX."}

    # --- Optional JD mode ---
    jd_text = (job_description or "").strip()
    has_jd = len(jd_text) >= 40  # threshold to avoid accidental short inputs

    try:
        # IMPORTANT: call_openai must support the optional second argument
        # Mode A: call_openai(resume_text)
        # Mode B: call_openai(resume_text, job_desc_text)
        result = call_openai(text, jd_text if has_jd else None)

        # attach a flag so frontend can show "JD match mode enabled"
        if isinstance(result, dict):
            result["hasJobDescription"] = has_jd

        # --- Save to Postgres (Supabase) ---
        try:
            raw_json = json.dumps(result, ensure_ascii=False)
        except Exception:
            raw_json = "{}"

        ats_score = int(result.get("atsScore", 0) or 0)
        rare = result.get("rare") or {}
        rare_total = float(rare.get("total", 0.0) or 0.0)
        skills = result.get("skills") or []
        keywords = result.get("keywords") or []

        with Session(engine) as session:
            db_row = Resume(
                original_filename=file.filename or "unknown",
                ats_score=ats_score,
                rare_total=rare_total,
                skills=skills,
                keywords=keywords,
                raw_json=raw_json,
            )
            session.add(db_row)
            session.commit()

        return result

    except Exception as e:
        print("OpenAI error:", e)

        # fallback JSON (same as before)
        fallback = {
            "skills": [],
            "fallbackRoles": ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"],
            "rare": {"readability": 4.5, "applicability": 4.5, "remarkability": 4.5, "total": 4.5},
            "atsScore": 85,
            "atsSuggestions": [
                "Add role-specific keywords matching the target JD.",
                "Quantify results with % and $ metrics.",
                "Use a simple one-column layout without tables."
            ],
            "keywords": [],
            "hasJobDescription": has_jd,
        }

        try:
            raw_json = json.dumps(fallback, ensure_ascii=False)
            with Session(engine) as session:
                db_row = Resume(
                    original_filename=file.filename or "unknown",
                    ats_score=fallback["atsScore"],
                    rare_total=fallback["rare"]["total"],
                    skills=fallback["skills"],
                    keywords=fallback["keywords"],
                    raw_json=raw_json,
                )
                session.add(db_row)
                session.commit()
        except Exception as db_err:
            print("Failed to store fallback resume:", db_err)

        return fallback


# ---------- Transcribe Audio (Speech-to-Text via OpenAI Whisper) ----------
@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Accepts an audio file (webm/opus/etc from MediaRecorder),
    sends it to OpenAI Whisper, and returns { transcript: "..." }.
    """
    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")

        # Write to temp file because OpenAI Python SDK expects a file-like object
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as f:
                stt_resp = client.audio.transcriptions.create(
                    model="whisper-1",   # we can switch to another model, later after MVP.
                    file=f,
                    response_format="json",
                    temperature=0,
                    language="en"
                )

            text = (stt_resp.text or "").strip()
            return {"transcript": text}
        finally:
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("OpenAI transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")


# ---------- Generate Questions ----------
class Question(BaseModel):
    id: int
    prompt: str
    topic: str = "Mixed"
    interviewer: str = "Interviewer"
    type: str = "technical"
    idealAnswer: Optional[str] = None
    rubric: Optional[Dict[str, Any]] = None

class GenerateReq(BaseModel):
    role: str
    difficulty: str
    interviewers: List[str] = []
    count: int = 20
    skills: List[str] = []
    keywords: List[str] = []
    jobDescription: Optional[str] = None

class GenerateResp(BaseModel):
    meta: Dict[str, Any]
    questions: List[Question]

@app.post("/api/generate-questions", response_model=GenerateResp)
def generate_questions(req: GenerateReq):
    logging.info("REQ /api/generate-questions: %s", req.dict())

    target_total = min(req.count or count_for_level(req.difficulty), count_for_level(req.difficulty))

    try:
        system = build_questions_system_prompt()
        user = build_questions_user_prompt(
            req.role, req.difficulty, req.interviewers, target_total, req.skills or [], req.keywords or [], req.jobDescription,
            )

        r = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.8,
            presence_penalty=0.2,
            frequency_penalty=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )

        content = r.choices[0].message.content
        logging.info("RAW LLM JSON (trunc): %s", content[:900])

        data = json.loads(content)
        raw_list = data.get("questions", [])
        if not isinstance(raw_list, list) or not raw_list:
            raise ValueError("Model did not return 'questions' list")

        seen = set()
        cleaned: List[Question] = []

        for idx, item in enumerate(raw_list, start=1):
            if isinstance(item, str):
                item_obj = {"prompt": item}
            elif isinstance(item, dict):
                item_obj = item
            else:
                continue

            prompt = (item_obj.get("prompt") or "").strip()
            if not prompt or prompt in seen:
                continue
            seen.add(prompt)

            interviewer = item_obj.get("interviewer")
            if not isinstance(interviewer, str) or not interviewer.strip():
                if req.interviewers:
                    interviewer = req.interviewers[(idx - 1) % max(1, len(req.interviewers))]
                else:
                    interviewer = "Interviewer"

            q_type = item_obj.get("type")
            if not isinstance(q_type, str) or not q_type.strip():
                q_type = "warmup" if idx <= 3 else "technical"

            topic = item_obj.get("topic")
            if not isinstance(topic, str) or not topic.strip():
                topic = "Mixed"

            ideal = item_obj.get("idealAnswer")
            if isinstance(ideal, (list, dict)):
                ideal = json.dumps(ideal, ensure_ascii=False)
            elif not isinstance(ideal, str):
                ideal = None

            rubric = item_obj.get("rubric")
            if not isinstance(rubric, dict):
                rubric = {
                    "content": "Accuracy and relevance to the prompt; includes key concepts.",
                    "clarity": "Clear, concise, minimal filler; easy to follow.",
                    "structure": "Logical flow (context → approach → result); concrete examples."
                }

            q = Question(
                id=idx,
                prompt=prompt,
                topic=topic,
                interviewer=interviewer,
                type=q_type,
                idealAnswer=ideal,
                rubric=rubric,
            )
            cleaned.append(q)

            if len(cleaned) >= target_total:
                break

        resp = GenerateResp(
            meta={"role": req.role, "difficulty": req.difficulty, "questionCount": len(cleaned)},
            questions=cleaned
        )
        logging.info("RESP /api/generate-questions: %s", resp.model_dump())
        return resp

    except Exception as e:
        logging.exception("generate-questions failed")
        raise HTTPException(status_code=500, detail=f"Failed to generate questions: {e}")


# ---------- Scoring: end-of-interview feedback ----------
class AnswerIn(BaseModel):
    id: int
    prompt: str
    interviewer: str
    type: str
    userAnswer: str
    idealAnswer: Optional[str] = None

class QuestionFeedback(BaseModel):
    id: int
    prompt: str
    interviewer: str
    type: str
    userAnswer: str
    idealAnswer: str
    scores: Dict[str, float]
    strengths: List[str]
    improvements: List[str]
    suggestedAnswer: str

class OverallFeedback(BaseModel):
    overallScore: float
    summary: str
    strengths: List[str]
    improvements: List[str]

class ScoreInterviewReq(BaseModel):
    role: str
    difficulty: str
    answers: List[AnswerIn]
    plan: dict | None = None

class ScoreInterviewResp(BaseModel):
    meta: Dict[str, Any]
    questions: List[QuestionFeedback]
    overall: OverallFeedback

def build_scoring_system_prompt() -> str:
    return (
        "You are a supportive but honest interview coach evaluating a candidate's answers.\n\n"
        "You will receive JSON with:\n"
        "{\n"
        '  \"role\": string,\n'
        '  \"difficulty\": string,\n'
        '  \"answers\": [\n'
        "    {\n"
        '      \"id\": number,\n'
        '      \"prompt\": string,\n'
        '      \"interviewer\": string,\n'
        '      \"type\": string,\n'
        '      \"userAnswer\": string,\n'
        '      \"idealAnswer\": string | null\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Calibration rules:\n"
        "- Use BOTH role and difficulty to set the bar.\n"
        "- For SENIOR: expect ownership, trade-offs, metrics, and impact. Vague answers must NOT get high scores.\n"
        "- For JUNIOR/INTERN: focus more on fundamentals, clarity and learning mindset.\n"
        "- 5.0 should be rare and outstanding. 3.0 is average. 2.0 or below is weak.\n\n"
        "For EACH answer, produce:\n"
        "- scores (0–5 floats) for: content, structure, clarity, confidence, relevance.\n"
        "  * content: correctness, depth, use of appropriate tools/techniques for the role.\n"
        "  * structure: logical flow (context → actions → result).\n"
        "  * clarity: understandable, avoids rambling, uses precise language.\n"
        "  * confidence: steady, assertive wording vs. very unsure or self-contradictory.\n"
        "  * relevance: how directly it answers the prompt.\n"
        "- strengths: 2–4 short bullet-style strings that highlight what they did WELL.\n"
        "- improvements: 2–4 short bullet-style strings that are SPECIFIC and ACTIONABLE.\n"
        "  * Reference missing metrics, tools, steps, or examples.\n"
        "  * Avoid generic advice like \"be more confident\" unless you also say HOW.\n"
        "- suggestedAnswer: a concise, strong answer tailored to this candidate and this role.\n\n"
        "Overall section:\n"
        "- overallScore: single float 0–5 summarizing the interview.\n"
        "- summary: 2–3 sentences, honest but encouraging.\n"
        "- strengths: 3–5 positive bullet-style observations.\n"
        "- improvements: 3–5 very practical next steps (what to practice, how to answer better).\n\n"
        "Tone guidelines:\n"
        "- Always kind, constructive, and growth-oriented.\n"
        "- Do NOT inflate scores if the answer is vague or off-topic.\n"
        "- Focus on what they can DO next time to sound like a stronger {role}.\n\n"
        "You MUST return STRICT JSON ONLY with EXACTLY this shape:\n"
        "{\n"
        '  \"questions\": [\n'
        "    {\n"
        '      \"id\": number,\n'
        '      \"scores\": {\n'
        '        \"content\": number,\n'
        '        \"structure\": number,\n'
        '        \"clarity\": number,\n'
        '        \"confidence\": number,\n'
        '        \"relevance\": number\n'
        "      },\n"
        '      \"strengths\": [string, ...],\n'
        '      \"improvements\": [string, ...],\n'
        '      \"suggestedAnswer\": string\n'
        "    }\n"
        "  ],\n"
        '  \"overall\": {\n'
        '    \"overallScore\": number,\n'
        '    \"summary\": string,\n'
        '    \"strengths\": [string, ...],\n'
        '    \"improvements\": [string, ...]\n'
        "  }\n"
        "}\n\n"
        "No markdown. No explanations. No extra keys. JSON ONLY."
    )



@app.post("/api/score-interview", response_model=ScoreInterviewResp)
def score_interview(req: ScoreInterviewReq):
    if not req.answers:
        raise HTTPException(status_code=400, detail="No answers are provided to score.")

    try:
        system = build_scoring_system_prompt()

        user_payload = {
            "role": req.role,
            "difficulty": req.difficulty,
            "answers": [a.model_dump() for a in req.answers],
        }

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ]

        r = call_openai_with_backoff(
            model="gpt-4o-mini",
            temperature=0.3,
            response_format={"type": "json_object"},
            messages=messages,
        )

        raw = r.choices[0].message.content
        data = json.loads(raw)

        q_list = data.get("questions") or []
        overall_raw = data.get("overall") or {}

        scored_by_id: Dict[str, Dict[str, Any]] = {}
        if isinstance(q_list, list):
            for item in q_list:
                try:
                    sid = str(item.get("id"))
                    if sid:
                        scored_by_id[sid] = item
                except Exception:
                    continue

        questions_out: List[QuestionFeedback] = []

        for a in req.answers:
            scored = scored_by_id.get(str(a.id), {}) or {}

            raw_scores = scored.get("scores") or {}

            def get_score(key: str, default: float = 3.0) -> float:
                try:
                    val = raw_scores.get(key, default)
                    return float(val)
                except Exception:
                    return default

            scores_obj = {
                "content":   get_score("content"),
                "structure": get_score("structure"),
                "clarity":   get_score("clarity"),
                "confidence": get_score("confidence"),
                "relevance": get_score("relevance"),
            }

            strengths = scored.get("strengths") or []
            if not isinstance(strengths, list):
                strengths = [str(strengths)]

            improvements = scored.get("improvements") or []
            if not isinstance(improvements, list):
                improvements = [str(improvements)]

            suggested = scored.get("suggestedAnswer") or ""
            if not suggested:
                suggested = (
                    a.idealAnswer
                    or "Ideal answer unavailable — The system took a coffee break mid-analysis."
                )

            if not strengths:
                strengths = ["Please try to answer the question, Build up your confidence."]
            if not improvements:
                improvements = [
                    "Think Netflix episode: start strong, show what you did, and end with a win — STAR style.",
                    "Throw in 1-2 numbers — %, time saved, $$$ — your answers glow instantly.",
                ]

            questions_out.append(
                QuestionFeedback(
                    id=a.id,
                    prompt=a.prompt,
                    interviewer=a.interviewer,
                    type=a.type,
                    userAnswer=a.userAnswer,
                    idealAnswer=a.idealAnswer
                    or "Ideal answer unavailable — The system took a coffee break mid-analysis.",
                    scores=scores_obj,
                    strengths=[str(x) for x in strengths],
                    improvements=[str(x) for x in improvements],
                    suggestedAnswer=suggested,
                )
            )

        try:
            overall_score = float(overall_raw.get("overallScore", 3.0))
        except Exception:
            overall_score = 3.0

        overall_summary = overall_raw.get("summary") or (
            "Overall summary unavailable — The system took a coffee break mid-analysis."
        )

        overall_strengths = overall_raw.get("strengths") or [
            "You stayed engaged and tried to answer every question.",
            "You've got the experience, shape it into punchy, high-impact stories",
        ]
        if not isinstance(overall_strengths, list):
            overall_strengths = [str(overall_strengths)]

        overall_improvements = overall_raw.get("improvements") or [
            "Lean on STAR — it's your cheat code for crisp, confident answers.",
            "Throw in 1-2 numbers — %, time saved, $$$ — your answers glow instantly.",
            "Take your time — a calm pause between points makes you sound like a pro.",
        ]
        if not isinstance(overall_improvements, list):
            overall_improvements = [str(overall_improvements)]

        overall_obj = OverallFeedback(
            overallScore=overall_score,
            summary=overall_summary,
            strengths=[str(x) for x in overall_strengths],
            improvements=[str(x) for x in overall_improvements],
        )

        # 🔹 This is your “report” object (I previously called it `report`)
        resp = ScoreInterviewResp(
            meta={
                "role": req.role,
                "difficulty": req.difficulty,
                "questionCount": len(req.answers),
                "fallback": False,
            },
            questions=questions_out,
            overall=overall_obj,
        )

        # 🔹 NEW: best-effort save to DB (does NOT break the API if DB fails)
        # 🔹 Save interview session to DB (best-effort, won’t break API if it fails)
        try:
            # derive interviewer names from the answers
            interviewer_names = sorted(
                {a.interviewer for a in req.answers if a.interviewer}
            )

            with Session(engine) as session:
                session.add(
                    InterviewSession(
                        role=req.role,
                        difficulty=req.difficulty,
                        question_count=len(req.answers),
                        interviewer_names=interviewer_names,
                        plan=req.plan,  # whatever the frontend sent us
                        answers=[a.model_dump() for a in req.answers],
                        report=resp.model_dump(),  # full scored report
                    )
                )
                session.commit()
        except Exception:
            logging.exception("Failed to persist interview session")


        return resp

    except Exception as e:
        logging.exception("score-interview failed")
        return ScoreInterviewResp(
            meta={
                "role": req.role,
                "difficulty": req.difficulty,
                "questionCount": len(req.answers),
                "fallback": True,
            },
            questions=[
                QuestionFeedback(
                    id=a.id,
                    prompt=a.prompt,
                    interviewer=a.interviewer,
                    type=a.type,
                    userAnswer=a.userAnswer,
                    idealAnswer=a.idealAnswer
                    or "Ideal answer unavailable — The system took a coffee break mid-analysis.",
                    scores={
                        "content": 3.0,
                        "structure": 3.0,
                        "clarity": 3.0,
                        "confidence": 3.0,
                        "relevance": 3.0,
                    },
                    strengths=[
                        "Please try to answer the question, Try to speak.",
                        "Say whatever you know, build up your confidence....",
                    ],
                    improvements=[
                        "Add more concrete examples and metrics.",
                        "Use a clear structure: situation, actions, and measurable result.",
                    ],
                    suggestedAnswer=(
                        "A good answer would briefly describe the situation, your actions, "
                        "and the measurable impact."
                    ),
                )
                for a in req.answers
            ],
            overall=OverallFeedback(
                overallScore=3.0,
                summary=(
                    "Promising baseline: Overall Feedback unavailable — "
                    "The system took a coffee break mid-analysis.."
                ),
                strengths=[
                    "You powered through every question — most users tap out early. Big respect for sticking with it!",
                    "Your resume shows real experience — now turn those moments into sharp, high-impact stories that land.",
                ],
                improvements=[
                    "Lean on STAR — it's your cheat code for crisp, confident answers.",
                    "Throw in 1-2 numbers — %, time saved, $$$ — your answers glow instantly.",
                    "Take your time — a calm pause between points makes you sound like a pro.",
                ],
            ),
        )
