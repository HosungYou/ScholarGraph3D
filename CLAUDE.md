# ScholarGraph3D v4.0.0 - Claude Code Instructions

> Seed Paper Exploration Platform -- 3D academic citation graph visualization
> GitHub: github.com/HosungYou/ScholarGraph3D

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js 14 + TypeScript + Tailwind | App Router, Cosmic Universe theme |
| 3D Rendering | react-force-graph-3d + Three.js 0.152.2 | Pin Three.js version (ESM compat) |
| Backend | FastAPI + Python 3.11 | Async with asyncpg |
| Database | PostgreSQL + pgvector (Supabase) | 768-dim SPECTER2 vectors |
| Cache | Redis (Upstash) | seed-explore 24h, graceful no-op if unavailable |
| Auth | Supabase Auth | JWT, Google/GitHub OAuth |

## Build & Run

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in: DATABASE_URL, S2_API_KEY
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

## Backend Directory

```
backend/
├── main.py              # FastAPI app with lifespan (registers 4 routers)
├── config.py            # Pydantic Settings (env vars)
├── database.py          # asyncpg pool (global db singleton)
├── cache.py             # Redis cache helpers (Upstash) -- graceful no-op if unavailable
├── auth/                # Supabase JWT auth
│   ├── dependencies.py      # get_current_user dependency
│   ├── middleware.py         # AuthMiddleware (header extraction)
│   ├── models.py             # User model
│   ├── policies.py           # RLS policies
│   └── supabase_client.py    # Supabase client init
├── middleware/
│   └── rate_limiter.py      # Rate limiting middleware
├── integrations/
│   ├── semantic_scholar.py  # S2 API client (semaphore rate limiter, auto-detect RPS)
│   └── crossref.py          # Crossref DOI lookup (fallback for S2 misses)
├── graph/
│   ├── embedding_reducer.py   # PCA 768->100D + UMAP 100->50D->3D
│   ├── clusterer.py           # Leiden hybrid clustering (citation + bib coupling + similarity) + HDBSCAN fallback + TF-IDF labeling
│   ├── similarity.py          # Cosine similarity edges (>0.7)
│   ├── bridge_detector.py     # Cross-cluster bridge node detection
│   ├── incremental_layout.py  # k-NN position interpolation for stable expand
│   └── gap_detector.py        # Inter-cluster gap detection + 3-dim scoring + bridge papers + research questions
├── services/
│   └── citation_intent.py   # S2 citation intent classification
├── routers/
│   ├── papers.py          # Paper detail, expand, expand-stable, intents, by-doi
│   ├── graphs.py          # CRUD saved graphs (auth required, JSONB graph_data)
│   ├── seed_explore.py    # POST /api/seed-explore -- seed paper graph expansion
│   └── paper_search.py    # POST /api/paper-search -- NL query -> paper selection
└── database/
    └── *.sql              # Schema migrations
```

## Frontend Directory

```
frontend/
├── app/
│   ├── page.tsx                   # Landing page -- NL search -> paper selection -> seed explore
│   ├── layout.tsx                 # Root layout
│   ├── providers.tsx              # Client providers (Supabase auth, React Query)
│   ├── globals.css                # Tailwind + cosmic theme CSS
│   ├── global-error.tsx           # Error boundary
│   ├── sitemap.ts                 # SEO sitemap
│   ├── explore/seed/
│   │   ├── page.tsx               # Seed Explorer -- sidebar + 3D canvas + detail panel
│   │   ├── ExploreSidebar.tsx     # Left sidebar (Clusters | Gaps tabs)
│   │   └── error.tsx              # Explore error boundary
│   ├── auth/
│   │   ├── page.tsx               # Station Access -- login/signup
│   │   └── callback/page.tsx      # OAuth callback handler
│   └── dashboard/
│       └── page.tsx               # Command Center -- saved graphs
├── components/
│   ├── cosmic/                        # Shared cosmic theme components
│   │   ├── StarfieldBackground.tsx    # Three.js WebGL starfield
│   │   ├── CosmicStarfield.tsx        # CSS-only starfield (lightweight)
│   │   ├── DeepFieldBackground.tsx    # Deep field CSS background
│   │   ├── HudPanel.tsx               # HUD panel wrapper (scanline, brackets)
│   │   ├── RadarLoader.tsx            # Radar loading indicator
│   │   └── AstronautHelmet.tsx        # Astronaut helmet decoration
│   ├── graph/
│   │   ├── ScholarGraph3D.tsx         # Main 3D component (star nodes, nebula clusters, light streams)
│   │   ├── useGraphRenderer.ts        # Graph rendering logic hook
│   │   ├── useGraphInteractions.ts    # Graph interaction logic hook
│   │   ├── graphEffects.ts            # Side effects (expansion, camera focus)
│   │   ├── cosmic/                    # Cosmic rendering system
│   │   │   ├── cosmicConstants.ts     # Star color map (26 fields), GLSL shaders
│   │   │   ├── cosmicTextures.ts      # Canvas-generated glow/corona/flare textures
│   │   │   ├── CosmicAnimationManager.ts # Singleton rAF loop for shader uniforms
│   │   │   ├── starNodeRenderer.ts    # Star node factory (twinkle, supernova, binary, flare)
│   │   │   ├── nebulaClusterRenderer.ts # Gaussian particle cloud per cluster
│   │   │   └── gapVoidRenderer.ts     # Gap visualization renderer
│   │   ├── PaperDetailPanel.tsx       # Object Scanner -- paper details + citation path + export
│   │   ├── ClusterPanel.tsx           # Sector Scanner -- cluster list, visibility, stats
│   │   ├── GraphLegend.tsx            # Star Chart -- field colors, visual guide
│   │   ├── GraphControls.tsx          # Ship Controls -- floating toggles
│   │   └── GapSpotterPanel.tsx        # Gap Spotter -- research gaps, bridge papers, research questions
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── SignupForm.tsx
│   └── dashboard/
│       └── SavedGraphs.tsx            # Saved graphs list/management
├── hooks/
│   └── useGraphStore.ts       # Zustand state (graph data, UI state, gaps, frontier, paths)
├── lib/
│   ├── api.ts                 # Backend API client
│   ├── auth-context.tsx       # Supabase auth context
│   ├── supabase.ts            # Supabase client init
│   ├── utils.ts               # Shared utilities (findCitationPath BFS)
│   ├── export.ts              # BibTeX/RIS export utilities
│   └── three-safety.ts        # Global Three.js disposal safety patch
├── types/
│   └── index.ts               # All types (Paper, GraphEdge, Cluster, StructuralGap, CitationIntent)
├── __tests__/                 # Jest test suite
└── jest.config.js             # Jest configuration
```

## Core User Flow

1. **Landing** (`/`): User enters NL query or DOI -> `POST /api/paper-search` -> selects seed paper
2. **Explore** (`/explore/seed?paper_id=...`): Seed paper expanded via `POST /api/seed-explore` -> 3D graph rendered
3. **Interact**: Click nodes to expand (expand-stable), view details, find citation paths, export BibTeX/RIS
4. **Analyze**: Left panel tabs -- Clusters | Gaps -- for exploring structure and identifying research gaps
5. **Save**: Save graph to database -> reload from Dashboard (`/dashboard`)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/paper-search` | NL query -> paper selection list |
| POST | `/api/seed-explore` | Seed paper -> full graph (nodes, edges, clusters, gaps, frontier) |
| POST | `/api/papers/{id}/expand-stable` | Expand node with stable incremental layout |
| POST | `/api/papers/{id}/expand` | Expand node (refs + cites, basic) |
| GET | `/api/papers/{id}` | Paper detail |
| GET | `/api/papers/{id}/citations` | Papers citing this paper |
| GET | `/api/papers/{id}/references` | Papers referenced by this paper |
| GET | `/api/papers/{id}/intents` | Citation intent classification |
| GET | `/api/papers/by-doi?doi=...` | DOI lookup (Crossref fallback) |
| GET | `/api/graphs` | List saved graphs (auth) |
| POST | `/api/graphs` | Save graph (auth) |
| GET | `/api/graphs/{id}` | Load saved graph (auth) |
| PUT | `/api/graphs/{id}` | Update saved graph (auth) |
| DELETE | `/api/graphs/{id}` | Delete saved graph (auth) |

## Key Conventions

### Cosmic Universe Theme
- Background: Deep space #050510, accent cyan #00E5FF, nebula purple #6c5ce7, star lavender #a29bfe
- Glass: `rgba(5,5,16,0.85)` + blur(16px) + cyan border; HUD panels with scanline overlays
- Animations: warp-speed, cosmic-pulse, hud-flicker, radar-sweep, border-glow, drift

### Node Visual Mapping (Star Nodes)
- Size: `Math.min(30, Math.max(4, Math.sqrt(citation_count + 1) * 1.5))` -- sqrt scale
- Color: STAR_COLOR_MAP -- 26 fields with max hue separation (CS=Blue, Med=Red, Bio=Green, Physics=Magenta, etc.)
- Twinkle: GLSL shader, frequency varies by publication recency
- Star layers: glow sprite (additive), corona (OA), supernova (top 10%), binary (bridge)
- Frontier nodes: red ring (#FF4444) for frontier_score > 0.7
- Selected node: gold pulsing ring, enlarged label

### Edge Visual Mapping (Light Streams)
- Citation: Cyan particles flowing, intent-colored when intents loaded
- Similarity: Dashed lines (#4a90d9), no particles
- Citation Path: Gold (#FFD700) highlighted edges
- Intent colors: Background=#95A5A6, Methodology=#9B59B6, Result=#4A90D9
- `is_influential` edges rendered 1.5x wider with glow

### Cluster Visual Mapping (Nebula Clouds)
- `createNebulaCluster()` returns `THREE.Group` (cloud + glow ring)
- Gaussian-distributed particle cloud (Box-Muller)
- AdditiveBlending, shimmer shader, distance-based alpha falloff
- Centroid: arithmetic mean from backend (`cluster.centroid`)
- Glow ring: `RingGeometry` with billboard + pulse shader

### Three.js Disposal Safety (CRITICAL)
- **Global safety patch** lives in `lib/three-safety.ts`, imported by `providers.tsx` at app root
- NEVER add local monkey-patches in individual components
- Every Three.js component cleanup MUST follow this order:
  1. Set `disposedRef = true` to guard async callbacks
  2. Cancel ALL `requestAnimationFrame` IDs
  3. Dispose geometries and materials BEFORE `renderer.dispose()`
  4. Call `scene.clear()`
  5. Call `renderer.dispose()` last
  6. Null all refs
- SPA navigation unmounts components mid-animation -- always check `disposedRef`

### Important Constraints
- Three.js MUST stay at 0.152.2 (ESM compatibility)
- S2 API: 1 RPS authenticated, non-commercial license
- pgvector: 768-dim SPECTER2 vectors
- Clustering: Leiden hybrid (citation + bib coupling + similarity graph) with HDBSCAN fallback
- Cluster labels: TF-IDF bigram/unigram from abstracts
- UMAP pipeline: PCA 768->100D + UMAP 100->50D (shared) + 50D->3D for viz
- Z-axis = publication year (semantic topology on X/Y, time depth on Z)
- Gap scoring: 3-dimension (structural 0.40, relatedness 0.35, temporal 0.25)
- NO LLM dependency -- gap research questions are template-generated from paper data
- Backend: 1 uvicorn worker (async handles concurrency; CPU ops via asyncio.to_thread)
- expand endpoints: refs/cites fetched independently -- partial S2 failures return available data
