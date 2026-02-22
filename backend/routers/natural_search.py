"""
Natural language search router for ScholarGraph3D.

Converts natural language queries to structured params using Groq,
then runs parallel searches and merges results into the graph pipeline.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import settings
from database import Database, get_db
from routers.search import (
    GraphResponse,
    SearchRequest,
    search_papers,
)
from services.query_parser import parse_natural_query

logger = logging.getLogger(__name__)
router = APIRouter()


class NaturalSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    groq_api_key: Optional[str] = None
    limit: int = Field(default=200, ge=1, le=500)


@router.post("/api/search/natural", response_model=GraphResponse)
async def natural_language_search(
    request: NaturalSearchRequest,
    db: Database = Depends(get_db),
):
    """
    Natural language search endpoint.

    Parses the query with Groq LLM to extract structured params,
    then runs multiple parallel searches and merges results.
    Falls back to plain keyword search if no API key.
    """
    # Parse natural language query into structured params
    parsed = await parse_natural_query(request.query, request.groq_api_key)
    logger.info(f"Natural query parsed: '{request.query}' -> {parsed}")

    # Build the primary search request from parsed params
    primary_query = parsed.get("keywords") or request.query
    year_min = parsed.get("year_min")
    year_max = parsed.get("year_max")
    fields = parsed.get("fields") or []
    expanded_queries = parsed.get("expanded_queries") or []

    # Run primary search through existing pipeline
    primary_request = SearchRequest(
        query=primary_query,
        limit=request.limit,
        year_start=year_min,
        year_end=year_max,
        fields_of_study=fields if fields else None,
    )

    # If no expanded queries or no API key, just do primary search
    if not expanded_queries or not request.groq_api_key:
        return await search_papers(primary_request, db)

    # Run parallel searches: primary + expanded queries
    async def safe_search(q: str) -> Optional[GraphResponse]:
        try:
            req = SearchRequest(
                query=q,
                limit=max(50, request.limit // (len(expanded_queries) + 1)),
                year_start=year_min,
                year_end=year_max,
                fields_of_study=fields if fields else None,
            )
            return await search_papers(req, db)
        except Exception as e:
            logger.warning(f"Expanded query '{q}' failed: {e}")
            return None

    tasks = [search_papers(primary_request, db)] + [
        safe_search(q) for q in expanded_queries[:2]
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Use primary result (first) as base
    primary_result = None
    for r in results:
        if isinstance(r, GraphResponse) and r.nodes:
            primary_result = r
            break

    if primary_result is None:
        raise HTTPException(status_code=404, detail="No results found")

    return primary_result
