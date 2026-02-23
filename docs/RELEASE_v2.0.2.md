# ScholarGraph3D v2.0.2 — Release Notes

**Release Date:** 2026-02-23
**Type:** Critical Production Fix

---

## Overview

v2.0.2 resolves the remaining 504 Gateway Timeout errors that persisted after v2.0.1. Two root causes were identified and fixed:

1. **Dead Redis URL on Render** — caching was silently disabled in production, meaning every request ran the full pipeline
2. **UMAP too slow on Render's 0.5 vCPU** — 768→50D UMAP took ~51 seconds, far exceeding the 25s timeout

---

## Fixes

### PCA Pre-Reduction (768→100D)

The core performance fix. UMAP's nearest-neighbor graph construction scales poorly with input dimensionality on low-CPU environments. Adding a PCA pre-reduction step before UMAP dramatically cuts compute time:

**New pipeline:**
```
768D SPECTER2 embeddings
    |
    v
PCA 768→100D  (~0.01s, retains ~95% variance)
    |
    v
UMAP 100→50D  (~2-3s, n_neighbors=15, for clustering)
    |
    ├──→ HDBSCAN clustering  (50D euclidean)
    |
    └──→ UMAP 50D→3D  (~1-2s, n_neighbors=10, for visualization)
```

PCA triggers automatically when input dimensionality exceeds 200 (`_PCA_THRESHOLD`). The 50D intermediate and 3D UMAP steps operate on the 100D PCA output, not the raw 768D embeddings.

| Metric | Before (v2.0.1) | After (v2.0.2) |
|--------|-----------------|-----------------|
| UMAP intermediate (768→50D) | ~51s on 0.5 vCPU | ~3s (via 100D PCA) |
| Total pipeline (50 papers, cold) | **Timeout (>25s)** | **~7-8s** |
| Total pipeline (15 papers, cold) | **Timeout (>25s)** | **~17s** (incl. cold-start import) |
| Cached response | N/A (Redis dead) | **<0.5s** |

### Redis URL Corrected on Render

The Render environment had a stale Redis URL pointing to a deleted Upstash instance:

| Setting | Before | After |
|---------|--------|-------|
| Host | `pleased-hawk-53781.upstash.io` (DNS NXDOMAIN) | `working-osprey-13792.upstash.io` |
| Protocol | `redis://` (plain) | `rediss://` (TLS) |
| Status | **DNS failure → cache disabled** | **Connected** |

With Redis working, the `seed_explore` response cache (24h TTL) is active. Repeat queries for the same seed paper return in <0.5s.

### Stale OA_API_KEY Removed

The `OA_API_KEY` environment variable was still set on Render from v1.x. OpenAlex integration was fully removed in v2.0.0. The env var has been deleted from Render.

---

## Files Changed

| File | Changes |
|------|---------|
| `backend/graph/embedding_reducer.py` | Added `_pca_pre_reduce()` static method; PCA pre-reduction in `reduce_to_intermediate()` and `reduce_to_3d()` when dim > 200 |
| `backend/main.py` | Version bump to 2.0.2 |
| `docs/ARCHITECTURE.md` | Updated pipeline diagram to include PCA stage |
| Render env vars (via API) | `REDIS_URL` updated, `OA_API_KEY` deleted |

---

## Deployment Notes

- **Render auto-deploy** triggered by git push to `main`
- **No database changes** — drop-in replacement for v2.0.1
- **No new dependencies** — `scikit-learn` (PCA) was already in `requirements.txt`
- Redis cache will be empty after deploy; first request per paper runs full pipeline, subsequent requests hit cache

---

## Verification

Tested on production (Render Starter, 0.5 vCPU):

```
# Cold request (50 papers, no cache)
HTTP 200 — 40 nodes — 7.62s server / 7.86s total

# Cached request (same paper)
HTTP 200 — 15 nodes — 0.39s total (cache hit)

# Health check
{"status":"healthy","service":"ScholarGraph3D","version":"2.0.2"}
```
