'use client';

import {
  useCallback,
  useRef,
  useMemo,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import { useGraphStore } from '@/hooks/useGraphStore';
import type { Paper, GraphEdge, CitationIntent } from '@/types';
import { ENHANCED_INTENT_COLORS } from '@/types';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-background">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-xs text-text-secondary">
          Loading 3D visualization...
        </p>
      </div>
    </div>
  ),
});

// Field color mapping
const FIELD_COLOR_MAP: Record<string, string> = {
  'Physical Sciences': '#4A90D9',
  'Life Sciences': '#2ECC71',
  'Social Sciences': '#E67E22',
  'Health Sciences': '#E74C3C',
  Engineering: '#9B59B6',
  'Arts & Humanities': '#F39C12',
  Other: '#95A5A6',
};

const INTENT_COLOR_MAP: Record<string, string> = {
  methodology: '#9B59B6',
  background: '#95A5A6',
  result_comparison: '#4A90D9',
  supports: '#2ECC71',
  contradicts: '#E74C3C',
};

interface ForceGraphNode {
  id: string;
  name: string;
  val: number;
  color: string;
  opacity: number;
  paper: Paper;
  citationPercentile: number;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

interface ForceGraphLink {
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
  color: string;
  width: number;
  edgeType: 'citation' | 'similarity';
  dashed: boolean;
  intentLabel?: string;
  intentContext?: string;
}

export interface ScholarGraph3DRef {
  focusOnPaper: (paperId: string) => void;
  focusOnCluster: (clusterId: number) => void;
  resetCamera: () => void;
}

function computeConvexHull2D(
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

const ScholarGraph3D = forwardRef<ScholarGraph3DRef>((_, ref) => {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    graphData,
    selectedPaper,
    showCitationEdges,
    showSimilarityEdges,
    showClusterHulls,
    showLabels,
    citationIntents,
    showEnhancedIntents,
    showBloom,
    showGhostEdges,
    showGapOverlay,
    hiddenClusterIds,
    bridgeNodeIds,
    selectPaper,
    setHoveredPaper,
    toggleMultiSelect,
  } = useGraphStore();

  const lastClickRef = useRef<{ nodeId: string; timestamp: number } | null>(
    null
  );

  // Compute year range for opacity
  const yearRange = useMemo(() => {
    if (!graphData) return { min: 2000, max: 2024 };
    const years = graphData.nodes.map((n) => n.year).filter((y) => y != null && !isNaN(y));
    if (years.length === 0) return { min: 2000, max: 2024 };
    return {
      min: Math.min(...years),
      max: Math.max(...years),
    };
  }, [graphData]);

  // Build cluster color map
  const clusterColorMap = useMemo(() => {
    if (!graphData) return new Map<number, string>();
    const map = new Map<number, string>();
    graphData.clusters.forEach((c) => {
      map.set(c.id, c.color);
    });
    return map;
  }, [graphData]);

  // Highlighted node IDs (selected + connected)
  const highlightSet = useMemo(() => {
    if (!selectedPaper || !graphData) return new Set<string>();
    const set = new Set<string>([selectedPaper.id]);
    graphData.edges.forEach((e) => {
      if (e.source === selectedPaper.id) set.add(e.target);
      if (e.target === selectedPaper.id) set.add(e.source);
    });
    return set;
  }, [selectedPaper, graphData]);

  // Convert graph data to force graph format
  const forceGraphData = useMemo(() => {
    if (!graphData)
      return { nodes: [] as ForceGraphNode[], links: [] as ForceGraphLink[] };

    // Sort papers by citation count for percentile computation
    const sortedByCitations = [...graphData.nodes].sort(
      (a, b) => (b.citation_count || 0) - (a.citation_count || 0)
    );
    const citationRankMap = new Map<string, number>();
    sortedByCitations.forEach((p, idx) => {
      citationRankMap.set(p.id, 1 - idx / sortedByCitations.length);
    });

    const nodes: ForceGraphNode[] = graphData.nodes
      .filter((paper) => !hiddenClusterIds.has(paper.cluster_id))
      .map((paper) => {
        const primaryField = paper.fields?.[0] || 'Other';
        const color = FIELD_COLOR_MAP[primaryField] || '#95A5A6';
        const yearSpan = yearRange.max - yearRange.min || 1;
        const paperYear = paper.year || yearRange.min;
        const opacity =
          0.3 + 0.7 * ((paperYear - yearRange.min) / yearSpan);
        const size = Math.max(3, Math.log((paper.citation_count || 0) + 1) * 3);
        const authorName = paper.authors?.[0]?.name?.split(' ').pop() || 'Unknown';
        const citationPercentile = citationRankMap.get(paper.id) || 0;

        return {
          id: paper.id,
          name: `${authorName} ${paper.year || ''}`,
          val: size,
          color,
          opacity,
          paper,
          citationPercentile,
          x: paper.x,
          y: paper.y,
          z: paper.z,
        };
      });

    const filteredEdges = graphData.edges.filter((e) => {
      if (e.type === 'citation' && !showCitationEdges) return false;
      if (e.type === 'similarity' && !showSimilarityEdges) return false;
      return true;
    });

    // Build intent lookup from store citationIntents
    const intentMap = new Map<string, CitationIntent>();
    citationIntents.forEach((ci) => {
      intentMap.set(`${ci.citing_id}-${ci.cited_id}`, ci);
    });

    const links: ForceGraphLink[] = filteredEdges.map((edge) => {
      const isSimilarity = edge.type === 'similarity';

      // Determine intent color: enhanced > basic > edge.intent > default
      let intentColor: string | undefined;
      let intentLabel: string | undefined;
      let intentContext: string | undefined;
      let isInfluential = false;

      const ci = intentMap.get(`${edge.source}-${edge.target}`) ||
                 intentMap.get(`${edge.target}-${edge.source}`);

      if (ci) {
        isInfluential = ci.is_influential;
        intentContext = ci.context;
        if (showEnhancedIntents && ci.enhanced_intent) {
          intentColor = ENHANCED_INTENT_COLORS[ci.enhanced_intent];
          intentLabel = ci.enhanced_intent;
        } else if (ci.basic_intent) {
          intentColor = INTENT_COLOR_MAP[ci.basic_intent];
          intentLabel = ci.basic_intent;
        }
      } else if (edge.intent) {
        intentColor = INTENT_COLOR_MAP[edge.intent];
        intentLabel = edge.intent;
      }

      return {
        source: edge.source,
        target: edge.target,
        color: intentColor || (isSimilarity ? '#4A90D9' : '#8890a5'),
        width: isSimilarity ? 0.5 : isInfluential ? 2 + edge.weight * 2 : 1 + edge.weight * 2,
        edgeType: edge.type,
        dashed: isSimilarity,
        intentLabel,
        intentContext,
      };
    });

    // Ghost edges: high-similarity pairs without citations
    if (showGhostEdges) {
      const citationPairs = new Set(
        graphData.edges
          .filter((e) => e.type === 'citation')
          .flatMap((e) => [`${e.source}-${e.target}`, `${e.target}-${e.source}`])
      );
      // Ghost edges are similarity edges with weight > 0.75 and no citation
      graphData.edges
        .filter(
          (e) =>
            e.type === 'similarity' &&
            e.weight > 0.75 &&
            !citationPairs.has(`${e.source}-${e.target}`)
        )
        .forEach((edge) => {
          links.push({
            source: edge.source,
            target: edge.target,
            color: '#FF8C00',
            width: 0.8,
            edgeType: 'similarity' as const,
            dashed: true,
            intentLabel: 'ghost',
            intentContext: `Semantic similarity: ${(edge.weight * 100).toFixed(0)}% — These papers don't cite each other`,
          });
        });
    }

    return { nodes, links };
  }, [graphData, yearRange, showCitationEdges, showSimilarityEdges, citationIntents, showEnhancedIntents, hiddenClusterIds, showGhostEdges]);

  // Node rendering
  const nodeThreeObject = useCallback(
    (nodeData: unknown) => {
      const node = nodeData as ForceGraphNode;
      const group = new THREE.Group();
      group.userData.nodeId = node.id;

      const isHighlighted = highlightSet.has(node.id);
      const isSelected = selectedPaper?.id === node.id;
      const hasSelection = selectedPaper !== null;

      let displayColor = node.color;
      if (isSelected) displayColor = '#FFD700';
      else if (isHighlighted) displayColor = '#4ECDC4';

      let displayOpacity = node.opacity;
      if (isSelected) displayOpacity = 1;
      else if (isHighlighted) displayOpacity = 1;
      else if (hasSelection) displayOpacity = 0.15;

      const geometry = new THREE.SphereGeometry(node.val, 16, 16);
      const material = new THREE.MeshPhongMaterial({
        color: displayColor,
        emissive: displayColor,
        emissiveIntensity: isSelected ? 0.6 : isHighlighted ? 0.4 : 0.15,
        transparent: true,
        opacity: displayOpacity,
        shininess: 30,
      });
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      // Highlight ring for selected
      if (isSelected) {
        const ringGeometry = new THREE.RingGeometry(
          node.val * 1.3,
          node.val * 1.5,
          32
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: '#FFD700',
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }

      // Bridge node gold glow
      if (node.paper?.is_bridge) {
        const glowGeo = new THREE.SphereGeometry(node.val * 1.5, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0xFFD700,
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
        });
        group.add(new THREE.Mesh(glowGeo, glowMat));
      }

      // OA paper green ring
      if (node.paper?.is_open_access) {
        const ringGeo = new THREE.RingGeometry(node.val * 1.1, node.val * 1.3, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x2ECC71,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }

      // High-citation gold aura (top 10%)
      if (node.citationPercentile > 0.9 && !isSelected) {
        const auraGeo = new THREE.SphereGeometry(node.val * 1.5, 8, 8);
        const auraMat = new THREE.MeshBasicMaterial({
          color: 0xFFD700,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        });
        group.add(new THREE.Mesh(auraGeo, auraMat));
      }

      // Bloom effect for selected node
      if (showBloom && isSelected) {
        const bloomGeo = new THREE.SphereGeometry(node.val * 1.3, 8, 8);
        const bloomMat = new THREE.MeshBasicMaterial({
          color: displayColor,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        });
        group.add(new THREE.Mesh(bloomGeo, bloomMat));
        // Strengthen emissive
        material.emissiveIntensity = 0.8;
      }

      // Centrality-based label: show only top 20% OR highlighted/selected
      const showLabel = showLabels && node.name && (
        isSelected || isHighlighted || node.citationPercentile > 0.8
      );

      if (showLabel) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const scale = 2;
          canvas.width = 256 * scale;
          canvas.height = 64 * scale;
          ctx.scale(scale, scale);

          const fontSize = isSelected ? 16 : 10 + 18 * node.citationPercentile;
          const labelOpacity = isSelected ? 1.0 :
            isHighlighted ? 0.9 :
            0.3 + 0.7 * node.citationPercentile;

          ctx.font = `bold ${fontSize}px Arial, sans-serif`;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = isSelected
            ? '#FFD700'
            : isHighlighted
              ? '#4ECDC4'
              : '#FFFFFF';
          ctx.globalAlpha = labelOpacity;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            node.name.length > 18
              ? node.name.substring(0, 16) + '..'
              : node.name,
            canvas.width / scale / 2,
            canvas.height / scale / 2
          );

          const texture = new THREE.CanvasTexture(canvas);
          texture.needsUpdate = true;
          const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
          });
          const sprite = new THREE.Sprite(spriteMaterial);
          sprite.scale.set(40, 10, 1);
          sprite.position.set(0, node.val + 5, 0);
          group.add(sprite);
        }
      }

      return group;
    },
    [highlightSet, selectedPaper, showLabels, showBloom, bridgeNodeIds]
  );

  // Link width
  const linkWidth = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;
    return link.width;
  }, []);

  // Link color
  const linkColor = useCallback(
    (linkData: unknown) => {
      const link = linkData as ForceGraphLink;
      if (!selectedPaper) {
        return link.dashed
          ? 'rgba(74, 144, 217, 0.15)'
          : `rgba(136, 144, 165, ${0.2 + link.width * 0.1})`;
      }

      const sourceId =
        typeof link.source === 'string'
          ? link.source
          : (link.source as ForceGraphNode).id;
      const targetId =
        typeof link.target === 'string'
          ? link.target
          : (link.target as ForceGraphNode).id;

      if (highlightSet.has(sourceId) && highlightSet.has(targetId)) {
        return link.color + 'CC';
      }
      return 'rgba(255, 255, 255, 0.03)';
    },
    [selectedPaper, highlightSet]
  );

  // Custom dashed link rendering for similarity edges
  const linkThreeObject = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;
    if (!link.dashed) return null;

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineDashedMaterial({
      color: 0x4a90d9,
      dashSize: 2,
      gapSize: 1.5,
      opacity: 0.3,
      transparent: true,
    });
    return new THREE.Line(geometry, material);
  }, []);

  const linkPositionUpdate = useCallback(
    (
      line: THREE.Object3D,
      coords: {
        start: { x: number; y: number; z: number };
        end: { x: number; y: number; z: number };
      },
      linkData: unknown
    ) => {
      const link = linkData as ForceGraphLink;
      if (!link.dashed || !(line instanceof THREE.Line)) return false;

      const positions = new Float32Array([
        coords.start.x,
        coords.start.y,
        coords.start.z,
        coords.end.x,
        coords.end.y,
        coords.end.z,
      ]);
      line.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3)
      );
      line.computeLineDistances();
      return true;
    },
    []
  );

  // Click handler
  const handleNodeClick = useCallback(
    (nodeData: unknown, event: MouseEvent) => {
      const node = nodeData as ForceGraphNode;
      const now = Date.now();

      if (event.shiftKey) {
        toggleMultiSelect(node.paper);
        return;
      }

      // Double-click: expand paper
      if (
        lastClickRef.current &&
        lastClickRef.current.nodeId === node.id &&
        now - lastClickRef.current.timestamp < 300
      ) {
        // Focus camera
        if (
          fgRef.current &&
          node.x !== undefined &&
          node.y !== undefined &&
          node.z !== undefined
        ) {
          fgRef.current.cameraPosition(
            { x: node.x, y: node.y, z: node.z! + 200 },
            { x: node.x, y: node.y, z: node.z },
            1000
          );
        }
        lastClickRef.current = null;
        return;
      }

      lastClickRef.current = { nodeId: node.id, timestamp: now };
      selectPaper(node.paper);
    },
    [selectPaper, toggleMultiSelect]
  );

  // Hover handler
  const handleNodeHover = useCallback(
    (nodeData: unknown) => {
      const node = nodeData as ForceGraphNode | null;
      const newId = node?.id || null;
      if (newId !== hoveredNodeRef.current) {
        hoveredNodeRef.current = newId;
        if (containerRef.current) {
          containerRef.current.style.cursor = newId ? 'pointer' : 'default';
        }
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredPaper(node?.paper || null);
        }, 50);
      }
    },
    [setHoveredPaper]
  );

  // Background click
  const handleBackgroundClick = useCallback(() => {
    selectPaper(null);
  }, [selectPaper]);

  // Cluster hull overlay
  const clusterOverlayRef = useRef<THREE.Group | null>(null);

  // Gap overlay ref
  const gapOverlayRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
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

    const updateHulls = () => {
      while (overlayGroup.children.length > 0) {
        const child = overlayGroup.children[0];
        overlayGroup.remove(child);
        if ((child as any).geometry) (child as any).geometry.dispose();
        if ((child as any).material) (child as any).material.dispose();
      }

      const currentData = fgRef.current?.graphData();
      if (!currentData?.nodes) return;

      const nodePositions = new Map<
        string,
        { x: number; y: number; z: number }
      >();
      (currentData.nodes as ForceGraphNode[]).forEach((n) => {
        if (n.x !== undefined && n.y !== undefined && n.z !== undefined) {
          nodePositions.set(n.id, { x: n.x, y: n.y, z: n.z });
        }
      });

      graphData!.clusters.forEach((cluster) => {
        const clusterNodes = graphData!.nodes.filter(
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
    };

    const interval = setInterval(updateHulls, 1000);
    updateHulls();

    return () => {
      clearInterval(interval);
      if (clusterOverlayRef.current && fgRef.current?.scene()) {
        try {
          fgRef.current.scene().remove(clusterOverlayRef.current);
        } catch {
          /* scene unavailable */
        }
        clusterOverlayRef.current = null;
      }
    };
  }, [showClusterHulls, graphData]);

  // Gap overlay useEffect
  useEffect(() => {
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

    const updateGapOverlay = () => {
      while (overlayGroup.children.length > 0) {
        const child = overlayGroup.children[0] as any;
        overlayGroup.remove(child);
        child.geometry?.dispose();
        child.material?.dispose();
      }

      const currentData = fgRef.current?.graphData();
      if (!currentData?.nodes) return;

      const nodePositions = new Map<string, THREE.Vector3>();
      (currentData.nodes as ForceGraphNode[]).forEach((n) => {
        if (n.x !== undefined) nodePositions.set(n.id, new THREE.Vector3(n.x, n.y, n.z));
      });

      // Compute cluster centroids from current positions
      const clusterCentroids = new Map<number, THREE.Vector3>();
      graphData!.clusters.forEach((cluster) => {
        const clusterNodes = graphData!.nodes.filter((p) => p.cluster_id === cluster.id);
        const positions = clusterNodes.map((p) => nodePositions.get(p.id)).filter(Boolean) as THREE.Vector3[];
        if (positions.length === 0) return;
        const centroid = new THREE.Vector3();
        positions.forEach((p) => centroid.add(p));
        centroid.divideScalar(positions.length);
        clusterCentroids.set(cluster.id, centroid);
      });

      // Draw gap lines between cluster pairs
      const clusters = graphData!.clusters;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const ca = clusters[i];
          const cb = clusters[j];
          const centA = clusterCentroids.get(ca.id);
          const centB = clusterCentroids.get(cb.id);
          if (!centA || !centB) continue;

          // Compute inter-cluster edge density
          const papersA = new Set(graphData!.nodes.filter((p) => p.cluster_id === ca.id).map((p) => p.id));
          const papersB = new Set(graphData!.nodes.filter((p) => p.cluster_id === cb.id).map((p) => p.id));
          const crossEdges = graphData!.edges.filter(
            (e) =>
              (papersA.has(e.source) && papersB.has(e.target)) ||
              (papersB.has(e.source) && papersA.has(e.target))
          ).length;
          const maxPossible = papersA.size * papersB.size;
          const density = maxPossible > 0 ? crossEdges / maxPossible : 0;

          // Only show significant gaps (density < 0.15)
          if (density >= 0.15) continue;

          // Color by gap strength
          const gapColor = density < 0.05 ? 0xFF4444 : density < 0.10 ? 0xFFD700 : 0x44BB44;

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
        }
      }
    };

    const interval = setInterval(updateGapOverlay, 1500);
    updateGapOverlay();

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
      });
    };
    animate();

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(animFrame);
      if (gapOverlayRef.current && fgRef.current?.scene()) {
        try { fgRef.current.scene().remove(gapOverlayRef.current); } catch {}
        gapOverlayRef.current = null;
      }
    };
  }, [showGapOverlay, graphData]);

  // Expose ref methods
  useImperativeHandle(ref, () => ({
    focusOnPaper: (paperId: string) => {
      if (!fgRef.current) return;
      const node = forceGraphData.nodes.find((n) => n.id === paperId);
      if (
        node &&
        node.x !== undefined &&
        node.y !== undefined &&
        node.z !== undefined
      ) {
        fgRef.current.cameraPosition(
          { x: node.x, y: node.y, z: node.z! + 200 },
          { x: node.x, y: node.y, z: node.z },
          1000
        );
      }
    },
    focusOnCluster: (clusterId: number) => {
      if (!fgRef.current) return;
      const clusterNodes = forceGraphData.nodes.filter(
        (n) => n.paper.cluster_id === clusterId
      );
      if (clusterNodes.length === 0) return;

      let sumX = 0,
        sumY = 0,
        sumZ = 0;
      clusterNodes.forEach((n) => {
        sumX += n.x || 0;
        sumY += n.y || 0;
        sumZ += n.z || 0;
      });
      const centroid = {
        x: sumX / clusterNodes.length,
        y: sumY / clusterNodes.length,
        z: sumZ / clusterNodes.length,
      };

      fgRef.current.cameraPosition(
        { x: centroid.x, y: centroid.y, z: centroid.z + 400 },
        centroid,
        1000
      );
    },
    resetCamera: () => {
      if (fgRef.current) {
        fgRef.current.cameraPosition(
          { x: 0, y: 0, z: 500 },
          { x: 0, y: 0, z: 0 },
          1000
        );
      }
    },
  }));

  // Initial camera
  useEffect(() => {
    if (fgRef.current) {
      setTimeout(() => {
        fgRef.current?.cameraPosition({ x: 0, y: 0, z: 500 });
      }, 500);
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (fgRef.current) {
        try {
          const renderer = fgRef.current.renderer();
          if (renderer) {
            renderer.dispose();
            renderer.forceContextLoss();
          }
        } catch {
          /* already disposed */
        }
      }
    };
  }, []);

  if (!graphData) return null;

  return (
    <div ref={containerRef} className="w-full h-full bg-background">
      <ForceGraph3D
        ref={fgRef}
        graphData={forceGraphData}
        nodeId="id"
        nodeThreeObject={nodeThreeObject}
        nodeLabel={(nodeData: unknown) => {
          const node = nodeData as ForceGraphNode;
          const p = node.paper;
          return `
            <div style="background: rgba(10,14,26,0.92); padding: 10px 14px; border-radius: 8px; font-family: system-ui; font-size: 12px; max-width: 300px; border: 1px solid rgba(42,48,80,0.6);">
              <div style="font-weight: bold; color: ${node.color}; margin-bottom: 4px;">${p.title.length > 80 ? p.title.substring(0, 80) + '...' : p.title}</div>
              <div style="color: #8890a5; font-size: 11px;">${p.authors.slice(0, 3).map((a) => a.name).join(', ')}${p.authors.length > 3 ? ' et al.' : ''}</div>
              <div style="color: #8890a5; margin-top: 4px; font-size: 11px;">${p.venue || ''} ${p.year} | Citations: ${p.citation_count}</div>
            </div>
          `;
        }}
        linkWidth={linkWidth}
        linkColor={linkColor}
        linkOpacity={0.6}
        linkThreeObject={linkThreeObject as never}
        linkPositionUpdate={linkPositionUpdate as never}
        linkLabel={(linkData: unknown) => {
          const link = linkData as ForceGraphLink;
          if (!link.intentLabel) return '';
          const contextSnippet = link.intentContext
            ? `<div style="color: #8890a5; font-size: 10px; margin-top: 4px; max-width: 250px;">${
                link.intentContext.length > 120
                  ? link.intentContext.substring(0, 120) + '...'
                  : link.intentContext
              }</div>`
            : '';
          return `
            <div style="background: rgba(10,14,26,0.92); padding: 8px 12px; border-radius: 6px; font-family: system-ui; font-size: 11px; border: 1px solid rgba(42,48,80,0.6);">
              <div style="color: ${link.color}; font-weight: bold; text-transform: capitalize;">${link.intentLabel.replace('_', ' ')}</div>
              ${contextSnippet}
            </div>
          `;
        }}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        backgroundColor="#0a0e1a"
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBackgroundClick}
        warmupTicks={100}
        cooldownTicks={0}
        d3VelocityDecay={0.9}
        enableNodeDrag={true}
        onNodeDrag={(node: any) => {
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
        }}
        onNodeDragEnd={(node: any) => {
          node.fx = undefined;
          node.fy = undefined;
          node.fz = undefined;
        }}
      />
    </div>
  );
});

ScholarGraph3D.displayName = 'ScholarGraph3D';

export default ScholarGraph3D;
