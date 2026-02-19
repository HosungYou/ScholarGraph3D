"""
HDBSCAN clustering for paper embeddings.

Clusters papers based on SPECTER2 embeddings and labels clusters
using OpenAlex topic metadata.
"""

import logging
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


class PaperClusterer:
    """HDBSCAN-based paper clustering with topic labeling."""

    def cluster(
        self,
        embeddings: np.ndarray,
        min_cluster_size: int = 5,
        min_samples: Optional[int] = None,
    ) -> np.ndarray:
        """
        Cluster papers using HDBSCAN on SPECTER2 embeddings.

        Args:
            embeddings: (N, D) array of embeddings (768-dim or 3D reduced)
            min_cluster_size: Minimum points to form a cluster
            min_samples: Min samples for core point (default: min_cluster_size)

        Returns:
            (N,) array of cluster labels (-1 = noise/unclustered)
        """
        from hdbscan import HDBSCAN

        if embeddings.shape[0] < min_cluster_size:
            logger.warning(f"Too few papers ({embeddings.shape[0]}) for clustering")
            return np.zeros(embeddings.shape[0], dtype=int)

        clusterer = HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples or min_cluster_size,
            metric="euclidean",
            cluster_selection_method="eom",
        )

        labels = clusterer.fit_predict(embeddings)
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = (labels == -1).sum()
        logger.info(f"HDBSCAN: {n_clusters} clusters, {n_noise} noise points from {embeddings.shape[0]} papers")

        return labels

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
