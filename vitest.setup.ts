import '@testing-library/jest-dom/vitest';

// Polyfill ResizeObserver for Recharts compatibility with jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
