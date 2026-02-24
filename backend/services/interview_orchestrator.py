# backend/services/interview_orchestrator.py
"""
Interview Orchestrator Service

Master controller that coordinates all interview intelligence components.
This is the brain of the interview system - it decides what question to ask,
when to follow up, when to challenge, and how to maintain conversation flow.
"""

import logging
import time
import json
from typing import Dict, List, Optional, Any
from uuid import UUID
from datetime import datetime, timezone

from services.intelligent_question_generator import IntelligentQuestionGenerator
from services.interview_decision_engine import InterviewDecisionEngine
from services.conversation_context import (
    get_all_answers,
    build_conversation_summary,
    detect_repeated_topics,
    extract_topics
)
from services.contradiction_detector import detect_contradictions
from services.embedding_service import (
    generate_embedding,
    find_similar_answers
)
from services.interviewer_personality import (
    InterviewerPersonality,
    get_interviewer_personality
)
from services.realtime_response_generator import (
    RealtimeResponseGenerator,
    get_realtime_response_generator
)
from services.tts_service import (
    TTSService,
    get_tts_service
)

# Configure logging with detailed format
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class InterviewOrchestrator:
    """
    Master controller that coordinates all interview intelligence components.

    This orchestrator:
    - Coordinates question generation
    - Manages conversation flow
    - Detects patterns and contradictions
    - Decides interview strategy
    - Formats responses for UI consumption

    Dependencies:
    - IntelligentQuestionGenerator: Generates contextual questions
    - InterviewDecisionEngine: Decides what type of question to ask
    - ConversationContext: Provides conversation history and analysis
    - ContradictionDetector: Identifies inconsistencies
    - EmbeddingService: Enables semantic search
    """

    def __init__(
        self,
        question_generator: Optional[IntelligentQuestionGenerator] = None,
        decision_engine: Optional[InterviewDecisionEngine] = None,
        conversation_context_module=None,
        contradiction_detector_module=None,
        embedding_service_module=None,
        interviewer_personality: Optional[InterviewerPersonality] = None,
        realtime_response_generator: Optional[RealtimeResponseGenerator] = None,
        tts_service: Optional[TTSService] = None
    ):
        """
        Initialize the Interview Orchestrator with all dependencies.

        Args:
            question_generator: IntelligentQuestionGenerator instance
            decision_engine: InterviewDecisionEngine instance
            conversation_context_module: Module for conversation context
            contradiction_detector_module: Module for contradiction detection
            embedding_service_module: Module for embeddings
            interviewer_personality: InterviewerPersonality instance for natural responses
            realtime_response_generator: RealtimeResponseGenerator for post-answer responses
            tts_service: TTSService instance for text-to-speech conversion
        """
        # Initialize or create dependencies
        self.question_generator = question_generator or IntelligentQuestionGenerator()
        self.decision_engine = decision_engine or InterviewDecisionEngine()

        # Initialize interviewer personality for natural, varied responses
        self.personality = interviewer_personality or get_interviewer_personality()

        # Initialize realtime response generator for post-answer processing
        self.realtime_generator = realtime_response_generator or get_realtime_response_generator()

        # Initialize TTS service for audio generation
        self.tts_service = tts_service or get_tts_service()

        # Store module references for dependency injection in testing
        self.conversation_context = conversation_context_module
        self.contradiction_detector = contradiction_detector_module
        self.embedding_service = embedding_service_module

        # Track follow-up attempts per question to avoid infinite loops
        self._follow_up_counts: Dict[str, int] = {}  # session_question_key -> count
        self.MAX_FOLLOW_UPS = 1  # Max follow-up probes before proceeding

        logger.info("InterviewOrchestrator initialized with all dependencies including TTS service")

    async def get_next_question(
        self,
        session_id: UUID,
        current_question_number: int,
        role: str,
        difficulty: str,
        total_questions: int = 10
    ) -> Dict[str, Any]:
        """
        Main entry point for getting next interview question.

        This is the brain of the interview system.

        Flow:
        1. Retrieve full conversation context
        2. Analyze patterns (contradictions, repetitions, quality)
        3. Decide what type of question to ask (via decision engine)
        4. Generate appropriate question (via question generator)
        5. Return with full metadata for UI

        Args:
            session_id: The interview session UUID
            current_question_number: Current question number (1-indexed)
            role: Job role being interviewed for
            difficulty: Interview difficulty level
            total_questions: Total planned questions

        Returns:
            Dict with question, interviewer_comment, references, and metadata
        """
        start_time = time.time()
        session_id_str = str(session_id)

        logger.info("=" * 60)
        logger.info(f"ORCHESTRATOR: Getting next question for session {session_id_str}")
        logger.info(f"Question #{current_question_number} | Role: {role} | Difficulty: {difficulty}")
        logger.info("=" * 60)

        try:
            # Step 1: Detect all patterns in conversation
            logger.info("Step 1: Detecting conversation patterns...")
            patterns = await self._detect_all_patterns(session_id)
            logger.info(f"Patterns detected: {list(patterns.keys())}")

            # Step 2: Get decision from decision engine
            logger.info("Step 2: Getting decision from decision engine...")
            decision = await self.decision_engine.decide_next_action(
                session_id,
                current_question_number,
                total_questions
            )

            action = decision.get("action", "standard")
            logger.info(f"Decision: {action} (Priority: {decision.get('priority', 'N/A')})")
            logger.info(f"Reason: {decision.get('reason', 'N/A')}")

            # Step 3: Generate question based on decision
            logger.info(f"Step 3: Generating {action} question...")
            question_data = await self._generate_question_by_action(
                session_id,
                current_question_number,
                role,
                difficulty,
                action,
                decision.get("data", {})
            )

            logger.info(f"Generated question type: {question_data.get('question_type', 'N/A')}")

            # Step 4: Build interviewer comment
            logger.info("Step 4: Building interviewer comment...")
            interviewer_comment = await self._build_interviewer_comment(
                action,
                decision.get("data", {})
            )

            if interviewer_comment:
                logger.info(f"Interviewer comment: {interviewer_comment[:50]}...")
            else:
                logger.info("No interviewer comment needed")

            # Step 5: Format final response
            logger.info("Step 5: Formatting response...")
            response = await self._format_question_response(
                question_data,
                decision,
                current_question_number,
                patterns,
                interviewer_comment
            )

            # Log execution time
            execution_time = time.time() - start_time
            logger.info(f"ORCHESTRATOR: Question generated in {execution_time:.2f}s")
            logger.info("=" * 60)

            return response

        except Exception as e:
            logger.error(f"ORCHESTRATOR ERROR: {str(e)}")
            logger.exception("Full traceback:")

            # Return fallback question
            return await self._get_fallback_question(
                current_question_number,
                role,
                difficulty,
                str(e)
            )

    async def process_answer_and_get_next(
        self,
        session_id: UUID,
        answer_data: Dict[str, Any],
        role: str,
        difficulty: str,
        total_questions: int = 10
    ) -> Dict[str, Any]:
        """
        Process submitted answer AND generate next question in one call.

        This enables seamless conversation flow with realtime feedback.

        Flow:
        1. Store the answer with embedding
        2. Generate realtime response (acknowledgment, probe, etc.)
        3. Check if should proceed to next question
        4. If yes, get next question; if no, return probe for more detail

        Args:
            session_id: The interview session UUID
            answer_data: Dict containing answer details
            role: Job role being interviewed for
            difficulty: Interview difficulty level
            total_questions: Total planned questions

        Returns:
            Dict with answer_stored status, answer_id, realtime_response, and next_question
        """
        start_time = time.time()
        session_id_str = str(session_id)

        logger.info("=" * 60)
        logger.info(f"ORCHESTRATOR: Processing answer and getting next question")
        logger.info(f"Session: {session_id_str}")
        logger.info("=" * 60)

        answer_id = None
        answer_stored = False
        realtime_response = None

        try:
            # Step 1: Store the answer with embedding
            logger.info("Step 1: Storing answer...")

            question_id = answer_data.get("question_id", 0)
            user_answer = answer_data.get("user_answer", "")
            question_text = answer_data.get("question_text", "")
            question_intent = answer_data.get("question_intent", "behavioral")

            # Generate embedding for the answer
            logger.info("Generating embedding for answer...")
            text_for_embedding = f"Question: {question_text}\nAnswer: {user_answer}"

            try:
                embedding = generate_embedding(text_for_embedding)
                embedding_json = json.dumps(embedding)
                logger.info("Embedding generated successfully")
            except Exception as embed_error:
                logger.warning(f"Failed to generate embedding: {embed_error}")
                embedding_json = None

            # Store in database (this would typically call the API or db directly)
            # For now, we'll return the data that should be stored
            answer_id = self._generate_answer_id()
            answer_stored = True

            logger.info(f"Answer stored with ID: {answer_id}")

            # Step 2: Generate realtime response to the answer
            logger.info("Step 2: Generating realtime response...")
            try:
                realtime_response = await self.realtime_generator.generate_post_answer_response(
                    session_id,
                    user_answer,
                    question_id,
                    question_intent
                )
                logger.info(f"Realtime response generated: action={realtime_response.get('action_taken')}")
                logger.info(f"Should proceed: {realtime_response.get('should_proceed_to_next')}")
            except Exception as rt_error:
                logger.warning(f"Failed to generate realtime response: {rt_error}")
                # Fallback realtime response
                realtime_response = {
                    "acknowledgment": {
                        "text": "Thank you for sharing that.",
                        "should_speak": True,
                        "tone": "neutral"
                    },
                    "follow_up_probe": None,
                    "needs_clarification": False,
                    "should_proceed_to_next": True,
                    "response_delay_ms": 500,
                    "quality_metrics": None,
                    "action_taken": "fallback"
                }

            # Step 3: Decide whether to proceed to next question
            should_proceed = realtime_response.get("should_proceed_to_next", True)
            next_question = None

            if should_proceed:
                # Step 4a: Get next question
                logger.info("Step 3: Getting next question (proceeding)...")
                next_question_number = question_id + 1

                next_question = await self.get_next_question(
                    session_id,
                    next_question_number,
                    role,
                    difficulty,
                    total_questions
                )
            else:
                # Step 4b: Don't get next question - let the probe run first
                logger.info("Step 3: Not proceeding to next question (probe pending)...")
                # The follow_up_probe in realtime_response will be shown to user
                # Next call to this method will proceed after user responds to probe

            # Build response
            response = {
                "answer_stored": answer_stored,
                "answer_id": answer_id,
                "embedding_generated": embedding_json is not None,
                "realtime_response": realtime_response,
                "should_proceed": should_proceed,
                "next_question": next_question
            }

            execution_time = time.time() - start_time
            logger.info(f"ORCHESTRATOR: Answer processed in {execution_time:.2f}s (proceed={should_proceed})")

            return response

        except Exception as e:
            logger.error(f"ORCHESTRATOR ERROR in process_answer_and_get_next: {str(e)}")
            logger.exception("Full traceback:")

            # Still try to return next question even if storage failed
            try:
                next_question_number = answer_data.get("question_id", 0) + 1
                next_question = await self.get_next_question(
                    session_id,
                    next_question_number,
                    role,
                    difficulty,
                    total_questions
                )
            except Exception:
                next_question = await self._get_fallback_question(
                    answer_data.get("question_id", 0) + 1,
                    role,
                    difficulty,
                    str(e)
                )

            return {
                "answer_stored": False,
                "answer_id": None,
                "error": str(e),
                "realtime_response": {
                    "acknowledgment": {
                        "text": "Thank you.",
                        "should_speak": True,
                        "tone": "neutral"
                    },
                    "follow_up_probe": None,
                    "needs_clarification": False,
                    "should_proceed_to_next": True,
                    "response_delay_ms": 300,
                    "quality_metrics": None,
                    "action_taken": "error_fallback"
                },
                "should_proceed": True,
                "next_question": next_question
            }

    async def analyze_conversation_state(
        self,
        session_id: UUID
    ) -> Dict[str, Any]:
        """
        Get current state of interview conversation.

        Useful for debugging and monitoring interview quality.

        Args:
            session_id: The interview session UUID

        Returns:
            Dict with comprehensive conversation analysis
        """
        session_id_str = str(session_id)
        logger.info(f"Analyzing conversation state for session {session_id_str}")

        try:
            # Get all answers
            all_answers = get_all_answers(session_id_str)
            total_answers = len(all_answers)

            if total_answers == 0:
                return {
                    "total_answers": 0,
                    "topics_discussed": [],
                    "repeated_topics": {},
                    "contradictions_detected": [],
                    "conversation_summary": "No answers yet.",
                    "quality_metrics": {
                        "avg_answer_length": 0,
                        "star_format_usage": 0,
                        "specificity_score": 0
                    },
                    "recommendations": ["Interview has not started yet."]
                }

            # Get topics
            topics_discussed = extract_topics(session_id_str)
            repeated_topics = detect_repeated_topics(session_id_str)

            # Get contradictions
            contradictions = []
            if total_answers >= 2:
                last_answer = all_answers[-1]
                contradictions = await detect_contradictions(
                    session_id_str,
                    last_answer.get("user_answer", ""),
                    last_answer.get("question_text", "")
                )

            # Build summary
            conversation_summary = build_conversation_summary(session_id_str)

            # Calculate quality metrics
            quality_metrics = self._calculate_quality_metrics(all_answers)

            # Generate recommendations
            recommendations = self._generate_recommendations(
                all_answers,
                repeated_topics,
                contradictions,
                quality_metrics
            )

            return {
                "total_answers": total_answers,
                "topics_discussed": topics_discussed,
                "repeated_topics": repeated_topics,
                "contradictions_detected": contradictions,
                "conversation_summary": conversation_summary[:500] + "..." if len(conversation_summary) > 500 else conversation_summary,
                "quality_metrics": quality_metrics,
                "recommendations": recommendations
            }

        except Exception as e:
            logger.error(f"Error analyzing conversation state: {str(e)}")
            return {
                "total_answers": 0,
                "error": str(e),
                "topics_discussed": [],
                "repeated_topics": {},
                "contradictions_detected": [],
                "conversation_summary": "Error analyzing conversation.",
                "quality_metrics": {},
                "recommendations": []
            }

    async def _detect_all_patterns(
        self,
        session_id: UUID
    ) -> Dict[str, Any]:
        """
        Internal method to detect all conversation patterns.

        Args:
            session_id: The interview session UUID

        Returns:
            Dict with all detected patterns
        """
        session_id_str = str(session_id)
        logger.info(f"Detecting all patterns for session {session_id_str}")

        patterns = {
            "contradictions": [],
            "repeated_topics": {},
            "weak_answers": [],
            "strong_areas": [],
            "gaps": []
        }

        try:
            # Get all answers
            all_answers = get_all_answers(session_id_str)

            if not all_answers:
                logger.info("No answers yet - no patterns to detect")
                return patterns

            # Detect repeated topics
            patterns["repeated_topics"] = detect_repeated_topics(session_id_str)
            logger.info(f"Repeated topics: {patterns['repeated_topics']}")

            # Detect contradictions (check last answer against history)
            last_answer = all_answers[-1]
            patterns["contradictions"] = await detect_contradictions(
                session_id_str,
                last_answer.get("user_answer", ""),
                last_answer.get("question_text", "")
            )
            logger.info(f"Contradictions found: {len(patterns['contradictions'])}")

            # Analyze answer quality to find weak answers
            for answer in all_answers:
                quality = self.decision_engine._analyze_answer_quality(
                    answer.get("user_answer", ""),
                    answer.get("question_intent", "general")
                )

                if quality["completeness_score"] < 0.4 or quality["is_vague"]:
                    patterns["weak_answers"].append(answer.get("question_id"))

            logger.info(f"Weak answers (question IDs): {patterns['weak_answers']}")

            # Identify strong areas (topics with good, detailed answers)
            for topic, count in patterns["repeated_topics"].items():
                if count >= 2:
                    patterns["strong_areas"].append(topic)

            logger.info(f"Strong areas: {patterns['strong_areas']}")

            # Identify gaps (expected topics not covered)
            expected_topics = ["experience", "skills", "challenges", "achievements", "teamwork"]
            discussed_topics = extract_topics(session_id_str)
            discussed_lower = [t.lower() for t in discussed_topics]

            for expected in expected_topics:
                if not any(expected in topic for topic in discussed_lower):
                    patterns["gaps"].append(expected)

            logger.info(f"Gaps identified: {patterns['gaps']}")

            return patterns

        except Exception as e:
            logger.error(f"Error detecting patterns: {str(e)}")
            return patterns

    async def _build_interviewer_comment(
        self,
        action_type: str,
        action_data: Dict[str, Any]
    ) -> Optional[str]:
        """
        Build natural pre-question comment based on action type.

        Uses InterviewerPersonality for varied, natural responses.

        Args:
            action_type: The type of action being taken
            action_data: Data associated with the action

        Returns:
            Natural, conversational comment or None
        """
        logger.info(f"Building interviewer comment for action: {action_type}")

        try:
            # Update personality with current interview stage
            stage = action_data.get("stage", "mid")
            questions_remaining = action_data.get("questions_remaining", 5)

            if action_type == "standard":
                # For standard questions, maybe add acknowledgment of previous answer
                # or occasional encouragement
                previous_quality = action_data.get("previous_answer_quality")
                if previous_quality:
                    return self.personality.generate_acknowledgment(previous_quality)

                # Maybe add time check or encouragement
                question_number = action_data.get("question_number", 0)
                if question_number > 0:
                    encouragement = self.personality.generate_encouragement(
                        question_number,
                        action_data.get("performance_trend", "steady")
                    )
                    if encouragement:
                        return encouragement

                    # Maybe add time check
                    time_check = self.personality.generate_time_check(questions_remaining)
                    if time_check:
                        return time_check

                return None

            elif action_type == "reference":
                topic = action_data.get("topic", "that topic")
                count = action_data.get("mention_count", 0)
                past_answer = action_data.get("past_answer", {})
                previous_topic = action_data.get("previous_topic", "that")

                # Use interest response if topic mentioned multiple times
                if count >= 3:
                    interest = self.personality.generate_interest_response(topic, count)
                    if interest:
                        return interest

                # Use transition to reference past answer
                if past_answer:
                    return self.personality.generate_transition(
                        previous_topic,
                        topic,
                        "buildup"
                    )

                # Default transition
                return self.personality.generate_transition(
                    previous_topic,
                    topic,
                    "natural"
                )

            elif action_type == "challenge":
                contradiction = action_data.get("contradiction", {})
                contradiction_type = contradiction.get("contradiction_type", "general")

                # Build context for clarification
                context = {
                    "aspect_a": contradiction.get("previous_statement", "one thing")[:50],
                    "aspect_b": contradiction.get("current_statement", "another")[:50]
                }

                return self.personality.generate_clarification_request(
                    contradiction_type,
                    context
                )

            elif action_type == "deep_dive":
                topic = action_data.get("topic", "this area")
                count = action_data.get("mention_count", 0)

                # Use interest response for deep dive
                interest = self.personality.generate_interest_response(topic, max(count, 3))
                if interest:
                    return interest

                # Fallback to transition with buildup
                return self.personality.generate_transition(
                    "your experience",
                    topic,
                    "buildup"
                )

            elif action_type == "follow_up":
                reason = action_data.get("reason", "")
                quality = action_data.get("quality_analysis", {})

                # Determine probe type based on what's missing
                if "brief" in reason.lower() or quality.get("word_count", 100) < 50:
                    return self.personality.generate_probing_response(
                        "that point",
                        "specific"
                    )
                elif "specific" in reason.lower() or quality.get("is_vague"):
                    return self.personality.generate_probing_response(
                        "that example",
                        "specific"
                    )
                elif "contribution" in reason.lower():
                    return self.personality.generate_probing_response(
                        "your involvement",
                        "role"
                    )
                elif "result" in reason.lower():
                    return self.personality.generate_probing_response(
                        "that project",
                        "result"
                    )
                elif "process" in reason.lower():
                    return self.personality.generate_probing_response(
                        "your approach",
                        "process"
                    )
                else:
                    return self.personality.generate_probing_response(
                        "that",
                        "specific"
                    )

            else:
                return None

        except Exception as e:
            logger.error(f"Error building interviewer comment: {str(e)}")
            return None

    async def _format_question_response(
        self,
        question_data: Dict[str, Any],
        decision: Dict[str, Any],
        current_question_number: int,
        patterns: Dict[str, Any],
        interviewer_comment: Optional[str]
    ) -> Dict[str, Any]:
        """
        Format the final response with all metadata.

        Args:
            question_data: Raw question data from generator
            decision: Decision data from decision engine
            current_question_number: Current question number
            patterns: Detected patterns
            interviewer_comment: Pre-question comment

        Returns:
            Properly structured response for UI
        """
        logger.info("Formatting question response...")

        # Extract references if applicable
        references = {
            "question_id": question_data.get("referenced_question_id"),
            "excerpt": None
        }

        # If there's a referenced question, try to get the excerpt
        if question_data.get("references_previous") and decision.get("data", {}).get("past_answer"):
            past_answer = decision["data"]["past_answer"]
            references["excerpt"] = past_answer.get("answer_excerpt", "")[:200]

        # Build patterns detected list for metadata
        patterns_detected = []

        if patterns.get("contradictions"):
            for c in patterns["contradictions"][:2]:
                patterns_detected.append(f"contradiction: {c.get('explanation', 'inconsistency')[:50]}")

        for topic, count in patterns.get("repeated_topics", {}).items():
            if count >= 2:
                patterns_detected.append(f"repeated_topic: {topic} ({count}x)")

        if patterns.get("weak_answers"):
            patterns_detected.append(f"weak_answers: Q{', Q'.join(map(str, patterns['weak_answers'][:3]))}")

        # Build final response
        response = {
            "question": {
                "id": current_question_number,
                "text": question_data.get("question_text", ""),
                "intent": question_data.get("question_intent", "general"),
                "type": question_data.get("question_type", "standard")
            },
            "interviewer_comment": interviewer_comment,
            "references": references,
            "metadata": {
                "decision_reason": decision.get("reason", ""),
                "patterns_detected": patterns_detected,
                "conversation_stage": decision.get("data", {}).get("stage", "unknown"),
                "action_taken": decision.get("action", "standard"),
                "context_used": question_data.get("context_used", ""),
                "generated_at": datetime.now(timezone.utc).isoformat()
            }
        }

        logger.info(f"Response formatted: Q#{current_question_number} ({response['question']['type']})")
        return response

    async def _generate_question_by_action(
        self,
        session_id: UUID,
        current_question_number: int,
        role: str,
        difficulty: str,
        action: str,
        action_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate question based on decided action.

        Args:
            session_id: The interview session UUID
            current_question_number: Current question number
            role: Job role
            difficulty: Difficulty level
            action: Action type from decision engine
            action_data: Additional data for the action

        Returns:
            Question data from generator
        """
        logger.info(f"Generating question for action: {action}")

        try:
            if action == "challenge":
                contradiction = action_data.get("contradiction", {})
                return await self.question_generator.generate_contradiction_challenge(
                    session_id,
                    contradiction
                )

            elif action == "deep_dive":
                topic = action_data.get("topic", "")
                count = action_data.get("mention_count", 3)
                return await self.question_generator.generate_deep_dive_question(
                    session_id,
                    topic,
                    count
                )

            elif action == "follow_up":
                last_answer = action_data.get("last_answer", "")
                last_intent = action_data.get("last_question_intent", "general")
                return await self.question_generator.generate_follow_up_question(
                    session_id,
                    last_answer,
                    last_intent
                )

            elif action == "reference":
                past_answer = action_data.get("past_answer", {})
                topic = action_data.get("current_topic", past_answer.get("topic", ""))
                answer_id = past_answer.get("answer_id")

                if answer_id:
                    return await self.question_generator.generate_referencing_question(
                        session_id,
                        topic,
                        UUID(answer_id) if isinstance(answer_id, str) else answer_id
                    )
                else:
                    # Fallback to standard if no answer_id
                    return await self.question_generator.generate_next_question(
                        session_id,
                        current_question_number,
                        role,
                        difficulty
                    )

            else:  # standard
                return await self.question_generator.generate_next_question(
                    session_id,
                    current_question_number,
                    role,
                    difficulty
                )

        except Exception as e:
            logger.error(f"Error generating question for action {action}: {str(e)}")
            # Fallback to standard question
            return await self.question_generator.generate_next_question(
                session_id,
                current_question_number,
                role,
                difficulty
            )

    async def _get_fallback_question(
        self,
        question_number: int,
        role: str,
        difficulty: str,
        error_reason: str
    ) -> Dict[str, Any]:
        """
        Get a fallback question when normal generation fails.

        Args:
            question_number: Current question number
            role: Job role
            difficulty: Difficulty level
            error_reason: Reason for fallback

        Returns:
            Fallback question response
        """
        logger.warning(f"Using fallback question due to: {error_reason}")

        fallback_questions = [
            "Tell me about a challenging project you've worked on recently.",
            "What technical skills are you most proud of developing?",
            "Describe a situation where you had to learn something new quickly.",
            "How do you approach problem-solving in your work?",
            "Tell me about a time you worked effectively as part of a team.",
            "What accomplishment in your career are you most proud of?",
            "How do you stay current with industry trends and technologies?",
            "Describe your experience with handling tight deadlines.",
            "What's your approach to receiving and implementing feedback?",
            "Where do you see yourself growing professionally?"
        ]

        # Select question based on question number
        question_index = (question_number - 1) % len(fallback_questions)
        question_text = fallback_questions[question_index]

        return {
            "question": {
                "id": question_number,
                "text": question_text,
                "intent": "behavioral",
                "type": "standard"
            },
            "interviewer_comment": None,
            "references": {
                "question_id": None,
                "excerpt": None
            },
            "metadata": {
                "decision_reason": f"Fallback due to error: {error_reason[:100]}",
                "patterns_detected": [],
                "conversation_stage": "unknown",
                "action_taken": "fallback",
                "context_used": "Fallback question - no context available",
                "is_fallback": True,
                "generated_at": datetime.now(timezone.utc).isoformat()
            }
        }

    def _calculate_quality_metrics(
        self,
        all_answers: List[Dict]
    ) -> Dict[str, float]:
        """
        Calculate quality metrics across all answers.

        Args:
            all_answers: List of all answer dictionaries

        Returns:
            Dict with quality metrics
        """
        if not all_answers:
            return {
                "avg_answer_length": 0,
                "star_format_usage": 0,
                "specificity_score": 0
            }

        total_length = 0
        star_count = 0
        total_specificity = 0

        for answer in all_answers:
            answer_text = answer.get("user_answer", "")
            quality = self.decision_engine._analyze_answer_quality(
                answer_text,
                answer.get("question_intent", "general")
            )

            total_length += quality["word_count"]
            if quality["has_star_format"]:
                star_count += 1
            total_specificity += quality["specificity_score"]

        num_answers = len(all_answers)

        return {
            "avg_answer_length": round(total_length / num_answers, 1),
            "star_format_usage": round(star_count / num_answers, 2),
            "specificity_score": round(total_specificity / num_answers, 2)
        }

    def _generate_recommendations(
        self,
        all_answers: List[Dict],
        repeated_topics: Dict[str, int],
        contradictions: List[Dict],
        quality_metrics: Dict[str, float]
    ) -> List[str]:
        """
        Generate recommendations based on conversation analysis.

        Args:
            all_answers: List of all answers
            repeated_topics: Topics mentioned multiple times
            contradictions: Detected contradictions
            quality_metrics: Quality metrics

        Returns:
            List of recommendation strings
        """
        recommendations = []

        # Topic-based recommendations
        for topic, count in repeated_topics.items():
            if count >= 3:
                recommendations.append(f"Candidate is passionate about {topic} (mentioned {count} times)")

        # Quality-based recommendations
        if quality_metrics.get("avg_answer_length", 0) < 50:
            recommendations.append("Candidate gives brief answers - consider more follow-up questions")

        if quality_metrics.get("star_format_usage", 0) < 0.3:
            recommendations.append("Candidate rarely uses STAR format - may need prompting for specific examples")

        if quality_metrics.get("specificity_score", 0) < 0.4:
            recommendations.append("Answers tend to be vague - ask for concrete examples and metrics")

        # Contradiction recommendations
        if contradictions:
            recommendations.append(f"Detected {len(contradictions)} potential inconsistency(ies) - consider clarifying")

        # General progress
        if len(all_answers) >= 5:
            recommendations.append(f"Good progress: {len(all_answers)} questions answered")

        return recommendations

    # ==================== Real-time Conversational Methods ====================

    async def process_answer_with_realtime_response(
        self,
        session_id: UUID,
        answer_data: Dict[str, Any],
        role: str,
        difficulty: str,
        total_questions: int = 10,
        generate_audio: bool = True
    ) -> Dict[str, Any]:
        """
        Process answer and generate immediate AI response with optional audio.

        This is the MAIN method for conversational flow with TTS support.

        Args:
            session_id: The interview session UUID
            answer_data: Dict with question_id, question_text, question_intent,
                        user_answer, transcript_raw, audio_duration_seconds
            role: Job role being interviewed for
            difficulty: Interview difficulty level
            total_questions: Total planned questions
            generate_audio: Whether to generate TTS audio for responses

        Returns:
            Comprehensive response with ai_response, next_question, and flow_control
        """
        start_time = time.time()
        session_id_str = str(session_id)

        logger.info("=" * 60)
        logger.info("ORCHESTRATOR: Processing answer with realtime response")
        logger.info(f"Session: {session_id_str} | Audio: {generate_audio}")
        logger.info("=" * 60)

        # Extract answer data
        question_id = answer_data.get("question_id", 0)
        question_text = answer_data.get("question_text", "")
        question_intent = answer_data.get("question_intent", "behavioral")
        user_answer = answer_data.get("user_answer", "")

        # Determine conversation stage
        conversation_stage = self._determine_conversation_stage(question_id, total_questions)
        logger.info(f"Conversation stage: {conversation_stage}")

        try:
            # Step 1: Store the answer with embedding
            logger.info("Step 1: Storing answer...")
            answer_id = None
            answer_stored = False

            try:
                text_for_embedding = f"Question: {question_text}\nAnswer: {user_answer}"
                embedding = generate_embedding(text_for_embedding)
                embedding_json = json.dumps(embedding)
                answer_id = self._generate_answer_id()
                answer_stored = True
                logger.info(f"Answer stored with ID: {answer_id}")
            except Exception as embed_error:
                logger.warning(f"Failed to store answer with embedding: {embed_error}")
                answer_id = self._generate_answer_id()
                answer_stored = True

            # Step 2: Analyze answer quality using RealtimeResponseGenerator
            logger.info("Step 2: Analyzing answer quality...")
            realtime_response = await self.realtime_generator.generate_post_answer_response(
                session_id,
                user_answer,
                question_id,
                question_intent
            )

            quality_metrics = realtime_response.get("quality_metrics", {})
            overall_quality = quality_metrics.get("overall_quality", "adequate")
            should_proceed = realtime_response.get("should_proceed_to_next", True)

            logger.info(f"Answer quality: {overall_quality}, Should proceed: {should_proceed}")

            # Step 3: Build AI response structure
            logger.info("Step 3: Building AI response...")
            ai_response = await self._build_ai_response_with_audio(
                realtime_response,
                conversation_stage,
                generate_audio
            )

            # Step 4: Decide on flow and generate next question if needed
            logger.info("Step 4: Determining flow and next question...")
            next_question = None
            flow_control = {
                "should_proceed_to_next": should_proceed,
                "needs_follow_up": realtime_response.get("follow_up_probe") is not None,
                "quality_sufficient": overall_quality in ["excellent", "good"],
                "conversation_stage": conversation_stage
            }

            if should_proceed:
                # Generate next question with audio
                next_question_number = question_id + 1

                if next_question_number <= total_questions:
                    next_question = await self.generate_question_with_audio(
                        session_id,
                        next_question_number,
                        role,
                        difficulty,
                        total_questions,
                        generate_audio
                    )

                    # Add transition if proceeding to next question
                    if ai_response.get("transition") is None and next_question:
                        transition_text = self.personality.generate_transition(
                            "your answer",
                            "the next topic",
                            "natural"
                        )
                        ai_response["transition"] = await self._generate_audio_for_text(
                            transition_text,
                            "transition",
                            conversation_stage,
                            generate_audio
                        )

            # Build final response
            response = {
                "answer_stored": answer_stored,
                "answer_id": answer_id,
                "ai_response": ai_response,
                "next_question": next_question,
                "flow_control": flow_control,
                "quality_metrics": quality_metrics
            }

            execution_time = time.time() - start_time
            logger.info(f"ORCHESTRATOR: Realtime response generated in {execution_time:.2f}s")
            logger.info("=" * 60)

            return response

        except Exception as e:
            logger.error(f"ORCHESTRATOR ERROR in process_answer_with_realtime_response: {str(e)}")
            logger.exception("Full traceback:")

            # Return graceful fallback
            return {
                "answer_stored": True,
                "answer_id": self._generate_answer_id(),
                "ai_response": {
                    "acknowledgment": {
                        "text": "Thank you for that response.",
                        "audio_url": None,
                        "should_speak": True,
                        "tone": "neutral"
                    },
                    "follow_up_probe": None,
                    "transition": None
                },
                "next_question": await self._get_fallback_question(
                    answer_data.get("question_id", 0) + 1,
                    role,
                    difficulty,
                    str(e)
                ),
                "flow_control": {
                    "should_proceed_to_next": True,
                    "needs_follow_up": False,
                    "quality_sufficient": True,
                    "conversation_stage": conversation_stage
                },
                "error": str(e)
            }

    async def generate_question_with_audio(
        self,
        session_id: UUID,
        current_question_number: int,
        role: str,
        difficulty: str,
        total_questions: int = 10,
        generate_audio: bool = True
    ) -> Dict[str, Any]:
        """
        Generate next question with optional TTS audio.

        Args:
            session_id: The interview session UUID
            current_question_number: Current question number
            role: Job role
            difficulty: Difficulty level
            total_questions: Total questions planned
            generate_audio: Whether to generate TTS audio

        Returns:
            Question data with optional audio URLs
        """
        logger.info(f"Generating question #{current_question_number} with audio={generate_audio}")

        try:
            # Get the base question using existing method
            question_response = await self.get_next_question(
                session_id,
                current_question_number,
                role,
                difficulty,
                total_questions
            )

            if not generate_audio:
                return question_response

            # Determine conversation stage
            conversation_stage = self._determine_conversation_stage(
                current_question_number,
                total_questions
            )

            # Generate audio for question text
            question_text = question_response.get("question", {}).get("text", "")
            if question_text and await self._should_generate_audio(question_text, "question", True):
                try:
                    audio_bytes = await self.tts_service.generate_for_interview_context(
                        question_text,
                        context_type="question",
                        conversation_stage=conversation_stage
                    )
                    audio_path = await self.tts_service.save_audio_file(
                        audio_bytes,
                        f"question_{current_question_number}"
                    )
                    # Extract just the filename for the URL
                    from pathlib import Path
                    filename = Path(audio_path).name
                    question_response["question"]["audio_url"] = f"/api/audio/{filename}"
                    logger.info(f"Question audio generated: {filename}")
                except Exception as e:
                    logger.warning(f"Failed to generate question audio: {e}")
                    question_response["question"]["audio_url"] = None

            # Generate audio for interviewer comment if present
            interviewer_comment = question_response.get("interviewer_comment")
            if interviewer_comment and await self._should_generate_audio(interviewer_comment, "acknowledgment", True):
                try:
                    comment_audio = await self.tts_service.generate_for_interview_context(
                        interviewer_comment,
                        context_type="acknowledgment",
                        conversation_stage=conversation_stage
                    )
                    comment_path = await self.tts_service.save_audio_file(
                        comment_audio,
                        f"comment_{current_question_number}"
                    )
                    from pathlib import Path
                    filename = Path(comment_path).name
                    question_response["interviewer_comment_audio_url"] = f"/api/audio/{filename}"
                    logger.info(f"Comment audio generated: {filename}")
                except Exception as e:
                    logger.warning(f"Failed to generate comment audio: {e}")
                    question_response["interviewer_comment_audio_url"] = None

            return question_response

        except Exception as e:
            logger.error(f"Error generating question with audio: {e}")
            # Return fallback without audio
            return await self._get_fallback_question(
                current_question_number,
                role,
                difficulty,
                str(e)
            )

    async def _build_ai_response_with_audio(
        self,
        realtime_response: Dict[str, Any],
        conversation_stage: str,
        generate_audio: bool
    ) -> Dict[str, Any]:
        """
        Build AI response structure with optional audio URLs.

        Args:
            realtime_response: Response from RealtimeResponseGenerator
            conversation_stage: Current interview stage
            generate_audio: Whether to generate audio

        Returns:
            Structured AI response with acknowledgment, probe, and transition
        """
        ai_response = {
            "acknowledgment": None,
            "follow_up_probe": None,
            "transition": None
        }

        # Process acknowledgment
        ack_data = realtime_response.get("acknowledgment", {})
        if ack_data and ack_data.get("text"):
            ai_response["acknowledgment"] = await self._generate_audio_for_text(
                ack_data.get("text"),
                "acknowledgment",
                conversation_stage,
                generate_audio
            )
            ai_response["acknowledgment"]["should_speak"] = ack_data.get("should_speak", True)
            ai_response["acknowledgment"]["tone"] = ack_data.get("tone", "neutral")

        # Process follow-up probe if present
        probe_data = realtime_response.get("follow_up_probe")
        if probe_data and probe_data.get("text"):
            ai_response["follow_up_probe"] = await self._generate_audio_for_text(
                probe_data.get("text"),
                "follow_up",
                conversation_stage,
                generate_audio
            )
            ai_response["follow_up_probe"]["probe_type"] = probe_data.get("probe_type", "specific")
            ai_response["follow_up_probe"]["missing_element"] = probe_data.get("missing_element")

        return ai_response

    async def _generate_audio_for_text(
        self,
        text: str,
        context_type: str,
        conversation_stage: str,
        generate_audio: bool
    ) -> Dict[str, Any]:
        """
        Generate audio for a piece of text and return structured response.

        Args:
            text: Text to convert to speech
            context_type: Type of content (question, acknowledgment, etc.)
            conversation_stage: Interview stage
            generate_audio: Whether to actually generate audio

        Returns:
            Dict with text and optional audio_url
        """
        result = {
            "text": text,
            "audio_url": None
        }

        if not generate_audio or not text:
            return result

        if not await self._should_generate_audio(text, context_type, True):
            return result

        try:
            audio_bytes = await self.tts_service.generate_for_interview_context(
                text,
                context_type=context_type,
                conversation_stage=conversation_stage
            )

            # Generate unique filename
            import uuid
            unique_id = str(uuid.uuid4())[:8]
            filename = f"{context_type}_{unique_id}"

            audio_path = await self.tts_service.save_audio_file(audio_bytes, filename)

            from pathlib import Path
            result["audio_url"] = f"/api/audio/{Path(audio_path).name}"
            logger.debug(f"Audio generated for {context_type}: {result['audio_url']}")

        except Exception as e:
            logger.warning(f"Failed to generate audio for {context_type}: {e}")

        return result

    async def _generate_audio_for_response(
        self,
        response_data: Dict[str, Any],
        context_type: str,
        conversation_stage: str = "mid"
    ) -> Dict[str, Any]:
        """
        Generate audio for AI response data.

        Args:
            response_data: Dict with "text" key to convert
            context_type: Content type for TTS optimization
            conversation_stage: Interview stage

        Returns:
            Enhanced response_data with audio_url field
        """
        if not response_data or not response_data.get("text"):
            return response_data

        text = response_data["text"]

        # Check if should generate audio
        if not self.tts_service.should_speak_this(text, context_type):
            logger.debug(f"Skipping audio for {context_type}: should_not_speak")
            response_data["audio_url"] = None
            return response_data

        try:
            # Generate audio
            audio_bytes = await self.tts_service.generate_for_interview_context(
                text,
                context_type=context_type,
                conversation_stage=conversation_stage
            )

            # Save with meaningful filename
            import uuid
            unique_id = str(uuid.uuid4())[:8]
            filename = f"{context_type}_{unique_id}"
            file_path = await self.tts_service.save_audio_file(audio_bytes, filename)

            # Return relative URL
            from pathlib import Path
            response_data["audio_url"] = f"/api/audio/{Path(file_path).name}"

            logger.info(f"Audio generated for {context_type}: {response_data['audio_url']}")

        except Exception as e:
            logger.warning(f"TTS failed for {context_type}, continuing without audio: {e}")
            response_data["audio_url"] = None

        return response_data

    async def handle_follow_up_answer(
        self,
        session_id: UUID,
        follow_up_answer: str,
        original_question_id: int,
        original_question_text: str,
        original_question_intent: str,
        role: str,
        difficulty: str,
        total_questions: int = 10,
        generate_audio: bool = True
    ) -> Dict[str, Any]:
        """
        Handle answer to follow-up probe.

        When user gave a weak answer and we probed for more detail,
        this handles their elaboration.

        Args:
            session_id: Session UUID
            follow_up_answer: User's follow-up response
            original_question_id: ID of the original question
            original_question_text: Original question text
            original_question_intent: Original question intent
            role: Job role
            difficulty: Difficulty level
            total_questions: Total questions
            generate_audio: Whether to generate audio

        Returns:
            Response similar to process_answer_with_realtime_response
        """
        session_id_str = str(session_id)
        follow_up_key = f"{session_id_str}_{original_question_id}"

        logger.info(f"Handling follow-up answer for Q{original_question_id}")

        # Track follow-up attempts
        current_count = self._follow_up_counts.get(follow_up_key, 0)
        self._follow_up_counts[follow_up_key] = current_count + 1

        # Determine conversation stage
        conversation_stage = self._determine_conversation_stage(
            original_question_id,
            total_questions
        )

        try:
            # Analyze the follow-up answer quality
            follow_up_analysis = await self.realtime_generator.generate_post_answer_response(
                session_id,
                follow_up_answer,
                original_question_id,
                original_question_intent
            )

            quality_metrics = follow_up_analysis.get("quality_metrics", {})
            overall_quality = quality_metrics.get("overall_quality", "adequate")

            # After one follow-up, always proceed to avoid blocking
            should_proceed = (
                current_count >= self.MAX_FOLLOW_UPS or
                overall_quality in ["excellent", "good", "adequate"]
            )

            logger.info(f"Follow-up #{current_count + 1}: quality={overall_quality}, proceed={should_proceed}")

            # Generate acknowledgment for follow-up
            if overall_quality in ["excellent", "good"]:
                ack_quality = "good"
            else:
                ack_quality = "adequate"

            ack_text = self.personality.generate_acknowledgment(ack_quality)
            acknowledgment = await self._generate_audio_for_text(
                ack_text,
                "acknowledgment",
                conversation_stage,
                generate_audio
            )
            acknowledgment["should_speak"] = True
            acknowledgment["tone"] = "encouraging" if overall_quality in ["excellent", "good"] else "neutral"

            # Build AI response
            ai_response = {
                "acknowledgment": acknowledgment,
                "follow_up_probe": None,
                "transition": None
            }

            # Get next question if proceeding
            next_question = None
            if should_proceed:
                next_question_number = original_question_id + 1

                if next_question_number <= total_questions:
                    # Add transition
                    transition_text = self.personality.generate_transition(
                        "that clarification",
                        "our next topic",
                        "natural"
                    )
                    ai_response["transition"] = await self._generate_audio_for_text(
                        transition_text,
                        "transition",
                        conversation_stage,
                        generate_audio
                    )

                    # Get next question
                    next_question = await self.generate_question_with_audio(
                        session_id,
                        next_question_number,
                        role,
                        difficulty,
                        total_questions,
                        generate_audio
                    )

                # Clean up follow-up tracking
                if follow_up_key in self._follow_up_counts:
                    del self._follow_up_counts[follow_up_key]

            else:
                # One more probe if still insufficient and haven't maxed out
                probe_text = self.personality.generate_probing_response(
                    "that point",
                    "specific"
                )
                ai_response["follow_up_probe"] = await self._generate_audio_for_text(
                    probe_text,
                    "follow_up",
                    conversation_stage,
                    generate_audio
                )
                ai_response["follow_up_probe"]["probe_type"] = "specific"

            return {
                "answer_stored": True,
                "answer_id": self._generate_answer_id(),
                "is_follow_up_response": True,
                "original_question_id": original_question_id,
                "follow_up_attempt": current_count + 1,
                "ai_response": ai_response,
                "next_question": next_question,
                "flow_control": {
                    "should_proceed_to_next": should_proceed,
                    "needs_follow_up": not should_proceed,
                    "quality_sufficient": overall_quality in ["excellent", "good"],
                    "conversation_stage": conversation_stage,
                    "max_follow_ups_reached": current_count >= self.MAX_FOLLOW_UPS
                },
                "quality_metrics": quality_metrics
            }

        except Exception as e:
            logger.error(f"Error handling follow-up answer: {e}")
            # Always proceed on error
            return {
                "answer_stored": True,
                "answer_id": self._generate_answer_id(),
                "is_follow_up_response": True,
                "original_question_id": original_question_id,
                "ai_response": {
                    "acknowledgment": {
                        "text": "Thank you for that additional detail.",
                        "audio_url": None,
                        "should_speak": True,
                        "tone": "neutral"
                    },
                    "follow_up_probe": None,
                    "transition": None
                },
                "next_question": await self.generate_question_with_audio(
                    session_id,
                    original_question_id + 1,
                    role,
                    difficulty,
                    total_questions,
                    generate_audio
                ),
                "flow_control": {
                    "should_proceed_to_next": True,
                    "needs_follow_up": False,
                    "quality_sufficient": True,
                    "conversation_stage": conversation_stage
                },
                "error": str(e)
            }

    def _determine_conversation_stage(
        self,
        current_question_number: int,
        total_questions: int = 10
    ) -> str:
        """
        Determine current stage of interview.

        Args:
            current_question_number: Current question number (1-indexed)
            total_questions: Total planned questions

        Returns:
            Stage string: "early", "mid", or "late"
        """
        # Calculate progress percentage
        progress = current_question_number / total_questions

        if progress <= 0.3:  # First 30% (Q1-3 for 10 questions)
            return "early"
        elif progress >= 0.8:  # Last 20% (Q8+ for 10 questions)
            return "late"
        else:
            return "mid"

    async def _should_generate_audio(
        self,
        text: str,
        context_type: str,
        user_preference: bool = True
    ) -> bool:
        """
        Decide if audio should be generated for this text.

        Args:
            text: The text to evaluate
            context_type: Type of content
            user_preference: User's TTS preference setting

        Returns:
            True if audio should be generated
        """
        # Respect user preference
        if not user_preference:
            return False

        # Empty text
        if not text or not text.strip():
            return False

        # Use TTS service's logic
        return self.tts_service.should_speak_this(text, context_type)

    def _generate_answer_id(self) -> str:
        """Generate a unique answer ID."""
        import uuid
        return str(uuid.uuid4())


# Convenience function for direct usage
async def get_orchestrated_question(
    session_id: UUID,
    current_question_number: int,
    role: str,
    difficulty: str,
    total_questions: int = 10
) -> Dict[str, Any]:
    """
    Convenience function to get an orchestrated question.

    Creates an InterviewOrchestrator instance and gets the next question.
    """
    orchestrator = InterviewOrchestrator()
    return await orchestrator.get_next_question(
        session_id,
        current_question_number,
        role,
        difficulty,
        total_questions
    )
