# ScholarGraph3D — Deep Space Mission Control Design Theme

> v3.0.0 Design System Reference — "Deep Space Mission Control" Redesign

## World-Building Concept

**Core Metaphor:** The academic knowledge space is a universe explored from a mission control HUD.

| Academic Concept | Cosmic Metaphor | Visual Treatment |
|-----------------|-----------------|------------------|
| Paper | Star | GLSL shader sphere with twinkle + glow sprite |
| Cluster | Nebula | Gaussian particle cloud (THREE.Points) |
| Citation edge | Light Stream | Directional particles (4 cyan per edge) |
| Similarity edge | Gravity Wave | Dashed line with opacity |
| Search | Warp Jump | Star Z-acceleration + scale/blur/fade |
| Landing | Mission Briefing | Deep Field starfield + HUD-framed panels |
| Explore | Mission Control | Collapsible sidebar + drawer overlay |
| UI Panels | HUD / Hologram | Angular frames, corner brackets, monospace |

## Design Direction

### "Deep Space Mission Control"
- Pure black (#000000) void background with realistic Deep Field starfield
- HUD-style angular panels with corner bracket accents
- JetBrains Mono monospace typography throughout UI chrome
- Cyan (#00E5FF) as primary system accent with purple (#6c5ce7) secondary
- Mission-control language: "INITIATE SCAN", "SECTOR SCANNER", "RESEARCH ASSISTANT"
- Professional but atmospheric — academic utility through space exploration metaphor

## Color Palette

### CSS Custom Properties (`:root`)

```css
/* Core */
--void: #000000;              /* True black background */
--background: #000000;        /* Page backgrounds */
--surface: #060a14;           /* Panel innards */
--surface-hover: #0c1220;     /* Hover states */
--border: #141e38;            /* Default borders */

/* Text */
--text-primary: #E8EAF6;     /* Primary text (17:1 AAA) */
--text-secondary: #7B8CDE;   /* Secondary text, labels */
--text-muted: #4a5580;        /* Muted text, HUD labels */

/* Accent */
--accent: #00E5FF;            /* Primary cyan (12:1 AA+) */
--accent-nebula: #6c5ce7;     /* Purple secondary */
--accent-star: #a29bfe;       /* Lavender tertiary */
--accent-warm: #fd79a8;       /* Warm pink accent */
--accent-gold: #FFD700;       /* Gold accent */

/* HUD System */
--hud-border: rgba(0, 229, 255, 0.12);      /* Panel borders */
--hud-border-active: rgba(0, 229, 255, 0.35); /* Active borders */
--hud-bg: rgba(4, 8, 18, 0.88);              /* Panel background */
--hud-glow: rgba(0, 229, 255, 0.06);         /* Subtle glow */

/* Field of Study Spectrum */
--field-cs: #4FC3F7;          /* Computer Science */
--field-medicine: #66BB6A;    /* Medicine/Health */
--field-physics: #AB47BC;     /* Physics */
--field-biology: #FFA726;     /* Biology */
--field-social: #EF5350;      /* Social Science */
--field-engineering: #26C6DA;  /* Engineering */
--field-math: #7E57C2;        /* Mathematics */
--field-chemistry: #FF7043;    /* Chemistry */
```

### Tailwind Config Colors

All CSS custom property values are mirrored in `tailwind.config.ts` for utility class usage:
- `bg-void`, `bg-surface`, `bg-surface-hover`
- `text-text-primary`, `text-text-secondary`, `text-text-muted`
- `text-accent`, `border-accent`, etc.
- `text-field-cs`, `text-field-medicine`, etc.
- `bg-hud-bg`, `border-hud-border`

## Typography

| Usage | Font | Weight | Tracking |
|-------|------|--------|----------|
| Body text | Inter / system-ui | 400 | Normal |
| HUD labels | JetBrains Mono | 500 | 0.12em |
| HUD values | JetBrains Mono | 600 | Normal |
| HUD buttons | JetBrains Mono | 500 | 0.08em |
| Panel headers | JetBrains Mono | 500 | 0.12em, uppercase |

JetBrains Mono loaded via Google Fonts in `layout.tsx`.

## HUD Design System — CSS Classes

### Panel Classes

| Class | Description | Visual |
|-------|-------------|--------|
| `.hud-panel` | Full HUD panel with corner brackets | Angular frame, top edge glow, corner bracket pseudo-elements |
| `.hud-panel-clean` | Panel without corner brackets | Same background/border as `.hud-panel`, no pseudo-elements |
| `.glass` | Frosted glass panel | `rgba(4,8,18,0.85)` + `blur(16px)` + cyan border |
| `.glass-strong` | Heavy frosted glass | `rgba(4,8,18,0.92)` + `blur(24px)` + stronger border |

### `.hud-panel` Detail

```
Background:  var(--hud-bg) = rgba(4, 8, 18, 0.88)
Backdrop:    blur(20px)
Border:      1px solid var(--hud-border) = rgba(0, 229, 255, 0.12)
Box-shadow:  inset 0 1px 0 rgba(0,229,255,0.04), 0 0 40px rgba(0,229,255,0.02)

::before     Top edge glow line (centered gradient, 76% width)
::after      Corner brackets (12px marks at all 4 corners via gradient backgrounds)
```

### Interactive Classes

| Class | Description | States |
|-------|-------------|--------|
| `.hud-button` | Primary HUD button | Cyan border/text, glow on hover, scale(0.98) on active |
| `.hud-button-ghost` | Ghost/secondary button | Transparent bg, subtle border, cyan on hover |

### Text & Data Classes

| Class | Description | Specs |
|-------|-------------|-------|
| `.hud-label` | Data label | 10px, mono, uppercase, 0.12em tracking, muted color |
| `.hud-value` | Data value | 13px, mono, semibold, primary color |
| `.cosmic-glow` | Glowing heading text | Multi-layer text-shadow (cyan + purple) |

### Utility Classes

| Class | Description |
|-------|-------------|
| `.hud-divider` | Horizontal section divider (centered gradient line) |
| `.hud-scanline` | Scanline overlay effect (2px repeating gradient) |
| `.hud-status` | Status indicator dot (6px, cyan glow) |
| `.hud-status-warn` | Warning status (orange) |
| `.hud-status-error` | Error status (red) |

## Animations

| Class | Keyframe | Duration | Effect |
|-------|----------|----------|--------|
| `animate-warp` | `warp-speed` | 0.8s | Scale(3) + blur(20px) + fade — search submit |
| `animate-cosmic-pulse` | `cosmic-pulse` | 3s infinite | Opacity oscillation — status indicators |
| `animate-hud-flicker` | `hud-flicker` | 4s infinite | Subtle opacity flicker — holographic |
| `animate-radar-sweep` | `radar-sweep` | 2s infinite | Rotation — loading states |
| `animate-border-glow` | `border-glow` | 2s infinite | Border-color pulse — active elements |
| `animate-drift` | `drift` | 20s infinite | Translate oscillation — CSS starfield |
| `animate-typing-cursor` | `typing-cursor` | 1s step-end | Cursor blink — input prompts |
| `animate-fade-in` | `fade-in` | 0.4s | Y+8px entry — element appear |
| `animate-pulse-glow` | `pulse-glow` | 2s infinite | Box-shadow pulse — focus states |

### Tailwind-Only Animations

| Name | Duration | Effect |
|------|----------|--------|
| `twinkle` | 4s infinite | Opacity 0.3→1→0.3 — star shimmer |
| `twinkle-slow` | 6s infinite | Slower variant |
| `scan-line` | 8s linear | translateY sweep — scanning effect |
| `pulse-ring` | 2s ease-out | Scale 0.8→2 + fade — ring pulse |
| `data-stream` | 1.5s linear | Background position scroll — data flow |

## Component Architecture

### Shared Cosmic Components (`components/cosmic/`)

| Component | Purpose | Tech |
|-----------|---------|------|
| `StarfieldBackground` | Landing/explore starfield | Three.js Points (3000+1500), power-law brightness, mouse parallax, `triggerWarp()` via forwardRef. Dynamic import `ssr: false` |
| `DeepFieldBackground` | Alternative starfield | Canvas 2D, power-law brightness distribution, 3 star layers, CSS animation. Lighter than WebGL |
| `CosmicStarfield` | Auth/Dashboard starfield | CSS-only circular gradient layers + drift animations |
| `HudPanel` | Reusable panel wrapper | `.hud-panel` + variants (default/clean/status) + optional title/icon + pulsing dot |
| `RadarLoader` | Loading indicator | 3 concentric rings with conic-gradient sweep + center dot |

### 3D Cosmic Rendering (`components/graph/cosmic/`)

| Module | Purpose |
|--------|---------|
| `cosmicConstants.ts` | `STAR_COLOR_MAP`, `getTwinkleRate()`, `getStarColors()`, GLSL vertex/fragment shaders |
| `cosmicTextures.ts` | Cached canvas-generated textures: radial glow, corona (OA ring), 6-pointed flare |
| `CosmicAnimationManager.ts` | Singleton rAF loop — updates all `uTime` uniforms, animates supernova/binary/flare |
| `starNodeRenderer.ts` | `createStarNode()` -> THREE.Group with shader core, glow sprite, flare, corona, supernova, binary |
| `nebulaClusterRenderer.ts` | `createNebulaCluster()` -> THREE.Points with Gaussian distribution, shimmer shader |

## Layout Architecture

### Explore Page (`/explore/seed`)

```
+--------------------------------------------------+
| HUD Top Bar (status indicators, title)           |
+--------+-----------------------------------------+
|        |                                         |
| Left   |          3D Graph Canvas                |
| Side   |         (flex: 1, full area)            |
| bar    |                                         |
| 48px   |                    +--------------------+
| or     |                    | Right Drawer       |
| 300px  |                    | 480px overlay      |
|        |                    | (absolute, z-30)   |
|        |                    +--------------------+
|        |                                         |
+--------+-----------------------------------------+
| HUD Status Bar (paper count, cluster count)      |
+--------------------------------------------------+
```

#### Left Sidebar
- **Collapsed:** 48px icon-only with tooltips
- **Expanded:** 300px with full tab content
- **Tabs:** Clusters (Layers), Search (ScanSearch), Chat (MessageCircle)
- **Persistence:** `localStorage('seed-left-collapsed')`
- **Animation:** framer-motion spring layout transition

#### Right Drawer Panel
- **Width:** 480px fixed
- **Position:** Absolute overlay (no graph push)
- **Backdrop:** `bg-black/30` click-to-dismiss
- **Z-index:** Backdrop z-20, Panel z-30
- **Animation:** framer-motion x-slide + AnimatePresence

#### Z-Index Hierarchy
| Layer | Z-Index | Element |
|-------|---------|---------|
| Background | 0 | Starfield, Deep Field |
| Graph Canvas | - | 3D scene (flex area) |
| Sidebar | 10 | Left collapsible panel |
| Graph Controls | 10 | Floating toggle buttons |
| Drawer Backdrop | 20 | Semi-transparent overlay |
| Drawer Panel | 30 | Paper detail panel |
| Toasts | 50 | Notifications |

## Panel Internal Design

### PaperDetailPanel (Right Drawer)
- Header with paper title, year badge, open access indicator
- Sections separated by `.hud-divider` gradient lines
- Statistics grid: `.hud-label` + `.hud-value` pairs in 2-column grid
- Authors list with affiliation badges
- Abstract with `.hud-panel-clean` wrapper
- Action buttons: `.hud-button` for primary, `.hud-button-ghost` for secondary

### ClusterPanel (Left Sidebar — Clusters Tab)
- Header: "SECTOR SCANNER" with `.hud-label`
- Cluster list with color dots, density bars, edge counts
- Selected cluster detail: Topics tags, Statistics grid, Paper list
- Eye/Focus/Chevron action buttons per cluster
- framer-motion AnimatePresence for detail expansion

### GapSpotterPanel (Left Sidebar — Search Tab)
- Header: "GAP SPOTTER" with `.hud-label`
- Gap cards: `.hud-panel-clean` wrapper with strength bar
- Bridge papers list with score percentages
- Frontier papers section with purple accent theme

### SeedChatPanel (Left Sidebar — Chat Tab)
- Header: "RESEARCH ASSISTANT" with `.hud-label`
- Message bubbles: `.hud-panel-clean` wrapper
  - User: cyan-tinted bg, right-aligned, rounded-tr-sm
  - Assistant: default bg, left-aligned, rounded-tl-sm
- Suggestion buttons: `.hud-button-ghost`
- Follow-up buttons: `.hud-button-ghost` with "+" prefix
- Input area: `.hud-panel-clean` wrapper, transparent textarea
- Send button: `.hud-button`

### GraphControls (Floating)
- Vertical button column, top-right
- Active state: cyan bg/border with glow shadow
- Inactive: dark bg, muted text, hover highlights
- Separator between toggles and utility buttons

## Panel Naming Convention

| Component | Cosmic Name | HUD Label Style |
|-----------|-------------|-----------------|
| SearchBar | Navigation Console | `.hud-label text-[#00E5FF]/60` |
| ClusterPanel | Sector Scanner | `.hud-label text-[#00E5FF]/60` |
| PaperDetailPanel | Object Scanner | `.hud-label text-[#00E5FF]/40` |
| GraphControls | Ship Controls | Icon-only, title attribute |
| GraphLegend | Star Chart | `.hud-label text-[#00E5FF]/60` |
| SeedChatPanel | Research Assistant | `.hud-label text-[#00E5FF]/60` |
| GapSpotterPanel | Gap Spotter | `.hud-label text-[#00E5FF]/60` |

## Page-Level Theme Mapping

| Page | Cosmic Name | Key Elements |
|------|-------------|-------------|
| `/` (Landing) | Mission Briefing | Deep Field starfield, HUD-framed feature panels, "INITIATE SCAN" CTA, "KNOWN TARGETS" example chips |
| `/explore` | Mission Control | Arrival animation, RadarLoader, "AWAITING SCAN VECTOR" |
| `/explore/seed` | Origin Point Mode | Collapsible sidebar, drawer overlay, HUD top/status bars |

### Landing Page Sections
- **Hero:** "NAVIGATE THE TOPOLOGY OF KNOWLEDGE" with cosmic-glow, `.hud-panel` frame
- **DOI Input:** Coordinate entry console (scanline, mono font, `INITIATE SCAN` button)
- **Feature Cards:** Mission Briefing panels
  - "GRAVITATIONAL MAPPING" (citation topology)
  - "NEBULA CLASSIFICATION" (semantic clusters)
  - "TEMPORAL ARCHAEOLOGY" (time depth on Z)
- **Known Targets:** Example paper chips as mission coordinates

## Star Color Map (Field -> Stellar Temperature)

| Academic Field | Core Color | Tailwind Token |
|---------------|-----------|----------------|
| Computer Science | `#4FC3F7` | `field-cs` |
| Medicine / Health | `#66BB6A` | `field-medicine` |
| Physics | `#AB47BC` | `field-physics` |
| Biology / Life Sciences | `#FFA726` | `field-biology` |
| Social Science | `#EF5350` | `field-social` |
| Engineering | `#26C6DA` | `field-engineering` |
| Mathematics | `#7E57C2` | `field-math` |
| Chemistry | `#FF7043` | `field-chemistry` |
| Earth Sciences | `#8D6E63` | `field-earth` |
| Humanities | `#EC407A` | `field-humanities` |

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
- `true`: Star nodes, nebula clusters, cosmic colors, HUD panels
- `false`: Original MeshPhongMaterial nodes, convex hull clusters, simple line edges

Both branches preserve all labels, badges, and interactive behaviors identically.

## WCAG Accessibility

| Pair | Contrast Ratio | Level |
|------|---------------|-------|
| `#E8EAF6` on `#000000` | 18.6:1 | AAA |
| `#00E5FF` on `#000000` | 12.7:1 | AA+ |
| `#7B8CDE` on `#000000` | 6.5:1 | AA |
| `#4a5580` on `#000000` | 3.2:1 | AA (large text) |

## Technology Constraints (Pinned)

| Package | Version | Constraint |
|---------|---------|-----------|
| Three.js | 0.152.2 | Fixed, ESM compatible |
| react-force-graph-3d | 1.21.3 | Fixed |
| framer-motion | ^12.0.0 | Layout animations |
| Next.js | 14 | App Router |
| TypeScript | strict | Full type safety |
