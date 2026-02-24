"""
Seed Chat Router — POST /api/seed-chat

Provides a chat interface for exploring academic paper graphs,
powered by Groq llama-3.3-70b with server-side API key.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from llm.groq_provider import GroqProvider

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Request / Response Models ────────────────────────────────────────────────

class PaperContext(BaseModel):
    paper_id: str
    title: str
    authors: List[str]
    year: int
    abstract_snippet: Optional[str] = None
    fields: List[str] = []
    citation_count: Optional[int] = 0


class ClusterContext(BaseModel):
    id: int
    label: str
    paper_count: int


class GraphContext(BaseModel):
    papers: List[PaperContext]
    clusters: List[ClusterContext]
    total_papers: int


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class SeedChatRequest(BaseModel):
    message: str
    graph_context: GraphContext
    history: List[ChatMessage] = []


class SeedChatResponse(BaseModel):
    reply: str
    suggested_followups: List[str]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_system_prompt(graph_context: GraphContext) -> str:
    """
    Build system prompt with graph context summary.
    Keeps total under 2000 tokens by limiting paper details.
    """
    total = graph_context.total_papers

    # Sort papers by citation count, take top 10
    sorted_papers = sorted(
        graph_context.papers,
        key=lambda p: p.citation_count or 0,
        reverse=True
    )[:10]

    paper_lines = []
    for i, p in enumerate(sorted_papers, 1):
        authors_str = ", ".join(p.authors[:2])
        if len(p.authors) > 2:
            authors_str += " et al."
        fields_str = ", ".join(p.fields[:2]) if p.fields else "General"
        abstract_str = ""
        if p.abstract_snippet:
            # Truncate abstract to keep prompt compact
            abstract_str = f" Abstract: {p.abstract_snippet[:150].rstrip()}..."
        paper_lines.append(
            f"{i}. [{p.year}] \"{p.title}\" by {authors_str} "
            f"(citations: {p.citation_count or 0}, fields: {fields_str}).{abstract_str}"
        )

    papers_section = "\n".join(paper_lines) if paper_lines else "No papers available."

    cluster_lines = []
    for c in graph_context.clusters:
        cluster_lines.append(f"- {c.label} ({c.paper_count} papers)")

    clusters_section = "\n".join(cluster_lines) if cluster_lines else "No clusters identified."

    system_prompt = f"""You are a research assistant helping a user explore an academic paper graph.

GRAPH OVERVIEW:
- Total papers in graph: {total}
- Research clusters identified: {len(graph_context.clusters)}

TOP 10 PAPERS BY CITATION COUNT:
{papers_section}

RESEARCH CLUSTERS:
{clusters_section}

YOUR ROLE:
- Answer questions about the papers and research landscape shown above
- Identify connections and relationships between papers
- Highlight research gaps between clusters
- Help understand methodologies, findings, and trends
- Suggest follow-up questions to deepen exploration
- Be concise but insightful; cite paper titles when relevant

When you don't have enough context from the graph, say so clearly rather than speculating."""

    return system_prompt


def _build_followups(graph_context: GraphContext) -> List[str]:
    """Generate default follow-up suggestions based on graph structure."""
    followups = []

    if graph_context.clusters and len(graph_context.clusters) >= 2:
        c1 = graph_context.clusters[0].label
        c2 = graph_context.clusters[1].label
        followups.append(f"What are the key differences between {c1} and {c2}?")
    else:
        followups.append("What are the main research themes in this graph?")

    followups.append("Which papers are most influential and why?")

    if len(graph_context.clusters) >= 2:
        followups.append("What research gaps exist between the clusters?")
    else:
        followups.append("What methodologies are most commonly used?")

    return followups[:3]


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/api/seed-chat", response_model=SeedChatResponse)
async def seed_chat(request: SeedChatRequest):
    """
    Chat endpoint for seed paper graph exploration.

    Uses Groq llama-3.3-70b with server-side API key.
    Returns a reply and 3 suggested follow-up questions.
    """
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=400,
            detail=(
                "Groq API key is not configured on the server. "
                "Please set GROQ_API_KEY in the backend environment."
            ),
        )

    provider = GroqProvider(api_key=settings.groq_api_key)

    system_prompt = _build_system_prompt(request.graph_context)

    # Build conversation history for the LLM
    # GroqProvider.generate() takes a single prompt + system_prompt.
    # For multi-turn, we embed history into the user message.
    history_text = ""
    if request.history:
        history_lines = []
        for msg in request.history[-6:]:  # limit to last 6 turns
            role_label = "User" if msg.role == "user" else "Assistant"
            history_lines.append(f"{role_label}: {msg.content}")
        history_text = "\n".join(history_lines) + "\n\n"

    full_prompt = history_text + f"User: {request.message}"

    try:
        response = await provider.generate(
            prompt=full_prompt,
            system_prompt=system_prompt,
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=1024,
        )
        reply = response.content or ""
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Seed chat LLM error: {error_msg}")
        if "authentication" in error_msg.lower() or "401" in error_msg or "api key" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail="LLM authentication error. Check GROQ_API_KEY configuration.",
            )
        raise HTTPException(
            status_code=502,
            detail=f"LLM request failed: {error_msg[:200]}",
        )
    finally:
        await provider.close()

    suggested_followups = _build_followups(request.graph_context)

    return SeedChatResponse(
        reply=reply,
        suggested_followups=suggested_followups,
    )
