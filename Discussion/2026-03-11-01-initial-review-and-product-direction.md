# 2026-03-11 Initial Review And Product Direction

## Phase Goal

Establish what ScholarGraph3D currently is, what blocks real use, and what product shape it should move toward.

## Starting Assessment

The repository was reviewed as:

- a literature exploration tool
- a research insight extraction tool
- a visually strong but workflow-imbalanced research interface

The early review concluded that the project was too graph-centric and too demo-like for sustained researcher use.

## Key Decisions

### Product framing

ScholarGraph3D should be treated as:

- an academic discovery tool
- a research insight extraction tool

It should not be framed primarily as a 3D visualization demo.

### Information architecture

The preferred workflow shape became:

1. Discover
2. Evaluate
3. Extract
4. Synthesize
5. Library

### Data strategy

The preferred long-term provider direction became:

- OpenAlex
- Crossref
- OpenCitations
- local embeddings
- optional Semantic Scholar enrichment

This reduced dependence on any single provider and aligned with open-source operation.

### Feature priority

Keep and strengthen:

- search
- seed exploration
- expand
- save
- compare and screening
- structured extraction
- reports
- recommendations and alerts

De-emphasize:

- HUD-style ornament
- low-value graph toggles
- visually impressive but weakly actionable interactions

## Main Critiques From This Phase

- the graph was carrying too much product identity
- expand was visually interesting but under-explained
- supportability was underbuilt
- operational risk existed beyond the UI

## Documents Produced In This Phase

- [OPEN_SOURCE_DATA_STRATEGY.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/docs/OPEN_SOURCE_DATA_STRATEGY.md)

## Hand-off To Next Phase

The next loop needed to make review reproducible instead of relying on ad hoc inspection.
