# ScholarGraph3D Data Strategy

This document reframes ScholarGraph3D around "used by real researchers" rather than strict SaaS commercialization.

## Goal

Build a stack that is:

- useful enough that people would choose to keep using it
- realistic to operate as an open-source research tool
- robust against single-provider lock-in
- good at discovery, expansion, and research insight extraction

## Recommended Provider Mix

### Tier 1: Core discovery

- `OpenAlex`
  - paper search
  - referenced works
  - cited-by traversal
  - related works
  - fields, concepts, topics, institutions, authors
- `Crossref`
  - DOI normalization
  - metadata cleanup
  - update dates and publisher records
- `OpenCitations`
  - citation cross-checking and enrichment

### Tier 2: Open access and retrieval support

- `OpenAlex OA URL` first
- `Crossref` license and link metadata second
- optional `Unpaywall` integration later if OA resolution becomes important

### Tier 3: Semantic ranking and recommendations

- self-hosted embedding model instead of hard dependency on Semantic Scholar
- candidate models:
  - `bge-m3`
  - `gte-large`
  - another research-oriented embedding model after offline evaluation

### Tier 4: Insight extraction

- LLM layer only after candidate papers are already narrowed
- use LLM for:
  - extract columns
  - compare methods
  - summarize evidence
  - draft research gaps
- do not use LLM as the first-stage retrieval engine

## Product Shape

ScholarGraph3D should not be framed as "a 3D graph app".
It should be framed as a research workspace with one strong spatial view.

### Proposed information architecture

1. `Discover`
   - query
   - candidate papers
   - seed graph
   - expand by references / citing / similar

2. `Evaluate`
   - shortlist
   - compare papers
   - inclusion / exclusion
   - paper details

3. `Extract`
   - methods
   - datasets
   - outcomes
   - limitations
   - custom columns

4. `Synthesize`
   - gap summary
   - report drafting
   - cluster narratives
   - research questions

5. `Library`
   - saved graphs
   - saved papers
   - collections
   - alerts and recommendations

## Expand Experience Principles

The current double-click graph expansion is visually interesting but too implicit.

The preferred UX is:

- select paper
- show quick action sheet
  - `Expand references`
  - `Expand citing`
  - `Find similar`
  - `Add as second seed`
- preview expansion before commit
  - estimated new papers
  - estimated new clusters
  - likely bridge papers
- after expansion, show result diff
  - new papers
  - new bridges
  - new gaps
- allow `Undo last expand`

## Recommendation System

Recommendation should be driven by a blended score:

- semantic similarity
- citation distance
- co-citation / bibliographic coupling
- recency
- diversity
- user feedback

### Recommendation surfaces

- `Because you explored`
- `New since last visit`
- `Bridge opportunities`
- `Worth screening next`

### Feedback signals to collect

- relevant
- not relevant
- too broad
- too far from my topic
- follow this author
- follow this topic

## Operating Modes

### Default open-source mode

- OpenAlex + Crossref + OpenCitations
- local embeddings
- cached graph generation
- no paid API required for core use

### Enhanced mode

- optional Semantic Scholar enrichment
- optional LLM extraction
- optional alert pipelines

This keeps the product usable without turning any one provider into a hard blocker.
