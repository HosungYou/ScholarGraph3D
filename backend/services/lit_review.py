"""
Literature review generation service for ScholarGraph3D.

Generates structured literature reviews from graph data using LLM,
organized by cluster (thematic sections). Supports markdown output
and PDF export via weasyprint.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from llm.base import BaseLLMProvider, LLMResponse

logger = logging.getLogger(__name__)


@dataclass
class LitReviewResult:
    """Result of a literature review generation."""

    title: str
    sections: List[Dict[str, Any]]  # [{heading, content, paper_refs}]
    references: List[str]  # Formatted reference strings (APA)
    markdown: str
    metadata: Dict[str, Any]  # {paper_count, cluster_count, generation_time}


# ==================== Prompt Templates ====================

INTRODUCTION_PROMPT = """Write an introduction section for a literature review on the following research area.

Research area: {field_summary}
Total papers reviewed: {paper_count}
Key clusters/themes identified:
{cluster_summary}

Write a concise introduction (2-3 paragraphs) that:
1. Introduces the broader research area
2. Outlines the scope of this review
3. Previews the thematic sections that will follow

Use academic language. Do NOT include citations in the introduction."""

SECTION_PROMPT = """Write a thematic section for a literature review.

Section theme: {cluster_label}
Key topics: {topics}

Papers in this section:
{paper_summaries}

Write a coherent section (3-5 paragraphs) that:
1. Introduces this research theme
2. Summarizes each paper's key contribution using [Author, Year] citation format
3. Notes methodological patterns across the papers
4. Identifies sub-trends within this theme

Available citations (use these exact formats):
{citation_formats}

Use academic language. Cite papers as [Author, Year]."""

DISCUSSION_PROMPT = """Write a discussion section for a literature review.

Themes covered: {themes}
Total papers: {paper_count}

{gap_context}

{trend_context}

Citation flow between themes:
{cross_cluster_info}

Write a discussion section (3-4 paragraphs) that:
1. Synthesizes findings across all thematic sections
2. Discusses research gaps between themes
3. Notes emerging trends and declining areas
4. Suggests future research directions

Use academic language. Reference themes by name."""

CONCLUSION_PROMPT = """Write a brief conclusion (1-2 paragraphs) for a literature review.

Key themes: {themes}
Paper count: {paper_count}
Main gaps identified: {gaps_summary}
Main trends: {trends_summary}

Summarize the state of the field and emphasize the most important future directions.
Use academic language."""


class LitReviewService:
    """
    Literature review generation from graph data.

    Pipeline:
    1. Organize papers by cluster (thematic sections)
    2. Generate intro, per-cluster sections, discussion, conclusion via LLM
    3. Compile references in APA format
    4. Output as markdown or PDF
    """

    async def generate_review(
        self,
        graph_data: Dict[str, Any],
        llm_provider: BaseLLMProvider,
        api_key: Optional[str] = None,
        clusters: Optional[List[Dict[str, Any]]] = None,
        trends: Optional[Dict[str, Any]] = None,
        gaps: Optional[List[Dict[str, Any]]] = None,
        style: str = "apa",
    ) -> LitReviewResult:
        """
        Generate a structured literature review from graph data.

        Args:
            graph_data: Dict with papers (list), edges (list), clusters (list).
            llm_provider: Initialized LLM provider.
            api_key: Unused (provider already initialized), kept for API compat.
            clusters: Optional cluster data override.
            trends: Optional trend analysis results.
            gaps: Optional gap analysis results.
            style: Citation style (currently only "apa" supported).

        Returns:
            LitReviewResult with sections, references, markdown, metadata.
        """
        start_time = time.time()

        papers = graph_data.get("papers", [])
        edges = graph_data.get("edges", [])
        review_clusters = clusters or graph_data.get("clusters", [])

        if not papers:
            return LitReviewResult(
                title="Literature Review",
                sections=[],
                references=[],
                markdown="# Literature Review\n\nNo papers available for review.",
                metadata={"paper_count": 0, "cluster_count": 0, "generation_time": 0},
            )

        # Organize papers by cluster
        cluster_papers = _organize_by_cluster(papers, review_clusters)

        # Build APA references
        references = _build_apa_references(papers)
        ref_lookup = _build_citation_lookup(papers)

        # Determine field summary from cluster labels
        cluster_labels = [c.get("label", f"Theme {c.get('id', '?')}") for c in review_clusters]
        field_summary = _infer_field_summary(papers, review_clusters)

        sections: List[Dict[str, Any]] = []

        # 1. Generate Introduction
        intro_prompt = INTRODUCTION_PROMPT.format(
            field_summary=field_summary,
            paper_count=len(papers),
            cluster_summary="\n".join(
                f"- {label} ({len(cluster_papers.get(c.get('id', -1), []))} papers)"
                for c, label in zip(review_clusters, cluster_labels)
            ),
        )

        try:
            intro_response = await llm_provider.generate(
                prompt=intro_prompt,
                temperature=0.4,
                max_tokens=1500,
            )
            sections.append({
                "heading": "Introduction",
                "content": intro_response.content.strip(),
                "paper_refs": [],
            })
        except Exception as e:
            logger.error(f"Failed to generate introduction: {e}")
            sections.append({
                "heading": "Introduction",
                "content": f"This review examines {len(papers)} papers across {len(review_clusters)} research themes.",
                "paper_refs": [],
            })

        # 2. Generate thematic sections (per cluster)
        for cluster in review_clusters:
            cluster_id = cluster.get("id", -1)
            label = cluster.get("label", f"Theme {cluster_id}")
            topics = cluster.get("topics", [])
            c_papers = cluster_papers.get(cluster_id, [])

            if not c_papers:
                continue

            paper_summaries = _format_paper_summaries(c_papers)
            citation_formats = _format_citation_keys(c_papers)

            section_prompt = SECTION_PROMPT.format(
                cluster_label=label,
                topics=", ".join(topics[:5]) if topics else "various topics",
                paper_summaries=paper_summaries,
                citation_formats=citation_formats,
            )

            try:
                section_response = await llm_provider.generate(
                    prompt=section_prompt,
                    temperature=0.4,
                    max_tokens=2000,
                )
                sections.append({
                    "heading": label,
                    "content": section_response.content.strip(),
                    "paper_refs": [p.get("id", "") for p in c_papers],
                })
            except Exception as e:
                logger.error(f"Failed to generate section '{label}': {e}")
                sections.append({
                    "heading": label,
                    "content": f"This section covers {len(c_papers)} papers in {label}.",
                    "paper_refs": [p.get("id", "") for p in c_papers],
                })

        # 3. Generate Discussion
        gap_context = ""
        if gaps:
            gap_lines = []
            for gap in gaps[:5]:
                ca = gap.get("cluster_a", {}).get("label", "?")
                cb = gap.get("cluster_b", {}).get("label", "?")
                strength = gap.get("gap_strength", 0)
                gap_lines.append(f"- Gap between '{ca}' and '{cb}' (strength: {strength:.2f})")
            gap_context = "Research gaps detected:\n" + "\n".join(gap_lines)

        trend_context = ""
        if trends:
            trend_lines = []
            for category in ["emerging", "stable", "declining"]:
                items = trends.get(category, [])
                if items:
                    names = [t.get("label", t.get("name", "?")) for t in items[:3]]
                    trend_lines.append(f"- {category.capitalize()}: {', '.join(names)}")
            trend_context = "Trends:\n" + "\n".join(trend_lines) if trend_lines else ""

        cross_cluster_info = _analyze_cross_cluster_edges(edges, cluster_papers, review_clusters)

        discussion_prompt = DISCUSSION_PROMPT.format(
            themes=", ".join(cluster_labels),
            paper_count=len(papers),
            gap_context=gap_context or "No specific research gaps identified.",
            trend_context=trend_context or "No trend data available.",
            cross_cluster_info=cross_cluster_info or "No cross-cluster citation data available.",
        )

        try:
            discussion_response = await llm_provider.generate(
                prompt=discussion_prompt,
                temperature=0.5,
                max_tokens=2000,
            )
            sections.append({
                "heading": "Discussion",
                "content": discussion_response.content.strip(),
                "paper_refs": [],
            })
        except Exception as e:
            logger.error(f"Failed to generate discussion: {e}")
            sections.append({
                "heading": "Discussion",
                "content": "Further analysis of cross-cluster connections and research gaps is warranted.",
                "paper_refs": [],
            })

        # 4. Generate Conclusion
        gaps_summary = ", ".join(
            f"{g.get('cluster_a', {}).get('label', '?')}-{g.get('cluster_b', {}).get('label', '?')}"
            for g in (gaps or [])[:3]
        ) or "none identified"

        trends_summary = ""
        if trends:
            emerging = [t.get("label", "?") for t in trends.get("emerging", [])[:3]]
            trends_summary = ", ".join(emerging) if emerging else "no clear trends"
        else:
            trends_summary = "not analyzed"

        conclusion_prompt = CONCLUSION_PROMPT.format(
            themes=", ".join(cluster_labels),
            paper_count=len(papers),
            gaps_summary=gaps_summary,
            trends_summary=trends_summary,
        )

        try:
            conclusion_response = await llm_provider.generate(
                prompt=conclusion_prompt,
                temperature=0.4,
                max_tokens=1000,
            )
            sections.append({
                "heading": "Conclusion",
                "content": conclusion_response.content.strip(),
                "paper_refs": [],
            })
        except Exception as e:
            logger.error(f"Failed to generate conclusion: {e}")

        # 5. Build title
        title = f"Literature Review: {field_summary}"

        # 6. Compile markdown
        markdown = self.format_as_markdown(
            LitReviewResult(
                title=title,
                sections=sections,
                references=references,
                markdown="",
                metadata={},
            )
        )

        generation_time = round(time.time() - start_time, 2)

        result = LitReviewResult(
            title=title,
            sections=sections,
            references=references,
            markdown=markdown,
            metadata={
                "paper_count": len(papers),
                "cluster_count": len(review_clusters),
                "generation_time": generation_time,
                "citation_style": style,
            },
        )

        logger.info(
            f"Literature review generated: {len(sections)} sections, "
            f"{len(papers)} papers, {generation_time}s"
        )

        return result

    def format_as_markdown(self, review: LitReviewResult) -> str:
        """
        Format a LitReviewResult into proper markdown with headings,
        citations, and a references section.
        """
        lines = [f"# {review.title}", ""]

        for section in review.sections:
            heading = section["heading"]
            content = section["content"]

            if heading in ("Introduction", "Discussion", "Conclusion"):
                lines.append(f"## {heading}")
            else:
                lines.append(f"## {heading}")

            lines.append("")
            lines.append(content)
            lines.append("")

        # References section
        if review.references:
            lines.append("## References")
            lines.append("")
            for ref in review.references:
                lines.append(ref)
                lines.append("")

        return "\n".join(lines)

    async def export_as_pdf(self, markdown_content: str) -> bytes:
        """
        Convert markdown to PDF with academic styling.

        Uses markdown2 for HTML conversion and weasyprint for PDF rendering.
        Falls back to returning markdown bytes if weasyprint is unavailable.

        Args:
            markdown_content: Full markdown text of the literature review.

        Returns:
            PDF file bytes.
        """
        try:
            import markdown2
        except ImportError:
            logger.warning("markdown2 not installed, returning raw markdown as bytes")
            return markdown_content.encode("utf-8")

        # Convert markdown to HTML
        html_body = markdown2.markdown(
            markdown_content,
            extras=["fenced-code-blocks", "tables", "header-ids"],
        )

        # Wrap in full HTML with academic CSS
        full_html = _build_academic_html(html_body)

        # Try weasyprint for PDF
        try:
            from weasyprint import HTML

            pdf_bytes = HTML(string=full_html).write_pdf()
            logger.info(f"PDF generated: {len(pdf_bytes)} bytes")
            return pdf_bytes

        except ImportError:
            logger.warning(
                "weasyprint not installed. Returning markdown as bytes. "
                "Install with: pip install weasyprint"
            )
            return markdown_content.encode("utf-8")
        except Exception as e:
            logger.error(f"PDF generation failed: {e}")
            return markdown_content.encode("utf-8")


# ==================== Internal Helpers ====================


def _organize_by_cluster(
    papers: List[Dict[str, Any]],
    clusters: List[Dict[str, Any]],
) -> Dict[int, List[Dict[str, Any]]]:
    """Group papers by cluster ID."""
    cluster_papers: Dict[int, List[Dict[str, Any]]] = {}
    for paper in papers:
        cid = paper.get("cluster_id", -1)
        cluster_papers.setdefault(cid, []).append(paper)
    return cluster_papers


def _build_apa_references(papers: List[Dict[str, Any]]) -> List[str]:
    """Build APA-formatted reference list from papers."""
    refs = []
    for paper in sorted(papers, key=lambda p: _first_author_last_name(p)):
        authors = _format_apa_authors(paper.get("authors", []))
        year = paper.get("year", "n.d.")
        title = paper.get("title", "Untitled")
        venue = paper.get("venue", "")
        doi = paper.get("doi", "")

        ref = f"{authors} ({year}). {title}."
        if venue:
            ref += f" *{venue}*."
        if doi:
            doi_url = f"https://doi.org/{doi}" if not doi.startswith("http") else doi
            ref += f" {doi_url}"

        refs.append(ref)

    return refs


def _build_citation_lookup(papers: List[Dict[str, Any]]) -> Dict[str, str]:
    """Build a lookup from paper ID to [Author, Year] citation key."""
    lookup = {}
    for paper in papers:
        pid = paper.get("id", paper.get("s2_paper_id", ""))
        last_name = _first_author_last_name(paper)
        year = paper.get("year", "n.d.")
        lookup[str(pid)] = f"[{last_name}, {year}]"
    return lookup


def _format_paper_summaries(papers: List[Dict[str, Any]]) -> str:
    """Format papers into a summary block for the LLM prompt."""
    lines = []
    for paper in papers[:15]:  # Cap at 15 to avoid prompt overflow
        last_name = _first_author_last_name(paper)
        year = paper.get("year", "n.d.")
        title = paper.get("title", "Untitled")
        abstract = paper.get("tldr") or paper.get("abstract", "")
        if abstract and len(abstract) > 250:
            abstract = abstract[:250] + "..."
        citations = paper.get("citation_count", 0)

        entry = f"- [{last_name}, {year}] \"{title}\" (cited {citations}x)"
        if abstract:
            entry += f"\n  Summary: {abstract}"
        lines.append(entry)

    return "\n\n".join(lines)


def _format_citation_keys(papers: List[Dict[str, Any]]) -> str:
    """Format available citation keys for the LLM to use."""
    keys = []
    for paper in papers[:15]:
        last_name = _first_author_last_name(paper)
        year = paper.get("year", "n.d.")
        title = paper.get("title", "Untitled")
        keys.append(f"[{last_name}, {year}] = \"{title}\"")
    return "\n".join(keys)


def _first_author_last_name(paper: Dict[str, Any]) -> str:
    """Extract the first author's last name from a paper dict."""
    authors = paper.get("authors", [])
    if not authors:
        return "Unknown"

    first_author = authors[0]
    if isinstance(first_author, dict):
        name = first_author.get("name", first_author.get("display_name", ""))
    elif isinstance(first_author, str):
        name = first_author
    else:
        return "Unknown"

    if not name:
        return "Unknown"

    # Extract last name (last word of name)
    parts = name.strip().split()
    return parts[-1] if parts else "Unknown"


def _format_apa_authors(authors: List[Any], max_authors: int = 7) -> str:
    """Format authors in APA style."""
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
            parts = name.strip().split()
            if len(parts) >= 2:
                # Last, F. I.
                last = parts[-1]
                initials = " ".join(f"{p[0]}." for p in parts[:-1])
                names.append(f"{last}, {initials}")
            else:
                names.append(name)

    if not names:
        return "Unknown"

    if len(names) == 1:
        return names[0]
    elif len(names) == 2:
        return f"{names[0]}, & {names[1]}"
    else:
        if len(authors) > max_authors:
            return ", ".join(names[:6]) + ", ... " + names[-1]
        return ", ".join(names[:-1]) + f", & {names[-1]}"


def _infer_field_summary(
    papers: List[Dict[str, Any]],
    clusters: List[Dict[str, Any]],
) -> str:
    """Infer a high-level field summary from cluster labels and paper fields."""
    labels = [c.get("label", "") for c in clusters if c.get("label")]
    if labels:
        return ", ".join(labels[:3])

    # Fallback: use most common fields
    field_counts: Dict[str, int] = {}
    for p in papers:
        for f in p.get("fields", p.get("fields_of_study", [])):
            if isinstance(f, str):
                field_counts[f] = field_counts.get(f, 0) + 1

    if field_counts:
        top_fields = sorted(field_counts, key=field_counts.get, reverse=True)[:3]
        return ", ".join(top_fields)

    return "Academic Research"


def _analyze_cross_cluster_edges(
    edges: List[Dict[str, Any]],
    cluster_papers: Dict[int, List[Dict[str, Any]]],
    clusters: List[Dict[str, Any]],
) -> str:
    """Analyze citation flow between clusters for the discussion section."""
    if not edges or not cluster_papers:
        return ""

    # Build paper_id -> cluster_id map
    paper_to_cluster: Dict[str, int] = {}
    for cid, c_papers in cluster_papers.items():
        for p in c_papers:
            pid = str(p.get("id", ""))
            if pid:
                paper_to_cluster[pid] = cid

    # Build cluster label map
    cluster_labels = {
        c.get("id", -1): c.get("label", f"Cluster {c.get('id', '?')}")
        for c in clusters
    }

    # Count cross-cluster edges
    cross_counts: Dict[tuple, int] = {}
    for edge in edges:
        src_cluster = paper_to_cluster.get(str(edge.get("source", "")))
        tgt_cluster = paper_to_cluster.get(str(edge.get("target", "")))
        if src_cluster is not None and tgt_cluster is not None and src_cluster != tgt_cluster:
            key = (src_cluster, tgt_cluster)
            cross_counts[key] = cross_counts.get(key, 0) + 1

    if not cross_counts:
        return "Minimal cross-cluster citation activity observed."

    lines = []
    for (src, tgt), count in sorted(cross_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        src_label = cluster_labels.get(src, f"Cluster {src}")
        tgt_label = cluster_labels.get(tgt, f"Cluster {tgt}")
        lines.append(f"- {src_label} -> {tgt_label}: {count} citations")

    return "\n".join(lines)


def _build_academic_html(body_html: str) -> str:
    """Wrap HTML body in a full document with academic CSS for PDF export."""
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page {{
        size: A4;
        margin: 2.5cm 2.5cm 2.5cm 2.5cm;
    }}
    body {{
        font-family: "Times New Roman", Times, serif;
        font-size: 12pt;
        line-height: 1.5;
        color: #1a1a1a;
        max-width: 100%;
    }}
    h1 {{
        font-size: 18pt;
        text-align: center;
        margin-bottom: 24pt;
        font-weight: bold;
    }}
    h2 {{
        font-size: 14pt;
        margin-top: 18pt;
        margin-bottom: 12pt;
        font-weight: bold;
    }}
    h3 {{
        font-size: 12pt;
        margin-top: 12pt;
        margin-bottom: 8pt;
        font-weight: bold;
        font-style: italic;
    }}
    p {{
        text-align: justify;
        margin-bottom: 8pt;
        text-indent: 0.5in;
    }}
    p:first-child, h2 + p, h3 + p {{
        text-indent: 0;
    }}
    em {{
        font-style: italic;
    }}
    strong {{
        font-weight: bold;
    }}
    ul, ol {{
        margin-left: 0.5in;
        margin-bottom: 8pt;
    }}
    li {{
        margin-bottom: 4pt;
    }}
    /* References section */
    h2:last-of-type ~ p {{
        text-indent: -0.5in;
        padding-left: 0.5in;
    }}
</style>
</head>
<body>
{body_html}
</body>
</html>"""
