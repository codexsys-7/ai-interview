# This is my final version of MVP

from dotenv import load_dotenv
load_dotenv()

from ats import compute_ats_score


import io, json, os, re, logging, tempfile, time, random
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

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
from db import engine, init_db, InterviewSession, InterviewAnswer
from services.embedding_service import generate_embedding, find_similar_answers
from models import Resume, User

from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta

from fastapi.middleware.cors import CORSMiddleware



# Load .env from this file's directory and OVERRIDE any existing env vars
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)


# ---------- Lifespan Event Handler ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables if they do not exist
    init_db()
    yield
    # Shutdown: Cleanup code would go here if needed


# ---------- FastAPI & CORS ----------
app = FastAPI(lifespan=lifespan)
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

# Comprehensive interviewer profiles with realistic question focus areas
# Each interviewer has specific areas they focus on in real interviews
INTERVIEWER_PROFILES = {
    "HR": {
        "title": "Human Resources",
        "focus_areas": [
            "culture fit and values alignment",
            "teamwork and collaboration style",
            "conflict resolution and interpersonal skills",
            "career goals and motivation",
            "communication skills",
            "work-life balance expectations",
            "salary expectations and benefits",
            "reason for leaving previous role",
            "handling feedback and criticism",
            "diversity and inclusion awareness"
        ],
        "question_types": {"behavioral": 60, "situational": 25, "cultural": 15},
        "tone": "warm, conversational, assessing personality and culture fit",
        "example_questions": [
            "Tell me about a time you had a disagreement with a colleague. How did you handle it?",
            "What kind of work environment helps you do your best work?",
            "How do you handle constructive criticism?",
            "Where do you see yourself in 3-5 years?",
            "Why are you interested in leaving your current position?"
        ]
    },
    "Manager": {
        "title": "Hiring Manager",
        "focus_areas": [
            "day-to-day work execution and delivery",
            "prioritization and time management",
            "collaboration with team members",
            "handling deadlines and pressure",
            "communication with stakeholders",
            "problem-solving approach",
            "ownership and accountability",
            "project management and planning",
            "technical skills relevant to the role",
            "mentoring and helping others"
        ],
        "question_types": {"behavioral": 40, "technical": 35, "situational": 25},
        "tone": "practical, focused on real work scenarios and team dynamics",
        "example_questions": [
            "Walk me through how you would approach a project with a tight deadline.",
            "Tell me about a time you had to deliver something with incomplete requirements.",
            "How do you prioritize when you have multiple urgent tasks?",
            "Describe a situation where you had to push back on a stakeholder request.",
            "How do you keep your team informed about project progress?"
        ]
    },
    "Tech Lead": {
        "title": "Technical Lead / Senior Engineer",
        "focus_areas": [
            "deep technical knowledge and expertise",
            "system design and architecture",
            "code quality and best practices",
            "debugging and troubleshooting complex issues",
            "performance optimization",
            "security considerations",
            "technical trade-offs and decision making",
            "staying current with technology trends",
            "code review and mentoring",
            "technical documentation"
        ],
        "question_types": {"technical": 75, "problem_solving": 15, "behavioral": 10},
        "tone": "technical, detailed, probing for depth of knowledge",
        "example_questions": [
            "How would you design a system that handles 10 million requests per day?",
            "Explain a complex technical problem you solved and your approach.",
            "What's your process for debugging a production issue at 2 AM?",
            "How do you decide between building vs buying a solution?",
            "Walk me through your code review process."
        ]
    },
    "CEO": {
        "title": "Chief Executive Officer",
        "focus_areas": [
            "business impact and value creation",
            "strategic thinking and vision",
            "leadership and influence",
            "understanding of company mission",
            "innovation and creative thinking",
            "risk assessment and management",
            "growth mindset and adaptability",
            "customer-centric thinking",
            "handling ambiguity and change",
            "long-term thinking"
        ],
        "question_types": {"strategic": 50, "behavioral": 30, "vision": 20},
        "tone": "big-picture, strategic, assessing leadership potential and business acumen",
        "example_questions": [
            "How would your work contribute to our company's mission?",
            "Tell me about a time you identified a significant business opportunity.",
            "How do you stay ahead of industry trends?",
            "What's the biggest risk you've taken professionally, and what was the outcome?",
            "How do you make decisions when you don't have all the information?"
        ]
    },
    "CFO": {
        "title": "Chief Financial Officer",
        "focus_areas": [
            "cost-benefit analysis and ROI thinking",
            "budget management and resource allocation",
            "financial impact of decisions",
            "efficiency and optimization",
            "data-driven decision making",
            "risk vs reward assessment",
            "understanding of business metrics",
            "vendor management and negotiations",
            "compliance and governance",
            "scaling and growth considerations"
        ],
        "question_types": {"analytical": 50, "behavioral": 30, "business": 20},
        "tone": "analytical, numbers-focused, assessing business and financial acumen",
        "example_questions": [
            "How do you measure the success of your projects in terms of business value?",
            "Tell me about a time you had to make a decision with budget constraints.",
            "How do you prioritize investments when resources are limited?",
            "Describe a situation where you identified cost savings.",
            "How do you calculate the ROI of a technical initiative?"
        ]
    },
    "President": {
        "title": "President / COO",
        "focus_areas": [
            "operational excellence and execution",
            "cross-functional collaboration",
            "organizational impact",
            "process improvement",
            "scaling teams and systems",
            "stakeholder management",
            "strategic planning and execution",
            "performance metrics and KPIs",
            "change management",
            "building and maintaining partnerships"
        ],
        "question_types": {"strategic": 40, "leadership": 35, "operational": 25},
        "tone": "operational, focused on execution and organizational impact",
        "example_questions": [
            "How have you contributed to improving processes in your organization?",
            "Tell me about leading a cross-functional initiative.",
            "How do you ensure alignment between different teams?",
            "Describe a time you had to drive organizational change.",
            "How do you measure and improve team performance?"
        ]
    },
    "Vice President": {
        "title": "Vice President",
        "focus_areas": [
            "strategic leadership and direction",
            "building and scaling teams",
            "cross-departmental influence",
            "OKRs and goal setting",
            "executive communication",
            "talent development and retention",
            "portfolio management",
            "stakeholder relationships",
            "innovation and transformation",
            "representing the organization"
        ],
        "question_types": {"leadership": 45, "strategic": 35, "behavioral": 20},
        "tone": "executive, focused on leadership, influence, and strategic impact",
        "example_questions": [
            "How do you build and maintain high-performing teams?",
            "Tell me about a strategic initiative you led from concept to execution.",
            "How do you handle competing priorities across departments?",
            "Describe your approach to developing talent.",
            "How do you communicate complex technical concepts to non-technical executives?"
        ]
    }
}

# Difficulty levels with detailed expectations
DIFFICULTY_PROFILES = {
    "intern": {
        "experience_range": "0-1 years / Student",
        "question_count": 12,
        "technical_depth": "fundamental",
        "expectations": [
            "Basic understanding of core concepts",
            "Eagerness to learn and grow",
            "Academic projects and coursework",
            "Problem-solving approach (not necessarily optimal solutions)",
            "Communication of thought process",
            "Enthusiasm and curiosity"
        ],
        "avoid": [
            "Complex system design questions",
            "Leadership and mentoring questions",
            "Questions requiring production experience",
            "Deep architectural trade-offs"
        ],
        "focus": "Learning ability, potential, basic fundamentals, enthusiasm"
    },
    "junior": {
        "experience_range": "1-2 years",
        "question_count": 15,
        "technical_depth": "foundational with some practical application",
        "expectations": [
            "Solid grasp of fundamentals",
            "Some real-world project experience",
            "Basic debugging and troubleshooting",
            "Understanding of development workflows",
            "Collaboration in team settings",
            "Growth mindset and coachability"
        ],
        "avoid": [
            "Senior-level architecture questions",
            "Questions about leading large teams",
            "Complex distributed systems"
        ],
        "focus": "Core skills, problem-solving, learning from experiences, growth potential"
    },
    "associate": {
        "experience_range": "2-4 years",
        "question_count": 18,
        "technical_depth": "solid practical knowledge",
        "expectations": [
            "Independent task completion",
            "Moderate complexity problem solving",
            "Code quality and best practices awareness",
            "Effective collaboration",
            "Some mentoring of juniors",
            "Project ownership for defined scope"
        ],
        "avoid": [
            "Questions requiring 10+ years experience",
            "C-level strategic questions"
        ],
        "focus": "Technical competence, ownership, collaboration, growing independence"
    },
    "senior": {
        "experience_range": "5-8 years",
        "question_count": 20,
        "technical_depth": "deep expertise with architectural thinking",
        "expectations": [
            "Technical leadership and decision making",
            "System design and architecture",
            "Mentoring and code reviews",
            "Cross-team collaboration",
            "Trade-off analysis",
            "Business impact awareness",
            "Production systems experience",
            "Handling ambiguity"
        ],
        "avoid": [
            "Basic/trivial technical questions",
            "Questions appropriate for entry-level"
        ],
        "focus": "Architecture, trade-offs, leadership, business impact, mentoring"
    },
    "lead": {
        "experience_range": "8+ years",
        "question_count": 22,
        "technical_depth": "expert with strategic vision",
        "expectations": [
            "Technical strategy and vision",
            "Team building and development",
            "Cross-organizational influence",
            "Executive communication",
            "Complex system ownership",
            "Innovation and improvement",
            "Risk management",
            "Stakeholder management"
        ],
        "avoid": [
            "Entry-level technical questions",
            "Questions not befitting seniority"
        ],
        "focus": "Strategy, leadership, organizational impact, technical vision"
    }
}

# Role-specific technical focus areas (inferred from resume/skills)
ROLE_TECHNICAL_FOCUS = {
    "software_engineer": {
        "keywords": ["software", "developer", "engineer", "programming", "coding", "full stack", "backend", "frontend"],
        "technical_areas": [
            "coding and algorithms",
            "system design",
            "API design",
            "database design",
            "testing strategies",
            "CI/CD and DevOps",
            "code review",
            "debugging production issues"
        ]
    },
    "data_scientist": {
        "keywords": ["data scientist", "machine learning", "ML", "AI", "analytics", "statistical"],
        "technical_areas": [
            "machine learning algorithms",
            "statistical analysis",
            "data preprocessing and cleaning",
            "model evaluation and validation",
            "feature engineering",
            "A/B testing",
            "data visualization",
            "production ML systems"
        ]
    },
    "data_engineer": {
        "keywords": ["data engineer", "ETL", "pipeline", "data warehouse", "big data"],
        "technical_areas": [
            "data pipeline design",
            "ETL processes",
            "data warehouse architecture",
            "big data technologies",
            "data quality and governance",
            "real-time vs batch processing",
            "data modeling",
            "performance optimization"
        ]
    },
    "devops_engineer": {
        "keywords": ["devops", "SRE", "infrastructure", "cloud", "kubernetes", "docker"],
        "technical_areas": [
            "CI/CD pipeline design",
            "infrastructure as code",
            "container orchestration",
            "monitoring and alerting",
            "incident response",
            "security best practices",
            "cost optimization",
            "high availability design"
        ]
    },
    "product_manager": {
        "keywords": ["product manager", "product owner", "PM", "product"],
        "technical_areas": [
            "product strategy and roadmap",
            "user research and feedback",
            "prioritization frameworks",
            "metrics and KPIs",
            "stakeholder management",
            "agile methodologies",
            "go-to-market strategy",
            "competitive analysis"
        ]
    },
    "default": {
        "keywords": [],
        "technical_areas": [
            "problem-solving approach",
            "technical decision making",
            "collaboration and communication",
            "project execution",
            "quality and attention to detail"
        ]
    }
}


def detect_role_category(role: str, skills: List[str]) -> str:
    """
    Detect the role category based on role title and skills from resume.
    This helps generate more relevant technical questions.
    """
    role_lower = (role or "").lower()
    skills_lower = " ".join(skills).lower() if skills else ""
    combined = f"{role_lower} {skills_lower}"

    for category, config in ROLE_TECHNICAL_FOCUS.items():
        if category == "default":
            continue
        for keyword in config["keywords"]:
            if keyword.lower() in combined:
                return category

    return "default"


def get_interviewer_profile(interviewer: str) -> Dict[str, Any]:
    """Get the profile for an interviewer, with fallback to Manager profile."""
    return INTERVIEWER_PROFILES.get(interviewer, INTERVIEWER_PROFILES["Manager"])


def get_difficulty_profile(difficulty: str) -> Dict[str, Any]:
    """Get the profile for a difficulty level, with fallback to junior."""
    lvl = (difficulty or "").lower()
    if lvl in DIFFICULTY_PROFILES:
        return DIFFICULTY_PROFILES[lvl]
    # Map variations
    if lvl in ["mid", "middle", "intermediate"]:
        return DIFFICULTY_PROFILES["associate"]
    if lvl in ["staff", "principal", "architect"]:
        return DIFFICULTY_PROFILES["lead"]
    return DIFFICULTY_PROFILES["junior"]


def count_for_level(level: str) -> int:
    """Return question count based on difficulty level."""
    profile = get_difficulty_profile(level)
    return profile.get("question_count", 15)


def calculate_question_distribution(interviewers: List[str], total_questions: int) -> Dict[str, int]:
    """
    Calculate how many questions each interviewer should ask.
    Distributes questions realistically based on interviewer roles.
    """
    if not interviewers:
        return {"Interviewer": total_questions}

    # Weight different interviewers (Manager and Tech Lead typically ask more)
    weights = {
        "Manager": 3,
        "Tech Lead": 3,
        "HR": 2,
        "CEO": 1,
        "CFO": 1,
        "President": 1,
        "Vice President": 1
    }

    total_weight = sum(weights.get(i, 2) for i in interviewers)
    distribution = {}

    remaining = total_questions - 3  # Reserve 3 for warmup (HR typically does these)

    for interviewer in interviewers:
        weight = weights.get(interviewer, 2)
        count = max(1, int((weight / total_weight) * remaining))
        distribution[interviewer] = count

    # Adjust to match total (add remaining to Manager or first interviewer)
    allocated = sum(distribution.values())
    diff = remaining - allocated
    if diff != 0:
        primary = "Manager" if "Manager" in distribution else interviewers[0]
        distribution[primary] = distribution.get(primary, 0) + diff

    return distribution


def questions_schema_text() -> str:
    """Return the JSON schema for question generation."""
    return """
Return ONLY JSON with this shape:
{
  "questions": [
    {
      "prompt": string (the actual question to ask),
      "topic": string (e.g., "System Design", "Behavioral", "Technical", "Leadership"),
      "interviewer": string (who asks this question),
      "type": string (one of: "warmup", "technical", "behavioral", "situational", "strategic", "analytical"),
      "idealAnswer": string (a strong example answer for reference),
      "rubric": {
        "content": string (what makes a good answer content-wise),
        "clarity": string (expectations for communication clarity),
        "structure": string (expected answer structure, e.g., STAR method)
      }
    }
  ]
}
No extra keys. No prose outside JSON. No markdown.
""".strip()


def build_questions_system_prompt() -> str:
    """Build the system prompt for question generation."""
    return """You are an expert interview question generator with 20+ years of experience conducting and designing technical and behavioral interviews at top companies like Google, Amazon, Microsoft, and Meta.

Your task is to generate realistic, high-quality interview questions that:
1. Are specific to the candidate's background and the role they're applying for
2. Match the difficulty level appropriately
3. Reflect what each interviewer type would realistically ask
4. Include a mix of technical, behavioral, and situational questions
5. Have practical, real-world relevance (not textbook questions)

CRITICAL RULES:
- Each question must be unique and not repeat concepts with different wording
- Questions must be calibrated to the difficulty level
- Technical questions should reference specific technologies from the candidate's skills
- Behavioral questions should use "Tell me about a time..." or similar formats
- Include the interviewer's name/role in each question object
- Provide detailed ideal answers and rubrics

You must return STRICT JSON ONLY following the given schema. No prose, no markdown, no explanations."""


def build_questions_user_prompt(
    role: str,
    difficulty: str,
    interviewers: List[str],
    requested_total: int,
    skills: List[str],
    keywords: List[str],
    job_description: Optional[str] = None,
) -> str:
    """
    Build a comprehensive user prompt for generating interview questions.
    This creates role-specific, interviewer-appropriate, difficulty-calibrated questions.
    """
    # Get profiles
    difficulty_profile = get_difficulty_profile(difficulty)
    role_category = detect_role_category(role, skills)
    role_tech_focus = ROLE_TECHNICAL_FOCUS.get(role_category, ROLE_TECHNICAL_FOCUS["default"])

    # Calculate question count
    total_allowed = difficulty_profile["question_count"]
    target = min(requested_total or total_allowed, total_allowed)

    # Set default interviewers if none provided
    if not interviewers:
        interviewers = ["HR", "Manager", "Tech Lead"]

    # Calculate question distribution per interviewer
    distribution = calculate_question_distribution(interviewers, target)

    # Build interviewer section with detailed guidance
    interviewer_sections = []
    for interviewer in interviewers:
        profile = get_interviewer_profile(interviewer)
        count = distribution.get(interviewer, 2)

        section = f"""
### {interviewer} ({profile['title']}) - {count} questions
Focus Areas: {', '.join(profile['focus_areas'][:5])}
Question Type Mix: {', '.join(f"{k}: {v}%" for k, v in profile['question_types'].items())}
Tone: {profile['tone']}
Example Questions:
{chr(10).join(f"  - {q}" for q in profile['example_questions'][:3])}
"""
        interviewer_sections.append(section)

    # Build skills section
    skills_text = ", ".join(skills[:30]) if skills else "Not specified"
    keywords_text = ", ".join(keywords[:20]) if keywords else "Not specified"
    tech_focus = ", ".join(role_tech_focus["technical_areas"][:6])

    # Build job description section if provided
    jd_section = ""
    jd_text = (job_description or "").strip()
    if len(jd_text) >= 40:
        jd_section = f"""
## JOB DESCRIPTION ALIGNMENT (HIGH PRIORITY)
{jd_text[:5000]}

IMPORTANT JD REQUIREMENTS:
- Generate questions that directly verify the candidate can perform JD responsibilities
- Include questions about specific tools/technologies mentioned in the JD
- Ask about experiences relevant to the job requirements
- Include 2-3 questions probing potential gaps (skills in JD but not in resume)
"""

    # Build the comprehensive prompt
    prompt = f"""
# INTERVIEW QUESTION GENERATION REQUEST

## CANDIDATE PROFILE
- **Target Role**: {role or "Software Professional"}
- **Experience Level**: {difficulty or "Junior"} ({difficulty_profile['experience_range']})
- **Core Skills**: {skills_text}
- **Keywords/Domains**: {keywords_text}
- **Detected Role Category**: {role_category.replace('_', ' ').title()}
- **Technical Focus Areas**: {tech_focus}

{jd_section}

## DIFFICULTY CALIBRATION: {difficulty.upper() if difficulty else "JUNIOR"}
**Experience Range**: {difficulty_profile['experience_range']}
**Technical Depth Expected**: {difficulty_profile['technical_depth']}

**What to Expect from This Level**:
{chr(10).join(f"- {exp}" for exp in difficulty_profile['expectations'])}

**Avoid These for This Level**:
{chr(10).join(f"- {avoid}" for avoid in difficulty_profile['avoid'])}

**Focus On**: {difficulty_profile['focus']}

## INTERVIEWER PANEL
{chr(10).join(interviewer_sections)}

## QUESTION GENERATION REQUIREMENTS

### Total Questions: {target}

### Question Structure:
1. **Warmup Questions (First 3)** - Asked by HR or Manager
   - Start with a friendly, open-ended introduction question
   - Ask about motivation for applying
   - Ask about self-assessment (strengths/growth areas)

2. **Technical Questions** - Based on skills and role
   - Ask about specific technologies from the candidate's skill set: {skills_text}
   - Include practical scenarios, not just theoretical questions
   - Calibrate complexity to {difficulty} level

3. **Behavioral Questions** - Using STAR method prompts
   - "Tell me about a time when..."
   - "Describe a situation where..."
   - "Give me an example of..."

4. **Situational Questions** - Hypothetical scenarios
   - "How would you handle..."
   - "What would you do if..."
   - "Imagine you're faced with..."

### Quality Requirements:
- Each question must be UNIQUE (no conceptual duplicates)
- Questions must reference SPECIFIC skills from the candidate's profile
- Technical questions should mention actual technologies: {skills_text}
- Behavioral questions should be role-relevant
- Ideal answers should be detailed (3-5 sentences minimum)
- Rubrics should give clear evaluation criteria

### Distribution by Interviewer:
{chr(10).join(f"- {name}: {count} questions" for name, count in distribution.items())}

## OUTPUT FORMAT
{questions_schema_text()}

Generate exactly {target} high-quality, realistic interview questions now.
"""

    return prompt.strip()



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


# -------------------- Interview Answer Models --------------------
# These models handle the submission of individual interview answers
# for the two-way communication feature (Phase 1)

class SubmitAnswerRequest(BaseModel):
    """
    Request model for submitting an interview answer.
    Validates all required fields for storing a Q&A pair.
    """
    session_id: str = Field(..., description="UUID of the interview session")
    question_id: int = Field(..., description="The order/number of the question (1-indexed)")
    question_text: str = Field(..., description="The actual question that was asked")
    question_intent: str = Field(..., description="What the question was testing (e.g., 'technical skills', 'problem solving')")
    role: str = Field(..., description="The role being interviewed for (e.g., 'Software Engineer')")
    user_answer: str = Field(..., description="The user's transcribed response")
    transcript_raw: Optional[str] = Field(None, description="Full transcript with timestamps if available")
    audio_duration_seconds: Optional[float] = Field(None, description="Duration of the audio response in seconds")


class SubmitAnswerResponse(BaseModel):
    """
    Response model for a successfully submitted answer.
    """
    success: bool
    answer_id: str
    message: str


class AnswerDetail(BaseModel):
    """
    Response model for a single answer in the list.
    Contains all stored answer data for display/processing.
    """
    id: str
    session_id: str
    question_id: int
    question_text: str
    question_intent: str
    role: str
    user_answer: str
    transcript_raw: Optional[str]
    audio_duration_seconds: Optional[float]
    answer_timestamp: datetime
    created_at: datetime


class RetrieveAnswersResponse(BaseModel):
    """
    Response model for retrieving all answers in a session.
    """
    success: bool
    session_id: str
    total_answers: int
    answers: List[AnswerDetail]


# -------------------- Interview Session Models --------------------
# These models handle creating a new interview session at the START
# so answers can be saved in real-time during the interview

class CreateSessionRequest(BaseModel):
    """
    Request model for creating a new interview session.
    Contains the interview configuration/metadata.
    """
    role: str = Field(..., description="The role being interviewed for (e.g., 'Software Engineer')")
    difficulty: str = Field(..., description="Interview difficulty level (e.g., 'Junior', 'Senior')")
    question_count: int = Field(..., description="Total number of questions in this interview")
    interviewer_names: List[str] = Field(default=[], description="List of interviewer names/roles")
    plan: Optional[Dict[str, Any]] = Field(None, description="Full interview plan with questions")


class CreateSessionResponse(BaseModel):
    """
    Response model for a successfully created session.
    Returns the session_id needed for submitting answers.
    """
    success: bool
    session_id: str
    message: str


class SessionDetailResponse(BaseModel):
    """
    Response model for fetching full session details.
    Includes session metadata, plan, and all answers.
    Used by Feedback page to retrieve interview data from database.
    """
    success: bool
    session_id: str
    role: str
    difficulty: str
    question_count: int
    interviewer_names: List[str]
    plan: Optional[Dict[str, Any]]
    answers: List[AnswerDetail]
    created_at: datetime


# -------------------- Semantic Search Models --------------------
# These models handle semantic search for finding similar answers
# based on embedding similarity within an interview session

class SearchAnswersRequest(BaseModel):
    """
    Request model for semantic search across interview answers.
    Searches within a specific session using embedding similarity.
    """
    session_id: str = Field(..., description="UUID of the interview session to search within")
    query: str = Field(..., description="The search query text (e.g., 'tell me about machine learning')")
    top_k: int = Field(default=5, ge=1, le=10, description="Number of top similar answers to return (1-10)")


class SearchAnswerResult(BaseModel):
    """
    A single search result containing the answer and its similarity score.
    """
    answer_id: str = Field(..., description="UUID of the matched answer")
    question_id: int = Field(..., description="The question number in the interview")
    question_text: str = Field(..., description="The question that was asked")
    user_answer: str = Field(..., description="The user's response")
    role: str = Field(..., description="The interviewer role who asked this question")
    similarity_score: float = Field(..., description="Cosine similarity score (0-1, higher = more similar)")


class SearchAnswersResponse(BaseModel):
    """
    Response model for semantic search results.
    Returns answers sorted by similarity (highest first).
    """
    success: bool
    session_id: str
    query: str
    total_results: int
    results: List[SearchAnswerResult]


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


# -------------------- Interview Answer Endpoints --------------------
# Phase 1: Two-way communication - Answer Storage System

@app.post("/api/interview/answer/submit", response_model=SubmitAnswerResponse)
async def submit_interview_answer(request: SubmitAnswerRequest):
    """
    Submit and store a single interview answer.

    This endpoint:
    1. Validates that the referenced interview session exists
    2. Creates a new InterviewAnswer record in the database
    3. Returns the generated answer_id for reference

    Args:
        request: SubmitAnswerRequest containing all answer details

    Returns:
        SubmitAnswerResponse with success status and answer_id

    Raises:
        HTTPException 404: If the session_id doesn't exist
        HTTPException 500: If there's a database error
    """

    # Step 1: Validate that the interview session exists in the database
    with Session(engine) as db_session:
        existing_session = db_session.exec(
            select(InterviewSession).where(InterviewSession.id == request.session_id)
        ).first()

        # If no session found, return 404 error
        if not existing_session:
            raise HTTPException(
                status_code=404,
                detail=f"Interview session with id '{request.session_id}' not found"
            )

    # Step 2: Generate embedding for semantic search
    try:
        # Combine question and answer for better semantic context
        text_for_embedding = f"Question: {request.question_text}\nAnswer: {request.user_answer}"
        embedding = generate_embedding(text_for_embedding)
        embedding_json = json.dumps(embedding)
    except Exception as e:
        logging.warning(f"Failed to generate embedding: {str(e)}. Storing answer without embedding.")
        embedding_json = None

    # Step 3: Create and store the InterviewAnswer record
    try:
        with Session(engine) as db_session:
            # Create new answer object with all provided data
            new_answer = InterviewAnswer(
                session_id=request.session_id,
                question_id=request.question_id,
                question_text=request.question_text,
                question_intent=request.question_intent,
                role=request.role,
                user_answer=request.user_answer,
                transcript_raw=request.transcript_raw,
                audio_duration_seconds=request.audio_duration_seconds,
                embedding=embedding_json  # Store the embedding
            )

            # Add to database and commit the transaction
            db_session.add(new_answer)
            db_session.commit()

            # Refresh to get the auto-generated UUID
            db_session.refresh(new_answer)

            # Store the generated ID for the response
            answer_id = new_answer.id

    except Exception as e:
        # Log the error for debugging and return a generic 500 error
        logging.error(f"Failed to store interview answer: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to store interview answer. Please try again."
        )

    # Step 3: Return success response with the new answer's ID (convert UUID to string)
    return SubmitAnswerResponse(
        success=True,
        answer_id=str(answer_id),
        message="Answer submitted successfully"
    )


@app.get("/api/interview/answers/{session_id}", response_model=RetrieveAnswersResponse)
async def get_interview_answers(session_id: str):
    """
    Retrieve all answers for a given interview session.

    This endpoint:
    1. Validates that the interview session exists
    2. Fetches all answers associated with the session
    3. Returns them ordered by answer_timestamp (chronological)

    Args:
        session_id: UUID of the interview session

    Returns:
        RetrieveAnswersResponse with list of all answers

    Raises:
        HTTPException 404: If the session_id doesn't exist
        HTTPException 500: If there's a database error
    """

    # Step 1: Validate that the interview session exists
    with Session(engine) as db_session:
        existing_session = db_session.exec(
            select(InterviewSession).where(InterviewSession.id == session_id)
        ).first()

        # If no session found, return 404 error
        if not existing_session:
            raise HTTPException(
                status_code=404,
                detail=f"Interview session with id '{session_id}' not found"
            )

    # Step 2: Retrieve all answers for this session, ordered chronologically
    try:
        with Session(engine) as db_session:
            # Query answers filtered by session_id, ordered by answer_timestamp
            answers = db_session.exec(
                select(InterviewAnswer)
                .where(InterviewAnswer.session_id == session_id)
                .order_by(InterviewAnswer.answer_timestamp)
            ).all()

            # Convert SQLModel objects to Pydantic response models (convert UUIDs to strings)
            answer_list = [
                AnswerDetail(
                    id=str(answer.id),
                    session_id=str(answer.session_id),
                    question_id=answer.question_id,
                    question_text=answer.question_text,
                    question_intent=answer.question_intent,
                    role=answer.role,
                    user_answer=answer.user_answer,
                    transcript_raw=answer.transcript_raw,
                    audio_duration_seconds=float(answer.audio_duration_seconds) if answer.audio_duration_seconds else None,
                    answer_timestamp=answer.answer_timestamp,
                    created_at=answer.created_at
                )
                for answer in answers
            ]

    except Exception as e:
        # Log the error and return a 500 response
        logging.error(f"Failed to retrieve interview answers: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve interview answers. Please try again."
        )

    # Step 3: Return the list of answers
    return RetrieveAnswersResponse(
        success=True,
        session_id=session_id,
        total_answers=len(answer_list),
        answers=answer_list
    )


@app.post("/api/interview/session/create", response_model=CreateSessionResponse)
async def create_interview_session(request: CreateSessionRequest):
    """
    Create a new interview session at the START of an interview.

    This endpoint:
    1. Creates a new InterviewSession record with the provided metadata
    2. Returns the session_id for use in subsequent answer submissions

    This allows answers to be saved in real-time during the interview,
    rather than waiting until the end. If the browser crashes, answers
    are already persisted in the database.

    Args:
        request: CreateSessionRequest with interview configuration

    Returns:
        CreateSessionResponse with the new session_id

    Raises:
        HTTPException 500: If there's a database error
    """

    try:
        with Session(engine) as db_session:
            # Create new interview session with provided metadata
            new_session = InterviewSession(
                role=request.role,
                difficulty=request.difficulty,
                question_count=request.question_count,
                interviewer_names=request.interviewer_names or [],
                plan=request.plan,
                # answers and report will be updated later
                answers=[],
                report=None
            )

            # Add to database and commit
            db_session.add(new_session)
            db_session.commit()

            # Refresh to get the auto-generated UUID
            db_session.refresh(new_session)

            session_id = new_session.id

    except Exception as e:
        # Log the error and return a 500 response
        logging.error(f"Failed to create interview session: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create interview session. Please try again."
        )

    # Return success with the new session_id (convert UUID to string)
    return CreateSessionResponse(
        success=True,
        session_id=str(session_id),
        message="Interview session created successfully"
    )


@app.get("/api/interview/session/{session_id}", response_model=SessionDetailResponse)
async def get_interview_session(session_id: str):
    """
    Retrieve full session details including all answers.

    This endpoint is used by the Feedback page to fetch interview data
    from the database instead of relying on localStorage.

    Args:
        session_id: UUID of the interview session

    Returns:
        SessionDetailResponse with session metadata, plan, and all answers

    Raises:
        HTTPException 404: If the session_id doesn't exist
        HTTPException 500: If there's a database error
    """

    try:
        with Session(engine) as db_session:
            # Fetch the interview session
            interview_session = db_session.exec(
                select(InterviewSession).where(InterviewSession.id == session_id)
            ).first()

            # If no session found, return 404 error
            if not interview_session:
                raise HTTPException(
                    status_code=404,
                    detail=f"Interview session with id '{session_id}' not found"
                )

            # Fetch all answers for this session, ordered chronologically
            answers = db_session.exec(
                select(InterviewAnswer)
                .where(InterviewAnswer.session_id == session_id)
                .order_by(InterviewAnswer.answer_timestamp)
            ).all()

            # Convert answers to response format (convert UUIDs to strings)
            answer_list = [
                AnswerDetail(
                    id=str(answer.id),
                    session_id=str(answer.session_id),
                    question_id=answer.question_id,
                    question_text=answer.question_text,
                    question_intent=answer.question_intent,
                    role=answer.role,
                    user_answer=answer.user_answer,
                    transcript_raw=answer.transcript_raw,
                    audio_duration_seconds=float(answer.audio_duration_seconds) if answer.audio_duration_seconds else None,
                    answer_timestamp=answer.answer_timestamp,
                    created_at=answer.created_at
                )
                for answer in answers
            ]

            # Return full session details (convert UUID to string)
            return SessionDetailResponse(
                success=True,
                session_id=str(interview_session.id),
                role=interview_session.role,
                difficulty=interview_session.difficulty,
                question_count=interview_session.question_count,
                interviewer_names=interview_session.interviewer_names or [],
                plan=interview_session.plan,
                answers=answer_list,
                created_at=interview_session.created_at
            )

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to retrieve interview session: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve interview session. Please try again."
        )


# -------------------- Semantic Search Endpoint --------------------

@app.post("/api/interview/search-answers", response_model=SearchAnswersResponse)
async def search_interview_answers(request: SearchAnswersRequest):
    """
    Semantic search for similar answers within an interview session.

    This endpoint:
    1. Validates that the referenced interview session exists
    2. Generates an embedding for the search query
    3. Finds the top_k most similar answers using cosine similarity
    4. Returns results sorted by similarity score (highest first)

    Use cases:
    - Find answers related to a specific topic (e.g., "machine learning")
    - Identify patterns in how candidate answered similar questions
    - Enable follow-up question generation based on previous answers

    Args:
        request: SearchAnswersRequest with session_id, query, and top_k

    Returns:
        SearchAnswersResponse with ranked list of similar answers

    Raises:
        HTTPException 404: If the session_id doesn't exist
        HTTPException 400: If the query is empty
        HTTPException 500: If embedding generation or search fails
    """

    # Step 1: Validate that the query is not empty
    if not request.query or not request.query.strip():
        raise HTTPException(
            status_code=400,
            detail="Search query cannot be empty"
        )

    # Step 2: Validate that the interview session exists in the database
    with Session(engine) as db_session:
        existing_session = db_session.exec(
            select(InterviewSession).where(InterviewSession.id == request.session_id)
        ).first()

        if not existing_session:
            raise HTTPException(
                status_code=404,
                detail=f"Interview session with id '{request.session_id}' not found"
            )

    # Step 3: Generate embedding for the search query
    try:
        query_embedding = generate_embedding(request.query)
    except Exception as e:
        logging.error(f"Failed to generate query embedding: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to process search query. Please try again."
        )

    # Step 4: Find similar answers using embedding similarity
    try:
        similar_answers = find_similar_answers(
            session_id=request.session_id,
            query_embedding=query_embedding,
            top_k=request.top_k
        )
    except Exception as e:
        logging.error(f"Failed to search answers: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to search answers. Please try again."
        )

    # Step 5: Transform results to response format
    results = [
        SearchAnswerResult(
            answer_id=answer["answer_id"],
            question_id=answer["question_id"],
            question_text=answer["question_text"],
            user_answer=answer["user_answer"],
            role=answer["role"],
            similarity_score=answer["similarity"]
        )
        for answer in similar_answers
    ]

    # Step 6: Return the search results
    return SearchAnswersResponse(
        success=True,
        session_id=request.session_id,
        query=request.query,
        total_results=len(results),
        results=results
    )
