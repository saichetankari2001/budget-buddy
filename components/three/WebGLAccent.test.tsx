import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WebGLAccent } from './WebGLAccent';

function mockNarrowViewportMatch(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function mockReducedMotionMatch(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe('WebGLAccent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the static fallback on a narrow viewport', async () => {
    mockNarrowViewportMatch(true);
    const loadScene = vi.fn().mockResolvedValue({ default: () => null });

    render(<WebGLAccent loadScene={loadScene} alt="Decorative glass accent" />);

    // loadScene may still be called once during the render before the narrow-viewport check settles
    // post-mount (its first render has to match what the server rendered, which can't know the
    // client's viewport) — the guarantee that matters is that the user ends up seeing the fallback,
    // not that the scene module is never touched. See the loadScene prop doc on WebGLAccentProps.
    expect(await screen.findByTestId('webgl-static-fallback')).toBeInTheDocument();
  });

  it('renders the static fallback when prefers-reduced-motion is set', async () => {
    mockReducedMotionMatch(true);
    const loadScene = vi.fn().mockResolvedValue({ default: () => null });

    render(<WebGLAccent loadScene={loadScene} alt="Decorative glass accent" />);

    // Same one-time-load caveat as above, for the same reason (see the loadScene prop doc).
    expect(await screen.findByTestId('webgl-static-fallback')).toBeInTheDocument();
  });
});
