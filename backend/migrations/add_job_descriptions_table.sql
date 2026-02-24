-- Migration: Add job_descriptions table
-- Description: Store job description data for personalized interviews
-- Created: 2024-02-06

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- Create the job_descriptions table
CREATE TABLE IF NOT EXISTS job_descriptions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to interview session (one-to-one relationship)
    session_id UUID NOT NULL UNIQUE,

    -- Company information
    company_name VARCHAR(255),
    company_description TEXT,

    -- Role information
    job_title VARCHAR(255) NOT NULL,
    team_name VARCHAR(255),
    location VARCHAR(255),

    -- Role details stored as JSON strings
    -- These contain arrays of responsibilities, requirements, etc.
    responsibilities TEXT,  -- JSON array as string: ["Build systems", "Design APIs"]
    requirements TEXT,      -- JSON array as string: ["5+ years Python", "System design"]
    nice_to_have TEXT,      -- JSON array as string: ["Go experience", "Cloud platforms"]

    -- Full job description text
    role_description TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key constraint
    CONSTRAINT fk_job_descriptions_session
        FOREIGN KEY (session_id)
        REFERENCES interview_sessions(id)
        ON DELETE CASCADE
);

-- Create index on session_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_descriptions_session_id
    ON job_descriptions(session_id);

-- Create index on company_name for filtering/searching
CREATE INDEX IF NOT EXISTS idx_job_descriptions_company_name
    ON job_descriptions(company_name);

-- Create index on job_title for filtering/searching
CREATE INDEX IF NOT EXISTS idx_job_descriptions_job_title
    ON job_descriptions(job_title);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_job_descriptions_created_at
    ON job_descriptions(created_at);

-- Add comment to table
COMMENT ON TABLE job_descriptions IS 'Stores job description data for personalized interview experiences';

-- Add comments to columns
COMMENT ON COLUMN job_descriptions.session_id IS 'References the interview session this JD belongs to';
COMMENT ON COLUMN job_descriptions.company_name IS 'Name of the company offering the position';
COMMENT ON COLUMN job_descriptions.company_description IS 'Brief description of the company';
COMMENT ON COLUMN job_descriptions.job_title IS 'Title of the position being interviewed for';
COMMENT ON COLUMN job_descriptions.team_name IS 'Name of the team within the company';
COMMENT ON COLUMN job_descriptions.location IS 'Job location (e.g., "Remote", "San Francisco, CA")';
COMMENT ON COLUMN job_descriptions.responsibilities IS 'JSON array of job responsibilities';
COMMENT ON COLUMN job_descriptions.requirements IS 'JSON array of required qualifications';
COMMENT ON COLUMN job_descriptions.nice_to_have IS 'JSON array of preferred/bonus qualifications';
COMMENT ON COLUMN job_descriptions.role_description IS 'Full text of the job description';


-- ============================================================================
-- DOWN MIGRATION (for rollback)
-- ============================================================================

-- To rollback this migration, run:
-- DROP TABLE IF EXISTS job_descriptions CASCADE;


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- After running the migration, verify with:
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'job_descriptions';

-- Check constraints:
-- SELECT constraint_name, constraint_type
-- FROM information_schema.table_constraints
-- WHERE table_name = 'job_descriptions';


-- ============================================================================
-- EXAMPLE DATA (for testing)
-- ============================================================================

-- Example insert (uncomment to test):
-- INSERT INTO job_descriptions (
--     session_id,
--     company_name,
--     job_title,
--     team_name,
--     location,
--     responsibilities,
--     requirements,
--     nice_to_have,
--     company_description,
--     role_description
-- ) VALUES (
--     '550e8400-e29b-41d4-a716-446655440000',  -- Replace with actual session_id
--     'Google',
--     'Senior Software Engineer',
--     'Backend Infrastructure Team',
--     'Remote / San Francisco',
--     '["Build scalable distributed systems", "Design APIs for billions of users", "Mentor junior engineers"]',
--     '["5+ years Python experience", "Strong system design skills", "Experience with microservices"]',
--     '["Go or Rust experience", "Cloud platform expertise"]',
--     'Google is a leading technology company focused on organizing the world''s information.',
--     'Join our backend team to build the infrastructure that powers Google''s core services.'
-- );
