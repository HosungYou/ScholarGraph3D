# ScholarGraph3D v2.0.0 — Release Notes

**Release Date:** 2026-02-23
**Type:** Major Release (Breaking Changes)

---

## Overview

v2.0.0 is a complete reimagining of ScholarGraph3D. The platform has been stripped of its scattered feature sprawl and reborn as a single, focused instrument: a **Seed Paper exploration engine** that lets researchers navigate the living constellation of academic knowledge from a single point of origin.

Where v1.x attempted to be many tools at once — keyword search, NL search, lit review generator, recommendations engine, analytics dashboard — v2.0.0 does one thing and does it with precision. You drop a paper into the void. The universe expands around it.

---

## What's New

### Phase 0: The Great Purge (Codebase Cleanup)

Before building, we cleared the sky.

**42+ dead files deleted**, including:

- Old keyword search and NL search handlers
- SSE stream infrastructure
- Watch query system
- Literature review scaffolding
- Personalization and recommendations modules
- Analytics pipeline
- Orphaned router and component scaffolding

**6 LLM provider wrappers removed:** `openai`, `claude`, `gemini`, `user_provider`, `cached_provider`, `circuit_breaker`. All LLM inference is now routed through a single server-side Groq integration. No more client-side model configuration.

**External data source integrations removed:**
- OpenAlex integration
- OpenCitations integration

**Dead imports cleaned** from `api.ts`, `useGraphStore.ts`, `types/index.ts`, `main.py`.

**5 broken store references fixed** in `ScholarGraph3D.tsx`.

The result: zero dead code, zero broken references entering the v2.0.0 build.

---

### Phase 1: Landing Page Redesign

The entry point has been rebuilt around two modes of discovering your seed star:

- **DOI Entry** — Paste a known DOI directly to anchor your exploration
- **NL Paper Finder** — Describe what you're looking for in natural language; the new `POST /api/paper-search` endpoint finds candidate papers

A **warp transition animation** fires when a paper is selected, pulling the user into the 3D graph with appropriate ceremony. Example seeds and example NL queries are surfaced inline to reduce time-to-first-exploration.

---

### Phase 2: Enhanced Expand — Similarity Edges and Frontier Scoring

When you expand a node, the graph now does more than fetch citations. It thinks about what it found.

**Similarity edges** are computed between newly expanded papers using cosine similarity over SPECTER2 embeddings. Papers that occupy similar conceptual space in the embedding manifold are drawn together, forming emergent **nebulae** — clusters of thematically related stars that citation links alone would never reveal.

**Frontier score** measures how unexplored a paper is: the ratio of its connections that have not yet been expanded in your current session. A paper with many unvisited neighbors scores high — it sits on the edge of the known graph, pointing outward into uncharted territory.

**Red ring visualization** marks frontier nodes with a score above 0.7. These are your next targets. Follow the red rings to go where the graph is least explored.

---

### Phase 3: Gap Spotter

The `GapDetector` module is now integrated directly into the `seed_explore` pipeline. After each expansion, the system scans the graph for structural gaps — regions where papers from distinct clusters cite each other rarely or not at all, suggesting an unexplored bridge between two bodies of work.

**What Gap Spotter surfaces:**

- **Frontier papers** — stars with many unexplored connections, sitting at the edge of your current map
- **Bridge papers** — papers that already span two or more nebulae, hinting at where synthesis is possible
- **Gap analysis** — structural metrics (gap strength, potential edges) quantify the distance between clusters

The new **GapSpotterPanel** presents gap cards, bridge paper listings, and generated research questions in a readable sidebar panel. Research question generation is non-blocking; the panel renders structural findings immediately and populates LLM output when available.

---

### Phase 4: Seed Chat with Groq

Every exploration session now includes a conversational layer grounded in the graph you've built.

**`POST /api/seed-chat`** accepts a user message along with structured graph context — the top 10 papers by relevance, cluster membership, frontier scores — and returns a response from `llama-3.3-70b` via Groq.

The **SeedChatPanel** renders the conversation with follow-up suggestions derived from the current graph state. Ask what connects two clusters. Ask why a particular paper keeps appearing as a bridge. Ask what the gaps suggest about open problems in the field.

The model knows your graph. It doesn't hallucinate a generic literature answer — it reasons about the specific constellation you've assembled.

---

### Phase 5: Citation Path Finder and Export

**Citation Path Finder** uses bidirectional BFS to find the shortest citation path between any two papers in the loaded graph. Select a start paper and an end paper from the PaperDetailPanel — if a path exists, it renders as a **gold trail** through the 3D space, illuminating the chain of influence connecting two stars.

**BibTeX and RIS export** is available per-paper from the PaperDetailPanel. Batch export functions (`toBibtexBatch`, `toRISBatch`) let you export all papers in the current graph or a selected subset.

---

### Phase 6: Graph Save and Load

Exploration sessions are now persistent.

A new `JSONB graph_data` column in the `user_graphs` table (migration `003`) stores full `GraphData` serialization. The graph is **auto-saved** on initial seed load and **debounced-saved** on each expand operation.

From the dashboard, any saved graph can be reloaded via `?graph_id=` query parameter, restoring the full node and edge state exactly as it was when last saved. Pick up where you left off. Return to a graph weeks later. Share a `graph_id` with a collaborator.

---

### Phase 7: Final Integration

**Tabbed left panel** organizes the three analytical views cleanly:
- **Clusters** — nebula membership and inter-cluster relationships
- **Gaps** — GapSpotter output
- **Chat** — SeedChat conversation

**Depth-1 exploration** provides focused citation graphs centered on the seed paper. Direct references and citations give the optimal density-to-speed ratio.

**GraphLegend** updated with entries for frontier nodes (red ring) and citation paths (gold trail).

**Dead link cleanup:** the `/explore` route (keyword search) has been removed. Internal navigation now routes correctly to `/dashboard`.

**Two additional dead components removed:** `TimelineView` and `CitationContextModal`.

---

## Architecture

### Backend

| Layer | Modules |
|---|---|
| **Routers** | `papers`, `graphs`, `seed_explore`, `paper_search`, `seed_chat`, `__init__` |
| **Graph modules** | `bridge_detector`, `clusterer`, `embedding_reducer`, `gap_detector`, `incremental_layout`, `similarity`, `__init__` |

### Frontend

| Layer | Details |
|---|---|
| **Routes** | `/`, `/auth`, `/auth/callback`, `/dashboard`, `/explore/seed`, `/sitemap.xml` |
| **Components** | 16 components across 4 directories |

---

## Breaking Changes

The following features and endpoints present in v1.x **no longer exist** in v2.0.0:

| Removed | Notes |
|---|---|
| Keyword search (`/explore` page) | Replaced by seed-based exploration from `/dashboard` |
| NL search router | NL paper discovery now handled by `/api/paper-search` (landing page only) |
| Watch queries | Removed entirely |
| Literature review | Removed entirely |
| Personalization and recommendations | Removed entirely |
| LLM settings modal | Model selection removed; server-side Groq only |
| Conceptual edges | Replaced by SPECTER2 similarity edges |
| Multi-select mode | Removed entirely |
| OpenAlex integration | Removed |
| OpenCitations integration | Removed |
| All client-side LLM provider wrappers | `openai`, `claude`, `gemini`, `user_provider`, `cached_provider`, `circuit_breaker` |

If you have any saved state, bookmarks, or integrations pointing at the keyword search interface or the removed API endpoints, they will not function in v2.0.0.

---

## Migration Notes

### Database

Apply migration `003` before running v2.0.0:

```
database/migrations/003_add_graph_data_jsonb.sql
```

This adds the `graph_data JSONB` column to `user_graphs`. The migration is non-destructive — existing rows will have `graph_data = NULL` until resaved.

### Environment Variables

Remove any client-side LLM configuration variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` passed to the frontend). Server-side Groq requires only `GROQ_API_KEY` in the backend environment.

---

## Summary

v2.0.0 is not a feature release. It is a reduction — a deliberate narrowing to the one thing ScholarGraph3D was always best at: letting a researcher stand at a single paper and watch the field unfold around it in three dimensions.

The constellation is cleaner now. There is less noise. Every star you see is reachable. Every red ring is an invitation.

Follow the frontier.
