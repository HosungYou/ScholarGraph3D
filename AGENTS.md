# ScholarGraph3D - Agent Coordination & Architecture

This document provides architectural guidance for agents building ScholarGraph3D components.

---

## Project Overview

**ScholarGraph3D** is a literature discovery platform that visualizes academic papers as an interactive 3D knowledge graph. Users search by keyword and explore paper relationships through citations and semantic similarity.

### Core Architecture Flow

```
User Search Query
    ↓
[Backend Search Router]
    ↓
OpenAlex API (primary) + Semantic Scholar (enrichment)
    ↓
[Data Fusion] - Deduplication, enrichment, abstract reconstruction
    ↓
[Embedding Reducer] - SPECTER2 embeddings → UMAP 3D projection
    ↓
[Clustering] - HDBSCAN + OpenAlex Topics labeling
    ↓
[Similarity Edges] - Cosine similarity > 0.7
    ↓
[Graph JSON Response]
    ↓
[Frontend] - react-force-graph-3d visualization
    ↓
User Interaction - Click/Double-click/Shift+click
```

---

## Data Models

### Core Entities

**Paper Node**
```
{
  id: string,                    # Composite: `{s2_id}` or `{oa_id}`
  s2_id: string | null,          # Semantic Scholar ID
  oa_id: string | null,          # OpenAlex ID
  doi: string | null,
  title: string,
  authors: string[],             # Flattened author names
  year: number,
  venue: string,                 # Journal/Conference
  citation_count: number,
  abstract: string | null,
  tldr: string | null,           # From Semantic Scholar
  fields: string[],              # OpenAlex Fields (e.g., ["Computer Science"])
  topics: Array<{id, name}>,     # OpenAlex Topics with IDs
  is_open_access: boolean,
  oa_url: string | null,
  x: number,                     # 3D position (UMAP)
  y: number,
  z: number,
  cluster_id: number,            # HDBSCAN cluster ID (-1 = noise)
  cluster_label: string,         # Human-readable label from OA Topics
}
```

**Edge (Citation or Similarity)**
```
{
  source: string,                # Paper ID
  target: string,                # Paper ID
  type: "citation" | "similarity",
  weight: number,                # Citation count or cosine similarity (0-1)
  intent?: string,               # "supports" | "contradicts" | "compares" | "methodology"
                                 # (for citations, from Semantic Scholar)
}
```

**Cluster**
```
{
  id: number,
  label: string,                 # Generated from dominant OA Topics
  topics: Array<{id, name, count}>,
  paper_count: number,
  hull_points: Array<{x, y, z}>, # Convex hull for visualization
}
```

**GraphData (API Response)**
```
{
  nodes: Paper[],
  edges: Edge[],
  clusters: Cluster[],
  meta: {
    total: number,               # Total papers returned
    query: string,
    oa_credits_used: number,
  }
}
```

---

## Backend Structure

### Directory Layout

```
backend/
├── main.py              # FastAPI app initialization
├── config.py            # Settings (env vars)
├── database.py          # asyncpg connection pool
├── database/
│   └── 001_initial_schema.sql
├── integrations/
│   ├── semantic_scholar.py
│   ├── openalex.py
│   └── data_fusion.py
├── graph/
│   ├── embedding_reducer.py    # UMAP
│   ├── clusterer.py             # HDBSCAN
│   ├── similarity.py             # Cosine similarity edges
│   └── network_metrics.py      # v3.4.0: SNA metrics via networkx
├── routers/
│   ├── search.py        # POST /api/search
│   ├── papers.py        # GET /api/papers/{id}, citations, references
│   ├── graphs.py        # CRUD for saved user graphs
│   └── academic_report.py  # v3.4.0: Academic report + network overview
├── auth/
│   └── supabase.py      # Supabase auth helpers
├── middleware/
├── requirements.txt
├── Dockerfile
└── render.yaml
```

### Key Files

**main.py** - FastAPI app with:
- CORS middleware
- Lifespan context manager (connect pool, startup caches)
- Routers: search, papers, graphs, auth
- Error handlers
- Health check endpoint

**config.py** - Settings with validation:
- Database URL, credentials
- API keys (OpenAlex, Semantic Scholar)
- Redis URL
- Frontend URL for CORS
- Pagination, cache settings

**database.py** - Connection management:
- asyncpg pool initialization
- Migration runner
- Helper functions for queries

**integrations/semantic_scholar.py**:
- `search(query)` → list of papers with SPECTER2 embeddings
- `batch_embeddings(s2_ids)` → get embeddings for papers
- `get_citations(s2_id)` → citation metadata + intents
- `get_paper_details(s2_id)` → abstract, TLDR, venue

**integrations/openalex.py**:
- `search_with_credits(query)` → papers with fields, topics, OA status
- `get_topics(oa_id)` → OpenAlex Topics
- `reconstruct_abstract(title, authors)` → fallback abstract search

**integrations/data_fusion.py**:
- `fuse_results(oa_results, s2_enrichment)` → deduplicated, enriched papers
- DOI-based deduplication
- Abstract fallback chain: S2 → OA → reconstruction

**graph/embedding_reducer.py**:
- `reduce_embeddings(papers, embeddings)` → 3D UMAP coordinates
- n_components=3, min_dist=0.1, metric='cosine'

**graph/clusterer.py**:
- `cluster_papers(papers, xyz_coords)` → cluster IDs + labels
- HDBSCAN with OA Topics labeling
- Convex hull generation for visualization

**graph/similarity.py**:
- `compute_similarity_edges(embeddings, threshold=0.7)` → Edge[]
- Cosine similarity via sklearn or torch

**routers/search.py** - `POST /api/search`:
- Input: `{query: string, limit: 100, year_range?: [int, int]}`
- Flow: OA search → S2 enrichment → fuse → embed → reduce → cluster → similarity edges
- Output: GraphData
- Caching: Redis with 24-hour TTL

**routers/papers.py**:
- `GET /api/papers/{id}` → Paper details
- `GET /api/papers/{id}/citations` → cited_by papers
- `GET /api/papers/{id}/references` → references (cited papers)

**routers/graphs.py**:
- `POST /api/graphs` → save user graph (authenticated)
- `GET /api/graphs` → list user's saved graphs
- `GET /api/graphs/{id}` → load specific graph
- `DELETE /api/graphs/{id}` → delete graph

**graph/network_metrics.py** (v3.4.0):
- `NetworkMetricsComputer.compute_all(papers, edges, clusters)` → full SNA metrics
- `NetworkMetricsComputer.compute_network_overview(papers, edges, clusters)` → lightweight stats

**services/academic_report_service.py** (v3.4.0):
- `generate_academic_report(network_metrics, papers, clusters, gaps, params)` → APA 7th report
- Template-based (no LLM calls), feasibility gating

**routers/academic_report.py** (v3.4.0):
- `POST /api/academic-report` → full APA report (60s timeout, 24h cache)
- `POST /api/network-overview` → lightweight network stats

---

## Frontend Structure

### Directory Layout

```
frontend/
├── app/
│   ├── layout.tsx       # Root layout + AuthProvider
│   ├── page.tsx         # Landing/search page
│   ├── explore/
│   │   └── page.tsx     # Exploration page (search + graph + panels)
│   └── api/
│       └── auth/        # Optional: Supabase auth routes
├── components/
│   ├── graph/
│   │   ├── ScholarGraph3D.tsx      # 3D graph visualization
│   │   ├── PaperDetailPanel.tsx    # Right panel: paper info
│   │   ├── ClusterPanel.tsx        # Left panel: clusters
│   │   ├── SearchBar.tsx           # Search input + filters
│   │   └── GraphControls.tsx       # Toggle edges, clusters, physics, reset
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── SignupForm.tsx
│   └── dashboard/
│       └── SavedGraphs.tsx         # List + load/delete
├── lib/
│   ├── auth-context.tsx    # Auth state management
│   ├── supabase.ts         # Supabase client
│   ├── api.ts              # Backend API client
│   └── utils.ts            # Helper functions
├── hooks/
│   └── useGraphStore.ts    # Zustand store for graph state
├── types/
│   └── index.ts            # TypeScript types
├── public/
├── styles/
│   └── globals.css         # Tailwind + custom CSS
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── Dockerfile / vercel.json
```

### State Management (Zustand Store)

```typescript
interface GraphStore {
  graphData: GraphData | null,
  selectedNode: string | null,
  selectedCluster: number | null,
  multiSelected: Set<string>,
  showCitationEdges: boolean,
  showSimilarityEdges: boolean,
  showClusters: boolean,
  physicsEnabled: boolean,
  cameraPosition: {x, y, z},

  setGraphData,
  selectNode,
  selectCluster,
  toggleMultiSelect,
  toggleEdgeVisibility,
  resetCamera,
  // etc.
}
```

### Key Components

**ScholarGraph3D.tsx** (3D Visualization):
- Props: graphData, onNodeClick, onNodeDoubleClick, selectedNode, showClusters, etc.
- Renders: nodes (sized by citations, colored by field), edges, cluster hulls
- Interactions:
  - Click → select node, show detail panel
  - Double-click → fetch and expand citation network
  - Shift+click → multi-select
  - Drag to rotate, scroll to zoom
- Uses Three.js for custom rendering (convex hulls, etc.)

**PaperDetailPanel.tsx** (Right Side):
- Slides in on node selection
- Displays: title, abstract/TLDR, authors, venue, year, citation count, fields, topics
- Actions: Open paper URL, expand citations, add to saved graph

**ClusterPanel.tsx** (Left Side):
- Lists clusters with labels and paper counts
- Click to highlight cluster in graph
- Shows cluster topics

**SearchBar.tsx**:
- Input field for keyword search
- Filters: year range, field filter
- Loading state while fetching
- Error handling

**GraphControls.tsx**:
- Toggles: Citation edges, Similarity edges, Cluster hulls, Physics simulation
- Reset camera button
- Settings panel

### Visual Design

**Color Scheme**:
- Background: Deep navy (#0F1419) or charcoal (#1A1F2E)
- Node colors by OpenAlex field:
  - Physical Sciences: #4A90D9 (blue)
  - Life Sciences: #2ECC71 (green)
  - Social Sciences: #E67E22 (orange)
  - Health Sciences: #E74C3C (red)
  - Engineering: #9B59B6 (purple)
  - Arts & Humanities: #F39C12 (gold)
  - Other: #95A5A6 (gray)
- Edge colors:
  - Citations: Green (#2ECC71) for supported, Red (#E74C3C) for contradicts
  - Similarity: Cyan (#17A2B8) dashed lines

**Layout**:
- Full-height 3D graph in center
- Left panel (search + clusters): 300px, fixed or collapsible
- Right panel (paper detail): 350px, slides in, collapsible
- Top bar: Logo, search toggle, auth, saved graphs

---

## API Contracts

### POST /api/search

**Request**:
```json
{
  "query": "machine learning clustering",
  "limit": 100,
  "year_range": [2020, 2024],
  "fields": ["Computer Science"]
}
```

**Response**:
```json
{
  "nodes": [...],
  "edges": [...],
  "clusters": [...],
  "meta": {
    "total": 1234,
    "query": "machine learning clustering",
    "oa_credits_used": 50
  }
}
```

### GET /api/papers/{id}

**Response**:
```json
{
  "id": "...",
  "title": "...",
  "authors": [...],
  "abstract": "...",
  "tldr": "...",
  "year": 2023,
  "citation_count": 42,
  "fields": [...],
  "topics": [...],
  "oa_url": "..."
}
```

### GET /api/papers/{id}/citations

**Response**:
```json
{
  "cited_by": [
    {
      "id": "...",
      "title": "...",
      "year": 2024,
      "intent": "supports"
    }
  ]
}
```

### POST /api/graphs (Authenticated)

**Request**:
```json
{
  "name": "My HDBSCAN Research",
  "data": { /* GraphData */ }
}
```

**Response**:
```json
{
  "id": "uuid",
  "name": "My HDBSCAN Research",
  "created_at": "2026-02-19T...",
  "updated_at": "..."
}
```

### POST /api/academic-report (v3.4.0)

Generate APA 7th formatted academic analysis report.

**Input:**
- `graph_context.papers`: Paper[] with id, title, year, citation_count, cluster_id, cluster_label, authors, fields
- `graph_context.edges`: GraphEdge[] with source, target, type, weight
- `graph_context.clusters`: Cluster[] with id, label, paper_count
- `gap_ids`: optional string[] to include gap analysis
- `analysis_parameters`: optional overrides (n_neighbors, min_cluster_size, etc.)

**Output:**
- `methods_section`: APA 7th Methods text (5 subsections)
- `tables`: { table_1..table_5 } with title, headers, rows, note
- `figure_captions`: { figure_1..figure_3 }
- `reference_list`: methodology_refs + analysis_refs
- `network_metrics`: full SNA metrics object
- `feasibility`: 'full' | 'partial' | 'insufficient'
- `warnings`: string[]

### POST /api/network-overview (v3.4.0)

Lightweight network statistics.

**Input:** Same graph_context structure.
**Output:** { node_count, edge_count, density, cluster_count, modularity }

---

## Database Schema

### papers table
```sql
CREATE TABLE papers (
  id TEXT PRIMARY KEY,
  s2_id TEXT UNIQUE,
  oa_id TEXT UNIQUE,
  doi TEXT,
  title TEXT NOT NULL,
  authors TEXT[],
  year INTEGER,
  venue TEXT,
  citation_count INTEGER DEFAULT 0,
  abstract TEXT,
  tldr TEXT,
  fields TEXT[],
  topics JSONB,
  is_open_access BOOLEAN DEFAULT FALSE,
  oa_url TEXT,
  embedding VECTOR(768),  -- SPECTER2 from S2
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### citations table
```sql
CREATE TABLE citations (
  id SERIAL PRIMARY KEY,
  source_id TEXT REFERENCES papers(id),
  target_id TEXT REFERENCES papers(id),
  intent TEXT,  -- supports, contradicts, compares, methodology
  created_at TIMESTAMP DEFAULT NOW()
);
```

### user_graphs table
```sql
CREATE TABLE user_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB,  -- Serialized GraphData
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Development Guidelines

### Naming Conventions
- Python: snake_case for functions/variables, PascalCase for classes
- TypeScript: camelCase for functions/variables, PascalCase for components/types
- API endpoints: lowercase with hyphens (e.g., `/api/papers`)

### Error Handling
- Backend: Return 400/404/500 with `{error: string}` JSON
- Frontend: Show user-friendly toasts for API errors, log details
- Graceful degradation: If S2 unavailable, use OA only; if Redis down, skip cache

### Testing
- Backend: pytest with fixtures for DB, mocking external APIs
- Frontend: vitest for unit tests, Playwright for E2E
- CI/CD: GitHub Actions for lint, test, build on PR

### Performance
- Backend: Cache search results (24h), batch API calls, limit page sizes
- Frontend: Code splitting, image optimization, lazy load panels
- Database: Index frequently queried columns (title, year, citation_count)

---

## Integration Points

1. **OpenAlex API**: Search, topics, metadata retrieval
2. **Semantic Scholar API**: SPECTER2 embeddings, citations, TLDRs
3. **Supabase**: Authentication, PostgreSQL, pgvector
4. **Redis**: Cache layer for search results
5. **Three.js / react-force-graph-3d**: 3D visualization
6. **D3.js**: Convex hull generation, optional clustering viz

---

## Next Steps for Agents

1. **backend-dev**: Complete main.py, routers, integrations, requirements.txt, Dockerfile
2. **frontend-dev**: Complete graph components, auth, dashboard, styling
3. **Testing**: Unit tests for backend, integration tests for API, E2E tests for UI
4. **Deployment**: Prepare Vercel config (frontend), Render config (backend)

---

Last updated: 2026-02-19
