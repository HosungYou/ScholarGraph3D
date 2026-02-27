# ScholarGraph3D — Future Roadmap

> **Document version:** 1.0
> **Date:** 2026-02-27
> **Current release:** v3.7.0
> **Related:** [SDD_v3.7.0.md](./SDD_v3.7.0.md) | [RELEASE_v3.7.0.md](./RELEASE_v3.7.0.md) | [CLAUDE.md](../CLAUDE.md)

---

## Overview

This document captures the planned evolution of ScholarGraph3D beyond v3.7.0. Items are organized by release target and priority. All timelines are approximate; actual scheduling depends on complexity validation, API constraint changes, and user feedback.

Items marked as deferred from v3.7.0 are flagged with the source session.

---

## v3.7.1 — Immediate (Diagnostic Tooling)

**Theme:** Cluster quality visualization — making the silhouette score actionable rather than just a warning number.

### 2D Cluster Map Diagnostic Panel

**Status:** Deferred from v3.7.0 (separate PR, ~200 lines of new code)

**Description:** A d3.js scatter plot rendered in a side panel showing the UMAP 2D projection of all papers, colored by cluster assignment. Provides a spatial view of cluster quality that complements the silhouette score number shown in the warning banner.

**Backend:** `reduce_to_2d()` already exists in `embedding_reducer.py` as a byproduct of the UMAP pipeline. The 2D coordinates are computed during every `POST /api/seed-explore` call but are currently discarded. They need to be included in the response or exposed via a dedicated lightweight endpoint.

**Frontend:** A new component, tentatively `ClusterMapPanel.tsx`, using d3.js for rendering. Estimated ~200 lines.

**Interaction design:**
- X/Y axes: UMAP 2D coordinates (no axis labels needed — spatial relationship is the signal)
- Point color: cluster color from the existing cluster color palette
- Point size: proportional to citation count (same sqrt formula as 3D nodes)
- Hover: show paper title tooltip
- Click: sync selection with the 3D graph via `useGraphStore.selectPaper()`

**Use case:** When the silhouette warning banner appears (`score < 0.15`), the user can open this panel to understand whether the poor score reflects genuinely ambiguous papers or a fundamental embedding issue.

**Estimated complexity:** Medium — d3.js integration, store sync, panel layout. Dedicated PR.

---

## v3.8.0 — Short-term (Visual Refinement)

**Theme:** Polish the v3.7.0 features with higher-fidelity rendering and better user controls.

### Gap Arc Thickness Encoding

**Status:** Deferred from v3.7.0 (`THREE.Line` WebGL limitation)

**Description:** The gap arc currently uses `THREE.LineBasicMaterial`, which renders as a fixed 1-pixel line in WebGL regardless of the `lineWidth` property. To encode `gap_strength` as arc thickness, the geometry must be replaced with `THREE.TubeGeometry`.

**Implementation approach:**

```typescript
function createGapArcTube(
  centroidA: THREE.Vector3,
  centroidB: THREE.Vector3,
  gapStrength: number,      // 0.0 – 1.0
  scene: THREE.Scene
): THREE.Mesh {
  const curve = new THREE.QuadraticBezierCurve3(scaledA, mid, scaledB);
  const tubeRadius = 0.3 + gapStrength * 1.2;   // 0.3 (weak) to 1.5 (strong)
  const geometry = new THREE.TubeGeometry(curve, 50, tubeRadius, 8, false);
  const material = new THREE.MeshBasicMaterial({
    color: 0xD4AF37,
    opacity: 0.6,
    transparent: true,
  });
  return new THREE.Mesh(geometry, material);
}
```

**Why deferred:** `TubeGeometry` is substantially more expensive than `LineGeometry` (8 faces per segment × 50 segments = 400 triangles vs 50 line segments). For graphs with many gaps, simultaneous arc rendering could cause frame rate degradation. A LOD strategy (thin line for distant clusters, tube for nearby/hovered) should be designed before implementation.

**Estimated complexity:** Medium — geometry swap, LOD design, disposal update.

### Direction Filter in Cluster Panel

**Description:** Add a filter control to the Sector Scanner (ClusterPanel) paper list allowing users to show only `reference`, `citation`, or `seed` papers within a cluster.

**UI:** Three toggle chips above the paper list: "All", "Reference", "Citation". Selecting one filters the list without affecting the 3D graph.

**Implementation:** Pure frontend state — no backend changes needed. The `direction` field is already present on each node from v3.7.0.

**Estimated complexity:** Low — filter state in component, conditional list render.

### Cache Invalidation Strategy

**Description:** The current approach of appending a hardcoded `:v3.7.0` version suffix to Redis cache keys is expedient but not scalable. Each release that changes response structure requires a manual key suffix update.

**Proposed approach:** Compute a cache key that includes a hash of the relevant pipeline parameters:

```python
pipeline_version = hash_pipeline_params({
    "umap_version": UMAP.__version__,
    "n_neighbors_formula": "adaptive_v1",
    "direction_field": True,
    "silhouette": True,
})
cache_key = f"{paper_id}:pipe:{pipeline_version[:8]}"
```

Alternatively, introduce a `CACHE_SCHEMA_VERSION` constant in `config.py` that is incremented manually when response structure changes. This is simpler but still requires a manual step.

**Estimated complexity:** Low — configuration change, no behavioral impact.

---

## v4.0.0 — Medium-term (Depth & Intelligence)

**Theme:** Expand the graph data model to depth-1.5 and introduce semantic intelligence features.

### Depth-1.5 Sampling

**Status:** Deferred from v3.7.0 (S2 API rate limit)

**Description:** Fetch the top-10 references of the seed paper's references (references of references), adding approximately 20 additional high-quality papers to the graph. This expands citation genealogy without the full cost of depth-2 exploration.

**Implementation:**

```python
# After collecting depth-1 references:
top_refs_by_influence = sorted(depth1_refs, key=lambda p: p.citation_count, reverse=True)[:10]

# Fetch their references (depth-1.5)
depth_1_5_papers = []
for ref in top_refs_by_influence:
    additional = await s2_client.get_references(ref.paper_id, limit=5)
    depth_1_5_papers.extend(additional)

# Deduplicate and add to graph
```

**Constraints:**
- S2 API enforces 1 RPS for authenticated clients. Fetching 10 additional reference lists requires 10 sequential API calls = ~10 seconds added latency.
- Mitigation: enforce a hard cap of 10 depth-1.5 calls, run them concurrently with a semaphore limiting to 2 simultaneous requests, and set a per-call timeout of 3 seconds.
- This adds roughly 5–8 seconds to response time. Requires a loading state indicator on the frontend for the extended fetch.

**Impact:** Richer citation genealogy, improved cluster quality for foundational papers that have well-established prior art.

**Estimated complexity:** High — S2 API rate management, timeout handling, partial result assembly, frontend loading state.

### Supply vs Demand Analysis

**Description:** Identify research gaps where citation demand (papers citing a topic) significantly exceeds supply (papers addressing the topic). Requires depth-2 data for reliable directional signal.

**Dependency:** Requires depth-1.5 or depth-2 sampling to be implemented first. The directional asymmetry signal is weak at depth-1.

**Estimated complexity:** High — depends on depth-1.5 completion, new gap dimension computation, frontend visualization.

### Semantic Scholar Recommendations API Integration

**Description:** Use the S2 Recommendations API (`GET /recommendations/v1/papers/forpaper/{paper_id}`) to surface papers that S2's internal model considers relevant to the seed, regardless of direct citation links.

**Use case:** Discover influential adjacent papers that the citation network alone would miss — particularly important for emerging topics where citation links haven't accumulated yet.

**Estimated complexity:** Medium — new S2 client method, response integration into graph nodes.

### Vector Similarity Search

**Description:** A "Find Similar Papers" feature that queries the PostgreSQL pgvector index for papers semantically closest to a selected node.

**Implementation:**

```sql
SELECT id, title, year, citation_count
FROM papers
WHERE s2_paper_id != $1
ORDER BY embedding <=> (SELECT embedding FROM papers WHERE s2_paper_id = $1)
LIMIT 20;
```

**Constraint:** Only papers already cached in the local `papers` table are searchable. Cold-start performance depends on how many papers have been previously explored.

**Estimated complexity:** Low — SQL query, new API endpoint, frontend result panel.

---

## v4.x — Long-term (Platform Evolution)

**Theme:** Transform ScholarGraph3D from an exploration tool into a collaborative research platform.

### Multi-seed Collaboration Mode

**Description:** Allow multiple users to explore the same graph simultaneously, with real-time node selection and annotation sharing via WebSocket.

**Technical requirements:**
- WebSocket connection management (FastAPI WebSockets)
- Shared graph session state (Redis pub/sub or PostgreSQL LISTEN/NOTIFY)
- Conflict resolution for concurrent selections
- User presence indicators in the 3D view

**Estimated complexity:** Very high — new infrastructure, real-time coordination, significant frontend state refactor.

### Temporal Evolution View

**Description:** An animated playback mode that shows the citation graph growing year by year. Papers appear as they are published; citation edges form when the citing paper is published.

**Technical requirements:**
- Frontend animation loop keyed on `paper.year`
- Year slider control integrated with the existing graph state
- Three.js animation manager extension for per-node appearance effects

**Estimated complexity:** High — animation system, timeline scrubber component, performance optimization for large year ranges.

### LLM-Powered Gap Synthesis

**Description:** Replace the current heuristic gap scoring with a full Groq-powered narrative per gap — not just research questions, but a complete synthesis of what each gap represents, what methodological approaches could address it, and what existing work comes closest to bridging it.

**Current state:** The v3.3.0 gap report already calls Groq for narrative sections. This feature would expand the depth and context of that synthesis, using paper TLDRs, citation intent data, and the silhouette-scored cluster quality as additional LLM context.

**Constraint:** Groq LLaMA 3.3-70b rate limit is 28 RPM. Full synthesis for 5 gaps would require 5 LLM calls, taking 10–15 seconds and consuming a significant portion of the rate limit.

**Estimated complexity:** Medium — prompt engineering, rate limit management, frontend rendering for richer narrative output.

### Export to Obsidian / Roam

**Description:** Export the current citation graph as a knowledge graph file compatible with Obsidian (Markdown + wikilinks) or Roam Research (JSON).

**Format:**
- Obsidian: one `.md` file per paper, with `[[wikilinks]]` for each citation edge and metadata frontmatter (year, authors, DOI, TLDR, cluster label)
- Roam: nested block structure with paper titles as pages and citations as block references

**Estimated complexity:** Low — pure data transformation, new export function in `lib/export.ts`, download trigger.

---

## Known Technical Debt

These issues are documented for awareness. They do not block current features but will constrain future development if not addressed.

| # | Issue | Impact | Priority |
|---|-------|--------|----------|
| TD-1 | **Gap arc `TubeGeometry` replacement** | Current `LineBasicMaterial` ignores `lineWidth > 1` in WebGL; arc thickness encoding is blocked | Medium — unblocks v3.8.0 gap arc thickness feature |
| TD-2 | **S2 API 1 RPS cap** | Limits depth-1.5 sampling to ~10 additional papers feasibly within timeout; depth-2 is impractical without S2 partnership or rate limit upgrade | High — blocks Supply vs Demand analysis |
| TD-3 | **Cache schema versioning** | Current `:v3.7.0` key suffix requires a manual update every release that changes response structure; easy to forget | Low — causes stale cache reads if missed |
| TD-4 | **Direction field accuracy at depth-1 only** | `citation_pairs` currently tracks only direct seed references/citations; multi-hop papers receive `direction=""`. Depth-1.5 would provide richer directional signal | Low — affects UX completeness, not correctness |
| TD-5 | **Silhouette score O(N²) cost** | `sample_size=min(500, N)` mitigates the worst case, but for graphs consistently above 500 papers, the sample introduces variance. A deterministic stratified sample would be more stable | Low — affects diagnostic accuracy for large graphs |
| TD-6 | **Three.js pinned at 0.152.2** | ESM compatibility constraint prevents upgrading to Three.js 0.16x+, which includes performance improvements and new geometry APIs needed for `TubeGeometry` LOD | Medium — blocks some rendering improvements |

---

## What Was Not Completed in v3.7.0

The following items were part of the original v3.7.0 planning session but were explicitly deferred to future releases. They are recorded here to prevent duplicate planning effort.

### Deferred from the v3.7.0 Implementation Plan

| Item | Reason | Target |
|------|---------|--------|
| 2D Cluster Map diagnostic panel | Requires new d3.js scatter component (~200 lines), separate PR effort from the core bug-fix session | v3.7.1 |
| Depth-1.5 sampling (top-10 references' references) | S2 API 1 RPS cap + 10-second latency addition + timeout pressure made it incompatible with the current single-request architecture | v4.0 |
| Gap arc lineWidth proportional to `gap_strength` | `THREE.Line` + `LineBasicMaterial` ignores `lineWidth > 1` in WebGL; requires `TubeGeometry` which needs a separate LOD design | v4.0 |
| SPECTER2 TF-IDF full fallback for unclustered papers | Embedding dimension mismatch (768D SPECTER2 vs 50D UMAP space) creates unsafe cosine comparisons; centroid round-robin is safer and simpler | v4.0 |

### Deferred from "Additional Suggestions" in the v3.7.0 Session

| Item | Target |
|------|--------|
| 2D Cluster Map visualization | v3.7.1 |
| Depth-1.5 citation genealogy | v4.0 |
| Gap arc thickness via `gap_strength` | v4.0 |
| Cache TTL redesign (automated versioning) | v3.8.0 (Cache Invalidation Strategy) |

None of the "Additional Suggestions" items were implemented in v3.7.0.

---

## Release Summary Table

| Version | Theme | Key Features | Status |
|---------|-------|-------------|--------|
| v3.7.0 | Rendering Diagnostic & Structural Improvements | Adaptive UMAP, temporal Z skip, silhouette score, direction field + tint, centroid placement, gap arc | Released 2026-02-27 |
| v3.7.1 | Diagnostic Tooling | 2D Cluster Map panel | Planned |
| v3.8.0 | Visual Refinement | Gap arc thickness (TubeGeometry), direction filter, cache invalidation | Planned |
| v4.0.0 | Depth & Intelligence | Depth-1.5, Supply vs Demand, S2 Recommendations, vector similarity search | Planned |
| v4.x | Platform Evolution | Multi-seed collaboration, temporal evolution view, LLM gap synthesis, Obsidian/Roam export | Future |

---

*For the current release design, see [SDD_v3.7.0.md](./SDD_v3.7.0.md). For the v3.7.0 release notes, see [RELEASE_v3.7.0.md](./RELEASE_v3.7.0.md).*
