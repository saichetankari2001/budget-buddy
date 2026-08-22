import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#6366F1', hover: '#4F46E5' },
        accent: '#059669',
        background: '#F5F3FF',
        card: '#FFFFFF',
        foreground: '#1E1B4B',
        muted: '#64748B',
        border: '#E0E7FF',
        destructive: '#DC2626',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'sans-serif'],
        sans: ['var(--font-body)', 'sans-serif'],
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
