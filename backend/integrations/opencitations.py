"""
OpenCitations COCI API Integration for ScholarGraph3D.

OpenCitations Index of CrossRef open DOI-to-DOI citations (COCI):
- 20+ billion citation pairs
- DOI-based (no S2 paper_id required)
- Free, no API key needed
- Rate limit: ~180 req/min (polite use)

API docs: https://opencitations.net/index/coci/api/v1

Usage:
    client = OpenCitationsClient()
    citations = await client.get_citations("10.1038/s41586-021-03819-2")
    # → [{"citing": "10.xxxx/...", "cited": "10.1038/...", "creation": "2022"}]

For high-volume use, prefer the bulk CSV dump over the API.
"""

import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)


class OpenCitationsClient:
    """
    Client for OpenCitations COCI REST API.

    Returns DOI-to-DOI citation/reference relationships.
    No authentication required.
    """

    BASE_URL = "https://opencitations.net/index/coci/api/v1"
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

    async def _request(self, url: str) -> Optional[List[Dict[str, Any]]]:
        """Make a GET request and return JSON list, or None on failure."""
        try:
            response = await self._client.get(url)

            if response.status_code == 404:
                return []

            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError as e:
            logger.debug(f"OpenCitations HTTP {e.response.status_code} for {url}")
            return None
        except Exception as e:
            logger.debug(f"OpenCitations request failed: {e}")
            return None

    async def get_citations(self, doi: str) -> List[Dict[str, Any]]:
        """
        Get papers that cite the given DOI.

        Returns list of citation objects:
            [{"citing": "10.xxx/...", "cited": "10.yyy/...", "creation": "2022", ...}]

        Args:
            doi: Target paper DOI (e.g. "10.1038/s41586-021-03819-2")

        Returns:
            List of citation dicts, or [] if not found / on error.
        """
        encoded = quote(doi, safe=":/")
        url = f"{self.BASE_URL}/citations/{encoded}"
        result = await self._request(url)
        return result or []

    async def get_references(self, doi: str) -> List[Dict[str, Any]]:
        """
        Get papers cited by the given DOI (its reference list).

        Returns list of citation objects:
            [{"citing": "10.yyy/...", "cited": "10.xxx/...", "creation": "2021", ...}]

        Args:
            doi: Source paper DOI

        Returns:
            List of reference dicts, or [] if not found / on error.
        """
        encoded = quote(doi, safe=":/")
        url = f"{self.BASE_URL}/references/{encoded}"
        result = await self._request(url)
        return result or []

    def extract_cited_dois(self, references: List[Dict[str, Any]]) -> List[str]:
        """Extract cited DOIs from a references() response."""
        dois = []
        for item in references:
            cited = item.get("cited", "")
            if cited:
                dois.append(cited)
        return dois

    def extract_citing_dois(self, citations: List[Dict[str, Any]]) -> List[str]:
        """Extract citing DOIs from a citations() response."""
        dois = []
        for item in citations:
            citing = item.get("citing", "")
            if citing:
                dois.append(citing)
        return dois
