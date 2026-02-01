"""
Embedding Service for Semantic Search
Generates and compares embeddings using OpenAI's text-embedding-3-small model.
"""

import os
import json
import math
from typing import List, Optional
from openai import OpenAI
from sqlmodel import Session, select

# Import from parent directory
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import engine, InterviewAnswer


# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Model for embeddings - text-embedding-3-small produces 1536 dimensions
EMBEDDING_MODEL = "text-embedding-3-small"


def generate_embedding(text: str) -> List[float]:
    """
    Generate embedding for text using OpenAI's text-embedding-3-small model.

    Args:
        text: The text to generate embedding for

    Returns:
        List of 1536 floats representing the embedding vector
    """
    if not text or not text.strip():
        raise ValueError("Text cannot be empty")

    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text.strip()
    )

    return response.data[0].embedding


def calculate_similarity(embedding1: List[float], embedding2: List[float]) -> float:
    """
    Calculate cosine similarity between two embedding vectors.

    Args:
        embedding1: First embedding vector
        embedding2: Second embedding vector

    Returns:
        Cosine similarity score between -1 and 1 (higher = more similar)
    """
    if len(embedding1) != len(embedding2):
        raise ValueError("Embeddings must have the same dimension")

    # Calculate dot product
    dot_product = sum(a * b for a, b in zip(embedding1, embedding2))

    # Calculate magnitudes
    magnitude1 = math.sqrt(sum(a * a for a in embedding1))
    magnitude2 = math.sqrt(sum(b * b for b in embedding2))

    # Avoid division by zero
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0

    return dot_product / (magnitude1 * magnitude2)


def find_similar_answers(
    session_id: str,
    query_embedding: List[float],
    top_k: int = 5
) -> List[dict]:
    """
    Find the most similar answers within a session based on embedding similarity.

    Args:
        session_id: The interview session ID to search within
        query_embedding: The embedding vector to compare against
        top_k: Number of top results to return

    Returns:
        List of answers with similarity scores, sorted by similarity (highest first)
    """
    with Session(engine) as session:
        # Get all answers for this session that have embeddings
        statement = select(InterviewAnswer).where(
            InterviewAnswer.session_id == session_id,
            InterviewAnswer.embedding.isnot(None)
        )
        answers = session.exec(statement).all()

        # Calculate similarity for each answer
        results = []
        for answer in answers:
            # Parse the stored embedding from JSON string
            stored_embedding = json.loads(answer.embedding)
            similarity = calculate_similarity(query_embedding, stored_embedding)

            results.append({
                "answer_id": answer.id,
                "question_id": answer.question_id,
                "question_text": answer.question_text,
                "user_answer": answer.user_answer,
                "role": answer.role,
                "similarity": round(similarity, 4)
            })

        # Sort by similarity (highest first) and return top_k
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_k]
