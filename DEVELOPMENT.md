# ScholarGraph3D - Development Guide

Quick reference for setting up and working on ScholarGraph3D locally.

## Local Development Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL with pgvector
- Redis (optional, for caching)

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
cp ../.env.example .env
# Edit .env with your API keys and database URL

# Run database migrations
python -m alembic upgrade head

# Start server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
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
OA_API_KEY=your-openalex-api-key
OA_EMAIL=your@email.com
S2_API_KEY=your-semantic-scholar-key  # Optional

# Cache
REDIS_URL=redis://localhost:6379

# Frontend
FRONTEND_URL=http://localhost:3000
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

# Tests
pytest

# Run migrations
alembic upgrade head
alembic downgrade -1  # Rollback one migration
```

### Frontend

```bash
# Format code
npm run lint

# Type check
npm run type-check

# Build
npm run build

# Test
npm run test

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
3. Run schema migrations from `backend/database/001_initial_schema.sql`

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
psql scholargraph3d < backend/database/001_initial_schema.sql
```

## API Documentation

### Search Endpoint

```bash
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning",
    "limit": 100,
    "year_range": [2020, 2024],
    "fields": ["Computer Science"]
  }'
```

Response includes nodes, edges, clusters, and metadata.

See `/api/docs` for interactive API docs (Swagger UI).

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
│   ├── main.py           # App entry point
│   ├── config.py         # Settings
│   ├── database.py       # DB connection pool
│   ├── database/         # Schema migrations
│   ├── integrations/     # API clients (S2, OpenAlex)
│   ├── graph/            # Embedding, clustering, similarity
│   ├── routers/          # API endpoints
│   ├── auth/             # Supabase auth
│   └── requirements.txt   # Python dependencies
│
└── frontend/              # Next.js application
    ├── app/              # App Router pages
    ├── components/       # React components
    ├── lib/              # Utilities (auth, API, store)
    ├── hooks/            # Custom React hooks
    ├── types/            # TypeScript definitions
    ├── package.json      # Node dependencies
    └── tailwind.config.ts # Tailwind configuration
```

## Deployment

### Frontend (Vercel)

1. Push to GitHub
2. Connect repo in Vercel dashboard
3. Set environment variables in Vercel
4. Deploy from main branch

### Backend (Render)

1. Push to GitHub
2. Create Web Service on Render
3. Connect GitHub repo
4. Set environment variables
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
SELECT * FROM pg_extension;
```

### API Key Issues

- Verify all required keys in `.env` (Backend) and `.env.local` (Frontend)
- Check OpenAlex API key at https://openalex.org/signup
- Check Semantic Scholar API at https://api.semanticscholar.org

### Redis Connection

```bash
# Test Redis connection
redis-cli ping  # Should return PONG
```

## Performance Tips

1. **Cache search results**: 24-hour Redis cache on `POST /api/search`
2. **Batch API calls**: Request multiple papers at once from S2 and OpenAlex
3. **Lazy load panels**: Don't render paper detail panel until clicked
4. **Code splitting**: Frontend auto-splits routes via Next.js
5. **Database indexing**: Index frequently queried columns in PostgreSQL

## Testing

### Backend

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=backend

# Run specific test
pytest tests/test_search.py::test_search_endpoint
```

### Frontend

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch

# With coverage
npm test -- --coverage
```

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes following code conventions
3. Run tests and linters
4. Commit with clear message: `git commit -m "feat: add X"`
5. Push and open pull request

## Resources

- **OpenAlex API**: https://openalex.org/about/api
- **Semantic Scholar API**: https://api.semanticscholar.org
- **Supabase Docs**: https://supabase.com/docs
- **FastAPI**: https://fastapi.tiangolo.com
- **Next.js**: https://nextjs.org
- **react-force-graph-3d**: https://github.com/vasturiano/react-force-graph-3d

## Questions?

Refer to AGENTS.md for detailed architecture, data models, and API contracts.

---

Last updated: 2026-02-19
