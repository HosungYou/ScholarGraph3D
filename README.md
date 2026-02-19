# ScholarGraph3D

> Explore the universe of academic papers in 3D

ScholarGraph3D is a literature discovery platform that visualizes academic papers as an interactive 3D knowledge graph. Search by keyword and instantly see how papers relate through citations and semantic similarity.

## Features

- **3D Paper Graph**: SPECTER2 embeddings → UMAP → interactive 3D visualization
- **Multi-Source Data**: OpenAlex (CC0) + Semantic Scholar for comprehensive coverage
- **Auto-Clustering**: HDBSCAN detects research communities, labeled with OpenAlex Topics
- **Citation Expansion**: Double-click any paper to explore its citation network
- **Graph Saving**: Save and revisit your exploration sessions
- **AI Analysis** (Premium): GraphRAG chat, trend analysis, gap detection

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, react-force-graph-3d, Three.js |
| Backend | FastAPI, Python 3.11 |
| Database | PostgreSQL + pgvector (Supabase) |
| Cache | Redis (Upstash) |
| Auth | Supabase Auth |
| Deployment | Vercel (frontend) + Render (backend) |

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL with pgvector extension

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env  # Edit with your keys
uvicorn main:app --reload
```

### Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env.local  # Edit with your keys
npm run dev
```

### Environment Variables
See `.env.example` for all required variables.

## Architecture

```
User Search → OpenAlex + S2 APIs → SPECTER2 Embeddings → UMAP 3D → HDBSCAN Clusters → react-force-graph-3d
```

## Data Sources

- **OpenAlex** (CC0): Primary source for paper metadata, topics, open access info
- **Semantic Scholar**: SPECTER2 embeddings, TLDRs, citation intents

## License

MIT
