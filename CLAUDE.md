# ScholarGraph3D - Claude Code Instructions

> 3D academic paper graph visualization platform
> GitHub: github.com/HosungYou/ScholarGraph3D

## Project Overview

ScholarGraph3D visualizes academic papers as an interactive 3D knowledge graph.
Users search by keyword → papers fetched from OpenAlex + Semantic Scholar →
SPECTER2 embeddings reduced via UMAP to 3D → HDBSCAN clusters → react-force-graph-3d renders.

Related project: ScholaRAG_Graph at /Users/hosung/ScholaRAG_Graph (concept-level knowledge graph).

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js 14 + TypeScript + Tailwind | App Router, dark theme |
| 3D Rendering | react-force-graph-3d + Three.js 0.152.2 | Pin Three.js version (ESM compat) |
| Backend | FastAPI + Python 3.11 | Async with asyncpg |
| Database | PostgreSQL + pgvector (Supabase) | 768-dim SPECTER2 vectors |
| Cache | Redis (Upstash) | 24h search cache |
| Auth | Supabase Auth | JWT, Google/GitHub OAuth |

## Build & Run

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in keys
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local  # Fill in keys
npm run dev  # http://localhost:3000
```

### Tests
```bash
# Backend
cd backend && pytest -v --cov=. --cov-report=term-missing

# Frontend
cd frontend && npm test
```

## Architecture

### Backend Directory
```
backend/
├── main.py              # FastAPI app with lifespan
├── config.py            # Pydantic Settings (env vars)
├── database.py          # asyncpg pool (global db singleton)
├── auth/                # Supabase JWT auth
├── integrations/
│   ├── semantic_scholar.py  # S2 API client (1 RPS, rate limiting)
│   ├── openalex.py          # OA API client (credit tracking)
│   └── data_fusion.py       # OA-first + S2 enrichment + DOI dedup
├── graph/
│   ├── embedding_reducer.py # UMAP 3D (768→3 dims)
│   ├── clusterer.py         # HDBSCAN + OA Topics labels
│   └── similarity.py        # Cosine similarity edges (>0.7)
├── routers/
│   ├── search.py        # POST /api/search → full graph pipeline
│   ├── papers.py        # Paper detail, citations, references, expand
│   └── graphs.py        # CRUD saved graphs (auth required)
└── database/
    └── 001_initial_schema.sql  # papers, citations, user_graphs, search_cache
```

### Frontend Directory
```
frontend/
├── app/
│   ├── page.tsx          # Landing page with search
│   ├── explore/page.tsx  # Main 3-panel exploration
│   ├── auth/             # Login/signup
│   └── dashboard/        # Saved graphs
├── components/graph/
│   ├── ScholarGraph3D.tsx    # Main 3D component (706 lines)
│   ├── PaperDetailPanel.tsx  # Right panel paper details
│   ├── ClusterPanel.tsx      # Left panel cluster list
│   ├── SearchBar.tsx         # Search input with filters
│   └── GraphControls.tsx     # Floating toggle controls
├── hooks/useGraphStore.ts    # Zustand state management
├── lib/
│   ├── api.ts               # Backend API client
│   ├── auth-context.tsx      # Supabase auth context
│   └── supabase.ts           # Supabase client init
└── types/index.ts            # Paper, GraphEdge, Cluster, GraphData
```

## Key Conventions

### API Response Format
Search endpoint returns: `{ nodes: Paper[], edges: GraphEdge[], clusters: Cluster[], meta: {...} }`

### Node Visual Mapping
- Size: `Math.max(3, Math.log(citation_count + 1) * 3)`
- Color: OA field → Physical Sciences=#4A90D9, Life Sciences=#2ECC71, Social Sciences=#E67E22, etc.
- Opacity: `0.3 + 0.7 * ((year - minYear) / (maxYear - minYear))`
- Label: First author last name + year (e.g., "Vaswani 2017")

### Data Fusion Strategy
1. OpenAlex keyword search (primary, 10 credits/page)
2. Semantic Scholar search (supplementary)
3. DOI-based dedup (OA metadata preferred + S2 TLDR/embeddings)
4. Abstract fallback: OA abstract → S2 TLDR → "No abstract"

### Important Constraints
- Three.js MUST stay at 0.152.2 (ESM compatibility)
- S2 API: 1 RPS authenticated, non-commercial license
- OA API: 100K credits/day with API key, semantic search = 1000 credits
- pgvector: 768-dim vectors, ivfflat index with 100 lists
- HDBSCAN min_cluster_size=5, UMAP n_neighbors=15

## Documentation Map

| Document | Purpose | Location |
|----------|---------|----------|
| PRD | Product requirements, user stories, acceptance criteria | docs/PRD.md |
| SPEC | Technical specification, API contracts, DB schema | docs/SPEC.md |
| ARCHITECTURE | System design, data pipeline, deployment | docs/ARCHITECTURE.md |
| SDD/TDD Plan | Test strategy, coverage requirements | docs/SDD_TDD_PLAN.md |
| CLAUDE.md | This file — Claude Code project context | ./CLAUDE.md |

## Phase Status

- Phase 1 (MVP): v0.1.0 scaffolded — needs wiring, testing, deployment
- Phase 2 (AI Premium): Planned — LLM provider, GraphRAG, trends, gaps
- Phase 3 (Real-time): Planned — watch queries, citation intent, lit review
