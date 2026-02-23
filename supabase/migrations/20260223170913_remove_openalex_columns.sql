-- Migration: Remove OpenAlex columns from papers table
-- v2.0 removed OpenAlex integration entirely (Semantic Scholar only).
-- These columns are unused and always NULL for new papers.

-- Drop the OpenAlex-specific index first
DROP INDEX IF EXISTS idx_papers_oa_id;

-- Remove OpenAlex columns from papers table
ALTER TABLE papers DROP COLUMN IF EXISTS oa_work_id;
ALTER TABLE papers DROP COLUMN IF EXISTS oa_topics;

-- Update table comment to reflect S2-only data source
COMMENT ON TABLE papers IS 'Paper metadata from Semantic Scholar (v2.0+)';
