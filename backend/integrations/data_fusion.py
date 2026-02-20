"""
Data Fusion Service for ScholarGraph3D.

OA-first search + S2 enrichment + DOI dedup + RRF scoring + abstract fallback.
Merges results from OpenAlex (primary metadata) and Semantic Scholar
(TLDR, SPECTER2 embeddings, citation intents).

v0.7.0: Added Reciprocal Rank Fusion (RRF) for hybrid relevance scoring.
(Cormack et al., SIGIR 2009)
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

# RRF constant (TREC-validated, see Cormack et al. 2009)
_RRF_K = 60


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
        rrf_score: float = 0.0,
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
        self.rrf_score = rrf_score  # Reciprocal Rank Fusion score

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
        authors=[
            {
                "name": a.get("display_name") or a.get("name") or "Unknown",
                "affiliations": [i.get("display_name", "") for i in a.get("institutions", [])],
            }
            for a in work.authors
        ],
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


def _paper_key(paper: UnifiedPaper) -> str:
    """Get a stable dedup key for a paper."""
    return paper.doi or paper.title.lower().strip()


class DataFusionService:
    """
    OA-first search + S2 enrichment + DOI dedup + RRF scoring + abstract fallback.

    Strategy:
    1. Parallel OA + S2 search
    2. DOI-based dedup + merge (OA metadata preferred + S2 TLDR/embeddings)
    3. Reciprocal Rank Fusion (RRF) scoring from both source ranks
    4. Abstract fallback: OA abstract -> S2 TLDR -> "No abstract available"
    5. Prioritize: embeddings first, then RRF score
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
        Search papers using OA-first strategy with S2 enrichment + RRF scoring.

        Args:
            query: Search query string
            limit: Maximum results to return
            year_range: Optional (start_year, end_year) filter
            fields: Optional fields of study filter

        Returns:
            List of unified papers sorted by RRF score, embeddings prioritized
        """
        # 1. OpenAlex keyword search (primary)
        oa_filter_params = {}
        if year_range:
            oa_filter_params["publication_year"] = f"{year_range[0]}-{year_range[1]}"

        # 1+2. Parallel OA + S2 search
        oa_task = self.oa_client.search_works(
            query=query,
            per_page=min(limit, 250),
            filter_params=oa_filter_params if oa_filter_params else None,
        )
        s2_task = self.s2_client.search_papers(
            query=query,
            limit=min(limit, 250),
            year_range=year_range,
            fields_of_study=fields,
            include_embedding=True,
        )

        import asyncio as _asyncio
        oa_raw, s2_raw = await _asyncio.gather(oa_task, s2_task, return_exceptions=True)

        if isinstance(oa_raw, Exception):
            logger.warning(f"OA search failed: {oa_raw}")
            oa_results = []
        else:
            oa_results = oa_raw
        logger.info(f"OA search returned {len(oa_results)} results for '{query}'")

        s2_results: List[SemanticScholarPaper] = []
        if isinstance(s2_raw, SemanticScholarRateLimitError):
            logger.warning(f"S2 rate limited, continuing with OA-only results")
        elif isinstance(s2_raw, Exception):
            logger.warning(f"S2 search failed, continuing with OA-only: {s2_raw}")
        else:
            s2_results = s2_raw
            logger.info(f"S2 search returned {len(s2_results)} results for '{query}'")

        # 3. DOI-based dedup + merge with RRF scoring
        merged = self._merge_results(oa_results, s2_results)
        logger.info(f"Merged to {len(merged)} unique papers")

        # 4. Abstract fallback applied during merge

        # 5. Log embedding coverage
        papers_with_emb = sum(1 for p in merged if p.embedding is not None)
        logger.info(f"{papers_with_emb}/{len(merged)} papers have embeddings after merge")

        # Sort: embeddings first, then by RRF score descending
        merged.sort(key=lambda p: (p.embedding is None, -p.rrf_score))

        # 6. Return unified paper list (up to limit)
        return merged[:limit]

    def _merge_results(
        self,
        oa_results: List[OpenAlexWork],
        s2_results: List[SemanticScholarPaper],
    ) -> List[UnifiedPaper]:
        """
        DOI-based dedup, prefer OA metadata + S2 TLDR/embeddings.
        Apply Reciprocal Rank Fusion (RRF) scoring from both source ranks.

        RRF(d) = 1/(k + rank_OA(d)) + 1/(k + rank_S2(d))
        k=60 per Cormack et al. (SIGIR 2009)
        """
        # Build rank maps for RRF scoring
        # OA: position 0 = most relevant (OA sorts by relevance_score)
        oa_rank_by_doi: Dict[str, int] = {}
        oa_rank_by_title: Dict[str, int] = {}
        for rank, work in enumerate(oa_results):
            doi = _normalize_doi(work.doi)
            if doi:
                oa_rank_by_doi[doi] = rank
            if work.title:
                oa_rank_by_title[work.title.lower().strip()] = rank

        # S2: position 0 = most relevant
        s2_rank_by_doi: Dict[str, int] = {}
        s2_rank_by_title: Dict[str, int] = {}
        for rank, paper in enumerate(s2_results):
            doi = _normalize_doi(paper.doi)
            if doi:
                s2_rank_by_doi[doi] = rank
            if paper.title:
                s2_rank_by_title[paper.title.lower().strip()] = rank

        n_oa = max(len(oa_results), 1)
        n_s2 = max(len(s2_results), 1)

        # Index S2 results by DOI for fast lookup
        s2_by_doi: Dict[str, SemanticScholarPaper] = {}
        s2_by_title: Dict[str, SemanticScholarPaper] = {}

        for paper in s2_results:
            doi = _normalize_doi(paper.doi)
            if doi:
                s2_by_doi[doi] = paper
            if paper.title:
                s2_by_title[paper.title.lower().strip()] = paper

        merged: List[UnifiedPaper] = []
        seen_dois: set = set()
        seen_titles: set = set()

        def _compute_rrf(doi: Optional[str], title: str) -> float:
            """Compute RRF score from OA and S2 ranks."""
            title_key = title.lower().strip()
            oa_rank = oa_rank_by_doi.get(doi, oa_rank_by_title.get(title_key, n_oa)) if doi else oa_rank_by_title.get(title_key, n_oa)
            s2_rank = s2_rank_by_doi.get(doi, s2_rank_by_title.get(title_key, n_s2)) if doi else s2_rank_by_title.get(title_key, n_s2)
            return 1.0 / (_RRF_K + oa_rank) + 1.0 / (_RRF_K + s2_rank)

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

            # RRF score
            unified.rrf_score = _compute_rrf(doi, unified.title)

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
                    unified.rrf_score = _compute_rrf(doi, unified.title)
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
                unified.rrf_score = _compute_rrf(doi, unified.title)
                merged.append(unified)
                if doi:
                    seen_dois.add(doi)
                seen_titles.add(title_key)

        return merged
