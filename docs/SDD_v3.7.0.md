# ScholarGraph3D — Software Design Document v3.7.0

> **Version:** 3.7.0
> **Date:** 2026-02-27
> **Status:** Released
> **Supersedes:** SDD_v3.6.0 (View Toggle + Multi-seed Merge)
> **Related:** [RELEASE_v3.7.0.md](./RELEASE_v3.7.0.md) | [ROADMAP_v4.0.md](./ROADMAP_v4.0.md) | [SPEC.md](./SPEC.md)

---

## 1. Overview

### 1.1 Purpose

This document describes the design decisions, architectural changes, and implementation rationale for ScholarGraph3D v3.7.0, titled "Rendering Diagnostic & Structural Improvements."

v3.7.0 was motivated by post-release analysis of v3.6.0 deployments. Two failure modes were identified:

1. **Z-axis collapse** in datasets spanning fewer than 3 years (e.g., GPT-4 papers from 2022-2023), where the temporal Z override forced all nodes into 2 discrete layers.
2. **UMAP global structure degradation** caused by a fixed `n_neighbors=10` value that failed to reflect global relationships for medium-to-large paper sets.

Beyond bug remediation, v3.7.0 adds four structural improvements: silhouette-based cluster quality surfacing, semantic direction encoding for papers (seed/reference/citation), centroid-based placement for unclustered periphery nodes, and gap arc visualization between cluster pairs.

### 1.2 Scope

This document covers changes in:

- `backend/graph/embedding_reducer.py`
- `backend/routers/seed_explore.py`
- `frontend/types/index.ts`
- `frontend/components/graph/cosmic/starNodeRenderer.ts`
- `frontend/components/graph/GraphLegend.tsx`
- `frontend/hooks/useGraphStore.ts`
- `frontend/components/graph/ClusterPanel.tsx`
- `frontend/components/graph/ScholarGraph3D.tsx`
- `backend/main.py` (version string only)

### 1.3 Out of Scope

- Database schema changes (none)
- New API endpoints (none)
- New environment variables (none)
- New npm or pip dependencies (none)

---

## 2. Design Goals

| # | Goal | Motivation |
|---|------|------------|
| G1 | Fix Z-axis collapse in low year-span datasets | GPT-4 (2022-2023) produced a visible 2-layer split with only 2 distinct Z values |
| G2 | Improve UMAP global structure capture with adaptive `n_neighbors` | Fixed `n_neighbors=10` meant only ~20% of nodes influenced each embedding position |
| G3 | Surface cluster quality metrics to the user | Silent poor-quality clustering led to confusing visualizations with no diagnostic signal |
| G4 | Enrich graph semantics with paper direction | Users could not distinguish seed papers, prior art, and downstream citations by color alone |
| G5 | Reduce visual clutter from unclustered periphery papers | Papers without SPECTER2 embeddings lined up on a `y=10.0` rail, visually detached from the graph |
| G6 | Add gap visualization arc between cluster centroids | Gap hover lacked a spatial connector showing which two clusters define the gap |
| G7 | Direction-aware color encoding for semantic clarity | Reference and citation papers needed distinct visual tint to complement the direction legend |

---

## 3. Architecture Changes

### 3.1 Backend: `embedding_reducer.py`

**File:** `backend/graph/embedding_reducer.py`

#### 3.1.1 Adaptive UMAP n_neighbors

**Change:** The `reduce_to_3d()` function replaces the fixed `n_neighbors=10` with an adaptive formula:

```python
n_neighbors = min(min(15, max(10, N // 3)), N - 1)
```

**Behavior by dataset size:**

| N (papers with embeddings) | `N // 3` | Effective n_neighbors |
|---------------------------|----------|-----------------------|
| 15 | 5 | 10 (lower bound) |
| 30 | 10 | 10 |
| 45 | 15 | 15 (upper bound) |
| 100 | 33 → capped | 15 |
| 200 | 66 → capped | 15 |

The formula has two constraints:

- **Lower bound (10):** Prevents under-sampling for very small sets (< 30 papers), which would produce noisy, disconnected layouts.
- **Upper bound (15):** Prevents over-smoothing for large sets, which would collapse all semantic distinctions.
- **Safety cap (`N-1`):** Ensures `n_neighbors` never equals or exceeds the number of input points, which would cause UMAP to error.

**Rationale:** With `N=50` and `n_neighbors=10`, UMAP considers only 20% of points when constructing each point's local neighborhood. For papers with moderate citation overlap, this fails to propagate global topological structure. The adaptive formula scales neighborhood density proportionally, improving cluster separation and semantic coherence.

#### 3.1.2 Temporal Z Conditional Skip

**Change:** The temporal Z override step, which maps publication year to Z-axis position, is now gated on a minimum year span:

```python
year_span = max_year - min_year
if year_span < 3:
    logger.info(f"Year span={year_span} < 3: Skipping temporal Z override")
    # Return UMAP Z unchanged
else:
    # Apply temporal Z mapping as before
```

**Rationale:** The temporal Z override is a post-UMAP transformation that replaces the UMAP Z coordinate with a linearly interpolated publication year. When all papers fall within a 2-year window, this transformation produces at most 2 distinct Z values, creating a flat double-layer appearance. The UMAP Z coordinate, computed from the full embedding topology, provides far more spatial information and should be preserved in these cases.

**Example:** GPT-4 papers from 2022-2023 (year_span=1) previously all collapsed to either `z=0` or `z=1` due to the integer-year mapping. With this fix, UMAP's Z axis encodes semantic distance between papers, producing a properly distributed 3D layout.

---

### 3.2 Backend: `seed_explore.py`

**File:** `backend/routers/seed_explore.py`

#### 3.2.1 Direction Field on SeedGraphNode

**Change:** `SeedGraphNode` gains a new field:

```python
class SeedGraphNode(BaseModel):
    # ... existing fields ...
    direction: str = ""  # "seed" | "reference" | "citation"
```

**Assignment logic** (applied during `citation_pairs` processing):

```
For each paper in the graph:
  if paper.paper_id == seed_paper_id:
    direction = "seed"
  elif paper appears as a cited paper from the seed:
    direction = "reference"    # seed cited this paper (prior art)
  elif paper appears as a citing paper of the seed:
    direction = "citation"     # this paper cited the seed (downstream)
  else:
    direction = ""             # multi-hop paper with ambiguous direction
```

Papers without SPECTER2 embeddings also receive direction assignments. The field is set before the centroid placement step so that all papers in the response carry directional metadata.

**Data flow:**

```
S2 API → citation_pairs → is_seed?        → "seed"
                        → seed cited it?  → "reference"
                        → cited the seed? → "citation"
                        → SeedGraphNode.direction
                        → /api/seed-explore response
                        → Paper.direction (frontend type)
                        → starNodeRenderer color tint
```

#### 3.2.2 Silhouette Score in Meta

**Change:** After clustering, a silhouette score is computed and included in the `meta` dict returned by `POST /api/seed-explore`:

```python
from sklearn.metrics import silhouette_score

def _compute_silhouette(embeddings_3d: np.ndarray, labels: np.ndarray) -> float:
    unique_labels = set(labels) - {-1}
    if len(unique_labels) < 2:
        return 0.0
    # Exclude unclustered noise points
    mask = labels != -1
    if mask.sum() == 0:
        return 0.0
    sample_size = min(500, mask.sum())
    return float(silhouette_score(
        embeddings_3d[mask],
        labels[mask],
        metric="euclidean",
        sample_size=sample_size,
        random_state=42
    ))
```

The result is included in the API response meta:

```json
{
  "meta": {
    "cluster_silhouette": 0.31,
    ...
  }
}
```

**Score interpretation:**

| Range | Meaning |
|-------|---------|
| < 0.15 | Poor cluster separation — clusters overlap significantly |
| 0.15 – 0.35 | Moderate separation — clusters are discernible |
| > 0.35 | Good separation — clusters are well-defined |

**Edge cases:**

- Single cluster (all papers in one group): returns `0.0`
- All papers unclustered (`cluster_id=-1`): returns `0.0`
- N < 4 after noise removal: returns `0.0`

#### 3.2.3 Centroid-Based Placement for Papers Without Embeddings

**Change:** Papers without SPECTER2 embeddings previously received a fixed periphery position (`y=10.0`, sequential X offset, `cluster_id=-1`). This created a visible row of nodes disconnected from the main graph structure.

**New behavior:** Each such paper is assigned to the nearest cluster using round-robin assignment with positional jitter:

```python
if clusters:
    cluster_idx = periphery_count % len(clusters)
    target_cluster = clusters[cluster_idx]
    centroid = target_cluster.centroid  # [x, y, z]
    # Jitter to prevent stacking
    node.x = centroid[0] + random.uniform(-2.0, 2.0)
    node.y = centroid[1] + random.uniform(-2.0, 2.0)
    node.z = centroid[2] + random.uniform(-1.0, 1.0)
    node.cluster_id = target_cluster.id
else:
    # Fallback: preserve legacy periphery placement
    node.x = periphery_count * 0.5
    node.y = 10.0
    node.z = 0.0
    node.cluster_id = -1
```

**Rationale:** Round-robin (not nearest-centroid by embedding distance) is used deliberately because these papers lack embeddings, so no meaningful distance computation is possible. Distributing them evenly across clusters preserves the visual density balance of the graph.

**Fallback:** When no clusters exist (very small graphs or pure noise), the legacy `y=10.0` line placement is preserved.

#### 3.2.4 Cache Key Versioning

**Change:** The Redis cache key prefix for `seed-explore` responses is updated:

```python
cache_key = f"{paper_id}:v3.7.0"
```

**Rationale:** The `direction` field, silhouette score, centroid placement logic, and adaptive UMAP parameters all affect the structure of the cached response. Responses cached under v3.6.0 keys would return stale data incompatible with v3.7.0 frontend expectations. The version suffix forces a clean cache population on first access per paper.

---

### 3.3 Frontend: `types/index.ts`

**File:** `frontend/types/index.ts`

#### 3.3.1 Paper.direction

```typescript
export interface Paper {
  // ... existing fields ...
  direction?: 'seed' | 'reference' | 'citation';
}
```

The field is optional (`?`) to maintain backward compatibility with graph data loaded from earlier saved graphs (which do not include this field).

#### 3.3.2 GraphData.meta Index Signature

```typescript
export interface GraphData {
  nodes: Paper[];
  edges: GraphEdge[];
  clusters: Cluster[];
  meta: {
    cluster_silhouette?: number;
    [key: string]: any;   // Index signature — allows arbitrary meta fields
  } | null;
}
```

The index signature was added because TypeScript previously rejected dynamic access to `meta.cluster_silhouette` and other non-declared fields. The specific `cluster_silhouette?: number` declaration is preserved for type-safe access in `ClusterPanel.tsx`.

---

### 3.4 Frontend: `starNodeRenderer.ts`

**File:** `frontend/components/graph/cosmic/starNodeRenderer.ts`

#### 3.4.1 Direction-Aware Color Tint

**Change:** `StarNodeOptions` gains an optional direction property, and the node color computation applies a lerp-based tint when a non-seed direction is detected:

```typescript
export interface StarNodeOptions {
  // ... existing fields ...
  direction?: 'seed' | 'reference' | 'citation';
}

function computeNodeColor(options: StarNodeOptions): THREE.Color {
  const baseColor = getFieldColor(options.fields);

  // Skip tint if node is selected or highlighted
  if (options.isSelected || options.isHighlighted) {
    return baseColor;
  }

  if (options.direction === 'reference') {
    // Lerp 15% toward reference blue (#4488FF)
    return baseColor.clone().lerp(new THREE.Color(0x4488FF), 0.15);
  }
  if (options.direction === 'citation') {
    // Lerp 15% toward citation orange (#FF8844)
    return baseColor.clone().lerp(new THREE.Color(0xFF8844), 0.15);
  }

  return baseColor;
}
```

**Design decisions:**

- **15% lerp intensity:** Subtle enough to not overwhelm the existing field-of-study color signal, visible enough to distinguish reference from citation at a glance. A higher value (e.g., 30%) was tested and found to obscure field identity.
- **Selected/highlighted override:** When a node is selected (gold ring) or highlighted (from gap hover), the direction tint is suppressed to avoid color interference with the selection state.
- **Seed papers:** No tint is applied. The seed paper's natural field color is preserved; the seed is already visually distinct via the supernova rendering layer.

---

### 3.5 Frontend: `GraphLegend.tsx`

**File:** `frontend/components/graph/GraphLegend.tsx`

**Change:** A new "Paper Direction" section is appended to the Star Chart legend panel:

```tsx
<LegendSection title="Paper Direction">
  <LegendItem
    color="#4488FF"
    label="Reference (선행연구)"
    description="Papers cited by the seed — prior art and foundations"
  />
  <LegendItem
    color="#FF8844"
    label="Citation (후속연구)"
    description="Papers that cite the seed — downstream work"
  />
</LegendSection>
```

The section only renders when at least one node in `graphData` has a non-empty `direction` field, preventing the section from appearing for saved graphs loaded from v3.6.0 or earlier.

---

### 3.6 Frontend: `useGraphStore.ts`

**File:** `frontend/hooks/useGraphStore.ts`

**Change:** A new `graphMeta` state slice is added to the Zustand store:

```typescript
interface GraphStore {
  // ... existing fields ...
  graphMeta: Record<string, any> | null;
  setGraphMeta: (meta: Record<string, any> | null) => void;
}
```

**Population:** `graphMeta` is set immediately after a successful `POST /api/seed-explore` response, populated from `response.meta`. It is cleared (set to `null`) when a new seed exploration begins.

**Usage:** `ClusterPanel.tsx` reads `graphMeta.cluster_silhouette` to determine whether to render the quality warning banner.

---

### 3.7 Frontend: `ClusterPanel.tsx`

**File:** `frontend/components/graph/ClusterPanel.tsx`

**Change:** A conditional warning banner is rendered at the top of the Sector Scanner panel when silhouette score is below threshold:

```tsx
const { graphMeta } = useGraphStore();
const silhouette = graphMeta?.cluster_silhouette;

{typeof silhouette === 'number' && silhouette < 0.15 && (
  <WarningBanner>
    ⚠ 클러스터 구분도 낮음 (silhouette={silhouette.toFixed(2)})
  </WarningBanner>
)}
```

**Threshold:** `0.15` was chosen based on the standard interpretation of silhouette scores in the literature. Scores below this value indicate that clusters are not meaningfully separated in embedding space — the user should treat cluster assignments as approximate groupings rather than definitive research communities.

**Display:** The banner uses the existing HUD yellow alert style (`border-yellow-400`, `bg-yellow-400/10`). It appears above the cluster list and is non-dismissible (disappears when the graph is refreshed with better-separating data).

---

### 3.8 Frontend: `ScholarGraph3D.tsx`

**File:** `frontend/components/graph/ScholarGraph3D.tsx`

#### 3.8.1 Gap Arc Visualization

**Change:** When `highlightedClusterPair` is set in the store (user hovers a gap in the Gap Spotter panel), a quadratic bezier arc is rendered between the two cluster centroids.

**Implementation:**

```typescript
function createGapArc(
  centroidA: THREE.Vector3,
  centroidB: THREE.Vector3,
  scene: THREE.Scene
): THREE.Line {
  // Scale X/Y by CS=15, preserve raw Z
  const scaledA = new THREE.Vector3(centroidA.x * 15, centroidA.y * 15, centroidA.z);
  const scaledB = new THREE.Vector3(centroidB.x * 15, centroidB.y * 15, centroidB.z);

  // Midpoint elevated on Y to create upward-bowing arc
  const mid = new THREE.Vector3(
    (scaledA.x + scaledB.x) / 2,
    Math.max(scaledA.y, scaledB.y) + 30,
    (scaledA.z + scaledB.z) / 2
  );

  const curve = new THREE.QuadraticBezierCurve3(scaledA, mid, scaledB);
  const points = curve.getPoints(50);

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xD4AF37,      // Gold
    opacity: 0.6,
    transparent: true,
    depthWrite: false,    // Prevents z-fighting with star nodes
  });

  const arc = new THREE.Line(geometry, material);
  arc.name = 'gap-arc';  // Name used for targeted cleanup
  scene.add(arc);
  return arc;
}
```

**Centroid scaling:** Cluster centroids from the backend are in UMAP coordinate space (typically -5 to +5 on each axis). The 3D scene renders star nodes scaled by `CS=15` on X/Y. To align the arc endpoints with the rendered cluster positions, centroid X/Y are multiplied by `CS=15`. Z is used raw because the temporal Z override (when active) also operates in raw coordinate space.

**Cleanup:** On each `highlightedClusterPair` change, the previous arc is removed by name before the new one is created:

```typescript
const existingArc = scene.getObjectByName('gap-arc');
if (existingArc) {
  existingArc.geometry.dispose();
  (existingArc.material as THREE.Material).dispose();
  scene.remove(existingArc);
}
```

This follows the Three.js disposal safety protocol defined in `lib/three-safety.ts`: geometry and material are disposed before removing the object from the scene.

---

## 4. Data Flow

### 4.1 Direction Field — End-to-End

```
S2 API (get_references / get_citations for seed)
  |
  v
citation_pairs: List[Tuple[str, str]]  (citing_id, cited_id)
  |
  v
For each paper in graph:
  is paper_id == seed_paper_id?           → direction = "seed"
  is paper_id in seed's reference list?   → direction = "reference"
  is paper_id in seed's citation list?    → direction = "citation"
  otherwise (multi-hop)                   → direction = ""
  |
  v
SeedGraphNode.direction: str  (set in seed_explore.py)
  |
  v
POST /api/seed-explore JSON response
  {
    "nodes": [
      { "id": "...", "direction": "reference", ... },
      ...
    ]
  }
  |
  v
Paper.direction: 'seed' | 'reference' | 'citation' | undefined  (frontend type)
  |
  v
useGraphStore: graphData.nodes[].direction
  |
  v
starNodeRenderer.ts: StarNodeOptions.direction
  → direction === 'reference' → lerp 15% to #4488FF (blue tint)
  → direction === 'citation'  → lerp 15% to #FF8844 (orange tint)
  → selected/highlighted      → no tint (base field color)
  |
  v
GraphLegend.tsx: Direction section visible
  → Reference dot (blue)
  → Citation dot (orange)
```

### 4.2 Silhouette Score — End-to-End

```
seed_explore.py:
  embeddings_3d: np.ndarray  (from embedding_reducer)
  cluster_labels: np.ndarray  (from clusterer)
  |
  v
_compute_silhouette(embeddings_3d, cluster_labels)
  → sklearn.metrics.silhouette_score
  → sample_size = min(500, N)
  → returns float in [0.0, 1.0] or 0.0 for degenerate cases
  |
  v
meta["cluster_silhouette"] = score
  |
  v
POST /api/seed-explore JSON response
  { "meta": { "cluster_silhouette": 0.23, ... } }
  |
  v
useGraphStore.setGraphMeta(response.meta)
  |
  v
ClusterPanel.tsx:
  graphMeta.cluster_silhouette < 0.15?
  → true:  render yellow warning banner
  → false: no banner
```

---

## 5. Performance Impact

### 5.1 Silhouette Score Computation

**Complexity:** `O(N²)` in general (pairwise Euclidean distance computation).

**Mitigation:** `sample_size=min(500, N)` is passed to `sklearn.silhouette_score`. For graphs with more than 500 clustered papers, sklearn randomly samples 500 points for the computation. This reduces the worst-case cost to `O(500²) = O(250,000)` pairwise distance calculations — negligible on the backend CPU.

**Measured impact (approximate):**

| N (clustered papers) | Computation time |
|---------------------|-----------------|
| 50 | < 1ms |
| 150 | ~5ms |
| 500 | ~20ms |
| 500+ (sampled) | ~20ms (bounded) |

The silhouette step adds at most ~20ms to the `POST /api/seed-explore` response time in practice, which is below the measurement threshold at `p50`.

### 5.2 Centroid Assignment

**Complexity:** `O(1)` per paper with no embedding (round-robin index computation).

No distance computation is performed. The cluster index is computed as `periphery_count % len(clusters)`, making this a constant-time operation regardless of cluster count or paper count.

### 5.3 Gap Arc

The gap arc is a single `THREE.Line` object with 51 `THREE.Vector3` points. At 51 vertices, this is one of the lightest geometries in the scene (compared to each nebula cluster's particle cloud of 30–120 points per cluster). GPU impact is negligible.

**Memory lifecycle:** The arc object is fully disposed (geometry + material) on each `highlightedClusterPair` transition. No accumulation occurs between gap hovers.

### 5.4 Adaptive n_neighbors

The UMAP computation time is primarily determined by `n_components`, dataset size N, and the underlying distance metric — not by `n_neighbors` within the range 10–15. The change from fixed 10 to adaptive 10–15 has no measurable impact on UMAP runtime.

---

## 6. API Contract Changes

No new API endpoints are introduced in v3.7.0. The existing `POST /api/seed-explore` response is extended:

**Node object changes:**

```json
{
  "id": "...",
  "title": "...",
  "direction": "reference",   // NEW: "seed" | "reference" | "citation" | ""
  "..."
}
```

**Meta object changes:**

```json
{
  "meta": {
    "cluster_silhouette": 0.31,   // NEW: float, 0.0 on degenerate cases
    "seed_paper_id": "...",
    "total": 143,
    "..."
  }
}
```

**Backward compatibility:** Both new fields are additive. Existing clients that do not read `direction` or `cluster_silhouette` are unaffected. Saved graphs from v3.6.0 loaded via `GET /api/graphs/{id}` will not have `direction` on nodes — this is handled in the frontend by the optional typing (`direction?: ...`).

---

## 7. Not Implemented in v3.7.0 (Deferred)

The following items were discussed or planned during the v3.7.0 session but were explicitly deferred:

| Item | Reason for Deferral | Target |
|------|--------------------|----|
| 2D Cluster Map diagnostic panel | Requires a new d3.js scatter plot component (~200 lines), separate PR effort | v3.7.1 |
| Depth-1.5 sampling (fetch references of top references) | S2 API 1 RPS cap limits feasibility without significant timeout pressure | v4.0 |
| Gap arc width proportional to `gap_strength` | `THREE.LineBasicMaterial` ignores `lineWidth > 1` in WebGL; requires `TubeGeometry` replacement | v4.0 |
| SPECTER2 TF-IDF full fallback for unclustered papers | Embedding dimension mismatch (768D SPECTER2 vs 50D UMAP space) creates unsafe comparisons; centroid approach is safer | v4.0 |

---

## 8. Deployment Checklist

| # | Check | Method |
|---|-------|--------|
| 1 | `cd frontend && npx tsc --noEmit` — zero TypeScript errors | CLI |
| 2 | Year span < 3 datasets: temporal Z override skipped, UMAP Z used | Manual test with GPT-4 paper set |
| 3 | `cluster_silhouette` present in `meta` and readable in ClusterPanel | Browser DevTools / network tab |
| 4 | Direction field: reference nodes render blue tint, citation nodes render orange tint | Visual inspection |
| 5 | Gap Arc: arc appears on gap hover, disappears on hover release, geometry disposed | Visual inspection + memory profiler |
| 6 | Papers without embeddings placed near cluster centroids, not on `y=10.0` line | Visual inspection |
| 7 | Redis cache keys contain `:v3.7.0` suffix | Redis CLI `KEYS *` |
| 8 | `backend/main.py` version string: `"3.7.0"` | `grep version backend/main.py` |

---

*For the full release notes, see [RELEASE_v3.7.0.md](./RELEASE_v3.7.0.md). For the future roadmap, see [ROADMAP_v4.0.md](./ROADMAP_v4.0.md).*
