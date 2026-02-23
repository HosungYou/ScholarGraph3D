"""
Tests for POST /api/paper-search in routers/paper_search.py.

Covers:
- test_search_papers_success: mock S2 client returns papers, verify response shape
- test_search_papers_empty_query: min_length=1 constraint returns 422
- test_search_papers_s2_error: generic exception from S2 returns 502
- test_search_papers_rate_limit: SemanticScholarRateLimitError returns 429
- test_search_papers_abstract_snippet: long abstract is truncated to 200 chars + ellipsis
- test_search_papers_tldr_fallback: uses tldr when abstract is None

Run: pytest tests/test_routers/test_paper_search.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from integrations.semantic_scholar import SemanticScholarRateLimitError


# ==================== Helpers ====================

def _make_s2_result(
    paper_id: str = "abc123",
    title: str = "Test Paper on Transformers",
    abstract: str = "We propose a novel architecture.",
    tldr: str = None,
    year: int = 2022,
    citation_count: int = 100,
    authors: list = None,
    fields_of_study: list = None,
    doi: str = "10.1234/test.001",
    venue: str = "NeurIPS",
) -> MagicMock:
    """Create a minimal SemanticScholarPaper-like mock for paper_search tests."""
    paper = MagicMock()
    paper.paper_id = paper_id
    paper.title = title
    paper.abstract = abstract
    paper.tldr = tldr
    paper.year = year
    paper.citation_count = citation_count
    paper.authors = authors if authors is not None else [
        {"name": "Alice Smith"},
        {"name": "Bob Jones"},
    ]
    paper.fields_of_study = fields_of_study if fields_of_study is not None else ["Computer Science"]
    paper.doi = doi
    paper.venue = venue
    return paper


# ==================== Tests ====================

@pytest.mark.asyncio
async def test_search_papers_success(test_client):
    """Happy path: S2 returns 2 papers → response has correct shape."""
    papers = [
        _make_s2_result(paper_id="p1", title="Paper One", citation_count=500),
        _make_s2_result(paper_id="p2", title="Paper Two", citation_count=200),
    ]

    mock_s2 = AsyncMock()
    mock_s2.search_papers = AsyncMock(return_value=papers)

    with patch("routers.paper_search.get_s2_client", return_value=mock_s2):
        response = await test_client.post(
            "/api/paper-search",
            json={"query": "transformer neural networks", "limit": 10},
        )

    assert response.status_code == 200
    data = response.json()

    assert "papers" in data
    assert len(data["papers"]) == 2

    first = data["papers"][0]
    assert first["paper_id"] == "p1"
    assert first["title"] == "Paper One"
    assert "authors" in first
    assert isinstance(first["authors"], list)
    assert first["citation_count"] == 500
    assert "abstract_snippet" in first
    assert "fields" in first
    assert isinstance(first["fields"], list)

    # refined_query is optional, should be None or absent
    assert data.get("refined_query") is None


@pytest.mark.asyncio
async def test_search_papers_empty_query(test_client):
    """Empty string query violates min_length=1 → 422 Unprocessable Entity."""
    response = await test_client.post(
        "/api/paper-search",
        json={"query": "", "limit": 10},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_search_papers_missing_query(test_client):
    """Missing query field → 422 Unprocessable Entity."""
    response = await test_client.post(
        "/api/paper-search",
        json={"limit": 5},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_search_papers_s2_error(test_client):
    """Generic exception from S2 client → 502 Bad Gateway."""
    mock_s2 = AsyncMock()
    mock_s2.search_papers = AsyncMock(side_effect=RuntimeError("S2 connection failed"))

    with patch("routers.paper_search.get_s2_client", return_value=mock_s2):
        response = await test_client.post(
            "/api/paper-search",
            json={"query": "deep learning", "limit": 5},
        )

    assert response.status_code == 502
    assert "unavailable" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_search_papers_rate_limit(test_client):
    """SemanticScholarRateLimitError → 429 Too Many Requests with Retry-After header."""
    mock_s2 = AsyncMock()
    mock_s2.search_papers = AsyncMock(
        side_effect=SemanticScholarRateLimitError(retry_after=30)
    )

    with patch("routers.paper_search.get_s2_client", return_value=mock_s2):
        response = await test_client.post(
            "/api/paper-search",
            json={"query": "machine learning", "limit": 5},
        )

    assert response.status_code == 429
    assert "Retry-After" in response.headers
    assert response.headers["Retry-After"] == "30"


@pytest.mark.asyncio
async def test_search_papers_abstract_snippet_truncated(test_client):
    """Abstract longer than 200 chars is truncated with ellipsis in abstract_snippet."""
    long_abstract = "A" * 300  # 300 chars, well over 200

    papers = [_make_s2_result(paper_id="p1", abstract=long_abstract)]
    mock_s2 = AsyncMock()
    mock_s2.search_papers = AsyncMock(return_value=papers)

    with patch("routers.paper_search.get_s2_client", return_value=mock_s2):
        response = await test_client.post(
            "/api/paper-search",
            json={"query": "attention mechanism"},
        )

    assert response.status_code == 200
    snippet = response.json()["papers"][0]["abstract_snippet"]
    assert snippet is not None
    assert snippet.endswith("...")
    # Snippet body (before "...") should be exactly 200 chars
    assert len(snippet) == 203  # 200 + len("...")


@pytest.mark.asyncio
async def test_search_papers_tldr_fallback(test_client):
    """When abstract is None, tldr is used as abstract_snippet."""
    papers = [
        _make_s2_result(
            paper_id="p1",
            abstract=None,
            tldr="Short TLDR summary of the paper.",
        )
    ]
    mock_s2 = AsyncMock()
    mock_s2.search_papers = AsyncMock(return_value=papers)

    with patch("routers.paper_search.get_s2_client", return_value=mock_s2):
        response = await test_client.post(
            "/api/paper-search",
            json={"query": "graph neural networks"},
        )

    assert response.status_code == 200
    snippet = response.json()["papers"][0]["abstract_snippet"]
    assert snippet == "Short TLDR summary of the paper."


@pytest.mark.asyncio
async def test_search_papers_no_abstract_no_tldr(test_client):
    """When both abstract and tldr are None, abstract_snippet is None."""
    papers = [_make_s2_result(paper_id="p1", abstract=None, tldr=None)]
    mock_s2 = AsyncMock()
    mock_s2.search_papers = AsyncMock(return_value=papers)

    with patch("routers.paper_search.get_s2_client", return_value=mock_s2):
        response = await test_client.post(
            "/api/paper-search",
            json={"query": "reinforcement learning"},
        )

    assert response.status_code == 200
    assert response.json()["papers"][0]["abstract_snippet"] is None


@pytest.mark.asyncio
async def test_search_papers_empty_results(test_client):
    """S2 returns empty list → response has empty papers array."""
    mock_s2 = AsyncMock()
    mock_s2.search_papers = AsyncMock(return_value=[])

    with patch("routers.paper_search.get_s2_client", return_value=mock_s2):
        response = await test_client.post(
            "/api/paper-search",
            json={"query": "very obscure topic xyz"},
        )

    assert response.status_code == 200
    assert response.json()["papers"] == []


@pytest.mark.asyncio
async def test_search_papers_limit_validation(test_client):
    """Limit of 0 violates ge=1 → 422; limit of 31 violates le=30 → 422."""
    response_zero = await test_client.post(
        "/api/paper-search",
        json={"query": "neural networks", "limit": 0},
    )
    assert response_zero.status_code == 422

    response_over = await test_client.post(
        "/api/paper-search",
        json={"query": "neural networks", "limit": 31},
    )
    assert response_over.status_code == 422


@pytest.mark.asyncio
async def test_search_papers_authors_capped_at_five(test_client):
    """Router caps authors list at 5 entries in the response."""
    many_authors = [{"name": f"Author {i}"} for i in range(10)]
    papers = [_make_s2_result(paper_id="p1", authors=many_authors)]
    mock_s2 = AsyncMock()
    mock_s2.search_papers = AsyncMock(return_value=papers)

    with patch("routers.paper_search.get_s2_client", return_value=mock_s2):
        response = await test_client.post(
            "/api/paper-search",
            json={"query": "collaborative filtering"},
        )

    assert response.status_code == 200
    assert len(response.json()["papers"][0]["authors"]) == 5
