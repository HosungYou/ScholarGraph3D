# ScholarGraph3D v3.5.1 — Release Notes

**Release Date:** 2026-02-25
**Type:** Minor Feature Release (Centrality-Driven Cluster Layout & Nebula Frame)

---

## Overview

v3.5.1 closes the loop on the SNA metrics introduced in v3.5.0: PageRank scores now drive the **visual center of each nebula cluster** (instead of the arithmetic mean of node positions), and each cluster gains a **glowing boundary ring** so clusters are visually distinct without relying solely on the particle cloud.

Also fixes the long-standing bug where `main.py` reported version `"2.0.2"` regardless of the actual release.

---

## Highlights

### PageRank-Weighted Centroid

**Before (v3.5.0):** Cluster centroid = arithmetic mean of all node positions. Since the seed paper sits near the geometric center of UMAP space, all cluster centroids tended to cluster near the seed paper — creating visual overlap.

**After (v3.5.1):** Centroid is computed as a PageRank-weighted mean:

```
centroid_x = Σ(x_i × max(pagerank_i, 0.001)) / Σ(max(pagerank_i, 0.001))
```

This shifts each cluster's visual center toward the most-cited paper in that cluster, matching the VOSviewer philosophy of "influential paper = visual center". The `0.001` floor prevents division-by-zero and gracefully falls back to arithmetic mean when SNA metrics fail.

**Computation order:** SNA metrics (step 8) → centroid calculation (step 8b) → returned in `SeedClusterInfo.centroid`. Frontend uses backend centroid with arithmetic mean fallback.

### Cluster Glow Ring (Nebula Frame)

Each cluster now has a `RingGeometry`-based boundary ring rendered via `ShaderMaterial`:

- **Radius:** `spread × 1.4` (outside the 1σ Gaussian cloud)
- **Billboard:** `ring.onBeforeRender` copies `camera.quaternion` so the ring always faces the camera
- **Pulse animation:** `0.6 + 0.4 × sin(uTime × 1.2)` via `CosmicAnimationManager`
- **Blending:** `AdditiveBlending` — rings add light on overlap, maintaining the cosmic aesthetic
- **Opacity:** 35% × pulse — subtle enough not to overpower stars, strong enough to delimit clusters

The `createNebulaCluster()` function now returns `THREE.Group` (cloud + ring) instead of `THREE.Points`. The cleanup loop in `ScholarGraph3D.tsx` was updated to traverse group children for proper geometry/material disposal and `CosmicAnimationManager` deregistration.

---

## All Changes

### Backend

| Change | File | Lines |
|--------|------|-------|
| `SeedClusterInfo.centroid` field | `routers/seed_explore.py` | +1 |
| PageRank-weighted centroid calculation | `routers/seed_explore.py` | +15 |
| Version string fix (`2.0.2` → `3.5.1`) | `main.py` | +2 |

### Frontend

| Change | File | Lines |
|--------|------|-------|
| `Cluster.centroid?: [number, number, number]` | `types/index.ts` | +1 |
| Backend centroid with arithmetic fallback | `components/graph/ScholarGraph3D.tsx` | +8 / −5 |
| Group-aware disposal in cleanup loop | `components/graph/ScholarGraph3D.tsx` | +15 / −5 |
| Glow ring + `THREE.Group` return type | `components/graph/cosmic/nebulaClusterRenderer.ts` | +45 / −5 |

---

## API Changes

### `POST /api/seed-explore` — `SeedClusterInfo` response extended

```json
{
  "clusters": [
    {
      "id": 0,
      "label": "attention mechanism",
      "centroid": [12.4, -3.1, 8.7],
      ...
    }
  ]
}
```

`centroid` is a new optional field `[x, y, z]` in each cluster object. Defaults to `[0.0, 0.0, 0.0]` when SNA metrics are unavailable. **Backward compatible** — existing API consumers can ignore the field.

---

## Deployment Fix: Version String

`main.py` had `version="2.0.2"` hard-coded since the initial commit — now set to `"3.5.1"`. The FastAPI OpenAPI docs (`/docs`) and `/` root endpoint will now report the correct version.

**Root cause of recurring deployment confusion:** The version string was never updated in deployment commits, making it impossible to verify from the running service which code was deployed. Fixed permanently.

---

## Breaking Changes

None. `Cluster.centroid` is optional (`?`), `createNebulaCluster()` return type is `THREE.Group` (compatible with `scene.add()`), and all cleanup code handles both `THREE.Group` and `THREE.Points`.

---

## Verification Checklist

| # | Item | How to Verify |
|---|------|---------------|
| 1 | TypeScript | `cd frontend && npx tsc --noEmit` — zero errors ✓ |
| 2 | Centroid in response | `curl .../api/seed-explore -d '{"paper_id":"..."}' \| jq '.clusters[0].centroid'` → `[x, y, z]` array |
| 3 | Centroid accuracy | Most-cited paper in cluster is closest to centroid |
| 4 | Glow ring visible | Each cluster has a pulsing boundary ring |
| 5 | Billboard ring | Ring always faces camera when rotating graph |
| 6 | SNA fallback | `pagerank=0` → centroid equals arithmetic mean |
| 7 | Memory cleanup | SPA page nav → Chrome DevTools Memory → no leak |
| 8 | Version string | `curl .../` → `{"version": "3.5.1", ...}` |

---

## Stats

- **4 files changed**, ~75 insertions, ~15 deletions
- **0 new dependencies**
- **0 new environment variables**
- **0 new API endpoints**
- **1 structural fix** (version string)
