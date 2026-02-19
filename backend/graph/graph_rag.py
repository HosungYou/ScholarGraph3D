"""
GraphRAG context builder for chat.

Builds structured context from graph data (papers, clusters, gaps)
for use as LLM system prompt in the GraphRAG chat pipeline.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from database import Database

logger = logging.getLogger(__name__)


@dataclass
class RAGContext:
    """Structured context for LLM consumption."""

    papers: List[Dict[str, Any]] = field(default_factory=list)
    clusters: List[Dict[str, Any]] = field(default_factory=list)
    citations: List[Dict[str, Any]] = field(default_factory=list)
    gaps: List[Dict[str, Any]] = field(default_factory=list)
    context_string: str = ""


SYSTEM_PROMPT_TEMPLATE = """You are a research analyst examining an academic paper graph.

The graph contains {paper_count} papers across {cluster_count} research clusters:
{cluster_summaries}

Relevant papers for this query:
{paper_contexts}

{gap_context}
When referencing papers, use citation markers like [1], [2].
Base your analysis on the actual papers and their relationships.
If asked about trends, gaps, or connections, reference specific papers."""


class GraphRAGContextBuilder:
    """
    Builds LLM-ready context from graph data.

    Pipeline:
    1. Find relevant papers via keyword match or embedding similarity
    2. Collect cluster context for matched papers
    3. Get citation relationships between matched papers
    4. Format into structured context string with [1][2] citations
    """

    def __init__(self, db: Database):
        self.db = db

    async def build_context(
        self,
        query: str,
        graph_data: Dict[str, Any],
        max_papers: int = 20,
    ) -> RAGContext:
        """
        Build RAG context from the current graph state.

        Args:
            query: User's question
            graph_data: Current graph state with paper_ids, clusters, edges
            max_papers: Maximum papers to include in context

        Returns:
            RAGContext with papers, clusters, citations, and formatted string
        """
        papers = graph_data.get("papers", [])
        clusters = graph_data.get("clusters", [])
        edges = graph_data.get("edges", [])
        gaps = graph_data.get("gaps", [])

        if not papers:
            return RAGContext(context_string=self._empty_context())

        # 1. Find relevant papers
        relevant_papers = self._find_relevant_papers(query, papers, max_papers)

        # 2. Collect cluster context
        relevant_cluster_ids = set(
            p.get("cluster_id", -1) for p in relevant_papers
        )
        relevant_clusters = [
            c for c in clusters
            if c.get("id", -1) in relevant_cluster_ids and c.get("id", -1) != -1
        ]

        # 3. Get citation relationships between relevant papers
        relevant_ids = set(str(p.get("id", "")) for p in relevant_papers)
        relevant_citations = [
            e for e in edges
            if e.get("type") == "citation"
            and str(e.get("source", "")) in relevant_ids
            and str(e.get("target", "")) in relevant_ids
        ]

        # 4. Find relevant gaps
        relevant_gaps = self._find_relevant_gaps(gaps, relevant_cluster_ids)

        # 5. Build formatted context string
        context_string = self.format_context_for_llm(
            RAGContext(
                papers=relevant_papers,
                clusters=relevant_clusters,
                citations=relevant_citations,
                gaps=relevant_gaps,
            )
        )

        return RAGContext(
            papers=relevant_papers,
            clusters=relevant_clusters,
            citations=relevant_citations,
            gaps=relevant_gaps,
            context_string=context_string,
        )

    async def build_context_with_db_search(
        self,
        query: str,
        graph_data: Dict[str, Any],
        max_papers: int = 20,
    ) -> RAGContext:
        """
        Build context with optional pgvector similarity search from the database.

        Falls back to keyword matching if DB is unavailable.
        """
        # Try pgvector search first if DB is connected
        if self.db.is_connected:
            try:
                db_papers = await self._pgvector_search(query, max_papers)
                if db_papers:
                    graph_data = dict(graph_data)
                    # Merge DB results with graph papers
                    existing_ids = {str(p.get("id", "")) for p in graph_data.get("papers", [])}
                    for p in db_papers:
                        if str(p.get("id", "")) not in existing_ids:
                            graph_data.setdefault("papers", []).append(p)
            except Exception as e:
                logger.debug(f"pgvector search skipped: {e}")

        return await self.build_context(query, graph_data, max_papers)

    def format_context_for_llm(self, context: RAGContext) -> str:
        """Format papers + clusters + gaps into LLM-readable context with citations [1] [2]."""

        # Format cluster summaries
        cluster_summaries = ""
        if context.clusters:
            lines = []
            for c in context.clusters:
                label = c.get("label", f"Cluster {c.get('id', '?')}")
                count = c.get("paper_count", 0)
                topics = c.get("topics", [])
                topic_str = ", ".join(topics[:3]) if topics else "various topics"
                lines.append(f"- {label} ({count} papers): {topic_str}")
            cluster_summaries = "\n".join(lines)
        else:
            cluster_summaries = "No cluster information available."

        # Format paper contexts with citation markers
        paper_contexts = ""
        if context.papers:
            lines = []
            for i, paper in enumerate(context.papers, 1):
                title = paper.get("title", "Untitled")
                year = paper.get("year", "n.d.")
                authors = self._format_authors(paper.get("authors", []))
                abstract = paper.get("tldr") or paper.get("abstract", "")
                if abstract and len(abstract) > 300:
                    abstract = abstract[:300] + "..."
                citations = paper.get("citation_count", 0)
                cluster_label = paper.get("cluster_label", "")

                entry = f"[{i}] {title} ({authors}, {year})"
                if cluster_label:
                    entry += f" [Cluster: {cluster_label}]"
                entry += f" [Citations: {citations}]"
                if abstract:
                    entry += f"\n    {abstract}"

                lines.append(entry)

            paper_contexts = "\n\n".join(lines)
        else:
            paper_contexts = "No relevant papers found for this query."

        # Format gap context
        gap_context = ""
        if context.gaps:
            lines = ["Research gaps detected between clusters:"]
            for gap in context.gaps[:3]:  # Top 3 gaps
                ca = gap.get("cluster_a", {}).get("label", "?")
                cb = gap.get("cluster_b", {}).get("label", "?")
                strength = gap.get("gap_strength", 0)
                lines.append(f"- Gap between '{ca}' and '{cb}' (strength: {strength:.2f})")
            gap_context = "\n".join(lines) + "\n"

        return SYSTEM_PROMPT_TEMPLATE.format(
            paper_count=len(context.papers),
            cluster_count=len(context.clusters),
            cluster_summaries=cluster_summaries,
            paper_contexts=paper_contexts,
            gap_context=gap_context,
        )

    def _find_relevant_papers(
        self,
        query: str,
        papers: List[Dict[str, Any]],
        max_papers: int,
    ) -> List[Dict[str, Any]]:
        """
        Find papers relevant to the query via keyword matching.

        Scores papers based on query term matches in title and abstract.
        Falls back to citation-count ranking if no keyword matches.
        """
        query_terms = set(query.lower().split())

        scored: List[tuple] = []
        for paper in papers:
            title = (paper.get("title") or "").lower()
            abstract = (paper.get("abstract") or "").lower()
            tldr = (paper.get("tldr") or "").lower()
            text = f"{title} {abstract} {tldr}"

            # Score: count of matching query terms, weighted by location
            score = 0.0
            for term in query_terms:
                if term in title:
                    score += 3.0  # Title match weighted more
                if term in abstract or term in tldr:
                    score += 1.0

            # Boost by citation count (log scale)
            import math
            citation_boost = math.log1p(paper.get("citation_count", 0)) * 0.1
            score += citation_boost

            scored.append((score, paper))

        # Sort by score descending
        scored.sort(key=lambda x: x[0], reverse=True)

        # If top scores are all zero, fall back to citation count ranking
        if scored and scored[0][0] <= 0:
            scored.sort(
                key=lambda x: x[1].get("citation_count", 0),
                reverse=True,
            )

        return [p for _, p in scored[:max_papers]]

    def _find_relevant_gaps(
        self,
        gaps: List[Dict[str, Any]],
        cluster_ids: set,
    ) -> List[Dict[str, Any]]:
        """Filter gaps to those involving relevant clusters."""
        if not gaps:
            return []

        return [
            g for g in gaps
            if g.get("cluster_a", {}).get("id") in cluster_ids
            or g.get("cluster_b", {}).get("id") in cluster_ids
        ]

    async def _pgvector_search(
        self,
        query: str,
        limit: int,
    ) -> List[Dict[str, Any]]:
        """
        Search papers by text similarity using PostgreSQL full-text search.

        Note: For embedding-based search, the query would need to be embedded
        first via SPECTER2. This method uses simple text matching as a fallback.
        """
        rows = await self.db.fetch(
            """
            SELECT id, s2_paper_id, title, abstract, year, venue,
                   citation_count, fields_of_study, tldr, authors,
                   is_open_access, oa_url, doi
            FROM papers
            WHERE to_tsvector('english', coalesce(title, '') || ' ' || coalesce(abstract, ''))
                  @@ plainto_tsquery('english', $1)
            ORDER BY citation_count DESC
            LIMIT $2
            """,
            query,
            limit,
        )

        return [
            {
                "id": str(row["id"]),
                "s2_paper_id": row["s2_paper_id"],
                "title": row["title"],
                "abstract": row["abstract"],
                "year": row["year"],
                "venue": row["venue"],
                "citation_count": row["citation_count"] or 0,
                "fields": row["fields_of_study"] or [],
                "tldr": row["tldr"],
                "authors": row["authors"] or [],
                "is_open_access": row["is_open_access"],
                "oa_url": row["oa_url"],
                "doi": row["doi"],
            }
            for row in rows
        ]

    @staticmethod
    def _format_authors(authors: List[Any], max_authors: int = 3) -> str:
        """Format author list for display."""
        if not authors:
            return "Unknown"

        names = []
        for a in authors[:max_authors]:
            if isinstance(a, dict):
                name = a.get("name", a.get("display_name", ""))
            elif isinstance(a, str):
                name = a
            else:
                continue
            if name:
                names.append(name)

        if not names:
            return "Unknown"

        result = ", ".join(names)
        if len(authors) > max_authors:
            result += " et al."

        return result

    @staticmethod
    def _empty_context() -> str:
        """Return context string when no data is available."""
        return (
            "You are a research analyst. No graph data is currently loaded. "
            "Please ask the user to search for papers first."
        )
