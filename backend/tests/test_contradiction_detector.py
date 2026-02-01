"""
Test suite for Contradiction Detector (Phase 1.2: Memory System)

This module tests the contradiction detection service to ensure:
- Obvious contradictions are detected with high confidence
- Non-contradictory statements don't trigger false positives
- Semantic contradictions (not just keyword matches) are detected
- Multiple contradictions are found and properly structured
- Empty sessions and API errors are handled gracefully

Run tests with: pytest backend/tests/test_contradiction_detector.py -v
"""

import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timedelta, timezone
import sys
import os

# Add backend directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.contradiction_detector import (
    detect_contradictions,
    get_contradiction_summary,
    generate_followup_question
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
        timestamp_offset_minutes: int = 0
    ):
        mock_answer = MagicMock()
        mock_answer.id = answer_id
        mock_answer.question_id = question_id
        mock_answer.question_text = question_text
        mock_answer.user_answer = user_answer
        mock_answer.answer_timestamp = datetime.now(timezone.utc) + timedelta(minutes=timestamp_offset_minutes)
        return mock_answer

    return create_answer


@pytest.fixture
def teamwork_contradiction_answers(mock_answer_factory):
    """
    Creates answers with an obvious teamwork preference contradiction.
    Q2: "I love working in teams"
    (Current Q7: "I prefer working alone" - passed separately)
    """
    return [
        mock_answer_factory(
            answer_id="ans-1",
            question_id=1,
            question_text="Tell me about yourself",
            user_answer="I am a software engineer with 5 years of experience.",
            timestamp_offset_minutes=0
        ),
        mock_answer_factory(
            answer_id="ans-2",
            question_id=2,
            question_text="How do you work with others?",
            user_answer="I love working in teams. Collaboration brings out the best in me and I thrive in group settings.",
            timestamp_offset_minutes=5
        ),
        mock_answer_factory(
            answer_id="ans-3",
            question_id=3,
            question_text="What are your strengths?",
            user_answer="I am detail-oriented and good at problem solving.",
            timestamp_offset_minutes=10
        )
    ]


@pytest.fixture
def no_contradiction_answers(mock_answer_factory):
    """
    Creates answers with no contradictions - liking different things is not contradictory.
    """
    return [
        mock_answer_factory(
            answer_id="ans-1",
            question_id=1,
            question_text="What programming languages do you know?",
            user_answer="I like Python. It's my primary language for backend development.",
            timestamp_offset_minutes=0
        )
    ]


@pytest.fixture
def experience_contradiction_answers(mock_answer_factory):
    """
    Creates answers with a semantic experience contradiction.
    Q1: "I have 10 years of experience"
    (Current Q4: "I just graduated last year" - passed separately)
    """
    return [
        mock_answer_factory(
            answer_id="ans-1",
            question_id=1,
            question_text="How much experience do you have?",
            user_answer="I have 10 years of experience in software development, working across multiple companies.",
            timestamp_offset_minutes=0
        ),
        mock_answer_factory(
            answer_id="ans-2",
            question_id=2,
            question_text="What technologies have you used?",
            user_answer="I've worked with Python, Java, and cloud technologies.",
            timestamp_offset_minutes=5
        ),
        mock_answer_factory(
            answer_id="ans-3",
            question_id=3,
            question_text="Tell me about your education",
            user_answer="I have a Computer Science degree from State University.",
            timestamp_offset_minutes=10
        )
    ]


@pytest.fixture
def multiple_contradiction_answers(mock_answer_factory):
    """
    Creates answers with multiple contradictions.
    """
    return [
        mock_answer_factory(
            answer_id="ans-1",
            question_id=1,
            question_text="Do you prefer frontend or backend?",
            user_answer="I strongly prefer backend development. I don't enjoy frontend work at all.",
            timestamp_offset_minutes=0
        ),
        mock_answer_factory(
            answer_id="ans-2",
            question_id=2,
            question_text="How do you handle pressure?",
            user_answer="I always stay calm under pressure. I never get stressed.",
            timestamp_offset_minutes=5
        ),
        mock_answer_factory(
            answer_id="ans-3",
            question_id=3,
            question_text="What's your work style?",
            user_answer="I am a morning person. I do my best work early in the day.",
            timestamp_offset_minutes=10
        )
    ]


@pytest.fixture
def mock_contradiction_response():
    """
    Factory to create mock OpenAI responses for contradiction detection.
    """
    def create_response(contradictions_list):
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content=json.dumps(contradictions_list)))
        ]
        return mock_response

    return create_response


# ============================================================================
# TEST CASES - detect_contradictions (async)
# ============================================================================

class TestDetectContradictions:
    """Tests for the detect_contradictions async function."""

    @pytest.mark.asyncio
    async def test_detect_obvious_contradiction(self, teamwork_contradiction_answers, mock_contradiction_response):
        """
        Test that obvious contradictions are detected with high confidence.
        Q2: "I love working in teams" vs Current: "I prefer working alone"
        """
        with patch('services.contradiction_detector.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = teamwork_contradiction_answers

            # Mock OpenAI response with detected contradiction
            expected_contradiction = [{
                "past_answer_id": "ans-2",
                "past_question": "How do you work with others?",
                "past_statement": "I love working in teams",
                "current_statement": "I prefer working alone",
                "contradiction_type": "preference",
                "confidence_score": 0.92,
                "explanation": "Candidate expresses opposite preferences about teamwork vs solo work"
            }]

            with patch('services.contradiction_detector.client') as mock_client:
                mock_client.chat.completions.create.return_value = mock_contradiction_response(expected_contradiction)

                result = await detect_contradictions(
                    session_id="test-session",
                    current_answer="I prefer working alone. I find teams distracting and do my best work independently.",
                    current_question="What is your ideal work environment?"
                )

                # Assertions
                assert len(result) == 1, f"Should detect 1 contradiction, got {len(result)}"
                assert result[0]["confidence_score"] > 0.8, "Confidence should be > 0.8"
                assert result[0]["contradiction_type"] == "preference"
                assert "past_answer_id" in result[0]
                assert "past_statement" in result[0]
                assert "current_statement" in result[0]

    @pytest.mark.asyncio
    async def test_no_contradiction_detected(self, no_contradiction_answers, mock_contradiction_response):
        """
        Test that non-contradictory statements don't trigger false positives.
        "I like Python" and "I also like JavaScript" are not contradictions.
        """
        with patch('services.contradiction_detector.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = no_contradiction_answers

            # Mock OpenAI response with no contradictions
            with patch('services.contradiction_detector.client') as mock_client:
                mock_client.chat.completions.create.return_value = mock_contradiction_response([])

                result = await detect_contradictions(
                    session_id="test-session",
                    current_answer="I also like JavaScript. It's great for frontend development.",
                    current_question="What other languages do you use?"
                )

                # Assertions
                assert result == [], "Should return empty list for non-contradictory statements"

    @pytest.mark.asyncio
    async def test_semantic_contradiction(self, experience_contradiction_answers, mock_contradiction_response):
        """
        Test that semantic contradictions are detected.
        "I have 10 years of experience" vs "I just graduated last year"
        """
        with patch('services.contradiction_detector.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = experience_contradiction_answers

            # Mock OpenAI response with semantic contradiction
            expected_contradiction = [{
                "past_answer_id": "ans-1",
                "past_question": "How much experience do you have?",
                "past_statement": "I have 10 years of experience in software development",
                "current_statement": "I just graduated last year",
                "contradiction_type": "experience",
                "confidence_score": 0.95,
                "explanation": "Candidate claims 10 years experience but also claims to have just graduated"
            }]

            with patch('services.contradiction_detector.client') as mock_client:
                mock_client.chat.completions.create.return_value = mock_contradiction_response(expected_contradiction)

                result = await detect_contradictions(
                    session_id="test-session",
                    current_answer="I just graduated last year, so I'm still learning the ropes.",
                    current_question="When did you start your career?"
                )

                # Assertions
                assert len(result) == 1, "Should detect semantic contradiction"
                assert result[0]["contradiction_type"] == "experience"
                assert result[0]["confidence_score"] >= 0.7

    @pytest.mark.asyncio
    async def test_multiple_contradictions(self, multiple_contradiction_answers, mock_contradiction_response):
        """
        Test that multiple contradictions are found and properly structured.
        """
        with patch('services.contradiction_detector.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = multiple_contradiction_answers

            # Mock OpenAI response with multiple contradictions
            expected_contradictions = [
                {
                    "past_answer_id": "ans-1",
                    "past_question": "Do you prefer frontend or backend?",
                    "past_statement": "I strongly prefer backend development. I don't enjoy frontend work at all.",
                    "current_statement": "I actually love frontend work, especially React and CSS.",
                    "contradiction_type": "preference",
                    "confidence_score": 0.88,
                    "explanation": "Candidate previously said they don't enjoy frontend but now says they love it"
                },
                {
                    "past_answer_id": "ans-2",
                    "past_question": "How do you handle pressure?",
                    "past_statement": "I always stay calm under pressure. I never get stressed.",
                    "current_statement": "Deadlines really stress me out",
                    "contradiction_type": "behavioral",
                    "confidence_score": 0.85,
                    "explanation": "Candidate claimed to never get stressed but now admits to stress from deadlines"
                }
            ]

            with patch('services.contradiction_detector.client') as mock_client:
                mock_client.chat.completions.create.return_value = mock_contradiction_response(expected_contradictions)

                result = await detect_contradictions(
                    session_id="test-session",
                    current_answer="I actually love frontend work, especially React and CSS. Though deadlines really stress me out.",
                    current_question="Tell me more about your preferences"
                )

                # Assertions
                assert len(result) == 2, f"Should detect 2 contradictions, got {len(result)}"

                # Check each contradiction has proper structure
                required_fields = [
                    "past_answer_id", "past_question", "past_statement",
                    "current_statement", "contradiction_type", "confidence_score", "explanation"
                ]
                for contradiction in result:
                    for field in required_fields:
                        assert field in contradiction, f"Missing required field: {field}"

                # Check contradiction types
                types = [c["contradiction_type"] for c in result]
                assert "preference" in types
                assert "behavioral" in types

    @pytest.mark.asyncio
    async def test_empty_session_returns_empty_list(self):
        """
        Test that empty session returns empty list without calling OpenAI.
        """
        with patch('services.contradiction_detector.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = []  # No past answers

            with patch('services.contradiction_detector.client') as mock_client:
                result = await detect_contradictions(
                    session_id="empty-session",
                    current_answer="Some answer"
                )

                assert result == [], "Empty session should return empty list"
                mock_client.chat.completions.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_filters_low_confidence_contradictions(self, teamwork_contradiction_answers, mock_contradiction_response):
        """
        Test that contradictions with confidence < 0.7 are filtered out.
        """
        with patch('services.contradiction_detector.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = teamwork_contradiction_answers

            # Mock response with low confidence contradiction
            low_confidence_contradiction = [{
                "past_answer_id": "ans-2",
                "past_question": "How do you work with others?",
                "past_statement": "I love working in teams",
                "current_statement": "Sometimes I work alone",
                "contradiction_type": "preference",
                "confidence_score": 0.5,  # Below 0.7 threshold
                "explanation": "Might be a contradiction but unclear"
            }]

            with patch('services.contradiction_detector.client') as mock_client:
                mock_client.chat.completions.create.return_value = mock_contradiction_response(low_confidence_contradiction)

                result = await detect_contradictions(
                    session_id="test-session",
                    current_answer="Sometimes I work alone on focused tasks."
                )

                assert result == [], "Low confidence contradictions should be filtered out"

    @pytest.mark.asyncio
    async def test_handles_api_error_gracefully(self, teamwork_contradiction_answers):
        """
        Test that API errors are handled gracefully.
        """
        with patch('services.contradiction_detector.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = teamwork_contradiction_answers

            with patch('services.contradiction_detector.client') as mock_client:
                mock_client.chat.completions.create.side_effect = Exception("API Error")

                result = await detect_contradictions(
                    session_id="test-session",
                    current_answer="I prefer working alone."
                )

                assert result == [], "Should return empty list on API error"

    @pytest.mark.asyncio
    async def test_handles_markdown_response(self, teamwork_contradiction_answers):
        """
        Test that markdown-wrapped JSON responses are parsed correctly.
        """
        with patch('services.contradiction_detector.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = teamwork_contradiction_answers

            # Mock response with markdown code block
            mock_response = MagicMock()
            contradiction_json = json.dumps([{
                "past_answer_id": "ans-2",
                "past_question": "How do you work?",
                "past_statement": "I love teams",
                "current_statement": "I prefer alone",
                "contradiction_type": "preference",
                "confidence_score": 0.9,
                "explanation": "Opposite preferences"
            }])
            mock_response.choices = [
                MagicMock(message=MagicMock(content=f'```json\n{contradiction_json}\n```'))
            ]

            with patch('services.contradiction_detector.client') as mock_client:
                mock_client.chat.completions.create.return_value = mock_response

                result = await detect_contradictions(
                    session_id="test-session",
                    current_answer="I prefer working alone."
                )

                assert len(result) == 1, "Should parse markdown-wrapped response"


# ============================================================================
# TEST CASES - get_contradiction_summary
# ============================================================================

class TestGetContradictionSummary:
    """Tests for the get_contradiction_summary function."""

    def test_summary_with_contradictions(self):
        """
        Test that summary is formatted correctly with contradictions.
        """
        contradictions = [
            {
                "past_statement": "I love working in teams",
                "current_statement": "I prefer working alone",
                "contradiction_type": "preference",
                "confidence_score": 0.92,
                "explanation": "Opposite preferences about teamwork"
            }
        ]

        result = get_contradiction_summary(contradictions)

        assert "=== Consistency Check ===" in result
        assert "confidence: 92%" in result
        assert "I love working in teams" in result
        assert "I prefer working alone" in result
        assert "preference conflict" in result

    def test_summary_empty_contradictions(self):
        """
        Test that empty contradictions returns empty string.
        """
        result = get_contradiction_summary([])
        assert result == "", "Empty contradictions should return empty string"

    def test_summary_multiple_contradictions(self):
        """
        Test summary with multiple contradictions.
        """
        contradictions = [
            {
                "past_statement": "Statement 1",
                "current_statement": "Contradiction 1",
                "contradiction_type": "direct",
                "confidence_score": 0.85,
                "explanation": "Explanation 1"
            },
            {
                "past_statement": "Statement 2",
                "current_statement": "Contradiction 2",
                "contradiction_type": "behavioral",
                "confidence_score": 0.78,
                "explanation": "Explanation 2"
            }
        ]

        result = get_contradiction_summary(contradictions)

        assert "contradiction #1" in result
        assert "contradiction #2" in result
        assert "85%" in result
        assert "78%" in result


# ============================================================================
# TEST CASES - generate_followup_question
# ============================================================================

class TestGenerateFollowupQuestion:
    """Tests for the generate_followup_question function."""

    def test_generate_followup_success(self):
        """
        Test that follow-up question is generated successfully.
        """
        contradiction = {
            "past_statement": "I love teamwork",
            "current_statement": "I prefer solo work",
            "contradiction_type": "preference"
        }

        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(
                content="Earlier you mentioned enjoying teamwork, but you also mentioned preferring to work alone. Could you help me understand how you balance both approaches?"
            ))
        ]

        with patch('services.contradiction_detector.client') as mock_client:
            mock_client.chat.completions.create.return_value = mock_response

            result = generate_followup_question(contradiction)

            assert len(result) > 0, "Should return a follow-up question"
            assert "?" in result, "Should be a question"

    def test_generate_followup_api_error_fallback(self):
        """
        Test that API error returns fallback question.
        """
        contradiction = {
            "past_statement": "I love teamwork",
            "current_statement": "I prefer solo work",
            "contradiction_type": "preference"
        }

        with patch('services.contradiction_detector.client') as mock_client:
            mock_client.chat.completions.create.side_effect = Exception("API Error")

            result = generate_followup_question(contradiction)

            assert "balance" in result.lower(), "Should return fallback question"
            assert "?" in result, "Fallback should be a question"
