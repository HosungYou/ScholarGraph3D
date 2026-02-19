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
├── services/                    # Phase 3
│   ├── watch_service.py         # Watch query execution + OA search + similarity filter
│   ├── email_service.py         # Resend API email digests
│   ├── citation_intent.py       # S2 basic + LLM-enhanced 5-class intents
│   └── lit_review.py            # LLM lit review generation + weasyprint PDF
├── routers/
│   ├── search.py        # POST /api/search → full graph pipeline (+ is_bridge flag)
│   ├── papers.py        # Paper detail, citations, references, expand, expand-stable, intents
│   ├── graphs.py        # CRUD saved graphs (auth required)
│   ├── analysis.py      # Phase 2: POST /api/analysis/trends, gaps, hypotheses
│   ├── chat.py          # Phase 2: POST /api/chat + /api/chat/stream (SSE)
│   ├── watch.py         # Phase 3: /api/watch CRUD + /api/watch/cron
│   └── lit_review.py    # Phase 3: /api/lit-review/generate + export-pdf
└── database/
    └── 001_initial_schema.sql  # papers, citations, user_graphs, search_cache, chat_*, watch_queries
```

### Frontend Directory
```
frontend/
├── app/
│   ├── page.tsx          # Landing page with search
│   ├── explore/page.tsx  # Main 3-panel exploration (tabbed sidebar + chat)
│   ├── auth/             # Login/signup
│   └── dashboard/        # Saved graphs
├── components/
│   ├── graph/
│   │   ├── ScholarGraph3D.tsx    # Main 3D component (Phase 1.5: dimming, labels, bridge/OA/bloom layers, ghost edges, gap overlay)
│   │   ├── PaperDetailPanel.tsx  # Right panel paper details
│   │   ├── ClusterPanel.tsx      # Left panel: density bar, edge count, visibility toggle, focus button
│   │   ├── SearchBar.tsx         # Search input with filters
│   │   └── GraphControls.tsx     # Floating toggles: citation/similarity/hulls/labels/bloom/ghost/gap
│   ├── analysis/                 # Phase 2
│   │   ├── TrendPanel.tsx        # Emerging/stable/declining with sparklines
│   │   └── GapPanel.tsx          # Gap strength, bridge papers, hypotheses
│   ├── chat/                     # Phase 2
│   │   └── ChatPanel.tsx         # GraphRAG streaming chat with [N] citations
│   ├── settings/                 # Phase 2
│   │   └── LLMSettingsModal.tsx  # 4-provider API key management (localStorage)
│   ├── watch/                    # Phase 3
│   │   └── WatchQueryPanel.tsx   # Watch query CRUD, filters, check-now
│   └── litreview/                # Phase 3
│       └── LitReviewPanel.tsx    # Full-overlay lit review, TOC, PDF download
├── hooks/useGraphStore.ts    # Zustand state (Phase 1 + 1.5 + 2: bloom/ghostEdges/gapOverlay/hiddenClusters/bridgeNodes)
├── lib/
│   ├── api.ts               # Backend API client (search + analysis + chat)
│   ├── auth-context.tsx      # Supabase auth context
│   └── supabase.ts           # Supabase client init
└── types/index.ts            # All types (Paper, Trend, Gap, Chat, LLMSettings)
```

## Key Conventions

### API Response Format
Search endpoint returns: `{ nodes: Paper[], edges: GraphEdge[], clusters: Cluster[], meta: {...} }`

### Node Visual Mapping
- Size: `Math.max(3, Math.log(citation_count + 1) * 3)`
- Color: OA field → Physical Sciences=#4A90D9, Life Sciences=#2ECC71, Social Sciences=#E67E22, etc.
- Opacity: `0.3 + 0.7 * ((year - minYear) / (maxYear - minYear))` (base); 3-tier dimming on select
- Label: First author last name + year (e.g., "Vaswani 2017"); shown only for top-20% citation papers
- Phase 1.5 layers: bridge gold glow (is_bridge), OA ring (is_open_access), citation aura (top 10%), bloom halo (selected + showBloom)

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
- HDBSCAN min_cluster_size=5, UMAP n_neighbors=15
- Backend: 1 uvicorn worker (async handles concurrency; CPU ops via asyncio.to_thread)
- DB pool: min=1, max=3 connections
- LLM cache: max 200 entries with oldest-25% eviction
- HDBSCAN runs on 3D UMAP coordinates (not 768-dim embeddings)

## Documentation Map

| Document | Purpose | Location |
|----------|---------|----------|
| PRD | Product requirements, user stories, acceptance criteria | docs/PRD.md |
| SPEC | Technical specification, API contracts, DB schema | docs/SPEC.md |
| ARCHITECTURE | System design, data pipeline, deployment | docs/ARCHITECTURE.md |
| SDD/TDD Plan | Test strategy, coverage requirements | docs/SDD_TDD_PLAN.md |
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
- Phase 3 (Real-time): v0.3.0 — watch queries + Resend email, citation intent (S2 + LLM), lit review + PDF
