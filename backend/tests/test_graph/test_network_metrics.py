"""
Tests for NetworkMetricsComputer in graph/network_metrics.py.

Covers network-level, node centrality, community, structural holes,
modularity, silhouette, and the lightweight overview method.

Run: pytest tests/test_graph/test_network_metrics.py -v
"""

import pytest
import networkx as nx
from unittest.mock import patch

from graph.network_metrics import NetworkMetricsComputer


# ==================== Synthetic helpers ====================

def _make_papers(n, cluster_ids=None):
    """Generate n synthetic paper dicts."""
    papers = []
    for i in range(n):
        papers.append({
            "id": f"paper_{i}",
            "title": f"Paper {i}",
            "cluster_id": cluster_ids[i] if cluster_ids else 0,
            "cluster_label": f"Cluster {cluster_ids[i] if cluster_ids else 0}",
            "year": 2020 + (i % 5),
            "citation_count": (n - i) * 10,
        })
    return papers


def _make_edges(pairs, edge_type="citation"):
    """Generate edges from (source, target) pairs."""
    return [
        {"source": s, "target": t, "type": edge_type, "weight": 1.0}
        for s, t in pairs
    ]


def _make_clusters(ids_and_labels):
    """Generate cluster dicts from [(id, label, count), ...]."""
    return [
        {"id": cid, "label": label, "paper_count": count}
        for cid, label, count in ids_and_labels
    ]


@pytest.fixture
def computer():
    return NetworkMetricsComputer()


# ==================== test_empty_graph ====================

def test_empty_graph(computer):
    """Empty papers list returns the canonical empty_result structure."""
    result = computer.compute_all([], [], [])

    assert result["network_level"]["node_count"] == 0
    assert result["network_level"]["edge_count"] == 0
    assert result["network_level"]["density"] == 0.0
    assert result["node_centrality"] == []
    assert result["community_metrics"] == []
    assert result["structural_holes"] == []
    assert result["modularity"] == 0.0
    assert result["silhouette"] == -1.0


# ==================== test_single_node ====================

def test_single_node(computer):
    """Single paper with no edges — graph has 1 node and 0 edges."""
    papers = _make_papers(1, cluster_ids=[0])
    clusters = _make_clusters([(0, "Solo", 1)])

    result = computer.compute_all(papers, [], clusters)

    nl = result["network_level"]
    assert nl["node_count"] == 1
    assert nl["edge_count"] == 0
    assert nl["density"] == 0.0
    # One isolated node = one component
    assert nl["component_count"] == 1

    # Node centrality list should have one entry
    assert len(result["node_centrality"]) == 1
    nc = result["node_centrality"][0]
    assert nc["paper_id"] == "paper_0"
    assert nc["degree_in"] == 0
    assert nc["degree_out"] == 0


# ==================== test_basic_network_metrics ====================

def test_basic_network_metrics(computer):
    """10-node network with known structure: verify density, node_count, edge_count."""
    n = 10
    papers = _make_papers(n, cluster_ids=[0] * n)
    # Create a simple chain: 0->1->2->...->9  (9 edges)
    pairs = [(f"paper_{i}", f"paper_{i+1}") for i in range(n - 1)]
    edges = _make_edges(pairs)
    clusters = _make_clusters([(0, "Chain", n)])

    result = computer.compute_all(papers, edges, clusters)

    nl = result["network_level"]
    assert nl["node_count"] == n
    assert nl["edge_count"] == n - 1  # 9 directed citation edges

    # Density of directed graph: edges / (n*(n-1))
    expected_density = (n - 1) / (n * (n - 1))
    assert abs(nl["density"] - expected_density) < 1e-5

    # Centrality list length
    assert len(result["node_centrality"]) == n


# ==================== test_centrality_ordering ====================

def test_centrality_ordering(computer):
    """node_centrality list is sorted by betweenness descending."""
    n = 8
    papers = _make_papers(n, cluster_ids=[0] * n)
    # Star-like topology centred on paper_0 to create varied betweenness
    pairs = [(f"paper_{i}", "paper_0") for i in range(1, n)]
    pairs += [("paper_0", f"paper_{i}") for i in range(1, n)]
    edges = _make_edges(pairs)
    clusters = _make_clusters([(0, "All", n)])

    result = computer.compute_all(papers, edges, clusters)

    betweenness_values = [nc["betweenness"] for nc in result["node_centrality"]]
    assert betweenness_values == sorted(betweenness_values, reverse=True), (
        f"Betweenness not sorted descending: {betweenness_values}"
    )


# ==================== test_hub_node_centrality ====================

def test_hub_node_centrality(computer):
    """Star topology: hub paper_0 connects all others; hub has highest betweenness."""
    n = 8
    papers = _make_papers(n, cluster_ids=[0] * n)
    # paper_0 -> all others (hub has high betweenness for outgoing paths)
    # others -> paper_0 (hub is the only path between any two leaves)
    pairs = []
    for i in range(1, n):
        pairs.append((f"paper_{i}", "paper_0"))
        pairs.append(("paper_0", f"paper_{i}"))
    edges = _make_edges(pairs)
    clusters = _make_clusters([(0, "Star", n)])

    result = computer.compute_all(papers, edges, clusters)

    # The first entry (highest betweenness) must be the hub
    top = result["node_centrality"][0]
    assert top["paper_id"] == "paper_0", (
        f"Expected hub paper_0 to have highest betweenness, got {top['paper_id']}"
    )


# ==================== test_community_metrics_h_index ====================

def test_community_metrics_h_index(computer):
    """h-index is computed correctly for known citation counts."""
    # 5 papers with citation counts [50, 40, 30, 20, 10]
    # h-index: rank 1 has 50 >= 1, rank 2 has 40 >= 2, ..., rank 5 has 10 >= 5 → h=5
    papers = [
        {
            "id": f"paper_{i}",
            "title": f"Paper {i}",
            "cluster_id": 0,
            "cluster_label": "Cluster 0",
            "year": 2020,
            "citation_count": (5 - i) * 10,
        }
        for i in range(5)
    ]
    clusters = _make_clusters([(0, "TestCluster", 5)])
    edges = _make_edges([("paper_0", "paper_1"), ("paper_1", "paper_2")])

    result = computer.compute_all(papers, edges, clusters)

    cm_list = result["community_metrics"]
    assert len(cm_list) == 1
    # citation_counts = [50, 40, 30, 20, 10]: h=5 (every rank i has count >= i)
    assert cm_list[0]["h_index"] == 5


def test_h_index_static():
    """Unit-test _compute_h_index directly for known values."""
    assert NetworkMetricsComputer._compute_h_index([]) == 0
    assert NetworkMetricsComputer._compute_h_index([100]) == 1
    assert NetworkMetricsComputer._compute_h_index([5, 5, 5, 5, 5]) == 5
    assert NetworkMetricsComputer._compute_h_index([10, 8, 5, 4, 3]) == 4
    assert NetworkMetricsComputer._compute_h_index([1, 0, 0]) == 1


# ==================== test_structural_holes_broker ====================

def test_structural_holes_broker(computer):
    """
    Node connecting two separate groups should have low constraint
    (good broker = low Burt constraint).

    Structure: Group A (paper_0, paper_1, paper_2) fully connected internally.
               Group B (paper_3, paper_4, paper_5) fully connected internally.
               Broker (paper_6) connects both groups.
    """
    papers = _make_papers(7, cluster_ids=[0, 0, 0, 1, 1, 1, -1])

    # Dense edges within group A
    ga = [("paper_0", "paper_1"), ("paper_1", "paper_0"),
          ("paper_0", "paper_2"), ("paper_2", "paper_0"),
          ("paper_1", "paper_2"), ("paper_2", "paper_1")]
    # Dense edges within group B
    gb = [("paper_3", "paper_4"), ("paper_4", "paper_3"),
          ("paper_3", "paper_5"), ("paper_5", "paper_3"),
          ("paper_4", "paper_5"), ("paper_5", "paper_4")]
    # Broker connects both groups
    broker_edges = [
        ("paper_6", "paper_0"), ("paper_0", "paper_6"),
        ("paper_6", "paper_3"), ("paper_3", "paper_6"),
    ]
    edges = _make_edges(ga + gb + broker_edges)
    clusters = _make_clusters([(0, "GroupA", 3), (1, "GroupB", 3)])

    result = computer.compute_all(papers, edges, clusters)

    sh = result["structural_holes"]
    assert len(sh) > 0

    # Find broker in structural holes list
    broker_entry = next(
        (s for s in sh if s["paper_id"] == "paper_6"), None
    )
    assert broker_entry is not None, "Broker paper_6 not found in structural_holes"

    # Broker should have lower constraint than pure intra-cluster nodes
    group_a_entry = next(
        (s for s in sh if s["paper_id"] == "paper_0"), None
    )
    assert group_a_entry is not None

    # Broker (spans two groups) should have constraint <= internal node
    # This is the key structural holes insight
    assert broker_entry["constraint"] <= group_a_entry["constraint"], (
        f"Broker constraint {broker_entry['constraint']} should be <= "
        f"intra-group constraint {group_a_entry['constraint']}"
    )


# ==================== test_modularity_two_clusters ====================

def test_modularity_two_clusters(computer):
    """Two tight clusters with few cross-edges should have positive modularity Q."""
    # 6 nodes: 3 in cluster 0, 3 in cluster 1
    papers = _make_papers(6, cluster_ids=[0, 0, 0, 1, 1, 1])

    # Dense within clusters
    intra = [
        ("paper_0", "paper_1"), ("paper_1", "paper_0"),
        ("paper_0", "paper_2"), ("paper_2", "paper_0"),
        ("paper_3", "paper_4"), ("paper_4", "paper_3"),
        ("paper_3", "paper_5"), ("paper_5", "paper_3"),
    ]
    # Sparse cross-edges
    inter = [("paper_0", "paper_3")]
    edges = _make_edges(intra + inter)
    clusters = _make_clusters([(0, "A", 3), (1, "B", 3)])

    result = computer.compute_all(papers, edges, clusters)

    assert result["modularity"] > 0.0, (
        f"Expected positive modularity for two tight clusters, got {result['modularity']}"
    )


# ==================== test_silhouette_well_separated ====================

def test_silhouette_well_separated(computer):
    """Two well-separated clusters should have positive mean silhouette score."""
    # Cluster 0: chain 0->1->2->3->4  (tight)
    # Cluster 1: chain 5->6->7->8->9  (tight)
    # One cross edge
    papers = _make_papers(10, cluster_ids=[0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
    intra_0 = [(f"paper_{i}", f"paper_{i+1}") for i in range(4)]
    intra_1 = [(f"paper_{i}", f"paper_{i+1}") for i in range(5, 9)]
    inter = [("paper_4", "paper_5")]
    edges = _make_edges(intra_0 + intra_1 + inter)
    clusters = _make_clusters([(0, "A", 5), (1, "B", 5)])

    result = computer.compute_all(papers, edges, clusters)

    silhouette = result["silhouette"]
    assert silhouette > 0.0, (
        f"Expected positive silhouette for well-separated clusters, got {silhouette}"
    )


# ==================== test_network_overview_lightweight ====================

def test_network_overview_lightweight(computer):
    """compute_network_overview returns correct subset of metrics."""
    n = 6
    papers = _make_papers(n, cluster_ids=[0, 0, 0, 1, 1, 1])
    edges = _make_edges([
        ("paper_0", "paper_1"), ("paper_1", "paper_2"),
        ("paper_3", "paper_4"), ("paper_4", "paper_5"),
        ("paper_0", "paper_3"),
    ])
    clusters = _make_clusters([(0, "A", 3), (1, "B", 3)])

    overview = computer.compute_network_overview(papers, edges, clusters)

    assert set(overview.keys()) == {"node_count", "edge_count", "density", "cluster_count", "modularity"}
    assert overview["node_count"] == n
    # 5 directed citation edges
    assert overview["edge_count"] == 5
    assert overview["cluster_count"] == 2
    assert isinstance(overview["density"], float)
    assert isinstance(overview["modularity"], float)


def test_network_overview_empty(computer):
    """compute_network_overview with empty papers returns zero/empty dict."""
    overview = computer.compute_network_overview([], [], [])

    assert overview["node_count"] == 0
    assert overview["edge_count"] == 0
    assert overview["density"] == 0.0
    assert overview["cluster_count"] == 0
    assert overview["modularity"] == 0.0


# ==================== test_disconnected_graph ====================

def test_disconnected_graph(computer):
    """Disconnected graph: diameter/avg_path computed on largest component."""
    # Two separate components: component A (4 nodes) and component B (2 nodes)
    papers = _make_papers(6, cluster_ids=[0, 0, 0, 0, 1, 1])
    # Component A: chain 0->1->2->3
    # Component B: isolated edge 4->5
    edges = _make_edges([
        ("paper_0", "paper_1"),
        ("paper_1", "paper_2"),
        ("paper_2", "paper_3"),
        ("paper_4", "paper_5"),
    ])
    clusters = _make_clusters([(0, "A", 4), (1, "B", 2)])

    result = computer.compute_all(papers, edges, clusters)

    nl = result["network_level"]
    # Should detect 2 weakly connected components
    assert nl["component_count"] == 2
    # Diameter on largest component (4-node chain): diameter = 3
    assert nl["diameter"] == 3
    assert nl["node_count"] == 6
    assert nl["edge_count"] == 4


# ==================== test_eigenvector_convergence_failure ====================

def test_eigenvector_convergence_failure(computer):
    """Mock eigenvector_centrality raising PowerIterationFailedConvergence — graceful fallback."""
    n = 5
    papers = _make_papers(n, cluster_ids=[0] * n)
    edges = _make_edges([("paper_0", "paper_1"), ("paper_1", "paper_2")])
    clusters = _make_clusters([(0, "All", n)])

    with patch(
        "graph.network_metrics.nx.eigenvector_centrality",
        side_effect=nx.PowerIterationFailedConvergence(1000),
    ):
        result = computer.compute_all(papers, edges, clusters)

    # Should not raise; all eigenvector values should be 0.0
    for nc in result["node_centrality"]:
        assert nc["eigenvector"] == 0.0, (
            f"Expected 0.0 eigenvector fallback for {nc['paper_id']}, got {nc['eigenvector']}"
        )
