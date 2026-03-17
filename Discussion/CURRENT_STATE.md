# Current State

Last updated: March 17, 2026

## Verified Working

- deterministic review fixtures
- `/review` entry page
- Playwright fixture review loop
- Playwright CLI browser-control path
- expand preview and expand result summary
- auto-save updates existing saved graphs instead of duplicating them
- `/health` returns `200` with `degraded` status in memory-only mode
- app-level rate limiting is wired into high-cost endpoints
- backend pytest path is usable again in the current workspace
- live smoke Playwright path exists and is opt-in through `PLAYWRIGHT_LIVE_PAPER_ID`
- `Gap`, `Ask`, and `Report` panels show a clearer next step before dense detail
- recommendation feedback can now be captured in-browser and reused to bias suggested next papers
- landing now defaults to topic search instead of DOI-first lookup
- topic search results are richer seed-decision cards with abstract, venue, field, and seed-fit cues
- seed workspaces now expose branching actions for reading list, gaps, and topic brief before graph mechanics
- report entry is now purpose-first (`Topic Brief`, `Related Work`, `Gap Memo`) with exports as secondary
- Supabase-backed dashboard auth has been verified with a real test user
- the dashboard now exposes both `Saved Workspaces` and `Saved Papers`
- authenticated dashboard screenshots have been captured from a real browser session
- local development CORS now supports the actual review pairing of `127.0.0.1:3100` and `localhost/127.0.0.1:8000`
- bookmarks now store paper display metadata and the dashboard renders saved-paper cards from stored data first
- the seeded dashboard account has a realistic saved-paper card with title, venue, year, authors, and citation count
- older bookmarks now have a lazy metadata backfill path on read
- landing search now supports shortlist/compare before committing to a seed
- signed-in recommendation feedback now has a database-backed persistence path
- frontend production build is passing on the current branch
- deployment topology and smoke checks are documented in `docs/DEPLOYMENT.md`

## Verified Commands

- `cd frontend && npm run lint`
- `cd frontend && npx tsc --noEmit --incremental false`
- `cd frontend && npx playwright test -c playwright.config.ts`
- `cd backend && ./venv/bin/pytest tests/test_routers/test_recommendation_feedback.py tests/test_routers/test_bookmarks.py tests/test_main_health.py tests/test_routers/test_paper_search.py -q`
- `backend/venv/bin/pytest backend/tests/test_main_health.py backend/tests/test_routers/test_paper_search.py -q`
- `/auth -> /dashboard` verified in a Playwright CLI browser session
- `backend/venv/bin/pytest tests/test_routers/test_bookmarks.py tests/test_main_health.py tests/test_routers/test_paper_search.py -q`
- `cd frontend && npx playwright test -c playwright.config.ts`

## Current Risks

- the 3D visualization is more resilient, but the root cause of intermittent render failures is not yet fully eliminated
- live-provider smoke verification still depends on reachable external APIs and a running backend
- older bookmarks can now recover on read, but a full one-time backfill still depends on running the script against production data
- the product still contains more graph vocabulary than a typical user needs
- recommendations now persist for signed-in users, but ranking is still local to the paper detail surface rather than a wider product signal
- direct Render-side deploy actions still depend on selecting the correct workspace in the MCP environment

## Current Product Direction

ScholarGraph3D is being repositioned away from “3D graph demo” and toward:

- academic discovery workspace
- research insight extraction tool

The graph remains important, but it is no longer treated as the whole product.

## Recommended Next Loop

1. push the release branch to the connected remote or trigger the connected deployment service
2. capture one more narrow/mobile dashboard and workflow review path
3. run the bookmark backfill script against the full target dataset when ready
4. promote persisted recommendation feedback into broader ranking and dashboard recovery surfaces
