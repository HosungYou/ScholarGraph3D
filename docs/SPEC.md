# ScholarGraph3D — Technical Specification

> **Version:** 1.1 | **Last Updated:** 2026-02-19
> **Related:** [PRD.md](./PRD.md) | [ARCHITECTURE.md](./ARCHITECTURE.md) | [SDD/TDD Plan](./SDD_TDD_PLAN.md)

---

## Document Map

```
PRD.md                      — What we build and why (user stories, acceptance criteria)
  |
  +-- SPEC.md (this file)   — How it works technically
  |     |
  |     +-- SS1  System Overview
  |     +-- SS2  Market Analysis
  |     +-- SS3  Data Sources
  |     +-- SS4  API Specification
  |     +-- SS5  Database Schema
  |     +-- SS6  3D Visualization Spec
  |     +-- SS7  Search Pipeline Spec
  |     +-- SS8  Caching Strategy
  |     +-- SS9  Authentication & Authorization
  |     +-- SS10 Performance Requirements
  |     +-- SS11 Testing Requirements
  |
  +-- ARCHITECTURE.md       — How the system is structured
  +-- SDD_TDD_PLAN.md       — How we verify correctness
```

---

## 1. System Overview

ScholarGraph3D is a full-stack web application that transforms keyword searches into interactive 3D knowledge graphs of academic papers. The system ingests data from two academic APIs (OpenAlex and Semantic Scholar), fuses them via DOI deduplication, computes SPECTER2 embeddings, reduces to 3D coordinates, clusters papers, and renders an interactive WebGL visualization.

### Core Data Flow

```
User Query
    |
    v
[FastAPI Backend]
    |
    +-- OpenAlex API (CC0 metadata, abstracts, topics)
    +-- Semantic Scholar API (TLDR, SPECTER2 embeddings, citation intents)
    |
    v
[DataFusionService] -- DOI dedup + abstract fallback
    |
    v
[SPECTER2 Embeddings] -- 768-dim vectors per paper
    |
    v
[UMAP Reducer] -- 768D -> 3D coordinates
    |
    v
[HDBSCAN Clusterer] -- auto-detect research communities
    |
    v
[SimilarityComputer] -- cosine similarity edges (threshold > 0.7)
    |
    v
[GraphResponse JSON] -- nodes + edges + clusters + meta
    |
    v
[Next.js Frontend]
    |
    v
[react-force-graph-3d + Three.js] -- interactive 3D rendering
```

> **Architecture details:** See [ARCHITECTURE.md SS1](./ARCHITECTURE.md#1-high-level-architecture) for the full system diagram and [ARCHITECTURE.md SS5](./ARCHITECTURE.md#5-data-pipeline) for step-by-step data transformations.

---

## 2. Market Analysis

### Competitive Landscape

| Feature | Connected Papers | VOSviewer | CiteSpace | Litmaps | Inciteful | ResearchRabbit | **ScholarGraph3D** |
|---------|-----------------|-----------|-----------|---------|-----------|---------------|-------------------|
| Visualization | 2D graph | 2D network | 2D timeline | 2D graph | 2D graph | 2D list+graph | **3D interactive** |
| Data source | S2 only | WoS/Scopus | WoS/Scopus | S2+OA | OA only | S2 only | **OA+S2 fusion** |
| Embeddings | None | Co-citation | Co-citation | None | None | None | **SPECTER2 768D** |
| Clustering | None | Modularity | Timeline | None | None | None | **HDBSCAN + OA Topics** |
| AI chat | None | None | None | None | None | None | **GraphRAG (Phase 2)** |
| Citation intent | None | None | None | None | None | None | **S2 intents (Phase 3)** |
| Max papers | ~50 | 10K+ (desktop) | 10K+ (desktop) | ~200 | Unlimited | Unlimited | **500+ at 30 FPS** |
| Cost | Free (limited) | Free (desktop) | License | Freemium | Free | Free | **Freemium (BYOK)** |
| Real-time alerts | None | None | None | Yes | None | Yes | **Phase 3** |

### 8 Market Gaps Addressed

> Referenced by [PRD.md SS6](./PRD.md#6-competitive-advantage).

1. **3D Visualization** — No existing tool renders papers in true 3D space. Depth dimension encodes temporal or semantic information that 2D layouts collapse.

2. **Semantic + Citation Hybrid Edges** — Existing tools show either citation links OR co-citation clustering. ScholarGraph3D shows both simultaneously with toggleable visibility.

3. **Paper-Level GraphRAG** — No literature discovery tool offers question-answering grounded in the visible graph. Our GraphRAG retrieves papers from the user's current graph context, not a generic corpus.

4. **Citation Intent Visualization** — Semantic Scholar provides citation intent data (supports, contradicts, methodology, background) but no visualization tool renders this. Edge coloring makes scientific discourse structure visible.

5. **Real-time Growth Tracking** — Existing tools provide static snapshots. Watch queries with weekly notifications detect emerging research before it becomes mainstream.

6. **Multi-API Data Fusion** — Single-source tools miss coverage. OA provides CC0 metadata + abstracts + topics; S2 provides TLDR + SPECTER2 embeddings. DOI dedup merges without duplication.

7. **Scale + Interactivity in Browser** — Desktop tools (VOSviewer, CiteSpace) handle scale but lack web accessibility. Web tools (Connected Papers, Litmaps) are limited to ~50-200 papers. ScholarGraph3D targets 500+ papers at 30 FPS in any modern browser.

8. **SPECTER2 Embeddings for Layout** — No existing visualization tool uses SPECTER2 (the state-of-the-art scientific document embedding model) for spatial layout. This ensures papers that are semantically similar appear physically close in 3D space.

---

## 3. Data Sources

### 3.1 OpenAlex (Primary Metadata)

| Property | Details |
|----------|---------|
| **License** | CC0 (public domain) — no restrictions on commercial use |
| **Coverage** | 250M+ works, 100K+ sources, 40K+ institutions |
| **API Base URL** | `https://api.openalex.org` |
| **Rate Limits (Free)** | 10 req/sec with polite pool (`mailto` parameter) |
| **Rate Limits (Premium)** | 100K credits/day with API key; ~10 credits per search page |
| **Key Data** | Title, abstract (inverted index), publication year, DOI, authors with affiliations, concepts (hierarchical), topics (new), venue, citation count, open access status + URL |
| **Abstract Format** | Inverted index — must be reconstructed at parse time (see `OpenAlexWork._reconstruct_abstract()`) |
| **Topics** | Hierarchical: domain -> field -> subfield -> topic (e.g., Physical Sciences -> Physics -> Condensed Matter -> Superconductivity) |

**Credit Tracking:** The `CreditTracker` class monitors daily usage against the 100K limit. At 80% usage, warnings are logged. At 95%, the system switches to cache-first mode, serving cached results preferentially and only making API calls for cache misses.

> See [ARCHITECTURE.md SS3](./ARCHITECTURE.md#3-backend-architecture) for the `OpenAlexClient` implementation and [SS8 Caching Strategy](#8-caching-strategy) for cache-first mode details.

### 3.2 Semantic Scholar (Embeddings & Enrichment)

| Property | Details |
|----------|---------|
| **License** | S2 Dataset License (academic use free; commercial requires Expanded License) |
| **Coverage** | 200M+ papers |
| **API Base URL** | `https://api.semanticscholar.org/graph/v1` |
| **Rate Limits (Unauthenticated)** | 100 requests per 5 minutes |
| **Rate Limits (Authenticated)** | 1 request/second with API key (`x-api-key` header) |
| **Key Data** | SPECTER2 embeddings (768-dim), TLDR (auto-generated summary), citation count, citation intents, fields of study, open access PDF URL |
| **Batch API** | `/paper/batch` — up to 500 papers per request with embeddings |
| **Embedding Model** | SPECTER2 — 768-dimensional vectors trained on scientific papers |

**Rate Limiting:** The `SemanticScholarClient` enforces per-second rate limiting with an async lock. Retries on 429 responses with exponential backoff (up to 3 attempts). After exhausting retries, raises `SemanticScholarRateLimitError`.

### 3.3 SPECTER2 Embeddings

| Property | Details |
|----------|---------|
| **Dimensions** | 768 |
| **Model** | allenai/specter2 (based on SciBERT) |
| **Source** | Retrieved via S2 batch API (`embedding` field) |
| **Similarity Metric** | Cosine similarity |
| **Fallback** | If S2 batch fails, papers without embeddings are placed at graph periphery (y=10.0, cluster_id=-1) |

### 3.4 Data Fusion Strategy

The `DataFusionService` implements OA-first search with S2 enrichment:

1. **OA keyword search** (primary) — best metadata coverage, CC0 license
2. **S2 keyword search** (supplementary) — provides TLDR + initial embeddings
3. **DOI-based dedup** — normalize DOIs (strip URL prefix, lowercase), merge by DOI then by title
4. **Merge priority:** OA metadata wins for title/abstract/authors/topics; S2 wins for TLDR/embeddings
5. **Abstract fallback chain:** OA abstract -> S2 abstract -> S2 TLDR -> "No abstract available"
6. **Embedding fetch:** Papers missing embeddings after merge get SPECTER2 vectors via S2 batch API

> Implementation: `backend/integrations/data_fusion.py` — see [ARCHITECTURE.md SS5](./ARCHITECTURE.md#5-data-pipeline) for the complete pipeline flow.

---

## 4. API Specification

### Base URL

- **Development:** `http://localhost:8000`
- **Production:** `https://api.scholargraph3d.com` (Render)

### Common Headers

| Header | Value | Required |
|--------|-------|----------|
| `Content-Type` | `application/json` | All requests with body |
| `Authorization` | `Bearer <jwt_token>` | Auth-required endpoints only |

### 4.1 Health Endpoints

#### `GET /`

Root health check. Always public.

**Response 200:**
```json
{
  "status": "healthy",
  "service": "ScholarGraph3D",
  "version": "0.1.0"
}
```

#### `GET /health`

Detailed health check with subsystem status.

**Response 200:**
```json
{
  "status": "healthy",
  "database": "connected",
  "pgvector": "available",
  "auth": "configured",
  "environment": "production",
  "s2_api": "authenticated",
  "oa_api": "premium"
}
```

**Response 503:** Returns same structure with `"status": "unhealthy"` when database is disconnected.

### 4.2 Search Endpoints

> Implements [PRD.md US-01](./PRD.md#phase-1-mvp--v010--v050) (search), [US-02](./PRD.md#phase-1-mvp--v010--v050) (3D viz), [US-03](./PRD.md#phase-1-mvp--v050) (clustering), [US-XX](./PRD.md) (natural language, v0.3.0).

#### `POST /api/search`

**Auth:** None required (public)

**Request Body:**
```json
{
  "query": "transformer attention mechanism",
  "limit": 200,
  "year_start": 2018,
  "year_end": 2026,
  "fields_of_study": ["Computer Science"],
  "similarity_threshold": 0.7,
  "min_cluster_size": 5
}
```

| Field | Type | Default | Constraints | Description |
|-------|------|---------|-------------|-------------|
| `query` | string | required | 1-500 chars | Search keywords |
| `limit` | int | 200 | 1-500 | Max papers to return |
| `year_start` | int | null | | Filter: earliest publication year |
| `year_end` | int | null | | Filter: latest publication year |
| `fields_of_study` | string[] | null | | Filter: fields (e.g., "Computer Science") |
| `similarity_threshold` | float | 0.7 | 0.0-1.0 | Min cosine similarity for edges |
| `min_cluster_size` | int | 5 | 2-50 | HDBSCAN min_cluster_size parameter |

**Response 200 (GraphResponse):**
```json
{
  "nodes": [
    {
      "id": "0",
      "title": "Attention Is All You Need",
      "abstract": "The dominant sequence transduction models...",
      "year": 2017,
      "venue": "NeurIPS",
      "citation_count": 95000,
      "fields": ["Computer Science"],
      "tldr": "A new simple network architecture based solely on attention mechanisms.",
      "is_open_access": true,
      "oa_url": "https://arxiv.org/pdf/1706.03762",
      "authors": [{"name": "Ashish Vaswani", "affiliations": ["Google Brain"]}],
      "doi": "10.48550/arxiv.1706.03762",
      "s2_paper_id": "204e3073870fae3d05bcbc2f6a8e263d9b72e776",
      "oa_work_id": "W2741809807",
      "topics": [{"id": "T123", "display_name": "Transformers", "score": 0.95}],
      "x": 12.5,
      "y": -3.2,
      "z": 8.1,
      "cluster_id": 0,
      "cluster_label": "Transformers / Self-Attention"
    }
  ],
  "edges": [
    {
      "source": "0",
      "target": "5",
      "type": "similarity",
      "weight": 0.85
    }
  ],
  "clusters": [
    {
      "id": 0,
      "label": "Transformers / Self-Attention",
      "topics": ["Transformers", "Self-Attention", "Neural Machine Translation"],
      "paper_count": 42,
      "color": "#E63946",
      "hull_points": [[12.5, -3.2, 8.1], [14.0, -1.5, 7.3]]
    }
  ],
  "meta": {
    "query": "transformer attention mechanism",
    "total": 187,
    "with_embeddings": 165,
    "clusters": 6,
    "similarity_edges": 234,
    "elapsed_seconds": 3.42
  }
}
```

#### `POST /api/search/natural` (v0.3.0)

**Auth:** None required (public)

Natural language search with Groq LLaMA 3.3-70b query parsing. User writes freeform query; backend extracts structure and generates expanded queries.

**Request Body:**
```json
{
  "query": "What are the latest advances in making transformers more efficient?",
  "groq_api_key": "gsk_... (optional; uses backend key if not provided)",
  "limit": 200
}
```

| Field | Type | Default | Constraints | Description |
|-------|------|---------|-------------|-------------|
| `query` | string | required | 1-500 chars | Natural language question or topic |
| `groq_api_key` | string | null | | Optional user Groq API key (override) |
| `limit` | int | 200 | 1-500 | Max papers to return |

**Response 200 (GraphResponse):**
Same as `POST /api/search` with enhanced `meta`:
```json
{
  "nodes": [...],
  "edges": [...],
  "clusters": [...],
  "meta": {
    "query": "What are the latest advances in making transformers more efficient?",
    "query_type": "natural",
    "normalized_keywords": ["transformers", "efficiency", "optimization"],
    "expanded_queries": [
      "transformer efficiency",
      "efficient attention mechanisms",
      "lightweight transformers"
    ],
    "total": 187,
    "with_embeddings": 165,
    "clusters": 6,
    "similarity_edges": 234,
    "elapsed_seconds": 4.2
  }
}
```

#### `GET /api/search/stream?q=...` (v0.3.0)

**Auth:** None required (public)

Stream search progress via Server-Sent Events. Frontend receives real-time updates at each pipeline stage.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | Yes | Search query (same as `POST /api/search`) |
| `limit` | int | No | Max papers (default 200) |
| `year_start` | int | No | Filter: earliest year |
| `year_end` | int | No | Filter: latest year |

**Response: 200 text/event-stream**

Event stream with 8 stages:

```
event: start
data: {"stage": "init", "progress": 0.0, "message": "Initializing search..."}

event: stage
data: {"stage": "fetch", "progress": 0.3, "message": "Fetching from OpenAlex and Semantic Scholar"}

event: stage
data: {"stage": "embed", "progress": 0.6, "message": "Computing SPECTER2 embeddings..."}

event: stage
data: {"stage": "layout", "progress": 0.75, "message": "Reducing to 3D space with UMAP..."}

event: stage
data: {"stage": "cluster", "progress": 0.85, "message": "Clustering with HDBSCAN..."}

event: stage
data: {"stage": "edges", "progress": 0.92, "message": "Computing similarity edges..."}

event: complete
data: {
  "stage": "done",
  "progress": 1.0,
  "message": "Complete",
  "data": {
    "nodes": [...],
    "edges": [...],
    "clusters": [...],
    "meta": {...}
  }
}
```

**Error event:**
```
event: error
data: {"error": "Rate limit exceeded", "retry_after_seconds": 3600}
```

**Frontend consumption (TypeScript):**
```typescript
async function* searchStream(query: string) {
  const response = await fetch(`/api/search/stream?q=${encodeURIComponent(query)}`);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value);
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        const event = line.match(/event: (\w+)/)?.[1];
        const data = JSON.parse(line.match(/data: (.+)/)?.[1] || '{}');
        yield { event, data };
      }
    }
  }
}

// Usage
for await (const { event, data } of searchStream('transformers')) {
  if (event === 'stage') console.log(`${data.progress * 100}% — ${data.message}`);
  if (event === 'complete') console.log('Graph ready:', data.data);
}
```

### 4.3 Phase 4: Conceptual Relationships

#### GET /api/analysis/conceptual-edges/stream
SSE endpoint for streaming conceptual relationship edges.

**Query params:** `paper_ids` (comma-separated paper IDs)

**SSE Event types:**
| Type | Payload | Description |
|------|---------|-------------|
| `progress` | `{stage, message}` | Processing stage update |
| `edge` | `{source, target, relation_type, weight, explanation, color}` | Discovered relationship |
| `complete` | `{total_edges}` | All edges found |
| `error` | `{message}` | Error occurred |

**Relation types:**
| Type | Color | Trigger |
|------|-------|---------|
| `methodology_shared` | `#9B59B6` | Shared research methods |
| `theory_shared` | `#4A90D9` | Shared theoretical frameworks |
| `similarity_shared` | `#95A5A6` | High SPECTER2 cosine similarity |

#### POST /api/analysis/scaffold-angles
**Body:** `{ "question": "research question string" }`
**Returns:** `{ "angles": [{ "label", "query", "type" }] }` — 5 exploration angles

#### GET /api/papers/by-doi
**Query:** `doi` — DOI string or URL containing DOI
**Returns:** `{ paper_id, title, doi, redirect_query }`

---

### 4.4 Paper Endpoints

> Implements [PRD.md US-04](./PRD.md#phase-1-mvp--v010--v050) (detail), [US-05](./PRD.md#phase-1-mvp--v010--v050) (expansion).

#### `GET /api/papers/{paper_id}`

**Auth:** None required

Get paper detail by internal ID, S2 paper ID, or OA work ID. Checks database first, falls back to S2 API.

**Response 200 (PaperDetail):**
```json
{
  "id": "42",
  "s2_paper_id": "204e3073870fae3d05bcbc2f6a8e263d9b72e776",
  "oa_work_id": "W2741809807",
  "doi": "10.48550/arxiv.1706.03762",
  "title": "Attention Is All You Need",
  "abstract": "The dominant sequence transduction models...",
  "year": 2017,
  "venue": "NeurIPS",
  "citation_count": 95000,
  "fields_of_study": ["Computer Science"],
  "tldr": "A new simple network architecture based solely on attention mechanisms.",
  "is_open_access": true,
  "oa_url": "https://arxiv.org/pdf/1706.03762",
  "authors": [{"name": "Ashish Vaswani", "affiliations": ["Google Brain"]}]
}
```

**Response 404:** `{"detail": "Paper not found"}`

#### `GET /api/papers/{paper_id}/citations?limit=50`

**Auth:** None required

Get papers that cite this paper. Uses S2 citations API.

| Param | Type | Default | Constraints |
|-------|------|---------|-------------|
| `limit` | int | 50 | 1-500 |

**Response 200:** Array of `CitationPaper` objects:
```json
[
  {
    "paper_id": "abc123",
    "title": "BERT: Pre-training of Deep Bidirectional Transformers",
    "year": 2019,
    "citation_count": 65000,
    "venue": "NAACL",
    "is_open_access": true,
    "doi": "10.18653/v1/N19-1423"
  }
]
```

#### `GET /api/papers/{paper_id}/references?limit=50`

**Auth:** None required

Get papers referenced by this paper. Same response format as citations.

#### `POST /api/papers/{paper_id}/expand?limit=20`

**Auth:** None required

Expand graph around a paper by loading both citations and references.

| Param | Type | Default | Constraints |
|-------|------|---------|-------------|
| `limit` | int | 20 | 1-100 |

**Response 200 (ExpandResponse):**
```json
{
  "references": [{"paper_id": "...", "title": "...", ...}],
  "citations": [{"paper_id": "...", "title": "...", ...}],
  "total_references": 15,
  "total_citations": 23
}
```

### 4.5 Graph Endpoints (Auth Required)

> Implements [PRD.md US-06](./PRD.md#phase-1-mvp--v010--v050) (save/load).

All graph endpoints require a valid JWT in the `Authorization` header. See [SS9 Authentication](#9-authentication--authorization) for details.

#### `GET /api/graphs`

List all saved graphs for the authenticated user, ordered by most recently updated.

**Response 200:** Array of `GraphSummary`:
```json
[
  {
    "id": "a1b2c3d4-...",
    "name": "Transformer Research 2024",
    "seed_query": "transformer attention mechanism",
    "paper_count": 187,
    "created_at": "2026-02-19T10:30:00Z",
    "updated_at": "2026-02-19T14:15:00Z"
  }
]
```

#### `POST /api/graphs`

Create a new saved graph.

**Request Body (GraphCreate):**
```json
{
  "name": "Transformer Research 2024",
  "seed_query": "transformer attention mechanism",
  "paper_ids": ["0", "1", "2", "5"],
  "layout_state": {
    "camera": {"x": 0, "y": 0, "z": 500},
    "selected_paper_id": null
  }
}
```

**Response 201 (GraphDetail):** Same as GET single graph.

#### `GET /api/graphs/{graph_id}`

Load a specific saved graph. Enforces ownership via `user_id` match.

**Response 200 (GraphDetail):**
```json
{
  "id": "a1b2c3d4-...",
  "name": "Transformer Research 2024",
  "seed_query": "transformer attention mechanism",
  "paper_ids": ["0", "1", "2", "5"],
  "paper_count": 4,
  "layout_state": {"camera": {"x": 0, "y": 0, "z": 500}},
  "created_at": "2026-02-19T10:30:00Z",
  "updated_at": "2026-02-19T14:15:00Z"
}
```

**Response 404:** `{"detail": "Graph not found"}` (also returned for unauthorized access to prevent enumeration).

#### `PUT /api/graphs/{graph_id}`

Update a saved graph. Only provided fields are updated.

**Request Body (GraphUpdate):**
```json
{
  "name": "Transformer Research 2024 (expanded)",
  "paper_ids": ["0", "1", "2", "5", "10", "11"]
}
```

**Response 200:** Updated `GraphDetail`.

#### `DELETE /api/graphs/{graph_id}`

Delete a saved graph.

**Response 204:** No content (success).
**Response 404:** `{"detail": "Graph not found"}`

---

## 5. Database Schema

PostgreSQL with pgvector extension, hosted on Supabase.

> See [ARCHITECTURE.md SS2](./ARCHITECTURE.md#2-technology-stack) for database technology rationale.

### 5.1 Papers Table

Stores unified paper metadata from both OpenAlex and Semantic Scholar. Source: `backend/database/001_initial_schema.sql`.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE papers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    s2_paper_id     TEXT UNIQUE,                    -- Semantic Scholar paper ID
    oa_work_id      TEXT UNIQUE,                    -- OpenAlex work ID (e.g., "W2741809807")
    doi             TEXT,                            -- Digital Object Identifier
    title           TEXT NOT NULL,
    abstract        TEXT,
    year            INT,
    venue           TEXT,
    citation_count  INT DEFAULT 0,
    fields_of_study TEXT[],                          -- Array of field names
    oa_topics       JSONB,                           -- OpenAlex topics with scores
    tldr            TEXT,                            -- S2 auto-generated summary
    embedding       vector(768),                     -- SPECTER2 embedding (pgvector)
    is_open_access  BOOLEAN,
    oa_url          TEXT,                            -- Open access PDF URL
    authors         JSONB,                           -- Author list with affiliations
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_api_sync   TIMESTAMPTZ                      -- Last sync from external APIs
);

-- Partial indexes for efficient lookup by external IDs
CREATE INDEX idx_papers_doi ON papers(doi) WHERE doi IS NOT NULL;
CREATE INDEX idx_papers_s2_id ON papers(s2_paper_id) WHERE s2_paper_id IS NOT NULL;
CREATE INDEX idx_papers_oa_id ON papers(oa_work_id) WHERE oa_work_id IS NOT NULL;

-- IVFFlat index for pgvector cosine similarity search (100 lists for up to ~100K papers)
CREATE INDEX idx_papers_embedding ON papers USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

### 5.2 Citations Table

Stores citation relationships between papers with optional intent and influence metadata.

```sql
CREATE TABLE citations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citing_paper_id   UUID REFERENCES papers(id) ON DELETE CASCADE,
    cited_paper_id    UUID REFERENCES papers(id) ON DELETE CASCADE,
    intent            TEXT,                           -- 'methodology', 'background', 'result_comparison', etc.
    is_influential    BOOLEAN DEFAULT FALSE,          -- S2 influential citation flag
    context           TEXT,                           -- Citation context sentence
    UNIQUE(citing_paper_id, cited_paper_id)
);

CREATE INDEX idx_citations_citing ON citations(citing_paper_id);
CREATE INDEX idx_citations_cited ON citations(cited_paper_id);
```

### 5.3 User Graphs Table

Stores user-saved graph explorations. Ownership enforced in application code via `WHERE user_id = $1`.

```sql
CREATE TABLE user_graphs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    name            TEXT NOT NULL,
    seed_query      TEXT,                            -- Original search query
    paper_ids       UUID[],                          -- Array of paper UUIDs in this graph
    layout_state    JSONB,                           -- Camera position, node positions, UI state
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_graphs_user ON user_graphs(user_id);
```

### 5.4 Search Cache Table

Caches full search results (nodes, edges, clusters) for 24-hour TTL.

```sql
CREATE TABLE search_cache (
    cache_key   TEXT PRIMARY KEY,                   -- SHA-256 of normalized query params
    nodes       JSONB NOT NULL,                     -- Array of GraphNode objects
    edges       JSONB NOT NULL,                     -- Array of GraphEdge objects
    clusters    JSONB NOT NULL,                     -- Array of ClusterInfo objects
    meta        JSONB NOT NULL,                     -- Search metadata (timing, counts)
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_cache_created ON search_cache(created_at);
-- TTL enforced at query time: WHERE created_at > NOW() - INTERVAL '24 hours'
-- Upsert: ON CONFLICT (cache_key) DO UPDATE refreshes all columns and resets created_at
```

### 5.5 Watch Queries Table (Phase 3)

Stores saved search alerts for periodic monitoring.

```sql
CREATE TABLE watch_queries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    query           TEXT NOT NULL,
    filters         JSONB,                           -- Year range, field filters
    last_checked    TIMESTAMPTZ,
    notify_email    BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watch_queries_user ON watch_queries(user_id);
```

### 5.6 pgvector Configuration

| Property | Value | Rationale |
|----------|-------|-----------|
| **Dimensions** | 768 | SPECTER2 embedding size |
| **Index type** | IVFFlat | Approximate nearest neighbor; good for 10K-1M vectors |
| **Lists** | 100 | Optimal for datasets up to ~100K papers |
| **Distance metric** | Cosine (`vector_cosine_ops`) | Standard for document embeddings |
| **Query pattern** | `ORDER BY embedding <=> $1 LIMIT k` | k-NN search for Phase 2 GraphRAG |

### 5.7 Future Tables (Phase 2+)

```sql
-- LLM API key settings (Phase 2, US-14) — provider preference only
CREATE TABLE user_settings (
    user_id         UUID PRIMARY KEY,
    llm_provider    TEXT,                            -- 'openai', 'anthropic', 'groq', 'google'
    preferences     JSONB DEFAULT '{}',
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
-- Note: LLM API keys are stored CLIENT-SIDE ONLY, never in this table.
```

---

## 6. 3D Visualization Spec

> Implements [PRD.md US-02](./PRD.md#phase-1-mvp--v010--v050), [US-07](./PRD.md#phase-1-mvp--v010--v050), [US-08](./PRD.md#phase-1-mvp--v010--v050), [US-10](./PRD.md#phase-1-mvp--v010--v050).

### 6.1 Node Mapping

Each paper becomes a 3D sphere node in the force graph.

| Visual Property | Data Mapping | Formula/Logic |
|----------------|-------------|---------------|
| **Position (x, y, z)** | UMAP 3D coordinates | `EmbeddingReducer.reduce_to_3d()` output |
| **Color** | Primary field of study | `FIELD_COLOR_MAP` lookup (6 categories + "Other") |
| **Size** | Citation count | `max(3, log(citation_count + 1) * 3)` |
| **Opacity** | Publication year | `0.3 + 0.7 * ((year - min_year) / year_span)` — newer = more opaque |
| **Selected highlight** | User selection | Gold (#FFD700) color + ring geometry + emissive intensity 0.6 |
| **Connected highlight** | Edge adjacency | Teal (#4ECDC4) + emissive intensity 0.4 |
| **Dimmed** | Not connected to selection | Opacity reduced to 0.15 |
| **Label** | Author surname + year | Canvas texture sprite above node; truncated at 18 chars |

**Field Color Map:**
| Field | Color |
|-------|-------|
| Physical Sciences | `#4A90D9` (blue) |
| Life Sciences | `#2ECC71` (green) |
| Social Sciences | `#E67E22` (orange) |
| Health Sciences | `#E74C3C` (red) |
| Engineering | `#9B59B6` (purple) |
| Arts & Humanities | `#F39C12` (yellow) |
| Other | `#95A5A6` (gray) |

### 6.2 Edge Mapping

| Edge Type | Visual Style | Color | Width | Directionality |
|-----------|-------------|-------|-------|----------------|
| **Citation** | Solid line | `#8890a5` (default) or intent color | `1 + weight * 2` | Directional arrow (3px, at target end) |
| **Similarity** | Dashed line | `#4A90D9` (blue) | 0.5 | Undirectional |

**Citation Intent Colors** (Phase 3, [PRD.md US-17](./PRD.md#phase-3-real-time--advanced--v0100)):
| Intent | Color |
|--------|-------|
| methodology | `#9B59B6` (purple) |
| background | `#95A5A6` (gray) |
| result_comparison | `#4A90D9` (blue) |
| supports | `#2ECC71` (green) |
| contradicts | `#E74C3C` (red) |

**Edge Visibility Rules:**
- When no paper is selected: similarity edges at 15% opacity, citation edges at `0.2 + width * 0.1` opacity
- When a paper is selected: edges connected to the selected paper or its neighbors render at 80% opacity (`CC` hex suffix); all other edges at 3% opacity
- Toggleable via `showCitationEdges` and `showSimilarityEdges` store flags

### 6.3 Cluster Visualization

| Visual Element | Implementation |
|---------------|---------------|
| **Hull shape** | Convex hull of cluster node positions projected to XY plane, smoothed with CatmullRom curve |
| **Fill** | `ShapeGeometry` with cluster color at 6% opacity, double-sided |
| **Z position** | Cluster centroid Z minus 5 units (slightly behind nodes) |
| **Update frequency** | Every 1000ms (tracks node positions as force layout settles) |
| **Color palette** | 15-color cycle: `#E63946, #457B9D, #2A9D8F, #E9C46A, #F4A261, ...` |
| **Toggle** | `showClusterHulls` store flag |

### 6.4 Layout Strategy

1. **Initial positions:** From UMAP 3D coordinates (server-side) — nodes start at their semantic positions.
2. **Force simulation:** `react-force-graph-3d` with `d3-force-3d`:
   - `warmupTicks`: 100 (pre-simulation before render)
   - `cooldownTicks`: 0 (stops simulation after warmup — positions are UMAP-determined)
   - `d3VelocityDecay`: 0.9 (high damping — preserves UMAP layout)
3. **Node dragging:** Enabled. Nodes get temporary `fx/fy/fz` constraints during drag, released on drag end.
4. **Camera:** Initial position `(0, 0, 500)` looking at origin. Animated transitions on focus (1000ms).

### 6.5 Interactions

| Interaction | Action | Implementation |
|-------------|--------|---------------|
| **Click node** | Select paper, show detail panel | `selectPaper(node.paper)` in Zustand store |
| **Shift+Click** | Multi-select (toggle) | `toggleMultiSelect(node.paper)` |
| **Double-click** | Focus camera on paper | Camera animates to `(x, y, z+200)` looking at `(x, y, z)` |
| **Hover** | Show tooltip, set cursor | 50ms debounce; HTML tooltip with title, authors, venue, year, citations |
| **Background click** | Deselect all | `selectPaper(null)` |
| **Scroll** | Zoom in/out | Three.js OrbitControls (built into react-force-graph-3d) |
| **Right-drag** | Pan | Three.js OrbitControls |
| **Left-drag** | Rotate | Three.js OrbitControls |

> See [ARCHITECTURE.md SS4](./ARCHITECTURE.md#4-frontend-architecture) for the component tree and state management design.

---

## 7. Search Pipeline Spec

Step-by-step pipeline from user query to rendered 3D graph. Corresponds to the `POST /api/search` endpoint implementation in `backend/routers/search.py`.

### Pipeline Steps

#### Step 1: Cache Check
- Generate `cache_key` = SHA-256 of `{query, limit, year_range, fields}` (normalized, sorted)
- Query `search_cache` table for matching key with `created_at > NOW() - 24h`
- **Cache hit:** Return cached `GraphResponse` immediately (0 API calls)
- **Cache miss:** Continue to Step 2

#### Step 2: Data Fusion Search
- Create `OpenAlexClient` and `SemanticScholarClient` with configured credentials
- Execute `DataFusionService.search()`:

  **2a. OA Search (primary)**
  - `GET /works?search={query}&sort=relevance_score:desc&per_page=100`
  - Apply year filter if specified: `filter=publication_year:{start}-{end}`
  - Parse results via `OpenAlexWork.from_api_response()` (reconstruct abstracts from inverted index)
  - Track API credits (10 per page)

  **2b. S2 Search (supplementary)**
  - `GET /paper/search?query={query}&limit=100`
  - Apply year and field filters
  - Parse results via `SemanticScholarPaper.from_api_response()`

  **2c. DOI-Based Dedup + Merge**
  - Index S2 results by normalized DOI and lowercase title
  - Process OA results first (primary metadata source)
  - For each OA paper: find matching S2 paper by DOI or title
  - Enrich with S2 data: `s2_paper_id`, `tldr`, `embedding`
  - Apply abstract fallback: OA abstract -> S2 abstract -> S2 TLDR
  - Add remaining S2-only results (not matched by DOI or title)
  - Return up to `limit` unified papers

  **2d. Embedding Fetch**
  - Identify papers with `embedding = None` but `s2_paper_id` present
  - Fetch SPECTER2 embeddings via `POST /paper/batch` (up to 500/request)
  - Map embeddings back to unified papers

#### Step 3: UMAP 3D Reduction
- Filter papers with non-null embeddings
- Build `(N, 768)` numpy array
- Apply UMAP: `n_components=3, n_neighbors=min(15, N-1), min_dist=0.1, metric=cosine, random_state=42`
- Output: `(N, 3)` array of 3D coordinates
- Papers without embeddings: placed at periphery `(offset * 0.5, 10.0, 0.0)` with `cluster_id = -1`

#### Step 4: HDBSCAN Clustering
- Apply HDBSCAN: `min_cluster_size=request.min_cluster_size, metric=euclidean, cluster_selection_method=eom`
- Output: `(N,)` array of cluster labels (-1 = noise)
- Label clusters using OA Topics: collect all topics from cluster papers, use top-2 most common as label
- Compute convex hulls: `scipy.spatial.ConvexHull` on 3D coordinates per cluster
- Assign colors from 15-color palette

#### Step 5: Similarity Edge Computation
- Normalize embeddings (L2 norm)
- Compute pairwise cosine similarity matrix: `normalized @ normalized.T`
- For each paper: find neighbors above `similarity_threshold` (default 0.7)
- Keep top `max_edges_per_node` (default 10) per paper
- Deduplicate: only emit edge where `i < j`

#### Step 6: Build Response
- Construct `GraphNode` objects with 3D coordinates, cluster assignments, and all metadata
- Construct `GraphEdge` objects for similarity edges
- Construct `ClusterInfo` objects with labels, topics, colors, hull vertices
- Build `meta` dict with timing and counts

#### Step 7: Cache Results
- `INSERT INTO search_cache ... ON CONFLICT DO UPDATE` (upsert by `cache_key`)
- Cache stores full JSON of nodes, edges, clusters, meta

#### Step 8: Return `GraphResponse`

> **Testing:** See [SDD/TDD Plan](./SDD_TDD_PLAN.md) for unit tests covering each pipeline step and integration tests for the full pipeline.

---

## 8. Caching Strategy

### 8.1 PostgreSQL Search Cache

| Parameter | Value |
|-----------|-------|
| **Storage** | `search_cache` table (JSONB columns) |
| **Key** | SHA-256 of normalized `{query, limit, year_range, fields}` |
| **TTL** | 24 hours (enforced at query time) |
| **Invalidation** | Time-based only; no manual invalidation needed |
| **Size per entry** | ~200KB for 200-paper graph (nodes + edges + clusters + meta) |
| **Cleanup** | Periodic deletion of entries older than 48 hours |

### 8.2 Cache-First Mode

When OA credit usage reaches 95%, the system enters cache-first mode:

1. Always check cache first (normal behavior)
2. On cache miss: check if a stale cache entry exists (older than 24h but still in table)
3. If stale entry exists: return stale data with `meta.cache_stale: true`
4. If no entry at all: make API call but with reduced `per_page` to conserve credits

### 8.3 Redis Cache (Future — Upstash)

Planned for Phase 2 to handle:
- Hot query caching (most popular searches in-memory)
- Rate limit counters per user
- Session tokens for real-time WebSocket connections
- GraphRAG context caching (LLM conversation history)

| Parameter | Value |
|-----------|-------|
| **Provider** | Upstash (serverless Redis) |
| **Hot query TTL** | 1 hour |
| **Rate limit window** | 60 seconds |
| **Max memory** | 256MB (Upstash free tier) |

### 8.4 Browser Cache

- API responses cached via standard HTTP caching headers
- 3D assets (Three.js, force-graph library) cached by Next.js static asset pipeline
- Graph state persisted in Zustand store (memory) and localStorage (page reload resilience)

> See [ARCHITECTURE.md SS6](./ARCHITECTURE.md#6-risk-management) for caching failure modes and mitigations.

---

## 9. Authentication & Authorization

> Implements [PRD.md US-06](./PRD.md#phase-1-mvp--v010--v050) (auth + save).

### 9.1 Auth Provider: Supabase Auth

| Property | Value |
|----------|-------|
| **Provider** | Supabase GoTrue (self-hosted or cloud) |
| **Token format** | JWT (RS256) |
| **Token location** | `Authorization: Bearer <token>` header |
| **Token lifetime** | 1 hour (access token); 30 days (refresh token) |
| **User storage** | `auth.users` table (managed by Supabase) |

### 9.2 Auth Levels

Three levels defined in `auth/policies.py`:

| Level | Meaning | Behavior |
|-------|---------|----------|
| `NONE` | No authentication needed | Request proceeds without token check |
| `OPTIONAL` | Token validated if present | User info attached if valid token; request proceeds either way |
| `REQUIRED` | Valid token mandatory | 401 returned if token missing or invalid |

### 9.3 Route Policies

| Route Pattern | Auth Level | Rationale |
|--------------|------------|-----------|
| `/ /health /docs /openapi.json /redoc` | NONE | Health and documentation — always public |
| `/api/auth/signup /api/auth/login /api/auth/refresh` | NONE | Auth endpoints themselves |
| `/api/auth/me /api/auth/logout` | REQUIRED | User-specific auth operations |
| `/api/search` | NONE | Core feature — free for all |
| `/api/papers /api/papers/*` | NONE | Paper data — free for all |
| `/api/graphs /api/graphs/*` | REQUIRED | User-specific saved data |
| All other routes | OPTIONAL | Default: token validated if present |

### 9.4 Middleware Flow

```
Request
  |
  v
[CORS Middleware] -- handles preflight OPTIONS
  |
  v
[AuthMiddleware]
  |
  +-- get_auth_level(path) -> NONE/OPTIONAL/REQUIRED
  |
  +-- if NONE: pass through
  |
  +-- Extract token from Authorization header
  |
  +-- verify_jwt(token) -> user_data
  |
  +-- if REQUIRED and no valid user: return 401
  |
  +-- Attach user to request.state
  |
  v
[Route Handler]
```

### 9.5 Row-Level Security

PostgreSQL RLS policies on `user_graphs` table ensure users can only access their own saved graphs. Even if the middleware is bypassed, RLS prevents cross-user data access at the database level.

> See [ARCHITECTURE.md SS3](./ARCHITECTURE.md#3-backend-architecture) for the full middleware stack.

---

## 10. Performance Requirements

> Referenced by [PRD.md SS5 Success Metrics](./PRD.md#5-success-metrics) and [PRD.md SS9 Non-Functional Requirements](./PRD.md#9-non-functional-requirements).

### 10.1 API Latency Targets

| Endpoint | Target (p50) | Target (p95) | Bottleneck |
|----------|-------------|-------------|------------|
| `POST /api/search` (cache hit) | <100ms | <300ms | DB read |
| `POST /api/search` (cache miss) | <3s | <5s | OA+S2 API calls + UMAP |
| `GET /api/papers/{id}` (DB hit) | <50ms | <100ms | DB read |
| `GET /api/papers/{id}` (API fallback) | <1s | <2s | S2 API call |
| `POST /api/papers/{id}/expand` | <2s | <4s | S2 citations + references |
| `GET /api/graphs` | <100ms | <200ms | DB read |
| `POST /api/graphs` | <100ms | <200ms | DB write |
| `GET /health` | <50ms | <100ms | DB ping (cached 15s) |

### 10.2 Frontend Rendering Targets

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Initial render (200 papers) | <3s from data received | `performance.mark()` timing |
| Steady-state FPS (200 papers) | 60 FPS | `requestAnimationFrame` delta |
| Steady-state FPS (500 papers) | 30+ FPS | `requestAnimationFrame` delta |
| Node click response | <100ms | Time from click to panel update |
| Camera animation | 1000ms | Hardcoded transition duration |
| Tooltip appearance | <50ms | Hover debounce timeout |

### 10.3 Scalability Limits

| Dimension | Current Limit | Mitigation |
|-----------|-------------|-----------|
| Papers per search | 500 (API limit) | Pagination in future; LOD rendering |
| Similarity edges | ~2500 (500 papers x max 10 edges) | Threshold filtering; toggle off |
| Concurrent users | ~50 (Render free tier) | Scale to Render paid; horizontal scaling |
| DB connections | 5 (pool max) | Increase pool; read replicas |
| S2 API calls/sec | 1 (authenticated) | Request queuing; aggressive caching |

### 10.4 Memory Budgets

| Component | Budget |
|-----------|--------|
| Backend process (per request) | <512MB |
| UMAP computation (500 papers x 768 dims) | ~50MB |
| Frontend JS heap | <200MB |
| Three.js GPU memory (500 nodes) | <100MB |
| Zustand store (500-paper graph) | <10MB |

---

## Phase Status

| Phase | Version | Status | Features |
|-------|---------|--------|----------|
| **Phase 1 (MVP)** | v0.1.0–v0.1.4 | ✅ Complete | Keyword search, 3D visualization, HDBSCAN clustering, paper details, citation expansion, graph save/load |
| **Phase 1.5 (Viz)** | v0.1.5 | ✅ Complete | 3-tier dimming, centrality-based labels, bridge/OA/bloom node layers, ghost edges, gap overlay, cluster visibility, stable expand |
| **Phase 2 (AI)** | v0.2.0 | ✅ Complete | LLM multi-provider (OpenAI/Anthropic/Google/Groq), GraphRAG chat, trend analysis, gap detection |
| **Phase 3 (Real-time)** | v0.3.0 | ✅ Complete | Natural language search (Groq), SSE progress stream, citation context modal, rate limiting (60/hr search, 20/hr AI, 2× auth), analytics logging, SEO |
| **Phase 4 (Relationships)** | v0.4.0 | ✅ Complete | Critical node-click bug fix, panel resize, conceptual edges SSE, 3-mode home page, timeline view |

---

### Phase 4: UI State (useGraphStore additions)
- `conceptualEdges: ConceptualEdge[]` — streamed relationship edges
- `showConceptualEdges: boolean` — toggle in GraphControls
- `showTimeline: boolean` — fixes node Y-axis by publication year
- `isAnalyzingRelations: boolean` — SSE stream in progress

---

## 11. Testing Requirements

> Full test strategy in [SDD/TDD Plan](./SDD_TDD_PLAN.md).

### 11.1 Unit Tests

| Module | Key Tests | Coverage Target |
|--------|-----------|----------------|
| `DataFusionService` | DOI dedup, abstract fallback, merge priority, empty results | 90%+ |
| `EmbeddingReducer` | 768D->3D reduction, edge cases (1 paper, 2 papers) | 85%+ |
| `PaperClusterer` | HDBSCAN clustering, topic labeling, hull computation | 85%+ |
| `SimilarityComputer` | Cosine similarity, threshold filtering, dedup, edge limits | 90%+ |
| `OpenAlexClient` | Abstract reconstruction, credit tracking, rate limit handling | 85%+ |
| `SemanticScholarClient` | Rate limiting, batch API, retry logic, error handling | 85%+ |
| `AuthMiddleware` | Route policy enforcement, token validation, edge cases | 90%+ |
| Zustand store | State transitions, addNodes dedup, toggle actions | 85%+ |

### 11.2 Integration Tests

| Test Scenario | Components | Key Assertions |
|--------------|-----------|----------------|
| Full search pipeline | Search router + DataFusion + UMAP + HDBSCAN + Similarity | Returns valid GraphResponse; nodes have 3D coords; clusters labeled |
| Paper expansion | Papers router + S2 client | Returns citations and references; no duplicates |
| Graph CRUD | Graphs router + DB + Auth | Create, read, update, delete; RLS enforced |
| Cache behavior | Search router + DB | Cache miss populates cache; cache hit returns immediately |
| Auth flow | Auth middleware + Supabase | Public routes accessible; protected routes require token |

### 11.3 End-to-End Tests

| Test Scenario | User Flow | Assertions |
|--------------|-----------|------------|
| Search and explore | Type query -> see 3D graph -> click paper -> see details | Graph renders; detail panel shows correct data |
| Citation expansion | Click paper -> double-click -> see expanded graph | New nodes appear; citation edges visible |
| Save and load | Search -> save graph -> reload page -> load saved graph | Graph state restored; camera position preserved |
| Auth flow | Sign up -> log in -> save graph -> log out -> verify no access | Auth works end-to-end; saved data persists |

### 11.4 Performance Tests

| Test | Tool | Pass Criteria |
|------|------|--------------|
| Search latency (cache miss) | pytest + httpx | p95 < 5s for 200 papers |
| Search latency (cache hit) | pytest + httpx | p95 < 300ms |
| 3D render FPS | Playwright + performance API | 30+ FPS at 500 nodes |
| Memory leak detection | Chrome DevTools protocol | No growth over 100 search cycles |

---

*This document is the authoritative technical specification. For product requirements, see [PRD.md](./PRD.md). For system architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md). For test strategy, see [SDD/TDD Plan](./SDD_TDD_PLAN.md).*

---

## Phase 5: Personalization API

### New Tables (002_personalization.sql)

| Table | Purpose |
|-------|---------|
| `user_profiles` | User prefs + interest_embedding vector(768) + usage counters |
| `user_search_history` | Search query log (query, mode, result_count, filters_used JSONB) |
| `user_paper_interactions` | 5 action types: view, save_graph, expand_citations, chat_mention, lit_review |
| `user_recommendations` | 24h cached pgvector ANN results with Groq explanation + is_dismissed |

### New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/user/profile` | Required | Get/auto-create user profile |
| PUT | `/api/user/profile` | Required | Partial update preferences |
| POST | `/api/user/events` | Required | Log paper interaction (fire-and-forget) |
| POST | `/api/user/search-history` | Required | Log search query |
| GET | `/api/user/recommendations` | Required | pgvector ANN recommendations + Groq explanations |
| DELETE | `/api/user/recommendations/{id}/dismiss` | Required | Soft-dismiss recommendation |

### Recommendation Algorithm

```
1. Check user_recommendations cache (not expired, not dismissed) → return if hit
2. Fetch user's viewed paper embeddings (up to 50, FROM user_paper_interactions JOIN papers)
3. Compute numpy mean → interest_vector (768-dim)
4. pgvector ANN: SELECT ... ORDER BY embedding <=> $interest_vector LIMIT 100
   (exclude papers already seen or in saved graphs)
5. Top 10 → Groq LLaMA-3.3-70b → 1-sentence explanation each (parallel asyncio.gather)
   Fallback: no explanation if GROQ_API_KEY not set
6. INSERT into user_recommendations (24h expires_at)
7. Return top 20 with joined paper metadata
```

### Auth Callback Fix

`/auth/callback` page now uses `supabase.auth.onAuthStateChange` to wait for `SIGNED_IN` event before redirecting to `/dashboard`. 5-second timeout fallback with manual `getSession()` check. Redirects to `/auth?error=oauth_failed` if session not established.

### Frontend New Types

```typescript
UserProfile    // user_id, research_interests[], preferred_fields[], default_year_min/max, etc.
Recommendation // id, paper_id, score, explanation, reason_tags[], + joined paper fields
InteractionEvent // paper_id, action (5 types), session_id?
```
