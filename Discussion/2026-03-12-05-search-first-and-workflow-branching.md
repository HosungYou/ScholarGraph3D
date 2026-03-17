# 2026-03-12 Search First And Workflow Branching

## Phase Goal

Move the product closer to a researcher-first workflow by improving seed selection, topic-search entry, post-seed branching, and purpose-based report entry.

## Problems Identified

- the landing page still behaved like a graph demo before behaving like a research tool
- topic search results were too thin to support confident seed selection
- the first step after entering a seed workspace was still graph-first instead of task-first
- report generation was still framed around export artifacts rather than user intent
- graph-first terms still dominated key labels in the primary flow

## Changes Made

### Landing and search

- default landing mode now starts with topic search instead of DOI lookup
- hero copy now frames the product as topic -> seed -> branch -> output
- topic search results now show richer seed cards with:
  - abstract snippet
  - venue
  - fields
  - heuristic seed-fit label
  - simple reason chips
- refined query text is surfaced when paper search rewrites the request

### Post-seed workflow branching

- the seed workspace now shows a `Choose Your Next Move` strip before a paper is selected
- users can branch directly into:
  - review seed
  - build reading list
  - generate topic brief
  - review gaps
- chat and report panels can now be driven by lightweight custom events from the main workspace

### Purpose-based reports

- the report panel now leads with output purpose:
  - `Topic Brief`
  - `Related Work`
  - `Gap Memo`
- report CTA text changes to match the chosen purpose
- the old export/tab structure remains, but it is now secondary to user intent

### Primary jargon reduction

- `MAP` became `DISCOVER`
- `REPORT` became `WRITE`
- `ORIGIN POINT` became `SEED WORKSPACE`
- `Graphs` became `Library`
- graph controls and legend now use more user-facing wording like `Workspace View`, `Visual Key`, `Citation Links`, `Related Papers`, and `Topic Regions`

## Verification

- `cd frontend && npm run lint`
- `cd frontend && npx tsc --noEmit --incremental false`
- `cd frontend && npx playwright test -c playwright.config.ts`

Results:

- lint passed with no warnings
- TypeScript check passed
- Playwright deterministic review passed
- live smoke remained opt-in and skipped by default

## Remaining Critique

- landing search still sends users straight into a seed workspace without a real compare/shortlist stage
- purpose-based report entry is improved, but the generated content is still backed by the same underlying report object
- graph terminology is reduced, not removed; advanced surfaces still expose network-analysis mental models

## Why This Phase Matters

This phase makes the product read less like “a beautiful graph engine” and more like “a research workspace that happens to use a graph”.
