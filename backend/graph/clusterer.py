"""
HDBSCAN clustering for paper embeddings.

Clusters papers based on SPECTER2 embeddings and labels clusters
using OpenAlex topic metadata.

v0.7.0 fix: HDBSCAN now runs on 50-dim intermediate UMAP embeddings
(not 3D UMAP coordinates) to avoid double-distortion bug.
(McInnes et al. 2018; Campello et al. 2013)
"""

import logging
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# Threshold: if input has more dims than this, reduce to intermediate first
_HIGH_DIM_THRESHOLD = 10


class PaperClusterer:
    """HDBSCAN-based paper clustering with topic labeling."""

    def cluster(
        self,
        embeddings: np.ndarray,
        min_cluster_size: int = 8,
        min_samples: Optional[int] = None,
    ) -> np.ndarray:
        """
        Cluster papers using HDBSCAN.

        v0.7.0: Input should be high-dimensional embeddings (768-dim or
        50-dim intermediate UMAP), NOT 3D UMAP coordinates.
        If high-dimensional input is detected (dim > 10), intermediate
        UMAP reduction to 50D is applied first to preserve topology.

        Args:
            embeddings: (N, D) array of embeddings.
                        Preferred: 50-dim intermediate UMAP output.
                        Also accepted: 768-dim SPECTER2 (slower but correct).
                        Deprecated: 3D UMAP coords (triggers auto-upgrade to 50D).
            min_cluster_size: Minimum points to form a cluster
            min_samples: Min samples for core point (default: min_cluster_size)

        Returns:
            (N,) array of cluster labels (-1 = noise/unclustered)
        """
        from hdbscan import HDBSCAN

        if embeddings.shape[0] < min_cluster_size:
            logger.warning(f"Too few papers ({embeddings.shape[0]}) for clustering")
            return np.zeros(embeddings.shape[0], dtype=int)

        # Prepare clustering input
        cluster_input = self._prepare_cluster_input(embeddings)

        # Use cosine metric for high-dim, euclidean for reduced
        metric = "euclidean"  # After intermediate UMAP, euclidean is appropriate

        clusterer = HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples or min_cluster_size,
            metric=metric,
            cluster_selection_method="eom",
        )

        labels = clusterer.fit_predict(cluster_input)
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = (labels == -1).sum()
        logger.info(
            f"HDBSCAN: {n_clusters} clusters, {n_noise} noise points "
            f"from {embeddings.shape[0]} papers "
            f"(input shape for clustering: {cluster_input.shape})"
        )

        return labels

    def _prepare_cluster_input(self, embeddings: np.ndarray) -> np.ndarray:
        """
        Prepare embeddings for HDBSCAN clustering.

        If dim > _HIGH_DIM_THRESHOLD (e.g., 768-dim SPECTER2 vectors),
        reduce to 50D intermediate UMAP first. This avoids the double-
        distortion bug where HDBSCAN ran on 3D UMAP coords (v0.6.0 behavior).

        For dim <= _HIGH_DIM_THRESHOLD (already reduced, e.g., 3D UMAP),
        we still run HDBSCAN but log a deprecation warning — callers should
        pass 50D intermediate instead.
        """
        n, dim = embeddings.shape

        if dim <= _HIGH_DIM_THRESHOLD:
            if dim <= 3:
                logger.warning(
                    f"HDBSCAN received {dim}-dim input (UMAP 3D coords). "
                    "This may produce poor clusters due to information loss. "
                    "Pass 768-dim or 50-dim intermediate embeddings instead."
                )
            return embeddings

        # High-dimensional: reduce to intermediate for clustering
        logger.info(
            f"Reducing {dim}-dim embeddings to 50D intermediate for HDBSCAN "
            "(avoids double-distortion bug, preserves topology)"
        )
        from graph.embedding_reducer import EmbeddingReducer
        reducer = EmbeddingReducer()
        return reducer.reduce_to_intermediate(
            embeddings,
            n_components=min(50, n - 2),
            n_neighbors=min(15, n - 1),
        )

    def label_clusters(
        self,
        papers: List[Dict[str, Any]],
        cluster_labels: np.ndarray,
    ) -> Dict[int, Dict[str, Any]]:
        """
        Label each cluster using OA Topics (top 3 topics per cluster).

        Args:
            papers: List of paper dicts with 'oa_topics' and 'fields_of_study' keys
            cluster_labels: (N,) array of cluster labels

        Returns:
            Dict mapping cluster_id to {label, topic_names, paper_count, color}
        """
        cluster_info: Dict[int, Dict[str, Any]] = {}

        unique_labels = sorted(set(cluster_labels))
        # Color palette for clusters
        colors = [
            "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
            "#264653", "#A8DADC", "#6D6875", "#B5838D", "#FFB4A2",
            "#CDB4DB", "#FFC8DD", "#BDE0FE", "#A2D2FF", "#CAFFBF",
        ]

        for label in unique_labels:
            if label == -1:
                cluster_info[-1] = {
                    "label": "Unclustered",
                    "topic_names": [],
                    "paper_count": int((cluster_labels == label).sum()),
                    "color": "#888888",
                }
                continue

            # Get papers in this cluster
            mask = cluster_labels == label
            cluster_papers = [p for p, m in zip(papers, mask) if m]

            # Collect all topics from papers in cluster
            topic_counter: Counter = Counter()
            field_counter: Counter = Counter()

            for paper in cluster_papers:
                for topic in paper.get("oa_topics", []):
                    name = topic.get("display_name")
                    if name:
                        topic_counter[name] += 1
                for fos in paper.get("fields_of_study", []):
                    if fos:
                        field_counter[fos] += 1

            # Top 3 topics for label
            top_topics = [name for name, _ in topic_counter.most_common(3)]
            if not top_topics:
                top_topics = [name for name, _ in field_counter.most_common(3)]
            if not top_topics:
                top_topics = [f"Cluster {label}"]

            cluster_label = " / ".join(top_topics[:2]) if len(top_topics) >= 2 else top_topics[0]

            cluster_info[label] = {
                "label": cluster_label,
                "topic_names": top_topics,
                "paper_count": len(cluster_papers),
                "color": colors[label % len(colors)],
            }

        return cluster_info

    def compute_hulls(
        self,
        coords_3d: np.ndarray,
        cluster_labels: np.ndarray,
    ) -> Dict[int, List[List[float]]]:
        """
        Compute convex hull vertices for each cluster in 3D space.

        Args:
            coords_3d: (N, 3) array of 3D coordinates
            cluster_labels: (N,) array of cluster labels

        Returns:
            Dict mapping cluster_id to list of hull vertex coordinates
        """
        from scipy.spatial import ConvexHull

        hulls: Dict[int, List[List[float]]] = {}

        unique_labels = set(cluster_labels)
        for label in unique_labels:
            if label == -1:
                continue

            mask = cluster_labels == label
            points = coords_3d[mask]

            if points.shape[0] < 4:
                # Not enough points for a 3D convex hull
                hulls[label] = points.tolist()
                continue

            try:
                hull = ConvexHull(points)
                hull_vertices = points[hull.vertices].tolist()
                hulls[label] = hull_vertices
            except Exception as e:
                logger.warning(f"Failed to compute hull for cluster {label}: {e}")
                hulls[label] = points.tolist()

        return hulls
