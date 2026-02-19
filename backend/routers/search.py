"""
Search router for ScholarGraph3D.

Main search endpoint that orchestrates:
1. DataFusionService search (OA + S2)
2. UMAP 3D reduction
3. HDBSCAN clustering
4. Similarity edge computation
5. Citation edge fetching
"""

import hashlib
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import settings
from database import Database, get_db
from graph.clusterer import PaperClusterer
from graph.embedding_reducer import EmbeddingReducer
from graph.similarity import SimilarityComputer
from integrations.data_fusion import DataFusionService, UnifiedPaper
from integrations.openalex import OpenAlexClient
from integrations.semantic_scholar import SemanticScholarClient

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Request/Response Models ====================

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=200, ge=1, le=500)
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    fields_of_study: Optional[List[str]] = None
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    min_cluster_size: int = Field(default=5, ge=2, le=50)


class GraphNode(BaseModel):
    id: str
    title: str
    abstract: Optional[str] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    citation_count: int = 0
    fields: List[str] = []                    # was fields_of_study
    tldr: Optional[str] = None
    is_open_access: bool = False
    oa_url: Optional[str] = None
    authors: List[Dict[str, Any]] = []
    doi: Optional[str] = None
    s2_paper_id: Optional[str] = None
    oa_work_id: Optional[str] = None
    topics: List[Dict[str, Any]] = []         # NEW: OA topics
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    cluster_id: int = -1                      # was cluster
    cluster_label: str = ""                   # NEW


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str  # "similarity" or "citation"
    weight: float = 1.0


class ClusterInfo(BaseModel):
    id: int
    label: str
    topics: List[str] = []                    # was topic_names
    paper_count: int = 0
    color: str = "#888888"
    hull_points: List[List[float]] = []       # was hull_vertices


class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    clusters: List[ClusterInfo]
    meta: Dict[str, Any] = {}


# ==================== Helpers ====================

def _cache_key(query: str, limit: int, year_range: Optional[Tuple], fields: Optional[List[str]]) -> str:
    """Generate a cache key for the search query."""
    key_data = {
        "query": query.lower().strip(),
        "limit": limit,
        "year_range": year_range,
        "fields": sorted(fields) if fields else None,
    }
    return hashlib.sha256(json.dumps(key_data, sort_keys=True).encode()).hexdigest()


def _create_clients() -> Tuple[OpenAlexClient, SemanticScholarClient]:
    """Create API clients with configured credentials."""
    oa_client = OpenAlexClient(
        email=settings.oa_email or None,
        api_key=settings.oa_api_key or None,
        daily_credit_limit=settings.oa_daily_credit_limit,
    )
    s2_client = SemanticScholarClient(
        api_key=settings.s2_api_key or None,
        requests_per_second=settings.s2_rate_limit,
    )
    return oa_client, s2_client


# ==================== Endpoint ====================

@router.post("/api/search", response_model=GraphResponse)
async def search_papers(request: SearchRequest, db: Database = Depends(get_db)):
    """
    Search papers and return a 3D graph visualization.

    Pipeline:
    1. Check cache (24h TTL for same query)
    2. DataFusionService.search() -> papers with embeddings
    3. EmbeddingReducer.reduce_to_3d() -> 3D coords
    4. PaperClusterer.cluster() -> clusters + labels + hulls
    5. SimilarityComputer.compute_edges() -> similarity edges
    6. Fetch citation edges from S2
    7. Cache results in PostgreSQL
    8. Return GraphResponse
    """
    start_time = time.time()

    year_range = None
    if request.year_start and request.year_end:
        year_range = (request.year_start, request.year_end)
    elif request.year_start:
        year_range = (request.year_start, 2030)
    elif request.year_end:
        year_range = (1900, request.year_end)

    cache_hash = _cache_key(request.query, request.limit, year_range, request.fields_of_study)

    # 1. Check cache (24h TTL)
    if db.is_connected:
        try:
            cached = await db.fetchrow(
                """
                SELECT nodes, edges, clusters, meta
                FROM search_cache
                WHERE cache_key = $1
                  AND created_at > NOW() - INTERVAL '24 hours'
                """,
                cache_hash,
            )
            if cached:
                logger.info(f"Cache hit for query '{request.query}'")
                return GraphResponse(
                    nodes=[GraphNode(**n) for n in cached["nodes"]],
                    edges=[GraphEdge(**e) for e in cached["edges"]],
                    clusters=[ClusterInfo(**c) for c in cached["clusters"]],
                    meta=cached["meta"],
                )
        except Exception as e:
            # Cache table might not exist yet — that's fine
            logger.debug(f"Cache lookup skipped: {e}")

    # 2. DataFusionService search
    oa_client, s2_client = _create_clients()
    try:
        fusion = DataFusionService(oa_client=oa_client, s2_client=s2_client)
        papers = await fusion.search(
            query=request.query,
            limit=request.limit,
            year_range=year_range,
            fields=request.fields_of_study,
        )
    finally:
        await oa_client.close()
        await s2_client.close()

    if not papers:
        return GraphResponse(nodes=[], edges=[], clusters=[], meta={"query": request.query, "total": 0})

    # Filter papers with embeddings for graph computation
    papers_with_embeddings = [p for p in papers if p.embedding is not None]
    papers_without_embeddings = [p for p in papers if p.embedding is None]

    logger.info(
        f"Search '{request.query}': {len(papers)} total, "
        f"{len(papers_with_embeddings)} with embeddings"
    )

    # Build graph from papers with embeddings
    nodes: List[GraphNode] = []
    edges: List[GraphEdge] = []
    clusters_info: List[ClusterInfo] = []

    if len(papers_with_embeddings) >= 2:
        embeddings = np.array([p.embedding for p in papers_with_embeddings])
        paper_ids = [str(i) for i in range(len(papers_with_embeddings))]

        # 3. UMAP 3D reduction
        reducer = EmbeddingReducer()
        coords_3d = reducer.reduce_to_3d(embeddings)

        # 4. HDBSCAN clustering
        clusterer = PaperClusterer()
        cluster_labels = clusterer.cluster(embeddings, min_cluster_size=request.min_cluster_size)

        paper_dicts = [p.to_dict() for p in papers_with_embeddings]
        cluster_meta = clusterer.label_clusters(paper_dicts, cluster_labels)
        hulls = clusterer.compute_hulls(coords_3d, cluster_labels)

        # 5. Similarity edges
        sim_computer = SimilarityComputer()
        sim_edges = sim_computer.compute_edges(
            embeddings, paper_ids,
            threshold=request.similarity_threshold,
        )

        # Build nodes
        for i, paper in enumerate(papers_with_embeddings):
            cid = int(cluster_labels[i])
            c_info = cluster_meta.get(cid, {})
            nodes.append(GraphNode(
                id=paper_ids[i],
                title=paper.title,
                abstract=paper.abstract,
                year=paper.year,
                venue=paper.venue,
                citation_count=paper.citation_count,
                fields=paper.fields_of_study,
                tldr=paper.tldr,
                is_open_access=paper.is_open_access,
                oa_url=paper.oa_url,
                authors=paper.authors,
                doi=paper.doi,
                s2_paper_id=paper.s2_paper_id,
                oa_work_id=paper.oa_work_id,
                topics=paper.oa_topics,
                x=float(coords_3d[i][0]),
                y=float(coords_3d[i][1]),
                z=float(coords_3d[i][2]),
                cluster_id=cid,
                cluster_label=c_info.get("label", ""),
            ))

        # Build edges
        for edge in sim_edges:
            edges.append(GraphEdge(
                source=edge["source"],
                target=edge["target"],
                type="similarity",
                weight=edge["similarity"],
            ))

        # Build cluster info
        for cid, info in cluster_meta.items():
            hull_verts = hulls.get(cid, [])
            clusters_info.append(ClusterInfo(
                id=cid,
                label=info["label"],
                topics=info["topic_names"],
                paper_count=info["paper_count"],
                color=info["color"],
                hull_points=hull_verts,
            ))

    else:
        # Not enough embeddings for graph — return flat list
        for i, paper in enumerate(papers):
            nodes.append(GraphNode(
                id=str(i),
                title=paper.title,
                abstract=paper.abstract,
                year=paper.year,
                venue=paper.venue,
                citation_count=paper.citation_count,
                fields=paper.fields_of_study,
                tldr=paper.tldr,
                is_open_access=paper.is_open_access,
                oa_url=paper.oa_url,
                authors=paper.authors,
                doi=paper.doi,
                s2_paper_id=paper.s2_paper_id,
                oa_work_id=paper.oa_work_id,
                topics=paper.oa_topics,
                x=float(i),
                y=0.0,
                z=0.0,
                cluster_id=0,
                cluster_label="",
            ))

    # Also include papers without embeddings at the periphery
    offset = len(papers_with_embeddings)
    for i, paper in enumerate(papers_without_embeddings):
        nodes.append(GraphNode(
            id=str(offset + i),
            title=paper.title,
            abstract=paper.abstract,
            year=paper.year,
            venue=paper.venue,
            citation_count=paper.citation_count,
            fields=paper.fields_of_study,
            tldr=paper.tldr,
            is_open_access=paper.is_open_access,
            oa_url=paper.oa_url,
            authors=paper.authors,
            doi=paper.doi,
            s2_paper_id=paper.s2_paper_id,
            oa_work_id=paper.oa_work_id,
            topics=paper.oa_topics,
            x=float(offset + i) * 0.5,
            y=10.0,
            z=0.0,
            cluster_id=-1,
            cluster_label="Unclustered",
        ))

    elapsed = time.time() - start_time
    meta = {
        "query": request.query,
        "total": len(nodes),
        "with_embeddings": len(papers_with_embeddings),
        "clusters": len([c for c in clusters_info if c.id != -1]),
        "similarity_edges": len([e for e in edges if e.type == "similarity"]),
        "elapsed_seconds": round(elapsed, 2),
    }

    # 7. Cache results
    if db.is_connected:
        try:
            await db.execute(
                """
                INSERT INTO search_cache (cache_key, nodes, edges, clusters, meta)
                VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
                ON CONFLICT (cache_key) DO UPDATE
                SET nodes = EXCLUDED.nodes,
                    edges = EXCLUDED.edges,
                    clusters = EXCLUDED.clusters,
                    meta = EXCLUDED.meta,
                    created_at = NOW()
                """,
                cache_hash,
                json.dumps([n.model_dump() for n in nodes]),
                json.dumps([e.model_dump() for e in edges]),
                json.dumps([c.model_dump() for c in clusters_info]),
                json.dumps(meta),
            )
        except Exception as e:
            logger.debug(f"Cache write skipped: {e}")

    logger.info(f"Search '{request.query}' completed in {elapsed:.2f}s: {len(nodes)} nodes, {len(edges)} edges")

    return GraphResponse(nodes=nodes, edges=edges, clusters=clusters_info, meta=meta)
