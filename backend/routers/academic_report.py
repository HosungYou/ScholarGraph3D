"""
Academic Report generation router for ScholarGraph3D.

Generates APA 7th formatted SNA academic output from graph data.
All template-based — no LLM calls. Uses networkx for network metrics
computation via asyncio.to_thread.
"""

import asyncio
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from graph.network_metrics import NetworkMetricsComputer
from services.academic_report_service import generate_academic_report

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Request/Response models ──────────────────────────────────────────


class AcademicReportRequest(BaseModel):
    graph_context: Dict[str, Any] = Field(
        ...,
        description="Graph context: {papers: [...], clusters: [...], edges: [...], total_papers: int}",
    )
    gap_ids: Optional[List[str]] = Field(
        None,
        description="Which gap IDs to include, or all if None",
    )
    analysis_parameters: Optional[Dict[str, Any]] = Field(
        None,
        description="Analysis parameter overrides (n_neighbors, min_cluster_size, etc.)",
    )


class AcademicReportResponse(BaseModel):
    methods_section: str
    tables: Dict[str, Any]
    figure_captions: Dict[str, str]
    reference_list: Dict[str, Any]
    network_metrics: Dict[str, Any]
    parameters: Dict[str, Any]
    generated_at: str
    feasibility: str
    warnings: List[str]


class NetworkOverviewRequest(BaseModel):
    graph_context: Dict[str, Any] = Field(
        ...,
        description="Graph context: {papers: [...], edges: [...], clusters: [...]}",
    )


class NetworkOverviewResponse(BaseModel):
    node_count: int
    edge_count: int
    density: float
    cluster_count: int
    modularity: float


# ─── Endpoints ────────────────────────────────────────────────────────


@router.post("/api/academic-report", response_model=AcademicReportResponse)
async def create_academic_report(request: AcademicReportRequest):
    """
    Generate an APA 7th formatted SNA academic report.

    Pipeline:
    1. Check cache for existing report
    2. Compute network metrics via networkx (asyncio.to_thread)
    3. Filter gaps by gap_ids (if provided)
    4. Generate template-based academic report
    5. Cache result for 24 hours

    Returns template-based report with methods section, tables,
    figure captions, and reference list.
    """
    graph_context = request.graph_context
    papers = graph_context.get("papers", [])
    edges = graph_context.get("edges", [])
    clusters = graph_context.get("clusters", [])

    if not papers:
        raise HTTPException(status_code=400, detail="No papers provided in graph_context")

    # Compute cache key from paper IDs
    cache_key = _compute_cache_key(papers)

    # Check cache first
    try:
        from cache import get_cached_academic_report
        cached = await get_cached_academic_report(cache_key)
        if cached:
            logger.info(f"Academic report cache hit for {cache_key}")
            return AcademicReportResponse(**cached)
    except Exception:
        pass  # cache miss or unavailable

    # Compute network metrics (CPU-bound, run in thread)
    computer = NetworkMetricsComputer()
    try:
        network_metrics = await asyncio.wait_for(
            asyncio.to_thread(computer.compute_all, papers, edges, clusters),
            timeout=60.0,
        )
    except asyncio.TimeoutError:
        logger.error("Network metrics computation timed out (60s)")
        raise HTTPException(
            status_code=504,
            detail="Network metrics computation timed out. Try with fewer papers.",
        )
    except Exception as e:
        logger.error(f"Network metrics computation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Network metrics computation failed: {type(e).__name__}",
        )

    # Filter gaps
    gaps = graph_context.get("gaps", [])
    if request.gap_ids:
        gap_id_set = set(request.gap_ids)
        gaps = [g for g in gaps if g.get("gap_id") in gap_id_set]

    # Generate academic report (template-based, fast)
    report = generate_academic_report(
        network_metrics=network_metrics,
        graph_context=graph_context,
        gaps=gaps,
        analysis_parameters=request.analysis_parameters,
    )

    # Cache the report
    try:
        from cache import cache_academic_report
        await cache_academic_report(cache_key, report)
    except Exception:
        pass  # cache write failure is non-fatal

    return AcademicReportResponse(**report)


@router.post("/api/network-overview", response_model=NetworkOverviewResponse)
async def get_network_overview(request: NetworkOverviewRequest):
    """
    Lightweight network overview for display before full report generation.

    Returns basic network stats: node_count, edge_count, density,
    cluster_count, and modularity.
    """
    graph_context = request.graph_context
    papers = graph_context.get("papers", [])
    edges = graph_context.get("edges", [])
    clusters = graph_context.get("clusters", [])

    if not papers:
        raise HTTPException(status_code=400, detail="No papers provided in graph_context")

    computer = NetworkMetricsComputer()
    try:
        overview = await asyncio.wait_for(
            asyncio.to_thread(computer.compute_network_overview, papers, edges, clusters),
            timeout=60.0,
        )
    except asyncio.TimeoutError:
        logger.error("Network overview computation timed out (60s)")
        raise HTTPException(
            status_code=504,
            detail="Network overview computation timed out.",
        )
    except Exception as e:
        logger.error(f"Network overview computation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Network overview computation failed: {type(e).__name__}",
        )

    return NetworkOverviewResponse(**overview)


# ─── Helpers ──────────────────────────────────────────────────────────


def _compute_cache_key(papers: List[Dict[str, Any]]) -> str:
    """Compute stable cache key from paper IDs."""
    paper_ids = sorted(str(p.get("id", "")) for p in papers if p.get("id"))
    raw = ":".join(paper_ids)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]
