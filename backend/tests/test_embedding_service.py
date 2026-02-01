"""
Test suite for Embedding Service (Phase 1.2: Memory System)

This module tests the embedding service to ensure:
- Embeddings are generated with correct dimensions (1536)
- Similarity calculations work correctly
- Similar answers are found and ranked properly
- OpenAI API calls are properly mocked

Run tests with: pytest backend/tests/test_embedding_service.py -v
"""

import pytest
import json
import math
from unittest.mock import patch, MagicMock
import sys
import os

# Add backend directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.embedding_service import (
    generate_embedding,
    calculate_similarity,
    find_similar_answers,
    EMBEDDING_MODEL
)


# ============================================================================
# FIXTURES - Reusable test setup components
# ============================================================================

@pytest.fixture
def mock_embedding_1536():
    """
    Creates a mock embedding vector with 1536 dimensions.
    Uses a simple pattern for predictable testing.
    """
    # Create a normalized vector of 1536 dimensions
    embedding = [0.01 * (i % 100) for i in range(1536)]
    # Normalize to unit vector
    magnitude = math.sqrt(sum(x * x for x in embedding))
    return [x / magnitude for x in embedding]


@pytest.fixture
def mock_embedding_similar():
    """
    Creates an embedding that should be similar to mock_embedding_1536.
    Small variations to simulate similar texts.
    """
    embedding = [0.01 * (i % 100) + 0.001 for i in range(1536)]
    magnitude = math.sqrt(sum(x * x for x in embedding))
    return [x / magnitude for x in embedding]


@pytest.fixture
def mock_embedding_different():
    """
    Creates an embedding that should be very different.
    Uses negative values and different pattern to ensure low similarity.
    """
    # Create a truly different vector using alternating positive/negative values
    embedding = [(-1 if i % 2 == 0 else 1) * 0.01 * ((i * 7) % 100) for i in range(1536)]
    magnitude = math.sqrt(sum(x * x for x in embedding))
    if magnitude == 0:
        magnitude = 1
    return [x / magnitude for x in embedding]


@pytest.fixture
def mock_openai_response(mock_embedding_1536):
    """
    Creates a mock OpenAI API response for embeddings.create()
    """
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=mock_embedding_1536)]
    return mock_response


@pytest.fixture
def sample_answers_with_embeddings(mock_embedding_1536, mock_embedding_similar, mock_embedding_different):
    """
    Creates sample answer data with pre-computed embeddings for testing.
    """
    return [
        {
            "id": "answer-1",
            "question_id": 1,
            "question_text": "Tell me about Python",
            "user_answer": "I have 5 years of Python experience",
            "role": "Tech Lead",
            "embedding": json.dumps(mock_embedding_1536)
        },
        {
            "id": "answer-2",
            "question_id": 2,
            "question_text": "Describe your coding skills",
            "user_answer": "I am proficient in Python and JavaScript",
            "role": "Manager",
            "embedding": json.dumps(mock_embedding_similar)
        },
        {
            "id": "answer-3",
            "question_id": 3,
            "question_text": "What are your hobbies?",
            "user_answer": "I enjoy cooking and gardening",
            "role": "HR",
            "embedding": json.dumps(mock_embedding_different)
        },
        {
            "id": "answer-4",
            "question_id": 4,
            "question_text": "Explain REST APIs",
            "user_answer": "REST APIs use HTTP methods for communication",
            "role": "Tech Lead",
            "embedding": json.dumps(mock_embedding_1536)  # Same as answer-1
        },
        {
            "id": "answer-5",
            "question_id": 5,
            "question_text": "How do you handle deadlines?",
            "user_answer": "I prioritize tasks and communicate proactively",
            "role": "Manager",
            "embedding": json.dumps(mock_embedding_similar)
        }
    ]


# ============================================================================
# TEST CASES - generate_embedding
# ============================================================================

class TestGenerateEmbedding:
    """Tests for the generate_embedding function."""

    def test_generate_embedding_returns_correct_dimensions(self, mock_openai_response):
        """
        Test that generate_embedding returns a list of exactly 1536 floats.
        This verifies the OpenAI text-embedding-3-small model output format.
        """
        with patch('services.embedding_service.client') as mock_client:
            # Setup mock
            mock_client.embeddings.create.return_value = mock_openai_response

            # Call the function
            result = generate_embedding("test text")

            # Assertions
            assert isinstance(result, list), "Result should be a list"
            assert len(result) == 1536, f"Expected 1536 dimensions, got {len(result)}"
            assert all(isinstance(x, float) for x in result), "All elements should be floats"

            # Verify OpenAI was called correctly
            mock_client.embeddings.create.assert_called_once_with(
                model=EMBEDDING_MODEL,
                input="test text"
            )

    def test_generate_embedding_strips_whitespace(self, mock_openai_response):
        """
        Test that input text is properly stripped before sending to OpenAI.
        """
        with patch('services.embedding_service.client') as mock_client:
            mock_client.embeddings.create.return_value = mock_openai_response

            generate_embedding("  test text with spaces  ")

            # Verify text was stripped
            mock_client.embeddings.create.assert_called_once_with(
                model=EMBEDDING_MODEL,
                input="test text with spaces"
            )

    def test_generate_embedding_raises_on_empty_text(self):
        """
        Test that empty text raises a ValueError.
        """
        with pytest.raises(ValueError, match="Text cannot be empty"):
            generate_embedding("")

        with pytest.raises(ValueError, match="Text cannot be empty"):
            generate_embedding("   ")  # Only whitespace

    def test_generate_embedding_raises_on_none(self):
        """
        Test that None input raises a ValueError.
        """
        with pytest.raises(ValueError, match="Text cannot be empty"):
            generate_embedding(None)


# ============================================================================
# TEST CASES - calculate_similarity
# ============================================================================

class TestCalculateSimilarity:
    """Tests for the calculate_similarity function."""

    def test_calculate_similarity_identical_vectors(self, mock_embedding_1536):
        """
        Test that identical vectors have similarity very close to 1.0.
        Cosine similarity of a vector with itself should be exactly 1.0.
        """
        similarity = calculate_similarity(mock_embedding_1536, mock_embedding_1536)

        assert similarity > 0.99, f"Identical vectors should have similarity > 0.99, got {similarity}"
        # Allow small floating point precision error (1.0 + epsilon)
        assert similarity <= 1.0 + 1e-9, f"Similarity should not exceed 1.0, got {similarity}"

    def test_calculate_similarity_similar_vectors(self, mock_embedding_1536, mock_embedding_similar):
        """
        Test that similar vectors have high similarity (> 0.9).
        """
        similarity = calculate_similarity(mock_embedding_1536, mock_embedding_similar)

        assert similarity > 0.9, f"Similar vectors should have similarity > 0.9, got {similarity}"

    def test_calculate_similarity_different_vectors(self, mock_embedding_1536, mock_embedding_different):
        """
        Test that very different vectors have low similarity.
        """
        similarity = calculate_similarity(mock_embedding_1536, mock_embedding_different)

        # Different vectors should have lower similarity
        assert similarity < 0.5, f"Different vectors should have similarity < 0.5, got {similarity}"

    def test_calculate_similarity_dimension_mismatch(self):
        """
        Test that mismatched dimensions raise a ValueError.
        """
        embedding1 = [0.1] * 1536
        embedding2 = [0.1] * 1000  # Wrong dimension

        with pytest.raises(ValueError, match="Embeddings must have the same dimension"):
            calculate_similarity(embedding1, embedding2)

    def test_calculate_similarity_zero_vector(self):
        """
        Test that zero vectors return 0.0 similarity (avoid division by zero).
        """
        zero_vector = [0.0] * 1536
        normal_vector = [0.1] * 1536

        similarity = calculate_similarity(zero_vector, normal_vector)
        assert similarity == 0.0, "Zero vector should result in 0.0 similarity"

    def test_calculate_similarity_is_symmetric(self, mock_embedding_1536, mock_embedding_different):
        """
        Test that similarity is symmetric: sim(A, B) == sim(B, A).
        """
        sim_ab = calculate_similarity(mock_embedding_1536, mock_embedding_different)
        sim_ba = calculate_similarity(mock_embedding_different, mock_embedding_1536)

        assert abs(sim_ab - sim_ba) < 0.0001, "Similarity should be symmetric"


# ============================================================================
# TEST CASES - find_similar_answers
# ============================================================================

class TestFindSimilarAnswers:
    """Tests for the find_similar_answers function."""

    def test_find_similar_answers_returns_top_k(self, sample_answers_with_embeddings, mock_embedding_1536):
        """
        Test that find_similar_answers returns exactly top_k results.
        """
        # Create mock answer objects
        mock_answers = []
        for ans_data in sample_answers_with_embeddings:
            mock_answer = MagicMock()
            mock_answer.id = ans_data["id"]
            mock_answer.question_id = ans_data["question_id"]
            mock_answer.question_text = ans_data["question_text"]
            mock_answer.user_answer = ans_data["user_answer"]
            mock_answer.role = ans_data["role"]
            mock_answer.embedding = ans_data["embedding"]
            mock_answers.append(mock_answer)

        # Mock the database session
        with patch('services.embedding_service.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = mock_answers

            # Call with top_k=3
            results = find_similar_answers(
                session_id="test-session-123",
                query_embedding=mock_embedding_1536,
                top_k=3
            )

            # Assertions
            assert len(results) == 3, f"Expected 3 results, got {len(results)}"

    def test_find_similar_answers_ordered_by_similarity(self, sample_answers_with_embeddings, mock_embedding_1536):
        """
        Test that results are ordered by similarity score (highest first).
        """
        # Create mock answer objects
        mock_answers = []
        for ans_data in sample_answers_with_embeddings:
            mock_answer = MagicMock()
            mock_answer.id = ans_data["id"]
            mock_answer.question_id = ans_data["question_id"]
            mock_answer.question_text = ans_data["question_text"]
            mock_answer.user_answer = ans_data["user_answer"]
            mock_answer.role = ans_data["role"]
            mock_answer.embedding = ans_data["embedding"]
            mock_answers.append(mock_answer)

        with patch('services.embedding_service.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = mock_answers

            results = find_similar_answers(
                session_id="test-session-123",
                query_embedding=mock_embedding_1536,
                top_k=5
            )

            # Verify ordering - each result should have >= similarity than the next
            for i in range(len(results) - 1):
                assert results[i]["similarity"] >= results[i + 1]["similarity"], \
                    f"Results should be ordered by similarity descending"

    def test_find_similar_answers_returns_correct_fields(self, sample_answers_with_embeddings, mock_embedding_1536):
        """
        Test that each result contains all required fields.
        """
        mock_answers = []
        for ans_data in sample_answers_with_embeddings[:1]:  # Just one answer
            mock_answer = MagicMock()
            mock_answer.id = ans_data["id"]
            mock_answer.question_id = ans_data["question_id"]
            mock_answer.question_text = ans_data["question_text"]
            mock_answer.user_answer = ans_data["user_answer"]
            mock_answer.role = ans_data["role"]
            mock_answer.embedding = ans_data["embedding"]
            mock_answers.append(mock_answer)

        with patch('services.embedding_service.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = mock_answers

            results = find_similar_answers(
                session_id="test-session-123",
                query_embedding=mock_embedding_1536,
                top_k=5
            )

            assert len(results) == 1
            result = results[0]

            # Check all required fields
            required_fields = ["answer_id", "question_id", "question_text", "user_answer", "role", "similarity"]
            for field in required_fields:
                assert field in result, f"Missing required field: {field}"

    def test_find_similar_answers_empty_session(self, mock_embedding_1536):
        """
        Test that empty session returns empty list.
        """
        with patch('services.embedding_service.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = []  # No answers

            results = find_similar_answers(
                session_id="empty-session",
                query_embedding=mock_embedding_1536,
                top_k=5
            )

            assert results == [], "Empty session should return empty list"

    def test_find_similar_answers_respects_top_k_limit(self, sample_answers_with_embeddings, mock_embedding_1536):
        """
        Test that results never exceed top_k even with more answers available.
        """
        mock_answers = []
        for ans_data in sample_answers_with_embeddings:
            mock_answer = MagicMock()
            mock_answer.id = ans_data["id"]
            mock_answer.question_id = ans_data["question_id"]
            mock_answer.question_text = ans_data["question_text"]
            mock_answer.user_answer = ans_data["user_answer"]
            mock_answer.role = ans_data["role"]
            mock_answer.embedding = ans_data["embedding"]
            mock_answers.append(mock_answer)

        with patch('services.embedding_service.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value.__enter__.return_value = mock_session
            mock_session.exec.return_value.all.return_value = mock_answers  # 5 answers

            # Request only 2
            results = find_similar_answers(
                session_id="test-session",
                query_embedding=mock_embedding_1536,
                top_k=2
            )

            assert len(results) == 2, f"Should return exactly 2 results, got {len(results)}"
