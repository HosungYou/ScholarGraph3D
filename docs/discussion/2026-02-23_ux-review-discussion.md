# UX Review Discussion — 2026-02-23

## Session Overview

Comprehensive UX review of ScholarGraph3D Explore page, analyzing the researcher workflow experience across all interactive panels and visualization features.

## Key Issues Identified

### Critical
1. **Chat CORS/502 Error**: Backend CORS regex only matched `.vercel.app`, missing `.onrender.com`. Also, `GROQ_API_KEY` authentication errors returned generic 502 instead of actionable message.
2. **Right Panel Overlay**: Paper detail drawer used absolute positioning with backdrop, obscuring the 3D visualization. Changed to push layout (flex sibling).

### High Priority
3. **Gap Spotter Non-Interactive**: Bridge papers and frontier papers were display-only `<div>` elements with no click handlers. Researchers couldn't navigate to papers shown in gap analysis.
4. **Paper Selection Feedback**: Clicking a paper in the cluster list opened the detail panel but provided no visual indication in the list of which paper was selected.
5. **Edge Visual Modes**: All edges looked the same regardless of relationship type. No way to switch between similarity-strength, temporal-flow, or cross-cluster views.

### Medium Priority
6. **Research Questions Empty**: Gap detector returned `research_questions=[]` with no heuristic fallback when LLM was unavailable.
7. **Cluster Statistics Limited**: Only showed avg citations, year range, field, and edge ratio. Missing H-index, recency %, and top authors.
8. **Author Links Missing**: Author names in OBJECT SCAN were plain text, not linked to Semantic Scholar profiles despite backend providing `author_id`.
9. **Citation Path Bare**: Path finder showed only "Path: N nodes" with no visual chain, no year gaps, no clickable nodes.
10. **No Drill-down**: OBJECT SCAN showed citation counts but no way to click through to specific references or citers in the graph.

### Lower Priority (Phase 4)
11. **Bookmark/Tag/Memo**: No way to save interesting papers with notes (requires new DB table).
12. **Chat Graph Integration**: Chat responses don't trigger graph actions (highlight, filter).
13. **is_influential Edge Data**: S2's `isInfluential` flag not propagated to frontend edge rendering.

## Decisions Made

- Push layout chosen over resizable split to keep implementation simple
- Edge modes use radio buttons (not toggle matrix) for clarity
- Heuristic questions generated from cluster labels (no LLM dependency)
- H-index computed client-side from in-graph papers (not global S2 data)
- Bidirectional citation and shared-author edges always visible regardless of mode

## Implementation Plan

See `/docs/discussion/` parent directory and the plan file for full execution details.
Phases 1-3 implemented in this session. Phase 4 (P10, P13) deferred.
