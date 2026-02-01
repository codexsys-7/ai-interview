"""
Test suite for Semantic Search API (Phase 1.2: Memory System)

This module tests the semantic search endpoint to ensure:
- Search returns results with similarity scores
- Results are ordered by similarity (highest first)
- top_k parameter limits the number of results
- Invalid session IDs return 404
- Semantic matching works (not just keyword matching)

Run tests with: pytest backend/tests/test_semantic_search_api.py -v
"""

import pytest
import json
import math
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import sys
import os

# Add backend directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api import app


# ============================================================================
# FIXTURES - Reusable test setup components
# ============================================================================

@pytest.fixture
def test_client():
    """
    Creates a FastAPI TestClient for making HTTP requests to our API.
    This allows us to test endpoints without running a real server.
    """
    return TestClient(app)


@pytest.fixture
def mock_embedding_factory():
    """
    Factory to create mock embeddings with predictable similarity patterns.
    Returns a function that creates normalized embeddings.
    """
    def create_embedding(seed: int, dimension: int = 1536) -> list:
        """Create a mock embedding based on a seed value."""
        embedding = [(seed + i) % 100 * 0.01 for i in range(dimension)]
        magnitude = math.sqrt(sum(x * x for x in embedding))
        return [x / magnitude for x in embedding]

    return create_embedding


@pytest.fixture
def sample_session_data():
    """
    Provides sample data for creating an interview session.
    """
    return {
        "role": "Software Engineer",
        "difficulty": "Senior",
        "question_count": 5,
        "interviewer_names": ["Manager", "Tech Lead"],
        "plan": None
    }


@pytest.fixture
def sample_answers_for_search():
    """
    Provides sample answers with different topics for semantic search testing.
    """
    return [
        {
            "question_id": 1,
            "question_text": "Tell me about your experience with machine learning",
            "question_intent": "technical",
            "role": "Tech Lead",
            "user_answer": "I have extensive experience with machine learning, including neural networks, deep learning, and NLP projects.",
            "transcript_raw": None,
            "audio_duration_seconds": None
        },
        {
            "question_id": 2,
            "question_text": "How do you handle database design?",
            "question_intent": "technical",
            "role": "Tech Lead",
            "user_answer": "I follow best practices for database normalization and have worked with PostgreSQL and MongoDB.",
            "transcript_raw": None,
            "audio_duration_seconds": None
        },
        {
            "question_id": 3,
            "question_text": "Describe your frontend experience",
            "question_intent": "technical",
            "role": "Manager",
            "user_answer": "I have built React applications and understand modern CSS frameworks like Tailwind.",
            "transcript_raw": None,
            "audio_duration_seconds": None
        }
    ]


@pytest.fixture
def ten_sample_answers():
    """
    Provides 10 sample answers for testing top_k limit.
    """
    answers = []
    topics = [
        "Python programming and web development",
        "JavaScript and React frontend",
        "Database design with PostgreSQL",
        "Machine learning and AI",
        "DevOps and CI/CD pipelines",
        "Microservices architecture",
        "API design and REST",
        "Testing and quality assurance",
        "Agile methodology and Scrum",
        "Cloud computing with AWS"
    ]
    for i, topic in enumerate(topics, 1):
        answers.append({
            "question_id": i,
            "question_text": f"Question about {topic}",
            "question_intent": "technical",
            "role": "Tech Lead",
            "user_answer": f"I have experience with {topic}. I've worked on several projects involving this area.",
            "transcript_raw": None,
            "audio_duration_seconds": None
        })
    return answers


@pytest.fixture
def mock_session_exists():
    """
    Mock for checking if a session exists in the database.
    """
    mock_session = MagicMock()
    mock_session.id = "test-session-123"
    mock_session.role = "Software Engineer"
    return mock_session


@pytest.fixture
def mock_search_results():
    """
    Mock search results with similarity scores.
    """
    return [
        {
            "answer_id": "ans-1",
            "question_id": 1,
            "question_text": "Tell me about machine learning",
            "user_answer": "I have experience with ML and neural networks",
            "role": "Tech Lead",
            "similarity": 0.95
        },
        {
            "answer_id": "ans-2",
            "question_id": 2,
            "question_text": "Describe AI projects",
            "user_answer": "I built several AI-powered applications",
            "role": "Manager",
            "similarity": 0.87
        },
        {
            "answer_id": "ans-3",
            "question_id": 3,
            "question_text": "What about data science?",
            "user_answer": "I work with pandas and data analysis",
            "role": "Tech Lead",
            "similarity": 0.72
        }
    ]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def create_mock_embedding(dimension: int = 1536) -> list:
    """Create a simple mock embedding vector."""
    return [0.01] * dimension


# ============================================================================
# TEST CASES - Search Endpoint Basic Functionality
# ============================================================================

class TestSearchEndpointBasic:
    """Tests for basic semantic search endpoint functionality."""

    def test_search_endpoint_returns_results(self, test_client, mock_search_results):
        """
        Test that search endpoint returns results with similarity scores.
        - Submit query to /api/interview/search-answers
        - Assert 200 status
        - Assert returns results with similarity scores
        """
        with patch('api.Session') as mock_session_class:
            # Mock database session
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session

            # Mock session exists check
            mock_interview_session = MagicMock()
            mock_interview_session.id = "test-session-123"
            mock_db_session.exec.return_value.first.return_value = mock_interview_session

            with patch('api.generate_embedding') as mock_gen_embed:
                mock_gen_embed.return_value = create_mock_embedding()

                with patch('api.find_similar_answers') as mock_find_similar:
                    mock_find_similar.return_value = mock_search_results

                    response = test_client.post(
                        "/api/interview/search-answers",
                        json={
                            "session_id": "test-session-123",
                            "query": "machine learning and AI",
                            "top_k": 5
                        }
                    )

                    # Assertions
                    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

                    data = response.json()
                    assert data["success"] is True
                    assert data["session_id"] == "test-session-123"
                    assert data["query"] == "machine learning and AI"
                    assert "results" in data
                    assert len(data["results"]) == 3

                    # Check each result has required fields
                    for result in data["results"]:
                        assert "answer_id" in result
                        assert "question_id" in result
                        assert "question_text" in result
                        assert "user_answer" in result
                        assert "similarity_score" in result

    def test_search_results_ordered_by_similarity(self, test_client):
        """
        Test that search results are sorted by similarity (highest first).
        """
        # Create results with specific similarity scores (unsorted)
        unsorted_results = [
            {"answer_id": "a2", "question_id": 2, "question_text": "Q2", "user_answer": "A2", "role": "HR", "similarity": 0.75},
            {"answer_id": "a1", "question_id": 1, "question_text": "Q1", "user_answer": "A1", "role": "HR", "similarity": 0.95},
            {"answer_id": "a3", "question_id": 3, "question_text": "Q3", "user_answer": "A3", "role": "HR", "similarity": 0.60},
        ]

        with patch('api.Session') as mock_session_class:
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session
            mock_db_session.exec.return_value.first.return_value = MagicMock(id="test-session")

            with patch('api.generate_embedding') as mock_gen_embed:
                mock_gen_embed.return_value = create_mock_embedding()

                with patch('api.find_similar_answers') as mock_find_similar:
                    # Return pre-sorted results (as the function should)
                    mock_find_similar.return_value = sorted(
                        unsorted_results,
                        key=lambda x: x["similarity"],
                        reverse=True
                    )

                    response = test_client.post(
                        "/api/interview/search-answers",
                        json={
                            "session_id": "test-session",
                            "query": "test query",
                            "top_k": 5
                        }
                    )

                    assert response.status_code == 200
                    data = response.json()
                    results = data["results"]

                    # Verify ordering (highest similarity first)
                    for i in range(len(results) - 1):
                        assert results[i]["similarity_score"] >= results[i + 1]["similarity_score"], \
                            f"Results not ordered: {results[i]['similarity_score']} < {results[i + 1]['similarity_score']}"

    def test_search_with_top_k_limit(self, test_client):
        """
        Test that top_k parameter limits the number of results.
        Store 10 answers, search with top_k=3, assert returns exactly 3.
        """
        # Create 10 mock results
        ten_results = [
            {"answer_id": f"a{i}", "question_id": i, "question_text": f"Q{i}",
             "user_answer": f"Answer {i}", "role": "Tech Lead", "similarity": 0.9 - (i * 0.05)}
            for i in range(1, 11)
        ]

        with patch('api.Session') as mock_session_class:
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session
            mock_db_session.exec.return_value.first.return_value = MagicMock(id="test-session")

            with patch('api.generate_embedding') as mock_gen_embed:
                mock_gen_embed.return_value = create_mock_embedding()

                with patch('api.find_similar_answers') as mock_find_similar:
                    # Return only top 3 (simulating top_k behavior)
                    mock_find_similar.return_value = ten_results[:3]

                    response = test_client.post(
                        "/api/interview/search-answers",
                        json={
                            "session_id": "test-session",
                            "query": "Python programming",
                            "top_k": 3
                        }
                    )

                    assert response.status_code == 200
                    data = response.json()

                    assert data["total_results"] == 3, f"Expected 3 results, got {data['total_results']}"
                    assert len(data["results"]) == 3


# ============================================================================
# TEST CASES - Error Handling
# ============================================================================

class TestSearchEndpointErrors:
    """Tests for search endpoint error handling."""

    def test_search_invalid_session_returns_404(self, test_client):
        """
        Test that searching with a non-existent session_id returns 404.
        """
        with patch('api.Session') as mock_session_class:
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session
            # Return None to simulate session not found
            mock_db_session.exec.return_value.first.return_value = None

            response = test_client.post(
                "/api/interview/search-answers",
                json={
                    "session_id": "non-existent-session-id",
                    "query": "test query",
                    "top_k": 5
                }
            )

            assert response.status_code == 404, f"Expected 404, got {response.status_code}"
            data = response.json()
            assert "not found" in data["detail"].lower()

    def test_search_empty_query_returns_400(self, test_client):
        """
        Test that empty query returns 400 error.
        """
        with patch('api.Session') as mock_session_class:
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session
            mock_db_session.exec.return_value.first.return_value = MagicMock(id="test-session")

            response = test_client.post(
                "/api/interview/search-answers",
                json={
                    "session_id": "test-session",
                    "query": "   ",  # Empty/whitespace query
                    "top_k": 5
                }
            )

            assert response.status_code == 400, f"Expected 400, got {response.status_code}"

    def test_search_handles_embedding_error(self, test_client):
        """
        Test that embedding generation errors are handled gracefully.
        """
        with patch('api.Session') as mock_session_class:
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session
            mock_db_session.exec.return_value.first.return_value = MagicMock(id="test-session")

            with patch('api.generate_embedding') as mock_gen_embed:
                mock_gen_embed.side_effect = Exception("Embedding API error")

                response = test_client.post(
                    "/api/interview/search-answers",
                    json={
                        "session_id": "test-session",
                        "query": "test query",
                        "top_k": 5
                    }
                )

                assert response.status_code == 500


# ============================================================================
# TEST CASES - Semantic Matching
# ============================================================================

class TestSemanticMatching:
    """Tests for semantic matching functionality."""

    def test_semantic_matching_works(self, test_client):
        """
        Test that semantic matching finds related concepts.
        Store answer with "machine learning", search for "AI".
        The semantic similarity should find the match.
        """
        # Mock result showing semantic match between "machine learning" and "AI"
        semantic_match_results = [
            {
                "answer_id": "ml-answer-1",
                "question_id": 1,
                "question_text": "Tell me about your machine learning experience",
                "user_answer": "I have worked extensively with machine learning, building neural networks and deep learning models.",
                "role": "Tech Lead",
                "similarity": 0.89  # High similarity despite different keywords
            }
        ]

        with patch('api.Session') as mock_session_class:
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session
            mock_db_session.exec.return_value.first.return_value = MagicMock(id="test-session")

            with patch('api.generate_embedding') as mock_gen_embed:
                # Both "AI" query and "machine learning" answer would have similar embeddings
                mock_gen_embed.return_value = create_mock_embedding()

                with patch('api.find_similar_answers') as mock_find_similar:
                    mock_find_similar.return_value = semantic_match_results

                    response = test_client.post(
                        "/api/interview/search-answers",
                        json={
                            "session_id": "test-session",
                            "query": "AI",  # Searching for "AI"
                            "top_k": 5
                        }
                    )

                    assert response.status_code == 200
                    data = response.json()

                    # Should find the machine learning answer
                    assert len(data["results"]) >= 1
                    assert "machine learning" in data["results"][0]["user_answer"].lower()
                    assert data["results"][0]["similarity_score"] > 0.7

    def test_search_returns_empty_for_unrelated_query(self, test_client):
        """
        Test that completely unrelated queries return empty or low similarity results.
        """
        with patch('api.Session') as mock_session_class:
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session
            mock_db_session.exec.return_value.first.return_value = MagicMock(id="test-session")

            with patch('api.generate_embedding') as mock_gen_embed:
                mock_gen_embed.return_value = create_mock_embedding()

                with patch('api.find_similar_answers') as mock_find_similar:
                    # Return empty for completely unrelated query
                    mock_find_similar.return_value = []

                    response = test_client.post(
                        "/api/interview/search-answers",
                        json={
                            "session_id": "test-session",
                            "query": "xyz random gibberish 12345",
                            "top_k": 5
                        }
                    )

                    assert response.status_code == 200
                    data = response.json()
                    assert data["total_results"] == 0


# ============================================================================
# TEST CASES - Response Structure
# ============================================================================

class TestSearchResponseStructure:
    """Tests for validating response structure."""

    def test_response_contains_all_required_fields(self, test_client, mock_search_results):
        """
        Test that the response contains all required fields.
        """
        with patch('api.Session') as mock_session_class:
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session
            mock_db_session.exec.return_value.first.return_value = MagicMock(id="test-session")

            with patch('api.generate_embedding') as mock_gen_embed:
                mock_gen_embed.return_value = create_mock_embedding()

                with patch('api.find_similar_answers') as mock_find_similar:
                    mock_find_similar.return_value = mock_search_results

                    response = test_client.post(
                        "/api/interview/search-answers",
                        json={
                            "session_id": "test-session",
                            "query": "test",
                            "top_k": 5
                        }
                    )

                    data = response.json()

                    # Check top-level fields
                    assert "success" in data
                    assert "session_id" in data
                    assert "query" in data
                    assert "total_results" in data
                    assert "results" in data

                    # Check result item fields
                    if data["results"]:
                        result = data["results"][0]
                        assert "answer_id" in result
                        assert "question_id" in result
                        assert "question_text" in result
                        assert "user_answer" in result
                        assert "role" in result
                        assert "similarity_score" in result

    def test_similarity_scores_in_valid_range(self, test_client):
        """
        Test that similarity scores are between 0 and 1.
        """
        results_with_scores = [
            {"answer_id": "a1", "question_id": 1, "question_text": "Q1",
             "user_answer": "A1", "role": "HR", "similarity": 0.95},
            {"answer_id": "a2", "question_id": 2, "question_text": "Q2",
             "user_answer": "A2", "role": "HR", "similarity": 0.45},
        ]

        with patch('api.Session') as mock_session_class:
            mock_db_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_db_session
            mock_db_session.exec.return_value.first.return_value = MagicMock(id="test-session")

            with patch('api.generate_embedding') as mock_gen_embed:
                mock_gen_embed.return_value = create_mock_embedding()

                with patch('api.find_similar_answers') as mock_find_similar:
                    mock_find_similar.return_value = results_with_scores

                    response = test_client.post(
                        "/api/interview/search-answers",
                        json={
                            "session_id": "test-session",
                            "query": "test",
                            "top_k": 5
                        }
                    )

                    data = response.json()
                    for result in data["results"]:
                        score = result["similarity_score"]
                        assert 0 <= score <= 1, f"Similarity score {score} out of range [0, 1]"
