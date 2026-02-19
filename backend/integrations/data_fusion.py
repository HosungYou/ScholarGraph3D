"""
Data Fusion Service for ScholarGraph3D.

OA-first search + S2 enrichment + DOI dedup + abstract fallback.
Merges results from OpenAlex (primary metadata) and Semantic Scholar
(TLDR, SPECTER2 embeddings, citation intents).
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

from .openalex import OpenAlexClient, OpenAlexWork
from .semantic_scholar import (
    SemanticScholarClient,
    SemanticScholarPaper,
    SemanticScholarRateLimitError,
)

logger = logging.getLogger(__name__)


class UnifiedPaper:
    """Unified paper combining data from OpenAlex and Semantic Scholar."""

    def __init__(
        self,
        doi: Optional[str] = None,
        title: str = "",
        abstract: Optional[str] = None,
        year: Optional[int] = None,
        venue: Optional[str] = None,
        citation_count: int = 0,
        fields_of_study: Optional[List[str]] = None,
        oa_topics: Optional[List[Dict[str, Any]]] = None,
        tldr: Optional[str] = None,
        embedding: Optional[List[float]] = None,
        is_open_access: bool = False,
        oa_url: Optional[str] = None,
        authors: Optional[List[Dict[str, Any]]] = None,
        s2_paper_id: Optional[str] = None,
        oa_work_id: Optional[str] = None,
    ):
        self.doi = doi
        self.title = title
        self.abstract = abstract
        self.year = year
        self.venue = venue
        self.citation_count = citation_count
        self.fields_of_study = fields_of_study or []
        self.oa_topics = oa_topics or []
        self.tldr = tldr
        self.embedding = embedding
        self.is_open_access = is_open_access
        self.oa_url = oa_url
        self.authors = authors or []
        self.s2_paper_id = s2_paper_id
        self.oa_work_id = oa_work_id

    def to_dict(self) -> Dict[str, Any]:
        return {
            "doi": self.doi,
            "title": self.title,
            "abstract": self.abstract,
            "year": self.year,
            "venue": self.venue,
            "citation_count": self.citation_count,
            "fields_of_study": self.fields_of_study,
            "oa_topics": self.oa_topics,
            "tldr": self.tldr,
            "embedding": self.embedding,
            "is_open_access": self.is_open_access,
            "oa_url": self.oa_url,
            "authors": self.authors,
            "s2_paper_id": self.s2_paper_id,
            "oa_work_id": self.oa_work_id,
        }


def _normalize_doi(doi: Optional[str]) -> Optional[str]:
    """Normalize DOI for deduplication."""
    if not doi:
        return None
    doi = doi.strip().lower()
    # Remove URL prefix
    for prefix in ["https://doi.org/", "http://doi.org/", "doi:"]:
        if doi.startswith(prefix):
            doi = doi[len(prefix):]
    return doi


def _oa_work_to_unified(work: OpenAlexWork) -> UnifiedPaper:
    """Convert OpenAlex work to unified paper."""
    # Extract venue from primary_location
    venue = None
    if work.primary_location:
        source = work.primary_location.get("source")
        if source:
            venue = source.get("display_name")

    return UnifiedPaper(
        doi=_normalize_doi(work.doi),
        title=work.title,
        abstract=work.abstract,
        year=work.publication_year,
        venue=venue,
        citation_count=work.citation_count,
        fields_of_study=[c.get("display_name", "") for c in work.concepts if c.get("level", 99) <= 1],
        oa_topics=work.topics,
        is_open_access=work.is_open_access,
        oa_url=work.open_access_url,
        authors=work.authors,
        oa_work_id=work.id,
    )


def _s2_paper_to_unified(paper: SemanticScholarPaper) -> UnifiedPaper:
    """Convert Semantic Scholar paper to unified paper."""
    return UnifiedPaper(
        doi=_normalize_doi(paper.doi),
        title=paper.title,
        abstract=paper.abstract,
        year=paper.year,
        venue=paper.venue,
        citation_count=paper.citation_count,
        fields_of_study=paper.fields_of_study,
        tldr=paper.tldr,
        embedding=paper.embedding,
        is_open_access=paper.is_open_access,
        oa_url=paper.open_access_pdf_url,
        authors=paper.authors,
        s2_paper_id=paper.paper_id,
    )


class DataFusionService:
    """
    OA-first search + S2 enrichment + DOI dedup + abstract fallback.

    Strategy:
    1. OpenAlex keyword search (primary) - best metadata coverage
    2. S2 search (supplementary) - provides TLDR + embeddings
    3. DOI-based dedup + merge
    4. Abstract fallback: OA abstract -> S2 TLDR -> "No abstract available"
    5. Log embedding coverage
    6. Return unified paper list
    """

    def __init__(
        self,
        oa_client: OpenAlexClient,
        s2_client: SemanticScholarClient,
    ):
        self.oa_client = oa_client
        self.s2_client = s2_client

    async def search(
        self,
        query: str,
        limit: int = 200,
        year_range: Optional[Tuple[int, int]] = None,
        fields: Optional[List[str]] = None,
    ) -> List[UnifiedPaper]:
        """
        Search papers using OA-first strategy with S2 enrichment.

        Args:
            query: Search query string
            limit: Maximum results to return
            year_range: Optional (start_year, end_year) filter
            fields: Optional fields of study filter

        Returns:
            List of unified papers with embeddings
        """
        # 1. OpenAlex keyword search (primary)
        oa_filter_params = {}
        if year_range:
            oa_filter_params["publication_year"] = f"{year_range[0]}-{year_range[1]}"

        oa_results = await self.oa_client.search_works(
            query=query,
            per_page=min(limit, 100),
            filter_params=oa_filter_params if oa_filter_params else None,
        )
        logger.info(f"OA search returned {len(oa_results)} results for '{query}'")

        # 2. S2 search (supplementary — graceful on rate limit)
        s2_results: List[SemanticScholarPaper] = []
        try:
            s2_results = await self.s2_client.search_papers(
                query=query,
                limit=min(limit, 100),
                year_range=year_range,
                fields_of_study=fields,
                include_embedding=True,  # Request SPECTER2 embeddings inline
            )
            logger.info(f"S2 search returned {len(s2_results)} results for '{query}'")
        except SemanticScholarRateLimitError as e:
            logger.warning(f"S2 rate limited ({e.retry_after}s), continuing with OA-only results")
        except Exception as e:
            logger.warning(f"S2 search failed, continuing with OA-only: {e}")

        # 3. DOI-based dedup + merge
        merged = self._merge_results(oa_results, s2_results)
        logger.info(f"Merged to {len(merged)} unique papers")

        # 4. Abstract fallback applied during merge

        # 5. Log embedding coverage (embeddings now included in S2 search response)
        papers_with_emb = sum(1 for p in merged if p.embedding is not None)
        logger.info(f"{papers_with_emb}/{len(merged)} papers have embeddings after merge")

        # 6. Return unified paper list (up to limit)
        return merged[:limit]

    def _merge_results(
        self,
        oa_results: List[OpenAlexWork],
        s2_results: List[SemanticScholarPaper],
    ) -> List[UnifiedPaper]:
        """DOI-based dedup, prefer OA metadata + S2 TLDR/embeddings."""
        # Index S2 results by DOI for fast lookup
        s2_by_doi: Dict[str, SemanticScholarPaper] = {}
        s2_by_title: Dict[str, SemanticScholarPaper] = {}
        s2_unmatched: List[SemanticScholarPaper] = []

        for paper in s2_results:
            doi = _normalize_doi(paper.doi)
            if doi:
                s2_by_doi[doi] = paper
            if paper.title:
                s2_by_title[paper.title.lower().strip()] = paper

        merged: List[UnifiedPaper] = []
        seen_dois: set = set()
        seen_titles: set = set()

        # Process OA results first (primary metadata source)
        for oa_work in oa_results:
            unified = _oa_work_to_unified(oa_work)
            doi = _normalize_doi(oa_work.doi)

            # Try to find matching S2 paper for enrichment
            s2_match = None
            if doi and doi in s2_by_doi:
                s2_match = s2_by_doi.pop(doi)
            elif oa_work.title:
                title_key = oa_work.title.lower().strip()
                if title_key in s2_by_title:
                    s2_match = s2_by_title.pop(title_key)

            # Enrich with S2 data
            if s2_match:
                unified.s2_paper_id = s2_match.paper_id
                unified.tldr = s2_match.tldr
                unified.embedding = s2_match.embedding
                # Abstract fallback: prefer OA abstract, fallback to S2
                if not unified.abstract and s2_match.abstract:
                    unified.abstract = s2_match.abstract

            # Abstract final fallback
            if not unified.abstract and unified.tldr:
                unified.abstract = unified.tldr

            if doi:
                seen_dois.add(doi)
            if unified.title:
                seen_titles.add(unified.title.lower().strip())

            merged.append(unified)

        # Add remaining S2-only results
        for doi, s2_paper in s2_by_doi.items():
            if doi not in seen_dois:
                title_key = s2_paper.title.lower().strip() if s2_paper.title else ""
                if title_key and title_key not in seen_titles:
                    unified = _s2_paper_to_unified(s2_paper)
                    if not unified.abstract and unified.tldr:
                        unified.abstract = unified.tldr
                    merged.append(unified)
                    seen_dois.add(doi)
                    seen_titles.add(title_key)

        # Also check s2_by_title for any remaining unmatched
        for title_key, s2_paper in s2_by_title.items():
            if title_key not in seen_titles:
                doi = _normalize_doi(s2_paper.doi)
                if doi and doi in seen_dois:
                    continue
                unified = _s2_paper_to_unified(s2_paper)
                if not unified.abstract and unified.tldr:
                    unified.abstract = unified.tldr
                merged.append(unified)
                if doi:
                    seen_dois.add(doi)
                seen_titles.add(title_key)

        return merged
