"""
Tests for the POST /api/search endpoint in routers/search.py.

TDD RED phase: defines expected HTTP behavior of the main search pipeline.
Uses httpx AsyncClient with ASGITransport + heavy mocking of external dependencies.

Run: pytest tests/test_routers/test_search.py -v
"""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from integrations.data_fusion import UnifiedPaper


# ==================== Helpers ====================

def make_unified_paper(
    doi: str = "10.1234/paper.001",
    title: str = "Test Paper",
    abstract: str = "Abstract text here.",
    year: int = 2022,
    citation_count: int = 50,
    embedding: list = None,
    s2_paper_id: str = "s2abc",
    oa_work_id: str = "W001",
    fields_of_study: list = None,
    oa_topics: list = None,
    authors: list = None,
) -> UnifiedPaper:
    """Create a UnifiedPaper instance for test use."""
    return UnifiedPaper(
        doi=doi,
        title=title,
        abstract=abstract,
        year=year,
        citation_count=citation_count,
        embedding=embedding if embedding is not None else [0.1] * 768,
        s2_paper_id=s2_paper_id,
        oa_work_id=oa_work_id,
        fields_of_study=fields_of_study if fields_of_study is not None else ["Computer Science"],
        oa_topics=oa_topics if oa_topics is not None else [
            {"id": "T1", "display_name": "AI", "score": 0.9}
        ],
        authors=authors if authors is not None else [{"name": "Test Author"}],
        is_open_access=True,
        oa_url="https://arxiv.org/abs/test",
        tldr="Short summary.",
    )


def make_papers_with_embeddings(n: int = 20) -> list:
    """Create N UnifiedPaper objects with distinct random embeddings."""
    import numpy as np
    rng = np.random.default_rng(42)
    papers = []
    for i in range(n):
        emb = rng.normal(0, 1, 768).tolist()
        papers.append(make_unified_paper(
            doi=f"10.1234/paper.{i:03d}",
            title=f"Paper {i}: Transformer Architecture",
            embedding=emb,
            s2_paper_id=f"s2_{i:04d}",
            oa_work_id=f"W{i:04d}",
        ))
    return papers


# ==================== POST /api/search Tests ====================

class TestSearchEndpoint:
    """Integration tests for POST /api/search."""

    @pytest.mark.asyncio
    async def test_search_empty_query_returns_422(self):
        """
        Empty string query must fail Pydantic validation (min_length=1).
        Expected: HTTP 422 Unprocessable Entity.
        """
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/search",
                json={"query": "", "limit": 10},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_search_missing_query_returns_422(self):
        """Request body without 'query' field must return HTTP 422."""
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/search", json={"limit": 10})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_search_limit_too_high_returns_422(self):
        """Limit above 500 must return 422 (Field constraint le=500)."""
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/search",
                json={"query": "test", "limit": 9999},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_search_valid_query_returns_graph(self):
        """
        A valid search query must return HTTP 200 with a graph response
        containing nodes, edges, clusters, and meta.
        """
        papers = make_papers_with_embeddings(20)

        with patch("routers.search._create_clients") as mock_clients, \
             patch("routers.search.DataFusionService") as mock_fusion_cls, \
             patch("routers.search.get_db") as mock_get_db:

            # Mock DB — no cache hit
            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            # Mock clients
            oa_client = AsyncMock()
            s2_client = AsyncMock()
            oa_client.close = AsyncMock()
            s2_client.close = AsyncMock()
            mock_clients.return_value = (oa_client, s2_client)

            # Mock DataFusionService
            mock_fusion = AsyncMock()
            mock_fusion.search = AsyncMock(return_value=papers)
            mock_fusion_cls.return_value = mock_fusion

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/search",
                    json={"query": "transformer attention", "limit": 20},
                )

        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_search_response_structure(self):
        """Response must contain all required top-level keys: nodes, edges, clusters, meta."""
        papers = make_papers_with_embeddings(20)

        with patch("routers.search._create_clients") as mock_clients, \
             patch("routers.search.DataFusionService") as mock_fusion_cls, \
             patch("routers.search.get_db") as mock_get_db:

            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            oa_client, s2_client = AsyncMock(), AsyncMock()
            oa_client.close = AsyncMock()
            s2_client.close = AsyncMock()
            mock_clients.return_value = (oa_client, s2_client)

            mock_fusion = AsyncMock()
            mock_fusion.search = AsyncMock(return_value=papers)
            mock_fusion_cls.return_value = mock_fusion

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/search",
                    json={"query": "deep learning", "limit": 20},
                )

        data = resp.json()
        assert "nodes" in data
        assert "edges" in data
        assert "clusters" in data
        assert "meta" in data

    @pytest.mark.asyncio
    async def test_search_response_node_has_required_fields(self):
        """
        Each node in the response must contain: id, title, x, y, z, cluster_id.
        These are the minimum fields required by the frontend renderer.
        """
        papers = make_papers_with_embeddings(20)

        with patch("routers.search._create_clients") as mock_clients, \
             patch("routers.search.DataFusionService") as mock_fusion_cls, \
             patch("routers.search.get_db") as mock_get_db:

            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            oa_client, s2_client = AsyncMock(), AsyncMock()
            oa_client.close = AsyncMock()
            s2_client.close = AsyncMock()
            mock_clients.return_value = (oa_client, s2_client)

            mock_fusion = AsyncMock()
            mock_fusion.search = AsyncMock(return_value=papers)
            mock_fusion_cls.return_value = mock_fusion

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/search",
                    json={"query": "neural network", "limit": 20},
                )

        data = resp.json()
        assert len(data["nodes"]) > 0

        for node in data["nodes"]:
            assert "id" in node, f"Node missing 'id': {node}"
            assert "title" in node, f"Node missing 'title': {node}"
            assert "x" in node, f"Node missing 'x': {node}"
            assert "y" in node, f"Node missing 'y': {node}"
            assert "z" in node, f"Node missing 'z': {node}"
            assert "cluster_id" in node, f"Node missing 'cluster_id': {node}"

    @pytest.mark.asyncio
    async def test_search_meta_contains_query_and_total(self):
        """meta dict must include the original query string and total node count."""
        n = 15
        papers = make_papers_with_embeddings(n)

        with patch("routers.search._create_clients") as mock_clients, \
             patch("routers.search.DataFusionService") as mock_fusion_cls, \
             patch("routers.search.get_db") as mock_get_db:

            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            oa_client, s2_client = AsyncMock(), AsyncMock()
            oa_client.close = AsyncMock()
            s2_client.close = AsyncMock()
            mock_clients.return_value = (oa_client, s2_client)

            mock_fusion = AsyncMock()
            mock_fusion.search = AsyncMock(return_value=papers)
            mock_fusion_cls.return_value = mock_fusion

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/search",
                    json={"query": "BERT language model", "limit": n},
                )

        data = resp.json()
        assert data["meta"]["query"] == "BERT language model"
        assert data["meta"]["total"] == n

    @pytest.mark.asyncio
    async def test_empty_search_results_returns_empty_graph(self):
        """
        When DataFusionService returns no papers, response must be an empty graph.
        Must NOT return HTTP 500.
        """
        with patch("routers.search._create_clients") as mock_clients, \
             patch("routers.search.DataFusionService") as mock_fusion_cls, \
             patch("routers.search.get_db") as mock_get_db:

            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            oa_client, s2_client = AsyncMock(), AsyncMock()
            oa_client.close = AsyncMock()
            s2_client.close = AsyncMock()
            mock_clients.return_value = (oa_client, s2_client)

            mock_fusion = AsyncMock()
            mock_fusion.search = AsyncMock(return_value=[])
            mock_fusion_cls.return_value = mock_fusion

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/search",
                    json={"query": "xyzzy_impossible_12345", "limit": 10},
                )

        assert resp.status_code == 200
        data = resp.json()
        assert data["nodes"] == []
        assert data["edges"] == []
        assert data["clusters"] == []
        assert data["meta"]["total"] == 0
