# ScholarGraph3D — Cosmic Universe Design Theme

> v1.0.0 Design System Reference

## World-Building Concept

**Core Metaphor:** The academic knowledge space is a universe.

| Academic Concept | Cosmic Metaphor | Visual Treatment |
|-----------------|-----------------|------------------|
| Paper | Star | GLSL shader sphere with twinkle + glow sprite |
| Cluster | Nebula | Gaussian particle cloud (THREE.Points) |
| Citation edge | Light Stream | TubeGeometry with UV-offset flow shader |
| Similarity edge | Gravity Wave | TubeGeometry with sinusoidal wave shader |
| Search | Warp Jump | Star Z-acceleration + scale/blur/fade |
| Landing | Deep Space | Three.js starfield (3000 stars + Milky Way) |
| UI Panels | HUD / Hologram | Scanline overlays, corner brackets, monospace |

## Color Palette

### Core Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | `#050510` | Deep space black — all page backgrounds |
| `--surface` | `#0a0f1e` | Panel backgrounds, input fields |
| `--surface-hover` | `#111833` | Hover states on surfaces |
| `--border` | `#1a2555` | Blue-tinted borders everywhere |
| `--text-primary` | `#E8EAF6` | Primary text (17:1 contrast AAA) |
| `--text-secondary` | `#7B8CDE` | Secondary text, labels |
| `--accent` / `cosmic-glow` | `#00E5FF` | Primary cyan accent (12:1 AA+) |
| `cosmic-nebula` | `#6c5ce7` | Purple nebula accent |
| `cosmic-star` | `#a29bfe` | Star lavender accent |
| `accent-warm` | `#fd79a8` | Warm pink accent |

### Star Color Map (Field → Stellar Temperature) — v1.0.1

> **Design principle:** Maximum hue separation so researchers can instantly distinguish fields at a glance.

| Academic Field | Core Color | Glow Color | Stellar Type |
|---------------|-----------|-----------|-------------|
| Computer Science | `#4DA6FF` | `#2979FF` | Blue Giant |
| Engineering | `#B388FF` | `#7C4DFF` | Vivid Purple |
| Mathematics | `#18FFFF` | `#00E5FF` | Cyan Dwarf |
| Medicine / Health | `#FF5252` | `#D50000` | Red Supergiant |
| Biology / Life Sciences | `#69F0AE` | `#00E676` | Green Nebula Star |
| Physics | `#EA80FC` | `#D500F9` | Magenta Exotic |
| Chemistry | `#FF80AB` | `#FF4081` | Pink Giant |
| Economics | `#FFD740` | `#FFC400` | Gold Dwarf |
| Sociology | `#FFAB40` | `#FF9100` | K-type Orange |
| Business | `#FF9100` | `#FF6D00` | Vivid Orange |
| Psychology | `#A7FFEB` | `#64FFDA` | Light Teal |
| Environmental | `#76FF03` | `#64DD17` | Vivid Lime |
| Arts & Humanities | `#FFF176` | `#FFEE58` | Yellow Dwarf |

## CSS Utility Classes

### Glass Panels
- `.glass` — `rgba(5,5,16,0.85)` + `blur(16px)` + cyan border `rgba(0,229,255,0.08)`
- `.glass-strong` — `rgba(5,5,16,0.92)` + `blur(24px)` + cyan border `rgba(0,229,255,0.12)`

### HUD System
- `.hud-panel` — Cosmic panel with `::before` top energy line (cyan gradient), inner glow shadow, cosmic surface background
- `.hud-button` — Semi-transparent cyan-tinted button with glow hover, uppercase font-mono tracking-wider
- `.hud-scanline::after` — Repeating-linear-gradient scanline overlay (2px lines)
- `.cosmic-glow` — Multi-layered text-shadow (cyan + purple glow) for headings

### Animations

| Class | Keyframe | Duration | Effect |
|-------|----------|----------|--------|
| `animate-warp` | `warp-speed` | 0.8s | Scale(3) + blur(20px) + fade — search submit |
| `animate-cosmic-pulse` | `cosmic-pulse` | 3s infinite | Opacity oscillation — status indicators |
| `animate-hud-flicker` | `hud-flicker` | 4s infinite | Subtle opacity flicker — holographic |
| `animate-radar-sweep` | `radar-sweep` | 2s infinite | Rotation — loading states |
| `animate-border-glow` | `border-glow` | 2s infinite | Border-color pulse — active elements |
| `animate-drift` | `drift` | 20s infinite | Translate oscillation — CSS starfield |

## Component Architecture

### Shared Cosmic Components (`components/cosmic/`)

| Component | Purpose | Tech |
|-----------|---------|------|
| `StarfieldBackground` | Landing page starfield | Three.js Points (3000+1500), mouse parallax, `triggerWarp()` via forwardRef. Dynamic import with `ssr: false` |
| `CosmicStarfield` | Auth/Dashboard starfield | CSS-only 3 radial-gradient layers + drift animations. Lighter than WebGL |
| `HudPanel` | Reusable panel wrapper | `.hud-panel .hud-scanline` + optional title/icon + pulsing dot |
| `RadarLoader` | Loading indicator | 3 concentric rings with conic-gradient sweep + center dot |

### 3D Cosmic Rendering (`components/graph/cosmic/`)

| Module | Purpose |
|--------|---------|
| `cosmicConstants.ts` | `STAR_COLOR_MAP`, `getTwinkleRate()`, `getStarColors()`, GLSL vertex/fragment shaders |
| `cosmicTextures.ts` | Cached canvas-generated textures: radial glow, corona (OA ring), 6-pointed flare |
| `CosmicAnimationManager.ts` | Singleton rAF loop — updates all `uTime` uniforms, animates supernova/binary/flare |
| `starNodeRenderer.ts` | `createStarNode()` → THREE.Group with shader core, glow sprite, flare, corona, supernova, binary |
| `nebulaClusterRenderer.ts` | `createNebulaCluster()` → THREE.Points with Gaussian distribution, shimmer shader |
| `lightStreamEdgeRenderer.ts` | `createLightStreamEdge()` → TubeGeometry + flow shader, `createSimpleEdge()` LOD fallback |

> **Note:** TubeGeometry light stream edges (`lightStreamEdgeRenderer.ts`) are not currently active. Citation flow is rendered via `linkDirectionalParticles` (4 cyan particles per edge). The file has been removed as dead code in v1.1.1.

### Star Node Layers

| Layer | Condition | Visual |
|-------|-----------|--------|
| Core sphere | Always | ShaderMaterial with twinkle + fresnel rim glow |
| Glow sprite | Always | Additive-blend radial gradient texture (opacity ×0.9, scale ×6) |
| Lens flare | `isSelected` | 6-pointed star sprite (rotating) |
| Corona | `is_open_access` | Green additive-blend ring sprite |
| Supernova burst | Top 10% citations | Pulsing ring (opacity 0.4, scale 1.0-1.8) + 12 orbiting particles (size 1.2) |
| Binary star | `is_bridge` | 2 small companion spheres orbiting main star |
| Bloom halo | `isSelected + showBloom` | Larger transparent sphere |

### Twinkle Rate Formula
```
twinkleRate = 1.5 + ((year - minYear) / (maxYear - minYear)) * 4.5
```
Oldest papers twinkle slowly (1.5Hz), newest papers twinkle rapidly (6.0Hz).

## Page-Level Theme Mapping

| Page | Cosmic Name | Key Elements |
|------|-------------|-------------|
| `/` (Landing) | Cosmic Entry | StarfieldBackground, warp transition, HUD input panels |
| `/explore` | Mission Control | Arrival animation (scale+blur), RadarLoader, "AWAITING SCAN VECTOR" |
| `/explore/seed` | Origin Point Mode | RadarLoader, "BUILDING CITATION NETWORK...", cosmic-nebula accents |
| `/auth` | Station Access | CosmicStarfield, scanline overlay, "INITIATE ACCESS" / "REGISTER CREW" |
| `/dashboard` | Command Center | CosmicStarfield, "STATION CONFIGURATION", "DETECTED SIGNALS", "MISSION ARCHIVES" |

## Panel Naming Convention

| Component | Cosmic Name | Header Style |
|-----------|-------------|-------------|
| SearchBar | Navigation Console | `font-mono uppercase tracking-wider` |
| ClusterPanel | Sector Scanner | `font-mono uppercase tracking-widest text-cosmic-glow/60` |
| PaperDetailPanel | Object Scanner | `font-mono uppercase text-cosmic-glow/40` |
| GraphControls | Ship Controls | Circular cyan-glow toggles |
| GraphLegend | Star Chart | `font-mono uppercase tracking-widest text-cosmic-glow/60` |
| ChatPanel | Comm Channel | `font-mono uppercase tracking-widest text-cosmic-glow/60` |
| LLMSettingsModal | Comm Relay Config | `font-mono uppercase tracking-widest` |
| TrendPanel | Trend Analysis | `font-mono uppercase tracking-widest text-cosmic-glow/60` |
| GapPanel | Gap Analysis | `font-mono uppercase tracking-widest text-cosmic-glow/60` |
| WatchQueryPanel | Surveillance Probes | `font-mono uppercase tracking-widest text-cosmic-glow/60` |

## Performance Budget (200 nodes)

| Element | Approximate GPU Cost |
|---------|---------------------|
| Star spheres (16-seg) | ~100K tris, 1.5ms |
| Glow sprites | 400 tris, 0.1ms |
| Supernova particles | ~240 points, <0.1ms |
| Binary companions | ~5K tris, 0.1ms |
| Nebula particles | ~3000 points, 0.3ms |
| Citation particles (directional) | ~800 points, 0.1ms |
| Similarity dashed lines | ~500 lines, 0.1ms |
| **Total** | **~130K tris, ~2.7ms / 16.6ms** |

Target: 60fps with safe margin (~16% frame budget used).

## Fallback System

The `showCosmicTheme` toggle in Zustand (default: `true`) provides a complete fallback:
- `true`: Star nodes, nebula clusters, light stream edges, cosmic colors
- `false`: Original MeshPhongMaterial nodes, convex hull clusters, simple line edges

Both branches preserve all labels, badges, and interactive behaviors identically.

## WCAG Accessibility

| Pair | Contrast Ratio | Level |
|------|---------------|-------|
| `#E8EAF6` on `#050510` | 17:1 | AAA |
| `#00E5FF` on `#050510` | 12:1 | AA+ |
| `#7B8CDE` on `#050510` | 6.5:1 | AA |

## Mobile Considerations

- StarfieldBackground: 1500 stars (vs 3000), 800 Milky Way (vs 1500), DPR capped at 1.5
- Parallax disabled on touch devices
- CosmicStarfield (CSS-only) used on auth/dashboard for lighter weight
- Font sizes and panel layouts remain responsive via existing Tailwind breakpoints
