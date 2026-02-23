-- Migration: Add graph_data JSONB column to user_graphs table
-- This stores the complete GraphData (nodes, edges, clusters, meta) as a single JSONB blob
-- for reliable save/restore of seed exploration sessions.

ALTER TABLE user_graphs ADD COLUMN IF NOT EXISTS graph_data JSONB;

-- Index for querying graph metadata
CREATE INDEX IF NOT EXISTS idx_user_graphs_graph_data_gin ON user_graphs USING GIN (graph_data jsonb_path_ops);

-- Update comment
COMMENT ON COLUMN user_graphs.graph_data IS 'Complete GraphData (nodes, edges, clusters, meta) as JSONB for seed exploration save/restore';
