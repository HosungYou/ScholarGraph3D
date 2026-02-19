"""
Cosine similarity edge computation for paper embeddings.

Computes pairwise cosine similarity between paper embeddings and
returns edges above a configurable threshold.
"""

import logging
from typing import Dict, List, Tuple

import numpy as np

logger = logging.getLogger(__name__)


class SimilarityComputer:
    """Computes cosine similarity edges between paper embeddings."""

    def compute_edges(
        self,
        embeddings: np.ndarray,
        paper_ids: List[str],
        threshold: float = 0.7,
        max_edges_per_node: int = 10,
    ) -> List[Dict]:
        """
        Compute cosine similarity edges between papers above threshold.

        Args:
            embeddings: (N, D) array of embeddings
            paper_ids: List of paper IDs corresponding to rows
            threshold: Minimum similarity to create an edge
            max_edges_per_node: Maximum edges per paper (top-k)

        Returns:
            List of edge dicts with {source, target, similarity}
        """
        if embeddings.shape[0] < 2:
            return []

        # Normalize embeddings for cosine similarity
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        normalized = embeddings / norms

        # Compute pairwise cosine similarity matrix
        similarity_matrix = normalized @ normalized.T

        edges = []
        degree: Dict[str, int] = {}
        for i in range(similarity_matrix.shape[0]):
            # Get similarities for this paper (excluding self)
            sims = similarity_matrix[i].copy()
            sims[i] = -1  # Exclude self-similarity

            # Get top-k above threshold
            above_threshold = np.where(sims >= threshold)[0]

            if len(above_threshold) == 0:
                continue

            # Sort by similarity, take top-k
            sorted_indices = above_threshold[np.argsort(sims[above_threshold])[::-1]]
            top_indices = sorted_indices[:max_edges_per_node]

            for j in top_indices:
                # Only add edge once (i < j to avoid duplicates)
                if i < j:
                    src, tgt = paper_ids[i], paper_ids[j]
                    # Enforce max degree for both endpoints
                    if degree.get(src, 0) >= max_edges_per_node:
                        continue
                    if degree.get(tgt, 0) >= max_edges_per_node:
                        continue
                    edges.append({
                        "source": src,
                        "target": tgt,
                        "similarity": float(sims[j]),
                        "type": "similarity",
                    })
                    degree[src] = degree.get(src, 0) + 1
                    degree[tgt] = degree.get(tgt, 0) + 1

        logger.info(
            f"Computed {len(edges)} similarity edges "
            f"(threshold={threshold}, {embeddings.shape[0]} papers)"
        )

        return edges

    def compute_similarity(
        self,
        embedding_a: np.ndarray,
        embedding_b: np.ndarray,
    ) -> float:
        """Compute cosine similarity between two embeddings."""
        norm_a = np.linalg.norm(embedding_a)
        norm_b = np.linalg.norm(embedding_b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(np.dot(embedding_a, embedding_b) / (norm_a * norm_b))
