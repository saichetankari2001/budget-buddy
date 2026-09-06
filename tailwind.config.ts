import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#8b5cf6', hover: '#a78bfa' },
        accent: '#22d3ee',
        background: '#05050f',
        card: 'rgba(255,255,255,0.06)',
        foreground: '#e5e7ff',
        muted: '#94a3b8',
        border: 'rgba(139,92,246,0.35)',
        destructive: '#f87171',
        success: '#34d399',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'sans-serif'],
        sans: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      keyframes: {
        fadeSlideIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-slide-in': 'fadeSlideIn 300ms ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
