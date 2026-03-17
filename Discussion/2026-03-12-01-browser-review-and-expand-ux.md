# 2026-03-12 Browser Review And Expand UX

## Phase Goal

Drive the local app in a real browser, capture actual expand flows, and cut the most obvious UX clutter.

## What Happened

The local app was opened and driven through the Playwright CLI browser-control path.

Captured states included:

- pre-expand fixture workspace
- post-expand workspace
- detail drawer after expand

## Main Findings From Browser Review

Too many layers competed for attention at once:

- legend
- review dock
- right drawer
- bottom gap notice
- bottom status strip
- graph controls

The graph itself was not the first thing a user saw.

## UX Changes Made

### Expand visibility

- primary research actions were moved above the fold in the paper drawer
- `Expand Preview` was added before the action
- `Expand Result` summary was added after the action

### Clutter reduction

- legend now starts collapsed
- gap notice moved from bottom toast to top status row
- review dock conflict was resolved for narrow view

### Decision support

- provenance breadcrumbs were added
- suggested next papers were added
- expand moved closer to an explicit research action instead of a hidden gesture

## Why This Phase Mattered

This phase changed the project from:

- “looks interesting in code”

to:

- “looks clearer or noisier in a real browser”

That shifted priorities toward actual user perception.

## Artifacts

- `output/playwright/*.png`

## Hand-off To Next Phase

After expand became more legible, the next blocking question was deployment readiness and system trust.
