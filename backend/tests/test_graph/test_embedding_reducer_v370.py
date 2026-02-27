"""
Tests for EmbeddingReducer v3.7.0 new behaviors in graph/embedding_reducer.py.

TDD RED phase: verifies two new v3.7.0 behaviors before they exist in a
standalone form, and green-checks the existing implementation.

New behaviors tested:
  1. Adaptive n_neighbors logic: min(min(15, max(10, N//3)), N-1)
  2. span < 3 early return in _apply_temporal_z

Run: pytest tests/test_graph/test_embedding_reducer_v370.py -v
Run slow only: pytest tests/test_graph/test_embedding_reducer_v370.py -v -m slow
Skip slow:     pytest tests/test_graph/test_embedding_reducer_v370.py -v -m "not slow"
"""

import inspect
from typing import List, Optional
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from graph.embedding_reducer import EmbeddingReducer


# ==================== Helpers ====================

def make_embeddings(n: int, dims: int = 50, seed: int = 42) -> np.ndarray:
    """Create random float32 embeddings for testing.

    Defaults to 50 dims (post-PCA) to avoid triggering PCA in unit tests —
    UMAP-dependent tests use @pytest.mark.slow and are OK to trigger PCA.
    """
    return np.random.default_rng(seed).normal(0, 1, (n, dims)).astype(np.float32)


def make_coords_3d(n: int, seed: int = 7) -> np.ndarray:
    """Create random (N, 3) coordinate array for _apply_temporal_z tests."""
    return np.random.default_rng(seed).uniform(-5, 5, (n, 3)).astype(np.float64)


# ==================== TestAdaptiveNeighbors ====================

class TestAdaptiveNeighbors:
    """
    Tests for the adaptive n_neighbors logic in reduce_to_3d().

    Formula: min(min(15, max(10, N//3)), N-1)

    This ensures UMAP always gets a valid n_neighbors that:
      - Captures global structure (max 15)
      - Never exceeds N-1 (UMAP hard requirement)
      - Provides reasonable local connectivity (at least 10, capped at N-1)
    """

    @pytest.mark.slow
    def test_adaptive_n50_uses_15(self):
        """
        N=50: min(15, max(10, 50//3=16)) = min(15,16) = 15.

        Verifies UMAP is called with effective_neighbors=15 and
        the output has the correct shape (50, 3).
        Patches the UMAP constructor to capture the n_neighbors argument.
        """
        import umap as umap_module
        real_UMAP = umap_module.UMAP  # save before patch to avoid recursion
        embeddings = make_embeddings(n=50, dims=50)
        captured = {}

        def fake_umap_constructor(**kwargs):
            captured["n_neighbors"] = kwargs.get("n_neighbors")
            return real_UMAP(**kwargs)

        reducer = EmbeddingReducer()

        with patch("umap.UMAP", side_effect=fake_umap_constructor):
            result = reducer.reduce_to_3d(embeddings)

        assert captured.get("n_neighbors") == 15, (
            f"Expected n_neighbors=15 for N=50, got {captured.get('n_neighbors')}"
        )
        assert result.shape == (50, 3), f"Expected (50, 3), got {result.shape}"

    @pytest.mark.slow
    def test_adaptive_n30_uses_10(self):
        """
        N=30: min(15, max(10, 30//3=10)) = min(15, 10) = 10.

        Should use n_neighbors=10.
        """
        import umap as umap_module
        real_UMAP = umap_module.UMAP
        embeddings = make_embeddings(n=30, dims=50)
        captured = {}

        def fake_umap_constructor(**kwargs):
            captured["n_neighbors"] = kwargs.get("n_neighbors")
            return real_UMAP(**kwargs)

        reducer = EmbeddingReducer()

        with patch("umap.UMAP", side_effect=fake_umap_constructor):
            result = reducer.reduce_to_3d(embeddings)

        assert captured.get("n_neighbors") == 10, (
            f"Expected n_neighbors=10 for N=30, got {captured.get('n_neighbors')}"
        )
        assert result.shape == (30, 3)

    @pytest.mark.slow
    def test_adaptive_n100_caps_at_15(self):
        """
        N=100: min(15, max(10, 100//3=33)) = min(15, 33) = 15.

        Large datasets must cap at 15 to keep UMAP fast and focused on
        local structure.
        """
        import umap as umap_module
        real_UMAP = umap_module.UMAP
        embeddings = make_embeddings(n=100, dims=50)
        captured = {}

        def fake_umap_constructor(**kwargs):
            captured["n_neighbors"] = kwargs.get("n_neighbors")
            return real_UMAP(**kwargs)

        reducer = EmbeddingReducer()

        with patch("umap.UMAP", side_effect=fake_umap_constructor):
            result = reducer.reduce_to_3d(embeddings)

        assert captured.get("n_neighbors") == 15, (
            f"Expected n_neighbors=15 for N=100, got {captured.get('n_neighbors')}"
        )
        assert result.shape == (100, 3)

    @pytest.mark.slow
    def test_adaptive_n5_uses_n_minus_1(self):
        """
        N=5: inner = min(15, max(10, 5//3=1)) = min(15, 10) = 10.
             outer = min(10, 5-1=4) = 4.

        The n_neighbors must never exceed N-1 to avoid UMAP crashing with
        'n_neighbors must be < number of training samples'.
        """
        import umap as umap_module
        real_UMAP = umap_module.UMAP
        embeddings = make_embeddings(n=5, dims=50)
        captured = {}

        def fake_umap_constructor(**kwargs):
            captured["n_neighbors"] = kwargs.get("n_neighbors")
            return real_UMAP(**kwargs)

        reducer = EmbeddingReducer()

        with patch("umap.UMAP", side_effect=fake_umap_constructor):
            result = reducer.reduce_to_3d(embeddings)

        n_neighbors_used = captured.get("n_neighbors")
        assert n_neighbors_used is not None, "UMAP constructor was never called"
        assert n_neighbors_used <= 4, (
            f"n_neighbors={n_neighbors_used} must be <= N-1=4 for N=5"
        )
        assert result.shape == (5, 3)

    def test_adaptive_default_param_unchanged(self):
        """
        The public API default for n_neighbors remains 10 (backward compatible).

        Verifies via inspect.signature that callers passing no n_neighbors
        argument still get the documented default of 10. The adaptive logic
        overrides this internally but the signature must not change.
        """
        sig = inspect.signature(EmbeddingReducer.reduce_to_3d)
        default = sig.parameters["n_neighbors"].default
        assert default == 10, (
            f"Expected default n_neighbors=10 for API compat, got {default}"
        )


# ==================== TestTemporalZConditionalSkip ====================

class TestTemporalZConditionalSkip:
    """
    Tests for the span < 3 early return in _apply_temporal_z().

    When all papers cluster tightly in time (span 0, 1, or 2 years),
    the UMAP Z coordinates carry more semantic information than a
    temporal override would, so the method returns coords unchanged.

    For span >= 3, Z values are replaced with normalized year positions
    in the range [-z_range/2, +z_range/2].

    All tests call _apply_temporal_z directly — no UMAP needed.
    Fast, no @pytest.mark.slow.
    """

    def test_span_0_skips_temporal_override(self):
        """
        All papers in the same year (span=0). _apply_temporal_z returns
        coords_3d with Z values unchanged (same array values as input).
        """
        coords = make_coords_3d(n=6)
        years: List[Optional[int]] = [2022, 2022, 2022, 2022, 2022, 2022]
        original_z = coords[:, 2].copy()

        result = EmbeddingReducer._apply_temporal_z(coords, years)

        np.testing.assert_array_equal(
            result[:, 2], original_z,
            err_msg="span=0 should leave Z unchanged"
        )

    def test_span_1_skips_temporal_override(self):
        """
        Year span = 1 (e.g., 2022–2023). Should skip temporal override.
        Z values remain as UMAP computed them.
        """
        coords = make_coords_3d(n=4)
        years: List[Optional[int]] = [2022, 2022, 2023, 2023]
        original_z = coords[:, 2].copy()

        result = EmbeddingReducer._apply_temporal_z(coords, years)

        np.testing.assert_array_equal(
            result[:, 2], original_z,
            err_msg="span=1 should leave Z unchanged"
        )

    def test_span_2_skips_temporal_override(self):
        """
        Year span = 2 exactly (e.g., 2020–2022). Should skip.
        The threshold is span < 3, so span=2 must not apply temporal Z.
        """
        coords = make_coords_3d(n=5)
        years: List[Optional[int]] = [2020, 2021, 2022, 2020, 2021]
        original_z = coords[:, 2].copy()

        result = EmbeddingReducer._apply_temporal_z(coords, years)

        np.testing.assert_array_equal(
            result[:, 2], original_z,
            err_msg="span=2 should leave Z unchanged (threshold is span < 3)"
        )

    def test_span_3_applies_temporal_override(self):
        """
        Year span = 3 (e.g., 2020–2023). Should apply temporal override.
        Z values should map to [-10, 10] (default z_range=20).

        The earliest year maps to -10, the latest maps to +10.
        """
        coords = make_coords_3d(n=4)
        years: List[Optional[int]] = [2020, 2021, 2022, 2023]

        result = EmbeddingReducer._apply_temporal_z(coords, years)

        # Earliest year (2020) → z = -10.0
        assert result[0, 2] == pytest.approx(-10.0, abs=1e-6), (
            f"2020 (earliest) should map to z=-10.0, got {result[0, 2]}"
        )
        # Latest year (2023) → z = +10.0
        assert result[3, 2] == pytest.approx(10.0, abs=1e-6), (
            f"2023 (latest) should map to z=+10.0, got {result[3, 2]}"
        )

    def test_span_10_applies_temporal_override(self):
        """
        Normal span of 10 years (e.g., 2010–2020). Should apply temporal Z.
        Z values are replaced by temporal values, not the original UMAP Z.
        """
        n = 11
        coords = make_coords_3d(n=n)
        years: List[Optional[int]] = list(range(2010, 2021))  # 2010..2020 inclusive
        original_z = coords[:, 2].copy()

        result = EmbeddingReducer._apply_temporal_z(coords, years)

        # Z values must have changed — temporal override was applied
        assert not np.allclose(result[:, 2], original_z), (
            "span=10 should replace Z with temporal values"
        )
        # X and Y must be unchanged
        np.testing.assert_array_equal(result[:, 0], coords[:, 0])
        np.testing.assert_array_equal(result[:, 1], coords[:, 1])

    def test_all_none_years_skips_override(self):
        """
        If no valid (non-None) years exist, _apply_temporal_z returns
        coords_3d unchanged. An empty valid_years list triggers the
        early return before span is computed.
        """
        coords = make_coords_3d(n=3)
        years: List[Optional[int]] = [None, None, None]
        original_z = coords[:, 2].copy()

        result = EmbeddingReducer._apply_temporal_z(coords, years)

        np.testing.assert_array_equal(
            result[:, 2], original_z,
            err_msg="All-None years should leave Z unchanged"
        )

    def test_temporal_z_range_correct(self):
        """
        For span >= 3, Z values must lie within [-z_range/2, +z_range/2].

        Uses z_range=20 (default). Any year with a valid value must
        produce a Z between -10.0 and +10.0 (inclusive).
        """
        coords = make_coords_3d(n=8)
        years: List[Optional[int]] = [2000, 2005, 2010, 2015, None, 2020, 2003, 2018]

        result = EmbeddingReducer._apply_temporal_z(coords, years, z_range=20.0)

        z_half = 20.0 / 2
        for i, year in enumerate(years):
            z_val = result[i, 2]
            assert -z_half <= z_val <= z_half, (
                f"Z={z_val:.4f} for year={year} is outside [-{z_half}, +{z_half}]"
            )

    def test_span_boundary_2_vs_3_difference(self):
        """
        Regression guard: span=2 skips, span=3 applies. Verifies the
        boundary is at < 3 (not <= 3 or < 2), confirming the exact
        threshold documented in the v3.7.0 spec.
        """
        n = 4
        coords_a = make_coords_3d(n=n, seed=1)
        coords_b = coords_a.copy()

        years_span2: List[Optional[int]] = [2021, 2022, 2023, 2022]  # span=2
        years_span3: List[Optional[int]] = [2020, 2021, 2022, 2023]  # span=3

        result_skip = EmbeddingReducer._apply_temporal_z(coords_a, years_span2)
        result_apply = EmbeddingReducer._apply_temporal_z(coords_b, years_span3)

        # span=2 → Z unchanged
        np.testing.assert_array_equal(result_skip[:, 2], coords_a[:, 2])
        # span=3 → Z changed
        assert not np.allclose(result_apply[:, 2], coords_b[:, 2])
