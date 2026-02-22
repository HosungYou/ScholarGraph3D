"""
Search router for ScholarGraph3D.

Main search endpoint that orchestrates:
1. DataFusionService search (OA + S2)
2. UMAP 3D reduction
3. HDBSCAN clustering
4. Similarity edge computation
5. Citation edge fetching
"""

import asyncio
import hashlib
import json
import logging
import math
import time
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from config import settings
from database import Database, get_db
from graph.bridge_detector import detect_bridge_nodes
from graph.clusterer import PaperClusterer
from graph.embedding_reducer import EmbeddingReducer
from graph.similarity import SimilarityComputer
from integrations.data_fusion import DataFusionService, UnifiedPaper
from integrations.openalex import OpenAlexClient
from integrations.semantic_scholar import SemanticScholarClient, get_s2_client

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

    @model_validator(mode='before')
    @classmethod
    def accept_legacy_params(cls, data):
        if isinstance(data, dict):
            if 'year_min' in data and 'year_start' not in data:
                data['year_start'] = data.pop('year_min')
            if 'year_max' in data and 'year_end' not in data:
                data['year_end'] = data.pop('year_max')
            if 'field' in data and 'fields_of_study' not in data:
                field_val = data.pop('field')
                if isinstance(field_val, str):
                    data['fields_of_study'] = [field_val]
                else:
                    data['fields_of_study'] = field_val
        return data


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
    is_bridge: bool = False


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str  # "similarity" or "citation"
    weight: float = 1.0
    # Best-effort intent classification.
    # For similarity edges: heuristic based on edge weight.
    # For citation edges: S2 intent when available (methodology/background/result_comparison).
    # Full LLM-enhanced intent (supports/contradicts/extends/applies/compares)
    # is available via the dedicated POST /api/papers/{id}/intents endpoint.
    intent: Optional[str] = None


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
    """Create OA client + get shared S2 singleton. Do NOT close S2 client."""
    oa_client = OpenAlexClient(
        email=settings.oa_email or None,
        api_key=settings.oa_api_key or None,
        daily_credit_limit=settings.oa_daily_credit_limit,
    )
    return oa_client, get_s2_client()


# ==================== Background Citation Enrichment ====================

async def _enrich_citations_background(
    s2_client: SemanticScholarClient,
    s2_paper_ids: List[str],
    s2_to_node_id: Dict[str, str],
    nodes: List,
    edges: List,
    cache_hash: str,
    db: Database,
    clusters_info: List,
    meta_base: Dict[str, Any],
) -> None:
    """
    Fetch citation edges from S2 as a background task (detached from response).

    Runs after the main search response is already sent. Results are written
    to the DB cache so that the NEXT identical search returns citation edges
    from cache (instant) rather than re-fetching.

    v0.8.0: Detached from critical path to reduce search latency ~20s.
    """
    citation_edges_added = 0
    failed_count = 0
    try:
        existing_edge_keys = {(e.source, e.target) for e in edges}
        s2_id_set = set(s2_paper_ids)

        # Limit to top-20 by citation count to cap API calls
        nodes_with_s2 = [(n, n.citation_count) for n in nodes if n.s2_paper_id]
        nodes_with_s2.sort(key=lambda x: x[1], reverse=True)
        batch_s2_ids = [n.s2_paper_id for n, _ in nodes_with_s2[:20]]

        for s2_id in batch_s2_ids:
            try:
                refs = await s2_client.get_references(s2_id, limit=200, include_embedding=False)
                source_node_id = s2_to_node_id[s2_id]

                for ref_paper in refs:
                    if ref_paper.paper_id in s2_id_set:
                        target_node_id = s2_to_node_id[ref_paper.paper_id]
                        edge_key = (source_node_id, target_node_id)
                        reverse_key = (target_node_id, source_node_id)

                        if edge_key not in existing_edge_keys and reverse_key not in existing_edge_keys:
                            edges.append(GraphEdge(
                                source=source_node_id,
                                target=target_node_id,
                                type="citation",
                                weight=0.8,
                                intent="background",
                            ))
                            existing_edge_keys.add(edge_key)
                            citation_edges_added += 1
            except Exception:
                failed_count += 1
                continue

        logger.info(
            f"[bg] Citation enrichment for {cache_hash[:8]}: "
            f"+{citation_edges_added} edges ({failed_count} skipped)"
        )

        # Update DB cache to include citation edges for next request
        if db.is_connected and citation_edges_added > 0:
            meta_updated = {
                **meta_base,
                "citation_edges": citation_edges_added,
                "citation_enriched": True,
            }
            try:
                await db.execute(
                    """
                    INSERT INTO search_cache (cache_key, nodes, edges, clusters, meta)
                    VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
                    ON CONFLICT (cache_key) DO UPDATE
                    SET edges = EXCLUDED.edges,
                        meta = EXCLUDED.meta,
                        created_at = NOW()
                    """,
                    cache_hash,
                    json.dumps([n.model_dump() for n in nodes]),
                    json.dumps([e.model_dump() for e in edges]),
                    json.dumps([c.model_dump() for c in clusters_info]),
                    json.dumps(meta_updated),
                )
                logger.info(f"[bg] Cache updated with citation edges for {cache_hash[:8]}")
            except Exception as e:
                logger.debug(f"[bg] Cache update skipped: {e}")

    except Exception as e:
        logger.warning(f"[bg] Citation enrichment failed: {e}")


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
        # NOTE: s2_client kept open for citation enrichment

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
    bridge_ids: Set[str] = set()
    citation_edges_added = 0

    if len(papers_with_embeddings) >= 2:
        embeddings = np.array([p.embedding for p in papers_with_embeddings])
        paper_ids = [str(i) for i in range(len(papers_with_embeddings))]

        # 3. UMAP 3D reduction with temporal Z-axis (Z = publication year)
        reducer = EmbeddingReducer()
        years = [p.year for p in papers_with_embeddings]
        coords_3d = await asyncio.to_thread(
            lambda: reducer.reduce_to_3d(embeddings, years=years, use_temporal_z=True)
        )

        # 4. HDBSCAN clustering on high-dim embeddings (avoids double-distortion bug)
        # v0.7.0: pass 768-dim embeddings; clusterer internally reduces to 50D UMAP
        clusterer = PaperClusterer()
        cluster_labels = await asyncio.to_thread(clusterer.cluster, embeddings, request.min_cluster_size)

        paper_dicts = [p.to_dict() for p in papers_with_embeddings]
        cluster_meta = clusterer.label_clusters(paper_dicts, cluster_labels)
        hulls = clusterer.compute_hulls(coords_3d, cluster_labels)

        # 5. Similarity edges
        sim_computer = SimilarityComputer()
        sim_edges = await asyncio.to_thread(
            sim_computer.compute_edges,
            embeddings, paper_ids,
            request.similarity_threshold,
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

        # Detect bridge nodes
        node_dicts = [{"id": n.id, "cluster_id": n.cluster_id} for n in nodes]
        edge_dicts = [{"source": e["source"], "target": e["target"]} for e in sim_edges]
        bridge_ids = detect_bridge_nodes(node_dicts, edge_dicts)
        # Mark bridge nodes
        for n in nodes:
            if n.id in bridge_ids:
                n.is_bridge = True

        # Build edges with best-effort heuristic intent for similarity edges.
        # High-weight similarity (>= 0.85) suggests the papers mutually support
        # each other's findings; lower similarity defaults to "background".
        for edge in sim_edges:
            similarity = edge["similarity"]
            if similarity >= 0.85:
                heuristic_intent = "supports"
            else:
                heuristic_intent = "background"
            edges.append(GraphEdge(
                source=edge["source"],
                target=edge["target"],
                type="similarity",
                weight=similarity,
                intent=heuristic_intent,
            ))

        # 6. Citation enrichment: find actual citations between result papers
        # Build s2_paper_id → node_id mapping
        s2_to_node_id = {}
        for node in nodes:
            if node.s2_paper_id:
                s2_to_node_id[node.s2_paper_id] = node.id

        s2_paper_ids = list(s2_to_node_id.keys())

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

        if len(s2_paper_ids) >= 2:
            # 6. Citation enrichment: detached from response critical path (v0.8.0).
            # The background task fetches citation edges and updates the DB cache.
            # The NEXT identical search will return citation edges from cache (instant).
            # NOTE: Task created AFTER clusters are built, with list copies to avoid
            # shared-reference mutation bugs (race condition fix).
            asyncio.create_task(
                _enrich_citations_background(
                    s2_client=s2_client,
                    s2_paper_ids=s2_paper_ids,
                    s2_to_node_id=s2_to_node_id,
                    nodes=list(nodes),
                    edges=list(edges),
                    cache_hash=cache_hash,
                    db=db,
                    clusters_info=list(clusters_info),
                    meta_base={
                        "query": request.query,
                        "total": len(nodes),
                        "with_embeddings": len(papers_with_embeddings),
                        "clusters": len([c for c in clusters_info if c.id != -1]),
                        "similarity_edges": len([e for e in edges if e.type == "similarity"]),
                        "bridge_nodes": len(bridge_ids),
                    },
                )
            )
            # s2_client is a shared singleton — never close it

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

    else:
        # Not enough embeddings for graph — arrange in 3D spiral
        for i, paper in enumerate(papers):
            angle = i * 0.5
            radius = 5.0 + i * 0.3
            nodes.append(GraphNode(
                id=str(i),
                title=paper.title,
                abstract=paper.abstract,
                year=paper.year or 2000,
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
                x=radius * math.cos(angle),
                y=float(i) * 0.2,
                z=radius * math.sin(angle),
                cluster_id=0,
                cluster_label="",
            ))

    elapsed = time.time() - start_time
    meta = {
        "query": request.query,
        "total": len(nodes),
        "with_embeddings": len(papers_with_embeddings),
        "clusters": len([c for c in clusters_info if c.id != -1]),
        "similarity_edges": len([e for e in edges if e.type == "similarity"]),
        "citation_edges": 0,  # enriched asynchronously; non-zero on cache hit
        "citation_enriched": False,  # set to True by background task on cache update
        "bridge_nodes": len(bridge_ids),
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
