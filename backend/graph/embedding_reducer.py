"""
UMAP 3D reduction for SPECTER2 embeddings.

Reduces 768-dim SPECTER2 embeddings to 3D coordinates for visualization.
"""

import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class EmbeddingReducer:
    """Reduces high-dimensional embeddings to 3D coordinates via UMAP."""

    def reduce_to_3d(
        self,
        embeddings: np.ndarray,
        n_neighbors: int = 15,
        min_dist: float = 0.1,
        metric: str = "cosine",
        random_state: int = 42,
    ) -> np.ndarray:
        """
        Reduce 768-dim SPECTER2 embeddings to 3D coordinates via UMAP.

        Args:
            embeddings: (N, 768) array of SPECTER2 embeddings
            n_neighbors: UMAP n_neighbors parameter (local vs global structure)
            min_dist: UMAP min_dist parameter (cluster tightness)
            metric: Distance metric for UMAP
            random_state: Random seed for reproducibility

        Returns:
            (N, 3) array of 3D coordinates
        """
        from umap import UMAP

        if embeddings.shape[0] < 2:
            logger.warning("Need at least 2 embeddings for UMAP, returning zeros")
            return np.zeros((embeddings.shape[0], 3))

        # Adjust n_neighbors for small datasets
        effective_neighbors = min(n_neighbors, embeddings.shape[0] - 1)

        reducer = UMAP(
            n_components=3,
            n_neighbors=effective_neighbors,
            min_dist=min_dist,
            metric=metric,
            random_state=random_state,
        )

        coords_3d = reducer.fit_transform(embeddings)
        logger.info(f"Reduced {embeddings.shape} to {coords_3d.shape} via UMAP")

        return coords_3d

    def reduce_to_2d(
        self,
        embeddings: np.ndarray,
        n_neighbors: int = 15,
        min_dist: float = 0.1,
    ) -> np.ndarray:
        """Reduce embeddings to 2D (for fallback or thumbnail views)."""
        from umap import UMAP

        if embeddings.shape[0] < 2:
            return np.zeros((embeddings.shape[0], 2))

        effective_neighbors = min(n_neighbors, embeddings.shape[0] - 1)

        reducer = UMAP(
            n_components=2,
            n_neighbors=effective_neighbors,
            min_dist=min_dist,
            metric="cosine",
            random_state=42,
        )

        return reducer.fit_transform(embeddings)
