-- Migration: 002_add_interview_answers_table.sql
-- Description: Creates the interview_answers table for storing individual Q&A pairs
-- Phase 1: Two-way interview communication - Answer Storage System

-- Create the interview_answers table
CREATE TABLE IF NOT EXISTS interview_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_intent VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    user_answer TEXT NOT NULL,
    transcript_raw TEXT,
    audio_duration_seconds DECIMAL(10,2),
    answer_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for optimized queries
CREATE INDEX idx_interview_answers_session_id ON interview_answers(session_id);
CREATE INDEX idx_interview_answers_question_id ON interview_answers(question_id);
CREATE INDEX idx_interview_answers_answer_timestamp ON interview_answers(answer_timestamp);

-- Add comment to table for documentation
COMMENT ON TABLE interview_answers IS 'Stores individual interview question-answer pairs for two-way communication feature';
