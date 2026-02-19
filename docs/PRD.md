# ScholarGraph3D — Product Requirements Document

> **Version:** 1.0 | **Last Updated:** 2026-02-19
> **Related:** [SPEC.md](./SPEC.md) | [ARCHITECTURE.md](./ARCHITECTURE.md) | [SDD/TDD Plan](./SDD_TDD_PLAN.md)

---

## Document Map

```
PRD.md (this file)          — What we build and why
  |
  +-- SPEC.md               — How it works technically
  |     |
  |     +-- API contracts, DB schemas, data pipelines
  |
  +-- ARCHITECTURE.md       — How the system is structured
  |     |
  |     +-- Component design, deployment, code organization
  |
  +-- SDD_TDD_PLAN.md       — How we verify correctness
        |
        +-- Test strategy, TDD cycles, acceptance criteria
```

All four documents form a complete project specification. Cross-references use relative links throughout.

---

## 1. Vision & Mission

**Vision:** "Visualize the universe of academic papers in 3D — search, explore, and let AI guide your research journey."

**Mission:** Build a literature discovery platform that makes academic research exploration visual, intuitive, and AI-powered. Researchers type a keyword and instantly see a 3D galaxy of related papers — clustered by topic, connected by citations and semantic similarity, and navigable with AI assistance.

**Korean:** "키워드를 입력하면 3D 논문 우주가 펼쳐지고, AI가 연구 지형을 안내한다."

### Design Principles

1. **Discovery over search** — The graph reveals connections no keyword search could surface.
2. **Visual-first** — 3D spatial layout encodes meaning: proximity = similarity, color = field, size = impact.
3. **Open data, open science** — OpenAlex CC0 as primary source; no paywall for core features.
4. **Progressive disclosure** — Free tier delivers immediate value; premium unlocks AI depth.

---

## 2. Target Users

| Persona | Need | Key Workflow |
|---------|------|-------------|
| **Graduate students** starting literature reviews | Quickly map a new research area | Search keyword -> explore clusters -> save interesting papers |
| **Researchers** exploring adjacent fields | Find unexpected connections across disciplines | Search -> expand citation networks -> discover bridge papers |
| **Research teams** mapping competitive landscapes | Understand who is working on what, and where gaps exist | Search -> cluster analysis -> trend/gap detection (Phase 2) |
| **Systematic review authors** | Comprehensive, reproducible coverage | Search -> expand all citations -> export paper list |

### User Characteristics

- Comfortable with academic databases (Google Scholar, PubMed, S2)
- Familiar with citation networks conceptually, but rarely visualize them
- Time-pressured — a literature review that takes weeks should take hours
- Multilingual — interface in English, but papers span all languages

---

## 3. User Stories & Acceptance Criteria

### Phase 1 (MVP) — v0.1.0 ~ v0.5.0

Core search, visualization, and exploration. Free for all users.

| ID | User Story | Acceptance Criteria | Priority | Status |
|----|-----------|-------------------|----------|--------|
| US-01 | As a researcher, I want to search papers by keyword | Search returns 200+ papers in <5s; OA+S2 fusion with DOI dedup; year and field filters work | P0 | Scaffolded |
| US-02 | As a researcher, I want to see papers in 3D space | SPECTER2 embeddings reduced to 3D via UMAP; nodes colored by field, sized by log(citations); smooth 30+ FPS | P0 | Scaffolded |
| US-03 | As a researcher, I want to see auto-detected clusters | HDBSCAN clusters with OA Topics labels; convex hull overlays with semi-transparent fills; cluster panel lists all clusters | P0 | Scaffolded |
| US-04 | As a researcher, I want to click a paper for details | Detail panel shows: title, abstract/TLDR, authors, venue, year, citation count, OA link, fields, topics | P0 | Scaffolded |
| US-05 | As a researcher, I want to expand citation networks | Double-click a node -> load references + citations from S2 -> new nodes appear in graph with citation edges | P0 | Scaffolded |
| US-06 | As a researcher, I want to save my exploration | Supabase Auth (email/password); save/load graph state including papers, layout positions, camera angle | P0 | Scaffolded |
| US-07 | As a researcher, I want citation edges visible | Solid directional arrows from citing paper to cited paper; arrow size proportional to edge weight | P1 | Scaffolded |
| US-08 | As a researcher, I want similarity edges | Dashed lines connecting papers with cosine similarity > threshold (default 0.7); configurable threshold | P1 | Scaffolded |
| US-09 | As a researcher, I want to filter by year/field | Year range slider in search bar; field-of-study dropdown; filters apply to both OA and S2 queries | P1 | Scaffolded |
| US-10 | As a researcher, I want graph controls | Toggle buttons: citation edges, similarity edges, cluster hulls, node labels; reset camera button | P2 | Scaffolded |

> **Implementation detail:** See [SPEC.md SS4 API Specification](./SPEC.md#4-api-specification) for endpoint contracts and [ARCHITECTURE.md SS4 Frontend Architecture](./ARCHITECTURE.md#4-frontend-architecture) for component design.

### Phase 2 (AI Premium) — v0.6.0 ~ v0.9.0

AI-powered analysis features. Requires user's own LLM API key.

| ID | User Story | Acceptance Criteria | Priority | Status |
|----|-----------|-------------------|----------|--------|
| US-11 | As a researcher, I want AI chat about my graph | GraphRAG pipeline: question -> retrieve relevant papers from graph -> LLM generates cited answer -> citations link to nodes | P0 | Planned |
| US-12 | As a researcher, I want trend analysis | Year-by-year cluster growth visualization; classify clusters as Emerging (>50% growth), Stable, or Declining | P1 | Planned |
| US-13 | As a researcher, I want gap analysis | Inter-cluster citation density matrix; identify low-density pairs as research opportunities; visual overlay on graph | P1 | Planned |
| US-14 | As a researcher, I want to use my own LLM key | Settings panel: select provider (Groq/OpenAI/Anthropic/Google); enter API key; key stored client-side only (never sent to our backend) | P0 | Planned |
| US-15 | As a researcher, I want literature review drafts | Select clusters + trends + gaps -> generate structured Markdown with APA citations; export as .md or .docx | P2 | Planned |

> **Architecture:** See [ARCHITECTURE.md SS10 Phase 2 Architecture Extensions](./ARCHITECTURE.md#10-phase-2-architecture-extensions) for LLM integration design and [SPEC.md SS7 Search Pipeline Spec](./SPEC.md#7-search-pipeline-spec) for GraphRAG pipeline details.

### Phase 3 (Real-time & Advanced) — v0.10.0+

Real-time monitoring and advanced analytics.

| ID | User Story | Acceptance Criteria | Priority | Status |
|----|-----------|-------------------|----------|--------|
| US-16 | As a researcher, I want watch query alerts | Weekly cron checks for new papers matching saved queries; email + in-app notification with count and top papers | P1 | Planned |
| US-17 | As a researcher, I want citation intent visualization | Edge colors encode intent: supports=green, contradicts=red, methodology=purple, background=gray, result_comparison=blue | P2 | Planned |
| US-18 | As a researcher, I want ScholaRAG_Graph export | Select papers -> export to ScholaRAG for deep RAG-based analysis; share format compatible with ScholaRAG_Graph import | P2 | Planned |

---

## 4. Business Model — Freemium

| Tier | Features | Cost | Revenue Model |
|------|---------|------|---------------|
| **Free** | Search, 3D visualization, clustering, detail panel, citation expansion, graph saving | $0 | API costs only (OA=free, S2=free tier) |
| **Premium** | AI chat (GraphRAG), trend analysis, gap detection, literature review drafts | User's own LLM API key | Zero marginal cost to us |

### Why "Bring Your Own Key"

1. **No billing infrastructure needed** — Users pay their LLM provider directly.
2. **Provider choice** — Researchers may have institutional API keys or preferences.
3. **Privacy** — Paper data stays between user's browser and their chosen LLM.
4. **Scalability** — Our costs don't grow with AI usage.

---

## 5. Success Metrics

| Metric | Target (6 months) | Measurement |
|--------|-------------------|-------------|
| Monthly Active Users | 500+ | Unique users with >= 1 search/month |
| Search queries/day | 100+ | POST /api/search count |
| Saved graphs/user | 3+ average | user_graphs table count per user |
| Premium conversion | 15% | Users who configure LLM key / total users |
| Graph render time | <3s for 200 papers | Client-side performance measurement |
| 3D FPS at 500 papers | 30+ | requestAnimationFrame timing |
| API latency (search) | <5s p95 | Server-side timing in response meta |
| Cache hit rate | >40% | search_cache hits / total searches |

> **Performance budgets:** See [SPEC.md SS10 Performance Requirements](./SPEC.md#10-performance-requirements) for detailed latency and rendering targets.

---

## 6. Competitive Advantage

> Full comparison table in [SPEC.md SS2 Market Analysis](./SPEC.md#2-market-analysis).

ScholarGraph3D fills **8 market gaps** not addressed by existing tools:

| Gap | Existing Tools | ScholarGraph3D |
|-----|---------------|----------------|
| 3D visualization | Connected Papers (2D), VOSviewer (2D) | True 3D with Three.js, depth encodes temporal dimension |
| Semantic + citation hybrid | Tools show one or the other | Both edge types on same graph with toggles |
| Paper-level GraphRAG | No tool offers this | Question -> relevant papers -> LLM -> cited answer |
| Citation intent coloring | S2 has data but no viz tool uses it | Edge colors: supports, contradicts, methodology, background |
| Real-time growth tracking | Static snapshots only | Weekly watch queries with notification |
| Multi-API fusion | Single source (OA or S2) | OA metadata + S2 embeddings/TLDR, DOI dedup |
| Scale + interactivity | VOSviewer (static), CiteSpace (desktop) | 500+ papers at 30 FPS in browser with drag, zoom, expand |
| SPECTER2 embeddings | No viz tool uses SPECTER2 | 768-dim SPECTER2 -> UMAP 3D -> semantic proximity |

---

## 7. Risks & Mitigations

> Technical risk details in [ARCHITECTURE.md SS6 Risk Management](./ARCHITECTURE.md#6-risk-management).

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| S2 commercial license restrictions | High — embedding access could be limited | Medium | OA-first strategy; self-host SPECTER2 model as fallback; negotiate S2 Expanded License if needed |
| OA credit limits (100K/day premium) | Medium — could throttle high-usage periods | Low | Aggressive 24h caching; credit tracker with cache-first mode at 95%; free tier has no credits |
| Abstract coverage gaps | Medium — some papers lack abstracts | Medium | OA abstract -> S2 abstract -> S2 TLDR fallback chain; display "No abstract available" gracefully |
| 3D performance at scale (>500 papers) | Medium — FPS drops, user frustration | Medium | LOD rendering; node culling outside viewport; WebWorker for UMAP computation; progressive loading |
| Supabase vendor lock-in | Low — auth and DB on single provider | Low | Standard JWT auth; PostgreSQL is portable; can self-host Supabase |
| UMAP non-determinism | Low — same query gives slightly different layouts | Low | Fixed random_state=42; cache UMAP results with search results |

---

## 8. Release Plan

| Version | Scope | User Stories | Target | Status |
|---------|-------|-------------|--------|--------|
| **v0.1.0** | Scaffold: project structure, search endpoint, 3D viz, data fusion | US-01, US-02 | 2026-02-19 | Scaffolded |
| **v0.2.0** | Clustering + detail panel + cluster panel | US-03, US-04 | Week 2 | Planned |
| **v0.3.0** | Citation expansion + graph growth + citation edges | US-05, US-07 | Week 3 | Planned |
| **v0.4.0** | Auth + graph saving/loading + dashboard | US-06 | Week 4 | Planned |
| **v0.5.0** | Polish: filters, controls, similarity edges, testing, Phase 1 complete | US-08, US-09, US-10 | Week 5-6 | Planned |
| **v0.6.0** | AI chat (GraphRAG) + LLM key settings | US-11, US-14 | Week 7-8 | Planned |
| **v0.7.0** | Trend analysis | US-12 | Week 9 | Planned |
| **v0.8.0** | Gap analysis | US-13 | Week 10 | Planned |
| **v0.9.0** | Literature review drafts + Phase 2 polish | US-15 | Week 11-12 | Planned |
| **v0.10.0+** | Watch queries, citation intent viz, ScholaRAG export | US-16, US-17, US-18 | Ongoing | Planned |

> **Testing strategy for each version:** See [SDD/TDD Plan](./SDD_TDD_PLAN.md) for test-driven development cycles aligned with this release plan.

---

## 9. Non-Functional Requirements

| Category | Requirement | Target |
|----------|------------|--------|
| **Performance** | Search-to-render latency | <5s for 200 papers |
| **Performance** | 3D rendering FPS | 30+ at 500 nodes |
| **Availability** | Uptime | 99.5% (Vercel + Render SLA) |
| **Security** | Auth | Supabase JWT with RLS policies |
| **Security** | API keys | Never stored server-side; client-side only for LLM keys |
| **Accessibility** | Keyboard navigation | Tab through panels; Enter to select; Escape to deselect |
| **Accessibility** | Screen readers | ARIA labels on all interactive elements |
| **Internationalization** | Interface language | English (v1); i18n-ready structure |
| **Data privacy** | User data | Graph saves tied to user_id; RLS enforced; no analytics tracking |
| **Browser support** | WebGL 2.0 | Chrome 90+, Firefox 90+, Edge 90+, Safari 15+ |

> **Detailed performance budgets and testing requirements:** See [SPEC.md SS10](./SPEC.md#10-performance-requirements) and [SPEC.md SS11](./SPEC.md#11-testing-requirements).

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **OA** | OpenAlex — free, open catalog of 250M+ academic works (CC0 license) |
| **S2** | Semantic Scholar — academic search engine by AI2 with SPECTER2 embeddings and TLDRs |
| **SPECTER2** | 768-dimensional document embedding model trained on scientific papers (AI2) |
| **UMAP** | Uniform Manifold Approximation and Projection — dimensionality reduction algorithm |
| **HDBSCAN** | Hierarchical Density-Based Spatial Clustering of Applications with Noise |
| **GraphRAG** | Retrieval-Augmented Generation using graph structure to select relevant context |
| **DOI** | Digital Object Identifier — unique persistent identifier for academic publications |
| **TLDR** | Too Long; Didn't Read — S2's auto-generated one-sentence paper summary |
| **RLS** | Row-Level Security — PostgreSQL feature enforcing per-user data access |
| **pgvector** | PostgreSQL extension for vector similarity search |

---

*This document is the authoritative source for product requirements. For technical implementation details, see [SPEC.md](./SPEC.md). For system design, see [ARCHITECTURE.md](./ARCHITECTURE.md). For test strategy, see [SDD/TDD Plan](./SDD_TDD_PLAN.md).*
