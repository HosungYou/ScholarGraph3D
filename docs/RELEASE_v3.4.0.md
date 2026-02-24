# ScholarGraph3D v3.4.0 — Release Notes

**Release Date:** 2026-02-24
**Type:** Major Feature Release (Academic Analysis + SNA Metrics)

---

## Overview

v3.4.0 adds a complete Academic Analysis feature that transforms ScholarGraph3D's existing graph exploration into publication-ready SNA (Social Network Analysis) output. Researchers can now generate APA 7th-formatted Methods sections, results tables, figure captions, and reference lists directly from their citation network — making the tool's output immediately usable as evidence in dissertations, grant proposals, and systematic reviews.

---

## Highlights

### Network Metrics Module
A new `NetworkMetricsComputer` class (powered by networkx) computes three tiers of SNA metrics on demand:

- **Network-level:** density, diameter, average path length, reciprocity, transitivity, component count, average degree
- **Node-level:** degree in/out (Freeman 1978), betweenness centrality (Freeman 1977), closeness centrality (Freeman 1978), PageRank (Brin & Page 1998), eigenvector centrality (Bonacich 1987)
- **Community-level:** intra-cluster density, average year, year range, h-index, modularity Q (Newman & Girvan 2004), silhouette score (Rousseeuw 1987)
- **Structural holes:** constraint, effective_size, efficiency (Burt 1992)

Computation is lazy — metrics are only calculated when a report is requested, keeping graph exploration fast. Performance target: <1 second for graphs of 50–200 nodes.

### Academic Report Service
A template-based APA 7th report generator with zero LLM calls. Every section is deterministically assembled from live graph metrics, making output fully reproducible and audit-safe for academic submission:

- **Methods section** with 5 subsections: Data Collection, Embedding, Community Detection, Network Analysis, Gap Detection
- **Table 1:** Network Statistics Summary (11 metrics)
- **Table 2:** Community Characteristics — label, N, cohesion, H-index, year range
- **Table 3:** Top 10 Nodes by Centrality — 5 centrality metrics, sorted by betweenness
- **Table 4:** Structural Gap Analysis — 5-dimensional scores per gap pair
- **Table 5:** Bridge Papers & Structural Holes — constraint, effective_size per bridge paper
- **3 Figure captions** with auto-substituted parameters (N, year range, cluster count)
- **13 hardcoded methodology references** + dynamic analysis references derived from graph content

Feasibility gating prevents misleading output: graphs with fewer than 10 papers or fewer than 2 clusters return an `insufficient` status with an explanatory message; 10–30 papers return `partial`; 30+ papers with 3+ clusters return `full`.

### ACADEMIC ANALYSIS Tab
A new 4th tab in the left panel provides a dedicated interface for academic output:

- **Network Overview card** (always visible, auto-fetched on tab entry) — density, node count, edge count, cluster count, modularity Q
- **Gold "Generate Academic Report" button** with spinner loading state
- **4 sub-tabs:** Methods / Tables / Figures / References
- **APATable component** — thick top/bottom rules, no vertical lines, tab-separated copy for direct paste into Word or Google Docs
- **CentralityBarChart** — CSS-only horizontal bars, cluster-colored, showing top 15 nodes
- **Canvas capture** for Figure 1 (3D network layout) and Figure 2 (cluster detail) via 3D viewport snapshot
- **Export options:** Full Report (copy to clipboard), Methods only (copy), Tables only (copy), `.md` download, `.bib` download

### API Endpoints
Two new endpoints expose academic computation without touching existing graph routes:

- `POST /api/academic-report` — Triggers full report generation (60 s timeout, 24 h Redis cache keyed on graph + params)
- `POST /api/network-overview` — Lightweight stats for the Network Overview card (density, nodes, edges, clusters, modularity); fast enough to call on tab entry

---

## All Changes

### Backend

| Change | File | Description |
|--------|------|-------------|
| New file | `docs/discussion/2026-02-24_sna-academic-output-discussion.md` | Design discussion for SNA academic output feature |
| New file | `backend/graph/network_metrics.py` | `NetworkMetricsComputer` class — network, node, community, and structural-hole metrics via networkx |
| New file | `backend/services/academic_report_service.py` | APA 7th template-based report generator — Methods, 5 tables, figure captions, reference list |
| New file | `backend/routers/academic_report.py` | `/api/academic-report` and `/api/network-overview` endpoints |
| New file | `backend/tests/test_graph/test_network_metrics.py` | 14 unit tests for `NetworkMetricsComputer` |
| New file | `backend/tests/test_services/__init__.py` | Test package init for services test directory |
| New file | `backend/tests/test_services/test_academic_report.py` | 17 unit tests for `academic_report_service` |
| Router registration | `backend/main.py` | Include `academic_report` router |
| Dependency | `backend/requirements.txt` | Add `networkx>=3.2.0` |
| Cache config | `backend/cache.py` | Academic report cache key + 24 h TTL |

### Frontend

| Change | File | Description |
|--------|------|-------------|
| New file | `frontend/components/graph/AcademicAnalysisPanel.tsx` | ~520-line panel — Network Overview, report button, Methods/Tables/Figures/References sub-tabs, APATable, CentralityBarChart, canvas capture, export actions |
| Type additions | `frontend/types/index.ts` | 10 new interfaces: `NetworkOverview`, `AcademicReport`, `ReportFeasibility`, `APATable`, `APARow`, `CentralityEntry`, `CommunityRow`, `GapRow`, `BridgePaperRow`, `FigureCaption` |
| API methods | `frontend/lib/api.ts` | `fetchNetworkOverview()` and `fetchAcademicReport()` |
| Export functions | `frontend/lib/export.ts` | `exportMarkdown()`, `exportBib()`, `copyReport()`, `copySection()` |
| State + tab | `frontend/hooks/useGraphStore.ts` | Academic report state slice + `'academic'` tab variant |
| Tab integration | `frontend/app/explore/seed/page.tsx` | ACADEMIC tab wired to `AcademicAnalysisPanel` in left panel |

---

## Feasibility Gating

| Status | Condition | Behavior |
|--------|-----------|----------|
| `insufficient` | <10 papers OR <2 clusters | Error message returned; no tables generated |
| `partial` | 10–30 papers | Methods + Tables 1–2 only; warning banner in UI |
| `full` | 30+ papers AND 3+ clusters | All 5 tables, figure captions, full reference list |

---

## APA 7th References (Hardcoded Methodology)

| Citation | Method |
|----------|--------|
| Freeman (1977) | Betweenness centrality |
| Freeman (1978) | Degree and closeness centrality |
| Brin & Page (1998) | PageRank |
| Bonacich (1987) | Eigenvector centrality |
| Newman & Girvan (2004) | Modularity Q |
| Rousseeuw (1987) | Silhouette score |
| Burt (1992) | Structural holes (constraint, effective_size, efficiency) |

---

## Breaking Changes

None. v3.4.0 is additive only — all existing graph exploration, gap detection, and report functionality is unchanged.

---

## Verification Checklist

| # | Item | How to Verify |
|---|------|---------------|
| 1 | networkx import | `python -c "from graph.network_metrics import NetworkMetricsComputer; print('OK')"` — prints `OK` |
| 2 | Network metrics tests | `python -m pytest tests/test_graph/test_network_metrics.py -v` — 14 passed |
| 3 | Academic report tests | `python -m pytest tests/test_services/test_academic_report.py -v` — 17 passed |
| 4 | TypeScript | `cd frontend && npx tsc --noEmit` — zero errors |
| 5 | Network Overview | Seed explore → ACADEMIC tab → Network Overview card populates automatically |
| 6 | Report generation | Click "Generate Academic Report" → Methods section displays actual graph parameters |
| 7 | Centrality table | Table 3 → 10 rows sorted by betweenness descending |
| 8 | Figure captions | Figure captions contain substituted N, year range, and cluster count values |
| 9 | Markdown export | Click `.md` download → file contains valid markdown with pipe-delimited tables |
| 10 | Feasibility gating | 5-paper graph → `insufficient` error message displayed; 50-paper graph → full report |

---

## Stats

- **16 files changed** (8 new, 8 modified)
- **~2,500+ insertions**
- **2 new API endpoints** (`/api/academic-report`, `/api/network-overview`)
- **10 new TypeScript interfaces**
- **31 backend tests** (14 network metrics + 17 academic report)
- **0 LLM calls** in report generation (template-based)
- **1 new dependency** (`networkx>=3.2.0`)
