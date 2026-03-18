# 3D Foundation + Gap Visualization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a gap between two clusters is activated, show each cluster's shared foundations (commonly cited papers) as highlighted nodes in 3D space, with a compact info card at the arc midpoint showing both clusters' intellectual bases and cross-citation density.

**Architecture:** Extend the existing `updateGapArc()` pipeline in `graphEffects.ts` to compute foundations and render them as glow rings + labels in Three.js. Wire the GapSpotterPanel to trigger `setHighlightedClusterPair` on click, activating the 3D visualization. Add `foundationPaperIds` to the store so `useGraphRenderer` can visually distinguish foundation nodes.

**Tech Stack:** Three.js (raw, via react-force-graph-3d scene), Zustand store, Canvas sprites for labels

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/components/graph/graphEffects.ts` | Modify | Add foundation computation + 3D rendering to `updateGapArc()` |
| `frontend/components/graph/GapSpotterPanel.tsx` | Modify | Wire gap click → `setHighlightedClusterPair` |
| `frontend/hooks/useGraphStore.ts` | Modify | Add `foundationPaperIds` state |
| `frontend/components/graph/useGraphRenderer.ts` | Modify | Visual treatment for foundation nodes |
| `frontend/components/graph/ScholarGraph3D.tsx` | Modify | Pass `foundationPaperIds` to renderer, add ref for foundation group |

---

### Task 1: Wire GapSpotterPanel to trigger 3D gap visualization

**Files:**
- Modify: `frontend/components/graph/GapSpotterPanel.tsx`

- [ ] **Step 1: Add store actions to GapSpotterPanel**

In `GapSpotterPanel.tsx`, add `setHighlightedClusterPair` and `highlightedClusterPair` to the destructured store values (line 9-14):

```tsx
const {
  gaps,
  graphData,
  selectPaper,
  setPanelSelectionId,
  setHighlightedClusterPair,
  highlightedClusterPair,
} = useGraphStore();
```

- [ ] **Step 2: Pass props to GapCard**

Update the `GapCard` call (line 44-51) and interface (line 60-65) to include the new props:

```tsx
// In GapCardProps interface, add:
setHighlightedClusterPair: (pair: [number, number] | null) => void;
highlightedClusterPair: [number, number] | null;

// In the map, pass them:
<GapCard
  key={gap.gap_id}
  gap={gap}
  graphData={graphData!}
  selectPaper={selectPaper}
  setPanelSelectionId={setPanelSelectionId}
  setHighlightedClusterPair={setHighlightedClusterPair}
  highlightedClusterPair={highlightedClusterPair}
/>
```

- [ ] **Step 3: Toggle highlightedClusterPair on gap card click**

In the `GapCard` component, modify the header button `onClick` (line 84) to also toggle the 3D visualization:

```tsx
onClick={() => {
  const newExpanded = !expanded;
  setExpanded(newExpanded);
  if (newExpanded) {
    setHighlightedClusterPair([gap.cluster_a.id, gap.cluster_b.id]);
  } else {
    setHighlightedClusterPair(null);
  }
}}
```

- [ ] **Step 4: Visual indicator for active gap**

Add a left border highlight when this gap's cluster pair is active. In the GapCard root div (line 79), add a conditional style:

```tsx
const isActive = highlightedClusterPair &&
  ((highlightedClusterPair[0] === gap.cluster_a.id && highlightedClusterPair[1] === gap.cluster_b.id) ||
   (highlightedClusterPair[0] === gap.cluster_b.id && highlightedClusterPair[1] === gap.cluster_a.id));

<div className="hud-panel-clean rounded-lg" style={isActive ? { borderLeft: '2px solid #D4AF37' } : undefined}>
```

- [ ] **Step 5: Verify lint passes**

Run: `cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend" && npx next lint --quiet`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/components/graph/GapSpotterPanel.tsx
git commit -m "feat: wire GapSpotterPanel to trigger 3D gap arc visualization"
```

---

### Task 2: Add foundationPaperIds to store

**Files:**
- Modify: `frontend/hooks/useGraphStore.ts`

- [ ] **Step 1: Add state and action to the store interface**

In the `GraphStore` interface (after `hoveredGapEdges` around line 53), add:

```typescript
foundationPaperIds: Set<string>;
setFoundationPaperIds: (ids: Set<string>) => void;
```

- [ ] **Step 2: Add defaults and implementation**

In the `create<GraphStore>` body, add the defaults (near line 136):

```typescript
foundationPaperIds: new Set<string>(),
setFoundationPaperIds: (ids: Set<string>) => set({ foundationPaperIds: ids }),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/hooks/useGraphStore.ts
git commit -m "feat: add foundationPaperIds state to graph store"
```

---

### Task 3: Compute foundations and render in 3D

**Files:**
- Modify: `frontend/components/graph/graphEffects.ts`

This is the main task. Extend `updateGapArc()` to compute shared foundations for both clusters and render them in the 3D scene.

- [ ] **Step 1: Add foundationHighlightsRef to GapArcParams**

Update the `GapArcParams` interface (line 414-421) to include new refs and a callback:

```typescript
export interface GapArcParams {
  fgRef: React.MutableRefObject<any>;
  gapArcRef: React.MutableRefObject<THREE.Line | null>;
  gapArcGlowRef: React.MutableRefObject<THREE.Sprite | null>;
  gapVoidRef: React.MutableRefObject<THREE.Group | null>;
  foundationGroupRef: React.MutableRefObject<THREE.Group | null>;
  highlightedClusterPair: [number, number] | null;
  graphData: GraphData | null;
  forceGraphNodes: ForceGraphNode[];
  onFoundationsComputed?: (ids: Set<string>) => void;
}
```

- [ ] **Step 2: Add foundation computation helper**

Add this function BEFORE `updateGapArc` (around line 412):

```typescript
interface FoundationPaper {
  nodeId: string;
  title: string;
  year: number;
  count: number;
  total: number;
  position: THREE.Vector3;
}

function computeClusterFoundations(
  clusterId: number,
  graphData: GraphData,
  nodePositions: Map<string, THREE.Vector3>,
  maxResults: number = 3,
): FoundationPaper[] {
  const clusterPapers = graphData.nodes.filter(n => n.cluster_id === clusterId);
  const clusterPaperIds = new Set(clusterPapers.map(n => n.id));
  const clusterSize = clusterPaperIds.size;
  if (clusterSize < 3) return [];

  // Count how many cluster papers cite each target
  const citedByCount = new Map<string, number>();
  graphData.edges.forEach(e => {
    if (e.type === 'citation' && clusterPaperIds.has(e.source)) {
      citedByCount.set(e.target, (citedByCount.get(e.target) || 0) + 1);
    }
  });

  return Array.from(citedByCount.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .map(([id, count]) => {
      const paper = graphData.nodes.find(n => n.id === id);
      const pos = nodePositions.get(id);
      if (!paper || !pos) return null;
      const authorName = paper.authors?.[0]?.name?.split(' ').pop() || '';
      return {
        nodeId: id,
        title: `${authorName} ${paper.year || ''}`,
        year: paper.year,
        count,
        total: clusterSize,
        position: pos,
      };
    })
    .filter((f): f is FoundationPaper => f !== null);
}
```

- [ ] **Step 3: Add foundation group cleanup to updateGapArc**

At the top of `updateGapArc`, after the void cleanup block (after line 479), add cleanup for the foundation group:

```typescript
// Remove existing foundation highlights
if (foundationGroupRef.current) {
  scene.remove(foundationGroupRef.current);
  const fGroup = foundationGroupRef.current;
  foundationGroupRef.current = null;
  requestAnimationFrame(() => {
    fGroup.traverse((child) => {
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
          manager.deregisterShaderMaterial(child.material);
        }
        (child as any).material.dispose();
      }
    });
  });
}
```

Also update the early return (line 481) to clear foundations:

```typescript
if (!highlightedClusterPair || !graphData) {
  onFoundationsComputed?.(new Set());
  return;
}
```

- [ ] **Step 4: Build node position map from forceGraphNodes**

After the centroid calculations (after line 499), add:

```typescript
// Build position map from force graph nodes
const nodePositions = new Map<string, THREE.Vector3>();
forceGraphNodes.forEach(n => {
  if (n.x !== undefined) {
    nodePositions.set(n.id, new THREE.Vector3(n.x, n.y, n.z));
  }
});
```

- [ ] **Step 5: Compute foundations for both clusters and notify store**

After the node position map, add:

```typescript
// Compute shared foundations for both clusters
const foundationsA = computeClusterFoundations(cidA, graphData, nodePositions, 3);
const foundationsB = computeClusterFoundations(cidB, graphData, nodePositions, 3);

// Notify store about foundation paper IDs for visual highlighting
const allFoundationIds = new Set<string>([
  ...foundationsA.map(f => f.nodeId),
  ...foundationsB.map(f => f.nodeId),
]);
onFoundationsComputed?.(allFoundationIds);
```

- [ ] **Step 6: Render foundation glow rings and labels**

After the gap void creation (after line 596), add the foundation visualization:

```typescript
// Foundation highlights group
const foundationGroup = new THREE.Group();
foundationGroup.name = 'foundation-highlights';

const clusterAColor = clusterA.color || CLUSTER_COLORS[cidA % CLUSTER_COLORS.length];
const clusterBColor = clusterB.color || CLUSTER_COLORS[cidB % CLUSTER_COLORS.length];

const renderFoundation = (f: FoundationPaper, clusterColor: string) => {
  // Glow ring around foundation node
  const ringGeo = new THREE.RingGeometry(f.count / f.total * 6 + 3, f.count / f.total * 6 + 4, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(clusterColor),
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(f.position);
  ring.lookAt(fgRef.current?.camera()?.position || new THREE.Vector3(0, 0, 100));
  ring.userData.isFoundationRing = true;
  foundationGroup.add(ring);

  // Label sprite: "Author Year · N/M"
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    canvas.width = 256;
    canvas.height = 48;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    // Rounded rect background
    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(canvas.width - radius, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
    ctx.lineTo(canvas.width, canvas.height - radius);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
    ctx.lineTo(radius, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Left color bar
    ctx.fillStyle = clusterColor;
    ctx.fillRect(0, 0, 4, canvas.height);

    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.title, 12, 24);

    ctx.font = '14px Arial, sans-serif';
    ctx.fillStyle = clusterColor;
    ctx.textAlign = 'right';
    ctx.fillText(`${f.count}/${f.total}`, canvas.width - 8, 24);

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    );
    sprite.scale.set(35, 7, 1);
    sprite.position.copy(f.position);
    sprite.position.y += 8;
    foundationGroup.add(sprite);
  }
};

foundationsA.forEach(f => renderFoundation(f, clusterAColor));
foundationsB.forEach(f => renderFoundation(f, clusterBColor));
```

- [ ] **Step 7: Render Gap Brief card at arc midpoint**

After rendering foundations, replace the existing gap void marker (question mark) with a gap brief. Add this code right after the foundation rendering:

```typescript
// Gap Brief card at arc midpoint (replaces question mark)
const crossEdges = graphData.edges.filter(e =>
  (graphData.nodes.find(n => n.id === e.source)?.cluster_id === cidA &&
   graphData.nodes.find(n => n.id === e.target)?.cluster_id === cidB) ||
  (graphData.nodes.find(n => n.id === e.source)?.cluster_id === cidB &&
   graphData.nodes.find(n => n.id === e.target)?.cluster_id === cidA)
).length;
const papersACount = graphData.nodes.filter(n => n.cluster_id === cidA).length;
const papersBCount = graphData.nodes.filter(n => n.cluster_id === cidB).length;
const maxPossible = papersACount * papersBCount;

const briefCanvas = document.createElement('canvas');
const briefCtx = briefCanvas.getContext('2d');
if (briefCtx) {
  briefCanvas.width = 400;
  briefCanvas.height = 200;

  // Background
  briefCtx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  briefCtx.beginPath();
  const br = 10;
  briefCtx.moveTo(br, 0);
  briefCtx.lineTo(briefCanvas.width - br, 0);
  briefCtx.quadraticCurveTo(briefCanvas.width, 0, briefCanvas.width, br);
  briefCtx.lineTo(briefCanvas.width, briefCanvas.height - br);
  briefCtx.quadraticCurveTo(briefCanvas.width, briefCanvas.height, briefCanvas.width - br, briefCanvas.height);
  briefCtx.lineTo(br, briefCanvas.height);
  briefCtx.quadraticCurveTo(0, briefCanvas.height, 0, briefCanvas.height - br);
  briefCtx.lineTo(0, br);
  briefCtx.quadraticCurveTo(0, 0, br, 0);
  briefCtx.closePath();
  briefCtx.fill();

  // Border
  briefCtx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
  briefCtx.lineWidth = 1;
  briefCtx.stroke();

  let y = 24;

  // Cluster pair header
  briefCtx.font = 'bold 16px Arial, sans-serif';
  const labelA = clusterA.label.length > 18 ? clusterA.label.slice(0, 16) + '..' : clusterA.label;
  const labelB = clusterB.label.length > 18 ? clusterB.label.slice(0, 16) + '..' : clusterB.label;

  briefCtx.fillStyle = clusterAColor;
  briefCtx.textAlign = 'left';
  briefCtx.fillText(`${labelA} (${papersACount})`, 16, y);
  y += 20;

  briefCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  briefCtx.font = '12px Arial, sans-serif';
  briefCtx.fillText(`↕ ${crossEdges} / ${maxPossible} cross-citations`, 16, y);
  y += 20;

  briefCtx.font = 'bold 16px Arial, sans-serif';
  briefCtx.fillStyle = clusterBColor;
  briefCtx.fillText(`${labelB} (${papersBCount})`, 16, y);
  y += 28;

  // Divider
  briefCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  briefCtx.beginPath();
  briefCtx.moveTo(16, y);
  briefCtx.lineTo(briefCanvas.width - 16, y);
  briefCtx.stroke();
  y += 16;

  // Foundations
  briefCtx.font = '11px Arial, sans-serif';
  if (foundationsA.length > 0) {
    briefCtx.fillStyle = clusterAColor;
    briefCtx.fillText(
      foundationsA.map(f => f.title).join(', '),
      16, y
    );
    y += 18;
  }
  if (foundationsB.length > 0) {
    briefCtx.fillStyle = clusterBColor;
    briefCtx.fillText(
      foundationsB.map(f => f.title).join(', '),
      16, y
    );
  }

  const briefTexture = new THREE.CanvasTexture(briefCanvas);
  const briefSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: briefTexture, transparent: true, depthTest: false })
  );
  briefSprite.scale.set(60, 30, 1);
  briefSprite.position.copy(mid);
  briefSprite.position.y += 15;
  foundationGroup.add(briefSprite);
}

scene.add(foundationGroup);
foundationGroupRef.current = foundationGroup;
```

- [ ] **Step 8: Add foundation ring billboarding to animation**

The foundation rings need to face the camera. Register an animation callback. After adding the foundation group to the scene:

```typescript
// Animate foundation rings to face camera (billboard)
const foundationAnimId = { value: 0 };
const animateFoundations = () => {
  foundationAnimId.value = requestAnimationFrame(animateFoundations);
  const camera = fgRef.current?.camera();
  if (!camera || !foundationGroupRef.current) return;
  foundationGroupRef.current.children.forEach((child: any) => {
    if (child.userData?.isFoundationRing) {
      child.lookAt(camera.position);
    }
  });
};
animateFoundations();

// Store the animation ID for cleanup
foundationGroup.userData.animFrameId = foundationAnimId;
```

- [ ] **Step 9: Update cleanup in updateGapArc early return and cleanupGraph**

In `cleanupGraph` function (line 799), add foundation group cleanup after the gap void cleanup block:

```typescript
// Cleanup foundation highlights
// (foundationGroupRef not passed to cleanupGraph currently, so this is handled by updateGapArc's own cleanup)
```

Actually, `cleanupGraph` doesn't have access to foundationGroupRef. The cleanup in Step 3 handles this via the `updateGapArc` call on unmount (when `highlightedClusterPair` becomes null). Add the animation frame cleanup to Step 3's cleanup block:

```typescript
// In the foundation group cleanup block (Step 3):
if (foundationGroupRef.current) {
  // Cancel animation frame
  const animId = foundationGroupRef.current.userData?.animFrameId;
  if (animId?.value) cancelAnimationFrame(animId.value);

  scene.remove(foundationGroupRef.current);
  const fGroup = foundationGroupRef.current;
  foundationGroupRef.current = null;
  requestAnimationFrame(() => {
    fGroup.traverse((child) => {
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
          manager.deregisterShaderMaterial(child.material);
        }
        (child as any).material.dispose();
      }
    });
  });
}
```

- [ ] **Step 10: Verify lint passes**

Run: `cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend" && npx next lint --quiet`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add frontend/components/graph/graphEffects.ts
git commit -m "feat: render foundation highlights and gap brief card in 3D scene"
```

---

### Task 4: Wire ScholarGraph3D to pass new params

**Files:**
- Modify: `frontend/components/graph/ScholarGraph3D.tsx`

- [ ] **Step 1: Add foundationGroupRef and import setFoundationPaperIds**

After the existing scene overlay refs (line 164), add:

```typescript
const foundationGroupRef = useRef<THREE.Group | null>(null);
```

Get `setFoundationPaperIds` from the store (add to the destructured values around line 129):

```typescript
const {
  // ... existing ...
  setFoundationPaperIds,
} = useGraphStore();
```

- [ ] **Step 2: Update the updateGapArc useEffect call**

Replace the `updateGapArc` call (lines 504-513) with:

```typescript
// Gap arc between highlighted cluster pair
useEffect(() => {
  updateGapArc({
    fgRef,
    gapArcRef,
    gapArcGlowRef,
    gapVoidRef,
    foundationGroupRef,
    highlightedClusterPair,
    graphData,
    forceGraphNodes: forceGraphData.nodes,
    onFoundationsComputed: setFoundationPaperIds,
  });
}, [highlightedClusterPair, graphData, fgMounted, forceGraphData.nodes, setFoundationPaperIds]);
```

- [ ] **Step 3: Pass foundationPaperIds to useGraphRenderer**

Add `foundationPaperIds` to the store destructuring and pass it to useGraphRenderer. In the useGraphStore destructuring, add:

```typescript
foundationPaperIds,
```

Then in the `useGraphRenderer` call, add the prop. (This requires Task 5 to be done first, but we add the prop here now.)

- [ ] **Step 4: Add foundationGroupRef to cleanupGraph**

Update the `cleanupGraph` call in the unmount effect to include foundationGroupRef. Find where `cleanupGraph` is called and add the ref:

```typescript
// In cleanupGraph refs parameter, foundationGroupRef is not needed because
// the updateGapArc cleanup handles it when highlightedClusterPair goes null.
// The useEffect cleanup for gap arc already handles this.
```

No change needed here — the `updateGapArc` cleanup on unmount handles the foundation group.

- [ ] **Step 5: Verify lint passes**

Run: `cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend" && npx next lint --quiet`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/components/graph/ScholarGraph3D.tsx
git commit -m "feat: wire foundation group ref and forceGraphNodes to gap arc effect"
```

---

### Task 5: Visual treatment for foundation nodes in renderer

**Files:**
- Modify: `frontend/components/graph/useGraphRenderer.ts`

- [ ] **Step 1: Add foundationPaperIds to params**

In the `UseGraphRendererParams` interface (line 10-29), add:

```typescript
foundationPaperIds: Set<string>;
```

And in the function destructuring (line 33-52), add it.

- [ ] **Step 2: Enhance foundation node opacity when gap is active**

In the `cosmicOpacity` calculation (lines 82-96), update the `highlightedClusterPair` block:

```typescript
if (highlightedClusterPair) {
  const [cidA, cidB] = highlightedClusterPair;
  const isInPairCluster = node.paper.cluster_id === cidA || node.paper.cluster_id === cidB;
  const isFoundation = foundationPaperIds.has(node.id);
  if (isFoundation) return 1;      // Foundation papers: full brightness
  if (isInPairCluster) return 0.8;  // Cluster papers: slightly dimmed
  return 0.05;                      // Others: very dim
}
```

- [ ] **Step 3: Show labels for foundation nodes**

In the `showLabel` condition (line 193-195), add foundation check:

```typescript
const isFoundation = foundationPaperIds.has(node.id);
const showLabel = showLabels && node.name && (
  isSelected || isHighlighted || isFoundation || node.citationPercentile > 0.8
);
```

- [ ] **Step 4: Verify lint passes**

Run: `cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend" && npx next lint --quiet`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/components/graph/useGraphRenderer.ts
git commit -m "feat: visually distinguish foundation nodes when gap is active"
```

---

### Task 6: Integration test and deploy

- [ ] **Step 1: Build check**

Run: `cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend" && npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Push and verify deployment**

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D"
git push origin main
```

Wait for Vercel deployment, then verify:
1. Navigate to deployed URL
2. Search for a seed paper and enter explore view
3. Click on SECTOR SCANNER → select a cluster → verify "Shared Foundations" section appears
4. Click on GAP SPOTTER tab → click a gap card → verify:
   - Gap arc appears in 3D between the two cluster centroids
   - Foundation nodes glow with cluster-colored rings
   - Foundation labels appear above nodes ("Author Year · N/M")
   - Gap Brief card appears at arc midpoint with both clusters' info
   - Other nodes dim to 0.05 opacity
5. Click the same gap card again → verify arc, foundations, and brief card disappear

- [ ] **Step 3: Tag release**

```bash
git tag -a v4.2.0 -m "v4.2.0: 3D foundation + gap visualization"
git push origin v4.2.0
```
