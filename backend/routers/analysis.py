"""
Analysis router for ScholarGraph3D.

Provides trend analysis, gap detection, and LLM-powered hypothesis
generation endpoints for Phase 2 AI features.
"""

import asyncio
import json
import logging
from dataclasses import asdict
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from fastapi import Query as QueryParam
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from graph.gap_detector import GapDetector
from graph.trend_analyzer import TrendAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Request/Response Models ====================

class ClusterInput(BaseModel):
    id: int
    label: str = ""
    topics: List[str] = []
    paper_count: int = 0


class PaperInput(BaseModel):
    id: str
    title: str = ""
    abstract: Optional[str] = None
    year: Optional[int] = None
    citation_count: int = 0
    cluster_id: int = -1
    cluster_label: str = ""
    tldr: Optional[str] = None
    embedding: Optional[List[float]] = None
    authors: List[Dict[str, Any]] = []
    fields: List[str] = []


class EdgeInput(BaseModel):
    source: str
    target: str
    type: str = "similarity"
    weight: float = 1.0


# -- Trend models --

class TrendRequest(BaseModel):
    papers: List[PaperInput]
    clusters: List[ClusterInput]


class ClusterTrendResponse(BaseModel):
    cluster_id: int
    cluster_label: str
    classification: str
    paper_count: int
    year_range: List[int]  # [min_year, max_year]
    year_distribution: Dict[str, int]  # year_str -> count (JSON keys must be strings)
    trend_strength: float
    velocity: float
    representative_papers: List[str]


class TrendAnalysisResponse(BaseModel):
    emerging: List[ClusterTrendResponse]
    stable: List[ClusterTrendResponse]
    declining: List[ClusterTrendResponse]
    summary: Dict[str, Any]


# -- Gap models --

class GapRequest(BaseModel):
    papers: List[PaperInput]
    clusters: List[ClusterInput]
    edges: List[EdgeInput] = []


class BridgePaper(BaseModel):
    paper_id: str
    title: str
    score: float


class PotentialEdge(BaseModel):
    source: str
    target: str
    similarity: float


class StructuralGapResponse(BaseModel):
    gap_id: str
    cluster_a: Dict[str, Any]
    cluster_b: Dict[str, Any]
    gap_strength: float
    bridge_papers: List[BridgePaper]
    potential_edges: List[PotentialEdge]
    research_questions: List[str]


class GapAnalysisResponse(BaseModel):
    gaps: List[StructuralGapResponse]
    cluster_connectivity_matrix: Dict[str, int]
    summary: Dict[str, Any]


# -- Hypothesis models --

class HypothesisRequest(BaseModel):
    provider: str = Field(..., description="LLM provider: openai|anthropic|google|groq")
    api_key: str = Field(..., min_length=1, description="User's LLM API key")
    model: Optional[str] = None
    gap: StructuralGapResponse


class HypothesisResponse(BaseModel):
    gap_id: str
    hypotheses: List[str]
    provider: str
    model: str


# ==================== Helpers ====================

def _trend_to_response(trend) -> ClusterTrendResponse:
    """Convert ClusterTrend dataclass to response model."""
    return ClusterTrendResponse(
        cluster_id=trend.cluster_id,
        cluster_label=trend.cluster_label,
        classification=trend.classification,
        paper_count=trend.paper_count,
        year_range=list(trend.year_range),
        year_distribution={str(k): v for k, v in trend.year_distribution.items()},
        trend_strength=trend.trend_strength,
        velocity=trend.velocity,
        representative_papers=trend.representative_papers,
    )


def _gap_to_response(gap) -> StructuralGapResponse:
    """Convert StructuralGap dataclass to response model."""
    return StructuralGapResponse(
        gap_id=gap.gap_id,
        cluster_a=gap.cluster_a,
        cluster_b=gap.cluster_b,
        gap_strength=gap.gap_strength,
        bridge_papers=[
            BridgePaper(**bp) for bp in gap.bridge_papers
        ],
        potential_edges=[
            PotentialEdge(**pe) for pe in gap.potential_edges
        ],
        research_questions=gap.research_questions,
    )


# ==================== Endpoints ====================

@router.post("/api/analysis/trends", response_model=TrendAnalysisResponse)
async def analyze_trends(request: TrendRequest):
    """
    Analyze temporal trends across research clusters.

    Classifies each cluster as emerging, stable, or declining based
    on the temporal distribution of its papers.
    """
    papers_dicts = [p.model_dump() for p in request.papers]
    clusters_dicts = [c.model_dump() for c in request.clusters]

    analyzer = TrendAnalyzer()
    result = analyzer.analyze_trends(papers_dicts, clusters_dicts)

    return TrendAnalysisResponse(
        emerging=[_trend_to_response(t) for t in result.emerging],
        stable=[_trend_to_response(t) for t in result.stable],
        declining=[_trend_to_response(t) for t in result.declining],
        summary=result.summary,
    )


@router.post("/api/analysis/gaps", response_model=GapAnalysisResponse)
async def analyze_gaps(request: GapRequest):
    """
    Detect structural research gaps between clusters.

    Analyzes inter-cluster edge density to find areas where
    research connections are sparse, along with bridge paper
    candidates and potential ghost edges.
    """
    papers_dicts = [p.model_dump() for p in request.papers]
    clusters_dicts = [c.model_dump() for c in request.clusters]
    edges_dicts = [e.model_dump() for e in request.edges]

    detector = GapDetector()
    result = detector.detect_gaps(papers_dicts, clusters_dicts, edges_dicts)

    return GapAnalysisResponse(
        gaps=[_gap_to_response(g) for g in result.gaps],
        cluster_connectivity_matrix=result.cluster_connectivity_matrix,
        summary=result.summary,
    )


@router.post("/api/analysis/gaps/{gap_id}/hypotheses", response_model=HypothesisResponse)
async def generate_gap_hypotheses(gap_id: str, request: HypothesisRequest):
    """
    Generate research bridge hypotheses for a structural gap using LLM.

    Requires the user's own LLM API key. Generates 3-5 research
    questions or hypotheses that could bridge the identified gap.
    """
    provider = request.provider.lower()
    model = request.model

    # Build prompt for hypothesis generation
    cluster_a_label = request.gap.cluster_a.get("label", "Cluster A")
    cluster_b_label = request.gap.cluster_b.get("label", "Cluster B")
    gap_strength = request.gap.gap_strength

    bridge_context = ""
    if request.gap.bridge_papers:
        papers_str = ", ".join(
            f'"{bp.paper_id}"' for bp in request.gap.bridge_papers[:3]
        )
        bridge_context = f"\nBridge paper candidates: {papers_str}"

    prompt = (
        f"You are analyzing a research knowledge graph and have found a structural gap "
        f"between two research clusters.\n\n"
        f"Cluster A: {cluster_a_label}\n"
        f"Cluster B: {cluster_b_label}\n"
        f"Gap strength: {gap_strength:.2f} (0=well-connected, 1=no connection)\n"
        f"{bridge_context}\n\n"
        f"Generate exactly 5 specific, actionable research questions or hypotheses "
        f"that could bridge these two research areas. Each should be a single sentence "
        f"that a researcher could use as a starting point for new work.\n\n"
        f"Format: Return only the 5 hypotheses, one per line, numbered 1-5."
    )

    # Call LLM provider
    try:
        hypotheses = await _call_llm(
            provider=provider,
            api_key=request.api_key,
            model=model,
            prompt=prompt,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"LLM call failed for gap {gap_id}: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"LLM provider error: {type(e).__name__}: {str(e)}"
        )

    return HypothesisResponse(
        gap_id=gap_id,
        hypotheses=hypotheses,
        provider=provider,
        model=model or _default_model(provider),
    )


# ==================== LLM Provider ====================

_DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-4-20250514",
    "google": "gemini-2.0-flash",
    "groq": "llama-3.1-70b-versatile",
}


def _default_model(provider: str) -> str:
    return _DEFAULT_MODELS.get(provider, "unknown")


async def _call_llm(
    provider: str,
    api_key: str,
    model: Optional[str],
    prompt: str,
) -> List[str]:
    """
    Call an LLM provider to generate text.

    Supports: openai, anthropic, google, groq.
    Uses the user's own API key.
    """
    resolved_model = model or _default_model(provider)

    if provider == "openai":
        return await _call_openai(api_key, resolved_model, prompt)
    elif provider == "anthropic":
        return await _call_anthropic(api_key, resolved_model, prompt)
    elif provider == "google":
        return await _call_google(api_key, resolved_model, prompt)
    elif provider == "groq":
        return await _call_groq(api_key, resolved_model, prompt)
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}. Use: openai, anthropic, google, groq")


def _parse_hypotheses(text: str) -> List[str]:
    """Parse numbered hypotheses from LLM response text."""
    lines = text.strip().split("\n")
    hypotheses = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Strip leading number and punctuation (e.g., "1. ", "1) ", "1: ")
        import re
        cleaned = re.sub(r"^\d+[\.\)\:\-]\s*", "", line)
        if cleaned:
            hypotheses.append(cleaned)
    return hypotheses[:5]  # Cap at 5


async def _call_openai(api_key: str, model: str, prompt: str) -> List[str]:
    """Call OpenAI API."""
    try:
        import httpx
    except ImportError:
        raise ImportError("httpx is required for LLM calls")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 1000,
            },
        )
        response.raise_for_status()
        data = response.json()
        text = data["choices"][0]["message"]["content"]
        return _parse_hypotheses(text)


async def _call_anthropic(api_key: str, model: str, prompt: str) -> List[str]:
    """Call Anthropic API."""
    try:
        import httpx
    except ImportError:
        raise ImportError("httpx is required for LLM calls")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        data = response.json()
        text = data["content"][0]["text"]
        return _parse_hypotheses(text)


async def _call_google(api_key: str, model: str, prompt: str) -> List[str]:
    """Call Google Gemini API."""
    try:
        import httpx
    except ImportError:
        raise ImportError("httpx is required for LLM calls")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": api_key},
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": 1000,
                },
            },
        )
        response.raise_for_status()
        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return _parse_hypotheses(text)


async def _call_groq(api_key: str, model: str, prompt: str) -> List[str]:
    """Call Groq API (OpenAI-compatible)."""
    try:
        import httpx
    except ImportError:
        raise ImportError("httpx is required for LLM calls")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 1000,
            },
        )
        response.raise_for_status()
        data = response.json()
        text = data["choices"][0]["message"]["content"]
        return _parse_hypotheses(text)


@router.get("/api/analysis/conceptual-edges/stream")
async def stream_conceptual_edges(
    paper_ids: str = QueryParam(..., description="Comma-separated paper IDs"),
    request: Request = None,
):
    """
    SSE stream that analyzes conceptual relationships between papers.
    Uses SPECTER2 embeddings for pre-filtering, then Groq LLM for classification.

    Events emitted:
    - progress: {stage, count, total}
    - edge: {source, target, type, weight, explanation}
    - complete: {total_edges}
    - error: {message}
    """
    ids = [pid.strip() for pid in paper_ids.split(",") if pid.strip()]

    if len(ids) < 2:
        async def error_stream():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Need at least 2 paper IDs'})}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    async def generate():
        try:
            # Load papers with embeddings from DB
            from database import db

            yield f"data: {json.dumps({'type': 'progress', 'stage': 'loading', 'message': 'Loading paper data...'})}\n\n"

            papers_data = {}
            async with db.pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT id, s2_paper_id, title, abstract, embedding
                       FROM papers WHERE s2_paper_id = ANY($1) AND s2_paper_id IS NOT NULL""",
                    ids
                )
                for row in rows:
                    if row['s2_paper_id']:
                        papers_data[row['s2_paper_id']] = {
                            'id': row['s2_paper_id'],
                            'title': row['title'] or '',
                            'abstract': row['abstract'] or '',
                            'embedding': row['embedding'],
                        }

            valid_ids = [pid for pid in ids if pid in papers_data]

            if len(valid_ids) < 2:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Not enough papers found in database. Papers may not be stored yet.'})}\n\n"
                return

            yield f"data: {json.dumps({'type': 'progress', 'stage': 'filtering', 'message': f'Filtering {len(valid_ids)} papers by semantic similarity...'})}\n\n"

            # SPECTER2 cosine similarity pre-filter
            high_similarity_pairs = []
            embeddings = {}
            for pid in valid_ids:
                emb = papers_data[pid].get('embedding')
                if emb is not None:
                    try:
                        embeddings[pid] = np.array(emb, dtype=np.float32)
                    except Exception:
                        pass

            emb_ids = list(embeddings.keys())
            if len(emb_ids) >= 2:
                emb_matrix = np.stack([embeddings[pid] for pid in emb_ids])
                # Normalize
                norms = np.linalg.norm(emb_matrix, axis=1, keepdims=True)
                norms = np.where(norms == 0, 1, norms)
                emb_matrix = emb_matrix / norms
                # Cosine similarity matrix
                sim_matrix = emb_matrix @ emb_matrix.T

                for i in range(len(emb_ids)):
                    for j in range(i + 1, len(emb_ids)):
                        sim = float(sim_matrix[i, j])
                        if sim > 0.45:  # Pre-filter threshold
                            high_similarity_pairs.append((emb_ids[i], emb_ids[j], sim))
            else:
                # No embeddings: use all pairs (up to 50)
                for i in range(min(len(valid_ids), 10)):
                    for j in range(i + 1, min(len(valid_ids), 10)):
                        high_similarity_pairs.append((valid_ids[i], valid_ids[j], 0.5))

            if not high_similarity_pairs:
                yield f"data: {json.dumps({'type': 'complete', 'total_edges': 0, 'message': 'No semantically similar paper pairs found'})}\n\n"
                return

            yield f"data: {json.dumps({'type': 'progress', 'stage': 'analyzing', 'message': f'Analyzing {len(high_similarity_pairs)} candidate pairs with AI...'})}\n\n"

            # Batch LLM extraction
            from config import settings

            groq_key = getattr(settings, 'groq_api_key', None)
            if not groq_key:
                # Fallback: generate similarity-based edges without LLM
                edges_found = 0
                for src, tgt, sim in high_similarity_pairs[:30]:
                    if sim > 0.6:
                        edge_data = {
                            'type': 'edge',
                            'source': src,
                            'target': tgt,
                            'relation_type': 'similarity_shared',
                            'weight': round(sim, 3),
                            'explanation': f'High semantic similarity (cosine: {sim:.2f})',
                            'color': '#95A5A6',
                        }
                        yield f"data: {json.dumps(edge_data)}\n\n"
                        edges_found += 1

                yield f"data: {json.dumps({'type': 'complete', 'total_edges': edges_found})}\n\n"
                return

            # Batch extract paper fingerprints (method/theory/claims) using Groq
            BATCH_SIZE = 10
            paper_fingerprints = {}

            pair_paper_ids = set()
            for src, tgt, _ in high_similarity_pairs:
                pair_paper_ids.add(src)
                pair_paper_ids.add(tgt)

            pair_papers = [papers_data[pid] for pid in pair_paper_ids if pid in papers_data]

            try:
                from groq import AsyncGroq
                groq_client = AsyncGroq(api_key=groq_key)

                for batch_start in range(0, len(pair_papers), BATCH_SIZE):
                    batch = pair_papers[batch_start:batch_start + BATCH_SIZE]
                    batch_text = "\n\n".join([
                        f"Paper {i+1} (ID: {p['id']}):\nTitle: {p['title']}\nAbstract: {(p['abstract'] or '')[:400]}"
                        for i, p in enumerate(batch)
                    ])

                    prompt = f"""Analyze these {len(batch)} academic papers and extract their research fingerprints.

{batch_text}

For each paper, extract in JSON format:
{{
  "paper_id": "...",
  "methods": ["list of research methods used, e.g., RCT, survey, meta-analysis, simulation"],
  "theories": ["theoretical frameworks cited, e.g., TAM, UTAUT, social cognitive theory"],
  "claims": ["2-3 main claims/findings in 5-10 words each"]
}}

Return a JSON array with one object per paper. Be specific and concise."""

                    try:
                        response = await groq_client.chat.completions.create(
                            model="llama-3.3-70b-versatile",
                            messages=[{"role": "user", "content": prompt}],
                            temperature=0.1,
                            max_tokens=800,
                            response_format={"type": "json_object"},
                        )
                        content = response.choices[0].message.content
                        parsed = json.loads(content)

                        # Handle both {"papers": [...]} and direct array
                        if isinstance(parsed, list):
                            items = parsed
                        elif isinstance(parsed, dict):
                            items = parsed.get("papers", parsed.get("results", [parsed]))
                        else:
                            items = []

                        for item in items:
                            if isinstance(item, dict) and 'paper_id' in item:
                                paper_fingerprints[item['paper_id']] = item
                    except Exception:
                        # Silently continue on LLM error for this batch
                        pass

                    await asyncio.sleep(0.1)  # Small delay between batches

            except ImportError:
                pass  # groq not installed, will use heuristic below

            # Now classify relationships for high-similarity pairs
            edges_found = 0

            RELATION_COLORS = {
                'methodology_shared': '#9B59B6',
                'theory_shared': '#4A90D9',
                'claim_supports': '#2ECC71',
                'claim_contradicts': '#E74C3C',
                'context_shared': '#F39C12',
                'similarity_shared': '#95A5A6',
            }

            for src, tgt, sim in high_similarity_pairs:
                fp_src = paper_fingerprints.get(src, {})
                fp_tgt = paper_fingerprints.get(tgt, {})

                relation_type = 'similarity_shared'
                explanation = f'Semantic similarity: {sim:.2f}'

                if fp_src and fp_tgt:
                    methods_src = set(m.lower() for m in fp_src.get('methods', []))
                    methods_tgt = set(m.lower() for m in fp_tgt.get('methods', []))
                    theories_src = set(t.lower() for t in fp_src.get('theories', []))
                    theories_tgt = set(t.lower() for t in fp_tgt.get('theories', []))

                    shared_methods = methods_src & methods_tgt
                    shared_theories = theories_src & theories_tgt

                    if shared_theories:
                        relation_type = 'theory_shared'
                        explanation = f'Both use: {", ".join(list(shared_theories)[:2])}'
                    elif shared_methods:
                        relation_type = 'methodology_shared'
                        explanation = f'Shared methodology: {", ".join(list(shared_methods)[:2])}'

                edge_data = {
                    'type': 'edge',
                    'source': src,
                    'target': tgt,
                    'relation_type': relation_type,
                    'weight': round(min(sim + 0.1, 1.0), 3),
                    'explanation': explanation,
                    'color': RELATION_COLORS.get(relation_type, '#95A5A6'),
                }
                yield f"data: {json.dumps(edge_data)}\n\n"
                edges_found += 1

                # Small delay to let frontend process
                if edges_found % 5 == 0:
                    await asyncio.sleep(0.05)

            yield f"data: {json.dumps({'type': 'complete', 'total_edges': edges_found})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/analysis/scaffold-angles")
async def generate_scaffold_angles(
    body: dict,
):
    """Generate 5 exploration angles for a research question using LLM."""
    question = body.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    default_angles = [
        {"label": "🔭 Broad Survey", "query": f"{question} survey review systematic", "type": "broad"},
        {"label": "🎯 Focused Study", "query": f"{question} empirical study", "type": "narrow"},
        {"label": "🔬 Methodology", "query": f"{question} methodology", "type": "method"},
        {"label": "📐 Theory", "query": f"{question} theoretical framework", "type": "theory"},
        {"label": "👥 Population/Context", "query": f"{question} context population", "type": "population"},
    ]

    try:
        from config import settings
        groq_key = getattr(settings, 'groq_api_key', None)

        if groq_key:
            from groq import AsyncGroq
            groq_client = AsyncGroq(api_key=groq_key)

            prompt = f"""You are a research methodology expert. A researcher asks: "{question}"

Generate exactly 5 search query angles to explore this question in academic literature.
Return JSON with this exact structure:
{{
  "angles": [
    {{"label": "🔭 Broad Survey", "query": "keywords for broad literature survey", "type": "broad"}},
    {{"label": "🎯 Focused Study", "query": "keywords for specific empirical studies", "type": "narrow"}},
    {{"label": "🔬 Methodology", "query": "keywords focusing on research methods", "type": "method"}},
    {{"label": "📐 Theory", "query": "keywords for theoretical frameworks", "type": "theory"}},
    {{"label": "👥 Context", "query": "keywords for specific population or context", "type": "population"}}
  ]
}}

Make the queries specific, 3-6 words, academic English. No explanation."""

            response = await groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=400,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            parsed = json.loads(content)
            angles = parsed.get("angles", default_angles)
            return {"angles": angles}
    except Exception:
        pass

    return {"angles": default_angles}
