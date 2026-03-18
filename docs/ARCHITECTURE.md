# ScholarGraph3D -- System Architecture

> **Version:** 4.0.0 | **Last Updated:** 2026-03-18

---

## 1. System Overview

ScholarGraph3D is a three-tier web application: a Next.js 14 frontend communicates with a FastAPI backend that reads from and writes to a PostgreSQL database augmented with pgvector. Semantic Scholar is the sole external academic data source; Crossref provides DOI-based metadata fallback.

### High-Level Diagram

```
+-----------------------------------------+
|           CLIENT (Browser)              |
|  Next.js 14 App Router                  |
|  react-force-graph-3d + Three.js        |
|  Zustand state | lib/api.ts HTTP client |
+------------------+----------------------+
                   | HTTPS / JSON
+------------------v----------------------+
|         BACKEND (Render / Docker)       |
|  FastAPI (Python 3.11 + uvicorn)        |
|  CORS -> Auth -> Route Handlers         |
|  graph/ (UMAP, clustering, gaps)        |
+-----+-------------------+--------------+
      |                   |
      v                   v
+----------+    +------------------+
| Crossref |    | Semantic Scholar |
| (DOI)    |    | (SPECTER2, S2)   |
+----------+    +------------------+

+----------------------------------------+
|         DATA TIER (Supabase)           |
|  PostgreSQL 15 + pgvector              |
|  papers | user_graphs | auth.users     |
|  Supabase Auth (GoTrue/JWT)            |
|  Upstash Redis (cache)                 |
+----------------------------------------+
```

### Core Request Lifecycle (Seed Explore)

```
Browser POST /api/seed-explore { paper_id, max_papers }
    |
    v
CORSMiddleware -> AuthMiddleware -> seed_explore() handler
    |
    +-- [cache hit] --> return cached GraphResponse
    |
    +-- [cache miss] -->
            |
            v
        S2: get_paper(seed, include_embedding=True)
            |
            v
        S2: get_references + get_citations (parallel)
            |
            v
        S2: get_papers_batch (fetch missing embeddings)
            |
            v
        EmbeddingReducer: PCA 768->100D + UMAP 100->50D->3D
            |
            v
        SimilarityComputer: cosine edges (>0.7)
            |
            v
        PaperClusterer: Leiden hybrid + HDBSCAN fallback + TF-IDF labels
            |
            v
        BridgeDetector + CitationIntents + GapDetector (parallel)
            |
            v
        Build GraphResponse (nodes + edges + clusters + gaps + frontier)
            |
            v
        Cache response (Redis, 24h TTL)
            |
            v
    Return GraphResponse JSON
```

---

## 2. Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Frontend | Next.js | 14 (App Router) | Server components, file-based routing, Vercel-native |
| Language (frontend) | TypeScript | 5.x | Type safety for graph data structures |
| Styling | Tailwind CSS | 3.x | Utility-first; cosmic theme design tokens |
| 3D Visualization | react-force-graph-3d | latest | Three.js wrapper with force-directed graph |
| 3D Rendering | Three.js | **0.152.2 (pinned)** | Must stay at 0.152.2 (ESM compat) |
| State | Zustand | 4.x | Minimal boilerplate for graph state |
| Backend | FastAPI | 0.110+ | Async Python, Pydantic validation |
| Language (backend) | Python | 3.11 | async/await, numpy/scipy ecosystem |
| Database | PostgreSQL | 15 | pgvector for 768-dim vectors, JSONB, RLS |
| Vector extension | pgvector | 0.6+ | ivfflat index on SPECTER2 embeddings |
| Auth | Supabase Auth | cloud | GoTrue JWT (RS256), OAuth |
| Embeddings | SPECTER2 | via S2 API | 768-dim document embeddings, no local model |
| Dim. reduction | UMAP-learn + PCA | 0.5+ | PCA 768->100D + UMAP 100->50->3D |
| Clustering | leidenalg + hdbscan | latest | Leiden hybrid primary, HDBSCAN fallback |
| HTTP client | httpx | 0.27+ | Async HTTP for S2/Crossref |
| Cache | Redis (Upstash) | serverless | seed-explore 24h TTL, graceful no-op |
| Deploy (frontend) | Vercel | -- | Next.js-native, edge CDN |
| Deploy (backend) | Render | -- | Docker service (UMAP needs persistent memory) |

---

## 3. Backend Architecture

### Directory Structure

```
backend/
├── main.py              # FastAPI app, lifespan, 4 routers
├── config.py            # pydantic-settings
├── database.py          # asyncpg pool singleton
├── cache.py             # Redis helpers (Upstash)
├── auth/
│   ├── supabase_client.py   # JWT verification
│   ├── middleware.py         # AuthMiddleware
│   ├── policies.py          # Route policy map
│   ├── dependencies.py      # get_current_user()
│   └── models.py            # User model
├── middleware/
│   └── rate_limiter.py
├── integrations/
│   ├── semantic_scholar.py  # S2 client (1 RPS auth, 0.3 RPS unauth)
│   └── crossref.py          # DOI metadata fallback
├── graph/
│   ├── embedding_reducer.py   # PCA + UMAP pipeline
│   ├── clusterer.py           # Leiden + HDBSCAN + TF-IDF labels + hulls
│   ├── similarity.py          # Cosine similarity edges
│   ├── bridge_detector.py     # Cross-cluster bridge detection
│   ├── incremental_layout.py  # k-NN interpolation for expand-stable
│   └── gap_detector.py        # 3-dim gap scoring + research questions
├── services/
│   └── citation_intent.py     # S2 citation intents
├── routers/
│   ├── papers.py          # /api/papers/* (detail, expand, intents, by-doi)
│   ├── graphs.py          # /api/graphs CRUD (auth required)
│   ├── seed_explore.py    # /api/seed-explore
│   └── paper_search.py    # /api/paper-search
└── database/
    └── *.sql              # Schema migrations
```

### Application Startup (Lifespan)

1. Initialize Supabase Auth client (if configured)
2. Create asyncpg connection pool (min=1, max=3)
3. Verify pgvector availability
4. Initialize S2 client with rate limiter
5. Warm up UMAP/Numba JIT kernels (background task)

If DB connection fails: logs warning and runs in memory-only mode (graph features work; auth/save require DB).

### Middleware Stack

Execution order on request:
1. CORSMiddleware -- preflight OPTIONS, Origin validation
2. AuthMiddleware -- JWT extraction, route policy enforcement

---

## 4. Frontend Architecture

### Directory Structure

```
frontend/
├── app/
│   ├── page.tsx               # Landing: NL search -> paper selection
│   ├── explore/seed/
│   │   ├── page.tsx           # Seed Explorer: sidebar + 3D + detail
│   │   └── ExploreSidebar.tsx # Left sidebar (Clusters | Gaps tabs)
│   ├── auth/                  # Login/signup + OAuth callback
│   └── dashboard/page.tsx     # Saved graphs management
├── components/
│   ├── cosmic/                # Theme: starfield, HUD panels, radar loader
│   ├── graph/
│   │   ├── ScholarGraph3D.tsx       # Main 3D graph component
│   │   ├── useGraphRenderer.ts      # Rendering logic (nodes, edges, clusters)
│   │   ├── useGraphInteractions.ts  # Click, expand, camera interactions
│   │   ├── graphEffects.ts          # Side effects (expansion, camera focus)
│   │   ├── cosmic/                  # Star/nebula/gap renderers + animation
│   │   ├── PaperDetailPanel.tsx     # Paper details + path finder + export
│   │   ├── ClusterPanel.tsx         # Cluster list + visibility toggles
│   │   ├── GapSpotterPanel.tsx      # Gap analysis + bridge papers
│   │   ├── GraphControls.tsx        # Floating control toggles
│   │   └── GraphLegend.tsx          # Visual guide
│   ├── auth/                  # LoginForm, SignupForm
│   └── dashboard/             # SavedGraphs
├── hooks/useGraphStore.ts     # Zustand: graphData, selection, gaps, frontier, paths
├── lib/                       # api.ts, auth-context, supabase, utils, export, three-safety
└── types/index.ts             # Paper, GraphEdge, Cluster, StructuralGap, etc.
```

### State Management (Zustand)

Key state slices:
- `graphData`: nodes, edges, clusters, gaps, frontier_ids, meta
- `selectedPaper`, `selectedCluster`: current selection
- `gaps`, `frontierIds`: gap analysis results
- `activeTab`: 'clusters' | 'gaps'
- `pathStart`, `pathEnd`, `activePath`: citation path finding
- `highlightedClusterPair`, `hoveredGapEdges`: gap visualization
- `panelSelectionId`: triggers camera focus on panel click
- Visibility toggles: citation edges, similarity edges, cluster hulls, labels, bloom, OA rings

---

## 5. Data Flow

### Seed Explore Pipeline

1. **Search**: User enters NL query -> `POST /api/paper-search` -> S2 relevance search
2. **Select**: User picks seed paper from results
3. **Expand**: `POST /api/seed-explore` fetches refs + cites from S2 (depth 1)
4. **Embed**: SPECTER2 embeddings fetched via S2 batch API
5. **Reduce**: PCA 768->100D + UMAP 100->50D (shared) + 50D->3D (viz)
6. **Cluster**: Leiden hybrid on 3-layer graph (citation + bib coupling + similarity), HDBSCAN fallback
7. **Label**: TF-IDF bigram/unigram from abstracts
8. **Analyze**: Similarity edges, bridge detection, citation intents, gap detection, frontier
9. **Render**: GraphData -> react-force-graph-3d -> cosmic 3D visualization

### Incremental Expand

`POST /api/papers/{id}/expand-stable` adds papers with stable 3D positioning:
- New paper positions computed via k-NN interpolation from existing nodes
- Cluster assignment via nearest centroid
- Both citation and similarity edges computed for new papers

---

## 6. External APIs

### Semantic Scholar (Primary)
- Paper metadata, SPECTER2 embeddings (768-dim), TLDRs, citation intents
- Rate limit: 1 RPS authenticated, 0.3 RPS unauthenticated
- Non-commercial license
- Graceful degradation: partial S2 failures return available data

### Crossref (Fallback)
- DOI-to-metadata resolution for papers not indexed by S2
- Flow: S2 miss -> Crossref title lookup -> S2 title search -> best match

---

## 7. Caching Strategy

| Cache Key | TTL | Store |
|-----------|-----|-------|
| seed-explore response | 24h | Redis (Upstash) |
| S2 API responses | In-memory (httpx) | Process memory |

Redis is optional. If unavailable, the application runs without caching (no errors).

---

## 8. Authentication

- Supabase Auth (GoTrue) with JWT (RS256)
- Login methods: email/password, Google OAuth, GitHub OAuth
- Graph CRUD endpoints require valid JWT
- Public endpoints (search, explore, paper detail) work without auth
- RLS enforces per-user data isolation in PostgreSQL

---

## 9. Deployment

| Component | Platform | Config |
|-----------|----------|--------|
| Frontend | Vercel | `vercel.json` -- automatic from GitHub |
| Backend | Render | `render.yaml` -- Docker service, 1 worker |
| Database | Supabase | PostgreSQL 15 + pgvector |
| Cache | Upstash | Serverless Redis |

Environment variables: `DATABASE_URL`, `S2_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `REDIS_URL`, `CORS_ORIGINS`
