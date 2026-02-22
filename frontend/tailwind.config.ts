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
        background: '#050510',
        surface: '#0a0f1e',
        'surface-hover': '#111833',
        border: '#1a2555',
        'text-primary': '#E8EAF6',
        'text-secondary': '#7B8CDE',
        accent: '#00E5FF',
        'accent-green': '#2ECC71',
        'accent-orange': '#E67E22',
        'accent-red': '#E74C3C',
        'accent-purple': '#9B59B6',
        'accent-yellow': '#F39C12',
        'cosmic-glow': '#00E5FF',
        'cosmic-nebula': '#6c5ce7',
        'cosmic-star': '#a29bfe',
        'accent-warm': '#fd79a8',
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
      },
    },
  },
  plugins: [],
}
export default config
