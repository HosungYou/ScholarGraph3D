"""
Tests for the POST /api/papers/{id}/expand-stable endpoint in routers/papers.py.

v1.1.0 TDD: Tests for ExpandMeta, timeout handling, and partial failure resilience.

Run: pytest tests/test_routers/test_papers.py -v
"""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch


# ==================== Helpers ====================

def make_s2_paper(
    paper_id: str = "abc123",
    title: str = "Test Paper",
    year: int = 2023,
    citation_count: int = 10,
    doi: str = "10.1234/test",
    fields_of_study: list = None,
    embedding: list = None,
) -> MagicMock:
    """Create a mock SemanticScholarPaper for test use."""
    paper = MagicMock()
    paper.paper_id = paper_id
    paper.title = title
    paper.year = year
    paper.citation_count = citation_count
    paper.doi = doi
    paper.venue = "Test Venue"
    paper.is_open_access = False
    paper.authors = [{"name": "Test Author"}]
    paper.abstract = "Test abstract"
    paper.tldr = "Test TLDR"
    paper.fields_of_study = fields_of_study or ["Computer Science"]
    paper.embedding = embedding or [0.01 * i for i in range(768)]
    return paper


# ==================== POST /api/papers/{id}/expand-stable Tests ====================

class TestExpandStable:
    """Integration tests for POST /api/papers/{id}/expand-stable."""

    @pytest.mark.asyncio
    async def test_expand_stable_returns_200_with_nodes_and_edges(self):
        """
        A valid expand-stable request must return 200 with nodes, edges, total, and meta.
        """
        refs = [make_s2_paper(paper_id=f"ref_{i}", title=f"Reference {i}") for i in range(3)]
        cites = [make_s2_paper(paper_id=f"cite_{i}", title=f"Citation {i}") for i in range(2)]

        mock_client = AsyncMock()
        mock_client.get_references = AsyncMock(return_value=refs)
        mock_client.get_citations = AsyncMock(return_value=cites)

        with patch("routers.papers._create_s2_client", return_value=mock_client), \
             patch("routers.papers.get_db") as mock_get_db:
            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/papers/test_paper_id/expand-stable",
                    json={"existing_nodes": [], "limit": 20},
                )

        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data
        assert "edges" in data
        assert "total" in data
        assert "meta" in data
        assert data["total"] == 5  # 3 refs + 2 cites

    @pytest.mark.asyncio
    async def test_expand_stable_meta_all_ok(self):
        """
        When both refs and cites succeed, meta should report both ok.
        """
        refs = [make_s2_paper(paper_id="ref_1")]
        cites = [make_s2_paper(paper_id="cite_1")]

        mock_client = AsyncMock()
        mock_client.get_references = AsyncMock(return_value=refs)
        mock_client.get_citations = AsyncMock(return_value=cites)

        with patch("routers.papers._create_s2_client", return_value=mock_client), \
             patch("routers.papers.get_db") as mock_get_db:
            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/papers/test_id/expand-stable",
                    json={"existing_nodes": [], "limit": 20},
                )

        data = resp.json()
        meta = data["meta"]
        assert meta["references_ok"] is True
        assert meta["citations_ok"] is True
        assert meta["refs_count"] == 1
        assert meta["cites_count"] == 1
        assert meta["error_detail"] is None

    @pytest.mark.asyncio
    async def test_expand_stable_meta_refs_fail(self):
        """
        When references fetch fails, meta.references_ok=false and error_detail is set.
        Citations should still be returned.
        """
        cites = [make_s2_paper(paper_id="cite_1"), make_s2_paper(paper_id="cite_2")]

        mock_client = AsyncMock()
        mock_client.get_references = AsyncMock(side_effect=Exception("Timeout fetching references"))
        mock_client.get_citations = AsyncMock(return_value=cites)

        with patch("routers.papers._create_s2_client", return_value=mock_client), \
             patch("routers.papers.get_db") as mock_get_db:
            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/papers/test_id/expand-stable",
                    json={"existing_nodes": [], "limit": 20},
                )

        assert resp.status_code == 200  # Partial success, not 500
        data = resp.json()
        meta = data["meta"]
        assert meta["references_ok"] is False
        assert meta["citations_ok"] is True
        assert meta["refs_count"] == 0
        assert meta["cites_count"] == 2
        assert meta["error_detail"] is not None
        assert data["total"] == 2  # Only cites returned

    @pytest.mark.asyncio
    async def test_expand_stable_meta_cites_fail(self):
        """
        When citations fetch fails, meta.citations_ok=false and error_detail is set.
        References should still be returned.
        """
        refs = [make_s2_paper(paper_id="ref_1")]

        mock_client = AsyncMock()
        mock_client.get_references = AsyncMock(return_value=refs)
        mock_client.get_citations = AsyncMock(side_effect=Exception("Citations fetch failed"))

        with patch("routers.papers._create_s2_client", return_value=mock_client), \
             patch("routers.papers.get_db") as mock_get_db:
            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/papers/test_id/expand-stable",
                    json={"existing_nodes": [], "limit": 20},
                )

        assert resp.status_code == 200
        data = resp.json()
        meta = data["meta"]
        assert meta["references_ok"] is True
        assert meta["citations_ok"] is False
        assert meta["refs_count"] == 1
        assert meta["cites_count"] == 0
        assert "Citations fetch failed" in meta["error_detail"]

    @pytest.mark.asyncio
    async def test_expand_stable_meta_both_fail(self):
        """
        When both refs and cites fail, returns 200 with empty nodes and meta reporting both failures.
        """
        mock_client = AsyncMock()
        mock_client.get_references = AsyncMock(side_effect=Exception("refs timeout"))
        mock_client.get_citations = AsyncMock(side_effect=Exception("cites timeout"))

        with patch("routers.papers._create_s2_client", return_value=mock_client), \
             patch("routers.papers.get_db") as mock_get_db:
            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/papers/test_id/expand-stable",
                    json={"existing_nodes": [], "limit": 20},
                )

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["nodes"] == []
        meta = data["meta"]
        assert meta["references_ok"] is False
        assert meta["citations_ok"] is False
        assert meta["error_detail"] is not None

    @pytest.mark.asyncio
    async def test_expand_stable_timeout_classified_in_meta(self):
        """
        When an exception with 'timeout' in the message occurs,
        the error_detail should contain 'timed out'.
        """
        mock_client = AsyncMock()
        mock_client.get_references = AsyncMock(side_effect=Exception("TimeoutException: connection timed out"))
        mock_client.get_citations = AsyncMock(return_value=[make_s2_paper(paper_id="c1")])

        with patch("routers.papers._create_s2_client", return_value=mock_client), \
             patch("routers.papers.get_db") as mock_get_db:
            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/papers/test_id/expand-stable",
                    json={"existing_nodes": [], "limit": 20},
                )

        data = resp.json()
        meta = data["meta"]
        assert meta["references_ok"] is False
        assert "timed out" in meta["error_detail"].lower()

    @pytest.mark.asyncio
    async def test_expand_stable_edges_connect_to_parent(self):
        """
        Edges should connect the expanded paper_id to new nodes.
        """
        refs = [make_s2_paper(paper_id="ref_1")]

        mock_client = AsyncMock()
        mock_client.get_references = AsyncMock(return_value=refs)
        mock_client.get_citations = AsyncMock(return_value=[])

        with patch("routers.papers._create_s2_client", return_value=mock_client), \
             patch("routers.papers.get_db") as mock_get_db:
            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/papers/parent_paper/expand-stable",
                    json={"existing_nodes": [], "limit": 20},
                )

        data = resp.json()
        assert len(data["edges"]) > 0
        edge = data["edges"][0]
        assert edge["source"] == "parent_paper"
        assert edge["target"] == "ref_1"
        assert edge["type"] == "citation"

    @pytest.mark.asyncio
    async def test_expand_stable_node_has_required_fields(self):
        """
        Each node must have paper_id, title, initial_x, initial_y, initial_z.
        """
        refs = [make_s2_paper(paper_id="ref_1", title="My Reference")]

        mock_client = AsyncMock()
        mock_client.get_references = AsyncMock(return_value=refs)
        mock_client.get_citations = AsyncMock(return_value=[])

        with patch("routers.papers._create_s2_client", return_value=mock_client), \
             patch("routers.papers.get_db") as mock_get_db:
            mock_db = AsyncMock()
            mock_db.is_connected = False
            mock_get_db.return_value = mock_db

            from main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/papers/test_id/expand-stable",
                    json={"existing_nodes": [], "limit": 20},
                )

        data = resp.json()
        assert len(data["nodes"]) == 1
        node = data["nodes"][0]
        assert node["paper_id"] == "ref_1"
        assert node["title"] == "My Reference"
        assert "initial_x" in node
        assert "initial_y" in node
        assert "initial_z" in node
        assert "authors" in node
        assert "fields" in node


# ==================== Pydantic Model Unit Tests ====================

class TestExpandMeta:
    """Unit tests for the ExpandMeta Pydantic model."""

    def test_expand_meta_defaults(self):
        """ExpandMeta should have sensible defaults (all ok, zero counts)."""
        from routers.papers import ExpandMeta
        meta = ExpandMeta()
        assert meta.references_ok is True
        assert meta.citations_ok is True
        assert meta.refs_count == 0
        assert meta.cites_count == 0
        assert meta.error_detail is None

    def test_expand_meta_with_error(self):
        """ExpandMeta should accept error state."""
        from routers.papers import ExpandMeta
        meta = ExpandMeta(
            references_ok=False,
            citations_ok=True,
            refs_count=0,
            cites_count=5,
            error_detail="References fetch timed out",
        )
        assert meta.references_ok is False
        assert meta.cites_count == 5
        assert "timed out" in meta.error_detail

    def test_expand_meta_serialization(self):
        """ExpandMeta should serialize to dict correctly."""
        from routers.papers import ExpandMeta
        meta = ExpandMeta(refs_count=3, cites_count=7)
        d = meta.model_dump()
        assert d["refs_count"] == 3
        assert d["cites_count"] == 7
        assert d["references_ok"] is True

    def test_stable_expand_response_includes_meta(self):
        """StableExpandResponse should include optional meta field."""
        from routers.papers import StableExpandResponse, ExpandMeta
        meta = ExpandMeta(refs_count=2, cites_count=3)
        resp = StableExpandResponse(nodes=[], edges=[], total=0, meta=meta)
        assert resp.meta is not None
        assert resp.meta.refs_count == 2

    def test_stable_expand_response_meta_optional(self):
        """StableExpandResponse should work without meta (backwards compat)."""
        from routers.papers import StableExpandResponse
        resp = StableExpandResponse(nodes=[], edges=[], total=0)
        assert resp.meta is None
