# ScholarGraph3D v3.5.0 — Release Notes

**Release Date:** 2026-02-25
**Type:** Major Feature Release (Clustering/SNA Architecture Overhaul)

---

## Overview

v3.5.0 fundamentally redesigns the clustering pipeline to align with bibliometric SNA standards (VOSviewer, CiteSpace). The core change replaces HDBSCAN embedding-only clustering with a **Leiden algorithm on a 3-layer hybrid graph** (citation + bibliographic coupling + SPECTER2 similarity), producing clusters that reflect actual research communities rather than mere semantic similarity. Cluster labels now come from TF-IDF abstract analysis instead of Semantic Scholar's coarse `fieldsOfStudy` taxonomy. Additionally, lightweight SNA metrics (PageRank, Betweenness Centrality), Structural Holes gap analysis, and node size encoding are introduced.

---

## Highlights

### Leiden Hybrid Clustering (replaces HDBSCAN)

The previous pipeline clustered papers using HDBSCAN on SPECTER2 embeddings alone, ignoring citation network topology entirely. This produced generic labels like "Computer Science / Mathematics" for NLP papers. The new system builds a 3-layer weighted graph:

1. **Citation edges** (weight=1.0) — direct citation relationships
2. **Bibliographic coupling edges** (weight=shared_refs/max) — papers citing the same references
3. **Similarity edges** (weight=cosine_similarity) — SPECTER2 embedding similarity

Leiden community detection (`leidenalg.find_partition` with `RBConfigurationVertexPartition`) runs on this combined graph. Falls back to HDBSCAN when the graph is too sparse (total_edges < N*0.5) or when `CLUSTERING_MODE=hdbscan` is set.

### TF-IDF Cluster Labels

`fieldsOfStudy` frequency labeling replaced with `TfidfVectorizer(ngram_range=(1,2))` on paper abstracts. Produces domain-specific labels like "attention mechanism" or "drug discovery" instead of "Computer Science".

### Lightweight SNA Node Metrics

New `compute_node_lightweight()` function in `network_metrics.py` computes PageRank (alpha=0.85) and Betweenness Centrality for each node. Complements the comprehensive `NetworkMetricsComputer` class added in v3.4.0.

### Structural Holes Gap Dimension

Gap scoring expanded from 5 to 6 dimensions with Burt (1992) Structural Holes theory. Uses `nx.constraint()` to measure brokerage opportunities between clusters.

### Node Size Encoding

New dropdown in Ship Controls lets users switch node size encoding between citation count (default), PageRank, and Betweenness Centrality.

### Panel Layout Improvements

Canvas enforces `minWidth: 400px`. On viewports < 1200px, opening the right detail panel auto-collapses the left sidebar to preserve graph visibility.

---

## All Changes

### Backend

| Change | File | Description |
|--------|------|-------------|
| Leiden hybrid clustering | `graph/clusterer.py` | `cluster_hybrid()` — 3-layer graph + Leiden with HDBSCAN fallback |
| Bibliographic coupling | `graph/clusterer.py` | `_compute_bib_coupling()` — shared reference edges from existing citation_pairs |
| TF-IDF labeling | `graph/clusterer.py` | `label_clusters_tfidf()` — bigram/unigram abstract analysis replaces fieldsOfStudy |
| CLUSTERING_MODE env var | `graph/clusterer.py` | `"hybrid"` (default) / `"leiden"` / `"hdbscan"` runtime control |
| Lightweight SNA metrics | `graph/network_metrics.py` | `compute_node_lightweight()` for PageRank + Betweenness per node |
| Structural Holes | `graph/gap_detector.py` | `_compute_structural_holes_score()` using `nx.constraint()` (Burt 1992) |
| Gap weight rebalance | `graph/gap_detector.py` | structural 0.25, relatedness 0.25, temporal 0.15, intent 0.10, directional 0.10, structural_holes 0.15 |
| Pipeline restructure | `routers/seed_explore.py` | reference_lists construction, hybrid clustering call, TF-IDF labels, SNA metric computation |
| SeedGraphNode extension | `routers/seed_explore.py` | `pagerank: float`, `betweenness: float` fields added |
| New dependencies | `requirements.txt` | `leidenalg>=0.10.0`, `python-igraph>=0.11.0` |

### Frontend

| Change | File | Description |
|--------|------|-------------|
| Type extensions | `types/index.ts` | `pagerank`, `betweenness` on Paper; `structural_holes` on GapScoreBreakdown |
| Node size state | `hooks/useGraphStore.ts` | `nodeSizeMode: 'citations' \| 'pagerank' \| 'betweenness'` + setter |
| Node size dropdown | `components/graph/GraphControls.tsx` | Hover-activated dropdown for node size encoding |
| Node size rendering | `components/graph/ScholarGraph3D.tsx` | `nodeVal` switches by `nodeSizeMode` with normalization |
| Centroid markers | `components/graph/ScholarGraph3D.tsx` | Diamond markers (OctahedronGeometry) at cluster centroids in gap overlay |
| Distance labels | `components/graph/ScholarGraph3D.tsx` | Sprite labels showing inter-centroid distance on gap hover |
| SHL score bar | `components/graph/GapSpotterPanel.tsx` | Structural Holes dimension added to score breakdown |
| Key Terms label | `components/graph/ClusterPanel.tsx` | "Top Topics" renamed to "Key Terms" |
| Canvas min width | `app/explore/seed/page.tsx` | `minWidth: 400px` on center panel |
| Responsive collapse | `app/explore/seed/page.tsx` | Auto-collapse left sidebar when right panel opens on narrow viewports |

### Tests

| Change | File | Description |
|--------|------|-------------|
| Hybrid clustering tests | `tests/test_graph/test_clusterer_hybrid.py` | **New file** — 8 tests: Leiden two-component, bib coupling, HDBSCAN fallback, TF-IDF labels, min cluster size |

### Documentation

| Change | File | Description |
|--------|------|-------------|
| Architecture review | `docs/discussion/2026-02-25_clustering-sna-architecture-review.md` | **New file** — Korean-language discussion of SNA principles and design decisions |

---

## Gap Score Weights (v3.5.0)

| Dimension | Weight | Direction | Description |
|-----------|--------|-----------|-------------|
| Structural | 0.25 | High = gap | % of possible inter-cluster edges missing |
| Relatedness | 0.25 | High = actionable | Centroid cosine similarity (similar topics = worth bridging) |
| Temporal | 0.15 | High = gap | Year distribution non-overlap |
| Intent | 0.10 | High = gap | Background-heavy cross-citations (shallow engagement) |
| Directional | 0.10 | High = gap | Citation flow asymmetry (A→B vs B→A) |
| **Structural Holes** | **0.15** | **High = opportunity** | **Low constraint = brokerage opportunity (Burt 1992)** |

---

## Clustering Mode Comparison

| Criterion | Leiden (v3.5.0) | HDBSCAN (legacy) |
|-----------|-----------------|-------------------|
| Input | Graph (nodes + weighted edges) | Point cloud (50D embeddings) |
| Optimization | Modularity (community detection) | Density-based clustering |
| Citation topology | Direct use (3-layer graph) | Ignored |
| Academic standard | VOSviewer, CiteSpace | General ML |
| Noise handling | All nodes assigned to communities | -1 (noise) possible |
| Speed (80 nodes) | ~10ms | ~500ms |
| Label source | TF-IDF on abstracts | fieldsOfStudy frequency |

---

## Breaking Changes

| Change | Impact | Migration |
|--------|--------|-----------|
| Cluster labels | "Computer Science" → "attention mechanism" | Frontend already handles string labels — visual change only |
| Gap score weights | structural 0.35→0.25, intent 0.15→0.10 | Existing gap scores will shift; cache invalidation recommended |
| `structural_holes` field | New field in `gap_score_breakdown` | Frontend updated; API consumers should handle new field |
| `pagerank`, `betweenness` fields | New fields on graph nodes | Optional fields, default 0.0 — backward compatible |
| New dependencies | `leidenalg`, `python-igraph` | Already in `requirements.txt`, auto-installed via Docker |

---

## Performance Impact

| Stage | Time | Change |
|-------|------|--------|
| Bibliographic coupling (80 papers) | <5ms | New |
| Leiden clustering (80 nodes) | <10ms | Replaces HDBSCAN ~500ms |
| TF-IDF labeling (80 abstracts) | <50ms | Replaces fieldsOfStudy lookup |
| Lightweight SNA metrics (80 nodes) | ~50ms | New |
| **Net pipeline impact** | **~-0.3s** | **Faster overall** |

---

## New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `leidenalg` | >=0.10.0 | Leiden community detection algorithm |
| `python-igraph` | >=0.11.0 | Graph data structure for Leiden |

Note: `networkx>=3.2.0` was already added in v3.4.0.

---

## Environment Variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `CLUSTERING_MODE` | `hybrid`, `leiden`, `hdbscan` | `hybrid` | Controls clustering algorithm selection |

- `hybrid`: Leiden when graph is dense enough, HDBSCAN fallback for sparse graphs
- `leiden`: Force Leiden (falls back to HDBSCAN if igraph unavailable)
- `hdbscan`: Force legacy HDBSCAN clustering

---

## Verification Checklist

| # | Item | How to Verify |
|---|------|---------------|
| 1 | Hybrid clustering tests | `cd backend && venv/bin/python -m pytest tests/test_graph/test_clusterer_hybrid.py -v` — 8/8 pass |
| 2 | Existing tests unbroken | `cd backend && venv/bin/python -m pytest tests/ -v` — all unit tests pass |
| 3 | TypeScript | `cd frontend && npx tsc --noEmit` — zero errors |
| 4 | Cluster labels | seed-explore response → cluster labels are domain terms, not "Computer Science" |
| 5 | SNA metrics | seed-explore nodes → `pagerank`, `betweenness` fields present |
| 6 | Gap score | gap responses → `gap_score_breakdown.structural_holes` present |
| 7 | Node size toggle | Ship Controls → node size dropdown → switches between citations/pagerank/betweenness |
| 8 | Panel layout | 1280px viewport → both panels open → canvas >= 400px |
| 9 | Responsive collapse | < 1200px → open right panel → left sidebar auto-collapses |
| 10 | HDBSCAN fallback | Set `CLUSTERING_MODE=hdbscan` → legacy behavior preserved |
| 11 | Docker build | Dockerfile installs leidenalg, python-igraph via requirements.txt |

---

## Stats

- **14 files changed**, ~680 insertions, ~80 deletions
- **1 new file** (test_clusterer_hybrid.py)
- **1 new discussion doc** (2026-02-25 architecture review)
- **2 new dependencies** (leidenalg, python-igraph)
- **8 new tests** (all passing)
- **0 new API endpoints** (existing seed-explore enhanced)
- **1 new environment variable** (CLUSTERING_MODE)
