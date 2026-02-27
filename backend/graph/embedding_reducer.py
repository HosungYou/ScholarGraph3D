"""
UMAP 3D reduction for SPECTER2 embeddings.

Reduces 768-dim SPECTER2 embeddings to 3D coordinates for visualization.
Z-axis is overridden with publication year for temporal interpretation (v0.7.0).

v2.0.2: PCA pre-reduction (768→100D) before UMAP to avoid 50+ second
UMAP fits on low-CPU environments (Render Starter 0.5 vCPU).
"""

import logging
import math
import time
from typing import List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# Threshold above which PCA pre-reduction kicks in before UMAP
_PCA_THRESHOLD = 200


class EmbeddingReducer:
    """Reduces high-dimensional embeddings to 3D coordinates via UMAP."""

    @staticmethod
    def _pca_pre_reduce(embeddings: np.ndarray, target_dim: int = 100) -> np.ndarray:
        """
        Fast PCA pre-reduction for high-dimensional embeddings.

        Reduces 768-dim SPECTER2 embeddings to ~100D before UMAP,
        cutting UMAP fit time from ~50s to ~3s on 0.5 vCPU.

        Args:
            embeddings: (N, D) array where D > target_dim
            target_dim: Target dimensionality (default 100)

        Returns:
            (N, target_dim) array
        """
        from sklearn.decomposition import PCA

        effective_dim = min(target_dim, embeddings.shape[0] - 1, embeddings.shape[1])
        if effective_dim <= 0 or embeddings.shape[1] <= target_dim:
            return embeddings

        t0 = time.time()
        pca = PCA(n_components=effective_dim, random_state=42)
        reduced = pca.fit_transform(embeddings)
        variance_kept = sum(pca.explained_variance_ratio_) * 100
        logger.info(
            f"PCA {embeddings.shape[1]}→{effective_dim}D: "
            f"{variance_kept:.1f}% variance retained in {time.time() - t0:.2f}s"
        )
        return reduced

    def reduce_to_3d(
        self,
        embeddings: np.ndarray,
        n_neighbors: int = 10,
        min_dist: float = 0.3,
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

        # PCA pre-reduction for high-dimensional input
        input_data = embeddings
        if embeddings.shape[1] > _PCA_THRESHOLD:
            input_data = self._pca_pre_reduce(embeddings, target_dim=100)

        # Adjust n_neighbors for small datasets
        effective_neighbors = min(
            min(15, max(10, input_data.shape[0] // 3)),  # adaptive: global structure
            input_data.shape[0] - 1
        )

        t0 = time.time()
        reducer = UMAP(
            n_components=3,
            n_neighbors=effective_neighbors,
            min_dist=min_dist,
            metric=metric,
            random_state=random_state,
        )

        coords_3d = reducer.fit_transform(input_data)
        logger.info(f"UMAP {input_data.shape}→{coords_3d.shape} in {time.time() - t0:.2f}s")

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
        Reduce high-dim embeddings to intermediate dimension (50D) for clustering.

        Pipeline (v2.0.2):
        - If input dim > _PCA_THRESHOLD (200): PCA pre-reduce to 100D first (~0.01s)
        - Then UMAP 100D→50D (~2-3s instead of 768→50D at ~50s)

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

        # PCA pre-reduction for high-dimensional input (768D SPECTER2)
        input_data = embeddings
        if embeddings.shape[1] > _PCA_THRESHOLD:
            input_data = self._pca_pre_reduce(embeddings, target_dim=100)

        # If PCA already reduced below target, return as-is
        if input_data.shape[1] <= n_components:
            return input_data

        effective_neighbors = min(n_neighbors, input_data.shape[0] - 1)
        effective_components = min(n_components, input_data.shape[0] - 2)

        t0 = time.time()
        reducer = UMAP(
            n_components=effective_components,
            n_neighbors=effective_neighbors,
            min_dist=0.0,   # Tight clusters for HDBSCAN
            metric=metric,
            random_state=random_state,
        )

        intermediate = reducer.fit_transform(input_data)
        logger.info(
            f"UMAP {input_data.shape}→{intermediate.shape} in {time.time() - t0:.2f}s"
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

        # Skip temporal override when span < 3 years — UMAP Z is more informative
        if span < 3:
            logger.info(
                f"Year span={span} < 3 (years {min_year}–{max_year}): "
                "Skipping temporal Z override — using UMAP Z for better spread"
            )
            return coords_3d

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
