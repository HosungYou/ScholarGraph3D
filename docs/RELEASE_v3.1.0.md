# ScholarGraph3D v3.1.0 — Release Notes

**Release Date:** 2026-02-23
**Type:** Feature Release (UX Overhaul)

---

## Overview

v3.1.0 is a comprehensive UX overhaul driven by a researcher-workflow review session. It addresses 11 improvement items across backend stabilization, layout, panel interactions, edge visualization, and paper detail navigation. The core goal: every visible element in the Explore page should be interactive and informative.

---

## Highlights

### Push Layout (P2)
The right-side paper detail panel no longer overlays the 3D graph. It now sits as a flex sibling that animates its width from 0→480px, pushing the center 3D view smoothly to the left. No backdrop — the graph remains fully visible and interactable alongside the detail panel.

### Edge Visualization Modes (P5/P12)
Three switchable edge coloring modes, accessible via radio buttons in the Star Chart legend:

| Mode | Description |
|------|-------------|
| **Similarity** (default) | Original intent-based colors (methodology, supports, contradicts, etc.) |
| **Temporal** | Gold→gray gradient based on publication year distance (0→10+ years) |
| **Cross-Cluster** | Inter-cluster edges highlighted in gold, intra-cluster dimmed |

Plus two always-on indicators for rare, high-signal relationships:
- **Bidirectional citations** → gold (#FFD700)
- **Shared authors** → green (#2ECC71)

### Interactive Gap Spotter (P4/P6)
Bridge papers and frontier papers are now clickable buttons that select the paper in the graph (opening OBJECT SCAN). Frontier papers show year, citation count, and frontier score on hover. Research questions are generated heuristically from cluster labels and displayed in a collapsible accordion.

### Enhanced Cluster Statistics (P7)
Cluster panel now computes and displays:
- **H-index** — largest h where h papers have ≥ h citations
- **Recency** — percentage of papers from the last 3 years
- **Top Authors** — most frequent 3 authors across cluster papers

---

## All Changes

### Backend

| Change | File | Description |
|--------|------|-------------|
| CORS Fix | `main.py:108` | Regex now matches both `.vercel.app` and `.onrender.com` |
| Error Differentiation | `seed_chat.py:192` | Auth errors return HTTP 500 with "Check GROQ_API_KEY" message; general failures remain 502 |
| Heuristic Questions | `gap_detector.py` | New `_generate_heuristic_questions()` method generates 2-3 research questions from cluster labels and bridge paper titles without LLM |
| is_influential Edge | `seed_explore.py:63` | `SeedGraphEdge` now includes `is_influential: bool` propagated from S2 citation data |

### Frontend — Layout

| Change | File | Description |
|--------|------|-------------|
| Push Layout | `page.tsx:563-596` | Right drawer moved from absolute overlay to flex sibling with animated width |
| No Backdrop | `page.tsx` | Backdrop div removed; close handled by PaperDetailPanel's X button |

### Frontend — Panels

| Change | File | Description |
|--------|------|-------------|
| Paper Selection Feedback | `ClusterPanel.tsx:301` | Selected paper gets gold left-border, gold bg tint, font-semibold; title shows 2 lines (`line-clamp-2`) |
| H-index + Recency + Authors | `ClusterPanel.tsx:52` | Extended `clusterStats` useMemo with 3 new computed metrics |
| Bridge Paper Click | `GapSpotterPanel.tsx:180` | `<div>` → `<button onClick={selectPaper}>` with full Paper lookup |
| Frontier Paper Click | `GapSpotterPanel.tsx:91` | Clickable with hover highlight, shows year/citations/frontier_score |
| Research Questions | `GapSpotterPanel.tsx` | Collapsible accordion component, collapsed by default |
| Author S2 Links | `PaperDetailPanel.tsx:138` | Author names link to `semanticscholar.org/author/{id}` when `author.id` available |

### Frontend — Edge System

| Change | File | Description |
|--------|------|-------------|
| edgeVisMode State | `useGraphStore.ts` | New `edgeVisMode: 'similarity' | 'temporal' | 'crossCluster'` state + setter |
| Edge Metadata | `ScholarGraph3D.tsx` | `ForceGraphLink` extended with `isInfluential`, `isBidirectional`, `hasSharedAuthors`, `yearGap`, `isCrossCluster` |
| linkColor 3 Modes | `ScholarGraph3D.tsx` | Reworked callback: similarity (intent colors), temporal (year-gap lerp), crossCluster (gold/dim) |
| Mode Selector UI | `GraphLegend.tsx` | Radio buttons for 3 modes + always-on legend entries |

### Frontend — Paper Detail

| Change | File | Description |
|--------|------|-------------|
| Path Description | `PaperDetailPanel.tsx:338` | "Trace the intellectual lineage between two papers" subtitle |
| Path Visualization | `PaperDetailPanel.tsx:395` | Paper chain with clickable nodes, year gaps, colored start/end dots |
| In-Graph Connections | `PaperDetailPanel.tsx` | New `InGraphConnections` component: collapsible References / Cited-by lists with drill-down |

### Types

| Change | File | Description |
|--------|------|-------------|
| Author.id | `types/index.ts:3` | `id?: string` for S2 author profile links |
| GraphEdge.is_influential | `types/index.ts:42` | `is_influential?: boolean` from S2 citation data |

### Documentation

| Change | File |
|--------|------|
| UX Review Session | `docs/discussion/2026-02-23_ux-review-discussion.md` |

---

## Deferred (Phase 4)

| Item | Reason |
|------|--------|
| P10: Bookmark/Tag/Memo | Requires new DB table (`paper_bookmarks`) + migration |
| P13: Chat Graph Integration | Requires backend response restructuring (`actions` array) |

---

## Verification Checklist

| Item | How to Verify |
|------|---------------|
| CORS | `curl -I -X OPTIONS` from .onrender.com origin |
| Push Layout | Click paper → 3D view shrinks left, no overlay |
| Selection | Click paper in cluster list → gold border, 2-line title |
| Bridge Click | Gap Spotter → click bridge paper → OBJECT SCAN opens |
| Frontier Click | Frontier section → click paper → OBJECT SCAN opens |
| Research Questions | Gap card → expand accordion → see 2-3 questions |
| H-index | Select cluster → Statistics shows H-Index value |
| Author Links | OBJECT SCAN → click author name → S2 profile opens |
| Edge Modes | Star Chart → Edge Mode radio → colors change |
| Path Chain | Set start/end → Find Path → see chain with year gaps |
| Drill-down | OBJECT SCAN → expand References/Cited-by → click navigates |

---

## Stats

- **13 files changed**, 585 insertions, 106 deletions
- **0 new API endpoints** — all changes use existing data
- **0 additional API calls** — edge metadata computed client-side from existing graph data
- **~1ms** edge computation overhead (nodeMap + set operations)
