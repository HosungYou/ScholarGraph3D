# ScholarGraph3D — System Architecture

> **Version:** 1.3 | **Last Updated:** 2026-02-20
> **Related:** [PRD.md](./PRD.md) | [SPEC.md](./SPEC.md) | [SDD/TDD Plan](./SDD_TDD_PLAN.md)

---

## Document Map

```
PRD.md                      — What we build and why (user stories, acceptance criteria)
  |
  +-- SPEC.md               — How it works technically (APIs, schemas, pipelines)
  |
  +-- ARCHITECTURE.md (this file) — How the system is structured
  |     |
  |     +-- SS1  System Overview & Diagram
  |     +-- SS2  Technology Stack
  |     +-- SS3  Backend Architecture
  |     +-- SS4  Data Pipeline
  |     +-- SS5  Frontend Architecture
  |     +-- SS6  Database Design
  |     +-- SS7  API Integration Layer
  |     +-- SS8  Authentication & Authorization
  |     +-- SS9  Caching Strategy
  |     +-- SS10 Deployment Architecture
  |     +-- SS11 Security Considerations
  |     +-- SS12 Phase 2 Extension Points
  |     +-- SS13 Cross-References
  |
  +-- SDD_TDD_PLAN.md       — How we verify correctness (tests, TDD cycles)
```

---

## 1. System Overview

ScholarGraph3D is a three-tier web application: a Next.js 14 frontend communicates with a FastAPI backend that reads from and writes to a PostgreSQL database augmented with the pgvector extension. External academic APIs (OpenAlex and Semantic Scholar) are consumed exclusively by the backend.

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Next.js 14 App Router                      │   │
│  │                                                              │   │
│  │  ┌──────────┐  ┌─────────────────┐  ┌───────────────────┐   │   │
│  │  │SearchBar │  │  ScholarGraph3D │  │ PaperDetailPanel  │   │   │
│  │  │ (input)  │  │ (react-force-   │  │  ClusterPanel     │   │   │
│  │  └──────────┘  │  graph-3d +     │  │  GraphControls    │   │   │
│  │                │  Three.js)      │  └───────────────────┘   │   │
│  │                └─────────────────┘                          │   │
│  │                         |                                   │   │
│  │            ┌────────────────────────┐                       │   │
│  │            │   useGraphStore        │                       │   │
│  │            │   (Zustand)            │                       │   │
│  │            └────────────────────────┘                       │   │
│  │                         |                                   │   │
│  │            ┌────────────────────────┐                       │   │
│  │            │   lib/api.ts           │                       │   │
│  │            │   (HTTP client)        │                       │   │
│  │            └────────────────────────┘                       │   │
│  └──────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────────┘
                              │ HTTPS / JSON
                              │
┌─────────────────────────────┼───────────────────────────────────────┐
│                   BACKEND (Render / Docker)                         │
│                             v                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                FastAPI (Python 3.11 + uvicorn)              │    │
│  │                                                             │    │
│  │  CORS Middleware  →  Auth Middleware  →  Route Handlers     │    │
│  │                                                             │    │
│  │  ┌───────────┐  ┌─────────────┐  ┌──────────────────────┐  │    │
│  │  │ /api/     │  │ /api/papers │  │   /api/graphs        │  │    │
│  │  │ search    │  │ /{id}/...   │  │   (auth required)    │  │    │
│  │  └───────────┘  └─────────────┘  └──────────────────────┘  │    │
│  │        |                                                    │    │
│  │  ┌─────┴──────────────────────────────────────┐            │    │
│  │  │            Service Layer                    │            │    │
│  │  │  DataFusionService  EmbeddingReducer        │            │    │
│  │  │  PaperClusterer     SimilarityComputer      │            │    │
│  │  └─────────────────────────────────────────────┘            │    │
│  │        |                    |                               │    │
│  │  ┌─────┴──────┐    ┌────────┴────────┐                      │    │
│  │  │ OpenAlex   │    │ SemanticScholar │                      │    │
│  │  │ Client     │    │ Client          │                      │    │
│  │  └─────┬──────┘    └────────┬────────┘                      │    │
│  └────────┼────────────────────┼──────────────────────────────┘    │
└───────────┼────────────────────┼────────────────────────────────────┘
            │                    │
            v                    v
    ┌──────────────┐    ┌────────────────────┐
    │  OpenAlex    │    │  Semantic Scholar  │
    │  API (CC0)   │    │  API (SPECTER2)    │
    └──────────────┘    └────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                  DATA TIER (Supabase Cloud)                        │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL 15 + pgvector                                  │   │
│  │                                                            │   │
│  │  papers (vector(768))  │  search_cache  │  user_graphs     │   │
│  │  watch_queries         │  auth.users    │  user_settings   │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐   │
│  │  Supabase Auth       │   │  Upstash Redis (Phase 2)         │   │
│  │  (GoTrue / JWT)      │   │  Hot query cache, rate limiting  │   │
│  └─────────────────────┘   └──────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 Request Lifecycle (Search)

```
Browser POST /api/search
    |
    v
CORSMiddleware   (preflight handled, Origin validated)
    |
    v
AuthMiddleware   (NONE level — passes through without token check)
    |
    v
search_papers()  handler  [backend/routers/search.py]
    |
    +--[cache hit]--> return GraphResponse immediately (~50-100ms)
    |
    +--[cache miss]-->
            |
            v
        DataFusionService.search()
            |-- OA keyword search    (async, primary)
            |-- S2 keyword search    (async, supplementary, include_embedding=True)
            |-- DOI dedup + merge    (sync)
            |
            v
        EmbeddingReducer.reduce_to_3d()    (UMAP via asyncio.to_thread)
            |
            v
        PaperClusterer.cluster()           (HDBSCAN on 3D coords via asyncio.to_thread)
            |-- label_clusters()           (OA Topics)
            |-- compute_hulls()            (scipy ConvexHull)
            |
            v
        SimilarityComputer.compute_edges() (cosine similarity via asyncio.to_thread)
            |
            v
        Build GraphResponse (nodes + edges + clusters + meta)
            |
            v
        INSERT INTO search_cache (upsert, 24h TTL)
            |
            v
    Return GraphResponse JSON
```

---

## 2. Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Frontend framework** | Next.js | 14 (App Router) | Server components, file-based routing, Vercel-native deployment; App Router enables layout nesting and streaming |
| **Language (frontend)** | TypeScript | 5.x | Type safety for complex graph data structures; Paper, GraphEdge, Cluster types catch runtime errors at compile time |
| **Styling** | Tailwind CSS | 3.x | Utility-first; dark theme with consistent design tokens; zero runtime CSS overhead |
| **3D visualization** | react-force-graph-3d | latest | Wraps Three.js with force-directed graph primitives; manages WebGL canvas, OrbitControls, and node/link lifecycle |
| **3D rendering** | Three.js | **0.152.2 (pinned)** | WebGL scene management. **Must stay at 0.152.2** — later versions break ESM compatibility with react-force-graph-3d |
| **State management** | Zustand | 4.x | Minimal boilerplate for graph state; single store covers graphData, selectedPaper, visibility toggles, and loading state |
| **Backend framework** | FastAPI | 0.110+ | Async-native Python; automatic OpenAPI docs; Pydantic request/response validation; ASGI lifespan hooks |
| **Language (backend)** | Python | 3.11 | async/await support; numpy/scipy performance; UMAP and HDBSCAN library ecosystem |
| **ASGI server** | uvicorn | latest | Production-grade ASGI; hot reload for development |
| **Database** | PostgreSQL | 15 | JSONB for flexible paper metadata; pgvector for 768-dim SPECTER2 similarity search; RLS for user data isolation |
| **Vector extension** | pgvector | 0.6+ | `ivfflat` index on `vector(768)` column; cosine distance queries for Phase 2 GraphRAG retrieval |
| **Database driver** | asyncpg | 0.29+ | Pure-async PostgreSQL driver; connection pooling (min 1, max 3); JSONB codec registration in `init` callback |
| **Auth provider** | Supabase Auth | cloud | GoTrue-based JWT (RS256); manages `auth.users` table; RLS integration; email/password + OAuth |
| **Embeddings** | SPECTER2 (allenai) | via S2 API | 768-dim scientific document embeddings; retrieved via S2 batch API — no local model hosting required |
| **Dimensionality reduction** | UMAP-learn | 0.5+ | Reduces 768D SPECTER2 vectors to 3D; cosine metric; fixed `random_state=42` for reproducibility |
| **Clustering** | hdbscan | 0.8+ | Density-based; automatically determines cluster count; handles noise points (`cluster_id=-1`) |
| **Numerical computing** | NumPy + SciPy | latest | Embedding arrays; cosine similarity matrix; ConvexHull computation for cluster hull overlays |
| **Settings management** | pydantic-settings | 2.x | Environment variable parsing with type coercion; `.env` file support; `@lru_cache()` singleton |
| **HTTP client** | httpx | 0.27+ | Async HTTP; used by OA and S2 clients; connection pooling; timeout configuration |
| **Cache (Phase 1)** | PostgreSQL search_cache | — | JSONB storage of full GraphResponse; 24h TTL enforced at query time; zero additional infrastructure |
| **Cache (Phase 2)** | Redis via Upstash | serverless | Hot query in-memory cache; rate limit counters per user; serverless billing — no idle cost |
| **Deployment (frontend)** | Vercel | — | Next.js-native; edge CDN; zero-config deployments from GitHub |
| **Deployment (backend)** | Render | — | Docker-based persistent service (not serverless — UMAP needs persistent memory); free tier for MVP |

---

## 3. Backend Architecture

### 3.1 Directory Structure

```
backend/
├── main.py                    # FastAPI app, lifespan, middleware registration
├── config.py                  # pydantic-settings: all env vars in Settings class
├── database.py                # asyncpg pool singleton (Database class + get_db())
├── auth/
│   ├── supabase_client.py     # Supabase GoTrue JWT verification
│   ├── middleware.py          # AuthMiddleware: per-route policy enforcement
│   ├── policies.py            # Route policy map (NONE / OPTIONAL / REQUIRED)
│   ├── dependencies.py        # get_current_user() FastAPI dependency
│   └── models.py              # User, UserCreate, UserLogin, TokenResponse
├── integrations/
│   ├── openalex.py            # OpenAlexClient: search, abstract reconstruction, credit tracking
│   ├── semantic_scholar.py    # SemanticScholarClient: search, batch embeddings, 1 RPS limiter
│   └── data_fusion.py         # DataFusionService: OA-first + S2 enrichment + DOI dedup
├── graph/
│   ├── embedding_reducer.py   # EmbeddingReducer: UMAP 768D -> 3D
│   ├── clusterer.py           # PaperClusterer: HDBSCAN + OA Topic labels + ConvexHull
│   └── similarity.py          # SimilarityComputer: cosine similarity edges
├── routers/
│   ├── search.py              # POST /api/search — full graph pipeline (8 steps)
│   ├── papers.py              # GET /papers/{id}, citations, references, expand
│   └── graphs.py              # GET/POST/PUT/DELETE /api/graphs (auth required)
└── database/
    └── 001_initial_schema.sql # papers, search_cache, user_graphs, watch_queries DDL
```

### 3.2 Application Startup (Lifespan)

`main.py` uses FastAPI's `@asynccontextmanager` lifespan pattern. On startup:

1. Supabase Auth client is initialized if `SUPABASE_URL` and `SUPABASE_KEY` are set.
2. `init_db()` creates the asyncpg connection pool (`min_size=1`, `max_size=3`).
3. pgvector availability is verified via `db.check_pgvector()`.
4. API credentials (S2 key, OA email, OA key) are logged at INFO level (values redacted).

If the database connection fails in `production` or `staging` environments, startup raises `RuntimeError` and the process exits. In `development`, it falls back to memory-only mode so the server can run without a database.

### 3.3 Middleware Stack

FastAPI middleware is declared in reverse execution order. The order in `main.py` is:

```python
app.add_middleware(AuthMiddleware)      # declared first = runs second on request
app.add_middleware(CORSMiddleware, ...) # declared last  = runs first on request
```

Effective request processing order:

```
Incoming Request
       |
       v
  CORSMiddleware     — handles preflight OPTIONS; validates Origin header
       |
       v
  AuthMiddleware     — resolves route policy; extracts + verifies JWT
       |
       v
  Route Handler      — business logic; user attached to request.state
       |
       v
  CORSMiddleware     — adds Access-Control-* headers to response
       |
       v
Outgoing Response
```

CORS allowed origins are read from `settings.cors_origins` (comma-separated string). In `development` mode, `localhost:3000` and `127.0.0.1:3000` are appended automatically via `settings.cors_origins_list`.

### 3.4 Dependency Injection

Two primary FastAPI dependencies are used across all routers:

| Dependency | Provider function | Injected into |
|------------|------------------|---------------|
| `Database` | `get_db()` → returns global `db` singleton | `search`, `papers`, `graphs` routers |
| `User` | `get_current_user()` → reads `request.state.user` (set by AuthMiddleware) | `graphs` router (auth-required endpoints) |

API clients (`OpenAlexClient`, `SemanticScholarClient`) are created **per-request** inside route handlers and closed in `finally` blocks. This ensures HTTP connections are released after each search and prevents connection pool exhaustion.

### 3.5 Configuration (pydantic-settings)

All configuration lives in `config.py` as a `Settings(BaseSettings)` class, cached with `@lru_cache()`:

| Setting | Type | Purpose |
|---------|------|---------|
| `database_url` | str | asyncpg DSN for PostgreSQL |
| `supabase_url` / `supabase_key` / `supabase_jwt_secret` | str | Supabase Auth |
| `s2_api_key` / `s2_rate_limit` | str / float | S2 authentication + 1 RPS rate enforcer |
| `oa_api_key` / `oa_email` / `oa_daily_credit_limit` | str / str / int | OA premium access + daily credit cap (100K) |
| `redis_url` | str | Upstash Redis (Phase 2) |
| `cors_origins` | str | Comma-separated allowed CORS origins |
| `environment` | Literal | `development` / `staging` / `production`; gates startup failure behavior |
| `require_auth` | bool | Global auth enforcement toggle |

### 3.6 Database Class

`database.py` wraps an `asyncpg.Pool` in a `Database` class with:

- **Connection pool:** `min_size=1`, `max_size=3`, `command_timeout=30.0`, `max_inactive_connection_lifetime=300.0`
- **JSONB codec:** registered in the pool's `init` callback so asyncpg automatically decodes JSONB columns to Python dicts
- **Health cache:** `get_health_snapshot()` caches db + pgvector status for 15 seconds (TTL guarded by `asyncio.Lock`)
- **pgbouncer compatibility:** `statement_cache_size=0`
- **Typed helpers:** `fetch()`, `fetchrow()`, `fetchval()`, `execute()`, `executemany()`, `transaction()` context manager

---

## 4. Data Pipeline

The full pipeline runs inside `POST /api/search` in `backend/routers/search.py`. Eight sequential steps transform a user query into a `GraphResponse`.

### 4.1 Pipeline Flow

```
SearchRequest {query, limit, year_start, year_end,
               fields_of_study, similarity_threshold, min_cluster_size}
    |
    v
[Step 1] Cache Check
    cache_key = SHA-256(JSON({query.lower().strip(), limit, year_range, sorted(fields)}))
    SELECT nodes, edges, clusters, meta FROM search_cache
    WHERE cache_key = $1 AND created_at > NOW() - INTERVAL '24 hours'
    |
    +-- HIT  --> return GraphResponse immediately
    |
    +-- MISS --> continue
    |
    v
[Step 2] DataFusionService.search()
    |
    ├── [2a] OpenAlexClient.search_works()
    │         GET /works?search={q}&sort=relevance_score:desc&per_page=100
    │         Abstract reconstruction from inverted index
    │         Credit tracking: 10 credits per page
    │
    ├── [2b] SemanticScholarClient.search_papers()
    │         GET /paper/search?query={q}&limit=100&fields=...embedding...
    │         Embeddings returned inline (include_embedding=True)
    │         Rate-limited: 1 RPS via asyncio.Lock
    │
    └── [2c] DOI Dedup + Merge
              Normalize DOIs: strip URL prefix, lowercase
              Index S2 by normalized DOI and lowercase title
              OA metadata wins; S2 contributes tldr + embedding
              Abstract fallback: OA -> S2 abstract -> S2 TLDR -> "No abstract available"
              Result: deduplicated List[UnifiedPaper]
    |
    v
[Step 3] EmbeddingReducer.reduce_to_3d()
    Input:  numpy array shape (N, 768)
    UMAP(n_components=3, n_neighbors=min(15, N-1),
         min_dist=0.1, metric='cosine', random_state=42)
    Output: numpy array shape (N, 3)
    Papers without embeddings: x=offset*0.5, y=10.0, z=0.0, cluster_id=-1
    Execution: asyncio.to_thread() — non-blocking event loop
    |
    v
[Step 4] PaperClusterer.cluster()
    Input:  numpy array shape (N, 3) — UMAP 3D coordinates
    HDBSCAN(min_cluster_size=request.min_cluster_size,
            metric='euclidean', cluster_selection_method='eom')
    Output: (N,) array of cluster labels  (-1 = noise)
    Execution: asyncio.to_thread() — non-blocking event loop
    |
    ├── label_clusters()
    │     Collect OA Topics from cluster members
    │     Top-2 most frequent topic display_names -> cluster label
    │     Assign color from 15-color palette
    │
    └── compute_hulls()
          scipy.spatial.ConvexHull on 3D coordinates per cluster
    |
    v
[Step 5] SimilarityComputer.compute_edges()
    Normalize embeddings (L2 norm)
    Pairwise cosine similarity = normalized @ normalized.T
    Keep pairs where similarity >= threshold (default 0.7)
    Top max_edges_per_node (default 10) per paper
    Deduplicate: emit edge only where i < j
    Execution: asyncio.to_thread() — non-blocking event loop
    Output: List[{source, target, similarity}]
    |
    v
[Step 6] Build GraphResponse
    GraphNode    = paper metadata + 3D coords + cluster_id + cluster_label
    GraphEdge    = {source, target, type="similarity", weight=similarity}
    ClusterInfo  = {id, label, topics, paper_count, color, hull_points}
    meta         = {query, total, with_embeddings, clusters,
                    similarity_edges, elapsed_seconds,
                    citation_edges: 0, citation_enriched: False}
    |
    v
[Step 7] Cache Write
    INSERT INTO search_cache (cache_key, nodes, edges, clusters, meta)
    ON CONFLICT (cache_key) DO UPDATE ... SET created_at = NOW()
    |
    v
[Step 8] Return GraphResponse JSON  ← client receives response here (~45-70s)
    |
    v (background — does NOT block response)
[Step 9] _enrich_citations_background()  asyncio.create_task() (v0.8.0)
    Selects top-20 papers by citation_count
    For each: SemanticScholarClient.get_references() + get_citations()
              → Redis cache hit: skip S2 API
              → Redis cache miss: S2 API → store in Redis (TTL 7d)
    Inserts citation edges into search_cache
    Updates meta.citation_edges + meta.citation_enriched = True
    Total time: ~20s (cached: ~2s)
    Effect on user: next search result load shows citation edges
```

### 4.2 UnifiedPaper Data Model

The `DataFusionService` produces `UnifiedPaper` objects — the internal representation used across all pipeline stages:

| Field | Source | Notes |
|-------|--------|-------|
| `title` | OA (preferred), S2 fallback | |
| `abstract` | OA inverted-index → S2 abstract → S2 TLDR | Fallback chain |
| `year` | OA | |
| `doi` | OA (normalized: strip URL prefix, lowercase) | Primary dedup key |
| `citation_count` | OA | |
| `fields_of_study` | OA concepts / S2 fields | |
| `oa_topics` | OA topics (hierarchical with scores) | Used for cluster labeling |
| `tldr` | S2 exclusive | One-sentence auto-generated summary |
| `embedding` | S2 SPECTER2 (768-dim float list) | Core for UMAP + similarity edges |
| `s2_paper_id` | S2 exclusive | Required for citation expansion |
| `oa_work_id` | OA exclusive | |
| `authors` | OA (with affiliations) | |
| `is_open_access` / `oa_url` | OA | |

### 4.3 GraphResponse Models (Pydantic)

Defined in `backend/routers/search.py`:

```python
class GraphNode(BaseModel):
    id: str                           # sequential string index "0", "1", ...
    title: str
    abstract: Optional[str]
    year: Optional[int]
    venue: Optional[str]
    citation_count: int = 0
    fields: List[str]                 # fields_of_study
    tldr: Optional[str]
    is_open_access: bool = False
    oa_url: Optional[str]
    authors: List[Dict[str, Any]]
    doi: Optional[str]
    s2_paper_id: Optional[str]
    oa_work_id: Optional[str]
    topics: List[Dict[str, Any]]      # OA topics with scores
    x: float; y: float; z: float     # UMAP 3D coordinates
    cluster_id: int = -1
    cluster_label: str = ""

class GraphEdge(BaseModel):
    source: str; target: str
    type: str                         # "similarity" or "citation"
    weight: float = 1.0

class ClusterInfo(BaseModel):
    id: int; label: str
    topics: List[str]
    paper_count: int; color: str
    hull_points: List[List[float]]

class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    clusters: List[ClusterInfo]
    meta: Dict[str, Any]
```

---

## 5. Frontend Architecture

### 5.1 Directory Structure

```
frontend/
├── app/                           # Next.js App Router
│   ├── layout.tsx                 # Root layout: AuthProvider, global styles
│   ├── page.tsx                   # Landing page with SearchBar
│   ├── explore/page.tsx           # Main 3-panel exploration view
│   ├── auth/login/page.tsx
│   ├── auth/signup/page.tsx
│   └── dashboard/page.tsx         # Saved graphs list
├── components/graph/
│   ├── ScholarGraph3D.tsx         # 3D canvas component (706 lines, forwardRef)
│   ├── PaperDetailPanel.tsx       # Right panel: paper metadata + expand
│   ├── ClusterPanel.tsx           # Left panel: cluster list + focus actions
│   ├── SearchBar.tsx              # Search input + year/field filters
│   └── GraphControls.tsx          # Floating toggle buttons + reset camera
├── hooks/
│   └── useGraphStore.ts           # Zustand store (single global state)
├── lib/
│   ├── api.ts                     # Backend HTTP client (typed fetch wrappers)
│   ├── auth-context.tsx           # Supabase Auth React context provider
│   └── supabase.ts                # Supabase client initialization
└── types/index.ts                 # Paper, GraphEdge, Cluster, GraphData
```

Phase 4 additions:
- `conceptualEdges` layer: SPECTER2 pre-filtered pairs classified via Groq LLM (methodology_shared/theory_shared/similarity_shared)
- `selectedPaperIdRef` pattern: eliminates prop re-creation race condition on node click
- Timeline mode: fixes node fy by publication year for chronological layout

### 5.2 Component Hierarchy

```
app/explore/page.tsx
    |
    ├── SearchBar
    │     Input:   query string, year_start/end, fields_of_study
    │     Action:  calls api.search() → dispatches setGraphData() to store
    │
    ├── ClusterPanel  (left sidebar)
    │     Reads:   graphData.clusters from useGraphStore
    │     Action:  selectCluster() → ScholarGraph3D.focusOnCluster(clusterId)
    │
    ├── ScholarGraph3D  (center canvas, forwardRef)
    │     Reads:   graphData, selectedPaper, show* flags from useGraphStore
    │     |
    │     ├── ForceGraph3D (react-force-graph-3d, dynamic import ssr=false)
    │     │     |
    │     │     └── Three.js scene
    │     │           ├── SphereGeometry per node (MeshPhongMaterial)
    │     │           ├── RingGeometry for selected node (gold, #FFD700)
    │     │           ├── Sprite (CanvasTexture) for author+year labels
    │     │           ├── LineDashedMaterial for similarity edges
    │     │           └── cluster-hulls THREE.Group (ShapeGeometry, 1s interval)
    │     │
    │     └── Exposes ref: { focusOnPaper, focusOnCluster, resetCamera }
    │
    ├── PaperDetailPanel  (right sidebar)
    │     Reads:   selectedPaper, hoveredPaper from useGraphStore
    │     Action:  expand → api.expand(id) → store.addNodes(nodes, edges)
    │
    └── GraphControls  (floating overlay)
          Actions: toggleCitationEdges, toggleSimilarityEdges,
                   toggleClusterHulls, toggleLabels, resetCamera
```

### 5.3 Zustand State (useGraphStore)

Single store in `frontend/hooks/useGraphStore.ts`:

**State shape:**

| Field | Type | Description |
|-------|------|-------------|
| `graphData` | `GraphData \| null` | Full graph: nodes, edges, clusters, meta |
| `selectedPaper` | `Paper \| null` | Currently selected paper (detail panel + node highlight) |
| `selectedCluster` | `Cluster \| null` | Currently focused cluster |
| `multiSelected` | `Paper[]` | Shift+Click multi-selection set |
| `hoveredPaper` | `Paper \| null` | Paper under cursor (tooltip via 50ms debounce) |
| `isLoading` | `boolean` | Search in progress |
| `error` | `string \| null` | Last error message |
| `showCitationEdges` | `boolean` | Toggle: citation edge visibility (default true) |
| `showSimilarityEdges` | `boolean` | Toggle: similarity edge visibility (default true) |
| `showClusterHulls` | `boolean` | Toggle: convex hull overlay (default true) |
| `showLabels` | `boolean` | Toggle: node label sprites (default true) |

**Key actions:**

| Action | Behavior |
|--------|----------|
| `setGraphData(data)` | Replaces entire graph; clears error |
| `selectPaper(paper \| null)` | Sets selection; triggers highlight recomputation in ScholarGraph3D via `useMemo` |
| `addNodes(nodes, edges)` | Deduplication-safe expansion: filters `existingNodeIds` Set and `existingEdgeKeys` Set before merging |
| `toggleMultiSelect(paper)` | Adds or removes from `multiSelected` array |
| `toggleCitationEdges()` etc. | Boolean flip; `forceGraphData` useMemo recomputes on next render |

### 5.4 Three.js Rendering Pipeline

```
forceGraphData (useMemo)
    Inputs: graphData, yearRange, showCitationEdges, showSimilarityEdges
    Produces: ForceGraphNode[] + ForceGraphLink[]
    |
    v
ForceGraph3D renders:

  Per Node (nodeThreeObject callback):
    THREE.Group
      └── THREE.Mesh (SphereGeometry, radius = max(3, log(citation_count+1)*3))
            MeshPhongMaterial {
              color:             FIELD_COLOR_MAP[primaryField]
                                 '#FFD700' if selected
                                 '#4ECDC4' if highlighted (neighbor of selected)
              emissiveIntensity: 0.6 selected | 0.4 highlighted | 0.15 default
              opacity:           1.0 selected/highlighted
                                 0.15 if selection exists but not connected
                                 0.3 + 0.7 * ((year - minYear) / yearSpan) default
            }
      └── THREE.Mesh (RingGeometry r*1.3..r*1.5) — selected node only (#FFD700)
      └── THREE.Sprite (CanvasTexture 512x128px)  — if showLabels=true
            Text: "AuthorLastName Year" truncated at 18 chars
            Color: #FFD700 selected | #4ECDC4 highlighted | #FFFFFF default

  Per Link (linkThreeObject + linkColor callbacks):
    Similarity: THREE.Line (LineDashedMaterial, dashSize=2, gapSize=1.5, opacity=0.3)
    Citation:   default react-force-graph-3d line + directional arrow (3px, at target)
    Color rules:
      No selection:  similarity='rgba(74,144,217,0.15)', citation=opacity(0.2+w*0.1)
      With selection: connected edges = color+'CC', others = 'rgba(255,255,255,0.03)'

  Cluster Hulls (useEffect, setInterval 1000ms):
    THREE.Group 'cluster-hulls' added to fgRef.current.scene()
    For each cluster with >= 3 positioned nodes:
      computeConvexHull2D(positions projected to XY)
      CatmullRomCurve3 (smoothed, closed=true)
      THREE.ShapeGeometry + MeshBasicMaterial(opacity=0.06, DoubleSide, depthWrite=false)
      mesh.position.z = centroid_z - 5

Force Simulation config:
    warmupTicks=100      — pre-simulate before first render
    cooldownTicks=0      — stop immediately (preserve UMAP layout)
    d3VelocityDecay=0.9  — high damping, minimal drift from UMAP positions
    Initial camera: (0, 0, 500) looking at origin (set after 500ms setTimeout)
    enableNodeDrag=true  — nodes get fx/fy/fz during drag, cleared on dragEnd
```

### 5.5 Dynamic Import (SSR Safety)

`ForceGraph3D` uses `next/dynamic` with `ssr: false`. Three.js and react-force-graph-3d reference `window` and `document` — unavailable during Next.js server-side rendering. A centered spinner is displayed during client-side hydration.

### 5.6 ScholarGraph3D Ref API

`ScholarGraph3D` is a `forwardRef` component exposing:

| Method | Behavior |
|--------|----------|
| `focusOnPaper(paperId)` | Animates camera to `(x, y, z+200)` looking at `(x, y, z)` over 1000ms |
| `focusOnCluster(clusterId)` | Computes cluster centroid; animates camera to `centroid + (0, 0, 400)` |
| `resetCamera()` | Animates camera back to `(0, 0, 500)` looking at origin |

---

## 6. Database Design

> Full DDL in `backend/database/001_initial_schema.sql`. Complete column definitions in [SPEC.md SS5](./SPEC.md#5-database-schema).

### 6.1 Entity-Relationship Diagram

```
┌──────────────────────────────┐        ┌───────────────────────────────┐
│           papers             │        │          user_graphs           │
├──────────────────────────────┤        ├───────────────────────────────┤
│ id             BIGSERIAL PK  │        │ id          UUID PK            │
│ s2_paper_id    TEXT UNIQUE   │        │ user_id     UUID FK→auth.users │
│ oa_work_id     TEXT UNIQUE   │        │ name        TEXT (1-200 chars) │
│ doi            TEXT          │        │ seed_query  TEXT               │
│ title          TEXT NOT NULL │        │ paper_ids   TEXT[]             │
│ abstract       TEXT          │        │ layout_state JSONB             │
│ year           INTEGER       │        │ created_at  TIMESTAMPTZ        │
│ venue          TEXT          │        │ updated_at  TIMESTAMPTZ        │
│ citation_count INTEGER       │        └───────────────────────────────┘
│ fields_of_study TEXT[]       │                      |
│ topics         JSONB         │              ON DELETE CASCADE
│ tldr           TEXT          │                      |
│ is_open_access BOOLEAN       │        ┌─────────────v─────────────────┐
│ oa_url         TEXT          │        │         auth.users             │
│ authors        JSONB         │        │         (Supabase managed)     │
│ embedding      vector(768)   │        ├───────────────────────────────┤
│ created_at     TIMESTAMPTZ   │        │ id    UUID PK                  │
│ updated_at     TIMESTAMPTZ   │        │ email TEXT                     │
└──────────────────────────────┘        └───────────────────────────────┘

┌──────────────────────────────┐        ┌───────────────────────────────┐
│         search_cache         │        │    watch_queries (Phase 3)     │
├──────────────────────────────┤        ├───────────────────────────────┤
│ cache_key  TEXT PK           │        │ id           UUID PK           │
│ nodes      JSONB NOT NULL    │        │ user_id      UUID FK→auth      │
│ edges      JSONB NOT NULL    │        │ query        TEXT              │
│ clusters   JSONB NOT NULL    │        │ filters      JSONB             │
│ meta       JSONB             │        │ last_checked TIMESTAMPTZ       │
│ created_at TIMESTAMPTZ       │        │ last_count   INTEGER           │
└──────────────────────────────┘        │ is_active    BOOLEAN           │
                                        └───────────────────────────────┘
```

### 6.2 Index Strategy

| Table | Index | Purpose |
|-------|-------|---------|
| `papers` | `idx_papers_doi` (partial, `doi IS NOT NULL`) | DOI dedup lookups during fusion |
| `papers` | `idx_papers_s2_id` (partial) | Paper detail fetch by S2 ID |
| `papers` | `idx_papers_oa_id` (partial) | Paper detail fetch by OA work ID |
| `papers` | `idx_papers_year` | Year-range filter queries |
| `papers` | `idx_papers_citation_count DESC` | Top papers by impact |
| `papers` | `idx_papers_embedding` ivfflat cosine, `lists=100` | Phase 2 GraphRAG vector search |
| `user_graphs` | `idx_user_graphs_user_id` | User's graph list |
| `user_graphs` | `idx_user_graphs_updated (user_id, updated_at DESC)` | Ordered dashboard list |

### 6.3 pgvector Configuration

The `embedding vector(768)` column stores SPECTER2 vectors. The `ivfflat` index (`lists=100`) provides approximate nearest-neighbor search. Recommended `probes=10` at query time for a balance of speed and recall.

Phase 2 GraphRAG retrieval query:
```sql
SELECT id, title, abstract, tldr
FROM papers
ORDER BY embedding <=> $1   -- cosine distance operator
LIMIT 20;
```

### 6.4 Row-Level Security

`user_graphs` has four RLS policies (SELECT, INSERT, UPDATE, DELETE), all gated on `auth.uid() = user_id`. Even if application-layer auth is bypassed, RLS prevents cross-user data access at the query planner level. `auth.uid()` is a Supabase function that reads the JWT claim embedded in the PostgreSQL session.

---

## 7. API Integration Layer

### 7.1 OpenAlexClient

**File:** `backend/integrations/openalex.py`

| Aspect | Detail |
|--------|--------|
| Base URL | `https://api.openalex.org` |
| Authentication | `mailto` param for polite pool; `Authorization: Bearer {key}` for premium |
| Rate limits | 10 req/sec (polite pool); 100K credits/day (premium) |
| HTTP client | `httpx.AsyncClient`, 30s timeout |
| Abstract format | Inverted index: `{"word": [position, ...], ...}` — `_reconstruct_abstract()` reverses the word-position map to recover readable text |
| Credit tracking | `CreditTracker`: increments counter per API call (10 credits/page); logs warnings at 80%; switches to cache-first at 95% |

**Credit Tracking States:**

```
Normal (< 80%)      → Full API access, normal per_page
Warning (80-95%)    → Log warnings; continue API access
Cache-first (≥ 95%) → Serve stale cache if available;
                       reduced per_page on cache miss only
```

### 7.2 SemanticScholarClient

**File:** `backend/integrations/semantic_scholar.py`

| Aspect | Detail |
|--------|--------|
| Base URL | `https://api.semanticscholar.org/graph/v1` |
| Authentication | `x-api-key` header |
| Rate limit | 1 RPS authenticated — enforced by `asyncio.Lock` + `asyncio.sleep` |
| Retry logic | 3 attempts with exponential backoff on HTTP 429; raises `SemanticScholarRateLimitError` after exhausting |
| Batch endpoint | `POST /paper/batch` — up to 500 paper IDs per request, `fields=embedding,tldr` |
| SPECTER2 field | `embedding.specter_v2` in response — 768-element float list |
| **Redis cache (v0.8.0)** | `get_references()` / `get_citations()` check Redis (`refs:{id}:{limit}`, `cites:{id}:{limit}`) before hitting S2 API; store on miss |
| Null safety | `(data.get("data") or [])` — S2 returns `{"data": null}` for unindexed papers; `.get(key, [])` only uses default when key is absent, not when value is null |
| Error isolation | HTTP 400/404 from S2 → returns `[]` (non-fatal); references and citations fetched independently so partial failures don't block each other |

### 7.3 CrossrefClient (v0.8.0)

**File:** `backend/integrations/crossref.py`

| Aspect | Detail |
|--------|--------|
| Base URL | `https://api.crossref.org/works` |
| Authentication | None — polite pool via `User-Agent: ScholarGraph3D/0.8.0 (mailto:...)` |
| Rate limit | ~50 req/sec (polite pool, unmetered) |
| Timeout | 15s per request |
| Key method | `get_metadata(doi)` → `{title, year, authors, doi}` or `None` |
| Use case | DOI fallback when S2 returns 404 — covers economics, law, humanities journals not indexed by S2 |

**Fallback integration in `papers.py`:**
```
S2 direct → [404] → Crossref metadata → S2 title search → Jaccard ≥ 0.3 → paper_id
```

### 7.4 OpenCitationsClient (v0.8.0)

**File:** `backend/integrations/opencitations.py`

| Aspect | Detail |
|--------|--------|
| Base URL | `https://opencitations.net/index/coci/api/v1` |
| Authentication | None |
| Rate limit | 180 req/min |
| Endpoints | `GET /citations/{doi}` (papers citing this DOI), `GET /references/{doi}` (papers cited by this DOI) |
| Response format | `[{"citing": doi, "cited": doi, "creation": date, "timespan": duration, ...}]` |
| PostgreSQL cache | `oc_citation_cache(citing_doi, cited_doi, fetched_at)` — migration `003_opencitations_cache.sql` |
| Helper methods | `extract_cited_dois(results)`, `extract_citing_dois(results)` |
| Purpose | DOI-based citation pairs — enables Co-citation + Bibliographic Coupling edges (v0.9.0) independent of S2 paper_id |

### 7.6 DataFusionService

**File:** `backend/integrations/data_fusion.py`

Merge priority table:

| Field | Winner | Reason |
|-------|--------|--------|
| title, abstract, authors | OA | CC0 license; higher coverage; structured affiliations |
| topics (hierarchical) | OA | OA Topics taxonomy is richer than S2 fields |
| tldr | S2 | S2 exclusive |
| embedding (SPECTER2) | S2 | S2 exclusive |
| s2_paper_id | S2 | S2 exclusive |

**DOI normalization:**
```python
doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "").lower().strip()
```

Title-based matching (lowercased, stripped) is the fallback when DOIs are absent.

---

## 8. Authentication & Authorization

> See [SPEC.md SS9](./SPEC.md#9-authentication--authorization) for complete route policy table and JWT details.

### 8.1 Supabase Auth Flow

```
Browser                     FastAPI Backend              Supabase Auth
   |                              |                            |
   |-- POST /api/auth/login ----->|                            |
   |                              |-- verify credentials ----->|
   |                              |<-- JWT (RS256) ------------|
   |<-- { access_token, ... } ----|                            |
   |                              |                            |
   |-- GET /api/graphs ---------->|                            |
   |   Authorization: Bearer JWT  |                            |
   |                              |-- verify_jwt(token) ------>|
   |                              |<-- { user_id, email, ... }--|
   |                              |                            |
   |                              | request.state.user = User  |
   |                              |-- SELECT FROM user_graphs  |
   |                              |   WHERE user_id = $1       |
   |                              |   (+ RLS enforces same)    |
   |<-- [ GraphSummary, ... ] ----|                            |
```

### 8.2 JWT Verification

`AuthMiddleware` extracts the `Bearer` token from the `Authorization` header and calls `supabase_client.verify_token()`. Supabase verifies the RS256 JWT signature against the project's `SUPABASE_JWT_SECRET`. Decoded claims (`sub` = user UUID, `email`, `role`) are attached to `request.state.user`.

Access tokens expire after 1 hour. The frontend refreshes via Supabase client's `refreshSession()`.

### 8.3 Route Policy Map

| Route Pattern | Auth Level | Behavior |
|--------------|------------|----------|
| `/`, `/health`, `/docs`, `/openapi.json`, `/redoc` | NONE | Always pass through |
| `/api/auth/signup`, `/api/auth/login`, `/api/auth/refresh` | NONE | Auth endpoints are public |
| `/api/auth/me`, `/api/auth/logout` | REQUIRED | User-specific |
| `/api/search` | NONE | Core feature — free for all users |
| `/api/papers/*` | NONE | Paper data — free for all users |
| `/api/graphs/*` | REQUIRED | Saved graphs require valid JWT |
| All other routes | OPTIONAL | Token validated if present; proceeds regardless |

### 8.4 Defense in Depth

Authorization is enforced at two independent layers:

1. **Middleware layer** — `AuthMiddleware` returns HTTP 401 for REQUIRED routes without a valid token.
2. **Database layer** — PostgreSQL RLS policies prevent cross-user data access even if the middleware is bypassed. The RLS check is at query planner level — it cannot be overridden by application code.

---

## 9. Caching Strategy

### 9.1 Cache Layers

```
Incoming Search Request
    |
    v
[L1] PostgreSQL search_cache  (live — Phase 1)
    cache_key = SHA-256(normalized {query, limit, year_range, fields})
    TTL: 24 hours (enforced at SELECT time)
    HIT  (~50-100ms): return cached GraphResponse
    MISS (~45-70s):   run full pipeline, then upsert cache
    |
    v (on miss)
OA + S2 + UMAP + HDBSCAN + Similarity pipeline
    |
    v
[L2] Upstash Redis  (live — v0.8.0, REDIS_URL set on Render)
    emb:{s2_paper_id}          TTL = 30 days  ← SPECTER2 768-dim embedding
    refs:{paper_id}:{limit}    TTL = 7 days   ← get_references() result
    cites:{paper_id}:{limit}   TTL = 7 days   ← get_citations() result
    search:{sha256}            TTL = 24 hours ← full GraphResponse
    |
    → Cache MISS: S2 API call → store result → return
    → Cache HIT:  return immediately (skip S2 API)
    → Redis DOWN: graceful degradation — pass-through to S2 (no crash)

[L3] Browser
    Zustand store:             in-memory for current session
    localStorage:              graph state survives page reload
    HTTP cache headers:        standard cache-control for static assets
```

### 9.2 Cache Key Design

```python
# PostgreSQL L1 cache
cache_key = SHA-256(JSON({
    "query":      query.lower().strip(),
    "limit":      limit,
    "year_range": (year_start, year_end),   # null if unset
    "fields":     sorted(fields) or null,   # sorted for order-independence
}))

# Redis L2 cache keys (backend/cache.py)
f"emb:{s2_paper_id}"           # SPECTER2 embedding
f"refs:{paper_id}:{limit}"     # S2 references list
f"cites:{paper_id}:{limit}"    # S2 citations list
f"search:{sha256_key}"         # Full search response
```

`"Transformers"` and `"transformers"` produce the same L1 key. `["CS", "Physics"]` and `["Physics", "CS"]` produce the same key.

### 9.3 TTL and Cleanup

| Cache | TTL | Cleanup |
|-------|-----|---------|
| `search_cache` (PostgreSQL) | 24h | `WHERE created_at > NOW() - INTERVAL '24 hours'` at read; periodic `DELETE` of entries > 48h old |
| `oc_citation_cache` (PostgreSQL) | 30 days | `oc_stale_cache` view; manual cleanup via `DELETE WHERE fetched_at < NOW() - INTERVAL '30 days'` |
| Redis `emb:*` | 30 days | Redis TTL automatic |
| Redis `refs:*` / `cites:*` | 7 days | Redis TTL automatic |
| Redis `search:*` | 24h | Redis TTL automatic |

### 9.4 Cache-First Mode (OA Credit Protection)

When OA API credit usage reaches 95% of the 100K daily limit, the system degrades gracefully:

1. Check `search_cache` as normal.
2. On cache miss: query for stale entries (older than 24h but still in table).
3. Stale entry exists → return it with `meta.cache_stale: true`.
4. No entry → make OA API call with reduced `per_page` to conserve remaining credits.

---

## 10. Deployment Architecture

### 10.1 Infrastructure Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Production                                  │
│                                                                     │
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────────┐   │
│  │    Vercel    │     │     Render        │     │   Supabase     │   │
│  │  (Frontend)  │     │   (Backend)       │     │  (DB + Auth)   │   │
│  │              │     │                  │     │                │   │
│  │ Next.js 14   │────>│ Docker container │────>│ PostgreSQL 15  │   │
│  │ Edge CDN     │     │ FastAPI/uvicorn  │     │ + pgvector     │   │
│  │ Auto-deploy  │     │ Python 3.11      │     │ + GoTrue Auth  │   │
│  │ from GitHub  │     │ Auto-deploy      │     │ RLS policies   │   │
│  └──────────────┘     │ from GitHub      │     └────────────────┘   │
│                        └──────────────────┘                          │
│                                |                                     │
│                        ┌───────v───────┐                            │
│                        │    Upstash    │                            │
│                        │    Redis      │                            │
│                        │  (Phase 2)   │                            │
│                        └───────────────┘                            │
│                                                                     │
│  External APIs (backend-only):                                      │
│    OpenAlex API         https://api.openalex.org                    │
│    Semantic Scholar API https://api.semanticscholar.org             │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Service Configuration

| Service | Platform | Plan | Notes |
|---------|----------|------|-------|
| Frontend | Vercel | Hobby (free) | Auto-deploy on `main` push; edge CDN |
| Backend | Render | Free (initial) | Persistent service — not serverless; Docker; spins down after 15min inactivity on free tier |
| Database | Supabase | Free (initial) | 500MB storage; pgvector enabled; 2 CPU shared |
| Auth | Supabase | Included | 50K MAU on free tier |
| Redis | Upstash | Phase 2 | Serverless; pay per request; 256MB free tier |

### 10.3 Environment Variables

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | Backend | Yes | PostgreSQL DSN (Supabase connection pooler URL) |
| `SUPABASE_URL` | Both | Yes | Supabase project URL |
| `SUPABASE_KEY` | Both | Yes | Supabase anon (public) key |
| `SUPABASE_JWT_SECRET` | Backend | Yes | JWT signature verification secret |
| `S2_API_KEY` | Backend | No | Semantic Scholar API key (1 RPS authenticated vs 100 req/5min unauthenticated) |
| `OA_EMAIL` | Backend | No | OpenAlex polite pool email (higher rate limits) |
| `OA_API_KEY` | Backend | No | OpenAlex premium key (100K credits/day) |
| `OA_DAILY_CREDIT_LIMIT` | Backend | No | Daily credit cap (default 100000) |
| `REDIS_URL` | Backend | No | Upstash Redis URL (Phase 2) |
| `CORS_ORIGINS` | Backend | Yes | Comma-separated allowed origins |
| `ENVIRONMENT` | Backend | Yes | `development` / `staging` / `production` |
| `NEXT_PUBLIC_API_URL` | Frontend | Yes | Backend API base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Yes | Supabase anon key |

### 10.4 CI/CD

```
GitHub push (main branch)
    |
    ├── GitHub Actions
    │     ├── backend-tests:  cd backend && pytest -v --cov=. --cov-report=xml
    │     └── frontend-tests: cd frontend && npm ci && npm test -- --coverage
    │
    ├── Vercel (automatic)
    │     Detects frontend/ changes; deploys Next.js to edge CDN
    │
    └── Render (automatic)
          Detects backend/ changes; rebuilds Docker image; zero-downtime deploy
```

> Full CI configuration: [SDD/TDD Plan SS6](./SDD_TDD_PLAN.md#6-cicd-integration).

---

## 11. Security Considerations

### 11.1 CORS

`CORSMiddleware` is the outermost middleware layer. Only origins in `CORS_ORIGINS` receive `Access-Control-Allow-Origin` headers. `allow_credentials=True` supports cookie-based Supabase sessions. Allowed methods: `GET, POST, PUT, DELETE, OPTIONS`. Allowed headers: `Authorization, Content-Type, X-Requested-With`.

### 11.2 Input Validation

All incoming request bodies are validated by Pydantic models before reaching route handlers. FastAPI returns HTTP 422 with field-level errors on validation failure:

| Endpoint | Key constraints |
|----------|----------------|
| `POST /api/search` | `query`: 1-500 chars; `limit`: 1-500; `similarity_threshold`: 0.0-1.0; `min_cluster_size`: 2-50 |
| `POST /api/graphs` | `name`: 1-200 chars (enforced by DB `CHECK` too) |
| `GET /papers/{id}/citations` | `limit`: 1-500 |

No raw user input is interpolated into SQL strings, shell commands, or file paths.

### 11.3 SQL Injection Prevention

All database queries use asyncpg parameterized queries (`$1`, `$2`, ...):

```python
# Safe — parameterized
await db.fetchrow(
    "SELECT nodes, edges, clusters, meta FROM search_cache WHERE cache_key = $1",
    cache_hash
)
```

String formatting of user input into SQL is never done anywhere in the codebase.

### 11.4 Authentication Security

- JWTs are RS256-signed by Supabase — the backend cannot forge tokens, and neither can users.
- `SUPABASE_JWT_SECRET` is stored as an environment variable, never in source code.
- LLM API keys (Phase 2) are stored **client-side only** in `localStorage` — never transmitted to the ScholarGraph3D backend. GraphRAG calls go directly from the browser to the user's chosen LLM provider.
- `GET /api/graphs/{graph_id}` returns 404 for both "not found" and "wrong user" — prevents graph ID enumeration.

### 11.5 Rate Limiting

| Target | Mechanism |
|--------|-----------|
| S2 API (external) | `SemanticScholarClient` async lock; hard 1 RPS maximum |
| OA API (external) | `CreditTracker`; cache-first mode at 95% of 100K/day |
| Own API endpoints (Phase 2) | Redis-based sliding window per user; 60s window |

### 11.6 Data Privacy

- `user_graphs` isolated by PostgreSQL RLS — cross-user access is impossible at the DB level.
- No analytics tracking or third-party JS trackers.
- Paper metadata (CC0 from OA) is cached in `search_cache` without user attribution.
- `user_settings` table (Phase 2) stores LLM provider preference only — **never** LLM API keys.

---

## 12. Phase 2 Extension Points

The architecture is designed with forward compatibility for Phase 2 (AI Premium) and Phase 3 (Real-time).

### 12.1 LLM Integration Architecture (US-11, US-14)

LLM calls go **directly from the browser** to preserve user API key privacy:

```
Browser
  |
  +-- User types question in GraphRAG chat panel
  |
  v
lib/graphrag.ts  (new file, Phase 2)
  |
  +-- 1. Vector-search papers relevant to the question
  |       GET /api/search/similar?embedding={vec}&limit=20
  |       (new backend endpoint: SELECT ... ORDER BY embedding <=> $1 LIMIT 20)
  |
  +-- 2. Build context: top-20 paper abstracts + cluster labels
  |
  +-- 3. POST to user's LLM provider directly from browser
  |       (Groq / OpenAI / Anthropic / Google — user's own API key)
  |
  +-- 4. Stream response to chat panel
  |
  +-- 5. Parse paper citations in response → highlight graph nodes
```

New backend endpoint needed: `GET /api/search/similar` — takes a 768-dim embedding and returns similar papers using pgvector `<=>` on the `idx_papers_embedding` ivfflat index.

### 12.2 Trend Analysis (US-12)

New endpoint: `GET /api/graphs/{graph_id}/trends`

- Year-wise paper counts per cluster
- Growth classification: Emerging (>50% YoY), Stable, Declining
- Frontend: timeline slider + cluster color modulation by growth class

### 12.3 Gap Analysis (US-13)

New endpoint: `GET /api/graphs/{graph_id}/gaps`

- Inter-cluster citation density matrix
- Low-density cluster pairs ranked as research opportunity hypotheses
- Frontend: gap overlay edges between cluster centroids + gap panel

### 12.4 Watch Queries (US-16)

Schema: `watch_queries` table already in DDL (see [SPEC.md SS5.4](./SPEC.md#54-future-tables-phase-2)).

New components:
- Backend cron (Render Cron or GitHub Actions scheduled): weekly diff of new papers vs `last_count`
- Notification: Supabase `send_email` + in-app badge

### 12.5 Real-time Sync (Phase 3)

For real-time collaborative graph editing:
- Supabase Realtime (PostgreSQL logical replication) broadcasts `user_graphs` row changes
- Frontend subscribes via `supabase.channel('user_graphs').on(...)` — no custom WebSocket server needed

---

## 13. Cross-References

### 13.1 Document Linkage

| Section in This Document | Referenced By |
|--------------------------|---------------|
| SS1 System Overview | [SPEC.md SS1](./SPEC.md#1-system-overview) (core data flow); [PRD.md SS8](./PRD.md#8-release-plan) (v0.1.0 scaffold) |
| SS2 Technology Stack | [PRD.md SS9](./PRD.md#9-non-functional-requirements) (browser/WebGL requirements); [CLAUDE.md](../CLAUDE.md) (tech stack table) |
| SS3 Backend Architecture | [SPEC.md SS9.3](./SPEC.md#93-route-policies) (middleware flow); [SPEC.md SS3](./SPEC.md#3-data-sources) (client references) |
| SS4 Data Pipeline | [SPEC.md SS7](./SPEC.md#7-search-pipeline-spec) (step-by-step pipeline spec); [PRD.md US-01, US-02, US-03](./PRD.md#phase-1-mvp--v010--v050) |
| SS5 Frontend Architecture | [SPEC.md SS6](./SPEC.md#6-3d-visualization-spec) (node/edge visual mapping); [PRD.md US-04, US-05, US-10](./PRD.md#phase-1-mvp--v010--v050) |
| SS6 Database Design | [SPEC.md SS5](./SPEC.md#5-database-schema) (complete DDL + RLS policies); [PRD.md US-06](./PRD.md#phase-1-mvp--v010--v050) (save/load) |
| SS7 API Integration Layer | [SPEC.md SS3](./SPEC.md#3-data-sources) (data source properties, licenses, rate limits) |
| SS8 Authentication | [SPEC.md SS9](./SPEC.md#9-authentication--authorization) (JWT details, route policies, RLS); [PRD.md US-06](./PRD.md#phase-1-mvp--v010--v050) |
| SS9 Caching Strategy | [SPEC.md SS8](./SPEC.md#8-caching-strategy) (cache parameters, cache-first mode); [PRD.md SS5](./PRD.md#5-success-metrics) (>40% cache hit rate target) |
| SS10 Deployment | [PRD.md SS9](./PRD.md#9-non-functional-requirements) (99.5% uptime SLA); [SDD/TDD Plan SS6](./SDD_TDD_PLAN.md#6-cicd-integration) |
| SS11 Security | [PRD.md SS7](./PRD.md#7-risks--mitigations) (risk table); [SPEC.md SS9.5](./SPEC.md#95-row-level-security) |
| SS12 Phase 2 Extensions | [PRD.md US-11 through US-18](./PRD.md#phase-2-ai-premium--v060--v090); [SPEC.md SS7 GraphRAG](./SPEC.md#7-search-pipeline-spec) |

### 13.2 Testing Cross-References

| Architecture Component | Test Location | Coverage Target |
|-----------------------|---------------|----------------|
| `DataFusionService` (DOI dedup, merge, fallback) | `backend/tests/test_integrations/test_data_fusion.py` | 90%+ |
| `EmbeddingReducer` (UMAP 768→3) | `backend/tests/test_graph/test_embedding_reducer.py` | 85%+ |
| `PaperClusterer` (HDBSCAN, topic labels, hulls) | `backend/tests/test_graph/test_clusterer.py` | 85%+ |
| `SimilarityComputer` (cosine, threshold, dedup) | `backend/tests/test_graph/test_similarity.py` | 90%+ |
| `AuthMiddleware` + route policies | `backend/tests/test_auth/test_dependencies.py` | 90%+ |
| `POST /api/search` full pipeline | `backend/tests/test_routers/test_search.py` | Integration |
| `useGraphStore` (state transitions, addNodes dedup) | `frontend/__tests__/hooks/useGraphStore.test.ts` | 85%+ |
| `ScholarGraph3D` component | `frontend/__tests__/components/` | 70%+ |

> Full test strategy, TDD cycles, and mock strategy: [SDD/TDD Plan](./SDD_TDD_PLAN.md).

### 13.3 Decision Log

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| PostgreSQL + pgvector over dedicated vector DB | Pinecone, Weaviate, Qdrant | Single database simplifies ops; pgvector sufficient for <100K vectors; included free in Supabase |
| UMAP over t-SNE | t-SNE, PCA | UMAP preserves global structure; faster; native 3D support; deterministic with `random_state=42` |
| HDBSCAN over K-Means | K-Means, DBSCAN, Spectral | Auto-detects cluster count; handles noise as `cluster_id=-1`; density-based matches paper distributions |
| Zustand over Redux | Redux, Jotai, Recoil | Minimal boilerplate; no providers/reducers; concurrent mode compatible; sufficient for single-store app |
| react-force-graph-3d over custom Three.js | Pure Three.js, D3 3D | Battle-tested force layout; built-in camera controls; node/link lifecycle managed; clean escape hatches for custom geometry |
| asyncpg over SQLAlchemy | SQLAlchemy async, Tortoise ORM | Maximum async performance; direct SQL control; no ORM overhead; JSONB codec support |
| Bring-Your-Own-Key over managed LLM | OpenAI on our backend | Zero marginal cost; user privacy; provider choice; no billing infrastructure needed |
| OA-first fusion over S2-first | S2-first, equal weight | OA is CC0 (no license risk for commercial use); better metadata coverage; S2 adds value via embeddings/TLDR |
| Three.js pinned at 0.152.2 | Latest Three.js | Later versions break ESM compatibility with react-force-graph-3d |

---

## 14. Phase 2 — AI Premium & Analysis System (v0.2.0)

Added in parallel with Phase 1.5 enhancements. Includes LLM multi-provider support, GraphRAG chat, trend analysis, and gap detection.

> See [CLAUDE.md](../CLAUDE.md#llm-provider-architecture-phase-2) for provider architecture.

---

## 15. Phase 3 — Real-Time & Natural Language (v0.3.0)

Added in release 2026-02-19. Includes natural language search with Groq, SSE progress streaming, citation context modals, rate limiting, and analytics.

### 15.1 Natural Language Search Pipeline (Track 3)

`POST /api/search/natural` enables freeform English queries processed through a semantic understanding layer before structured search.

#### Pipeline Flow

```
Natural Language Query
    |
    v
[Groq LLaMA 3.3-70b] (query_parser.py)
    |-- Extract: keywords, date range, field filters, intent
    |-- Generate: 3-5 expanded query variants
    |
    v
[query_normalizer.py]
    |-- Remove stopwords (English, scientific domain)
    |-- Normalize: "transformer models" → "transformer"
    |-- Canonicalize: "deep learning" → {keywords: ["deep learning"]}
    |
    v
[Parallel Expanded Search]
    |-- OA search with each variant (top-3 papers per variant)
    |-- S2 search with primary query + variants
    |-- Pool results: deduplicate, merge relevance scores
    |
    v
[Fused Graph]
    |-- Standard pipeline: DOI merge → UMAP → HDBSCAN → similarity
    |-- Return: GraphResponse with `query_type: "natural"`
```

**Request:**
```json
{
  "query": "What are the latest advances in making transformers more efficient?",
  "groq_api_key": "optional, uses backend key if not provided",
  "limit": 200
}
```

**Response:** Same `GraphResponse` as `POST /api/search` with additional field:
```json
{
  "nodes": [...],
  "edges": [...],
  "clusters": [...],
  "meta": {
    "query_type": "natural",
    "normalized_keywords": ["transformers", "efficiency"],
    "expanded_queries": ["transformer efficiency", "efficient attention", "..."],
    "elapsed_seconds": 4.2
  }
}
```

#### Services

**`services/query_normalizer.py`**
```python
class QueryNormalizer:
    def normalize(query: str) -> Dict[str, Any]:
        # Tokenize, remove stopwords, extract entities
        # Return: {keywords, year_min, year_max, fields, intent}

    def has_date_filter(query: str) -> Tuple[int, int] | None:
        # Detect "since 2020", "2018-2023", etc.

    def extract_fields(query: str) -> List[str]:
        # Detect "in biology", "physics papers", etc.
```

**`services/query_parser.py`**
```python
class QueryParser:
    def parse_with_groq(query: str, groq_api_key: str) -> ParsedQuery:
        # POST to Groq API (LLaMA 3.3-70b)
        # Prompt: Extract structure + generate 3 expanded variants
        # Return: ParsedQuery(keywords, expanded_queries, year_min, year_max, fields)

    def fallback_parse(query: str) -> ParsedQuery:
        # Regex + QueryNormalizer fallback if Groq unavailable
```

**Integration in `routers/search.py`:**
```python
@router.post("/api/search/natural")
async def search_natural(
    req: NaturalSearchRequest,
    db: Database = Depends(get_db)
) -> GraphResponse:
    """Natural language search with Groq parsing."""
    parsed = await query_parser.parse_with_groq(req.query, req.groq_api_key)
    # Execute DataFusionService with parsed.keywords + parsed.expanded_queries
    # Return same GraphResponse pipeline
```

### 15.2 SSE Progress Stream (Track 5)

`GET /api/search/stream?q=...` streams 8-stage progress events to the frontend via Server-Sent Events.

#### Event Sequence

```
Client: GET /api/search/stream?q=transformers
    |
    v
Server: Content-Type: text/event-stream

event: start
data: {"stage": "init", "progress": 0.0, "message": "Starting search..."}

event: stage
data: {"stage": "fetch", "progress": 0.3, "message": "Fetching from OpenAlex and Semantic Scholar"}

event: stage
data: {"stage": "embed", "progress": 0.6, "message": "Computing embeddings..."}

event: stage
data: {"stage": "layout", "progress": 0.75, "message": "Reducing to 3D space..."}

event: stage
data: {"stage": "cluster", "progress": 0.85, "message": "Clustering papers..."}

event: stage
data: {"stage": "edges", "progress": 0.92, "message": "Computing similarity edges..."}

event: complete
data: {"stage": "done", "progress": 1.0, "message": "Complete", "nodes": [...], "edges": [...], "clusters": [...], "meta": {...}}

event: error
data: {"error": "Rate limit exceeded"}
```

#### Implementation

**`routers/search.py` streaming handler:**
```python
@router.get("/api/search/stream")
async def search_stream(q: str, db: Database = Depends(get_db)):
    """Stream search progress via SSE."""
    async def event_generator():
        yield f"event: start\ndata: {json.dumps({'stage': 'init', 'progress': 0})}\n\n"

        # Step 1-2: Fetch + Embed
        yield f"event: stage\ndata: {json.dumps({'stage': 'fetch', 'progress': 0.3})}\n\n"
        papers = await data_fusion_service.search(q)

        yield f"event: stage\ndata: {json.dumps({'stage': 'embed', 'progress': 0.6})}\n\n"
        # (embeddings already fetched in data_fusion)

        # Step 3-5: UMAP, HDBSCAN, Similarity
        yield f"event: stage\ndata: {json.dumps({'stage': 'layout', 'progress': 0.75})}\n\n"
        coords_3d = await embedding_reducer.reduce_to_3d(papers)

        yield f"event: stage\ndata: {json.dumps({'stage': 'cluster', 'progress': 0.85})}\n\n"
        clusters = await paper_clusterer.cluster(coords_3d)

        yield f"event: stage\ndata: {json.dumps({'stage': 'edges', 'progress': 0.92})}\n\n"
        edges = await similarity_computer.compute_edges(papers)

        # Return complete graph
        graph = build_graph_response(papers, coords_3d, clusters, edges)
        yield f"event: complete\ndata: {json.dumps({'stage': 'done', 'progress': 1.0, 'data': graph})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

**Frontend consumption** (lib/api.ts):
```typescript
export async function* searchStream(query: string) {
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
```

### 15.3 Citation Context Modal (Track 4)

When user clicks a citation edge in the 3D graph, `CitationContextModal` displays the citation's context sentence and metadata.

#### Component Flow

```
ScholarGraph3D (3D canvas)
    |
    +-- onLinkClick event (react-force-graph-3d)
    |
    v
Custom Event: citationEdgeClick
    |
    +-- dispatch(window.CustomEvent('citationEdgeClick', {
    |     detail: {
    |       citing_paper_id: "0",
    |       cited_paper_id: "5",
    |       intent: "methodology",
    |       context: "Our approach builds on the methodology from..."
    |     }
    |   }))
    |
    v
app/explore/page.tsx — window.addEventListener('citationEdgeClick')
    |
    v
CitationContextModal (new component)
    |-- Show citing paper title + year
    |-- Show cited paper title + year
    |-- Highlight intent badge (color-coded)
    |-- Display context sentence (extracted from S2 citation API)
    |-- Button: "View Citing Paper" (focus camera on citing_paper_id)
    |-- Button: "View Cited Paper" (focus camera on cited_paper_id)
```

**`components/graph/CitationContextModal.tsx`:**
```typescript
interface CitationContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  citingPaper: Paper | null;
  citedPaper: Paper | null;
  intent: string;
  context: string;
}

const intentColors: Record<string, string> = {
  methodology: '#9B59B6',
  background: '#95A5A6',
  result_comparison: '#4A90D9',
  supports: '#2ECC71',
  contradicts: '#E74C3C'
};

export const CitationContextModal: React.FC<CitationContextModalProps> = ({
  isOpen, onClose, citingPaper, citedPaper, intent, context
}) => {
  if (!isOpen || !citingPaper || !citedPaper) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-slate-900 p-6 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-1" style={{ backgroundColor: intentColors[intent] }} />
          <h3 className="text-lg font-semibold">{intent}</h3>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-slate-400">Citing</p>
            <p className="text-sm">{citingPaper.title} ({citingPaper.year})</p>
          </div>
          <div className="text-center text-slate-500">↓ cites ↓</div>
          <div>
            <p className="text-xs text-slate-400">Cited</p>
            <p className="text-sm">{citedPaper.title} ({citedPaper.year})</p>
          </div>
        </div>

        <div className="mt-4 bg-slate-800 p-3 rounded text-sm text-slate-200 italic">
          "{context}"
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={() => window.dispatchEvent(new CustomEvent('focusPaper', { detail: citingPaper.id }))}>
            View Citing
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('focusPaper', { detail: citedPaper.id }))}>
            View Cited
          </button>
        </div>
      </div>
    </Modal>
  );
};
```

### 15.4 Middleware (Track 6)

Two new middleware layers enforce rate limiting and track analytics.

#### Rate Limiting Middleware

**`middleware/rate_limiter.py`**
```python
from collections import defaultdict
from time import time

class SlidingWindowRateLimiter:
    """Token bucket per IP with 60-second sliding window."""

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, ip: str) -> bool:
        now = time()
        # Remove old requests outside window
        self.requests[ip] = [t for t in self.requests[ip] if now - t < self.window_seconds]

        if len(self.requests[ip]) < self.max_requests:
            self.requests[ip].append(now)
            return True
        return False

# Per-endpoint rate limits
RATE_LIMITS = {
    "/api/search": (60, 3600),           # 60 searches/hour
    "/api/search/natural": (60, 3600),   # 60 NL searches/hour
    "/api/chat": (20, 3600),             # 20 AI chats/hour
    "/api/chat/stream": (20, 3600),      # 20 streamed chats/hour
}

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host
    endpoint = request.url.path

    if endpoint in RATE_LIMITS:
        max_req, window_sec = RATE_LIMITS[endpoint]
        limiter = SlidingWindowRateLimiter(max_req, window_sec)

        if not limiter.is_allowed(ip):
            return JSONResponse(
                {"error": "Rate limit exceeded"},
                status_code=429,
                headers={"Retry-After": str(window_sec)}
            )

    return await call_next(request)
```

#### Analytics Middleware

**`middleware/analytics.py`**
```python
import hashlib
from datetime import datetime

class SearchAnalytics:
    """Track search queries for trend analysis."""

    async def log_search(self, query: str, ip: str, result_count: int, elapsed_ms: float):
        """Hash IP for privacy; store query, count, latency."""
        ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:16]

        await db.execute(
            """
            INSERT INTO search_analytics (ip_hash, query, result_count, elapsed_ms, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            """,
            ip_hash, query, result_count, elapsed_ms
        )

@app.middleware("http")
async def analytics_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/search"):
        ip = request.client.host
        start = time.time()
        response = await call_next(request)
        elapsed = (time.time() - start) * 1000

        if response.status_code == 200:
            body = json.loads(await response.body())
            query = request.query_params.get("q", "")
            result_count = len(body.get("nodes", []))

            await search_analytics.log_search(query, ip, result_count, elapsed)

        return response

    return await call_next(request)
```

### 15.5 Frontend Server Component Split

`app/layout.tsx` refactored to use Next.js Server Components with client-side provider injection.

**`app/layout.tsx` (Server Component):**
```typescript
import { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'ScholarGraph3D',
  description: '3D academic paper graph visualization',
  viewport: 'width=device-width, initial-scale=1.0',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />
      </head>
      <body className="bg-slate-950 text-slate-100">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

**`app/providers.tsx` (Client Component):**
```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth-context';
import { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      gcTime: 1000 * 60 * 10, // 10 min (formerly cacheTime)
    }
  }
});

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Benefits:**
- `metadata` export available at root level (Server Component feature)
- All client hydration logic centralized in single `Providers` component
- Reduces layout.tsx bundle footprint (no client code in root)
- Easier auth context updates without recompiling layout

### 15.6 Database Schema Extensions

New tables support analytics and enhanced citation tracking.

**`search_analytics` table:**
```sql
CREATE TABLE search_analytics (
    id              BIGSERIAL PRIMARY KEY,
    ip_hash         TEXT NOT NULL,                 -- SHA-256(IP) first 16 chars
    query           TEXT,                          -- Truncated search query
    result_count    INT,                           -- Papers returned
    elapsed_ms      FLOAT,                         -- Query latency
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_analytics_created ON search_analytics(created_at);
CREATE INDEX idx_analytics_query ON search_analytics(query);
```

**`citations` table enhancements:**
New columns added via migration:
```sql
ALTER TABLE citations ADD COLUMN context TEXT;           -- Citation sentence
ALTER TABLE citations ADD COLUMN is_influential BOOLEAN DEFAULT FALSE;  -- S2 flag
```

---

## 16. Phase 4 — Conceptual Relationships (v0.4.0)

Critical node-click bug fix, panel resize, conceptual edges SSE streaming, 3-mode home page, and timeline view.

Phase 4 endpoints:
- GET /api/analysis/conceptual-edges/stream — SSE stream of conceptual relationships
- POST /api/analysis/scaffold-angles — LLM-generated research angle suggestions
- GET /api/papers/by-doi — Seed paper lookup by DOI

---

## 17. Phase 1.5 — Visualization Enhancement System (v0.1.5)

Added in commit `485e099` (2026-02-19). All changes are additive; no existing Phase 1 behaviour was removed.

### 14.1 New Backend Modules

#### `backend/graph/bridge_detector.py`

Detects papers that act as topological bridges between clusters.

```
detect_bridge_nodes(nodes, edges, top_percentile=0.05) → Set[str]

Algorithm:
  1. Build node→cluster map from nodes list
  2. For each edge (source, target) where source_cluster ≠ target_cluster:
       bridge_score[source] += 1
       bridge_score[target] += 1
  3. Only count nodes that bridge ≥ 2 distinct clusters
  4. Return top `top_percentile` (5%) of scorers (min 1 node)

Used by: routers/search.py — marks GraphNode.is_bridge = True before response
```

#### `backend/graph/incremental_layout.py`

Stable graph expansion without UMAP re-run (nearest-neighbour interpolation).

```
place_new_paper(new_embedding, existing_nodes, k=3, jitter_scale=2.0) → (x, y, z)
  → cosine similarity against all existing_nodes
  → weighted average of top-k positions + Gaussian jitter

assign_cluster(new_embedding, cluster_centroids, threshold=0.5) → int
  → nearest centroid by cosine similarity; returns -1 if below threshold

compute_cluster_centroids(nodes) → Dict[int, np.ndarray]
  → mean SPECTER2 embedding per cluster_id

Used by: routers/papers.py POST /api/papers/{id}/expand-stable
```

#### `backend/routers/papers.py` — new endpoint

```
POST /api/papers/{paper_id}/expand-stable
Body: { existing_nodes: GraphNodeInput[], existing_edges: EdgeInput[] }
Returns: { nodes: StableExpandNode[], edges: EdgeOut[] }

StableExpandNode adds: initial_x, initial_y, initial_z, cluster_id
  → frontend uses these coords to insert without layout jump
```

#### `backend/routers/search.py` — bridge detection addition

`GraphNode` schema gains `is_bridge: bool = False`. After graph build, `detect_bridge_nodes()` runs and sets the flag. `meta` dict gains `"bridge_nodes": int` count.

---

### 14.2 Frontend State Extensions (`hooks/useGraphStore.ts`)

New state fields added to the Zustand store:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `showBloom` | `boolean` | `false` | Bloom/glow halo on selected node |
| `showGhostEdges` | `boolean` | `false` | Orange dashed potential-citation edges |
| `showGapOverlay` | `boolean` | `false` | Coloured gap lines between cluster centroids |
| `hiddenClusterIds` | `Set<number>` | `new Set()` | Per-cluster visibility toggle |
| `bridgeNodeIds` | `Set<string>` | `new Set()` | Pre-computed bridge paper IDs |

New actions: `toggleBloom`, `toggleGhostEdges`, `toggleGapOverlay`, `toggleClusterVisibility(id)`, `setBridgeNodeIds(ids)`, `addNodesStable(expansion)`.

`addNodesStable` deduplicates by ID and uses `initial_x/y/z` from the backend response, preventing position jumps.

---

### 14.3 Visualization Enhancements (`ScholarGraph3D.tsx`)

#### 3-Tier Dimming (focus system)

When a paper is selected:
- **Selected node**: 100% opacity + gold `#FFD700` colour
- **Direct neighbours**: 60% opacity, teal highlight
- **All others**: 15% opacity

#### Centrality-Based Labels

Labels are shown only for nodes satisfying: `isSelected || isHighlighted || citationPercentile > 0.8`

Font size scales: `10 + 18 * citationPercentile` px (10 px–28 px range).

#### Per-Node Visual Layers (Three.js geometry groups)

Each node `nodeThreeObject` may render up to 4 layers:

| Condition | Layer | Geometry | Colour |
|-----------|-------|----------|--------|
| Always | Core sphere | `SphereGeometry(r, 16, 16)` | Field colour |
| `is_bridge` | Gold glow | `SphereGeometry(1.5r, 8, 8)` | `#FFD700`, opacity 0.15 |
| `is_open_access` | OA ring | `RingGeometry(1.1r, 1.3r, 32)` | `#2ECC71`, opacity 0.7 |
| `citationPercentile > 0.9` | Citation aura | `SphereGeometry(1.5r, 8, 8)` | `#FFD700`, opacity 0.12 |
| `showBloom && isSelected` | Bloom halo | `SphereGeometry(1.3r, 8, 8)` | Node colour, opacity 0.12 |

#### Ghost Edges

When `showGhostEdges` is enabled, similarity edges with `weight > 0.75` that have no corresponding citation edge are rendered as orange (`#FF8C00`) dashed lines. Filtered out otherwise for performance.

#### Gap Overlay

When `showGapOverlay` is enabled, a `useEffect` runs a 1500 ms interval that:
1. Computes live cluster centroids from node 3D positions
2. Iterates all cluster pairs; counts cross-cluster edges to derive `density`
3. Renders `LineDashedMaterial` lines coloured by density:
   - `density < 0.05` → Red `#FF4444` (strong gap, high research opportunity)
   - `density < 0.10` → Amber `#FFD700` (medium gap)
   - `density ≥ 0.10` → Green `#44FF44` (weak gap)
4. Adds a pulsing `SphereGeometry` hotspot at the midpoint:
   `scale = 1 + sin(Date.now() * 0.003) * 0.3` via `requestAnimationFrame`

Overlay objects are added to `gapOverlayRef` and cleaned up on toggle/unmount.

#### Hidden Cluster Filtering

`forceGraphData` useMemo filters out nodes whose `cluster_id` is in `hiddenClusterIds` before passing to the graph engine.

---

### 14.4 UI Controls

#### `GraphControls.tsx` — new toggle buttons

| Button | Icon | Store action | Default |
|--------|------|-------------|---------|
| Bloom Effect | `Sun` / `SunDim` | `toggleBloom` | OFF |
| Ghost Edges | `Zap` | `toggleGhostEdges` | OFF |
| Gap Overlay | `Target` | `toggleGapOverlay` | OFF |

#### `ClusterPanel.tsx` — enhancements

- **Edge count badge**: `clusterEdgeCounts` useMemo counts intra-cluster edges
- **Density bar**: relative width `(edgeCount / maxEdges) * 100%` in cluster colour
- **Visibility toggle**: Eye/EyeOff button calls `toggleClusterVisibility(cluster.id)`; hidden clusters fade to 40% opacity in panel
- **Focus button**: Dispatches `window.dispatchEvent(new CustomEvent('focusCluster', { detail: { clusterId } }))` — handled in `explore/page.tsx` → `graphRef.current?.focusOnCluster()`

#### `explore/page.tsx` — camera event wiring

`useRef<ScholarGraph3DRef>` + two `window` event listeners:
- `resetCamera` → `graphRef.current?.resetCamera()`
- `focusCluster` → `graphRef.current?.focusOnCluster(clusterId)`

---

### 14.5 Decision Log Additions

| Decision | Rationale |
|----------|-----------|
| Nearest-neighbour interpolation over UMAP re-run | Avoids global coordinate shift on expansion; ~5 ms/node vs. 2–10 s UMAP; no extra infrastructure |
| Top-5% bridge threshold | Empirically balances signal vs. noise; configurable via `top_percentile` param |
| Ghost edges default OFF | Performance: filtering happens in `forceGraphData` memo; large graphs (500+ nodes) can generate thousands of ghost edges |
| Gap overlay 1500 ms interval | Balances live-position accuracy with CPU cost; centroid recalculation is O(n) |
| Three.js geometry groups per node | Allows additive visual layers without reimplementing the node renderer; each layer is a child of the group returned by `nodeThreeObject` |

---

## 18. Phase 6 — Visualization & Exploration (v0.6.0)

Added in 2026-02-20. Includes field color fix, LOD/opacity improvements, panel highlight on selection, seed paper exploration mode, citation enrichment step, 2D timeline view, citation intent toggle, and research settings panel.

### 18.1 Seed Paper Exploration Pipeline (`POST /api/seed-explore`)

A new router `backend/routers/seed_explore.py` exposes a graph-building pipeline seeded from a single known paper rather than a keyword query. The pipeline:

```
POST /api/seed-explore
Body: { paper_id, depth, max_papers, include_references, include_citations }
    |
    v
[Step 1] Fetch seed paper by s2_paper_id or doi (DB or S2 API fallback)
    |
    v
[Step 2] BFS expansion — up to `depth` hops via S2 citations + references
    |-- Each hop: fetch citing/referenced paper IDs (respecting include_* flags)
    |-- Deduplicate by s2_paper_id across all hops
    |-- Stop when max_papers reached
    |
    v
[Step 3] Citation enrichment — POST /paper/batch to fetch SPECTER2 embeddings
    |   for all expanded papers (same enrichment step as main search pipeline)
    |
    v
[Step 4] Standard pipeline: UMAP 3D reduction → HDBSCAN clustering → similarity edges
    |
    v
[Step 5] Build GraphResponse — seed paper node flagged with is_seed: true
    |
    v
Return GraphResponse JSON
```

The frontend `app/explore/seed/page.tsx` provides a dedicated entry point: user pastes a DOI or S2 paper ID, the page calls `/api/seed-explore`, and renders the resulting graph in the standard 3-panel `explore` layout.

### 18.2 Citation Enrichment Step

Citation enrichment is now a discrete step in both the main search pipeline and the seed explore pipeline. After DOI dedup, any paper with a known `s2_paper_id` but a missing SPECTER2 embedding is submitted to `POST /paper/batch` in chunks of 500. This increases the fraction of papers with embeddings (and thus placement in UMAP space) compared to the prior approach of using inline embeddings from the search endpoint alone.

The updated data flow for the search pipeline Step 2 is:

```
[Step 2] DataFusionService.search()
    |-- 2a OA keyword search
    |-- 2b S2 keyword search (include_embedding=True)
    |-- 2c DOI dedup + merge
    |-- 2d Citation enrichment: batch-fetch missing SPECTER2 embeddings  ← new
```

`meta.with_embeddings` in GraphResponse now reflects the post-enrichment count.

### 18.3 2D Timeline View (`TimelineView.tsx`)

`components/analysis/TimelineView.tsx` renders a D3-based 2D scatter plot of papers positioned by publication year (x-axis) and citation count (y-axis). Activated when `show2DTimeline` is `true` in `useGraphStore`.

Key implementation details:

- Rendered in an SVG canvas via `d3-scale` (linear x/log y) and `d3-axis`
- Each paper is a circle sized by citation count, colored by the same `FIELD_COLOR_MAP` used in the 3D graph
- Clicking a circle calls `selectPaper()` in the Zustand store, syncing selection with the 3D view
- The view updates reactively when `graphData` or `selectedPaper` changes
- Brushing (drag to select a year range) sets `yearRange` in the store, filtering both the 2D and 3D views simultaneously

`show2DTimeline` is a new boolean field in `useGraphStore` (default `false`). Toggled by a button in `GraphControls.tsx`. When `true`, `TimelineView` overlays the bottom portion of the explore page canvas area.

### 18.4 Updated Data Flow Diagram Note

The high-level diagram in SS1.1 remains accurate. The citation enrichment step (18.2) is internal to the Service Layer box. The seed explore pipeline uses the same Service Layer components (EmbeddingReducer, PaperClusterer, SimilarityComputer) via `seed_explore.py` router, adding a new arrow from `/api/seed-explore` into the Service Layer.

---

*This document is the authoritative source for system structure and design decisions. For product requirements, see [PRD.md](./PRD.md). For API contracts and database schema, see [SPEC.md](./SPEC.md). For test strategy, see [SDD/TDD Plan](./SDD_TDD_PLAN.md).*
