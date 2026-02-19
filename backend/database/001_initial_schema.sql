-- ScholarGraph3D Initial Schema
-- Requires: pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

-- Papers table: unified paper metadata from OpenAlex + Semantic Scholar
CREATE TABLE papers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    s2_paper_id TEXT UNIQUE,
    oa_work_id TEXT UNIQUE,
    doi TEXT,
    title TEXT NOT NULL,
    abstract TEXT,
    year INT,
    venue TEXT,
    citation_count INT DEFAULT 0,
    fields_of_study TEXT[],
    oa_topics JSONB,
    tldr TEXT,
    embedding vector(768),
    is_open_access BOOLEAN,
    oa_url TEXT,
    authors JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_api_sync TIMESTAMPTZ
);

CREATE INDEX idx_papers_doi ON papers(doi) WHERE doi IS NOT NULL;
CREATE INDEX idx_papers_s2_id ON papers(s2_paper_id) WHERE s2_paper_id IS NOT NULL;
CREATE INDEX idx_papers_oa_id ON papers(oa_work_id) WHERE oa_work_id IS NOT NULL;
CREATE INDEX idx_papers_embedding ON papers USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Citations table: citation relationships between papers
CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citing_paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
    cited_paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
    intent TEXT,
    is_influential BOOLEAN DEFAULT FALSE,
    context TEXT,
    UNIQUE(citing_paper_id, cited_paper_id)
);

CREATE INDEX idx_citations_citing ON citations(citing_paper_id);
CREATE INDEX idx_citations_cited ON citations(cited_paper_id);

-- User graphs: saved graph states
CREATE TABLE user_graphs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    seed_query TEXT,
    paper_ids UUID[],
    layout_state JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_graphs_user ON user_graphs(user_id);

-- Search cache: stores search results for 24h
CREATE TABLE search_cache (
    cache_key TEXT PRIMARY KEY,
    nodes JSONB NOT NULL,
    edges JSONB NOT NULL,
    clusters JSONB NOT NULL,
    meta JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_cache_created ON search_cache(created_at);

-- Watch queries: saved search alerts
CREATE TABLE watch_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    query TEXT NOT NULL,
    filters JSONB,
    last_checked TIMESTAMPTZ,
    notify_email BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watch_queries_user ON watch_queries(user_id);

-- ==================== Phase 2: Chat History ====================

-- Chat conversations: groups of messages in a GraphRAG session
CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    graph_id UUID REFERENCES user_graphs(id) ON DELETE SET NULL,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX idx_chat_conversations_graph ON chat_conversations(graph_id);

-- Chat messages: individual messages within a conversation
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB,
    highlighted_papers TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
