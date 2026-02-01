"""
Contradiction Detector Service

This service detects when a candidate makes contradictory statements
during an interview. Contradictions may indicate:
- Nervousness or stress
- Inconsistent thinking
- Potential dishonesty
- Misunderstanding of questions

The AI interviewer can use this information to:
- Ask clarifying follow-up questions (during interview)
- Provide feedback on consistency in the final report (after interview)
"""

import os
import json
from typing import List, Dict, Optional
from openai import OpenAI
from sqlmodel import Session, select

# Import from parent directory
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import engine, InterviewAnswer


# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


async def detect_contradictions(
    session_id: str,
    current_answer: str,
    current_question: Optional[str] = None
) -> List[Dict]:
    """
    Compare current answer with all past answers to find semantic contradictions.

    This function analyzes the candidate's current response against their
    previous answers to detect inconsistencies or contradictory statements.

    Dual purpose:
    1. During interview: Generate clarifying follow-up questions
    2. After interview: Include in feedback report for consistency analysis

    Args:
        session_id: UUID of the interview session
        current_answer: The candidate's most recent answer text
        current_question: Optional context of what was asked (improves accuracy)

    Returns:
        List of contradiction dictionaries, each containing:
        - past_answer_id: UUID of the contradicting past answer
        - past_question: The question that was asked previously
        - past_statement: The contradicting statement from past answer
        - current_statement: The contradicting statement from current answer
        - contradiction_type: Category of contradiction (see types below)
        - confidence_score: How confident the AI is (0.0 to 1.0)
        - explanation: Brief explanation of why this is a contradiction

    Contradiction types:
        - "direct": Explicit opposite statements ("I love X" vs "I hate X")
        - "behavioral": Conflicting behaviors ("I always do X" vs "I never do X")
        - "preference": Conflicting preferences ("I prefer X" vs "I prefer Y over X")
        - "experience": Conflicting experience claims ("I have done X" vs "I haven't done X")
        - "opinion": Conflicting opinions on same topic

    Example:
        Past: "I love working in collaborative teams"
        Current: "I prefer working alone and find teams distracting"
        Result: {
            "past_answer_id": "abc-123",
            "past_statement": "I love working in collaborative teams",
            "current_statement": "I prefer working alone and find teams distracting",
            "contradiction_type": "preference",
            "confidence_score": 0.92,
            "explanation": "Candidate expresses opposite preferences about teamwork"
        }
    """

    # Step 1: Fetch all past answers for this session
    with Session(engine) as db_session:
        past_answers = db_session.exec(
            select(InterviewAnswer)
            .where(InterviewAnswer.session_id == session_id)
            .order_by(InterviewAnswer.answer_timestamp)
        ).all()

        # Return empty list if no past answers to compare against
        if not past_answers:
            return []

        # Store answers as list of dicts for processing
        past_answers_data = [
            {
                "id": str(answer.id),
                "question_id": answer.question_id,
                "question": answer.question_text,
                "answer": answer.user_answer
            }
            for answer in past_answers
        ]

    # Step 2: Build the prompt for contradiction detection
    past_answers_text = "\n\n".join([
        f"[Answer {a['question_id']}] (ID: {a['id']})\nQ: {a['question']}\nA: {a['answer']}"
        for a in past_answers_data
    ])

    current_context = f"Q: {current_question}\nA: {current_answer}" if current_question else f"A: {current_answer}"

    # Step 3: Use OpenAI to detect contradictions
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": """You are a contradiction detection assistant for interview analysis.

Your task is to compare a candidate's CURRENT answer with their PAST answers and identify any contradictions.

A contradiction occurs when the candidate makes statements that conflict with or oppose their previous statements.

Types of contradictions to detect:
- "direct": Explicit opposite statements ("I love X" vs "I hate X")
- "behavioral": Conflicting behaviors ("I always do X" vs "I never do X")
- "preference": Conflicting preferences ("I prefer X" vs "I prefer Y over X")
- "experience": Conflicting experience claims ("I have done X" vs "I haven't done X")
- "opinion": Conflicting opinions on the same topic

Important guidelines:
- Only flag genuine contradictions, not nuanced or contextual differences
- A person can like both teamwork AND solo work - that's not a contradiction
- Consider that answers may be context-dependent (different situations)
- Be conservative - only flag clear contradictions with high confidence
- Confidence should be 0.7+ for genuine contradictions

Return a JSON array of contradictions. If no contradictions found, return empty array [].

Each contradiction object must have:
{
    "past_answer_id": "the ID from the past answer",
    "past_question": "the question that was asked",
    "past_statement": "the specific contradicting statement from past",
    "current_statement": "the specific contradicting statement from current",
    "contradiction_type": "one of: direct, behavioral, preference, experience, opinion",
    "confidence_score": 0.0 to 1.0,
    "explanation": "brief explanation of the contradiction"
}"""
                },
                {
                    "role": "user",
                    "content": f"""PAST ANSWERS:
{past_answers_text}

CURRENT ANSWER:
{current_context}

Analyze and return any contradictions as a JSON array:"""
                }
            ]
        )

        # Step 4: Parse the response
        result_text = response.choices[0].message.content.strip()

        # Handle potential markdown code blocks
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
            result_text = result_text.strip()

        contradictions = json.loads(result_text)

        # Validate and filter results
        if not isinstance(contradictions, list):
            return []

        # Filter to only include properly formatted contradictions with good confidence
        valid_contradictions = []
        for c in contradictions:
            if (
                isinstance(c, dict)
                and "past_answer_id" in c
                and "confidence_score" in c
                and c.get("confidence_score", 0) >= 0.7  # Only high-confidence contradictions
            ):
                valid_contradictions.append(c)

        return valid_contradictions

    except Exception as e:
        # Log error and return empty list on failure
        print(f"Failed to detect contradictions: {str(e)}")
        return []


def get_contradiction_summary(contradictions: List[Dict]) -> str:
    """
    Generate a human-readable summary of detected contradictions.

    This is used in the final feedback report to show the candidate
    where they were inconsistent during the interview.

    Args:
        contradictions: List of contradiction dictionaries from detect_contradictions()

    Returns:
        Formatted string summarizing all contradictions.
        Returns empty string if no contradictions.

    Example output:
        "=== Consistency Check ===

        Potential contradiction #1 (confidence: 92%):
        Earlier, you said: "I love working in teams"
        But now you said: "I prefer working alone"
        Type: preference conflict
        Explanation: Candidate expresses opposite preferences about teamwork"
    """

    if not contradictions:
        return ""

    summary_parts = ["=== Consistency Check ===\n"]

    for i, c in enumerate(contradictions, 1):
        confidence_pct = int(c.get("confidence_score", 0) * 100)
        summary_parts.append(f"""
Potential contradiction #{i} (confidence: {confidence_pct}%):
Earlier, you said: "{c.get('past_statement', 'N/A')}"
But now you said: "{c.get('current_statement', 'N/A')}"
Type: {c.get('contradiction_type', 'unknown')} conflict
Explanation: {c.get('explanation', 'N/A')}
""")

    return "\n".join(summary_parts)


def generate_followup_question(contradiction: Dict) -> str:
    """
    Generate a follow-up question to clarify a detected contradiction.

    This is used during the interview to ask the candidate to clarify
    inconsistencies in a professional, non-confrontational way.

    Args:
        contradiction: A single contradiction dictionary from detect_contradictions()

    Returns:
        A professionally worded follow-up question string.

    Example:
        Input: {"past_statement": "I love teamwork", "current_statement": "I prefer solo work"}
        Output: "Earlier you mentioned enjoying teamwork, but you also mentioned
                 preferring to work alone. Could you help me understand how you
                 balance both approaches in your work?"
    """

    past = contradiction.get("past_statement", "")
    current = contradiction.get("current_statement", "")
    contradiction_type = contradiction.get("contradiction_type", "")

    # Generate a tactful follow-up question
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.7,
            messages=[
                {
                    "role": "system",
                    "content": """You are a professional interviewer. Generate a tactful,
non-confrontational follow-up question to clarify an apparent inconsistency
in the candidate's answers.

The question should:
- Be professional and respectful
- Give the candidate a chance to explain
- Not accuse or make them defensive
- Sound natural and conversational

Return ONLY the follow-up question, nothing else."""
                },
                {
                    "role": "user",
                    "content": f"""The candidate previously said: "{past}"
But now said: "{current}"
Contradiction type: {contradiction_type}

Generate a follow-up question:"""
                }
            ]
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        # Fallback to a generic question
        print(f"Failed to generate follow-up question: {str(e)}")
        return "Could you help me understand how you balance these different approaches in your work?"
