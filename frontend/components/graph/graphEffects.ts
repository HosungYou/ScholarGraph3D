/**
 * graphEffects.ts — Scene management functions (NOT hooks).
 *
 * These are plain functions called from useEffect bodies in ScholarGraph3D.
 * They receive scene refs and data; they do not call React hooks.
 */

import * as THREE from 'three';
import CosmicAnimationManager from './cosmic/CosmicAnimationManager';
import { createNebulaCluster } from './cosmic/nebulaClusterRenderer';
import { CLUSTER_COLORS } from './cosmic/cosmicConstants';
import type { GraphData } from '@/types';
import type { ForceGraphNode } from './ScholarGraph3D';

// ─── Convex Hull utility ────────────────────────────────────────────

export function computeConvexHull2D(
  points: THREE.Vector2[]
): THREE.Vector2[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (O: THREE.Vector2, A: THREE.Vector2, B: THREE.Vector2) =>
    (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
  const lower: THREE.Vector2[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: THREE.Vector2[] = [];
  for (const p of sorted.reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// ─── Cluster hull / nebula overlay ──────────────────────────────────

export interface ClusterOverlayParams {
  fgRef: React.MutableRefObject<any>;
  clusterOverlayRef: React.MutableRefObject<THREE.Group | null>;
  graphData: GraphData;
  forceGraphNodes: ForceGraphNode[];
  showCosmicTheme: boolean;
  showClusterHulls: boolean;
  hiddenClusterIds: Set<number>;
}

export function updateClusterOverlay({
  fgRef,
  clusterOverlayRef,
  graphData,
  forceGraphNodes,
  showCosmicTheme,
  showClusterHulls,
  hiddenClusterIds,
}: ClusterOverlayParams): (() => void) | undefined {
  const fgInstance = fgRef.current;

  if (!fgRef.current || !showClusterHulls || !graphData?.clusters.length) {
    if (clusterOverlayRef.current && fgRef.current) {
      try {
        fgRef.current.scene().remove(clusterOverlayRef.current);
      } catch {
        /* scene unavailable */
      }
      clusterOverlayRef.current = null;
    }
    return;
  }

  const scene = fgRef.current.scene();
  if (!scene) return;

  if (clusterOverlayRef.current) {
    scene.remove(clusterOverlayRef.current);
  }

  const overlayGroup = new THREE.Group();
  overlayGroup.name = 'cluster-hulls';
  clusterOverlayRef.current = overlayGroup;
  scene.add(overlayGroup);

  // Remove all children from scene immediately, defer dispose to next frame
  const toDispose = [...overlayGroup.children];
  toDispose.forEach((child) => overlayGroup.remove(child));
  requestAnimationFrame(() => {
    toDispose.forEach((child) => {
      if (child instanceof THREE.Group) {
        child.traverse((obj) => {
          if (obj instanceof THREE.Points && obj.material instanceof THREE.ShaderMaterial) {
            CosmicAnimationManager.getInstance().deregisterShaderMaterial(obj.material);
          }
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
            CosmicAnimationManager.getInstance().deregisterShaderMaterial(obj.material);
          }
          if ((obj as any).geometry) (obj as any).geometry.dispose();
          if ((obj as any).material) (obj as any).material.dispose();
        });
      } else {
        if (child instanceof THREE.Points && child.material instanceof THREE.ShaderMaterial) {
          CosmicAnimationManager.getInstance().deregisterShaderMaterial(child.material);
        }
        if ((child as any).geometry) (child as any).geometry.dispose();
        if ((child as any).material) (child as any).material.dispose();
      }
    });
  });

  // Use forceGraphData directly - d3-force mutates node positions in place
  if (!forceGraphNodes?.length) return;

  const nodePositions = new Map<string, { x: number; y: number; z: number }>();
  forceGraphNodes.forEach((n) => {
    if (n.x !== undefined && n.y !== undefined && n.z !== undefined) {
      nodePositions.set(n.id, { x: n.x, y: n.y, z: n.z });
    }
  });

  if (showCosmicTheme) {
    // Nebula clusters
    graphData.clusters.forEach((cluster) => {
      if (hiddenClusterIds.has(cluster.id)) return;
      const clusterNodes = graphData.nodes.filter((p) => p.cluster_id === cluster.id);
      const positions = clusterNodes
        .map((p) => nodePositions.get(p.id))
        .filter(Boolean) as { x: number; y: number; z: number }[];
      if (positions.length < 2) return;

      const CS_NEB = 15;
      const ZS_NEB = 10;
      const centroid = cluster.centroid
        ? { x: cluster.centroid[0] * CS_NEB, y: cluster.centroid[1] * CS_NEB, z: cluster.centroid[2] * ZS_NEB }
        : (() => {
            const avg = { x: 0, y: 0, z: 0 };
            positions.forEach((p) => { avg.x += p.x; avg.y += p.y; avg.z += p.z; });
            avg.x /= positions.length; avg.y /= positions.length; avg.z /= positions.length;
            return avg;
          })();

      const spread = positions.reduce((sum, p) => {
        return sum + Math.sqrt((p.x - centroid.x) ** 2 + (p.y - centroid.y) ** 2 + (p.z - centroid.z) ** 2);
      }, 0) / positions.length;

      const nebulaColor = cluster.id >= 0
        ? CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length]
        : cluster.color;
      const nebula = createNebulaCluster({
        color: nebulaColor,
        centroid,
        nodeCount: clusterNodes.length,
        spread: spread || 30,
      });
      overlayGroup.add(nebula);
    });
  } else {
    // Original hull code
    graphData.clusters.forEach((cluster) => {
      const clusterNodes = graphData.nodes.filter(
        (p) => p.cluster_id === cluster.id
      );
      const positions = clusterNodes
        .map((p) => nodePositions.get(p.id))
        .filter(Boolean) as { x: number; y: number; z: number }[];

      if (positions.length < 3) return;

      const centroidZ =
        positions.reduce((s, p) => s + p.z, 0) / positions.length;
      const points2D = positions.map(
        (p) => new THREE.Vector2(p.x, p.y)
      );
      const hull = computeConvexHull2D(points2D);
      if (hull.length < 3) return;

      const curve = new THREE.CatmullRomCurve3(
        hull.map((p) => new THREE.Vector3(p.x, p.y, centroidZ - 5)),
        true,
        'catmullrom',
        0.5
      );
      const curvePoints = curve.getPoints(hull.length * 8);
      const shape = new THREE.Shape(
        curvePoints.map((p) => new THREE.Vector2(p.x, p.y))
      );

      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(cluster.color),
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = centroidZ - 5;
      overlayGroup.add(mesh);
    });
  }

  return () => {
    if (clusterOverlayRef.current && fgInstance?.scene()) {
      try {
        fgInstance.scene().remove(clusterOverlayRef.current);
      } catch {
        /* scene unavailable */
      }
      clusterOverlayRef.current = null;
    }
  };
}

// ─── Gap overlay ────────────────────────────────────────────────────

export interface GapOverlayParams {
  fgRef: React.MutableRefObject<any>;
  gapOverlayRef: React.MutableRefObject<THREE.Group | null>;
  graphData: GraphData;
  forceGraphNodes: ForceGraphNode[];
  showGapOverlay: boolean;
}

export function updateGapOverlay({
  fgRef,
  gapOverlayRef,
  graphData,
  forceGraphNodes,
  showGapOverlay,
}: GapOverlayParams): (() => void) | undefined {
  const fgInstance = fgRef.current;

  if (!fgRef.current || !showGapOverlay || !graphData?.clusters.length) {
    if (gapOverlayRef.current && fgRef.current) {
      try { fgRef.current.scene().remove(gapOverlayRef.current); } catch {}
      gapOverlayRef.current = null;
    }
    return;
  }

  const scene = fgRef.current.scene();
  if (!scene) return;

  if (gapOverlayRef.current) scene.remove(gapOverlayRef.current);

  const overlayGroup = new THREE.Group();
  overlayGroup.name = 'gap-overlay';
  gapOverlayRef.current = overlayGroup;
  scene.add(overlayGroup);

  // Remove all from scene immediately, defer dispose to next frame
  const toDispose = [...overlayGroup.children];
  toDispose.forEach((child) => overlayGroup.remove(child));
  requestAnimationFrame(() => {
    toDispose.forEach((child) => {
      (child as any).geometry?.dispose();
      (child as any).material?.dispose();
    });
  });

  if (!forceGraphNodes?.length) return;

  const nodePositions = new Map<string, THREE.Vector3>();
  forceGraphNodes.forEach((n) => {
    if (n.x !== undefined) nodePositions.set(n.id, new THREE.Vector3(n.x, n.y, n.z));
  });

  // Compute cluster centroids from current positions
  const clusterCentroids = new Map<number, THREE.Vector3>();
  graphData.clusters.forEach((cluster) => {
    const clusterNodes = graphData.nodes.filter((p) => p.cluster_id === cluster.id);
    const positions = clusterNodes.map((p) => nodePositions.get(p.id)).filter(Boolean) as THREE.Vector3[];
    if (positions.length === 0) return;
    const centroid = new THREE.Vector3();
    positions.forEach((p) => centroid.add(p));
    centroid.divideScalar(positions.length);
    clusterCentroids.set(cluster.id, centroid);
  });

  // Draw gap lines between cluster pairs
  const clusters = graphData.clusters;
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const ca = clusters[i];
      const cb = clusters[j];
      const centA = clusterCentroids.get(ca.id);
      const centB = clusterCentroids.get(cb.id);
      if (!centA || !centB) continue;

      // Compute inter-cluster edge density
      const papersA = new Set(graphData.nodes.filter((p) => p.cluster_id === ca.id).map((p) => p.id));
      const papersB = new Set(graphData.nodes.filter((p) => p.cluster_id === cb.id).map((p) => p.id));
      const crossEdges = graphData.edges.filter(
        (e) =>
          (papersA.has(e.source) && papersB.has(e.target)) ||
          (papersB.has(e.source) && papersA.has(e.target))
      ).length;
      const maxPossible = papersA.size * papersB.size;
      const density = maxPossible > 0 ? crossEdges / maxPossible : 0;

      if (density >= 0.15) continue;

      const gapColor = density < 0.05 ? 0xFF4444 : density < 0.10 ? 0xD4AF37 : 0x44BB44;

      // Dashed line
      const points = [centA, centB];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineDashedMaterial({
        color: gapColor,
        dashSize: 6,
        gapSize: 4,
        transparent: true,
        opacity: 0.5,
      });
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      overlayGroup.add(line);

      // Pulsing hotspot at midpoint
      const mid = new THREE.Vector3().addVectors(centA, centB).multiplyScalar(0.5);
      const hotspotGeo = new THREE.SphereGeometry(3, 8, 8);
      const hotspotMat = new THREE.MeshBasicMaterial({
        color: gapColor,
        transparent: true,
        opacity: 0.6,
      });
      const hotspot = new THREE.Mesh(hotspotGeo, hotspotMat);
      hotspot.position.copy(mid);
      hotspot.userData.isPulsingHotspot = true;
      overlayGroup.add(hotspot);

      // Distance label at midpoint
      const dist = centA.distanceTo(centB);
      const distCanvas = document.createElement('canvas');
      const distCtx = distCanvas.getContext('2d');
      if (distCtx) {
        distCanvas.width = 96;
        distCanvas.height = 32;
        distCtx.fillStyle = `rgba(255, 255, 255, 0.5)`;
        distCtx.font = 'bold 16px Arial, sans-serif';
        distCtx.textAlign = 'center';
        distCtx.textBaseline = 'middle';
        distCtx.fillText(Math.round(dist).toString(), 48, 16);
        const distTexture = new THREE.CanvasTexture(distCanvas);
        const distSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: distTexture, transparent: true, depthTest: false })
        );
        distSprite.scale.set(20, 7, 1);
        distSprite.position.copy(mid);
        distSprite.position.y += 6;
        overlayGroup.add(distSprite);
      }
    }
  }

  // Cluster centroid markers
  clusterCentroids.forEach((centroid, clusterId) => {
    const cluster = graphData.clusters.find((c) => c.id === clusterId);
    if (!cluster) return;

    const markerGeo = new THREE.OctahedronGeometry(4, 0);
    const markerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cluster.color),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.copy(centroid);
    marker.userData.isCentroidMarker = true;
    overlayGroup.add(marker);
  });

  // Animate hotspots
  let animFrame: number;
  const animate = () => {
    animFrame = requestAnimationFrame(animate);
    const t = Date.now() * 0.003;
    overlayGroup.children.forEach((child: any) => {
      if (child.userData?.isPulsingHotspot) {
        const scale = 1 + Math.sin(t) * 0.3;
        child.scale.setScalar(scale);
      }
      if (child.userData?.isCentroidMarker) {
        child.rotation.y = t * 0.5;
        child.rotation.x = Math.sin(t * 0.3) * 0.2;
      }
    });
  };
  animate();

  return () => {
    cancelAnimationFrame(animFrame);
    if (gapOverlayRef.current && fgInstance?.scene()) {
      try { fgInstance.scene().remove(gapOverlayRef.current); } catch {}
      gapOverlayRef.current = null;
    }
  };
}

// ─── Gap camera fly-to (replaces full gap arc) ────────────────────

export interface GapArcParams {
  fgRef: React.MutableRefObject<any>;
  highlightedClusterPair: [number, number] | null;
  graphData: GraphData | null;
}

export function updateGapArc({
  fgRef,
  highlightedClusterPair,
  graphData,
}: GapArcParams): void {
  if (!fgRef.current || !highlightedClusterPair || !graphData) return;

  const [cidA, cidB] = highlightedClusterPair;
  const clusterA = graphData.clusters.find((c) => c.id === cidA);
  const clusterB = graphData.clusters.find((c) => c.id === cidB);
  if (!clusterA?.centroid || !clusterB?.centroid) return;

  const CS = 15;
  const ZS = 10;
  const centA = new THREE.Vector3(
    clusterA.centroid[0] * CS,
    clusterA.centroid[1] * CS,
    clusterA.centroid[2] * ZS,
  );
  const centB = new THREE.Vector3(
    clusterB.centroid[0] * CS,
    clusterB.centroid[1] * CS,
    clusterB.centroid[2] * ZS,
  );

  const lookAt = new THREE.Vector3(
    (centA.x + centB.x) / 2,
    (centA.y + centB.y) / 2,
    (centA.z + centB.z) / 2,
  );
  const dist = Math.max(centA.distanceTo(centB), 150);
  fgRef.current.cameraPosition(
    { x: lookAt.x + dist * 0.3, y: lookAt.y - dist * 0.6, z: lookAt.z + dist * 1.8 },
    { x: lookAt.x, y: lookAt.y, z: lookAt.z },
    1000
  );
}

// ─── Timeline labels and grid ───────────────────────────────────────

export interface TimelineOverlayParams {
  fgRef: React.MutableRefObject<any>;
  timelineOverlayRef: React.MutableRefObject<THREE.Group | null>;
  graphData: GraphData | null;
  showTimeline: boolean;
}

export function updateTimelineOverlay({
  fgRef,
  timelineOverlayRef,
  graphData,
  showTimeline,
}: TimelineOverlayParams): (() => void) | undefined {
  const fgInstance = fgRef.current;

  if (!fgRef.current || !graphData) {
    if (timelineOverlayRef.current && fgRef.current) {
      try { fgRef.current.scene().remove(timelineOverlayRef.current); } catch {}
      timelineOverlayRef.current = null;
    }
    return;
  }

  const scene = fgRef.current.scene();
  if (!scene) return;

  // Clean up previous overlay
  if (timelineOverlayRef.current) {
    scene.remove(timelineOverlayRef.current);
    timelineOverlayRef.current = null;
  }

  if (!showTimeline) return;

  const years = graphData.nodes.map((p) => p.year).filter((y) => y != null && !isNaN(y));
  if (years.length === 0) return;
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const span = maxY - minY || 1;

  const overlayGroup = new THREE.Group();
  overlayGroup.name = 'timeline-labels';
  timelineOverlayRef.current = overlayGroup;
  scene.add(overlayGroup);

  const yearStep = span <= 10 ? 2 : 5;
  const startYear = Math.ceil(minY / yearStep) * yearStep;

  for (let year = startYear; year <= maxY; year += yearStep) {
    const yPos = ((year - minY) / span) * 300 - 150;

    // Year label sprite
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      canvas.width = 128;
      canvas.height = 48;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(year), 64, 24);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(30, 12, 1);
      sprite.position.set(-250, yPos, 0);
      overlayGroup.add(sprite);
    }

    // Horizontal grid line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-220, yPos, 0),
      new THREE.Vector3(220, yPos, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    overlayGroup.add(line);
  }

  // "Earlier" / "Later" direction labels
  const createDirectionLabel = (text: string, yPos: number) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      canvas.width = 192;
      canvas.height = 32;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '14px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 96, 16);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(40, 8, 1);
      sprite.position.set(-250, yPos, 0);
      overlayGroup.add(sprite);
    }
  };
  createDirectionLabel('\u2190 Earlier', -170);
  createDirectionLabel('Later \u2192', 170);

  return () => {
    if (timelineOverlayRef.current && fgInstance?.scene()) {
      try { fgInstance.scene().remove(timelineOverlayRef.current); } catch {}
      timelineOverlayRef.current = null;
    }
  };
}

// ─── Cosmic animation manager setup ─────────────────────────────────

export function setupCosmicAnimationManager(
  fgRef: React.MutableRefObject<any>,
  showCosmicTheme: boolean
): (() => void) | undefined {
  const fgInstance = fgRef.current;
  if (showCosmicTheme) {
    const manager = CosmicAnimationManager.getInstance();
    manager.start();
    if (fgRef.current) {
      const scene = fgRef.current.scene?.();
      if (scene) {
        manager.setScene(scene);
        scene.fog = new THREE.FogExp2(0x020208, 0.0006);
      }
      try {
        const renderer = fgRef.current.renderer();
        if (renderer) renderer.debug.checkShaderErrors = false;
      } catch { /* renderer unavailable */ }
    }
  }
  return () => {
    if (fgInstance) {
      try {
        const scene = fgInstance.scene?.();
        if (scene) scene.fog = null;
      } catch { /* scene unavailable */ }
    }
    CosmicAnimationManager.reset();
  };
}

// ─── Initial camera setup ───────────────────────────────────────────

export function setupInitialCamera(fgRef: React.MutableRefObject<any>): void {
  if (!fgRef.current) return;
  const bbox = fgRef.current.getGraphBbox();
  if (!bbox?.x) return;

  const cx = (bbox.x[0] + bbox.x[1]) / 2;
  const cy = (bbox.y[0] + bbox.y[1]) / 2;
  const cz = (bbox.z[0] + bbox.z[1]) / 2;
  const spanX = bbox.x[1] - bbox.x[0];
  const spanY = bbox.y[1] - bbox.y[0];
  const spanZ = bbox.z[1] - bbox.z[0];
  const maxSpan = Math.max(spanX, spanY, spanZ);

  const dist = maxSpan * 1.8;
  fgRef.current.cameraPosition(
    { x: cx + dist * 0.15, y: cy - dist * 0.35, z: cz + dist * 0.75 },
    { x: cx, y: cy, z: cz },
    800
  );
}

// ─── Full cleanup on unmount ────────────────────────────────────────

export function cleanupGraph(
  fgRef: React.MutableRefObject<any>,
  refs: {
    hoverTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    expandedEdgeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    newNodeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  }
): void {
  const fgInstance = fgRef.current;
  if (refs.hoverTimeoutRef.current) clearTimeout(refs.hoverTimeoutRef.current);
  if (refs.expandedEdgeTimerRef.current) clearTimeout(refs.expandedEdgeTimerRef.current);
  if (refs.newNodeTimerRef.current) clearTimeout(refs.newNodeTimerRef.current);

  CosmicAnimationManager.reset();

  // Dispose the WebGL renderer only
  if (fgInstance) {
    try {
      const renderer = fgInstance.renderer();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
      }
    } catch {
      /* already disposed */
    }
  }
}
