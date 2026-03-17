# 2026-03-14 — Bookmark Lazy Backfill And Search Shortlist

## Scope

This phase covered the next two product loops:

- older bookmark resilience
- shortlist/compare before seed commit

## Decisions

- older bookmarks should be repaired on read instead of remaining permanently degraded
- a one-off backfill script should exist alongside lazy runtime backfill
- search results should no longer behave like immediate commitment cards
- candidate papers need two explicit paths:
  - `Add to shortlist`
  - `Use as seed`

## Implementation

### Bookmark Lazy Backfill

- added lazy metadata enrichment to bookmark reads
- enrichment order:
  - local `papers` table
  - Semantic Scholar provider fallback
- successful enrichment is persisted back into `paper_bookmarks`
- added a standalone backfill script for sparse bookmarks

Files:

- `backend/routers/bookmarks.py`
- `backend/scripts/backfill_bookmark_metadata.py`
- `backend/tests/test_routers/test_bookmarks.py`

### Search Shortlist / Compare

- landing page now keeps a shortlist of up to three candidate papers
- search cards expose explicit actions:
  - `Add to shortlist`
  - `Use as seed`
- shortlist compare tray summarizes selected candidates and highlights:
  - `Most cited`
  - `Most recent`
- shortlist cards provide direct `Use as seed` actions without returning to the result list

File:

- `frontend/app/page.tsx`

## What Was Verified

- frontend lint passed
- frontend typecheck passed
- bookmark tests plus health and paper-search regression tests passed
- Playwright fixture review loop still passed
- live search rendered the shortlist compare tray in a real browser session

Artifacts:

- `output/playwright/landing-shortlist-compare.png`

## Product Feedback

This materially improves the research workflow.

Before this phase:

- search results still pushed users toward immediate commitment
- older bookmarks could decay into weak dashboard cards

After this phase:

- search supports tentative comparison before commitment
- saved-paper cards have a repair path even for older sparse records

## Remaining Next Step

The next strongest product improvement is recommendation persistence:

- save relevance feedback server-side
- use it in ranking and dashboard recovery surfaces
