# 2026-03-12 Usability Reduction And Live Smoke

## Phase Goal

Reduce unnecessary interaction density and separate deterministic review from live-provider verification.

## Problems Identified

- low-frequency controls were still too visible
- `Fullscreen` had higher prominence than researcher-critical actions
- bottom status information was over-specified
- some tab labels reflected internal surfaces more than user tasks
- deterministic review and live verification were not cleanly separated
- semantic layout was still paying update costs intended for moving layouts

## Changes Made

### Interaction reduction

- graph controls now default to a simpler view
- advanced tuning is grouped under `Advanced View`
- `Center Selected` replaced `Fullscreen` as the primary second action
- fullscreen moved under advanced controls
- bottom status strip compresses multiple toggles into one `View` summary

### Language cleanup

Sidebar labels were shifted toward more task-oriented wording:

- `CLUSTERS` -> `MAP`
- `CHAT` -> `ASK`
- `ACADEMIC` -> `REPORT`

### Stability work

- semantic layout skips periodic hull/gap rebuild loops
- 3D render boundary can now auto-remount the visualization

### Verification split

A new live smoke Playwright path was added for real-paper checks through:

- `PLAYWRIGHT_LIVE_PAPER_ID`
- `npm run smoke:live`

This path is intentionally separate from deterministic fixture review.

## Remaining Usability Critique

The product is still denser than a typical researcher-facing workspace.

Areas still worth reducing later:

- `Edge Mode` remains too abstract for many users
- `Gap / Ask / Report` panels still have more density than hierarchy
- bottom strip could shrink further on narrow screens

## Why This Phase Matters

This phase pushed the UI farther away from “control surface” and closer to “decision surface”.
