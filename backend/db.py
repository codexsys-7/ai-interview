# db.py
import os
from sqlmodel import SQLModel, Field, create_engine
import models

from sqlalchemy import Column, JSON
from datetime import datetime
from typing import Optional, List, Dict, Any


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

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

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
