# backend/services/__init__.py
"""
Services Package for AI Interview Simulator

This package contains all backend services for the interview system:

Phase 1 - Answer Storage:
    - embedding_service: Generate embeddings for semantic search

Phase 1.2 - Memory System:
    - conversation_context: Build conversation summaries and detect patterns
    - contradiction_detector: Detect contradictions in candidate answers

Phase 1.3 - Intelligent Question Generation:
    - intelligent_question_generator: Generate contextual interview questions
    - interview_decision_engine: Decide what type of question to ask
    - interview_orchestrator: Coordinate all interview intelligence components
    - interviewer_personality: Natural, varied interviewer responses
    - realtime_response_generator: Generate contextual responses during/after answers
    - tts_service: Text-to-Speech using OpenAI TTS API
    - job_introduction_generator: Generate warm introductions for job-specific interviews
"""

# Phase 1 - Embedding Service
from .embedding_service import generate_embedding, find_similar_answers

# Phase 1.2 - Memory System
from .conversation_context import (
    get_all_answers,
    build_conversation_summary,
    detect_repeated_topics,
    get_recent_context,
    extract_topics
)
from .contradiction_detector import detect_contradictions

# Phase 1.3 - Intelligent Question Generation
from .intelligent_question_generator import (
    IntelligentQuestionGenerator,
    generate_intelligent_question
)
from .interview_decision_engine import (
    InterviewDecisionEngine,
    decide_interview_action
)
from .interview_orchestrator import (
    InterviewOrchestrator,
    get_orchestrated_question
)
from .question_selector import (
    QuestionSelector,
    get_question_selector
)
from .interviewer_personality import (
    InterviewerPersonality,
    get_interviewer_personality,
    reset_interviewer_personality,
    acknowledge,
    encourage,
    transition,
    probe
)
from .realtime_response_generator import (
    RealtimeResponseGenerator,
    get_realtime_response_generator,
    reset_realtime_response_generator,
    generate_post_answer_response,
    analyze_answer_quality
)
from .tts_service import (
    TTSService,
    get_tts_service,
    reset_tts_service,
    generate_speech,
    generate_interview_speech,
    speak_if_appropriate
)
from .job_introduction_generator import (
    JobIntroductionGenerator,
    get_job_introduction_generator,
    generate_job_introduction,
    IntroductionMode
)

__all__ = [
    # Phase 1
    "generate_embedding",
    "find_similar_answers",
    # Phase 1.2
    "get_all_answers",
    "build_conversation_summary",
    "detect_repeated_topics",
    "get_recent_context",
    "extract_topics",
    "detect_contradictions",
    # Phase 1.3
    "IntelligentQuestionGenerator",
    "generate_intelligent_question",
    "InterviewDecisionEngine",
    "decide_interview_action",
    "InterviewOrchestrator",
    "get_orchestrated_question",
    "QuestionSelector",
    "get_question_selector",
    # Phase 1.3 - Interviewer Personality
    "InterviewerPersonality",
    "get_interviewer_personality",
    "reset_interviewer_personality",
    "acknowledge",
    "encourage",
    "transition",
    "probe",
    # Phase 1.3 - Realtime Response Generator
    "RealtimeResponseGenerator",
    "get_realtime_response_generator",
    "reset_realtime_response_generator",
    "generate_post_answer_response",
    "analyze_answer_quality",
    # Phase 1.3 - TTS Service
    "TTSService",
    "get_tts_service",
    "reset_tts_service",
    "generate_speech",
    "generate_interview_speech",
    "speak_if_appropriate",
    # Phase 1.3 - Job Introduction Generator
    "JobIntroductionGenerator",
    "get_job_introduction_generator",
    "generate_job_introduction",
    "IntroductionMode",
]
