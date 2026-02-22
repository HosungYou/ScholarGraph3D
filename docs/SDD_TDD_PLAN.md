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
│   └── test_similarity.py         # Cosine similarity tests
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

## 6. CI/CD Integration

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

## 7. v1.1.0 Test Coverage — Expand Error Resilience

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
