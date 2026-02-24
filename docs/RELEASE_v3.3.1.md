# ScholarGraph3D v3.3.1 — Release Notes

**Release Date:** 2026-02-24
**Type:** UX Quality Release (Gap Report Explainability + Quality)

---

## Overview

v3.3.1 fixes 5 root problems in the v3.3.0 Gap Report that made it technically functional but unusable for researchers: silent LLM failure, academically inverted semantic scoring, no explainability, template research questions, and a static text wall UI.

---

## Highlights

### Semantic Score Inversion → Relatedness
The v3.3.0 formula `1 - cosine_similarity` penalized the most actionable gaps (thematically related but disconnected clusters). Now renamed to **relatedness** where `relatedness_score = cosine_similarity` — high similarity means the gap is more worth bridging.

### Evidence Detail for Explainability
Each gap now includes `evidence_detail` with raw numbers: actual vs possible edges, centroid similarity, year span, cross-citation counts (A→B and B→A), methodology/background ratios. Frontend uses these for score bar tooltips.

### Grounded Research Questions
Template Mad Libs ("How might methods from {A} be applied to {B}?") replaced with data-driven questions referencing:
- Top paper TLDRs and citation counts
- Bridge paper cluster similarities
- Temporal overlap/divergence
- Intent distribution ratios
- Directional citation asymmetry

Each question includes `justification` and `methodology_hint` grounded in actual evidence.

### Interactive Report UI
- **Collapsible sections** with AnimatePresence animations
- **Score tooltips** explaining what each percentage means on hover
- **Copy-to-clipboard** button per section header
- **LLM fallback banner** when narrative generation fails
- **Resizable left panel** (250–600px drag handle, persisted to localStorage)

### CORS Error Fix
Global exception handler ensures CORS headers are present even on 500/503 errors, preventing browsers from misreporting server errors as CORS failures.

---

## All Changes

### Backend

| Change | File | Description |
|--------|------|-------------|
| Global exception handler | `main.py` | CORS headers on all error responses + CORS config startup logging |
| Semantic → Relatedness | `gap_detector.py` | `relatedness_score = cosine_similarity` (inverted from v3.3.0) |
| Weight rebalance | `gap_detector.py` | structural 0.35, relatedness 0.25, temporal 0.15, intent 0.15, directional 0.10 |
| Evidence detail | `gap_detector.py` | `evidence_detail` dict with 9 raw metrics per gap |
| Bridge paper sims | `gap_detector.py` | `sim_to_cluster_a`, `sim_to_cluster_b` per bridge paper |
| Directional refactor | `gap_detector.py` | Returns `(score, a_to_b, b_to_a)` tuple |
| Grounded RQ generator | `gap_detector.py` | `_generate_grounded_questions()` replacing template heuristics |
| LLM empty dict fix | `gap_report_service.py` | Explicit `{}` detection + typed exception handling |
| `llm_status` field | `gap_report_service.py` | `"success"` or `"failed"` in report response |
| Dict+str RQ support | `gap_report_service.py` | Fallback handles both grounded dict and legacy string formats |
| Relatedness label | `gap_report_service.py` | `_interpret_scores` uses "Relatedness" with updated description |
| SeedGapInfo extension | `seed_explore.py` | `evidence_detail`, `List[Any]` research_questions |
| Response tracking | `gap_report.py` | `llm_status` in `GapReportResponse` |

### Frontend

| Change | File | Description |
|--------|------|-------------|
| Type updates | `types/index.ts` | `EvidenceDetail` interface, `relatedness`, `llm_status`, bridge sim fields, union RQ type |
| GapReportView rewrite | `GapReportView.tsx` | Collapsible sections, score tooltips, copy buttons, LLM warning |
| SEM → REL label | `GapSpotterPanel.tsx` | Score breakdown label change + union RQ rendering |
| Resizable panel | `page.tsx` | Drag handle 250–600px + localStorage persistence |
| Export update | `export.ts` | `Semantic` → `Relatedness` in Markdown |

---

## Gap Score Weights (v3.3.1)

| Dimension | Weight | Direction | Description |
|-----------|--------|-----------|-------------|
| Structural | 0.35 | High = gap | % of possible inter-cluster edges missing |
| Relatedness | 0.25 | High = actionable | Centroid cosine similarity (similar topics = worth bridging) |
| Temporal | 0.15 | High = gap | Year distribution non-overlap |
| Intent | 0.15 | High = gap | Background-heavy cross-citations (shallow engagement) |
| Directional | 0.10 | High = gap | Citation flow asymmetry (A→B vs B→A) |

**Interpretation:** High structural (94%) + High relatedness (88%) = very actionable gap — clusters are related but disconnected.

---

## Breaking Changes

| Change | Impact | Migration |
|--------|--------|-----------|
| `semantic` → `relatedness` | `GapScoreBreakdown.semantic` renamed | Update any code reading `gap_score_breakdown.semantic` to `.relatedness` |
| `research_questions` type | `string[]` → `(string \| Dict)[]` | Check for `isinstance(q, dict)` before accessing `.question` |
| Score interpretation | Higher relatedness = better gap | Previously high semantic meant dissimilar (less useful) |

---

## Verification Checklist

| # | Item | How to Verify |
|---|------|---------------|
| 1 | CORS on errors | `curl -X OPTIONS -H "Origin: https://scholar-graph3d.vercel.app" https://scholargraph3d.onrender.com/api/graphs` → CORS headers present |
| 2 | Semantic inversion | seed-explore → `gap_score_breakdown.relatedness` > 0.5 for similar clusters |
| 3 | Evidence detail | gap response → `evidence_detail.actual_edges`, `max_possible_edges` present |
| 4 | LLM status | gap report → `llm_status: "success"` or `"failed"` |
| 5 | Grounded RQ | `research_questions[].justification` references paper titles/citation counts |
| 6 | Score tooltips | Hover score bar → evidence popover appears |
| 7 | Resizable panel | Drag left panel edge → 250–600px resize → persists on reload |
| 8 | Copy button | Hover section header → Copy icon → clipboard |
| 9 | Collapsible | Click section header → collapse/expand animation |
| 10 | TypeScript | `cd frontend && npx tsc --noEmit` — zero errors |
| 11 | Python | `ast.parse()` all 5 backend files — zero errors |

---

## Stats

- **11 files changed**, 511 insertions, 96 deletions
- **1 new file** (discussion doc)
- **0 new API endpoints** (existing endpoint enhanced)
- **1 new TypeScript interface** (EvidenceDetail)
- **5 renamed fields** (semantic → relatedness across stack)
