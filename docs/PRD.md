# ScholarGraph3D -- Product Requirements Document

> **Version:** 4.0.0 | **Last Updated:** 2026-03-18
> **Related:** [SPEC.md](./SPEC.md) | [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 1. Vision

Visualize the citation universe from a single seed paper in 3D. ScholarGraph3D helps researchers explore scholarly neighborhoods, discover research gaps, and find bridge papers connecting disparate fields.

### Design Principles

1. **Seed-first exploration** -- start from one paper, expand outward through citations
2. **Visual-first** -- 3D layout encodes meaning: proximity = semantic similarity, color = field, size = impact, depth = time
3. **No LLM dependency** -- all analysis (clustering, gaps, research questions) is computed from paper data
4. **Single data source** -- Semantic Scholar provides metadata, embeddings, citations, and intents

---

## 2. Target Users

| Persona | Need | Workflow |
|---------|------|----------|
| Graduate students | Map a research area from a known paper | Search -> select seed -> explore clusters -> save graph |
| Researchers | Find connections to adjacent fields | Select seed -> expand -> identify gaps and bridge papers |
| Systematic reviewers | Trace citation networks comprehensively | Seed -> expand -> export BibTeX |

---

## 3. User Stories (MVP v4.0.0)

| ID | User Story | Acceptance Criteria | Status |
|----|-----------|---------------------|--------|
| US-01 | Search papers by NL query | POST /api/paper-search returns ranked results in < 3s | Done |
| US-02 | Search papers by DOI | GET /api/papers/by-doi resolves DOI with Crossref fallback | Done |
| US-03 | Explore seed paper in 3D | POST /api/seed-explore builds graph with nodes, edges, clusters, gaps | Done |
| US-04 | See auto-detected clusters | Leiden/HDBSCAN clusters with TF-IDF labels, rendered as nebula clouds | Done |
| US-05 | Click paper for details | Detail panel: title, abstract/TLDR, authors, venue, year, citations, OA link | Done |
| US-06 | Expand from any node | expand-stable adds papers with stable positioning | Done |
| US-07 | See citation edges | Directed citation edges with intent colors and influential markers | Done |
| US-08 | See similarity edges | Dashed lines for papers with cosine similarity > 0.7 | Done |
| US-09 | Detect research gaps | Gap Spotter panel with 3-dim scoring, bridge papers, research questions | Done |
| US-10 | Find citation paths | BFS path finder between any two papers | Done |
| US-11 | Export papers | BibTeX/RIS export for selected papers | Done |
| US-12 | Save/load graphs | Auth + graph CRUD with JSONB state persistence | Done |
| US-13 | See frontier papers | Papers with many unexplored connections highlighted | Done |

---

## 4. Core Workflow

```
Search -> Seed -> Explore (with Gap Spotter) -> Save
```

1. **Search**: Enter NL query or DOI on landing page
2. **Seed**: Select a paper from search results
3. **Explore**: 3D graph renders with clusters, gaps, and frontier indicators
   - Click nodes to view details and expand
   - Left panel: Clusters tab (list, visibility) | Gaps tab (analysis, bridge papers)
   - Right panel: Paper detail + citation path + export
4. **Save**: Save graph to dashboard for later access

---

## 5. Scope Boundaries (v4.0.0 MVP)

### In Scope
- NL search and DOI lookup via Semantic Scholar
- Single seed paper exploration (depth 1, max 200 papers)
- SPECTER2 embeddings + UMAP 3D + Leiden/HDBSCAN clustering
- Gap detection with 3-dimensional scoring (structural, relatedness, temporal)
- Template-generated research questions (no LLM)
- Citation intents from S2
- Graph save/load (authenticated)
- BibTeX/RIS export
- Cosmic Universe visual theme

### Out of Scope (removed from v3.x)
- LLM chat (Groq seed chat)
- LLM-generated gap reports
- Academic analysis reports (APA 7th)
- SNA metrics (PageRank, betweenness centrality)
- Paper bookmarks with tags/memos
- Multi-seed merge
- View toggle (semantic/network layout)
- OpenAlex integration
- Watch queries and email alerts
- Literature review generation

---

## 6. Non-Functional Requirements

| Category | Requirement | Target |
|----------|------------|--------|
| Performance | Seed explore (50 papers) | < 15s |
| Performance | 3D rendering FPS | 30+ at 200 nodes |
| Availability | Uptime | 99.5% (Vercel + Render) |
| Security | Auth | Supabase JWT with RLS |
| Browser | WebGL 2.0 | Chrome 90+, Firefox 90+, Edge 90+, Safari 15+ |

---

## 7. Data Source

Semantic Scholar is the sole academic data provider. All paper metadata, SPECTER2 embeddings, TLDRs, citation intents, and citation graphs come from S2. Rate-limited to 1 RPS (authenticated). Non-commercial license.

Crossref is used only as a DOI fallback for the by-doi endpoint.

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Seed explore success rate | > 95% (non-timeout) |
| Graph render time (50 papers) | < 3s client-side |
| Meaningful clusters detected | >= 2 for graphs with > 20 papers |
| Gap detection coverage | Gaps found in > 60% of graphs with >= 3 clusters |

---

## 9. Glossary

| Term | Definition |
|------|-----------|
| S2 | Semantic Scholar -- academic search engine by AI2 |
| SPECTER2 | 768-dim document embedding model for scientific papers |
| UMAP | Uniform Manifold Approximation and Projection |
| Leiden | Community detection algorithm (graph partitioning) |
| HDBSCAN | Hierarchical Density-Based Spatial Clustering |
| TF-IDF | Term Frequency-Inverse Document Frequency (cluster labeling) |
| DOI | Digital Object Identifier for academic publications |
| TLDR | S2's auto-generated one-sentence paper summary |
| pgvector | PostgreSQL extension for vector similarity search |
| RLS | Row-Level Security in PostgreSQL |
