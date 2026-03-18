import { create } from 'zustand';
import type {
  Paper,
  GraphEdge,
  Cluster,
  GraphData,
  CitationIntent,
  StructuralGap,
} from '@/types';

interface GraphStore {
  graphData: GraphData | null;
  graphMeta: Record<string, any> | null;
  setGraphMeta: (meta: Record<string, any>) => void;
  selectedPaper: Paper | null;
  selectedCluster: Cluster | null;
  isLoading: boolean;
  error: string | null;

  activeTab: 'clusters' | 'gaps';
  highlightedPaperIds: Set<string>;

  // Phase 1.5: Visual enhancement state
  showBloom: boolean;
  showOARings: boolean;
  showCitationAura: boolean;
  showGhostEdges: boolean;
  showGapOverlay: boolean;
  hiddenClusterIds: Set<number>;
  bridgeNodeIds: Set<string>;

  // Citation intents for edge coloring
  citationIntents: CitationIntent[];
  setCitationIntents: (intents: CitationIntent[]) => void;

  // v1.1.0: Expansion tracking
  expandedFromMap: Map<string, string>;

  // Phase 3: Gap Spotter
  gaps: StructuralGap[];
  frontierIds: string[];
  setGaps: (gaps: StructuralGap[]) => void;
  setFrontierIds: (ids: string[]) => void;

  // Panel selection → camera focus
  panelSelectionId: string | null;
  setPanelSelectionId: (id: string | null) => void;

  // Gap visualization
  highlightedClusterPair: [number, number] | null;
  setHighlightedClusterPair: (pair: [number, number] | null) => void;
  hoveredGapEdges: { source: string; target: string; similarity: number }[];
  setHoveredGapEdges: (edges: { source: string; target: string; similarity: number }[]) => void;

  // Foundation paper IDs (shared foundations for highlighted cluster pair)
  foundationPaperIds: Set<string>;
  setFoundationPaperIds: (ids: Set<string>) => void;

  // Phase 4: Timeline
  showTimeline: boolean;

  // Phase 5: Citation Path Finder
  pathStart: string | null;
  pathEnd: string | null;
  activePath: string[] | null;
  setPathStart: (id: string | null) => void;
  setPathEnd: (id: string | null) => void;
  setActivePath: (path: string[] | null) => void;

  // Visibility toggles
  showCitationEdges: boolean;
  showSimilarityEdges: boolean;
  showClusterHulls: boolean;
  showLabels: boolean;
  showCosmicTheme: boolean;

  // Actions
  setGraphData: (data: GraphData) => void;
  selectPaper: (paper: Paper | null) => void;
  selectCluster: (cluster: Cluster | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Toggle actions
  toggleCitationEdges: () => void;
  toggleSimilarityEdges: () => void;
  toggleClusterHulls: () => void;
  toggleLabels: () => void;
  toggleCosmicTheme: () => void;

  setActiveTab: (tab: 'clusters' | 'gaps') => void;
  setHighlightedPaperIds: (ids: Set<string>) => void;
  clearHighlightedPaperIds: () => void;

  toggleBloom: () => void;
  toggleOARings: () => void;
  toggleCitationAura: () => void;
  toggleGhostEdges: () => void;
  toggleGapOverlay: () => void;
  toggleClusterVisibility: (clusterId: number) => void;
  setBridgeNodeIds: (ids: Set<string>) => void;
  addNodesStable: (nodes: Paper[], edges: GraphEdge[]) => void;
  setExpandedFromMap: (map: Map<string, string>) => void;

  toggleTimeline: () => void;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  graphData: null,
  graphMeta: null,
  selectedPaper: null,
  selectedCluster: null,
  isLoading: false,
  error: null,

  activeTab: 'clusters',
  highlightedPaperIds: new Set<string>(),

  showBloom: false,
  showOARings: false,
  showCitationAura: false,
  showGhostEdges: false,
  showGapOverlay: true,
  hiddenClusterIds: new Set<number>(),
  bridgeNodeIds: new Set<string>(),
  citationIntents: [],
  setCitationIntents: (intents: CitationIntent[]) => set({ citationIntents: intents }),
  expandedFromMap: new Map<string, string>(),

  gaps: [],
  frontierIds: [],
  setGaps: (gaps: StructuralGap[]) => set({ gaps }),
  setFrontierIds: (ids: string[]) => set({ frontierIds: ids }),

  panelSelectionId: null,
  setPanelSelectionId: (id) => set({ panelSelectionId: id }),

  highlightedClusterPair: null,
  setHighlightedClusterPair: (pair) => set({ highlightedClusterPair: pair }),
  hoveredGapEdges: [],
  setHoveredGapEdges: (edges) => set({ hoveredGapEdges: edges }),

  foundationPaperIds: new Set<string>(),
  setFoundationPaperIds: (ids: Set<string>) => set({ foundationPaperIds: ids }),

  showTimeline: false,

  pathStart: null,
  pathEnd: null,
  activePath: null,
  setPathStart: (id) => set({ pathStart: id }),
  setPathEnd: (id) => set({ pathEnd: id }),
  setActivePath: (path) => set({ activePath: path }),

  showCitationEdges: true,
  showSimilarityEdges: true,
  showClusterHulls: true,
  showLabels: true,
  showCosmicTheme: true,

  setGraphData: (data) => set({ graphData: data, error: null }),
  setGraphMeta: (meta) => set({ graphMeta: meta }),

  selectPaper: (paper) => set({ selectedPaper: paper }),

  selectCluster: (cluster) => set({ selectedCluster: cluster }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  toggleCitationEdges: () =>
    set((s) => ({ showCitationEdges: !s.showCitationEdges })),
  toggleSimilarityEdges: () =>
    set((s) => ({ showSimilarityEdges: !s.showSimilarityEdges })),
  toggleClusterHulls: () =>
    set((s) => ({ showClusterHulls: !s.showClusterHulls })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleCosmicTheme: () => set((s) => ({ showCosmicTheme: !s.showCosmicTheme })),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setHighlightedPaperIds: (ids) => set({ highlightedPaperIds: ids }),
  clearHighlightedPaperIds: () =>
    set({ highlightedPaperIds: new Set<string>() }),

  toggleBloom: () => set((s) => ({ showBloom: !s.showBloom })),
  toggleOARings: () => set((s) => ({ showOARings: !s.showOARings })),
  toggleCitationAura: () => set((s) => ({ showCitationAura: !s.showCitationAura })),
  toggleGhostEdges: () => set((s) => ({ showGhostEdges: !s.showGhostEdges })),
  toggleGapOverlay: () => set((s) => ({ showGapOverlay: !s.showGapOverlay })),
  toggleClusterVisibility: (clusterId: number) => {
    set((s) => {
      const next = new Set(s.hiddenClusterIds);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return { hiddenClusterIds: next };
    });
  },
  setBridgeNodeIds: (ids: Set<string>) => set({ bridgeNodeIds: ids }),
  setExpandedFromMap: (map: Map<string, string>) => set({ expandedFromMap: map }),

  toggleTimeline: () =>
    set((s) => ({ showTimeline: !s.showTimeline })),

  addNodesStable: (newNodes: Paper[], newEdges: GraphEdge[]) => {
    const { graphData } = get();
    if (!graphData) return;

    const existingIds = new Set(graphData.nodes.map((n) => n.id));
    const uniqueNewNodes = newNodes.filter((n) => !existingIds.has(n.id));

    const existingEdgeKeys = new Set(
      graphData.edges.map((e) => `${e.source}-${e.target}`)
    );
    const uniqueNewEdges = newEdges.filter(
      (e) => !existingEdgeKeys.has(`${e.source}-${e.target}`)
    );

    set({
      graphData: {
        ...graphData,
        nodes: [...graphData.nodes, ...uniqueNewNodes],
        edges: [...graphData.edges, ...uniqueNewEdges],
        meta: {
          ...graphData.meta,
          total: graphData.meta.total + uniqueNewNodes.length,
        },
      },
    });
  },
}));
