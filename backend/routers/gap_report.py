"""
Gap Report generation router for ScholarGraph3D.

Generates structured research gap reports from gap analysis data.
Uses 1 Groq LLM call for narrative synthesis; falls back to
evidence-only report if LLM is unavailable.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.gap_report_service import (
    assemble_evidence,
    assemble_report,
    compute_gap_report_cache_key,
    generate_narrative,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class GapReportRequest(BaseModel):
    gap: Dict[str, Any] = Field(..., description="SeedGapInfo dict from gap detection")
    graph_context: Dict[str, Any] = Field(
        ...,
        description="Graph context: {papers: [...], clusters: [...], total_papers: int}",
    )
    snapshot_data_url: Optional[str] = Field(
        None, description="Base64 PNG data URL of 3D graph snapshot"
    )


class GapReportResponse(BaseModel):
    gap_id: str
    title: str
    generated_at: str
    executive_summary: str
    sections: List[Dict[str, Any]]
    research_questions: List[Dict[str, Any]]
    significance_statement: Optional[str] = None
    limitations: Optional[str] = None
    cited_papers: List[Dict[str, Any]]
    bibtex: str
    raw_metrics: Dict[str, float]
    snapshot_data_url: Optional[str] = None
    llm_status: Optional[str] = None


@router.post("/api/gaps/report", response_model=GapReportResponse)
async def generate_gap_report(request: GapReportRequest):
    """
    Generate a structured gap analysis report.

    Pipeline:
    1. Assemble evidence from gap data (no LLM)
    2. Check cache for existing report
    3. Generate LLM narrative (1 Groq call, graceful degradation)
    4. Assemble final report with BibTeX

    Returns evidence-only report if LLM fails.
    """
    gap = request.gap
    graph_context = request.graph_context

    if not gap.get("gap_id"):
        raise HTTPException(status_code=400, detail="Missing gap_id in gap data")

    # Check cache first
    cache_key = compute_gap_report_cache_key(gap)
    try:
        from cache import get_cached_gap_report
        cached = await get_cached_gap_report(cache_key)
        if cached:
            logger.info(f"Gap report cache hit for {cache_key}")
            return GapReportResponse(**cached)
    except Exception:
        pass  # cache miss or unavailable

    # 1. Assemble evidence (always succeeds)
    evidence = assemble_evidence(gap, graph_context)

    # 2. Generate narrative (may fail gracefully)
    narrative = await generate_narrative(evidence, gap)
    llm_status = "success" if narrative else "failed"

    # 3. Assemble report
    report = assemble_report(evidence, narrative, gap, request.snapshot_data_url, llm_status=llm_status)

    # Cache the report
    try:
        from cache import cache_gap_report
        await cache_gap_report(cache_key, report)
    except Exception:
        pass  # cache write failure is non-fatal

    return GapReportResponse(**report)
