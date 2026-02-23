# ScholarGraph3D v3.0.1 — Release Notes

**Release Date:** 2026-02-23
**Type:** Feature Enhancement (Landing Page Search UX)

---

## Overview

v3.0.1 enhances the v3.0.0 Stellar Observatory landing page with smart search recommendations, localStorage-based search history, and visual polish for the search input section.

---

## What Changed

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

## Files Changed (1 file)

| File | Type | Description |
|------|------|-------------|
| `frontend/app/page.tsx` | Modified | Search history, expanded suggestions, randomized display, gold focus glow, animated mode switch, keyboard hints |

---

## Technical Details

- 1 file changed, ~160 insertions, ~16 deletions
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
