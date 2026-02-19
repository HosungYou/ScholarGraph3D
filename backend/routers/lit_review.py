"""
Literature review router for ScholarGraph3D.

Endpoints for generating structured literature reviews from graph data
and exporting them as PDF.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from llm.user_provider import create_provider_from_request
from services.lit_review import LitReviewService

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Request/Response Models ====================


class GraphDataInput(BaseModel):
    """Graph data for literature review generation."""

    paper_ids: List[str] = Field(default_factory=list)
    papers: List[Dict[str, Any]] = Field(default_factory=list)
    clusters: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)


class LitReviewRequest(BaseModel):
    """Request body for generating a literature review."""

    graph_data: GraphDataInput
    provider: str = Field(..., description="LLM provider name (openai, anthropic, google, groq)")
    api_key: str = Field(..., min_length=1, description="LLM provider API key")
    include_trends: bool = Field(default=True, description="Include trend analysis in discussion")
    include_gaps: bool = Field(default=True, description="Include gap analysis in discussion")
    trends: Optional[Dict[str, Any]] = Field(default=None, description="Pre-computed trend data")
    gaps: Optional[List[Dict[str, Any]]] = Field(default=None, description="Pre-computed gap data")
    citation_style: str = Field(default="apa", description="Citation style (apa)")


class LitReviewSection(BaseModel):
    """A section of the literature review."""

    heading: str
    content: str
    paper_refs: List[str] = []


class LitReviewResponse(BaseModel):
    """Response model for a generated literature review."""

    title: str
    markdown: str
    sections: List[LitReviewSection]
    references: List[str]
    metadata: Dict[str, Any]


class PdfExportRequest(BaseModel):
    """Request body for PDF export."""

    markdown: str = Field(..., min_length=1, description="Markdown content to export as PDF")


# ==================== Endpoints ====================


@router.post("/api/lit-review/generate", response_model=LitReviewResponse)
async def generate_lit_review(request: LitReviewRequest):
    """
    Generate a structured literature review from graph data.

    The review is organized by cluster (thematic sections) with:
    - Introduction (field overview)
    - Thematic sections (per cluster, with [Author, Year] citations)
    - Discussion (gaps, trends, future directions)
    - Conclusion
    - References (APA format)

    Requires an LLM provider and API key (user brings their own key).
    """
    # Validate graph data
    graph_data = request.graph_data
    if not graph_data.papers:
        raise HTTPException(
            status_code=400,
            detail="No papers provided in graph_data. Include papers with title, authors, year, etc.",
        )

    # Create LLM provider
    try:
        llm_provider = create_provider_from_request(
            provider=request.provider,
            api_key=request.api_key,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Build graph data dict
    gd = {
        "papers": [p if isinstance(p, dict) else p.dict() for p in graph_data.papers],
        "clusters": [c if isinstance(c, dict) else c for c in graph_data.clusters],
        "edges": [e if isinstance(e, dict) else e for e in graph_data.edges],
    }

    # Optional trend/gap data
    trends = request.trends if request.include_trends else None
    gaps = request.gaps if request.include_gaps else None

    # Generate review
    svc = LitReviewService()
    try:
        result = await svc.generate_review(
            graph_data=gd,
            llm_provider=llm_provider,
            clusters=graph_data.clusters if graph_data.clusters else None,
            trends=trends,
            gaps=gaps,
            style=request.citation_style,
        )
    except Exception as e:
        logger.error(f"Literature review generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Literature review generation failed: {str(e)}",
        )
    finally:
        await llm_provider.close()

    return LitReviewResponse(
        title=result.title,
        markdown=result.markdown,
        sections=[
            LitReviewSection(
                heading=s["heading"],
                content=s["content"],
                paper_refs=s.get("paper_refs", []),
            )
            for s in result.sections
        ],
        references=result.references,
        metadata=result.metadata,
    )


@router.post("/api/lit-review/export-pdf")
async def export_lit_review_pdf(request: PdfExportRequest):
    """
    Export a literature review as PDF.

    Takes markdown content and returns a PDF file with academic styling
    (Times New Roman, 1.5 spacing, proper margins).

    If weasyprint is not available, returns the markdown as a text file
    with a warning header.
    """
    svc = LitReviewService()

    try:
        pdf_bytes = await svc.export_as_pdf(request.markdown)
    except Exception as e:
        logger.error(f"PDF export failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"PDF export failed: {str(e)}",
        )

    # Detect if we got actual PDF or fallback markdown
    is_pdf = pdf_bytes[:4] == b"%PDF"

    if is_pdf:
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=literature_review.pdf",
            },
        )
    else:
        # Fallback: return markdown as downloadable text
        return Response(
            content=pdf_bytes,
            media_type="text/markdown",
            headers={
                "Content-Disposition": "attachment; filename=literature_review.md",
                "X-PDF-Fallback": "true",
                "X-PDF-Fallback-Reason": "weasyprint not installed",
            },
        )
