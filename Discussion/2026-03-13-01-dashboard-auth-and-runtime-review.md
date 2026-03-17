# 2026-03-13 — Dashboard Auth And Runtime Review

## Scope

This phase focused on the authenticated dashboard path rather than the seed workspace.

Goals:

- create a reusable Supabase-backed test user
- seed saved data for visual review
- verify `/auth -> /dashboard` in a real browser session
- identify runtime issues blocking saved content display
- improve the dashboard fallback behavior for incomplete bookmark metadata

## Decisions

- `seed workspace` is the `/explore/seed` working canvas, not the dashboard
- the dashboard must show both saved workspaces and saved papers if it is meant to feel useful to a returning researcher
- dashboard verification has to be done with real auth and real browser state, not just code inspection
- development CORS has to explicitly allow the local dev pairing used in practice:
  - frontend on `127.0.0.1:3100`
  - backend on `localhost:8000` or `127.0.0.1:8000`

## Implementation

### Auth + Seed Data

- created a Supabase test user through the service-role admin API
- verified public password sign-in works for that account
- seeded one saved graph and one bookmark for dashboard review

Seeded user:

- email: `sg3d.test.1773362045432@example.com`

Seeded content:

- workspace: `Transformer starter workspace`
- bookmark memo: `Sample saved paper for dashboard and bookmark UX review.`

### Dashboard UI

- added a `Saved Papers` column to the dashboard
- wired bookmark cards to `api.getBookmarks()` plus detail fetches via `api.getPaperDetails()`
- changed missing-detail bookmark fallback from raw `paper_id` title to `Saved paper`
- left the raw `paper_id` as secondary metadata instead of the primary heading
- disabled retry spam for missing paper-detail fetches in the dashboard bookmark cards

### Runtime Fix

- fixed development CORS in the backend so the actual local pairing works:
  - `http://localhost:3100`
  - `http://127.0.0.1:3100`
  - `http://127.0.0.1:8000`

## What Was Verified

- browser login through `/auth`
- authenticated navigation to `/dashboard`
- saved workspace card visible in browser
- saved paper card visible in browser
- full-page dashboard screenshot captured
- frontend lint passed
- frontend typecheck passed

Artifacts:

- `output/playwright/dashboard-authenticated.png`
- `output/playwright/dashboard-authenticated-v2.png`

## Findings

### Good

- the dashboard now reads more like a returning-user surface instead of a thin graph launcher
- side-by-side `Saved Workspaces` and `Saved Papers` is materially better for research workflows
- the seeded data is enough to visually review card hierarchy and information density

### Remaining Problems

- bookmark detail cards still depend on `GET /api/papers/{paper_id}` being resolvable against live providers
- synthetic or stale paper ids produce backend 404s, and provider failures can still generate console noise
- the dashboard is useful now, but it still lacks:
  - collections
  - reading-list status
  - last-opened / continue cues
  - saved search or alert surfaces

## Product Feedback

From a researcher perspective, the dashboard is now understandable, but it is still an early workspace home rather than a full library.

The strongest part is the split:

- left: resume explorations
- right: recover interesting papers

The weakest part is that saved papers still depend too much on provider resolution at read time. A resilient dashboard should render from stored bookmark metadata first and treat live provider enrichment as optional.
