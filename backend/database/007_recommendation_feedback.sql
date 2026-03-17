CREATE TABLE IF NOT EXISTS recommendation_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    source_paper_id TEXT NOT NULL,
    candidate_paper_id TEXT NOT NULL,
    feedback TEXT NOT NULL CHECK (feedback IN ('relevant', 'not_now')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, source_paper_id, candidate_paper_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_user_source
    ON recommendation_feedback(user_id, source_paper_id);
