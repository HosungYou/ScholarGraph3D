# ScholarGraph3D Review Automation Loop

This document defines a repeatable UX and visual review loop that can run from the CLI.

## Objective

Create a stable cycle:

1. review current UX with deterministic fixture data
2. change code
3. rerun the same user-facing flow
4. inspect screenshots and assertions
5. revise again

The loop is optimized for real product questions:

- can a user understand what to do?
- is expand discoverable?
- does the detail panel help decision-making?
- do gaps and academic panels feel useful or ornamental?

## Added Review Mode

The frontend now supports a deterministic review fixture:

- route: `/review`
- primary fixture route: `/explore/seed?fixture=transformer-review`

This mode:

- avoids live external APIs
- loads a fixed graph dataset
- exposes a small review dock for deterministic actions
- supports CLI/browser automation without relying on live citation latency

### Review dock actions

- `Seed Detail`
- `Expand Seed`
- `Gaps`
- `Academic`

These exist to make interaction review reproducible.

## Live Fixture Generation

To generate a review fixture from a live backend response:

```bash
cd frontend
npm run review:fixture -- \
  --api http://127.0.0.1:8000 \
  --paper-id 649def34f8be52c8b66281af98ae884c09aef38d \
  --slug transformer-live
```

This writes:

```text
frontend/public/review-fixtures/transformer-live.json
```

Then review it at:

```text
/explore/seed?fixture=transformer-live
```

This lets the team freeze a real paper exploration into a deterministic review artifact.

To generate a fixture without binding a local backend port, use the in-process backend path:

```bash
cd frontend
npm run review:fixture:direct -- \
  --paper-id 649def34f8be52c8b66281af98ae884c09aef38d \
  --slug transformer-direct
```

This calls the FastAPI app through the backend venv and writes the fixture directly into `frontend/public/review-fixtures/`.

## CLI Workflow

From `frontend/`:

```bash
npm run review:ui
```

To run a live backend smoke check with a real paper:

```bash
PLAYWRIGHT_LIVE_PAPER_ID=649def34f8be52c8b66281af98ae884c09aef38d \
npm run smoke:live
```

This keeps the deterministic fixture loop separate from the live-provider smoke path.

To run the full loop with a specific fixture:

```bash
npm run review:loop -- --fixture transformer-review
```

To generate a live fixture and immediately run the loop:

```bash
npm run review:loop -- \
  --api http://127.0.0.1:8000 \
  --paper-id 649def34f8be52c8b66281af98ae884c09aef38d \
  --slug transformer-live
```

This runs Playwright against the fixture route and captures screenshots into a run-scoped directory under `frontend/test-results/`.
The current Playwright config now reviews both:

- desktop review viewport
- narrow laptop viewport

### Sandbox note

In some restricted environments, nested wrapper execution can fail when Playwright tries to bind the local review port (`127.0.0.1:3100`).

If that happens:

1. run the direct Playwright command first
2. use the generated screenshot directory for inspection
3. treat the failure as an environment issue unless the same failure reproduces on a normal local shell

Artifacts include:

- initial graph state
- seed detail state
- post-expand state
- gap review state
- live seed smoke screenshot when `smoke:live` is used

## Expected Loop

### 1. Review

Run:

```bash
npm run review:ui
```

Or:

```bash
npm run review:loop -- --fixture transformer-review
```

Inspect:

- screenshots
- Playwright HTML report
- any failed assertions

### 2. Diagnose

Use the fixture route manually:

```text
/review
```

Check:

- panel widths
- visual hierarchy
- expand clarity
- gap usefulness
- academic panel density

### 3. Modify

Make targeted code changes.

Prefer changes that improve:

- clarity
- discoverability
- comparative usefulness
- screen efficiency

### 4. Verify

Rerun:

```bash
npm run review:ui
```

Confirm:

- the route still loads
- the key review actions still work
- no major regressions appeared in screenshots

### 5. Repeat

If the UI still feels clever rather than useful, cut complexity before adding more controls.

## Design Rule For This Project

The graph is not the product.
The graph is one workspace view inside a research workflow.

Every review should ask:

- does this help paper selection?
- does this help paper comparison?
- does this help evidence extraction?
- does this help next-step decision-making?

If the answer is no, the feature should be simplified, hidden behind advanced mode, or removed.

## Next Recommended Automation Additions

1. Add one narrow-laptop viewport review project.
2. Add one mobile fallback review flow once responsive work starts.
3. Add seeded fixtures for:
   - NLP
   - biomed
   - interdisciplinary bridge
4. Add screenshot diff baselines only after the layout is stabilized.
