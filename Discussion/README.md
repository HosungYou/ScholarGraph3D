# Discussion

This folder is now organized around chronological decision logging.

The canonical reading order is:

1. `README.md` — folder structure and index
2. `CURRENT_STATE.md` — current status snapshot
3. dated timeline logs in ascending order
4. any consolidated summary documents after that

## Canonical Structure

- `CURRENT_STATE.md`
  - current verified state
  - open risks
  - next recommended loop
- dated timeline logs
  - one file per major phase
  - ordered by real execution date
  - scoped to what changed during that phase
- consolidated summary docs
  - useful for quick review
  - not the canonical source of temporal ordering

## Chronological Index

### 2026-03-11

1. [2026-03-11-01-initial-review-and-product-direction.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-11-01-initial-review-and-product-direction.md)
   - initial code/product review
   - product direction
   - information architecture
   - data strategy

2. [2026-03-11-02-review-automation-and-fixture-loop.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-11-02-review-automation-and-fixture-loop.md)
   - deterministic review mode
   - Playwright loop
   - fixture generation
   - discussion logging bootstrap

### 2026-03-12

3. [2026-03-12-01-browser-review-and-expand-ux.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-12-01-browser-review-and-expand-ux.md)
   - real browser review with Playwright CLI
   - expand UX cleanup
   - before/after explanation model

4. [2026-03-12-02-deployment-readiness-and-stability.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-12-02-deployment-readiness-and-stability.md)
   - deployment-readiness fixes
   - health degradation model
   - rate limiting
   - auto-save duplication fix
   - backend test-path recovery

5. [2026-03-12-03-usability-reduction-and-live-smoke.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-12-03-usability-reduction-and-live-smoke.md)
   - interaction reduction
   - 3D stabilization work
   - live smoke path
   - remaining frontend usability critique

6. [2026-03-12-04-panel-density-and-feedback-loop.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-12-04-panel-density-and-feedback-loop.md)
   - panel hierarchy cleanup
   - recommendation feedback loop
   - reduced gap density
   - report/chat framing cleanup

7. [2026-03-12-05-search-first-and-workflow-branching.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-12-05-search-first-and-workflow-branching.md)
   - topic-search-first landing
   - richer seed selection cards
   - post-seed workflow branching
   - purpose-based report entry
   - primary jargon reduction

### 2026-03-13

8. [2026-03-13-01-dashboard-auth-and-runtime-review.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-13-01-dashboard-auth-and-runtime-review.md)
   - Supabase test-user creation
   - dashboard auth verification
   - saved workspaces plus saved papers visual review
   - local development CORS fix
   - bookmark fallback cleanup

9. [2026-03-13-02-bookmark-metadata-and-dashboard-resilience.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-13-02-bookmark-metadata-and-dashboard-resilience.md)
   - bookmark metadata storage
   - dashboard saved-paper resilience
   - live bookmark backfill
   - authenticated dashboard screenshot with complete paper card

### 2026-03-14

10. [2026-03-14-01-bookmark-lazy-backfill-and-search-shortlist.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-14-01-bookmark-lazy-backfill-and-search-shortlist.md)
   - bookmark lazy backfill on read
   - standalone bookmark backfill script
   - shortlist/compare before seed commit
   - live browser verification of shortlist compare state

### 2026-03-16

11. [2026-03-16-01-recommendation-feedback-persistence.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-16-01-recommendation-feedback-persistence.md)
   - recommendation feedback schema and API
   - persisted feedback for signed-in users
   - local-to-server sync path
   - live DB schema verification

### 2026-03-17

12. [2026-03-17-01-deployment-readiness-and-release-docs.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-17-01-deployment-readiness-and-release-docs.md)
   - production build verification
   - backend release-readiness regression checks
   - deployment documentation
   - Git-driven deployment readiness

## Consolidated Summary

- [2026-03-11-review-loop-and-product-decisions.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/2026-03-11-review-loop-and-product-decisions.md)
  - legacy consolidated summary spanning work completed on March 11-12, 2026
  - useful as a compact overview
  - not the canonical time-ordered source

## Logging Rules Going Forward

- write logs in the actual execution date they happened
- split new phases into new dated files instead of appending everything to one summary
- keep `CURRENT_STATE.md` updated after each meaningful loop
- preserve consolidated summaries, but treat them as secondary views
