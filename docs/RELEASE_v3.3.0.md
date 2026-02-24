# ScholarGraph3D v3.3.0 — Release Notes

**Release Date:** 2026-02-24
**Type:** Feature Release (Gap-to-Proposal Pipeline)

---

## Overview

v3.3.0 transforms the gap detection system from simple edge-density detection into a multi-dimensional academic gap analysis pipeline with exportable research reports. Zero additional S2 API calls; single on-demand Groq LLM call for narrative synthesis with graceful degradation.

---

## Highlights

### Enhanced Gap Score (5 Dimensions)
Gap scoring now uses 5 weighted dimensions computed from already-fetched data:
- **Structural** (30%): Inter-cluster edge density (unchanged formula)
- **Semantic** (25%): 1 - cosine_sim(centroid_a, centroid_b)
- **Temporal** (15%): Year distribution non-overlap ratio
- **Intent** (15%): Cross-citation intent distribution (methodology ratio)
- **Directional** (15%): A→B vs B→A citation asymmetry

The composite score replaces `gap_strength` for backward compatibility. Each gap now includes `gap_score_breakdown` with all 5 dimension scores.

### Gap Report Generation
New `POST /api/gaps/report` endpoint generates structured research reports:
1. Evidence assembly (always succeeds, no LLM)
2. Narrative synthesis via Groq LLM (1 call, graceful degradation)
3. BibTeX generation from cited papers
4. 24h Redis cache

Report includes: executive summary, gap score analysis, cluster profiles with key papers, bridge paper analysis, temporal context, citation intent distribution, LLM-synthesized narrative, research questions with justification and methodology hints, significance statement, limitations.

### GapReportView Component
New full-width panel replaces GapSpotterPanel when a report is generated:
- 3D graph snapshot captured at generation time
- Interactive score breakdown bars (cosmic HUD theme)
- Clickable paper references → camera focus
- Research questions with justification + methodology hints
- Download Markdown / Download BibTeX buttons
- "← Back to Gaps" navigation

### GapSpotterPanel Enhancements
- Mini score breakdown bars per gap card (STR/SEM/TMP/INT/DIR)
- Key papers preview (top paper from each cluster)
- "GENERATE REPORT" button with loading spinner
- 3D canvas snapshot capture on report generation

---

## All Changes

### Backend

| Change | File | Description |
|--------|------|-------------|
| 5-dim gap scoring | `gap_detector.py` | structural/semantic/temporal/intent/directional composite score |
| Key papers extraction | `gap_detector.py` | Top 3 papers per cluster by citation count |
| Temporal scoring | `gap_detector.py` | Year distribution non-overlap ratio |
| Intent scoring | `gap_detector.py` | Cross-citation intent distribution analysis |
| Directional scoring | `gap_detector.py` | A→B vs B→A citation asymmetry |
| Sequential intents→gaps | `seed_explore.py` | Intents fetched before gap detection (was parallel) |
| Enriched gap papers | `seed_explore.py` | year, tldr, citation_count passed to gap detector |
| SeedGapInfo extended | `seed_explore.py` | +5 optional fields: breakdown, key_papers, temporal, intent |
| Gap report service | `gap_report_service.py` | Evidence assembly + LLM narrative + report assembly |
| Gap report router | `gap_report.py` | `POST /api/gaps/report` with cache |
| Router registration | `main.py` | gap_report_router registered |
| Gap report cache | `cache.py` | `_TTL_GAP_REPORT = 86400`, get/set helpers |

### Frontend — Store

| Change | File | Description |
|--------|------|-------------|
| `activeGapReport` | `useGraphStore.ts` | Current gap report or null |
| `gapReportLoading` | `useGraphStore.ts` | Loading state for report generation |

### Frontend — Components

| Change | File | Description |
|--------|------|-------------|
| Score breakdown mini bars | `GapSpotterPanel.tsx` | 5-dimension bars per gap card |
| Key papers preview | `GapSpotterPanel.tsx` | Top paper from each cluster |
| Generate Report button | `GapSpotterPanel.tsx` | Triggers API call + canvas snapshot |
| GapReportView | `GapReportView.tsx` | Full report rendering with score bars, papers, questions |
| Conditional rendering | `page.tsx` | GapReportView replaces GapSpotterPanel when report active |

### Frontend — Types & API

| Change | File | Description |
|--------|------|-------------|
| `GapScoreBreakdown` | `types/index.ts` | 6-field score interface |
| `GapKeyPaper` | `types/index.ts` | Paper with tldr and citation_count |
| `GapReport` | `types/index.ts` | Full report interface |
| `GapReportSection` | `types/index.ts` | Report section interface |
| `GapReportQuestion` | `types/index.ts` | Question with justification + methodology |
| `StructuralGap` extended | `types/index.ts` | +5 optional fields for enhanced gap data |
| `generateGapReport()` | `api.ts` | POST /api/gaps/report with 30s timeout |
| `toGapReportMarkdown()` | `export.ts` | Full report → Markdown document |
| `toGapReportBibtex()` | `export.ts` | Cited papers → BibTeX batch |

---

## API Changes

### New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/gaps/report` | None | Generate gap analysis report |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/seed-explore` | Response gaps now include `gap_score_breakdown`, `key_papers_a/b`, `temporal_context`, `intent_summary` |

---

## Verification Checklist

| Item | How to Verify |
|------|---------------|
| Enhanced Gap Score | seed_explore response → gap has `gap_score_breakdown` with 5 dimensions [0,1] |
| Composite = gap_strength | `gap_strength` equals `gap_score_breakdown.composite` |
| Key papers | Each gap has `key_papers_a` and `key_papers_b` (up to 3 each) |
| Temporal context | Each gap has `temporal_context` with year ranges |
| Score breakdown bars | Gaps tab → gap card shows 5 mini bars (STR/SEM/TMP/INT/DIR) |
| Generate Report | Click "GENERATE REPORT" → loading spinner → report view |
| Report content | Executive summary, score bars, key papers, narrative, questions |
| Download Markdown | Click "Download Markdown" → .md file with full report |
| Download BibTeX | Click "Download BibTeX" → .bib file with cited papers |
| Back to Gaps | Click "← Back to Gaps" → returns to gap list |
| LLM failure graceful | If Groq unavailable, report shows evidence-only (no narrative) |
| 25s pipeline | seed_explore completes within timeout (intents now sequential) |

---

## Stats

- **14 files changed**, 1518 insertions, 93 deletions
- **1 new API endpoint** (gap report)
- **2 new backend files** (gap_report_service.py, gap_report.py)
- **1 new frontend component** (GapReportView.tsx)
- **5 new TypeScript interfaces**
- **2 new store fields** (activeGapReport, gapReportLoading)
- **0 additional S2 API calls** in explore pipeline
- **1 on-demand Groq call** per report generation
