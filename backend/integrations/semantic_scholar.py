"""
Semantic Scholar API Integration for ScholarGraph3D.

Provides:
- Paper search and metadata retrieval
- Citation graph queries (references and citations)
- SPECTER2 embeddings (batch API)
- Paper recommendations
- Rate limiting and retry logic
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)


class SemanticScholarRateLimitError(Exception):
    """Raised when Semantic Scholar keeps returning 429 after retries."""

    def __init__(self, retry_after: int = 60):
        self.retry_after = retry_after
        super().__init__(f"Semantic Scholar rate limit exceeded (retry_after={retry_after}s)")


@dataclass
class SemanticScholarPaper:
    """Semantic Scholar paper data model."""

    paper_id: str
    title: str
    abstract: Optional[str] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    citation_count: int = 0
    influential_citation_count: int = 0
    reference_count: int = 0
    is_open_access: bool = False
    open_access_pdf_url: Optional[str] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    authors: List[Dict[str, Any]] = field(default_factory=list)
    fields_of_study: List[str] = field(default_factory=list)
    publication_types: List[str] = field(default_factory=list)
    embedding: Optional[List[float]] = None
    tldr: Optional[str] = None
    external_ids: Dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: Dict[str, Any]) -> "SemanticScholarPaper":
        """Create paper from API response."""
        open_access = data.get("openAccessPdf") or {}
        external_ids = data.get("externalIds") or {}

        return cls(
            paper_id=data.get("paperId", ""),
            title=data.get("title", ""),
            abstract=data.get("abstract"),
            year=data.get("year"),
            venue=data.get("venue"),
            citation_count=data.get("citationCount", 0),
            influential_citation_count=data.get("influentialCitationCount", 0),
            reference_count=data.get("referenceCount", 0),
            is_open_access=bool(open_access.get("url")),
            open_access_pdf_url=open_access.get("url"),
            doi=external_ids.get("DOI"),
            arxiv_id=external_ids.get("ArXiv"),
            authors=[
                {
                    "author_id": a.get("authorId"),
                    "name": a.get("name"),
                    "affiliations": a.get("affiliations", []),
                }
                for a in data.get("authors", [])
            ],
            fields_of_study=data.get("fieldsOfStudy") or [],
            publication_types=data.get("publicationTypes") or [],
            embedding=data.get("embedding", {}).get("vector") if data.get("embedding") else None,
            tldr=data.get("tldr", {}).get("text") if data.get("tldr") else None,
            external_ids=external_ids,
        )


class SemanticScholarClient:
    """
    Semantic Scholar API client with rate limiting and retry logic.

    Rate limits:
    - Authenticated (with API key): 1 request/second
    - Unauthenticated: 100 requests per 5 minutes
    """

    BASE_URL = "https://api.semanticscholar.org/graph/v1"
    RECOMMENDATIONS_URL = "https://api.semanticscholar.org/recommendations/v1"

    PAPER_FIELDS = [
        "paperId", "title", "abstract", "year", "venue",
        "citationCount", "influentialCitationCount", "referenceCount",
        "openAccessPdf", "externalIds", "authors", "fieldsOfStudy",
        "publicationTypes", "tldr",
    ]

    PAPER_FIELDS_WITH_EMBEDDING = PAPER_FIELDS + ["embedding"]

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
        requests_per_second: float = 1.0,
    ):
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self.requests_per_second = requests_per_second

        # Rate limiting state
        self._last_request_time: float = 0.0
        self._lock = asyncio.Lock()

        headers = {"Accept": "application/json"}
        if api_key:
            headers["x-api-key"] = api_key

        self._client = httpx.AsyncClient(timeout=timeout, headers=headers)

    async def close(self):
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def _rate_limit(self):
        """Enforce per-second rate limiting."""
        async with self._lock:
            now = datetime.now().timestamp()
            min_interval = 1.0 / self.requests_per_second
            elapsed = now - self._last_request_time

            if elapsed < min_interval:
                sleep_time = min_interval - elapsed
                await asyncio.sleep(sleep_time)

            self._last_request_time = datetime.now().timestamp()

    async def _request(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        """Make an API request with retry logic."""
        await self._rate_limit()

        last_retry_after = 60
        for attempt in range(self.max_retries):
            try:
                response = await self._client.request(method, url, **kwargs)

                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    last_retry_after = retry_after
                    # Cap sleep to 5s to avoid Render 30s request timeout
                    if retry_after > 5 or attempt == self.max_retries - 1:
                        raise SemanticScholarRateLimitError(retry_after=retry_after)
                    logger.warning(f"S2 rate limited, waiting {retry_after}s")
                    await asyncio.sleep(min(retry_after, 5))
                    continue

                response.raise_for_status()
                return response.json()

            except SemanticScholarRateLimitError:
                raise
            except httpx.HTTPStatusError as e:
                # Don't retry 4xx client errors (except 429 handled above)
                if e.response.status_code < 500:
                    logger.debug(f"S2 client error {e.response.status_code} for {url}, not retrying")
                    raise
                if attempt == self.max_retries - 1:
                    logger.error(f"S2 HTTP error after {self.max_retries} attempts: {e}")
                    raise
                await asyncio.sleep(2 ** attempt)
            except httpx.RequestError as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"S2 request error after {self.max_retries} attempts: {e}")
                    raise
                await asyncio.sleep(2 ** attempt)

        raise SemanticScholarRateLimitError(retry_after=last_retry_after)

    # ==================== Paper Search ====================

    async def search_papers(
        self,
        query: str,
        limit: int = 100,
        offset: int = 0,
        year_range: Optional[tuple] = None,
        fields_of_study: Optional[List[str]] = None,
        include_embedding: bool = False,
    ) -> List[SemanticScholarPaper]:
        """Search for papers by query string."""
        fields = self.PAPER_FIELDS_WITH_EMBEDDING if include_embedding else self.PAPER_FIELDS

        params = {
            "query": query,
            "limit": min(limit, 100),
            "offset": offset,
            "fields": ",".join(fields),
        }

        if year_range:
            params["year"] = f"{year_range[0]}-{year_range[1]}"

        if fields_of_study:
            params["fieldsOfStudy"] = ",".join(fields_of_study)

        url = f"{self.BASE_URL}/paper/search"
        data = await self._request("GET", url, params=params)

        papers = []
        for item in data.get("data", []):
            try:
                papers.append(SemanticScholarPaper.from_api_response(item))
            except Exception as e:
                logger.warning(f"Failed to parse S2 paper: {e}")

        return papers

    # ==================== Paper Details ====================

    async def get_paper(
        self,
        paper_id: str,
        include_embedding: bool = False,
    ) -> Optional[SemanticScholarPaper]:
        """Get detailed information about a paper."""
        fields = self.PAPER_FIELDS_WITH_EMBEDDING if include_embedding else self.PAPER_FIELDS
        encoded_id = quote_plus(paper_id)
        url = f"{self.BASE_URL}/paper/{encoded_id}"

        try:
            data = await self._request("GET", url, params={"fields": ",".join(fields)})
            return SemanticScholarPaper.from_api_response(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_papers_batch(
        self,
        paper_ids: List[str],
        include_embedding: bool = False,
    ) -> List[SemanticScholarPaper]:
        """Get multiple papers in a single request (max 500 per batch)."""
        if not paper_ids:
            return []

        fields = self.PAPER_FIELDS_WITH_EMBEDDING if include_embedding else self.PAPER_FIELDS

        all_papers = []
        for i in range(0, len(paper_ids), 500):
            batch = paper_ids[i:i + 500]
            url = f"{self.BASE_URL}/paper/batch"
            data = await self._request(
                "POST", url,
                params={"fields": ",".join(fields)},
                json={"ids": batch},
            )

            for item in data:
                if item:
                    try:
                        all_papers.append(SemanticScholarPaper.from_api_response(item))
                    except Exception as e:
                        logger.warning(f"Failed to parse S2 batch paper: {e}")

        return all_papers

    # ==================== Embeddings ====================

    async def get_specter2_embeddings(
        self,
        paper_ids: List[str],
    ) -> List[SemanticScholarPaper]:
        """
        Get SPECTER2 embeddings for papers (max 16 per batch via embedding field).

        For larger batches, use get_papers_batch with include_embedding=True (500/batch).
        """
        if not paper_ids:
            return []

        all_papers = []
        # Embedding field via batch endpoint supports 500/batch
        for i in range(0, len(paper_ids), 500):
            batch = paper_ids[i:i + 500]
            papers = await self.get_papers_batch(batch, include_embedding=True)
            all_papers.extend(papers)

        return all_papers

    # ==================== Citation Graph ====================

    async def get_references(
        self,
        paper_id: str,
        limit: int = 100,
        include_embedding: bool = False,
    ) -> List[SemanticScholarPaper]:
        """Get papers that this paper references."""
        fields = self.PAPER_FIELDS_WITH_EMBEDDING if include_embedding else self.PAPER_FIELDS
        encoded_id = quote_plus(paper_id)
        url = f"{self.BASE_URL}/paper/{encoded_id}/references"

        data = await self._request(
            "GET", url,
            params={
                "fields": ",".join([f"citedPaper.{f}" for f in fields]),
                "limit": min(limit, 1000),
            }
        )

        papers = []
        for item in data.get("data", []):
            cited_paper = item.get("citedPaper")
            if cited_paper and cited_paper.get("paperId"):
                try:
                    papers.append(SemanticScholarPaper.from_api_response(cited_paper))
                except Exception as e:
                    logger.warning(f"Failed to parse S2 reference: {e}")

        return papers

    async def get_citations(
        self,
        paper_id: str,
        limit: int = 100,
        include_embedding: bool = False,
    ) -> List[SemanticScholarPaper]:
        """Get papers that cite this paper."""
        fields = self.PAPER_FIELDS_WITH_EMBEDDING if include_embedding else self.PAPER_FIELDS
        encoded_id = quote_plus(paper_id)
        url = f"{self.BASE_URL}/paper/{encoded_id}/citations"

        data = await self._request(
            "GET", url,
            params={
                "fields": ",".join([f"citingPaper.{f}" for f in fields]),
                "limit": min(limit, 1000),
            }
        )

        papers = []
        for item in data.get("data", []):
            citing_paper = item.get("citingPaper")
            if citing_paper and citing_paper.get("paperId"):
                try:
                    papers.append(SemanticScholarPaper.from_api_response(citing_paper))
                except Exception as e:
                    logger.warning(f"Failed to parse S2 citation: {e}")

        return papers

    # ==================== Recommendations ====================

    async def get_recommendations(
        self,
        paper_ids: List[str],
        limit: int = 100,
    ) -> List[SemanticScholarPaper]:
        """Get paper recommendations based on a list of seed papers."""
        url = f"{self.RECOMMENDATIONS_URL}/papers"

        data = await self._request(
            "POST", url,
            params={"fields": ",".join(self.PAPER_FIELDS), "limit": min(limit, 500)},
            json={"positivePaperIds": paper_ids[:500]},
        )

        return [
            SemanticScholarPaper.from_api_response(item)
            for item in data.get("recommendedPapers", [])
        ]
