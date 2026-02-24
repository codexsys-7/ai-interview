# backend/services/interviewer_personality.py
"""
Interviewer Personality Service

Gives the AI interviewer a natural, human-like personality with varied responses.
The interviewer feels professional but personable, engaged but not over-enthusiastic.

Key Features:
- Diverse response templates with no repetition
- Context-aware tone adjustments (early/mid/late interview)
- Internal state tracking for variety management
- Natural, professional communication style
"""

import random
import logging
from typing import Dict, List, Optional, Any
from collections import deque
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class InterviewerPersonality:
    """
    Generates natural, varied interviewer responses with personality.

    Maintains internal state to ensure responses never repeat consecutively
    and maintains a professional but personable tone throughout the interview.

    Attributes:
        interview_stage: Current stage (early/mid/late)
        questions_asked: Number of questions asked so far
        _recent_*: Deques tracking recently used responses by type
    """

    # Maximum recent responses to track for variety
    RECENT_LIMIT = 5

    # ==================== Response Pools ====================

    # Acknowledgment responses by quality level
    ACKNOWLEDGMENTS = {
        "excellent": [
            "That's a really strong example.",
            "I appreciate the specific details you provided.",
            "Great answer - you hit all the key points.",
            "That's exactly the kind of depth I was looking for.",
            "Excellent. I can tell you've thought this through carefully.",
            "That's a comprehensive answer. Well done.",
            "Really impressive detail there.",
            "You've clearly got deep experience here.",
            "That's the level of specificity I was hoping for.",
            "Fantastic example. Very concrete.",
            "That demonstrates real expertise.",
            "I can see you've dealt with this extensively.",
            "That's a textbook example of how to handle that.",
            "Very thorough. I appreciate that.",
            "You nailed that one.",
        ],
        "good": [
            "I see what you're saying.",
            "That makes sense.",
            "Okay, I'm following.",
            "I appreciate you sharing that.",
            "That's helpful context.",
            "Good to know.",
            "That gives me a clearer picture.",
            "I understand where you're coming from.",
            "That's useful information.",
            "Okay, that helps.",
            "I can see how that worked.",
            "That's a solid approach.",
            "Makes sense to me.",
            "Good example.",
            "I see the logic there.",
        ],
        "adequate": [
            "Okay, I understand.",
            "Got it.",
            "I see.",
            "Alright, thanks.",
            "I hear you.",
            "Understood.",
            "Okay.",
            "Right.",
            "Fair enough.",
            "I follow.",
            "Noted.",
            "I get it.",
            "Sure.",
            "Okay, thanks.",
            "I understand.",
        ],
        "weak": [
            "I'd like to hear more about that.",
            "Can you elaborate on that point?",
            "Help me understand that better.",
            "I'm curious to hear more details.",
            "Could you expand on that?",
            "Tell me more about that.",
            "I'd appreciate a bit more detail.",
            "Can you unpack that for me?",
            "Walk me through that more.",
            "I want to understand this better.",
            "Give me a bit more context there.",
            "Can you go deeper on that?",
            "I need a little more information.",
            "Help me see the full picture.",
            "Can you flesh that out?",
        ],
        "vague": [
            "Let's dig into that a bit more.",
            "Can you be more specific?",
            "I need a bit more detail on that.",
            "Walk me through that more concretely.",
            "Help me understand the specifics.",
            "Can you give me a concrete example?",
            "What exactly do you mean by that?",
            "Let's get into the details.",
            "Can you paint me a clearer picture?",
            "I'd love to hear specifics.",
            "What did that actually look like?",
            "Help me visualize that.",
            "Can you make that more tangible?",
            "Give me something concrete to hold onto.",
            "What specifically happened?",
        ],
    }

    # Encouragement responses by performance trend
    ENCOURAGEMENTS = {
        "improving": [
            "You're hitting your stride now.",
            "I like how your answers are getting more detailed.",
            "You're really warming up - great to see.",
            "Your recent answers have been getting stronger.",
            "I can see you're finding your rhythm.",
            "Nice progression in your responses.",
            "You're building momentum here.",
            "Each answer is getting sharper.",
            "I'm seeing real improvement as we go.",
            "You're clearly getting more comfortable.",
        ],
        "steady": [
            "You're doing well, let's continue.",
            "Great consistency in your answers.",
            "You're maintaining good momentum.",
            "Keep that same energy going.",
            "Solid and steady - that's good.",
            "You're maintaining a good pace.",
            "Consistent quality throughout.",
            "You're staying focused - I like that.",
            "Good steady performance.",
            "You're keeping the bar high.",
        ],
        "strong": [
            "You're doing an excellent job so far.",
            "Really impressive answers across the board.",
            "You're clearly well-prepared.",
            "Your examples are spot-on.",
            "This is going really well.",
            "You've been nailing these questions.",
            "I'm impressed with your responses.",
            "Outstanding performance so far.",
            "Your preparation really shows.",
            "You've got a great handle on this.",
        ],
        "declining": [
            "Let's take a breath and refocus.",
            "No worries - take your time with this one.",
            "It's okay to think through this carefully.",
            "Don't rush - quality over speed.",
            "Let's slow down a bit here.",
        ],
    }

    # Transition responses by type
    TRANSITIONS = {
        "natural": [
            "Thanks for that. Now, let's talk about {next_topic}.",
            "Good. Moving on to {next_topic}...",
            "Appreciate that context. Let's shift to {next_topic}.",
            "Okay. I'd like to hear about {next_topic} now.",
            "Great. Let's move to {next_topic}.",
            "Thanks. Now I want to explore {next_topic}.",
            "Good stuff. Let's discuss {next_topic}.",
            "Alright, let's turn to {next_topic}.",
            "Thanks for sharing that. On to {next_topic}.",
            "Good answer. Now, about {next_topic}...",
            "I appreciate that. Let's look at {next_topic}.",
            "Okay, moving along to {next_topic}.",
        ],
        "shift": [
            "Let's change gears a bit.",
            "I want to shift focus now.",
            "Let's look at this from a different angle.",
            "Time to explore another area.",
            "Let me take you in a different direction.",
            "I'd like to switch topics.",
            "Let's pivot to something else.",
            "Okay, changing direction here.",
            "Let's shift our focus.",
            "Time for a change of pace.",
        ],
        "buildup": [
            "Building on what you just said about {previous_topic}...",
            "That connects nicely to what I want to ask next.",
            "Your answer about {previous_topic} leads me to...",
            "Speaking of {previous_topic}, that reminds me...",
            "That segues well into my next question.",
            "Following up on {previous_topic}...",
            "That actually ties into something else I wanted to ask.",
            "Staying on {previous_topic} for a moment...",
            "Related to what you just mentioned...",
            "That's a good bridge to my next question.",
        ],
        "contrast": [
            "Now, on a different note...",
            "Let's look at the flip side.",
            "Here's something contrasting...",
            "On the other hand...",
            "Now for something completely different.",
            "Let me challenge you with the opposite...",
            "Taking the contrary view...",
            "Looking at it from another angle...",
            "Here's a different perspective...",
            "Let's consider the alternative...",
        ],
    }

    # Active listening responses
    ACTIVE_LISTENING = [
        "So what you're saying is {paraphrase}.",
        "If I understand correctly, {paraphrase}.",
        "Let me make sure I've got this - {paraphrase}.",
        "So the key point is {key_point}.",
        "In other words, {paraphrase}.",
        "What I'm hearing is {paraphrase}.",
        "So essentially, {paraphrase}.",
        "To summarize, {paraphrase}.",
        "You're telling me that {paraphrase}.",
        "So your main takeaway was {key_point}.",
        "Let me reflect that back - {paraphrase}.",
        "So the bottom line is {key_point}.",
    ]

    # Probing responses by type
    PROBING = {
        "specific": [
            "Can you give me a specific example?",
            "What exactly did that look like?",
            "Help me visualize that.",
            "What were the specific numbers?",
            "Can you be more concrete?",
            "Give me a real-world instance.",
            "What specifically did you do?",
            "Can you quantify that?",
            "Paint me a picture of that.",
            "What did that actually entail?",
        ],
        "process": [
            "Walk me through your process.",
            "How did you approach that?",
            "What were the steps you took?",
            "Take me through your methodology.",
            "How did you go about it?",
            "What was your approach?",
            "Describe your workflow.",
            "How did you structure that?",
            "What was your game plan?",
            "How did you tackle it?",
        ],
        "result": [
            "What was the outcome?",
            "How did that turn out?",
            "What were the results?",
            "What impact did that have?",
            "What happened in the end?",
            "What did you achieve?",
            "What was the final result?",
            "How did it conclude?",
            "What were the measurable outcomes?",
            "What difference did it make?",
        ],
        "role": [
            "What was YOUR specific role?",
            "Tell me about your individual contribution.",
            "What did YOU personally do?",
            "How did you specifically contribute?",
            "What was your part in this?",
            "What were you responsible for?",
            "What did you own?",
            "Where did you personally add value?",
            "What was your unique contribution?",
            "How did you drive this forward?",
        ],
        "challenge": [
            "What obstacles did you face?",
            "What made that difficult?",
            "What were the challenges?",
            "What went wrong?",
            "What hurdles did you encounter?",
            "What was the hardest part?",
            "Where did you struggle?",
            "What complications arose?",
            "What setbacks did you face?",
            "What made this tricky?",
        ],
    }

    # Clarification requests by contradiction type
    CLARIFICATIONS = {
        "work_style": [
            "Help me reconcile something about your work style...",
            "I want to understand how you balance {aspect_a} with {aspect_b}.",
            "You mentioned both {aspect_a} and {aspect_b} - how do those fit together?",
            "Can you help me understand your flexibility on work style?",
            "I'm curious how you adapt between {aspect_a} and {aspect_b}.",
        ],
        "experience": [
            "I want to make sure I understand your experience level here...",
            "Help me clarify your background in this area.",
            "Can you connect the dots for me on your experience?",
            "I'm trying to get a clear picture of your expertise here.",
            "Walk me through how you developed this skill.",
        ],
        "preference": [
            "I noticed you mentioned different preferences - can you clarify?",
            "Help me understand what you're really looking for.",
            "Can you prioritize those preferences for me?",
            "I want to understand what matters most to you here.",
            "Let's dig into what you actually prefer.",
        ],
        "timeline": [
            "Can you clarify the timeline for me?",
            "Help me understand the sequence of events.",
            "Let me make sure I have the timing right.",
            "Can you walk me through when things happened?",
            "I want to get the chronology straight.",
        ],
        "general": [
            "Help me reconcile something...",
            "I want to make sure I understand correctly...",
            "Can you clarify that for me?",
            "I'm a bit confused about...",
            "Let me make sure I'm following...",
            "Can you help me understand how those fit together?",
            "I want to make sure I'm not missing something...",
            "Can you connect those dots for me?",
        ],
    }

    # Interest responses for repeated topics
    INTEREST_RESPONSES = [
        "I can tell {topic} is really important to you.",
        "You light up when you talk about {topic}.",
        "Your passion for {topic} comes through clearly.",
        "It's obvious you have deep expertise in {topic}.",
        "{topic} seems to be a core strength of yours.",
        "I sense {topic} is something you really care about.",
        "You've mentioned {topic} several times - clearly it's significant to you.",
        "Your enthusiasm for {topic} is evident.",
        "{topic} appears to be a real area of passion.",
        "I can see {topic} has been a big part of your career.",
        "You have a lot of depth when it comes to {topic}.",
        "It's clear you've invested significantly in {topic}.",
    ]

    # Time check responses
    TIME_CHECKS = [
        "We're making good progress - just a few more questions.",
        "We're about halfway through.",
        "I have just a couple more areas to cover.",
        "We're in the home stretch now.",
        "We're nearing the end - just a few more to go.",
        "Good progress so far - a few more questions remaining.",
        "We're well into the interview now.",
        "Just a handful more questions to cover.",
        "We're coming down the final stretch.",
        "Almost done - just wrapping up a few areas.",
    ]

    # ==================== Initialization ====================

    def __init__(self):
        """Initialize the interviewer personality with tracking state."""
        # Track recent responses to ensure variety
        self._recent_acknowledgments: deque = deque(maxlen=self.RECENT_LIMIT)
        self._recent_encouragements: deque = deque(maxlen=self.RECENT_LIMIT)
        self._recent_transitions: deque = deque(maxlen=self.RECENT_LIMIT)
        self._recent_probing: deque = deque(maxlen=self.RECENT_LIMIT)
        self._recent_clarifications: deque = deque(maxlen=self.RECENT_LIMIT)
        self._recent_active_listening: deque = deque(maxlen=self.RECENT_LIMIT)
        self._recent_interest: deque = deque(maxlen=self.RECENT_LIMIT)

        # Interview state
        self.interview_stage: str = "early"  # early, mid, late
        self.questions_asked: int = 0
        self.last_encouragement_question: int = 0
        self.active_listening_count: int = 0
        self.time_check_given: bool = False

        logger.info("InterviewerPersonality initialized")

    # ==================== Core Response Generation ====================

    def _select_varied_response(
        self,
        pool: List[str],
        recent_deque: deque,
        context: Dict[str, Any] = None
    ) -> str:
        """
        Select a varied response from a pool, avoiding recent responses.

        Args:
            pool: List of possible responses
            recent_deque: Deque of recently used responses
            context: Optional context for template formatting

        Returns:
            Selected response string (formatted if context provided)
        """
        if not pool:
            return ""

        # Filter out recently used responses
        available = [r for r in pool if r not in recent_deque]

        # If all have been used recently, reset and use full pool
        if not available:
            available = pool.copy()
            # At minimum, avoid the very last one used
            if recent_deque and recent_deque[-1] in available and len(available) > 1:
                available.remove(recent_deque[-1])

        # Random selection
        selected = random.choice(available)

        # Track usage
        recent_deque.append(selected)

        # Format with context if provided
        if context:
            try:
                selected = selected.format(**context)
            except KeyError as e:
                logger.warning(f"Missing context key for response formatting: {e}")

        return selected

    def update_interview_stage(self, current_question: int, total_questions: int):
        """
        Update the interview stage based on progress.

        Args:
            current_question: Current question number
            total_questions: Total questions planned
        """
        self.questions_asked = current_question
        progress = current_question / total_questions if total_questions > 0 else 0

        if progress <= 0.3:
            self.interview_stage = "early"
        elif progress <= 0.7:
            self.interview_stage = "mid"
        else:
            self.interview_stage = "late"

    # ==================== Response Methods ====================

    def generate_acknowledgment(
        self,
        answer_quality: str,
        topic: str = None
    ) -> str:
        """
        Generate natural acknowledgments during/after answers.

        Args:
            answer_quality: "excellent", "good", "adequate", "weak", "vague"
            topic: Optional topic for context

        Returns:
            Natural acknowledgment string
        """
        quality_key = answer_quality.lower()
        if quality_key not in self.ACKNOWLEDGMENTS:
            quality_key = "adequate"

        pool = self.ACKNOWLEDGMENTS[quality_key]
        context = {"topic": topic} if topic else None

        response = self._select_varied_response(
            pool,
            self._recent_acknowledgments,
            context
        )

        logger.debug(f"Generated acknowledgment ({quality_key}): {response}")
        return response

    def generate_encouragement(
        self,
        question_number: int,
        performance_trend: str = "steady"
    ) -> Optional[str]:
        """
        Generate encouraging comments naturally.

        Only provides encouragement every 3-4 questions to avoid overdoing it.

        Args:
            question_number: Current question number
            performance_trend: "improving", "steady", "declining", "strong"

        Returns:
            Encouragement string or None if not appropriate
        """
        # Don't over-encourage - only every 3-4 questions
        questions_since_last = question_number - self.last_encouragement_question
        if questions_since_last < 3:
            return None

        # 50% chance to give encouragement even when appropriate
        if random.random() < 0.5:
            return None

        trend_key = performance_trend.lower()
        if trend_key not in self.ENCOURAGEMENTS:
            trend_key = "steady"

        pool = self.ENCOURAGEMENTS[trend_key]

        response = self._select_varied_response(
            pool,
            self._recent_encouragements
        )

        self.last_encouragement_question = question_number
        logger.debug(f"Generated encouragement ({trend_key}): {response}")
        return response

    def generate_transition(
        self,
        previous_topic: str,
        next_topic: str,
        transition_type: str = "natural"
    ) -> str:
        """
        Generate natural transitions between topics.

        Args:
            previous_topic: Topic just discussed
            next_topic: Topic to transition to
            transition_type: "natural", "shift", "buildup", "contrast"

        Returns:
            Transition string
        """
        type_key = transition_type.lower()
        if type_key not in self.TRANSITIONS:
            type_key = "natural"

        pool = self.TRANSITIONS[type_key]
        context = {
            "previous_topic": previous_topic,
            "next_topic": next_topic
        }

        response = self._select_varied_response(
            pool,
            self._recent_transitions,
            context
        )

        logger.debug(f"Generated transition ({type_key}): {response}")
        return response

    def generate_active_listening_response(
        self,
        answer_excerpt: str,
        key_point: str = None
    ) -> Optional[str]:
        """
        Show AI is actively listening by paraphrasing or highlighting.

        Use sparingly - only 1-2 times per interview.

        Args:
            answer_excerpt: Part of the answer to paraphrase
            key_point: Optional key point to highlight

        Returns:
            Active listening response or None if used too recently
        """
        # Limit to 2 uses per interview
        if self.active_listening_count >= 2:
            return None

        # 30% chance to use when available
        if random.random() > 0.3:
            return None

        # Create a simple paraphrase (in production, this could use LLM)
        paraphrase = self._create_simple_paraphrase(answer_excerpt)

        context = {
            "paraphrase": paraphrase,
            "key_point": key_point or paraphrase
        }

        response = self._select_varied_response(
            self.ACTIVE_LISTENING,
            self._recent_active_listening,
            context
        )

        self.active_listening_count += 1
        logger.debug(f"Generated active listening: {response}")
        return response

    def _create_simple_paraphrase(self, text: str) -> str:
        """
        Create a simple paraphrase of text.

        In production, this could use an LLM for better paraphrasing.
        For now, we just clean and truncate.
        """
        # Simple truncation for now
        words = text.split()
        if len(words) > 15:
            return " ".join(words[:15]) + "..."
        return text

    def generate_probing_response(
        self,
        incomplete_area: str,
        probe_type: str = "specific"
    ) -> str:
        """
        Generate gentle probes for more detail.

        Args:
            incomplete_area: Area needing more detail
            probe_type: "specific", "process", "result", "role", "challenge"

        Returns:
            Probing question string
        """
        type_key = probe_type.lower()
        if type_key not in self.PROBING:
            type_key = "specific"

        pool = self.PROBING[type_key]
        context = {"area": incomplete_area}

        response = self._select_varied_response(
            pool,
            self._recent_probing,
            context
        )

        logger.debug(f"Generated probe ({type_key}): {response}")
        return response

    def generate_clarification_request(
        self,
        contradiction_type: str,
        context: Dict = None
    ) -> str:
        """
        Tactfully ask for clarification on contradictions.

        NEVER accusatory. Always gives benefit of the doubt.

        Args:
            contradiction_type: "work_style", "experience", "preference", "timeline"
            context: Optional context with aspect details

        Returns:
            Clarification request string
        """
        type_key = contradiction_type.lower()
        if type_key not in self.CLARIFICATIONS:
            type_key = "general"

        pool = self.CLARIFICATIONS[type_key]

        # Default context values
        format_context = {
            "aspect_a": context.get("aspect_a", "one approach") if context else "one approach",
            "aspect_b": context.get("aspect_b", "another") if context else "another"
        }

        response = self._select_varied_response(
            pool,
            self._recent_clarifications,
            format_context
        )

        logger.debug(f"Generated clarification ({type_key}): {response}")
        return response

    def generate_interest_response(
        self,
        repeated_topic: str,
        mention_count: int
    ) -> Optional[str]:
        """
        Show genuine interest when user is passionate about a topic.

        Only triggers when topic mentioned 3+ times.

        Args:
            repeated_topic: Topic mentioned multiple times
            mention_count: Number of times mentioned

        Returns:
            Interest response or None if count too low
        """
        if mention_count < 3:
            return None

        context = {"topic": repeated_topic}

        response = self._select_varied_response(
            self.INTEREST_RESPONSES,
            self._recent_interest,
            context
        )

        logger.debug(f"Generated interest response for '{repeated_topic}': {response}")
        return response

    def generate_time_check(
        self,
        questions_remaining: int,
        total_time_elapsed: int = None
    ) -> Optional[str]:
        """
        Generate occasional time/progress updates.

        Use sparingly - only once per interview, typically mid-interview.

        Args:
            questions_remaining: Number of questions left
            total_time_elapsed: Optional elapsed time in seconds

        Returns:
            Time check string or None
        """
        # Only give one time check per interview
        if self.time_check_given:
            return None

        # Only give in mid-stage
        if self.interview_stage != "mid":
            return None

        # 40% chance when conditions are right
        if random.random() > 0.4:
            return None

        # Select appropriate response based on remaining questions
        if questions_remaining <= 2:
            filtered_pool = [r for r in self.TIME_CHECKS if "home stretch" in r or "almost" in r.lower() or "final" in r]
        elif questions_remaining <= 4:
            filtered_pool = [r for r in self.TIME_CHECKS if "few more" in r or "handful" in r]
        else:
            filtered_pool = [r for r in self.TIME_CHECKS if "halfway" in r or "progress" in r]

        if not filtered_pool:
            filtered_pool = self.TIME_CHECKS

        response = random.choice(filtered_pool)
        self.time_check_given = True

        logger.debug(f"Generated time check: {response}")
        return response

    # ==================== Main Variety Method ====================

    def get_varied_response(
        self,
        response_type: str,
        context: Dict[str, Any] = None
    ) -> Optional[str]:
        """
        Main method to get varied responses by type.

        Ensures variety through internal state tracking.

        Args:
            response_type: Type of response needed
            context: Context dictionary with required parameters

        Returns:
            Appropriate response string or None
        """
        context = context or {}

        if response_type == "acknowledgment":
            return self.generate_acknowledgment(
                answer_quality=context.get("quality", "good"),
                topic=context.get("topic")
            )

        elif response_type == "encouragement":
            return self.generate_encouragement(
                question_number=context.get("question_number", self.questions_asked),
                performance_trend=context.get("trend", "steady")
            )

        elif response_type == "transition":
            return self.generate_transition(
                previous_topic=context.get("previous_topic", "that"),
                next_topic=context.get("next_topic", "something else"),
                transition_type=context.get("transition_type", "natural")
            )

        elif response_type == "active_listening":
            return self.generate_active_listening_response(
                answer_excerpt=context.get("excerpt", ""),
                key_point=context.get("key_point")
            )

        elif response_type == "probing":
            return self.generate_probing_response(
                incomplete_area=context.get("area", "that point"),
                probe_type=context.get("probe_type", "specific")
            )

        elif response_type == "clarification":
            return self.generate_clarification_request(
                contradiction_type=context.get("contradiction_type", "general"),
                context=context
            )

        elif response_type == "interest":
            return self.generate_interest_response(
                repeated_topic=context.get("topic", "this topic"),
                mention_count=context.get("mention_count", 3)
            )

        elif response_type == "time_check":
            return self.generate_time_check(
                questions_remaining=context.get("remaining", 5),
                total_time_elapsed=context.get("elapsed")
            )

        else:
            logger.warning(f"Unknown response type: {response_type}")
            return None

    # ==================== Compound Responses ====================

    def generate_pre_question_comment(
        self,
        question_type: str,
        metadata: Dict[str, Any] = None
    ) -> Optional[str]:
        """
        Generate a natural pre-question comment based on context.

        Combines multiple response types for natural flow.

        Args:
            question_type: Type of question coming (standard/follow_up/etc.)
            metadata: Context metadata

        Returns:
            Combined pre-question comment or None
        """
        metadata = metadata or {}
        comments = []

        # Maybe add acknowledgment of previous answer
        if metadata.get("previous_answer_quality"):
            ack = self.generate_acknowledgment(metadata["previous_answer_quality"])
            if ack:
                comments.append(ack)

        # Maybe add encouragement
        encouragement = self.generate_encouragement(
            self.questions_asked,
            metadata.get("performance_trend", "steady")
        )
        if encouragement:
            comments.append(encouragement)

        # Add type-specific comment
        if question_type == "follow_up":
            comments.append("I'd like to dig a bit deeper on that.")
        elif question_type == "deep_dive":
            topic = metadata.get("topic", "this area")
            interest = self.generate_interest_response(topic, metadata.get("mention_count", 3))
            if interest:
                comments.append(interest)
        elif question_type == "challenge":
            clarification = self.generate_clarification_request(
                metadata.get("contradiction_type", "general"),
                metadata
            )
            if clarification:
                comments.append(clarification)

        # Maybe add time check
        time_check = self.generate_time_check(
            metadata.get("questions_remaining", 5)
        )
        if time_check:
            comments.append(time_check)

        if comments:
            return " ".join(comments)
        return None

    def reset(self):
        """Reset all internal state for a new interview."""
        self._recent_acknowledgments.clear()
        self._recent_encouragements.clear()
        self._recent_transitions.clear()
        self._recent_probing.clear()
        self._recent_clarifications.clear()
        self._recent_active_listening.clear()
        self._recent_interest.clear()

        self.interview_stage = "early"
        self.questions_asked = 0
        self.last_encouragement_question = 0
        self.active_listening_count = 0
        self.time_check_given = False

        logger.info("InterviewerPersonality reset for new interview")


# ==================== Singleton & Convenience Functions ====================

_personality_instance: Optional[InterviewerPersonality] = None


def get_interviewer_personality() -> InterviewerPersonality:
    """
    Get or create the singleton InterviewerPersonality instance.

    Returns:
        The shared InterviewerPersonality instance
    """
    global _personality_instance
    if _personality_instance is None:
        _personality_instance = InterviewerPersonality()
    return _personality_instance


def reset_interviewer_personality() -> None:
    """Reset the singleton instance for a new interview."""
    global _personality_instance
    if _personality_instance:
        _personality_instance.reset()
    else:
        _personality_instance = InterviewerPersonality()

 
# ==================== Quick Access Functions ====================

def acknowledge(quality: str, topic: str = None) -> str:
    """Quick access to generate acknowledgment."""
    return get_interviewer_personality().generate_acknowledgment(quality, topic)


def encourage(question_number: int, trend: str = "steady") -> Optional[str]:
    """Quick access to generate encouragement."""
    return get_interviewer_personality().generate_encouragement(question_number, trend)


def transition(previous: str, next_topic: str, style: str = "natural") -> str:
    """Quick access to generate transition."""
    return get_interviewer_personality().generate_transition(previous, next_topic, style)


def probe(area: str, probe_type: str = "specific") -> str:
    """Quick access to generate probing response."""
    return get_interviewer_personality().generate_probing_response(area, probe_type)
