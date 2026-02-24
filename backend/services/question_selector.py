# backend/services/question_selector.py
"""
Question Selector Service

Selects appropriate questions from the curated question bank based on role,
difficulty, and intent. Ensures no duplicate questions are asked within a session.

The question bank contains real interview questions extracted from actual
interview transcripts, providing high-quality, battle-tested questions.
"""

import json
import random
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class QuestionSelector:
    """
    Selects questions from the pre-built question bank.

    Uses real interview questions as a foundation for generating
    high-quality, relevant interview questions. Provides methods to:
    - Get questions by role, difficulty, and intent
    - Get follow-up templates
    - Get deep-dive templates
    - Get interviewer comments
    - Search for questions by topic

    Attributes:
        question_bank_path: Path to the question_bank.json file
        question_bank: Loaded question bank data
    """

    # Role normalization mappings
    ROLE_MAPPINGS = {
        "software engineer": "software_engineer",
        "software developer": "software_engineer",
        "backend engineer": "software_engineer",
        "backend developer": "software_engineer",
        "frontend engineer": "software_engineer",
        "frontend developer": "software_engineer",
        "full stack engineer": "software_engineer",
        "full stack developer": "software_engineer",
        "fullstack": "software_engineer",
        "python developer": "software_engineer",
        "python engineer": "software_engineer",
        "java developer": "software_engineer",
        "java engineer": "software_engineer",
        "nodejs developer": "software_engineer",
        "react developer": "software_engineer",
        "aws developer": "software_engineer",
        "aws engineer": "software_engineer",
        "cloud engineer": "software_engineer",
        "data scientist": "data_scientist",
        "ml engineer": "data_scientist",
        "machine learning engineer": "data_scientist",
        "ai engineer": "data_scientist",
        "data engineer": "data_engineer",
        "analytics engineer": "data_engineer",
        "devops engineer": "devops_engineer",
        "devops": "devops_engineer",
        "sre": "devops_engineer",
        "site reliability engineer": "devops_engineer",
        "platform engineer": "devops_engineer",
    }

    # Difficulty normalization mappings
    DIFFICULTY_MAPPINGS = {
        "easy": "easy",
        "junior": "easy",
        "intern": "easy",
        "entry": "easy",
        "entry level": "easy",
        "beginner": "easy",
        "medium": "medium",
        "intermediate": "medium",
        "mid": "medium",
        "mid level": "medium",
        "associate": "medium",
        "hard": "hard",
        "senior": "hard",
        "lead": "hard",
        "principal": "hard",
        "staff": "hard",
        "advanced": "hard",
        "expert": "hard",
    }

    # Intent normalization mappings
    INTENT_MAPPINGS = {
        "introduction": "introduction",
        "intro": "introduction",
        "self_introduction": "introduction",
        "background": "background",
        "education": "background",
        "motivation": "motivation",
        "career_goals": "career_goals",
        "goals": "career_goals",
        "technical": "technical_skills",
        "technical_skills": "technical_skills",
        "tech": "technical_skills",
        "coding": "technical_skills",
        "programming": "technical_skills",
        "problem_solving": "problem_solving",
        "problem solving": "problem_solving",
        "algorithms": "problem_solving",
        "behavioral": "behavioral",
        "behaviour": "behavioral",
        "soft_skills": "behavioral",
        "situational": "scenario_based",
        "scenario": "scenario_based",
        "scenario_based": "scenario_based",
        "hypothetical": "scenario_based",
        "system_design": "system_design",
        "system design": "system_design",
        "design": "system_design",
        "architecture": "architecture",
        "architectural": "architecture",
        "complex_scenarios": "complex_scenarios",
        "advanced": "complex_scenarios",
        "leadership": "leadership",
        "management": "leadership",
        "team_lead": "leadership",
        "work_experience": "work_experience",
        "experience": "work_experience",
        "projects": "work_experience",
    }

    def __init__(self, question_bank_path: str = None):
        """
        Initialize the QuestionSelector with a question bank.

        Args:
            question_bank_path: Path to the question_bank.json file.
                              Defaults to backend/data/question_bank.json
        """
        if question_bank_path is None:
            # Default path relative to this file
            base_path = Path(__file__).parent.parent
            question_bank_path = base_path / "data" / "question_bank.json"

        self.question_bank_path = Path(question_bank_path)
        self.question_bank: Dict[str, Any] = {}
        self._load_question_bank()

        logger.info("QuestionSelector initialized")

    def _load_question_bank(self) -> None:
        """Load the question bank from JSON file."""
        try:
            if self.question_bank_path.exists():
                with open(self.question_bank_path, 'r', encoding='utf-8') as f:
                    self.question_bank = json.load(f)

                # Log statistics
                metadata = self.question_bank.get("metadata", {})
                total = metadata.get("total_questions", "unknown")
                logger.info(f"Loaded question bank from {self.question_bank_path}")
                logger.info(f"Question bank contains {total} questions")
            else:
                logger.warning(f"Question bank not found at {self.question_bank_path}")
                self.question_bank = {}
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in question bank: {e}")
            self.question_bank = {}
        except Exception as e:
            logger.error(f"Error loading question bank: {e}")
            self.question_bank = {}

    def reload_question_bank(self) -> bool:
        """
        Reload the question bank from disk.

        Useful when the question bank has been updated.

        Returns:
            True if reload successful, False otherwise
        """
        try:
            self._load_question_bank()
            return bool(self.question_bank)
        except Exception as e:
            logger.error(f"Failed to reload question bank: {e}")
            return False

    def get_question(
        self,
        role: str,
        difficulty: str,
        intent: str,
        used_questions: List[str] = None
    ) -> Optional[str]:
        """
        Get an appropriate question from the bank.

        Tries to find a question matching the exact criteria first,
        then falls back to broader searches if no match found.

        Args:
            role: Job role (e.g., "software_engineer", "Software Engineer")
            difficulty: Difficulty level ("easy", "medium", "hard", "junior", "senior")
            intent: Question intent/category (e.g., "technical_skills", "behavioral")
            used_questions: List of questions already asked (to avoid repetition)

        Returns:
            A question string, or None if no suitable question found

        Example:
            >>> selector = QuestionSelector()
            >>> question = selector.get_question(
            ...     role="Software Engineer",
            ...     difficulty="medium",
            ...     intent="technical_skills",
            ...     used_questions=["Have you worked with AWS?"]
            ... )
        """
        used_questions = used_questions or []

        # Normalize inputs
        role_key = self._normalize_role(role)
        difficulty_key = self._normalize_difficulty(difficulty)
        intent_key = self._normalize_intent(intent)

        logger.debug(f"Looking for question: {role_key}/{difficulty_key}/{intent_key}")

        # Try to get questions from the bank
        questions = self._get_questions_for_category(role_key, difficulty_key, intent_key)

        if not questions:
            # Try fallback categories
            questions = self._get_fallback_questions(role_key, difficulty_key, intent_key)

        if not questions:
            logger.info(f"No questions found for {role_key}/{difficulty_key}/{intent_key}")
            return None

        # Filter out already-used questions (case-insensitive comparison)
        used_lower = [q.lower().strip() for q in used_questions]
        available = [q for q in questions if q.lower().strip() not in used_lower]

        if not available:
            logger.info(f"All questions used for {role_key}/{difficulty_key}/{intent_key}")
            return None

        # Return a random question from available ones
        selected = random.choice(available)
        logger.info(f"Selected question from bank: {selected[:60]}...")
        return selected

    def get_follow_up_template(
        self,
        missing_elements: List[str] = None
    ) -> Optional[str]:
        """
        Get a follow-up question template.

        Args:
            missing_elements: What's missing from the answer (for context).
                            Can include: "specific_actions", "results",
                            "your_role", "details", "examples"

        Returns:
            A follow-up question template, or None if not found

        Example:
            >>> template = selector.get_follow_up_template(
            ...     missing_elements=["specific_actions", "results"]
            ... )
            >>> print(template)
            "Can you walk me through the specific steps you took?"
        """
        templates = self.question_bank.get("follow_up_templates", [])

        if not templates:
            logger.warning("No follow-up templates in question bank")
            return None

        # If missing elements specified, try to find a relevant template
        if missing_elements:
            missing_lower = [m.lower() for m in missing_elements]

            # Priority keywords for each missing element type
            priority_keywords = {
                "specific_actions": ["steps", "specific", "walk me through"],
                "results": ["results", "measurable", "outcome"],
                "your_role": ["your", "personally", "own", "contribution"],
                "details": ["elaborate", "more", "specific"],
                "examples": ["example", "instance", "time when"],
            }

            # Try to find a matching template
            for missing in missing_lower:
                keywords = priority_keywords.get(missing, [])
                for template in templates:
                    template_lower = template.lower()
                    if any(kw in template_lower for kw in keywords):
                        return template

        # Return random template if no specific match
        return random.choice(templates)

    def get_reference_template(self, topic: str = None) -> Optional[str]:
        """
        Get a template for referencing a previous answer.

        Args:
            topic: The topic being referenced (optional)

        Returns:
            A reference question template with {topic} placeholder
        """
        templates = self.question_bank.get("reference_templates", [])

        if not templates:
            logger.warning("No reference templates in question bank")
            return None

        return random.choice(templates)

    def get_deep_dive_template(self, topic: str = None) -> Optional[str]:
        """
        Get a deep-dive question template.

        Args:
            topic: The topic to dive deep into (optional)

        Returns:
            A deep-dive question template
        """
        templates = self.question_bank.get("deep_dive_templates", [])

        if not templates:
            logger.warning("No deep-dive templates in question bank")
            return None

        return random.choice(templates)

    def get_contradiction_template(self) -> Optional[str]:
        """
        Get a template for addressing contradictions.

        Returns:
            A contradiction clarification template
        """
        templates = self.question_bank.get("contradiction_templates", [])

        if not templates:
            logger.warning("No contradiction templates in question bank")
            return None

        return random.choice(templates)

    def get_interviewer_comment(
        self,
        comment_type: str = "acknowledgment"
    ) -> Optional[str]:
        """
        Get a natural interviewer comment.

        Args:
            comment_type: Type of comment to get. Options:
                - "acknowledgment": Positive response to good answer
                - "transition": Moving to next topic
                - "encouragement": Asking for more detail
                - "closing": Wrapping up the interview
                - "rapport_building": Building connection

        Returns:
            A natural interviewer comment, or None if not found

        Example:
            >>> comment = selector.get_interviewer_comment("acknowledgment")
            >>> print(comment)
            "That's great."
        """
        comments = self.question_bank.get("interviewer_comments", {})
        type_comments = comments.get(comment_type, [])

        if not type_comments:
            # Try fallback to acknowledgment
            type_comments = comments.get("acknowledgment", [])

        if not type_comments:
            logger.warning(f"No interviewer comments of type '{comment_type}'")
            return None

        return random.choice(type_comments)

    def get_similar_questions(
        self,
        topic: str,
        count: int = 3,
        exclude: List[str] = None
    ) -> List[str]:
        """
        Get questions related to a specific topic.

        Searches through all questions in the bank for those containing
        the topic keyword. Useful for finding variations or related questions.

        Args:
            topic: Topic to search for (e.g., "AWS", "Python", "leadership")
            count: Maximum number of questions to return
            exclude: Questions to exclude from results

        Returns:
            List of questions containing the topic (may be empty)

        Example:
            >>> questions = selector.get_similar_questions("Lambda", count=5)
            >>> for q in questions:
            ...     print(q)
        """
        exclude = exclude or []
        exclude_lower = [q.lower().strip() for q in exclude]
        topic_lower = topic.lower()
        matching = []

        # Search through all role data
        for role_key, role_data in self.question_bank.items():
            if not isinstance(role_data, dict) or role_key in ["metadata", "follow_up_templates",
                "reference_templates", "deep_dive_templates", "contradiction_templates",
                "interviewer_comments"]:
                continue

            # Search through all difficulty levels
            for difficulty_data in role_data.values():
                if not isinstance(difficulty_data, dict):
                    continue

                # Search through all intent categories
                for intent_questions in difficulty_data.values():
                    if not isinstance(intent_questions, list):
                        continue

                    for question in intent_questions:
                        if topic_lower in question.lower():
                            if question.lower().strip() not in exclude_lower:
                                matching.append(question)

        # Shuffle and return requested count
        random.shuffle(matching)
        return matching[:count]

    def get_questions_by_intent(
        self,
        intent: str,
        difficulty: str = None,
        role: str = None,
        count: int = 5
    ) -> List[str]:
        """
        Get all questions for a specific intent.

        Args:
            intent: Question intent (e.g., "technical_skills", "behavioral")
            difficulty: Optional difficulty filter
            role: Optional role filter
            count: Maximum questions to return

        Returns:
            List of questions matching the criteria
        """
        intent_key = self._normalize_intent(intent)
        difficulty_key = self._normalize_difficulty(difficulty) if difficulty else None
        role_key = self._normalize_role(role) if role else None
        matching = []

        for rk, role_data in self.question_bank.items():
            if not isinstance(role_data, dict) or rk in ["metadata", "follow_up_templates",
                "reference_templates", "deep_dive_templates", "contradiction_templates",
                "interviewer_comments"]:
                continue

            # Skip if role filter doesn't match
            if role_key and rk != role_key:
                continue

            for dk, diff_data in role_data.items():
                # Skip if difficulty filter doesn't match
                if difficulty_key and dk != difficulty_key:
                    continue

                if not isinstance(diff_data, dict):
                    continue

                questions = diff_data.get(intent_key, [])
                matching.extend(questions)

        random.shuffle(matching)
        return matching[:count]

    def get_all_intents(self, role: str = None, difficulty: str = None) -> List[str]:
        """
        Get all available intent categories.

        Args:
            role: Optional role filter
            difficulty: Optional difficulty filter

        Returns:
            List of intent category names
        """
        intents = set()
        role_key = self._normalize_role(role) if role else None
        difficulty_key = self._normalize_difficulty(difficulty) if difficulty else None

        for rk, role_data in self.question_bank.items():
            if not isinstance(role_data, dict) or rk.startswith(("metadata", "follow_up",
                "reference", "deep_dive", "contradiction", "interviewer")):
                continue

            if role_key and rk != role_key:
                continue

            for dk, diff_data in role_data.items():
                if difficulty_key and dk != difficulty_key:
                    continue

                if isinstance(diff_data, dict):
                    intents.update(diff_data.keys())

        return sorted(list(intents))

    def get_question_count(
        self,
        role: str = None,
        difficulty: str = None,
        intent: str = None
    ) -> int:
        """
        Get the count of questions matching criteria.

        Args:
            role: Optional role filter
            difficulty: Optional difficulty filter
            intent: Optional intent filter

        Returns:
            Number of matching questions
        """
        count = 0
        role_key = self._normalize_role(role) if role else None
        difficulty_key = self._normalize_difficulty(difficulty) if difficulty else None
        intent_key = self._normalize_intent(intent) if intent else None

        for rk, role_data in self.question_bank.items():
            if not isinstance(role_data, dict) or rk.startswith(("metadata", "follow_up",
                "reference", "deep_dive", "contradiction", "interviewer")):
                continue

            if role_key and rk != role_key:
                continue

            for dk, diff_data in role_data.items():
                if difficulty_key and dk != difficulty_key:
                    continue

                if not isinstance(diff_data, dict):
                    continue

                for ik, questions in diff_data.items():
                    if intent_key and ik != intent_key:
                        continue

                    if isinstance(questions, list):
                        count += len(questions)

        return count

    def _normalize_role(self, role: str) -> str:
        """Normalize role name to match question bank keys."""
        if not role:
            return "software_engineer"

        role_lower = role.lower().strip()

        # Direct mapping
        if role_lower in self.ROLE_MAPPINGS:
            return self.ROLE_MAPPINGS[role_lower]

        # Partial matching
        for key, value in self.ROLE_MAPPINGS.items():
            if key in role_lower or role_lower in key:
                return value

        # Check if role exists in question bank
        role_snake = role_lower.replace(" ", "_").replace("-", "_")
        if role_snake in self.question_bank:
            return role_snake

        return "software_engineer"  # Default fallback

    def _normalize_difficulty(self, difficulty: str) -> str:
        """Normalize difficulty to easy/medium/hard."""
        if not difficulty:
            return "medium"

        diff_lower = difficulty.lower().strip()
        return self.DIFFICULTY_MAPPINGS.get(diff_lower, "medium")

    def _normalize_intent(self, intent: str) -> str:
        """Normalize intent to match question bank keys."""
        if not intent:
            return "technical_skills"

        intent_lower = intent.lower().strip().replace("-", "_")

        # Direct mapping
        if intent_lower in self.INTENT_MAPPINGS:
            return self.INTENT_MAPPINGS[intent_lower]

        # Already in snake_case format
        if "_" in intent_lower:
            return intent_lower

        # Convert to snake_case
        return intent_lower.replace(" ", "_")

    def _get_questions_for_category(
        self,
        role: str,
        difficulty: str,
        intent: str
    ) -> List[str]:
        """Get questions for a specific category combination."""
        try:
            questions = self.question_bank.get(role, {}).get(difficulty, {}).get(intent, [])
            return questions if isinstance(questions, list) else []
        except Exception:
            return []

    def _get_fallback_questions(
        self,
        role: str,
        difficulty: str,
        intent: str
    ) -> List[str]:
        """Get fallback questions when exact match not found."""
        questions = []

        # Strategy 1: Same role and difficulty, different intent
        role_data = self.question_bank.get(role, {})
        diff_data = role_data.get(difficulty, {})

        # Collect from all intents at same difficulty
        for intent_questions in diff_data.values():
            if isinstance(intent_questions, list):
                questions.extend(intent_questions)

        if questions:
            logger.debug(f"Fallback: found {len(questions)} questions at {role}/{difficulty}")
            return questions

        # Strategy 2: Same role, adjacent difficulty
        adjacent = {"easy": ["medium"], "medium": ["easy", "hard"], "hard": ["medium"]}
        for adj_diff in adjacent.get(difficulty, []):
            adj_data = role_data.get(adj_diff, {})
            intent_questions = adj_data.get(intent, [])
            if intent_questions:
                logger.debug(f"Fallback: found questions at {role}/{adj_diff}/{intent}")
                return intent_questions

        # Strategy 3: Default role (software_engineer)
        if role != "software_engineer":
            return self._get_questions_for_category("software_engineer", difficulty, intent)

        return []


# Singleton instance for easy access
_selector_instance: Optional[QuestionSelector] = None


def get_question_selector() -> QuestionSelector:
    """
    Get or create the singleton QuestionSelector instance.

    Returns:
        The shared QuestionSelector instance

    Example:
        >>> selector = get_question_selector()
        >>> question = selector.get_question("Software Engineer", "medium", "technical_skills")
    """
    global _selector_instance
    if _selector_instance is None:
        _selector_instance = QuestionSelector()
    return _selector_instance


def reset_question_selector() -> None:
    """
    Reset the singleton instance.

    Useful for testing or when question bank is updated.
    """
    global _selector_instance
    _selector_instance = None
