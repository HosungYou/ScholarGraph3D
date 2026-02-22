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
import { createStarNode } from './cosmic/starNodeRenderer';
import { createNebulaCluster } from './cosmic/nebulaClusterRenderer';
import CosmicAnimationManager from './cosmic/CosmicAnimationManager';
import { getStarColors } from './cosmic/cosmicConstants';

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
  // Computer & Engineering
  'Computer Science': '#4A90D9',
  'Engineering': '#5B9BD5',
  'Mathematics': '#6CA6E0',
  // Life & Medical Sciences
  'Medicine': '#E74C3C',
  'Biology': '#2ECC71',
  'Biochemistry': '#27AE60',
  'Neuroscience': '#1ABC9C',
  'Psychology': '#16A085',
  'Agricultural and Food Sciences': '#A3D977',
  'Environmental Science': '#82C341',
  // Physical Sciences
  'Physics': '#9B59B6',
  'Chemistry': '#8E44AD',
  'Materials Science': '#7D3C98',
  'Geology': '#6C3483',
  // Social Sciences & Humanities
  'Economics': '#E67E22',
  'Sociology': '#D35400',
  'Political Science': '#CA6F1E',
  'Philosophy': '#BA4A00',
  'History': '#A04000',
  'Geography': '#C0392B',
  'Linguistics': '#F39C12',
  'Art': '#F1C40F',
  'Education': '#E59866',
  // Business & Law
  'Business': '#5DADE2',
  'Law': '#48C9B0',
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
  edgeType: 'citation' | 'similarity' | 'ghost';
  dashed: boolean;
  intentLabel?: string;
  intentContext?: string;
}

export interface ScholarGraph3DRef {
  focusOnPaper: (paperId: string) => void;
  focusOnCluster: (clusterId: number) => void;
  resetCamera: () => void;
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
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
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
    showEnhancedIntents,
    showBloom,
    showOARings,
    showCitationAura,
    showGhostEdges,
    showGapOverlay,
    hiddenClusterIds,
    bridgeNodeIds,
    conceptualEdges,
    showConceptualEdges,
    showTimeline,
    selectPaper,
    setHoveredPaper,
    toggleMultiSelect,
    highlightedPaperIds,
    showCosmicTheme,
  } = useGraphStore();

  const lastClickRef = useRef<{ nodeId: string; timestamp: number } | null>(
    null
  );
  const newNodeIdsRef = useRef<Set<string>>(new Set());
  const newNodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const starCol = getStarColors(primaryField);
        const color = starCol.core;
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
        width: isSimilarity ? 1.0 : isInfluential ? 2 + edge.weight * 2 : 1 + edge.weight * 2,
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

    // Conceptual relationship edges (Phase 4)
    if (showConceptualEdges && conceptualEdges.length > 0) {
      const existingPairs = new Set(
        links.map((l) => {
          const s = typeof l.source === 'string' ? l.source : (l.source as ForceGraphNode).id;
          const t = typeof l.target === 'string' ? l.target : (l.target as ForceGraphNode).id;
          return `${s}-${t}`;
        })
      );

      conceptualEdges.forEach((ce) => {
        if (!existingPairs.has(`${ce.source}-${ce.target}`)) {
          links.push({
            source: ce.source,
            target: ce.target,
            color: ce.color,
            width: Math.max(0.5, ce.weight * 1.5),
            edgeType: 'similarity' as const,
            dashed: false,
            intentLabel: ce.relation_type.replace(/_/g, ' '),
            intentContext: ce.explanation,
          });
        }
      });
    }

    return { nodes, links };
  }, [graphData, yearRange, showCitationEdges, showSimilarityEdges, citationIntents, showEnhancedIntents, hiddenClusterIds, showGhostEdges, conceptualEdges, showConceptualEdges]);

  // Node rendering
  const nodeThreeObject = useCallback(
    (nodeData: unknown) => {
      const node = nodeData as ForceGraphNode;

      const isHighlighted = highlightSet.has(node.id);
      const isSelected = selectedPaperIdRef.current === node.id;
      const hasSelection = selectedPaperIdRef.current !== null;
      const isHighlightedByPanel = highlightedPaperIds.has(node.id);

      // === COSMIC THEME: Star nodes ===
      if (showCosmicTheme) {
        const cosmicOpacity = (() => {
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
        });
        group.userData.nodeId = node.id;

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
      if (isSelected) displayColor = '#FFD700';
      else if (isHighlightedByPanel) displayColor = '#FF6B6B';
      else if (isHighlighted) displayColor = '#4ECDC4';

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
    [highlightSet, showLabels, showBloom, bridgeNodeIds, showOARings, showCitationAura, highlightedPaperIds, showCosmicTheme, yearRange]
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

      // Check camera distance for LOD
      const camDist = fgRef.current?.camera()?.position?.length() ?? 0;
      const isFar = camDist > 2000;
      const isVeryFar = camDist > 3000;

      if (isFar && link.edgeType === 'similarity') {
        return '#000000'; // invisible on dark background
      }
      if (isVeryFar && link.width < 1.5) {
        return '#000000'; // hide weak edges at far distances
      }

      if (!selectedPaper) {
        return link.dashed
          ? '#4a90d9'
          : '#8890a5';
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
      return '#050510'; // near-invisible on dark background (was rgba(255,255,255,0.03))
    },
    [selectedPaper, highlightSet, fgRef]
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
        // Dispatch expand event for explore page to handle
        window.dispatchEvent(new CustomEvent('expandPaper', { detail: { paper: node.paper } }));
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
    if (justClickedNodeRef.current) return; // Guard: ignore background click fired during node click
    selectPaper(null);
  }, [selectPaper]);

  // Cluster hull overlay
  const clusterOverlayRef = useRef<THREE.Group | null>(null);

  // Gap overlay ref
  const gapOverlayRef = useRef<THREE.Group | null>(null);

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

      if (showCosmicTheme) {
        // Nebula clusters
        graphData!.clusters.forEach((cluster) => {
          if (hiddenClusterIds.has(cluster.id)) return;
          const clusterNodes = graphData!.nodes.filter((p) => p.cluster_id === cluster.id);
          const positions = clusterNodes
            .map((p) => nodePositions.get(p.id))
            .filter(Boolean) as { x: number; y: number; z: number }[];
          if (positions.length < 2) return;

          const centroid = { x: 0, y: 0, z: 0 };
          positions.forEach((p) => { centroid.x += p.x; centroid.y += p.y; centroid.z += p.z; });
          centroid.x /= positions.length;
          centroid.y /= positions.length;
          centroid.z /= positions.length;

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
  }, [showClusterHulls, graphData, showCosmicTheme, hiddenClusterIds]);

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

  // Timeline mode: fix node Y positions by publication year
  useEffect(() => {
    if (!fgRef.current || !graphData) return;

    const currentData = fgRef.current.graphData();
    if (!currentData?.nodes) return;

    if (showTimeline) {
      const years = graphData.nodes.map((p) => p.year).filter((y) => y != null && !isNaN(y));
      if (years.length === 0) return;
      const minY = Math.min(...years);
      const maxY = Math.max(...years);
      const span = maxY - minY || 1;

      (currentData.nodes as ForceGraphNode[]).forEach((node) => {
        const paper = node.paper;
        if (paper?.year) {
          node.fy = ((paper.year - minY) / span) * 300 - 150;
        }
      });
    } else {
      // Release Y-axis fixation
      (currentData.nodes as ForceGraphNode[]).forEach((node) => {
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
          { x: 0, y: 0, z: 500 },
          { x: 0, y: 0, z: 0 },
          1000
        );
      }
    },
    animateExpandNodes: (parentNodeId: string, newNodeIds: string[], targets: Map<string, {x: number; y: number; z: number}>) => {
      if (!fgRef.current) return;
      const graphData = fgRef.current.graphData();
      if (!graphData?.nodes) return;

      // Find parent node position
      const parentNode = (graphData.nodes as ForceGraphNode[]).find(n => n.id === parentNodeId);
      const ox = parentNode?.x ?? 0;
      const oy = parentNode?.y ?? 0;
      const oz = parentNode?.z ?? 0;

      // Find new nodes in force graph internal data and set initial fixed positions at parent
      const newNodeSet = new Set(newNodeIds);
      const nodesToAnimate: ForceGraphNode[] = [];
      (graphData.nodes as ForceGraphNode[]).forEach(node => {
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

  // Zoom to fit when graph data changes
  useEffect(() => {
    if (fgRef.current && graphData?.nodes?.length) {
      setTimeout(() => {
        fgRef.current?.zoomToFit(400, 80);
      }, 800);
    }
  }, [graphData?.nodes?.length]);

  // Cosmic animation manager lifecycle
  useEffect(() => {
    if (showCosmicTheme) {
      CosmicAnimationManager.getInstance().start();
    }
    return () => {
      CosmicAnimationManager.reset();
    };
  }, [showCosmicTheme]);

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
    <div ref={containerRef} className="w-full h-full bg-background relative">
      {/* Z-axis temporal depth legend — v0.7.0: Z = publication year */}
      <div className="absolute bottom-16 left-4 glass rounded-lg px-3 py-2 text-xs text-text-secondary pointer-events-none z-10">
        <div className="font-medium text-text-primary/60 mb-1 text-[10px] uppercase tracking-wide">
          Z-axis · Time depth
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-text-secondary/40 text-[10px]">← Older</span>
          <span className="text-text-secondary/80">{yearRange.min}</span>
          <div className="w-10 h-px bg-gradient-to-r from-text-secondary/20 to-accent/50" />
          <span className="text-text-secondary/80">{yearRange.max}</span>
          <span className="text-text-secondary/40 text-[10px]">Newer →</span>
        </div>
      </div>
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
            <div style="background: rgba(5,5,16,0.95); padding: 12px 14px; border-radius: 10px; font-family: system-ui; font-size: 12px; max-width: 320px; border: 1px solid rgba(0,229,255,0.15); box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
              <div style="font-weight: 600; color: ${node.color}; margin-bottom: 5px; line-height: 1.4;">${p.title.length > 80 ? p.title.substring(0, 80) + '...' : p.title}</div>
              <div style="color: #8890a5; font-size: 11px; margin-bottom: 3px;">${p.authors.slice(0, 3).map((a) => a.name).join(', ')}${p.authors.length > 3 ? ' et al.' : ''}</div>
              <div style="color: #6870a0; font-size: 11px; margin-bottom: 5px;">${p.venue || ''} ${p.year || ''} | ${p.citation_count.toLocaleString()} citations</div>
              ${p.cluster_label ? `<div style="color: #5a7a9a; font-size: 10px; margin-bottom: 4px;">📍 ${p.cluster_label}</div>` : ''}
              ${tldrSnippet ? `<div style="color: #a0a8c0; font-size: 11px; line-height: 1.4; border-top: 1px solid rgba(42,48,80,0.5); padding-top: 5px; margin-top: 5px;">${tldrSnippet}</div>` : ''}
              ${badges.length > 0 ? `<div style="margin-top: 5px; font-size: 10px; color: #8890a5;">${badges.join('  ')}</div>` : ''}
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
        backgroundColor="#050510"
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onLinkClick={handleLinkClick}
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
