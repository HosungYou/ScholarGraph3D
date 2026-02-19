"""
Research gap detection between clusters.

Analyzes inter-cluster citation density and embedding similarity
to identify structural gaps where research connections are missing.
"""

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from itertools import combinations
from math import sqrt
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class StructuralGap:
    """A detected research gap between two clusters."""

    gap_id: str
    cluster_a: Dict[str, Any]  # {id, label, paper_count}
    cluster_b: Dict[str, Any]
    gap_strength: float  # 0 (well-connected) to 1 (complete gap)
    bridge_papers: List[Dict[str, Any]] = field(default_factory=list)  # [{paper_id, title, score}]
    potential_edges: List[Dict[str, Any]] = field(default_factory=list)  # [{source, target, similarity}]
    research_questions: List[str] = field(default_factory=list)  # LLM-generated (empty until AI fills)


@dataclass
class GapAnalysisResult:
    """Complete gap analysis across all cluster pairs."""

    gaps: List[StructuralGap] = field(default_factory=list)
    cluster_connectivity_matrix: Dict[str, int] = field(default_factory=dict)  # "(i,j)": edge_count
    summary: Dict[str, Any] = field(default_factory=dict)


class GapDetector:
    """
    Detects research gaps between clusters by analyzing:
    1. Inter-cluster citation/similarity edge density
    2. Cross-cluster embedding similarity for bridge candidates
    3. Potential "ghost edges" that could connect clusters
    """

    def detect_gaps(
        self,
        papers: List[Dict[str, Any]],
        clusters: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
    ) -> GapAnalysisResult:
        """
        Detect structural gaps between clusters.

        Args:
            papers: List of paper dicts with keys: id, title, cluster_id, embedding (optional)
            clusters: List of cluster dicts with keys: id, label, paper_count
            edges: List of edge dicts with keys: source, target, type, weight

        Returns:
            GapAnalysisResult with gaps, connectivity matrix, and summary
        """
        if not papers or not clusters or len(clusters) < 2:
            return GapAnalysisResult(
                summary={"total_gaps": 0, "avg_gap_strength": 0.0, "strongest_gap": None}
            )

        # Filter out noise cluster
        valid_clusters = [c for c in clusters if c.get("id", -1) != -1]
        if len(valid_clusters) < 2:
            return GapAnalysisResult(
                summary={"total_gaps": 0, "avg_gap_strength": 0.0, "strongest_gap": None}
            )

        # Build cluster -> papers mapping
        cluster_papers: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        paper_by_id: Dict[str, Dict[str, Any]] = {}
        for paper in papers:
            cid = paper.get("cluster_id", -1)
            pid = str(paper.get("id", ""))
            paper_by_id[pid] = paper
            if cid != -1:
                cluster_papers[cid].append(paper)

        # Build paper_id -> cluster_id mapping
        paper_cluster: Dict[str, int] = {}
        for paper in papers:
            pid = str(paper.get("id", ""))
            paper_cluster[pid] = paper.get("cluster_id", -1)

        # Count inter-cluster edges
        connectivity = self._compute_connectivity(edges, paper_cluster, valid_clusters)

        # Compute cluster centroids if embeddings available
        cluster_centroids = self._compute_centroids(cluster_papers)

        # Detect gaps for each cluster pair
        gaps: List[StructuralGap] = []

        for cluster_a, cluster_b in combinations(valid_clusters, 2):
            cid_a = cluster_a["id"]
            cid_b = cluster_b["id"]

            size_a = len(cluster_papers.get(cid_a, []))
            size_b = len(cluster_papers.get(cid_b, []))

            if size_a == 0 or size_b == 0:
                continue

            # Count actual inter-cluster edges
            pair_key = self._pair_key(cid_a, cid_b)
            actual_edges = connectivity.get(pair_key, 0)

            # Calculate max possible edges and gap strength
            max_possible = size_a * size_b
            gap_strength = 1.0 - (actual_edges / max_possible) if max_possible > 0 else 1.0

            # Find bridge candidates using centroid similarity
            bridge_papers = self._find_bridge_papers(
                cluster_papers.get(cid_a, []),
                cluster_papers.get(cid_b, []),
                cluster_centroids.get(cid_a),
                cluster_centroids.get(cid_b),
            )

            # Find potential ghost edges (cross-cluster high-similarity pairs)
            potential_edges = self._find_potential_edges(
                cluster_papers.get(cid_a, []),
                cluster_papers.get(cid_b, []),
                threshold=0.5,
                top_k=5,
            )

            gaps.append(StructuralGap(
                gap_id=str(uuid.uuid4()),
                cluster_a={
                    "id": cid_a,
                    "label": cluster_a.get("label", f"Cluster {cid_a}"),
                    "paper_count": size_a,
                },
                cluster_b={
                    "id": cid_b,
                    "label": cluster_b.get("label", f"Cluster {cid_b}"),
                    "paper_count": size_b,
                },
                gap_strength=round(gap_strength, 4),
                bridge_papers=bridge_papers,
                potential_edges=potential_edges,
                research_questions=[],
            ))

        # Apply adaptive threshold filtering
        threshold = self._adaptive_threshold(gaps)
        significant_gaps = [g for g in gaps if g.gap_strength >= threshold]
        significant_gaps.sort(key=lambda g: g.gap_strength, reverse=True)

        # Build connectivity matrix for response
        connectivity_matrix = {
            str(k): v for k, v in connectivity.items()
        }

        # Summary
        avg_strength = (
            sum(g.gap_strength for g in significant_gaps) / len(significant_gaps)
            if significant_gaps
            else 0.0
        )
        strongest = significant_gaps[0] if significant_gaps else None

        result = GapAnalysisResult(
            gaps=significant_gaps,
            cluster_connectivity_matrix=connectivity_matrix,
            summary={
                "total_gaps": len(significant_gaps),
                "avg_gap_strength": round(avg_strength, 4),
                "strongest_gap": {
                    "gap_id": strongest.gap_id,
                    "clusters": (
                        strongest.cluster_a["label"],
                        strongest.cluster_b["label"],
                    ),
                    "strength": strongest.gap_strength,
                } if strongest else None,
                "threshold_used": round(threshold, 4),
            },
        )

        logger.info(
            f"Gap analysis: {len(significant_gaps)} significant gaps "
            f"(threshold={threshold:.3f}) from {len(gaps)} total pairs"
        )

        return result

    def _compute_connectivity(
        self,
        edges: List[Dict[str, Any]],
        paper_cluster: Dict[str, int],
        clusters: List[Dict[str, Any]],
    ) -> Dict[Tuple[int, int], int]:
        """Count edges between each cluster pair."""
        connectivity: Dict[Tuple[int, int], int] = defaultdict(int)

        for edge in edges:
            src_cluster = paper_cluster.get(str(edge.get("source", "")), -1)
            tgt_cluster = paper_cluster.get(str(edge.get("target", "")), -1)

            if src_cluster == -1 or tgt_cluster == -1:
                continue
            if src_cluster == tgt_cluster:
                continue

            pair = self._pair_key(src_cluster, tgt_cluster)
            connectivity[pair] += 1

        return dict(connectivity)

    def _compute_centroids(
        self,
        cluster_papers: Dict[int, List[Dict[str, Any]]],
    ) -> Dict[int, Optional[np.ndarray]]:
        """Compute mean embedding centroid for each cluster."""
        centroids: Dict[int, Optional[np.ndarray]] = {}

        for cid, papers in cluster_papers.items():
            embeddings = [
                np.array(p["embedding"])
                for p in papers
                if p.get("embedding") is not None
            ]
            if embeddings:
                centroids[cid] = np.mean(embeddings, axis=0)
            else:
                centroids[cid] = None

        return centroids

    def _find_bridge_papers(
        self,
        papers_a: List[Dict[str, Any]],
        papers_b: List[Dict[str, Any]],
        centroid_a: Optional[np.ndarray],
        centroid_b: Optional[np.ndarray],
        top_n: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Find papers that could bridge two clusters.

        Score = geometric_mean(sim_to_centroid_a, sim_to_centroid_b)
        """
        if centroid_a is None or centroid_b is None:
            return []

        all_papers = papers_a + papers_b
        candidates: List[Tuple[float, Dict[str, Any]]] = []

        for paper in all_papers:
            emb = paper.get("embedding")
            if emb is None:
                continue

            emb = np.array(emb)
            sim_a = self._cosine_similarity(emb, centroid_a)
            sim_b = self._cosine_similarity(emb, centroid_b)

            # Geometric mean of similarities to both centroids
            if sim_a > 0 and sim_b > 0:
                score = sqrt(sim_a * sim_b)
                candidates.append((score, paper))

        # Sort by score descending
        candidates.sort(key=lambda x: x[0], reverse=True)

        return [
            {
                "paper_id": str(p.get("id", "")),
                "title": p.get("title", ""),
                "score": round(score, 4),
            }
            for score, p in candidates[:top_n]
        ]

    def _find_potential_edges(
        self,
        papers_a: List[Dict[str, Any]],
        papers_b: List[Dict[str, Any]],
        threshold: float = 0.5,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Find cross-cluster paper pairs with high cosine similarity.

        These are "ghost edges" that represent potential research connections.
        """
        embeddings_a = [
            (p, np.array(p["embedding"]))
            for p in papers_a
            if p.get("embedding") is not None
        ]
        embeddings_b = [
            (p, np.array(p["embedding"]))
            for p in papers_b
            if p.get("embedding") is not None
        ]

        if not embeddings_a or not embeddings_b:
            return []

        candidates: List[Tuple[float, str, str]] = []

        # Vectorized computation for efficiency
        mat_a = np.array([e for _, e in embeddings_a])
        mat_b = np.array([e for _, e in embeddings_b])

        # Normalize
        norms_a = np.linalg.norm(mat_a, axis=1, keepdims=True)
        norms_b = np.linalg.norm(mat_b, axis=1, keepdims=True)
        norms_a = np.where(norms_a == 0, 1, norms_a)
        norms_b = np.where(norms_b == 0, 1, norms_b)
        norm_a = mat_a / norms_a
        norm_b = mat_b / norms_b

        # Similarity matrix
        sim_matrix = norm_a @ norm_b.T

        # Find pairs above threshold
        rows, cols = np.where(sim_matrix >= threshold)
        for r, c in zip(rows, cols):
            sim = float(sim_matrix[r, c])
            src_id = str(embeddings_a[r][0].get("id", ""))
            tgt_id = str(embeddings_b[c][0].get("id", ""))
            candidates.append((sim, src_id, tgt_id))

        # Sort by similarity descending, take top_k
        candidates.sort(key=lambda x: x[0], reverse=True)

        return [
            {
                "source": src,
                "target": tgt,
                "similarity": round(sim, 4),
            }
            for sim, src, tgt in candidates[:top_k]
        ]

    @staticmethod
    def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """Compute cosine similarity between two vectors."""
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    @staticmethod
    def _pair_key(a: int, b: int) -> Tuple[int, int]:
        """Canonical key for an unordered cluster pair."""
        return (min(a, b), max(a, b))

    @staticmethod
    def _adaptive_threshold(gaps: List[StructuralGap]) -> float:
        """
        Compute adaptive gap strength threshold.

        threshold = min(0.7, 25th_percentile + 0.1)
        """
        if not gaps:
            return 0.7

        strengths = sorted(g.gap_strength for g in gaps)
        n = len(strengths)

        # 25th percentile
        idx = max(0, int(n * 0.25) - 1)
        p25 = strengths[idx]

        return min(0.7, p25 + 0.1)
