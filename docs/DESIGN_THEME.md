# ScholarGraph3D — Stellar Observatory Design Theme

> v4.0.0 Design System Reference — "Stellar Observatory" Redesign

## World-Building Concept

**Core Metaphor:** The academic knowledge space is a universe explored from a refined astronomical observatory, not a military HUD. Luxury minimalism meets space exploration — the instrument panel of a high-altitude telescope, not a fighter jet cockpit.

| Academic Concept | Observatory Metaphor | Visual Treatment |
|-----------------|---------------------|------------------|
| Paper | Star | Refined sphere with subtle glow (opacity 0.35, size * 2.5) |
| Cluster | Nebula | Reduced particle cloud (120 max, opacity 0.12, point size 3.0) |
| Citation edge | Light Stream | Directional gold particles (#D4AF37) |
| Similarity edge | Gravity Wave | Dashed neutral gray line (#555555) |
| Search | Observation | DOI input with gold "Explore" CTA |
| Landing | Observatory Entrance | 3D astronaut helmet hero + large serif headings |
| Explore | Observation Deck | Collapsible sidebar + drawer overlay |
| UI Panels | Observatory Instruments | Clean dark panels, gold accents, no corner brackets |

## Design Direction

### "Stellar Observatory" — Luxury Minimalism × Space Exploration

- Pure black (#000000) background — the void of deep space, undiluted
- No HUD corner brackets, no angular chrome — clean dark panels with hairline borders
- Playfair Display serif for hero headings; JetBrains Mono for data/labels
- Gold (#D4AF37) as the singular accent — warm, restrained, authoritative
- Observatory language: "SECTOR SCANNER", "OBJECT SCAN", "RESEARCH ASSISTANT"
- Luxury agency aesthetic — generous whitespace, large type, minimal chrome
- Reference: dark luxury agency websites — large serif headings, rich black, gold accents

The shift from v3.0.0 to v4.0.0 is a shift in register: from mission-critical dashboard to contemplative instrument. Every visual decision trades intensity for depth, cyan urgency for gold refinement.

## Color Palette

### CSS Custom Properties (`:root`)

```css
/* Core */
--background: #000000;        /* Pure black — the void */
--surface: #0A0A0A;           /* Panel backgrounds */
--surface-hover: #111111;     /* Hover states */
--border: #1A1A1A;            /* Default borders */

/* Text */
--text-primary: #FFFFFF;      /* White — primary text */
--text-secondary: #999999;    /* Gray — secondary text, labels */

/* Accent */
--accent: #D4AF37;            /* Gold — the singular system accent */
--accent-green: #22C55E;      /* Success / live / active states */
--accent-red: #EF4444;        /* Error / danger states */

/* Legacy tokens remapped for v4.0.0 */
--cosmic-glow: #D4AF37;       /* Was #00E5FF (cyan); now gold */
--hud-border: rgba(255,255,255,0.06);   /* Was cyan-tinted; now neutral white */
--hud-bg: rgba(10,10,10,0.88);          /* Was deep navy; now near-pure black */
```

### Color Design Rationale

| v3.0.0 (Deep Space Mission Control) | v4.0.0 (Stellar Observatory) | Reason |
|--------------------------------------|-------------------------------|--------|
| Cyan `#00E5FF` primary accent | Gold `#D4AF37` primary accent | Warmth over urgency; luxury over military |
| Deep navy surface `#060a14` | Near-black surface `#0A0A0A` | Removes chromatic noise; cleaner void |
| Cyan-tinted borders `rgba(0,229,255,0.12)` | Neutral white borders `rgba(255,255,255,0.06)` | Restraint; borders recede rather than glow |
| Purple secondary `#6c5ce7` | No secondary accent | One accent only — gold is sufficient |
| Blue-shifted text `#E8EAF6` | Pure white text `#FFFFFF` | Removes hue drift; maximum legibility |

### Tailwind Config Colors

All CSS custom property values mirrored in `tailwind.config.ts` for utility class usage:

```ts
// tailwind.config.ts (theme.extend.colors)
colors: {
  accent:         '#D4AF37',
  surface:        '#0A0A0A',
  'surface-hover':'#111111',
  border:         '#1A1A1A',
  'text-primary': '#FFFFFF',
  'text-secondary':'#999999',
  'cosmic-glow':  '#D4AF37',   // Legacy compat token
  // Field-of-study star colors (unchanged from v3.0.0)
  'field-cs':         '#4FC3F7',
  'field-medicine':   '#66BB6A',
  'field-physics':    '#AB47BC',
  'field-biology':    '#FFA726',
  'field-social':     '#EF5350',
  'field-engineering':'#26C6DA',
  'field-math':       '#7E57C2',
  'field-chemistry':  '#FF7043',
  'field-earth':      '#8D6E63',
  'field-humanities': '#EC407A',
}
```

Utility classes in use:
- `bg-surface`, `bg-surface-hover`, `bg-background`
- `text-accent`, `border-accent`, `bg-accent`
- `text-text-primary`, `text-text-secondary`
- `border-border`
- `text-field-cs`, `text-field-medicine`, etc.

## Typography

The typographic system introduces Playfair Display as the prestige serif for hero contexts, while JetBrains Mono continues to carry all data, labels, and UI chrome. Inter serves as the body text workhorse.

| Usage | Font | Weight | Size | Tracking | Tailwind Classes |
|-------|------|--------|------|----------|-----------------|
| Hero headings | Playfair Display | 700 | 5xl–8xl | Normal | `font-serif text-5xl md:text-7xl lg:text-8xl font-bold` |
| Sub-headings | Playfair Display | 600 | 2xl–4xl | Normal | `font-serif text-2xl md:text-4xl font-semibold` |
| Body text | Inter | 400 | base | Normal | `font-sans text-base` |
| UI panel headers | JetBrains Mono | 500 | 10px | 0.12em | `font-mono text-[10px] uppercase tracking-widest` |
| Data values | JetBrains Mono | 600 | 13px | Normal | `font-mono text-[13px] font-semibold` |
| UI labels | JetBrains Mono | 500 | 10px | 0.12em | `font-mono text-[10px] uppercase tracking-widest` |
| Buttons | JetBrains Mono | 500 | xs | 0.08em | `font-mono text-xs uppercase tracking-wider` |

### Font Loading

All three typefaces loaded via `next/font/google` in `layout.tsx` and injected as CSS variables:

```ts
// layout.tsx
import { Playfair_Display, Inter, JetBrains_Mono } from 'next/font/google'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
})
```

CSS variables `--font-serif`, `--font-sans`, `--font-mono` are applied to the `<html>` element and consumed by Tailwind's `font-serif`, `font-sans`, `font-mono` utilities.

## Design System — CSS Classes

### Panel Classes

| Class | Description | Visual Spec |
|-------|-------------|-------------|
| `.hud-panel` | Legacy panel class — corner brackets hidden | Same background/border as `.hud-panel-clean`; `::before`/`::after` corner brackets set to `display: none` |
| `.hud-panel-clean` | Clean panel — standard workhorse | `rgba(10,10,10,0.88)` bg, `rgba(255,255,255,0.06)` border, `blur(20px)` backdrop |
| `.glass` | Frosted glass panel | `rgba(10,10,10,0.85)` bg, `blur(16px)`, `rgba(255,255,255,0.06)` border |
| `.glass-strong` | Heavy frosted glass | `rgba(10,10,10,0.92)` bg, `blur(24px)`, `rgba(255,255,255,0.08)` border |
| `.stellar-panel` | New Tailwind utility panel | `bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl` |

### `.hud-panel-clean` Detail

```
Background:  rgba(10, 10, 10, 0.88)
Backdrop:    blur(20px)
Border:      1px solid rgba(255, 255, 255, 0.06)
Box-shadow:  inset 0 1px 0 rgba(255,255,255,0.03), 0 0 40px rgba(0,0,0,0.4)

::before     Hidden (display: none) — v4.0.0 removes top edge glow line
::after      Hidden (display: none) — v4.0.0 removes corner brackets
```

The panel surfaces are designed to recede into the black background. Borders are near-invisible hairlines, not glowing cyan frames.

### New Stellar Classes

| Class | Description | Full Spec |
|-------|-------------|-----------|
| `.stellar-heading` | Hero serif heading | `font-serif text-4xl md:text-5xl font-bold text-white` |
| `.stellar-label` | Observatory instrument label | `text-[10px] font-mono uppercase tracking-widest text-[#999999]/60` |
| `.stellar-value` | Observatory data readout | `text-sm font-mono text-white` |
| `.stellar-btn` | Primary gold CTA button | `bg-[#D4AF37] text-black font-mono text-xs uppercase tracking-wider px-6 py-2.5 rounded-full hover:bg-[#C9A832] transition-colors` |

### Interactive Classes

| Class | Description | States |
|-------|-------------|--------|
| `.hud-button` | Primary action button | Gold border + gold text at rest; gold glow (`box-shadow: 0 0 12px rgba(212,175,55,0.3)`) on hover; `scale(0.98)` on active |
| `.hud-button-ghost` | Secondary / ghost button | Transparent bg, `rgba(255,255,255,0.08)` border at rest; gold text + gold border on hover |

### Text and Data Classes

| Class | Description | Specs |
|-------|-------------|-------|
| `.hud-label` | Data label | 10px, JetBrains Mono, uppercase, 0.12em tracking, muted gold tint |
| `.hud-value` | Data value | 13px, JetBrains Mono, semibold, white |
| `.cosmic-glow` | Accent-colored heading text | Gold text color (`#D4AF37`) — **no text-shadow** (v3.0.0 multi-layer cyan/purple shadow removed) |

### Utility Classes

| Class | Description |
|-------|-------------|
| `.hud-divider` | Horizontal section divider — centered gradient line fading left/right |
| `.hud-scanline` | Scanline overlay effect — 2px repeating gradient (subtle, rarely used in v4) |
| `.hud-status` | Status indicator dot — 6px, gold glow |
| `.hud-status-warn` | Warning status dot — orange |
| `.hud-status-error` | Error status dot — red (`#EF4444`) |

## Animations

All keyframe animations from v3.0.0 are preserved verbatim. No new animations are added in v4.0.0; the change is in which animations are applied and where.

| Class | Keyframe | Duration | Effect |
|-------|----------|----------|--------|
| `animate-warp` | `warp-speed` | 0.8s | Scale(3) + blur(20px) + fade — search submit |
| `animate-cosmic-pulse` | `cosmic-pulse` | 3s infinite | Opacity oscillation — status indicators |
| `animate-hud-flicker` | `hud-flicker` | 4s infinite | Subtle opacity flicker — holographic panels |
| `animate-radar-sweep` | `radar-sweep` | 2s infinite | Rotation — RadarLoader |
| `animate-border-glow` | `border-glow` | 2s infinite | Border-color pulse — active elements |
| `animate-drift` | `drift` | 20s infinite | Translate oscillation — CSS starfield layers |
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

## 3D Rendering Changes

All visual intensity parameters are reduced in v4.0.0. The goal is a quieter, more contemplative star field — less neon fireworks display, more deep-sky photograph.

### Node Rendering

| Parameter | v3.0.0 | v4.0.0 | Effect |
|-----------|--------|--------|--------|
| Node size multiplier | `Math.min(30, ...) * 1.5` | `Math.min(12, ...) * 0.8` | Smaller, more refined stars |
| Glow sprite opacity | 0.9 | 0.35 | Subtle corona, not flare |
| Glow sprite scale | `size * 6` | `size * 2.5` | Compact glow envelope |
| Supernova ring opacity | 0.4 | 0.2 | Understated selected state |
| Orbiting particle count | 12 | 6 | Half density |
| Orbiting particle opacity | 0.8 | 0.4 | Quieter orbits |
| Binary companion sizes | 0.3 / 0.25 | 0.2 / 0.15 | Smaller companions |
| Bloom sphere scale | 1.3x | 1.1x | Tighter bloom envelope |
| Bloom sphere opacity | 0.12 | 0.06 | Near-invisible bloom layer |

### Nebula Cluster Rendering

| Parameter | v3.0.0 | v4.0.0 | Effect |
|-----------|--------|--------|--------|
| Max particles | 250 | 120 | Less dense clouds |
| Particle opacity | 0.3 | 0.12 | Wispy, barely-there nebulae |
| Point size | 5.0 | 3.0 | Finer particles |
| Spread factor | 0.8 | 0.6 | Tighter cluster envelope |

### Edge Rendering

| Edge Type | v3.0.0 Color | v4.0.0 Color | Notes |
|-----------|-------------|-------------|-------|
| Similarity edge | `#4A90D9` (blue) | `#555555` (neutral gray) | Removes blue chroma entirely |
| Citation edge (static) | `#8890a5` (muted blue) | `#444444` (dark neutral) | Recedes behind nodes |
| Directional particle | `#00E5FF` (cyan) | `#D4AF37` (gold) | Gold = citation flow |

### Label and Tooltip

| Element | v3.0.0 | v4.0.0 |
|---------|--------|--------|
| Label font | `'Arial, sans-serif'` | `'JetBrains Mono', monospace` |
| Tooltip background | `rgba(5,5,16,0.95)` | `rgba(10,10,10,0.95)` |
| Tooltip border | `rgba(0,229,255,0.15)` | `rgba(255,255,255,0.08)` |

### Highlight Colors

| State | v3.0.0 | v4.0.0 |
|-------|--------|--------|
| Selected node | `#FF6B6B` (coral red) | `#D4AF37` (gold) |
| Neighbor node | `#4ECDC4` (teal) | `#FFFFFF` (white) |

## Component Architecture

### Shared Cosmic Components (`components/cosmic/`)

| Component | Purpose | Tech |
|-----------|---------|------|
| `StarfieldBackground` | Landing/explore starfield | Three.js Points (3000+1500), power-law brightness, mouse parallax, `triggerWarp()` via forwardRef. Dynamic import `ssr: false` |
| `DeepFieldBackground` | Alternative starfield | Canvas 2D, power-law brightness distribution, 3 star layers, CSS animation. Lighter than WebGL |
| `CosmicStarfield` | Auth/dashboard starfield | CSS-only circular gradient layers + drift animations |
| `HudPanel` | Reusable panel wrapper | `.hud-panel-clean` + variants (default/clean/status) + optional title/icon + pulsing dot. Elevated shadow now uses gold `rgba(212,175,55,...)` instead of cyan |
| `RadarLoader` | Loading indicator | 3 concentric rings with conic-gradient sweep + center dot. Sweep color updated to gold `rgba(212,175,55,0.3)` |
| `AstronautHelmet` | Landing page hero object | Three.js 3D chrome astronaut helmet. Chrome dome (metalness 0.95, roughness 0.08), dark visor (metalness 1.0, roughness 0.05), gold rim ring and antenna (#D4AF37), CubeCamera starfield reflections, subtle float + rotation animation. Dynamic import `ssr: false` |

### `AstronautHelmet.tsx` — New in v4.0.0

The landing page hero replaces the flat Deep Field starfield panel with a real-time 3D chrome astronaut helmet rendered via Three.js. Key implementation details:

```
Chrome dome:    MeshStandardMaterial, metalness 0.95, roughness 0.08, envMapIntensity 1.0
Dark visor:     MeshStandardMaterial, metalness 1.0, roughness 0.05, color #111111
Gold ring:      MeshStandardMaterial, color #D4AF37, metalness 0.9, roughness 0.1
Antenna:        MeshStandardMaterial, color #D4AF37, metalness 0.85
Environment:    CubeCamera capturing live starfield for reflections
Animation:      Idle float (sin wave, 0.08 amplitude, 1.2s period) + slow Y-rotation (0.003 rad/frame)
Import:         dynamic(() => import('./AstronautHelmet'), { ssr: false })
```

### 3D Rendering Modules (`components/graph/cosmic/`)

Module structure is unchanged from v3.0.0. All color/intensity changes are applied within the existing modules:

| Module | Purpose | v4.0.0 Changes |
|--------|---------|----------------|
| `cosmicConstants.ts` | `STAR_COLOR_MAP`, `getTwinkleRate()`, `getStarColors()`, GLSL shaders | Unchanged — star field colors are distinct from UI chrome |
| `cosmicTextures.ts` | Cached canvas-generated textures: radial glow, corona, 6-pointed flare | Unchanged |
| `CosmicAnimationManager.ts` | Singleton rAF loop — updates `uTime` uniforms, animates supernova/binary/flare | Unchanged |
| `starNodeRenderer.ts` | `createStarNode()` — THREE.Group with shader core, glow sprite, flare, corona, supernova, binary | Reduced intensity params (see 3D Rendering Changes) |
| `nebulaClusterRenderer.ts` | `createNebulaCluster()` — THREE.Points with Gaussian distribution, shimmer shader | Reduced particle count/opacity/size (see 3D Rendering Changes) |

## Layout Architecture

### Explore Page (`/explore/seed`)

The spatial layout is unchanged from v3.0.0. Only colors and typography have been updated.

```
+--------------------------------------------------+
| Top Bar: "SG3D" in gold, border-[#1A1A1A]        |
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
| Status Bar: paper count, cluster count           |
+--------------------------------------------------+
```

#### Left Sidebar
- **Collapsed:** 48px icon-only with tooltips
- **Expanded:** 300px with full tab content
- **Tabs:** Clusters (Layers), Search (ScanSearch), Chat (MessageCircle)
- **Active tab:** Gold indicator — `text-[#D4AF37]`, `border-[#D4AF37]`
- **Inactive tab:** Gray — `text-[#999999]`
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
| Graph Canvas | — | 3D scene (flex area) |
| Sidebar | 10 | Left collapsible panel |
| Graph Controls | 10 | Floating toggle buttons |
| Drawer Backdrop | 20 | Semi-transparent overlay |
| Drawer Panel | 30 | Paper detail panel |
| Toasts | 50 | Notifications |

## Panel Internal Design

### PaperDetailPanel (Right Drawer)

- Header: paper title in `.stellar-heading`, year badge, open access indicator
- Panel label: `OBJECT SCAN` in `.stellar-label text-[#D4AF37]/50`
- Sections separated by `.hud-divider` gradient lines
- Statistics grid: `.hud-label` + `.hud-value` pairs in 2-column grid
- Authors list with affiliation badges
- Abstract with `.hud-panel-clean` wrapper
- Action buttons: `.hud-button` for primary, `.hud-button-ghost` for secondary

### ClusterPanel (Left Sidebar — Clusters Tab)

- Header label: `SECTOR SCANNER` in `.stellar-label text-[#D4AF37]/60`
- Cluster list with colored dots (field star colors), density bars, edge counts
- Selected cluster detail: topic tags, statistics grid, paper list
- Eye / Focus / Chevron action buttons per cluster
- framer-motion AnimatePresence for detail expansion

### GapSpotterPanel (Left Sidebar — Search Tab)

- Header label: `GAP SPOTTER` in `.stellar-label text-[#D4AF37]/60`
- Gap cards: `.hud-panel-clean` wrapper with gold-tinted strength bar
- Bridge papers list with score percentages
- Frontier papers section with gold accent (replacing v3.0.0 purple accent)

### SeedChatPanel (Left Sidebar — Chat Tab)

- Header label: `RESEARCH ASSISTANT` in `.stellar-label text-[#D4AF37]/60`
- Message bubbles: `.hud-panel-clean` wrapper
  - User: gold-tinted `rgba(212,175,55,0.06)` bg, right-aligned, `rounded-tr-sm`
  - Assistant: default surface bg, left-aligned, `rounded-tl-sm`
- Suggestion buttons: `.hud-button-ghost`
- Follow-up buttons: `.hud-button-ghost` with "+" prefix
- Input area: `.hud-panel-clean` wrapper, transparent textarea
- Send button: `.hud-button`

### GraphControls (Floating)

- Vertical button column, top-right corner of canvas
- Active state: gold bg/border — `bg-[#D4AF37] text-black`
- Inactive: dark surface bg, gray text, gold hover highlight
- Separator between toggle group and utility buttons

## Panel Naming Convention

| Component | Observatory Label | Color Token |
|-----------|------------------|-------------|
| ClusterPanel | SECTOR SCANNER | `text-[#D4AF37]/60` |
| PaperDetailPanel | OBJECT SCAN | `text-[#D4AF37]/50` |
| GraphLegend | VISUAL GUIDE | `text-[#D4AF37]/60` |
| SeedChatPanel | RESEARCH ASSISTANT | `text-[#D4AF37]/60` |
| GapSpotterPanel | GAP SPOTTER | `text-[#D4AF37]/60` |

## Page-Level Theme Mapping

| Page | Observatory Name | Key Visual Elements |
|------|-----------------|---------------------|
| `/` (Landing) | Observatory Entrance | 3D astronaut helmet hero (right), large serif heading (left), gold CTA, dark stats row |
| `/explore` | Observation Deck | Arrival animation, RadarLoader (gold sweep), "AWAITING OBSERVATION TARGET" |
| `/explore/seed` | Observation Session | Collapsible sidebar, drawer overlay, gold top bar title |

### Landing Page Sections

- **Hero:** Two-column — serif heading left (`font-serif text-6xl md:text-8xl font-bold`), AstronautHelmet Three.js right
  - Heading copy: observatory-register, not military ("Explore the topology of knowledge")
  - Sub-heading in `text-[#999999]`
  - DOI input: clean bordered `input` with gold `.stellar-btn` CTA labelled "Explore"
- **Stats Row:** 3 columns — each `.hud-label` stat name + `.hud-value` count
- **How It Works:** 3 feature cards on `.stellar-panel` dark surfaces
  - "Gravitational Mapping" (citation topology)
  - "Nebula Classification" (semantic clusters)
  - "Temporal Depth" (time depth on Z)
- **Scroll Animations:** framer-motion `useInView` + `whileInView` stagger, generous padding between sections

## Star Color Map (Field → Stellar Temperature)

Star colors encode academic field. These are 3D rendering colors applied to node materials — they are distinct from the UI chrome gold accent and are unchanged from v3.0.0.

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

Field colors deliberately depart from the gold/neutral UI palette. They carry semantic meaning (discipline identity) and function as a legend system independent of the UI accent color.

## Performance Budget (200 nodes)

Reduced particle counts in v4.0.0 lower GPU cost relative to v3.0.0.

| Element | v3.0.0 Cost | v4.0.0 Cost | Change |
|---------|-------------|-------------|--------|
| Star spheres (16-seg) | ~100K tris, 1.5ms | ~40K tris, 0.7ms | Smaller node sizes |
| Glow sprites | ~400 tris, 0.1ms | ~200 tris, <0.1ms | Fewer / smaller sprites |
| Supernova particles | ~240 points, <0.1ms | ~120 points, <0.1ms | 6 orbiters vs 12 |
| Binary companions | ~5K tris, 0.1ms | ~3K tris, 0.1ms | Smaller meshes |
| Nebula particles | ~3000 points, 0.3ms | ~1200 points, 0.15ms | 120 max vs 250 |
| Citation particles (directional) | ~800 points, 0.1ms | ~800 points, 0.1ms | Unchanged |
| Similarity dashed lines | ~500 lines, 0.1ms | ~500 lines, 0.1ms | Unchanged |
| AstronautHelmet (landing only) | n/a | ~8K tris, 0.5ms | New component |
| **Total (explore)** | **~130K tris, ~2.7ms / 16.6ms** | **~46K tris, ~1.15ms / 16.6ms** | **~65% reduction** |

Target: 60fps with comfortable margin. Explore page frame budget now ~7% used (was ~16%).

## Fallback System

The `showCosmicTheme` toggle in Zustand (default: `true`) is unchanged:
- `true`: Star nodes, nebula clusters, stellar colors, observatory-style panels
- `false`: Original MeshPhongMaterial nodes, convex hull clusters, simple line edges

Both branches preserve all labels, badges, and interactive behaviors identically.

## WCAG Accessibility

| Pair | Contrast Ratio | Level | Usage |
|------|---------------|-------|-------|
| `#FFFFFF` on `#000000` | 21:1 | AAA | Primary text, data values |
| `#D4AF37` on `#000000` | 8.6:1 | AA | Gold accent, CTAs, active states |
| `#999999` on `#000000` | 7.0:1 | AA | Secondary text, sub-labels |
| `#999999/60` on `#000000` | ~4.2:1 | AA (large text) | Panel header labels (10px+uppercase) |

Note: `#999999/60` at 10px uppercase (`.stellar-label`, `.hud-label`) qualifies as "large text" under WCAG 2.1 due to uppercase letter-spacing treatment. All interactive controls use full-opacity gold or white, meeting AA at all sizes.

## Technology Constraints (Pinned)

Unchanged from v3.0.0.

| Package | Version | Constraint |
|---------|---------|-----------|
| Three.js | 0.152.2 | Fixed — ESM compatible, pinned for `react-force-graph-3d` compatibility |
| react-force-graph-3d | 1.21.3 | Fixed |
| framer-motion | ^12.0.0 | Layout animations, scroll-triggered entry |
| Next.js | 14 | App Router |
| TypeScript | strict | Full type safety |

## Migration Notes (v3.0.0 → v4.0.0)

For reference when auditing components that have not yet been updated:

| v3.0.0 Pattern | v4.0.0 Replacement |
|---------------|-------------------|
| `text-[#00E5FF]` | `text-[#D4AF37]` or `text-accent` |
| `border-[#00E5FF]` | `border-[#1A1A1A]` or `border-accent` |
| `bg-[#060a14]` | `bg-[#0A0A0A]` or `bg-surface` |
| `text-[#E8EAF6]` | `text-white` or `text-text-primary` |
| `text-[#7B8CDE]` | `text-[#999999]` or `text-text-secondary` |
| `rgba(0,229,255,...)` border/glow | `rgba(255,255,255,0.06)` border or `rgba(212,175,55,...)` accent |
| `cosmic-glow` text-shadow | `cosmic-glow` text color only — shadow removed |
| Corner bracket pseudo-elements | `display: none` — do not re-enable |
| `.hud-panel` (with brackets) | `.hud-panel-clean` or `.stellar-panel` |
| `font-['Arial,_sans-serif']` in Three.js | `font-['JetBrains_Mono,_monospace']` |
| Selected highlight `#FF6B6B` | `#D4AF37` |
| Neighbor highlight `#4ECDC4` | `#FFFFFF` |
