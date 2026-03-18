# ScholarGraph3D -- Technical Specification

> **Version:** 4.0.0 | **Last Updated:** 2026-03-18
> **Related:** [PRD.md](./PRD.md) | [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 1. System Overview

ScholarGraph3D is a seed-paper exploration platform that transforms a single paper into an interactive 3D citation graph. The system fetches data from Semantic Scholar, computes SPECTER2 embeddings, reduces to 3D coordinates, clusters papers, detects research gaps, and renders a WebGL visualization.

### Core Data Flow

```
User NL Query / DOI
    |
    v
POST /api/paper-search -> Semantic Scholar relevance search
    |
    v
User selects seed paper
    |
    v
POST /api/seed-explore
    |
    +-- S2: seed paper + embedding
    +-- S2: references + citations (parallel)
    +-- S2: batch embeddings for missing papers
    +-- PCA 768->100D + UMAP 100->50D->3D
    +-- Leiden hybrid clustering + HDBSCAN fallback
    +-- TF-IDF cluster labeling
    +-- Cosine similarity edges (>0.7)
    +-- Bridge detection + citation intents + gap detection
    |
    v
GraphData JSON -> 3D Cosmic Visualization
```

---

## 2. Data Sources

### Semantic Scholar (Primary)

- Paper metadata: title, authors, year, venue, DOI, abstract, TLDR, fields, citation count
- SPECTER2 embeddings: 768-dim document vectors via `embedding.specter_v2` field
- Citation graph: references and citations per paper
- Citation intents: methodology, background, result_comparison
- Influential citations: boolean flag per citation relationship
- Rate limits: 1 RPS authenticated (API key), 0.3 RPS unauthenticated
- License: non-commercial

### Crossref (DOI Fallback)

- DOI-to-metadata resolution for papers not in S2 index
- Used only in the by-doi endpoint fallback chain

---

## 3. API Specification

### POST /api/paper-search

NL query to paper selection.

**Request:**
```json
{ "query": "trust calibration in AI", "limit": 10 }
```

**Response:**
```json
{
  "papers": [{
    "paper_id": "abc123",
    "title": "Trust Calibration in AI...",
    "authors": [{ "name": "Author Name" }],
    "year": 2024,
    "citation_count": 42,
    "abstract_snippet": "This paper...",
    "fields": ["Computer Science"],
    "doi": "10.1234/...",
    "venue": "CHI"
  }],
  "refined_query": null
}
```

### POST /api/seed-explore

Build citation graph from seed paper.

**Request:**
```json
{
  "paper_id": "abc123",
  "depth": 1,
  "max_papers": 50,
  "include_references": true,
  "include_citations": true
}
```

**Response:** GraphData with nodes, edges, clusters, gaps, frontier_ids, meta.

### GET /api/papers/{id}

Paper detail (DB lookup with S2 fallback).

### GET /api/papers/by-doi?doi=...

DOI resolution. Fallback chain: S2 DOI -> S2 ArXiv ID -> Crossref title -> S2 title search.

### POST /api/papers/{id}/expand-stable

Incremental graph expansion with stable 3D positioning.

**Request:**
```json
{
  "existing_nodes": [{ "id": "...", "x": 0, "y": 0, "z": 0, "cluster_id": 0 }],
  "limit": 20
}
```

**Response:** `{ nodes, edges, total, meta }` with initial_x/y/z positions and cluster assignments.

### GET /api/papers/{id}/intents

S2 citation intent classification for a paper's citations.

### Graph CRUD (all require auth)

- `GET /api/graphs` -- list user's saved graphs
- `POST /api/graphs` -- save graph (name, seed_query, graph_data as JSONB)
- `GET /api/graphs/{id}` -- load graph
- `PUT /api/graphs/{id}` -- update graph
- `DELETE /api/graphs/{id}` -- delete graph

---

## 4. Database Schema

### papers table
```sql
CREATE TABLE papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  s2_paper_id TEXT UNIQUE,
  doi TEXT,
  title TEXT NOT NULL,
  abstract TEXT,
  year INTEGER,
  venue TEXT,
  citation_count INTEGER DEFAULT 0,
  fields_of_study TEXT[],
  tldr TEXT,
  is_open_access BOOLEAN DEFAULT FALSE,
  oa_url TEXT,
  authors JSONB,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### user_graphs table
```sql
CREATE TABLE user_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seed_query TEXT,
  paper_ids TEXT[],
  layout_state JSONB,
  graph_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. 3D Visualization Spec

### Coordinate System
- X, Y: UMAP semantic topology (similar papers are near each other)
- Z: publication year (temporal depth)
- Coordinate generation: PCA 768->100D + UMAP 100->50D->3D with temporal Z-axis weighting

### Node Rendering (Star Nodes)
- Size: `sqrt(citation_count + 1) * 1.5`, clamped to [4, 30]
- Color: STAR_COLOR_MAP with 26 academic fields mapped to maximally separated hues
- Layers: glow sprite (additive blend), corona (OA papers), supernova (top 10% citations), binary (bridge nodes)
- Frontier: red ring (#FF4444) for frontier_score > 0.7
- Selection: gold pulsing ring with sin-wave opacity

### Edge Rendering (Light Streams)
- Citation edges: cyan animated particles, intent-colored when loaded
- Similarity edges: dashed lines (#4a90d9)
- Citation path: gold (#FFD700) highlighted chain
- Influential: 1.5x wider with glow effect

### Cluster Rendering (Nebula Clouds)
- Gaussian-distributed particle cloud per cluster (Box-Muller)
- Particle count: min(120, max(30, nodeCount * 8))
- AdditiveBlending with shimmer shader
- Glow ring at cluster boundary with pulse animation
- Centroid from backend (arithmetic mean)

---

## 6. Graph Processing Pipeline

### Embedding Reduction
1. PCA: 768-dim -> 100-dim (instant, variance preservation)
2. UMAP: 100-dim -> 50-dim (shared intermediate for clustering and viz)
3. UMAP: 50-dim -> 3-dim (final coordinates with temporal Z-axis)
4. Parameters: n_neighbors=15, min_dist=0.1, metric='cosine', random_state=42

### Clustering
- Primary: Leiden algorithm on 3-layer graph (citation + bibliographic coupling + similarity)
- Fallback: HDBSCAN when graph is too sparse (total_edges < N * 0.5)
- Labels: TF-IDF bigram/unigram extraction from paper abstracts
- Quality: silhouette score computed and used to gate gap detection confidence

### Gap Detection (3-Dimension Scoring)
- Structural (0.40): 1 - (actual_inter_edges / max_possible_edges)
- Relatedness (0.35): cosine similarity between cluster centroids (high = more actionable gap)
- Temporal (0.25): year range non-overlap ratio
- Adaptive threshold: min(0.7, 25th_percentile + 0.1)
- Quality gating: low silhouette (< 0.25) raises threshold and caps gap count
- Research questions: template-generated from paper TLDRs, temporal context, bridge papers (no LLM)

---

## 7. Caching Strategy

| Key Pattern | TTL | Backend |
|-------------|-----|---------|
| `seed_explore:{paper_id}:v4.0.0` | 24h | Redis (Upstash) |

Redis is optional. All cache operations are wrapped in try/except with graceful no-op.

---

## 8. Authentication

- Provider: Supabase Auth (GoTrue)
- Token: JWT (RS256)
- Methods: email/password, Google OAuth, GitHub OAuth
- Protected endpoints: /api/graphs/* (all CRUD)
- Public endpoints: search, explore, paper detail, intents

---

## 9. Performance Requirements

| Metric | Target |
|--------|--------|
| Seed explore (50 papers) | < 15s |
| Paper search | < 3s |
| 3D FPS at 200 nodes | 30+ |
| Expand-stable | < 5s |
| Graph save/load | < 1s |

### UMAP Cold Start Mitigation
- Numba JIT compilation takes ~30s on first call
- `_warm_up_umap()` runs at startup (background task) to pre-compile kernels
- Prevents first seed-explore from timing out
