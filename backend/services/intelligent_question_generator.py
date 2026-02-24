# backend/services/intelligent_question_generator.py
"""
Intelligent Question Generator Service

Generates contextually-aware interview questions using conversation memory,
semantic search, contradiction detection, and a curated question bank.

The question bank integration allows the system to:
1. Use real, battle-tested interview questions as a foundation
2. Fall back to LLM generation when the bank doesn't have suitable questions
3. Combine bank questions with context-aware modifications
"""

import logging
import json
from typing import Dict, List, Optional, Any
from uuid import UUID
from openai import OpenAI
import os

from services.conversation_context import (
    build_conversation_summary,
    get_all_answers,
    detect_repeated_topics,
    get_recent_context,
    extract_topics
)
from services.contradiction_detector import detect_contradictions
from services.embedding_service import (
    generate_embedding,
    find_similar_answers
)
from services.question_selector import QuestionSelector, get_question_selector

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Question generation model
QUESTION_MODEL = "gpt-4o-mini"


class IntelligentQuestionGenerator:
    """
    Generates contextually-aware interview questions using full conversation memory.

    Integrates with:
    - ConversationContext: For building conversation summaries and topic detection
    - ContradictionDetector: For identifying inconsistencies to probe
    - EmbeddingService: For semantic search of related past answers
    """

    def __init__(
        self,
        conversation_context_module=None,
        contradiction_detector_module=None,
        embedding_service_module=None,
        question_selector: Optional[QuestionSelector] = None
    ):
        """
        Initialize the Intelligent Question Generator.

        Args:
            conversation_context_module: Module for conversation context functions
            contradiction_detector_module: Module for contradiction detection
            embedding_service_module: Module for embedding and similarity search
            question_selector: QuestionSelector instance for accessing question bank
        """
        # Allow dependency injection for testing, otherwise use imported modules
        self.conversation_context = conversation_context_module
        self.contradiction_detector = contradiction_detector_module
        self.embedding_service = embedding_service_module

        # Initialize question selector (use singleton if not provided)
        self.question_selector = question_selector or get_question_selector()

        logger.info("IntelligentQuestionGenerator initialized with question bank")

    async def generate_next_question(
        self,
        session_id: UUID,
        current_question_number: int,
        role: str,
        difficulty: str,
        use_question_bank: bool = True
    ) -> Dict[str, Any]:
        """
        Generate next contextual question using full conversation memory.

        Now with question bank integration:
        1. First tries to get a real question from the curated question bank
        2. If found and no special context needed, uses it directly
        3. If context needed (referencing past answer), may modify via LLM
        4. If not found in bank, generates new question via LLM

        Process:
        1. Retrieve all past answers via conversation_context.get_all_answers()
        2. Build conversation summary
        3. Detect repeated topics using detect_repeated_topics()
        4. Check for contradictions
        5. Try to get question from bank (if use_question_bank=True)
        6. Fall back to LLM generation if needed

        Args:
            session_id: The interview session UUID
            current_question_number: Current question number (1-indexed)
            role: The job role being interviewed for
            difficulty: Interview difficulty level (junior/intermediate/senior)
            use_question_bank: Whether to try getting questions from the bank first

        Returns:
            Dict containing:
            - question_text: The generated question
            - question_intent: Category (technical_skills, problem_solving, etc.)
            - question_type: standard/follow_up/challenge/deep_dive/reference
            - references_previous: Whether it references a past answer
            - referenced_question_id: ID of referenced question if applicable
            - context_used: Summary of context considered
            - source: "question_bank" or "llm_generated"
        """
        session_id_str = str(session_id)
        logger.info(f"Generating next question for session {session_id_str}, question #{current_question_number}")

        try:
            # Step 1: Retrieve all past answers
            past_answers = get_all_answers(session_id_str)

            # Collect used questions to avoid repetition
            used_questions = [a.get("question_text", "") for a in past_answers]

            # If no past answers, generate a standard opening question
            if not past_answers:
                # Try question bank first for opening question
                if use_question_bank:
                    bank_question = self.question_selector.get_question(
                        role=role,
                        difficulty=difficulty,
                        intent="introduction",
                        used_questions=used_questions
                    )
                    if bank_question:
                        logger.info("Using opening question from bank")
                        return self._format_bank_question(
                            bank_question, "introduction", "standard"
                        )
                # Fall back to LLM generation
                return await self._generate_opening_question(role, difficulty)

            # Step 2: Build conversation summary
            conversation_summary = build_conversation_summary(session_id_str)

            # Step 3: Detect repeated topics
            repeated_topics = detect_repeated_topics(session_id_str)

            # Step 4: Check for contradictions in the most recent answer
            last_answer = past_answers[-1]
            contradictions = await detect_contradictions(
                session_id_str,
                last_answer.get("user_answer", ""),
                last_answer.get("question_text", "")
            )

            # Step 5: Determine question type based on analysis
            question_type, specific_context = self._determine_question_type(
                past_answers,
                repeated_topics,
                contradictions,
                current_question_number
            )

            # Step 6: Generate question based on determined type
            if question_type == "contradiction_challenge" and contradictions:
                return await self.generate_contradiction_challenge(
                    session_id,
                    contradictions[0]
                )
            elif question_type == "deep_dive" and repeated_topics:
                # Get the most repeated topic
                top_topic = max(repeated_topics.items(), key=lambda x: x[1])
                return await self.generate_deep_dive_question(
                    session_id,
                    top_topic[0],
                    top_topic[1]
                )
            elif question_type == "follow_up":
                return await self.generate_follow_up_question(
                    session_id,
                    last_answer.get("user_answer", ""),
                    last_answer.get("question_intent", "general")
                )
            else:
                # For standard questions, try question bank first
                if use_question_bank:
                    # Determine target intent based on question number progression
                    intents = ["technical_skills", "problem_solving", "behavioral",
                              "scenario_based", "work_experience"]
                    intent_index = (current_question_number - 1) % len(intents)
                    target_intent = intents[intent_index]

                    bank_question = self.question_selector.get_question(
                        role=role,
                        difficulty=difficulty,
                        intent=target_intent,
                        used_questions=used_questions
                    )

                    if bank_question:
                        logger.info(f"Using question from bank for intent '{target_intent}'")
                        return self._format_bank_question(
                            bank_question, target_intent, "standard"
                        )
                    else:
                        logger.info(f"No bank question for {role}/{difficulty}/{target_intent}, using LLM")

                # Fall back to LLM-generated standard question
                return await self._generate_standard_question(
                    session_id_str,
                    conversation_summary,
                    role,
                    difficulty,
                    current_question_number,
                    specific_context
                )

        except Exception as e:
            logger.error(f"Error generating next question: {str(e)}")
            # Fallback to a safe standard question
            return await self._generate_fallback_question(role, difficulty)

    async def generate_follow_up_question(
        self,
        session_id: UUID,
        last_answer: str,
        last_question_intent: str
    ) -> Dict[str, Any]:
        """
        Generate immediate follow-up based on last answer.

        Analyzes:
        - Answer completeness (STAR format)
        - Specificity level
        - Technical depth

        Args:
            session_id: The interview session UUID
            last_answer: The candidate's most recent answer
            last_question_intent: Intent category of the last question

        Returns:
            Dict with question details and follow_up type
        """
        session_id_str = str(session_id)
        logger.info(f"Generating follow-up question for session {session_id_str}")

        try:
            # Analyze the answer for completeness
            analysis = await self._analyze_answer_completeness(last_answer)

            # Build follow-up prompt based on analysis
            prompt = self._build_llm_prompt(
                conversation_summary=f"Last answer: {last_answer}",
                question_type="follow_up",
                role="",  # Not needed for follow-up
                difficulty="",  # Not needed for follow-up
                specific_context={
                    "last_question_intent": last_question_intent,
                    "analysis": analysis,
                    "instruction": self._get_follow_up_instruction(analysis)
                }
            )

            # Generate the follow-up question
            response = client.chat.completions.create(
                model=QUESTION_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert interviewer generating follow-up questions. "
                                   "Your follow-ups should probe deeper into the candidate's response "
                                   "without being confrontational. Keep questions concise and focused."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=300
            )

            question_text = response.choices[0].message.content.strip()

            return {
                "question_text": question_text,
                "question_intent": last_question_intent,
                "question_type": "follow_up",
                "references_previous": True,
                "referenced_question_id": None,
                "context_used": f"Follow-up based on answer analysis: {analysis.get('missing_elements', 'general depth')}"
            }

        except Exception as e:
            logger.error(f"Error generating follow-up question: {str(e)}")
            return {
                "question_text": "Can you elaborate more on that? I'd like to understand the specific details and outcomes.",
                "question_intent": last_question_intent,
                "question_type": "follow_up",
                "references_previous": True,
                "referenced_question_id": None,
                "context_used": "Fallback follow-up due to error"
            }

    async def generate_referencing_question(
        self,
        session_id: UUID,
        topic: str,
        past_answer_id: UUID
    ) -> Dict[str, Any]:
        """
        Generate question explicitly referencing past answer.

        Creates questions like:
        "Earlier in question 2, you mentioned working with Python.
         Tell me more about your experience building scalable systems with Python."

        Args:
            session_id: The interview session UUID
            topic: The topic to reference
            past_answer_id: UUID of the past answer to reference

        Returns:
            Dict with question that explicitly references past answer
        """
        session_id_str = str(session_id)
        logger.info(f"Generating referencing question for topic '{topic}' in session {session_id_str}")

        try:
            # Get all answers to find the referenced one
            all_answers = get_all_answers(session_id_str)

            # Find the referenced answer
            referenced_answer = None
            question_number = None
            for i, answer in enumerate(all_answers):
                if answer.get("id") == str(past_answer_id):
                    referenced_answer = answer
                    question_number = i + 1
                    break

            if not referenced_answer:
                logger.warning(f"Referenced answer {past_answer_id} not found")
                # Generate without specific reference
                return await self._generate_topic_question(session_id_str, topic)

            prompt = f"""Generate an interview question that explicitly references a previous answer.

            Topic to explore: {topic}
            Previous answer (Question {question_number}): "{referenced_answer.get('user_answer', '')}"
            Original question was: "{referenced_answer.get('question_text', '')}"

            Generate a question that:
            1. Starts with "Earlier, when discussing..." or "You mentioned in a previous answer..."
            2. References the specific topic from their answer
            3. Asks them to go deeper or connect it to another aspect
            4. Is professional and shows you were actively listening

            Return ONLY the question text, nothing else."""

            response = client.chat.completions.create(
                model=QUESTION_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert interviewer who actively listens and builds upon candidate responses."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=200
            )

            question_text = response.choices[0].message.content.strip()

            return {
                "question_text": question_text,
                "question_intent": referenced_answer.get("question_intent", "general"),
                "question_type": "reference",
                "references_previous": True,
                "referenced_question_id": question_number,
                "context_used": f"Referencing answer from Q{question_number} about '{topic}'"
            }

        except Exception as e:
            logger.error(f"Error generating referencing question: {str(e)}")
            return {
                "question_text": f"Earlier you mentioned {topic}. Can you tell me more about your experience with that?",
                "question_intent": "general",
                "question_type": "reference",
                "references_previous": True,
                "referenced_question_id": None,
                "context_used": f"Fallback reference question about '{topic}'"
            }

    async def generate_contradiction_challenge(
        self,
        session_id: UUID,
        contradiction: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate question to address detected contradiction.

        Creates tactful questions to clarify inconsistencies without being accusatory.

        Example output:
        "I notice in question 3 you mentioned loving teamwork,
         but in question 7 you said you prefer working alone.
         Can you help me understand your preferred work style?"

        Args:
            session_id: The interview session UUID
            contradiction: Dict containing:
                - past_answer_id: UUID of the contradicting past answer
                - past_statement: The past statement
                - current_statement: The current contradicting statement
                - contradiction_type: Type of contradiction

        Returns:
            Dict with tactful clarification question
        """
        session_id_str = str(session_id)
        logger.info(f"Generating contradiction challenge for session {session_id_str}")

        try:
            past_statement = contradiction.get("previous_statement", contradiction.get("past_statement", ""))
            current_statement = contradiction.get("current_statement", "")
            contradiction_type = contradiction.get("contradiction_type", "inconsistency")

            prompt = f"""Generate a tactful interview question to clarify an apparent inconsistency in a candidate's answers.

            Earlier statement: "{past_statement}"
            Recent statement: "{current_statement}"
            Type of inconsistency: {contradiction_type}

            Generate a question that:
            1. Is NON-CONFRONTATIONAL and assumes good faith
            2. Gives the candidate a chance to clarify or explain nuance
            3. Uses phrases like "help me understand" or "I'd like to hear more about"
            4. Does NOT accuse them of lying or being dishonest
            5. Acknowledges that context matters and situations can be different

            Return ONLY the question text, nothing else."""

            response = client.chat.completions.create(
                model=QUESTION_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a thoughtful interviewer who seeks to understand candidates deeply. "
                                   "You never accuse or confront, but rather invite clarification with curiosity and respect."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=200
            )

            question_text = response.choices[0].message.content.strip()

            return {
                "question_text": question_text,
                "question_intent": "clarification",
                "question_type": "challenge",
                "references_previous": True,
                "referenced_question_id": contradiction.get("previous_question_id"),
                "context_used": f"Addressing {contradiction_type}: '{past_statement[:50]}...' vs '{current_statement[:50]}...'"
            }

        except Exception as e:
            logger.error(f"Error generating contradiction challenge: {str(e)}")
            return {
                "question_text": "I'd like to understand your perspective better. Can you help me see how your different experiences have shaped your approach?",
                "question_intent": "clarification",
                "question_type": "challenge",
                "references_previous": True,
                "referenced_question_id": None,
                "context_used": "Fallback clarification question"
            }

    async def generate_deep_dive_question(
        self,
        session_id: UUID,
        repeated_topic: str,
        mention_count: int
    ) -> Dict[str, Any]:
        """
        Generate question to explore topic user is passionate about.

        When a topic appears multiple times, it suggests strong interest or expertise.

        Example output:
        "You've mentioned machine learning in 3 different answers -
         you clearly have deep interest here. Tell me about the most
         complex ML problem you've solved."

        Args:
            session_id: The interview session UUID
            repeated_topic: The topic that appeared multiple times
            mention_count: Number of times the topic was mentioned

        Returns:
            Dict with deep-dive question exploring the topic
        """
        session_id_str = str(session_id)
        logger.info(f"Generating deep-dive question for topic '{repeated_topic}' ({mention_count} mentions)")

        try:
            # Get context about how the topic was mentioned
            all_answers = get_all_answers(session_id_str)
            topic_contexts = []

            for answer in all_answers:
                answer_text = answer.get("user_answer", "").lower()
                if repeated_topic.lower() in answer_text:
                    topic_contexts.append(answer.get("user_answer", "")[:200])

            prompt = f"""Generate an interview question that dives deep into a topic the candidate is clearly passionate about.

            Topic: {repeated_topic}
            Times mentioned: {mention_count}
            Contexts where mentioned:
            {chr(10).join([f'- "{ctx}..."' for ctx in topic_contexts[:3]])}

            Generate a question that:
            1. Acknowledges their clear interest/expertise in this area
            2. Asks about a specific challenging aspect or achievement
            3. Invites them to share something they're proud of
            4. Goes beyond surface-level understanding

            Start with something like "You've mentioned {repeated_topic} several times..." or "I can see {repeated_topic} is important to you..."

            Return ONLY the question text, nothing else."""

            response = client.chat.completions.create(
                model=QUESTION_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an engaged interviewer who recognizes when candidates have passion for certain topics "
                                   "and gives them opportunities to shine by diving deeper into those areas."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=200
            )

            question_text = response.choices[0].message.content.strip()

            return {
                "question_text": question_text,
                "question_intent": "deep_expertise",
                "question_type": "deep_dive",
                "references_previous": True,
                "referenced_question_id": None,
                "context_used": f"Deep dive into '{repeated_topic}' (mentioned {mention_count} times)"
            }

        except Exception as e:
            logger.error(f"Error generating deep-dive question: {str(e)}")
            return {
                "question_text": f"You've mentioned {repeated_topic} several times. Tell me about your most challenging experience with it and how you handled it.",
                "question_intent": "deep_expertise",
                "question_type": "deep_dive",
                "references_previous": True,
                "referenced_question_id": None,
                "context_used": f"Fallback deep-dive for '{repeated_topic}'"
            }

    def _build_llm_prompt(
        self,
        conversation_summary: str,
        question_type: str,
        role: str,
        difficulty: str,
        specific_context: Dict[str, Any] = None
    ) -> str:
        """
        Build prompt for LLM to generate questions.

        Includes:
        - Full conversation history
        - Specific context (contradictions, topics, etc.)
        - Role requirements
        - Difficulty level
        - STAR format expectations

        Args:
            conversation_summary: Summary of conversation so far
            question_type: Type of question to generate
            role: Job role being interviewed for
            difficulty: Difficulty level
            specific_context: Additional context for specific question types

        Returns:
            Complete prompt string for LLM
        """
        difficulty_guidance = {
            "junior": "Ask foundational questions. Focus on learning potential, basic concepts, and enthusiasm.",
            "intermediate": "Ask questions that test practical experience. Expect specific examples and measurable outcomes.",
            "senior": "Ask questions about leadership, architecture decisions, mentoring, and strategic thinking."
        }

        question_type_guidance = {
            "standard": "Generate a new interview question that builds on the conversation naturally.",
            "follow_up": "Generate a follow-up question that probes deeper into the last answer.",
            "challenge": "Generate a tactful question to clarify an inconsistency.",
            "deep_dive": "Generate a question that explores a topic of expertise in depth.",
            "reference": "Generate a question that explicitly references a previous answer."
        }

        prompt_parts = [
            f"## Interview Context",
            f"Role: {role}" if role else "",
            f"Difficulty Level: {difficulty}" if difficulty else "",
            f"Difficulty Guidance: {difficulty_guidance.get(difficulty.lower(), '')}" if difficulty else "",
            "",
            f"## Conversation So Far",
            conversation_summary,
            "",
            f"## Task",
            question_type_guidance.get(question_type, question_type_guidance["standard"]),
            "",
            "## Requirements",
            "1. Question should be clear and concise (1-2 sentences)",
            "2. Question should invite STAR-format responses (Situation, Task, Action, Result)",
            "3. Question should be relevant to the role and conversation",
            "4. DO NOT repeat questions already asked",
            "5. Return ONLY the question text, nothing else"
        ]

        if specific_context:
            prompt_parts.extend([
                "",
                "## Additional Context",
                json.dumps(specific_context, indent=2)
            ])

        return "\n".join(filter(None, prompt_parts))

    async def _generate_opening_question(
        self,
        role: str,
        difficulty: str
    ) -> Dict[str, Any]:
        """Generate an opening question for the interview."""
        logger.info(f"Generating opening question for {role} ({difficulty})")

        prompt = f"""Generate an opening interview question for a {difficulty} {role} position.

        The question should:
        1. Be welcoming and set a positive tone
        2. Allow the candidate to introduce themselves through their experience
        3. Be open-ended enough to let them highlight their strengths
        4. Be appropriate for a {difficulty}-level candidate

        Return ONLY the question text, nothing else."""

        try:
            response = client.chat.completions.create(
                model=QUESTION_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a friendly, professional interviewer starting an interview."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=150
            )

            question_text = response.choices[0].message.content.strip()

            return {
                "question_text": question_text,
                "question_intent": "introduction",
                "question_type": "standard",
                "references_previous": False,
                "referenced_question_id": None,
                "context_used": "Opening question - no prior context"
            }

        except Exception as e:
            logger.error(f"Error generating opening question: {str(e)}")
            return {
                "question_text": f"Welcome! Let's start by having you tell me about your background and what interests you about this {role} position.",
                "question_intent": "introduction",
                "question_type": "standard",
                "references_previous": False,
                "referenced_question_id": None,
                "context_used": "Fallback opening question"
            }

    async def _generate_standard_question(
        self,
        session_id_str: str,
        conversation_summary: str,
        role: str,
        difficulty: str,
        current_question_number: int,
        specific_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate a standard contextual question."""
        logger.info(f"Generating standard question #{current_question_number}")

        # Determine question intent based on progression
        intents = ["technical_skills", "problem_solving", "behavioral", "situational", "leadership"]
        intent_index = (current_question_number - 1) % len(intents)
        target_intent = intents[intent_index]

        prompt = self._build_llm_prompt(
            conversation_summary=conversation_summary,
            question_type="standard",
            role=role,
            difficulty=difficulty,
            specific_context={
                "target_intent": target_intent,
                "question_number": current_question_number,
                **specific_context
            }
        )

        try:
            response = client.chat.completions.create(
                model=QUESTION_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": f"You are an expert interviewer for {role} positions. "
                                   f"Generate questions that assess {target_intent.replace('_', ' ')}."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=200
            )

            question_text = response.choices[0].message.content.strip()

            return {
                "question_text": question_text,
                "question_intent": target_intent,
                "question_type": "standard",
                "references_previous": bool(specific_context.get("related_answers")),
                "referenced_question_id": None,
                "context_used": f"Standard Q#{current_question_number} targeting {target_intent}"
            }

        except Exception as e:
            logger.error(f"Error generating standard question: {str(e)}")
            return await self._generate_fallback_question(role, difficulty)

    async def _generate_fallback_question(
        self,
        role: str,
        difficulty: str
    ) -> Dict[str, Any]:
        """Generate a safe fallback question when other methods fail."""
        fallback_questions = [
            "Tell me about a challenging project you've worked on and how you handled it.",
            "Describe a situation where you had to learn something new quickly.",
            "Can you share an example of how you've collaborated with a team to achieve a goal?",
            "What's a technical problem you've solved that you're particularly proud of?",
            "Tell me about a time when you had to make a difficult decision at work."
        ]

        import random
        question = random.choice(fallback_questions)

        return {
            "question_text": question,
            "question_intent": "behavioral",
            "question_type": "standard",
            "references_previous": False,
            "referenced_question_id": None,
            "context_used": "Fallback question due to error",
            "source": "fallback"
        }

    def _format_bank_question(
        self,
        question_text: str,
        intent: str,
        question_type: str
    ) -> Dict[str, Any]:
        """
        Format a question from the bank into the standard response format.

        Args:
            question_text: The question text from the bank
            intent: The question intent category
            question_type: The type of question (standard, follow_up, etc.)

        Returns:
            Dict in the standard question response format
        """
        return {
            "question_text": question_text,
            "question_intent": intent,
            "question_type": question_type,
            "references_previous": False,
            "referenced_question_id": None,
            "context_used": "Selected from curated question bank",
            "source": "question_bank"
        }

    async def _generate_topic_question(
        self,
        session_id_str: str,
        topic: str
    ) -> Dict[str, Any]:
        """Generate a question about a specific topic without referencing a specific answer."""
        prompt = f"""Generate an interview question about: {topic}

        The question should:
        1. Explore the candidate's experience with {topic}
        2. Invite specific examples
        3. Be open-ended

        Return ONLY the question text."""

        try:
            response = client.chat.completions.create(
                model=QUESTION_MODEL,
                messages=[
                    {"role": "system", "content": "You are an expert interviewer."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=150
            )

            question_text = response.choices[0].message.content.strip()

            return {
                "question_text": question_text,
                "question_intent": "technical_skills",
                "question_type": "reference",
                "references_previous": False,
                "referenced_question_id": None,
                "context_used": f"Topic question about '{topic}'"
            }

        except Exception as e:
            logger.error(f"Error generating topic question: {str(e)}")
            return {
                "question_text": f"Tell me about your experience with {topic}.",
                "question_intent": "technical_skills",
                "question_type": "reference",
                "references_previous": False,
                "referenced_question_id": None,
                "context_used": f"Fallback topic question about '{topic}'"
            }

    def _determine_question_type(
        self,
        past_answers: List[Dict],
        repeated_topics: Dict[str, int],
        contradictions: List[Dict],
        current_question_number: int
    ) -> tuple[str, Dict[str, Any]]:
        """
        Determine what type of question to ask based on conversation analysis.

        Returns:
            Tuple of (question_type, specific_context)
        """
        # Priority 1: Address contradictions (but not too frequently)
        if contradictions and current_question_number % 3 == 0:
            return "contradiction_challenge", {"contradiction": contradictions[0]}

        # Priority 2: Deep dive into passionate topics (after enough context)
        if repeated_topics and current_question_number >= 4:
            top_topic = max(repeated_topics.items(), key=lambda x: x[1])
            if top_topic[1] >= 3:  # Mentioned at least 3 times
                return "deep_dive", {"topic": top_topic[0], "count": top_topic[1]}

        # Priority 3: Follow-up on incomplete answers
        if past_answers:
            last_answer = past_answers[-1].get("user_answer", "")
            if len(last_answer.split()) < 50:  # Short answer might need follow-up
                return "follow_up", {"last_answer": last_answer}

        # Default: Standard contextual question
        return "standard", {"related_answers": past_answers[-3:] if past_answers else []}

    async def _analyze_answer_completeness(
        self,
        answer: str
    ) -> Dict[str, Any]:
        """
        Analyze an answer for STAR format completeness and depth.

        Returns analysis including missing elements and suggestions.
        """
        word_count = len(answer.split())

        # Simple heuristics for STAR detection
        has_situation = any(word in answer.lower() for word in ["when", "while", "during", "at my"])
        has_task = any(word in answer.lower() for word in ["needed to", "had to", "responsible", "goal", "objective"])
        has_action = any(word in answer.lower() for word in ["i did", "i created", "i built", "i led", "i developed", "implemented"])
        has_result = any(word in answer.lower() for word in ["resulted", "achieved", "improved", "increased", "decreased", "outcome"])

        missing_elements = []
        if not has_situation:
            missing_elements.append("situation/context")
        if not has_task:
            missing_elements.append("task/goal")
        if not has_action:
            missing_elements.append("specific actions")
        if not has_result:
            missing_elements.append("measurable results")

        return {
            "word_count": word_count,
            "is_brief": word_count < 50,
            "is_detailed": word_count > 150,
            "has_star_elements": {
                "situation": has_situation,
                "task": has_task,
                "action": has_action,
                "result": has_result
            },
            "missing_elements": missing_elements,
            "completeness_score": sum([has_situation, has_task, has_action, has_result]) / 4
        }

    def _get_follow_up_instruction(
        self,
        analysis: Dict[str, Any]
    ) -> str:
        """Get specific instruction for follow-up based on analysis."""
        missing = analysis.get("missing_elements", [])

        if "measurable results" in missing:
            return "Ask about specific outcomes, metrics, or impact of their actions."
        elif "specific actions" in missing:
            return "Ask about the specific steps they took or decisions they made."
        elif "situation/context" in missing:
            return "Ask for more context about the situation or challenge they faced."
        elif "task/goal" in missing:
            return "Ask about what they were trying to achieve or their specific responsibilities."
        elif analysis.get("is_brief"):
            return "Ask them to elaborate with more specific details and examples."
        else:
            return "Ask a probing question to understand their thought process better."


# Convenience function for direct usage
async def generate_intelligent_question(
    session_id: UUID,
    current_question_number: int,
    role: str,
    difficulty: str
) -> Dict[str, Any]:
    """
    Convenience function to generate an intelligent question.

    Creates an IntelligentQuestionGenerator instance and generates the next question.
    """
    generator = IntelligentQuestionGenerator()
    return await generator.generate_next_question(
        session_id,
        current_question_number,
        role,
        difficulty
    )
