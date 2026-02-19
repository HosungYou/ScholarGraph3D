# ScholarGraph3D — System Architecture

> **Version:** 1.1 | **Last Updated:** 2026-02-19
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
            |-- S2 keyword search    (async, supplementary)
            |-- DOI dedup + merge    (sync)
            |-- S2 batch embeddings  (async, fills gaps)
            |
            v
        EmbeddingReducer.reduce_to_3d()    (UMAP, numpy)
            |
            v
        PaperClusterer.cluster()           (HDBSCAN)
            |-- label_clusters()           (OA Topics)
            |-- compute_hulls()            (scipy ConvexHull)
            |
            v
        SimilarityComputer.compute_edges() (cosine similarity)
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
| **Database driver** | asyncpg | 0.29+ | Pure-async PostgreSQL driver; connection pooling (min 2, max 5); JSONB codec registration in `init` callback |
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
2. `init_db()` creates the asyncpg connection pool (`min_size=2`, `max_size=5`).
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

- **Connection pool:** `min_size=2`, `max_size=5`, `command_timeout=30.0`, `max_inactive_connection_lifetime=300.0`
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
    │         GET /paper/search?query={q}&limit=100
    │         Rate-limited: 1 RPS via asyncio.Lock
    │
    ├── [2c] DOI Dedup + Merge
    │         Normalize DOIs: strip URL prefix, lowercase
    │         Index S2 by normalized DOI and lowercase title
    │         OA metadata wins; S2 contributes tldr + embedding
    │         Abstract fallback: OA -> S2 abstract -> S2 TLDR -> "No abstract available"
    │         Result: deduplicated List[UnifiedPaper]
    │
    └── [2d] S2 Batch Embedding Fetch
              POST /paper/batch (up to 500/request)
              Fills papers with embedding=None but s2_paper_id present
    |
    v
[Step 3] EmbeddingReducer.reduce_to_3d()
    Input:  numpy array shape (N, 768)
    UMAP(n_components=3, n_neighbors=min(15, N-1),
         min_dist=0.1, metric='cosine', random_state=42)
    Output: numpy array shape (N, 3)
    Papers without embeddings: x=offset*0.5, y=10.0, z=0.0, cluster_id=-1
    |
    v
[Step 4] PaperClusterer.cluster()
    Input:  numpy array shape (N, 768)
    HDBSCAN(min_cluster_size=request.min_cluster_size,
            metric='euclidean', cluster_selection_method='eom')
    Output: (N,) array of cluster labels  (-1 = noise)
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
    Output: List[{source, target, similarity}]
    |
    v
[Step 6] Build GraphResponse
    GraphNode    = paper metadata + 3D coords + cluster_id + cluster_label
    GraphEdge    = {source, target, type="similarity", weight=similarity}
    ClusterInfo  = {id, label, topics, paper_count, color, hull_points}
    meta         = {query, total, with_embeddings, clusters,
                    similarity_edges, elapsed_seconds}
    |
    v
[Step 7] Cache Write
    INSERT INTO search_cache (cache_key, nodes, edges, clusters, meta)
    ON CONFLICT (cache_key) DO UPDATE ... SET created_at = NOW()
    |
    v
[Step 8] Return GraphResponse JSON
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

### 7.3 DataFusionService

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
[L1] PostgreSQL search_cache  (Phase 1 — live)
    cache_key = SHA-256(normalized {query, limit, year_range, fields})
    TTL: 24 hours (enforced at SELECT time)
    HIT  (~50-100ms): return cached GraphResponse
    MISS (~3-5s):     run full pipeline, then upsert cache
    |
    v (on miss)
OA + S2 + UMAP + HDBSCAN + Similarity pipeline

[L2] Upstash Redis  (Phase 2 — planned)
    Hot query in-memory:       TTL = 1 hour
    Per-user rate counters:    TTL = 60 seconds
    GraphRAG chat context:     TTL = session lifetime

[L3] Browser
    Zustand store:             in-memory for current session
    localStorage:              graph state survives page reload
    HTTP cache headers:        standard cache-control for static assets
```

### 9.2 Cache Key Design

```python
cache_key = SHA-256(JSON({
    "query":      query.lower().strip(),
    "limit":      limit,
    "year_range": (year_start, year_end),   # null if unset
    "fields":     sorted(fields) or null,   # sorted for order-independence
}))
```

`"Transformers"` and `"transformers"` produce the same key. `["CS", "Physics"]` and `["Physics", "CS"]` produce the same key.

### 9.3 TTL and Cleanup

| Cache | TTL | Cleanup |
|-------|-----|---------|
| `search_cache` (PostgreSQL) | 24h | `WHERE created_at > NOW() - INTERVAL '24 hours'` at read; periodic `DELETE` of entries > 48h old |
| Redis hot queries | 1h | Redis TTL automatic |
| Redis rate counters | 60s | Redis TTL automatic |

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

*This document is the authoritative source for system structure and design decisions. For product requirements, see [PRD.md](./PRD.md). For API contracts and database schema, see [SPEC.md](./SPEC.md). For test strategy, see [SDD/TDD Plan](./SDD_TDD_PLAN.md).*
