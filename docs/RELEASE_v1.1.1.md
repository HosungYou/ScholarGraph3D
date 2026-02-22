# ScholarGraph3D v1.1.1 — Comprehensive Codebase Audit

> Released: 2026-02-22

## Overview

v1.1.1 fixes critical API contract mismatches between frontend and backend, resolves Three.js memory leaks from unbounded GPU resource accumulation, removes ~160 lines of dead code, and updates 8 documentation files for accuracy and consistency.

## Bug Fixes

### Frontend API Contract Fixes (6 fixes)

| Fix | Before | After | Impact |
|-----|--------|-------|--------|
| Citation intents endpoint | `POST /citation-intents` with body | `GET /intents` with query params | Was returning 404 |
| Search filters | `year_min`/`year_max`/`field` | `year_start`/`year_end`/`fields_of_study` | Filters were silently ignored |
| Streaming chat SSE | `type: 'done'` events dropped | Processed for citation metadata | Citation metadata missing from chat |
| `getPaperByDOI` | Had nonexistent `redirect_query` field | Removed; added `source` field | Field mismatch in DOI lookup |
| Watch check field | `new_papers` | `new_papers_found` | Field name alignment |
| `useEffect` deps | Missing dependencies in explore + seed pages | Added missing deps | Potential stale closure bugs |

### Three.js Memory Leak Fixes (5 fixes)

- **`disposeGroup()` utility**: Added recursive GPU resource disposal helper — calls `.dispose()` on all geometries, materials, and textures in a Three.js Group
- **`nodeThreeObject` disposal**: Now disposes existing `__threeObj` before creating new node objects, preventing geometry/material accumulation on graph updates
- **`CosmicAnimationManager` deregistration**: Added `deregisterShaderMaterial()` and `deregisterAnimatedObject()` methods to prevent unbounded array growth in the rAF loop
- **Cluster overlay rebuild**: Deregisters old nebula ShaderMaterials before rebuilding cluster overlays, preventing shader uniform accumulation
- **Unmount cleanup**: Full scene traversal + `disposeGroup()` on unmount, plus `CosmicAnimationManager.reset()` and `newNodeTimerRef` cleanup

### Backend Fixes (5 fixes)

- **Race condition**: Background enrichment task now receives list copies (not shared references) and is deferred to after cluster building completes
- **`SearchRequest` legacy aliases**: `year_min`/`year_max`/`field` accepted via `model_validator` for backwards compatibility with frontend
- **`PaperDetail` computed field**: Added `fields` property as alias for `fields_of_study` to align with frontend expectations
- **`WatchQueryResponse`**: Added `new_paper_count` field
- **`WatchCheckResult`**: Added `new_papers` field alongside `new_papers_found` for dual-field compatibility
- Removed unused imports from `natural_search.py`

## Dead Code Removal (~160 lines removed)

| Item | Lines | Reason |
|------|-------|--------|
| `lightStreamEdgeRenderer.ts` (deleted) | 81 | Never imported anywhere in codebase |
| `FIELD_COLOR_MAP` constant | 33 | Fully replaced by `STAR_COLOR_MAP` in v1.0.1 |
| `hoveredNode` state | ~10 | Unused; hover tracking uses `hoveredNodeRef` throughout |
| `GraphEdge` import | 1 | Unused import |
| EDGE shaders in `cosmicConstants.ts` | ~15 | Unused GLSL shader strings |
| `INTENT_COLORS`, `GapOverlayLine`, `CONCEPTUAL_EDGE_COLORS`, `CONCEPTUAL_EDGE_LABELS` from `types/index.ts` | ~20 | All unused in current implementation |
| `addNodes` from `useGraphStore` | ~10 | Only `addNodesStable` is used throughout |

## Documentation Updates (8 files)

| File | Changes |
|------|---------|
| `CLAUDE.md` | Accurate directory trees, cosmic file locations, HDBSCAN/UMAP dual defaults clarified, 26-field color map note, expanded documentation map |
| `docs/SPEC.md` | sqrt node size formula, v1.0.1 colors, DB pool=3, section renumbering, phases 5–7+ |
| `docs/ARCHITECTURE.md` | 768→50D HDBSCAN pipeline, full directory tree including auth pages, UUID primary keys |
| `docs/PRD.md` | All phases marked Complete |
| `docs/DESIGN_THEME.md` | `lightStreamEdgeRenderer` removal note added |
| `docs/SDD_TDD_PLAN.md` | Duplicate section 7 renumbered |

## Files Changed

| File | Type | Change |
|------|------|--------|
| `frontend/lib/api.ts` | Frontend | Citation intents URL/method fix, search filter param mapping, `getPaperByDOI` fix, watch field fix |
| `frontend/app/explore/page.tsx` | Frontend | Search filter params, useEffect deps, streaming chat `done` handler |
| `frontend/app/explore/seed/page.tsx` | Frontend | Search filter params, useEffect deps |
| `frontend/components/graph/ScholarGraph3D.tsx` | Frontend | `disposeGroup()` usage, `nodeThreeObject` disposal, unmount cleanup, dead state removal |
| `frontend/components/graph/cosmic/CosmicAnimationManager.ts` | Frontend | `deregisterShaderMaterial()`, `deregisterAnimatedObject()`, `reset()` methods |
| `frontend/components/graph/cosmic/cosmicConstants.ts` | Frontend | EDGE shader removal, `FIELD_COLOR_MAP` removal |
| `frontend/components/graph/cosmic/nebulaClusterRenderer.ts` | Frontend | Deregister old ShaderMaterials before cluster rebuild |
| `frontend/hooks/useGraphStore.ts` | Frontend | Remove `hoveredNode` state, remove `addNodes` action |
| `frontend/types/index.ts` | Frontend | Remove `INTENT_COLORS`, `GapOverlayLine`, `CONCEPTUAL_EDGE_COLORS`, `CONCEPTUAL_EDGE_LABELS`, `GraphEdge` import |
| `frontend/lightStreamEdgeRenderer.ts` | Frontend | **Deleted** (81 lines, never imported) |
| `backend/routers/search.py` | Backend | `SearchRequest` legacy param aliases via `model_validator` |
| `backend/routers/papers.py` | Backend | `PaperDetail.fields` computed alias, `WatchQueryResponse.new_paper_count`, `WatchCheckResult.new_papers` |
| `backend/routers/natural_search.py` | Backend | Unused import removal |
| `backend/services/watch_service.py` | Backend | Background task list copy + deferred execution fix |
| `docs/CLAUDE.md` | Docs | Directory trees, constraints, documentation map |
| `docs/SPEC.md` | Docs | Formula, colors, pool size, phases |
| `docs/ARCHITECTURE.md` | Docs | Pipeline, directory tree, auth pages, UUIDs |
| `docs/PRD.md` | Docs | Phase completion status |
| `docs/DESIGN_THEME.md` | Docs | `lightStreamEdgeRenderer` removal note |
| `docs/SDD_TDD_PLAN.md` | Docs | Section renumbering |

**Stats:** 19 files changed, 283 insertions, 305 deletions (net −22 lines)

## Verification

- **Frontend build**: `npm run build` — 0 TypeScript errors, 10 pages generated
- **Backend tests**: `pytest -v` — 93 passed

## Known Remaining Issues

| ID | Issue | Status |
|----|-------|--------|
| C1 | Graph Save/Load structural mismatch — saved graph JSON schema does not match current `GraphData` shape; load silently produces empty/broken graphs | Deferred to v1.2.0 |

## Upgrade Notes

- No breaking changes to public API contracts
- Backend now accepts legacy frontend param names (`year_min`/`year_max`/`field`) via `model_validator` — old frontend versions remain compatible
- Deleted `lightStreamEdgeRenderer.ts` was never imported — no dependents affected
