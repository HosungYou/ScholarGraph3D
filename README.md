# ScholarGraph3D

> Seed Paper Exploration Platform — explore the citation universe from a single paper

ScholarGraph3D v3.0 lets you start from any academic paper and navigate its citation network as an interactive 3D cosmic universe. Enter a DOI or natural language query, select a seed paper, and watch its scholarly neighborhood materialize as stars, nebulae, and light streams — rendered in a luxury minimalist "Stellar Observatory" aesthetic (black + gold).

## Features

- **Seed Paper Exploration**: Start from any paper, expand its citation network up to 3 hops in 3D
- **3D Cosmic Visualization**: SPECTER2 embeddings → UMAP → interactive 3D star map with star nodes, nebula clusters, and citation light streams
- **HDBSCAN Clustering**: Auto-detected research communities rendered as Gaussian particle nebula clouds
- **Gap Spotter**: Structural gap detection between clusters with bridge papers and AI-generated research questions
- **Frontier Detection**: Papers with many unexplored connections highlighted with gold rings
- **Citation Path Finder**: BFS shortest path between any two papers in the graph
- **Seed Chat**: Groq-powered conversational exploration of your citation graph (llama-3.3-70b)
- **BibTeX/RIS Export**: Export selected papers for reference managers
- **Graph Save/Load**: Persistent exploration sessions via Dashboard

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 + TypeScript + Tailwind CSS (Stellar Observatory theme) |
| 3D Rendering | react-force-graph-3d + Three.js 0.152.2 |
| Backend | FastAPI + Python 3.11 |
| Database | PostgreSQL + pgvector (Supabase) |
| Cache | Redis (Upstash) |
| Auth | Supabase Auth |
| LLM | Groq (llama-3.3-70b) |
| Deployment | Vercel (frontend) + Render (backend) |

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL with pgvector extension

### Backend Setup

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in: DATABASE_URL, S2_API_KEY, GROQ_API_KEY
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local  # Fill in: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SUPABASE_URL/KEY
npm run dev  # http://localhost:3000
```

## Architecture

```
NL Search → Paper Selection → Seed Explore → S2 refs/cites → SPECTER2 → UMAP 3D → HDBSCAN → 3D Graph
```

1. User enters a natural language query on the landing page
2. `POST /api/paper-search` returns a ranked list of candidate papers
3. User selects a seed paper → `POST /api/seed-explore` fetches references and citations from Semantic Scholar
4. SPECTER2 embeddings are reduced to 3D via UMAP; communities detected by HDBSCAN
5. Graph rendered as an interactive cosmic universe (stars, nebulae, light streams)
6. Left panel tabs: Clusters | Gap Spotter | Seed Chat for deeper analysis

## Data Source

**Semantic Scholar** — paper metadata, SPECTER2 embeddings (768-dim), TLDRs, citation intents, references/citations graph. Rate-limited to 1 RPS (authenticated). Non-commercial license.

## License

MIT

## Documentation

See `docs/` for detailed documentation: PRD, SPEC, ARCHITECTURE, DESIGN_THEME, SDD/TDD Plan, and release notes.

Additional working docs:

- `docs/OPEN_SOURCE_DATA_STRATEGY.md` — provider mix and product direction for an open-source-friendly stack
- `docs/REVIEW_AUTOMATION_LOOP.md` — deterministic fixture review flow and CLI automation
- `docs/DEPLOYMENT.md` — deployment topology, required environment variables, and smoke checks
