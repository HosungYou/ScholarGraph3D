import { create } from 'zustand';
import type { Paper, GraphEdge, Cluster, GraphData } from '@/types';

interface GraphStore {
  graphData: GraphData | null;
  selectedPaper: Paper | null;
  selectedCluster: Cluster | null;
  multiSelected: Paper[];
  hoveredPaper: Paper | null;
  isLoading: boolean;
  error: string | null;

  // Visibility toggles
  showCitationEdges: boolean;
  showSimilarityEdges: boolean;
  showClusterHulls: boolean;
  showLabels: boolean;

  // Actions
  setGraphData: (data: GraphData) => void;
  selectPaper: (paper: Paper | null) => void;
  selectCluster: (cluster: Cluster | null) => void;
  setHoveredPaper: (paper: Paper | null) => void;
  toggleMultiSelect: (paper: Paper) => void;
  clearMultiSelect: () => void;
  addNodes: (nodes: Paper[], edges: GraphEdge[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Toggle actions
  toggleCitationEdges: () => void;
  toggleSimilarityEdges: () => void;
  toggleClusterHulls: () => void;
  toggleLabels: () => void;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  graphData: null,
  selectedPaper: null,
  selectedCluster: null,
  multiSelected: [],
  hoveredPaper: null,
  isLoading: false,
  error: null,

  showCitationEdges: true,
  showSimilarityEdges: true,
  showClusterHulls: true,
  showLabels: true,

  setGraphData: (data) => set({ graphData: data, error: null }),

  selectPaper: (paper) => set({ selectedPaper: paper }),

  selectCluster: (cluster) => set({ selectedCluster: cluster }),

  setHoveredPaper: (paper) => set({ hoveredPaper: paper }),

  toggleMultiSelect: (paper) => {
    const { multiSelected } = get();
    const exists = multiSelected.find((p) => p.id === paper.id);
    if (exists) {
      set({ multiSelected: multiSelected.filter((p) => p.id !== paper.id) });
    } else {
      set({ multiSelected: [...multiSelected, paper] });
    }
  },

  clearMultiSelect: () => set({ multiSelected: [] }),

  addNodes: (nodes, edges) => {
    const { graphData } = get();
    if (!graphData) return;

    const existingNodeIds = new Set(graphData.nodes.map((n) => n.id));
    const newNodes = nodes.filter((n) => !existingNodeIds.has(n.id));

    const existingEdgeKeys = new Set(
      graphData.edges.map((e) => `${e.source}-${e.target}`)
    );
    const newEdges = edges.filter(
      (e) => !existingEdgeKeys.has(`${e.source}-${e.target}`)
    );

    set({
      graphData: {
        ...graphData,
        nodes: [...graphData.nodes, ...newNodes],
        edges: [...graphData.edges, ...newEdges],
        meta: {
          ...graphData.meta,
          total: graphData.meta.total + newNodes.length,
        },
      },
    });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  toggleCitationEdges: () =>
    set((s) => ({ showCitationEdges: !s.showCitationEdges })),
  toggleSimilarityEdges: () =>
    set((s) => ({ showSimilarityEdges: !s.showSimilarityEdges })),
  toggleClusterHulls: () =>
    set((s) => ({ showClusterHulls: !s.showClusterHulls })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
}));
