# backend/services/realtime_response_generator.py
"""
Realtime Response Generator Service

Generates AI responses DURING and AFTER user answers in real-time.
This is different from InterviewerPersonality (which provides variety/tone).
This service decides WHEN to respond and generates CONTEXTUAL responses based on answer content.

Key Responsibilities:
- Analyze answer quality in real-time
- Decide response type (acknowledge, probe, encourage, clarify)
- Generate contextually appropriate responses
- Determine if ready to proceed to next question
"""

import logging
import re
from typing import Dict, List, Optional, Any
from uuid import UUID

from services.interviewer_personality import (
    InterviewerPersonality,
    get_interviewer_personality
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RealtimeResponseGenerator:
    """
    Generates contextual AI responses based on answer content and quality.

    Uses InterviewerPersonality for varied tone, but handles the logic
    of WHEN to respond and WHAT type of response to give.
    """

    # Quality thresholds
    EXCELLENT_THRESHOLD = 0.80
    GOOD_THRESHOLD = 0.60
    ADEQUATE_THRESHOLD = 0.40

    # Vague word patterns
    VAGUE_WORDS = [
        "we", "us", "team", "everyone", "people", "they",
        "things", "stuff", "it", "that", "there",
        "kind of", "sort of", "basically", "generally",
        "somewhat", "probably", "maybe", "i think",
        "a lot", "many", "some", "various"
    ]

    # Specific indicator patterns
    SPECIFIC_INDICATORS = [
        r"\b\d+%?\b",  # Numbers and percentages
        r"\$[\d,]+",  # Dollar amounts
        r"\b(implemented|architected|designed|developed|built|created|established|led|managed|coordinated)\b",
        r"\b(specifically|precisely|exactly|directly)\b",
    ]

    # STAR element keywords
    STAR_KEYWORDS = {
        "situation": [
            "when", "there was", "at my", "in my", "during",
            "while working", "at the time", "context", "background",
            "the situation was", "we were facing", "the challenge was"
        ],
        "task": [
            "needed to", "was responsible for", "my goal was",
            "my role was", "i was tasked", "objective was",
            "had to", "was assigned", "my job was", "mission was"
        ],
        "action": [
            "i did", "i implemented", "i decided", "my approach",
            "i took", "i created", "i built", "i led", "i designed",
            "i analyzed", "i developed", "i initiated", "i organized",
            "first i", "then i", "next i", "finally i"
        ],
        "result": [
            "outcome", "result", "impact", "achieved", "improved",
            "reduced", "increased", "saved", "delivered", "completed",
            "successfully", "led to", "resulted in", "because of this"
        ]
    }

    def __init__(
        self,
        interviewer_personality: Optional[InterviewerPersonality] = None,
        conversation_context=None
    ):
        """
        Initialize the Realtime Response Generator.

        Args:
            interviewer_personality: InterviewerPersonality instance for varied tone
            conversation_context: ConversationContext module for history access
        """
        self.personality = interviewer_personality or get_interviewer_personality()
        self.conversation_context = conversation_context

        # Track probing history to avoid over-probing
        self._probe_history: Dict[str, int] = {}  # session_id -> probe_count

        logger.info("RealtimeResponseGenerator initialized")

    async def generate_post_answer_response(
        self,
        session_id: UUID,
        answer: str,
        question_id: int,
        question_intent: str,
        quality_metrics: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Generate immediate response after user finishes answering.

        This is the main method called after every answer.

        Process:
        1. Analyze answer quality (STAR format, specificity, length)
        2. Decide response type (acknowledge, probe, encourage, clarify)
        3. Generate appropriate response using personality service
        4. Return structured response for UI

        Args:
            session_id: The interview session UUID
            answer: The user's answer text
            question_id: Current question number
            question_intent: Intent of the question (behavioral, technical, etc.)
            quality_metrics: Pre-computed quality metrics (optional)

        Returns:
            Structured response dict for UI consumption
        """
        session_id_str = str(session_id)
        logger.info(f"Generating post-answer response for Q{question_id}")
        logger.info(f"Answer length: {len(answer)} chars, Intent: {question_intent}")

        try:
            # Step 1: Analyze answer quality (use provided or compute)
            if quality_metrics:
                metrics = quality_metrics
                logger.info("Using provided quality metrics")
            else:
                metrics = await self.analyze_answer_quality(answer, question_intent)
                logger.info(f"Computed quality metrics: {metrics['overall_quality']}")

            # Step 2: Determine conversation stage based on question number
            conversation_stage = self._get_conversation_stage(question_id)
            logger.info(f"Conversation stage: {conversation_stage}")

            # Step 3: Decide response action
            response_action = await self.decide_response_action(
                metrics,
                conversation_stage,
                question_id
            )
            logger.info(f"Response action decided: {response_action}")

            # Step 4: Generate acknowledgment
            acknowledgment_text = await self.generate_acknowledgment_response(
                metrics["overall_quality"],
                topic=self._extract_main_topic(answer)
            )

            # Determine acknowledgment tone
            tone = self._get_tone_for_quality(metrics["overall_quality"])

            # Step 5: Generate follow-up probe if needed
            follow_up_probe = None
            if response_action in ["probe_missing", "probe_vague"]:
                probe_info = await self._generate_probe_if_needed(
                    session_id_str,
                    answer,
                    metrics,
                    response_action
                )
                if probe_info:
                    follow_up_probe = probe_info

            # Step 6: Determine if should proceed to next question
            should_proceed = await self.should_proceed_to_next_question(
                metrics,
                follow_up_probe is not None
            )

            # Step 7: Calculate appropriate response delay
            response_delay = self._calculate_response_delay(metrics["overall_quality"])

            # Build response
            response = {
                "acknowledgment": {
                    "text": acknowledgment_text,
                    "should_speak": True,
                    "tone": tone
                },
                "follow_up_probe": follow_up_probe,
                "needs_clarification": response_action == "clarify",
                "should_proceed_to_next": should_proceed,
                "response_delay_ms": response_delay,
                "quality_metrics": metrics,
                "action_taken": response_action
            }

            logger.info(f"Post-answer response generated: proceed={should_proceed}, probe={follow_up_probe is not None}")
            return response

        except Exception as e:
            logger.error(f"Error generating post-answer response: {str(e)}")
            # Return safe fallback
            return {
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

    async def generate_mid_answer_reaction(
        self,
        partial_answer: str,
        timestamp_seconds: float,
        pause_duration: float = 0
    ) -> Optional[Dict[str, Any]]:
        """
        Generate reaction while user is still answering (optional feature).

        This is for ADVANCED real-time conversation.
        Most interviews won't use this, but it's here for future enhancement.

        Triggers:
        - User pauses for 5+ seconds -> Encouragement
        - User mentions impressive detail -> Brief acknowledgment
        - User goes significantly off-topic -> Gentle redirect

        Args:
            partial_answer: The answer text so far
            timestamp_seconds: How long user has been answering
            pause_duration: How long user has been paused (seconds)

        Returns:
            Reaction dict or None (most common - don't interrupt)
        """
        logger.debug(f"Checking mid-answer reaction: {len(partial_answer)} chars, pause={pause_duration}s")

        # Most of the time, don't interrupt
        # Only react in specific situations

        try:
            # Trigger 1: Long pause (5+ seconds) - offer encouragement
            if pause_duration >= 5.0:
                logger.info(f"Long pause detected ({pause_duration}s) - offering encouragement")

                encouragement_phrases = [
                    "Take your time.",
                    "No rush, take a moment to think.",
                    "Feel free to gather your thoughts.",
                    "It's okay to pause and reflect."
                ]

                # Select based on timestamp to vary responses
                phrase_index = int(timestamp_seconds) % len(encouragement_phrases)

                return {
                    "type": "encouragement",
                    "text": encouragement_phrases[phrase_index],
                    "should_interrupt": False,
                    "timing": "after_pause"
                }

            # Trigger 2: Impressive metric mentioned - brief acknowledgment
            if self._contains_impressive_metric(partial_answer):
                # Only acknowledge if we haven't already for this answer
                logger.info("Impressive metric detected in partial answer")

                return {
                    "type": "acknowledgment",
                    "text": "Interesting!",
                    "should_interrupt": False,
                    "timing": "immediate"
                }

            # Trigger 3: Off-topic detection (if answer is long and wandering)
            if len(partial_answer) > 500 and timestamp_seconds > 120:
                # User has been talking for 2+ minutes with lots of text
                # Check if potentially off-topic
                if self._is_potentially_off_topic(partial_answer):
                    logger.info("Potential off-topic detected - gentle redirect")

                    return {
                        "type": "redirect",
                        "text": "That's helpful context. Could you bring it back to the main question?",
                        "should_interrupt": False,
                        "timing": "after_pause"
                    }

            # Default: Don't interrupt
            return None

        except Exception as e:
            logger.error(f"Error in mid-answer reaction: {str(e)}")
            return None

    async def analyze_answer_quality(
        self,
        answer: str,
        question_intent: str
    ) -> Dict[str, Any]:
        """
        Analyze answer quality across multiple dimensions.

        Args:
            answer: The answer text to analyze
            question_intent: The intent of the question (behavioral, technical, etc.)

        Returns:
            Comprehensive quality metrics dict
        """
        logger.info(f"Analyzing answer quality for {question_intent} question")

        # Normalize answer for analysis
        answer_lower = answer.lower()
        word_count = len(answer.split())

        # 1. Detect STAR elements
        star_elements = self._detect_star_elements(answer)

        # 2. Calculate specificity score
        specificity_score = self._calculate_specificity_score(answer)

        # 3. Calculate completeness score
        completeness_score = self._calculate_completeness_score(
            word_count,
            star_elements,
            question_intent
        )

        # 4. Check for metrics/numbers
        has_metrics = bool(re.search(r'\b\d+%?\b|\$[\d,]+', answer))

        # 5. Detect vagueness
        is_vague = self._is_answer_vague(answer)

        # 6. Identify missing elements
        missing_elements = self._identify_missing_elements(
            star_elements,
            specificity_score,
            question_intent
        )

        # 7. Calculate technical depth (if technical question)
        technical_depth = 0.0
        if question_intent in ["technical", "problem_solving"]:
            technical_depth = self._calculate_technical_depth(answer)

        # 8. Determine overall quality
        overall_quality = self._determine_overall_quality(
            completeness_score,
            specificity_score,
            star_elements,
            is_vague,
            question_intent
        )

        metrics = {
            "completeness_score": round(completeness_score, 2),
            "specificity_score": round(specificity_score, 2),
            "has_star_format": star_elements["completeness_percentage"] >= 0.5,
            "star_completeness": {
                "situation": star_elements["situation"],
                "task": star_elements["task"],
                "action": star_elements["action"],
                "result": star_elements["result"]
            },
            "word_count": word_count,
            "has_metrics": has_metrics,
            "is_vague": is_vague,
            "missing_elements": missing_elements,
            "technical_depth": round(technical_depth, 2),
            "overall_quality": overall_quality
        }

        logger.info(f"Quality analysis complete: {overall_quality} ({completeness_score:.0%} complete, {specificity_score:.0%} specific)")
        return metrics

    async def decide_response_action(
        self,
        quality_metrics: Dict[str, Any],
        conversation_stage: str,
        question_number: int
    ) -> str:
        """
        Decide what type of response to give.

        Args:
            quality_metrics: Quality metrics from analyze_answer_quality
            conversation_stage: "early" | "mid" | "late"
            question_number: Current question number

        Returns:
            Response action type string
        """
        logger.info(f"Deciding response action: stage={conversation_stage}, Q#{question_number}")

        completeness = quality_metrics.get("completeness_score", 0.5)
        specificity = quality_metrics.get("specificity_score", 0.5)
        is_vague = quality_metrics.get("is_vague", False)
        missing_elements = quality_metrics.get("missing_elements", [])
        overall_quality = quality_metrics.get("overall_quality", "adequate")

        # Calculate combined quality score
        quality_score = (completeness + specificity) / 2

        logger.info(f"Quality score: {quality_score:.0%}, vague: {is_vague}, missing: {missing_elements}")

        # Early stage (Q1-3): More lenient, encourage more
        if conversation_stage == "early":
            if quality_score >= self.GOOD_THRESHOLD:
                return "acknowledge_only"
            elif quality_score >= self.ADEQUATE_THRESHOLD:
                return "encourage"
            else:
                # Even for weak early answers, be gentle
                return "encourage"

        # Late stage (Q8+): Expect higher quality, probe less
        if conversation_stage == "late":
            if quality_score >= self.ADEQUATE_THRESHOLD:
                return "acknowledge_only"
            else:
                # Still probe but less aggressively
                return "probe_vague" if is_vague else "acknowledge_only"

        # Mid stage: Standard decision matrix

        # Excellent answer (>80%)
        if quality_score >= self.EXCELLENT_THRESHOLD:
            logger.info("Excellent answer - acknowledge only")
            return "acknowledge_only"

        # Good answer (60-80%)
        if quality_score >= self.GOOD_THRESHOLD:
            logger.info("Good answer - acknowledge, maybe gentle probe")
            # Occasionally probe for even better answers
            if missing_elements and len(missing_elements) <= 1:
                return "acknowledge_only"  # Good enough, proceed
            return "acknowledge_only"

        # Adequate answer (40-60%)
        if quality_score >= self.ADEQUATE_THRESHOLD:
            logger.info("Adequate answer - probe for missing elements")
            if missing_elements:
                return "probe_missing"
            elif is_vague:
                return "probe_vague"
            return "acknowledge_only"

        # Weak answer (<40%)
        logger.info("Weak answer - probe for specifics")
        if is_vague:
            return "probe_vague"
        elif missing_elements:
            return "probe_missing"
        else:
            return "encourage"

    async def generate_acknowledgment_response(
        self,
        quality: str,
        topic: Optional[str] = None
    ) -> str:
        """
        Use InterviewerPersonality to generate varied acknowledgment.

        Args:
            quality: Quality level (excellent, good, adequate, weak, vague)
            topic: Optional topic to reference

        Returns:
            Varied acknowledgment text
        """
        logger.debug(f"Generating acknowledgment for quality: {quality}")

        try:
            acknowledgment = self.personality.generate_acknowledgment(quality, topic)
            return acknowledgment
        except Exception as e:
            logger.error(f"Error generating acknowledgment: {str(e)}")
            # Fallback acknowledgments
            fallbacks = {
                "excellent": "That's a strong answer.",
                "good": "Good example.",
                "adequate": "Thank you for sharing that.",
                "weak": "I appreciate your response.",
                "vague": "Thanks for that."
            }
            return fallbacks.get(quality, "Thank you.")

    async def generate_probe_response(
        self,
        missing_element: str,
        answer_excerpt: str,
        probe_type: str
    ) -> str:
        """
        Generate specific probe for missing information.

        Args:
            missing_element: What's missing (situation, task, action, result, specifics, your_role)
            answer_excerpt: Excerpt from answer for context
            probe_type: Type from personality.generate_probing_response()

        Returns:
            Probe question text
        """
        logger.info(f"Generating probe for missing: {missing_element}, type: {probe_type}")

        try:
            # Use personality service for variety
            probe = self.personality.generate_probing_response(
                missing_element,
                probe_type
            )
            return probe
        except Exception as e:
            logger.error(f"Error generating probe: {str(e)}")

            # Fallback probes based on missing element
            fallback_probes = {
                "situation": "Can you set the scene a bit more? What was the context?",
                "task": "What specifically was your responsibility in that situation?",
                "action": "What specific actions did you personally take?",
                "result": "What was the outcome? Any measurable results?",
                "specifics": "Can you give me a more concrete example?",
                "your_role": "What was your individual contribution to that?"
            }
            return fallback_probes.get(missing_element, "Could you elaborate on that?")

    async def should_proceed_to_next_question(
        self,
        quality_metrics: Dict[str, Any],
        has_follow_up_probe: bool
    ) -> bool:
        """
        Decide if ready to move to next question or need more detail first.

        Args:
            quality_metrics: Quality metrics from analysis
            has_follow_up_probe: Whether a follow-up probe was generated

        Returns:
            True if should proceed, False if should wait for more detail
        """
        completeness = quality_metrics.get("completeness_score", 0.5)
        specificity = quality_metrics.get("specificity_score", 0.5)
        missing_elements = quality_metrics.get("missing_elements", [])
        is_vague = quality_metrics.get("is_vague", False)

        quality_score = (completeness + specificity) / 2

        logger.info(f"Checking proceed: quality={quality_score:.0%}, probe={has_follow_up_probe}")

        # Always proceed if quality is good enough
        if quality_score >= self.GOOD_THRESHOLD:
            logger.info("Quality sufficient - proceed")
            return True

        # Proceed if adequate AND no critical missing elements
        if quality_score >= self.ADEQUATE_THRESHOLD:
            critical_missing = [e for e in missing_elements if e in ["action", "result"]]
            if not critical_missing:
                logger.info("Adequate quality, no critical missing - proceed")
                return True

        # If we have a follow-up probe, let that run but then proceed
        # This prevents infinite probing loops
        if has_follow_up_probe:
            # The probe will be shown, and NEXT time we'll proceed
            logger.info("Probe generated - will proceed after probe response")
            return False

        # Don't proceed only if very weak AND first attempt
        if quality_score < self.ADEQUATE_THRESHOLD:
            # Check if we've already probed this session
            # For now, be lenient and proceed anyway to avoid blocking
            logger.info("Weak quality but proceeding to avoid blocking")
            return True

        # Default: proceed
        return True

    def _detect_star_elements(self, answer: str) -> Dict[str, Any]:
        """
        Detect STAR format elements in answer.

        Args:
            answer: The answer text

        Returns:
            Dict with situation, task, action, result bools and completeness
        """
        answer_lower = answer.lower()

        results = {
            "situation": False,
            "task": False,
            "action": False,
            "result": False
        }

        # Check each STAR element
        for element, keywords in self.STAR_KEYWORDS.items():
            for keyword in keywords:
                if keyword in answer_lower:
                    results[element] = True
                    break

        # Calculate completeness percentage
        found_count = sum(1 for v in results.values() if v)
        completeness = found_count / 4.0

        results["completeness_percentage"] = completeness

        logger.debug(f"STAR detection: S={results['situation']}, T={results['task']}, A={results['action']}, R={results['result']} ({completeness:.0%})")

        return results

    def _calculate_specificity_score(self, answer: str) -> float:
        """
        Calculate how specific vs vague the answer is.

        Args:
            answer: The answer text

        Returns:
            Specificity score (0-1)
        """
        answer_lower = answer.lower()
        words = answer_lower.split()
        total_words = len(words)

        if total_words == 0:
            return 0.0

        # Count vague words
        vague_count = 0
        for vague_word in self.VAGUE_WORDS:
            vague_count += answer_lower.count(vague_word)

        # Count specific indicators
        specific_count = 0

        # Count "I" statements (personal ownership)
        i_count = len(re.findall(r'\bi\b', answer_lower))
        specific_count += min(i_count, 10)  # Cap contribution

        # Count numbers and metrics
        numbers = re.findall(r'\b\d+%?\b', answer)
        specific_count += len(numbers) * 2  # Weight numbers more

        # Count specific verbs
        specific_verbs = re.findall(
            r'\b(implemented|architected|designed|developed|built|created|established|led|managed|coordinated|analyzed|optimized|deployed)\b',
            answer_lower
        )
        specific_count += len(specific_verbs)

        # Check for proper nouns (capitalized words that aren't sentence starters)
        sentences = answer.split('. ')
        proper_nouns = 0
        for sentence in sentences:
            words_in_sentence = sentence.split()
            for i, word in enumerate(words_in_sentence):
                if i > 0 and word[0:1].isupper() and word.isalpha():
                    proper_nouns += 1
        specific_count += proper_nouns

        # Calculate score
        vague_ratio = vague_count / total_words
        specific_ratio = specific_count / total_words

        # Score: reduce by vagueness, increase by specificity
        base_score = 0.5
        score = base_score - (vague_ratio * 0.5) + (specific_ratio * 0.5)

        # Clamp to 0-1
        score = max(0.0, min(1.0, score))

        logger.debug(f"Specificity: vague_count={vague_count}, specific_count={specific_count}, score={score:.2f}")

        return score

    def _calculate_completeness_score(
        self,
        word_count: int,
        star_elements: Dict,
        question_intent: str
    ) -> float:
        """
        Calculate answer completeness score.

        Args:
            word_count: Number of words in answer
            star_elements: STAR detection results
            question_intent: Question intent type

        Returns:
            Completeness score (0-1)
        """
        score = 0.0

        # Word count component (0-0.4)
        if word_count >= 150:
            score += 0.4
        elif word_count >= 100:
            score += 0.3
        elif word_count >= 50:
            score += 0.2
        elif word_count >= 25:
            score += 0.1

        # STAR completeness component (0-0.4) for behavioral questions
        if question_intent in ["behavioral", "situational"]:
            star_score = star_elements.get("completeness_percentage", 0) * 0.4
            score += star_score
        else:
            # For non-behavioral, just add partial credit for structure
            score += 0.2 if word_count >= 50 else 0.1

        # Has concrete examples (0-0.2)
        # Check if answer has examples by looking for numbers or specific details
        example_bonus = 0.2 if star_elements.get("result", False) else 0.0
        score += example_bonus

        return min(1.0, score)

    def _is_answer_vague(self, answer: str) -> bool:
        """
        Determine if answer is too vague.

        Args:
            answer: The answer text

        Returns:
            True if answer is vague
        """
        answer_lower = answer.lower()
        words = answer_lower.split()
        total_words = len(words)

        if total_words < 20:
            return True  # Very short answers are considered vague

        # Count vague indicators
        vague_count = 0
        for vague_word in self.VAGUE_WORDS:
            vague_count += answer_lower.count(vague_word)

        # Count "we" specifically (team attribution without personal ownership)
        we_count = len(re.findall(r'\bwe\b', answer_lower))
        i_count = len(re.findall(r'\bi\b', answer_lower))

        # Vague if "we" dominates over "I"
        if we_count > i_count * 2 and we_count >= 3:
            return True

        # Vague if high ratio of vague words
        vague_ratio = vague_count / total_words
        if vague_ratio > 0.15:  # More than 15% vague words
            return True

        return False

    def _identify_missing_elements(
        self,
        star_elements: Dict,
        specificity_score: float,
        question_intent: str
    ) -> List[str]:
        """
        Identify what's missing from the answer.

        Args:
            star_elements: STAR detection results
            specificity_score: Specificity score
            question_intent: Question intent type

        Returns:
            List of missing element names
        """
        missing = []

        # For behavioral questions, check STAR elements
        if question_intent in ["behavioral", "situational"]:
            if not star_elements.get("situation"):
                missing.append("situation")
            if not star_elements.get("task"):
                missing.append("task")
            if not star_elements.get("action"):
                missing.append("action")
            if not star_elements.get("result"):
                missing.append("result")

        # Check for personal contribution
        if specificity_score < 0.3:
            missing.append("specifics")

        # Prioritize most important missing elements
        # Action and Result are most critical
        priority_order = ["action", "result", "specifics", "situation", "task"]
        missing_sorted = [e for e in priority_order if e in missing]

        return missing_sorted[:2]  # Return max 2 missing elements

    def _calculate_technical_depth(self, answer: str) -> float:
        """
        Calculate technical depth for technical questions.

        Args:
            answer: The answer text

        Returns:
            Technical depth score (0-1)
        """
        answer_lower = answer.lower()

        # Technical indicators
        technical_patterns = [
            r'\b(api|database|server|client|frontend|backend|microservice)\b',
            r'\b(algorithm|complexity|optimization|scalability|performance)\b',
            r'\b(aws|azure|gcp|docker|kubernetes|ci/cd)\b',
            r'\b(python|javascript|java|sql|react|node)\b',
            r'\b(rest|graphql|grpc|websocket|http)\b',
            r'\b(cache|queue|load balancer|proxy)\b',
            r'\b(unit test|integration test|e2e|tdd|bdd)\b',
        ]

        technical_count = 0
        for pattern in technical_patterns:
            matches = re.findall(pattern, answer_lower)
            technical_count += len(matches)

        # Calculate depth based on technical terms density
        words = len(answer.split())
        if words == 0:
            return 0.0

        depth = min(1.0, technical_count / 10)  # 10+ technical terms = max depth

        return depth

    def _determine_overall_quality(
        self,
        completeness: float,
        specificity: float,
        star_elements: Dict,
        is_vague: bool,
        question_intent: str
    ) -> str:
        """
        Determine overall quality category.

        Args:
            completeness: Completeness score
            specificity: Specificity score
            star_elements: STAR detection results
            is_vague: Whether answer is vague
            question_intent: Question intent

        Returns:
            Quality category string
        """
        # If explicitly vague, cap at adequate
        if is_vague:
            return "vague"

        # Combined score
        combined = (completeness + specificity) / 2

        # Adjust for STAR format in behavioral questions
        if question_intent in ["behavioral", "situational"]:
            star_completeness = star_elements.get("completeness_percentage", 0)
            combined = (combined + star_completeness) / 2

        # Determine category
        if combined >= self.EXCELLENT_THRESHOLD:
            return "excellent"
        elif combined >= self.GOOD_THRESHOLD:
            return "good"
        elif combined >= self.ADEQUATE_THRESHOLD:
            return "adequate"
        else:
            return "weak"

    def _get_conversation_stage(self, question_number: int) -> str:
        """
        Determine conversation stage from question number.

        Args:
            question_number: Current question number

        Returns:
            Stage string: "early", "mid", or "late"
        """
        if question_number <= 3:
            return "early"
        elif question_number >= 8:
            return "late"
        else:
            return "mid"

    def _get_tone_for_quality(self, quality: str) -> str:
        """
        Get appropriate tone for quality level.

        Args:
            quality: Quality level string

        Returns:
            Tone string
        """
        tone_map = {
            "excellent": "encouraging",
            "good": "positive",
            "adequate": "neutral",
            "weak": "supportive",
            "vague": "curious"
        }
        return tone_map.get(quality, "neutral")

    def _calculate_response_delay(self, quality: str) -> int:
        """
        Calculate appropriate response delay based on quality.

        Args:
            quality: Quality level

        Returns:
            Delay in milliseconds
        """
        # Faster response for excellent answers (seems more engaged)
        # Slightly longer for weak (seems more thoughtful)
        delays = {
            "excellent": 300,
            "good": 400,
            "adequate": 500,
            "weak": 600,
            "vague": 500
        }
        return delays.get(quality, 500)

    def _extract_main_topic(self, answer: str) -> Optional[str]:
        """
        Extract main topic from answer for acknowledgment context.

        Args:
            answer: The answer text

        Returns:
            Main topic or None
        """
        # Simple heuristic: look for common topic indicators
        answer_lower = answer.lower()

        # Technical topics
        tech_topics = {
            "database": "database work",
            "api": "API development",
            "frontend": "frontend development",
            "backend": "backend systems",
            "testing": "testing",
            "deployment": "deployment",
            "team": "teamwork",
            "leadership": "leadership",
            "project": "project management"
        }

        for keyword, topic in tech_topics.items():
            if keyword in answer_lower:
                return topic

        return None

    async def _generate_probe_if_needed(
        self,
        session_id: str,
        answer: str,
        metrics: Dict,
        response_action: str
    ) -> Optional[Dict[str, Any]]:
        """
        Generate probe response if action requires it.

        Args:
            session_id: Session ID for tracking
            answer: The answer text
            metrics: Quality metrics
            response_action: Decided action type

        Returns:
            Probe dict or None
        """
        # Track probe count to avoid over-probing
        probe_count = self._probe_history.get(session_id, 0)

        if probe_count >= 1:
            # Already probed once this session, don't probe again
            logger.info(f"Already probed {probe_count} time(s), skipping additional probe")
            return None

        missing_elements = metrics.get("missing_elements", [])

        if response_action == "probe_missing" and missing_elements:
            # Probe for most important missing element
            missing_element = missing_elements[0]

            # Map missing element to probe type
            probe_type_map = {
                "action": "role",
                "result": "result",
                "situation": "specific",
                "task": "role",
                "specifics": "specific"
            }
            probe_type = probe_type_map.get(missing_element, "specific")

            probe_text = await self.generate_probe_response(
                missing_element,
                answer[:100],
                probe_type
            )

            # Update probe history
            self._probe_history[session_id] = probe_count + 1

            return {
                "text": probe_text,
                "should_speak": True,
                "probe_type": probe_type,
                "missing_element": missing_element
            }

        elif response_action == "probe_vague":
            probe_text = await self.generate_probe_response(
                "your_role",
                answer[:100],
                "role"
            )

            # Update probe history
            self._probe_history[session_id] = probe_count + 1

            return {
                "text": probe_text,
                "should_speak": True,
                "probe_type": "role",
                "missing_element": "specifics"
            }

        return None

    def _contains_impressive_metric(self, text: str) -> bool:
        """
        Check if text contains impressive metrics.

        Args:
            text: Text to check

        Returns:
            True if impressive metric found
        """
        # Look for large percentages or dollar amounts
        impressive_patterns = [
            r'\b[5-9]\d%',  # 50%+ percentages
            r'\b100%',
            r'\$\d{5,}',  # $10,000+
            r'\b\d+x\b',  # Multipliers like "3x"
            r'\bmillion\b',
            r'\bthousands?\b',
        ]

        for pattern in impressive_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True

        return False

    def _is_potentially_off_topic(self, text: str) -> bool:
        """
        Check if answer might be going off-topic.

        Args:
            text: Text to check

        Returns:
            True if potentially off-topic
        """
        # Simple heuristic: check for tangent indicators
        tangent_phrases = [
            "by the way",
            "speaking of which",
            "that reminds me",
            "on a different note",
            "unrelated but",
            "anyway",
            "going back to"
        ]

        text_lower = text.lower()
        tangent_count = sum(1 for phrase in tangent_phrases if phrase in text_lower)

        return tangent_count >= 2

    def reset_probe_history(self, session_id: str = None):
        """
        Reset probe history for a session or all sessions.

        Args:
            session_id: Specific session to reset, or None for all
        """
        if session_id:
            self._probe_history.pop(session_id, None)
        else:
            self._probe_history.clear()

        logger.info(f"Probe history reset for: {session_id or 'all sessions'}")


# Singleton instance for shared use
_realtime_generator_instance: Optional[RealtimeResponseGenerator] = None


def get_realtime_response_generator() -> RealtimeResponseGenerator:
    """
    Get or create singleton RealtimeResponseGenerator instance.

    Returns:
        Shared RealtimeResponseGenerator instance
    """
    global _realtime_generator_instance

    if _realtime_generator_instance is None:
        _realtime_generator_instance = RealtimeResponseGenerator()

    return _realtime_generator_instance


def reset_realtime_response_generator():
    """Reset the singleton instance (useful for testing)."""
    global _realtime_generator_instance
    _realtime_generator_instance = None
    logger.info("RealtimeResponseGenerator singleton reset")


# Convenience functions for direct usage
async def generate_post_answer_response(
    session_id: UUID,
    answer: str,
    question_id: int,
    question_intent: str,
    quality_metrics: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Convenience function to generate post-answer response.

    Args:
        session_id: The interview session UUID
        answer: The user's answer
        question_id: Current question number
        question_intent: Question intent type
        quality_metrics: Optional pre-computed metrics

    Returns:
        Response dict for UI
    """
    generator = get_realtime_response_generator()
    return await generator.generate_post_answer_response(
        session_id,
        answer,
        question_id,
        question_intent,
        quality_metrics
    )


async def analyze_answer_quality(
    answer: str,
    question_intent: str
) -> Dict[str, Any]:
    """
    Convenience function to analyze answer quality.

    Args:
        answer: The answer text
        question_intent: Question intent type

    Returns:
        Quality metrics dict
    """
    generator = get_realtime_response_generator()
    return await generator.analyze_answer_quality(answer, question_intent)
