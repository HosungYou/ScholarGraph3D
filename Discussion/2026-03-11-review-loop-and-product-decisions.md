# 2026-03-11 Review Loop And Product Decisions

> Note
> This file is a legacy consolidated summary spanning work completed on March 11-12, 2026.
> For the canonical time-ordered record, start with [README.md](/Volumes/External%20SSD/Projects/Research/ScholarGraph3D/Discussion/README.md) and then read the dated timeline files in order.

## Context

The project was reviewed as both a literature exploration tool and a research insight extraction tool. The goal is not strict commercialization first. The goal is a product that people would realistically keep using, potentially pay for, and that can also be operated as open source.

The review focused on:

- code quality and operational risk
- product structure and usability
- graph expansion experience
- supportability and documentation
- automation for repeated visual and UX review

## Decisions

### 1. Product Direction

ScholarGraph3D should be positioned as:

- an academic discovery tool
- a research insight extraction tool

It should not be positioned as "a 3D graph demo" first.

The graph remains important, but it is an advanced discovery surface inside the broader workflow.

### 2. Information Architecture

The proposed product structure is:

- Discover
- Evaluate
- Extract
- Synthesize
- Library

This replaces a graph-centric mental model with a researcher-centric workflow.

### 3. Feature Prioritization

Keep and strengthen:

- paper search
- seed graph exploration
- expand actions
- save to collection
- compare and screening workflows
- structured extraction
- research report generation
- alerts and recommendations

Reduce or hide by default:

- controls that are visually impressive but not actionable
- HUD-first wording that obscures task meaning
- low-value graph toggles in the primary workflow

### 4. Data Strategy

The system should move toward an open-source-friendly multi-provider model.

Preferred base stack:

- OpenAlex for works, references, related works, and broad discovery
- Crossref for DOI normalization and metadata enrichment
- OpenCitations for citation graph support
- local embeddings and ranking logic for semantic retrieval and recommendations

Semantic Scholar should be treated as an optional enrichment provider, not a hard dependency.

### 5. Review And Verification Strategy

Visual review must be reproducible without depending only on ad hoc manual browsing.

Implemented direction:

- deterministic fixture review mode
- `/review` entry page
- Playwright screenshot and flow verification
- live review fixture generator for freezing real-paper exploration states

This establishes a loop:

1. choose a real paper or fixture
2. run the review flow
3. capture screenshots and behavior
4. inspect from a user perspective
5. revise the product
6. rerun automation

### 6. Supportability

Supportability is part of product quality. Review documentation, decision logging, and reproducible test fixtures are required, not optional.

## Concrete Changes Already Made

- added review fixture mode in `frontend/app/explore/seed/page.tsx`
- added review fixture definitions in `frontend/lib/review-fixtures.ts`
- added review entry page in `frontend/app/review/page.tsx`
- added Playwright review automation in `frontend/e2e/review-mode.spec.ts`
- added live fixture generator in `frontend/scripts/generate-live-review-fixture.mjs`
- added loop wrapper entry in `frontend/scripts/run-review-loop.sh`
- added in-process fixture generator in `backend/scripts/generate_review_fixture.py`
- moved paper drawer toward explicit research actions in `frontend/components/graph/PaperDetailPanel.tsx`
- refactored graph controls into a labeled dock in `frontend/components/graph/GraphControls.tsx`
- turned the bottom status bar into a current-view strip in `frontend/app/explore/seed/page.tsx`
- switched the right drawer to compact overlay mode on narrower viewports in `frontend/app/explore/seed/page.tsx`
- added provenance breadcrumbs near the selected paper title in `frontend/components/graph/PaperDetailPanel.tsx`
- added narrow viewport Playwright review coverage in `frontend/playwright.config.ts`
- moved transient gap/action notices out of the graph canvas and into the top status area
- reduced frontend lint debt to zero warnings
- verified fixture review flow on both desktop and narrow viewport Playwright projects
- added an in-workspace recommendation surface to the paper drawer
- added `docs/REVIEW_AUTOMATION_LOOP.md`
- added `docs/OPEN_SOURCE_DATA_STRATEGY.md`
- added non-interactive lint configuration in `frontend/.eslintrc.json`
- installed official Codex browser-control skills: `playwright`, `playwright-interactive`
- verified the Playwright CLI wrapper entrypoint with `~/.codex/skills/playwright/scripts/playwright_cli.sh --help`
- drove the local `/review` and `/explore/seed?fixture=transformer-review` flows with the Playwright CLI browser session
- saved browser-review screenshots in `output/playwright/` for before/after expand and detail-panel comparison
- changed the legend to start collapsed so graph review begins with the workspace, not the explainer overlay
- moved the gap-discovery notice from a bottom toast to the top inline status row to stop it from covering the graph/status area
- moved primary paper actions above the fold in the detail drawer so expand and second-seed actions are visible without scrolling
- added an `Expand Preview` card in the paper drawer so the user can understand what expand does before triggering it
- added an `Expand Result` summary chip in the top status row so the user can see the delta after expansion
- changed frontend auto-save to update existing saved graphs instead of creating duplicates on every save cycle
- changed `/health` to return `200 degraded` in memory-only mode instead of `503` when the DB is unavailable
- wired app-level rate limiting into paper search, seed explore, seed chat, gap report, academic report, and network overview endpoints
- restored backend pytest execution by repairing the broken workspace path expected by the existing virtualenv shebangs
- reduced 3D overlay churn by skipping periodic hull/gap rebuild loops in semantic layout
- added automatic 3D remount recovery after render-boundary failures
- collapsed low-frequency graph controls behind an `Advanced View` section so the default UI emphasizes exploration, not tuning
- replaced the primary `Fullscreen` control with `Center Selected`, and moved fullscreen into advanced controls
- reduced the bottom status strip from multiple on/off toggles to a more compact `View` summary
- renamed sidebar labels toward workflow language (`MAP`, `ASK`, `REPORT`)
- added a skipped-by-default `live smoke` Playwright path for real-paper verification with `PLAYWRIGHT_LIVE_PAPER_ID`

## Criticism

### 1. The product still behaves too much like a strong demo.

The visual identity is distinct, but task completion still trails behind presentation in important places.

### 2. Expand is still under-explained.

Users need preview, history, undo, and a clearer sense of what expansion will do before they trigger it.

### 3. The review loop exists, but it is not complete until it is exercised on live papers.

Mock fixtures are useful, but not sufficient.

### 4. Recommendation and freshness are still strategy-level ideas, not yet productized behavior.

The product needs user feedback signals, update awareness, and practical ranking logic.

### 5. Review automation still has an execution-environment dependency.

The review loop is structurally in place, but local port-binding behavior can differ in sandboxed runtimes. That must be treated as tooling friction, not as product proof.

### 6. Live fixture generation also depends on outbound data access.

The in-process backend path removes the local port requirement, but it still depends on external paper providers being reachable.

### 7. Narrow viewport review exposed a genuine interaction conflict.

When the compact drawer became an overlay, the review dock was temporarily blocked. Raising the review dock solved that test failure and confirmed the value of narrow-viewport automation.

### 8. The product is moving from “demo controls” to “task controls”.

The most recent changes intentionally prioritize:

- visible graph state
- explicit expand and second-seed actions
- provenance context
- reduced canvas clutter

This is the right direction for actual researcher use.

### 9. External provider failures must be separated from product failures.

Current live-fixture blocking is caused by execution-environment network restrictions, not by the intended frontend interaction model.
In a normal local runtime, the product should still operate through the standard:

- frontend query input
- backend request handling
- external provider fetch

### 10. Browser-control capability is now split into two usable paths.

- `playwright` is ready now for terminal-driven browser control through the CLI wrapper
- `playwright-interactive` is installed too, but still requires `js_repl` enabled in a fresh Codex session

### 11. Real browser review changed the prioritization of UI cleanup.

The browser captures exposed a concrete clutter problem:

- legend overlay
- bottom gap toast
- bottom status strip
- review dock
- right detail drawer

These layers were all competing with the actual graph and with the meaning of expand.
The cleanup work therefore prioritized reducing simultaneous overlays before adding more controls.

### 12. Expand now needs a before/after explanation model.

The next loop implemented the first version of that model:

- before: drawer-level preview describing what expand searches and what is already linked in the workspace
- after: top-row summary showing added papers and the resulting delta

This is still not a full predictive planner, but it is materially better than a plain `2 papers added` toast.

### 13. Deployment readiness now has fewer false negatives and fewer abuse gaps.

The latest loop addressed three concrete blockers:

- Render-style health checks should not fail just because persistence is unavailable
- high-cost public endpoints should not remain effectively unthrottled
- auto-save should update an existing graph instead of filling the dashboard with duplicates

This improves staging readiness, but it does not yet mean full production readiness.

### 14. Some frontend interactions were creating noise rather than helping decisions.

The latest pass treated these as usability debt:

- node-size and layout tuning were visible before the user needed them
- semantic layout was still paying a periodic overlay rebuild cost meant for moving layouts
- a transient 3D failure could leave the user with a dead visualization until manual intervention

The current direction is to keep primary exploration visible and push tuning controls behind intent-revealing affordances.

### 15. Verification should separate deterministic UX checks from live-provider checks.

The codebase now has two different browser-verification lanes:

- deterministic fixture review for stable UX iteration
- live smoke verification for a real paper when external APIs and backend are available

This avoids mixing flaky provider/network conditions into the main visual regression loop.

## Open Questions

- Which paper domains should become official review fixtures first: CS, biomed, or interdisciplinary?
- Should the default landing experience open in search-first mode or workspace-first mode?
- How far should the graph remain visible in Evaluate and Extract stages?
- What user signals should be stored first for recommendations: clicks, saves, expands, follows, or explicit relevance feedback?

## Next Executable Steps

1. Run the live fixture generator against a running backend and store at least one real-paper fixture.
2. Use that fixture to review the current expand flow and identify friction points.
3. Add a mobile review path and decide which actions remain pinned on very small screens.
4. Add a first-pass recommendation surface based on saved papers, recent expands, and recency.
5. Keep writing dated decision logs in this folder as the loop continues.
