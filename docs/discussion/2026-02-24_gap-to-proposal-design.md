# Gap-to-Proposal Feature Design Discussion

**Date**: 2026-02-24
**Version**: ScholarGraph3D v3.2.0 → v3.3.0
**Status**: Implementation in progress

---

## 1. Competitive Analysis: Elicit / Scite vs ScholarGraph3D

### Elicit
- AI-powered systematic review tool
- Strengths: full-text extraction, structured data tables, column-based workflows
- Gap analysis: relies on user-driven tagging; no automated structural gap detection

### Scite
- Smart citation context platform
- Strengths: supporting/contrasting/mentioning classification, citation statement extraction
- Gap analysis: not offered; focus is on individual citation validation

### ScholarGraph3D Differentiation
- **3D spatial topology**: clusters visualize thematic proximity that flat tools cannot show
- **Automated gap detection**: inter-cluster structural analysis finds gaps researchers wouldn't manually search for
- **Bridge paper identification**: geometric mean of centroid similarities surfaces unexpected connections
- **Actionable output**: Gap Report transforms detection into a research planning document

---

## 2. Literature Review Pipeline Design

### Current Pipeline (v3.2.0)
```
Seed Paper → S2 refs/cites → Embeddings → UMAP → HDBSCAN → Gaps → Questions
```

### Enhanced Pipeline (v3.3.0)
```
Seed Paper → S2 refs/cites → Embeddings → UMAP → HDBSCAN → Enhanced Gaps → Gap Report
                                                                    ↓
                                                              5-dim scoring
                                                              Key papers
                                                              Temporal context
                                                              Intent distribution
                                                                    ↓
                                                              LLM narrative synthesis
                                                              Research questions + justification
                                                              BibTeX export
```

---

## 3. GraphRAG Academic Literature Review Summary

GraphRAG (Microsoft, 2024) uses community detection on knowledge graphs + LLM summarization for global queries. ScholarGraph3D adapts this principle:
- Communities = HDBSCAN clusters (instead of Leiden on entity graphs)
- Edges = citation + similarity (instead of entity co-occurrence)
- Gap detection = missing cross-community edges (structural holes)
- Report generation = evidence assembly + single LLM call (not map-reduce)

Key insight: GraphRAG's "global search" maps to our gap analysis — both answer "what's missing across the landscape?"

---

## 4. S2 API Technical Analysis

### Available Data (Already Fetched)
- Paper metadata: title, abstract, year, venue, citation_count, fields_of_study
- TLDR summaries (machine-generated)
- SPECTER2 embeddings (768-dim)
- Citation intents: background, methodology, result_comparison
- Is_influential flags
- Reference/citation lists

### Zero Additional API Calls Strategy
All enhanced gap scoring uses data already present in the pipeline:
- **Structural score**: edge density (already computed)
- **Semantic score**: centroid cosine similarity (centroids already computed)
- **Temporal score**: year distributions (year field on every paper)
- **Intent score**: citation intent distribution (fetched in pipeline step 6)
- **Directional score**: citation_pairs asymmetry (tracked since v2.0)

---

## 5. Gap-to-Proposal Scenarios

### Scenario 1: Computational Neuroscience
- Seed: "Attention is All You Need" (Vaswani et al., 2017)
- Gap detected: Transformer Architecture cluster ↔ Neural Computation cluster
- Report: identifies methodology transfer opportunity, cites 3 bridge papers on attention mechanisms in biological neurons
- Value: researcher gets structured argument for grant proposal

### Scenario 2: Drug Repurposing
- Seed: COVID-19 treatment paper
- Gap detected: Immunology cluster ↔ Pharmacology cluster
- Report: highlights temporal gap (immunology papers 2020+, pharmacology 2015-2019), suggests methodology transfer
- Value: identifies specific compounds with unexplored immunological properties

### Scenario 3: Climate + Economics
- Seed: Carbon pricing policy paper
- Gap detected: Climate Modeling cluster ↔ Behavioral Economics cluster
- Report: directional asymmetry (economics cites climate, but not reverse), suggests bidirectional framework
- Value: maps concrete interdisciplinary research agenda

---

## 6. API Call Impact Analysis

| Component | Current API Calls | After Enhancement | Delta |
|-----------|------------------|-------------------|-------|
| S2 seed paper | 1 | 1 | 0 |
| S2 references | 1 | 1 | 0 |
| S2 citations | 1 | 1 | 0 |
| S2 batch embeddings | 1 | 1 | 0 |
| S2 citation intents | 1 | 1 | 0 |
| Groq (gap report) | 0 | 1 (on demand) | +1* |
| **Total per explore** | **5** | **5** | **0** |

*Gap report Groq call is user-triggered (button click), not part of the explore pipeline.

---

## 7. LazyGraphRAG Chat Improvement Notes

Future consideration: the seed chat could leverage gap analysis results as context for more targeted responses. The gap report's evidence assembly output could be injected into the chat system prompt to enable questions like "Tell me more about the gap between X and Y clusters."

This is deferred to a future iteration to maintain the current feature's scope.
