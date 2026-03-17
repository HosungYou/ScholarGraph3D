# 2026-03-17 — Deployment Readiness And Release Docs

## Scope

This phase focused on release readiness rather than new product features.

Goals:

- verify production build viability
- verify backend regression coverage on the current branch
- document the deployment path and environment requirements
- prepare the repository for Git-driven deployment

## What Was Verified

- frontend production build passed
- frontend lint passed
- frontend typecheck passed
- backend regression suite passed across:
  - recommendation feedback
  - bookmark metadata
  - health
  - paper search
  - graphs
- Playwright fixture review loop had already been passing on the current branch

## Documentation Added

- `docs/DEPLOYMENT.md`
  - deployment topology
  - required environment variables
  - pre-deploy checks
  - post-deploy smoke tests
  - schema prerequisites for recent features

## Deployment Constraint

Direct Render service actions are still blocked until a Render workspace is explicitly selected in the MCP environment.

That means:

- the codebase is deployment-ready
- Git-driven deployment via push is viable
- direct Render-side service inspection or manual deploy trigger still depends on workspace selection

## Repository Hygiene

- added `output/` to `.gitignore` so review screenshots are not accidentally treated as release artifacts

## Outcome

The repository is now in a state where pushing the release branch to the connected Git remote is the practical deployment path, with deployment prerequisites clearly documented.
