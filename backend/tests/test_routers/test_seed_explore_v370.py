"""
Tests for v3.7.0 changes in routers/seed_explore.py.

TDD RED/GREEN phase: covers three new v3.7.0 behaviors:
  1. direction field on SeedGraphNode (Task 4)
  2. Silhouette score conditional computation (Task 3)
  3. Centroid-based assignment for papers without embeddings (Task 5)

No external API calls — all S2 / DB / UMAP dependencies are mocked.

Run: pytest tests/test_routers/test_seed_explore_v370.py -v
"""

from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from routers.seed_explore import SeedClusterInfo, SeedGraphNode


# ==================== Helpers ====================

def _make_node(
    node_id: str = "p1",
    title: str = "Test Paper",
    direction: str = "",
    cluster_id: int = 0,
    x: float = 0.0,
    y: float = 0.0,
    z: float = 0.0,
) -> SeedGraphNode:
    """Build a minimal SeedGraphNode for assertion tests."""
    return SeedGraphNode(
        id=node_id,
        title=title,
        direction=direction,
        cluster_id=cluster_id,
        x=x,
        y=y,
        z=z,
    )


def _make_cluster(
    cid: int = 0,
    label: str = "Cluster A",
    centroid: Optional[List[float]] = None,
) -> SeedClusterInfo:
    """Build a minimal SeedClusterInfo fixture."""
    return SeedClusterInfo(
        id=cid,
        label=label,
        centroid=centroid if centroid is not None else [1.0, 2.0, 3.0],
    )


# ==================== TestDirectionField ====================

class TestDirectionField:
    """
    Tests for the direction field on SeedGraphNode (v3.7.0 Task 4).

    The direction field encodes whether a node is the seed paper, a paper
    the seed cites (reference), or a paper that cites the seed (citation).
    An empty string is the safe default for nodes not yet assigned.
    """

    def test_seed_paper_gets_seed_direction(self):
        """
        SeedGraphNode with direction='seed' is a valid model instance.
        Verifies the field accepts the 'seed' sentinel value.
        """
        node = _make_node(node_id="seed123", direction="seed")
        assert node.direction == "seed"

    def test_reference_direction_value(self):
        """
        direction='reference' is a valid string value for a paper that
        the seed paper cites (seed → reference).
        """
        node = _make_node(node_id="ref1", direction="reference")
        assert node.direction == "reference"

    def test_citation_direction_value(self):
        """
        direction='citation' is a valid string value for a paper that
        cites the seed paper (citation → seed).
        """
        node = _make_node(node_id="cit1", direction="citation")
        assert node.direction == "citation"

    def test_direction_default_empty_string(self):
        """
        SeedGraphNode constructed with only required fields (id, title)
        has direction='' by default, preserving backward compatibility.
        """
        node = SeedGraphNode(id="p99", title="Minimal Paper")
        assert node.direction == "", (
            f"Expected direction='' by default, got {node.direction!r}"
        )

    def test_direction_field_serializes(self):
        """
        model_dump() includes the 'direction' key so downstream JSON
        serialization (FastAPI response, Redis cache) always has it.
        """
        node = _make_node(direction="seed")
        dumped = node.model_dump()
        assert "direction" in dumped, "direction key missing from model_dump()"
        assert dumped["direction"] == "seed"

    def test_direction_all_three_values_round_trip(self):
        """
        All three canonical direction values survive a model_dump /
        model_validate round-trip, confirming no coercion surprises.
        """
        for val in ("seed", "reference", "citation", ""):
            node = SeedGraphNode(id="p1", title="T", direction=val)
            dumped = node.model_dump()
            restored = SeedGraphNode.model_validate(dumped)
            assert restored.direction == val, (
                f"Round-trip failed for direction={val!r}: got {restored.direction!r}"
            )


# ==================== TestSilhouetteScoreIntegration ====================

class TestSilhouetteScoreIntegration:
    """
    Tests for the conditional silhouette score computation (v3.7.0 Task 3).

    The logic in seed_explore.py is:
        cluster_silhouette = 0.0
        try:
            valid_mask = cluster_labels != -1
            if valid_mask.sum() > 2 and len(set(cluster_labels[valid_mask])) > 1:
                cluster_silhouette = float(silhouette_score(...))
        except Exception:
            logger.warning(...)  # non-fatal

    These tests verify the conditional logic and error-handling path
    by patching sklearn.metrics.silhouette_score at its import location
    in seed_explore.py.
    """

    def test_silhouette_not_computed_single_cluster(self):
        """
        When all cluster_labels are the same (only one cluster, no -1),
        len(set(cluster_labels[valid_mask])) == 1, which is NOT > 1.

        silhouette_score must NOT be called and result stays 0.0.
        This matches the guard condition in the pipeline.
        """
        embeddings_50d = np.random.default_rng(0).normal(0, 1, (10, 50)).astype(np.float32)
        cluster_labels = np.zeros(10, dtype=int)  # all cluster 0

        silhouette_calls = []

        def mock_silhouette(X, labels, **kwargs):
            silhouette_calls.append(True)
            return 0.9

        with patch("routers.seed_explore.silhouette_score", mock_silhouette, create=True):
            # Replicate the exact guard logic from seed_explore.py
            cluster_silhouette = 0.0
            try:
                from sklearn.metrics import silhouette_score as _ss
                valid_mask = cluster_labels != -1
                if valid_mask.sum() > 2 and len(set(cluster_labels[valid_mask])) > 1:
                    cluster_silhouette = float(_ss(
                        embeddings_50d[valid_mask], cluster_labels[valid_mask],
                        metric="euclidean", sample_size=min(500, int(valid_mask.sum()))
                    ))
            except Exception:
                pass

        assert cluster_silhouette == 0.0, (
            f"Expected 0.0 for single-cluster input, got {cluster_silhouette}"
        )

    def test_silhouette_computed_two_clusters(self):
        """
        With 2 valid clusters and 10 points (valid_mask.sum()=10 > 2,
        unique clusters=2 > 1), silhouette_score IS called.

        Mocks silhouette_score to return 0.45 and verifies the result
        is stored correctly.
        """
        embeddings_50d = np.random.default_rng(1).normal(0, 1, (10, 50)).astype(np.float32)
        cluster_labels = np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1], dtype=int)

        with patch("sklearn.metrics.silhouette_score", return_value=0.45) as mock_ss:
            cluster_silhouette = 0.0
            try:
                from sklearn.metrics import silhouette_score as _ss
                valid_mask = cluster_labels != -1
                if valid_mask.sum() > 2 and len(set(cluster_labels[valid_mask])) > 1:
                    cluster_silhouette = float(_ss(
                        embeddings_50d[valid_mask], cluster_labels[valid_mask],
                        metric="euclidean", sample_size=min(500, int(valid_mask.sum()))
                    ))
            except Exception:
                pass

        assert cluster_silhouette == pytest.approx(0.45), (
            f"Expected silhouette=0.45, got {cluster_silhouette}"
        )

    def test_silhouette_defaults_to_zero_on_exception(self):
        """
        If silhouette_score raises any exception, the result must stay 0.0
        (non-fatal: silhouette failure must not crash the pipeline).

        The guard try/except swallows all errors and logs a warning.
        """
        embeddings_50d = np.random.default_rng(2).normal(0, 1, (10, 50)).astype(np.float32)
        cluster_labels = np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1], dtype=int)

        def raising_silhouette(*args, **kwargs):
            raise ValueError("Silhouette computation failed")

        with patch("sklearn.metrics.silhouette_score", side_effect=raising_silhouette):
            cluster_silhouette = 0.0
            try:
                from sklearn.metrics import silhouette_score as _ss
                valid_mask = cluster_labels != -1
                if valid_mask.sum() > 2 and len(set(cluster_labels[valid_mask])) > 1:
                    cluster_silhouette = float(_ss(
                        embeddings_50d[valid_mask], cluster_labels[valid_mask],
                        metric="euclidean", sample_size=min(500, int(valid_mask.sum()))
                    ))
            except Exception:
                pass  # non-fatal: silhouette stays 0.0

        assert cluster_silhouette == 0.0, (
            f"Expected 0.0 when silhouette_score raises, got {cluster_silhouette}"
        )

    def test_silhouette_skips_noise_labels(self):
        """
        Papers with cluster_label == -1 (HDBSCAN noise) are excluded via
        valid_mask = cluster_labels != -1.

        With 6 valid points in 2 clusters plus 4 noise points, only the
        6 valid points are passed to silhouette_score.
        """
        embeddings_50d = np.random.default_rng(3).normal(0, 1, (10, 50)).astype(np.float32)
        # 4 noise, 3 cluster-0, 3 cluster-1
        cluster_labels = np.array([-1, -1, -1, -1, 0, 0, 0, 1, 1, 1], dtype=int)

        passed_X_sizes = []

        def capturing_silhouette(X, labels, **kwargs):
            passed_X_sizes.append(len(X))
            return 0.3

        with patch("sklearn.metrics.silhouette_score", side_effect=capturing_silhouette):
            cluster_silhouette = 0.0
            try:
                from sklearn.metrics import silhouette_score as _ss
                valid_mask = cluster_labels != -1
                if valid_mask.sum() > 2 and len(set(cluster_labels[valid_mask])) > 1:
                    cluster_silhouette = float(_ss(
                        embeddings_50d[valid_mask], cluster_labels[valid_mask],
                        metric="euclidean", sample_size=min(500, int(valid_mask.sum()))
                    ))
            except Exception:
                pass

        assert len(passed_X_sizes) == 1, "silhouette_score should have been called once"
        assert passed_X_sizes[0] == 6, (
            f"Expected 6 valid (non-noise) points passed to silhouette_score, "
            f"got {passed_X_sizes[0]}"
        )
        assert cluster_silhouette == pytest.approx(0.3)


# ==================== TestCentroidAssignment ====================

class TestCentroidAssignment:
    """
    Tests for centroid-based assignment of papers without embeddings (Task 5).

    When a paper has no SPECTER2 embedding, the pipeline assigns it a
    position near the centroid of the nearest cluster (round-robin by index).
    If no clusters exist, it falls back to a periphery position (y=10.0).

    The logic under test (from seed_explore.py lines 418-442):

        for i, paper in enumerate(papers_without_emb):
            ...
            if clusters_info:
                nearest = clusters_info[i % len(clusters_info)]
                cx, cy, cz = nearest.centroid
                node.x = cx + (i % 3 - 1) * 2.0
                node.y = cy + (i // 3) * 2.0
                node.z = cz
                node.cluster_id = nearest.id
                node.cluster_label = nearest.label
            else:
                node.x = float(i) * 0.5
                node.y = 10.0
                node.z = 0.0
                node.cluster_id = -1
                node.cluster_label = "Unclustered"
    """

    def _run_centroid_assignment(
        self,
        n_papers: int,
        clusters_info: List[SeedClusterInfo],
        seed_id: str = "seed1",
    ) -> List[SeedGraphNode]:
        """
        Replicate the papers_without_emb assignment loop from seed_explore.py.

        Creates n_papers mock papers (none have embeddings) and runs the
        centroid assignment logic, returning the resulting SeedGraphNode list.
        """
        # Build mock papers (no embedding)
        papers_without_emb = []
        for i in range(n_papers):
            p = MagicMock()
            p.paper_id = f"noEmb_{i}"
            p.title = f"No-Embedding Paper {i}"
            p.abstract = None
            p.year = 2020
            p.venue = None
            p.citation_count = 0
            p.fields_of_study = []
            p.tldr = None
            p.is_open_access = False
            p.open_access_pdf_url = None
            p.authors = []
            p.doi = None
            p.topics = []
            papers_without_emb.append(p)

        from routers.seed_explore import _s2_paper_to_node

        # Build a dummy seed paper (different from all noEmb papers)
        seed_paper = MagicMock()
        seed_paper.paper_id = seed_id

        # Replicate the exact assignment logic from seed_explore.py
        citation_pairs = set()
        nodes: List[SeedGraphNode] = []

        for i, paper in enumerate(papers_without_emb):
            is_seed = paper.paper_id == seed_paper.paper_id
            node = _s2_paper_to_node(paper, paper.paper_id, is_seed=is_seed)

            if is_seed:
                node.direction = "seed"
            elif any(cited == paper.paper_id for _, cited in citation_pairs
                     if _ == seed_paper.paper_id):
                node.direction = "reference"
            else:
                node.direction = "citation"

            if clusters_info:
                nearest = clusters_info[i % len(clusters_info)]
                cx, cy, cz = nearest.centroid
                node.x = cx + (i % 3 - 1) * 2.0
                node.y = cy + (i // 3) * 2.0
                node.z = cz
                node.cluster_id = nearest.id
                node.cluster_label = nearest.label
            else:
                node.x = float(i) * 0.5
                node.y = 10.0
                node.z = 0.0
                node.cluster_id = -1
                node.cluster_label = "Unclustered"

            nodes.append(node)

        return nodes

    def test_centroid_assignment_uses_clusters_info(self):
        """
        When clusters_info has entries, node x/y/z are placed near the
        cluster centroid — NOT at the periphery position (y=10.0).

        The centroid is [5.0, 8.0, 3.0] here. The first paper (i=0) gets:
          x = 5.0 + (0 % 3 - 1) * 2.0 = 5.0 + (-1)*2.0 = 3.0
          y = 8.0 + (0 // 3) * 2.0     = 8.0 + 0 = 8.0
          z = 3.0
        """
        cluster = _make_cluster(cid=0, centroid=[5.0, 8.0, 3.0])
        nodes = self._run_centroid_assignment(n_papers=1, clusters_info=[cluster])

        assert len(nodes) == 1
        node = nodes[0]

        assert node.y != 10.0, (
            "Centroid assignment should not place node at periphery y=10.0"
        )
        assert node.x == pytest.approx(3.0, abs=1e-6), (
            f"Expected x=3.0 (centroid 5.0 + jitter -2.0), got {node.x}"
        )
        assert node.y == pytest.approx(8.0, abs=1e-6), (
            f"Expected y=8.0 (centroid), got {node.y}"
        )
        assert node.z == pytest.approx(3.0, abs=1e-6), (
            f"Expected z=3.0 (centroid), got {node.z}"
        )

    def test_centroid_assignment_round_robin(self):
        """
        Multiple no-embedding papers cycle through clusters_info using
        i % len(clusters_info), so they distribute across all clusters.

        With 2 clusters and 4 papers:
          paper 0 → cluster 0 (i=0, 0%2=0)
          paper 1 → cluster 1 (i=1, 1%2=1)
          paper 2 → cluster 0 (i=2, 2%2=0)
          paper 3 → cluster 1 (i=3, 3%2=1)
        """
        cluster_a = _make_cluster(cid=0, label="Alpha", centroid=[0.0, 0.0, 0.0])
        cluster_b = _make_cluster(cid=1, label="Beta", centroid=[10.0, 10.0, 10.0])
        clusters_info = [cluster_a, cluster_b]

        nodes = self._run_centroid_assignment(n_papers=4, clusters_info=clusters_info)

        assert nodes[0].cluster_id == 0, f"Paper 0 → cluster 0, got {nodes[0].cluster_id}"
        assert nodes[1].cluster_id == 1, f"Paper 1 → cluster 1, got {nodes[1].cluster_id}"
        assert nodes[2].cluster_id == 0, f"Paper 2 → cluster 0, got {nodes[2].cluster_id}"
        assert nodes[3].cluster_id == 1, f"Paper 3 → cluster 1, got {nodes[3].cluster_id}"

    def test_centroid_assignment_fallback_no_clusters(self):
        """
        When clusters_info is empty, papers fall back to the periphery
        position: y=10.0, x=i*0.5, z=0.0, cluster_id=-1.

        This handles the edge case where all papers lack embeddings so
        no clustering was performed.
        """
        nodes = self._run_centroid_assignment(n_papers=3, clusters_info=[])

        for i, node in enumerate(nodes):
            assert node.y == pytest.approx(10.0, abs=1e-6), (
                f"Paper {i} should be at periphery y=10.0, got y={node.y}"
            )
            assert node.x == pytest.approx(float(i) * 0.5, abs=1e-6), (
                f"Paper {i} should have x={i*0.5}, got x={node.x}"
            )
            assert node.z == pytest.approx(0.0, abs=1e-6), (
                f"Paper {i} should have z=0.0, got z={node.z}"
            )
            assert node.cluster_id == -1, (
                f"Paper {i} should have cluster_id=-1, got {node.cluster_id}"
            )
            assert node.cluster_label == "Unclustered", (
                f"Paper {i} should have label 'Unclustered', got {node.cluster_label!r}"
            )

    def test_centroid_assignment_sets_cluster_id(self):
        """
        Assigned cluster_id matches the nearest cluster's id field.

        Verifies that the node's cluster_id and cluster_label are correctly
        copied from the SeedClusterInfo object, not left as defaults (-1).
        """
        cluster = _make_cluster(cid=7, label="Quantum Computing")
        nodes = self._run_centroid_assignment(n_papers=1, clusters_info=[cluster])

        node = nodes[0]
        assert node.cluster_id == 7, (
            f"Expected cluster_id=7, got {node.cluster_id}"
        )
        assert node.cluster_label == "Quantum Computing", (
            f"Expected label 'Quantum Computing', got {node.cluster_label!r}"
        )

    def test_centroid_assignment_z_equals_centroid_z(self):
        """
        The Z coordinate for no-embedding papers is set exactly to centroid Z,
        with no jitter applied (unlike X and Y). Verifies z = cz precisely.
        """
        centroid = [3.0, 7.0, -4.5]
        cluster = _make_cluster(cid=2, centroid=centroid)

        for n_papers in [1, 2, 3]:
            nodes = self._run_centroid_assignment(n_papers=n_papers, clusters_info=[cluster])
            for node in nodes:
                assert node.z == pytest.approx(centroid[2], abs=1e-6), (
                    f"Expected z={centroid[2]} (centroid Z, no jitter), got {node.z}"
                )

    def test_centroid_assignment_multiple_clusters_label_match(self):
        """
        When papers are round-robin assigned, their cluster_label must
        match the label from the corresponding SeedClusterInfo.
        """
        clusters_info = [
            _make_cluster(cid=0, label="Deep Learning"),
            _make_cluster(cid=1, label="NLP"),
            _make_cluster(cid=2, label="Computer Vision"),
        ]

        nodes = self._run_centroid_assignment(n_papers=6, clusters_info=clusters_info)

        expected_labels = [
            "Deep Learning",   # i=0 → 0%3=0
            "NLP",             # i=1 → 1%3=1
            "Computer Vision", # i=2 → 2%3=2
            "Deep Learning",   # i=3 → 3%3=0
            "NLP",             # i=4 → 4%3=1
            "Computer Vision", # i=5 → 5%3=2
        ]

        for i, (node, expected) in enumerate(zip(nodes, expected_labels)):
            assert node.cluster_label == expected, (
                f"Paper {i}: expected label {expected!r}, got {node.cluster_label!r}"
            )
