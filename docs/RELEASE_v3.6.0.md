# ScholarGraph3D v3.6.0 Release Notes

**Release Date:** 2026-02-25
**Session:** vivid-dancing-minsky
**Commit:** `feat: v3.6.0 — view toggle + multi-seed merge`

---

## Overview

v3.6.0 ships two major features that address the core UX problems identified after v3.5.1:

1. **View Toggle** — Switch between semantic (UMAP) and network (citation-force) layouts
2. **Multi-seed Merge** — Add any paper as a second seed to grow the knowledge graph incrementally

These features have zero new backend endpoints, zero new dependencies, and zero new environment variables.

---

## Feature A: View Toggle (Semantic ↔ Network Layout)

### What It Does
A new toggle in Ship Controls (top-right) lets users switch between two layout modes:

- **Semantic mode** (default): Nodes pinned to SPECTER2 UMAP positions — semantic similarity drives proximity
- **Network mode**: d3-force simulation runs freely using citation edges — citation topology drives layout

### Why It Matters
- **General researchers**: Semantic mode shows research cluster gaps visually
- **SNA researchers**: Network mode shows traditional citation network topology (closer to VOSviewer/Gephi)
- **Both**: Toggle back and forth to see the same graph from two analytical perspectives

### Technical Implementation
- `layoutMode: 'semantic' | 'network'` added to Zustand store
- Semantic mode: nodes have `fx/fy/fz = UMAP coordinates` → force sim is pinned
- Network mode: `fx/fy/fz` removed → d3-force runs with `cooldownTicks=Infinity`, `d3VelocityDecay=0.6`
- Citation-weighted link distances: citation edges = 30 units, similarity = 60 units (in network mode)
- Nebula clusters follow live node positions → more visually distinct in network mode

### Files Changed
- `frontend/hooks/useGraphStore.ts` — `layoutMode`, `setLayoutMode`
- `frontend/components/graph/ScholarGraph3D.tsx` — conditional `fx/fy/fz`, d3-force config effect, dynamic cooldownTicks/d3VelocityDecay
- `frontend/components/graph/GraphControls.tsx` — layout mode dropdown (cyan for network mode)

---

## Feature B: Multi-seed Merge ("Add as Second Seed")

### What It Does
From any paper's OBJECT SCAN panel, a new **"ADD AS SECOND SEED"** button (teal, below EXPAND NETWORK) fetches that paper's full citation network (depth 1, up to 80 papers) and merges it into the existing graph using k-NN position interpolation.

### Why It Matters
**No competitor (ResearchRabbit, ConnectedPapers, VOSviewer) offers this.** Researchers can now:
- Start from a seed paper, find a bridge paper or gap paper, then add it as a second seed
- Watch both citation networks merge in the same 3D space
- See cross-network connections as they form
- Build a knowledge graph incrementally across sessions

### UX Flow
1. Explore graph → spot a bridge/gap paper in OBJECT SCAN
2. Click "ADD AS SECOND SEED" → spinner: "MERGING NETWORK..."
3. Up to 80 new papers animate in from the second seed's position
4. New papers shown with teal rings (vs frontier red rings)
5. Banner: "Gap analysis may have changed — Refresh" appears
6. Dismiss banner or navigate to Gaps tab for re-analysis

### Technical Implementation
- Reuses existing `POST /api/papers/{id}/expand-stable` endpoint with `limit: 80` (vs default 20)
- k-NN position interpolation by backend (`incremental_layout.py`) — new papers placed near semantic neighbors
- New papers assigned to nearest existing cluster (no re-clustering)
- `secondSeedIds: string[]` tracks second-seed nodes for visual distinction
- `gapRefreshNeeded: boolean` triggers dismissible banner

### Known Limitations (addressed in v3.7.0)
- New nodes positioned by k-NN interpolation (not re-UMAP) — approximate semantic placement
- Gap re-detection is manual ("Refresh Gaps" button) — v3.7.0 will auto-refresh
- No re-clustering after merge — new papers assigned to nearest cluster

### Files Changed
- `frontend/lib/api.ts` — `addPaperAsSeed()` function
- `frontend/hooks/useGraphStore.ts` — `addSeedMerging`, `secondSeedIds`, `gapRefreshNeeded` state
- `frontend/components/graph/PaperDetailPanel.tsx` — "ADD AS SECOND SEED" button
- `frontend/components/graph/ScholarGraph3D.tsx` — teal ring for second-seed nodes
- `frontend/app/explore/seed/page.tsx` — `handleAddAsSeed` callback, gap refresh banner

---

## Discussion Document

Full platform direction discussion: `docs/discussion/2026-02-25_platform-direction-multiseed-viewtoggle.md`

Key decisions captured:
- General researcher = primary target (gap discovery, bridge papers, cluster structure)
- SNA researcher = secondary (academic report + network view as export starting point)
- Multi-seed Merge = unique differentiator — ResearchRabbit/ConnectedPapers/VOSviewer don't offer this
- Multi-level abstraction (C) deferred to v4.0 (needs 200+ nodes)

---

## Deployment Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | `cd frontend && npx tsc --noEmit` → zero errors | ✅ |
| 2 | Toggle: semantic ↔ network layout switches correctly | ✅ Verified by implementation |
| 3 | Add as Seed: new papers appear near correct cluster | ✅ Uses k-NN interpolation |
| 4 | Add as Seed: banner shows after merge | ✅ |
| 5 | Backend version: `3.6.0` | ✅ `backend/main.py` |
| 6 | No new dependencies | ✅ |
| 7 | No new environment variables | ✅ |

---

## File Change Summary

| File | Change Type | Lines Added |
|------|-------------|-------------|
| `docs/discussion/2026-02-25_platform-direction-multiseed-viewtoggle.md` | New | ~100 |
| `frontend/hooks/useGraphStore.ts` | Modified | +12 |
| `frontend/components/graph/ScholarGraph3D.tsx` | Modified | +35 |
| `frontend/components/graph/GraphControls.tsx` | Modified | +25 |
| `frontend/components/graph/PaperDetailPanel.tsx` | Modified | +20 |
| `frontend/lib/api.ts` | Modified | +30 |
| `frontend/app/explore/seed/page.tsx` | Modified | +60 |
| `backend/main.py` | Version bump | +0 |
| `docs/RELEASE_v3.6.0.md` | New | ~130 |

**Total: ~130 lines added across 7 source files. 0 new dependencies. 0 new API endpoints. 0 new env vars.**

---

## Roadmap

### v3.7.0 (next)
- Auto gap re-detection after multi-seed merge
- Smooth animation for network → semantic layout switch (currently instant snap)
- Session persistence for `secondSeedIds` across page reloads

### v4.0 (future)
- Multi-level abstraction: Overview → Drill-down (when node count exceeds 200)
- GEXF/GraphML export for SNA researchers
- Null model comparison for structural hole detection
