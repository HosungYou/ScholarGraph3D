# 2026-03-16 — Recommendation Feedback Persistence

## Scope

This phase moved recommendation feedback from browser-local storage toward durable account-backed storage.

Goals:

- add a database table for recommendation feedback
- expose authenticated CRUD endpoints
- connect the paper detail recommendation UI to server persistence
- keep anonymous/local fallback behavior

## Implementation

### Backend

- added the `recommendation_feedback` table schema
- added authenticated endpoints for:
  - list by `source_paper_id`
  - upsert feedback
  - delete feedback
- wired the new router into the FastAPI app

Files:

- `backend/database/007_recommendation_feedback.sql`
- `backend/routers/recommendation_feedback.py`
- `backend/main.py`
- `backend/tests/test_routers/test_recommendation_feedback.py`

### Frontend

- added `RecommendationFeedback` type and API client methods
- updated `PaperDetailPanel` to:
  - load server feedback for signed-in users
  - sync old local feedback forward when possible
  - fall back to local-only storage for anonymous users
  - use the persisted feedback in recommendation ranking

Files:

- `frontend/types/index.ts`
- `frontend/lib/api.ts`
- `frontend/components/graph/PaperDetailPanel.tsx`

## Verification

- frontend lint passed
- frontend typecheck passed
- backend tests passed for:
  - recommendation feedback
  - bookmark metadata
  - health
  - paper search
- the live project database now contains the `recommendation_feedback` table

## Outcome

Recommendation feedback is no longer just an in-browser preference. Logged-in users now have a persistence path that can support future ranking and dashboard recovery behavior.
