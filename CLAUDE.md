# ScholarGraph3D v2.0 - Claude Code Instructions

> 3D academic paper graph visualization — Seed Paper Exploration Platform
> GitHub: github.com/HosungYou/ScholarGraph3D

## Project Overview

ScholarGraph3D v2.0 is a focused Seed Paper exploration platform. Users search via natural language → select a seed paper → explore its citation network in 3D. The system fetches references and citations from Semantic Scholar, computes SPECTER2 embeddings, reduces via UMAP to 3D, clusters with HDBSCAN, detects research gaps, and renders everything as an interactive cosmic universe.

v2.0 is a major simplification from v1.x — keyword search, multi-provider LLM, watch queries, lit review, personalization, trends, and GraphRAG chat were all removed to focus on the seed paper exploration workflow.

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js 14 + TypeScript + Tailwind | App Router, Cosmic Universe theme |
| 3D Rendering | react-force-graph-3d + Three.js 0.152.2 | Pin Three.js version (ESM compat) |
| Backend | FastAPI + Python 3.11 | Async with asyncpg |
| Database | PostgreSQL + pgvector (Supabase) | 768-dim SPECTER2 vectors |
| Cache | Redis (Upstash) | seed-explore 24h, refs/cites 7d, embeddings 30d, graceful no-op |
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
├── main.py              # FastAPI app with lifespan (registers 5 routers)
├── config.py            # Pydantic Settings (env vars)
├── database.py          # asyncpg pool (global db singleton)
├── cache.py             # Redis cache helpers (Upstash) — graceful no-op if unavailable
├── auth/                # Supabase JWT auth
├── middleware/
│   ├── analytics.py         # Request analytics middleware
│   └── rate_limiter.py      # Rate limiting middleware
├── integrations/
│   ├── semantic_scholar.py  # S2 API client (semaphore rate limiter, auto-detect RPS)
│   └── crossref.py          # CrossRef DOI lookup
├── graph/
│   ├── embedding_reducer.py   # PCA 768→100D + UMAP 100→50D→3D (v2.0.2)
│   ├── clusterer.py           # HDBSCAN + cluster labeling
│   ├── similarity.py          # Cosine similarity edges (>0.7)
│   ├── bridge_detector.py     # Cross-cluster bridge node detection (top-5%)
│   ├── incremental_layout.py  # k-NN position interpolation for stable expand
│   └── gap_detector.py        # Inter-cluster gap detection + bridge papers + research questions
├── llm/
│   ├── base.py              # Abstract BaseLLMProvider + LLMResponse
│   └── groq_provider.py     # LLaMA 3.3-70b (rate limiter + retry)
├── services/
│   └── citation_intent.py   # S2 basic + enhanced citation intents
├── routers/
│   ├── papers.py          # Paper detail, expand-stable, intents, by-doi
│   ├── graphs.py          # CRUD saved graphs (auth required, JSONB graph_data)
│   ├── seed_explore.py    # POST /api/seed-explore — seed paper graph expansion
│   ├── paper_search.py    # POST /api/paper-search — NL query → paper selection
│   └── seed_chat.py       # POST /api/seed-chat — Groq-powered graph chat
└── database/
    └── migrations/
        └── 003_seed_graphs.sql  # ALTER TABLE add graph_data JSONB column
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
│   │   ├── GapSpotterPanel.tsx        # Gap Spotter — research gaps, bridge papers, frontier papers
│   │   └── SeedChatPanel.tsx          # Seed Chat — Groq-powered conversational graph exploration
│   ├── auth/
│   │   ├── LoginForm.tsx              # Login form
│   │   └── SignupForm.tsx             # Signup form
│   └── dashboard/
│       └── SavedGraphs.tsx            # Saved graphs list/management
├── hooks/
│   └── useGraphStore.ts       # Zustand state (graph data, UI state, gaps, frontier, paths)
├── lib/
│   ├── api.ts                 # Backend API client (seed-explore, paper-search, seed-chat, graphs)
│   ├── auth-context.tsx       # Supabase auth context
│   ├── supabase.ts            # Supabase client init
│   ├── utils.ts               # Shared utilities (findCitationPath BFS)
│   └── export.ts              # BibTeX/RIS export utilities
├── types/
│   └── index.ts               # All types (Paper, GraphData, StructuralGap, CitationIntent)
├── __tests__/                 # Jest test suite
│   └── setup.tsx              # Testing library setup
└── jest.config.js             # Jest configuration
```

## Core User Flow

1. **Landing** (`/`): User enters NL query → `POST /api/paper-search` → selects seed paper
2. **Explore** (`/explore/seed?paper_id=...`): Seed paper expanded via `POST /api/seed-explore` → 3D graph rendered
3. **Interact**: Click nodes to expand (expand-stable), view details (push layout), find citation paths with visual chain, drill-down via in-graph connections, export BibTeX/RIS
4. **Analyze**: Left panel tabs — Clusters | Gaps | Chat — for exploring structure and asking questions
5. **Save**: Save graph to database → reload from Dashboard (`/dashboard`)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/paper-search` | NL query → paper selection list |
| POST | `/api/seed-explore` | Seed paper → full graph (nodes, edges, clusters, gaps, frontier) |
| POST | `/api/papers/{id}/expand-stable` | Expand node with incremental layout |
| GET | `/api/papers/{id}/intents` | Citation intent classification |
| GET | `/api/papers/by-doi?doi=...` | DOI lookup |
| POST | `/api/seed-chat` | Groq chat about graph context |
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
- Size: `Math.min(30, Math.max(4, Math.sqrt(citation_count + 1) * 1.5))` — sqrt scale
- Color: STAR_COLOR_MAP — 26 fields with max hue separation. Top 10: CS=Blue, Med=Red, Bio=Green, Physics=Magenta, Econ=Gold, Eng=Purple, Business=Orange, Chem=Pink, Psych=Seafoam, EnvSci=Lime
- Twinkle: GLSL shader — 1.5Hz (old) → 6.0Hz (new papers)
- Star layers: glow sprite (additive), lens flare (selected), corona (OA), supernova (top 10%), binary (bridge)
- Frontier nodes: red ring (#FF4444) for papers with frontier_score > 0.7

### Edge Visual Mapping (Light Streams)
- Citation: 4 cyan particles flowing, intent-colored when intents loaded
- Similarity: Dashed lines (#4a90d9), no particles
- Citation Path: Gold (#FFD700) highlighted edges
- Intent colors: Background=#95A5A6, Methodology=#9B59B6, Result=#4A90D9, Supports=#2ECC71, Contradicts=#E74C3C, Extends=#3498DB, Applies=#E67E22, Compares=#1ABC9C
- **Edge Visualization Modes** (v3.1.0, store: `edgeVisMode`):
  - `similarity` (default): Intent-based coloring as above
  - `temporal`: Gold→gray lerp based on |yearA - yearB| / 10
  - `crossCluster`: Inter-cluster = gold (#D4AF37), intra-cluster = dim (#222222)
- **Always-on overlays**: Bidirectional citations = gold (#FFD700), Shared authors = green (#2ECC71)
- `is_influential` edges rendered 1.5x wider with glow

### Cluster Visual Mapping (Nebula Clouds)
- Gaussian-distributed THREE.Points particles per cluster (Box-Muller)
- Particle count: `min(250, max(50, nodeCount * 20))`
- AdditiveBlending, shimmer shader, distance-based alpha falloff

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

### Important Constraints
- Three.js MUST stay at 0.152.2 (ESM compatibility)
- S2 API: 1 RPS authenticated, 0.3 RPS unauthenticated (auto-detected), non-commercial license
- pgvector: 768-dim SPECTER2 vectors, ivfflat index with 100 lists
- HDBSCAN min_cluster_size=5; UMAP n_neighbors=15 (50D intermediate) / 10 (3D visualization)
- UMAP pipeline: PCA 768→100D (instant) + UMAP 100→50D (shared) + 50D→3D for viz; 50D direct to HDBSCAN
- PCA pre-reduction triggers when input dim > 200 (_PCA_THRESHOLD); cuts UMAP from ~51s to ~3s on 0.5 vCPU
- HDBSCAN runs on 50-dim intermediate UMAP embeddings (NOT 3D coords)
- Z-axis = publication year (semantic topology on X/Y, time depth on Z)
- Backend: 1 uvicorn worker (async handles concurrency; CPU ops via asyncio.to_thread)
- DB pool: min=1, max=3 connections
- expand endpoints: refs/cites fetched independently — partial S2 failures return available data (not 404)
- get_references/get_citations: (data.get("data") or []) — S2 may return {"data": null} for unindexed papers
- Groq rate limiter: 28 RPM for LLaMA 3.3-70b

## Zustand Store (useGraphStore)

Key state slices:
- `graphData`: GraphData (nodes, edges, clusters)
- `selectedPaperId`, `hoveredPaperId`: paper selection
- `expandedFromMap`: child → parent tracking for expand effects
- `gaps`: StructuralGap[] — detected research gaps
- `frontierIds`: string[] — frontier paper IDs
- `pathStart`, `pathEnd`, `activePath`: citation path finding
- `highlightedPaperIds`: Set<string> — hover highlights from gap panel
- `activeTab`: 'clusters' | 'gaps' | 'chat' — left panel tab selection
- `edgeVisMode`: 'similarity' | 'temporal' | 'crossCluster' — edge visualization mode (v3.1.0)

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
