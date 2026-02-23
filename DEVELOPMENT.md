# ScholarGraph3D - Development Guide

Quick reference for setting up and working on ScholarGraph3D v3.0 locally.

## Local Development Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL with pgvector
- Redis (optional, graceful no-op if unavailable)

### Option 1: Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# Verify services
docker-compose ps
```

Services available:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Redis: localhost:6379

### Option 2: Manual Setup

#### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env
# Edit .env with your API keys and database URL

# Run database migrations (raw SQL)
psql $DATABASE_URL < database/migrations/003_seed_graphs.sql

# Start server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Setup environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase and API URLs

# Start dev server
npm run dev
```

Access at http://localhost:3000

## Environment Variables

### Backend (.env)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/scholargraph3d
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret

# API Keys
S2_API_KEY=your-semantic-scholar-key
GROQ_API_KEY=your-groq-api-key

# Cache
REDIS_URL=redis://localhost:6379

# CORS
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Common Commands

### Backend

```bash
# Format code
black .

# Lint
pylint backend/

# Type checking
mypy backend/

# Tests (with coverage)
cd backend && pytest -v --cov=. --cov-report=term-missing
```

### Frontend

```bash
# Format / lint
npm run lint

# Type check
npm run type-check

# Build
npm run build

# Test
cd frontend && npx jest

# Start production build
npm start
```

## Database Setup

### Supabase PostgreSQL + pgvector

1. Create Supabase project at https://supabase.com
2. Enable pgvector extension in SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Run schema migrations from `database/migrations/`:
   ```bash
   psql $DATABASE_URL < database/migrations/003_seed_graphs.sql
   ```

### Local PostgreSQL

```bash
# Install PostgreSQL (Mac)
brew install postgresql@15

# Start service
brew services start postgresql@15

# Create database
createdb scholargraph3d

# Install pgvector
# Clone: https://github.com/pgvector/pgvector
# Follow installation instructions

# Run migrations
psql scholargraph3d < database/migrations/003_seed_graphs.sql
```

## API Documentation

Interactive Swagger UI: http://localhost:8000/api/docs

### Paper Search

```bash
curl -X POST http://localhost:8000/api/paper-search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "transformer architectures for vision tasks",
    "limit": 10
  }'
```

### Seed Explore

```bash
curl -X POST http://localhost:8000/api/seed-explore \
  -H "Content-Type: application/json" \
  -d '{
    "paper_id": "204e3073870fae3d05bcbc2f6a8e263d9b72e776",
    "depth": 2,
    "max_papers": 150
  }'
```

Response: `{ nodes, edges, clusters, gaps, frontier_ids, meta }`

### Expand Node

```bash
curl -X POST http://localhost:8000/api/papers/{id}/expand-stable \
  -H "Content-Type: application/json" \
  -d '{ "existing_positions": {} }'
```

### Citation Intents

```bash
curl http://localhost:8000/api/papers/{id}/intents
```

### Seed Chat

```bash
curl -X POST http://localhost:8000/api/seed-chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the main research gaps in this graph?",
    "graph_context": { "nodes": [], "clusters": [] }
  }'
```

### Saved Graphs (auth required)

```bash
# List
curl -H "Authorization: Bearer <jwt>" http://localhost:8000/api/graphs

# Save
curl -X POST -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "My Graph", "graph_data": {...} }' \
  http://localhost:8000/api/graphs

# Load
curl -H "Authorization: Bearer <jwt>" http://localhost:8000/api/graphs/{id}

# Delete
curl -X DELETE -H "Authorization: Bearer <jwt>" http://localhost:8000/api/graphs/{id}
```

## Project Structure

```
ScholarGraph3D/
├── README.md              # Project overview
├── AGENTS.md              # Architecture guide (detailed)
├── DEVELOPMENT.md         # This file (quick reference)
├── LICENSE                # MIT license
├── docker-compose.yml     # Local dev stack
├── .env.example           # Environment template
├── .gitignore             # Git exclusions
│
├── backend/               # FastAPI application
│   ├── main.py            # App entry point (registers 5 routers)
│   ├── config.py          # Pydantic Settings (env vars)
│   ├── database.py        # asyncpg connection pool
│   ├── cache.py           # Redis helpers (graceful no-op if unavailable)
│   ├── auth/              # Supabase JWT auth
│   ├── middleware/        # Analytics + rate limiter
│   ├── integrations/      # S2 API client + CrossRef DOI lookup
│   ├── graph/             # Embedding, UMAP, HDBSCAN, gap detection
│   ├── llm/               # Groq provider (llama-3.3-70b)
│   ├── services/          # Citation intent classification
│   ├── routers/           # API endpoints (papers, graphs, seed_explore, paper_search, seed_chat)
│   ├── database/
│   │   └── migrations/    # Raw SQL migrations (003_seed_graphs.sql)
│   └── requirements.txt   # Python dependencies
│
└── frontend/              # Next.js application
    ├── app/               # App Router pages (/, /explore/seed, /auth, /dashboard)
    ├── components/        # React components (cosmic/, graph/, auth/, dashboard/)
    ├── hooks/             # useGraphStore (Zustand)
    ├── lib/               # api.ts, auth-context.tsx, supabase.ts, utils.ts, export.ts
    ├── types/             # TypeScript definitions (Paper, GraphData, StructuralGap, etc.)
    ├── __tests__/         # Jest test suite
    ├── jest.config.js     # Jest configuration
    ├── package.json       # Node dependencies
    └── tailwind.config.ts # Tailwind configuration (Stellar Observatory design system)
```

## Deployment

### Frontend (Vercel)

1. Push to GitHub
2. Connect repo in Vercel dashboard
3. Set environment variables in Vercel:
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy from main branch

### Backend (Render)

1. Push to GitHub
2. Create Web Service on Render
3. Connect GitHub repo
4. Set environment variables:
   - `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`
   - `S2_API_KEY`, `GROQ_API_KEY`
   - `REDIS_URL`, `FRONTEND_URL`, `CORS_ORIGINS`
5. Deploy

See `backend/render.yaml` for Render configuration.

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :8000    # Backend
lsof -i :3000    # Frontend

# Kill process
kill -9 <PID>
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql $DATABASE_URL

# Verify pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### API Key Issues

- Verify all required keys in `.env` (backend) and `.env.local` (frontend)
- Semantic Scholar API key: https://api.semanticscholar.org
- Groq API key: https://console.groq.com

### Redis Connection

```bash
# Test Redis connection
redis-cli ping  # Should return PONG
# Redis is optional — backend degrades gracefully if unavailable
```

## Performance Tips

1. **Pipeline parallelization**: `seed-explore` fetches refs and cites concurrently via `asyncio.gather`
2. **Redis caching**: 24-hour cache on S2 references, citations, and SPECTER2 embeddings; keyed by paper ID
3. **Incremental layout**: `expand-stable` uses k-NN position interpolation so new nodes appear near their neighbors without re-running UMAP
4. **Partial S2 failures**: refs/cites fetched independently — if S2 returns `{"data": null}` for an unindexed paper, available data is returned rather than a 404
5. **Lazy load panels**: Paper detail panel only renders on node click
6. **Code splitting**: Frontend auto-splits routes via Next.js App Router
7. **DB pool**: min=1, max=3 asyncpg connections (single uvicorn worker, async concurrency)

## Testing

### Backend

```bash
# Run all tests with coverage
cd backend && pytest -v --cov=. --cov-report=term-missing

# Run specific test file
pytest tests/test_seed_explore.py -v
```

### Frontend

```bash
# Run all tests
cd frontend && npx jest

# Watch mode
npx jest --watch

# With coverage
npx jest --coverage
```

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes following code conventions
3. Run tests and linters
4. Commit with clear message: `git commit -m "feat: add X"`
5. Push and open pull request

## Resources

- **Semantic Scholar API**: https://api.semanticscholar.org
- **Groq Console**: https://console.groq.com
- **Supabase Docs**: https://supabase.com/docs
- **FastAPI**: https://fastapi.tiangolo.com
- **Next.js**: https://nextjs.org
- **react-force-graph-3d**: https://github.com/vasturiano/react-force-graph-3d
- **pgvector**: https://github.com/pgvector/pgvector

## Questions?

Refer to `AGENTS.md` for detailed architecture, data models, and API contracts. See `docs/` for PRD, SPEC, and release notes.

---

Last updated: 2026-02-23
