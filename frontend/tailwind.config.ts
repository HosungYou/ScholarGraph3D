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
        background: '#0a0e1a',
        surface: '#131825',
        'surface-hover': '#1a2035',
        border: '#2a3050',
        'text-primary': '#e8eaf0',
        'text-secondary': '#8890a5',
        accent: '#4A90D9',
        'accent-green': '#2ECC71',
        'accent-orange': '#E67E22',
        'accent-red': '#E74C3C',
        'accent-purple': '#9B59B6',
        'accent-yellow': '#F39C12',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
export default config
