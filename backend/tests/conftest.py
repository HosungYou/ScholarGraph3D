"""
Pytest configuration and shared fixtures for ScholarGraph3D backend tests.

Provides:
- event_loop: session-scoped asyncio loop
- mock_db: AsyncMock database (asyncpg-compatible)
- mock_s2_client: AsyncMock SemanticScholarClient
- mock_oa_client: AsyncMock OpenAlexClient
- sample_s2_paper / sample_oa_work: realistic fixture objects
- sample_embeddings: (10, 768) numpy array
- test_client: httpx AsyncClient with ASGITransport
"""

import asyncio

import numpy as np
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock


# ==================== Event Loop ====================

@pytest.fixture(scope="session")
def event_loop():
    """Provide a shared asyncio event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ==================== Database Mock ====================

@pytest.fixture
def mock_db():
    """
    AsyncMock database connection.

    Mimics the asyncpg-based Database class from database.py.
    is_connected=True by default so cache logic runs.
    Set fetchrow.return_value = None to simulate cache miss.
    Set fetchrow.return_value = {...} to simulate cache hit.
    """
    db = AsyncMock()
    db.is_connected = True
    db.fetch = AsyncMock(return_value=[])
    db.fetchrow = AsyncMock(return_value=None)  # default: cache miss
    db.fetchval = AsyncMock(return_value=None)
    db.execute = AsyncMock(return_value="OK")
    db.check_pgvector = AsyncMock(return_value=True)
    db.get_health_snapshot = AsyncMock(return_value={"db_ok": True, "pgvector_ok": True})
    return db


@pytest.fixture
def mock_db_disconnected():
    """AsyncMock database that is not connected (simulates no DB in dev)."""
    db = AsyncMock()
    db.is_connected = False
    db.fetch = AsyncMock(return_value=[])
    db.fetchrow = AsyncMock(return_value=None)
    db.fetchval = AsyncMock(return_value=None)
    db.execute = AsyncMock(return_value="OK")
    return db


# ==================== API Client Mocks ====================

@pytest.fixture
def mock_s2_client():
    """
    AsyncMock SemanticScholarClient.

    Default returns empty lists so tests can override selectively.
    Attributes match SemanticScholarClient public interface.
    """
    client = AsyncMock()
    client.search_papers = AsyncMock(return_value=[])
    client.get_paper = AsyncMock(return_value=None)
    client.get_references = AsyncMock(return_value=[])
    client.get_citations = AsyncMock(return_value=[])
    client.get_specter2_embeddings = AsyncMock(return_value=[])
    client.get_papers_batch = AsyncMock(return_value=[])
    client.close = AsyncMock()
    # credit_tracker not needed on S2 client (it's on OA)
    return client


@pytest.fixture
def mock_oa_client():
    """
    AsyncMock OpenAlexClient.

    Default returns empty list. Tests override search_works.return_value.
    credit_tracker is a MagicMock so can_spend/track don't block.
    """
    client = AsyncMock()
    client.search_works = AsyncMock(return_value=[])
    client.get_work = AsyncMock(return_value=None)
    client.get_works_batch = AsyncMock(return_value=[])
    client.get_references = AsyncMock(return_value=[])
    client.get_citations = AsyncMock(return_value=[])
    client.close = AsyncMock()

    # credit_tracker: make can_spend always return True
    credit_tracker = AsyncMock()
    credit_tracker.can_spend = AsyncMock(return_value=True)
    credit_tracker.track = AsyncMock()
    credit_tracker.usage_percent = 0.0
    client.credit_tracker = credit_tracker
    return client


# ==================== Sample Data Factories ====================

def _make_oa_work(
    doi: str = "10.1234/test.001",
    title: str = "Attention Is All You Need",
    abstract: str = "We propose a new simple network architecture, the Transformer.",
    year: int = 2017,
    citation_count: int = 50000,
    is_open_access: bool = True,
    oa_work_id: str = "W2741809807",
    concepts: list = None,
    topics: list = None,
    authors: list = None,
) -> MagicMock:
    """
    Factory for OpenAlexWork-like mock objects.

    Returns a MagicMock with all attributes that _oa_work_to_unified() accesses.
    """
    work = MagicMock()
    work.id = oa_work_id
    work.doi = doi
    work.title = title
    work.abstract = abstract
    work.publication_year = year
    work.citation_count = citation_count
    work.is_open_access = is_open_access
    work.open_access_url = f"https://arxiv.org/abs/1706.03762" if is_open_access else None
    work.concepts = concepts if concepts is not None else [
        {"id": "C41008148", "display_name": "Computer Science", "level": 0, "score": 0.9},
        {"id": "C119857082", "display_name": "Machine Learning", "level": 1, "score": 0.85},
    ]
    work.topics = topics if topics is not None else [
        {
            "id": "T10084",
            "display_name": "Attention Mechanism in Neural Networks",
            "score": 0.99,
            "subfield": "Natural Language Processing",
            "field": "Computer Science",
            "domain": "Physical Sciences",
        },
        {
            "id": "T10211",
            "display_name": "Transformer Models",
            "score": 0.95,
            "subfield": "Machine Learning",
            "field": "Computer Science",
            "domain": "Physical Sciences",
        },
    ]
    work.authors = authors if authors is not None else [
        {
            "id": "A2181803848",
            "display_name": "Ashish Vaswani",
            "orcid": None,
            "author_position": "first",
            "institutions": [{"id": "I1315976615", "display_name": "Google Brain"}],
        },
    ]
    work.primary_location = {
        "source": {
            "id": "S4306401557",
            "display_name": "Neural Information Processing Systems",
            "issn_l": None,
        }
    }
    return work


def _make_s2_paper(
    paper_id: str = "204e3073870fae3d05bcbc2f6a8e263d9b72e776",
    doi: str = "10.1234/test.001",
    title: str = "Attention Is All You Need",
    abstract: str = "We propose a new simple network architecture, the Transformer.",
    year: int = 2017,
    citation_count: int = 50000,
    tldr: str = "A new architecture based entirely on attention mechanisms.",
    embedding: list = None,
    fields_of_study: list = None,
    authors: list = None,
    is_open_access: bool = True,
) -> MagicMock:
    """
    Factory for SemanticScholarPaper-like mock objects.

    Returns a MagicMock with all attributes that _s2_paper_to_unified() accesses.
    """
    paper = MagicMock()
    paper.paper_id = paper_id
    paper.doi = doi
    paper.title = title
    paper.abstract = abstract
    paper.year = year
    paper.citation_count = citation_count
    paper.tldr = tldr
    paper.embedding = embedding if embedding is not None else [0.01 * i for i in range(768)]
    paper.fields_of_study = fields_of_study if fields_of_study is not None else [
        "Computer Science",
        "Mathematics",
    ]
    paper.authors = authors if authors is not None else [
        {"author_id": "1741101", "name": "Ashish Vaswani", "affiliations": ["Google Brain"]},
    ]
    paper.venue = "Neural Information Processing Systems"
    paper.is_open_access = is_open_access
    paper.open_access_pdf_url = "https://arxiv.org/pdf/1706.03762" if is_open_access else None
    paper.influential_citation_count = 5000
    paper.reference_count = 40
    paper.arxiv_id = "1706.03762"
    paper.publication_types = ["JournalArticle"]
    return paper


@pytest.fixture
def sample_oa_work() -> MagicMock:
    """Single OpenAlex work fixture with realistic data."""
    return _make_oa_work()


@pytest.fixture
def sample_s2_paper() -> MagicMock:
    """Single Semantic Scholar paper fixture with realistic data."""
    return _make_s2_paper()


@pytest.fixture
def sample_embeddings() -> np.ndarray:
    """
    (10, 768) numpy array of random embeddings.

    Seeded for reproducibility. Matches SPECTER2 embedding dimension.
    """
    return np.random.default_rng(42).normal(0, 1, (10, 768)).astype(np.float32)


# ==================== FastAPI Test Client ====================

@pytest_asyncio.fixture
async def test_client():
    """
    httpx AsyncClient wired to the FastAPI ASGI app.

    Uses ASGITransport so no real HTTP server is started.
    External API calls and DB must be mocked in individual tests
    via unittest.mock.patch on the relevant module paths.
    """
    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
