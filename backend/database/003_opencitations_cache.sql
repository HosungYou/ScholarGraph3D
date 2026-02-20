-- ScholarGraph3D OpenCitations Cache Schema
-- v0.8.0: DOI-to-DOI citation cache from OpenCitations COCI
-- Reduces API calls and enables citation enrichment without S2 paper_id.
--
-- Run after: 001_initial_schema.sql, 002_personalization.sql

-- Cache table for OpenCitations COCI citation pairs
-- Stores individual (citing_doi, cited_doi) relationships.
-- Populated lazily on first API call; TTL enforced by application logic.
CREATE TABLE IF NOT EXISTS oc_citation_cache (
    citing_doi  TEXT        NOT NULL,
    cited_doi   TEXT        NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (citing_doi, cited_doi)
);

-- Index for forward lookup: "papers that cite this DOI"
CREATE INDEX IF NOT EXISTS idx_oc_cache_citing
    ON oc_citation_cache (citing_doi);

-- Index for reverse lookup: "papers cited by this DOI"
CREATE INDEX IF NOT EXISTS idx_oc_cache_cited
    ON oc_citation_cache (cited_doi);

-- Index for TTL expiry queries (find stale entries)
CREATE INDEX IF NOT EXISTS idx_oc_cache_fetched
    ON oc_citation_cache (fetched_at);

-- Metadata table: tracks which DOIs have been fully fetched
-- Avoids re-fetching DOIs with zero results (empty set vs. not-yet-fetched).
CREATE TABLE IF NOT EXISTS oc_fetch_log (
    doi         TEXT        PRIMARY KEY,
    direction   TEXT        NOT NULL CHECK (direction IN ('citations', 'references', 'both')),
    result_count INT        NOT NULL DEFAULT 0,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_fetch_log_doi
    ON oc_fetch_log (doi);

-- View: find DOIs where OC cache is stale (older than 30 days)
CREATE OR REPLACE VIEW oc_stale_cache AS
SELECT DISTINCT citing_doi AS doi, 'citations' AS direction
FROM oc_citation_cache
WHERE fetched_at < NOW() - INTERVAL '30 days'
UNION
SELECT DISTINCT cited_doi AS doi, 'references' AS direction
FROM oc_citation_cache
WHERE fetched_at < NOW() - INTERVAL '30 days';

COMMENT ON TABLE oc_citation_cache IS
    'Cache of OpenCitations COCI DOI-to-DOI citation pairs. '
    'Populated lazily on API call; stale entries (>30d) refreshed on next access.';

COMMENT ON TABLE oc_fetch_log IS
    'Tracks which DOIs have been fetched from OpenCitations. '
    'Prevents re-fetching DOIs with zero citations (empty set detection).';
