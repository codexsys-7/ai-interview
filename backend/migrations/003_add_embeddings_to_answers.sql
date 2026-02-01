-- Migration: Add embeddings column to interview_answers table
-- Purpose: Store OpenAI embeddings (1536 dimensions) for semantic search

-- Option A: If pgvector extension is available (recommended for production)
-- CREATE EXTENSION IF NOT EXISTS vector;
-- ALTER TABLE interview_answers ADD COLUMN embedding vector(1536);

-- Option B: Store as TEXT (JSON array) - works without extensions
ALTER TABLE interview_answers
ADD COLUMN IF NOT EXISTS embedding TEXT;

-- Add comment for documentation
COMMENT ON COLUMN interview_answers.embedding IS 'OpenAI text-embedding-ada-002 vector stored as JSON array (1536 dimensions)';

-- Optional: Add index for faster lookups (useful when filtering by session before similarity search)
CREATE INDEX IF NOT EXISTS idx_interview_answers_session_embedding
ON interview_answers(session_id)
WHERE embedding IS NOT NULL;
