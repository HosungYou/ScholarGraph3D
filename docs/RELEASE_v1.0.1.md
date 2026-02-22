# Release Notes — v1.0.1 (Visibility Enhancement)

**Date:** 2026-02-22
**Tag:** v1.0.1
**Previous:** v1.0.0 (Cosmic Universe Theme)

---

## What Was Wrong

v1.0.0 introduced the Cosmic Universe theme but deployed with **6 critical visibility problems** discovered through production screenshot analysis:

### 1. Field Colors Indistinguishable
Computer Science (`#7EB8FF`), Business (`#7DC0F2`), and Engineering (`#7EB8FF`) were nearly identical blues. Researchers searching for cross-disciplinary papers could not tell which field a paper belonged to.

### 2. Star Glow Barely Visible
Glow sprite opacity was `displayOpacity * 0.6` with a texture that peaked at 0.6 and dropped to 0.03 by 70%. With additive blending on the `#050510` dark background, the glow was effectively invisible.

### 3. Light Stream Edges Never Implemented
`lightStreamEdgeRenderer.ts` was created with full TubeGeometry + flow shader code, but **never imported or connected** in `ScholarGraph3D.tsx`. The `linkThreeObject` callback only handled dashed similarity lines and returned `null` for citation edges, making them render as default thin lines with no flow animation.

### 4. Nebula Clusters Invisible
Base opacity was 0.08 (normal) / 0.12 (emerging trend). With additive blending and distance-based alpha falloff, clusters were transparent against the dark space background.

### 5. Citation Count Size Difference Too Subtle
Formula `Math.max(3, Math.log(citation_count + 1) * 3)` gave size range 3-17. At typical camera distances, a paper with 0 citations (size 3) and 100 citations (size ~14) looked nearly the same.

### 6. Edge Colors Flat
All citation edges rendered as `#8890a5` (gray) regardless of intent. No visual flow direction. Similarity edges were slightly different blue but hard to distinguish.

---

## How It Was Fixed

### Field Colors — Maximum Hue Separation
Replaced the STAR_COLOR_MAP with colors chosen for maximum perceptual distance:

| Field | Before | After | Change |
|-------|--------|-------|--------|
| Computer Science | `#7EB8FF` (blue) | `#4DA6FF` (bright blue) | Sharper blue |
| Engineering | `#7EB8FF` (same blue!) | `#B388FF` (vivid purple) | Completely different hue |
| Business | `#7DC0F2` (light blue!) | `#FF9100` (vivid orange) | Blue → Orange |
| Physics | `#B580D9` (muted purple) | `#EA80FC` (bright magenta) | Much more vivid |
| Medicine | `#FF6B5B` (salmon) | `#FF5252` (bright red) | Stronger red |
| Biology | `#5BFF8F` (green) | `#69F0AE` (bright green) | Slightly brighter |
| Economics | `#FFa040` (orange) | `#FFD740` (gold) | Distinct from Business |

### Star Glow — 3x Stronger
| Parameter | Before | After |
|-----------|--------|-------|
| Glow sprite opacity | `displayOpacity * 0.6` | `displayOpacity * 0.9` |
| Glow sprite scale | `size * 4` | `size * 6` |
| Glow texture center | 0.6 | 1.0 |
| Glow texture 20% radius | — | 0.5 (new stop) |
| Emissive intensity (default) | 0.2 | 0.35 |
| Supernova ring opacity | 0.2 | 0.4 |
| Supernova particle size | 0.8 | 1.2 |
| Corona (OA) mid-ring | 0.15 | 0.35 |

### Edge Flow — Directional Particles
Instead of connecting the unused TubeGeometry renderer (which requires expensive geometry recreation when the force simulation moves nodes), used react-force-graph-3d's built-in `linkDirectionalParticles`:

| Property | Value |
|----------|-------|
| `linkDirectionalParticles` | 4 (citation edges), 0 (similarity) |
| `linkDirectionalParticleWidth` | 2 |
| `linkDirectionalParticleSpeed` | 0.006 |
| `linkDirectionalParticleColor` | `#00E5FF` (cyan) |
| `linkOpacity` | 0.8 (was 0.6) |

Citation edges now show flowing cyan particles from citing → cited paper. Similarity edges remain as dashed lines with no particles.

### Nebula Clusters — 4x More Visible
| Parameter | Before | After |
|-----------|--------|-------|
| Base opacity (normal) | 0.08 | 0.30 |
| Base opacity (emerging) | 0.12 | 0.50 |
| Point size | 3.0 | 5.0 |
| XY spread multiplier | 0.6 | 0.8 |
| Z spread multiplier | 0.4 | 0.6 |
| Particle count | `min(200, n*15)` | `min(250, max(50, n*20))` |

### Node Size — Sqrt Scale
| Citations | Before (log) | After (sqrt) |
|-----------|-------------|-------------|
| 0 | 3.0 | 4.0 |
| 10 | 7.2 | 5.0 |
| 50 | 11.7 | 10.7 |
| 100 | 13.8 | 15.1 |
| 500 | 18.6 | 30.0 (capped) |
| 1000 | 20.7 | 30.0 (capped) |

The sqrt scale creates much more dramatic visual hierarchy — highly cited papers are noticeably larger.

### Legend — Matches Actual Colors
GraphLegend now imports `STAR_COLOR_MAP` from cosmic constants instead of the generic `FIELD_COLORS` from types. Shows 10 most common fields with glow-matched swatches.

---

## Files Modified (7)

| File | Lines Changed | Purpose |
|------|--------------|---------|
| `cosmicConstants.ts` | +29 / -28 | Full STAR_COLOR_MAP replacement |
| `cosmicTextures.ts` | +6 / -4 | Glow + corona texture strengthening |
| `starNodeRenderer.ts` | +7 / -7 | Glow opacity/scale, emissive, supernova values |
| `ScholarGraph3D.tsx` | +27 / -10 | Sqrt sizing, particles, edge colors, linkOpacity |
| `nebulaClusterRenderer.ts` | +5 / -5 | Opacity, spread, point size, particle count |
| `GraphLegend.tsx` | +20 / -10 | STAR_COLOR_MAP import, 10-field legend |
| `CLAUDE.md` | +16 / -10 | Updated visual mapping docs |

---

## Researcher Differentiation Checklist

After v1.0.1, researchers can now visually distinguish:

| What | How | Visibility |
|------|-----|-----------|
| Core papers (high citations) | Dramatically larger star size (sqrt scale) | Strong |
| Academic field | Unique hue per field (max separation) | Strong |
| Cluster membership | Visible nebula particle clouds | Medium-Strong |
| Paper age | Twinkle rate (fast=new, slow=old) + opacity (bright=new) | Medium |
| Open Access | Green corona ring (opacity 0.35) | Medium |
| Bridge nodes | Binary orbiting companions | Medium |
| Citation vs Similarity edges | Cyan particles (citation) vs blue dashed (similarity) | Strong |
| Citation direction | Flowing particles from citing → cited | Strong |
| Top 10% cited | Supernova burst ring + orbiting particles | Strong |

---

## Previous Version

v1.0.0 — Cosmic Universe Theme: full UI redesign, star nodes, nebula clusters, HUD panels, warp transition
