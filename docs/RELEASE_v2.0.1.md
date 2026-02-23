# ScholarGraph3D v2.0.1 — Release Notes

**Release Date:** 2026-02-23
**Type:** Performance Patch

---

## Overview

v2.0.1 is a performance-focused patch that reduces the seed_explore pipeline response time from ~15-25s to ~3-5s. This resolves 504 Gateway Timeout errors on Render and delivers a significantly faster exploration experience.

---

## Performance Optimizations

### Pipeline Parallelization

The seed_explore pipeline previously executed 10 sequential steps. v2.0.1 introduces aggressive parallelization:

| Step | Before | After | Savings |
|------|--------|-------|---------|
| Refs + Cites fetch | Sequential (2 API calls) | `asyncio.gather` parallel | ~1-2s |
| HDBSCAN + Similarity | Sequential | `asyncio.gather` parallel | ~0.5-1s |
| Citation intents + Gap detection | Sequential | `asyncio.gather` parallel | ~1-2s |

### Removed Bottlenecks

| Removed | Time Saved | Rationale |
|---------|-----------|-----------|
| Groq research question generation | ~2-3s | LLM call for gap questions removed; structural gap data (bridge papers, gap strength) is sufficient |
| Depth-2 expansion | ~10s (when used) | Depth-2 required up to 10 additional S2 API calls; depth-1 provides adequate graph density |

### Timeout Adjustments

| Setting | Before | After |
|---------|--------|-------|
| Backend pipeline timeout | 55s | 25s |
| Frontend API timeout | 60s | 30s |

### Timing Instrumentation

Added `[timing]` logs after every major pipeline step for production profiling:
- `fetch_seed`, `fetch_refs_cites`, `fetch_embeddings`, `umap`, `hdbscan_and_similarity`, `intents_and_gaps`, `total`

---

## Frontend Changes

- **Depth selector removed**: The depth 1/2/3 buttons in the bottom info bar have been removed. All explorations now use depth-1 (direct references and citations only).
- **Research questions UI removed**: The research questions section in GapSpotterPanel has been removed since the backend no longer generates them.
- **API timeout reduced**: seedExplore client timeout reduced from 60s to 30s.

---

## Files Changed

| File | Changes |
|------|---------|
| `backend/routers/seed_explore.py` | Pipeline parallelization, Groq removal, depth-2 removal, timing logs |
| `frontend/app/explore/seed/page.tsx` | Depth controls removed, hardcoded depth=1 |
| `frontend/components/graph/GapSpotterPanel.tsx` | Research questions rendering removed |
| `frontend/lib/api.ts` | Timeout reduced to 30s |

---

## Migration Notes

No database changes. No environment variable changes. Drop-in replacement for v2.0.0.

---

## What's Preserved

Everything else from v2.0.0 remains intact:
- Gap Spotter (structural gaps, bridge papers, gap strength — just no LLM-generated questions)
- Frontier detection
- Citation path finder
- Seed chat (Groq)
- Graph save/load
- All cosmic theme visuals
