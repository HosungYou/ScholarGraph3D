CREATE TABLE paper_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    paper_id TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    memo TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, paper_id)
);
CREATE INDEX idx_paper_bookmarks_user ON paper_bookmarks(user_id);
CREATE INDEX idx_paper_bookmarks_tags ON paper_bookmarks USING GIN(tags);
