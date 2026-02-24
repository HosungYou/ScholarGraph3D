"""
Gap Report generation service for ScholarGraph3D.

Assembles structured evidence from gap analysis data and optionally
generates an LLM narrative synthesis via Groq.

Zero additional S2 API calls — all data comes from the gap detection pipeline.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from config import settings

logger = logging.getLogger(__name__)


def assemble_evidence(gap: Dict[str, Any], graph_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build structured evidence sections from gap data (no LLM needed).

    Args:
        gap: SeedGapInfo dict with gap_score_breakdown, key_papers, temporal_context, intent_summary
        graph_context: {papers: [...], clusters: [...], total_papers: int}

    Returns:
        Evidence dict with interpretable sections.
    """
    breakdown = gap.get("gap_score_breakdown") or {}
    cluster_a = gap.get("cluster_a", {})
    cluster_b = gap.get("cluster_b", {})
    bridge_papers = gap.get("bridge_papers", [])
    key_papers_a = gap.get("key_papers_a", [])
    key_papers_b = gap.get("key_papers_b", [])
    temporal_ctx = gap.get("temporal_context", {})
    intent_summary = gap.get("intent_summary", {})

    # Gap score interpretation
    score_interpretation = _interpret_scores(breakdown)

    # Cluster profiles
    cluster_a_profile = _build_cluster_profile(cluster_a, key_papers_a)
    cluster_b_profile = _build_cluster_profile(cluster_b, key_papers_b)

    # Bridge paper analysis
    bridge_analysis = _build_bridge_analysis(bridge_papers)

    # Temporal context
    temporal_analysis = _build_temporal_analysis(temporal_ctx)

    # Intent distribution
    intent_analysis = _build_intent_analysis(intent_summary)

    return {
        "score_interpretation": score_interpretation,
        "cluster_a_profile": cluster_a_profile,
        "cluster_b_profile": cluster_b_profile,
        "bridge_analysis": bridge_analysis,
        "temporal_analysis": temporal_analysis,
        "intent_analysis": intent_analysis,
        "gap_strength": gap.get("gap_strength", 0),
        "breakdown": breakdown,
        "total_papers": graph_context.get("total_papers", 0),
    }


async def generate_narrative(
    evidence: Dict[str, Any],
    gap: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Generate narrative synthesis via Groq LLM (1 call).

    Returns None if LLM is unavailable or fails.
    """
    if not settings.groq_api_key:
        logger.warning("Groq API key not configured — skipping narrative generation")
        return None

    try:
        from llm.groq_provider import GroqProvider

        provider = GroqProvider(api_key=settings.groq_api_key)
        cluster_a = gap.get("cluster_a", {})
        cluster_b = gap.get("cluster_b", {})

        system_prompt = (
            "You are an academic research analyst specializing in identifying research gaps "
            "and proposing new research directions. You write in a clear, scholarly tone. "
            "Always respond with valid JSON."
        )

        user_prompt = f"""Analyze the following research gap between two clusters of academic papers and generate a structured report.

## Gap Context
- Cluster A: "{cluster_a.get('label', 'Cluster A')}" ({cluster_a.get('paper_count', 0)} papers)
- Cluster B: "{cluster_b.get('label', 'Cluster B')}" ({cluster_b.get('paper_count', 0)} papers)
- Composite gap score: {evidence.get('gap_strength', 0):.0%}
- Total papers in graph: {evidence.get('total_papers', 0)}

## Score Breakdown
{evidence.get('score_interpretation', 'N/A')}

## Cluster A Profile
{evidence.get('cluster_a_profile', 'N/A')}

## Cluster B Profile
{evidence.get('cluster_b_profile', 'N/A')}

## Bridge Papers
{evidence.get('bridge_analysis', 'N/A')}

## Temporal Context
{evidence.get('temporal_analysis', 'N/A')}

## Citation Intent Distribution
{evidence.get('intent_analysis', 'N/A')}

Generate a JSON response with these fields:
{{
  "executive_summary": "2-3 sentence overview of the gap and its significance",
  "gap_narrative": "3-4 paragraphs analyzing the gap, its dimensions, and implications",
  "research_questions": [
    {{
      "question": "A specific research question",
      "justification": "Why this question matters based on the evidence",
      "methodology_hint": "Suggested approach to investigate this question"
    }}
  ],
  "significance_statement": "Why bridging this gap matters for the field",
  "limitations": "Limitations of this gap analysis"
}}

Generate 3-5 research questions. Each should be specific, actionable, and grounded in the evidence above."""

        result = await provider.generate_json(
            prompt=user_prompt,
            system_prompt=system_prompt,
        )

        if result and result.get("executive_summary"):
            return result

        logger.warning("LLM returned empty or invalid result")
        return None

    except Exception as e:
        logger.warning(f"Narrative generation failed: {e}")
        return None


def assemble_report(
    evidence: Dict[str, Any],
    narrative: Optional[Dict[str, Any]],
    gap: Dict[str, Any],
    snapshot_data_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Assemble final GapReport from evidence + narrative.

    Falls back gracefully if narrative is None (evidence-only report).
    """
    cluster_a = gap.get("cluster_a", {})
    cluster_b = gap.get("cluster_b", {})
    breakdown = gap.get("gap_score_breakdown") or {}
    bridge_papers = gap.get("bridge_papers", [])
    key_papers_a = gap.get("key_papers_a", [])
    key_papers_b = gap.get("key_papers_b", [])

    title = f"Gap Analysis: {cluster_a.get('label', 'A')} \u2194 {cluster_b.get('label', 'B')}"

    # Build sections
    sections = []

    sections.append({
        "id": "gap_scores",
        "title": "Gap Score Analysis",
        "content": evidence.get("score_interpretation", ""),
    })

    sections.append({
        "id": "cluster_a",
        "title": f"Cluster: {cluster_a.get('label', 'A')}",
        "content": evidence.get("cluster_a_profile", ""),
    })

    sections.append({
        "id": "cluster_b",
        "title": f"Cluster: {cluster_b.get('label', 'B')}",
        "content": evidence.get("cluster_b_profile", ""),
    })

    sections.append({
        "id": "bridge_papers",
        "title": "Bridge Papers",
        "content": evidence.get("bridge_analysis", ""),
    })

    if narrative and narrative.get("gap_narrative"):
        sections.append({
            "id": "narrative",
            "title": "Narrative Synthesis",
            "content": narrative["gap_narrative"],
        })

    sections.append({
        "id": "temporal",
        "title": "Temporal Context",
        "content": evidence.get("temporal_analysis", ""),
    })

    sections.append({
        "id": "intent",
        "title": "Citation Intent Distribution",
        "content": evidence.get("intent_analysis", ""),
    })

    # Research questions: prefer LLM-generated, fallback to heuristic
    research_questions = []
    if narrative and narrative.get("research_questions"):
        for rq in narrative["research_questions"]:
            if isinstance(rq, dict):
                research_questions.append({
                    "question": rq.get("question", ""),
                    "justification": rq.get("justification", ""),
                    "methodology_hint": rq.get("methodology_hint", ""),
                })
    else:
        # Fallback: convert heuristic questions
        for q in gap.get("research_questions", []):
            research_questions.append({
                "question": q,
                "justification": "Generated from cluster label analysis.",
                "methodology_hint": "Consider a systematic literature review or empirical study.",
            })

    # Collect all cited papers
    all_cited = []
    seen_ids = set()
    for p in key_papers_a + key_papers_b + bridge_papers:
        pid = p.get("paper_id", "")
        if pid and pid not in seen_ids:
            seen_ids.add(pid)
            all_cited.append({
                "paper_id": pid,
                "title": p.get("title", ""),
                "tldr": p.get("tldr", ""),
                "citation_count": p.get("citation_count", 0),
            })

    # Generate BibTeX
    bibtex = _generate_bibtex(all_cited)

    # Compute stable gap_id hash for caching
    gap_id = gap.get("gap_id", "")

    return {
        "gap_id": gap_id,
        "title": title,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "executive_summary": (
            narrative.get("executive_summary", "")
            if narrative
            else f"Research gap detected between {cluster_a.get('label', 'A')} and {cluster_b.get('label', 'B')} "
                 f"with a composite score of {gap.get('gap_strength', 0):.0%}."
        ),
        "sections": sections,
        "research_questions": research_questions,
        "significance_statement": narrative.get("significance_statement") if narrative else None,
        "limitations": narrative.get("limitations") if narrative else "This analysis is based on structural graph metrics only. LLM narrative was not available.",
        "cited_papers": all_cited,
        "bibtex": bibtex,
        "raw_metrics": breakdown,
        "snapshot_data_url": snapshot_data_url,
    }


def compute_gap_report_cache_key(gap: Dict[str, Any]) -> str:
    """Compute stable cache key for a gap report."""
    # Use cluster pair IDs + gap_strength for stable hashing
    cluster_a_id = gap.get("cluster_a", {}).get("id", 0)
    cluster_b_id = gap.get("cluster_b", {}).get("id", 0)
    strength = gap.get("gap_strength", 0)
    raw = f"{min(cluster_a_id, cluster_b_id)}:{max(cluster_a_id, cluster_b_id)}:{strength}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ─── Private helpers ─────────────────────────────────────────────────


def _interpret_scores(breakdown: Dict[str, float]) -> str:
    """Interpret each gap score dimension."""
    if not breakdown:
        return "No score breakdown available."

    lines = []
    labels = {
        "structural": ("Structural", "Inter-cluster edge density — how few citation/similarity connections exist between clusters."),
        "semantic": ("Semantic", "Embedding distance between cluster centroids — how thematically different the clusters are."),
        "temporal": ("Temporal", "Year distribution overlap — how much the publication timelines differ."),
        "intent": ("Intent", "Citation intent distribution — whether cross-citations are mostly background (superficial) vs methodology (deep)."),
        "directional": ("Directional", "Citation asymmetry — whether knowledge flows predominantly in one direction."),
        "composite": ("Composite", "Weighted combination of all dimensions."),
    }

    for key, (label, desc) in labels.items():
        score = breakdown.get(key, 0)
        pct = f"{score:.0%}"
        bar = "\u2588" * int(score * 10) + "\u2591" * (10 - int(score * 10))
        lines.append(f"- **{label}** [{bar}] {pct}: {desc}")

    return "\n".join(lines)


def _build_cluster_profile(cluster: Dict[str, Any], key_papers: List[Dict]) -> str:
    """Build a textual profile of a cluster."""
    label = cluster.get("label", "Unknown")
    count = cluster.get("paper_count", 0)
    lines = [f"**{label}** ({count} papers)"]

    if key_papers:
        lines.append("\nKey papers:")
        for p in key_papers[:3]:
            title = p.get("title", "Untitled")
            cites = p.get("citation_count", 0)
            tldr = p.get("tldr", "")
            lines.append(f"- {title} ({cites} citations)")
            if tldr:
                lines.append(f"  TLDR: {tldr}")

    return "\n".join(lines)


def _build_bridge_analysis(bridge_papers: List[Dict]) -> str:
    """Build bridge paper analysis text."""
    if not bridge_papers:
        return "No bridge papers identified."

    lines = ["Papers connecting both clusters:"]
    for bp in bridge_papers[:5]:
        title = bp.get("title", "Untitled")
        score = bp.get("score", 0)
        lines.append(f"- {title} (bridge score: {score:.0%})")

    return "\n".join(lines)


def _build_temporal_analysis(temporal_ctx: Dict) -> str:
    """Build temporal context analysis text."""
    if not temporal_ctx:
        return "No temporal data available."

    range_a = temporal_ctx.get("year_range_a", [0, 0])
    range_b = temporal_ctx.get("year_range_b", [0, 0])
    overlap = temporal_ctx.get("overlap_years", 0)

    lines = [
        f"- Cluster A publication range: {range_a[0]}\u2013{range_a[1]}",
        f"- Cluster B publication range: {range_b[0]}\u2013{range_b[1]}",
        f"- Overlapping years: {overlap}",
    ]

    if overlap == 0 and range_a[0] > 0 and range_b[0] > 0:
        lines.append("- Note: No temporal overlap suggests these research areas developed independently.")
    elif overlap < 3:
        lines.append("- Note: Minimal overlap suggests recent convergence or divergence.")

    return "\n".join(lines)


def _build_intent_analysis(intent_summary: Dict) -> str:
    """Build citation intent distribution text."""
    if not intent_summary:
        return "No citation intent data available."

    bg = intent_summary.get("background", 0)
    meth = intent_summary.get("methodology", 0)
    result = intent_summary.get("result", 0)
    total = bg + meth + result

    if total == 0:
        return "No cross-cluster citations found for intent analysis."

    lines = [
        f"Cross-cluster citation intents ({total} total):",
        f"- Background: {bg} ({bg/total:.0%})" if total > 0 else "- Background: 0",
        f"- Methodology: {meth} ({meth/total:.0%})" if total > 0 else "- Methodology: 0",
        f"- Result comparison: {result} ({result/total:.0%})" if total > 0 else "- Result: 0",
    ]

    if total > 0 and bg / total > 0.7:
        lines.append("- Insight: Most cross-citations are background references, suggesting surface-level engagement.")
    if total > 0 and meth / total > 0.3:
        lines.append("- Insight: Significant methodological cross-pollination detected.")

    return "\n".join(lines)


def _generate_bibtex(papers: List[Dict]) -> str:
    """Generate BibTeX entries for cited papers."""
    entries = []
    for p in papers:
        title = p.get("title", "Untitled")
        pid = p.get("paper_id", "unknown")
        # Create a simple cite key from paper_id
        key = pid.replace("/", "_")[:20] if pid else "unknown"
        entry = f"""@article{{{key},
  title = {{{title}}},
  note = {{Semantic Scholar ID: {pid}}}
}}"""
        entries.append(entry)

    return "\n\n".join(entries)
