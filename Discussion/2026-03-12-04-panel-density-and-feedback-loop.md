# 2026-03-12 Panel Density And Feedback Loop

## Phase Goal

Reduce panel density in the remaining left and right surfaces and add the first user-visible recommendation feedback loop.

## Problems Identified

- `Gap`, `Ask`, and `Report` still opened with too much undifferentiated information
- the user had to parse detail before seeing the best next action
- suggested next papers had no feedback mechanism, so recommendations could not adapt even at the browser level
- the product still behaved more like an analysis console than a guided research workspace

## Changes Made

### Gap panel cleanup

- added a `Start Here` card for the strongest gap
- added an alternate frontier-paper entry point
- reduced default visible gaps and moved the rest behind a `Show more` toggle

### Ask panel cleanup

- clarified that the assistant is for synthesis, reading order, and gap explanation
- added persistent quick prompts above the message list
- changed the empty-state language from generic chat framing to concrete research-question framing

### Report panel cleanup

- renamed the surface from `Academic Analysis` to `Research Report`
- added a preparation card showing papers, gaps, and report readiness
- clarified the expected outputs before generation: methods summary, results tables, references export
- shortened the main generation CTA to `Generate Report`

### Recommendation feedback loop

- added browser-local feedback capture for suggested next papers
- users can now mark a recommendation as `Relevant` or `Not now`
- this feedback is stored in local storage and fed back into ranking for the current browser

## Verification

- `cd frontend && npm run lint`
- `cd frontend && npx tsc --noEmit --incremental false`
- `cd frontend && npx playwright test -c playwright.config.ts`

Results:

- lint passed with no warnings
- TypeScript check passed
- Playwright fixture review passed
- live smoke tests remained skipped by default

## Remaining Critique

- recommendation feedback still lives only in the browser and is not yet tied to a user account or saved workspace
- `Edge Mode` and some graph-specific wording still leak into user-facing interaction
- `Gap` and `Report` are clearer now, but both still assume a relatively expert user

## Why This Phase Matters

This phase pushed the product farther from “toolbox full of controls” and closer to “workspace that suggests the next meaningful action”.
