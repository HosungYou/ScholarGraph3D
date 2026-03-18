# ScholarGraph3D

ScholarGraph3D is a seed-paper exploration platform that visualizes academic citation networks as interactive 3D cosmic graphs. Enter a natural language query or DOI, select a seed paper, and explore its scholarly neighborhood -- references, citations, semantic clusters, and research gaps -- rendered as stars, nebulae, and light streams.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| 3D Rendering | react-force-graph-3d, Three.js 0.152.2 |
| Backend | FastAPI, Python 3.11 |
| Embeddings | SPECTER2 (768-dim, via Semantic Scholar API) |
| Dimensionality Reduction | UMAP (768 -> 50D -> 3D) |
| Clustering | Leiden hybrid (citation + bib coupling + similarity) with HDBSCAN fallback |
| Database | PostgreSQL + pgvector (Supabase) |
| Cache | Redis (Upstash) |
| Auth | Supabase Auth (JWT, Google/GitHub OAuth) |
| Deployment | Vercel (frontend), Render (backend) |

## Quick Start

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

## Architecture

```
NL Search -> Paper Selection -> Seed Explore -> S2 refs/cites -> SPECTER2 -> UMAP 3D -> Leiden/HDBSCAN -> 3D Graph
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Health check |
| GET | `/health` | No | Detailed health check |
| POST | `/api/paper-search` | No | NL query -> paper selection list |
| POST | `/api/seed-explore` | No | Seed paper -> full graph (nodes, edges, clusters, gaps, frontier) |
| GET | `/api/papers/by-doi?doi=...` | No | DOI -> S2 paper ID (Crossref fallback) |
| GET | `/api/papers/{id}` | No | Paper detail |
| GET | `/api/papers/{id}/citations` | No | Papers citing this paper |
| GET | `/api/papers/{id}/references` | No | Papers referenced by this paper |
| POST | `/api/papers/{id}/expand` | No | Expand graph (refs + cites) |
| POST | `/api/papers/{id}/expand-stable` | No | Expand with stable 3D positioning |
| GET | `/api/papers/{id}/intents` | No | Citation intent classification |
| GET | `/api/graphs` | Yes | List saved graphs |
| POST | `/api/graphs` | Yes | Save graph |
| GET | `/api/graphs/{id}` | Yes | Load saved graph |
| PUT | `/api/graphs/{id}` | Yes | Update saved graph |
| DELETE | `/api/graphs/{id}` | Yes | Delete saved graph |

## Data Source

**Semantic Scholar** -- paper metadata, SPECTER2 embeddings (768-dim), TLDRs, citation intents, references/citations. Rate-limited to 1 RPS (authenticated). Non-commercial license.

## License

MIT
