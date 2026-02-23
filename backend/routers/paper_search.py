"""
Paper Search Router — NL query → Semantic Scholar → Paper Selection cards.

POST /api/paper-search
  Body: { query: str, limit?: int }
  Returns: { papers: [...], refined_query?: str }
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from integrations.semantic_scholar import get_s2_client, SemanticScholarRateLimitError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class PaperSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=10, ge=1, le=30)


class PaperSearchAuthor(BaseModel):
    name: str


class PaperSearchResult(BaseModel):
    paper_id: str
    title: str
    authors: List[PaperSearchAuthor]
    year: Optional[int] = None
    citation_count: int = 0
    abstract_snippet: Optional[str] = None
    fields: List[str] = []
    doi: Optional[str] = None
    venue: Optional[str] = None


class PaperSearchResponse(BaseModel):
    papers: List[PaperSearchResult]
    refined_query: Optional[str] = None


@router.post("/paper-search", response_model=PaperSearchResponse)
async def search_papers(req: PaperSearchRequest):
    """Search for papers by natural language query via Semantic Scholar."""
    s2 = get_s2_client()

    try:
        results = await s2.search_papers(
            query=req.query,
            limit=req.limit,
            include_embedding=False,
        )
    except SemanticScholarRateLimitError as e:
        raise HTTPException(
            status_code=429,
            detail="Semantic Scholar rate limited. Please wait and try again.",
            headers={"Retry-After": str(e.retry_after)},
        )
    except Exception as e:
        logger.error(f"Paper search failed: {e}")
        raise HTTPException(status_code=502, detail="Search service unavailable. Try again later.")

    papers = []
    for p in results:
        abstract_snippet = None
        if p.abstract:
            abstract_snippet = p.abstract[:200] + ("..." if len(p.abstract) > 200 else "")
        elif p.tldr:
            abstract_snippet = p.tldr[:200] + ("..." if len(p.tldr) > 200 else "")

        papers.append(PaperSearchResult(
            paper_id=p.paper_id,
            title=p.title or "Untitled",
            authors=[PaperSearchAuthor(name=a.get("name", "Unknown")) for a in p.authors[:5]],
            year=p.year,
            citation_count=p.citation_count or 0,
            abstract_snippet=abstract_snippet,
            fields=p.fields_of_study or [],
            doi=p.doi,
            venue=p.venue,
        ))

    return PaperSearchResponse(papers=papers)
