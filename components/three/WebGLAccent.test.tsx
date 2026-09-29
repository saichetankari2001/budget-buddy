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

  it('renders the static fallback on a narrow viewport, never loading the scene', async () => {
    mockNarrowViewportMatch(true);
    const loadScene = vi.fn();

    render(<WebGLAccent loadScene={loadScene} alt="Decorative glass accent" />);

    expect(await screen.findByTestId('webgl-static-fallback')).toBeInTheDocument();
    expect(loadScene).not.toHaveBeenCalled();
  });

  it('renders the static fallback when prefers-reduced-motion is set, never loading the scene', async () => {
    mockReducedMotionMatch(true);
    const loadScene = vi.fn();

    render(<WebGLAccent loadScene={loadScene} alt="Decorative glass accent" />);

    expect(await screen.findByTestId('webgl-static-fallback')).toBeInTheDocument();
    expect(loadScene).not.toHaveBeenCalled();
  });
});
