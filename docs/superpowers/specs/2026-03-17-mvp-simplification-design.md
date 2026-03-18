# ScholarGraph3D MVP Simplification — v4.0.0

> Date: 2026-03-17
> Status: Approved
> Approach: Top-Down removal (frontend → backend → cleanup)

## Goal

Strip ScholarGraph3D down to its core workflow:

**Search → Seed → Explore (with Gap Spotter) → Save**

Remove all features that do not directly serve this flow. Fix version chaos, rewrite stale documentation, add CI/CD, and split god files.

## What Stays

| Feature | Files |
|---------|-------|
| Landing search (Topic Search + DOI) | `frontend/app/page.tsx` (simplified, no shortlist) |
| Seed Explore + 3D visualization | `frontend/app/explore/seed/page.tsx`, `ScholarGraph3D.tsx` |
| Clustering (Leiden hybrid + HDBSCAN fallback) | `backend/graph/clusterer.py` |
| Gap Spotter (3-dim scoring) | `backend/graph/gap_detector.py` (simplified), `GapSpotterPanel.tsx` |
| Cluster Panel | `frontend/components/graph/ClusterPanel.tsx` |
| Paper Detail Panel | `frontend/components/graph/PaperDetailPanel.tsx` |
| Graph Save/Load + Auth | `backend/routers/graphs.py`, `backend/auth/`, Dashboard |
| Cosmic Theme / 3D rendering | `cosmic/` directory, star/nebula renderers |
| Citation Path Finder | BFS in `lib/utils.ts`, display in PaperDetailPanel |

## What Gets Removed

### Frontend — Components

| Component | File | Reason |
|-----------|------|--------|
| SeedChatPanel | `components/graph/SeedChatPanel.tsx` | LLM dependency, not core |
| AcademicAnalysisPanel | `components/graph/AcademicAnalysisPanel.tsx` | APA report, not core |
| GapReportView | `components/graph/GapReportView.tsx` | LLM report generation, not core |
| SavedBookmarks | `components/dashboard/SavedBookmarks.tsx` | Bookmarks feature removed |

### Frontend — Pages/Scripts

| Target | Path |
|--------|------|
| Review page | `app/review/` directory |
| Review fixtures | `lib/review-fixtures.ts` |
| Review E2E | `e2e/review-mode.spec.ts` |
| Review scripts | `scripts/generate-live-review-fixture.mjs`, `scripts/run-review-loop.*` |

### Frontend — Logic Removal (in kept files)

| File | Remove |
|------|--------|
| `explore/seed/page.tsx` | chat tab, academic tab, gap report view, multi-seed merge button, review fixture logic |
| `page.tsx` (landing) | shortlist/compare logic (`shortlistedPaperIds`, compare panel, `toggleShortlist`, `getShortlistRole`, `mostCitedShortlist`, `mostRecentShortlist`) |
| `ScholarGraph3D.tsx` | `edgeVisMode` rendering branches, `nodeSizeMode` branches, `layoutMode` toggle, second-seed teal ring rendering |
| `GraphControls.tsx` | `edgeVisMode` dropdown, `nodeSizeMode` dropdown, `layoutMode` dropdown |
| `PaperDetailPanel.tsx` | "ADD AS SECOND SEED" button, all bookmark logic (state, fetch, editor UI) |
| `GraphLegend.tsx` | Mode-responsive legend sections for removed modes |
| `useGraphStore.ts` | Narrow `activeTab` type from `'clusters' \| 'gaps' \| 'chat' \| 'academic'` to `'clusters' \| 'gaps'` |

### Frontend — Zustand Store (`useGraphStore.ts`)

Remove state slices:
- `activeGapReport`, `gapReportLoading`
- `academicReport`, `academicReportLoading`, `networkOverview`
- `nodeSizeMode`, `layoutMode`, `edgeVisMode`
- `secondSeedIds`, `addSeedMerging`, `gapRefreshNeeded`

### Frontend — Types (`types/index.ts`)

Remove types:
- `GapReport`, `GapReportSection`, `GapReportQuestion`
- `GapActionability` (orphaned after removing `actionability` from `StructuralGap`)
- `AcademicReport`, `AcademicReportTable`, `NetworkOverview`
- `NetworkLevelMetrics`, `NodeCentrality`, `CommunityMetrics`, `StructuralHolesNode`, `NetworkMetrics`
- `RecommendationFeedback`, `ChatAction`
- `Bookmark` (and related bookmark types)

Rewrite types (not delete):
- `GapScoreBreakdown` — rewrite to 3-dim model: `structural`, `relatedness`, `temporal`, `composite` (remove `intent`, `directional`, `structural_holes`)
- `EvidenceDetail` — keep `actual_edges`, `max_possible_edges`, `centroid_similarity`, `total_year_span`; remove `methodology_ratio`, `background_ratio`, `citations_a_to_b`, `citations_b_to_a`
- `StructuralGap` — remove `intent_summary`, `actionability` fields

Remove from `Paper` type:
- `pagerank`, `betweenness` fields (SNA metrics removed; will always be 0/undefined)

### Frontend — API Client (`lib/api.ts`)

Remove methods:
- `seedChat()` / `sendChatMessage()`
- `generateGapReport()`
- `generateAcademicReport()` / `getNetworkOverview()`
- `addPaperAsSeed()`
- Bookmark CRUD methods
- Recommendation feedback methods

### Backend — Routers (4 deleted)

| Router | File |
|--------|------|
| seed_chat | `routers/seed_chat.py` |
| gap_report | `routers/gap_report.py` |
| academic_report | `routers/academic_report.py` |
| recommendation_feedback | `routers/recommendation_feedback.py` |

Also delete: `routers/bookmarks.py`

### Backend — Services/Modules

| Module | File(s) | Reason |
|--------|---------|--------|
| LLM layer | `llm/base.py`, `llm/groq_provider.py`, `llm/__init__.py` | No LLM consumers remain |
| Gap Report service | `services/gap_report_service.py` | Gap Report removed |
| Academic Report service | `services/academic_report_service.py` | Academic Report removed |
| Citation Intent service | `services/citation_intent.py` | Keep file but remove `enhance_intents_with_llm()` method (LLM-dependent). `get_basic_intents()` is still used by `routers/papers.py` and `routers/seed_explore.py` |
| Network Metrics | `graph/network_metrics.py` | Full SNA removed |

### Backend — Gap Detector Simplification

Current: 6-dim scoring (1,220 lines)
```
structural(0.25) + relatedness(0.25) + temporal(0.15) + intent(0.10) + directional(0.10) + structural_holes(0.15)
```

New: 3-dim scoring (~400 lines)
```
structural(0.40) + relatedness(0.35) + temporal(0.25)
```

Remove:
- `_compute_intent_score()`
- `_compute_directional_score()`
- `_compute_structural_holes_score()`
- `evidence_detail` intent/directional fields (`methodology_ratio`, `background_ratio`, `citations_a_to_b`, `citations_b_to_a`)

Keep:
- `_compute_structural_score()` — actual vs possible inter-cluster edges
- `_compute_relatedness_score()` — cosine similarity based
- `_compute_temporal_score()` — year gap based
- Bridge paper detection
- `_generate_grounded_questions()` — heuristic research questions (cluster-label based, no LLM; was mislabeled as LLM-based in earlier draft)

### Backend — seed_explore.py Simplification

- Remove SNA metrics calls (`compute_node_lightweight`, `compute_all`)
- Remove sequential intent fetch (was for Gap Report)
- Replace PageRank-weighted centroid with arithmetic mean (update `Cluster.centroid` comment in types)

### Backend — Dependencies to Remove (`requirements.txt`)

| Package | Reason |
|---------|--------|
| `networkx` | SNA metrics removed (`network_metrics.py`) + structural holes removed from `gap_detector.py` |
| `openai` | Groq provider dependency |
| `groq` | Sole consumer `llm/groq_provider.py` deleted |

Keep: `leidenalg`, `python-igraph` (clustering), `umap-learn`, `hdbscan`, `scikit-learn`

### Backend — DB/Scripts

- Delete `database/007_recommendation_feedback.sql`
- Delete `scripts/backfill_bookmark_metadata.py`
- Delete `scripts/generate_review_fixture.py`

### Backend — main.py

- Remove 5 router imports/includes (seed_chat, gap_report, academic_report, recommendation_feedback, bookmarks)
- Remove `enhanced` intents code path from `routers/papers.py` (conditional import from deleted `llm/` directory)
- Keep UMAP warm-up
- Update version to "4.0.0"

## God File Splitting

### ScholarGraph3D.tsx (post-removal ~1,800 lines → 4 files)

| New File | Responsibility | ~Lines |
|----------|---------------|--------|
| `ScholarGraph3D.tsx` | Main component — ForceGraph3D, props, top-level structure | ~500 |
| `useGraphInteractions.ts` | Click/hover/expand handlers, camera focus | ~300 |
| `useGraphRenderer.ts` | nodeThreeObject, linkThreeObject, custom rendering | ~400 |
| `graphEffects.ts` | useEffects — scene updates on data change, cleanup | ~300 |

### explore/seed/page.tsx (post-removal ~700 lines → 2 files)

| New File | Responsibility | ~Lines |
|----------|---------------|--------|
| `page.tsx` | Page layout, data loading, routing | ~400 |
| `ExploreSidebar.tsx` | Left sidebar — tab switching, clusters/gaps panel hosting | ~300 |

### gap_detector.py (post-simplification ~400 lines)

No further splitting needed.

## Documentation Overhaul

### Delete (git history preserves all)

- `Discussion/` — entire directory (16 files)
- `release-notes/` — entire directory (5 files)
- `docs/RELEASE_v*.md` — all 19 files
- `docs/REVIEW_AUTOMATION_LOOP.md`
- `docs/SDD_TDD_PLAN.md`, `docs/SDD_v3.7.0.md`
- `docs/PRD_v4.0_Boolean_Search_and_Recommendations.md`
- `docs/ROADMAP_v4.0.md`
- `docs/DESIGN_THEME.md`
- `docs/TECH_PROOF.md`
- `.omc/` — entire directory
- `output/` — entire directory

### Rewrite

- `README.md` — reflect MVP state
- `CLAUDE.md` — full rewrite for v4.0.0 MVP architecture
- `AGENTS.md` — full rewrite matching current code

### Update

- `docs/ARCHITECTURE.md` — MVP architecture
- `docs/SPEC.md` — MVP spec
- `docs/PRD.md` — MVP PRD

### Keep As-Is

- `docs/PHILOSOPHY.md`
- `docs/DEPLOYMENT.md`
- `docs/OPEN_SOURCE_DATA_STRATEGY.md`

### Result: 57 .md files → ~10

## Version

Set version to **v4.0.0** everywhere:
- `backend/main.py` — FastAPI version parameter + health endpoint
- `CLAUDE.md` header
- Git tag `v4.0.0`

Rationale: v3.x was the feature-bloat era. MVP reset is a breaking change.

## CI/CD

GitHub Actions minimal pipeline (`.github/workflows/ci.yml`):

```yaml
name: CI
on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r backend/requirements.txt
      - run: cd backend && pytest -v

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: cd frontend && npm ci
      - run: cd frontend && npx tsc --noEmit
      - run: cd frontend && npm run lint
      - run: cd frontend && npm run build
```

No Playwright in CI (external API dependency).

Note: Backend tests that touch Redis-dependent code will use the existing graceful no-op pattern (`cache.py` already handles missing Redis). No Redis service needed in CI.

## Backward Compatibility

Saved graphs containing old 6-dim gap data will have extra fields (`intent`, `directional`, `structural_holes` in `GapScoreBreakdown`; `intent_summary`, `actionability` in `StructuralGap`). These should be treated as optional — the frontend should ignore unknown fields, and gap detection should re-run when loading old graphs rather than relying on stale gap data.

## Execution Order (Top-Down)

1. Frontend: Remove components, tabs, store slices, types, API methods, landing shortlist
2. Frontend: Verify — `tsc --noEmit` + `npm run lint` + `npm run build`
3. Backend: Remove routers, services, LLM layer, network_metrics
4. Backend: Simplify gap_detector.py (6-dim → 3-dim)
5. Backend: Simplify seed_explore.py (remove SNA, PageRank centroid)
6. Backend: Clean requirements.txt, main.py
7. Backend: Verify — `pytest -v`
8. Split ScholarGraph3D.tsx → 4 files
9. Split explore/seed/page.tsx → 2 files
10. Frontend: Re-verify after splits
11. Delete documentation files, .omc/, output/, Discussion/, release-notes/
12. Rewrite README.md, CLAUDE.md, AGENTS.md
13. Update ARCHITECTURE.md, SPEC.md, PRD.md
14. Add .github/workflows/ci.yml
15. Unify version to v4.0.0, tag
