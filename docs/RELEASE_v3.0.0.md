# ScholarGraph3D v3.0.0 — Release Notes

**Release Date:** 2026-02-23
**Type:** Major Frontend Redesign

---

## Overview

v3.0.0 completely replaces the "Deep Space Mission Control" cyan/HUD theme (introduced in the previous iteration) with a new "Stellar Observatory" design — a luxury minimalist aesthetic using a black + white + gold (#D4AF37) palette, serif/mono typography, and refined 3D rendering.

The redesign was motivated by:
1. Poor text contrast in the previous HUD theme (cyan on dark blue was hard to read)
2. Overly dense 3D rendering (oversized glows, excessive particle counts created blue blob effect)
3. Design style didn't match the luxury minimalist direction desired for an academic tool

---

## What Changed

### Design System
- **Color palette:** Cyan (#00E5FF) + purple (#6c5ce7) → Gold (#D4AF37) + neutral grays
- **Typography:** Added Playfair Display serif for hero headings alongside JetBrains Mono
- **Surface colors:** Blue-tinted darks (`#060a14`, `#0a0f1e`) → Pure neutral darks (`#0A0A0A`, `#1A1A1A`)
- **Panel styling:** Corner brackets hidden; clean bordered panels with subtle backgrounds
- **New CSS classes:** `.stellar-panel`, `.stellar-heading`, `.stellar-label`, `.stellar-value`, `.stellar-btn`

### Landing Page (Complete Rewrite)
- **Hero:** Large serif heading + 3D chrome astronaut helmet (Three.js real-time rendering)
- **Astronaut Helmet:** Chrome dome with CubeCamera environment reflections, dark visor, gold rim ring
- **Layout:** Luxury minimalist with generous spacing, framer-motion scroll animations
- **CTA:** Gold "Explore" button replacing cyan "INITIATE SCAN"

### 3D Rendering (Major Tuning)
- Node sizes reduced ~60% (max radius 12 vs 30, multiplier 0.8 vs 1.5)
- Glow sprite opacity: 0.35 (was 0.9), scale: size*2.5 (was size*6)
- Nebula particle count: max 120 (was 250), opacity: 0.12 (was 0.3)
- Edge colors: neutral grays (#555555, #444444) replacing blues
- Directional particles: gold #D4AF37 replacing cyan #00E5FF
- Highlight colors: gold (selected), white (neighbor) replacing red/teal

### All UI Panels Reskinned
- PaperDetailPanel, ClusterPanel, GapSpotterPanel, SeedChatPanel
- GraphControls, GraphLegend, RadarLoader, HudPanel
- Auth pages (LoginForm, SignupForm)
- Dashboard (SavedGraphs, dashboard page)

---

## Files Changed (21 files)

| File | Type | Description |
|------|------|-------------|
| `tailwind.config.ts` | Modified | Gold accent palette, serif font family, neutral surface colors |
| `app/globals.css` | Modified | New CSS custom properties, stellar utility classes, legacy class remap |
| `app/layout.tsx` | Modified | Added Playfair Display font, `--font-serif` CSS variable |
| `app/page.tsx` | Rewritten | Luxury minimalist landing with 3D helmet hero |
| `components/cosmic/AstronautHelmet.tsx` | **New** | Three.js chrome astronaut helmet component |
| `app/explore/seed/page.tsx` | Modified | All cyan/purple → gold/neutral |
| `components/graph/PaperDetailPanel.tsx` | Modified | All accent colors → gold/neutral |
| `components/graph/ClusterPanel.tsx` | Modified | All accent colors → gold/neutral |
| `components/graph/GapSpotterPanel.tsx` | Modified | Strength colors, frontier section → gold |
| `components/graph/SeedChatPanel.tsx` | Modified | Message styling, header → gold/neutral |
| `components/graph/GraphControls.tsx` | Modified | Active/inactive states → gold/neutral |
| `components/graph/GraphLegend.tsx` | Modified | All labels and borders → gold/neutral |
| `components/graph/ScholarGraph3D.tsx` | Modified | Tooltip, edge colors, particle color → gold |
| `components/graph/cosmic/starNodeRenderer.ts` | Modified | Reduced glow/particle density, gold highlights |
| `components/graph/cosmic/nebulaClusterRenderer.ts` | Modified | Reduced particle count/opacity/spread |
| `components/cosmic/HudPanel.tsx` | Modified | Elevated shadow → gold |
| `components/cosmic/RadarLoader.tsx` | Modified | Sweep gradient → gold |
| `components/auth/LoginForm.tsx` | Modified | Input/focus colors → neutral/gold |
| `components/auth/SignupForm.tsx` | Modified | Input/focus colors → neutral/gold |
| `components/dashboard/SavedGraphs.tsx` | Modified | Text colors → white/gray |
| `app/dashboard/page.tsx` | Modified | Header border → neutral |

---

## Migration Notes

- **No breaking API changes** — frontend-only redesign
- **No database changes**
- **No new npm dependencies** — Playfair Display loaded via next/font/google (already available)
- **Legacy CSS classes preserved:** All `.hud-*` class names still work but render in gold/neutral palette
- **3D field colors unchanged:** Star color map for academic fields (Computer Science = blue, Medicine = green, etc.) remains the same

---

## Verification

- Build passes with 0 TypeScript errors
- Comprehensive grep sweep confirms no remaining cyan (#00E5FF) or purple (#6c5ce7, #a29bfe, #7B8CDE) UI tokens
- All 21 files committed in single atomic commit
