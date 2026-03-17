# 2026-03-12 Deployment Readiness And Stability

## Phase Goal

Reduce the gap between “reviewable locally” and “safe enough to stage”.

## Problems Addressed

### Health check false failure

The backend declared that some graph features could run without DB, but `/health` still failed hard when the DB was unavailable.

### Missing app-level throttling

Rate-limiter code existed but was not wired to the routes that actually needed it.

### Auto-save duplication

Frontend auto-save kept creating new saved graphs instead of updating the existing one.

### Broken backend test path

The backend virtualenv entrypoints still pointed to an older workspace path and could not be used directly.

## Changes Made

- `/health` now reports degraded memory-only mode instead of returning `503`
- rate limiting was connected to:
  - paper search
  - seed explore
  - seed chat
  - gap report
  - academic report
  - network overview
- frontend auto-save now uses update semantics for an existing saved graph
- backend pytest execution was restored by repairing the expected workspace path

## Verification

Verified during this phase:

- frontend lint
- frontend typecheck
- frontend Playwright review loop
- backend health/rate-limit targeted pytest

## Remaining Limits

This phase improved staging readiness, but did not certify full production readiness.

Remaining unresolved areas included:

- deeper live-provider smoke validation
- intermittent 3D renderer instability
- unfinished product behavior for recommendations and freshness
