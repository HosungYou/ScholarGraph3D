"""
Academic Report generation service for ScholarGraph3D.

Generates APA 7th formatted academic report content from network
metrics and gap analysis data. All template-based — no LLM calls.

Zero additional S2 API calls — all data comes from existing graph data.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ─── Default analysis parameters ──────────────────────────────────────

_DEFAULT_PARAMS = {
    "n_neighbors": 15,
    "min_cluster_size": 5,
    "similarity_threshold": 0.7,
    "intermediate_dim": 50,
    "embedding_model": "SPECTER2",
    "max_papers": 80,
}

# ─── Hardcoded methodology references (APA 7th) ──────────────────────

_METHODOLOGY_REFS = [
    'Bonacich, P. (1987). Power and centrality: A family of measures. American Journal of Sociology, 92(5), 1170\u20131182. https://doi.org/10.1086/228631',
    'Brin, S., & Page, L. (1998). The anatomy of a large-scale hypertextual web search engine. Computer Networks and ISDN Systems, 30(1\u20137), 107\u2013117. https://doi.org/10.1016/S0169-7552(98)00110-X',
    'Burt, R. S. (1992). Structural holes: The social structure of competition. Harvard University Press.',
    'Freeman, L. C. (1977). A set of measures of centrality based on betweenness. Sociometry, 40(1), 35\u201341. https://doi.org/10.2307/3033543',
    'Freeman, L. C. (1978). Centrality in social networks: Conceptual clarification. Social Networks, 1(3), 215\u2013239. https://doi.org/10.1016/0378-8733(78)90021-7',
    'Hagberg, A. A., Schult, D. A., & Swart, P. J. (2008). Exploring network structure, dynamics, and function using NetworkX. In Proceedings of the 7th Python in Science Conference (pp. 11\u201315).',
    'Kinney, R., Anastasiu, C., Authur, R., Belber, I., Brazeale, D., Cakir, S., ... & Weld, D. (2023). The Semantic Scholar Academic Graph. arXiv preprint arXiv:2301.10140.',
    'McInnes, L., Healy, J., & Astels, S. (2017). hdbscan: Hierarchical density based clustering. Journal of Open Source Software, 2(11), 205. https://doi.org/10.21105/joss.00205',
    'McInnes, L., Healy, J., & Melville, J. (2018). UMAP: Uniform manifold approximation and projection for dimension reduction. arXiv preprint arXiv:1802.03426.',
    'Newman, M. E. J., & Girvan, M. (2004). Finding and evaluating community structure in networks. Physical Review E, 69(2), 026113. https://doi.org/10.1103/PhysRevE.69.026113',
    'Rousseeuw, P. J. (1987). Silhouettes: A graphical aid to the interpretation and validation of cluster analysis. Journal of Computational and Applied Mathematics, 20, 53\u201365. https://doi.org/10.1016/0377-0427(87)90125-7',
    'Salton, G. (1963). Associative document retrieval techniques using bibliographic information. Communications of the ACM, 6(2), 74\u201380. https://doi.org/10.1145/366593.366616',
    'Singh, A., D\u2019Arcy, M., Cohan, A., Downey, D., & Weld, D. S. (2023). SciRepEval: A multi-format benchmark for scientific document representations. arXiv preprint arXiv:2211.13308.',
]


def generate_academic_report(
    network_metrics: Dict[str, Any],
    graph_context: Dict[str, Any],
    gaps: List[Dict[str, Any]],
    analysis_parameters: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generate APA 7th formatted academic report content.

    All template-based — no LLM calls.

    Args:
        network_metrics: Output of NetworkMetricsComputer.compute_all()
        graph_context: {papers: [...], clusters: [...], total_papers: int, edges: [...]}
        gaps: List of gap dicts from gap detection
        analysis_parameters: Dict with actual analysis params (overrides defaults)

    Returns:
        Dict with methods_section, tables, figure_captions, reference_list,
        network_metrics, parameters, generated_at, feasibility, warnings.
    """
    # Merge parameters with defaults
    params = dict(_DEFAULT_PARAMS)
    if analysis_parameters:
        params.update(analysis_parameters)

    papers = graph_context.get("papers", [])
    clusters = graph_context.get("clusters", [])
    total_papers = graph_context.get("total_papers", len(papers))

    n_clusters = len([c for c in clusters if c.get("id", -1) != -1])

    # Feasibility assessment
    feasibility, warnings = _assess_feasibility(total_papers, n_clusters)

    # Extract data from network_metrics
    net_level = network_metrics.get("network_level", {})
    node_centrality = network_metrics.get("node_centrality", [])
    community_metrics = network_metrics.get("community_metrics", [])
    structural_holes = network_metrics.get("structural_holes", [])
    modularity = network_metrics.get("modularity", 0.0)
    silhouette = network_metrics.get("silhouette", -1.0)

    # Generate methods section
    methods_section = _generate_methods_section(
        params, total_papers, n_clusters, modularity, silhouette, net_level
    )

    # Generate tables
    tables = _generate_tables(
        net_level, modularity, silhouette,
        community_metrics, node_centrality,
        gaps, structural_holes,
    )

    # Generate figure captions
    figure_captions = _generate_figure_captions(
        total_papers, papers, n_clusters
    )

    # Generate reference list
    reference_list = _generate_reference_list(node_centrality, papers)

    return {
        "methods_section": methods_section,
        "tables": tables,
        "figure_captions": figure_captions,
        "reference_list": reference_list,
        "network_metrics": network_metrics,
        "parameters": params,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "feasibility": feasibility,
        "warnings": warnings,
    }


# ─── Feasibility Assessment ───────────────────────────────────────────


def _assess_feasibility(
    total_papers: int,
    n_clusters: int,
) -> Tuple[str, List[str]]:
    """
    Assess feasibility of generating a meaningful academic report.

    Returns:
        Tuple of (feasibility_level, warning_messages)
    """
    if total_papers < 10 or n_clusters < 2:
        return (
            "insufficient",
            ["Academic Report requires at least 10 papers and 2 communities."],
        )

    warnings = []

    if n_clusters == 1:
        warnings.append(
            "Only one community detected; gap analysis tables will be excluded."
        )
        return ("partial", warnings)

    if total_papers < 30:
        warnings.append(
            "Network size is limited; centrality measures may not be statistically meaningful."
        )
        if n_clusters >= 2:
            return ("partial", warnings)

    if total_papers >= 30 and n_clusters >= 3:
        return ("full", [])

    # 30+ papers but only 2 clusters
    return ("partial", warnings if warnings else [
        "Only 2 communities detected; gap analysis scope is limited."
    ])


# ─── Methods Section ──────────────────────────────────────────────────


def _generate_methods_section(
    params: Dict[str, Any],
    total_papers: int,
    n_clusters: int,
    modularity: float,
    silhouette: float,
    net_level: Dict[str, Any],
) -> str:
    """Generate APA 7th Methods section with 5 subsections."""
    # Quality descriptor for modularity
    if modularity > 0.5:
        quality_descriptor = "good"
    elif modularity > 0.3:
        quality_descriptor = "moderate"
    else:
        quality_descriptor = "weak"

    max_papers = params.get("max_papers", 80)
    n_neighbors = params.get("n_neighbors", 15)
    intermediate_dim = params.get("intermediate_dim", 50)
    min_cluster_size = params.get("min_cluster_size", 5)
    node_count = net_level.get("node_count", total_papers)
    edge_count = net_level.get("edge_count", 0)
    density = net_level.get("density", 0.0)

    subsections = []

    # 2a. Data Collection
    subsections.append(
        "2.1 Data Collection\n\n"
        f"Citation data were retrieved from the Semantic Scholar Academic Graph API "
        f"(Kinney et al., 2023). Beginning with a seed paper, the network was expanded "
        f"by collecting direct references and citations (depth = 1), yielding a corpus "
        f"of N = {total_papers} papers. Papers were retained based on citation count "
        f"ranking, with a maximum of {max_papers} papers included."
    )

    # 2b. Embedding & Dimensionality Reduction
    subsections.append(
        "2.2 Embedding and Dimensionality Reduction\n\n"
        f"Document-level semantic representations were obtained using SPECTER2 "
        f"(Singh et al., 2023), a transformer-based model producing 768-dimensional "
        f"embeddings. Dimensionality reduction was performed in two stages: first to "
        f"{intermediate_dim} dimensions using UMAP (McInnes et al., 2018) with "
        f"n_neighbors = {n_neighbors} and min_dist = 0.0, then to three dimensions "
        f"for visualization (min_dist = 0.1)."
    )

    # 2c. Community Detection
    subsections.append(
        "2.3 Community Detection\n\n"
        f"Communities were identified using HDBSCAN (McInnes et al., 2017) with "
        f"min_cluster_size = {min_cluster_size}, applied to the {intermediate_dim}-dimensional "
        f"intermediate embeddings. This yielded {n_clusters} communities with a modularity "
        f"coefficient Q = {modularity:.2f} (Newman & Girvan, 2004) and mean silhouette "
        f"coefficient = {silhouette:.2f} (Rousseeuw, 1987), indicating {quality_descriptor} "
        f"community separation."
    )

    # 2d. Network Analysis
    subsections.append(
        "2.4 Network Analysis\n\n"
        f"The resulting citation network comprised {node_count} nodes and {edge_count} edges "
        f"(density = {density:.3f}). Centrality measures were computed following Freeman "
        f"(1977, 1978): degree centrality (in-degree and out-degree), betweenness centrality, "
        f"and closeness centrality. PageRank (Brin & Page, 1998) and eigenvector centrality "
        f"(Bonacich, 1987) were also computed. Network analysis was performed using NetworkX "
        f"(Hagberg et al., 2008)."
    )

    # 2e. Structural Gap Detection
    subsections.append(
        "2.5 Structural Gap Detection\n\n"
        "Structural gaps between communities were assessed using a multi-dimensional "
        "composite score incorporating five dimensions: structural void (weight = .35), "
        "thematic relatedness (weight = .25), temporal disjunction (weight = .15), "
        "citation intent distribution (weight = .15), and directional asymmetry "
        "(weight = .10). Structural holes were quantified using Burt's (1992) constraint "
        "measure, where lower constraint indicates greater brokerage potential."
    )

    return "\n\n".join(subsections)


# ─── Tables ───────────────────────────────────────────────────────────


def _generate_tables(
    net_level: Dict[str, Any],
    modularity: float,
    silhouette: float,
    community_metrics: List[Dict[str, Any]],
    node_centrality: List[Dict[str, Any]],
    gaps: List[Dict[str, Any]],
    structural_holes: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """Generate all 5 tables."""
    return {
        "table_1": _table_network_statistics(net_level, modularity, silhouette),
        "table_2": _table_community_characteristics(community_metrics),
        "table_3": _table_top_centrality(node_centrality),
        "table_4": _table_structural_gaps(gaps),
        "table_5": _table_bridge_papers(structural_holes),
    }


def _table_network_statistics(
    net_level: Dict[str, Any],
    modularity: float,
    silhouette: float,
) -> Dict[str, Any]:
    """Table 1: Network Statistics Summary."""
    rows = [
        ["Nodes", f"{net_level.get('node_count', 0):,}"],
        ["Edges", f"{net_level.get('edge_count', 0):,}"],
        ["Density", f"{net_level.get('density', 0.0):.3f}"],
        ["Diameter", str(net_level.get("diameter", 0))],
        ["Avg Path Length", f"{net_level.get('avg_path_length', 0.0):.3f}"],
        ["Reciprocity", f"{net_level.get('reciprocity', 0.0):.3f}"],
        ["Transitivity", f"{net_level.get('transitivity', 0.0):.3f}"],
        ["Components", str(net_level.get("component_count", 0))],
        ["Avg Degree", f"{net_level.get('avg_degree', 0.0):.3f}"],
        ["Modularity Q", f"{modularity:.3f}"],
        ["Silhouette", f"{silhouette:.3f}"],
    ]
    return {
        "title": "Table 1\nNetwork Statistics Summary",
        "headers": ["Metric", "Value"],
        "rows": rows,
        "note": "Network statistics computed on the full citation network.",
    }


def _table_community_characteristics(
    community_metrics: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Table 2: Community Characteristics."""
    rows = []
    for cm in community_metrics:
        rows.append([
            str(cm.get("cluster_id", "")),
            cm.get("label", ""),
            str(cm.get("paper_count", 0)),
            f"{cm.get('intra_density', 0.0):.3f}",
            str(cm.get("h_index", 0)),
            cm.get("year_range", "N/A"),
        ])
    return {
        "title": "Table 2\nCommunity Characteristics",
        "headers": ["Community", "Label", "N", "Density", "h-index", "Year Range"],
        "rows": rows,
        "note": "Communities identified via HDBSCAN. Density = intra-cluster edge density. h-index computed from citation counts.",
    }


def _table_top_centrality(
    node_centrality: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Table 3: Top 10 Papers by Betweenness Centrality."""
    rows = []
    for rank, nc in enumerate(node_centrality[:10], start=1):
        title = nc.get("title", "")
        if len(title) > 60:
            title = title[:57] + "..."
        total_degree = nc.get("degree_in", 0) + nc.get("degree_out", 0)
        rows.append([
            str(rank),
            title,
            nc.get("cluster_label", ""),
            f"{nc.get('betweenness', 0.0):.3f}",
            f"{nc.get('closeness', 0.0):.3f}",
            f"{nc.get('pagerank', 0.0):.3f}",
            f"{nc.get('eigenvector', 0.0):.3f}",
            str(total_degree),
        ])
    return {
        "title": "Table 3\nTop 10 Papers by Betweenness Centrality",
        "headers": ["Rank", "Paper", "Community", "Betweenness", "Closeness", "PageRank", "Eigenvector", "Degree"],
        "rows": rows,
        "note": "Centrality measures computed following Freeman (1977, 1978). PageRank damping factor = 0.85.",
    }


def _table_structural_gaps(
    gaps: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Table 4: Structural Gap Analysis."""
    rows = []
    for gap in gaps:
        cluster_a = gap.get("cluster_a", {})
        cluster_b = gap.get("cluster_b", {})
        label_a = cluster_a.get("label", "A")
        label_b = cluster_b.get("label", "B")
        breakdown = gap.get("gap_score_breakdown", {})
        rows.append([
            f"{label_a} \u2194 {label_b}",
            f"{breakdown.get('composite', 0.0):.3f}",
            f"{breakdown.get('structural', 0.0):.3f}",
            f"{breakdown.get('relatedness', 0.0):.3f}",
            f"{breakdown.get('temporal', 0.0):.3f}",
            f"{breakdown.get('intent', 0.0):.3f}",
            f"{breakdown.get('directional', 0.0):.3f}",
        ])
    return {
        "title": "Table 4\nStructural Gap Analysis",
        "headers": ["Community Pair", "Composite", "Structural", "Relatedness", "Temporal", "Intent", "Directional"],
        "rows": rows,
        "note": "Composite score computed as weighted sum. Higher scores indicate larger research gaps. See Methods for dimension weights.",
    }


def _table_bridge_papers(
    structural_holes: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Table 5: Bridge Papers and Structural Holes."""
    rows = []
    for sh in structural_holes[:10]:
        title = sh.get("title", "")
        if len(title) > 60:
            title = title[:57] + "..."
        rows.append([
            title,
            str(sh.get("cluster_id", "")),
            f"{sh.get('constraint', 0.0):.3f}",
            f"{sh.get('effective_size', 0.0):.3f}",
            f"{sh.get('efficiency', 0.0):.3f}",
        ])
    return {
        "title": "Table 5\nBridge Papers and Structural Holes",
        "headers": ["Paper", "Community", "Constraint", "Effective Size", "Efficiency"],
        "rows": rows,
        "note": "Structural holes measures following Burt (1992). Lower constraint indicates greater brokerage potential.",
    }


# ─── Figure Captions ──────────────────────────────────────────────────


def _generate_figure_captions(
    total_papers: int,
    papers: List[Dict[str, Any]],
    n_clusters: int,
) -> Dict[str, str]:
    """Generate APA 7th formatted figure captions."""
    # Determine year range from papers
    years = [p.get("year", 0) for p in papers if p.get("year", 0) > 0]
    year_min = min(years) if years else "N/A"
    year_max = max(years) if years else "N/A"

    figure_1 = (
        f"Figure 1\n"
        f"Citation Network Visualization of {total_papers} Papers "
        f"({year_min}\u2013{year_max})\n\n"
        f"Note. Three-dimensional citation network visualization showing "
        f"{n_clusters} communities identified through HDBSCAN clustering. "
        f"Node size represents citation count; node color indicates community "
        f"membership. Edge types include citation links and cosine similarity "
        f"connections (threshold \u2265 .70)."
    )

    figure_2 = (
        "Figure 2\n"
        "Structural Gap Overlay\n\n"
        "Note. Highlighted regions indicate identified structural gaps between "
        "communities. Dashed lines represent potential cross-community connections "
        "(ghost edges) with high semantic similarity but no existing citation link."
    )

    figure_3 = (
        "Figure 3\n"
        "Betweenness Centrality Distribution (Top 15 Papers)\n\n"
        "Note. Horizontal bar chart showing the 15 papers with highest betweenness "
        "centrality. Bar color indicates community membership. Betweenness centrality "
        "quantifies a paper's role as a bridge in the citation network (Freeman, 1977)."
    )

    return {
        "figure_1": figure_1,
        "figure_2": figure_2,
        "figure_3": figure_3,
    }


# ─── Reference List ───────────────────────────────────────────────────


def _generate_reference_list(
    node_centrality: List[Dict[str, Any]],
    papers: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate reference list with methodology and analysis refs."""
    # Build paper lookup for analysis refs
    paper_lookup = {}
    for p in papers:
        pid = str(p.get("id", ""))
        if pid:
            paper_lookup[pid] = p

    # Analysis refs: dynamically generate APA citations for top 10 centrality papers
    analysis_refs = []
    seen_ids = set()
    for nc in node_centrality[:10]:
        pid = nc.get("paper_id", "")
        if not pid or pid in seen_ids:
            continue
        seen_ids.add(pid)

        paper = paper_lookup.get(pid, {})
        apa_citation = _format_apa_citation(paper, nc)
        analysis_refs.append({
            "paper_id": pid,
            "apa_citation": apa_citation,
        })

    return {
        "methodology_refs": list(_METHODOLOGY_REFS),
        "analysis_refs": analysis_refs,
    }


def _format_apa_citation(paper: Dict[str, Any], centrality_data: Dict[str, Any]) -> str:
    """Format a paper dict into an APA 7th citation string."""
    # Extract authors
    authors = paper.get("authors", [])
    title = paper.get("title", centrality_data.get("title", "Untitled"))
    year = paper.get("year", 0)
    venue = paper.get("venue", paper.get("journal", ""))

    # Format author string
    if authors:
        if isinstance(authors[0], dict):
            author_names = [a.get("name", "") for a in authors if a.get("name")]
        else:
            author_names = [str(a) for a in authors if a]

        if len(author_names) == 0:
            author_str = "Unknown Author"
        elif len(author_names) == 1:
            author_str = _format_author_name(author_names[0])
        elif len(author_names) == 2:
            author_str = f"{_format_author_name(author_names[0])}, & {_format_author_name(author_names[1])}"
        elif len(author_names) <= 20:
            formatted = [_format_author_name(n) for n in author_names[:-1]]
            author_str = ", ".join(formatted) + f", & {_format_author_name(author_names[-1])}"
        else:
            formatted = [_format_author_name(n) for n in author_names[:19]]
            author_str = ", ".join(formatted) + f", ... {_format_author_name(author_names[-1])}"
    else:
        author_str = "Unknown Author"

    # Format year
    year_str = f"({year})" if year else "(n.d.)"

    # Format venue
    venue_str = f" {venue}." if venue else ""

    return f"{author_str} {year_str}. {title}.{venue_str}"


def _format_author_name(full_name: str) -> str:
    """Convert 'First Last' to 'Last, F.' APA format."""
    if not full_name:
        return "Unknown"
    parts = full_name.strip().split()
    if len(parts) == 1:
        return parts[0]
    last = parts[-1]
    initials = " ".join(f"{p[0]}." for p in parts[:-1] if p)
    return f"{last}, {initials}"
