"""
UMAP 3D reduction for SPECTER2 embeddings.

Reduces 768-dim SPECTER2 embeddings to 3D coordinates for visualization.
Z-axis is overridden with publication year for temporal interpretation (v0.7.0).
"""

import logging
import math
from typing import List, Optional

import numpy as np

logger = logging.getLogger(__name__)


class EmbeddingReducer:
    """Reduces high-dimensional embeddings to 3D coordinates via UMAP."""

    def reduce_to_3d(
        self,
        embeddings: np.ndarray,
        n_neighbors: int = 10,
        min_dist: float = 0.1,
        metric: str = "cosine",
        random_state: int = 42,
        years: Optional[List[Optional[int]]] = None,
        use_temporal_z: bool = True,
    ) -> np.ndarray:
        """
        Reduce 768-dim SPECTER2 embeddings to 3D coordinates via UMAP.

        Z-axis is overridden with normalized publication year when use_temporal_z=True
        (Litmaps-validated approach: X/Y = semantic topology, Z = time depth).

        Args:
            embeddings: (N, 768) array of SPECTER2 embeddings
            n_neighbors: UMAP n_neighbors parameter (local vs global structure)
            min_dist: UMAP min_dist parameter (cluster tightness)
            metric: Distance metric for UMAP
            random_state: Random seed for reproducibility
            years: List of publication years (len N). Used when use_temporal_z=True.
            use_temporal_z: If True and years provided, override Z axis with
                            normalized publication year. Default True (v0.7.0+).

        Returns:
            (N, 3) array of 3D coordinates where Z = temporal depth
        """
        from umap import UMAP

        if embeddings.shape[0] < 3:
            logger.warning("Need at least 3 embeddings for UMAP, returning zeros")
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

        # Override Z-axis with publication year (temporal depth)
        if use_temporal_z and years is not None and len(years) == embeddings.shape[0]:
            coords_3d = self._apply_temporal_z(coords_3d, years)

        return coords_3d

    def reduce_to_intermediate(
        self,
        embeddings: np.ndarray,
        n_components: int = 50,
        n_neighbors: int = 15,
        metric: str = "cosine",
        random_state: int = 42,
    ) -> np.ndarray:
        """
        Reduce 768-dim embeddings to intermediate dimension (50D) for clustering.

        Used before HDBSCAN to avoid double-distortion bug:
        768D → 50D UMAP (for clustering) — NOT → 3D then cluster.

        McInnes et al. (2018): 50D UMAP preserves topological structure
        of original high-dimensional space nearly perfectly.

        Args:
            embeddings: (N, D) array of high-dimensional embeddings
            n_components: Target dimensionality (default 50)
            n_neighbors: UMAP n_neighbors
            metric: Distance metric (cosine for SPECTER2)
            random_state: Reproducibility seed

        Returns:
            (N, n_components) array suitable for HDBSCAN clustering
        """
        from umap import UMAP

        if embeddings.shape[0] < 3:
            return embeddings

        if embeddings.shape[1] <= n_components:
            # Already at or below target dimensionality
            return embeddings

        effective_neighbors = min(n_neighbors, embeddings.shape[0] - 1)
        effective_components = min(n_components, embeddings.shape[0] - 2)

        reducer = UMAP(
            n_components=effective_components,
            n_neighbors=effective_neighbors,
            min_dist=0.0,   # Tight clusters for HDBSCAN
            metric=metric,
            random_state=random_state,
        )

        intermediate = reducer.fit_transform(embeddings)
        logger.info(
            f"Reduced {embeddings.shape} to {intermediate.shape} "
            f"via intermediate UMAP (for clustering)"
        )
        return intermediate

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

    @staticmethod
    def _apply_temporal_z(
        coords_3d: np.ndarray,
        years: List[Optional[int]],
        z_range: float = 20.0,
    ) -> np.ndarray:
        """
        Override Z axis with normalized publication year.

        Maps years to [-z_range/2, +z_range/2] range.
        Papers with no year get Z=0 (center of temporal axis).

        Args:
            coords_3d: (N, 3) UMAP coordinates
            years: Publication years (None for unknown)
            z_range: Total Z-axis range (default 20 units)

        Returns:
            (N, 3) coordinates with Z replaced by temporal depth
        """
        valid_years = [y for y in years if y is not None and not math.isnan(float(y or 0))]
        if not valid_years:
            return coords_3d

        min_year = min(valid_years)
        max_year = max(valid_years)
        span = max(1, max_year - min_year)

        coords_out = coords_3d.copy()
        for i, year in enumerate(years):
            if year is not None:
                try:
                    y_float = float(year)
                    if not math.isnan(y_float):
                        coords_out[i, 2] = ((y_float - min_year) / span) * z_range - (z_range / 2)
                    else:
                        coords_out[i, 2] = 0.0
                except (ValueError, TypeError):
                    coords_out[i, 2] = 0.0
            else:
                coords_out[i, 2] = 0.0

        logger.info(
            f"Applied temporal Z override: years {min_year}–{max_year} "
            f"mapped to Z [{-z_range/2:.1f}, {z_range/2:.1f}]"
        )
        return coords_out
