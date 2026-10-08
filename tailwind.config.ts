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
        // 2026-10-09: #2563EB (Tailwind blue-600) measured 3.54:1 as 14px/500 text against
        // this app's effective dark header background (~rgb(20,20,29)) -- fails WCAG AA's
        // 4.5:1 text threshold. #60a5fa (Tailwind blue-400) measures 7.20:1 against the same
        // background, clearing both the 4.5:1 text bar and the lighter 3:1 bar for the
        // chart-line (graphical object) usage in MonthlyTrendChart/CashFlowTrajectoryChart.
        trust: '#60a5fa',
        // Liquid-glass redesign (2026-09-29): additional glass elevations + a neutral glass edge,
        // layered alongside the tokens above (which keep their current values/meaning unchanged).
        // These are raw rgba() strings, exactly like `card`/`border` above — Tailwind's `/<opacity>`
        // modifier cannot decompose a raw rgba() string (see the documented bg-card/50 bug in
        // CashFlowClient.tsx/ProjectionList.tsx), so use these bare, never with a `/<number>` suffix.
        'glass-1': 'rgba(255,255,255,0.06)',
        'glass-2': 'rgba(255,255,255,0.1)',
        'glass-3': 'rgba(255,255,255,0.15)',
        'border-glass': 'rgba(255,255,255,0.18)',
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
      backdropBlur: {
        glass: '24px',
        hero: '40px',
      },
      backdropSaturate: {
        180: '1.8',
      },
      boxShadow: {
        depth: '0 8px 32px rgba(0,0,0,0.28)',
      },
    },
  },
  plugins: [],
};

export default config;
