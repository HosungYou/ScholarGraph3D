# ScholarGraph3D v3.5.1 - Claude Code Instructions

> 3D academic paper graph visualization — Seed Paper Exploration Platform
> GitHub: github.com/HosungYou/ScholarGraph3D

## Project Overview

ScholarGraph3D v2.0 is a focused Seed Paper exploration platform. Users search via natural language → select a seed paper → explore its citation network in 3D. The system fetches references and citations from Semantic Scholar, computes SPECTER2 embeddings, reduces via UMAP to 3D, clusters with Leiden hybrid algorithm (citation + bibliographic coupling + similarity graph, HDBSCAN fallback), detects research gaps (6-dim scoring with structural holes), and renders everything as an interactive cosmic universe.

v2.0 is a major simplification from v1.x — keyword search, multi-provider LLM, watch queries, lit review, personalization, trends, and GraphRAG chat were all removed to focus on the seed paper exploration workflow.

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js 14 + TypeScript + Tailwind | App Router, Cosmic Universe theme |
| 3D Rendering | react-force-graph-3d + Three.js 0.152.2 | Pin Three.js version (ESM compat) |
| Backend | FastAPI + Python 3.11 | Async with asyncpg |
| Database | PostgreSQL + pgvector (Supabase) | 768-dim SPECTER2 vectors |
| Cache | Redis (Upstash) | seed-explore 24h, gap-report 24h, refs/cites 7d, embeddings 30d, graceful no-op |
| Auth | Supabase Auth | JWT, Google/GitHub OAuth |
| LLM | Groq (llama-3.3-70b) | Seed chat + research question generation |

## Build & Run

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in: DATABASE_URL, S2_API_KEY, GROQ_API_KEY
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local  # Fill in: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SUPABASE_URL/KEY
npm run dev  # http://localhost:3000
```

### Tests
```bash
# Backend
cd backend && pytest -v --cov=. --cov-report=term-missing

# Frontend
cd frontend && npx jest
```

## Architecture

### Backend Directory
```
backend/
├── main.py              # FastAPI app with lifespan (registers 6 routers)
├── config.py            # Pydantic Settings (env vars)
├── database.py          # asyncpg pool (global db singleton)
├── cache.py             # Redis cache helpers (Upstash) — graceful no-op if unavailable, gap report 24h TTL
├── auth/                # Supabase JWT auth
├── middleware/
│   ├── analytics.py         # Request analytics middleware
│   └── rate_limiter.py      # Rate limiting middleware
├── integrations/
│   ├── semantic_scholar.py  # S2 API client (semaphore rate limiter, auto-detect RPS)
│   └── crossref.py          # CrossRef DOI lookup
├── graph/
│   ├── embedding_reducer.py   # PCA 768→100D + UMAP 100→50D→3D (v2.0.2)
│   ├── clusterer.py           # Leiden hybrid clustering (citation + bib coupling + similarity) + HDBSCAN fallback + TF-IDF labeling
│   ├── similarity.py          # Cosine similarity edges (>0.7)
│   ├── bridge_detector.py     # Cross-cluster bridge node detection (top-5%)
│   ├── incremental_layout.py  # k-NN position interpolation for stable expand
│   ├── gap_detector.py        # Inter-cluster gap detection + 6-dim scoring (structural holes) + bridge papers + research questions
│   └── network_metrics.py     # SNA metrics (networkx) — centrality, structural holes, modularity, silhouette + lightweight node metrics
├── llm/
│   ├── base.py              # Abstract BaseLLMProvider + LLMResponse
│   └── groq_provider.py     # LLaMA 3.3-70b (rate limiter + retry)
├── services/
│   ├── citation_intent.py   # S2 basic + enhanced citation intents
│   ├── gap_report_service.py # Gap report assembly + Groq narrative synthesis
│   └── academic_report_service.py # v3.4.0: APA 7th report generation (template-based, no LLM)
├── routers/
│   ├── papers.py          # Paper detail, expand-stable, intents, by-doi
│   ├── graphs.py          # CRUD saved graphs (auth required, JSONB graph_data)
│   ├── seed_explore.py    # POST /api/seed-explore — seed paper graph expansion
│   ├── paper_search.py    # POST /api/paper-search — NL query → paper selection
│   ├── seed_chat.py       # POST /api/seed-chat — Groq-powered graph chat + action markers
│   ├── gap_report.py      # POST /api/gaps/report — Gap analysis report generation
│   ├── academic_report.py   # v3.4.0: POST /api/academic-report + /api/network-overview
│   └── bookmarks.py       # CRUD paper bookmarks with tags/memos (auth required)
└── database/
    └── migrations/
        ├── 003_seed_graphs.sql          # ALTER TABLE add graph_data JSONB column
        └── 005_paper_bookmarks.sql      # paper_bookmarks table with GIN tag index
```

### Frontend Directory
```
frontend/
├── app/
│   ├── page.tsx                   # Landing page — NL search → paper selection → seed explore
│   ├── providers.tsx              # Client providers (Supabase auth, React Query)
│   ├── explore/seed/page.tsx      # Seed Explorer — 3-panel layout (tabbed sidebar + 3D + detail)
│   ├── auth/
│   │   ├── page.tsx               # Station Access — login/signup
│   │   └── callback/page.tsx      # OAuth callback handler
│   └── dashboard/
│       └── page.tsx               # Command Center — saved graphs
├── components/
│   ├── cosmic/                        # Shared cosmic theme components
│   │   ├── StarfieldBackground.tsx    # Three.js WebGL starfield (3000 stars + Milky Way, warp)
│   │   ├── CosmicStarfield.tsx        # CSS-only starfield for auth/dashboard (lightweight)
│   │   ├── HudPanel.tsx               # Reusable HUD panel wrapper (scanline, brackets)
│   │   └── RadarLoader.tsx            # Concentric ring radar loading indicator
│   ├── graph/
│   │   ├── ScholarGraph3D.tsx         # Main 3D component (star nodes, nebula clusters, light streams)
│   │   ├── cosmic/                    # Cosmic rendering system
│   │   │   ├── cosmicConstants.ts     # Star color map (26 fields), GLSL shaders
│   │   │   ├── cosmicTextures.ts      # Canvas-generated glow/corona/flare textures
│   │   │   ├── CosmicAnimationManager.ts # Singleton rAF loop for shader uniforms
│   │   │   ├── starNodeRenderer.ts    # Star node factory (twinkle, supernova, binary, flare)
│   │   │   └── nebulaClusterRenderer.ts # Gaussian particle cloud per cluster
│   │   ├── PaperDetailPanel.tsx       # Object Scanner — paper details + citation path finder + export
│   │   ├── ClusterPanel.tsx           # Sector Scanner — density, visibility, paper list, stats
│   │   ├── GraphLegend.tsx            # Star Chart — field colors, size/edge/cluster visual guide
│   │   ├── GraphControls.tsx          # Ship Controls — floating toggles
│   │   ├── GapSpotterPanel.tsx        # Gap Spotter — research gaps, 6-dim scoring (structural holes), bridge papers, frontier papers
│   │   ├── GapReportView.tsx          # Gap Report — full report rendering with export (Markdown/BibTeX)
│   │   ├── SeedChatPanel.tsx          # Seed Chat — Groq-powered conversational graph exploration
│   │   └── AcademicAnalysisPanel.tsx  # v3.4.0: Academic Analysis — Network Overview, APA report, centrality chart, export
│   ├── auth/
│   │   ├── LoginForm.tsx              # Login form
│   │   └── SignupForm.tsx             # Signup form
│   └── dashboard/
│       └── SavedGraphs.tsx            # Saved graphs list/management
├── hooks/
│   └── useGraphStore.ts       # Zustand state (graph data, UI state, gaps, gap reports, frontier, paths, academic report)
├── lib/
│   ├── api.ts                 # Backend API client (seed-explore, paper-search, seed-chat, gap-report, academic-report, graphs)
│   ├── auth-context.tsx       # Supabase auth context
│   ├── supabase.ts            # Supabase client init
│   ├── utils.ts               # Shared utilities (findCitationPath BFS)
│   └── export.ts              # BibTeX/RIS + Gap Report Markdown/BibTeX + Academic Report export utilities
├── types/
│   └── index.ts               # All types (Paper, GraphData, StructuralGap, CitationIntent, NetworkMetrics, AcademicReport, NetworkOverview)
├── __tests__/                 # Jest test suite
│   └── setup.tsx              # Testing library setup
└── jest.config.js             # Jest configuration
```

## Core User Flow

1. **Landing** (`/`): User enters NL query → `POST /api/paper-search` → selects seed paper
2. **Explore** (`/explore/seed?paper_id=...`): Seed paper expanded via `POST /api/seed-explore` → 3D graph rendered
3. **Interact**: Click nodes to expand (expand-stable), view details (push layout), find citation paths with visual chain, drill-down via in-graph connections, export BibTeX/RIS
4. **Analyze**: Left panel tabs — Clusters | Gaps | Chat | Academic — for exploring structure, asking questions, and generating APA 7th reports
5. **Save**: Save graph to database → reload from Dashboard (`/dashboard`)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/paper-search` | NL query → paper selection list |
| POST | `/api/seed-explore` | Seed paper → full graph (nodes, edges, clusters, gaps, frontier) |
| POST | `/api/papers/{id}/expand-stable` | Expand node with incremental layout |
| GET | `/api/papers/{id}/intents` | Citation intent classification |
| GET | `/api/papers/by-doi?doi=...` | DOI lookup |
| POST | `/api/seed-chat` | Groq chat about graph context + action markers |
| POST | `/api/gaps/report` | Generate gap analysis report (Groq narrative + evidence) |
| POST | `/api/academic-report` | Generate APA 7th academic analysis report (60s timeout, 24h cache) |
| POST | `/api/network-overview` | Lightweight network stats (density, modularity, clusters) |
| POST | `/api/bookmarks` | Create/upsert paper bookmark (auth) |
| GET | `/api/bookmarks` | List bookmarks, optional `?tag=` filter (auth) |
| GET | `/api/bookmarks/paper/{paper_id}` | Get bookmark for specific paper (auth) |
| PUT | `/api/bookmarks/{id}` | Update bookmark tags/memo (auth) |
| DELETE | `/api/bookmarks/{id}` | Delete bookmark (auth) |
| GET | `/api/graphs` | List saved graphs (auth) |
| POST | `/api/graphs` | Save graph with JSONB data (auth) |
| GET | `/api/graphs/{id}` | Load saved graph (auth) |
| DELETE | `/api/graphs/{id}` | Delete saved graph (auth) |

## Key Conventions

### API Response Format
Seed explore returns: `{ nodes: Paper[], edges: GraphEdge[], clusters: Cluster[], gaps?: StructuralGap[], frontier_ids?: string[], meta: {...} }`

### Cosmic Universe Theme
- Background: Deep space #050510, accent cyan #00E5FF, nebula purple #6c5ce7, star lavender #a29bfe
- Glass: `rgba(5,5,16,0.85)` + blur(16px) + cyan border; HUD panels with scanline overlays
- Animations: warp-speed, cosmic-pulse, hud-flicker, radar-sweep, border-glow, drift
- Landing: Three.js starfield (3000 stars + Milky Way) + warp transition on search

### Node Visual Mapping (Cosmic Star Nodes)
- Size: `Math.min(30, Math.max(4, Math.sqrt(citation_count + 1) * 1.5))` — sqrt scale (default); switchable to PageRank or Betweenness via `nodeSizeMode`
- Color: STAR_COLOR_MAP — 26 fields with max hue separation. Top 10: CS=Blue, Med=Red, Bio=Green, Physics=Magenta, Econ=Gold, Eng=Purple, Business=Orange, Chem=Pink, Psych=Seafoam, EnvSci=Lime
- Twinkle: GLSL shader — 1.5Hz (old) → 6.0Hz (new papers)
- Star layers: glow sprite (additive), lens flare (selected), corona (OA), supernova (top 10%), binary (bridge)
- Frontier nodes: red ring (#FF4444) for papers with frontier_score > 0.7
- Selected node: gold pulsing ring (sin-wave opacity), enlarged label (fontSize 20) with dark background box
- Panel selection triggers camera auto-focus (1s animation, z+200 offset)

### Edge Visual Mapping (Light Streams)
- Citation: 4 cyan particles flowing, intent-colored when intents loaded
- Similarity: Dashed lines (#4a90d9), no particles
- Citation Path: Gold (#FFD700) highlighted edges
- Intent colors: Background=#95A5A6, Methodology=#9B59B6, Result=#4A90D9 (Enhanced intents removed in v3.2.0)
- Gap hover: cluster pair at full opacity, others at 0.05; potential edges shown as dashed gold
- **Edge Visualization Modes** (v3.1.0, store: `edgeVisMode`):
  - `similarity` (default): Intent-based coloring as above
  - `temporal`: Gold→gray lerp based on |yearA - yearB| / 10
  - `crossCluster`: Inter-cluster = gold (#D4AF37), intra-cluster = dim (#222222)
- **Always-on overlays**: Bidirectional citations = gold (#FFD700), Shared authors = green (#2ECC71)
- `is_influential` edges rendered 1.5x wider with glow

### Cluster Visual Mapping (Nebula Clouds)
- `createNebulaCluster()` returns `THREE.Group` (cloud + glow ring) — **not** `THREE.Points`
- Gaussian-distributed particle cloud (Box-Muller), particle count: `min(120, max(30, nodeCount * 8))`
- AdditiveBlending, shimmer shader, distance-based alpha falloff
- **Centroid:** PageRank-weighted mean from backend (`cluster.centroid`); falls back to arithmetic mean
- **Glow ring:** `RingGeometry(spread×1.29, spread×1.4, 64)` — billboard, pulse shader (`0.6+0.4×sin(uTime×1.2)`), AdditiveBlending
- Cleanup: traverse `THREE.Group` children, deregister both cloud and ring `ShaderMaterial` from `CosmicAnimationManager`

### Three.js Disposal Safety (CRITICAL)
- **Global safety patch** lives in `lib/three-safety.ts`, imported by `providers.tsx` at app root
- NEVER add local monkey-patches in individual components — all Three.js safety goes through `lib/three-safety.ts`
- Every Three.js component cleanup MUST follow this order:
  1. Set a `disposedRef = true` flag to guard async callbacks (rAF, Promises)
  2. Cancel ALL `requestAnimationFrame` IDs (main loop + any sub-animations like warp)
  3. Dispose geometries and materials BEFORE `renderer.dispose()`
  4. Call `scene.clear()` to release child references
  5. Call `renderer.dispose()` last
  6. Null all refs to prevent stale access
- Three.js components with async animations (rAF inside Promises, setTimeout callbacks) MUST check `disposedRef` at the start of every frame
- SPA navigation unmounts components mid-animation — never assume cleanup runs after animations complete

### Deployment Checklist (run before every push to main)

These checks prevent the recurring deployment errors seen in v3.5.0:

| # | Check | Command / How |
|---|-------|---------------|
| 1 | **requirements.txt complete** | `pip install -r requirements.txt` in a clean venv — zero ImportErrors |
| 2 | **Version string matches release** | `grep 'version=' backend/main.py` → must equal the tag being pushed |
| 3 | **TypeScript clean** | `cd frontend && npx tsc --noEmit` → zero errors |
| 4 | **Backend tests pass** | `cd backend && pytest -v` → all green |
| 5 | **S2 API fields** | Any new S2 fetch must use correct field sets: `PAPER_FIELDS` (has tldr) for `/paper/{id}`, `PAPER_FIELDS_SEARCH` (no tldr) for `/paper/search` |
| 6 | **New env vars in render.yaml** | If a new env var was added → add it (with `sync: false`) to `render.yaml` before push |
| 7 | **Docker build local** | `docker build -t test ./backend` → must succeed (catches missing apt packages / pip deps) |

Known recurring issues already fixed:
- **UMAP cold start 504** → `_warm_up_umap()` in `main.py` lifespan (fixed v3.5.0)
- **`openai` missing in requirements.txt** → already added (fixed v3.5.0)
- **`tldr` field in S2 search** → `PAPER_FIELDS_SEARCH` without tldr (fixed v3.5.0)
- **Version string "2.0.2"** → now `"3.5.1"`, update with every release (fixed v3.5.1)

### Important Constraints
- Three.js MUST stay at 0.152.2 (ESM compatibility)
- S2 API: 1 RPS authenticated, 0.3 RPS unauthenticated (auto-detected), non-commercial license
- pgvector: 768-dim SPECTER2 vectors, ivfflat index with 100 lists
- Clustering: Leiden hybrid (default) on 3-layer graph (citation + bibliographic coupling + similarity) via `CLUSTERING_MODE` env var ("hybrid"/"leiden"/"hdbscan")
- Leiden fallback: HDBSCAN when graph too sparse (total_edges < N*0.5) or `CLUSTERING_MODE=hdbscan`
- Cluster labels: TF-IDF bigram/unigram from abstracts (not fieldsOfStudy frequency)
- SNA metrics: PageRank (alpha=0.85) + Betweenness Centrality via NetworkX
- UMAP pipeline: PCA 768→100D (instant) + UMAP 100→50D (shared) + 50D→3D for viz; 50D for HDBSCAN fallback
- PCA pre-reduction triggers when input dim > 200 (_PCA_THRESHOLD); cuts UMAP from ~51s to ~3s on 0.5 vCPU
- Z-axis = publication year (semantic topology on X/Y, time depth on Z)
- Backend: 1 uvicorn worker (async handles concurrency; CPU ops via asyncio.to_thread)
- DB pool: min=1, max=3 connections
- expand endpoints: refs/cites fetched independently — partial S2 failures return available data (not 404)
- get_references/get_citations: (data.get("data") or []) — S2 may return {"data": null} for unindexed papers
- Groq rate limiter: 28 RPM for LLaMA 3.3-70b
- Gap score: structural(0.25) + relatedness(0.25) + temporal(0.15) + intent(0.10) + directional(0.10) + structural_holes(0.15) = composite
- Academic report: template-based (no LLM), <1s for 50-200 nodes, minimum 10 papers + 2 clusters

## Zustand Store (useGraphStore)

Key state slices:
- `graphData`: GraphData (nodes, edges, clusters)
- `selectedPaperId`, `hoveredPaperId`: paper selection
- `expandedFromMap`: child → parent tracking for expand effects
- `gaps`: StructuralGap[] — detected research gaps
- `frontierIds`: string[] — frontier paper IDs
- `pathStart`, `pathEnd`, `activePath`: citation path finding
- `highlightedPaperIds`: Set<string> — hover highlights from gap panel
- `activeTab`: now includes 'academic' — 'clusters' | 'gaps' | 'chat' | 'academic' (v3.4.0)
- `edgeVisMode`: 'similarity' | 'temporal' | 'crossCluster' — edge visualization mode (v3.1.0)
- `panelSelectionId`: string | null — triggers camera focus on panel paper click (v3.2.0)
- `highlightedClusterPair`: [number, number] | null — dims all except gap-hovered clusters (v3.2.0)
- `hoveredGapEdges`: potential edges array — renders dashed gold links on gap hover (v3.2.0)
- `activeGapReport`: GapReport | null — currently displayed gap analysis report (v3.3.0)
- `gapReportLoading`: boolean — gap report generation in progress (v3.3.0)
- `academicReport`: AcademicReport | null — generated academic analysis report (v3.4.0)
- `academicReportLoading`: boolean — report generation in progress (v3.4.0)
- `networkOverview`: NetworkOverview | null — lightweight network stats (v3.4.0)
- `nodeSizeMode`: 'citations' | 'pagerank' | 'betweenness' — node size encoding mode (v3.5.0)

## Documentation Map

| Document | Location |
|----------|----------|
| PRD | docs/PRD.md |
| SPEC | docs/SPEC.md |
| ARCHITECTURE | docs/ARCHITECTURE.md |
| SDD/TDD Plan | docs/SDD_TDD_PLAN.md |
| PHILOSOPHY | docs/PHILOSOPHY.md |
| TECH_PROOF | docs/TECH_PROOF.md |
| DESIGN_THEME | docs/DESIGN_THEME.md |
| RELEASE_v3.4.0 | docs/RELEASE_v3.4.0.md |
| RELEASE_v3.5.1 | docs/RELEASE_v3.5.1.md |
| RELEASE_v3.5.0 | docs/RELEASE_v3.5.0.md |
| RELEASE_v3.4.0 | docs/RELEASE_v3.4.0.md |
| RELEASE_v3.3.1 | docs/RELEASE_v3.3.1.md |
| RELEASE_v3.3.0 | docs/RELEASE_v3.3.0.md |
| RELEASE_v3.2.0 | docs/RELEASE_v3.2.0.md |
| RELEASE_v3.1.0 | docs/RELEASE_v3.1.0.md |
| RELEASE_v3.0.2 | docs/RELEASE_v3.0.2.md |
| RELEASE_v3.0.1 | docs/RELEASE_v3.0.1.md |
| RELEASE_v3.0.0 | docs/RELEASE_v3.0.0.md |
| RELEASE_v2.0.2 | docs/RELEASE_v2.0.2.md |
| Earlier releases | docs/RELEASE_v*.md |

## v2.0 Changes from v1.x

### Removed
- Keyword search (routers/search.py, natural_search.py, search_stream.py)
- Multi-provider LLM layer (openai, claude, gemini providers, circuit breaker, cached provider)
- GraphRAG chat (graph_rag.py, chat.py, ChatPanel.tsx)
- Watch queries (watch_service.py, email_service.py, watch.py, WatchQueryPanel.tsx)
- Lit review (lit_review.py service + router, LitReviewPanel.tsx)
- Personalization (personalization.py router, RecommendationCard.tsx)
- Trend analysis (trend_analyzer.py, TrendPanel.tsx)
- Scaffolding (ScaffoldingModal.tsx)
- Settings modal (LLMSettingsModal.tsx)
- OpenAlex integration (openalex.py, data_fusion.py)
- Explore keyword page (app/explore/page.tsx)
- SearchBar.tsx, CitationContextModal.tsx, TimelineView.tsx

### Added
- Paper search (NL → paper selection): paper_search.py + landing page flow
- Seed chat (Groq): seed_chat.py + SeedChatPanel.tsx
- Gap Spotter: gap_detector.py + GapSpotterPanel.tsx (research gaps, bridge papers, research questions)
- Frontier detection: papers with many unexplored connections
- Citation Path Finder: BFS path in PaperDetailPanel.tsx
- BibTeX/RIS export: lib/export.ts
- Graph save/load with JSONB: 003_seed_graphs.sql
- Tabbed left panel: Clusters | Gaps | Chat
- Depth control: 1/2/3 hop exploration

### v3.5.1 Centrality-Driven Cluster Layout & Nebula Frame (2026-02-25)
- Backend centroid: PageRank-weighted mean `Σ(pos_i × max(pagerank_i, 0.001)) / Σ(max(pagerank_i, 0.001))` computed after SNA metrics, returned in `SeedClusterInfo.centroid`
- Frontend: nebula cloud centers on backend centroid (arithmetic mean fallback)
- Nebula glow ring: `RingGeometry` with billboard + pulse shader per cluster boundary
- `createNebulaCluster()` return type: `THREE.Points` → `THREE.Group`
- Cleanup: group-aware traversal for `CosmicAnimationManager` deregistration + geometry/material disposal
- Fix: `main.py` version string updated from hard-coded `"2.0.2"` to `"3.5.1"`

### v3.5.0 Clustering/SNA Architecture Overhaul (2026-02-25)
- Clustering: HDBSCAN (embedding-only) → Leiden hybrid (citation + bibliographic coupling + similarity 3-layer graph)
- Cluster labels: fieldsOfStudy frequency → TF-IDF abstract bigrams ("attention mechanism" instead of "Computer Science")
- SNA metrics: `network_metrics.py` — PageRank + Betweenness Centrality per node (lightweight `compute_node_lightweight`)
- Structural Holes: Burt (1992) constraint-based gap dimension (15% weight), gap score rebalanced to 6 dimensions
- Gap weights: structural 0.25, relatedness 0.25, temporal 0.15, intent 0.10, directional 0.10, structural_holes 0.15
- Node size encoding: dropdown for citations/pagerank/betweenness in Ship Controls
- Panel layout: canvas minWidth 400px, responsive auto-collapse left sidebar on narrow viewports (<1200px)
- Centroid visualization: diamond markers at cluster centroids, distance labels on gap hover
- ClusterPanel: "Top Topics" → "Key Terms"
- Environment: `CLUSTERING_MODE` env var ("hybrid"/"leiden"/"hdbscan", default "hybrid")
- New dependencies: leidenalg, python-igraph
- Tests: 8 new tests in test_clusterer_hybrid.py (Leiden, bib coupling, HDBSCAN fallback, TF-IDF, min cluster size)

### v3.4.0 SNA Academic Output — Citation Network Analysis Report (2026-02-24)
- Network Metrics Module: `network_metrics.py` — networkx DiGraph, 3-tier SNA (network/node/community level)
  - Network: density, diameter, avg path length, reciprocity, transitivity, component count, avg degree
  - Node: degree in/out, betweenness, closeness, PageRank, eigenvector centrality (sorted by betweenness)
  - Community: intra-cluster density, avg year, year range, h-index
  - Structural holes: constraint, effective_size, efficiency (Burt 1992)
  - Modularity Q (Newman-Girvan 2004), Silhouette score (Rousseeuw 1987)
- Academic Report Service: `academic_report_service.py` — APA 7th template-based (zero LLM calls)
  - Methods section (5 subsections with auto-parameter substitution)
  - 5 APA Tables (Network Stats, Communities, Centrality Top 10, Gap Analysis, Bridge Papers)
  - 3 Figure captions with actual N, year range, cluster count
  - 13 hardcoded methodology refs + dynamic analysis refs
  - Feasibility gating: insufficient / partial / full
- API: `POST /api/academic-report` (60s timeout, 24h Redis cache) + `POST /api/network-overview`
- Frontend: ACADEMIC ANALYSIS tab (4th tab), AcademicAnalysisPanel component
  - Network Overview (auto-fetched), Gold generate button, 4 sub-tabs (Methods/Tables/Figures/References)
  - APATable with tab-separated copy, CentralityBarChart (CSS-only), Canvas capture for Figures
  - Export: Full Report / Methods / Tables (copy) + .md / .bib (download)
- Types: NetworkLevelMetrics, NodeCentrality, CommunityMetrics, StructuralHolesNode, NetworkMetrics, AcademicReportTable, AcademicReport, NetworkOverview
- Store: academicReport, academicReportLoading, networkOverview state; activeTab includes 'academic'
- Cache: `academic_report:{hash}` with 24h TTL
- Tests: 14 network_metrics tests + 17 academic_report_service tests (31 total)
- Dependency: networkx>=3.2.0

### v3.3.1 Gap Report UX Overhaul: Explainability + Quality (2026-02-24)
- Semantic score inverted → "relatedness" (cosine_sim, not 1-cosine_sim): high similarity = more actionable gap
- Weight rebalance: structural 0.35, relatedness 0.25, temporal 0.15, intent 0.15, directional 0.10
- Evidence detail: `evidence_detail` dict per gap (actual_edges, max_possible_edges, centroid_similarity, year_span, cross_citations, methodology/background ratios, a_to_b/b_to_a counts)
- Bridge papers: `sim_to_cluster_a`, `sim_to_cluster_b` per bridge paper
- Grounded research questions: `_generate_grounded_questions()` uses paper TLDRs, temporal context, intent distribution, directional asymmetry
- LLM fix: explicit `{}` detection, `llm_status: "success"|"failed"` in report response, typed exception handling
- CORS fix: global exception handler ensures CORS headers on 500/503 errors
- GapReportView rewrite: collapsible sections (AnimatePresence), score bar tooltips, copy-to-clipboard, LLM fallback banner
- Resizable left panel: 250-600px drag handle, localStorage persistence
- Frontend: `semantic` → `relatedness` label throughout, `EvidenceDetail` type, union RQ type `(string | Dict)[]`
- Export: Markdown export uses "Relatedness" label

### v3.3.0 Gap-to-Proposal: Enhanced Gap Score + Gap Report (2026-02-24)
- Enhanced Gap Score: 5-dimensional scoring (structural/semantic→relatedness in v3.3.1/temporal/intent/directional) with weighted composite — zero additional S2 API calls
- Gap Report generation: `POST /api/gaps/report` — structured evidence + Groq LLM narrative synthesis with graceful degradation
- GapReportView: full cosmic HUD report rendering with executive summary, score breakdown bars, key papers, narrative sections, research questions, significance
- 3D canvas snapshot: captures graph state on report generation, embedded in report
- Export: Markdown + BibTeX download from GapReportView
- Pipeline change: intent fetch now sequential before gap detection (was parallel) to enrich edge data
- Cache: gap_report 24h TTL via Redis
- GapSpotterPanel: score breakdown mini bars, key papers preview, "GENERATE REPORT" button per gap card
- Types: `GapReport`, `GapReportSection`, `GapReportQuestion`, `GapScoreBreakdown`, `GapKeyPaper` interfaces
- Zustand: `activeGapReport`, `gapReportLoading` state; conditional rendering in seed page

### v3.2.0 Gap Spotter UX + Bookmarks + Chat Actions (2026-02-24)
- Gap hover: cluster pair highlight (opacity 1 vs 0.05) + potential edges as dashed gold
- Camera auto-focus: panel paper clicks animate camera to node (1s, z+200)
- Selection ring: gold pulsing RingGeometry with sin-wave opacity animation via CosmicAnimationManager
- Label enhancement: selected node gets fontSize 20, scale 50x13, dark rounded background box
- Mode-responsive legend: dynamic content per edgeVisMode (Citation Context / Temporal / Cross-Cluster)
- Enhanced intents removed: unused enhanced_intent field and ENHANCED_INTENT_COLORS deleted
- Research questions restored: fixed `research_questions=[]` → `gap.research_questions`, expanded to 5 categories
- Bookmarks (P10): CRUD API (`/api/bookmarks`), toggle from OBJECT SCAN, tags + memos, PostgreSQL + GIN index
- Chat Actions (P13): LLM action markers parsed → interactive buttons (highlight, select, cluster, edge mode, path)
- Chat context: paper IDs and cluster IDs in system prompt for grounded action generation

### v3.1.0 UX Overhaul (2026-02-23)
- Push layout: right panel is flex sibling, not overlay — 3D view stays visible
- Edge visualization: 3 switchable modes (similarity/temporal/crossCluster) + always-on bidirectional/shared-author indicators
- Interactive Gap Spotter: bridge papers and frontier papers clickable → OBJECT SCAN
- Heuristic research questions generated from cluster labels (no LLM dependency)
- Cluster stats: H-index, Recency %, Top Authors
- Paper selection: gold visual feedback in cluster panel
- Author S2 links: clickable to Semantic Scholar profiles
- Citation path: visual chain with year gaps and clickable nodes
- In-graph drill-down: collapsible References/Cited-by lists in OBJECT SCAN
- Backend: CORS for .onrender.com, better chat error messages, is_influential edge propagation
