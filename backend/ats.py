import re
from typing import Dict, List, Optional, Tuple

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(\+?\d{1,2}\s*)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}")
URL_RE = re.compile(r"(https?://\S+|www\.\S+|linkedin\.com/\S+|github\.com/\S+)", re.IGNORECASE)
METRIC_RE = re.compile(r"(\b\d+(\.\d+)?\s?%|\$\s?\d+|\b\d+\s?(ms|s|sec|mins|min|hours|days|x)\b|\b\d{3,}\b)", re.IGNORECASE)

SECTION_HINTS = {
    "summary": ["summary", "professional summary", "profile"],
    "experience": ["experience", "work experience", "employment"],
    "skills": ["skills", "technical skills", "core skills"],
    "education": ["education", "academics"],
}

def _has_any(text: str, needles: List[str]) -> bool:
    t = text.lower()
    return any(n in t for n in needles)

def tokenize_keywords(text: str) -> List[str]:
    # very lightweight keyword extraction (you can improve later)
    words = re.findall(r"[A-Za-z][A-Za-z0-9+.#/-]{1,}", text.lower())
    # drop extremely common filler words
    stop = {"and","or","the","a","an","to","of","in","for","with","on","at","by","as","from","is","are"}
    return [w for w in words if w not in stop and len(w) >= 3]

def keyword_overlap(resume_text: str, jd_text: str) -> Tuple[List[str], List[str]]:
    rset = set(tokenize_keywords(resume_text))
    jset = set(tokenize_keywords(jd_text))
    matched = sorted(list(rset & jset))
    missing = sorted(list(jset - rset))
    # keep it sane size
    return matched[:40], missing[:80]

def compute_ats_score(resume_text: str, jd_text: Optional[str] = None) -> Dict:
    r = resume_text or ""
    jd = (jd_text or "").strip()
    has_jd = len(jd) >= 40

    # --- Searchability / ATS Essentials ---
    email_ok = bool(EMAIL_RE.search(r))
    phone_ok = bool(PHONE_RE.search(r))
    url_ok = bool(URL_RE.search(r))
    sections_ok = sum(1 for k,v in SECTION_HINTS.items() if _has_any(r, v))

    metrics_count = len(METRIC_RE.findall(r))

    # Basic scores (cap each)
    searchability = 0
    searchability += 8 if email_ok else 0
    searchability += 6 if phone_ok else 0
    searchability += 6 if url_ok else 0
    searchability += min(5, sections_ok)  # up to 5

    ats_essentials = 0
    ats_essentials += min(10, sections_ok * 2)     # 0–10
    ats_essentials += 10 if ("•" in r or "-" in r) else 5  # bullet heuristic
    ats_essentials += 5 if len(r) > 1500 else 2    # enough content heuristic

    recruiter_tips = 0
    recruiter_tips += min(8, metrics_count * 2)    # more metrics -> higher
    recruiter_tips += 2 if url_ok else 0

    # --- JD Match ---
    matched, missing = ([], [])
    hard_skill_match = 0
    resp_match = 0
    seniority_match = 8  # default neutral-ish

    if has_jd:
        matched, missing = keyword_overlap(r, jd)
        # simple overlap ratio
        j_tokens = set(tokenize_keywords(jd))
        overlap_ratio = (len(matched) / max(1, len(j_tokens)))

        hard_skill_match = int(min(35, overlap_ratio * 55))  # maps to 0–35
        resp_match = int(min(25, overlap_ratio * 40))        # maps to 0–25

        # crude seniority heuristic
        jd_senior = bool(re.search(r"\b(senior|lead|principal|manager|7\+|8\+|10\+)\b", jd.lower()))
        r_senior = bool(re.search(r"\b(senior|lead|principal|manager|architect|10\+|8\+|7\+)\b", r.lower()))
        if jd_senior and not r_senior:
            seniority_match = 3
        elif jd_senior and r_senior:
            seniority_match = 10

    # --- Combine weights ---
    if not has_jd:
        # Mode A weights
        ats_score = (
            0.25 * ats_essentials +
            0.25 * searchability +
            0.30 * (min(30, 10 + metrics_count * 2)) +  # content quality proxy
            0.20 * recruiter_tips
        )
        ats_score = int(round(min(100, ats_score)))
        return {
            "mode": "resume_only",
            "atsScore": ats_score,
            "breakdown": {
                "atsEssentials": int(min(25, ats_essentials)),
                "searchability": int(min(25, searchability)),
                "content": int(min(30, 10 + metrics_count * 2)),
                "recruiterTips": int(min(20, recruiter_tips)),
            },
            "jobMatchScore": None,
            "matchedKeywords": [],
            "missingKeywords": [],
        }

    # Mode B weights
    ats_score = (
        0.35 * hard_skill_match +
        0.25 * resp_match +
        0.20 * (0.5 * searchability + 0.5 * ats_essentials) +
        0.10 * seniority_match +
        0.10 * recruiter_tips
    )
    ats_score = int(round(min(100, ats_score)))

    return {
        "mode": "resume_plus_jd",
        "atsScore": ats_score,
        "jobMatchScore": ats_score,
        "breakdown": {
            "hardSkillsMatch": int(min(35, hard_skill_match)),
            "responsibilitiesMatch": int(min(25, resp_match)),
            "searchability": int(min(10, searchability)),      # scaled in weight anyway
            "atsEssentials": int(min(10, ats_essentials)),     # scaled in weight anyway
            "seniorityMatch": int(min(10, seniority_match)),
            "recruiterTips": int(min(10, recruiter_tips)),
        },
        "matchedKeywords": matched[:20],
        "missingKeywords": missing[:30],
    }
