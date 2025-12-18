# models.py
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Resume(SQLModel, table=True):
    """
    Stores one parsed resume result.

    We can expand this later with more structured columns
    (skills table, interview sessions, etc.)
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    original_filename: str = Field(index=True)
    ats_score: int = Field(default=0)
    skills: str = Field(index=True)
    keywords: str = Field(index=True)
    rare_total: float = Field(default=0.0)


    # We'll just store the full parsed JSON (skills, rare, atsSuggestions, etc.)
    raw_json: str
