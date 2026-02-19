"""
Tests for SimilarityComputer in graph/similarity.py.

TDD RED phase: defines expected cosine similarity edge computation behavior.
Run: pytest tests/test_graph/test_similarity.py -v
"""

import numpy as np
import pytest

from graph.similarity import SimilarityComputer


# ==================== Fixtures ====================

@pytest.fixture
def computer() -> SimilarityComputer:
    return SimilarityComputer()


# ==================== compute_edges() ====================

class TestComputeEdges:
    """Tests for SimilarityComputer.compute_edges()."""

    def test_identical_vectors_similarity_one(self, computer):
        """
        Two identical vectors have cosine similarity = 1.0.
        With threshold=0.7, an edge must be produced with similarity ≥ 0.99.
        """
        v = np.array([[1.0, 0.0, 0.0, 0.0, 0.0]])
        embeddings = np.vstack([v, v])
        paper_ids = ["p0", "p1"]

        edges = computer.compute_edges(embeddings, paper_ids, threshold=0.7)

        assert len(edges) >= 1
        assert edges[0]["similarity"] >= 0.99
        assert set([edges[0]["source"], edges[0]["target"]]) == {"p0", "p1"}

    def test_orthogonal_vectors_no_edge(self, computer):
        """
        Two orthogonal vectors have cosine similarity = 0.0.
        With default threshold=0.7, no edge must be produced.
        """
        v1 = np.array([[1.0, 0.0, 0.0]])
        v2 = np.array([[0.0, 1.0, 0.0]])
        embeddings = np.vstack([v1, v2])
        paper_ids = ["p0", "p1"]

        edges = computer.compute_edges(embeddings, paper_ids, threshold=0.7)

        assert len(edges) == 0

    def test_threshold_filtering(self, computer):
        """Only edges with similarity >= threshold must be returned."""
        rng = np.random.default_rng(42)
        raw = rng.normal(0, 1, (10, 128))
        # Normalize to unit sphere for precise cosine control
        embeddings = raw / np.linalg.norm(raw, axis=1, keepdims=True)
        paper_ids = [str(i) for i in range(10)]

        threshold = 0.95
        edges = computer.compute_edges(embeddings, paper_ids, threshold=threshold)

        for edge in edges:
            assert edge["similarity"] >= threshold, (
                f"Edge {edge['source']}-{edge['target']} similarity "
                f"{edge['similarity']:.4f} is below threshold {threshold}"
            )

    def test_max_edges_per_node(self, computer):
        """
        No node should appear in more than max_edges_per_node edges
        (counting both source and target sides).
        """
        rng = np.random.default_rng(42)
        # Tight cluster → nearly all pairs have high similarity
        base = rng.normal(0, 1, (1, 64))
        embeddings = base + rng.normal(0, 0.001, (20, 64))
        paper_ids = [str(i) for i in range(20)]

        max_per_node = 3
        edges = computer.compute_edges(
            embeddings, paper_ids,
            threshold=0.0,
            max_edges_per_node=max_per_node,
        )

        node_edge_count: dict = {}
        for edge in edges:
            for node in [edge["source"], edge["target"]]:
                node_edge_count[node] = node_edge_count.get(node, 0) + 1

        for node, count in node_edge_count.items():
            assert count <= max_per_node, (
                f"Node {node} appears in {count} edges, exceeds max_edges_per_node={max_per_node}"
            )

    def test_no_self_edges(self, computer):
        """No edge must connect a paper to itself (source != target)."""
        rng = np.random.default_rng(0)
        embeddings = rng.normal(0, 1, (5, 32))
        paper_ids = [str(i) for i in range(5)]

        edges = computer.compute_edges(embeddings, paper_ids, threshold=0.0)

        for edge in edges:
            assert edge["source"] != edge["target"], (
                f"Self-loop found for node {edge['source']}"
            )

    def test_no_duplicate_edges(self, computer):
        """
        Each pair (A, B) must appear at most once — not as both (A,B) and (B,A).
        """
        rng = np.random.default_rng(0)
        embeddings = rng.normal(0, 1, (8, 32))
        paper_ids = [str(i) for i in range(8)]

        edges = computer.compute_edges(embeddings, paper_ids, threshold=0.0)

        seen_pairs: set = set()
        for edge in edges:
            pair = frozenset([edge["source"], edge["target"]])
            assert pair not in seen_pairs, (
                f"Duplicate edge detected for pair {pair}"
            )
            seen_pairs.add(pair)

    def test_single_paper_empty(self, computer):
        """A single paper cannot have similarity edges — must return empty list."""
        embeddings = np.array([[1.0, 0.0, 0.0]])
        paper_ids = ["p0"]

        edges = computer.compute_edges(embeddings, paper_ids, threshold=0.0)

        assert edges == []

    def test_edges_contain_required_fields(self, computer):
        """Each edge dict must contain source, target, and similarity keys."""
        v = np.ones((2, 4))
        paper_ids = ["p0", "p1"]

        edges = computer.compute_edges(v, paper_ids, threshold=0.5)

        assert len(edges) >= 1
        edge = edges[0]
        assert "source" in edge
        assert "target" in edge
        assert "similarity" in edge

    def test_similarity_values_in_0_1_range(self, computer):
        """All similarity values must be in [0, 1] (cosine similarity is bounded)."""
        rng = np.random.default_rng(7)
        embeddings = rng.normal(0, 1, (8, 64))
        paper_ids = [str(i) for i in range(8)]

        edges = computer.compute_edges(embeddings, paper_ids, threshold=0.0)

        for edge in edges:
            assert 0.0 <= edge["similarity"] <= 1.0 + 1e-9, (
                f"Similarity {edge['similarity']} out of [0, 1] range"
            )

    def test_paper_ids_preserved_in_edges(self, computer):
        """Source and target values in edges must be drawn from the provided paper_ids."""
        v = np.ones((3, 8))
        paper_ids = ["paper_alpha", "paper_beta", "paper_gamma"]

        edges = computer.compute_edges(v, paper_ids, threshold=0.5)

        valid_ids = set(paper_ids)
        for edge in edges:
            assert edge["source"] in valid_ids, f"Unknown source: {edge['source']}"
            assert edge["target"] in valid_ids, f"Unknown target: {edge['target']}"

    def test_default_threshold_applied(self, computer):
        """
        When no threshold is provided, default (0.7) must be applied.
        Two identical vectors always produce similarity 1.0 → edge must be returned.
        """
        embeddings = np.ones((2, 768))
        paper_ids = ["p0", "p1"]

        edges = computer.compute_edges(embeddings, paper_ids)

        assert len(edges) >= 1


# ==================== compute_similarity() ====================

class TestComputeSimilarity:
    """Tests for SimilarityComputer.compute_similarity() (pairwise helper)."""

    def test_identical_vectors_returns_one(self, computer):
        """Identical vectors → cosine similarity ≈ 1.0."""
        v = np.array([1.0, 2.0, 3.0])
        sim = computer.compute_similarity(v, v)
        assert abs(sim - 1.0) < 1e-6

    def test_opposite_vectors_returns_negative_one(self, computer):
        """Opposite vectors → cosine similarity ≈ -1.0."""
        v = np.array([1.0, 0.0, 0.0])
        sim = computer.compute_similarity(v, -v)
        assert abs(sim - (-1.0)) < 1e-6

    def test_orthogonal_vectors_returns_zero(self, computer):
        """Orthogonal vectors → cosine similarity = 0.0."""
        a = np.array([1.0, 0.0])
        b = np.array([0.0, 1.0])
        sim = computer.compute_similarity(a, b)
        assert abs(sim) < 1e-6

    def test_zero_vector_returns_zero(self, computer):
        """Zero vector must not produce NaN — must return 0.0."""
        a = np.zeros(10)
        b = np.ones(10)
        sim = computer.compute_similarity(a, b)
        assert sim == 0.0
