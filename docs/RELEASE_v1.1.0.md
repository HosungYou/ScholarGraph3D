# ScholarGraph3D v1.1.0 — Legend · Expand · Error Resilience

> Released: 2026-02-22

## Overview

v1.1.0 adds a Visual Guide legend for researchers to understand star visual features, robust error handling for paper expansion, expansion visual effects, and diagnostic logging.

## New Features

### Part A: Enhanced Legend ("Star Chart Guide")
- **Visual Guide section** in GraphLegend: collapsible guide explaining 8 visual features
  - Size = citation count, bright glow = highly cited, pulsing ring = top 10%, bridge dots, OA green ring, flowing particles = citation, twinkle = recency, Z-axis = year
  - Mini CSS visual examples for each feature
  - Default collapsed with hint text
- **Paper badges** in PaperDetailPanel: Top 10% Cited, Bridge Node, Open Access
- **"Expanded From" display** in PaperDetailPanel: clickable parent paper link with author/year

### Part B: Expand Design ("Stellar Expansion")
- **Expansion pulse**: cyan pulsing ring on parent node during expand (3s duration)
- **New node glow**: cyan sphere glow on newly expanded nodes (3s duration)
- **Edge highlight**: expanded edges bright cyan (#00E5FF) with 3.0 width (3s)
- **Explore mode animation**: `animateExpandNodes()` now called in both seed and explore modes
- **Expansion origin tracking**: `expandedFromMap` in Zustand store tracks child → parent relationships

### Part C: Expand Error Resilience
- **API timeout**: 20-second `AbortController` timeout on all fetch requests
- **429 auto-retry**: reads `retry-after` header, waits up to 10s, retries once
- **Network error retry**: 2-second delay, retries once on `TypeError`
- **Status-specific messages**: 429 (rate limited), 404 (paper not found), 500 (server error), timeout, network error
- **DOI fallback**: if S2 paper ID expansion fails, automatically retries with `DOI:` prefix
- **Partial success meta**: backend returns `ExpandMeta` with `references_ok`, `citations_ok`, `refs_count`, `cites_count`, `error_detail`
- **Partial success UI**: shows "12 papers added (partial — Citations fetch timed out)"
- **Clear no-identifier message**: "This paper cannot be expanded (no identifier available)"

### Part D: Diagnostic Logging
- **Render stats**: development-mode `console.log` with node/link counts, theme state, year range, expanded node count
- **API timing**: development-mode `console.debug` with request method, URL, elapsed time
- **API retry logging**: logs rate limit retries and network error retries

## Modified Files

### Frontend (7 files)
| File | Changes |
|------|---------|
| `lib/api.ts` | AbortController timeout, 429 retry, network retry, error classification, dev logging |
| `app/explore/page.tsx` | DOI fallback, expandedFromMap tracking, expand animation, meta-aware messages |
| `app/explore/seed/page.tsx` | DOI fallback, expandedFromMap tracking, meta-aware messages |
| `components/graph/ScholarGraph3D.tsx` | Expansion pulse/glow/edge highlight, expandedFromRef sync, diagnostic logging |
| `components/graph/GraphLegend.tsx` | Collapsible Visual Guide section with 8 entries |
| `components/graph/PaperDetailPanel.tsx` | Top 10%/Bridge/OA badges, "Expanded From" section |
| `hooks/useGraphStore.ts` | `expandedFromMap` state + `setExpandedFromMap` action |

### Backend (1 file)
| File | Changes |
|------|---------|
| `routers/papers.py` | `ExpandMeta` model, meta field in StableExpandResponse, timeout error classification |

## Testing
- `npm run build` — 0 TypeScript errors, all pages generated
- `pytest -v` — 80+ tests passing (including 13 new expand-stable tests)
- Manual: expand pulse + glow + edge highlight visible for 3 seconds
- Manual: DOI fallback working, specific error messages displayed

## Upgrade Notes
- No breaking changes — `meta` field is optional in StableExpandResponse
- Frontend gracefully handles missing `meta` field (backwards compatible with older backend)
- New `expandedFromMap` in Zustand store initialized empty
