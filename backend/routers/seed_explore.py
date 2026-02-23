"""
Seed Paper exploration router for ScholarGraph3D.

Builds a citation network starting from a single seed paper,
expanding through references and citations, then computing
similarity edges and clusters.
"""

import asyncio
import logging
import math
import time
from typing import Any, Dict, List, Optional, Set

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from graph.clusterer import PaperClusterer
from graph.embedding_reducer import EmbeddingReducer
from graph.similarity import SimilarityComputer
from graph.bridge_detector import detect_bridge_nodes
from graph.gap_detector import GapDetector
from integrations.semantic_scholar import get_s2_client, SemanticScholarRateLimitError
from services.citation_intent import CitationIntentService

logger = logging.getLogger(__name__)
router = APIRouter()


class SeedExploreRequest(BaseModel):
    paper_id: str = Field(..., description="S2 paper ID or DOI (e.g., 'DOI:10.1234/...')")
    depth: int = Field(default=1, ge=1, le=2, description="Expansion depth (1=direct, 2=two hops)")
    max_papers: int = Field(default=50, ge=10, le=200, description="Maximum papers to include")
    include_references: bool = Field(default=True)
    include_citations: bool = Field(default=True)


class SeedGraphNode(BaseModel):
    id: str
    title: str
    abstract: Optional[str] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    citation_count: int = 0
    fields: List[str] = []
    tldr: Optional[str] = None
    is_open_access: bool = False
    oa_url: Optional[str] = None
    authors: List[Dict[str, Any]] = []
    doi: Optional[str] = None
    s2_paper_id: Optional[str] = None
    oa_work_id: Optional[str] = None
    topics: List[Dict[str, Any]] = []
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    cluster_id: int = -1
    cluster_label: str = ""
    is_bridge: bool = False
    is_seed: bool = False


class SeedGraphEdge(BaseModel):
    source: str
    target: str
    type: str  # "citation" or "similarity"
    weight: float = 1.0
    intent: Optional[str] = None


class SeedClusterInfo(BaseModel):
    id: int
    label: str
    topics: List[str] = []
    paper_count: int = 0
    color: str = "#888888"
    hull_points: List[List[float]] = []


class SeedGapInfo(BaseModel):
    gap_id: str
    cluster_a: Dict[str, Any]
    cluster_b: Dict[str, Any]
    gap_strength: float
    bridge_papers: List[Dict[str, Any]] = []
    potential_edges: List[Dict[str, Any]] = []
    research_questions: List[str] = []


class SeedGraphResponse(BaseModel):
    nodes: List[SeedGraphNode]
    edges: List[SeedGraphEdge]
    clusters: List[SeedClusterInfo]
    gaps: List[SeedGapInfo] = []
    frontier_ids: List[str] = []
    meta: Dict[str, Any] = {}


def _s2_paper_to_node(paper, node_id: str, is_seed: bool = False) -> SeedGraphNode:
    """Convert SemanticScholarPaper to SeedGraphNode."""
    return SeedGraphNode(
        id=node_id,
        title=paper.title,
        abstract=paper.abstract,
        year=paper.year,
        venue=paper.venue,
        citation_count=paper.citation_count,
        fields=paper.fields_of_study,
        tldr=paper.tldr,
        is_open_access=paper.is_open_access,
        oa_url=paper.open_access_pdf_url,
        authors=paper.authors,
        doi=paper.doi,
        s2_paper_id=paper.paper_id,
        topics=[],
        is_seed=is_seed,
    )


@router.post("/api/seed-explore", response_model=SeedGraphResponse)
async def seed_explore(request: SeedExploreRequest):
    """
    Build a citation network from a seed paper.

    Pipeline:
    1. Fetch seed paper details + embedding
    2. Fetch references and citations (depth 1)
    3. Optionally fetch depth-2 connections
    4. Fetch embeddings for all papers
    5. UMAP 3D reduction
    6. HDBSCAN clustering
    7. Similarity edges
    8. Return graph
    """
    start_time = time.time()

    try:
        return await asyncio.wait_for(_seed_explore_pipeline(request, start_time), timeout=55)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Seed exploration timed out after 55 seconds. Try reducing depth or max_papers.",
        )


async def _seed_explore_pipeline(request: SeedExploreRequest, start_time: float) -> SeedGraphResponse:
    """Inner pipeline for seed_explore — wrapped by asyncio.wait_for for timeout enforcement."""
    s2_client = get_s2_client()

    # 1. Fetch seed paper
    try:
        seed_paper = await s2_client.get_paper(request.paper_id, include_embedding=True)
    except SemanticScholarRateLimitError as e:
        raise HTTPException(
            status_code=429,
            detail=f"Semantic Scholar rate limit exceeded. Please retry after {e.retry_after}s.",
        )
    if not seed_paper:
        raise HTTPException(status_code=404, detail="Seed paper not found in Semantic Scholar")

    # Track all papers by s2_paper_id to avoid duplicates
    papers_map: Dict[str, Any] = {seed_paper.paper_id: seed_paper}
    # Track citation relationships: (citing_id, cited_id)
    citation_pairs: Set[tuple] = set()

    # 2. Fetch depth-1 references and citations
    if request.include_references:
        try:
            refs = await s2_client.get_references(seed_paper.paper_id, limit=100)
            for ref in refs:
                if ref.paper_id and ref.paper_id not in papers_map:
                    papers_map[ref.paper_id] = ref
                if ref.paper_id:
                    citation_pairs.add((seed_paper.paper_id, ref.paper_id))
        except Exception as e:
            logger.warning(f"Failed to fetch references: {e}")

    if request.include_citations:
        try:
            cits = await s2_client.get_citations(seed_paper.paper_id, limit=100)
            for cit in cits:
                if cit.paper_id and cit.paper_id not in papers_map:
                    papers_map[cit.paper_id] = cit
                if cit.paper_id:
                    citation_pairs.add((cit.paper_id, seed_paper.paper_id))
        except Exception as e:
            logger.warning(f"Failed to fetch citations: {e}")

    # 3. Depth-2 expansion (optional, for connected papers)
    if request.depth >= 2 and len(papers_map) < request.max_papers:
        depth1_ids = [pid for pid in papers_map.keys() if pid != seed_paper.paper_id]
        # Sample up to 10 papers for depth-2 to limit API calls
        sample_ids = depth1_ids[:10]

        async def _fetch_depth2(pid: str):
            try:
                refs = await s2_client.get_references(pid, limit=20)
                return (pid, refs)
            except Exception:
                return (pid, [])

        d2_tasks = [_fetch_depth2(pid) for pid in sample_ids]
        d2_results = await asyncio.gather(*d2_tasks)
        for parent_pid, d2_refs in d2_results:
            for ref in d2_refs:
                if ref.paper_id and ref.paper_id not in papers_map and len(papers_map) < request.max_papers:
                    papers_map[ref.paper_id] = ref
                if ref.paper_id:
                    citation_pairs.add((parent_pid, ref.paper_id))

    # Trim to max_papers (keep seed + highest cited)
    if len(papers_map) > request.max_papers:
        all_papers_list = list(papers_map.values())
        # Always keep seed
        others = [p for p in all_papers_list if p.paper_id != seed_paper.paper_id]
        others.sort(key=lambda p: p.citation_count, reverse=True)
        kept = [seed_paper] + others[:request.max_papers - 1]
        papers_map = {p.paper_id: p for p in kept}

    # 4. Fetch embeddings for papers that don't have them
    papers_needing_embeddings = [
        pid for pid, p in papers_map.items() if p.embedding is None
    ]
    if papers_needing_embeddings:
        try:
            embedded = await s2_client.get_papers_batch(
                papers_needing_embeddings, include_embedding=True
            )
            for ep in embedded:
                if ep.paper_id in papers_map and ep.embedding:
                    papers_map[ep.paper_id].embedding = ep.embedding
        except Exception as e:
            logger.warning(f"Embedding fetch failed: {e}")

    # Build ordered list and filter for embeddings
    all_papers = list(papers_map.values())
    papers_with_emb = [p for p in all_papers if p.embedding is not None]
    papers_without_emb = [p for p in all_papers if p.embedding is None]

    logger.info(f"Seed explore: {len(all_papers)} papers, {len(papers_with_emb)} with embeddings")

    nodes: List[SeedGraphNode] = []
    edges: List[SeedGraphEdge] = []
    clusters_info: List[SeedClusterInfo] = []

    if len(papers_with_emb) >= 2:
        embeddings = np.array([p.embedding for p in papers_with_emb])
        paper_ids = [p.paper_id for p in papers_with_emb]
        s2_to_node = {p.paper_id: p.paper_id for p in papers_with_emb}

        # 5. UMAP 3D with temporal Z-axis (Z = publication year)
        reducer = EmbeddingReducer()
        years = [p.year for p in papers_with_emb]
        coords_3d = await asyncio.to_thread(
            lambda: reducer.reduce_to_3d(embeddings, years=years, use_temporal_z=True)
        )

        # 6. HDBSCAN clustering on high-dim embeddings (avoids double-distortion bug)
        # v0.7.0: pass 768-dim embeddings; clusterer internally reduces to 50D UMAP
        clusterer = PaperClusterer()
        min_cluster = max(3, min(5, len(papers_with_emb) // 5))
        cluster_labels = await asyncio.to_thread(clusterer.cluster, embeddings, min_cluster)
        paper_dicts = [{
            "title": p.title,
            "abstract": p.abstract or "",
            "fields_of_study": p.fields_of_study,
            "oa_topics": [],
        } for p in papers_with_emb]
        cluster_meta = clusterer.label_clusters(paper_dicts, cluster_labels)
        # Deduplicate cluster labels (e.g., multiple "Computer Science" clusters)
        label_counts: Dict[str, int] = {}
        for cid, info in cluster_meta.items():
            label = info["label"]
            if label in label_counts:
                label_counts[label] += 1
                info["label"] = f"{label} ({label_counts[label]})"
            else:
                label_counts[label] = 1
        for cid, info in cluster_meta.items():
            base_label = info["label"].split(" (")[0]
            if label_counts.get(base_label, 0) > 1 and "(" not in info["label"]:
                info["label"] = f"{base_label} (1)"
        hulls = clusterer.compute_hulls(coords_3d, cluster_labels)

        # 7. Similarity edges
        sim_computer = SimilarityComputer()
        sim_edges = await asyncio.to_thread(
            sim_computer.compute_edges, embeddings, paper_ids, 0.7
        )

        # Build nodes
        for i, paper in enumerate(papers_with_emb):
            cid = int(cluster_labels[i])
            c_info = cluster_meta.get(cid, {})
            is_seed = paper.paper_id == seed_paper.paper_id
            node = _s2_paper_to_node(paper, paper_ids[i], is_seed=is_seed)
            node.x = float(coords_3d[i][0])
            node.y = float(coords_3d[i][1])
            node.z = float(coords_3d[i][2])
            node.cluster_id = cid
            node.cluster_label = c_info.get("label", "")
            nodes.append(node)

        # Bridge detection
        node_dicts = [{"id": n.id, "cluster_id": n.cluster_id} for n in nodes]
        edge_dicts = [{"source": e["source"], "target": e["target"]} for e in sim_edges]
        bridge_ids = detect_bridge_nodes(node_dicts, edge_dicts)
        for n in nodes:
            if n.id in bridge_ids:
                n.is_bridge = True

        # Similarity edges
        for edge in sim_edges:
            edges.append(SeedGraphEdge(
                source=edge["source"],
                target=edge["target"],
                type="similarity",
                weight=edge["similarity"],
            ))

        # Citation edges (from tracked pairs) with real S2 intents
        # First, build citation edges with default intent
        citation_edge_map: Dict[tuple, SeedGraphEdge] = {}
        matched = 0
        unmatched = 0
        for citing_id, cited_id in citation_pairs:
            src = s2_to_node.get(citing_id)
            tgt = s2_to_node.get(cited_id)
            if not src or not tgt:
                unmatched += 1
                continue
            if src and tgt:
                edge = SeedGraphEdge(
                    source=src,
                    target=tgt,
                    type="citation",
                    weight=0.8,
                    intent="background",
                )
                matched += 1
                citation_edge_map[(citing_id, cited_id)] = edge
                edges.append(edge)

        logger.info(f"Citation edges: {matched} matched, {unmatched} unmatched (pairs={len(citation_pairs)}, s2_to_node={len(s2_to_node)})")

        # Fetch real citation intents from S2 (best-effort, non-blocking)
        try:
            intent_service = CitationIntentService()
            # Get intents for the seed paper (covers most edges)
            seed_intents = await intent_service.get_basic_intents(
                seed_paper.paper_id, s2_client
            )
            # Build lookup: (citing_s2_id, cited_s2_id) -> intent
            intent_lookup: Dict[tuple, str] = {}
            for ci in seed_intents:
                intent_lookup[(ci["citing_id"], ci["cited_id"])] = ci.get("intent", "background")

            # Apply intents to citation edges
            updated_count = 0
            for (citing_id, cited_id), edge in citation_edge_map.items():
                intent = intent_lookup.get((citing_id, cited_id))
                if not intent:
                    # Try reverse lookup (cited paper's citations)
                    intent = intent_lookup.get((cited_id, citing_id))
                if intent:
                    edge.intent = intent
                    updated_count += 1

            logger.info(f"Updated {updated_count}/{len(citation_edge_map)} citation edges with S2 intents")
        except Exception as e:
            logger.warning(f"Citation intent fetch failed (non-fatal): {e}")

        # Cluster info
        for cid, info in cluster_meta.items():
            hull_verts = hulls.get(cid, [])
            clusters_info.append(SeedClusterInfo(
                id=cid,
                label=info["label"],
                topics=info["topic_names"],
                paper_count=info["paper_count"],
                color=info["color"],
                hull_points=hull_verts,
            ))

        # Add papers without embeddings at periphery
        offset = len(papers_with_emb)
        for i, paper in enumerate(papers_without_emb):
            is_seed = paper.paper_id == seed_paper.paper_id
            node = _s2_paper_to_node(paper, paper.paper_id, is_seed=is_seed)
            node.x = float(offset + i) * 0.5
            node.y = 10.0
            node.z = 0.0
            node.cluster_id = -1
            node.cluster_label = "Unclustered"
            nodes.append(node)

    else:
        # Not enough for graph — arrange in spiral
        s2_to_node = {}
        for i, paper in enumerate(all_papers):
            angle = i * 0.5
            radius = 5.0 + i * 0.3
            is_seed = paper.paper_id == seed_paper.paper_id
            node = _s2_paper_to_node(paper, paper.paper_id, is_seed=is_seed)
            node.x = radius * math.cos(angle)
            node.y = float(i) * 0.2
            node.z = radius * math.sin(angle)
            node.cluster_id = 0
            nodes.append(node)
            s2_to_node[paper.paper_id] = paper.paper_id

        # Citation edges
        for citing_id, cited_id in citation_pairs:
            src = s2_to_node.get(citing_id)
            tgt = s2_to_node.get(cited_id)
            if src and tgt:
                edges.append(SeedGraphEdge(
                    source=src, target=tgt, type="citation", weight=0.8,
                ))

    # 9. Gap detection
    gaps_info: List[SeedGapInfo] = []
    frontier_ids: List[str] = []

    if len(clusters_info) >= 2 and len(nodes) >= 5:
        try:
            gap_detector = GapDetector()
            gap_papers = [{
                "id": n.id,
                "title": n.title,
                "cluster_id": n.cluster_id,
                "embedding": next(
                    (p.embedding for p in papers_with_emb if p.paper_id == n.id),
                    None
                ),
            } for n in nodes]
            gap_clusters = [{"id": c.id, "label": c.label, "paper_count": c.paper_count} for c in clusters_info]
            gap_edges = [{"source": e.source, "target": e.target, "type": e.type, "weight": e.weight} for e in edges]

            gap_result = await asyncio.to_thread(
                gap_detector.detect_gaps, gap_papers, gap_clusters, gap_edges
            )

            for gap in gap_result.gaps[:10]:  # Limit to top 10 gaps
                gaps_info.append(SeedGapInfo(
                    gap_id=gap.gap_id,
                    cluster_a=gap.cluster_a,
                    cluster_b=gap.cluster_b,
                    gap_strength=gap.gap_strength,
                    bridge_papers=gap.bridge_papers,
                    potential_edges=gap.potential_edges,
                    research_questions=[],
                ))

            # Generate research questions via Groq (best-effort)
            try:
                from config import settings
                if settings.groq_api_key and gaps_info:
                    from llm.groq_provider import GroqProvider
                    groq = GroqProvider(api_key=settings.groq_api_key)
                    try:
                        top_gaps = gaps_info[:3]
                        gap_descriptions = []
                        for g in top_gaps:
                            gap_descriptions.append(
                                f"Gap between '{g.cluster_a.get('label', '')}' "
                                f"({g.cluster_a.get('paper_count', 0)} papers) and "
                                f"'{g.cluster_b.get('label', '')}' "
                                f"({g.cluster_b.get('paper_count', 0)} papers), "
                                f"strength: {g.gap_strength:.2f}"
                            )

                        prompt = (
                            f"You are a research advisor analyzing a citation network about '{seed_paper.title}'. "
                            f"The following structural gaps exist between paper clusters:\n\n"
                            + "\n".join(f"{i+1}. {d}" for i, d in enumerate(gap_descriptions))
                            + "\n\nFor each gap, suggest 2 specific research questions that could bridge it. "
                            "Return ONLY the questions, numbered like '1a. ...', '1b. ...', '2a. ...', etc."
                        )
                        resp = await groq.generate(prompt, max_tokens=500, temperature=0.7)
                        if resp and resp.content:
                            lines = [l.strip() for l in resp.content.strip().split("\n") if l.strip()]
                            for line in lines:
                                # Parse "1a. question" format
                                if len(line) >= 3 and line[0].isdigit():
                                    gap_idx = int(line[0]) - 1
                                    question = line[3:].strip() if len(line) > 3 else line
                                    if 0 <= gap_idx < len(top_gaps):
                                        top_gaps[gap_idx].research_questions.append(question)
                    finally:
                        await groq.close()
            except Exception as e:
                logger.warning(f"Gap research question generation failed (non-fatal): {e}")

            logger.info(f"Gap detection: {len(gaps_info)} gaps found")
        except Exception as e:
            logger.warning(f"Gap detection failed (non-fatal): {e}")

    # 10. Frontier detection — papers with many unexplored connections
    if nodes:
        node_ids_in_graph = {n.id for n in nodes}
        for n in nodes:
            paper_obj = papers_map.get(n.id)
            if paper_obj:
                total_conns = (paper_obj.reference_count or 0) + (paper_obj.citation_count or 0)
                in_graph = sum(1 for e in edges if e.source == n.id or e.target == n.id)
                if total_conns > 5:
                    explored_ratio = in_graph / min(total_conns, 50)
                    if explored_ratio < 0.3:
                        frontier_ids.append(n.id)

    elapsed = time.time() - start_time
    meta = {
        "query": f"seed:{request.paper_id}",
        "total": len(nodes),
        "seed_paper_id": seed_paper.paper_id,
        "seed_title": seed_paper.title,
        "citation_edges": len([e for e in edges if e.type == "citation"]),
        "similarity_edges": len([e for e in edges if e.type == "similarity"]),
        "clusters": len([c for c in clusters_info if c.id != -1]),
        "gaps": len(gaps_info),
        "frontier_papers": len(frontier_ids),
        "depth": request.depth,
        "elapsed_seconds": round(elapsed, 2),
        "oa_credits_used": 0,
    }

    return SeedGraphResponse(
        nodes=nodes, edges=edges, clusters=clusters_info,
        gaps=gaps_info, frontier_ids=frontier_ids, meta=meta,
    )
