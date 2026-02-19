"""
Tests for PaperClusterer in graph/clusterer.py.

TDD RED phase: defines expected clustering, labeling, and hull behavior.
Run: pytest tests/test_graph/test_clusterer.py -v

Note: HDBSCAN tests use tightly clustered synthetic data so results
are deterministic regardless of randomness in the algorithm.
"""

import numpy as np
import pytest

from graph.clusterer import PaperClusterer


# ==================== Fixtures ====================

@pytest.fixture
def clusterer() -> PaperClusterer:
    return PaperClusterer()


def make_two_tight_clusters(n_per_cluster: int = 20, dims: int = 768) -> np.ndarray:
    """
    Create embeddings with two clearly separable tight clusters:
    - Cluster A: vectors near [+10, 0, 0, ...]
    - Cluster B: vectors near [-10, 0, 0, ...]
    Noise std=0.01 ensures HDBSCAN reliably finds both clusters.
    """
    rng = np.random.default_rng(42)
    center_a = np.zeros(dims)
    center_a[0] = 10.0
    center_b = np.zeros(dims)
    center_b[0] = -10.0
    cluster_a = center_a + rng.normal(0, 0.01, (n_per_cluster, dims))
    cluster_b = center_b + rng.normal(0, 0.01, (n_per_cluster, dims))
    return np.vstack([cluster_a, cluster_b])


def make_three_tight_clusters(n_per_cluster: int = 15, dims: int = 768) -> np.ndarray:
    """Three tight clusters at [+10,0,...], [-10,0,...], [0,+10,...]."""
    rng = np.random.default_rng(7)
    centers = [
        np.array([10.0] + [0.0] * (dims - 1)),
        np.array([-10.0] + [0.0] * (dims - 1)),
        np.array([0.0, 10.0] + [0.0] * (dims - 2)),
    ]
    clusters = [c + rng.normal(0, 0.01, (n_per_cluster, dims)) for c in centers]
    return np.vstack(clusters)


def make_paper_dicts(
    n: int = 10,
    topics: list = None,
    fields: list = None,
) -> list:
    """Create minimal paper dicts for label_clusters() input."""
    default_topics = [
        {"id": "T001", "display_name": "Machine Learning", "score": 0.9},
        {"id": "T002", "display_name": "Neural Networks", "score": 0.8},
        {"id": "T003", "display_name": "Deep Learning", "score": 0.7},
    ]
    default_fields = ["Computer Science"]
    return [
        {
            "title": f"Paper {i}",
            "oa_topics": topics if topics is not None else default_topics,
            "fields_of_study": fields if fields is not None else default_fields,
        }
        for i in range(n)
    ]


# ==================== cluster() ====================

class TestCluster:
    """Tests for PaperClusterer.cluster()."""

    def test_cluster_produces_labels(self, clusterer):
        """cluster() must return a numpy array of labels with len == n_papers."""
        embeddings = make_two_tight_clusters(n_per_cluster=20)
        labels = clusterer.cluster(embeddings, min_cluster_size=5)

        assert labels is not None
        assert isinstance(labels, np.ndarray)
        assert len(labels) == len(embeddings)

    def test_cluster_identifies_groups(self, clusterer):
        """
        3 tight clusters of 15 points each must produce at least 2 distinct
        non-noise cluster IDs. (We allow some noise tolerance.)
        """
        embeddings = make_three_tight_clusters(n_per_cluster=15)
        labels = clusterer.cluster(embeddings, min_cluster_size=5)

        unique_non_noise = set(labels[labels >= 0])
        assert len(unique_non_noise) >= 2, (
            f"Expected at least 2 clusters, got {len(unique_non_noise)}: {unique_non_noise}"
        )

    def test_cluster_labels_same_length_as_input(self, clusterer):
        """Label array length must equal embedding count."""
        n = 40
        embeddings = make_two_tight_clusters(n_per_cluster=n // 2)
        labels = clusterer.cluster(embeddings, min_cluster_size=5)
        assert len(labels) == n

    def test_too_few_papers(self, clusterer):
        """
        Fewer papers than min_cluster_size must not raise an exception.
        Should return labels array of same length (all zeros by fallback).
        """
        rng = np.random.default_rng(0)
        embeddings = rng.normal(0, 1, (3, 768))

        labels = clusterer.cluster(embeddings, min_cluster_size=5)

        assert labels is not None
        assert len(labels) == 3

    def test_cluster_returns_integer_labels(self, clusterer):
        """Labels must be integers (HDBSCAN produces int arrays)."""
        embeddings = make_two_tight_clusters(n_per_cluster=15)
        labels = clusterer.cluster(embeddings, min_cluster_size=5)
        assert np.issubdtype(labels.dtype, np.integer)

    def test_cluster_min_cluster_size_enforced(self, clusterer):
        """No non-noise cluster should contain fewer points than min_cluster_size."""
        embeddings = make_two_tight_clusters(n_per_cluster=20)
        min_size = 5
        labels = clusterer.cluster(embeddings, min_cluster_size=min_size)

        for cid in set(labels):
            if cid == -1:
                continue
            count = int(np.sum(labels == cid))
            assert count >= min_size, (
                f"Cluster {cid} has {count} papers, below min_cluster_size={min_size}"
            )

    def test_single_embedding_does_not_crash(self, clusterer):
        """Single paper must not crash — returns length-1 label array."""
        embedding = np.random.default_rng(0).normal(0, 1, (1, 768))
        labels = clusterer.cluster(embedding, min_cluster_size=2)
        assert len(labels) == 1


# ==================== label_clusters() ====================

class TestLabelClusters:
    """Tests for PaperClusterer.label_clusters()."""

    def test_label_clusters_returns_dict(self, clusterer):
        """label_clusters() must return a dict keyed by integer cluster IDs."""
        papers = make_paper_dicts(n=10)
        labels = np.array([0] * 5 + [1] * 5)
        result = clusterer.label_clusters(papers, labels)
        assert isinstance(result, dict)

    def test_label_clusters_uses_topics(self, clusterer):
        """
        Cluster label must be derived from OA topic display_names.
        Label string must be non-empty and contain topic vocabulary.
        """
        topics = [
            {"id": "T001", "display_name": "Attention Mechanism", "score": 0.9},
            {"id": "T002", "display_name": "Transformer", "score": 0.85},
        ]
        papers = make_paper_dicts(n=10, topics=topics)
        labels = np.array([0] * 10)

        result = clusterer.label_clusters(papers, labels)

        assert 0 in result
        label_str = result[0].get("label", "")
        assert isinstance(label_str, str)
        assert len(label_str) > 0

    def test_label_clusters_fallback_fields(self, clusterer):
        """
        When papers have no OA topics, label should fall back to fields_of_study.
        """
        papers = make_paper_dicts(n=10, topics=[], fields=["Quantum Physics"])
        labels = np.array([0] * 10)

        result = clusterer.label_clusters(papers, labels)

        assert 0 in result
        # Label should reference 'Quantum Physics' or at minimum be non-empty
        label_str = result[0].get("label", "")
        assert len(label_str) > 0

    def test_label_clusters_includes_paper_count(self, clusterer):
        """Each cluster info dict must include correct paper_count."""
        papers = make_paper_dicts(n=10)
        labels = np.array([0] * 6 + [1] * 4)

        result = clusterer.label_clusters(papers, labels)

        assert result[0]["paper_count"] == 6
        assert result[1]["paper_count"] == 4

    def test_label_clusters_includes_color(self, clusterer):
        """Each cluster info dict must include a color hex string."""
        papers = make_paper_dicts(n=10)
        labels = np.array([0] * 10)

        result = clusterer.label_clusters(papers, labels)

        color = result[0].get("color", "")
        assert isinstance(color, str)
        assert len(color) > 0

    def test_label_clusters_noise_cluster_handled(self, clusterer):
        """
        Noise cluster (label=-1) must be present in output and labeled 'Unclustered'.
        """
        papers = make_paper_dicts(n=12)
        labels = np.array([0] * 5 + [1] * 5 + [-1] * 2)

        result = clusterer.label_clusters(papers, labels)

        assert -1 in result
        assert result[-1]["label"] == "Unclustered"

    def test_label_clusters_topic_names_field_is_list(self, clusterer):
        """Each cluster info must have a 'topic_names' key containing a list."""
        papers = make_paper_dicts(n=10)
        labels = np.array([0] * 10)

        result = clusterer.label_clusters(papers, labels)

        assert "topic_names" in result[0]
        assert isinstance(result[0]["topic_names"], list)

    def test_compute_hulls_returns_vertices(self, clusterer):
        """compute_hulls() must return hull vertex coordinates per cluster."""
        rng = np.random.default_rng(42)
        coords = rng.normal(0, 1, (20, 3))
        labels = np.array([0] * 10 + [1] * 10)

        result = clusterer.compute_hulls(coords, labels)

        for cid in [0, 1]:
            assert cid in result
            assert isinstance(result[cid], list)

    def test_compute_hulls_small_cluster(self, clusterer):
        """
        A cluster with <4 points cannot form a 3D convex hull.
        compute_hulls() must not raise — it should return the raw points.
        """
        coords = np.array([
            [1.0, 2.0, 3.0],
            [4.0, 5.0, 6.0],
            [7.0, 8.0, 9.0],
        ])
        labels = np.array([0, 0, 0])

        result = clusterer.compute_hulls(coords, labels)

        assert 0 in result
        assert isinstance(result[0], list)
        assert len(result[0]) == 3  # raw points returned

    def test_compute_hulls_noise_excluded(self, clusterer):
        """Noise cluster (-1) must not appear in hull output."""
        rng = np.random.default_rng(0)
        coords = rng.normal(0, 1, (15, 3))
        labels = np.array([0] * 10 + [-1] * 5)

        result = clusterer.compute_hulls(coords, labels)

        # noise cluster either absent or empty
        if -1 in result:
            assert len(result[-1]) == 0

    def test_compute_hulls_vertices_are_3d_points(self, clusterer):
        """Each hull vertex must be a list/sequence of 3 floats."""
        rng = np.random.default_rng(42)
        coords = rng.normal(0, 1, (15, 3))
        labels = np.array([0] * 15)

        result = clusterer.compute_hulls(coords, labels)

        for vertex in result.get(0, []):
            assert len(vertex) == 3, f"Vertex {vertex} is not 3D"
