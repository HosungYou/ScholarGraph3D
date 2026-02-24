"""
Tests for POST /api/academic-report and POST /api/network-overview
in routers/academic_report.py.

Covers:
- test_academic_report_success: valid graph_context returns 200 with all expected fields
- test_academic_report_insufficient_papers: < 10 papers returns feasibility="insufficient"
- test_academic_report_empty_context: empty papers list returns 400
- test_network_overview_success: returns 200 with 5 expected fields
- test_network_overview_empty: empty papers returns 400

Run: pytest tests/test_routers/test_academic_report.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ==================== Shared mock data ====================

_MOCK_METRICS = {
    "network_level": {
        "density": 0.041,
        "diameter": 5,
        "avg_path_length": 2.8,
        "reciprocity": 0.12,
        "transitivity": 0.15,
        "component_count": 1,
        "avg_degree": 4.2,
        "node_count": 50,
        "edge_count": 210,
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
        for i in range(10)
    ],
    "community_metrics": [
        {
            "cluster_id": 0,
            "label": "NLP",
            "paper_count": 20,
            "intra_density": 0.08,
            "avg_year": 2021.5,
            "year_range": "2018-2024",
            "h_index": 8,
        },
        {
            "cluster_id": 1,
            "label": "IR",
            "paper_count": 15,
            "intra_density": 0.06,
            "avg_year": 2020.0,
            "year_range": "2017-2023",
            "h_index": 5,
        },
        {
            "cluster_id": 2,
            "label": "HCI",
            "paper_count": 15,
            "intra_density": 0.05,
            "avg_year": 2022.0,
            "year_range": "2019-2025",
            "h_index": 4,
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
    "modularity": 0.65,
    "silhouette": 0.38,
}

_MOCK_OVERVIEW = {
    "node_count": 50,
    "edge_count": 210,
    "density": 0.041,
    "cluster_count": 3,
    "modularity": 0.65,
}

_MOCK_REPORT = {
    "methods_section": "2.1 Data Collection\n\nSample methods text.",
    "tables": {
        "table_1": {"title": "Table 1", "headers": ["Metric", "Value"], "rows": [], "note": ""},
        "table_2": {"title": "Table 2", "headers": [], "rows": [], "note": ""},
        "table_3": {"title": "Table 3", "headers": [], "rows": [], "note": ""},
        "table_4": {"title": "Table 4", "headers": [], "rows": [], "note": ""},
        "table_5": {"title": "Table 5", "headers": [], "rows": [], "note": ""},
    },
    "figure_captions": {
        "figure_1": "Figure 1\nCitation Network Visualization",
        "figure_2": "Figure 2\nStructural Gap Overlay",
        "figure_3": "Figure 3\nBetweenness Centrality Distribution",
    },
    "reference_list": {
        "methodology_refs": ["Ref1", "Ref2"],
        "analysis_refs": [],
    },
    "network_metrics": _MOCK_METRICS,
    "parameters": {"n_neighbors": 15},
    "generated_at": "2024-01-01T00:00:00+00:00",
    "feasibility": "full",
    "warnings": [],
}


def _make_graph_context(n_papers=50, n_clusters=3):
    """Build a minimal valid graph_context payload."""
    papers = [
        {"id": f"p{i}", "title": f"Paper {i}", "cluster_id": i % n_clusters, "year": 2020}
        for i in range(n_papers)
    ]
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


# ==================== /api/academic-report tests ====================

@pytest.mark.asyncio
async def test_academic_report_success(test_client):
    """
    POST /api/academic-report with valid graph_context returns 200
    with all expected response fields.
    """
    payload = {"graph_context": _make_graph_context(n_papers=50, n_clusters=3)}

    mock_computer = MagicMock()
    mock_computer.compute_all.return_value = _MOCK_METRICS

    with (
        patch("routers.academic_report.NetworkMetricsComputer", return_value=mock_computer),
        patch("routers.academic_report.generate_academic_report", return_value=_MOCK_REPORT),
    ):
        response = await test_client.post("/api/academic-report", json=payload)

    assert response.status_code == 200, response.text
    data = response.json()

    expected_fields = {
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
    for field in expected_fields:
        assert field in data, f"Missing field in response: {field}"

    assert isinstance(data["methods_section"], str)
    assert isinstance(data["tables"], dict)
    assert isinstance(data["figure_captions"], dict)
    assert isinstance(data["warnings"], list)


@pytest.mark.asyncio
async def test_academic_report_insufficient_papers(test_client):
    """
    POST /api/academic-report with < 10 papers returns feasibility = "insufficient".
    """
    ctx = _make_graph_context(n_papers=5, n_clusters=1)
    payload = {"graph_context": ctx}

    insufficient_report = dict(_MOCK_REPORT)
    insufficient_report["feasibility"] = "insufficient"
    insufficient_report["warnings"] = ["Academic Report requires at least 10 papers and 2 communities."]

    mock_computer = MagicMock()
    mock_computer.compute_all.return_value = _MOCK_METRICS

    with (
        patch("routers.academic_report.NetworkMetricsComputer", return_value=mock_computer),
        patch("routers.academic_report.generate_academic_report", return_value=insufficient_report),
    ):
        response = await test_client.post("/api/academic-report", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["feasibility"] == "insufficient"
    assert len(data["warnings"]) > 0


@pytest.mark.asyncio
async def test_academic_report_empty_context(test_client):
    """
    POST /api/academic-report with empty papers list returns 400.
    """
    payload = {
        "graph_context": {
            "papers": [],
            "clusters": [],
            "edges": [],
            "total_papers": 0,
        }
    }

    response = await test_client.post("/api/academic-report", json=payload)

    assert response.status_code == 400
    assert "papers" in response.json()["detail"].lower()


# ==================== /api/network-overview tests ====================

@pytest.mark.asyncio
async def test_network_overview_success(test_client):
    """
    POST /api/network-overview returns 200 with 5 expected fields.
    """
    payload = {"graph_context": _make_graph_context(n_papers=50, n_clusters=3)}

    mock_computer = MagicMock()
    mock_computer.compute_network_overview.return_value = _MOCK_OVERVIEW

    with patch("routers.academic_report.NetworkMetricsComputer", return_value=mock_computer):
        response = await test_client.post("/api/network-overview", json=payload)

    assert response.status_code == 200, response.text
    data = response.json()

    expected_fields = {"node_count", "edge_count", "density", "cluster_count", "modularity"}
    for field in expected_fields:
        assert field in data, f"Missing field in network-overview response: {field}"

    assert data["node_count"] == 50
    assert data["edge_count"] == 210
    assert data["cluster_count"] == 3
    assert isinstance(data["density"], float)
    assert isinstance(data["modularity"], float)


@pytest.mark.asyncio
async def test_network_overview_empty(test_client):
    """
    POST /api/network-overview with empty papers returns 400.
    """
    payload = {
        "graph_context": {
            "papers": [],
            "clusters": [],
            "edges": [],
        }
    }

    response = await test_client.post("/api/network-overview", json=payload)

    assert response.status_code == 400
    assert "papers" in response.json()["detail"].lower()
