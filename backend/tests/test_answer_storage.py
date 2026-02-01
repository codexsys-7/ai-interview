"""
Test suite for Interview Answer Storage System (Phase 1: Two-way Communication)

This module tests the answer storage endpoints to ensure:
- Answers are correctly saved to the database
- Answers can be retrieved by session
- Answers maintain chronological order
- Invalid inputs are handled gracefully
- Database is the single source of truth (not localStorage)

Run tests with: pytest backend/tests/test_answer_storage.py -v
"""

import pytest
import time
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
def sample_session_data():
    """
    Provides sample data for creating an interview session.
    This represents the metadata sent when starting a new interview.
    """
    return {
        "role": "Software Engineer",
        "difficulty": "Senior",
        "question_count": 5,
        "interviewer_names": ["Manager", "HR", "Tech Lead"],
        "plan": {
            "meta": {
                "role": "Software Engineer",
                "difficulty": "Senior",
                "questionCount": 5
            },
            "questions": [
                {
                    "id": 1,
                    "prompt": "Tell me about yourself",
                    "type": "warmup",
                    "interviewer": "HR",
                    "idealAnswer": "A brief professional summary..."
                },
                {
                    "id": 2,
                    "prompt": "Describe a challenging project",
                    "type": "behavioral",
                    "interviewer": "Manager",
                    "idealAnswer": "Use STAR method..."
                },
                {
                    "id": 3,
                    "prompt": "Explain microservices architecture",
                    "type": "technical",
                    "interviewer": "Tech Lead",
                    "idealAnswer": "Microservices are..."
                }
            ]
        }
    }


@pytest.fixture
def sample_answer_data():
    """
    Provides sample data for submitting an interview answer.
    This represents one Q&A pair from the interview.
    """
    return {
        "question_id": 1,
        "question_text": "Tell me about yourself",
        "question_intent": "warmup",
        "role": "Software Engineer",
        "user_answer": "I am a software engineer with 5 years of experience in building scalable web applications.",
        "transcript_raw": "I am a software engineer with 5 years of experience in building scalable web applications.",
        "audio_duration_seconds": 45.5
    }


@pytest.fixture
def multiple_answers_data():
    """
    Provides multiple answer samples for testing retrieval and ordering.
    Each answer represents a different question in the interview.
    """
    return [
        {
            "question_id": 1,
            "question_text": "Tell me about yourself",
            "question_intent": "warmup",
            "role": "Software Engineer",
            "user_answer": "I have 5 years of experience...",
            "transcript_raw": "I have 5 years of experience...",
            "audio_duration_seconds": 30.0
        },
        {
            "question_id": 2,
            "question_text": "Describe a challenging project",
            "question_intent": "behavioral",
            "role": "Software Engineer",
            "user_answer": "Last year, I led a migration project...",
            "transcript_raw": "Last year, I led a migration project...",
            "audio_duration_seconds": 60.0
        },
        {
            "question_id": 3,
            "question_text": "Explain microservices architecture",
            "question_intent": "technical",
            "role": "Software Engineer",
            "user_answer": "Microservices is an architectural pattern...",
            "transcript_raw": "Microservices is an architectural pattern...",
            "audio_duration_seconds": 90.0
        }
    ]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def create_test_session(client, session_data):
    """
    Helper function to create a test interview session.
    Returns the session_id for use in subsequent tests.
    """
    response = client.post("/api/interview/session/create", json=session_data)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "session_id" in data
    return data["session_id"]


# ============================================================================
# TEST CASES
# ============================================================================

@pytest.mark.integration
class TestAnswerStorage:
    """
    Test class for answer storage functionality.
    Groups related tests for the /api/interview/answer/submit endpoint.

    These are integration tests that require a real database connection.
    They will be skipped if no database is available.
    """

    def test_store_answer_successfully(self, test_client, sample_session_data, sample_answer_data, skip_if_no_database):
        """
        Test Case 1: Verify that an answer saves to the database successfully.

        Steps:
        1. Create a new interview session
        2. Submit an answer with valid data
        3. Verify the response contains success=True and an answer_id

        Expected: Answer is stored and returns a valid UUID answer_id
        """
        # Step 1: Create a session first (answers require a valid session_id)
        session_id = create_test_session(test_client, sample_session_data)

        # Step 2: Add session_id to answer data and submit
        answer_data = {**sample_answer_data, "session_id": session_id}
        response = test_client.post("/api/interview/answer/submit", json=answer_data)

        # Step 3: Verify the response
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data["success"] is True, "Answer submission should return success=True"
        assert "answer_id" in data, "Response should contain answer_id"
        assert len(data["answer_id"]) > 0, "answer_id should not be empty"
        assert data["message"] == "Answer submitted successfully"

        print(f"✓ Answer stored successfully with ID: {data['answer_id']}")


    def test_retrieve_answers_for_session(self, test_client, sample_session_data, multiple_answers_data, skip_if_no_database):
        """
        Test Case 2: Verify that all answers for a session can be retrieved.

        Steps:
        1. Create a new interview session
        2. Submit multiple answers to that session
        3. Retrieve all answers using the session_id
        4. Verify all submitted answers are returned

        Expected: All answers are retrieved with correct data
        """
        # Step 1: Create a session
        session_id = create_test_session(test_client, sample_session_data)

        # Step 2: Submit multiple answers
        submitted_count = 0
        for answer in multiple_answers_data:
            answer_data = {**answer, "session_id": session_id}
            response = test_client.post("/api/interview/answer/submit", json=answer_data)
            assert response.status_code == 200
            submitted_count += 1

        # Step 3: Retrieve all answers for the session
        response = test_client.get(f"/api/interview/answers/{session_id}")

        # Step 4: Verify the response
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

        data = response.json()
        assert data["success"] is True
        assert data["session_id"] == session_id
        assert data["total_answers"] == submitted_count, f"Expected {submitted_count} answers, got {data['total_answers']}"
        assert len(data["answers"]) == submitted_count

        # Verify answer content matches what we submitted
        for i, answer in enumerate(data["answers"]):
            assert answer["question_id"] == multiple_answers_data[i]["question_id"]
            assert answer["user_answer"] == multiple_answers_data[i]["user_answer"]

        print(f"✓ Retrieved {data['total_answers']} answers for session {session_id}")


    def test_answers_chronological_order(self, test_client, sample_session_data, multiple_answers_data, skip_if_no_database):
        """
        Test Case 3: Verify that answers are returned in chronological order.

        Steps:
        1. Create a session
        2. Submit answers with small delays between them
        3. Retrieve answers and verify they're ordered by answer_timestamp

        Expected: Answers are returned in the order they were submitted (oldest first)
        """
        # Step 1: Create a session
        session_id = create_test_session(test_client, sample_session_data)

        # Step 2: Submit answers with small delays to ensure different timestamps
        for answer in multiple_answers_data:
            answer_data = {**answer, "session_id": session_id}
            response = test_client.post("/api/interview/answer/submit", json=answer_data)
            assert response.status_code == 200
            time.sleep(0.1)  # Small delay to ensure different timestamps

        # Step 3: Retrieve answers
        response = test_client.get(f"/api/interview/answers/{session_id}")
        assert response.status_code == 200

        data = response.json()
        answers = data["answers"]

        # Step 4: Verify chronological order by checking timestamps
        for i in range(len(answers) - 1):
            current_timestamp = answers[i]["answer_timestamp"]
            next_timestamp = answers[i + 1]["answer_timestamp"]
            assert current_timestamp <= next_timestamp, \
                f"Answers not in chronological order: {current_timestamp} > {next_timestamp}"

        # Also verify question_id order (should match submission order)
        question_ids = [a["question_id"] for a in answers]
        expected_ids = [a["question_id"] for a in multiple_answers_data]
        assert question_ids == expected_ids, f"Question order mismatch: {question_ids} != {expected_ids}"

        print(f"✓ Answers are in correct chronological order")


    def test_invalid_session_id(self, test_client, sample_answer_data, skip_if_no_database):
        """
        Test Case 4: Verify that invalid session_id is handled gracefully.

        Steps:
        1. Try to submit an answer with a non-existent session_id
        2. Try to retrieve answers for a non-existent session_id

        Expected: Both operations return 404 with appropriate error message
        """
        fake_session_id = "00000000-0000-0000-0000-000000000000"

        # Test 1: Submit answer with invalid session_id
        answer_data = {**sample_answer_data, "session_id": fake_session_id}
        response = test_client.post("/api/interview/answer/submit", json=answer_data)

        assert response.status_code == 404, f"Expected 404 for invalid session, got {response.status_code}"
        assert "not found" in response.json()["detail"].lower()

        # Test 2: Retrieve answers with invalid session_id
        response = test_client.get(f"/api/interview/answers/{fake_session_id}")

        assert response.status_code == 404, f"Expected 404 for invalid session, got {response.status_code}"
        assert "not found" in response.json()["detail"].lower()

        print(f"✓ Invalid session_id handled gracefully with 404 response")


    def test_invalid_answer_data(self, test_client, sample_session_data, skip_if_no_database):
        """
        Test Case 5: Verify that invalid answer data is validated properly.

        Steps:
        1. Create a valid session
        2. Try to submit answers with missing required fields
        3. Try to submit answers with wrong data types

        Expected: Returns 422 Unprocessable Entity with validation errors
        """
        # Create a valid session first
        session_id = create_test_session(test_client, sample_session_data)

        # Test 1: Missing required field (question_text)
        invalid_data_missing_field = {
            "session_id": session_id,
            "question_id": 1,
            # "question_text" is missing
            "question_intent": "warmup",
            "role": "Software Engineer",
            "user_answer": "My answer"
        }
        response = test_client.post("/api/interview/answer/submit", json=invalid_data_missing_field)
        assert response.status_code == 422, f"Expected 422 for missing field, got {response.status_code}"

        # Test 2: Wrong data type (question_id should be int, not string)
        invalid_data_wrong_type = {
            "session_id": session_id,
            "question_id": "not_a_number",  # Should be int
            "question_text": "Test question",
            "question_intent": "warmup",
            "role": "Software Engineer",
            "user_answer": "My answer"
        }
        response = test_client.post("/api/interview/answer/submit", json=invalid_data_wrong_type)
        assert response.status_code == 422, f"Expected 422 for wrong type, got {response.status_code}"

        # Test 3: Empty required string field
        invalid_data_empty_string = {
            "session_id": session_id,
            "question_id": 1,
            "question_text": "",  # Empty string might be invalid depending on validation
            "question_intent": "warmup",
            "role": "Software Engineer",
            "user_answer": ""  # Empty answer
        }
        # Note: This might pass if empty strings are allowed - adjust based on your validation rules
        response = test_client.post("/api/interview/answer/submit", json=invalid_data_empty_string)
        # Just verify it doesn't cause a 500 error
        assert response.status_code != 500, "Server should not crash on empty strings"

        print(f"✓ Invalid answer data is validated and rejected appropriately")


    def test_database_only_storage(self, test_client, sample_session_data, multiple_answers_data, skip_if_no_database):
        """
        Test Case 6: Verify that answers are stored ONLY in the database,
        not in localStorage, and can be fetched by session_id for feedback.

        This test simulates the full interview flow:
        1. Create session (like Interview page does on load)
        2. Submit answers one by one (like clicking "Next")
        3. Fetch session details (like Feedback page does)
        4. Verify all data is retrieved from database

        Expected:
        - Session and answers are persisted in database
        - Full session details can be retrieved using only session_id
        - No dependency on localStorage for data retrieval
        """
        # =====================================================================
        # PHASE 1: Simulate Interview Page - Create Session
        # =====================================================================
        # In the real app, this happens when the Interview page loads
        session_id = create_test_session(test_client, sample_session_data)
        print(f"  [Interview Page] Session created: {session_id}")

        # =====================================================================
        # PHASE 2: Simulate Interview Page - Submit Answers
        # =====================================================================
        # In the real app, this happens each time user clicks "Next"
        submitted_answer_ids = []
        for answer in multiple_answers_data:
            answer_data = {**answer, "session_id": session_id}
            response = test_client.post("/api/interview/answer/submit", json=answer_data)
            assert response.status_code == 200
            submitted_answer_ids.append(response.json()["answer_id"])
            print(f"  [Interview Page] Answer {answer['question_id']} submitted")

        # =====================================================================
        # PHASE 3: Simulate Feedback Page - Fetch from Database
        # =====================================================================
        # In the real app, Feedback page only has session_id from localStorage
        # It must fetch ALL data from the database

        # This is exactly what the Feedback page does:
        response = test_client.get(f"/api/interview/session/{session_id}")
        assert response.status_code == 200, "Feedback page should be able to fetch session"

        session_data = response.json()

        # =====================================================================
        # PHASE 4: Verify Database Contains Everything Needed for Feedback
        # =====================================================================

        # Verify session metadata is present
        assert session_data["success"] is True
        assert session_data["session_id"] == session_id
        assert session_data["role"] == sample_session_data["role"]
        assert session_data["difficulty"] == sample_session_data["difficulty"]
        assert session_data["question_count"] == sample_session_data["question_count"]
        print(f"  [Feedback Page] Session metadata verified")

        # Verify plan is stored (needed for idealAnswer lookups)
        assert session_data["plan"] is not None
        assert "questions" in session_data["plan"]
        print(f"  [Feedback Page] Interview plan is available")

        # Verify all answers are present
        assert len(session_data["answers"]) == len(multiple_answers_data)
        print(f"  [Feedback Page] All {len(session_data['answers'])} answers retrieved")

        # Verify each answer has all required fields for scoring
        for i, answer in enumerate(session_data["answers"]):
            assert "question_id" in answer
            assert "question_text" in answer
            assert "user_answer" in answer
            assert "question_intent" in answer

            # Verify the data matches what was submitted
            expected = multiple_answers_data[i]
            assert answer["question_id"] == expected["question_id"]
            assert answer["user_answer"] == expected["user_answer"]
            assert answer["question_text"] == expected["question_text"]

        print(f"  [Feedback Page] All answer data verified for scoring")

        # =====================================================================
        # PHASE 5: Verify Feedback Page Can Build Scoring Request
        # =====================================================================
        # Transform database answers to scoring format (like Feedback.jsx does)
        scoring_answers = []
        for answer in session_data["answers"]:
            # Find matching question from plan for idealAnswer
            matching_q = next(
                (q for q in session_data["plan"]["questions"] if q["id"] == answer["question_id"]),
                None
            )

            scoring_answers.append({
                "id": answer["question_id"],
                "prompt": answer["question_text"],
                "interviewer": matching_q["interviewer"] if matching_q else "Interviewer",
                "type": answer["question_intent"],
                "userAnswer": answer["user_answer"],
                "idealAnswer": matching_q["idealAnswer"] if matching_q else ""
            })

        # Verify we have valid scoring data
        assert len(scoring_answers) == len(multiple_answers_data)
        for sa in scoring_answers:
            assert sa["id"] is not None
            assert sa["prompt"] is not None
            assert sa["userAnswer"] is not None

        print(f"  [Feedback Page] Scoring request can be built from database data")
        print(f"✓ Database-only storage verified: All data retrievable without localStorage")


@pytest.mark.integration
class TestSessionCreation:
    """
    Test class for session creation functionality.
    Ensures sessions are created correctly before answers can be stored.

    These are integration tests that require a real database connection.
    """

    def test_create_session_successfully(self, test_client, sample_session_data, skip_if_no_database):
        """
        Verify that a new interview session can be created.
        """
        response = test_client.post("/api/interview/session/create", json=sample_session_data)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "session_id" in data
        assert data["message"] == "Interview session created successfully"

        print(f"✓ Session created successfully with ID: {data['session_id']}")


    def test_session_stores_plan(self, test_client, sample_session_data, skip_if_no_database):
        """
        Verify that the interview plan is stored with the session.
        This is important for the Feedback page to access question details.
        """
        # Create session with plan
        session_id = create_test_session(test_client, sample_session_data)

        # Retrieve session and verify plan is stored
        response = test_client.get(f"/api/interview/session/{session_id}")
        assert response.status_code == 200

        data = response.json()
        assert data["plan"] is not None
        assert data["plan"]["meta"]["role"] == sample_session_data["plan"]["meta"]["role"]
        assert len(data["plan"]["questions"]) == len(sample_session_data["plan"]["questions"])

        print(f"✓ Interview plan is correctly stored with session")


# ============================================================================
# RUN TESTS
# ============================================================================

if __name__ == "__main__":
    # Run with: python -m pytest backend/tests/test_answer_storage.py -v
    pytest.main([__file__, "-v", "--tb=short"])
