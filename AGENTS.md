# ScholarGraph3D v4.0.0 - Agent Coordination

Architecture and data model reference for agents working on ScholarGraph3D.

---

## Architecture Flow

```
User NL Query / DOI
    |
    v
POST /api/paper-search  (Semantic Scholar relevance search)
    |
    v
Paper Selection (user picks seed paper)
    |
    v
POST /api/seed-explore
    |
    +-- Fetch seed paper + embedding from S2
    +-- Fetch references + citations (parallel, depth 1)
    +-- Fetch embeddings for papers missing them (batch)
    +-- PCA 768->100D + UMAP 100->50D->3D
    +-- Leiden hybrid clustering (citation + bib coupling + similarity)
    +--   HDBSCAN fallback when graph too sparse
    +-- TF-IDF cluster labeling (abstract bigrams)
    +-- Cosine similarity edges (>0.7)
    +-- Bridge node detection
    +-- Citation intents (S2 native)
    +-- Gap detection (3-dim scoring)
    +-- Frontier detection
    |
    v
GraphData JSON -> react-force-graph-3d -> 3D Cosmic Visualization
    |
    v
User Interaction: click nodes, expand, view details, save graph
```

Data source: **Semantic Scholar only**. Crossref used as DOI fallback for papers not indexed by S2.

---

## Data Models

### Paper (Frontend: `types/index.ts`)

```typescript
{
  id: string;               // S2 paper ID
  s2_paper_id?: string;
  doi?: string;
  title: string;
  authors: Author[];        // { name, id?, affiliations? }
  year: number;
  venue?: string;
  citation_count: number;
  abstract?: string;
  tldr?: string;
  fields: string[];         // e.g., ["Computer Science"]
  topics: Topic[];          // { id, display_name, score }
  is_open_access: boolean;
  oa_url?: string;
  x: number;                // UMAP 3D position
  y: number;
  z: number;
  cluster_id: number;       // -1 = noise
  cluster_label: string;
  is_bridge?: boolean;
  frontier_score?: number;  // 0-1
  direction?: 'seed' | 'reference' | 'citation';
}
```

### GraphEdge

```typescript
{
  source: string;           // Paper ID
  target: string;
  type: 'citation' | 'similarity' | 'ghost';
  weight: number;
  is_influential?: boolean;
  intent?: 'methodology' | 'background' | 'result_comparison' | 'supports' | 'contradicts';
}
```

### Cluster

```typescript
{
  id: number;
  label: string;            // TF-IDF generated from abstracts
  topics: string[];
  paper_count: number;
  hull_points: [number, number, number][];
  color: string;
  centroid?: [number, number, number];
}
```

### StructuralGap

```typescript
{
  gap_id: string;
  cluster_a: { id: number; label: string; paper_count: number };
  cluster_b: { id: number; label: string; paper_count: number };
  gap_strength: number;     // 0 (well-connected) to 1 (complete gap)
  bridge_papers: { paper_id: string; title: string; score: number; sim_to_cluster_a?: number; sim_to_cluster_b?: number }[];
  potential_edges: { source: string; target: string; similarity: number }[];
  research_questions: (string | { question: string; justification: string; methodology_hint: string })[];
  gap_score_breakdown?: { structural: number; relatedness: number; temporal: number; composite: number };
  key_papers_a?: GapKeyPaper[];
  key_papers_b?: GapKeyPaper[];
  temporal_context?: { year_range_a: [number, number]; year_range_b: [number, number]; overlap_years: number };
  evidence_detail?: { actual_edges: number; max_possible_edges: number; centroid_similarity: number; total_year_span: number };
}
```

Gap scoring weights: structural (0.40) + relatedness (0.35) + temporal (0.25). Research questions are template-generated from paper data (no LLM).

### GraphData (seed-explore response)

```typescript
{
  nodes: Paper[];
  edges: GraphEdge[];
  clusters: Cluster[];
  gaps?: StructuralGap[];
  frontier_ids?: string[];
  meta: {
    total: number;
    query: string;
    seed_paper_id: string;
    seed_title: string;
    citation_edges: number;
    similarity_edges: number;
    clusters: number;
    gaps: number;
    cluster_silhouette: number;
    frontier_papers: number;
    depth: number;
    elapsed_seconds: number;
  };
}
```

---

## API Contracts

### POST /api/paper-search

**Request:** `{ query: string, limit?: number (1-30, default 10) }`

**Response:** `{ papers: PaperSearchResult[], refined_query?: string }`

### POST /api/seed-explore

**Request:**
```json
{
  "paper_id": "string (S2 ID or DOI:...)",
  "depth": 1,
  "max_papers": 50,
  "include_references": true,
  "include_citations": true
}
```

**Response:** GraphData (see above)

### POST /api/papers/{id}/expand-stable

**Request:**
```json
{
  "existing_nodes": [{ "id": "...", "x": 0, "y": 0, "z": 0, "cluster_id": 0 }],
  "limit": 20
}
```

**Response:** `{ nodes: StableExpandNode[], edges: Edge[], total: number, meta?: ExpandMeta }`

### GET /api/papers/{id}

**Response:** `{ id, s2_paper_id, doi, title, abstract, year, venue, citation_count, fields_of_study, tldr, is_open_access, oa_url, authors }`

### GET /api/papers/{id}/intents

**Response:** `CitationIntent[]` with `{ citing_id, cited_id, intent, is_influential, confidence, context }`

### GET /api/papers/by-doi?doi=...

**Response:** `{ paper_id, title, doi, source }` -- source is "s2" or "crossref_fallback"

### Graphs CRUD (auth required)

- `GET /api/graphs` -> `GraphSummary[]`
- `POST /api/graphs` -> `GraphDetail` (body: `{ name, seed_query?, paper_ids?, layout_state?, graph_data? }`)
- `GET /api/graphs/{id}` -> `GraphDetail`
- `PUT /api/graphs/{id}` -> `GraphDetail`
- `DELETE /api/graphs/{id}` -> 204

---

## Backend Directory

```
backend/
├── main.py              # FastAPI app, 4 routers: papers, graphs, seed_explore, paper_search
├── config.py            # Pydantic Settings
├── database.py          # asyncpg pool
├── cache.py             # Redis helpers (Upstash)
├── auth/                # Supabase JWT auth (dependencies, middleware, models, policies)
├── middleware/
│   └── rate_limiter.py
├── integrations/
│   ├── semantic_scholar.py  # S2 client (1 RPS auth, 0.3 RPS unauth)
│   └── crossref.py          # Crossref DOI fallback
├── graph/
│   ├── embedding_reducer.py   # PCA + UMAP pipeline
│   ├── clusterer.py           # Leiden + HDBSCAN + TF-IDF labels
│   ├── similarity.py          # Cosine similarity edges
│   ├── bridge_detector.py     # Bridge node detection
│   ├── incremental_layout.py  # k-NN interpolation for expand-stable
│   └── gap_detector.py        # 3-dim gap scoring
├── services/
│   └── citation_intent.py
├── routers/
│   ├── papers.py          # /api/papers/* endpoints
│   ├── graphs.py          # /api/graphs CRUD
│   ├── seed_explore.py    # /api/seed-explore
│   └── paper_search.py    # /api/paper-search
└── database/
    └── *.sql
```

## Frontend Directory

```
frontend/
├── app/
│   ├── page.tsx               # Landing: NL search -> paper selection
│   ├── explore/seed/
│   │   ├── page.tsx           # Seed Explorer: sidebar + 3D + detail
│   │   └── ExploreSidebar.tsx # Left sidebar (Clusters | Gaps)
│   ├── auth/                  # Login/signup + OAuth callback
│   └── dashboard/page.tsx     # Saved graphs
├── components/
│   ├── cosmic/                # Shared theme components (starfield, HUD, radar)
│   ├── graph/
│   │   ├── ScholarGraph3D.tsx       # Main 3D graph
│   │   ├── useGraphRenderer.ts      # Rendering logic
│   │   ├── useGraphInteractions.ts  # Interaction logic
│   │   ├── graphEffects.ts          # Side effects
│   │   ├── cosmic/                  # Star/nebula/gap renderers + animation manager
│   │   ├── PaperDetailPanel.tsx     # Paper details + path finder + export
│   │   ├── ClusterPanel.tsx         # Cluster list + visibility
│   │   ├── GapSpotterPanel.tsx      # Gap analysis + bridge papers
│   │   ├── GraphControls.tsx        # Floating toggles
│   │   └── GraphLegend.tsx          # Visual guide
│   ├── auth/                  # Login/signup forms
│   └── dashboard/             # SavedGraphs component
├── hooks/useGraphStore.ts     # Zustand store
├── lib/
│   ├── api.ts                 # Backend API client
│   ├── auth-context.tsx       # Auth context
│   ├── supabase.ts            # Supabase client
│   ├── utils.ts               # Utilities (BFS path)
│   ├── export.ts              # BibTeX/RIS export
│   └── three-safety.ts        # Three.js disposal safety
└── types/index.ts             # TypeScript interfaces
```

---

## Development Guidelines

### Naming Conventions
- Python: snake_case for functions/variables, PascalCase for classes
- TypeScript: camelCase for functions/variables, PascalCase for components/types
- API endpoints: lowercase with hyphens (`/api/paper-search`)

### Error Handling
- Backend: Return appropriate HTTP status with `{detail: string}` JSON
- Frontend: User-friendly error messages, retry on 429/network errors
- Graceful degradation: core graph features work without DB (auth/save require persistence)

### Key Constraints
- Three.js pinned at 0.152.2 (ESM compatibility)
- S2 API: 1 RPS authenticated, 0.3 RPS unauthenticated, non-commercial license
- No LLM dependency (Groq/OpenAI removed in v4.0.0)
- No bookmarks, no SNA metrics, no academic reports, no multi-seed merge
- Gap research questions are template-generated from actual paper data
