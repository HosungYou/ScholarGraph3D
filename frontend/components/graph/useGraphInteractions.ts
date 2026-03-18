import { useCallback, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useGraphStore } from '@/hooks/useGraphStore';
import type { ForceGraphNode, ForceGraphLink } from './ScholarGraph3D';

// ─── Parameters ─────────────────────────────────────────────────────

interface UseGraphInteractionsParams {
  fgRef: MutableRefObject<any>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  hoveredNodeRef: MutableRefObject<string | null>;
  hoverConnectedRef: MutableRefObject<Set<string>>;
  justClickedNodeRef: MutableRefObject<boolean>;
  forceGraphData: { nodes: ForceGraphNode[]; links: ForceGraphLink[] };
  /** Refs for expand animation state */
  newNodeIdsRef: MutableRefObject<Set<string>>;
  expandedFromRef: MutableRefObject<Map<string, string>>;
  expandedEdgeIdsRef: MutableRefObject<Set<string>>;
  expandedEdgeTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useGraphInteractions({
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
}: UseGraphInteractionsParams) {
  const { selectPaper, panelSelectionId, setPanelSelectionId } = useGraphStore();

  const lastClickRef = useRef<{ nodeId: string; timestamp: number } | null>(null);

  // ── Node click (single = select, double = expand) ──────────────

  const handleNodeClick = useCallback(
    (nodeData: unknown, _event: MouseEvent) => {
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
    [selectPaper, fgRef, justClickedNodeRef]
  );

  // ── Node hover ─────────────────────────────────────────────────

  const handleNodeHover = useCallback(
    (nodeData: unknown) => {
      const node = nodeData as ForceGraphNode | null;
      const newId = node?.id || null;
      if (newId !== hoveredNodeRef.current) {
        hoveredNodeRef.current = newId;

        // Build set of connected node IDs for hover highlighting
        if (newId) {
          const connected = new Set<string>([newId]);
          forceGraphData.links.forEach((link) => {
            const srcId = typeof link.source === 'string' ? link.source : (link.source as ForceGraphNode).id;
            const tgtId = typeof link.target === 'string' ? link.target : (link.target as ForceGraphNode).id;
            if (srcId === newId) connected.add(tgtId);
            if (tgtId === newId) connected.add(srcId);
          });
          hoverConnectedRef.current = connected;
        } else {
          hoverConnectedRef.current = new Set();
        }

        if (containerRef.current) {
          containerRef.current.style.cursor = newId ? 'pointer' : 'default';
        }

        // Trigger visual refresh for hover highlighting
        try { fgRef.current?.refresh(); } catch { /* not yet mounted */ }
      }
    },
    [hoveredNodeRef, hoverConnectedRef, containerRef, forceGraphData.links, fgRef]
  );

  // ── Background click (deselect) ───────────────────────────────

  const handleBackgroundClick = useCallback(() => {
    if (justClickedNodeRef.current) return;
    selectPaper(null);
  }, [selectPaper, justClickedNodeRef]);

  // ── Link click ─────────────────────────────────────────────────

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

  // ── Camera focus on panel selection ────────────────────────────

  const focusPanelSelection = useCallback(() => {
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
  }, [panelSelectionId, fgRef, forceGraphData.nodes, setPanelSelectionId]);

  // ── Imperative ref methods ─────────────────────────────────────

  const focusOnPaper = useCallback(
    (paperId: string) => {
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
    [fgRef, forceGraphData.nodes]
  );

  const focusOnCluster = useCallback(
    (clusterId: number) => {
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
    [fgRef, forceGraphData.nodes]
  );

  const resetCamera = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: 200, y: 150, z: 400 },
        { x: 0, y: 0, z: 0 },
        1000
      );
    }
  }, [fgRef]);

  const zoomToFit = useCallback(
    (duration = 400, padding = 120) => {
      if (fgRef.current) {
        fgRef.current.zoomToFit(duration, padding);
      }
    },
    [fgRef]
  );

  const animateExpandNodes = useCallback(
    (
      parentNodeId: string,
      newNodeIds: string[],
      targets: Map<string, { x: number; y: number; z: number }>
    ) => {
      if (!fgRef.current) return;

      // Track new nodes and expanded edges for visual highlighting
      newNodeIdsRef.current = new Set(newNodeIds);

      // Track parent -> child relationship
      newNodeIds.forEach((id) => {
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

      // Use forceGraphData directly - d3-force mutates node positions in place
      if (!forceGraphData?.nodes?.length) return;

      // Find parent node position
      const parentNode = (forceGraphData.nodes as ForceGraphNode[]).find(
        (n) => n.id === parentNodeId
      );
      const ox = parentNode?.x ?? 0;
      const oy = parentNode?.y ?? 0;
      const oz = parentNode?.z ?? 0;

      // Find new nodes in force graph internal data and set initial fixed positions at parent
      const newNodeSet = new Set(newNodeIds);
      const nodesToAnimate: ForceGraphNode[] = [];
      (forceGraphData.nodes as ForceGraphNode[]).forEach((node) => {
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

        nodesToAnimate.forEach((node) => {
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
          newNodeIds.forEach((id) => {
            edgeIds.add(`${parentNodeId}-${id}`);
            edgeIds.add(`${id}-${parentNodeId}`);
          });
          expandedEdgeIdsRef.current = edgeIds;

          // Release fixed positions so force simulation can take over
          nodesToAnimate.forEach((node) => {
            node.fx = undefined;
            node.fy = undefined;
            node.fz = undefined;
          });
          fgRef.current?.refresh();
        }
      };

      requestAnimationFrame(animate);
    },
    [fgRef, forceGraphData, newNodeIdsRef, expandedFromRef, expandedEdgeIdsRef, expandedEdgeTimerRef]
  );

  return {
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
  };
}
