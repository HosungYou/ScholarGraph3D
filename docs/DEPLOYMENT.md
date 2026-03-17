# Deployment

ScholarGraph3D is deployed as:

- frontend: Vercel
- backend: Render
- database/auth: Supabase

## Current Deployment Model

This repository is configured for Git-driven deployment.

- pushing `main` to GitHub updates the connected frontend deployment on Vercel
- pushing `main` to GitHub updates the connected backend deployment on Render if the service is linked to this repository

The backend blueprint reference is in:

- `render.yaml`

The frontend Vercel config is in:

- `frontend/vercel.json`

## Required Environment Variables

### Frontend

Set in Vercel project settings:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Important:

- `NEXT_PUBLIC_API_URL` must point to the deployed backend URL
- if it is missing at build time, the frontend falls back to `http://localhost:8000`, which is only valid for local development

### Backend

Set in Render service settings:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_JWT_SECRET`
- `S2_API_KEY`
- `GROQ_API_KEY`
- `REDIS_URL`
- `CORS_ORIGINS`
- `ENVIRONMENT=production`

## Pre-Deploy Verification

Run from the repository root:

```bash
cd frontend && npm run lint
cd frontend && npx tsc --noEmit --incremental false
cd frontend && npm run build
cd backend && ./venv/bin/pytest tests/test_routers/test_recommendation_feedback.py tests/test_routers/test_bookmarks.py tests/test_main_health.py tests/test_routers/test_paper_search.py tests/test_routers/test_graphs.py -q
```

Optional browser regression:

```bash
cd frontend && npx playwright test -c playwright.config.ts
```

## First-Run Database Changes

Recent features require these schema changes:

- `backend/database/006_bookmark_metadata.sql`
- `backend/database/007_recommendation_feedback.sql`

If your production database predates these features, apply those SQL files before expecting:

- resilient saved-paper cards on the dashboard
- persisted recommendation feedback for signed-in users

## Post-Deploy Smoke Checks

Verify these flows in production:

1. landing page loads and topic search returns candidate papers
2. shortlist/compare appears before seed commit
3. `/explore/seed` loads without fatal render errors
4. bookmarking a paper creates a durable saved-paper card
5. recommendation feedback persists after reload for a signed-in user
6. dashboard shows both `Saved Workspaces` and `Saved Papers`
7. backend `/health` returns healthy or degraded JSON instead of failing hard

## Deployment Notes

- the repo contains deterministic review tooling in `frontend/e2e/` and `frontend/scripts/`
- discussion logs and current status live under `Discussion/`
- the latest known state is summarized in `Discussion/CURRENT_STATE.md`
