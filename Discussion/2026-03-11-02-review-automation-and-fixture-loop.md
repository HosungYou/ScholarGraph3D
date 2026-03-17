# 2026-03-11 Review Automation And Fixture Loop

## Phase Goal

Create a repeatable visual and UX review system that could be run from CLI and used in subsequent loops.

## What Was Added

- deterministic review fixture mode
- `/review` entry route
- Playwright review spec
- Playwright config for desktop and narrow review
- live fixture generator
- in-process fixture generator
- review loop wrapper
- `Discussion` folder bootstrap

## Why This Phase Mattered

Before this phase, visual review existed mostly as opinion and memory.

After this phase, the project had:

- reproducible routes
- deterministic review actions
- screenshots
- automated regression checks
- a place to log decisions

## Key Decisions

### Deterministic fixture first

Mock graph fixtures were accepted as the first review substrate because they decoupled UX iteration from live API latency.

### Browser automation as a product tool

Playwright was not treated only as a test framework.
It became part of the product review loop itself.

### Documentation as infrastructure

Review workflow documentation was treated as part of engineering supportability, not as optional cleanup.

## Outputs

- [REVIEW_AUTOMATION_LOOP.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/docs/REVIEW_AUTOMATION_LOOP.md)
- [page.tsx](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/frontend/app/review/page.tsx)
- [review-mode.spec.ts](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/frontend/e2e/review-mode.spec.ts)
- [playwright.config.ts](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/frontend/playwright.config.ts)

## Hand-off To Next Phase

Once deterministic review was in place, the next question became:

- what does the real interface look like in a browser
- where exactly does expand break down for a user
