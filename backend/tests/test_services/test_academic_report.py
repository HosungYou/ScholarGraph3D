"""
Tests for services/academic_report_service.py.

Covers feasibility assessment, APA methods section generation,
table construction, figure captions, and reference list formatting.

Run: pytest tests/test_services/test_academic_report.py -v
"""

import pytest
from datetime import datetime

from services.academic_report_service import generate_academic_report


# ==================== Mock data ====================

MOCK_METRICS = {
    "network_level": {
        "density": 0.041,
        "diameter": 5,
        "avg_path_length": 2.8,
        "reciprocity": 0.12,
        "transitivity": 0.15,
        "component_count": 1,
        "avg_degree": 4.2,
        "node_count": 100,
        "edge_count": 420,
    },
    "node_centrality": [
        {
            "paper_id": f"p{i}",
            "title": f"Paper {i}",
            "cluster_id": i % 3,
            "cluster_label": f"C{i % 3}",
            "degree_in": 10 - i,
            "degree_out": 5,
            "betweenness": round(0.1 - i * 0.005, 4),
            "closeness": 0.4,
            "pagerank": 0.02,
            "eigenvector": 0.03,
        }
        for i in range(15)
    ],
    "community_metrics": [
        {
            "cluster_id": 0,
            "label": "NLP",
            "paper_count": 40,
            "intra_density": 0.08,
            "avg_year": 2021.5,
            "year_range": "2018-2024",
            "h_index": 12,
        },
        {
            "cluster_id": 1,
            "label": "IR",
            "paper_count": 35,
            "intra_density": 0.06,
            "avg_year": 2020.0,
            "year_range": "2017-2023",
            "h_index": 8,
        },
        {
            "cluster_id": 2,
            "label": "HCI",
            "paper_count": 25,
            "intra_density": 0.05,
            "avg_year": 2022.0,
            "year_range": "2019-2025",
            "h_index": 5,
        },
    ],
    "structural_holes": [
        {
            "paper_id": f"p{i}",
            "title": f"Paper {i}",
            "cluster_id": i % 3,
            "constraint": round(0.3 + i * 0.05, 4),
            "effective_size": round(5.0 - i * 0.3, 2),
            "efficiency": round(0.8 - i * 0.05, 2),
        }
        for i in range(10)
    ],
    "modularity": 0.68,
    "silhouette": 0.42,
}


def _make_graph_context(n_papers=100, n_clusters=3, with_years=True):
    """Build a minimal graph_context dict."""
    papers = []
    for i in range(n_papers):
        p = {
            "id": f"p{i}",
            "title": f"Paper {i}",
            "cluster_id": i % n_clusters,
        }
        if with_years:
            p["year"] = 2018 + (i % 7)
        papers.append(p)

    clusters = [
        {"id": cid, "label": f"Cluster {cid}", "paper_count": n_papers // n_clusters}
        for cid in range(n_clusters)
    ]

    return {
        "papers": papers,
        "clusters": clusters,
        "total_papers": n_papers,
        "edges": [],
        "gaps": [],
    }


def _call_report(n_papers=100, n_clusters=3, metrics=None, gaps=None):
    """Helper that calls generate_academic_report with sane defaults."""
    ctx = _make_graph_context(n_papers, n_clusters)
    if gaps is not None:
        ctx["gaps"] = gaps
    return generate_academic_report(
        network_metrics=metrics or MOCK_METRICS,
        graph_context=ctx,
        gaps=gaps or [],
    )


# ==================== Feasibility tests ====================

def test_feasibility_insufficient():
    """< 10 papers returns feasibility = 'insufficient'."""
    ctx = _make_graph_context(n_papers=5, n_clusters=1)
    report = generate_academic_report(
        network_metrics=MOCK_METRICS,
        graph_context=ctx,
        gaps=[],
    )
    assert report["feasibility"] == "insufficient"
    assert len(report["warnings"]) > 0


def test_feasibility_partial_few_papers():
    """15 papers, 2 clusters returns 'partial' with a warning."""
    ctx = _make_graph_context(n_papers=15, n_clusters=2)
    report = generate_academic_report(
        network_metrics=MOCK_METRICS,
        graph_context=ctx,
        gaps=[],
    )
    assert report["feasibility"] == "partial"
    assert len(report["warnings"]) > 0


def test_feasibility_full():
    """50 papers, 4 clusters returns feasibility = 'full'."""
    ctx = _make_graph_context(n_papers=50, n_clusters=4)
    report = generate_academic_report(
        network_metrics=MOCK_METRICS,
        graph_context=ctx,
        gaps=[],
    )
    assert report["feasibility"] == "full"
    assert report["warnings"] == []


def test_feasibility_single_cluster():
    """50 papers, 1 cluster returns 'insufficient' (n_clusters < 2)."""
    ctx = _make_graph_context(n_papers=50, n_clusters=1)
    # With 1 cluster the service sees n_clusters=1 < 2 → insufficient
    report = generate_academic_report(
        network_metrics=MOCK_METRICS,
        graph_context=ctx,
        gaps=[],
    )
    # The service checks n_clusters < 2 as part of the insufficient condition
    assert report["feasibility"] == "insufficient"


# ==================== Methods section tests ====================

def test_methods_section_contains_parameters():
    """Actual N, Q, silhouette values appear in the methods text."""
    report = _call_report(n_papers=100, n_clusters=3)
    methods = report["methods_section"]

    # N = 100 must appear
    assert "100" in methods, "Total paper count not found in methods section"

    # Modularity Q = 0.68 → "0.68"
    assert "0.68" in methods, "Modularity Q value not found in methods section"

    # Silhouette = 0.42 → "0.42"
    assert "0.42" in methods, "Silhouette value not found in methods section"


def test_methods_section_has_all_subsections():
    """All 5 subsections are present in the methods text."""
    report = _call_report()
    methods = report["methods_section"]

    expected_subsections = [
        "2.1 Data Collection",
        "2.2 Embedding and Dimensionality Reduction",
        "2.3 Community Detection",
        "2.4 Network Analysis",
        "2.5 Structural Gap Detection",
    ]
    for subsection in expected_subsections:
        assert subsection in methods, f"Missing subsection: {subsection}"


# ==================== Table tests ====================

def test_table_1_has_all_metrics():
    """Table 1 has exactly 11 metric rows."""
    report = _call_report()
    table_1 = report["tables"]["table_1"]

    assert "rows" in table_1
    assert len(table_1["rows"]) == 11, (
        f"Expected 11 rows in Table 1, got {len(table_1['rows'])}"
    )

    # Verify metric labels
    metric_names = [row[0] for row in table_1["rows"]]
    assert "Nodes" in metric_names
    assert "Edges" in metric_names
    assert "Density" in metric_names
    assert "Modularity Q" in metric_names
    assert "Silhouette" in metric_names


def test_table_2_one_row_per_cluster():
    """Table 2 has one row per community (cluster)."""
    report = _call_report(n_papers=100, n_clusters=3)
    table_2 = report["tables"]["table_2"]

    # MOCK_METRICS has 3 community_metrics entries
    assert len(table_2["rows"]) == 3, (
        f"Expected 3 rows in Table 2, got {len(table_2['rows'])}"
    )

    # Each row should have 6 columns: Community, Label, N, Density, h-index, Year Range
    for row in table_2["rows"]:
        assert len(row) == 6, f"Expected 6 columns in Table 2 row, got {len(row)}: {row}"


def test_table_3_top_10_sorted():
    """Table 3 has at most 10 rows, using the top 10 by betweenness."""
    report = _call_report()
    table_3 = report["tables"]["table_3"]

    # MOCK_METRICS has 15 node_centrality entries — table should cap at 10
    assert len(table_3["rows"]) <= 10, (
        f"Table 3 should have at most 10 rows, got {len(table_3['rows'])}"
    )
    assert len(table_3["rows"]) == 10

    # Ranks should be 1..10
    ranks = [int(row[0]) for row in table_3["rows"]]
    assert ranks == list(range(1, 11))


def test_table_4_gap_data():
    """Table 4 has one row per gap provided."""
    gaps = [
        {
            "cluster_a": {"label": "NLP"},
            "cluster_b": {"label": "IR"},
            "gap_score_breakdown": {
                "composite": 0.75,
                "structural": 0.8,
                "relatedness": 0.6,
                "temporal": 0.5,
                "intent": 0.7,
                "directional": 0.4,
            },
        },
        {
            "cluster_a": {"label": "IR"},
            "cluster_b": {"label": "HCI"},
            "gap_score_breakdown": {
                "composite": 0.55,
                "structural": 0.6,
                "relatedness": 0.5,
                "temporal": 0.4,
                "intent": 0.6,
                "directional": 0.3,
            },
        },
    ]
    ctx = _make_graph_context(n_papers=100, n_clusters=3)
    ctx["gaps"] = gaps
    report = generate_academic_report(
        network_metrics=MOCK_METRICS,
        graph_context=ctx,
        gaps=gaps,
    )
    table_4 = report["tables"]["table_4"]

    assert len(table_4["rows"]) == 2, (
        f"Expected 2 gap rows, got {len(table_4['rows'])}"
    )
    # Community pair column should contain both cluster labels
    first_pair = table_4["rows"][0][0]
    assert "NLP" in first_pair and "IR" in first_pair


def test_table_5_structural_holes():
    """Table 5 has rows matching structural holes (up to 10)."""
    report = _call_report()
    table_5 = report["tables"]["table_5"]

    # MOCK_METRICS has 10 structural_holes entries
    assert len(table_5["rows"]) == 10, (
        f"Expected 10 rows in Table 5, got {len(table_5['rows'])}"
    )

    # Each row: Paper, Community, Constraint, Effective Size, Efficiency
    for row in table_5["rows"]:
        assert len(row) == 5, f"Expected 5 columns in Table 5 row, got {len(row)}: {row}"


# ==================== Figure captions tests ====================

def test_figure_captions_contain_actual_values():
    """Figure captions contain total N and year range from the papers."""
    ctx = _make_graph_context(n_papers=100, n_clusters=3, with_years=True)
    report = generate_academic_report(
        network_metrics=MOCK_METRICS,
        graph_context=ctx,
        gaps=[],
    )
    fig1 = report["figure_captions"]["figure_1"]

    # N=100 must appear
    assert "100" in fig1, "Total paper count not in Figure 1 caption"

    # Year range: years are 2018 + (i % 7) for i in 0..99
    # min = 2018, max = 2024
    assert "2018" in fig1, "Year min not in Figure 1 caption"
    assert "2024" in fig1, "Year max not in Figure 1 caption"


def test_figure_captions_all_three_present():
    """All three figure captions are present in the output."""
    report = _call_report()
    captions = report["figure_captions"]

    assert "figure_1" in captions
    assert "figure_2" in captions
    assert "figure_3" in captions

    for key, text in captions.items():
        assert isinstance(text, str)
        assert len(text) > 0, f"{key} caption is empty"


# ==================== Reference list tests ====================

def test_reference_list_has_methodology_refs():
    """methodology_refs contains all 13 hardcoded APA references."""
    report = _call_report()
    ref_list = report["reference_list"]

    assert "methodology_refs" in ref_list
    assert len(ref_list["methodology_refs"]) == 13, (
        f"Expected 13 methodology refs, got {len(ref_list['methodology_refs'])}"
    )

    # Spot-check a few known refs
    all_refs = "\n".join(ref_list["methodology_refs"])
    assert "Burt" in all_refs
    assert "Freeman" in all_refs
    assert "Newman" in all_refs
    assert "PageRank" in all_refs or "Brin" in all_refs


def test_reference_list_has_analysis_refs():
    """analysis_refs are generated dynamically from top centrality papers."""
    # Build a graph_context with papers that have full metadata
    papers_with_meta = [
        {
            "id": f"p{i}",
            "title": f"Paper {i}",
            "cluster_id": i % 3,
            "year": 2020 + i,
            "authors": [{"name": f"Author {i}"}],
            "venue": "NeurIPS",
        }
        for i in range(15)
    ]
    ctx = {
        "papers": papers_with_meta,
        "clusters": [{"id": j, "label": f"C{j}", "paper_count": 5} for j in range(3)],
        "total_papers": 15,
        "edges": [],
        "gaps": [],
    }
    report = generate_academic_report(
        network_metrics=MOCK_METRICS,
        graph_context=ctx,
        gaps=[],
    )
    analysis_refs = report["reference_list"]["analysis_refs"]

    # Should have at most 10 analysis refs (top 10 centrality papers)
    assert len(analysis_refs) <= 10
    assert len(analysis_refs) > 0

    # Each ref should have paper_id and apa_citation
    for ref in analysis_refs:
        assert "paper_id" in ref
        assert "apa_citation" in ref
        assert isinstance(ref["apa_citation"], str)
        assert len(ref["apa_citation"]) > 0


# ==================== Timestamp test ====================

def test_report_has_generated_at():
    """Report includes a valid ISO timestamp in generated_at."""
    report = _call_report()

    assert "generated_at" in report
    ts = report["generated_at"]
    assert isinstance(ts, str)
    assert len(ts) > 0

    # Should be parseable as ISO 8601 with timezone
    # datetime.fromisoformat handles "+00:00" but not "Z" on Python < 3.11
    ts_normalized = ts.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(ts_normalized)
    assert parsed.year >= 2024, f"Timestamp year {parsed.year} seems wrong"


# ==================== Return shape test ====================

def test_report_return_shape():
    """generate_academic_report always returns all expected top-level keys."""
    report = _call_report()

    expected_keys = {
        "methods_section",
        "tables",
        "figure_captions",
        "reference_list",
        "network_metrics",
        "parameters",
        "generated_at",
        "feasibility",
        "warnings",
    }
    assert set(report.keys()) == expected_keys

    # Tables sub-keys
    assert set(report["tables"].keys()) == {
        "table_1", "table_2", "table_3", "table_4", "table_5"
    }
