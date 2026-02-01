"""
Conversation Context Builder Service

This service builds AI-ready context from past interview answers.
It enables the AI interviewer to:
- Remember what the candidate has already discussed
- Avoid asking redundant questions
- Build upon previous answers with follow-up questions
- Maintain conversation coherence throughout the interview
"""

import os
import json
from typing import List, Optional, Dict
from openai import OpenAI
from sqlmodel import Session, select

# Import from parent directory
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import engine, InterviewAnswer


# Initialize OpenAI client for topic extraction
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def build_conversation_summary(session_id: str) -> str:
    """
    Build a comprehensive summary of all past answers in an interview session.

    This function retrieves all answers from a session and formats them into
    a structured string that can be included in an AI prompt. The summary
    provides the AI with full context of what has been discussed.

    Args:
        session_id: UUID of the interview session

    Returns:
        A formatted string containing all Q&A pairs, organized chronologically.
        Returns empty string if no answers exist.

    Example output:
        "=== Interview Context ===

        Q1 (Technical Skills - Tech Lead):
        Question: Explain your experience with microservices.
        Candidate's Answer: I have 3 years of experience building microservices...

        Q2 (Problem Solving - Manager):
        Question: Describe a challenging bug you fixed.
        Candidate's Answer: Recently, I encountered a memory leak..."
    """

    with Session(engine) as db_session:
        # Fetch all answers for this session, ordered chronologically
        answers = db_session.exec(
            select(InterviewAnswer)
            .where(InterviewAnswer.session_id == session_id)
            .order_by(InterviewAnswer.answer_timestamp)
        ).all()

        # Return empty string if no answers exist
        if not answers:
            return ""

        # Build the formatted summary
        summary_parts = ["=== Interview Context ===\n"]

        for answer in answers:
            # Format each Q&A pair with metadata
            qa_block = f"""
Q{answer.question_id} ({answer.question_intent} - {answer.role}):
Question: {answer.question_text}
Candidate's Answer: {answer.user_answer}
"""
            summary_parts.append(qa_block)

        return "\n".join(summary_parts)


def extract_topics(session_id: str) -> List[str]:
    """
    Extract main topics discussed in the interview using AI analysis.

    This function analyzes all answers in a session and identifies the key
    topics, technologies, and themes the candidate has discussed. This helps
    the AI interviewer understand what ground has been covered.

    Args:
        session_id: UUID of the interview session

    Returns:
        List of topic strings (e.g., ["Python", "microservices", "team leadership"])
        Returns empty list if no answers exist or extraction fails.

    Use cases:
        - Avoid asking about topics already covered
        - Identify gaps in coverage
        - Generate follow-up questions on specific topics
    """

    with Session(engine) as db_session:
        # Fetch all answers for this session
        answers = db_session.exec(
            select(InterviewAnswer)
            .where(InterviewAnswer.session_id == session_id)
            .order_by(InterviewAnswer.answer_timestamp)
        ).all()

        # Return empty list if no answers exist
        if not answers:
            return []

        # Combine all answers into one text block for analysis
        combined_text = "\n\n".join([
            f"Q: {answer.question_text}\nA: {answer.user_answer}"
            for answer in answers
        ])

        # Use OpenAI to extract topics
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                temperature=0.3,
                messages=[
                    {
                        "role": "system",
                        "content": """You are a topic extraction assistant.
Analyze the interview Q&A and extract the main topics discussed.
Return ONLY a JSON array of topic strings.
Focus on: technologies, skills, concepts, methodologies, and key themes.
Limit to 10 most relevant topics.
Example: ["Python", "REST APIs", "team leadership", "agile methodology"]"""
                    },
                    {
                        "role": "user",
                        "content": f"Extract topics from this interview:\n\n{combined_text}"
                    }
                ]
            )

            # Parse the response
            topics_json = response.choices[0].message.content.strip()

            # Handle potential markdown code blocks
            if topics_json.startswith("```"):
                topics_json = topics_json.split("```")[1]
                if topics_json.startswith("json"):
                    topics_json = topics_json[4:]

            topics = json.loads(topics_json)
            return topics if isinstance(topics, list) else []

        except Exception as e:
            # Log error and return empty list on failure
            print(f"Failed to extract topics: {str(e)}")
            return []


def get_recent_context(session_id: str, num_answers: int = 3) -> str:
    """
    Get the most recent N answers for immediate conversation context.

    This function retrieves the last few answers to provide short-term
    memory for the AI. This is useful for generating contextual follow-up
    questions based on the candidate's recent responses.

    Args:
        session_id: UUID of the interview session
        num_answers: Number of recent answers to include (default: 3)

    Returns:
        A formatted string with the most recent Q&A pairs.
        Returns empty string if no answers exist.

    Example output:
        "=== Recent Discussion ===

        [Previous] Q: How do you handle code reviews?
        Candidate: I focus on constructive feedback and knowledge sharing...

        [Most Recent] Q: What testing strategies do you use?
        Candidate: I believe in a combination of unit tests and integration tests..."
    """

    with Session(engine) as db_session:
        # Fetch the most recent N answers, ordered by timestamp descending
        answers = db_session.exec(
            select(InterviewAnswer)
            .where(InterviewAnswer.session_id == session_id)
            .order_by(InterviewAnswer.answer_timestamp.desc())
            .limit(num_answers)
        ).all()

        # Return empty string if no answers exist
        if not answers:
            return ""

        # Reverse to get chronological order (oldest first)
        answers = list(reversed(answers))

        # Build the formatted context
        context_parts = ["=== Recent Discussion ===\n"]

        for i, answer in enumerate(answers):
            # Label the most recent answer
            if i == len(answers) - 1:
                label = "[Most Recent]"
            else:
                label = "[Previous]"

            qa_block = f"""
{label} Q: {answer.question_text}
Candidate: {answer.user_answer}
"""
            context_parts.append(qa_block)

        return "\n".join(context_parts)


def detect_repeated_topics(session_id: str) -> Dict[str, int]:
    """
    Detect which topics the candidate mentions multiple times across answers.

    Topics mentioned repeatedly indicate passion areas, core competencies,
    or areas of deep experience. This information helps the AI interviewer:
    - Identify the candidate's strengths and interests
    - Ask deeper follow-up questions on these topics
    - Understand what the candidate is most confident discussing

    Args:
        session_id: UUID of the interview session

    Returns:
        Dictionary mapping topic names to mention counts.
        Only includes topics mentioned 2+ times.
        Example: {"machine learning": 3, "Python": 4, "API design": 2}
        Returns empty dict if no repeated topics found.

    How it works:
        1. Fetches all answers for the session
        2. Uses AI to extract topics from each individual answer
        3. Normalizes topic names (lowercase) for accurate counting
        4. Aggregates counts across all answers
        5. Filters to only topics mentioned 2+ times
    """

    with Session(engine) as db_session:
        # Step 1: Fetch all answers for this session
        answers = db_session.exec(
            select(InterviewAnswer)
            .where(InterviewAnswer.session_id == session_id)
            .order_by(InterviewAnswer.answer_timestamp)
        ).all()

        # Return empty dict if no answers exist
        if not answers:
            return {}

        # Step 2: Extract topics from each answer individually
        all_topics = []

        for answer in answers:
            # Combine question and answer for context
            text = f"Q: {answer.question_text}\nA: {answer.user_answer}"

            try:
                # Use AI to extract topics from this specific answer
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    temperature=0.2,
                    messages=[
                        {
                            "role": "system",
                            "content": """You are a topic extraction assistant.
Extract the main topics mentioned in this single Q&A pair.
Return ONLY a JSON array of topic strings (lowercase).
Focus on: technologies, skills, concepts, tools, and methodologies.
Limit to 5 most relevant topics per answer.
Example: ["python", "rest apis", "database design"]"""
                        },
                        {
                            "role": "user",
                            "content": text
                        }
                    ]
                )

                # Parse the response
                topics_json = response.choices[0].message.content.strip()

                # Handle potential markdown code blocks
                if topics_json.startswith("```"):
                    topics_json = topics_json.split("```")[1]
                    if topics_json.startswith("json"):
                        topics_json = topics_json[4:]

                topics = json.loads(topics_json)

                # Normalize to lowercase and add to list
                if isinstance(topics, list):
                    all_topics.extend([t.lower().strip() for t in topics if isinstance(t, str)])

            except Exception as e:
                # Log error but continue processing other answers
                print(f"Failed to extract topics from answer {answer.question_id}: {str(e)}")
                continue

        # Step 3: Count topic occurrences
        topic_counts = {}
        for topic in all_topics:
            topic_counts[topic] = topic_counts.get(topic, 0) + 1

        # Step 4: Filter to only topics mentioned 2+ times
        repeated_topics = {
            topic: count
            for topic, count in topic_counts.items()
            if count >= 2
        }

        # Step 5: Sort by count (highest first) and return
        return dict(sorted(repeated_topics.items(), key=lambda x: x[1], reverse=True))
