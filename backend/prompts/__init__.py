# backend/prompts/__init__.py
"""
Interview Prompts Package

Contains LLM prompt templates for intelligent question generation.
"""

from .interview_prompts import (
    PromptTemplates,
    StandardPrompt,
    FollowUpPrompt,
    ReferencingPrompt,
    ContradictionPrompt,
    DeepDivePrompt,
    ContextualPrompt,
    CommentPrompt
)

__all__ = [
    "PromptTemplates",
    "StandardPrompt",
    "FollowUpPrompt",
    "ReferencingPrompt",
    "ContradictionPrompt",
    "DeepDivePrompt",
    "ContextualPrompt",
    "CommentPrompt"
]
