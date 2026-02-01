"""
Test suite for Conversation Context Builder (Phase 1.2: Memory System)

This module tests the conversation context service to ensure:
- Conversation summaries are built correctly from answers
- Topics are extracted accurately from answers
- Recent context retrieves the correct number of answers
- Repeated topics are detected and counted properly
- Empty sessions are handled gracefully

Run tests with: pytest backend/tests/test_conversation_context.py -v
"""

import pytest
import json
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta, timezone
import sys
import os

# Add backend directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.conversation_context import (
    build_conversation_summary,
    extract_topics,
    get_recent_context,
    detect_repeated_topics
)


# ============================================================================
# FIXTURES - Reusable test setup components
# ============================================================================

@pytest.fixture
def mock_answer_factory():
    """
    Factory fixture to create mock answer objects with customizable data.
    Returns a function that creates mock answers.
    """
    def create_answer(
        answer_id: str,
        question_id: int,
        question_text: str,
        user_answer: str,
        question_intent: str = "technical",
        role: str = "Tech Lead",
        timestamp_offset_minutes: int = 0
    ):
        mock_answer = MagicMock()
        mock_answer.id = answer_id
        mock_answer.question_id = question_id
        mock_answer.question_text = question_text
        mock_answer.user_answer = user_answer
        mock_answer.question_intent = question_intent
        mock_answer.role = role
        mock_answer.answer_timestamp = datetime.now(timezone.utc) + timedelta(minutes=timestamp_offset_minutes)
        return mock_answer

    return create_answer


@pytest.fixture
def three_sample_answers(mock_answer_factory):
    """
    Creates 3 sample answers for testing conversation summary.
    Covers different question types and interviewers.
    """
    return [
        mock_answer_factory(
            answer_id="ans-1",
            question_id=1,
            question_text="Tell me about your experience with Python",
            user_answer="I have been working with Python for 5 years, building web applications with Django and FastAPI.",
            question_intent="Technical Skills",
            role="Tech Lead",
            timestamp_offset_minutes=0
        ),
        mock_answer_factory(
            answer_id="ans-2",
            question_id=2,
            question_text="Describe a challenging project you worked on",
            user_answer="I led a team to migrate our monolithic application to microservices using Docker and Kubernetes.",
            question_intent="Problem Solving",
            role="Manager",
            timestamp_offset_minutes=5
        ),
        mock_answer_factory(
            answer_id="ans-3",
            question_id=3,
            question_text="How do you handle machine learning projects?",
            user_answer="I follow a structured approach with data preprocessing, model training, and continuous evaluation using MLflow.",
            question_intent="Technical Skills",
            role="Tech Lead",
            timestamp_offset_minutes=10
        )
    ]


@pytest.fixture
def ten_sample_answers(mock_answer_factory):
    """
    Creates 10 sample answers for testing recent context retrieval.
    Each answer has a unique timestamp to ensure proper ordering.
    """
    answers = []
    for i in range(1, 11):
        answers.append(
            mock_answer_factory(
                answer_id=f"ans-{i}",
                question_id=i,
                question_text=f"Question number {i}",
                user_answer=f"This is answer number {i} with some content.",
                question_intent="General",
                role="Interviewer",
                timestamp_offset_minutes=i * 2  # 2, 4, 6, ... 20 minutes
            )
        )
    return answers


@pytest.fixture
def answers_with_repeated_python_topic(mock_answer_factory):
    """
    Creates 5 answers where 3 of them mention Python.
    Used to test repeated topic detection.
    """
    return [
        mock_answer_factory(
            answer_id="ans-1",
            question_id=1,
            question_text="What programming languages do you know?",
            user_answer="I primarily work with Python and have built several APIs with it.",
            timestamp_offset_minutes=0
        ),
        mock_answer_factory(
            answer_id="ans-2",
            question_id=2,
            question_text="Tell me about your database experience",
            user_answer="I have worked with PostgreSQL and MongoDB for various projects.",
            timestamp_offset_minutes=5
        ),
        mock_answer_factory(
            answer_id="ans-3",
            question_id=3,
            question_text="How do you approach testing?",
            user_answer="I use pytest for Python applications and write comprehensive unit tests.",
            timestamp_offset_minutes=10
        ),
        mock_answer_factory(
            answer_id="ans-4",
            question_id=4,
            question_text="Describe your DevOps experience",
            user_answer="I work with Docker and CI/CD pipelines using GitHub Actions.",
            timestamp_offset_minutes=15
        ),
        mock_answer_factory(
            answer_id="ans-5",
            question_id=5,
            question_text="What frameworks have you used?",
            user_answer="In Python, I've extensively used Django and FastAPI for web development.",
            timestamp_offset_minutes=20
        )
    ]


@pytest.fixture
def mock_openai_topics_response():
    """
    Creates a mock OpenAI response for topic extraction.
    """
    def create_response(topics_list):
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content=json.dumps(topics_list)))
        ]
        return mock_response

    return create_response


# ============================================================================
# TEST CASES - build_conversation_summary
# ============================================================================

class TestBuildConversationSummary:
    """Tests for the build_conversation_summary function."""

    def test_build_conversation_summary_with_multiple_answers(self, three_sample_answers):
        """
        Test that build_conversation_summary includes all Q&A pairs
        and formats them correctly with metadata.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            # Setup mock database session
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = three_sample_answers

            # Call the function
            result = build_conversation_summary("test-session-123")

            # Assertions - check header
            assert "=== Interview Context ===" in result, "Should include header"

            # Check all 3 answers are included
            assert "Q1" in result, "Should include Q1"
            assert "Q2" in result, "Should include Q2"
            assert "Q3" in result, "Should include Q3"

            # Check question texts are included
            assert "Tell me about your experience with Python" in result
            assert "Describe a challenging project" in result
            assert "How do you handle machine learning" in result

            # Check answers are included
            assert "5 years" in result
            assert "microservices" in result
            assert "MLflow" in result

            # Check metadata formatting (intent - role)
            assert "Technical Skills - Tech Lead" in result
            assert "Problem Solving - Manager" in result

    def test_build_conversation_summary_empty_session(self):
        """
        Test that empty session returns empty string.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = []  # No answers

            result = build_conversation_summary("empty-session")

            assert result == "", "Empty session should return empty string"

    def test_build_conversation_summary_preserves_order(self, three_sample_answers):
        """
        Test that answers are in chronological order (Q1 before Q2 before Q3).
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = three_sample_answers

            result = build_conversation_summary("test-session")

            # Find positions of Q1, Q2, Q3 in the result
            q1_pos = result.find("Q1")
            q2_pos = result.find("Q2")
            q3_pos = result.find("Q3")

            assert q1_pos < q2_pos < q3_pos, "Answers should be in chronological order"


# ============================================================================
# TEST CASES - extract_topics
# ============================================================================

class TestExtractTopics:
    """Tests for the extract_topics function."""

    def test_extract_topics_from_answers(self, three_sample_answers, mock_openai_topics_response):
        """
        Test that extract_topics returns topics mentioned in answers.
        Answers mention Python, Django, Machine Learning.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = three_sample_answers

            # Mock OpenAI response with expected topics
            expected_topics = ["Python", "Django", "Machine Learning", "microservices", "Docker"]

            with patch('services.conversation_context.client') as mock_client:
                mock_client.chat.completions.create.return_value = mock_openai_topics_response(expected_topics)

                result = extract_topics("test-session")

                # Assertions
                assert isinstance(result, list), "Result should be a list"
                assert "Python" in result, "Should include Python"
                assert "Django" in result, "Should include Django"
                assert "Machine Learning" in result, "Should include Machine Learning"

    def test_extract_topics_empty_session(self):
        """
        Test that empty session returns empty list without calling OpenAI.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = []

            with patch('services.conversation_context.client') as mock_client:
                result = extract_topics("empty-session")

                assert result == [], "Empty session should return empty list"
                mock_client.chat.completions.create.assert_not_called()

    def test_extract_topics_handles_api_error(self, three_sample_answers):
        """
        Test that API errors are handled gracefully.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = three_sample_answers

            with patch('services.conversation_context.client') as mock_client:
                mock_client.chat.completions.create.side_effect = Exception("API Error")

                result = extract_topics("test-session")

                assert result == [], "Should return empty list on API error"

    def test_extract_topics_handles_markdown_response(self, three_sample_answers):
        """
        Test that markdown-wrapped JSON responses are parsed correctly.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = three_sample_answers

            # Mock response with markdown code block
            mock_response = MagicMock()
            mock_response.choices = [
                MagicMock(message=MagicMock(content='```json\n["Python", "API"]\n```'))
            ]

            with patch('services.conversation_context.client') as mock_client:
                mock_client.chat.completions.create.return_value = mock_response

                result = extract_topics("test-session")

                assert "Python" in result
                assert "API" in result


# ============================================================================
# TEST CASES - get_recent_context
# ============================================================================

class TestGetRecentContext:
    """Tests for the get_recent_context function."""

    def test_get_recent_context_last_3_answers(self, ten_sample_answers):
        """
        Test that get_recent_context returns exactly the last 3 answers
        when num_answers=3, and in correct order (most recent last).
        """
        # Get only the last 3 answers (simulating what the DB query would return)
        last_3_answers = ten_sample_answers[-3:]  # answers 8, 9, 10

        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            # Note: The function fetches in desc order and reverses
            mock_session.exec.return_value.all.return_value = list(reversed(last_3_answers))

            result = get_recent_context("test-session", num_answers=3)

            # Assertions - check header
            assert "=== Recent Discussion ===" in result

            # Check that answers 8, 9, 10 are included
            assert "Question number 8" in result
            assert "Question number 9" in result
            assert "Question number 10" in result

            # Check that earlier answers are NOT included
            # Note: We check for "Q: Question number 7" to avoid substring match issues
            # (e.g., "Question number 1" would match "Question number 10")
            assert "Q: Question number 7" not in result
            assert "Q: Question number 1\n" not in result

            # Check ordering labels
            assert "[Previous]" in result
            assert "[Most Recent]" in result

            # Check that [Most Recent] appears after [Previous]
            most_recent_pos = result.rfind("[Most Recent]")
            previous_pos = result.find("[Previous]")
            assert previous_pos < most_recent_pos, "Most recent should appear last"

    def test_get_recent_context_empty_session(self):
        """
        Test that empty session returns empty string.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = []

            result = get_recent_context("empty-session", num_answers=3)

            assert result == "", "Empty session should return empty string"

    def test_get_recent_context_fewer_answers_than_requested(self, mock_answer_factory):
        """
        Test behavior when session has fewer answers than requested.
        """
        # Only 2 answers available
        two_answers = [
            mock_answer_factory("ans-1", 1, "Q1?", "A1", timestamp_offset_minutes=0),
            mock_answer_factory("ans-2", 2, "Q2?", "A2", timestamp_offset_minutes=5)
        ]

        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = list(reversed(two_answers))

            result = get_recent_context("test-session", num_answers=5)  # Request 5

            # Should return all 2 available answers
            assert "Q1?" in result
            assert "Q2?" in result


# ============================================================================
# TEST CASES - detect_repeated_topics
# ============================================================================

class TestDetectRepeatedTopics:
    """Tests for the detect_repeated_topics function."""

    def test_detect_repeated_topics(self, answers_with_repeated_python_topic, mock_openai_topics_response):
        """
        Test that topics mentioned multiple times are detected and counted.
        Python is mentioned in answers 1, 3, and 5.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = answers_with_repeated_python_topic

            with patch('services.conversation_context.client') as mock_client:
                # Setup mock responses for each answer
                mock_client.chat.completions.create.side_effect = [
                    mock_openai_topics_response(["python", "api"]),           # Answer 1
                    mock_openai_topics_response(["postgresql", "mongodb"]),   # Answer 2
                    mock_openai_topics_response(["python", "pytest"]),        # Answer 3
                    mock_openai_topics_response(["docker", "ci/cd"]),         # Answer 4
                    mock_openai_topics_response(["python", "django", "fastapi"])  # Answer 5
                ]

                result = detect_repeated_topics("test-session")

                # Assertions
                assert isinstance(result, dict), "Result should be a dictionary"
                assert "python" in result, "Python should be detected as repeated"
                assert result["python"] == 3, f"Python should be mentioned 3 times, got {result.get('python')}"

                # Topics mentioned only once should NOT be in the result
                assert "postgresql" not in result, "Single-mention topics should not be included"
                assert "mongodb" not in result

    def test_detect_repeated_topics_empty_session(self):
        """
        Test that empty session returns empty dict.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = []

            result = detect_repeated_topics("empty-session")

            assert result == {}, "Empty session should return empty dict"

    def test_detect_repeated_topics_sorted_by_count(self, mock_answer_factory, mock_openai_topics_response):
        """
        Test that results are sorted by count (highest first).
        """
        answers = [
            mock_answer_factory("ans-1", 1, "Q1", "A1", timestamp_offset_minutes=0),
            mock_answer_factory("ans-2", 2, "Q2", "A2", timestamp_offset_minutes=5),
            mock_answer_factory("ans-3", 3, "Q3", "A3", timestamp_offset_minutes=10),
        ]

        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = answers

            with patch('services.conversation_context.client') as mock_client:
                mock_client.chat.completions.create.side_effect = [
                    mock_openai_topics_response(["python", "java", "docker"]),
                    mock_openai_topics_response(["python", "java"]),
                    mock_openai_topics_response(["python"])
                ]

                result = detect_repeated_topics("test-session")

                # Python: 3 times, Java: 2 times
                keys = list(result.keys())
                assert keys[0] == "python", "Python (3 mentions) should be first"
                assert keys[1] == "java", "Java (2 mentions) should be second"


# ============================================================================
# TEST CASES - Empty Session Handling (All Functions)
# ============================================================================

class TestEmptySessionHandling:
    """Tests that all functions handle empty sessions gracefully."""

    def test_all_functions_handle_empty_session(self):
        """
        Test that all context functions return appropriate empty values
        for sessions with no answers, without crashing.
        """
        with patch('services.conversation_context.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = []

            # Test each function
            summary = build_conversation_summary("empty-session")
            assert summary == "", "build_conversation_summary should return empty string"

            topics = extract_topics("empty-session")
            assert topics == [], "extract_topics should return empty list"

            context = get_recent_context("empty-session")
            assert context == "", "get_recent_context should return empty string"

            repeated = detect_repeated_topics("empty-session")
            assert repeated == {}, "detect_repeated_topics should return empty dict"
