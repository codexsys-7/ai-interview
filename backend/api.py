# This is my final version of MVP

from dotenv import load_dotenv
load_dotenv()

import io, json, os, re, logging, tempfile, time, random
from typing import Any, Dict, List, Optional

import fitz          
import docx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from openai import OpenAI
from openai import RateLimitError


from dotenv import load_dotenv
from pathlib import Path

# Load .env from this file's directory and OVERRIDE any existing env vars
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)


# ---------- FastAPI & CORS ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


SYSTEM_PROMPT = """You are an ATS and resume analysis engine.
Return ONLY compact JSON that conforms exactly to the provided schema.
- skills: deduplicated, concise items (1-30), proper case
- fallbackRoles: up to 4 suitable role titles
- rare: 0-5 scores (1 decimal): readability, applicability, remarkability, total=average rounded to 1 decimal
- atsScore: 0-100 overall ATS readiness
- atsSuggestions: if atsScore < 90 include 3-7 actionable bullets, otherwise []
- keywords: 3-10 short relevant phrases
Do not include any text outside JSON."""

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

def build_questions_user_prompt(role: str, difficulty: str, interviewers: List[str], requested_total: int) -> str:
    total_allowed = count_for_level(difficulty)
    target = min(requested_total or total_allowed, total_allowed)

    if not interviewers:
        interviewers = ["Interviewer"]
    hints = "\n".join(f"- {n}: {interviewer_to_hint(n)}" for n in interviewers)

    return f"""

ROLE: {role or "Candidate"}
DIFFICULTY: {difficulty or "Junior"}
INTERVIEWER PANEL & FOCUS:
{hints}

GOAL:
- Produce exactly {target} total questions.
- The FIRST 3 must be welcoming warm-up questions (type="warmup") in this order:
  1) "Could you please walk me through your professional background?"
  2) "What attracted you to this opportunity and our organization?"
  3) "What would you consider to be your key strengths and areas for improvement?"
- The remaining {max(target - 3, 0)} should mix technical/behavioral based on the panel hints and the selected role.
- For SENIOR, emphasize strategy, business impact, cross-functional leadership, and scaling.
- Ensure all prompts are UNIQUE and not rephrasings of the same thing.
- Distribute interviewer ownership across the panel (round-robin is fine).
- Keep prompts crisp, interview-ready, not multi-part essays.

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

# ---------- OpenAI call with strict JSON ----------
def call_openai(resume_text: str) -> Dict[str, Any]:
    snippet = resume_text[:28000]
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.3,
        presence_penalty=0.2,
        frequency_penalty=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"RESUME TEXT:\n\n{snippet}"},
        ],
    )
    raw_json = resp.choices[0].message.content
    data = json.loads(raw_json)

    parsed = ParseOut.model_validate(data).model_dump()

    if not parsed["fallbackRoles"]:
        parsed["fallbackRoles"] = ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"]

    r = parsed["rare"]
    if not isinstance(r.get("total"), (int, float)):
        avg = (float(r["readability"]) + float(r["applicability"]) + float(r["remarkability"])) / 3
        parsed["rare"]["total"] = round(avg, 1)

    return parsed

# ---------- Parse Resume ----------
@app.post("/api/parse-resume")
async def parse_resume(file: UploadFile = File(...)) -> Dict[str, Any]:
    data = await file.read()
    name = (file.filename or "").lower()

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

    try:
        return call_openai(text)
    except Exception as e:
        print("OpenAI error:", e)
        return {
            "skills": [],
            "fallbackRoles": ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"],
            "rare": {"readability": 4.5, "applicability": 4.5, "remarkability": 4.5, "total": 4.5},
            "atsScore": 85,
            "atsSuggestions": [
                "Add role-specific keywords matching the target JD.",
                "Quantify results with % and $ metrics.",
                "Use a simple one-column layout without tables."
            ],
            "keywords": []
        }

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

class GenerateResp(BaseModel):
    meta: Dict[str, Any]
    questions: List[Question]

@app.post("/api/generate-questions", response_model=GenerateResp)
def generate_questions(req: GenerateReq):
    logging.info("REQ /api/generate-questions: %s", req.dict())

    target_total = min(req.count or count_for_level(req.difficulty), count_for_level(req.difficulty))

    try:
        system = build_questions_system_prompt()
        user = build_questions_user_prompt(req.role, req.difficulty, req.interviewers, target_total)

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

class ScoreInterviewResp(BaseModel):
    meta: Dict[str, Any]
    questions: List[QuestionFeedback]
    overall: OverallFeedback

def build_scoring_system_prompt() -> str:
    return (
        "You are a supportive interview coach evaluating a candidate's answers.\n\n"
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
        "Your job:\n"
        "1) For EACH answer, produce:\n"
        "   - scores (0-5, floats allowed) for:\n"
        "       content, structure, clarity, confidence, relevance\n"
        "   - strengths: 2-4 short bullet-style strings (what they did well)\n"
        "   - improvements: 2-4 short bullet-style strings (specific, actionable, optimistic)\n"
        "   - suggestedAnswer: a concise, strong answer in a realistic tone for this candidate.\n"
        "2) Overall section:\n"
        "   - overallScore: single float 0-5 summarizing the interview.\n"
        "   - summary: 2-3 sentences, honest but encouraging.\n"
        "   - strengths: 3-5 positive bullet-style observations.\n"
        "   - improvements: 3-5 very practical next steps.\n\n"
        "Tone guidelines:\n"
        "- Always kind, constructive, and growth-oriented.\n"
        "- Avoid harsh language. Focus on what they CAN do to improve.\n"
        "- Use encouraging phrasing (\"You can strengthen this by...\", \"Next time, try...\").\n\n"
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
                "confidence":get_score("confidence"),
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
                    "Throw in 1-2 numbers — %, time saved, $$$ — your answers glow instantly."
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
            "You've got the experience, shape it into punchy, high-impact stories"
        ]
        if not isinstance(overall_strengths, list):
            overall_strengths = [str(overall_strengths)]

        overall_improvements = overall_raw.get("improvements") or [
            "Lean on STAR — it's your cheat code for crisp, confident answers.",
            "Throw in 1-2 numbers — %, time saved, $$$ — your answers glow instantly.",
            "Take your time — a calm pause between points makes you sound like a pro."
        ]
        if not isinstance(overall_improvements, list):
            overall_improvements = [str(overall_improvements)]

        overall_obj = OverallFeedback(
            overallScore=overall_score,
            summary=overall_summary,
            strengths=[str(x) for x in overall_strengths],
            improvements=[str(x) for x in overall_improvements],
        )

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
                        "Say whatever you know, build up your confidence...."
                    ],
                    improvements=[
                        "Add more concrete examples and metrics.",
                        "Use a clear structure: situation, actions, and measurable result."
                    ],
                    suggestedAnswer="A good answer would briefly describe the situation, your actions, and the measurable impact.",
                )
                for a in req.answers
            ],
            overall=OverallFeedback(
                overallScore=3.0,
                summary="Promising baseline: Overall Feedback unavailable — The system took a coffee break mid-analysis..",
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
