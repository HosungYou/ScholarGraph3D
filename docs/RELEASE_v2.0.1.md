# ScholarGraph3D v2.0.1 — Release Notes

**Release Date:** 2026-02-23
**Type:** Performance Patch

---

## Overview

v2.0.1 is a performance and stability patch that eliminates 504 Gateway Timeout errors, greatly reduces 429 rate-limit errors from Semantic Scholar, and cuts response time in half for most requests. Cache hits on seed_explore now return instantly. Docker image size is reduced by ~100MB via dead dependency removal.

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

## Critical Fixes

### S2 Rate Limiter Overhaul

The previous S2 rate limiter used a single `asyncio.Lock`, which serialized all concurrent S2 API calls through a single bottleneck. A pipeline making 4 parallel S2 calls would queue them all behind one lock, causing the very timeouts the lock was meant to prevent.

v2.0.1 replaces the lock with `asyncio.Semaphore(2)` + a minimal `_time_lock` for timestamp tracking only. Up to 2 S2 calls now proceed in parallel; the time lock is held only for the brief moment needed to read/write the last-call timestamp.

| Issue | Before | After |
|-------|--------|-------|
| Concurrency | Fully serialized (1 at a time) | Up to 2 concurrent S2 calls |
| Lock scope | Held for entire API call duration | Held only for timestamp check (~microseconds) |
| 504 timeouts | Frequent under parallel pipeline | Eliminated |

### Auto Rate Detection Fixed

When no `S2_API_KEY` is set, the client auto-detects unauthenticated mode. In v2.0.0 the auto-detected rate was incorrectly set to 1.0 RPS (authenticated limit). Unauthenticated S2 access allows only 0.3 RPS. This caused a steady stream of 429 errors in deployments without an API key.

v2.0.1 corrects the unauthenticated default to 0.3 RPS.

### UMAP Optimization

The pipeline previously ran UMAP twice: once to produce 3D coordinates for visualization, and once internally in the clusterer to produce 50D embeddings for HDBSCAN. v2.0.1 computes a single 768→50D intermediate pass shared between both consumers:

```
768D SPECTER2 embeddings
    |
    v
UMAP 768→50D  (single pass, n_neighbors=15)
    |
    ├──→ HDBSCAN clustering  (50D euclidean)
    |
    └──→ UMAP 50D→3D  (visualization, n_neighbors=10, z=publication year)
```

This eliminates the double UMAP computation and reduces the embedding stage time by ~50%.

### Response Caching

Full `seed_explore` responses are now cached in Redis with a 24-hour TTL keyed by `paper_id`. Subsequent requests for the same seed paper return instantly from cache without running any pipeline stages.

Cache key: `seed:{paper_id}`

### Citation Intent Fetch Limit

The citation intent fetch limit was reduced from 500 to 100 (the graph contains ~50 papers). This eliminates unnecessary over-fetching from the S2 intents endpoint.

---

## Frontend Changes

- **Depth selector removed**: The depth 1/2/3 buttons in the bottom info bar have been removed. All explorations now use depth-1 (direct references and citations only).
- **Research questions UI removed**: The research questions section in GapSpotterPanel has been removed since the backend no longer generates them.
- **API timeout reduced**: seedExplore client timeout reduced from 60s to 30s.

---

## Dead Code Cleanup

### Configuration Settings Removed

14 dead v1.x config settings were removed from `config.py`:
- OpenAlex settings: `oa_api_key`, `oa_email`, `oa_daily_credit_limit`
- Multi-LLM settings: `openai_api_key`, `anthropic_api_key`, `gemini_api_key`
- Resend email settings: `resend_api_key`, `resend_from_email`
- Watch query settings: `watch_query_interval`, `watch_query_max_results`
- Misc dead settings removed from environment validation

### Dependencies Removed

| Removed | Savings | Rationale |
|---------|---------|-----------|
| `openai>=1.0.0` from `requirements.txt` | ~50MB Docker image | OpenAI provider removed in v2.0.0; package was still being installed |
| `weasyprint` system deps from `Dockerfile` | ~50MB Docker image | PDF export removed in v2.0.0; system libraries (pango, cairo) were still present |

**Total Docker image reduction: ~100MB**

### Dead Code Removed

- `get_recommendations()` method and `RECOMMENDATIONS_URL` constant from `semantic_scholar.py`
- OpenAlex references from health check endpoint, clusterer, and seed_explore
- OpenAlex remnants from test fixtures and `.env.example`
- Dead test files: `test_data_fusion.py`, `test_search.py`

---

## Files Changed

| File | Changes |
|------|---------|
| `backend/routers/seed_explore.py` | Pipeline parallelization, Groq removal, depth-2 removal, timing logs, Redis response caching |
| `backend/integrations/semantic_scholar.py` | Semaphore rate limiter, 0.3 RPS unauthenticated default, intent limit 500→100, removed `get_recommendations()` |
| `backend/graph/embedding_reducer.py` | Single 768→50D intermediate pass shared with clusterer |
| `backend/graph/clusterer.py` | Consume shared 50D intermediate instead of recomputing UMAP |
| `backend/config.py` | Removed 14 dead v1.x settings |
| `backend/requirements.txt` | Removed `openai>=1.0.0` |
| `backend/Dockerfile` | Removed weasyprint system deps |
| `backend/tests/` | Removed `test_data_fusion.py`, `test_search.py` |
| `frontend/app/explore/seed/page.tsx` | Depth controls removed, hardcoded depth=1 |
| `frontend/components/graph/GapSpotterPanel.tsx` | Research questions rendering removed |
| `frontend/lib/api.ts` | Timeout reduced to 30s |

---

## Expected Impact

| Issue | Before | After |
|-------|--------|-------|
| 504 Gateway Timeout | Frequent (rate limiter serialized parallel calls) | Eliminated |
| 429 Rate Limit errors | Frequent (unauthenticated rate set to 1.0 RPS) | Greatly reduced (0.3 RPS cap) |
| Response time (cold) | ~15-25s | ~7-12s |
| Response time (cached) | ~15-25s | ~100ms (instant Redis hit) |
| UMAP computation | Double pass (768→3D + 768→50D) | Single intermediate (768→50D→3D) |
| Docker image size | Baseline | ~100MB smaller |

---

## Migration Notes

No database changes. No environment variable changes (only dead variables removed — if you had them set they are harmlessly ignored). Drop-in replacement for v2.0.0.

---

## What's Preserved

Everything else from v2.0.0 remains intact:
- Gap Spotter (structural gaps, bridge papers, gap strength — just no LLM-generated questions)
- Frontier detection
- Citation path finder
- Seed chat (Groq)
- Graph save/load
- All cosmic theme visuals
