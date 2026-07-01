"""
Rephrase interview questions when the candidate stays silent.

Uses GPT-4o-mini to produce a genuinely different wording while preserving intent.
"""

from __future__ import annotations

import asyncio
import os
from typing import Optional

from openai import OpenAI

from prompts.interview_prompts import PromptTemplates

_client: Optional[OpenAI] = None
MODEL = "gpt-4o-mini"


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        _client = OpenAI(api_key=api_key)
    return _client


def _rephrase_sync(question_text: str, role: str) -> str:
    prompt = PromptTemplates.rephrase_question(question_text.strip(), role)
    response = _get_client().chat.completions.create(
        model=MODEL,
        temperature=0.7,
        messages=[
            {
                "role": "system",
                "content": "You rephrase interview questions concisely. Output only the question.",
            },
            {"role": "user", "content": prompt},
        ],
    )
    text = (response.choices[0].message.content or "").strip()
    return text.strip("\"'")


async def rephrase_interview_question(question_text: str, role: str) -> str:
    """Return a semantically equivalent but differently worded interview question."""
    if not question_text.strip():
        return "Could you share an example from your recent experience?"
    return await asyncio.to_thread(_rephrase_sync, question_text, role)
