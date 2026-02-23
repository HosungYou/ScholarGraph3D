import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core void
        background: '#000000',
        'void': '#000000',
        surface: '#060a14',
        'surface-hover': '#0c1220',
        border: '#141e38',
        // Text
        'text-primary': '#E8EAF6',
        'text-secondary': '#7B8CDE',
        'text-muted': '#4a5580',
        // System accent
        accent: '#00E5FF',
        'accent-green': '#2ECC71',
        'accent-orange': '#E67E22',
        'accent-red': '#E74C3C',
        'accent-purple': '#9B59B6',
        'accent-yellow': '#F39C12',
        'accent-gold': '#FFD700',
        'accent-amber': '#FFAB40',
        // Cosmic palette
        'cosmic-glow': '#00E5FF',
        'cosmic-nebula': '#6c5ce7',
        'cosmic-star': '#a29bfe',
        'accent-warm': '#fd79a8',
        // Field of Study - Full Spectrum
        'field-cs': '#4FC3F7',
        'field-medicine': '#66BB6A',
        'field-physics': '#AB47BC',
        'field-biology': '#FFA726',
        'field-social': '#EF5350',
        'field-engineering': '#26C6DA',
        'field-math': '#7E57C2',
        'field-chemistry': '#FF7043',
        'field-earth': '#8D6E63',
        'field-humanities': '#EC407A',
        // HUD
        'hud-border': 'rgba(0,229,255,0.12)',
        'hud-bg': 'rgba(4,8,18,0.88)',
        'hud-glow': 'rgba(0,229,255,0.06)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'warp': 'warp-speed 0.8s ease-in forwards',
        'cosmic-pulse': 'cosmic-pulse 3s ease-in-out infinite',
        'hud-flicker': 'hud-flicker 4s ease-in-out infinite',
        'radar-sweep': 'radar-sweep 2s linear infinite',
        'border-glow': 'border-glow 2s ease-in-out infinite',
        'drift': 'drift 20s ease-in-out infinite',
        'drift-slow': 'drift 30s ease-in-out infinite',
        'drift-fast': 'drift 15s ease-in-out infinite',
        'twinkle': 'twinkle 4s ease-in-out infinite',
        'twinkle-slow': 'twinkle 6s ease-in-out infinite',
        'scan-line': 'scan-line 8s linear infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        'data-stream': 'data-stream 1.5s linear infinite',
      },
      keyframes: {
        'twinkle': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        'data-stream': {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '0% 100%' },
        },
      },
    },
  },
  plugins: [],
}
export default config
