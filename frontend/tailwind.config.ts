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
        background: '#000000',
        void: '#000000',
        surface: '#0A0A0A',
        'surface-hover': '#111111',
        'surface-elevated': '#161616',
        border: '#1A1A1A',
        'border-hover': '#2A2A2A',
        'border-active': '#3A3A3A',
        // Text
        'text-primary': '#FFFFFF',
        'text-secondary': '#999999',
        'text-muted': '#555555',
        'text-dim': '#333333',
        // Accent
        accent: '#D4AF37',
        'accent-hover': '#E5C04B',
        'accent-muted': '#B8963A',
        // Legacy support (some components may still reference these)
        'cosmic-glow': '#D4AF37',
        'cosmic-nebula': '#8B7355',
        'cosmic-star': '#C4A777',
        'accent-warm': '#D4AF37',
        'accent-gold': '#D4AF37',
        // Field of Study - more muted versions
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
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
