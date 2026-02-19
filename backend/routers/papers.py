"""
Papers router for ScholarGraph3D.

Provides paper detail, citation, reference, and graph expansion endpoints.
All endpoints are public (no auth required).
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import settings
from database import Database, get_db
from integrations.semantic_scholar import SemanticScholarClient, SemanticScholarPaper
from services.citation_intent import CitationIntentService

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Response Models ====================

class PaperDetail(BaseModel):
    id: Optional[str] = None
    s2_paper_id: Optional[str] = None
    oa_work_id: Optional[str] = None
    doi: Optional[str] = None
    title: str
    abstract: Optional[str] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    citation_count: int = 0
    fields_of_study: List[str] = []
    tldr: Optional[str] = None
    is_open_access: bool = False
    oa_url: Optional[str] = None
    authors: List[Dict[str, Any]] = []


class CitationPaper(BaseModel):
    paper_id: str
    title: str
    year: Optional[int] = None
    citation_count: int = 0
    venue: Optional[str] = None
    is_open_access: bool = False
    doi: Optional[str] = None


class ExpandResponse(BaseModel):
    references: List[CitationPaper] = []
    citations: List[CitationPaper] = []
    total_references: int = 0
    total_citations: int = 0


# ==================== Helpers ====================

def _s2_to_citation_paper(paper: SemanticScholarPaper) -> CitationPaper:
    return CitationPaper(
        paper_id=paper.paper_id,
        title=paper.title,
        year=paper.year,
        citation_count=paper.citation_count,
        venue=paper.venue,
        is_open_access=paper.is_open_access,
        doi=paper.doi,
    )


def _create_s2_client() -> SemanticScholarClient:
    return SemanticScholarClient(
        api_key=settings.s2_api_key or None,
        requests_per_second=settings.s2_rate_limit,
    )


# ==================== Endpoints ====================

@router.get("/api/papers/{paper_id}", response_model=PaperDetail)
async def get_paper(paper_id: str, db: Database = Depends(get_db)):
    """Get paper detail by internal ID or S2 paper ID."""
    # Try database first
    if db.is_connected:
        try:
            row = await db.fetchrow(
                """
                SELECT id, s2_paper_id, oa_work_id, doi, title, abstract,
                       year, venue, citation_count, fields_of_study, tldr,
                       is_open_access, oa_url, authors
                FROM papers
                WHERE id::text = $1 OR s2_paper_id = $1 OR oa_work_id = $1
                LIMIT 1
                """,
                paper_id,
            )
            if row:
                return PaperDetail(
                    id=str(row["id"]),
                    s2_paper_id=row["s2_paper_id"],
                    oa_work_id=row["oa_work_id"],
                    doi=row["doi"],
                    title=row["title"],
                    abstract=row["abstract"],
                    year=row["year"],
                    venue=row["venue"],
                    citation_count=row["citation_count"] or 0,
                    fields_of_study=row["fields_of_study"] or [],
                    tldr=row["tldr"],
                    is_open_access=row["is_open_access"] or False,
                    oa_url=row["oa_url"],
                    authors=row["authors"] or [],
                )
        except Exception as e:
            logger.warning(f"DB lookup failed for paper {paper_id}: {e}")

    # Fallback to S2 API
    client = _create_s2_client()
    try:
        paper = await client.get_paper(paper_id)
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")

        return PaperDetail(
            s2_paper_id=paper.paper_id,
            doi=paper.doi,
            title=paper.title,
            abstract=paper.abstract,
            year=paper.year,
            venue=paper.venue,
            citation_count=paper.citation_count,
            fields_of_study=paper.fields_of_study,
            tldr=paper.tldr,
            is_open_access=paper.is_open_access,
            oa_url=paper.open_access_pdf_url,
            authors=paper.authors,
        )
    finally:
        await client.close()


@router.get("/api/papers/{paper_id}/citations", response_model=List[CitationPaper])
async def get_paper_citations(
    paper_id: str,
    limit: int = Query(default=50, ge=1, le=500),
):
    """Get papers that cite this paper."""
    client = _create_s2_client()
    try:
        citations = await client.get_citations(paper_id, limit=limit)
        return [_s2_to_citation_paper(p) for p in citations]
    finally:
        await client.close()


@router.get("/api/papers/{paper_id}/references", response_model=List[CitationPaper])
async def get_paper_references(
    paper_id: str,
    limit: int = Query(default=50, ge=1, le=500),
):
    """Get papers referenced by this paper."""
    client = _create_s2_client()
    try:
        references = await client.get_references(paper_id, limit=limit)
        return [_s2_to_citation_paper(p) for p in references]
    finally:
        await client.close()


@router.post("/api/papers/{paper_id}/expand", response_model=ExpandResponse)
async def expand_paper(
    paper_id: str,
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    Expand graph around a paper by loading its citations and references.

    Returns both citing and referenced papers for graph expansion.
    """
    client = _create_s2_client()
    try:
        refs, cites = await client.get_references(paper_id, limit=limit), []
        cites = await client.get_citations(paper_id, limit=limit)

        return ExpandResponse(
            references=[_s2_to_citation_paper(p) for p in refs],
            citations=[_s2_to_citation_paper(p) for p in cites],
            total_references=len(refs),
            total_citations=len(cites),
        )
    finally:
        await client.close()


# ==================== Citation Intent ====================


class CitationIntent(BaseModel):
    citing_id: str
    citing_title: str = ""
    cited_id: str
    intent: str
    enhanced_intent: Optional[str] = None
    is_influential: bool = False
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    context: str = ""
    source: str = "s2"


@router.get("/api/papers/{paper_id}/intents", response_model=List[CitationIntent])
async def get_citation_intents(
    paper_id: str,
    enhanced: bool = Query(default=False, description="Use LLM for enhanced intent classification"),
    provider: Optional[str] = Query(default=None, description="LLM provider (required if enhanced=true)"),
    api_key: Optional[str] = Query(default=None, description="LLM API key (required if enhanced=true)"),
):
    """
    Get citation intents for a paper.

    Basic mode (free): Returns S2 citation intents (methodology, background, result_comparison).
    Enhanced mode (premium): Uses LLM to classify intents more granularly
    (supports, contradicts, extends, applies, compares). Requires provider + api_key.
    """
    s2_client = _create_s2_client()
    svc = CitationIntentService()

    try:
        # Get basic S2 intents
        intents = await svc.get_basic_intents(paper_id, s2_client)

        if not intents:
            return []

        # Optionally enhance with LLM
        if enhanced:
            if not provider or not api_key:
                raise HTTPException(
                    status_code=400,
                    detail="provider and api_key are required when enhanced=true",
                )

            try:
                from llm.user_provider import create_provider_from_request

                llm_provider = create_provider_from_request(provider=provider, api_key=api_key)
                try:
                    intents = await svc.enhance_intents_with_llm(intents, llm_provider)
                finally:
                    await llm_provider.close()
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

        return [
            CitationIntent(
                citing_id=i["citing_id"],
                citing_title=i.get("citing_title", ""),
                cited_id=i["cited_id"],
                intent=i["intent"],
                enhanced_intent=i.get("enhanced_intent"),
                is_influential=i.get("is_influential", False),
                confidence=i.get("confidence"),
                reasoning=i.get("reasoning"),
                context=i.get("context", ""),
                source=i.get("source", "s2"),
            )
            for i in intents
        ]

    finally:
        await s2_client.close()
