# backend/services/interview_decision_engine.py
"""
Interview Decision Engine Service

Analyzes interview state and decides what type of question to ask next.
Uses conversation context, contradiction detection, and semantic search
to make intelligent decisions about interview flow.
"""

import logging
from typing import Dict, List, Optional, Tuple, Any
from uuid import UUID

from services.conversation_context import (
    get_all_answers,
    detect_repeated_topics,
    build_conversation_summary
)
from services.contradiction_detector import detect_contradictions
from services.embedding_service import (
    generate_embedding,
    find_similar_answers
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class InterviewDecisionEngine:
    """
    Decides what type of question to ask next based on conversation analysis.

    Integrates with:
    - ConversationContext: For retrieving answers and detecting patterns
    - ContradictionDetector: For identifying inconsistencies
    - EmbeddingService: For semantic similarity search

    Decision Priority (highest to lowest):
    1. Challenge obvious contradictions (after Q5)
    2. Deep dive into passionate topics (3+ mentions)
    3. Follow up on weak/incomplete answers
    4. Reference highly related past answers
    5. Standard contextual question
    """

    # Configuration constants
    MIN_QUESTION_FOR_CHALLENGE = 5      # Don't challenge before Q5
    MIN_QUESTION_FOR_DEEP_DIVE = 4      # Don't deep dive before Q4
    MIN_TOPIC_MENTIONS_FOR_DIVE = 3     # Need 3+ mentions for deep dive
    SIMILARITY_THRESHOLD = 0.85         # Threshold for referencing past answers
    MIN_ANSWER_WORD_COUNT = 50          # Answers below this may need follow-up
    CONTRADICTION_CONFIDENCE_THRESHOLD = 0.7  # Minimum confidence to challenge

    def __init__(
        self,
        conversation_context_module=None,
        contradiction_detector_module=None,
        embedding_service_module=None
    ):
        """
        Initialize the Interview Decision Engine.

        Args:
            conversation_context_module: Module for conversation context functions
            contradiction_detector_module: Module for contradiction detection
            embedding_service_module: Module for embedding and similarity search
        """
        # Allow dependency injection for testing
        self.conversation_context = conversation_context_module
        self.contradiction_detector = contradiction_detector_module
        self.embedding_service = embedding_service_module

        # Track recent actions to avoid repetition
        self._recent_actions: Dict[str, List[int]] = {
            "challenge": [],      # Question numbers where we challenged
            "deep_dive": [],      # Question numbers where we did deep dive
            "follow_up": [],      # Question numbers where we followed up
            "reference": []       # Question numbers where we referenced
        }

        logger.info("InterviewDecisionEngine initialized")

    async def decide_next_action(
        self,
        session_id: UUID,
        current_question_number: int,
        total_questions: int = 10
    ) -> Dict[str, Any]:
        """
        Analyze interview state and decide what action to take next.

        Decision Priority (highest to lowest):
        1. If obvious contradiction detected AND question >= 5 → challenge it
        2. If topic repeated 3+ times AND question >= 4 → deep dive
        3. If last answer weak/incomplete → follow up
        4. If found highly related past answer (similarity > 0.85) → reference it
        5. Otherwise → standard next question

        Args:
            session_id: The interview session UUID
            current_question_number: Current question number (1-indexed)
            total_questions: Total planned questions in interview

        Returns:
            Dict containing:
            - action: str ("challenge"/"deep_dive"/"follow_up"/"reference"/"standard")
            - priority: str ("high"/"medium"/"low")
            - reason: str (explanation of decision)
            - data: Dict (action-specific data)
        """
        session_id_str = str(session_id)
        logger.info(f"Deciding next action for session {session_id_str}, Q#{current_question_number}")

        # Determine conversation stage for context-aware decisions
        stage = self._calculate_conversation_stage(current_question_number, total_questions)
        logger.info(f"Conversation stage: {stage}")

        try:
            # Step 1: Get all past answers
            past_answers = get_all_answers(session_id_str)

            if not past_answers:
                logger.info("No past answers - returning standard action for opening")
                return {
                    "action": "standard",
                    "priority": "low",
                    "reason": "Opening question - no conversation history yet",
                    "data": {"stage": stage}
                }

            last_answer = past_answers[-1]
            last_answer_text = last_answer.get("user_answer", "")
            last_question_intent = last_answer.get("question_intent", "general")

            # Step 2: Check for contradictions (Priority 1)
            logger.info("Checking for contradictions...")
            contradictions = await detect_contradictions(
                session_id_str,
                last_answer_text,
                last_answer.get("question_text", "")
            )

            should_challenge, contradiction = await self.should_challenge_contradiction(
                contradictions,
                current_question_number
            )

            if should_challenge and contradiction:
                logger.info(f"Decision: CHALLENGE - Contradiction detected with confidence {contradiction.get('confidence_score', 'N/A')}")
                self._record_action("challenge", current_question_number)
                return {
                    "action": "challenge",
                    "priority": "high",
                    "reason": f"Detected contradiction: '{contradiction.get('explanation', 'Inconsistent statements')}'",
                    "data": {
                        "contradiction": contradiction,
                        "stage": stage
                    }
                }

            # Step 3: Check for repeated topics (Priority 2)
            logger.info("Checking for repeated topics...")
            repeated_topics = detect_repeated_topics(session_id_str)

            should_dive, topic = await self.should_deep_dive(
                repeated_topics,
                current_question_number,
                total_questions
            )

            if should_dive and topic:
                mention_count = repeated_topics.get(topic, 0)
                logger.info(f"Decision: DEEP_DIVE - Topic '{topic}' mentioned {mention_count} times")
                self._record_action("deep_dive", current_question_number)
                return {
                    "action": "deep_dive",
                    "priority": "high",
                    "reason": f"Candidate shows strong interest in '{topic}' (mentioned {mention_count} times)",
                    "data": {
                        "topic": topic,
                        "mention_count": mention_count,
                        "stage": stage
                    }
                }

            # Step 4: Check if follow-up needed (Priority 3)
            logger.info("Analyzing last answer quality...")
            should_followup, followup_reason = await self.should_follow_up(
                last_answer_text,
                last_question_intent
            )

            if should_followup:
                # Check we haven't followed up too recently
                if not self._action_too_recent("follow_up", current_question_number, cooldown=2):
                    logger.info(f"Decision: FOLLOW_UP - {followup_reason}")
                    self._record_action("follow_up", current_question_number)
                    return {
                        "action": "follow_up",
                        "priority": "medium",
                        "reason": followup_reason,
                        "data": {
                            "last_answer": last_answer_text,
                            "last_question_intent": last_question_intent,
                            "quality_analysis": self._analyze_answer_quality(last_answer_text, last_question_intent),
                            "stage": stage
                        }
                    }

            # Step 5: Check for related past answers to reference (Priority 4)
            logger.info("Searching for related past answers...")
            # Extract potential topic from last answer for semantic search
            current_topic = self._extract_main_topic(last_answer_text)

            should_ref, past_answer_data = await self.should_reference_past(
                session_id,
                current_topic,
                current_question_number
            )

            if should_ref and past_answer_data:
                logger.info(f"Decision: REFERENCE - Found related answer from Q{past_answer_data.get('question_id')} (similarity: {past_answer_data.get('similarity_score', 0):.2f})")
                self._record_action("reference", current_question_number)
                return {
                    "action": "reference",
                    "priority": "medium",
                    "reason": f"Can connect to related answer from Q{past_answer_data.get('question_id')} about '{past_answer_data.get('topic', 'related topic')}'",
                    "data": {
                        "past_answer": past_answer_data,
                        "current_topic": current_topic,
                        "stage": stage
                    }
                }

            # Step 6: Default to standard question (Priority 5)
            logger.info("Decision: STANDARD - No special action needed")
            return {
                "action": "standard",
                "priority": "low",
                "reason": "Conversation flowing naturally - proceed with standard contextual question",
                "data": {
                    "past_answers_count": len(past_answers),
                    "stage": stage,
                    "repeated_topics": repeated_topics
                }
            }

        except Exception as e:
            logger.error(f"Error in decide_next_action: {str(e)}")
            # Safe fallback
            return {
                "action": "standard",
                "priority": "low",
                "reason": f"Fallback due to analysis error: {str(e)}",
                "data": {"error": True, "stage": stage}
            }

    async def should_follow_up(
        self,
        last_answer: str,
        last_question_intent: str
    ) -> Tuple[bool, str]:
        """
        Determine if follow-up needed based on answer quality.

        Checks for:
        - STAR format completeness (Situation, Task, Action, Result)
        - Specificity (vague vs specific details)
        - Length (too short < 50 words)
        - Technical depth (if technical question)

        Args:
            last_answer: The candidate's most recent answer
            last_question_intent: Intent category of the last question

        Returns:
            Tuple of (should_follow_up: bool, reason: str)
        """
        logger.info("Evaluating if follow-up is needed...")

        # Analyze the answer quality
        quality = self._analyze_answer_quality(last_answer, last_question_intent)

        # Rule 1: Answer too short
        if quality["word_count"] < self.MIN_ANSWER_WORD_COUNT:
            logger.info(f"Follow-up needed: Answer too short ({quality['word_count']} words)")
            return (True, f"Answer was brief ({quality['word_count']} words) - need more detail")

        # Rule 2: Answer is vague (no specific details)
        if quality["is_vague"]:
            logger.info("Follow-up needed: Answer lacks specific details")
            return (True, "Answer lacks specific details - need concrete examples")

        # Rule 3: Missing STAR elements for behavioral questions
        if last_question_intent in ["behavioral", "situational", "problem_solving"]:
            missing = quality["missing_elements"]
            if len(missing) >= 2:  # Missing 2+ STAR elements
                missing_str = ", ".join(missing[:2])
                logger.info(f"Follow-up needed: Missing STAR elements ({missing_str})")
                return (True, f"Missing {missing_str} in response")

        # Rule 4: Technical question needs depth
        if last_question_intent == "technical_skills":
            if not quality["has_metrics"] and quality["specificity_score"] < 0.5:
                logger.info("Follow-up needed: Technical answer lacks depth")
                return (True, "Technical answer needs more specific details or metrics")

        # Rule 5: "We" without "I" - need personal contribution
        if self._uses_only_we_language(last_answer):
            logger.info("Follow-up needed: Uses 'we' without specifying personal role")
            return (True, "Need to understand YOUR specific contribution, not just the team's")

        # Rule 6: Low completeness score
        if quality["completeness_score"] < 0.4:
            logger.info(f"Follow-up needed: Low completeness score ({quality['completeness_score']:.2f})")
            return (True, "Answer could use more elaboration")

        logger.info("No follow-up needed - answer is satisfactory")
        return (False, "")

    async def should_challenge_contradiction(
        self,
        contradictions: List[Dict],
        current_question_number: int
    ) -> Tuple[bool, Optional[Dict]]:
        """
        Decide if contradiction should be challenged now.

        Rules:
        - Don't challenge before question 5 (let conversation develop)
        - Only challenge high-confidence contradictions (> 0.7)
        - Don't challenge if already challenged in last 2 questions
        - Prioritize obvious contradictions

        Args:
            contradictions: List of detected contradictions
            current_question_number: Current question number

        Returns:
            Tuple of (should_challenge: bool, contradiction_to_challenge: Dict or None)
        """
        logger.info(f"Evaluating {len(contradictions)} contradiction(s) for potential challenge...")

        # Rule 1: Don't challenge too early - let conversation develop
        if current_question_number < self.MIN_QUESTION_FOR_CHALLENGE:
            logger.info(f"Too early to challenge (Q{current_question_number} < Q{self.MIN_QUESTION_FOR_CHALLENGE})")
            return (False, None)

        # Rule 2: Don't challenge if we already did recently
        if self._action_too_recent("challenge", current_question_number, cooldown=2):
            logger.info("Already challenged recently - skipping")
            return (False, None)

        # Rule 3: No contradictions to challenge
        if not contradictions:
            logger.info("No contradictions detected")
            return (False, None)

        # Rule 4: Filter to high-confidence contradictions only
        high_confidence = [
            c for c in contradictions
            if c.get("confidence_score", 0) >= self.CONTRADICTION_CONFIDENCE_THRESHOLD
        ]

        if not high_confidence:
            logger.info(f"No high-confidence contradictions (threshold: {self.CONTRADICTION_CONFIDENCE_THRESHOLD})")
            return (False, None)

        # Rule 5: Select the most obvious contradiction (highest confidence)
        best_contradiction = max(high_confidence, key=lambda x: x.get("confidence_score", 0))

        logger.info(f"Found challengeable contradiction with confidence {best_contradiction.get('confidence_score', 0):.2f}")
        return (True, best_contradiction)

    async def should_deep_dive(
        self,
        repeated_topics: Dict[str, int],
        current_question_number: int,
        total_questions: int = 10
    ) -> Tuple[bool, Optional[str]]:
        """
        Decide if should explore repeated topic.

        Rules:
        - Topic mentioned 3+ times
        - Not in first 3 questions (too early)
        - Not in last 2 questions (wrapping up)
        - Haven't done deep dive in last 3 questions

        Args:
            repeated_topics: Dict of topics and their mention counts
            current_question_number: Current question number
            total_questions: Total planned questions

        Returns:
            Tuple of (should_dive: bool, topic: str or None)
        """
        logger.info(f"Evaluating {len(repeated_topics)} repeated topic(s) for deep dive...")

        # Rule 1: Don't deep dive too early
        if current_question_number < self.MIN_QUESTION_FOR_DEEP_DIVE:
            logger.info(f"Too early for deep dive (Q{current_question_number} < Q{self.MIN_QUESTION_FOR_DEEP_DIVE})")
            return (False, None)

        # Rule 2: Don't deep dive too late (save time for wrap-up)
        if current_question_number > total_questions - 2:
            logger.info(f"Too late for deep dive (Q{current_question_number} > Q{total_questions - 2})")
            return (False, None)

        # Rule 3: Don't deep dive if we already did recently
        if self._action_too_recent("deep_dive", current_question_number, cooldown=3):
            logger.info("Already did deep dive recently - skipping")
            return (False, None)

        # Rule 4: Find topics with enough mentions
        qualifying_topics = {
            topic: count for topic, count in repeated_topics.items()
            if count >= self.MIN_TOPIC_MENTIONS_FOR_DIVE
        }

        if not qualifying_topics:
            logger.info(f"No topics with {self.MIN_TOPIC_MENTIONS_FOR_DIVE}+ mentions")
            return (False, None)

        # Rule 5: Select the most mentioned topic
        best_topic = max(qualifying_topics.items(), key=lambda x: x[1])
        topic_name, mention_count = best_topic

        logger.info(f"Found topic for deep dive: '{topic_name}' ({mention_count} mentions)")
        return (True, topic_name)

    async def should_reference_past(
        self,
        session_id: UUID,
        current_topic: str,
        current_question_number: int
    ) -> Tuple[bool, Optional[Dict]]:
        """
        Decide if should reference similar past answer.

        Process:
        1. Use semantic search to find related past answers
        2. Check similarity threshold (> 0.85 = very related)
        3. Ensure not too recent (skip last question)
        4. Ensure meaningful connection exists

        Args:
            session_id: The interview session UUID
            current_topic: Topic extracted from current context
            current_question_number: Current question number

        Returns:
            Tuple of (should_reference: bool, past_answer_data: Dict or None)
        """
        session_id_str = str(session_id)
        logger.info(f"Searching for related past answers about '{current_topic}'...")

        # Rule 1: Need a topic to search for
        if not current_topic or len(current_topic.strip()) < 3:
            logger.info("No meaningful topic to search for")
            return (False, None)

        # Rule 2: Don't reference if we already did recently
        if self._action_too_recent("reference", current_question_number, cooldown=2):
            logger.info("Already referenced recently - skipping")
            return (False, None)

        try:
            # Generate embedding for the topic
            topic_embedding = generate_embedding(current_topic)

            # Search for similar answers
            similar_answers = find_similar_answers(
                session_id_str,
                topic_embedding,
                top_k=3
            )

            if not similar_answers:
                logger.info("No similar past answers found")
                return (False, None)

            # Filter out very recent answers (skip last 1-2 questions)
            min_question_gap = 2
            filtered_answers = [
                a for a in similar_answers
                if a.get("question_id", current_question_number) < current_question_number - min_question_gap
            ]

            if not filtered_answers:
                logger.info("No suitable past answers (all too recent)")
                return (False, None)

            # Rule 3: Check similarity threshold
            best_match = filtered_answers[0]
            similarity = best_match.get("similarity_score", 0)

            if similarity < self.SIMILARITY_THRESHOLD:
                logger.info(f"Best match similarity ({similarity:.2f}) below threshold ({self.SIMILARITY_THRESHOLD})")
                return (False, None)

            # Build response data
            past_answer_data = {
                "answer_id": best_match.get("answer_id"),
                "question_id": best_match.get("question_id"),
                "question_text": best_match.get("question_text", ""),
                "answer_excerpt": best_match.get("user_answer", "")[:200],
                "similarity_score": similarity,
                "topic": current_topic
            }

            logger.info(f"Found referenceable answer from Q{past_answer_data['question_id']} (similarity: {similarity:.2f})")
            return (True, past_answer_data)

        except Exception as e:
            logger.error(f"Error in should_reference_past: {str(e)}")
            return (False, None)

    def _analyze_answer_quality(
        self,
        answer: str,
        question_intent: str
    ) -> Dict[str, Any]:
        """
        Analyze answer quality across multiple dimensions.

        Uses simple heuristics:
        - STAR: Check for keywords like "situation", "I did", "result"
        - Specificity: Check for numbers, specific nouns, concrete details
        - Completeness: Word count > 50, has examples

        Args:
            answer: The answer text to analyze
            question_intent: The intent of the question asked

        Returns:
            Dict containing quality metrics
        """
        answer_lower = answer.lower()
        words = answer.split()
        word_count = len(words)

        # STAR format detection
        has_situation = any(kw in answer_lower for kw in [
            "when", "while", "during", "at my", "in my role", "situation",
            "context", "background", "scenario"
        ])
        has_task = any(kw in answer_lower for kw in [
            "needed to", "had to", "responsible", "goal", "objective",
            "task", "challenge", "problem", "assigned"
        ])
        has_action = any(kw in answer_lower for kw in [
            "i did", "i created", "i built", "i led", "i developed",
            "i implemented", "i designed", "i managed", "i wrote",
            "i analyzed", "i coordinated", "my approach"
        ])
        has_result = any(kw in answer_lower for kw in [
            "resulted", "achieved", "improved", "increased", "decreased",
            "outcome", "success", "impact", "saved", "reduced", "delivered"
        ])

        # Build missing elements list
        missing_elements = []
        if not has_situation:
            missing_elements.append("situation/context")
        if not has_task:
            missing_elements.append("task/goal")
        if not has_action:
            missing_elements.append("specific actions")
        if not has_result:
            missing_elements.append("measurable results")

        # Completeness score (0-1)
        star_score = sum([has_situation, has_task, has_action, has_result]) / 4
        length_score = min(word_count / 100, 1.0)  # Cap at 100 words
        completeness_score = (star_score * 0.6) + (length_score * 0.4)

        # Specificity detection
        has_numbers = any(char.isdigit() for char in answer)
        has_metrics = any(kw in answer_lower for kw in [
            "%", "percent", "million", "thousand", "hours", "days", "weeks",
            "team of", "increased by", "reduced by", "saved", "$"
        ])
        has_specific_tech = any(kw in answer_lower for kw in [
            "python", "java", "javascript", "sql", "aws", "docker", "kubernetes",
            "react", "node", "api", "database", "algorithm", "framework"
        ])

        # Specificity score
        specificity_indicators = [has_numbers, has_metrics, has_specific_tech]
        specificity_score = sum(specificity_indicators) / 3

        # Add bonus for specific examples
        if "for example" in answer_lower or "specifically" in answer_lower:
            specificity_score = min(specificity_score + 0.2, 1.0)

        # Vagueness detection
        vague_phrases = [
            "stuff", "things", "etc", "and so on", "kind of", "sort of",
            "basically", "pretty much", "i guess", "maybe", "probably"
        ]
        vague_count = sum(1 for phrase in vague_phrases if phrase in answer_lower)
        is_vague = vague_count >= 2 or (word_count < 30 and vague_count >= 1)

        return {
            "completeness_score": round(completeness_score, 2),
            "specificity_score": round(specificity_score, 2),
            "has_star_format": star_score >= 0.75,
            "word_count": word_count,
            "has_metrics": has_metrics,
            "is_vague": is_vague,
            "missing_elements": missing_elements,
            "star_elements": {
                "situation": has_situation,
                "task": has_task,
                "action": has_action,
                "result": has_result
            }
        }

    def _calculate_conversation_stage(
        self,
        current_question_number: int,
        total_questions: int
    ) -> str:
        """
        Determine conversation stage for decision context.

        Args:
            current_question_number: Current question number (1-indexed)
            total_questions: Total planned questions

        Returns:
            "early" (Q1-3) / "mid" (Q4-7) / "late" (Q8+)
        """
        # Calculate progress percentage
        progress = current_question_number / total_questions

        if progress <= 0.3:
            return "early"
        elif progress <= 0.7:
            return "mid"
        else:
            return "late"

    def _uses_only_we_language(self, answer: str) -> bool:
        """
        Check if answer uses 'we' without explaining personal contribution.

        Args:
            answer: The answer text

        Returns:
            True if uses team language without personal specifics
        """
        answer_lower = answer.lower()

        # Count "we" vs "I" usage
        we_count = answer_lower.count(" we ") + answer_lower.count("we ")
        i_count = answer_lower.count(" i ") + answer_lower.count("i ")

        # Patterns that indicate personal contribution
        personal_patterns = [
            "my role", "i was responsible", "i led", "i managed",
            "my contribution", "i specifically", "i personally"
        ]
        has_personal = any(p in answer_lower for p in personal_patterns)

        # Flag if heavy "we" usage without personal context
        return we_count >= 3 and i_count < 2 and not has_personal

    def _extract_main_topic(self, answer: str) -> str:
        """
        Extract the main topic from an answer for semantic search.

        Simple extraction based on key phrases and nouns.

        Args:
            answer: The answer text

        Returns:
            Extracted topic string
        """
        # Common technical and professional topics to look for
        topic_keywords = [
            "python", "java", "javascript", "sql", "database", "api",
            "machine learning", "data", "cloud", "aws", "docker",
            "team", "leadership", "project", "management", "agile",
            "testing", "deployment", "security", "performance",
            "customer", "client", "stakeholder", "communication"
        ]

        answer_lower = answer.lower()
        found_topics = [kw for kw in topic_keywords if kw in answer_lower]

        if found_topics:
            # Return the first (most prominent) topic found
            return found_topics[0]

        # Fallback: return first significant phrase
        words = answer.split()[:10]
        return " ".join(words) if words else ""

    def _record_action(self, action_type: str, question_number: int) -> None:
        """
        Record when an action was taken to prevent too-frequent repetition.

        Args:
            action_type: Type of action taken
            question_number: Question number when action was taken
        """
        if action_type in self._recent_actions:
            self._recent_actions[action_type].append(question_number)
            # Keep only last 5 records
            self._recent_actions[action_type] = self._recent_actions[action_type][-5:]

    def _action_too_recent(
        self,
        action_type: str,
        current_question: int,
        cooldown: int
    ) -> bool:
        """
        Check if an action was taken too recently.

        Args:
            action_type: Type of action to check
            current_question: Current question number
            cooldown: Minimum questions between same action type

        Returns:
            True if action was taken within cooldown period
        """
        recent = self._recent_actions.get(action_type, [])
        if not recent:
            return False

        last_action = recent[-1]
        return (current_question - last_action) < cooldown

    def reset_action_history(self) -> None:
        """Reset the action history (useful for new sessions)."""
        self._recent_actions = {
            "challenge": [],
            "deep_dive": [],
            "follow_up": [],
            "reference": []
        }
        logger.info("Action history reset")


# Convenience function for direct usage
async def decide_interview_action(
    session_id: UUID,
    current_question_number: int,
    total_questions: int = 10
) -> Dict[str, Any]:
    """
    Convenience function to decide interview action.

    Creates an InterviewDecisionEngine instance and decides next action.
    """
    engine = InterviewDecisionEngine()
    return await engine.decide_next_action(
        session_id,
        current_question_number,
        total_questions
    )
