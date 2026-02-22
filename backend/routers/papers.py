"""
Papers router for ScholarGraph3D.

Provides paper detail, citation, reference, and graph expansion endpoints.
All endpoints are public (no auth required).
"""

import logging
import random
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from config import settings
from database import Database, get_db
from integrations.semantic_scholar import SemanticScholarClient, SemanticScholarPaper, get_s2_client
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


class GraphNodeInput(BaseModel):
    id: str
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    cluster_id: int = -1
    embedding: Optional[List[float]] = None


class StableExpandNode(BaseModel):
    paper_id: str
    title: str
    year: Optional[int] = None
    citation_count: int = 0
    venue: Optional[str] = None
    is_open_access: bool = False
    doi: Optional[str] = None
    authors: List[Dict[str, Any]] = []
    abstract: Optional[str] = None
    tldr: Optional[str] = None
    fields: List[str] = []
    initial_x: float = 0.0
    initial_y: float = 0.0
    initial_z: float = 0.0
    cluster_id: int = -1


class StableExpandRequest(BaseModel):
    existing_nodes: List[GraphNodeInput] = []
    limit: int = Field(default=20, ge=1, le=100)


class ExpandMeta(BaseModel):
    references_ok: bool = True
    citations_ok: bool = True
    refs_count: int = 0
    cites_count: int = 0
    error_detail: Optional[str] = None


class StableExpandResponse(BaseModel):
    nodes: List[StableExpandNode] = []
    edges: List[Dict[str, Any]] = []
    total: int = 0
    meta: Optional[ExpandMeta] = None


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
    """Get the shared S2 client singleton. Do NOT close — it's shared."""
    return get_s2_client()


# ==================== Endpoints ====================

@router.get("/api/papers/by-doi")
async def get_paper_by_doi(
    doi: str = Query(..., description="DOI or URL of the paper"),
):
    """
    Fetch a paper by DOI and return its Semantic Scholar paper_id for seed explore mode.

    v0.7.0: Returns paper_id directly so frontend routes to /explore/seed
    instead of doing a keyword search redirect (which bypasses seed paper topology).

    v0.8.0: Crossref fallback chain for DOIs not indexed by S2 (economics, law, etc.):
        1. S2 direct lookup (ARXIV: prefix for arXiv DOIs, then DOI: prefix)
        2. [S2 fails] → Crossref metadata → extract title
        3. [Crossref success] → S2 title search → best title-similarity match
        4. [All fail] → 404

    IMPORTANT: This route MUST be defined before the {paper_id:path} catch-all,
    otherwise FastAPI will match "by-doi" as a paper_id.
    """
    import re

    # Clean up DOI (handle full URLs like https://doi.org/10.xxxx)
    doi_clean = doi.strip()
    doi_match = re.search(r'10\.\d{4,}/\S+', doi_clean)
    if doi_match:
        doi_clean = doi_match.group(0)

    # For arXiv DOIs (10.48550/arXiv.*), try ARXIV: prefix first since S2
    # often doesn't index these by DOI but does index by ArXiv ID.
    arxiv_match = re.match(r'10\.48550/arXiv\.(.+)', doi_clean, re.IGNORECASE)

    s2_client = _create_s2_client()

    try:
        paper = None

        # Step 1a: Try ArXiv ID format first for arXiv DOIs
        if arxiv_match:
            arxiv_id = arxiv_match.group(1)
            try:
                paper = await s2_client.get_paper(f"ARXIV:{arxiv_id}")
            except Exception as e:
                logger.debug(f"S2 ARXIV lookup failed for {arxiv_id}: {e}")

        # Step 1b: Fall back to DOI: prefix
        if not paper:
            try:
                paper = await s2_client.get_paper(f"DOI:{doi_clean}")
            except Exception as e:
                logger.debug(f"S2 DOI lookup failed for {doi_clean}: {e}")

        if paper and paper.paper_id:
            return {
                "paper_id": paper.paper_id,
                "title": paper.title or "",
                "doi": doi_clean,
                "source": "s2",
            }

        # Step 2: Crossref fallback — get authoritative title for non-S2 journals
        from integrations.crossref import CrossrefClient

        crossref = CrossrefClient()
        try:
            cr_meta = await crossref.get_metadata(doi_clean)
        finally:
            await crossref.close()

        if not cr_meta or not cr_meta.get("title"):
            raise HTTPException(
                status_code=404,
                detail=f"Paper not found for DOI: {doi_clean}",
            )

        cr_title = cr_meta["title"]
        logger.info(f"Crossref fallback: found title '{cr_title}' for DOI {doi_clean}")

        # Step 3: S2 title search → best title-similarity match
        try:
            candidates = await s2_client.search_papers(cr_title, limit=5)
        except Exception as e:
            logger.warning(f"S2 title search failed for '{cr_title}': {e}")
            candidates = []

        if not candidates:
            raise HTTPException(
                status_code=404,
                detail=f"DOI {doi_clean} found in Crossref but not indexed in Semantic Scholar",
            )

        def _title_score(candidate_title: str, query_title: str) -> float:
            a_tokens = set(candidate_title.lower().split())
            b_tokens = set(query_title.lower().split())
            if not a_tokens or not b_tokens:
                return 0.0
            return len(a_tokens & b_tokens) / len(a_tokens | b_tokens)

        best = max(candidates, key=lambda p: _title_score(p.title, cr_title))

        if _title_score(best.title, cr_title) < 0.3:
            raise HTTPException(
                status_code=404,
                detail=f"DOI {doi_clean} found in Crossref but no matching S2 paper (low title similarity)",
            )

        return {
            "paper_id": best.paper_id,
            "title": best.title or cr_title,
            "doi": doi_clean,
            "source": "crossref_fallback",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch paper: {str(e)}")


@router.get("/api/papers/{paper_id:path}", response_model=PaperDetail)
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


@router.get("/api/papers/{paper_id:path}/citations", response_model=List[CitationPaper])
async def get_paper_citations(
    paper_id: str,
    limit: int = Query(default=50, ge=1, le=500),
):
    """Get papers that cite this paper."""
    client = _create_s2_client()
    citations = await client.get_citations(paper_id, limit=limit)
    return [_s2_to_citation_paper(p) for p in citations]


@router.get("/api/papers/{paper_id:path}/references", response_model=List[CitationPaper])
async def get_paper_references(
    paper_id: str,
    limit: int = Query(default=50, ge=1, le=500),
):
    """Get papers referenced by this paper."""
    client = _create_s2_client()
    references = await client.get_references(paper_id, limit=limit)
    return [_s2_to_citation_paper(p) for p in references]


@router.post("/api/papers/{paper_id:path}/expand", response_model=ExpandResponse)
async def expand_paper(
    paper_id: str,
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    Expand graph around a paper by loading its citations and references.

    Returns both citing and referenced papers for graph expansion.
    Gracefully handles partial S2 failures — if one direction (refs or cites)
    fails, the other is still returned rather than 404-ing the whole request.
    """
    client = _create_s2_client()
    refs: list = []
    cites: list = []

    try:
        refs = await client.get_references(paper_id, limit=limit)
    except Exception as e:
        logger.warning(f"get_references failed for {paper_id}: {e}")

    try:
        cites = await client.get_citations(paper_id, limit=limit)
    except Exception as e:
        logger.warning(f"get_citations failed for {paper_id}: {e}")

    return ExpandResponse(
        references=[_s2_to_citation_paper(p) for p in refs],
        citations=[_s2_to_citation_paper(p) for p in cites],
        total_references=len(refs),
        total_citations=len(cites),
    )


@router.post("/api/papers/{paper_id:path}/expand-stable", response_model=StableExpandResponse)
async def expand_paper_stable(
    paper_id: str,
    request: StableExpandRequest,
):
    """
    Expand graph around a paper with stable positioning.

    Computes initial 3D positions for new papers using nearest-neighbor
    interpolation from existing nodes, so the graph doesn't jump around.
    """
    from graph.incremental_layout import place_new_paper, assign_cluster, compute_cluster_centroids
    import numpy as np

    client = _create_s2_client()
    refs: list = []
    cites: list = []

    refs_ok = True
    cites_ok = True
    refs_error = None
    cites_error = None

    try:
        refs = await client.get_references(paper_id, limit=request.limit // 2, include_embedding=True)
    except Exception as e:
        refs_ok = False
        if "TimeoutException" in type(e).__name__ or "timeout" in str(e).lower():
            refs_error = "References fetch timed out"
        else:
            refs_error = f"References fetch failed: {type(e).__name__}"
        logger.warning(f"get_references failed for {paper_id}: {e}")

    try:
        cites = await client.get_citations(paper_id, limit=request.limit // 2, include_embedding=True)
    except Exception as e:
        cites_ok = False
        if "TimeoutException" in type(e).__name__ or "timeout" in str(e).lower():
            cites_error = "Citations fetch timed out"
        else:
            cites_error = f"Citations fetch failed: {type(e).__name__}"
        logger.warning(f"get_citations failed for {paper_id}: {e}")

    all_papers = refs + cites
    if not all_papers:
        error_parts = []
        if refs_error:
            error_parts.append(refs_error)
        if cites_error:
            error_parts.append(cites_error)
        meta = ExpandMeta(
            references_ok=refs_ok,
            citations_ok=cites_ok,
            refs_count=0,
            cites_count=0,
            error_detail="; ".join(error_parts) if error_parts else None,
        )
        return StableExpandResponse(meta=meta)

    # Compute cluster centroids from existing nodes (if they have embeddings)
    existing_nodes_dicts = [n.model_dump() for n in request.existing_nodes]
    cluster_centroids = compute_cluster_centroids(existing_nodes_dicts)

    stable_nodes = []
    for paper in all_papers:
        embedding = getattr(paper, 'embedding', None)
        if embedding and existing_nodes_dicts:
            try:
                emb_array = np.array(embedding)
                ix, iy, iz = place_new_paper(emb_array, existing_nodes_dicts)
                cluster_id = assign_cluster(emb_array, cluster_centroids)
            except Exception:
                ix = random.gauss(0, 10)
                iy = random.gauss(0, 10)
                iz = random.gauss(0, 10)
                cluster_id = -1
        else:
            ix = random.gauss(0, 10)
            iy = random.gauss(0, 10)
            iz = random.gauss(0, 10)
            cluster_id = -1

        stable_nodes.append(StableExpandNode(
            paper_id=paper.paper_id,
            title=paper.title,
            year=paper.year,
            citation_count=paper.citation_count,
            venue=paper.venue,
            is_open_access=paper.is_open_access,
            doi=paper.doi,
            authors=paper.authors,
            abstract=paper.abstract,
            tldr=paper.tldr,
            fields=paper.fields_of_study,
            initial_x=ix,
            initial_y=iy,
            initial_z=iz,
            cluster_id=cluster_id,
        ))

    # Build edges connecting the expanded paper to its references/citations
    ref_ids = {p.paper_id for p in refs}
    cite_ids = {p.paper_id for p in cites}

    edges = []
    for node in stable_nodes:
        if node.paper_id in ref_ids:
            # This paper is referenced BY the expanded paper → citation edge
            edges.append({
                "source": paper_id,
                "target": node.paper_id,
                "weight": 0.5,
                "type": "citation",
            })
        if node.paper_id in cite_ids:
            # This paper CITES the expanded paper → citation edge
            edges.append({
                "source": node.paper_id,
                "target": paper_id,
                "weight": 0.5,
                "type": "citation",
            })

    error_parts = []
    if refs_error:
        error_parts.append(refs_error)
    if cites_error:
        error_parts.append(cites_error)

    meta = ExpandMeta(
        references_ok=refs_ok,
        citations_ok=cites_ok,
        refs_count=len(refs),
        cites_count=len(cites),
        error_detail="; ".join(error_parts) if error_parts else None,
    )

    return StableExpandResponse(
        nodes=stable_nodes,
        edges=edges,
        total=len(stable_nodes),
        meta=meta,
    )


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


@router.get("/api/papers/{paper_id:path}/intents", response_model=List[CitationIntent])
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


