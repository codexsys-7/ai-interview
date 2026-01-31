-- Migration: 001_migrate_interview_sessions_to_uuid.sql
-- Description: Converts interview_sessions.id from INTEGER to UUID for better security and consistency
-- Phase 1: Two-way interview communication - Schema standardization

-- Step 1: Add new UUID column
ALTER TABLE interview_sessions
ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();

-- Step 2: Populate UUID for existing rows (if any)
UPDATE interview_sessions
SET uuid_id = gen_random_uuid()
WHERE uuid_id IS NULL;

-- Step 3: Drop the old primary key constraint
ALTER TABLE interview_sessions
DROP CONSTRAINT IF EXISTS interview_sessions_pkey;

-- Step 4: Drop the old id column
ALTER TABLE interview_sessions
DROP COLUMN id;

-- Step 5: Rename uuid_id to id
ALTER TABLE interview_sessions
RENAME COLUMN uuid_id TO id;

-- Step 6: Add primary key constraint on new UUID column
ALTER TABLE interview_sessions
ADD PRIMARY KEY (id);

-- Step 7: Set NOT NULL and default
ALTER TABLE interview_sessions
ALTER COLUMN id SET NOT NULL,
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Add comment for documentation
COMMENT ON TABLE interview_sessions IS 'Interview sessions with UUID primary key for secure, non-enumerable references';
