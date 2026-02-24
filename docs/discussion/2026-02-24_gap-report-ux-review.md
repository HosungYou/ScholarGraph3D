# Gap Report UX Review — 2026-02-24

## Session Context

v3.3.0 Gap Report review session identifying fundamental UX and quality issues.

## Initial Impressions

The Gap Report feature is technically functional — the pipeline (evidence assembly → LLM narrative → report rendering) works end-to-end. However, the output is not useful for researchers in its current form. The numbers are present but unexplained, the research questions are generic templates, and the overall experience is a static wall of text.

## 5 Root Problems Identified

### 1. LLM Narrative Silent Failure

**Problem**: `generate_json()` returns `{}` on failure, which is truthy but empty. The code checks `if result and result.get("executive_summary")` but the root cause — that `{}` passes the first condition — means the failure mode is ambiguous. In production with Groq rate limits, this fails silently and the user never knows.

**Impact**: Users always get heuristic-only reports without realizing the LLM narrative was supposed to provide richer analysis.

### 2. Semantic Score Inverted

**Problem**: `semantic_score = 1.0 - cosine_similarity(centroid_a, centroid_b)`. This means clusters that are thematically SIMILAR (high cosine sim) get LOWER semantic scores. But for research gaps, high similarity between clusters actually makes the gap MORE actionable — you're more likely to find useful cross-pollination between related fields.

**Impact**: The most actionable gaps (related but disconnected clusters) are penalized in the composite score, pushing them down the ranking.

### 3. No Explainability

**Problem**: The score bars show percentages (e.g., "Structural 94%") but never explain what that means. 94% structural = 24 of 403 possible edges exist? Or 94% are missing? The user has no way to interpret these numbers.

**Impact**: Researchers cannot trust or act on scores they don't understand.

### 4. Template Research Questions

**Problem**: `_generate_heuristic_questions()` produces Mad Libs-style questions like "How might methods from {label_a} be applied to {label_b}?" — these reference no actual papers, citation data, or evidence from the graph.

**Impact**: Research questions that could be generated without any data analysis are not useful for guiding actual research.

### 5. Static Text Wall

**Problem**: The report is a non-interactive scroll of text sections. No collapsible sections, no tooltips on scores, no copy buttons, no paper cross-references. The left panel is also fixed at 300px which makes reading long text difficult.

**Impact**: Poor reading experience discourages engagement with the report.

## Additional Issues

- **CORS errors**: 500/503 backend errors lack CORS headers, causing browsers to report CORS errors instead of actual server errors.
- **Panel width**: 300px is too narrow for report content.

## Improvement Plan (v3.3.1)

### Backend
1. Add global exception handler for CORS on error responses
2. Fix LLM failure detection (explicit `llm_status` field)
3. Invert semantic score → relatedness (higher = more actionable)
4. Add evidence_detail dict to gap breakdown for explainability
5. Rewrite heuristic RQ generator to use actual paper data
6. Improve LLM prompt with paper TLDRs and structured output

### Frontend
1. Score tooltips with evidence detail on hover
2. Collapsible sections with AnimatePresence
3. Copy-to-clipboard buttons per section
4. LLM fallback warning banner
5. Grounded RQ rendering with paper references
6. Resizable left panel (250-600px drag handle)
7. `semantic` → `relatedness` label change throughout

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Invert semantic → relatedness | Academically correct: similar clusters = more actionable gap |
| Keep 5 dimensions, adjust weights | structural 0.30→0.35, directional 0.15→0.10, others unchanged |
| Evidence detail in response | Enables frontend tooltips without additional API calls |
| Grounded RQ from paper data | Questions referencing actual papers are immediately useful |
| Resizable panel, no new packages | CSS-only drag handle avoids dependency bloat |
| `llm_status` field | Explicit rather than inferring from content presence |
