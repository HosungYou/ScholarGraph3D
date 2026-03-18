# ScholarGraph3D MVP Simplification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip ScholarGraph3D to core workflow (Search → Seed → Explore with Gap Spotter → Save), removing all non-essential features, splitting god files, rewriting documentation, and adding CI/CD.

**Architecture:** Top-down removal — frontend first (components, store, types, API client), then backend (routers, services, gap detector simplification), then god file splitting, then documentation overhaul and CI/CD. Each phase ends with a verification step.

**Tech Stack:** Next.js 14 + TypeScript + Tailwind (frontend), FastAPI + Python 3.11 (backend), Zustand (state), react-force-graph-3d + Three.js 0.152.2 (3D), Supabase (auth/DB)

**Spec:** `docs/superpowers/specs/2026-03-17-mvp-simplification-design.md`

**Base directory:** `/Volumes/External SSD/Projects/Research/ScholarGraph3D`

---

### Task 1: Frontend — Delete Component Files and Pages

**Files:**
- Delete: `frontend/components/graph/SeedChatPanel.tsx`
- Delete: `frontend/components/graph/AcademicAnalysisPanel.tsx`
- Delete: `frontend/components/graph/GapReportView.tsx`
- Delete: `frontend/components/dashboard/SavedBookmarks.tsx`
- Delete: `frontend/app/review/` (entire directory)
- Delete: `frontend/lib/review-fixtures.ts`
- Delete: `frontend/e2e/review-mode.spec.ts`
- Delete: `frontend/scripts/generate-live-review-fixture.mjs`
- Delete: `frontend/scripts/run-review-loop.mjs`
- Delete: `frontend/scripts/run-review-loop.sh`

- [ ] **Step 1: Delete component files**

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D"
rm frontend/components/graph/SeedChatPanel.tsx
rm frontend/components/graph/AcademicAnalysisPanel.tsx
rm frontend/components/graph/GapReportView.tsx
rm frontend/components/dashboard/SavedBookmarks.tsx
```

- [ ] **Step 2: Delete review page, fixtures, and scripts**

```bash
rm -rf frontend/app/review
rm frontend/lib/review-fixtures.ts
rm frontend/e2e/review-mode.spec.ts
rm frontend/scripts/generate-live-review-fixture.mjs
rm frontend/scripts/run-review-loop.mjs
rm frontend/scripts/run-review-loop.sh
```

- [ ] **Step 3: Commit**

```bash
git add -A frontend/components/graph/SeedChatPanel.tsx \
  frontend/components/graph/AcademicAnalysisPanel.tsx \
  frontend/components/graph/GapReportView.tsx \
  frontend/components/dashboard/SavedBookmarks.tsx \
  frontend/app/review \
  frontend/lib/review-fixtures.ts \
  frontend/e2e/review-mode.spec.ts \
  frontend/scripts/
git commit -m "chore: delete non-core frontend components and review system"
```

---

### Task 2: Frontend — Clean Types (`types/index.ts`)

**Files:**
- Modify: `frontend/types/index.ts`

Reference line numbers (from current file):
- `Paper.pagerank`: line 35, `Paper.betweenness`: line 36
- `GapScoreBreakdown`: lines 119-130 (rewrite to 3-dim)
- `EvidenceDetail`: lines 132-155 (simplify)
- `GapActionability`: lines 164-174 (delete)
- `StructuralGap.intent_summary`: line 188, `.actionability`: line 190 (remove fields)
- `GapReportSection`: lines 200-204 (delete)
- `GapReportQuestion`: lines 206-210 (delete)
- `GapReport`: lines 212-226 (delete)
- `NetworkLevelMetrics`: lines 230-240 (delete)
- `NodeCentrality`: lines 242-253 (delete)
- `CommunityMetrics`: lines 255-263 (delete)
- `StructuralHolesNode`: lines 265-272 (delete)
- `NetworkMetrics`: lines 274-281 (delete)
- `AcademicReportTable`: lines 283-288 (delete)
- `AcademicReport`: lines 290-313 (delete)
- `NetworkOverview`: lines 315-321 (delete)
- `Bookmark`: lines 336-348 (delete)
- `RecommendationFeedback`: lines 350-357 (delete)
- `ChatAction`: lines 361-370 (delete)

- [ ] **Step 1: Remove `pagerank` and `betweenness` from Paper type**

Remove lines 35-36 from `Paper` interface.

- [ ] **Step 2: Rewrite `GapScoreBreakdown` to 3-dim**

Replace the current 10+ field interface (lines 119-130) with:

```typescript
export interface GapScoreBreakdown {
  structural: number;
  relatedness: number;
  temporal: number;
  composite: number;
}
```

- [ ] **Step 3: Simplify `EvidenceDetail`**

Replace lines 132-155 with only the kept fields:

```typescript
export interface EvidenceDetail {
  actual_edges: number;
  max_possible_edges: number;
  centroid_similarity: number;
  total_year_span: number;
}
```

- [ ] **Step 4: Delete `GapActionability` type**

Delete lines 164-174.

- [ ] **Step 5: Remove `intent_summary` and `actionability` from `StructuralGap`**

Remove lines 188 and 190 from `StructuralGap` interface.

- [ ] **Step 6: Update Cluster.centroid comment**

In the `Cluster` interface, change `centroid` comment from `// PageRank-weighted centroid` to `// Arithmetic mean centroid`.

- [ ] **Step 7: Delete Gap Report, Academic, Network, Bookmark, Feedback, Chat types**

Delete these type blocks entirely:
- `GapReportSection` (lines 200-204)
- `GapReportQuestion` (lines 206-210)
- `GapReport` (lines 212-226)
- `NetworkLevelMetrics` (lines 230-240)
- `NodeCentrality` (lines 242-253)
- `CommunityMetrics` (lines 255-263)
- `StructuralHolesNode` (lines 265-272)
- `NetworkMetrics` (lines 274-281)
- `AcademicReportTable` (lines 283-288)
- `AcademicReport` (lines 290-313)
- `NetworkOverview` (lines 315-321)
- `Bookmark` (lines 336-348)
- `RecommendationFeedback` (lines 350-357)
- `ChatAction` (lines 361-370)

- [ ] **Step 8: Commit**

```bash
git add frontend/types/index.ts
git commit -m "chore: simplify types to MVP — remove gap report, academic, SNA, bookmark, chat types"
```

---

### Task 3: Frontend — Clean Zustand Store and API Client

**Files:**
- Modify: `frontend/hooks/useGraphStore.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Clean useGraphStore.ts**

Remove these state slices (interface fields + initial values + setters):
- `activeGapReport` (lines 49, 170), `gapReportLoading` (lines 50, 171)
- `academicReport` (lines 55, 176), `academicReportLoading` (lines 56, 177), `networkOverview` (lines 57, 178)
- `nodeSizeMode` (lines 95, 206), `layoutMode` (lines 99, 209), `edgeVisMode` (lines 91, 203)
- `secondSeedIds` (lines 104, 212), `addSeedMerging` (lines 103, 214), `gapRefreshNeeded` (lines 105, 216)

Narrow `activeTab` type (line 23) from `'clusters' | 'gaps' | 'chat' | 'academic'` to `'clusters' | 'gaps'`.

- [ ] **Step 2: Clean api.ts**

Remove these methods:
- `sendSeedChat` (lines 306-314)
- `getBookmarks`, `getBookmarkForPaper`, `createBookmark`, `updateBookmark`, `deleteBookmark` (lines 317-375)
- `getRecommendationFeedback`, `upsertRecommendationFeedback`, `deleteRecommendationFeedback` (lines 378-406)
- `generateGapReport` (lines 409-421)
- `generateAcademicReport`, `getNetworkOverview` (lines 439-459)
- `addPaperAsSeed` (lines 158-201)

- [ ] **Step 3: Commit**

```bash
git add frontend/hooks/useGraphStore.ts frontend/lib/api.ts
git commit -m "chore: strip store and API client to MVP methods"
```

---

### Task 4: Frontend — Simplify Landing Page

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Remove shortlist/compare logic**

Remove from `page.tsx`:
- State: `shortlistedPaperIds`, `setShortlistedPaperIds` (line 127)
- Computed: `shortlistedPapers`, `mostCitedShortlist`, `mostRecentShortlist` (lines 138-150)
- Functions: `toggleShortlist` (lines 243-253), `getShortlistRole` (lines 255-259)
- Helper: `getSearchReasons` (lines 96-110), `getSeedFitLabel` (lines 112-117)
- In the search results JSX: the entire shortlist compare panel (`shortlistedPapers.length > 0` block, ~lines 572-647)
- In each result card: the "Add to shortlist" button and shortlist-related badges
- Keep: "Use as seed" button per result card

- [ ] **Step 2: Simplify result cards**

Each search result should show: title, authors, year, venue, citation count, abstract snippet, fields, and a single "Use as seed" button. Remove the seed-fit label, reason chips, and "Pick, compare, then seed" instruction text.

- [ ] **Step 3: Verify landing page compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

This will likely fail with import errors from deleted components. That's expected — we fix those in Task 5-6.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "chore: simplify landing page — remove shortlist/compare"
```

---

### Task 5: Frontend — Clean Explore Page

**Files:**
- Modify: `frontend/app/explore/seed/page.tsx`

- [ ] **Step 1: Remove deleted component imports**

Remove imports for:
- `SeedChatPanel`
- `AcademicAnalysisPanel`
- `GapReportView`
- `getReviewFixture`, `loadGeneratedReviewFixture`, `ReviewFixture` from `lib/review-fixtures`

- [ ] **Step 2: Remove chat and academic tabs from sidebar**

In the sidebar tab rendering, remove the `chat` and `academic` tab buttons and their corresponding panel renders. Only `clusters` and `gaps` tabs should remain.

- [ ] **Step 3: Remove gap report view logic**

Remove any conditional rendering of `GapReportView` and related state (`activeGapReport`, `gapReportLoading` references).

- [ ] **Step 4: Remove multi-seed merge UI**

Remove any "ADD AS SECOND SEED" related logic, `secondSeedIds` references, `addSeedMerging` loading state, and `gapRefreshNeeded` banner.

- [ ] **Step 5: Remove review fixture logic**

Remove any `ReviewFixture`-related state, conditional loading, and fixture-mode rendering.

- [ ] **Step 6: Remove store references to deleted slices**

Replace any usage of `nodeSizeMode`, `layoutMode`, `edgeVisMode`, `secondSeedIds`, `addSeedMerging`, `gapRefreshNeeded` from store destructuring.

- [ ] **Step 7: Ensure saved graph loading handles old gap data gracefully**

When loading a saved graph, the old data may contain 6-dim `gap_score_breakdown` and extra `StructuralGap` fields (`intent_summary`, `actionability`). TypeScript will ignore extra fields on read, but verify that the graph load path does not crash on old data. If gaps are loaded from saved data, they should be displayed as-is (with missing fields defaulting to undefined) — gap detection re-runs on fresh explores anyway.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/explore/seed/page.tsx
git commit -m "chore: strip explore page to clusters + gaps tabs only"
```

---

### Task 6: Frontend — Clean Graph Components

**Files:**
- Modify: `frontend/components/graph/ScholarGraph3D.tsx`
- Modify: `frontend/components/graph/GraphControls.tsx`
- Modify: `frontend/components/graph/GraphLegend.tsx`
- Modify: `frontend/components/graph/PaperDetailPanel.tsx`
- Modify: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Clean ScholarGraph3D.tsx**

Remove:
- `edgeVisMode` rendering branches — keep only the default (similarity/citation context) mode
- `nodeSizeMode` branches — keep only citations-based sizing
- `layoutMode` toggle logic — keep only semantic mode (`fx/fy/fz` pinned)
- Second-seed teal ring rendering (`secondSeedIds`, `0x00E5FF` ring)
- Any references to deleted store slices

- [ ] **Step 2: Clean GraphControls.tsx**

Remove:
- `nodeSizeMode` dropdown (lines 145-161)
- `layoutMode` dropdown (lines 170-193)
- Any `edgeVisMode` controls

- [ ] **Step 3: Clean GraphLegend.tsx**

Remove:
- Edge vis mode dropdown (lines 111-136)
- Mode-responsive legend sections for temporal and crossCluster modes (lines 178-214)
- Keep only the default similarity/citation legend

- [ ] **Step 4: Clean PaperDetailPanel.tsx**

Remove:
- "ADD AS SECOND SEED" button and its handler
- All bookmark logic: state, fetch, editor UI, bookmark toggle button
- References to deleted store slices

- [ ] **Step 5: Clean Dashboard page**

In `frontend/app/dashboard/page.tsx`:
- Remove `SavedBookmarks` import and rendering
- Keep only `SavedGraphs` section

- [ ] **Step 6: Commit**

```bash
git add frontend/components/graph/ScholarGraph3D.tsx \
  frontend/components/graph/GraphControls.tsx \
  frontend/components/graph/GraphLegend.tsx \
  frontend/components/graph/PaperDetailPanel.tsx \
  frontend/app/dashboard/page.tsx
git commit -m "chore: strip graph components to single-mode MVP"
```

---

### Task 7: Frontend — Verify

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

Run: `cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend" && npx tsc --noEmit`

Expected: 0 errors. If errors, fix import references and type mismatches before proceeding.

- [ ] **Step 2: Lint check**

Run: `cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend" && npm run lint`

Expected: 0 warnings/errors.

- [ ] **Step 3: Build check**

Run: `cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend" && npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Fix any issues and commit**

If any issues found, fix them and commit:

```bash
git add -A frontend/
git commit -m "fix: resolve frontend build errors from MVP cleanup"
```

---

### Task 8: Backend — Delete Routers, Services, and LLM Layer

**Files:**
- Delete: `backend/routers/seed_chat.py`
- Delete: `backend/routers/gap_report.py`
- Delete: `backend/routers/academic_report.py`
- Delete: `backend/routers/recommendation_feedback.py`
- Delete: `backend/routers/bookmarks.py`
- Delete: `backend/llm/base.py`
- Delete: `backend/llm/groq_provider.py`
- Delete: `backend/llm/__init__.py`
- Delete: `backend/services/gap_report_service.py`
- Delete: `backend/services/academic_report_service.py`
- Delete: `backend/graph/network_metrics.py`
- Delete: `backend/database/007_recommendation_feedback.sql`
- Delete: `backend/scripts/backfill_bookmark_metadata.py`
- Delete: `backend/scripts/generate_review_fixture.py`

- [ ] **Step 1: Delete router files**

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D"
rm backend/routers/seed_chat.py
rm backend/routers/gap_report.py
rm backend/routers/academic_report.py
rm backend/routers/recommendation_feedback.py
rm backend/routers/bookmarks.py
```

- [ ] **Step 2: Delete LLM layer**

```bash
rm backend/llm/base.py backend/llm/groq_provider.py backend/llm/__init__.py
rmdir backend/llm
```

- [ ] **Step 3: Delete services and modules**

```bash
rm backend/services/gap_report_service.py
rm backend/services/academic_report_service.py
rm backend/graph/network_metrics.py
```

- [ ] **Step 4: Delete scripts and migration**

```bash
rm backend/database/007_recommendation_feedback.sql
rm backend/scripts/backfill_bookmark_metadata.py
rm backend/scripts/generate_review_fixture.py
```

- [ ] **Step 5: Commit**

```bash
git add -A backend/routers/seed_chat.py backend/routers/gap_report.py \
  backend/routers/academic_report.py backend/routers/recommendation_feedback.py \
  backend/routers/bookmarks.py backend/llm backend/services/gap_report_service.py \
  backend/services/academic_report_service.py backend/graph/network_metrics.py \
  backend/database/007_recommendation_feedback.sql backend/scripts/
git commit -m "chore: delete non-core backend routers, LLM layer, services"
```

---

### Task 9: Backend — Simplify Gap Detector

**Files:**
- Modify: `backend/graph/gap_detector.py`

Current file: 1,220 lines with 9-dimension scoring. Target: ~400 lines with 3-dimension scoring.

- [ ] **Step 1: Remove scoring methods**

Delete all 6 non-core scoring methods:
- `_compute_intent_score()` (starts at line 739)
- `_compute_directional_score()` (starts at line 788)
- `_compute_structural_holes_score()` (starts at line 824, contains `import networkx` at line 840)
- `_compute_influence_score()` (starts at line 891)
- `_compute_author_overlap_score()` (starts at line 951)
- `_compute_venue_diversity_score()` (starts at line 999)

Note: The current code has 9 scoring dimensions (not 6 as the spec originally described). All 6 non-core methods are being removed; 3 core methods remain.

- [ ] **Step 2: Update weight constants and composite calculation**

Find the weight constants block (around lines 198-206) and replace with:

```python
# 3-dimension gap scoring weights
WEIGHT_STRUCTURAL = 0.40
WEIGHT_RELATEDNESS = 0.35
WEIGHT_TEMPORAL = 0.25
```

Update the composite score calculation to use only these three:

```python
composite = (
    WEIGHT_STRUCTURAL * structural_score
    + WEIGHT_RELATEDNESS * relatedness_score
    + WEIGHT_TEMPORAL * temporal_score
)
```

- [ ] **Step 3: Simplify evidence_detail dict**

In the evidence_detail construction (around lines 255-278), keep only:
- `actual_edges`
- `max_possible_edges`
- `centroid_similarity`
- `total_year_span`

Remove: `methodology_ratio`, `background_ratio`, `citations_a_to_b`, `citations_b_to_a`, and any other intent/directional fields.

- [ ] **Step 4: Clean up gap_score_breakdown dict**

Ensure `gap_score_breakdown` returned per gap contains only:
- `structural`
- `relatedness`
- `temporal`
- `composite`

Remove `intent`, `directional`, `structural_holes`, `influence`, `author_silo`, `venue_diversity`.

- [ ] **Step 5: Remove `intent_summary` and `actionability` from gap output**

Remove these fields from the gap dict construction. They depend on removed scoring dimensions.

- [ ] **Step 6: Verify `_generate_grounded_questions()` has no LLM dependency**

Read through the method (starts at line 388) and confirm it's purely heuristic. It should stay.

- [ ] **Step 7: Clean unused imports**

Remove any imports that were only used by deleted methods (especially check for `networkx` local import).

- [ ] **Step 8: Commit**

```bash
git add backend/graph/gap_detector.py
git commit -m "chore: simplify gap detector to 3-dim scoring (structural + relatedness + temporal)"
```

---

### Task 10: Backend — Simplify seed_explore.py and papers.py

**Files:**
- Modify: `backend/routers/seed_explore.py`
- Modify: `backend/routers/papers.py`
- Modify: `backend/services/citation_intent.py`

- [ ] **Step 1: Remove SNA metrics from seed_explore.py**

- Remove `from graph.network_metrics import compute_node_lightweight` import (line 24)
- Remove `compute_node_lightweight` call (around line 525)
- Remove any `compute_all` references

- [ ] **Step 2: Replace PageRank-weighted centroid with arithmetic mean**

Find the centroid calculation (around lines 600-612). Replace the PageRank-weighted mean with a simple arithmetic mean:

```python
# Arithmetic mean centroid
if cluster_nodes:
    centroid = {
        "x": sum(n["x"] for n in cluster_nodes) / len(cluster_nodes),
        "y": sum(n["y"] for n in cluster_nodes) / len(cluster_nodes),
        "z": sum(n["z"] for n in cluster_nodes) / len(cluster_nodes),
    }
```

- [ ] **Step 3: Remove enhanced intents code path from papers.py**

In `routers/papers.py`, remove the `enhanced` code path (around lines 586-595) that does:
```python
from llm.groq_provider import GroqProvider
intents = await svc.enhance_intents_with_llm(intents, groq)
```

Keep only the basic intents path.

- [ ] **Step 4: Remove sequential intent fetch from seed_explore.py**

Check for any sequential intent fetching logic in `seed_explore.py` that was used specifically for Gap Report enrichment (around lines 486-489). If present, remove the sequential loop. Keep the basic intent fetch if it serves the core flow.

- [ ] **Step 5: Remove `enhance_intents_with_llm()` from citation_intent.py**

In `services/citation_intent.py`, delete the `enhance_intents_with_llm()` method (starts at line 119). Keep `get_basic_intents()` and `get_intents_for_graph()`.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/seed_explore.py backend/routers/papers.py backend/services/citation_intent.py
git commit -m "chore: remove SNA metrics, PageRank centroid, and LLM intents"
```

---

### Task 11: Backend — Clean main.py and requirements.txt

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Clean main.py router imports**

Remove these imports:
- `from routers.seed_chat import router as seed_chat_router` (line 25)
- `from routers.gap_report import router as gap_report_router` (line 26)
- `from routers.academic_report import router as academic_report_router` (line 27)
- `from routers.recommendation_feedback import router as recommendation_feedback_router` (line 28)

Remove `from routers import papers, graphs, bookmarks` → change to `from routers import papers, graphs`

- [ ] **Step 2: Clean main.py router includes**

Remove these `include_router` calls:
- `app.include_router(seed_chat_router, ...)`
- `app.include_router(bookmarks.router, ...)`
- `app.include_router(recommendation_feedback_router, ...)`
- `app.include_router(gap_report_router, ...)`
- `app.include_router(academic_report_router, ...)`

- [ ] **Step 3: Update version to 4.0.0**

Change `version="3.7.0"` to `version="4.0.0"` (line 109).
Change health endpoint version from `"3.7.0"` to `"4.0.0"` (line 175).

- [ ] **Step 4: Clean requirements.txt**

Remove these lines:
- `networkx>=3.2.0` (line 30)
- `groq>=0.4.0` (line 36)
- `openai>=1.0.0` (line 37)

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/requirements.txt
git commit -m "chore: clean main.py routes and remove unused dependencies"
```

---

### Task 12: Backend — Verify

**Files:** None (verification only)

- [ ] **Step 1: Delete orphaned test files FIRST**

These test files import deleted modules and will cause import errors if not removed:

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D"
rm -f backend/tests/test_graph/test_network_metrics.py
rm -f backend/tests/test_routers/test_academic_report.py
rm -f backend/tests/test_routers/test_bookmarks.py
rm -f backend/tests/test_routers/test_recommendation_feedback.py
rm -f backend/tests/test_services/test_academic_report.py
```

Also search for any others:

```bash
grep -rl "seed_chat\|gap_report\|academic_report\|recommendation_feedback\|bookmarks\|network_metrics" backend/tests/ 2>/dev/null
```

Delete any additional test files that solely test removed features.

- [ ] **Step 2: Check for broken imports**

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/backend" && python -c "from main import app; print('OK')"
```

Expected: Prints "OK" with no import errors.

- [ ] **Step 3: Run tests**

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/backend" && ./venv/bin/pytest -v 2>&1 | tail -30
```

Expected: Tests for kept features (paper_search, graphs, main_health) pass.

- [ ] **Step 4: Commit**

```bash
git add -A backend/tests/
git commit -m "chore: remove orphaned tests for deleted features"
```

---

### Task 13: Split ScholarGraph3D.tsx into 4 Files

**Files:**
- Modify: `frontend/components/graph/ScholarGraph3D.tsx`
- Create: `frontend/components/graph/useGraphInteractions.ts`
- Create: `frontend/components/graph/useGraphRenderer.ts`
- Create: `frontend/components/graph/graphEffects.ts`

After Tasks 1-7, ScholarGraph3D.tsx should be ~1,800 lines. Split into focused modules.

- [ ] **Step 1: Read the cleaned ScholarGraph3D.tsx**

Read the file to identify natural boundaries:
- **Interactions**: Click handlers, hover handlers, expand handlers, camera focus logic
- **Renderer**: `nodeThreeObject` factory, `linkThreeObject` factory, custom Three.js object creation
- **Effects**: useEffect hooks for data changes, cleanup, animation setup
- **Main**: ForceGraph3D component usage, props, refs, top-level JSX

- [ ] **Step 2: Extract `useGraphInteractions.ts`**

Create a custom hook that encapsulates:
- `handleNodeClick`, `handleNodeHover`
- `handleNodeExpand` (double-click expand)
- Camera focus/animation logic (`panelSelectionId` → camera move)
- Return all handlers as a typed object

- [ ] **Step 3: Extract `useGraphRenderer.ts`**

Create a custom hook that encapsulates:
- `nodeThreeObject` callback factory
- `linkThreeObject` callback factory
- Star node creation logic (delegates to `cosmic/starNodeRenderer`)
- Edge particle/line creation
- Return the callback functions

- [ ] **Step 4: Extract `graphEffects.ts`**

Create a module with effect-setup functions:
- Scene update logic when `graphData` changes
- Nebula cluster creation/cleanup
- Frontier ring updates
- Selection ring updates
- Cleanup/disposal orchestration

- [ ] **Step 5: Update ScholarGraph3D.tsx to use extracted modules**

The main component should import and use the three extracted modules:

```typescript
import { useGraphInteractions } from './useGraphInteractions';
import { useGraphRenderer } from './useGraphRenderer';
import { setupGraphEffects } from './graphEffects';
```

- [ ] **Step 6: Verify**

Run: `cd frontend && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/graph/ScholarGraph3D.tsx \
  frontend/components/graph/useGraphInteractions.ts \
  frontend/components/graph/useGraphRenderer.ts \
  frontend/components/graph/graphEffects.ts
git commit -m "refactor: split ScholarGraph3D.tsx into 4 focused modules"
```

---

### Task 14: Split Explore Page into 2 Files

**Files:**
- Modify: `frontend/app/explore/seed/page.tsx`
- Create: `frontend/app/explore/seed/ExploreSidebar.tsx`

After Tasks 1-7, the page should be ~700 lines.

- [ ] **Step 1: Read the cleaned explore page**

Identify the sidebar section: tab buttons (clusters, gaps), panel rendering, resize handle logic.

- [ ] **Step 2: Extract `ExploreSidebar.tsx`**

Create a component that receives:
- `activeTab` and `setActiveTab`
- Graph data (clusters, gaps) from store
- Paper selection callbacks

Renders:
- Tab buttons (clusters, gaps)
- `ClusterPanel` or `GapSpotterPanel` based on active tab
- Sidebar collapse/expand toggle

- [ ] **Step 3: Update page.tsx to use ExploreSidebar**

Replace the inline sidebar JSX with `<ExploreSidebar />`.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run build`

Expected: 0 errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/explore/seed/page.tsx frontend/app/explore/seed/ExploreSidebar.tsx
git commit -m "refactor: extract ExploreSidebar from explore page"
```

---

### Task 15: Frontend — Final Verification

- [ ] **Step 1: Full verification suite**

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend"
npx tsc --noEmit && npm run lint && npm run build
```

Expected: All three pass with 0 errors.

- [ ] **Step 2: Run remaining frontend tests**

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D/frontend" && npx jest 2>&1 | tail -20
```

Fix any failures from deleted imports/types.

- [ ] **Step 3: Commit fixes if needed**

```bash
git add -A frontend/
git commit -m "fix: resolve remaining frontend test and build issues"
```

---

### Task 16: Delete Documentation and Artifacts

**Files:**
- Delete: `Discussion/` (entire directory)
- Delete: `release-notes/` (entire directory)
- Delete: `docs/RELEASE_v*.md` (all 19 files)
- Delete: `docs/REVIEW_AUTOMATION_LOOP.md`
- Delete: `docs/SDD_TDD_PLAN.md`, `docs/SDD_v3.7.0.md`
- Delete: `docs/PRD_v4.0_Boolean_Search_and_Recommendations.md`
- Delete: `docs/ROADMAP_v4.0.md`
- Delete: `docs/DESIGN_THEME.md`
- Delete: `docs/TECH_PROOF.md`
- Delete: `.omc/` (entire directory)
- Delete: `output/` (entire directory)
- Delete: `docs/discussion/` (entire directory)

- [ ] **Step 1: Delete directories**

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D"
rm -rf Discussion/ release-notes/ .omc/ output/ docs/discussion/
```

- [ ] **Step 2: Delete individual docs**

```bash
rm docs/RELEASE_v*.md
rm docs/REVIEW_AUTOMATION_LOOP.md
rm docs/SDD_TDD_PLAN.md docs/SDD_v3.7.0.md
rm docs/PRD_v4.0_Boolean_Search_and_Recommendations.md
rm docs/ROADMAP_v4.0.md
rm docs/DESIGN_THEME.md
rm docs/TECH_PROOF.md
```

- [ ] **Step 3: Commit**

```bash
git add -A Discussion/ release-notes/ .omc/ output/ docs/
git commit -m "chore: delete 50+ obsolete documentation files and artifacts"
```

---

### Task 17: Rewrite Core Documentation

**Files:**
- Rewrite: `README.md`
- Rewrite: `CLAUDE.md`
- Rewrite: `AGENTS.md`
- Update: `docs/ARCHITECTURE.md`
- Update: `docs/SPEC.md`
- Update: `docs/PRD.md`

- [ ] **Step 1: Rewrite README.md**

Rewrite to reflect v4.0.0 MVP state:
- One-paragraph description of the core workflow
- Tech stack table (current, accurate)
- Quick start (backend + frontend)
- Core architecture diagram (Search → Seed Explore → SPECTER2 → UMAP → HDBSCAN/Leiden → 3D Graph)
- API endpoints (only the ones that still exist)
- License

No feature laundry list. No "How It Works" marketing section.

- [ ] **Step 2: Rewrite CLAUDE.md**

Full rewrite for v4.0.0:
- Header: `ScholarGraph3D v4.0.0`
- Current accurate project overview
- Current accurate tech stack
- Current accurate directory structure (backend + frontend)
- Current accurate API endpoints
- Cosmic theme conventions (keep — still accurate)
- Three.js safety rules (keep — still critical)
- Deployment checklist (keep — still needed)
- Zustand store (only kept slices)
- Remove all v3.x changelog entries

- [ ] **Step 3: Rewrite AGENTS.md**

Full rewrite matching current code:
- Current architecture flow (S2-only, no OpenAlex)
- Current data models (Paper, Edge, Cluster — no oa_id)
- Current API contracts (only existing endpoints)
- Current directory structure
- Remove all stale references

- [ ] **Step 4: Update ARCHITECTURE.md, SPEC.md, PRD.md**

Update each to reflect v4.0.0 MVP scope. Remove references to deleted features.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md AGENTS.md docs/ARCHITECTURE.md docs/SPEC.md docs/PRD.md
git commit -m "docs: rewrite all core documentation for v4.0.0 MVP"
```

---

### Task 18: Add CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create GitHub Actions workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: pytest -v

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run build
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions pipeline for backend tests and frontend build"
```

---

### Task 19: Version Tag and Final Commit

**Files:** None (git operations only)

- [ ] **Step 1: Verify everything**

```bash
cd "/Volumes/External SSD/Projects/Research/ScholarGraph3D"
cd frontend && npx tsc --noEmit && npm run lint && npm run build && cd ..
cd backend && ./venv/bin/pytest -v && cd ..
```

- [ ] **Step 2: Tag release**

```bash
git tag -a v4.0.0 -m "v4.0.0: MVP reset — Search, Seed, Explore, Gap Spotter, Save"
```

Do NOT push — let the user decide when to push.

- [ ] **Step 3: Final status report**

Report to user:
- Lines of code before vs after
- Number of files before vs after
- Number of docs before vs after
- All verification results
