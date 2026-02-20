-- ScholarGraph3D Personalization Schema
-- Phase 5: User profiles, search history, interactions, and recommendations
-- Requires: 001_initial_schema.sql (for papers table and vector extension)

-- User research profiles and preferences
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY,
    display_name TEXT,
    avatar_url TEXT,
    research_interests TEXT[] DEFAULT '{}',
    preferred_fields TEXT[] DEFAULT '{}',
    interest_embedding vector(768),
    default_year_min INT,
    default_year_max INT,
    default_min_citations INT DEFAULT 0,
    preferred_result_count INT DEFAULT 50,
    total_searches INT DEFAULT 0,
    total_papers_viewed INT DEFAULT 0,
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search history for personalization learning
CREATE TABLE IF NOT EXISTS user_search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    query TEXT NOT NULL,
    mode TEXT DEFAULT 'keyword',
    result_count INT,
    filters_used JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user
    ON user_search_history(user_id, created_at DESC);

-- Paper interaction events for behavior learning
CREATE TABLE IF NOT EXISTS user_paper_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN (
        'view', 'save_graph', 'expand_citations', 'chat_mention', 'lit_review'
    )),
    session_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_user
    ON user_paper_interactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_paper
    ON user_paper_interactions(paper_id);

-- Cached recommendation results (24-hour TTL)
CREATE TABLE IF NOT EXISTS user_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
    score FLOAT NOT NULL,
    explanation TEXT,
    reason_tags TEXT[] DEFAULT '{}',
    is_dismissed BOOLEAN DEFAULT FALSE,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user
    ON user_recommendations(user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendations_active
    ON user_recommendations(user_id, is_dismissed, expires_at)
    WHERE is_dismissed = FALSE;

-- Auto-update updated_at on user_profiles
CREATE OR REPLACE FUNCTION update_user_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_profile_updated_at ON user_profiles;
CREATE TRIGGER trigger_user_profile_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_user_profile_timestamp();
