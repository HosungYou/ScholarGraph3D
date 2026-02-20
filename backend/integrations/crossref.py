"""
Crossref API Integration for ScholarGraph3D.

Provides DOI metadata fallback when Semantic Scholar cannot resolve a DOI.
Crossref has authoritative metadata for economics, law, and many non-CS/bio journals
that may not be indexed in S2.

Usage:
    client = CrossrefClient()
    metadata = await client.get_metadata("10.1111/jems.12576")
    # → {"title": "...", "year": 2018, "authors": ["John Smith", ...]}

API: https://api.crossref.org/works/{doi}
Rate limit: polite pool with User-Agent email header → ~50 req/s
"""

import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)


class CrossrefClient:
    """
    Crossref REST API client for DOI metadata lookup.

    Uses the polite pool (mailto: in User-Agent) for higher rate limits.
    No API key required.
    """

    BASE_URL = "https://api.crossref.org/works"
    HEADERS = {
        "User-Agent": "ScholarGraph3D/0.8.0 (mailto:contact@scholargraph3d.com)",
    }

    def __init__(self, timeout: float = 15.0):
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers=self.HEADERS,
        )

    async def close(self):
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def get_metadata(self, doi: str) -> Optional[Dict[str, Any]]:
        """
        Fetch paper metadata from Crossref by DOI.

        Returns a simplified metadata dict with title, year, and authors,
        or None if the DOI is not found or the request fails.

        Args:
            doi: Raw DOI string (e.g. "10.1111/jems.12576")

        Returns:
            Dict with keys: title, year, authors, doi
            Or None on failure.
        """
        encoded_doi = quote(doi, safe=":/")
        url = f"{self.BASE_URL}/{encoded_doi}"

        try:
            response = await self._client.get(url)

            if response.status_code == 404:
                logger.debug(f"Crossref: DOI not found — {doi}")
                return None

            response.raise_for_status()
            data = response.json()
            msg = data.get("message") or {}

            if not msg:
                return None

            # Extract title (Crossref wraps title in a list)
            title_list = msg.get("title") or []
            title = title_list[0] if title_list else ""

            # Extract publication year from date-parts
            date_parts = (msg.get("published") or {}).get("date-parts") or []
            year: Optional[int] = None
            if date_parts and date_parts[0]:
                year = date_parts[0][0]

            # Extract authors
            raw_authors = msg.get("author") or []
            authors: List[str] = []
            for a in raw_authors:
                given = (a.get("given") or "").strip()
                family = (a.get("family") or "").strip()
                full_name = f"{given} {family}".strip()
                if full_name:
                    authors.append(full_name)

            if not title:
                logger.debug(f"Crossref: no title in response for DOI {doi}")
                return None

            return {
                "title": title,
                "year": year,
                "authors": authors,
                "doi": doi,
            }

        except httpx.HTTPStatusError as e:
            logger.warning(f"Crossref HTTP error {e.response.status_code} for DOI {doi}")
            return None
        except Exception as e:
            logger.warning(f"Crossref request failed for DOI {doi}: {e}")
            return None
