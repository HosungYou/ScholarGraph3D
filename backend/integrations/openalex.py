"""
OpenAlex API Integration for ScholarGraph3D.

OpenAlex is a free, open catalog of the global research system with 250M+ works.
Uses the polite pool (mailto param) for higher rate limits.
Includes credit tracking for premium API key usage (100K credits/day).

API: https://docs.openalex.org/
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


@dataclass
class OpenAlexWork:
    """OpenAlex work (paper/publication) data model."""

    id: str  # OpenAlex ID (e.g., "W2741809807")
    title: str
    abstract: Optional[str] = None
    publication_year: Optional[int] = None
    publication_date: Optional[str] = None
    type: Optional[str] = None
    doi: Optional[str] = None
    open_access_url: Optional[str] = None
    is_open_access: bool = False
    open_access_status: Optional[str] = None
    citation_count: int = 0
    referenced_works_count: int = 0
    authors: List[Dict[str, Any]] = field(default_factory=list)
    concepts: List[Dict[str, Any]] = field(default_factory=list)
    topics: List[Dict[str, Any]] = field(default_factory=list)
    primary_location: Optional[Dict[str, Any]] = None
    biblio: Optional[Dict[str, Any]] = None

    pmid: Optional[str] = None
    pmcid: Optional[str] = None
    mag_id: Optional[str] = None

    @classmethod
    def from_api_response(cls, data: Dict[str, Any]) -> "OpenAlexWork":
        """Create work from API response."""
        ids = data.get("ids", {})
        open_access = data.get("open_access", {})

        abstract = None
        if data.get("abstract_inverted_index"):
            abstract = cls._reconstruct_abstract(data["abstract_inverted_index"])

        authors = []
        for authorship in data.get("authorships", []):
            author_data = authorship.get("author", {})
            institutions = [
                {
                    "id": inst.get("id"),
                    "display_name": inst.get("display_name"),
                    "ror": inst.get("ror"),
                    "country_code": inst.get("country_code"),
                }
                for inst in authorship.get("institutions", [])
            ]
            authors.append({
                "id": author_data.get("id"),
                "display_name": author_data.get("display_name"),
                "orcid": author_data.get("orcid"),
                "author_position": authorship.get("author_position"),
                "institutions": institutions,
            })

        concepts = [
            {
                "id": c.get("id"),
                "display_name": c.get("display_name"),
                "level": c.get("level"),
                "score": c.get("score"),
            }
            for c in data.get("concepts", [])
        ]

        topics = [
            {
                "id": t.get("id"),
                "display_name": t.get("display_name"),
                "score": t.get("score"),
                "subfield": t.get("subfield", {}).get("display_name") if t.get("subfield") else None,
                "field": t.get("field", {}).get("display_name") if t.get("field") else None,
                "domain": t.get("domain", {}).get("display_name") if t.get("domain") else None,
            }
            for t in data.get("topics", [])
        ]

        return cls(
            id=data.get("id", ""),
            title=data.get("title") or data.get("display_name", ""),
            abstract=abstract,
            publication_year=data.get("publication_year"),
            publication_date=data.get("publication_date"),
            type=data.get("type"),
            doi=ids.get("doi") or data.get("doi"),
            open_access_url=open_access.get("oa_url"),
            is_open_access=open_access.get("is_oa", False),
            open_access_status=open_access.get("oa_status"),
            citation_count=data.get("cited_by_count", 0),
            referenced_works_count=data.get("referenced_works_count", 0),
            authors=authors,
            concepts=concepts,
            topics=topics,
            primary_location=data.get("primary_location"),
            biblio=data.get("biblio"),
            pmid=ids.get("pmid"),
            pmcid=ids.get("pmcid"),
            mag_id=ids.get("mag"),
        )

    @staticmethod
    def _reconstruct_abstract(inverted_index: Dict[str, List[int]]) -> str:
        """Reconstruct abstract from inverted index format."""
        if not inverted_index:
            return ""

        max_pos = 0
        for positions in inverted_index.values():
            if positions:
                max_pos = max(max_pos, max(positions))

        words = [""] * (max_pos + 1)
        for word, positions in inverted_index.items():
            for pos in positions:
                words[pos] = word

        return " ".join(words)


class CreditTracker:
    """
    Tracks daily OpenAlex API credit usage.

    Premium API provides 100K credits/day.
    - Search: ~10 credits per page
    - Single entity: ~1 credit
    """

    def __init__(self, daily_limit: int = 100000):
        self.daily_limit = daily_limit
        self._credits_used: int = 0
        self._day_start: float = time.time()
        self._lock = asyncio.Lock()

    async def track(self, credits: int = 1) -> None:
        """Track credit usage."""
        async with self._lock:
            self._maybe_reset_day()
            self._credits_used += credits

            usage_pct = (self._credits_used / self.daily_limit) * 100
            if usage_pct >= 95:
                logger.warning(f"OA credits at {usage_pct:.0f}% ({self._credits_used}/{self.daily_limit}) - cache-first mode")
            elif usage_pct >= 80:
                logger.warning(f"OA credits at {usage_pct:.0f}% ({self._credits_used}/{self.daily_limit})")

    async def can_spend(self, credits: int = 1) -> bool:
        """Check if we can spend credits without exceeding limit."""
        async with self._lock:
            self._maybe_reset_day()
            return (self._credits_used + credits) <= self.daily_limit

    @property
    def usage_percent(self) -> float:
        return (self._credits_used / self.daily_limit) * 100 if self.daily_limit > 0 else 0

    def _maybe_reset_day(self):
        """Reset counter if a new day has started."""
        now = time.time()
        if now - self._day_start >= 86400:  # 24 hours
            self._credits_used = 0
            self._day_start = now


class OpenAlexClient:
    """
    OpenAlex API client with polite pool access and credit tracking.
    """

    BASE_URL = "https://api.openalex.org"

    def __init__(
        self,
        email: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
        daily_credit_limit: int = 100000,
    ):
        self.email = email
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self.credit_tracker = CreditTracker(daily_limit=daily_credit_limit)

        headers = {
            "Accept": "application/json",
            "User-Agent": "ScholarGraph3D/1.0",
        }
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        self._client = httpx.AsyncClient(timeout=timeout, headers=headers)

    async def close(self):
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    def _build_params(self, **kwargs) -> Dict[str, str]:
        """Build query parameters with polite pool email."""
        params = {k: str(v) for k, v in kwargs.items() if v is not None}
        if self.email:
            params["mailto"] = self.email
        return params

    async def _request(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        """Make an API request with retry logic."""
        for attempt in range(self.max_retries):
            try:
                response = await self._client.request(method, url, **kwargs)

                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    logger.warning(f"OA rate limited, waiting {retry_after}s")
                    await asyncio.sleep(retry_after)
                    continue

                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"OA HTTP error after {self.max_retries} attempts: {e}")
                    raise
                await asyncio.sleep(2 ** attempt)

            except httpx.RequestError as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"OA request error after {self.max_retries} attempts: {e}")
                    raise
                await asyncio.sleep(2 ** attempt)

        return {}

    # ==================== Works (Papers) ====================

    async def search_works(
        self,
        query: Optional[str] = None,
        filter_params: Optional[Dict[str, str]] = None,
        sort: str = "relevance_score:desc",
        per_page: int = 100,
        page: int = 1,
    ) -> List[OpenAlexWork]:
        """
        Search for works (papers).

        Credits: ~10 per page of results.
        """
        # Credit check: ~10 credits per page
        credits_needed = 10
        if not await self.credit_tracker.can_spend(credits_needed):
            logger.warning("OA daily credit limit reached, skipping search")
            return []

        params = self._build_params(
            sort=sort,
            per_page=min(per_page, 200),
            page=page,
        )

        if query:
            params["search"] = query

        if filter_params:
            filter_str = ",".join([f"{k}:{v}" for k, v in filter_params.items()])
            params["filter"] = filter_str

        url = f"{self.BASE_URL}/works"
        data = await self._request("GET", url, params=params)

        await self.credit_tracker.track(credits_needed)

        return [
            OpenAlexWork.from_api_response(item)
            for item in data.get("results", [])
        ]

    async def get_work(self, work_id: str) -> Optional[OpenAlexWork]:
        """Get a specific work by ID, DOI, etc."""
        if work_id.startswith("W"):
            url = f"{self.BASE_URL}/works/{work_id}"
        elif work_id.startswith("https://doi.org/"):
            url = f"{self.BASE_URL}/works/{work_id}"
        elif work_id.startswith("10."):
            url = f"{self.BASE_URL}/works/https://doi.org/{work_id}"
        else:
            url = f"{self.BASE_URL}/works/{work_id}"

        params = self._build_params()

        try:
            data = await self._request("GET", url, params=params)
            await self.credit_tracker.track(1)
            return OpenAlexWork.from_api_response(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_works_batch(self, work_ids: List[str]) -> List[OpenAlexWork]:
        """Get multiple works by IDs using filter."""
        if not work_ids:
            return []

        all_works = []
        for i in range(0, len(work_ids), 50):
            batch = work_ids[i:i + 50]
            ids_filter = "|".join(batch)

            works = await self.search_works(
                filter_params={"ids.openalex": ids_filter},
                per_page=len(batch),
            )
            all_works.extend(works)

        return all_works

    async def get_references(self, work_id: str, limit: int = 100) -> List[OpenAlexWork]:
        """Get works referenced by this work."""
        return await self.search_works(
            filter_params={"cited_by": work_id},
            per_page=min(limit, 200),
        )

    async def get_citations(self, work_id: str, limit: int = 100) -> List[OpenAlexWork]:
        """Get works that cite this work."""
        return await self.search_works(
            filter_params={"cites": work_id},
            per_page=min(limit, 200),
            sort="cited_by_count:desc",
        )
