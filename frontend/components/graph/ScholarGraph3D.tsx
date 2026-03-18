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
import { getStarColors, CLUSTER_COLORS } from './cosmic/cosmicConstants';
import { useGraphInteractions } from './useGraphInteractions';
import { useGraphRenderer } from './useGraphRenderer';
import {
  updateClusterOverlay,
  updateGapOverlay,
  updateGapArc,
  updateTimelineOverlay,
  setupCosmicAnimationManager,
  setupInitialCamera,
  cleanupGraph,
} from './graphEffects';

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

// ─── Shared types (exported for sub-modules) ────────────────────────

export interface ForceGraphNode {
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

export interface ForceGraphLink {
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

// ─── Component ──────────────────────────────────────────────────────

const ScholarGraph3D = forwardRef<ScholarGraph3DRef>((_, ref) => {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const hoverConnectedRef = useRef<Set<string>>(new Set());

  // Client-only guard: React.lazy doesn't have ssr:false like next/dynamic
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  // Track when ForceGraph3D mounts so dependent useEffects re-fire.
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
    showTimeline,
    highlightedPaperIds,
    showCosmicTheme,
    expandedFromMap,
    activePath,
    highlightedClusterPair,
    hoveredGapEdges,
  } = useGraphStore();

  const newNodeIdsRef = useRef<Set<string>>(new Set());
  const newNodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedFromRef = useRef<Map<string, string>>(new Map());
  const expandedEdgeIdsRef = useRef<Set<string>>(new Set());
  const expandedEdgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const umapPositionsRef = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());

  // Scene overlay refs
  const clusterOverlayRef = useRef<THREE.Group | null>(null);
  const gapOverlayRef = useRef<THREE.Group | null>(null);
  const timelineOverlayRef = useRef<THREE.Group | null>(null);

  // Sync expandedFromMap from store to local ref
  useEffect(() => {
    expandedFromRef.current = new Map(expandedFromMap);
  }, [expandedFromMap]);

  // Store UMAP positions whenever graphData loads (for semantic mode restore)
  useEffect(() => {
    if (!graphData) return;
    const CS = 15;
    const ZS = 10;
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

  // Sync selectedPaper to ref + trigger visual refresh
  useEffect(() => {
    selectedPaperIdRef.current = selectedPaper?.id ?? null;
    if (fgRef.current) {
      try {
        fgRef.current.refresh();
      } catch {
        // Ignore if not yet mounted
      }
    }
  }, [selectedPaper]);

  // ── Convert graph data to force graph format ──────────────────

  const forceGraphData = useMemo(() => {
    if (!graphData)
      return { nodes: [] as ForceGraphNode[], links: [] as ForceGraphLink[] };

    const nodeMap = new Map<string, Paper>();
    graphData.nodes.forEach((n) => nodeMap.set(n.id, n));

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
        const starCol = getStarColors(primaryField);
        // Color by cluster (with field-based fallback for noise)
        const isSeed = paper.direction === 'seed';
        const color = isSeed
          ? '#D4AF37'
          : paper.cluster_id >= 0
            ? CLUSTER_COLORS[paper.cluster_id % CLUSTER_COLORS.length]
            : starCol.core;
        const yearSpan = yearRange.max - yearRange.min || 1;
        const paperYear = paper.year || yearRange.min;
        const opacity =
          0.3 + 0.7 * ((paperYear - yearRange.min) / yearSpan);

        const rawCitations = paper.citation_count || 0;
        const baseSize = Math.min(4, Math.max(1, Math.log2(rawCitations + 2) * 0.7));
        const size = isSeed ? baseSize * 1.5 : baseSize;

        const authorName = paper.authors?.[0]?.name?.split(' ').pop() || 'Unknown';
        const citationPercentile = citationRankMap.get(paper.id) || 0;

        const CS = 15;
        const ZS = 10;
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
        };
      });

    const filteredEdges = graphData.edges.filter((e) => {
      if (e.type === 'citation' && !showCitationEdges) return false;
      if (e.type === 'similarity' && !showSimilarityEdges) return false;
      return true;
    });

    const intentMap = new Map<string, CitationIntent>();
    citationIntents.forEach((ci) => {
      intentMap.set(`${ci.citing_id}-${ci.cited_id}`, ci);
    });

    const citationPairSet = new Set<string>();
    graphData.edges.filter((e) => e.type === 'citation').forEach((e) => {
      citationPairSet.add(`${e.source}->${e.target}`);
    });
    const bidirectionalPairs = new Set<string>();
    graphData.edges.filter((e) => e.type === 'citation').forEach((e) => {
      if (citationPairSet.has(`${e.target}->${e.source}`)) {
        const key = [e.source, e.target].sort().join('--');
        bidirectionalPairs.add(key);
      }
    });

    const links: ForceGraphLink[] = filteredEdges.map((edge) => {
      const isSimilarity = edge.type === 'similarity';

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

      const hasSharedAuthors = (() => {
        if (!sourceNode || !targetNode) return false;
        const srcAuthors = new Set(sourceNode.authors?.map((a) => typeof a === 'string' ? a : a.name) || []);
        return targetNode.authors?.some((a) => srcAuthors.has(typeof a === 'string' ? a : a.name)) || false;
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

    // Ghost edges
    if (showGhostEdges) {
      const citationPairs = new Set(
        graphData.edges
          .filter((e) => e.type === 'citation')
          .flatMap((e) => [`${e.source}-${e.target}`, `${e.target}-${e.source}`])
      );
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

    // Potential edges from gap hover
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
  }, [graphData, yearRange, showCitationEdges, showSimilarityEdges, citationIntents, hiddenClusterIds, showGhostEdges, hoveredGapEdges]);

  // ── Interactions hook ─────────────────────────────────────────

  const {
    handleNodeClick,
    handleNodeHover,
    handleBackgroundClick,
    handleLinkClick,
    focusPanelSelection,
    focusOnPaper,
    focusOnCluster,
    resetCamera,
    zoomToFit,
    animateExpandNodes,
  } = useGraphInteractions({
    fgRef,
    containerRef,
    hoveredNodeRef,
    hoverConnectedRef,
    justClickedNodeRef,
    forceGraphData,
    newNodeIdsRef,
    expandedFromRef,
    expandedEdgeIdsRef,
    expandedEdgeTimerRef,
  });

  // ── Renderer hook ─────────────────────────────────────────────

  const {
    nodeThreeObject,
    linkWidth,
    linkColor,
    linkThreeObject,
    linkPositionUpdate,
  } = useGraphRenderer({
    fgRef,
    selectedPaperIdRef,
    hoveredNodeRef,
    hoverConnectedRef,
    newNodeIdsRef,
    expandedFromRef,
    expandedEdgeIdsRef,
    highlightSet,
    highlightedPaperIds,
    highlightedClusterPair,
    selectedPaper,
    showLabels,
    showBloom,
    showOARings,
    showCitationAura,
    showCosmicTheme,
    yearRange,
    activePath,
  });

  // ── Camera auto-focus when paper selected from panel ──────────

  useEffect(() => {
    focusPanelSelection();
  }, [focusPanelSelection]);

  // ── Scene effects ─────────────────────────────────────────────

  // Cluster hull / nebula overlay
  useEffect(() => {
    return updateClusterOverlay({
      fgRef,
      clusterOverlayRef,
      graphData: graphData!,
      forceGraphNodes: forceGraphData.nodes,
      showCosmicTheme,
      showClusterHulls,
      hiddenClusterIds,
    });
  }, [showClusterHulls, graphData, showCosmicTheme, hiddenClusterIds, fgMounted, forceGraphData.nodes]);

  // Gap overlay
  useEffect(() => {
    return updateGapOverlay({
      fgRef,
      gapOverlayRef,
      graphData: graphData!,
      forceGraphNodes: forceGraphData.nodes,
      showGapOverlay,
    });
  }, [showGapOverlay, graphData, fgMounted, forceGraphData.nodes]);

  // Gap camera fly-to when cluster pair selected
  useEffect(() => {
    updateGapArc({ fgRef, highlightedClusterPair, graphData });
  }, [highlightedClusterPair, graphData, fgMounted]);

  // Timeline mode: fix node Y positions by publication year
  useEffect(() => {
    if (!fgRef.current || !graphData) return;
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
      (forceGraphData.nodes as ForceGraphNode[]).forEach((node) => {
        node.fy = undefined;
      });
    }

    fgRef.current.d3ReheatSimulation?.();
  }, [showTimeline, graphData, forceGraphData.nodes]);

  // Timeline labels and grid
  useEffect(() => {
    return updateTimelineOverlay({
      fgRef,
      timelineOverlayRef,
      graphData,
      showTimeline,
    });
  }, [showTimeline, graphData]);

  // New-node pulse timer
  useEffect(() => {
    const fgInstance = fgRef.current;
    if (!graphData) return;
    if (newNodeTimerRef.current) clearTimeout(newNodeTimerRef.current);
    newNodeTimerRef.current = setTimeout(() => {
      newNodeIdsRef.current = new Set();
      if (fgInstance) {
        try { fgInstance.refresh(); } catch {}
      }
    }, 1500);
  }, [graphData, graphData?.nodes.length]);

  // Expose ref methods
  useImperativeHandle(ref, () => ({
    focusOnPaper,
    focusOnCluster,
    resetCamera,
    zoomToFit,
    animateExpandNodes,
  }));

  // Initial camera setup
  useEffect(() => {
    if (!fgRef.current || !graphData?.nodes?.length || !fgMounted) return;
    setTimeout(() => setupInitialCamera(fgRef), 1200);
  }, [graphData?.nodes?.length, fgMounted]);

  // Cluster gravity: nodes pulled toward their cluster centroid so same-cluster papers form islands
  useEffect(() => {
    if (!fgRef.current || !graphData?.clusters?.length || !fgMounted) return;

    const CS = 15;
    const ZS = 10;

    const clusterCentroids = new Map<number, { x: number; y: number; z: number }>();
    graphData.clusters.forEach((cluster) => {
      if (cluster.centroid) {
        clusterCentroids.set(cluster.id, {
          x: cluster.centroid[0] * CS,
          y: cluster.centroid[1] * CS,
          z: cluster.centroid[2] * ZS,
        });
      } else {
        const clusterNodes = graphData.nodes.filter(n => n.cluster_id === cluster.id);
        if (clusterNodes.length === 0) return;
        const avg = clusterNodes.reduce(
          (sum, n) => ({ x: sum.x + n.x * CS, y: sum.y + n.y * CS, z: sum.z + n.z * ZS }),
          { x: 0, y: 0, z: 0 }
        );
        clusterCentroids.set(cluster.id, {
          x: avg.x / clusterNodes.length,
          y: avg.y / clusterNodes.length,
          z: avg.z / clusterNodes.length,
        });
      }
    });

    const clusterForce = () => (alpha: number) => {
      (forceGraphData.nodes as any[]).forEach((node) => {
        const clusterId = (node.paper as any)?.cluster_id;
        if (clusterId === undefined || clusterId < 0) return;
        const centroid = clusterCentroids.get(clusterId);
        if (!centroid) return;
        const strength = 0.08;
        node.vx = (node.vx || 0) + (centroid.x - (node.x || 0)) * strength * alpha;
        node.vy = (node.vy || 0) + (centroid.y - (node.y || 0)) * strength * alpha;
        node.vz = (node.vz || 0) + (centroid.z - (node.z || 0)) * strength * alpha;
      });
    };

    try {
      fgRef.current.d3Force('cluster', clusterForce());
      fgRef.current.d3ReheatSimulation();
    } catch {
      // fgRef not ready
    }
  }, [fgMounted, graphData, forceGraphData.nodes]);

  // Cosmic animation manager lifecycle
  useEffect(() => {
    return setupCosmicAnimationManager(fgRef, showCosmicTheme);
  }, [showCosmicTheme, fgMounted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupGraph(fgRef, {
        hoverTimeoutRef,
        expandedEdgeTimerRef,
        newNodeTimerRef,
      });
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
            <div style="background: rgba(8,8,8,0.97); padding: 12px 14px; border-radius: 10px; font-family: system-ui; font-size: 12px; max-width: 340px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 6px 28px rgba(0,0,0,0.55);">
              <div style="font-weight: 600; color: ${node.color}; margin-bottom: 6px; line-height: 1.45; font-size: 13px;">${p.title}</div>
              <div style="color: #999999; font-size: 11px; margin-bottom: 3px;">${p.authors?.slice(0, 3).map((a) => a.name).join(', ') || 'Unknown'}${(p.authors?.length || 0) > 3 ? ' et al.' : ''}</div>
              <div style="color: #777777; font-size: 11px; margin-bottom: 5px;">${p.venue || ''} ${p.year || ''} &middot; ${p.citation_count.toLocaleString()} citations</div>
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
          if (link.dashed) return 0;
          return 4;
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
        warmupTicks={50}
        cooldownTicks={150}
        d3VelocityDecay={0.4}
        enableNodeDrag={false}
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
