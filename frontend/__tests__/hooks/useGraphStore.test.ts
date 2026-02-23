import { useGraphStore } from '@/hooks/useGraphStore';
import type { Paper, GraphEdge, Cluster, GraphData, StructuralGap } from '@/types';

// Reset Zustand store state before each test to prevent inter-test pollution.
beforeEach(() => {
  useGraphStore.setState(useGraphStore.getInitialState());
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makePaper = (id: string, overrides: Partial<Paper> = {}): Paper => ({
  id,
  title: `Paper ${id}`,
  authors: [{ name: 'Test Author' }],
  year: 2023,
  citation_count: 10,
  fields: ['Computer Science'],
  topics: [],
  x: 0,
  y: 0,
  z: 0,
  cluster_id: 1,
  cluster_label: 'Cluster A',
  is_open_access: false,
  ...overrides,
});

const makeEdge = (source: string, target: string): GraphEdge => ({
  source,
  target,
  type: 'citation',
  weight: 1,
});

const makeCluster = (id: number): Cluster => ({
  id,
  label: `Cluster ${id}`,
  topics: ['topic1'],
  paper_count: 5,
  hull_points: [],
  color: '#4A90D9',
});

const makeGraphData = (overrides: Partial<GraphData> = {}): GraphData => ({
  nodes: [makePaper('p1'), makePaper('p2')],
  edges: [makeEdge('p1', 'p2')],
  clusters: [makeCluster(1)],
  meta: { total: 2, query: 'test query', oa_credits_used: 0 },
  ...overrides,
});

const makeGap = (id: string): StructuralGap => ({
  gap_id: id,
  cluster_a: { id: 1, label: 'Cluster A', paper_count: 5 },
  cluster_b: { id: 2, label: 'Cluster B', paper_count: 4 },
  gap_strength: 0.8,
  bridge_papers: [],
  potential_edges: [],
  research_questions: ['What connects these fields?'],
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('graphData is null', () => {
    expect(useGraphStore.getState().graphData).toBeNull();
  });

  it('selectedPaper is null', () => {
    expect(useGraphStore.getState().selectedPaper).toBeNull();
  });

  it('selectedCluster is null', () => {
    expect(useGraphStore.getState().selectedCluster).toBeNull();
  });

  it('isLoading is false', () => {
    expect(useGraphStore.getState().isLoading).toBe(false);
  });

  it('error is null', () => {
    expect(useGraphStore.getState().error).toBeNull();
  });

  it('activeTab is "clusters"', () => {
    expect(useGraphStore.getState().activeTab).toBe('clusters');
  });

  it('highlightedPaperIds is an empty Set', () => {
    expect(useGraphStore.getState().highlightedPaperIds).toEqual(new Set());
  });

  it('gaps is an empty array', () => {
    expect(useGraphStore.getState().gaps).toEqual([]);
  });

  it('frontierIds is an empty array', () => {
    expect(useGraphStore.getState().frontierIds).toEqual([]);
  });

  it('pathStart, pathEnd, and activePath are null', () => {
    const { pathStart, pathEnd, activePath } = useGraphStore.getState();
    expect(pathStart).toBeNull();
    expect(pathEnd).toBeNull();
    expect(activePath).toBeNull();
  });

  it('showCitationEdges, showSimilarityEdges, showClusterHulls, showLabels, showCosmicTheme are true', () => {
    const state = useGraphStore.getState();
    expect(state.showCitationEdges).toBe(true);
    expect(state.showSimilarityEdges).toBe(true);
    expect(state.showClusterHulls).toBe(true);
    expect(state.showLabels).toBe(true);
    expect(state.showCosmicTheme).toBe(true);
  });

  it('visual effect flags default to false (except showGapOverlay)', () => {
    const state = useGraphStore.getState();
    expect(state.showBloom).toBe(false);
    expect(state.showOARings).toBe(false);
    expect(state.showCitationAura).toBe(false);
    expect(state.showGhostEdges).toBe(false);
    expect(state.showGapOverlay).toBe(true);
  });
});

// ─── setGraphData ─────────────────────────────────────────────────────────────

describe('setGraphData', () => {
  it('updates graphData with the provided data', () => {
    const data = makeGraphData();
    useGraphStore.getState().setGraphData(data);
    expect(useGraphStore.getState().graphData).toEqual(data);
  });

  it('stores nodes, edges, and clusters', () => {
    const data = makeGraphData({
      nodes: [makePaper('n1'), makePaper('n2'), makePaper('n3')],
      edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
      clusters: [makeCluster(1), makeCluster(2)],
    });
    useGraphStore.getState().setGraphData(data);
    const { graphData } = useGraphStore.getState();
    expect(graphData!.nodes).toHaveLength(3);
    expect(graphData!.edges).toHaveLength(2);
    expect(graphData!.clusters).toHaveLength(2);
  });

  it('clears error when graphData is set', () => {
    useGraphStore.getState().setError('previous error');
    useGraphStore.getState().setGraphData(makeGraphData());
    expect(useGraphStore.getState().error).toBeNull();
  });

  it('replaces existing graphData on subsequent calls', () => {
    useGraphStore.getState().setGraphData(makeGraphData({ meta: { total: 2, query: 'first', oa_credits_used: 0 } }));
    const updated = makeGraphData({ meta: { total: 5, query: 'second', oa_credits_used: 0 } });
    useGraphStore.getState().setGraphData(updated);
    expect(useGraphStore.getState().graphData!.meta.query).toBe('second');
  });
});

// ─── selectPaper ─────────────────────────────────────────────────────────────

describe('selectPaper', () => {
  it('sets selectedPaper', () => {
    const paper = makePaper('p1');
    useGraphStore.getState().selectPaper(paper);
    expect(useGraphStore.getState().selectedPaper).toEqual(paper);
  });

  it('clears selectedPaper when called with null', () => {
    useGraphStore.getState().selectPaper(makePaper('p1'));
    useGraphStore.getState().selectPaper(null);
    expect(useGraphStore.getState().selectedPaper).toBeNull();
  });

  it('replaces previously selected paper', () => {
    useGraphStore.getState().selectPaper(makePaper('p1'));
    useGraphStore.getState().selectPaper(makePaper('p2'));
    expect(useGraphStore.getState().selectedPaper!.id).toBe('p2');
  });
});

// ─── gaps and frontierIds ─────────────────────────────────────────────────────

describe('setGaps', () => {
  it('updates gaps array', () => {
    const gaps = [makeGap('gap-1'), makeGap('gap-2')];
    useGraphStore.getState().setGaps(gaps);
    expect(useGraphStore.getState().gaps).toHaveLength(2);
    expect(useGraphStore.getState().gaps[0].gap_id).toBe('gap-1');
  });

  it('replaces previous gaps', () => {
    useGraphStore.getState().setGaps([makeGap('gap-1')]);
    useGraphStore.getState().setGaps([makeGap('gap-2'), makeGap('gap-3')]);
    expect(useGraphStore.getState().gaps).toHaveLength(2);
  });

  it('accepts an empty array', () => {
    useGraphStore.getState().setGaps([makeGap('gap-1')]);
    useGraphStore.getState().setGaps([]);
    expect(useGraphStore.getState().gaps).toEqual([]);
  });
});

describe('setFrontierIds', () => {
  it('updates frontierIds array', () => {
    useGraphStore.getState().setFrontierIds(['p1', 'p2', 'p3']);
    expect(useGraphStore.getState().frontierIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('replaces previous frontierIds', () => {
    useGraphStore.getState().setFrontierIds(['p1']);
    useGraphStore.getState().setFrontierIds(['p2', 'p3']);
    expect(useGraphStore.getState().frontierIds).toEqual(['p2', 'p3']);
  });

  it('accepts an empty array', () => {
    useGraphStore.getState().setFrontierIds(['p1']);
    useGraphStore.getState().setFrontierIds([]);
    expect(useGraphStore.getState().frontierIds).toEqual([]);
  });
});

// ─── Citation path finder ─────────────────────────────────────────────────────

describe('setPathStart', () => {
  it('sets pathStart', () => {
    useGraphStore.getState().setPathStart('paper-1');
    expect(useGraphStore.getState().pathStart).toBe('paper-1');
  });

  it('clears pathStart when called with null', () => {
    useGraphStore.getState().setPathStart('paper-1');
    useGraphStore.getState().setPathStart(null);
    expect(useGraphStore.getState().pathStart).toBeNull();
  });
});

describe('setPathEnd', () => {
  it('sets pathEnd', () => {
    useGraphStore.getState().setPathEnd('paper-2');
    expect(useGraphStore.getState().pathEnd).toBe('paper-2');
  });

  it('clears pathEnd when called with null', () => {
    useGraphStore.getState().setPathEnd('paper-2');
    useGraphStore.getState().setPathEnd(null);
    expect(useGraphStore.getState().pathEnd).toBeNull();
  });
});

describe('setActivePath', () => {
  it('sets activePath', () => {
    useGraphStore.getState().setActivePath(['p1', 'p2', 'p3']);
    expect(useGraphStore.getState().activePath).toEqual(['p1', 'p2', 'p3']);
  });

  it('clears activePath when called with null', () => {
    useGraphStore.getState().setActivePath(['p1', 'p2']);
    useGraphStore.getState().setActivePath(null);
    expect(useGraphStore.getState().activePath).toBeNull();
  });

  it('stores path start and end independently from pathStart/pathEnd state', () => {
    useGraphStore.getState().setPathStart('p1');
    useGraphStore.getState().setPathEnd('p3');
    useGraphStore.getState().setActivePath(['p1', 'p2', 'p3']);
    const { pathStart, pathEnd, activePath } = useGraphStore.getState();
    expect(pathStart).toBe('p1');
    expect(pathEnd).toBe('p3');
    expect(activePath).toEqual(['p1', 'p2', 'p3']);
  });
});

// ─── highlightedPaperIds ──────────────────────────────────────────────────────

describe('setHighlightedPaperIds', () => {
  it('sets highlightedPaperIds', () => {
    const ids = new Set(['p1', 'p2']);
    useGraphStore.getState().setHighlightedPaperIds(ids);
    expect(useGraphStore.getState().highlightedPaperIds).toEqual(ids);
  });

  it('replaces previously highlighted IDs', () => {
    useGraphStore.getState().setHighlightedPaperIds(new Set(['p1', 'p2']));
    useGraphStore.getState().setHighlightedPaperIds(new Set(['p3']));
    expect(useGraphStore.getState().highlightedPaperIds).toEqual(new Set(['p3']));
  });
});

describe('clearHighlightedPaperIds', () => {
  it('resets highlightedPaperIds to an empty Set', () => {
    useGraphStore.getState().setHighlightedPaperIds(new Set(['p1', 'p2', 'p3']));
    useGraphStore.getState().clearHighlightedPaperIds();
    expect(useGraphStore.getState().highlightedPaperIds.size).toBe(0);
  });

  it('returns a new Set instance (not the same reference)', () => {
    const before = useGraphStore.getState().highlightedPaperIds;
    useGraphStore.getState().clearHighlightedPaperIds();
    const after = useGraphStore.getState().highlightedPaperIds;
    expect(after).not.toBe(before);
    expect(after).toEqual(new Set());
  });
});

// ─── Toggle actions ───────────────────────────────────────────────────────────

describe('toggle actions', () => {
  it('toggleCitationEdges flips showCitationEdges', () => {
    expect(useGraphStore.getState().showCitationEdges).toBe(true);
    useGraphStore.getState().toggleCitationEdges();
    expect(useGraphStore.getState().showCitationEdges).toBe(false);
    useGraphStore.getState().toggleCitationEdges();
    expect(useGraphStore.getState().showCitationEdges).toBe(true);
  });

  it('toggleSimilarityEdges flips showSimilarityEdges', () => {
    expect(useGraphStore.getState().showSimilarityEdges).toBe(true);
    useGraphStore.getState().toggleSimilarityEdges();
    expect(useGraphStore.getState().showSimilarityEdges).toBe(false);
  });

  it('toggleLabels flips showLabels', () => {
    expect(useGraphStore.getState().showLabels).toBe(true);
    useGraphStore.getState().toggleLabels();
    expect(useGraphStore.getState().showLabels).toBe(false);
  });

  it('toggleBloom flips showBloom', () => {
    expect(useGraphStore.getState().showBloom).toBe(false);
    useGraphStore.getState().toggleBloom();
    expect(useGraphStore.getState().showBloom).toBe(true);
  });

  it('toggleGapOverlay flips showGapOverlay', () => {
    expect(useGraphStore.getState().showGapOverlay).toBe(true);
    useGraphStore.getState().toggleGapOverlay();
    expect(useGraphStore.getState().showGapOverlay).toBe(false);
  });

  it('toggleTimeline flips showTimeline', () => {
    expect(useGraphStore.getState().showTimeline).toBe(false);
    useGraphStore.getState().toggleTimeline();
    expect(useGraphStore.getState().showTimeline).toBe(true);
  });
});

// ─── toggleClusterVisibility ──────────────────────────────────────────────────

describe('toggleClusterVisibility', () => {
  it('adds a clusterId to hiddenClusterIds when not present', () => {
    useGraphStore.getState().toggleClusterVisibility(3);
    expect(useGraphStore.getState().hiddenClusterIds.has(3)).toBe(true);
  });

  it('removes a clusterId from hiddenClusterIds when already present', () => {
    useGraphStore.getState().toggleClusterVisibility(3);
    useGraphStore.getState().toggleClusterVisibility(3);
    expect(useGraphStore.getState().hiddenClusterIds.has(3)).toBe(false);
  });

  it('manages multiple cluster IDs independently', () => {
    useGraphStore.getState().toggleClusterVisibility(1);
    useGraphStore.getState().toggleClusterVisibility(2);
    useGraphStore.getState().toggleClusterVisibility(1); // remove 1
    const { hiddenClusterIds } = useGraphStore.getState();
    expect(hiddenClusterIds.has(1)).toBe(false);
    expect(hiddenClusterIds.has(2)).toBe(true);
  });
});

// ─── addNodesStable ───────────────────────────────────────────────────────────

describe('addNodesStable', () => {
  it('does nothing when graphData is null', () => {
    useGraphStore.getState().addNodesStable([makePaper('p1')], []);
    expect(useGraphStore.getState().graphData).toBeNull();
  });

  it('appends new unique nodes to graphData', () => {
    useGraphStore.getState().setGraphData(makeGraphData());
    useGraphStore.getState().addNodesStable([makePaper('p3'), makePaper('p4')], []);
    expect(useGraphStore.getState().graphData!.nodes).toHaveLength(4);
  });

  it('does not duplicate existing nodes', () => {
    const data = makeGraphData(); // already has p1 and p2
    useGraphStore.getState().setGraphData(data);
    useGraphStore.getState().addNodesStable([makePaper('p1'), makePaper('p3')], []);
    expect(useGraphStore.getState().graphData!.nodes).toHaveLength(3); // p1, p2, p3
  });

  it('appends new unique edges', () => {
    useGraphStore.getState().setGraphData(makeGraphData()); // has edge p1→p2
    useGraphStore.getState().addNodesStable([], [makeEdge('p1', 'p3')]);
    expect(useGraphStore.getState().graphData!.edges).toHaveLength(2);
  });

  it('does not duplicate existing edges', () => {
    useGraphStore.getState().setGraphData(makeGraphData()); // has edge p1→p2
    useGraphStore.getState().addNodesStable([], [makeEdge('p1', 'p2')]);
    expect(useGraphStore.getState().graphData!.edges).toHaveLength(1);
  });

  it('updates meta.total by the count of new unique nodes added', () => {
    useGraphStore.getState().setGraphData(makeGraphData()); // total=2
    useGraphStore.getState().addNodesStable([makePaper('p3'), makePaper('p4')], []);
    expect(useGraphStore.getState().graphData!.meta.total).toBe(4);
  });
});

// ─── setActiveTab ─────────────────────────────────────────────────────────────

describe('setActiveTab', () => {
  it('switches to "gaps" tab', () => {
    useGraphStore.getState().setActiveTab('gaps');
    expect(useGraphStore.getState().activeTab).toBe('gaps');
  });

  it('switches to "chat" tab', () => {
    useGraphStore.getState().setActiveTab('chat');
    expect(useGraphStore.getState().activeTab).toBe('chat');
  });

  it('switches back to "clusters" tab', () => {
    useGraphStore.getState().setActiveTab('gaps');
    useGraphStore.getState().setActiveTab('clusters');
    expect(useGraphStore.getState().activeTab).toBe('clusters');
  });
});

// ─── setLoading / setError ────────────────────────────────────────────────────

describe('setLoading', () => {
  it('sets isLoading to true', () => {
    useGraphStore.getState().setLoading(true);
    expect(useGraphStore.getState().isLoading).toBe(true);
  });

  it('sets isLoading back to false', () => {
    useGraphStore.getState().setLoading(true);
    useGraphStore.getState().setLoading(false);
    expect(useGraphStore.getState().isLoading).toBe(false);
  });
});

describe('setError', () => {
  it('sets an error message', () => {
    useGraphStore.getState().setError('Something went wrong');
    expect(useGraphStore.getState().error).toBe('Something went wrong');
  });

  it('clears the error when called with null', () => {
    useGraphStore.getState().setError('err');
    useGraphStore.getState().setError(null);
    expect(useGraphStore.getState().error).toBeNull();
  });
});
