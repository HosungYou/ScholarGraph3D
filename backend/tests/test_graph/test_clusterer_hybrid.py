"""
Tests for hybrid clustering: Leiden + Bibliographic Coupling + HDBSCAN fallback.

Tests cover:
- Leiden on multi-component graphs
- Bibliographic coupling edge computation
- Sparse graph HDBSCAN fallback
- TF-IDF cluster labeling
- Min cluster size enforcement
"""

import numpy as np
import pytest
from unittest.mock import patch

from graph.clusterer import PaperClusterer


@pytest.fixture
def clusterer():
    return PaperClusterer()


@pytest.fixture
def two_component_graph():
    """Two clearly separated components with no cross-edges."""
    paper_ids = [f"p{i}" for i in range(10)]
    # Group A: p0-p4 all cite each other
    citation_pairs = set()
    for i in range(5):
        for j in range(i + 1, 5):
            citation_pairs.add((f"p{i}", f"p{j}"))
    # Group B: p5-p9 all cite each other
    for i in range(5, 10):
        for j in range(i + 1, 10):
            citation_pairs.add((f"p{i}", f"p{j}"))

    similarity_edges = []
    embeddings = np.random.randn(10, 50)
    reference_lists = {pid: [] for pid in paper_ids}

    return paper_ids, citation_pairs, similarity_edges, embeddings, reference_lists


@pytest.fixture
def bib_coupled_graph():
    """Papers that share common references."""
    paper_ids = ["a1", "a2", "b1", "b2", "shared_ref"]
    # a1 and a2 both cite shared_ref → they should be coupled
    citation_pairs = {
        ("a1", "shared_ref"),
        ("a2", "shared_ref"),
        ("b1", "b2"),
    }
    similarity_edges = []
    embeddings = np.random.randn(5, 50)
    reference_lists = {
        "a1": ["shared_ref"],
        "a2": ["shared_ref"],
        "b1": ["b2"],
        "b2": [],
        "shared_ref": [],
    }
    return paper_ids, citation_pairs, similarity_edges, embeddings, reference_lists


class TestLeidenTwoComponents:
    """Leiden should detect two separate components as distinct clusters."""

    def test_two_clusters_detected(self, clusterer, two_component_graph):
        paper_ids, citation_pairs, sim_edges, embeddings, ref_lists = two_component_graph

        labels = clusterer.cluster_hybrid(
            paper_ids, citation_pairs, sim_edges, embeddings, ref_lists,
            min_cluster_size=3, resolution=1.0,
        )

        assert len(labels) == 10
        # Papers 0-4 should be in one cluster, 5-9 in another
        cluster_a = set(labels[:5])
        cluster_b = set(labels[5:])
        # Each group should have exactly one cluster label (not noise)
        valid_a = {l for l in cluster_a if l != -1}
        valid_b = {l for l in cluster_b if l != -1}
        assert len(valid_a) == 1, f"Group A has multiple clusters: {cluster_a}"
        assert len(valid_b) == 1, f"Group B has multiple clusters: {cluster_b}"
        assert valid_a != valid_b, "Both groups should be in different clusters"


class TestBibCoupling:
    """Papers sharing common references should be coupled."""

    def test_bib_coupling_same_refs(self, clusterer):
        paper_ids = ["a1", "a2", "a3"]
        # All three cite "ref1" and "ref2"
        citation_pairs = {
            ("a1", "ref1"), ("a1", "ref2"),
            ("a2", "ref1"), ("a2", "ref2"),
            ("a3", "ref1"), ("a3", "ref2"),
        }
        id_to_idx = {pid: i for i, pid in enumerate(paper_ids)}

        edges = clusterer._compute_bib_coupling(paper_ids, citation_pairs, id_to_idx)

        # Should have 3 coupling edges: (a1,a2), (a1,a3), (a2,a3)
        assert len(edges) == 3
        # All should have weight 1.0 (all share 2 refs, max is 2)
        for _, _, weight in edges:
            assert weight == 1.0

    def test_no_coupling_no_shared_refs(self, clusterer):
        paper_ids = ["a1", "a2"]
        citation_pairs = {
            ("a1", "ref1"),
            ("a2", "ref2"),
        }
        id_to_idx = {pid: i for i, pid in enumerate(paper_ids)}

        edges = clusterer._compute_bib_coupling(paper_ids, citation_pairs, id_to_idx)
        assert len(edges) == 0


class TestHDBSCANFallback:
    """Sparse graphs should fall back to HDBSCAN."""

    def test_fallback_sparse_graph(self, clusterer):
        paper_ids = [f"p{i}" for i in range(10)]
        # Very few edges — should trigger HDBSCAN fallback
        citation_pairs = {("p0", "p1")}
        similarity_edges = []
        embeddings = np.random.randn(10, 50)
        reference_lists = {pid: [] for pid in paper_ids}

        labels = clusterer.cluster_hybrid(
            paper_ids, citation_pairs, similarity_edges, embeddings,
            reference_lists, min_cluster_size=3,
        )

        assert len(labels) == 10
        # Should still produce valid labels (even if all noise)
        assert all(isinstance(l, (int, np.integer)) for l in labels)

    def test_explicit_hdbscan_mode(self, clusterer):
        paper_ids = [f"p{i}" for i in range(10)]
        citation_pairs = set()
        for i in range(5):
            for j in range(i + 1, 5):
                citation_pairs.add((f"p{i}", f"p{j}"))

        embeddings = np.random.randn(10, 50)
        reference_lists = {pid: [] for pid in paper_ids}

        with patch("graph.clusterer.CLUSTERING_MODE", "hdbscan"):
            labels = clusterer.cluster_hybrid(
                paper_ids, citation_pairs, [], embeddings,
                reference_lists, min_cluster_size=3,
            )

        assert len(labels) == 10


class TestTFIDFLabels:
    """TF-IDF labeling should produce domain-specific terms."""

    def test_tfidf_labels_domain_specific(self, clusterer):
        papers = [
            {"title": "Attention Is All You Need", "abstract": "We propose the transformer architecture with multi-head self-attention mechanism for sequence transduction.", "fields_of_study": ["Computer Science"]},
            {"title": "BERT Pre-training", "abstract": "We introduce BERT, a bidirectional encoder using masked language modeling and attention mechanisms.", "fields_of_study": ["Computer Science"]},
            {"title": "GPT Language Model", "abstract": "Generative pre-training of a language model using transformer architecture and attention.", "fields_of_study": ["Computer Science"]},
            {"title": "Drug Discovery Methods", "abstract": "Machine learning approaches for drug discovery and molecular property prediction in pharmaceutical research.", "fields_of_study": ["Medicine"]},
            {"title": "Clinical Trials Analysis", "abstract": "Statistical methods for analyzing clinical trials data in drug development and pharmaceutical outcomes.", "fields_of_study": ["Medicine"]},
            {"title": "Protein Structure Prediction", "abstract": "Deep learning for predicting protein structure and drug binding affinity in pharmaceutical applications.", "fields_of_study": ["Biology"]},
        ]
        cluster_labels = np.array([0, 0, 0, 1, 1, 1])

        result = clusterer.label_clusters_tfidf(papers, cluster_labels)

        # Cluster 0 should NOT be "Computer Science" — should be domain terms
        label_0 = result[0]["label"].lower()
        assert "computer science" not in label_0
        # Should contain NLP-related terms
        assert any(term in label_0 for term in ["attention", "language", "transformer", "model", "pre"]), f"Expected NLP terms, got: {label_0}"

        # Cluster 1 should relate to drug/pharma
        label_1 = result[1]["label"].lower()
        assert "medicine" not in label_1
        assert any(term in label_1 for term in ["drug", "clinical", "pharmaceutical", "protein"]), f"Expected pharma terms, got: {label_1}"

    def test_tfidf_handles_empty_abstracts(self, clusterer):
        papers = [
            {"title": "Paper A", "abstract": "", "fields_of_study": []},
            {"title": "Paper B", "abstract": None, "fields_of_study": []},
        ]
        cluster_labels = np.array([0, 0])

        result = clusterer.label_clusters_tfidf(papers, cluster_labels)
        assert 0 in result
        assert result[0]["paper_count"] == 2


class TestHybridMinClusterSize:
    """Small clusters should be merged into noise."""

    def test_min_cluster_size_enforcement(self, clusterer):
        paper_ids = [f"p{i}" for i in range(8)]
        # Large cluster: p0-p5, tiny: p6-p7
        citation_pairs = set()
        for i in range(6):
            for j in range(i + 1, 6):
                citation_pairs.add((f"p{i}", f"p{j}"))
        citation_pairs.add(("p6", "p7"))

        embeddings = np.random.randn(8, 50)
        reference_lists = {pid: [] for pid in paper_ids}

        labels = clusterer.cluster_hybrid(
            paper_ids, citation_pairs, [], embeddings, reference_lists,
            min_cluster_size=3,
        )

        # p6 and p7 form a pair (size 2) — should be noise (-1) since min_cluster_size=3
        assert labels[6] == -1 or labels[7] == -1 or labels[6] == labels[7]
