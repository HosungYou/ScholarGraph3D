# ScholarGraph3D v3.2.0 — Release Notes

**Release Date:** 2026-02-24
**Type:** Feature Release (Gap Spotter UX + Bookmarks + Chat Actions)

---

## Overview

v3.2.0 resolves all 7 UX issues identified in the 2026-02-24 Gap Spotter deep-dive, plus delivers the two deferred Phase 4 features from v3.1.0: **Paper Bookmarks (P10)** and **Chat Graph Actions (P13)**. The core theme: make gaps *visible*, selections *findable*, and chat *actionable*.

---

## Highlights

### Gap Visualization Enhancement (Issue 1)
Hovering a gap card now highlights the two relevant clusters at full opacity while dimming everything else to 5%. Potential cross-cluster edges appear as dashed gold lines with similarity percentages, showing *where* connections could form.

### Camera Auto-Focus (Issue 7)
Clicking a paper from any panel (Bridge Papers, Frontier Papers, Cluster Paper List) now smoothly animates the 3D camera to focus on that node with a 1-second transition. A gold pulsing ring marks the selected paper in the graph, and the label is enlarged with a dark background box for readability.

### Mode-Responsive Legend (Issues 3, 4, 5, 6)
The legend now adapts to the active edge mode:
- **Similarity** → "CITATION CONTEXT" with Background/Methodology/Result colors
- **Temporal** → "TEMPORAL ENCODING" with gold-to-gray year gap scale
- **Cross-Cluster** → "CROSS-CLUSTER" with thick/thin line descriptions

The unused Enhanced Intents section (Supports/Contradicts/Extends/Applies/Compares) has been removed.

### Research Questions Restored (Issue 2)
Research questions were silently discarded in the API response. Now they flow through properly, with 5 heuristic categories: methodology transfer, shared mechanisms, bridge paper context, data/tool transfer, and theoretical framework.

### Paper Bookmarks (P10 — Deferred from v3.1.0)
Authenticated users can bookmark papers directly from OBJECT SCAN:
- Toggle bookmark with one click
- Add freeform tags and memos
- Filter bookmarks by tag
- Full CRUD API with PostgreSQL + GIN index for tag queries

### Chat Graph Actions (P13 — Deferred from v3.1.0)
Chat responses can now include interactive action buttons:
- **Highlight papers** — illuminate specific nodes in the graph
- **Select paper** — focus camera and open detail panel
- **Show cluster** — navigate to a cluster
- **Set edge mode** — switch visualization mode
- **Find path** — trace citation path between two papers

The LLM generates action markers grounded in actual graph IDs, parsed into clickable buttons in the chat panel.

---

## All Changes

### Backend

| Change | File | Description |
|--------|------|-------------|
| Research Questions Fix | `seed_explore.py:445` | `research_questions=[]` → `research_questions=gap.research_questions` |
| 5 Question Categories | `gap_detector.py:202` | Added "data/tool transfer" and "theoretical framework" heuristic templates |
| Bookmarks CRUD | `bookmarks.py` | New router: POST/GET/PUT/DELETE `/api/bookmarks` with auth |
| Bookmarks Migration | `005_paper_bookmarks.sql` | `paper_bookmarks` table with user_id, paper_id, tags[], memo |
| Bookmarks Registration | `main.py` | Added bookmarks router to FastAPI app |
| Chat Action Markers | `seed_chat.py` | Action parsing from LLM response, `ChatAction` response model |
| Chat Context IDs | `seed_chat.py` | Paper IDs and cluster IDs in system prompt for grounded actions |

### Frontend — Store

| Change | File | Description |
|--------|------|-------------|
| `panelSelectionId` | `useGraphStore.ts` | Triggers camera focus on panel paper click |
| `highlightedClusterPair` | `useGraphStore.ts` | Dims all except the two hovered gap clusters |
| `hoveredGapEdges` | `useGraphStore.ts` | Temporarily renders potential edges as dashed gold |

### Frontend — 3D Graph

| Change | File | Description |
|--------|------|-------------|
| Camera Auto-Focus | `ScholarGraph3D.tsx` | `useEffect` animates camera to selected node (z+200, 1s) |
| Selection Pulse Ring | `ScholarGraph3D.tsx` | Gold `RingGeometry` with sin-wave opacity animation |
| Label Enhancement | `ScholarGraph3D.tsx` | Selected: fontSize 20, scale 50x13, dark rounded background box |
| Cluster Pair Highlight | `ScholarGraph3D.tsx` | `cosmicOpacity`: gap-hovered clusters=1, others=0.05 |
| Potential Edges | `ScholarGraph3D.tsx` | Dashed gold links from `hoveredGapEdges` in `forceGraphData` |
| Scene Animation | `CosmicAnimationManager.ts` | `setScene()` + traverse for `isSelectionPulse` opacity |

### Frontend — Panels

| Change | File | Description |
|--------|------|-------------|
| Gap Hover | `GapSpotterPanel.tsx` | `onMouseEnter` sets cluster pair + potential edges |
| Bridge Click Focus | `GapSpotterPanel.tsx` | Calls `setPanelSelectionId` for camera animation |
| Frontier Click Focus | `GapSpotterPanel.tsx` | Calls `setPanelSelectionId` for camera animation |
| Cluster Paper Focus | `ClusterPanel.tsx` | Calls `setPanelSelectionId` on paper list click |
| Bookmark Toggle | `PaperDetailPanel.tsx` | Bookmark/unbookmark with tag editor and memo |
| Chat Action Buttons | `SeedChatPanel.tsx` | Renders `ChatAction[]` as interactive zap buttons |

### Frontend — Legend

| Change | File | Description |
|--------|------|-------------|
| Enhanced Removed | `GraphLegend.tsx` | Deleted 5-item Enhanced subsection |
| Mode-Responsive | `GraphLegend.tsx` | Dynamic content per `edgeVisMode`: Citation Context / Temporal / Cross-Cluster |

### Frontend — Types & API

| Change | File | Description |
|--------|------|-------------|
| `enhanced_intent` Removed | `types/index.ts` | Removed from `CitationIntent` interface |
| `ENHANCED_INTENT_COLORS` Removed | `types/index.ts` | Deleted constant |
| `Bookmark` Type | `types/index.ts` | New interface for bookmark CRUD |
| `ChatAction` Type | `types/index.ts` | New interface for chat action parsing |
| Bookmark API Client | `api.ts` | `getBookmarks`, `getBookmarkForPaper`, `createBookmark`, `updateBookmark`, `deleteBookmark` |

---

## Migration Required

### Database
Run the bookmark migration before deploying:
```sql
-- backend/database/005_paper_bookmarks.sql
CREATE TABLE paper_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    paper_id TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    memo TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, paper_id)
);
CREATE INDEX idx_paper_bookmarks_user ON paper_bookmarks(user_id);
CREATE INDEX idx_paper_bookmarks_tags ON paper_bookmarks USING GIN(tags);
```

Or via Supabase CLI:
```bash
supabase db push
```

---

## API Changes

### New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/bookmarks` | Required | Create/upsert bookmark |
| GET | `/api/bookmarks` | Required | List bookmarks (optional `?tag=` filter) |
| GET | `/api/bookmarks/paper/{paper_id}` | Required | Get bookmark for specific paper |
| PUT | `/api/bookmarks/{id}` | Required | Update tags/memo |
| DELETE | `/api/bookmarks/{id}` | Required | Delete bookmark |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/seed-chat` | Response now includes `actions: ChatAction[]` |
| `POST /api/seed-explore` | `research_questions` now populated (was always `[]`) |

---

## Verification Checklist

| Item | How to Verify |
|------|---------------|
| Gap Hover | Hover gap card → two clusters bright, rest dimmed, dashed gold edges |
| Bridge Focus | Click bridge paper → camera flies to node, gold pulse ring |
| Frontier Focus | Click frontier paper → camera flies to node |
| Cluster Focus | Click paper in cluster list → camera flies to node |
| Legend Modes | Switch edge mode → legend section changes dynamically |
| Enhanced Gone | No "Enhanced" section in legend at all |
| Research Qs | Gap card → expand accordion → 3-5 questions visible |
| Bookmark | Click bookmark icon → toggle, add tags, write memo |
| Chat Actions | Ask chat about papers → see action buttons → click to interact |

---

## Stats

- **18 files changed**, 925 insertions, 78 deletions
- **5 new API endpoints** (bookmark CRUD)
- **1 new DB table** (paper_bookmarks)
- **3 new store fields** (panelSelectionId, highlightedClusterPair, hoveredGapEdges)
