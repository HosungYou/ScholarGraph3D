# ScholarGraph3D v3.0.1 — Release Notes

**Release Date:** 2026-02-23
**Type:** Feature Enhancement + Critical Bug Fix

---

## Overview

v3.0.1 fixes a critical Three.js crash on the explore page and enhances the landing page with smart search recommendations, localStorage-based search history, and visual polish.

---

## What Changed

### Critical Fix: Three.js Dispose TypeError

**Root cause**: `nodeThreeObject` callback in `ScholarGraph3D.tsx` proactively called `disposeGroup(existingObj)` to prevent memory leaks, but the `three-forcegraph` library also disposes objects through its own `emptyObject`/`deallocate` pipeline. This double-disposal corrupted the `children` array, causing `TypeError: Cannot read properties of undefined (reading '0')` when the library accessed `children[0]` on already-disposed objects.

**Fixes applied to `ScholarGraph3D.tsx`**:
- Removed `disposeGroup(existingObj)` from `nodeThreeObject` — let the library handle its own object lifecycle
- Removed `disposeGroup` from `nodeThreeObject` dependency array (reduces unnecessary full-purge re-renders)
- Guarded unmount cleanup against `undefined` materials (`obj.material` null check)
- Stopped disposing shared singleton textures (glow/corona/flare from `cosmicTextures.ts`) via uniform values — prevents texture corruption across all star nodes

### Favicon Added

- Created `frontend/public/favicon.ico` (16x16 gold circle) to fix 404 error

### Smart Recommendations

**Search History (localStorage)**
- Every successful DOI lookup and natural search is saved to `localStorage` key `sg3d-search-history`
- Stores query, type (doi/search), timestamp, and label — keeps last 10 entries, deduplicates by query
- "Recent" section appears above "Try:" suggestions when history exists
- Gold-themed history pills with clear button
- History persists across browser sessions

**Expanded Suggestions**
- `EXAMPLE_SEEDS` expanded from 3 to 6 papers across CS, Bio, Med, NLP
- `EXAMPLE_QUERIES` expanded from 4 to 8 queries across CS, Med, Env, Bio, Physics, Eng, Econ
- Random subset of 3 seeds / 4 queries shown on each page load (rotates per visit)
- Field color dots added to each suggestion pill (matching STAR_COLOR_MAP from cosmicConstants.ts)

### Visual Polish

- **Gold focus glow**: Both DOI and Search inputs now show gold border + subtle gold shadow on focus (`#D4AF37/40`, `0 0 20px rgba(212,175,55,0.08)`)
- **Animated mode switcher**: Replaced solid bg/border active state with spring-animated gold underline via `motion.div layoutId`
- **Keyboard hints**: "Press Enter to explore" / "Press Enter to search" shown below each input in muted mono text

---

## Backend Status

Render backend health check confirmed **all systems healthy**:
- Database: connected
- pgvector: available
- Auth: configured
- S2 API: authenticated
- CORS: `allow_origin_regex = r"https://.*\.vercel\.app"` — covers all Vercel preview deployments

No backend code changes in this release.

---

## Files Changed (3 files)

| File | Type | Description |
|------|------|-------------|
| `frontend/components/graph/ScholarGraph3D.tsx` | Modified | Remove double-disposal, guard undefined materials, protect shared textures |
| `frontend/app/page.tsx` | Modified | Search history, expanded suggestions, randomized display, gold focus glow, animated mode switch, keyboard hints |
| `frontend/public/favicon.ico` | **New** | Gold circle favicon (16x16) |

---

## Technical Details

- 3 files changed across 2 commits
- 0 TypeScript errors, build passes cleanly
- No new npm dependencies
- No database changes
- No new environment variables
- No backend changes

---

## Verification

- `npm run build` — zero errors
- `npx tsc --noEmit` — zero TypeScript errors
- Render health endpoint: `{"status":"healthy"}`
- CORS preflight (OPTIONS) returns 200 for Vercel preview URLs
