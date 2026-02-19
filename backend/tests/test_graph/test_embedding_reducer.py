"""
Tests for EmbeddingReducer in graph/embedding_reducer.py.

TDD RED phase: defines expected UMAP dimensionality reduction behavior.
Run: pytest tests/test_graph/test_embedding_reducer.py -v

Note: UMAP is stochastic but we use random_state=42 (the default) for
reproducibility. Tests marked @pytest.mark.slow require ~5-10s each.
"""

import numpy as np
import pytest

from graph.embedding_reducer import EmbeddingReducer


# ==================== Fixtures ====================

@pytest.fixture
def reducer() -> EmbeddingReducer:
    return EmbeddingReducer()


def make_embeddings(n: int = 50, dims: int = 768, seed: int = 42) -> np.ndarray:
    """Create random float32 embeddings for testing."""
    return np.random.default_rng(seed).normal(0, 1, (n, dims)).astype(np.float32)


# ==================== reduce_to_3d() ====================

class TestReduceTo3d:
    """Tests for EmbeddingReducer.reduce_to_3d()."""

    @pytest.mark.slow
    def test_reduces_to_3d(self, reducer):
        """
        Core contract: (N, 768) input → (N, 3) output.
        This is the SPECTER2 → 3D visualization pipeline.
        """
        embeddings = make_embeddings(n=50, dims=768)
        result = reducer.reduce_to_3d(embeddings)

        assert result.shape == (50, 3), (
            f"Expected shape (50, 3), got {result.shape}"
        )

    @pytest.mark.slow
    def test_reduces_to_3d_returns_numpy_array(self, reducer):
        """Output must be a numpy ndarray."""
        embeddings = make_embeddings(n=20, dims=768)
        result = reducer.reduce_to_3d(embeddings)
        assert isinstance(result, np.ndarray)

    @pytest.mark.slow
    def test_reduces_to_3d_output_is_float(self, reducer):
        """Output coordinates must be floating-point dtype."""
        embeddings = make_embeddings(n=20, dims=768)
        result = reducer.reduce_to_3d(embeddings)
        assert np.issubdtype(result.dtype, np.floating)

    @pytest.mark.slow
    def test_reduces_to_3d_preserves_paper_count(self, reducer):
        """Number of output rows must equal number of input embeddings."""
        n = 30
        embeddings = make_embeddings(n=n, dims=768)
        result = reducer.reduce_to_3d(embeddings)
        assert result.shape[0] == n

    # --- Single embedding edge case ---

    def test_single_embedding_zeros(self, reducer):
        """
        A single embedding cannot be reduced meaningfully via UMAP.
        Must return shape (1, 3) with finite values (zeros acceptable).
        Must not raise.
        """
        embedding = np.random.default_rng(0).normal(0, 1, (1, 768)).astype(np.float32)
        result = reducer.reduce_to_3d(embedding)

        assert result.shape == (1, 3)
        assert np.all(np.isfinite(result)), "Single-embedding result contains NaN/inf"

    def test_two_embeddings_return_shape_2_3(self, reducer):
        """Two embeddings must return shape (2, 3) without crashing."""
        embeddings = make_embeddings(n=2, dims=768)
        result = reducer.reduce_to_3d(embeddings)
        assert result.shape == (2, 3)

    # --- n_neighbors adjustment ---

    @pytest.mark.slow
    def test_adjusts_neighbors(self, reducer):
        """
        When n_papers < default n_neighbors (15), UMAP must not raise
        'n_neighbors must be < number of training samples'.
        The reducer adjusts n_neighbors = min(15, n-1) automatically.
        """
        embeddings = make_embeddings(n=5, dims=768)

        # Must not raise
        result = reducer.reduce_to_3d(embeddings)

        assert result.shape == (5, 3)

    @pytest.mark.slow
    def test_exact_n_neighbors_boundary(self, reducer):
        """Exactly 15 papers (default n_neighbors value) must work correctly."""
        embeddings = make_embeddings(n=15, dims=768)
        result = reducer.reduce_to_3d(embeddings)
        assert result.shape == (15, 3)

    # --- Reproducibility ---

    @pytest.mark.slow
    def test_reproducible_with_seed(self, reducer):
        """
        Two calls with same input and random_state=42 must produce identical results.
        This ensures the 3D layout is stable across server restarts.
        """
        embeddings = make_embeddings(n=30, dims=768, seed=99)

        result1 = reducer.reduce_to_3d(embeddings)
        result2 = reducer.reduce_to_3d(embeddings)

        np.testing.assert_allclose(
            result1, result2, rtol=1e-5,
            err_msg="reduce_to_3d is not deterministic with same random_state",
        )

    # --- Output validity ---

    @pytest.mark.slow
    def test_output_coordinates_are_finite(self, reducer):
        """All coordinates in the output must be finite (no NaN or inf)."""
        embeddings = make_embeddings(n=40, dims=768)
        result = reducer.reduce_to_3d(embeddings)

        assert np.all(np.isfinite(result)), (
            "UMAP output contains NaN or infinite values"
        )

    @pytest.mark.slow
    def test_large_dataset_shape(self, reducer):
        """200 papers (max typical search result) must reduce to (200, 3)."""
        embeddings = make_embeddings(n=200, dims=768)
        result = reducer.reduce_to_3d(embeddings)
        assert result.shape == (200, 3)

    @pytest.mark.slow
    def test_small_embedding_dimension(self, reducer):
        """Should work with smaller embedding dimensions (e.g., 64-dim)."""
        embeddings = make_embeddings(n=20, dims=64)
        result = reducer.reduce_to_3d(embeddings)
        assert result.shape == (20, 3)
