# ScholarGraph3D — SDD & TDD Plan

> Version: 1.0 | Last Updated: 2026-02-19
> Related: [PRD.md](./PRD.md) | [SPEC.md](./SPEC.md) | [ARCHITECTURE.md](./ARCHITECTURE.md)

## Document Map
- **PRD.md**: What to build → defines acceptance criteria for tests
- **SPEC.md**: How it works → defines API contracts to test
- **ARCHITECTURE.md**: How it's structured → defines integration points
- **SDD_TDD_PLAN.md**: How it's tested (this document)

## 1. Testing Philosophy

### TDD Cycle
1. **RED**: Write a failing test that defines expected behavior
2. **GREEN**: Write minimal code to make the test pass
3. **REFACTOR**: Improve code while keeping tests green

### Test Pyramid
- **Unit Tests (70%)**: Individual functions, classes, algorithms
- **Integration Tests (20%)**: API endpoints, database operations, API client mocking
- **E2E Tests (10%)**: Critical user flows (search → render → expand → save)

### Coverage Target
- **Minimum**: 80% overall code coverage
- **Critical paths**: 95% (search pipeline, data fusion, graph algorithms)
- **Frontend components**: 70% (excluding 3D rendering internals)

## 2. Backend Test Strategy

### Framework: pytest + pytest-asyncio + httpx

### Test Structure
```
backend/tests/
├── conftest.py                    # Shared fixtures, mocks
├── test_integrations/
│   ├── test_semantic_scholar.py   # S2 client unit tests
│   ├── test_openalex.py           # OA client unit tests
│   └── test_data_fusion.py        # Fusion logic unit tests
├── test_graph/
│   ├── test_embedding_reducer.py  # UMAP reduction tests
│   ├── test_clusterer.py          # HDBSCAN tests
│   ├── test_similarity.py         # Cosine similarity tests
│   └── test_network_metrics.py  # v3.4.0: NetworkMetricsComputer (14 tests)
├── test_services/
│   ├── __init__.py
│   └── test_academic_report.py  # v3.4.0: APA report generation (17 tests)
├── test_routers/
│   ├── test_search.py             # Search endpoint integration
│   ├── test_papers.py             # Papers endpoint integration
│   └── test_graphs.py             # Graphs CRUD integration
└── test_auth/
    └── test_dependencies.py       # Auth middleware tests
```

### Naming Convention
`test_{module}_{scenario}_{expected_result}`
Example: `test_data_fusion_matching_doi_deduplicates`

## 3. Frontend Test Strategy

### Framework: Jest + React Testing Library + Playwright (E2E)

### Test Structure
```
frontend/__tests__/
├── setup.ts                       # Jest config
├── components/
│   ├── SearchBar.test.tsx         # Search input behavior
│   ├── PaperDetailPanel.test.tsx  # Detail panel rendering
│   ├── ClusterPanel.test.tsx      # Cluster list behavior
│   └── GraphControls.test.tsx     # Toggle controls
├── hooks/
│   └── useGraphStore.test.ts      # Zustand store logic
├── lib/
│   └── api.test.ts                # API client mocking
└── e2e/
    └── search-flow.spec.ts        # Full search → graph → expand flow
```

## 4. Phase 1 Test Plan (US-01 ~ US-10)

| User Story | Test Type | Test Cases | Priority |
|-----------|-----------|-----------|----------|
| US-01 Search | Integration | Empty query → 422, valid query → 200 with nodes/edges/clusters/meta, OA+S2 fusion, DOI dedup | P0 |
| US-02 3D Viz | Unit+E2E | UMAP produces (N,3), node sizes/colors correct, renders without crash | P0 |
| US-03 Clustering | Unit | HDBSCAN produces labels, OA Topics labeling, hull computation | P0 |
| US-04 Paper Detail | Integration | GET /papers/{id} returns detail, 404 for unknown | P0 |
| US-05 Citation Expand | Integration | POST /papers/{id}/expand returns refs+citations | P0 |
| US-06 Graph Save | Integration | POST/GET/PUT/DELETE graphs with auth, 401 without auth | P0 |
| US-07 Citation Edges | Unit | Edge type=citation in response, direction correct | P1 |
| US-08 Similarity Edges | Unit | Threshold filtering, max edges limit, cosine computation | P1 |
| US-09 Filters | Integration | Year range filter, field filter in search | P1 |
| US-10 Controls | E2E | Toggle edges/clusters/labels, reset camera | P2 |

## 5. Phase 2 Test Plan (US-11 ~ US-15)

| User Story | Test Type | Test Cases |
|-----------|-----------|-----------|
| US-11 AI Chat | Integration | Question → pgvector search → LLM → cited answer |
| US-12 Trends | Unit | Year-wise aggregation, classification logic |
| US-13 Gaps | Unit | Inter-cluster density, gap detection, hypothesis generation |
| US-14 LLM Keys | Integration | Key storage, provider switching, fallback |
| US-15 Lit Review | Integration | Markdown generation, APA citation format |

## 6. Phase 6 Test Plan — Academic Analysis (v3.4.0)

| Component | Test Type | Test Cases | Priority |
|-----------|-----------|-----------|----------|
| NetworkMetricsComputer | Unit | Empty/single/chain/star graphs, centrality ordering, h-index, structural holes, modularity, silhouette, overview | P0 |
| academic_report_service | Unit | Feasibility tiers (insufficient/partial/full), methods params, table shapes, figure captions, reference counts | P0 |
| academic_report router | Integration | Success/insufficient/empty 400, overview success/empty | P1 |

## 7. CI/CD Integration

### GitHub Actions Workflow
```yaml
name: CI
on: [push, pull_request]
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r backend/requirements.txt
      - run: cd backend && pytest -v --cov=. --cov-report=xml
      - uses: codecov/codecov-action@v4

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18' }
      - run: cd frontend && npm ci && npm test -- --coverage
```

## 7. Mock Strategy

### External API Mocks
- S2 client: AsyncMock with sample paper responses
- OA client: AsyncMock with sample work responses
- Database: AsyncMock with configurable return values
- Supabase Auth: Mock JWT verification

### Sample Test Data
Maintain fixtures in `tests/fixtures/` with:
- sample_s2_paper.json
- sample_oa_work.json
- sample_embeddings.npy (small 10×768 array)

## 8. v1.1.0 Test Coverage — Expand Error Resilience

### New Test File: `tests/test_routers/test_papers.py`

| Test | Description | Type |
|------|-------------|------|
| `test_expand_stable_returns_200_with_nodes_and_edges` | Valid expand returns 200 with all fields | Integration |
| `test_expand_stable_meta_all_ok` | Both refs/cites succeed → meta reports ok | Integration |
| `test_expand_stable_meta_refs_fail` | Refs fail → partial success with meta | Integration |
| `test_expand_stable_meta_cites_fail` | Cites fail → partial success with meta | Integration |
| `test_expand_stable_meta_both_fail` | Both fail → 200 with empty nodes, meta errors | Integration |
| `test_expand_stable_timeout_classified_in_meta` | Timeout exception → "timed out" in error_detail | Integration |
| `test_expand_stable_edges_connect_to_parent` | Edges correctly source=parent, target=child | Integration |
| `test_expand_stable_node_has_required_fields` | Nodes contain paper_id, title, initial_x/y/z | Integration |
| `test_expand_meta_defaults` | ExpandMeta defaults (all ok, zero counts) | Unit |
| `test_expand_meta_with_error` | ExpandMeta with error state | Unit |
| `test_expand_meta_serialization` | ExpandMeta serializes to dict | Unit |
| `test_stable_expand_response_includes_meta` | StableExpandResponse with meta | Unit |
| `test_stable_expand_response_meta_optional` | StableExpandResponse without meta (backwards compat) | Unit |

### Coverage: expand-stable endpoint
- Happy path: ✅
- Partial failure (refs): ✅
- Partial failure (cites): ✅
- Total failure: ✅
- Timeout classification: ✅
- Edge connectivity: ✅
- Node structure: ✅
- Pydantic model validation: ✅

## 9. v3.3.0 Test Coverage — Gap-to-Proposal Pipeline

### New Test File: `tests/test_graph/test_gap_detector_enhanced.py`

| Test | Description | Type |
|------|-------------|------|
| `test_detect_gaps_returns_score_breakdown` | Each gap has `gap_score_breakdown` with 6 keys | Unit |
| `test_structural_score_zero_edges_returns_one` | No inter-cluster edges → structural = 1.0 | Unit |
| `test_structural_score_full_connectivity_returns_zero` | All possible edges → structural ≈ 0.0 | Unit |
| `test_semantic_score_identical_centroids_returns_zero` | Same centroid → semantic = 0.0 | Unit |
| `test_semantic_score_orthogonal_centroids_returns_one` | Orthogonal centroids → semantic = 1.0 | Unit |
| `test_temporal_score_no_overlap` | Non-overlapping year ranges → temporal = 1.0 | Unit |
| `test_temporal_score_full_overlap` | Identical year ranges → temporal = 0.0 | Unit |
| `test_temporal_score_partial_overlap` | Partially overlapping → 0.0 < temporal < 1.0 | Unit |
| `test_intent_score_all_background` | All background intents → score > 0.5 | Unit |
| `test_intent_score_no_cross_citations` | No cross-cluster citations → score = 0.8 | Unit |
| `test_directional_score_symmetric` | Equal A→B and B→A → score = 0.0 | Unit |
| `test_directional_score_asymmetric` | Only A→B → score = 1.0 | Unit |
| `test_directional_score_no_pairs` | No citation_pairs → score = 0.8 | Unit |
| `test_composite_weighted_sum` | composite = 0.3*structural + 0.25*semantic + 0.15*(temporal+intent+directional) | Unit |
| `test_gap_strength_equals_composite` | gap.gap_strength == gap.gap_score_breakdown['composite'] | Unit |
| `test_key_papers_top_3_by_citations` | key_papers sorted by citation_count descending, max 3 | Unit |
| `test_key_papers_includes_tldr` | key_papers contain tldr when available | Unit |
| `test_temporal_context_year_ranges` | temporal_context has correct year_range_a, year_range_b, overlap_years | Unit |
| `test_detect_gaps_backward_compat` | Calling without citation_pairs/intent_edges still works | Unit |
| `test_all_scores_in_zero_one_range` | Every dimension score in [0.0, 1.0] | Unit |

### New Test File: `tests/test_services/test_gap_report_service.py`

| Test | Description | Type |
|------|-------------|------|
| `test_assemble_evidence_returns_all_sections` | Evidence has score_interpretation, cluster profiles, bridge, temporal, intent | Unit |
| `test_assemble_evidence_empty_gap` | Minimal gap data → evidence with defaults | Unit |
| `test_assemble_report_with_narrative` | Full report with LLM narrative sections | Unit |
| `test_assemble_report_without_narrative` | Graceful degradation: evidence-only report | Unit |
| `test_assemble_report_bibtex_format` | BibTeX entries are valid @article format | Unit |
| `test_assemble_report_cited_papers_deduped` | No duplicate paper_ids in cited_papers | Unit |
| `test_research_questions_from_narrative` | LLM questions include question, justification, methodology_hint | Unit |
| `test_research_questions_fallback_heuristic` | Without narrative, heuristic questions used | Unit |
| `test_compute_gap_report_cache_key_stable` | Same gap → same cache key | Unit |
| `test_compute_gap_report_cache_key_different` | Different gaps → different keys | Unit |

### New Test File: `tests/test_routers/test_gap_report.py`

| Test | Description | Type |
|------|-------------|------|
| `test_generate_gap_report_200` | Valid request → 200 with all fields | Integration |
| `test_generate_gap_report_missing_gap_id` | Missing gap_id → 400 | Integration |
| `test_generate_gap_report_llm_failure_graceful` | LLM fails → 200 with evidence-only | Integration |
| `test_generate_gap_report_cached` | Second call returns cached result | Integration |
| `test_generate_gap_report_response_schema` | Response matches GapReportResponse model | Integration |

### Coverage: Gap-to-Proposal pipeline
- Gap score computation: ✅ (all 5 dimensions + composite)
- Score ranges: ✅ (all values [0,1])
- Backward compatibility: ✅ (old callers still work)
- Report assembly: ✅ (with and without LLM)
- BibTeX generation: ✅
- Cache: ✅ (hit/miss/key stability)
- API endpoint: ✅ (happy path, error, graceful degradation)

### Frontend Test File: `__tests__/components/GapSpotterPanel.test.tsx`

| Test | Description | Type |
|------|-------------|------|
| `test_renders_score_breakdown_bars` | Gap with breakdown shows 5 dimension bars | Component |
| `test_generate_report_button_exists` | Each gap card has GENERATE REPORT button | Component |
| `test_generate_report_button_disabled_during_loading` | Button disabled when gapReportLoading=true | Component |
| `test_key_papers_preview_renders` | Gap with key_papers shows paper titles | Component |

### Frontend Test File: `__tests__/components/GapReportView.test.tsx`

| Test | Description | Type |
|------|-------------|------|
| `test_renders_report_title` | Report title shown with cluster labels | Component |
| `test_renders_executive_summary` | Executive summary section visible | Component |
| `test_renders_score_bars` | All 6 score dimensions rendered as bars | Component |
| `test_renders_research_questions` | Questions with justification and methodology | Component |
| `test_back_button_clears_report` | Click back → setActiveGapReport(null) | Component |
| `test_download_markdown_triggers_download` | Click Markdown → downloadFile called | Component |
| `test_download_bibtex_triggers_download` | Click BibTeX → downloadFile called | Component |

### Frontend Test File: `__tests__/lib/export.test.ts`

| Test | Description | Type |
|------|-------------|------|
| `test_toGapReportMarkdown_includes_all_sections` | Markdown has title, summary, scores, sections, questions | Unit |
| `test_toGapReportMarkdown_includes_snapshot` | Snapshot data URL included as image | Unit |
| `test_toGapReportBibtex_returns_bibtex` | Returns the report's bibtex field | Unit |

## 10. v3.3.1 Test Coverage — Gap Explainability & Quality

### Changes tested in this release

- `relatedness` dimension (formerly `semantic`): cosine similarity between cluster centroids; higher = more actionable gap
- `evidence_detail` dict returned per gap from `gap_detector.py`
- `_generate_grounded_questions()` replaces template-based heuristic question generation
- `llm_status` field in gap report response (`"success"` | `"failed"`)
- Global CORS exception handler in `main.py` ensures CORS headers on 500/503 errors

### New / updated tests

| Test | Description | Type |
|------|-------------|------|
| `test_relatedness_score_is_cosine_sim` | `relatedness` == centroid cosine similarity (not 1-cosine_sim) | Unit |
| `test_evidence_detail_keys_present` | Each gap has `evidence_detail` with expected keys | Unit |
| `test_grounded_questions_use_paper_data` | Questions reference paper TLDRs / temporal context, not fixed templates | Unit |
| `test_gap_report_response_includes_llm_status` | Response schema contains `llm_status` field | Integration |
| `test_gap_report_llm_status_failed_on_error` | LLM failure sets `llm_status: "failed"` | Integration |
| `test_cors_headers_on_500_error` | Unhandled exception returns CORS headers in response | Integration |
