# ScholarGraph3D v3.0.2 — Release Notes

**Release Date:** 2026-02-23
**Type:** Critical Bug Fix (SPA Navigation Crash)

---

## Overview

v3.0.2 resolves a persistent client-side crash (`TypeError: Cannot read properties of undefined (reading '0')`) that occurred when navigating from the landing page to the explore page via search. The root cause was Three.js dispose lifecycle mismanagement during SPA (client-side) navigation — the safety patch was scoped to the explore page only, leaving the landing page's Three.js components unprotected.

---

## Problem

**Symptom:** Searching for a paper on the landing page → clicking a result → blank page with "Application error: a client-side exception has occurred". Hard refresh on the same URL worked correctly.

**Stack trace:**
```
TypeError: Cannot read properties of undefined (reading '0')
  at dispatchEvent (three.js)
  at dispose (three.js)
```

**Root cause analysis (3 issues):**

### Issue 1: Three.js Safety Patch Was Local, Not Global

The `try-catch` monkey-patch on `BufferGeometry.dispose()`, `Material.dispose()`, and `Texture.dispose()` was defined inside `ScholarGraph3D.tsx` — a module that only loads when the explore page renders. When the user navigates from the landing page (which has its own Three.js scenes) to the explore page, the cleanup runs **before** `ScholarGraph3D.tsx` loads, so the patch isn't active when the crash occurs.

### Issue 2: StarfieldBackground Incomplete Cleanup

`StarfieldBackground.tsx` cleanup function only called `renderer.dispose()` and removed the DOM element. It did **not** dispose:
- `starGeo` (BufferGeometry) — 4000-point star field
- `starMat` (PointsMaterial)
- `mwGeo` (BufferGeometry) — 1200-point Milky Way band
- `mwMat` (PointsMaterial)
- Scene itself was never cleared

When `renderer.dispose()` triggered internal Three.js cleanup, these undisposed objects had stale `_listeners` maps, causing `dispatchEvent` to throw.

### Issue 3: Warp Animation Race Condition

`triggerWarp()` used `requestAnimationFrame(warpAnimate)` inside a Promise but the rAF IDs were **never tracked or cancelled** on unmount. Timeline:
1. User clicks search result → `triggerWarp()` starts (800ms rAF animation)
2. After 600ms → `router.push()` fires SPA navigation
3. React unmounts `StarfieldBackground` → cleanup runs
4. At 600–800ms → warp rAF callbacks still fire, accessing disposed geometry attributes → crash

---

## Fixes

### Fix 1: Global Three.js Safety Patch (`lib/three-safety.ts` — NEW)

Created a new module that patches all relevant Three.js prototypes with `try-catch` wrappers:
- `BufferGeometry.prototype.dispose`
- `Material.prototype.dispose`
- `Texture.prototype.dispose`
- `WebGLRenderer.prototype.dispose`
- `EventDispatcher.prototype.dispatchEvent` (catches stale listener map access)

Imported in `providers.tsx` (app root) so it applies **before any Three.js component loads**, protecting all pages equally.

### Fix 2: StarfieldBackground Full Resource Disposal

Updated cleanup to properly dispose all Three.js resources in correct order:
1. Set `disposedRef.current = true` (signals warp to stop)
2. Cancel both main animation and warp animation rAFs
3. Dispose all geometries and materials
4. `scene.clear()` removes all objects
5. `renderer.dispose()` last
6. Null all refs to prevent stale access

### Fix 3: Warp Animation Guard

- Added `warpFrameRef` to track warp rAF IDs (cancelled on unmount)
- Added `disposedRef` check at the start of every warp frame — bails immediately if component was unmounted
- Added `disposedRef` check before `triggerWarp()` starts

### Fix 4: AstronautHelmet Disposal Order

Reordered cleanup to dispose geometries and materials **before** `renderer.dispose()`, and added `scene.clear()` + `starBgScene.clear()` to properly release the environment map scene.

### Cleanup: Removed Duplicate Monkey-Patch

Removed the local monkey-patch from `ScholarGraph3D.tsx` (now handled globally by `lib/three-safety.ts`).

---

## Architecture Decision: Three.js Disposal Safety Pattern

This fix establishes a project-wide pattern for Three.js resource management:

```
┌─────────────────────────────────────────────────────┐
│  providers.tsx (app root)                           │
│  └── applyThreeJsSafetyPatch()                      │
│      └── lib/three-safety.ts                        │
│          ├── BufferGeometry.dispose → try/catch      │
│          ├── Material.dispose → try/catch            │
│          ├── Texture.dispose → try/catch             │
│          ├── WebGLRenderer.dispose → try/catch       │
│          └── EventDispatcher.dispatchEvent → try/catch│
├─────────────────────────────────────────────────────┤
│  Every Three.js component must follow:               │
│  1. Track ALL rAF IDs (main loop + animations)       │
│  2. Use a disposedRef to guard async callbacks        │
│  3. Dispose resources BEFORE renderer                 │
│  4. Call scene.clear() to release child references    │
│  5. Null all refs after cleanup                       │
└─────────────────────────────────────────────────────┘
```

**Rule:** Never add local monkey-patches in individual components. All Three.js safety goes through `lib/three-safety.ts`.

---

## Backend Status

No backend changes. Render backend confirmed healthy — `POST /api/seed-explore` returns 200 OK with normal processing times (~8s for full pipeline).

---

## Files Changed (5 files)

| File | Type | Description |
|------|------|-------------|
| `frontend/lib/three-safety.ts` | **New** | Global Three.js dispose safety patch |
| `frontend/app/providers.tsx` | Modified | Import and apply safety patch at app root |
| `frontend/components/cosmic/StarfieldBackground.tsx` | Modified | Full resource disposal + warp animation guard |
| `frontend/components/cosmic/AstronautHelmet.tsx` | Modified | Correct disposal order (resources before renderer) |
| `frontend/components/graph/ScholarGraph3D.tsx` | Modified | Removed duplicate local monkey-patch |

---

## Technical Details

- 5 files changed, 102 insertions, 25 deletions
- 0 TypeScript errors, build passes cleanly
- No new npm dependencies
- No database changes
- No new environment variables
- No backend changes

---

## Verification

- `npm run build` — zero errors
- SPA navigation test: Landing → Search → Click result → Explore page loads with 3D graph (no crash)
- Round-trip test: Explore → Home → Search → Explore (no crash)
- Console: zero errors during full navigation cycle
- Vercel deployment: Ready (38s build)
