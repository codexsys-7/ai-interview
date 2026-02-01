# db.py
import os
from sqlmodel import SQLModel, Field, create_engine
import models

from sqlalchemy import Column, JSON
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from decimal import Decimal
import uuid


# Load DATABASE_URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in the environment (.env)")

# Create sync engine for Postgres
engine = create_engine(DATABASE_URL, echo=False)


def init_db() -> None:
    """
    Called on app startup to create tables if they don't exist.
    """
    # Import models here so SQLModel knows about them
    import models  # if api.py & db.py are in a package
    # or: import models  # if they're in the same flat folder

    SQLModel.metadata.create_all(engine)


class InterviewSession(SQLModel, table=True):
    __tablename__ = "interview_sessions"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # high-level metadata
    role: str
    difficulty: str
    question_count: int

    # who was “in the room” (Manager, HR, etc.)
    interviewer_names: List[str] = Field(
        sa_column=Column(JSON)  # stored as jsonb in Supabase
    )

    # raw data so we don’t lose anything
    plan: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON)
    )
    answers: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        sa_column=Column(JSON)
    )
    report: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON)
    )


class InterviewAnswer(SQLModel, table=True):
    __tablename__ = "interview_answers"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True
    )
    session_id: str = Field(foreign_key="interview_sessions.id", index=True)
    question_id: int = Field(nullable=False)
    question_text: str = Field(nullable=False)
    question_intent: str = Field(max_length=255, nullable=False)
    role: str = Field(max_length=255, nullable=False)
    user_answer: str = Field(nullable=False)
    transcript_raw: Optional[str] = Field(default=None)
    audio_duration_seconds: Optional[Decimal] = Field(default=None)
    answer_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Embedding for semantic search (stored as JSON string of float array)
    embedding: Optional[str] = Field(default=None)
