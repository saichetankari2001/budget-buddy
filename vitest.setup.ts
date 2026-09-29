import '@testing-library/jest-dom/vitest';

// Polyfill ResizeObserver for Recharts compatibility with jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill matchMedia: jsdom doesn't implement it, but Framer Motion's useReducedMotion() (used
// throughout the liquid-glass redesign) calls window.matchMedia('(prefers-reduced-motion: reduce)')
// on every render, and the WebGLAccent wrapper calls it for its own viewport check. Defaults to
// "not reduced, not narrow" (matches: false); individual tests override this to exercise those paths.
// Guarded by `typeof window !== 'undefined'`: several existing test files opt into the `node`
// environment (`// @vitest-environment node`, e.g. route handler tests with no DOM needs), where
// `window` doesn't exist at all — this file runs before every test file regardless of environment.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
