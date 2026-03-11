'use client';

import {
  useCallback,
  useRef,
  useMemo,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  lazy,
  Suspense,
} from 'react';
import * as THREE from 'three';
import { useGraphStore } from '@/hooks/useGraphStore';
import type { Paper, CitationIntent } from '@/types';
import { createStarNode } from './cosmic/starNodeRenderer';
import { createNebulaCluster } from './cosmic/nebulaClusterRenderer';
import CosmicAnimationManager from './cosmic/CosmicAnimationManager';
import { getStarColors } from './cosmic/cosmicConstants';
import { getGlowTexture } from './cosmic/cosmicTextures';
import { createGapVoid } from './cosmic/gapVoidRenderer';

// Three.js dispose safety is handled globally via lib/three-safety.ts
// (imported in providers.tsx before any Three.js component loads)

// Use React.lazy instead of next/dynamic to properly forward refs
// next/dynamic's LoadableComponent uses useImperativeHandle({retry}) which
// swallows the ref and never forwards it to the actual ForceGraph3D component
const ForceGraph3D = lazy(() => import('react-force-graph-3d'));

const ForceGraph3DLoading = () => (
  <div className="flex items-center justify-center h-full bg-background">
    <div className="text-center">
      <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-xs text-text-secondary">
        Loading 3D visualization...
      </p>
    </div>
  </div>
);

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
  edgeType: 'citation' | 'similarity' | 'ghost';
  dashed: boolean;
  intentLabel?: string;
  intentContext?: string;
  isInfluential?: boolean;
  isBidirectional?: boolean;
  hasSharedAuthors?: boolean;
  weight?: number;
  yearGap?: number;
  isCrossCluster?: boolean;
}

export interface ScholarGraph3DRef {
  focusOnPaper: (paperId: string) => void;
  focusOnCluster: (clusterId: number) => void;
  resetCamera: () => void;
  zoomToFit: (duration?: number, padding?: number) => void;
  animateExpandNodes: (parentNodeId: string, newNodeIds: string[], targets: Map<string, {x: number; y: number; z: number}>) => void;
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
  const hoveredNodeRef = useRef<string | null>(null);

  // Client-only guard: React.lazy doesn't have ssr:false like next/dynamic
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  // Track when ForceGraph3D mounts so dependent useEffects re-fire.
  // React.lazy loads the module async, so fgRef.current is null during
  // initial useEffect runs. This polls briefly after isClient to detect mount.
  const [fgMounted, setFgMounted] = useState(false);
  useEffect(() => {
    if (!isClient || fgMounted) return;
    const timer = setInterval(() => {
      if (fgRef.current) {
        setFgMounted(true);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [isClient, fgMounted]);

  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedPaperIdRef = useRef<string | null>(null);
  const justClickedNodeRef = useRef(false);

  const {
    graphData,
    selectedPaper,
    showCitationEdges,
    showSimilarityEdges,
    showClusterHulls,
    showLabels,
    citationIntents,
    showBloom,
    showOARings,
    showCitationAura,
    showGhostEdges,
    showGapOverlay,
    hiddenClusterIds,
    bridgeNodeIds,
    showTimeline,
    selectPaper,
    highlightedPaperIds,
    showCosmicTheme,
    expandedFromMap,
    activePath,
    edgeVisMode,
    panelSelectionId,
    setPanelSelectionId,
    highlightedClusterPair,
    hoveredGapEdges,
    nodeSizeMode,
    layoutMode,
    secondSeedIds,
  } = useGraphStore();

  const lastClickRef = useRef<{ nodeId: string; timestamp: number } | null>(
    null
  );
  const newNodeIdsRef = useRef<Set<string>>(new Set());
  const newNodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedFromRef = useRef<Map<string, string>>(new Map());
  const expandedEdgeIdsRef = useRef<Set<string>>(new Set());
  const expandedEdgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const umapPositionsRef = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());

  // Sync expandedFromMap from store to local ref
  useEffect(() => {
    expandedFromRef.current = new Map(expandedFromMap);
  }, [expandedFromMap]);

  // Store UMAP positions whenever graphData loads (for semantic mode restore)
  useEffect(() => {
    if (!graphData) return;
    const CS = 15; // coordinate scale for X/Y: UMAP ~15 units → ~150 units
    const ZS = 10; // Z-axis scale: temporal [-10,+10] → [-100,+100] for 3D volume
    const map = new Map<string, { x: number; y: number; z: number }>();
    graphData.nodes.forEach((n) => {
      map.set(n.id, { x: n.x * CS, y: n.y * CS, z: n.z * ZS });
    });
    umapPositionsRef.current = map;
  }, [graphData]);

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

  // Sync selectedPaper to ref + trigger visual refresh without recreating nodeThreeObject
  useEffect(() => {
    selectedPaperIdRef.current = selectedPaper?.id ?? null;
    // Refresh Three.js objects to reflect new selection state (no function re-creation)
    if (fgRef.current) {
      try {
        fgRef.current.refresh();
      } catch {
        // Ignore if not yet mounted
      }
    }
  }, [selectedPaper]);

  // Convert graph data to force graph format
  const forceGraphData = useMemo(() => {
    if (!graphData)
      return { nodes: [] as ForceGraphNode[], links: [] as ForceGraphLink[] };

    // Build nodeMap for O(1) lookups in edge processing
    const nodeMap = new Map<string, Paper>();
    graphData.nodes.forEach(n => nodeMap.set(n.id, n));

    // Sort papers by citation count for percentile computation
    const sortedByCitations = [...graphData.nodes].sort(
      (a, b) => (b.citation_count || 0) - (a.citation_count || 0)
    );
    const citationRankMap = new Map<string, number>();
    sortedByCitations.forEach((p, idx) => {
      citationRankMap.set(p.id, 1 - idx / sortedByCitations.length);
    });

    // Precompute max values for PageRank/Betweenness normalization
    const maxPagerank = Math.max(
      ...graphData.nodes.map(n => n.pagerank ?? 0), 0.0001
    );
    const maxBetweenness = Math.max(
      ...graphData.nodes.map(n => n.betweenness ?? 0), 0.0001
    );

    const nodes: ForceGraphNode[] = graphData.nodes
      .filter((paper) => !hiddenClusterIds.has(paper.cluster_id))
      .map((paper) => {
        const primaryField = paper.fields?.[0] || 'Other';
        const starCol = getStarColors(primaryField);
        const color = starCol.core;
        const yearSpan = yearRange.max - yearRange.min || 1;
        const paperYear = paper.year || yearRange.min;
        const opacity =
          0.3 + 0.7 * ((paperYear - yearRange.min) / yearSpan);

        // Node size based on selected mode
        let size: number;
        switch (nodeSizeMode) {
          case 'pagerank': {
            const pr = paper.pagerank ?? 0;
            size = Math.min(12, Math.max(2, (pr / maxPagerank) * 12));
            break;
          }
          case 'betweenness': {
            const bt = paper.betweenness ?? 0;
            size = Math.min(12, Math.max(2, (bt / maxBetweenness) * 12));
            break;
          }
          case 'citations':
          default: {
            const rawCitations = paper.citation_count || 0;
            size = Math.min(12, Math.max(2, Math.sqrt(rawCitations + 1) * 0.8));
            break;
          }
        }

        const authorName = paper.authors?.[0]?.name?.split(' ').pop() || 'Unknown';
        const citationPercentile = citationRankMap.get(paper.id) || 0;

        const CS = 15; // coordinate scale for X/Y: UMAP ~15 units → ~150 units
        const ZS = 10; // Z-axis scale: temporal [-10,+10] → [-100,+100] for 3D volume
        return {
          id: paper.id,
          name: `${authorName} ${paper.year || ''}`,
          val: size,
          color,
          opacity,
          paper,
          citationPercentile,
          x: paper.x * CS,
          y: paper.y * CS,
          z: paper.z * ZS,
          ...(layoutMode === 'semantic' ? { fx: paper.x * CS, fy: paper.y * CS, fz: paper.z * ZS } : {}),
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

    // Detect bidirectional citations
    const citationPairSet = new Set<string>();
    graphData.edges.filter(e => e.type === 'citation').forEach(e => {
      citationPairSet.add(`${e.source}->${e.target}`);
    });
    const bidirectionalPairs = new Set<string>();
    graphData.edges.filter(e => e.type === 'citation').forEach(e => {
      if (citationPairSet.has(`${e.target}->${e.source}`)) {
        const key = [e.source, e.target].sort().join('--');
        bidirectionalPairs.add(key);
      }
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
        if (ci.basic_intent) {
          intentColor = INTENT_COLOR_MAP[ci.basic_intent];
          intentLabel = ci.basic_intent;
        }
      } else if (edge.intent) {
        intentColor = INTENT_COLOR_MAP[edge.intent];
        intentLabel = edge.intent;
      }

      // Edge metadata for visualization modes
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      const yearGap = sourceNode?.year && targetNode?.year
        ? Math.abs(sourceNode.year - targetNode.year)
        : undefined;
      const isCrossCluster = sourceNode && targetNode
        ? sourceNode.cluster_id !== targetNode.cluster_id
        : false;
      const biKey = [edge.source, edge.target].sort().join('--');
      const isBidirectional = bidirectionalPairs.has(biKey);

      // Check shared authors
      const hasSharedAuthors = (() => {
        if (!sourceNode || !targetNode) return false;
        const srcAuthors = new Set(sourceNode.authors?.map(a => typeof a === 'string' ? a : a.name) || []);
        return targetNode.authors?.some(a => srcAuthors.has(typeof a === 'string' ? a : a.name)) || false;
      })();

      return {
        source: edge.source,
        target: edge.target,
        color: intentColor || (isSimilarity ? '#555555' : '#444444'),
        width: isSimilarity ? 1.0 : isInfluential ? 2 + edge.weight * 2 : 1 + edge.weight * 2,
        edgeType: edge.type,
        dashed: isSimilarity,
        intentLabel,
        intentContext,
        isInfluential,
        isBidirectional,
        hasSharedAuthors,
        weight: edge.weight,
        yearGap,
        isCrossCluster,
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

    // Potential edges from gap hover (dashed gold)
    if (hoveredGapEdges.length > 0) {
      hoveredGapEdges.forEach((pe) => {
        links.push({
          source: pe.source,
          target: pe.target,
          color: '#D4AF37',
          width: 2.0,
          edgeType: 'ghost' as const,
          dashed: true,
          intentLabel: 'potential',
          intentContext: `Potential connection (${(pe.similarity * 100).toFixed(0)}%)`,
        });
      });
    }

    return { nodes, links };
  }, [graphData, yearRange, showCitationEdges, showSimilarityEdges, citationIntents, hiddenClusterIds, showGhostEdges, edgeVisMode, hoveredGapEdges, nodeSizeMode, layoutMode]);

  // Camera auto-focus when paper selected from panel
  useEffect(() => {
    if (!panelSelectionId || !fgRef.current) return;
    const node = forceGraphData.nodes.find((n) => n.id === panelSelectionId);
    if (node && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
      fgRef.current.cameraPosition(
        { x: node.x, y: node.y, z: node.z! + 200 },
        { x: node.x, y: node.y, z: node.z },
        1000
      );
    }
    setPanelSelectionId(null);
  }, [panelSelectionId, forceGraphData.nodes, setPanelSelectionId]);

  // Configure d3-force for network layout mode
  useEffect(() => {
    if (!fgRef.current || layoutMode !== 'network') return;
    const linkForce = fgRef.current.d3Force('link');
    if (linkForce) {
      linkForce.distance((d: ForceGraphLink) =>
        (d as ForceGraphLink).edgeType === 'citation' ? 30 : 60
      );
    }
  }, [layoutMode]);

  // Node rendering
  const nodeThreeObject = useCallback(
    (nodeData: unknown) => {
      const node = nodeData as ForceGraphNode;

      // Note: Do NOT dispose __threeObj here — the three-forcegraph library
      // handles its own object disposal via emptyObject/deallocate internally.
      // Proactive disposal causes double-free crashes (children[0] undefined).

      const isHighlighted = highlightSet.has(node.id);
      const isSelected = selectedPaperIdRef.current === node.id;
      const hasSelection = selectedPaperIdRef.current !== null;
      const isHighlightedByPanel = highlightedPaperIds.has(node.id);

      // === COSMIC THEME: Star nodes ===
      if (showCosmicTheme) {
        const cosmicOpacity = (() => {
          // Gap hover: highlight only the two clusters
          if (highlightedClusterPair) {
            const [cidA, cidB] = highlightedClusterPair;
            if (node.paper.cluster_id === cidA || node.paper.cluster_id === cidB) return 1;
            return 0.05;
          }
          if (isSelected || isHighlightedByPanel || isHighlighted) return 1;
          if (hasSelection) return 0.15;
          return node.opacity;
        })();

        const group = createStarNode({
          field: node.paper.fields?.[0] || 'Other',
          size: node.val,
          opacity: cosmicOpacity,
          year: node.paper.year || yearRange.min,
          yearRange,
          isSelected,
          isHighlighted,
          isHighlightedByPanel,
          hasSelection,
          isBridge: !!node.paper.is_bridge,
          isOpenAccess: !!node.paper.is_open_access,
          isTopCited: node.citationPercentile > 0.9,
          showBloom,
          showOARings,
          showCitationAura,
          direction: node.paper.direction,
        });
        group.userData.nodeId = node.id;

        // Expansion pulse: pulsing ring on parent node that just expanded
        if (newNodeIdsRef.current.size > 0 && expandedFromRef.current.size > 0) {
          // Check if this node is a parent that expanded
          const isExpandParent = Array.from(expandedFromRef.current.values()).includes(node.id);
          if (isExpandParent) {
            const pulseRingGeo = new THREE.RingGeometry(node.val * 2.0, node.val * 2.3, 32);
            const pulseRingMat = new THREE.MeshBasicMaterial({
              color: 0xD4AF37,
              transparent: true,
              opacity: 0.6,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
            pulseRing.rotation.x = Math.PI / 2;
            pulseRing.userData.isExpansionPulse = true;
            group.add(pulseRing);
          }
        }

        // New node glow pulse (newly expanded nodes)
        if (newNodeIdsRef.current.has(node.id)) {
          const newGlowGeo = new THREE.SphereGeometry(node.val * 1.5, 8, 8);
          const newGlowMat = new THREE.MeshBasicMaterial({
            color: 0xD4AF37,
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
          });
          const newGlow = new THREE.Mesh(newGlowGeo, newGlowMat);
          newGlow.userData.isNewNodeGlow = true;
          group.add(newGlow);
        }

        // Frontier node indicator (red pulse ring for frontier_score > 0.7)
        if ((node.paper.frontier_score ?? 0) > 0.7) {
          const frontierRingGeo = new THREE.RingGeometry(node.val * 1.6, node.val * 1.9, 32);
          const frontierRingMat = new THREE.MeshBasicMaterial({
            color: 0xFF4444,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const frontierRing = new THREE.Mesh(frontierRingGeo, frontierRingMat);
          frontierRing.rotation.x = Math.PI / 2;
          frontierRing.userData.isFrontierRing = true;
          group.add(frontierRing);
        }

        // Second-seed node indicator (teal ring)
        if (secondSeedIds.includes(node.id)) {
          const seedRingGeo = new THREE.RingGeometry(node.val * 1.6, node.val * 1.9, 32);
          const seedRingMat = new THREE.MeshBasicMaterial({
            color: 0x00E5FF,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const seedRing = new THREE.Mesh(seedRingGeo, seedRingMat);
          seedRing.rotation.x = Math.PI / 2;
          seedRing.userData.isSecondSeedRing = true;
          group.add(seedRing);
        }

        // Selection pulsing ring (gold, animated via CosmicAnimationManager)
        if (isSelected) {
          const selRingGeo = new THREE.RingGeometry(node.val * 2.2, node.val * 2.6, 48);
          const selRingMat = new THREE.MeshBasicMaterial({
            color: 0xD4AF37,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const selRing = new THREE.Mesh(selRingGeo, selRingMat);
          selRing.rotation.x = Math.PI / 2;
          selRing.userData.isSelectionPulse = true;
          group.add(selRing);
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

            const fontSize = isSelected ? 20 : 10 + 18 * node.citationPercentile;
            const labelOpacity = isSelected ? 1.0 :
              isHighlighted ? 0.9 :
              0.3 + 0.7 * node.citationPercentile;

            const text = node.name.length > 18
              ? node.name.substring(0, 16) + '..'
              : node.name;

            ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;

            // Background box for selected node label
            if (isSelected) {
              const metrics = ctx.measureText(text);
              const textWidth = metrics.width;
              const boxPadX = 8;
              const boxPadY = 4;
              const boxX = (canvas.width / scale / 2) - textWidth / 2 - boxPadX;
              const boxY = (canvas.height / scale / 2) - fontSize / 2 - boxPadY;
              const boxW = textWidth + boxPadX * 2;
              const boxH = fontSize + boxPadY * 2;
              const radius = 4;
              ctx.fillStyle = 'rgba(0,0,0,0.65)';
              ctx.beginPath();
              ctx.moveTo(boxX + radius, boxY);
              ctx.lineTo(boxX + boxW - radius, boxY);
              ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + radius);
              ctx.lineTo(boxX + boxW, boxY + boxH - radius);
              ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - radius, boxY + boxH);
              ctx.lineTo(boxX + radius, boxY + boxH);
              ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - radius);
              ctx.lineTo(boxX, boxY + radius);
              ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
              ctx.closePath();
              ctx.fill();
            }

            ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 2;
            ctx.fillStyle = isSelected
              ? '#D4AF37'
              : isHighlighted
                ? '#FFFFFF'
                : '#FFFFFF';
            ctx.globalAlpha = labelOpacity;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
              text,
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
            sprite.scale.set(isSelected ? 50 : 40, isSelected ? 13 : 10, 1);
            sprite.position.set(0, node.val + 5, 0);
            group.add(sprite);
          }
        }

        // Role badge: Review paper (R) or Methodology (M)
        const abstract = (node.paper?.abstract || node.paper?.tldr || '').toLowerCase();
        const isReviewPaper = /systematic review|meta-analysis|scoping review|literature review/.test(abstract);
        const isMethodPaper = /randomized controlled trial|rct\b|survey methodology|mixed method/.test(abstract);

        if ((isReviewPaper || isMethodPaper) && node.val >= 3) {
          const badgeCanvas = document.createElement('canvas');
          const bCtx = badgeCanvas.getContext('2d');
          if (bCtx) {
            badgeCanvas.width = 32;
            badgeCanvas.height = 32;
            bCtx.fillStyle = isReviewPaper ? '#4A90D9' : '#9B59B6';
            bCtx.globalAlpha = 0.85;
            bCtx.beginPath();
            bCtx.arc(16, 16, 14, 0, Math.PI * 2);
            bCtx.fill();
            bCtx.globalAlpha = 1;
            bCtx.fillStyle = '#FFFFFF';
            bCtx.font = 'bold 16px Arial';
            bCtx.textAlign = 'center';
            bCtx.textBaseline = 'middle';
            bCtx.fillText(isReviewPaper ? 'R' : 'M', 16, 16);

            const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
            const badgeSprite = new THREE.Sprite(
              new THREE.SpriteMaterial({ map: badgeTexture, transparent: true, depthTest: false })
            );
            badgeSprite.scale.set(node.val * 1.5, node.val * 1.5, 1);
            badgeSprite.position.set(node.val * 0.8, node.val * 0.8, 0);
            group.add(badgeSprite);
          }
        }

        return group;
      }

      // === FALLBACK: Original renderer (when showCosmicTheme is false) ===
      const group = new THREE.Group();
      group.userData.nodeId = node.id;

      let displayColor = node.color;
      if (isSelected) displayColor = '#D4AF37';
      else if (isHighlightedByPanel) displayColor = '#D4AF37';
      else if (isHighlighted) displayColor = '#FFFFFF';

      let displayOpacity = node.opacity;
      if (isSelected) displayOpacity = 1;
      else if (isHighlightedByPanel) displayOpacity = 1;
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
          color: '#D4AF37',
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
          color: 0xD4AF37,
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
        });
        group.add(new THREE.Mesh(glowGeo, glowMat));
      }

      // OA paper green ring (toggle)
      if (showOARings && node.paper?.is_open_access) {
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

      // High-citation gold aura (top 10%) - toggle
      if (showCitationAura && node.citationPercentile > 0.9 && !isSelected) {
        const auraGeo = new THREE.SphereGeometry(node.val * 1.5, 8, 8);
        const auraMat = new THREE.MeshBasicMaterial({
          color: 0xD4AF37,
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

          ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = isSelected
            ? '#D4AF37'
            : isHighlighted
              ? '#FFFFFF'
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

      // Role badge: Review paper (R) or Methodology (M)
      const abstract = (node.paper?.abstract || node.paper?.tldr || '').toLowerCase();
      const isReviewPaper = /systematic review|meta-analysis|scoping review|literature review/.test(abstract);
      const isMethodPaper = /randomized controlled trial|rct\b|survey methodology|mixed method/.test(abstract);

      if ((isReviewPaper || isMethodPaper) && node.val >= 3) {
        const badgeCanvas = document.createElement('canvas');
        const bCtx = badgeCanvas.getContext('2d');
        if (bCtx) {
          badgeCanvas.width = 32;
          badgeCanvas.height = 32;
          bCtx.fillStyle = isReviewPaper ? '#4A90D9' : '#9B59B6';
          bCtx.globalAlpha = 0.85;
          bCtx.beginPath();
          bCtx.arc(16, 16, 14, 0, Math.PI * 2);
          bCtx.fill();
          bCtx.globalAlpha = 1;
          bCtx.fillStyle = '#FFFFFF';
          bCtx.font = 'bold 16px Arial';
          bCtx.textAlign = 'center';
          bCtx.textBaseline = 'middle';
          bCtx.fillText(isReviewPaper ? 'R' : 'M', 16, 16);

          const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
          const badgeSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: badgeTexture, transparent: true, depthTest: false })
          );
          badgeSprite.scale.set(node.val * 1.5, node.val * 1.5, 1);
          badgeSprite.position.set(node.val * 0.8, node.val * 0.8, 0);
          group.add(badgeSprite);
        }
      }

      return group;
    },
    [highlightSet, showLabels, showBloom, bridgeNodeIds, showOARings, showCitationAura, highlightedPaperIds, showCosmicTheme, yearRange, highlightedClusterPair, secondSeedIds]
  );

  // Link width
  const linkWidth = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;
    // Highlight recently expanded edges with thicker width
    if (expandedEdgeIdsRef.current.size > 0) {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as ForceGraphNode).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as ForceGraphNode).id;
      if (expandedEdgeIdsRef.current.has(`${sourceId}-${targetId}`) ||
          expandedEdgeIdsRef.current.has(`${targetId}-${sourceId}`)) {
        return 3.0;
      }
    }
    // Mode-specific width adjustments
    if (edgeVisMode === 'crossCluster') {
      return link.isCrossCluster ? Math.max(link.width || 0.5, 1.5) : 0.3;
    }
    if (link.isInfluential) {
      return (link.width || 0.5) * 1.5; // Extra boost for influential
    }
    return Math.max(0.5, link.width || 0.5);
  }, [edgeVisMode]);

  // Build active path edge set for fast lookup
  const activePathEdgeSet = useMemo(() => {
    if (!activePath || activePath.length < 2) return null;
    const set = new Set<string>();
    for (let i = 0; i < activePath.length - 1; i++) {
      set.add(`${activePath[i]}-${activePath[i + 1]}`);
      set.add(`${activePath[i + 1]}-${activePath[i]}`);
    }
    return set;
  }, [activePath]);

  // Link color
  const linkColor = useCallback(
    (linkData: unknown) => {
      const link = linkData as ForceGraphLink;

      const sourceId =
        typeof link.source === 'string'
          ? link.source
          : (link.source as ForceGraphNode).id;
      const targetId =
        typeof link.target === 'string'
          ? link.target
          : (link.target as ForceGraphNode).id;

      // Active path highlighting: gold path edges, dim everything else
      if (activePathEdgeSet) {
        if (activePathEdgeSet.has(`${sourceId}-${targetId}`)) {
          return '#D4AF37';
        }
        return '#050510'; // dim non-path edges
      }

      // Highlight recently expanded edges
      if (expandedEdgeIdsRef.current.size > 0) {
        if (expandedEdgeIdsRef.current.has(`${sourceId}-${targetId}`) ||
            expandedEdgeIdsRef.current.has(`${targetId}-${sourceId}`)) {
          return '#D4AF37';
        }
      }

      // Check camera distance for LOD
      const camDist = fgRef.current?.camera()?.position?.length() ?? 0;
      const isFar = camDist > 2000;
      const isVeryFar = camDist > 3000;

      if (isFar && link.edgeType === 'similarity') {
        return '#050510'; // invisible on dark background
      }
      if (isVeryFar && link.width < 1.5) {
        return '#050510'; // hide weak edges at far distances
      }

      // Always-on special edges (rare, high-signal)
      if (link.isBidirectional) return '#FFD700'; // gold for mutual citation
      if (link.hasSharedAuthors) return '#2ECC71'; // green for shared authors

      // Mode-dependent coloring
      switch (edgeVisMode) {
        case 'temporal': {
          if (link.dashed) return '#333333'; // similarity edges dim in temporal mode
          const gap = link.yearGap ?? 0;
          const t = Math.min(gap / 10, 1);
          // Lerp from gold (recent/close) to dim gray (distant)
          const r = Math.round(212 + (85 - 212) * t);
          const g = Math.round(175 + (85 - 175) * t);
          const b = Math.round(55 + (85 - 55) * t);
          return `rgb(${r},${g},${b})`;
        }
        case 'crossCluster': {
          return link.isCrossCluster ? '#D4AF37' : '#222222';
        }
        case 'similarity':
        default: {
          // Original behavior: selection-based highlighting + intent colors
          if (!selectedPaper) {
            return link.dashed
              ? '#555555'
              : link.color || '#44444480';
          }
          if (highlightSet.has(sourceId) && highlightSet.has(targetId)) {
            return link.color || '#D4AF37';
          }
          return '#050510';
        }
      }
    },
    [selectedPaper, highlightSet, fgRef, activePathEdgeSet, edgeVisMode]
  );

  // Custom dashed link rendering for similarity edges
  const linkThreeObject = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;
    if (!link.dashed) return null;

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineDashedMaterial({
      color: 0x555555,
      dashSize: 2,
      gapSize: 1.5,
      opacity: 0.6,
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

  // Link click handler — dispatches citationEdgeClick custom event
  const handleLinkClick = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;
    const sourceId =
      typeof link.source === 'string' ? link.source : (link.source as ForceGraphNode).id;
    const targetId =
      typeof link.target === 'string' ? link.target : (link.target as ForceGraphNode).id;

    window.dispatchEvent(
      new CustomEvent('citationEdgeClick', {
        detail: {
          sourceId,
          targetId,
          type: link.edgeType || 'citation',
          intent: link.intentLabel,
          weight: link.width,
        },
      })
    );
  }, []);

  // Click handler
  const handleNodeClick = useCallback(
    (nodeData: unknown, event: MouseEvent) => {
      const node = nodeData as ForceGraphNode;
      const now = Date.now();

      justClickedNodeRef.current = true;
      setTimeout(() => { justClickedNodeRef.current = false; }, 150);

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
        // Dispatch expand event for explore page to handle
        window.dispatchEvent(new CustomEvent('expandPaper', { detail: { paper: node.paper } }));
        lastClickRef.current = null;
        return;
      }

      lastClickRef.current = { nodeId: node.id, timestamp: now };
      selectPaper(node.paper);
    },
    [selectPaper]
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
      }
    },
    []
  );

  // Background click
  const handleBackgroundClick = useCallback(() => {
    if (justClickedNodeRef.current) return; // Guard: ignore background click fired during node click
    selectPaper(null);
  }, [selectPaper]);

  // Cluster hull overlay
  const clusterOverlayRef = useRef<THREE.Group | null>(null);

  // Gap overlay ref
  const gapOverlayRef = useRef<THREE.Group | null>(null);

  // Gap arc ref
  const gapArcRef = useRef<THREE.Line | null>(null);
  // Gap arc glow sprite ref
  const gapArcGlowRef = useRef<THREE.Sprite | null>(null);
  // Gap void group ref
  const gapVoidRef = useRef<THREE.Group | null>(null);

  // Timeline labels ref
  const timelineOverlayRef = useRef<THREE.Group | null>(null);

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
      // Remove all children from scene immediately, defer dispose to next frame
      // This prevents the render loop from hitting disposed shaders in the same frame
      const toDispose = [...overlayGroup.children];
      toDispose.forEach(child => overlayGroup.remove(child));
      requestAnimationFrame(() => {
        toDispose.forEach(child => {
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

      // Use forceGraphData directly — d3-force mutates node positions in place
      if (!forceGraphData?.nodes?.length) return;

      const nodePositions = new Map<
        string,
        { x: number; y: number; z: number }
      >();
      (forceGraphData.nodes as ForceGraphNode[]).forEach((n) => {
        if (n.x !== undefined && n.y !== undefined && n.z !== undefined) {
          nodePositions.set(n.id, { x: n.x, y: n.y, z: n.z });
        }
      });

      if (showCosmicTheme) {
        // Nebula clusters
        graphData!.clusters.forEach((cluster) => {
          if (hiddenClusterIds.has(cluster.id)) return;
          const clusterNodes = graphData!.nodes.filter((p) => p.cluster_id === cluster.id);
          const positions = clusterNodes
            .map((p) => nodePositions.get(p.id))
            .filter(Boolean) as { x: number; y: number; z: number }[];
          if (positions.length < 2) return;

          // Use backend PageRank-weighted centroid when available; fallback to arithmetic mean
          // Backend centroids are in raw UMAP space — scale to display coordinates
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

          // Compute spread (average distance from centroid)
          const spread = positions.reduce((sum, p) => {
            return sum + Math.sqrt((p.x - centroid.x) ** 2 + (p.y - centroid.y) ** 2 + (p.z - centroid.z) ** 2);
          }, 0) / positions.length;

          const nebula = createNebulaCluster({
            color: cluster.color,
            centroid,
            nodeCount: clusterNodes.length,
            spread: spread || 30,
          });
          overlayGroup.add(nebula);
        });
      } else {
        // Original hull code
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
      }
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
  }, [showClusterHulls, graphData, showCosmicTheme, hiddenClusterIds, fgMounted]);

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
      // Remove all from scene immediately, defer dispose to next frame
      const toDispose = [...overlayGroup.children];
      toDispose.forEach(child => overlayGroup.remove(child));
      requestAnimationFrame(() => {
        toDispose.forEach(child => {
          (child as any).geometry?.dispose();
          (child as any).material?.dispose();
        });
      });

      // Use forceGraphData directly — d3-force mutates node positions in place
      if (!forceGraphData?.nodes?.length) return;

      const nodePositions = new Map<string, THREE.Vector3>();
      (forceGraphData.nodes as ForceGraphNode[]).forEach((n) => {
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
        const cluster = graphData!.clusters.find(c => c.id === clusterId);
        if (!cluster) return;

        // Diamond marker at centroid
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
        if (child.userData?.isCentroidMarker) {
          child.rotation.y = t * 0.5;
          child.rotation.x = Math.sin(t * 0.3) * 0.2;
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
  }, [showGapOverlay, graphData, fgMounted]);

  // Gap Arc: QuadraticBezierCurve3 between highlighted cluster centroids
  useEffect(() => {
    if (!fgRef.current) return;
    let scene: THREE.Scene;
    try {
      scene = fgRef.current.scene();
      if (!scene) return;
    } catch {
      return;
    }

    const manager = CosmicAnimationManager.getInstance();

    // Remove existing arc — remove from scene immediately, defer dispose
    if (gapArcRef.current) {
      scene.getObjectByName('gap-arc')?.removeFromParent();
      const arcMat = gapArcRef.current.material as THREE.ShaderMaterial;
      const arcGeo = gapArcRef.current.geometry;
      gapArcRef.current = null;
      requestAnimationFrame(() => {
        manager.deregisterShaderMaterial(arcMat);
        arcGeo.dispose();
        arcMat.dispose();
      });
    }

    // Remove existing glow — remove from scene immediately, defer dispose
    if (gapArcGlowRef.current) {
      scene.remove(gapArcGlowRef.current);
      const glowMat = gapArcGlowRef.current.material;
      gapArcGlowRef.current = null;
      requestAnimationFrame(() => glowMat.dispose());
    }

    // Remove existing void — remove from scene immediately, defer dispose
    if (gapVoidRef.current) {
      scene.remove(gapVoidRef.current);
      const voidGroup = gapVoidRef.current;
      gapVoidRef.current = null;
      requestAnimationFrame(() => {
        voidGroup.traverse((child) => {
          if ((child as any).geometry) (child as any).geometry.dispose();
          if ((child as any).material) {
            if (child instanceof THREE.Points && child.material instanceof THREE.ShaderMaterial) {
              manager.deregisterShaderMaterial(child.material);
            }
            (child as any).material.dispose();
          }
        });
      });
    }

    if (!highlightedClusterPair || !graphData) return;

    const [cidA, cidB] = highlightedClusterPair;
    const clusterA = graphData.clusters.find(c => c.id === cidA);
    const clusterB = graphData.clusters.find(c => c.id === cidB);
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

    const mid = new THREE.Vector3(
      (centA.x + centB.x) / 2,
      (centA.y + centB.y) / 2 + 30,
      (centA.z + centB.z) / 2,
    );

    const curve = new THREE.QuadraticBezierCurve3(centA, mid, centB);
    const points = curve.getPoints(50);
    const geo = new THREE.BufferGeometry().setFromPoints(points);

    // Create animated dashed line shader
    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float lineDistance;
        varying float vLineDistance;
        void main() {
          vLineDistance = lineDistance;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uDashSize;
        uniform float uGapSize;
        varying float vLineDistance;
        void main() {
          float totalSize = uDashSize + uGapSize;
          float modVal = mod(vLineDistance - uTime * 30.0, totalSize);
          if (modVal > uDashSize) discard;
          float pulse = 0.6 + 0.4 * sin(uTime * 3.0);
          gl_FragColor = vec4(uColor, 0.8 * pulse);
        }
      `,
      uniforms: {
        uColor: { value: new THREE.Color('#D4AF37') },
        uTime: { value: 0 },
        uDashSize: { value: 8.0 },
        uGapSize: { value: 4.0 },
      },
      transparent: true,
      depthWrite: false,
    });

    // Compute line distances for dash pattern
    const positions = geo.attributes.position;
    const lineDistances = new Float32Array(positions.count);
    let totalDist = 0;
    for (let i = 1; i < positions.count; i++) {
      const dx = positions.getX(i) - positions.getX(i - 1);
      const dy = positions.getY(i) - positions.getY(i - 1);
      const dz = positions.getZ(i) - positions.getZ(i - 1);
      totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
      lineDistances[i] = totalDist;
    }
    geo.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistances, 1));

    manager.registerShaderMaterial(mat);

    const arcLine = new THREE.Line(geo, mat);
    arcLine.name = 'gap-arc';
    scene.add(arcLine);
    gapArcRef.current = arcLine;

    // Glow sprite at arc midpoint
    const glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: new THREE.Color('#D4AF37'),
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glowSprite.position.copy(mid);
    glowSprite.scale.setScalar(20);
    glowSprite.name = 'gap-arc-glow';
    scene.add(glowSprite);
    gapArcGlowRef.current = glowSprite;

    // Find gap strength for this pair
    const gap = graphData.gaps?.find(g =>
      (g.cluster_a.id === cidA && g.cluster_b.id === cidB) ||
      (g.cluster_a.id === cidB && g.cluster_b.id === cidA)
    );
    const gapStrength = gap?.gap_strength ?? 0.5;

    // Create gap void visualization
    const voidGroup = createGapVoid({
      centroidA: centA,
      centroidB: centB,
      gapStrength,
    });
    scene.add(voidGroup);
    gapVoidRef.current = voidGroup;

    // Camera fly-to: center between the two cluster centroids
    if (fgRef.current) {
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
  }, [highlightedClusterPair, graphData, fgMounted]);

  // Timeline mode: fix node Y positions by publication year
  useEffect(() => {
    if (!fgRef.current || !graphData) return;

    // Use forceGraphData directly — d3-force mutates node positions in place
    if (!forceGraphData?.nodes?.length) return;

    if (showTimeline) {
      const years = graphData.nodes.map((p) => p.year).filter((y) => y != null && !isNaN(y));
      if (years.length === 0) return;
      const minY = Math.min(...years);
      const maxY = Math.max(...years);
      const span = maxY - minY || 1;

      (forceGraphData.nodes as ForceGraphNode[]).forEach((node) => {
        const paper = node.paper;
        if (paper?.year) {
          node.fy = ((paper.year - minY) / span) * 300 - 150;
        }
      });
    } else {
      // Release Y-axis fixation
      (forceGraphData.nodes as ForceGraphNode[]).forEach((node) => {
        node.fy = undefined;
      });
    }

    // Reheat simulation slightly to settle into new positions
    fgRef.current.d3ReheatSimulation?.();
  }, [showTimeline, graphData]);

  // Timeline mode: year labels and grid lines
  useEffect(() => {
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

    // Determine year step (5-year intervals, or 2 if range is small)
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
      if (timelineOverlayRef.current && fgRef.current?.scene()) {
        try { fgRef.current.scene().remove(timelineOverlayRef.current); } catch {}
        timelineOverlayRef.current = null;
      }
    };
  }, [showTimeline, graphData]);

  // Double-click visual feedback: pulse new nodes for 1.5s after expand
  useEffect(() => {
    if (!graphData) return;
    // When node count increases (expand happened), mark new nodes temporarily
    // New nodes will pulse for 1.5s
    if (newNodeTimerRef.current) clearTimeout(newNodeTimerRef.current);
    newNodeTimerRef.current = setTimeout(() => {
      newNodeIdsRef.current = new Set();
      if (fgRef.current) {
        try { fgRef.current.refresh(); } catch {}
      }
    }, 1500);
  }, [graphData?.nodes.length]);

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
          { x: 200, y: 150, z: 400 },
          { x: 0, y: 0, z: 0 },
          1000
        );
      }
    },
    zoomToFit: (duration = 400, padding = 120) => {
      if (fgRef.current) {
        fgRef.current.zoomToFit(duration, padding);
      }
    },
    animateExpandNodes: (parentNodeId: string, newNodeIds: string[], targets: Map<string, {x: number; y: number; z: number}>) => {
      if (!fgRef.current) return;

      // Track new nodes and expanded edges for visual highlighting
      newNodeIdsRef.current = new Set(newNodeIds);

      // Track parent → child relationship
      newNodeIds.forEach(id => {
        expandedFromRef.current.set(id, parentNodeId);
      });

      // Clear expansion highlights after 3 seconds
      if (expandedEdgeTimerRef.current) clearTimeout(expandedEdgeTimerRef.current);
      expandedEdgeTimerRef.current = setTimeout(() => {
        expandedEdgeIdsRef.current = new Set();
        expandedFromRef.current = new Map();
        newNodeIdsRef.current = new Set();
        if (fgRef.current) {
          try { fgRef.current.refresh(); } catch {}
        }
      }, 3000);

      // Use forceGraphData directly — d3-force mutates node positions in place
      if (!forceGraphData?.nodes?.length) return;

      // Find parent node position
      const parentNode = (forceGraphData.nodes as ForceGraphNode[]).find(n => n.id === parentNodeId);
      const ox = parentNode?.x ?? 0;
      const oy = parentNode?.y ?? 0;
      const oz = parentNode?.z ?? 0;

      // Find new nodes in force graph internal data and set initial fixed positions at parent
      const newNodeSet = new Set(newNodeIds);
      const nodesToAnimate: ForceGraphNode[] = [];
      (forceGraphData.nodes as ForceGraphNode[]).forEach(node => {
        if (newNodeSet.has(node.id)) {
          node.fx = ox;
          node.fy = oy;
          node.fz = oz;
          node.x = ox;
          node.y = oy;
          node.z = oz;
          nodesToAnimate.push(node);
        }
      });

      if (nodesToAnimate.length === 0) return;

      // Animate with requestAnimationFrame over 600ms (ease-out cubic)
      const duration = 600;
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

        nodesToAnimate.forEach(node => {
          const target = targets.get(node.id);
          if (!target) return;
          node.fx = ox + (target.x - ox) * eased;
          node.fy = oy + (target.y - oy) * eased;
          node.fz = oz + (target.z - oz) * eased;
        });

        fgRef.current?.refresh();

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Mark edges from parent to new nodes for highlighting
          const edgeIds = new Set<string>();
          newNodeIds.forEach(id => {
            edgeIds.add(`${parentNodeId}-${id}`);
            edgeIds.add(`${id}-${parentNodeId}`);
          });
          expandedEdgeIdsRef.current = edgeIds;

          // Release fixed positions so force simulation can take over
          nodesToAnimate.forEach(node => {
            node.fx = undefined;
            node.fy = undefined;
            node.fz = undefined;
          });
          fgRef.current?.refresh();
        }
      };

      requestAnimationFrame(animate);
    },
  }));

  // Set angled camera to show 3D depth when graph data is ready
  useEffect(() => {
    if (!fgRef.current || !graphData?.nodes?.length || !fgMounted) return;

    const setupCamera = () => {
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

      // Camera at elevated angle for 3D depth
      const dist = maxSpan * 1.8;
      fgRef.current.cameraPosition(
        { x: cx + dist * 0.15, y: cy - dist * 0.35, z: cz + dist * 0.75 },
        { x: cx, y: cy, z: cz },
        800 // smooth transition
      );
    };

    // Wait for force simulation to settle positions
    setTimeout(setupCamera, 1200);
  }, [graphData?.nodes?.length, fgMounted]);

  // Cosmic animation manager lifecycle
  useEffect(() => {
    if (showCosmicTheme) {
      const manager = CosmicAnimationManager.getInstance();
      manager.start();
      // Provide scene reference for selection pulse animation
      if (fgRef.current) {
        const scene = fgRef.current.scene?.();
        if (scene) {
          manager.setScene(scene);
          // Exponential fog for depth perception — far nodes fade into darkness
          scene.fog = new THREE.FogExp2(0x020208, 0.0006);
        }
        // Suppress non-fatal WebGL shader info log errors (gl.getShaderInfoLog can return
        // null on some drivers when queried during rapid material create/dispose cycles)
        try {
          const renderer = fgRef.current.renderer();
          if (renderer) renderer.debug.checkShaderErrors = false;
        } catch { /* renderer unavailable */ }
      }
    }
    return () => {
      // Remove fog when cosmic theme is disabled
      if (fgRef.current) {
        try {
          const scene = fgRef.current.scene?.();
          if (scene) scene.fog = null;
        } catch { /* scene unavailable */ }
      }
      CosmicAnimationManager.reset();
    };
  }, [showCosmicTheme, fgMounted]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (expandedEdgeTimerRef.current) clearTimeout(expandedEdgeTimerRef.current);
      if (newNodeTimerRef.current) clearTimeout(newNodeTimerRef.current);

      // NOTE: Do NOT manually traverse/dispose scene objects here.
      // three-forcegraph handles its own object lifecycle via emptyObject/deallocate.
      // Manual disposal causes double-free crashes (children[0] undefined TypeError).

      // Cleanup gap arc
      if (gapArcRef.current) {
        try {
          const scene = fgRef.current?.scene();
          if (scene) scene.remove(gapArcRef.current);
        } catch {}
        gapArcRef.current?.geometry.dispose();
        CosmicAnimationManager.getInstance().deregisterShaderMaterial(
          gapArcRef.current?.material as THREE.ShaderMaterial
        );
        (gapArcRef.current?.material as THREE.Material | undefined)?.dispose();
        gapArcRef.current = null;
      }

      // Cleanup gap arc glow
      if (gapArcGlowRef.current) {
        try {
          const scene = fgRef.current?.scene();
          if (scene) scene.remove(gapArcGlowRef.current);
        } catch {}
        gapArcGlowRef.current.material.dispose();
        gapArcGlowRef.current = null;
      }

      // Cleanup gap void — remove from scene FIRST, then dispose
      if (gapVoidRef.current) {
        try {
          const scene = fgRef.current?.scene();
          if (scene) scene.remove(gapVoidRef.current);
        } catch {}
        const voidGroup = gapVoidRef.current;
        gapVoidRef.current = null;
        voidGroup.traverse((child) => {
          if ((child as any).geometry) (child as any).geometry.dispose();
          if ((child as any).material) {
            if (child instanceof THREE.Points && child.material instanceof THREE.ShaderMaterial) {
              CosmicAnimationManager.getInstance().deregisterShaderMaterial(child.material);
            }
            (child as any).material.dispose();
          }
        });
      }

      // Clear animation manager (releases refs to shader materials & animated objects)
      CosmicAnimationManager.reset();

      // Dispose the WebGL renderer only — this is safe and prevents GPU memory leaks
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

  // Diagnostic logging (development only)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    console.log('[ScholarGraph3D] Render stats:', {
      nodes: forceGraphData.nodes.length,
      links: forceGraphData.links.length,
      cosmicTheme: showCosmicTheme,
      clusters: graphData?.clusters.length ?? 0,
      yearRange,
      expandedNodes: newNodeIdsRef.current.size,
    });
  }, [forceGraphData, showCosmicTheme, yearRange, graphData?.clusters.length]);

  if (!graphData) return null;

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative">
      {/* Z-axis legend — hybrid temporal+semantic */}
      <div className="absolute bottom-16 left-4 glass rounded-lg px-3 py-2 text-xs text-text-secondary pointer-events-none z-10">
        <div className="font-medium text-text-primary/60 mb-1 text-[10px] uppercase tracking-wide">
          Z-axis · {yearRange.max - yearRange.min >= 3 ? 'Time + Similarity' : 'Similarity'}
        </div>
        {yearRange.max - yearRange.min >= 3 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-text-secondary/40 text-[10px]">← Older</span>
            <span className="text-text-secondary/80">{yearRange.min}</span>
            <div className="w-10 h-px bg-gradient-to-r from-text-secondary/20 to-accent/50" />
            <span className="text-text-secondary/80">{yearRange.max}</span>
            <span className="text-text-secondary/40 text-[10px]">Newer →</span>
          </div>
        ) : (
          <div className="text-text-secondary/40 text-[10px]">
            Semantic embedding distance
          </div>
        )}
      </div>
      {isClient ? (
      <Suspense fallback={<ForceGraph3DLoading />}>
      <ForceGraph3D
        ref={fgRef}
        graphData={forceGraphData}
        nodeId="id"
        nodeThreeObject={nodeThreeObject}
        nodeLabel={(nodeData: unknown) => {
          const node = nodeData as ForceGraphNode;
          const p = node.paper;
          const tldrSnippet = p.tldr ? p.tldr.substring(0, 100) + (p.tldr.length > 100 ? '...' : '') : (p.abstract ? p.abstract.substring(0, 100) + '...' : '');
          const badges = [];
          if (node.citationPercentile > 0.9) badges.push('⭐ Highly Cited');
          if (p.is_bridge) badges.push('◈ Bridge');
          if (p.is_open_access) badges.push('🔓 OA');
          if (p.year && p.year >= 2024) badges.push('◆ New');
          return `
            <div style="background: rgba(10,10,10,0.95); padding: 12px 14px; border-radius: 10px; font-family: system-ui; font-size: 12px; max-width: 320px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
              <div style="font-weight: 600; color: ${node.color}; margin-bottom: 5px; line-height: 1.4;">${p.title.length > 80 ? p.title.substring(0, 80) + '...' : p.title}</div>
              <div style="color: #999999; font-size: 11px; margin-bottom: 3px;">${p.authors?.slice(0, 3).map((a) => a.name).join(', ') || 'Unknown'}${(p.authors?.length || 0) > 3 ? ' et al.' : ''}</div>
              <div style="color: #777777; font-size: 11px; margin-bottom: 5px;">${p.venue || ''} ${p.year || ''} | ${p.citation_count.toLocaleString()} citations</div>
              ${p.cluster_label ? `<div style="color: #888888; font-size: 10px; margin-bottom: 4px;">📍 ${p.cluster_label}</div>` : ''}
              ${tldrSnippet ? `<div style="color: #aaaaaa; font-size: 11px; line-height: 1.4; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 5px; margin-top: 5px;">${tldrSnippet}</div>` : ''}
              ${badges.length > 0 ? `<div style="margin-top: 5px; font-size: 10px; color: #999999;">${badges.join('  ')}</div>` : ''}
            </div>
          `;
        }}
        linkWidth={linkWidth}
        linkColor={linkColor}
        linkOpacity={0.8}
        linkThreeObject={linkThreeObject as never}
        linkPositionUpdate={linkPositionUpdate as never}
        linkLabel={(linkData: unknown) => {
          const link = linkData as ForceGraphLink;
          if (!link.intentLabel) return '';
          const contextSnippet = link.intentContext
            ? `<div style="color: #999999; font-size: 10px; margin-top: 4px; max-width: 250px;">${
                link.intentContext.length > 120
                  ? link.intentContext.substring(0, 120) + '...'
                  : link.intentContext
              }</div>`
            : '';
          return `
            <div style="background: rgba(10,10,10,0.92); padding: 8px 12px; border-radius: 6px; font-family: system-ui; font-size: 11px; border: 1px solid rgba(255,255,255,0.08);">
              <div style="color: ${link.color}; font-weight: bold; text-transform: capitalize;">${link.intentLabel.replace('_', ' ')}</div>
              ${contextSnippet}
            </div>
          `;
        }}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={(linkData: unknown) => {
          const link = linkData as ForceGraphLink;
          if (link.dashed) return 0; // no particles on similarity edges
          return 4; // 4 flowing particles on citation edges
        }}
        linkDirectionalParticleWidth={(linkData: unknown) => {
          const link = linkData as ForceGraphLink;
          return link.dashed ? 0 : 2;
        }}
        linkDirectionalParticleSpeed={(linkData: unknown) => {
          const link = linkData as ForceGraphLink;
          return link.dashed ? 0 : 0.006;
        }}
        linkDirectionalParticleColor={(linkData: unknown) => {
          const link = linkData as ForceGraphLink;
          return link.dashed ? '#555555' : '#D4AF37';
        }}
        backgroundColor="#000000"
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onLinkClick={handleLinkClick}
        onBackgroundClick={handleBackgroundClick}
        warmupTicks={100}
        cooldownTicks={layoutMode === 'network' ? Infinity : 0}
        d3VelocityDecay={layoutMode === 'network' ? 0.6 : 0.9}
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
      </Suspense>
      ) : (
        <ForceGraph3DLoading />
      )}
    </div>
  );
});

ScholarGraph3D.displayName = 'ScholarGraph3D';

export default ScholarGraph3D;
