# db.py
import os
from sqlmodel import SQLModel, Field, create_engine, Relationship
import models

from sqlalchemy import Column, JSON, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, TYPE_CHECKING
from decimal import Decimal
import uuid

# Forward references for type checking
if TYPE_CHECKING:
    from db import JobDescription


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

    # Use UUID type to match existing database schema
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        sa_column=Column(PG_UUID(as_uuid=False), primary_key=True, index=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # high-level metadata
    role: str
    difficulty: str
    question_count: int

    # who was "in the room" (Manager, HR, etc.)
    interviewer_names: List[str] = Field(
        sa_column=Column(JSON)  # stored as jsonb in Supabase
    )

    # raw data so we don't lose anything
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

    # Relationship to job description
    job_description: Optional["JobDescription"] = Relationship(back_populates="session")


class InterviewAnswer(SQLModel, table=True):
    __tablename__ = "interview_answers"

    # Use UUID type to match interview_sessions.id in the database
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        sa_column=Column(PG_UUID(as_uuid=False), primary_key=True, index=True)
    )
    session_id: str = Field(
        sa_column=Column(
            PG_UUID(as_uuid=False),
            ForeignKey("interview_sessions.id", ondelete="CASCADE"),
            index=True,
            nullable=False
        )
    )
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


class JobDescription(SQLModel, table=True):
    """
    Store job description data for personalized interviews.

    This model stores the job details that are used to:
    - Generate personalized interview introductions
    - Tailor questions to the specific role
    - Provide context-aware follow-up questions
    """
    __tablename__ = "job_descriptions"

    # Use UUID type to match interview_sessions.id in the database
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        sa_column=Column(PG_UUID(as_uuid=False), primary_key=True, index=True)
    )
    session_id: str = Field(
        sa_column=Column(
            PG_UUID(as_uuid=False),
            ForeignKey("interview_sessions.id", ondelete="CASCADE"),
            index=True,
            unique=True,
            nullable=False
        )
    )

    # Company info
    company_name: Optional[str] = Field(default=None, max_length=255)
    company_description: Optional[str] = Field(default=None)

    # Role info
    job_title: str = Field(max_length=255, nullable=False)
    team_name: Optional[str] = Field(default=None, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)

    # Role details (stored as JSON strings)
    # Use JSON strings for arrays since they're easier to work with
    responsibilities: Optional[str] = Field(default=None)  # JSON array as string
    requirements: Optional[str] = Field(default=None)      # JSON array as string
    nice_to_have: Optional[str] = Field(default=None)      # JSON array as string

    # Full text of the job description
    role_description: Optional[str] = Field(default=None)

    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationship back to session
    session: Optional["InterviewSession"] = Relationship(back_populates="job_description")
