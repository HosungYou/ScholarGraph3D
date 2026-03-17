# 2026-03-13 — Bookmark Metadata And Dashboard Resilience

## Scope

This phase made saved-paper rendering resilient by removing the dashboard's dependence on live paper-detail lookups.

Goals:

- store paper display metadata when a bookmark is created
- render saved-paper cards from stored metadata first
- reduce dashboard runtime noise caused by provider misses or stale ids
- backfill the seeded test user's bookmark so the authenticated dashboard becomes a realistic review surface

## Decisions

- bookmarks should be durable records, not just `paper_id` pointers
- dashboard rendering should use stored bookmark metadata as the primary source
- live provider enrichment is optional and should not be required for the dashboard to feel complete
- the right fix is schema + API + frontend together, not more retry logic

## Implementation

### Backend

- added bookmark metadata fields:
  - `paper_title`
  - `paper_authors`
  - `paper_year`
  - `paper_venue`
  - `paper_citation_count`
- updated bookmark create/list/get/update responses to include those fields
- added SQL migration file:
  - `backend/database/006_bookmark_metadata.sql`

Files:

- `backend/routers/bookmarks.py`
- `backend/database/006_bookmark_metadata.sql`

### Frontend

- extended the `Bookmark` type with stored paper metadata
- updated bookmark creation from the paper detail panel to persist current paper display data
- changed the dashboard saved-papers column to render entirely from bookmark metadata
- removed the dashboard dependency on `GET /api/papers/{paper_id}` for normal card rendering

Files:

- `frontend/types/index.ts`
- `frontend/lib/api.ts`
- `frontend/components/graph/PaperDetailPanel.tsx`
- `frontend/components/dashboard/SavedBookmarks.tsx`

### Live Data Backfill

- applied the bookmark metadata schema change to the current project database
- backfilled the seeded dashboard bookmark with a real display snapshot:
  - title: `Attention Is All You Need`
  - venue: `NeurIPS`
  - year: `2017`
  - citations: `50000`
  - paper id: `DOI:10.48550/arXiv.1706.03762`

## What Was Verified

- frontend lint passed
- frontend typecheck passed
- bookmark router tests passed
- health and paper-search regression tests still passed
- authenticated dashboard screenshot now shows a fully populated saved-paper card

Artifacts:

- `output/playwright/dashboard-authenticated-v3.png`

## Findings

### Product Improvement

The dashboard now feels materially more credible for returning users:

- saved workspace cards resume exploration state
- saved paper cards preserve the paper context even if providers are unavailable later

### Remaining Issue

The Playwright browser session still reports a large error count because that session accumulated old runtime errors from earlier broken states. The current visual state is the reliable signal here; a fresh browser session would be needed for a clean console baseline.

## Next Recommended Step

Apply the same durability principle to more user-facing entities:

- shortlist candidates before seed commit
- saved reading lists
- alert subscriptions
- recommendation feedback persistence beyond local storage
