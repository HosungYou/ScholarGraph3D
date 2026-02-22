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
| Frontend | Next.js 14 + TypeScript + Tailwind | App Router, Cosmic Universe theme |
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
├── cache.py             # Redis cache helpers (Upstash) — graceful no-op if unavailable
├── auth/                # Supabase JWT auth
├── middleware/
│   ├── analytics.py         # Request analytics middleware
│   └── rate_limiter.py      # Rate limiting middleware
├── integrations/
│   ├── semantic_scholar.py  # S2 API client (1 RPS, rate limiting)
│   ├── openalex.py          # OA API client (credit tracking)
│   └── data_fusion.py       # OA-first + S2 enrichment + DOI dedup
├── graph/
│   ├── embedding_reducer.py   # UMAP 3D (768→3 dims)
│   ├── clusterer.py           # HDBSCAN + OA Topics labels
│   ├── similarity.py          # Cosine similarity edges (>0.7)
│   ├── bridge_detector.py     # Phase 1.5: cross-cluster bridge node detection (top-5%)
│   ├── incremental_layout.py  # Phase 1.5: k-NN position interpolation for stable expand
│   ├── trend_analyzer.py      # Phase 2: emerging/stable/declining classification
│   ├── gap_detector.py        # Phase 2: inter-cluster gap detection + bridge papers
│   └── graph_rag.py           # Phase 2: RAG context builder for LLM chat
├── llm/                     # Phase 2: Multi-provider LLM layer
│   ├── base.py              # Abstract BaseLLMProvider + LLMResponse
│   ├── openai_provider.py   # GPT-4o-mini / GPT-4o / GPT-4-turbo
│   ├── claude_provider.py   # Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.6
│   ├── gemini_provider.py   # Gemini 2.5 Flash / Pro
│   ├── groq_provider.py     # LLaMA 3.3-70b (rate limiter + retry)
│   ├── user_provider.py     # Factory for user-provided API keys
│   ├── cached_provider.py   # Transparent caching decorator
│   └── circuit_breaker.py   # Fault tolerance (CLOSED→OPEN→HALF_OPEN)
├── services/                    # Phase 3+
│   ├── watch_service.py         # Watch query execution + OA search + similarity filter
│   ├── email_service.py         # Resend API email digests
│   ├── citation_intent.py       # S2 basic + LLM-enhanced 5-class intents
│   ├── lit_review.py            # LLM lit review generation + weasyprint PDF
│   ├── query_normalizer.py      # Query normalization for cache hit rates (Groq llama-3.1-8b)
│   └── query_parser.py          # NL→structured search params (Groq llama-3.3-70b)
├── routers/
│   ├── search.py        # POST /api/search → full graph pipeline (+ is_bridge flag)
│   ├── natural_search.py  # POST /api/search/natural → NL query → Groq parse → parallel search
│   ├── search_stream.py   # GET /api/search/stream → SSE progress feedback
│   ├── papers.py        # Paper detail, citations, references, expand, expand-stable, intents, by-doi
│   ├── graphs.py        # CRUD saved graphs (auth required)
│   ├── analysis.py      # Phase 2+4: trends, gaps, hypotheses, conceptual-edges/stream (SSE), scaffold-angles
│   ├── chat.py          # Phase 2: POST /api/chat + /api/chat/stream (SSE)
│   ├── watch.py         # Phase 3: /api/watch CRUD + /api/watch/cron
│   ├── lit_review.py    # Phase 3: /api/lit-review/generate + export-pdf
│   ├── personalization.py   # Phase 5: /api/user profile, events, search-history, recommendations
│   └── seed_explore.py  # Phase 6: POST /api/seed-explore (seed paper graph expansion)
└── database/
    ├── 001_initial_schema.sql  # papers, citations, user_graphs, search_cache, chat_*, watch_queries
    └── 002_personalization.sql  # Phase 5: user_profiles, search_history, interactions, recommendations
```

### Frontend Directory
```
frontend/
├── app/
│   ├── page.tsx          # Landing page — cosmic starfield + warp transition
│   ├── providers.tsx     # Client providers wrapper (Supabase auth, etc.)
│   ├── sitemap.ts        # Next.js sitemap generation
│   ├── explore/page.tsx  # Mission Control — 3-panel exploration (tabbed sidebar + chat)
│   ├── explore/seed/page.tsx  # Origin Point Mode — seed paper exploration (resizable panels, expand animation, citation intents)
│   ├── auth/
│   │   ├── page.tsx           # Station Access — login/signup
│   │   └── callback/page.tsx  # OAuth callback handler
│   └── dashboard/        # Command Center — saved graphs
├── components/
│   ├── cosmic/                  # v1.0.0: Shared cosmic theme components
│   │   ├── StarfieldBackground.tsx  # Three.js WebGL starfield (3000 stars + Milky Way, parallax, warp)
│   │   ├── CosmicStarfield.tsx      # CSS-only starfield for auth/dashboard (lightweight)
│   │   ├── HudPanel.tsx             # Reusable HUD panel wrapper (scanline, brackets)
│   │   └── RadarLoader.tsx          # Concentric ring radar loading indicator
│   ├── graph/
│   │   ├── ScholarGraph3D.tsx    # Main 3D component (star nodes, nebula clusters, light stream edges, showCosmicTheme toggle)
│   │   ├── cosmic/               # v1.0.0: Cosmic rendering system
│   │   │   ├── cosmicConstants.ts       # Star color map (26 fields), GLSL shaders, twinkle rates
│   │   │   ├── cosmicTextures.ts        # Canvas-generated glow/corona/flare textures
│   │   │   ├── CosmicAnimationManager.ts # Singleton rAF loop for all shader uniforms
│   │   │   ├── starNodeRenderer.ts      # Star node factory (twinkle, supernova, binary, flare)
│   │   │   └── nebulaClusterRenderer.ts # Gaussian particle cloud per cluster
│   │   ├── PaperDetailPanel.tsx  # Object Scanner — right panel paper details
│   │   ├── ClusterPanel.tsx      # Sector Scanner — density, visibility, paper list, stats, highlight
│   │   ├── GraphLegend.tsx       # Star Chart — field colors (top 10), size/edge/cluster visual guide
│   │   ├── CitationContextModal.tsx  # Citation context detail modal
│   │   ├── SearchBar.tsx         # Navigation Console — search input with filters
│   │   └── GraphControls.tsx     # Ship Controls — floating toggles
│   ├── analysis/                 # Phase 2
│   │   ├── TrendPanel.tsx        # Emerging/stable/declining with sparklines
│   │   ├── GapPanel.tsx          # Gap strength, bridge papers, hypotheses
│   │   └── TimelineView.tsx      # Phase 6: D3-based 2D timeline of papers by year
│   ├── chat/                     # Phase 2
│   │   └── ChatPanel.tsx         # Comm Channel — GraphRAG streaming chat with [N] citations
│   ├── settings/                 # Phase 2
│   │   └── LLMSettingsModal.tsx  # Comm Relay Config — 4-provider API key management
│   ├── watch/                    # Phase 3
│   │   └── WatchQueryPanel.tsx   # Watch query CRUD, filters, check-now
│   ├── litreview/                # Phase 3
│   │   └── LitReviewPanel.tsx    # Full-overlay lit review, TOC, PDF download
│   ├── scaffolding/                # Phase 4
│   │   └── ScaffoldingModal.tsx    # Multi-select research angle exploration modal
│   └── dashboard/
│       ├── RecommendationCard.tsx   # Phase 5: recommendation card with dismiss + explore
│       └── SavedGraphs.tsx          # Saved graphs list/management
├── hooks/useGraphStore.ts    # Zustand state (Phase 1–6 + showCosmicTheme toggle)
├── lib/
│   ├── api.ts               # Backend API client (search + analysis + chat)
│   ├── auth-context.tsx      # Supabase auth context
│   ├── supabase.ts           # Supabase client init
│   └── utils.ts              # Shared utility functions
└── types/index.ts            # All types (Paper, Trend, Gap, Chat, LLMSettings)
```

## Key Conventions

### API Response Format
Search endpoint returns: `{ nodes: Paper[], edges: GraphEdge[], clusters: Cluster[], meta: {...} }`

### Cosmic Universe Theme (v1.0.0)
- Background: Deep space #050510, accent cyan #00E5FF, nebula purple #6c5ce7, star lavender #a29bfe
- Glass: `rgba(5,5,16,0.85)` + blur(16px) + cyan border; HUD panels with scanline overlays
- Animations: warp-speed, cosmic-pulse, hud-flicker, radar-sweep, border-glow, drift
- Toggle: `showCosmicTheme` in Zustand (default: true) — fallback to classic renderer when false
- Landing: Three.js starfield (3000 stars + Milky Way) + warp transition on search
- See: docs/DESIGN_THEME.md for full design system reference

### Node Visual Mapping (Cosmic Star Nodes) — v1.0.1
- Size: `Math.min(30, Math.max(4, Math.sqrt(citation_count + 1) * 1.5))` — sqrt scale for dramatic size differences
- Color: STAR_COLOR_MAP has 26 fields with maximum hue separation. Top 10 in GraphLegend: CS=Blue #4DA6FF, Med=Red #FF5252, Bio=Green #69F0AE, Physics=Magenta #EA80FC, Economics=Gold #FFD740, Engineering=Purple #B388FF, Business=Orange #FF9100, Chemistry=Pink #FF80AB, Psychology=Seafoam #A7FFEB, EnvSci=Lime #76FF03. Fallback: Other=Grey #B0BEC5
- Twinkle: GLSL shader — rate 1.5Hz (old papers) → 6.0Hz (new papers)
- Opacity: `0.3 + 0.7 * ((year - minYear) / (maxYear - minYear))` (base); 3-tier dimming on select
- Glow: Sprite with opacity `displayOpacity * 0.9`, scale `size * 6`, additive blending
- Label: First author last name + year (e.g., "Vaswani 2017"); shown only for top-20% citation papers
- Star layers: glow sprite (additive), lens flare (selected), corona (OA), supernova burst (top 10%), binary star (bridge)

### Cluster Visual Mapping (Nebula Clouds) — v1.0.1
- Gaussian-distributed THREE.Points particles per cluster (Box-Muller)
- Particle count: `min(250, max(50, nodeCount * 20))` per cluster
- Base opacity: 0.3 (normal) / 0.5 (emerging) — dramatically increased from v1.0.0
- Point size: 5.0 (camera-relative), spread multipliers 0.8/0.8/0.6 (XY/Z)
- AdditiveBlending, shimmer shader, distance-based alpha falloff

### Edge Visual Mapping (Light Streams) — v1.0.1
- Citation: `linkDirectionalParticles` (4 cyan particles, speed 0.006) for flow animation
- Citation color: intent color or `#00E5FF80` (cyan), linkOpacity 0.8
- Similarity: Dashed lines (#4a90d9), no directional particles
- Ghost: LineDashedMaterial (dim)
- LOD: Distance > 2000 → similarity edges hidden; > 3000 → weak edges hidden

### Expand Visual Effects — v1.1.0
- Parent pulse: cyan (#00E5FF) RingGeometry on parent node, 3s duration
- New node glow: cyan SphereGeometry on newly expanded nodes, 3s duration
- Edge highlight: expanded edges bright cyan, width 3.0, 3s duration
- expandedFromMap: Zustand store tracks child nodeId → parent nodeId
- API: AbortController 20s timeout, 429 auto-retry (retry-after header), network error retry (2s)
- ExpandMeta: references_ok, citations_ok, refs_count, cites_count, error_detail

### Data Fusion Strategy
1. OpenAlex keyword search (primary, 10 credits/page)
2. Semantic Scholar search (supplementary, include_embedding=True)
3. DOI-based dedup (OA metadata preferred + S2 TLDR/embeddings)
4. Abstract fallback: OA abstract → S2 TLDR → "No abstract"

### Important Constraints
- Three.js MUST stay at 0.152.2 (ESM compatibility)
- S2 API: 1 RPS authenticated, non-commercial license
- OA API: 100K credits/day with API key, semantic search = 1000 credits
- pgvector: 768-dim vectors, ivfflat index with 100 lists
- HDBSCAN min_cluster_size=5 (search router default) / 8 (clusterer default); UMAP n_neighbors=15 (50D intermediate) / 10 (3D visualization)
- Backend: 1 uvicorn worker (async handles concurrency; CPU ops via asyncio.to_thread)
- DB pool: min=1, max=3 connections
- LLM cache: max 200 entries with oldest-25% eviction
- HDBSCAN runs on 50-dim intermediate UMAP embeddings (NOT 3D coords — double-distortion fix, v0.7.0)
- Z-axis = publication year (not UMAP dim 3) — semantic topology on X/Y, time depth on Z (v0.7.0)
- GraphRAG uses SPECTER2 adhoc_query adapter for query encoding + pgvector ANN search (v0.7.0)
- expand endpoints: refs/cites fetched independently — partial S2 failures return available data (not 404); HTTP 400/404 from S2 → [] (non-fatal)
- Landing page: Seed Paper (doi) mode is default; DOI pattern auto-detected in any mode → routes to /explore/seed
- get_references/get_citations: (data.get("data") or []) — S2 may return {"data": null} for unindexed papers
- API health endpoint reports version 0.1.0 (not updated with releases)

## Documentation Map

| Document | Purpose | Location |
|----------|---------|----------|
| PRD | Product requirements, user stories, acceptance criteria | docs/PRD.md |
| SPEC | Technical specification, API contracts, DB schema | docs/SPEC.md |
| ARCHITECTURE | System design, data pipeline, deployment | docs/ARCHITECTURE.md |
| SDD/TDD Plan | Test strategy, coverage requirements | docs/SDD_TDD_PLAN.md |
| PHILOSOPHY | Design philosophy, "why" behind every feature decision | docs/PHILOSOPHY.md |
| TECH_PROOF | Academic justification for all technical choices (SPECTER2, RRF, UMAP, HDBSCAN) | docs/TECH_PROOF.md |
| DESIGN_THEME | Cosmic Universe theme design system reference | docs/DESIGN_THEME.md |
| RELEASE_v0.6.0 | v0.6.0 release notes | docs/RELEASE_v0.6.0.md |
| RELEASE_v0.7.1 | v0.7.1 hotfix release notes | docs/RELEASE_v0.7.1.md |
| RELEASE_v1.0.0 | v1.0.0 release notes | docs/RELEASE_v1.0.0.md |
| RELEASE_v1.0.1 | v1.0.1 visibility fix release notes | docs/RELEASE_v1.0.1.md |
| RELEASE_v1.1.0 | v1.1.0 release notes | docs/RELEASE_v1.1.0.md |
| release-notes/ | Additional release notes (v0.4.0, v0.5.0, v0.5.1, v0.5.2, v0.7.2) | release-notes/ |
| DEVELOPMENT.md | Development guide | ./DEVELOPMENT.md |
| AGENTS.md | Agent configuration | ./AGENTS.md |
| CLAUDE.md | This file — Claude Code project context | ./CLAUDE.md |

## LLM Provider Architecture (Phase 2)

Users provide their own API keys (stored in localStorage, never on server).

| Provider | Models | Default |
|----------|--------|---------|
| OpenAI | gpt-4o-mini, gpt-4o, gpt-4-turbo | gpt-4o-mini |
| Anthropic | claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-6 | claude-haiku-4-5 |
| Google | gemini-2.5-flash, gemini-2.5-pro | gemini-2.5-flash |
| Groq | llama-3.3-70b, llama-3.1-8b, mixtral-8x7b | llama-3.3-70b |

Patterns: CachedLLMProvider (decorator, in-memory TTL), CircuitBreaker (5 failures → open → 30s → half-open), AsyncRateLimiter (Groq: 28 RPM).

## Phase Status

- Phase 1 (MVP): v0.1.0 — search, 3D viz, clustering, paper detail, citation expand, graph save
- Phase 1.5 (Viz Enhancement): v0.1.5 — 3-tier dimming, centrality labels, bridge/OA/bloom node layers, ghost edges, gap overlay, per-cluster visibility, stable expand (commit 485e099)
- Phase 2 (AI Premium): v0.2.0 — LLM providers, GraphRAG chat, trend analysis, gap analysis
- Phase 3 (Real-time): v0.3.0 ✅ — natural language search (Groq), SSE progress stream, citation context modal, rate limiting, analytics, SEO
- Phase 4 (Relationships): v0.4.0 ✅ — critical node-click bug fix, panel resize, conceptual edges SSE, 3-mode home page, timeline view
- Phase 5 (Personalization): v0.5.0 ✅ — OAuth callback fix, user profiles, interaction logging, pgvector recommendations, dashboard recommendations section, home page "Continue Exploring"
- Phase 6 (Viz + Exploration): v0.6.0 ✅ — field color fix, LOD/opacity fix, panel highlight, seed paper mode, citation enrichment, 2D timeline, intent toggle, research settings
- v0.7.0 ✅ — search system redesign (SPECTER2 ANN, RRF scoring, temporal Z-axis, HDBSCAN 50-dim fix, UI declutter)
- v0.7.1 ✅ — hotfix: DOI lookup 404 (FastAPI route shadowing + missing S2 method)
- Phase 7 (Stability + Philosophy): v0.7.x ✅ — HDBSCAN 768-dim fix, temporal Z-axis, RRF hybrid search, SPECTER2 adhoc_query ANN, PHILOSOPHY.md, TECH_PROOF.md, expand null-safety, landing page seed-paper redesign, DOI auto-detection
- v0.8.0 (Viz & Interaction): ✅ — expand animation fix (fx/fy/fz + rAF), intent legend, responsive seed panels (localStorage), cluster panel redesign (paper list + stats + highlight), real S2 citation intents in seed mode
- v0.8.1 ✅ — hotfix: seed-explore S2 rate limit → 429 (was uncaught 500 + CORS), citation edge diagnostic logging
- v0.9.0 ✅ — node ID fix (S2 paper IDs, not integers), right panel visibility (AnimatePresence mode="wait"), zoomToFit after data load, Three.js rgba warning fix
- v0.9.1 ✅ — expand data completeness (StableExpandNode +authors/abstract/tldr/fields), recursive expand fix (s2_paper_id/doi mapping), right panel layout fix (min-w-0), cluster label dedup
- **v1.0.0 (Cosmic Universe Theme)**: ✅ — full UI redesign: papers=stars (GLSL twinkle shaders), clusters=nebulae (particle clouds), edges=light streams (flow shaders), Three.js starfield landing, HUD panels, warp transition, 10 new files, 27 modified files, showCosmicTheme toggle
- **v1.0.1 (Visibility Enhancement)**: ✅ — dramatic field color differentiation (max hue separation), sqrt node sizing (4-30 range), glow opacity 0.9/scale 6x, nebula opacity 0.3/0.5, linkDirectionalParticles for citation flow, GraphLegend uses STAR_COLOR_MAP, stronger supernova/corona textures
- **v1.1.0 (Legend · Expand · Error Resilience)**: ✅ — Visual Guide legend (8 features), expansion visual effects (pulse/glow/edge highlight 3s), DOI fallback expand, API timeout+retry (20s AbortController, 429 auto-retry), ExpandMeta partial success reporting, specific error messages, PaperDetailPanel badges (Top 10%/Bridge/OA) + "Expanded from", diagnostic logging (dev mode)
