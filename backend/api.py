# This is my Thrid Version Working on Feedback Analysis Page.

import io, json, os, re, logging
from typing import Any, Dict, List, Optional

import fitz          # PyMuPDF
import docx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from openai import OpenAI

import time
import random
from openai import RateLimitError

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


# ---------- FastAPI & CORS ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- OpenAI ----------
# DO NOT hardcode secrets in code. Prefer environment variables.
# If you insist on a fallback during local dev, use an env default:
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = """You are an ATS and resume analysis engine.
Return ONLY compact JSON that conforms exactly to the provided schema.
- skills: deduplicated, concise items (1–30), proper case
- fallbackRoles: up to 4 suitable role titles
- rare: 0–5 scores (1 decimal): readability, applicability, remarkability, total=average rounded to 1 decimal
- atsScore: 0–100 overall ATS readiness
- atsSuggestions: if atsScore < 90 include 3–7 actionable bullets, otherwise []
- keywords: 3–10 short relevant phrases
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
from fastapi import UploadFile, File

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
            temperature=0.7,
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
            # --- Normalize each item to a dict shape ---
            if isinstance(item, str):
                # Model returned a bare prompt string
                item_obj = {"prompt": item}
            elif isinstance(item, dict):
                item_obj = item
            else:
                # Unknown shape; skip safely
                continue

            # prompt
            prompt = (item_obj.get("prompt") or "").strip()
            if not prompt or prompt in seen:
                continue
            seen.add(prompt)

            # interviewer (round-robin if missing)
            interviewer = item_obj.get("interviewer")
            if not isinstance(interviewer, str) or not interviewer.strip():
                if req.interviewers:
                    interviewer = req.interviewers[(idx - 1) % max(1, len(req.interviewers))]
                else:
                    interviewer = "Interviewer"

            # type (guard against non-strings e.g., ints)
            q_type = item_obj.get("type")
            if not isinstance(q_type, str) or not q_type.strip():
                q_type = "warmup" if idx <= 3 else "technical"

            # topic
            topic = item_obj.get("topic")
            if not isinstance(topic, str) or not topic.strip():
                topic = "Mixed"

            # idealAnswer (ensure it's a string or None)
            ideal = item_obj.get("idealAnswer")
            if isinstance(ideal, (list, dict)):
                # Make it a compact string if model gave structure
                ideal = json.dumps(ideal, ensure_ascii=False)
            elif not isinstance(ideal, str):
                ideal = None

            # rubric (ensure dict or default)
            rubric = item_obj.get("rubric")
            if not isinstance(rubric, dict):
                rubric = {
                    "content": "Accuracy and relevance to the prompt; includes key concepts.",
                    "clarity": "Clear, concise, minimal filler; easy to follow.",
                    "structure": "Logical flow (context → approach → result); concrete examples."
                }

            # Build validated Question
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
    idealAnswer: Optional[str] = None  # from question generator if available


class QuestionFeedback(BaseModel):
    id: int
    prompt: str
    interviewer: str
    type: str
    userAnswer: str
    idealAnswer: str
    scores: Dict[str, float]          # e.g. {"content": 4.2, "structure": 3.8, ...}
    strengths: List[str]
    improvements: List[str]
    suggestedAnswer: str              # polished, ideal answer in coach-y tone


class OverallFeedback(BaseModel):
    overallScore: float               # 0–5
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
    """
    System prompt for the scoring LLM call.

    We keep the JSON schema simple for the model:
    {
      "questions": [
        {
          "id": number,
          "scores": {
            "content": 0-5,
            "structure": 0-5,
            "clarity": 0-5,
            "confidence": 0-5,
            "relevance": 0-5
          },
          "strengths": ["...", "..."],
          "improvements": ["...", "..."],
          "suggestedAnswer": "..."
        }
      ],
      "overall": {
        "overallScore": 0-5,
        "summary": "...",
        "strengths": ["...", "..."],
        "improvements": ["...", "..."]
      }
    }
    """
    return (
        "You are a supportive interview coach evaluating a candidate's answers.\n\n"
        "You will receive JSON with:\n"
        "{\n"
        '  "role": string,\n'
        '  "difficulty": string,\n'
        '  "answers": [\n'
        "    {\n"
        '      "id": number,\n'
        '      "prompt": string,\n'
        '      "interviewer": string,\n'
        '      "type": string,\n'
        '      "userAnswer": string,\n'
        '      "idealAnswer": string | null\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Your job:\n"
        "1) For EACH answer, produce:\n"
        "   - scores (0–5, floats allowed) for:\n"
        "       content, structure, clarity, confidence, relevance\n"
        "   - strengths: 2–4 short bullet-style strings (what they did well)\n"
        "   - improvements: 2–4 short bullet-style strings (specific, actionable, optimistic)\n"
        "   - suggestedAnswer: a concise, strong answer in a realistic tone for this candidate.\n"
        "2) Overall section:\n"
        "   - overallScore: single float 0–5 summarizing the interview.\n"
        "   - summary: 2–3 sentences, honest but encouraging.\n"
        "   - strengths: 3–5 positive bullet-style observations.\n"
        "   - improvements: 3–5 very practical next steps.\n\n"
        "Tone guidelines:\n"
        "- Always kind, constructive, and growth-oriented.\n"
        "- Avoid harsh language. Focus on what they CAN do to improve.\n"
        "- Use encouraging phrasing (\"You can strengthen this by...\", \"Next time, try...\").\n\n"
        "You MUST return STRICT JSON ONLY with EXACTLY this shape:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "id": number,\n'
        '      "scores": {\n'
        '        "content": number,\n'
        '        "structure": number,\n'
        '        "clarity": number,\n'
        '        "confidence": number,\n'
        '        "relevance": number\n'
        "      },\n"
        '      "strengths": [string, ...],\n'
        '      "improvements": [string, ...],\n'
        '      "suggestedAnswer": string\n'
        "    }\n"
        "  ],\n"
        '  "overall": {\n'
        '    "overallScore": number,\n'
        '    "summary": string,\n'
        '    "strengths": [string, ...],\n'
        '    "improvements": [string, ...]\n'
        "  }\n"
        "}\n\n"
        "No markdown. No explanations. No extra keys. JSON ONLY."
    )


@app.post("/api/score-interview", response_model=ScoreInterviewResp)
def score_interview(req: ScoreInterviewReq):
    """
    Takes all user answers at the end of the interview and returns
    per-question feedback + an overall summary.
    """
    if not req.answers:
        raise HTTPException(status_code=400, detail="No answers provided to score.")

    try:
        system = build_scoring_system_prompt()

        # Send the whole payload as JSON so the model has context.
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

        # -------- Map model JSON -> our Pydantic schema --------
        q_list = data.get("questions") or []
        overall_raw = data.get("overall") or {}

        # Index returned question feedback by id (as string for safety)
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
                    or "A strong answer would clearly state the situation, your actions, and the measurable result."
                )

            # Ensure at least one positive + one improvement
            if not strengths:
                strengths = ["You attempted to answer and shared relevant experience."]
            if not improvements:
                improvements = [
                    "Use a clear beginning–middle–end (STAR: Situation, Task, Action, Result).",
                    "Add 1–2 concrete metrics to show impact."
                ]

            questions_out.append(
                QuestionFeedback(
                    id=a.id,
                    prompt=a.prompt,
                    interviewer=a.interviewer,
                    type=a.type,
                    userAnswer=a.userAnswer,
                    idealAnswer=a.idealAnswer
                        or "A strong answer would clearly state context, approach, and outcome with metrics.",
                    scores=scores_obj,
                    strengths=[str(x) for x in strengths],
                    improvements=[str(x) for x in improvements],
                    suggestedAnswer=suggested,
                )
            )

        # Overall block
        try:
            overall_score = float(overall_raw.get("overallScore", 3.0))
        except Exception:
            overall_score = 3.0

        overall_summary = overall_raw.get("summary") or (
            "Promising baseline. With more structure, clarity, and metrics, you can sound very strong."
        )

        overall_strengths = overall_raw.get("strengths") or [
            "You consistently tried to address each question.",
            "You have relevant experience you can build into strong stories."
        ]
        if not isinstance(overall_strengths, list):
            overall_strengths = [str(overall_strengths)]

        overall_improvements = overall_raw.get("improvements") or [
            "Practice using STAR structure (Situation, Task, Action, Result).",
            "Add 1–2 numbers (%, $, time saved) to each story.",
            "Slow down and pause between points to sound more confident."
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
        # Fallback: return a neutral, generic report so UI still works
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
                        or "A strong answer would clearly state context, approach, and outcome with metrics.",
                    scores={
                        "content": 3.0,
                        "structure": 3.0,
                        "clarity": 3.0,
                        "confidence": 3.0,
                        "relevance": 3.0,
                    },
                    strengths=[
                        "You attempted to address the question.",
                        "You have relevant experience to build on."
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
                summary="Promising baseline with room to improve clarity, structure, and impact-focused storytelling.",
                strengths=[
                    "You have relevant experience to talk about.",
                    "You showed willingness to answer each question.",
                ],
                improvements=[
                    "Practice using STAR structure (Situation, Task, Action, Result).",
                    "Quantify outcomes where possible (%, $, time saved).",
                    "Slow down and speak with more confidence and pauses.",
                ],
            ),
        )




# This is my Second Version until my Interview page is running well and good.

# import io, json, os, re, logging
# from typing import Any, Dict, List, Optional

# import fitz          # PyMuPDF
# import docx
# from fastapi import FastAPI, UploadFile, File, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from pydantic import BaseModel, Field
# from openai import OpenAI

# import time
# import random
# from openai import RateLimitError

# def call_openai_with_backoff(*, messages, model="gpt-4o-mini", response_format=None, temperature=0.3):
#     """Retries OpenAI calls with exponential backoff to avoid 429 rate-limit errors."""
#     for attempt in range(5):
#         try:
#             return client.chat.completions.create(
#                 model=model,
#                 temperature=temperature,
#                 response_format=response_format,
#                 messages=messages,
#             )
#         except RateLimitError as e:
#             wait = min(20, 2 ** attempt) + random.random()
#             print(f"[WARN] Rate limit hit. Retrying in {wait:.1f}s...")
#             time.sleep(wait)
#     # Final attempt (let it raise if still failing)
#     return client.chat.completions.create(
#         model=model,
#         temperature=temperature,
#         response_format=response_format,
#         messages=messages,
#     )


# # ---------- FastAPI & CORS ----------
# app = FastAPI()
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # ---------- OpenAI ----------
# # DO NOT hardcode secrets in code. Prefer environment variables.
# # If you insist on a fallback during local dev, use an env default:
# client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# SYSTEM_PROMPT = """You are an ATS and resume analysis engine.
# Return ONLY compact JSON that conforms exactly to the provided schema.
# - skills: deduplicated, concise items (1–30), proper case
# - fallbackRoles: up to 4 suitable role titles
# - rare: 0–5 scores (1 decimal): readability, applicability, remarkability, total=average rounded to 1 decimal
# - atsScore: 0–100 overall ATS readiness
# - atsSuggestions: if atsScore < 90 include 3–7 actionable bullets, otherwise []
# - keywords: 3–10 short relevant phrases
# Do not include any text outside JSON."""

# # ---------- Helpers ----------
# def extract_pdf_text(data: bytes) -> str:
#     with fitz.open(stream=data, filetype="pdf") as doc:
#         return "\n".join(p.get_text() for p in doc)

# def extract_docx_text(data: bytes) -> str:
#     d = docx.Document(io.BytesIO(data))
#     return "\n".join(p.text for p in d.paragraphs)

# def clean_text(t: str) -> str:
#     t = t.replace("\x00", " ")
#     t = re.sub(r"[ \t]+", " ", t)
#     t = re.sub(r"\n{2,}", "\n", t)
#     return t.strip()

# # ------------------- Question generation helpers (LLM) -------------------
# INTERVIEWER_HINTS = {
#     "Manager": "delivery, prioritization, stakeholder communication, sprint planning, on-call ownership",
#     "HR": "culture add, values alignment, teamwork, conflict resolution, communication",
#     "CEO": "business outcomes, vision, strategy, growth levers, risk, trade-offs, impact",
#     "President": "org-wide impact, strategic initiatives, competitive advantage, ROI",
#     "Vice President": "cross-functional leadership, scaling, OKRs, portfolio prioritization",
#     "CFO": "financial impact, unit economics, cost/benefit, budgeting, margins, ROI",
# }

# def interviewer_to_hint(name: str) -> str:
#     return INTERVIEWER_HINTS.get(name, "mix of technical depth, problem solving, and business impact")

# def count_for_level(level: str) -> int:
#     lvl = (level or "").lower()
#     if lvl == "senior": return 26
#     if lvl == "associate": return 25
#     if lvl == "junior": return 20
#     return 15  # Intern

# def questions_schema_text() -> str:
#     return """
# Return ONLY JSON with this shape:
# {
#   "questions": [
#     {
#       "prompt": string,
#       "topic": string,
#       "interviewer": string,
#       "type": string,
#       "idealAnswer": string,
#       "rubric": {
#         "content": string,
#         "clarity": string,
#         "structure": string
#       }
#     }
#   ]
# }
# No extra keys. No prose outside JSON. No markdown.
# """.strip()

# def build_questions_system_prompt() -> str:
#     return (
#         "You are an interview question generator. "
#         "You must return STRICT JSON ONLY (no prose, no markdown) following the given schema."
#     )

# def build_questions_user_prompt(role: str, difficulty: str, interviewers: List[str], requested_total: int) -> str:
#     total_allowed = count_for_level(difficulty)
#     target = min(requested_total or total_allowed, total_allowed)

#     if not interviewers:
#         interviewers = ["Interviewer"]
#     hints = "\n".join(f"- {n}: {interviewer_to_hint(n)}" for n in interviewers)

#     return f"""
# ROLE: {role or "Candidate"}
# DIFFICULTY: {difficulty or "Junior"}
# INTERVIEWER PANEL & FOCUS:
# {hints}

# GOAL:
# - Produce exactly {target} total questions.
# - The FIRST 3 must be welcoming warm-up questions (type="warmup") in this order:
#   1) "Could you please walk me through your professional background?"
#   2) "What attracted you to this opportunity and our organization?"
#   3) "What would you consider to be your key strengths and areas for improvement?"
# - The remaining {max(target - 3, 0)} should mix technical/behavioral based on the panel hints and the selected role.
# - For SENIOR, emphasize strategy, business impact, cross-functional leadership, and scaling.
# - Ensure all prompts are UNIQUE and not rephrasings of the same thing.
# - Distribute interviewer ownership across the panel (round-robin is fine).
# - Keep prompts crisp, interview-ready, not multi-part essays.

# SCHEMA (must follow exactly):
# {questions_schema_text()}
# """.strip()

# # ---------- Response schema (validates the LLM output) ----------
# class Rare(BaseModel):
#     readability: float = Field(ge=0, le=5)
#     applicability: float = Field(ge=0, le=5)
#     remarkability: float = Field(ge=0, le=5)
#     total: float = Field(ge=0, le=5)

# class ParseOut(BaseModel):
#     skills: List[str]
#     fallbackRoles: List[str]
#     rare: Rare
#     atsScore: int = Field(ge=0, le=100)
#     atsSuggestions: List[str]
#     keywords: List[str] = []

# # ---------- OpenAI call with strict JSON ----------
# def call_openai(resume_text: str) -> Dict[str, Any]:
#     snippet = resume_text[:28000]
#     resp = client.chat.completions.create(
#         model="gpt-4o-mini",
#         temperature=0.3,
#         presence_penalty=0.2,
#         frequency_penalty=0.2,
#         response_format={"type": "json_object"},
#         messages=[
#             {"role": "system", "content": SYSTEM_PROMPT},
#             {"role": "user", "content": f"RESUME TEXT:\n\n{snippet}"},
#         ],
#     )
#     raw_json = resp.choices[0].message.content
#     data = json.loads(raw_json)

#     parsed = ParseOut.model_validate(data).model_dump()

#     if not parsed["fallbackRoles"]:
#         parsed["fallbackRoles"] = ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"]

#     r = parsed["rare"]
#     if not isinstance(r.get("total"), (int, float)):
#         avg = (float(r["readability"]) + float(r["applicability"]) + float(r["remarkability"])) / 3
#         parsed["rare"]["total"] = round(avg, 1)

#     return parsed

# # ---------- Parse Resume ----------
# from fastapi import UploadFile, File

# @app.post("/api/parse-resume")
# async def parse_resume(file: UploadFile = File(...)) -> Dict[str, Any]:
#     data = await file.read()
#     name = (file.filename or "").lower()

#     if name.endswith(".pdf"):
#         text = extract_pdf_text(data)
#     elif name.endswith(".docx"):
#         text = extract_docx_text(data)
#     else:
#         try:
#             text = extract_pdf_text(data)
#         except Exception:
#             try:
#                 text = extract_docx_text(data)
#             except Exception:
#                 return {"error": "Unsupported file. Please upload a PDF or DOCX."}

#     text = clean_text(text)

#     if len(text) < 20:
#         return {"error": "Could not read text from file (image-only PDF?). Try a text-based PDF/DOCX."}

#     try:
#         return call_openai(text)
#     except Exception as e:
#         print("OpenAI error:", e)
#         return {
#             "skills": [],
#             "fallbackRoles": ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"],
#             "rare": {"readability": 4.5, "applicability": 4.5, "remarkability": 4.5, "total": 4.5},
#             "atsScore": 85,
#             "atsSuggestions": [
#                 "Add role-specific keywords matching the target JD.",
#                 "Quantify results with % and $ metrics.",
#                 "Use a simple one-column layout without tables."
#             ],
#             "keywords": []
#         }

# # ---------- Generate Questions ----------
# class Question(BaseModel):
#     id: int
#     prompt: str
#     topic: str = "Mixed"
#     interviewer: str = "Interviewer"
#     type: str = "technical"
#     idealAnswer: Optional[str] = None
#     rubric: Optional[Dict[str, Any]] = None

# class GenerateReq(BaseModel):
#     role: str
#     difficulty: str
#     interviewers: List[str] = []
#     count: int = 20

# class GenerateResp(BaseModel):
#     meta: Dict[str, Any]
#     questions: List[Question]

# @app.post("/api/generate-questions", response_model=GenerateResp)
# def generate_questions(req: GenerateReq):
#     logging.info("REQ /api/generate-questions: %s", req.dict())

#     target_total = min(req.count or count_for_level(req.difficulty), count_for_level(req.difficulty))

#     try:
#         system = build_questions_system_prompt()
#         user = build_questions_user_prompt(req.role, req.difficulty, req.interviewers, target_total)

#         r = client.chat.completions.create(
#             model="gpt-4o-mini",
#             temperature=0.7,
#             presence_penalty=0.2,
#             frequency_penalty=0.2,
#             response_format={"type": "json_object"},
#             messages=[
#                 {"role": "system", "content": system},
#                 {"role": "user", "content": user},
#             ],
#         )

#         content = r.choices[0].message.content
#         logging.info("RAW LLM JSON (trunc): %s", content[:900])

#         data = json.loads(content)
#         raw_list = data.get("questions", [])
#         if not isinstance(raw_list, list) or not raw_list:
#             raise ValueError("Model did not return 'questions' list")

#         seen = set()
#         cleaned: List[Question] = []

#         for idx, item in enumerate(raw_list, start=1):
#             # --- Normalize each item to a dict shape ---
#             if isinstance(item, str):
#                 # Model returned a bare prompt string
#                 item_obj = {"prompt": item}
#             elif isinstance(item, dict):
#                 item_obj = item
#             else:
#                 # Unknown shape; skip safely
#                 continue

#             # prompt
#             prompt = (item_obj.get("prompt") or "").strip()
#             if not prompt or prompt in seen:
#                 continue
#             seen.add(prompt)

#             # interviewer (round-robin if missing)
#             interviewer = item_obj.get("interviewer")
#             if not isinstance(interviewer, str) or not interviewer.strip():
#                 if req.interviewers:
#                     interviewer = req.interviewers[(idx - 1) % max(1, len(req.interviewers))]
#                 else:
#                     interviewer = "Interviewer"

#             # type (guard against non-strings e.g., ints)
#             q_type = item_obj.get("type")
#             if not isinstance(q_type, str) or not q_type.strip():
#                 q_type = "warmup" if idx <= 3 else "technical"

#             # topic
#             topic = item_obj.get("topic")
#             if not isinstance(topic, str) or not topic.strip():
#                 topic = "Mixed"

#             # idealAnswer (ensure it's a string or None)
#             ideal = item_obj.get("idealAnswer")
#             if isinstance(ideal, (list, dict)):
#                 # Make it a compact string if model gave structure
#                 ideal = json.dumps(ideal, ensure_ascii=False)
#             elif not isinstance(ideal, str):
#                 ideal = None

#             # rubric (ensure dict or default)
#             rubric = item_obj.get("rubric")
#             if not isinstance(rubric, dict):
#                 rubric = {
#                     "content": "Accuracy and relevance to the prompt; includes key concepts.",
#                     "clarity": "Clear, concise, minimal filler; easy to follow.",
#                     "structure": "Logical flow (context → approach → result); concrete examples."
#                 }

#             # Build validated Question
#             q = Question(
#                 id=idx,
#                 prompt=prompt,
#                 topic=topic,
#                 interviewer=interviewer,
#                 type=q_type,
#                 idealAnswer=ideal,
#                 rubric=rubric,
#             )
#             cleaned.append(q)

#             if len(cleaned) >= target_total:
#                 break


#         resp = GenerateResp(
#             meta={"role": req.role, "difficulty": req.difficulty, "questionCount": len(cleaned)},
#             questions=cleaned
#         )
#         logging.info("RESP /api/generate-questions: %s", resp.model_dump())
#         return resp

#     except Exception as e:
#         logging.exception("generate-questions failed")
#         raise HTTPException(status_code=500, detail=f"Failed to generate questions: {e}")




# This is my First Version of Backend API.PY


# # backend/api.py
# import io, json, os, re
# from typing import Any, Dict, List

# import fitz          # PyMuPDF
# import docx
# from fastapi import FastAPI, UploadFile, File
# from fastapi.middleware.cors import CORSMiddleware
# from pydantic import BaseModel, Field
# from openai import OpenAI

# import logging
# from typing import Any, Dict, List
# from fastapi import HTTPException
# from pydantic import BaseModel


# # ---------- FastAPI & CORS ----------
# app = FastAPI()
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )
# OPENAI_API_KEY = "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"
# # ---------- OpenAI ----------
# client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# SYSTEM_PROMPT = """You are an ATS and resume analysis engine.
# Return ONLY compact JSON that conforms exactly to the provided schema.
# - skills: deduplicated, concise items (1–30), proper case
# - fallbackRoles: up to 4 suitable role titles
# - rare: 0–5 scores (1 decimal): readability, applicability, remarkability, total=average rounded to 1 decimal
# - atsScore: 0–100 overall ATS readiness
# - atsSuggestions: if atsScore < 90 include 3–7 actionable bullets, otherwise []
# - keywords: 3–10 short relevant phrases
# Do not include any text outside JSON."""

# # ---------- Helpers ----------
# def extract_pdf_text(data: bytes) -> str:
#     with fitz.open(stream=data, filetype="pdf") as doc:
#         return "\n".join(p.get_text() for p in doc)

# def extract_docx_text(data: bytes) -> str:
#     d = docx.Document(io.BytesIO(data))
#     return "\n".join(p.text for p in d.paragraphs)

# def clean_text(t: str) -> str:
#     t = t.replace("\x00", " ")
#     t = re.sub(r"[ \t]+", " ", t)
#     t = re.sub(r"\n{2,}", "\n", t)
#     return t.strip()


# # ------------------- Question generation helpers (LLM) -------------------
# INTERVIEWER_HINTS = {
#     "Manager": "delivery, prioritization, stakeholder communication, sprint planning, on-call ownership",
#     "HR": "culture add, values alignment, teamwork, conflict resolution, communication",
#     "CEO": "business outcomes, vision, strategy, growth levers, risk, trade-offs, impact",
#     "President": "org-wide impact, strategic initiatives, competitive advantage, ROI",
#     "Vice President": "cross-functional leadership, scaling, OKRs, portfolio prioritization",
#     "CFO": "financial impact, unit economics, cost/benefit, budgeting, margins, ROI",
# }

# def interviewer_to_hint(name: str) -> str:
#     return INTERVIEWER_HINTS.get(name, "mix of technical depth, problem solving, and business impact")

# def count_for_level(level: str) -> int:
#     lvl = (level or "").lower()
#     if lvl == "senior":
#         return 26  # ≥26 for Senior
#     if lvl == "associate":
#         return 25
#     if lvl == "junior":
#         return 20
#     return 15  # Intern

# def questions_schema_text() -> str:
#     return """
# Return ONLY JSON with this shape:
# {
#   "questions": [
#     {
#       "prompt": string,
#       "topic": string,
#       "interviewer": string,
#       "type": string,      // "technical" | "behavioral" | "warmup"
#       "idealAnswer": string,
#       "rubric": {
#         "content": string,
#         "clarity": string,
#         "structure": string
#       }
#     }
#   ]
# }
# No extra keys. No prose outside JSON. No markdown.
# """.strip()

# def build_questions_system_prompt() -> str:
#     return (
#         "You are an interview question generator. "
#         "You must return STRICT JSON ONLY (no prose, no markdown) following the given schema."
#     )

# def build_questions_user_prompt(role: str, difficulty: str, interviewers: List[str], requested_total: int) -> str:
#     total_allowed = count_for_level(difficulty)
#     target = min(requested_total or total_allowed, total_allowed)

#     if not interviewers:
#         interviewers = ["Interviewer"]
#     hints = "\n".join(f"- {n}: {interviewer_to_hint(n)}" for n in interviewers)

#     return f"""

# ROLE: {role or "Candidate"}
# DIFFICULTY: {difficulty or "Junior"}
# INTERVIEWER PANEL & FOCUS:
# {hints}

# GOAL:
# - Produce exactly {target} total questions.
# - The FIRST 3 must be welcoming warm-up questions (type="warmup") in this order:
#   1) "Could you please walk me through your professional background?"
#   2) "What attracted you to this opportunity and our organization?"
#   3) "What would you consider to be your key strengths and areas for improvement?"
# - The remaining {max(target - 3, 0)} should mix technical/behavioral based on the panel hints and the selected role.
# - For SENIOR, emphasize strategy, business impact, cross-functional leadership, and scaling.
# - Ensure all prompts are UNIQUE and not rephrasings of the same thing.
# - Distribute interviewer ownership across the panel (round-robin is fine).
# - Keep prompts crisp, interview-ready, not multi-part essays.

# SCHEMA (must follow exactly):
# {questions_schema_text()}
# """.strip()



# # ---------- Response schema (validates the LLM output) ----------
# class Rare(BaseModel):
#     readability: float = Field(ge=0, le=5)
#     applicability: float = Field(ge=0, le=5)
#     remarkability: float = Field(ge=0, le=5)
#     total: float = Field(ge=0, le=5)

# class ParseOut(BaseModel):
#     skills: List[str]
#     fallbackRoles: List[str]
#     rare: Rare
#     atsScore: int = Field(ge=0, le=100)
#     atsSuggestions: List[str]
#     keywords: List[str] = []

# # ---------- OpenAI call with strict JSON ----------
# def call_openai(resume_text: str) -> Dict[str, Any]:
#     # Truncate to keep token usage controlled (most resumes << 28k chars)
#     snippet = resume_text[:28000]

#     resp = client.chat.completions.create(
#         model="gpt-4o-mini",           # capable + cost-effective
#         temperature=0,
#         response_format={"type": "json_object"},  # force JSON
#         messages=[
#             {"role": "system", "content": SYSTEM_PROMPT},
#             {"role": "user", "content": f"RESUME TEXT:\n\n{snippet}"},
#         ],
#     )
#     raw_json = resp.choices[0].message.content
#     data = json.loads(raw_json)

#     # Validate/normalize with Pydantic (coerces minor issues)
#     parsed = ParseOut.model_validate(data).model_dump()

#     # Ensure at least a default role list if LLM returns empty
#     if not parsed["fallbackRoles"]:
#         parsed["fallbackRoles"] = ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"]

#     # Ensure RARe.total is correct
#     r = parsed["rare"]
#     if not isinstance(r.get("total"), (int, float)):
#         avg = (float(r["readability"]) + float(r["applicability"]) + float(r["remarkability"])) / 3
#         parsed["rare"]["total"] = round(avg, 1)

#     return parsed

# # ---------- API endpoint ----------
# @app.post("/api/parse-resume")
# async def parse_resume(file: UploadFile = File(...)) -> Dict[str, Any]:
#     data = await file.read()
#     name = (file.filename or "").lower()

#     # Quick MIME/extension gate (feel free to enforce stricter checks)
#     if name.endswith(".pdf"):
#         text = extract_pdf_text(data)
#     elif name.endswith(".docx"):
#         text = extract_docx_text(data)
#     else:
#         # try both before failing
#         try:
#             text = extract_pdf_text(data)
#         except Exception:
#             try:
#                 text = extract_docx_text(data)
#             except Exception:
#                 return {"error": "Unsupported file. Please upload a PDF or DOCX."}

#     text = clean_text(text)

#     # Empty/scanless PDFs guard
#     if len(text) < 20:
#         return {"error": "Could not read text from file (image-only PDF?). Try a text-based PDF/DOCX."}

#     # Call OpenAI and return normalized JSON
#     try:
#         return call_openai(text)
#     except Exception as e:
#         # Failsafe so the UI still works
#         print("OpenAI error:", e)
#         return {
#             "skills": [],
#             "fallbackRoles": ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"],
#             "rare": {"readability": 4.5, "applicability": 4.5, "remarkability": 4.5, "total": 4.5},
#             "atsScore": 85,
#             "atsSuggestions": [
#                 "Add role-specific keywords matching the target JD.",
#                 "Quantify results with % and $ metrics.",
#                 "Use a simple one-column layout without tables."
#             ],
#             "keywords": []
#         }

# # Add request/response models + the route

# class Question(BaseModel):
#     id: int
#     prompt: str
#     topic: str = "Mixed"
#     interviewer: str = "Interviewer"
#     type: str = "technical"
#     idealAnswer: str | None = None
#     rubric: Dict[str, Any] | None = None

# class GenerateReq(BaseModel):
#     role: str
#     difficulty: str
#     interviewers: List[str] = []
#     count: int = 20

# class GenerateResp(BaseModel):
#     meta: Dict[str, Any]
#     questions: List[Question]

# @app.post("/api/generate-questions", response_model=GenerateResp)
# def generate_questions(req: GenerateReq):
#     logging.info("REQ /api/generate-questions: %s", req.dict())

#     target_total = min(req.count or count_for_level(req.difficulty), count_for_level(req.difficulty))

#     try:
#         system = build_questions_system_prompt()
#         user = build_questions_user_prompt(req.role, req.difficulty, req.interviewers, target_total)

#         r = client.chat.completions.create(
#             model="gpt-4o-mini",
#             temperature=0.3,
#             presence_penalty=0.2,
#             frequency_penalty=0.2,
#             response_format={"type": "json_object"},
#             messages=[
#                 {"role": "system", "content": system},
#                 {"role": "user", "content": user},
#             ],
#         )
#         content = r.choices[0].message.content
#         logging.info("RAW LLM JSON (trunc): %s", content[:900])

#         data = json.loads(content)
#         raw_list = data.get("questions", [])
#         if not isinstance(raw_list, list) or not raw_list:
#             raise ValueError("Model did not return 'questions' list")

#         # Enforce uniqueness + interviewer spread + add ids
#         seen = set()
#         cleaned: List[Question] = []
#         for idx, item in enumerate(raw_list, start=1):
#             prompt = (item.get("prompt") or "").strip()
#             if not prompt or prompt in seen:
#                 continue
#             seen.add(prompt)
#             interviewer = item.get("interviewer") or (
#                 req.interviewers[(idx - 1) % max(1, len(req.interviewers))]
#                 if req.interviewers else "Interviewer"
#             )
#             q = Question(
#                 id=idx,
#                 prompt=prompt,
#                 topic=item.get("topic") or "Mixed",
#                 interviewer=interviewer,
#                 type=item.get("type") or ("warmup" if idx <= 3 else "technical"),
#                 idealAnswer=item.get("idealAnswer") or None,
#                 rubric=item.get("rubric") or None,
#             )
#             cleaned.append(q)
#             if len(cleaned) >= target_total:
#                 break

#         resp = GenerateResp(
#             meta={"role": req.role, "difficulty": req.difficulty, "questionCount": len(cleaned)},
#             questions=cleaned
#         )
#         logging.info("RESP /api/generate-questions: %s", resp.model_dump())
#         return resp

#     except Exception as e:
#         logging.exception("generate-questions failed")
#         raise HTTPException(status_code=500, detail=f"Failed to generate questions: {e}")
